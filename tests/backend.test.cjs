'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const data=new Map(),authUsers=new Map(),reads=new Map();let auditId=0;
 const ref=path=>({path,id:path.split('/').at(-1),async get(){reads.set(path,(reads.get(path)||0)+1);return snap(this);},async set(v,opts){data.set(path,opts?.merge?{...data.get(path),...v}:v);},async delete(){data.delete(path);}});
 const snap=r=>({exists:data.has(r.path),data:()=>data.get(r.path),ref:r});
 const db={doc:ref,collection:path=>{const q={doc:()=>ref(path+'/'+ ++auditId),where(){return q;},orderBy(){return q;},limit(){return q;},async get(){return {docs:[...data.keys()].filter(k=>k.startsWith(path+'/') && k.split('/').length===2).map(k=>({id:k.split('/').at(-1),data:()=>data.get(k)}))};}};return q;},async runTransaction(work){const writes=[];await work({get:r=>Promise.resolve(snap(r)),set:(r,v,o)=>writes.push(()=>data.set(r.path,o?.merge?{...data.get(r.path),...v}:v)),update:(r,v)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v}))});writes.forEach(w=>w());},async recursiveDelete(r){for(const key of data.keys())if(key===r.path||key.startsWith(r.path+'/'))data.delete(key);}};
 const auth={getUser:async uid=>{if(!authUsers.has(uid))throw new Error('No Auth user');return authUsers.get(uid);},revokeRefreshTokens:async()=>{},deleteUser:async uid=>authUsers.delete(uid)};
 const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>123};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const output={};vm.runInNewContext(fs.readFileSync(require.resolve('../functions/index'),'utf8'),{exports:output,require:name=>name==='firebase-admin'?{initializeApp(){},firestore,auth:()=>auth}:name==='firebase-functions/v2/https'?{onCall:(o,f)=>f,HttpsError}:require('../functions/'+name.replace('./','')),Date,Promise});
 const request=(uid,token={},input={})=>({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000,...token}},data:input});
 return {data,authUsers,output,request,reads};
}
test('initialize preserves suspended state and existing reading data',async()=>{
 const s=setup();s.authUsers.set('u',{emailVerified:true,email:'u@example.test'});s.data.set('users/u',{accountStatus:'suspended',accountTier:'premium'});s.data.set('users/u/readerData/book',{location:'existing'});
 await assert.rejects(s.output.initializePromoHubAccount(s.request('u')),e=>e.code==='permission-denied');assert.equal(s.data.get('users/u/readerData/book').location,'existing');
});
test('new verified account gets Free tier; injected admin and Premium fields are ignored',async()=>{
 const s=setup();s.authUsers.set('u',{emailVerified:true,email:'u@example.test'});
 await s.output.initializePromoHubAccount(s.request('u',{}, {accountTier:'premium',role:'admin'}));assert.equal(s.data.get('users/u').accountTier,'free');assert.equal(s.data.get('users/u').role,undefined);
});
test('unverified accounts cannot initialize',async()=>{
 const s=setup();await assert.rejects(s.output.initializePromoHubAccount(s.request('u',{email_verified:false})),e=>e.code==='permission-denied');assert.equal(s.data.size,0);
});
test('ordinary users cannot approve their own request',async()=>{
 const s=setup();s.data.set('users/u',{accountStatus:'active'});s.authUsers.set('u',{customClaims:{}});
 await assert.rejects(s.output.reviewPremiumRequest(s.request('u',{}, {uid:'u',decision:'approved'})),e=>e.code==='permission-denied');
});
test('legacy request retry is idempotent; rejection retains Free tier and records an audit event',async()=>{
 const s=setup();s.data.set('users/u',{accountStatus:'active',accountTier:'free'});s.data.set('users/a',{accountStatus:'active'});s.authUsers.set('a',{customClaims:{promohubAdmin:true}});
 await s.output.requestPremiumAccess(s.request('u'));const n=s.data.size;await s.output.requestPremiumAccess(s.request('u'));assert.equal(s.data.size,n);
 await s.output.reviewPremiumRequest(s.request('a',{promohubAdmin:true},{uid:'u',decision:'rejected'}));assert.equal(s.data.get('users/u').accountTier,'free');assert.equal(s.data.get('premiumRequests/u').status,'rejected');
 await assert.rejects(s.output.reviewPremiumRequest(s.request('a',{promohubAdmin:true},{uid:'u',decision:'rejected'})),e=>e.code==='failed-precondition');
});
test('deleted accounts have a durable marker blocking profile recreation',async()=>{
 const s=setup();s.data.set('users/u',{accountStatus:'active'});s.authUsers.set('u',{emailVerified:true});
 await s.output.deletePromoHubAccount(s.request('u',{}, {confirmation:'DELETE'}));assert.equal(s.data.has('users/u'),false);assert.equal(s.data.has('accountDeletions/u'),true);
 s.authUsers.set('u',{emailVerified:true});await assert.rejects(s.output.initializePromoHubAccount(s.request('u')),e=>e.code==='permission-denied');
});
test('account deletion requires recent authentication',async()=>{
 const s=setup();await assert.rejects(s.output.deletePromoHubAccount(s.request('u',{auth_time:Date.now()/1000-600},{confirmation:'DELETE'})),e=>e.code==='failed-precondition');
});
test('legacy Premium field is not trusted until server schema migration',async()=>{
 const s=setup();s.authUsers.set('u',{emailVerified:true,email:'u@example.test'});s.data.set('users/u',{accountStatus:'active',accountTier:'premium'});
 await s.output.initializePromoHubAccount(s.request('u'));assert.equal(s.data.get('users/u').accountTier,'free');assert.equal(s.data.get('users/u').securitySchemaVersion,2);
});
test('server-managed Premium tier survives subsequent sign-ins',async()=>{
 const s=setup();s.authUsers.set('u',{emailVerified:true,email:'u@example.test'});s.data.set('users/u',{accountStatus:'active',accountTier:'premium',securitySchemaVersion:2});
 await s.output.initializePromoHubAccount(s.request('u'));assert.equal(s.data.get('users/u').accountTier,'premium');
});
test('rejection leaves Free tier intact and suspension blocks Premium requests',async()=>{
 const s=setup();s.data.set('users/u',{accountStatus:'active',accountTier:'free'});s.data.set('users/a',{accountStatus:'active'});s.authUsers.set('a',{customClaims:{promohubAdmin:true}});s.authUsers.set('u',{customClaims:{}});
 await s.output.requestPremiumAccess(s.request('u'));await s.output.reviewPremiumRequest(s.request('a',{promohubAdmin:true},{uid:'u',decision:'rejected'}));assert.equal(s.data.get('users/u').accountTier,'free');
 await s.output.managePromoHubUser(s.request('a',{promohubAdmin:true},{uid:'u',action:'suspend'}));await assert.rejects(s.output.requestPremiumAccess(s.request('u')),e=>e.code==='permission-denied');
});
test('stale admin claim cannot override removal in Firebase Auth',async()=>{
 const s=setup();s.data.set('users/a',{accountStatus:'active'});s.authUsers.set('a',{customClaims:{}});
 await assert.rejects(s.output.reviewPremiumRequest(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved'})),e=>e.code==='permission-denied');
});

function adminSetup(){const s=setup();s.data.set('users/a',{accountStatus:'active',displayName:'Owner',email:'owner@example.test'});s.authUsers.set('a',{customClaims:{promohubAdmin:true}});return s;}
test('Premium requests include only readable account identity fields',async()=>{
 const s=adminSetup();s.data.set('users/u',{displayName:'Reader',email:'reader@example.test',secret:'private'});s.data.set('premiumRequests/u',{uid:'u',status:'pending'});
 const result=await s.output.getPromoHubAdminRecords(s.request('a',{promohubAdmin:true},{kind:'requests'}));
 assert.equal(result.records[0].account.displayName,'Reader');assert.equal(result.records[0].account.email,'reader@example.test');assert.equal(result.records[0].account.available,true);assert.equal(result.records[0].account.secret,undefined);
});
test('audit identities resolve targets and actors and reuse repeated profile lookups',async()=>{
 const s=adminSetup();s.data.set('users/u',{displayName:'Reader',email:'reader@example.test'});for(const id of ['one','two'])s.data.set('auditLogs/'+id,{actor:'a',targetUid:'u',action:'premium.approved'});
 const result=await s.output.getPromoHubAdminRecords(s.request('a',{promohubAdmin:true},{kind:'audit'}));assert.equal(result.records[0].actorAccount.displayName,'Owner');assert.equal(result.records[0].account.email,'reader@example.test');assert.equal(s.reads.get('users/u'),1);
});
test('missing profiles have an explicit unavailable identity',async()=>{
 const s=adminSetup();s.data.set('premiumRequests/deleted',{uid:'deleted',status:'pending'});const result=await s.output.getPromoHubAdminRecords(s.request('a',{promohubAdmin:true},{kind:'requests'}));assert.equal(result.records[0].account.available,false);assert.equal(result.records[0].account.displayName,'');assert.equal(result.records[0].account.email,'');
});
test('admin records reject ordinary users, revoked claims and unknown views',async()=>{
 const s=adminSetup();await assert.rejects(s.output.getPromoHubAdminRecords(s.request('a',{},{})),e=>e.code==='permission-denied');
 await assert.rejects(s.output.getPromoHubAdminRecords(s.request('a',{promohubAdmin:true},{kind:'unknown'})),e=>e.code==='invalid-argument');s.authUsers.set('a',{customClaims:{}});await assert.rejects(s.output.getPromoHubAdminRecords(s.request('a',{promohubAdmin:true},{})),e=>e.code==='permission-denied');
});

function subscriberSetup(){const s=adminSetup();s.authUsers.set('u',{customClaims:{}});s.data.set('users/u',{accountStatus:'active',accountTier:'free',subscriptionSchema:1,trialEndsAtMs:Date.now()+604800000});return s;}
test('seven-day trial is created once and cannot be extended by sign-in or browser fields',async()=>{
 const s=setup();s.authUsers.set('u',{emailVerified:true,email:'u@example.test'});await s.output.initializePromoHubAccount(s.request('u',{}, {trialEndsAtMs:9999999999999,subscriptionEndsAtMs:9999999999999}));
 const p=s.data.get('users/u');assert.equal(p.subscriptionSchema,1);assert.equal(p.trialEndsAtMs-p.trialStartedAtMs,604800000);assert.equal(p.subscriptionEndsAtMs,0);
 await s.output.initializePromoHubAccount(s.request('u'));assert.equal(s.data.get('users/u').trialEndsAtMs,p.trialEndsAtMs);
});
test('manual payment requires a known plan and a valid reference and retries are idempotent',async()=>{
 const s=subscriberSetup();await assert.rejects(s.output.submitPromoHubPayment(s.request('u',{}, {planId:'fake',reference:'123456'})),e=>e.code==='invalid-argument');
 await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m3',reference:'abc12345'}));const n=s.data.size;await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m3',reference:'ABC12345'}));assert.equal(s.data.size,n);assert.equal(s.data.get('subscriptionRequests/u').amountGhs,50);
 await assert.rejects(s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m6',reference:'DEF12345'})),e=>e.code==='failed-precondition');
});
test('approval requires verified payment and exact amount and grants the selected duration once',async()=>{
 const s=subscriberSetup();await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m1',reference:'ABC12345'}));
 for(const input of [{amountGhs:20},{amountGhs:1,verifiedPayment:true}])await assert.rejects(s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',...input})),e=>e.code==='failed-precondition');
 await s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',amountGhs:20,verifiedPayment:true}));const p=s.data.get('users/u');assert.equal(p.accountTier,'premium');assert.ok(p.subscriptionEndsAtMs>Date.now()+27*86400000);
 await assert.rejects(s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',amountGhs:20,verifiedPayment:true})),e=>e.code==='failed-precondition');
 await assert.rejects(s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m1',reference:'ABC12345'})),e=>e.code==='already-exists');
});
test('active renewal extends expiry while rejection never grants access',async()=>{
 const s=subscriberSetup();const old=Date.UTC(2030,0,31);s.data.set('users/u',{accountStatus:'active',accountTier:'premium',subscriptionSchema:1,subscriptionEndsAtMs:old});
 await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m1',reference:'RENEW123'}));await s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',amountGhs:20,verifiedPayment:true}));assert.equal(s.data.get('users/u').subscriptionEndsAtMs,Date.UTC(2030,1,28));
 await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m6',reference:'REJECT123'}));const expiry=s.data.get('users/u').subscriptionEndsAtMs;await s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'rejected'}));assert.equal(s.data.get('users/u').subscriptionEndsAtMs,expiry);
});
test('ordinary and stale-admin accounts cannot approve; legacy approval cannot bypass paid verification',async()=>{
 const s=subscriberSetup();await s.output.submitPromoHubPayment(s.request('u',{}, {planId:'m1',reference:'ABC12345'}));
 await assert.rejects(s.output.reviewPromoHubPayment(s.request('u',{}, {uid:'u',decision:'approved',verifiedPayment:true,amountGhs:20})),e=>e.code==='permission-denied');
 s.authUsers.set('a',{customClaims:{}});await assert.rejects(s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',verifiedPayment:true,amountGhs:20})),e=>e.code==='permission-denied');
 s.authUsers.set('a',{customClaims:{promohubAdmin:true}});s.data.set('premiumRequests/u',{status:'pending'});await assert.rejects(s.output.reviewPremiumRequest(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved'})),e=>e.code==='failed-precondition');
});
test('payment references cannot be credited to a second account',async()=>{
 const s=subscriberSetup();s.data.set('users/v',{accountStatus:'active',accountTier:'free',subscriptionSchema:1});
 for(const uid of ['u','v'])await s.output.submitPromoHubPayment(s.request(uid,{}, {planId:'m1',reference:'SHARED123'}));
 await s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'u',decision:'approved',verifiedPayment:true,amountGhs:20}));
 await assert.rejects(s.output.reviewPromoHubPayment(s.request('a',{promohubAdmin:true},{uid:'v',decision:'approved',verifiedPayment:true,amountGhs:20})),e=>e.code==='already-exists');assert.equal(s.data.get('users/v').accountTier,'free');
});
