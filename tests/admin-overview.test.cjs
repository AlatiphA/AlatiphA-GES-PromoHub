'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),factory=require('../functions/admin-overview.cjs');
const NOW=Date.UTC(2026,9,12,8),DAY=86400000;
function setup(){
 const records=new Map(),authUsers=new Map(),lookups=[];let revoked=false,checks=0;
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path)});
 const snap=path=>{const p=records.get(path);return {id:path.split('/').at(-1),ref:ref(path),exists:records.has(path),data:()=>p?structuredClone(p):undefined};};
 const db={doc:ref,collection:name=>{let cursor=null,limit=100;const q={orderBy:()=>q,limit:n=>{limit=n;return q;},startAfter:id=>{cursor=id;return q;},get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(name+'/')&&k.split('/').length===2).sort().map(snap).filter(d=>!cursor||d.id>cursor).slice(0,limit)})};return q;}};
 class HttpsError extends Error{constructor(code,msg){super(msg);this.code=code;}}
 const member=async(req,admin)=>{checks++;if(revoked||req.auth?.token?.promohubAdmin!==true||!admin)throw new HttpsError('permission-denied','Admin required');};
 const admin={auth:()=>({getUsers:async ids=>{lookups.push(ids.length);return {users:ids.map(({uid})=>authUsers.has(uid)?{uid,...authUsers.get(uid)}:null).filter(Boolean)};}})};
 const api=factory({onCall:(o,fn)=>fn,options:{region:'us-central1'},HttpsError,db,admin,member,clock:()=>NOW});
 const req=data=>({auth:{uid:'owner',token:{promohubAdmin:true}},data:data||{}});
 function user(uid,days=10,p={},a={}){records.set('users/'+uid,{displayName:uid,email:uid+'@example.test',subscriptionSchema:1,accountTier:'premium',accountStatus:'active',subscriptionEndsAtMs:NOW+days*DAY,subscriptionPlan:'m1',...p});authUsers.set(uid,{emailVerified:true,disabled:false,...a});}
 function payment(id,amount,at=NOW-1000,p={}){const reference=('TX-'+id+'-0000').toUpperCase(),key=require('node:crypto').createHash('sha256').update(reference).digest('hex');records.set('subscriptionPayments/'+key,{uid:'u',planId:'m1',reference,amountGhs:amount,approvedBy:'owner',approvedAtMs:at,...p});}
 return {api,records,authUsers,lookups,req,user,payment,revoke:()=>revoked=true,checks:()=>checks,NOW};
}
test('overview counts real active paid accounts and separates requests from verified ledger revenue',async()=>{
 const s=setup();s.user('u',3);s.user('later',30);s.user('expired',-1);s.user('trial',3,{accountTier:'free'});s.user('suspended',3,{accountStatus:'suspended'});s.user('admin',3,{}, {customClaims:{promohubAdmin:true}});s.user('disabled',3,{}, {disabled:true});s.user('unverified',3,{}, {emailVerified:false});
 s.records.set('subscriptionRequests/u',{uid:'u',status:'pending',amountGhs:1000,requestedAtMs:NOW-10000});s.records.set('subscriptionRequests/rejected',{status:'rejected',amountGhs:1000});
 s.payment('current',20);s.payment('lastmonth',50,Date.UTC(2026,8,12));s.payment('missingapproval',80,NOW-1000,{approvedBy:''});s.payment('negative',-20);
 const report=await s.api.getPromoHubAdminOverview(s.req());assert.equal(report.summary.activeSubscriptions,2);assert.equal(report.summary.expiringSubscriptions,1);assert.equal(report.summary.pendingPayments,1);assert.equal(report.summary.verifiedTotalGhs,70);assert.equal(report.summary.verifiedMonthTotalGhs,20);assert.equal(report.summary.invalidLedgerRecords,2);assert.equal(report.expiring[0].name,'u');assert.equal(s.checks(),2);
});
test('verified totals count retained renewals exactly once per ledger document, including deleted-account receipts',async()=>{
 const s=setup();s.payment('a',0.1);s.payment('b',0.2,NOW-1000,{uid:'deleted'});const r=await s.api.getPromoHubAdminOverview(s.req());assert.equal(r.summary.verifiedTotalGhs,0.3);assert.equal(r.summary.verifiedPayments,2);assert.equal(r.verified.find(x=>x.transactionId==='TX-B-0000').name,'Account unavailable');
});
test('summary scans beyond 100 profiles and limits previews to soonest, oldest and latest 20 records',async()=>{
 const s=setup();for(let i=0;i<205;i++){const id=String(i).padStart(3,'0');s.user('u'+id,i%2?3:10);s.payment('r'+id,20,NOW-1000-i);s.records.set('subscriptionRequests/u'+id,{uid:'u'+id,status:'pending',requestedAtMs:NOW-i*DAY,amountGhs:20});}
 const r=await s.api.getPromoHubAdminOverview(s.req());assert.equal(r.summary.activeSubscriptions,205);assert.equal(r.summary.verifiedPayments,205);assert.equal(r.expiring.length,20);assert.equal(r.pending.length,20);assert.equal(r.verified.length,20);assert.equal(r.pending[0].requestedAtMs,NOW-204*DAY);assert.equal(r.verified[0].approvedAtMs,NOW-1000);assert.ok(s.lookups.every(n=>n<=100));
});
test('export pages can pass empty filtered pages and return all matching records without exposing raw UIDs',async()=>{
 const s=setup();for(let i=0;i<130;i++)s.user('u'+String(i).padStart(3,'0'),i<100?30:3);const a=await s.api.getPromoHubAdminExport(s.req({kind:'expiring'}));assert.equal(a.rows.length,0);assert.ok(a.cursor);const b=await s.api.getPromoHubAdminExport(s.req({kind:'expiring',cursor:a.cursor,asOfMs:a.asOfMs}));assert.equal(b.rows.length,30);assert.equal(b.cursor,null);assert.equal(Object.hasOwn(b.rows[0],'uid'),false);
});
test('verified exports use server month boundaries and exclude requests, invalid amounts and future approvals',async()=>{
 const s=setup();s.payment('current',20);s.payment('old',50,Date.UTC(2026,8,30));s.payment('future',80,NOW+10000);s.payment('invalid',NaN);const r=await s.api.getPromoHubAdminExport(s.req({kind:'verified',period:'month'}));assert.equal(r.rows.length,1);assert.equal(r.rows[0].amountGhs,20);assert.ok(r.rows[0].transactionId);assert.equal(Object.hasOwn(r.rows[0],'approvedBy'),false);
});
test('overview/export deny unauthorized or revoked admins and validate cursors and stale cutoff dates',async()=>{
 const s=setup();await assert.rejects(s.api.getPromoHubAdminOverview({}),e=>e.code==='permission-denied');await assert.rejects(s.api.getPromoHubAdminExport(s.req({kind:'secrets'})),e=>e.code==='invalid-argument');await assert.rejects(s.api.getPromoHubAdminExport(s.req({kind:'pending',cursor:'../private'})),e=>e.code==='invalid-argument');await assert.rejects(s.api.getPromoHubAdminExport(s.req({kind:'pending',asOfMs:NOW-7200000})),e=>e.code==='invalid-argument');s.revoke();await assert.rejects(s.api.getPromoHubAdminExport(s.req({kind:'verified'})),e=>e.code==='permission-denied');
});
test('real production member validation rejects stale admin claims for both new exports',async()=>{
 const s=require('./helpers/notification-backend.cjs')();s.authUsers.set('owner',{emailVerified:true,customClaims:{}});s.data.set('users/owner',{accountStatus:'active'});for(const fn of ['getPromoHubAdminOverview','getPromoHubAdminExport'])await assert.rejects(s.output[fn](s.request('owner',{promohubAdmin:true},{kind:'verified'})),e=>e.code==='permission-denied');
});

test('copied receipts under a different ledger ID cannot duplicate verified totals',async()=>{
 const s=setup();s.payment('once',20);const original=[...s.records].find(([k])=>k.startsWith('subscriptionPayments/'))[1];s.records.set('subscriptionPayments/copied-receipt',structuredClone(original));const r=await s.api.getPromoHubAdminOverview(s.req());assert.equal(r.summary.verifiedPayments,1);assert.equal(r.summary.verifiedTotalGhs,20);assert.equal(r.summary.invalidLedgerRecords,1);
});
