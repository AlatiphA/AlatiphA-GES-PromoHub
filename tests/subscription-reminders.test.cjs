'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../functions/subscription-reminders.cjs'),DAY=86400000,START=Date.UTC(2026,9,12,8);
function setup(){
 const records=new Map(),users=new Map(),authSizes=[];let now=START,hook=null,options;
 const ref=path=>({path,id:path.split('/').at(-1)});
 const snapshot=path=>{const v=records.get(path);return {exists:records.has(path),id:path.split('/').at(-1),ref:ref(path),data:()=>v?structuredClone(v):undefined};};
 let queue=Promise.resolve();
 const db={doc:ref,collection:name=>{const constraints=[];let count=100,cursor;
 const q={where:(field,op,value)=>{constraints.push({field,op,value});return q;},orderBy:()=>q,limit:n=>{count=n;return q;},startAfter:d=>{cursor=d;return q;},get:async()=>{
  let rows=[...records.keys()].filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(snapshot);
  rows=rows.filter(d=>constraints.every(c=>c.op==='>'?d.data()[c.field]>c.value:d.data()[c.field]<=c.value)).sort((a,b)=>a.data().subscriptionEndsAtMs-b.data().subscriptionEndsAtMs||a.id.localeCompare(b.id));
  if(cursor){const end=cursor.data().subscriptionEndsAtMs;rows=rows.filter(d=>d.data().subscriptionEndsAtMs>end||(d.data().subscriptionEndsAtMs===end&&d.id>cursor.id));}return {docs:rows.slice(0,count)};
 }};return q;},runTransaction:work=>{const next=queue.then(async()=>{if(hook){const f=hook;hook=null;f();}const writes=[];const result=await work({get:r=>Promise.resolve(snapshot(r.path)),set:(r,v)=>writes.push(()=>records.set(r.path,v))});writes.forEach(f=>f());return result;});queue=next.catch(()=>{});return next;}};
 const admin={auth:()=>({getUsers:async ids=>{authSizes.push(ids.length);return {users:ids.map(({uid})=>users.has(uid)?{uid,...users.get(uid)}:null).filter(Boolean)};}})};
 const api=factory({onSchedule:(o,fn)=>{options=o;return fn;},db,admin,stamp:()=> 'server timestamp',clock:()=>now});
 function add(uid,days,extra={},auth={}){records.set('users/'+uid,{subscriptionSchema:1,accountStatus:'active',accountTier:'premium',subscriptionEndsAtMs:START+days*DAY,...extra});users.set(uid,{emailVerified:true,disabled:false,...auth});}
 return {records,users,add,run:api.sendPromoHubSubscriptionReminders,now:v=>now=v,beforeTransaction:f=>hook=f,options,authSizes,notices:()=>[...records].filter(([k])=>k.includes('/notifications/'))};
}
test('daily Ghana-time reminder checks run privately and choose only the most urgent current stage',async()=>{
 const s=setup();assert.equal(s.options.schedule,'0 8 * * *');assert.equal(s.options.timeZone,'Africa/Accra');assert.equal(s.options.region,'us-central1');
 s.add('seven',7);s.add('three',3);s.add('one',0.5);s.add('later',8);const counts=await s.run();assert.equal(counts.created,3);
 assert.deepEqual(s.notices().map(([,n])=>n.reminderThresholdDays).sort((a,b)=>a-b),[1,3,7]);assert.ok(s.notices().every(([path,n])=>path.startsWith('users/')&&n.type==='subscription.expiryReminder'&&n.read===false&&n.body.includes('Ghana time')));
});
test('retries and overlapping invocations preserve one notice and its read state',async()=>{
 const s=setup();s.add('u',7);await Promise.all([s.run(),s.run()]);assert.equal(s.notices().length,1);const [id,n]=s.notices()[0];n.read=true;s.records.set(id,n);await s.run();assert.equal(s.notices().length,1);assert.equal(s.records.get(id).read,true);
});
test('later thresholds create one new notice each while renewal changes the expiry cycle',async()=>{
 const s=setup();s.add('u',7);await s.run();s.now(START+4*DAY);await s.run();s.now(START+6*DAY);await s.run();assert.equal(s.notices().length,3);
 s.records.get('users/u').subscriptionEndsAtMs=START+30*DAY;await s.run();assert.equal(s.notices().length,3);s.now(START+23*DAY);await s.run();assert.equal(s.notices().length,4);
});
test('trials, legacy Premium, suspended, disabled, unverified, missing Auth and administrators receive no reminder',async()=>{
 const s=setup();s.add('trial',3,{accountTier:'free'});s.add('legacy',3,{subscriptionSchema:undefined});s.add('suspended',3,{accountStatus:'suspended'});s.add('disabled',3,{}, {disabled:true});s.add('unverified',3,{}, {emailVerified:false});s.add('admin',3,{}, {customClaims:{promohubAdmin:true}});s.add('missing',3);s.users.delete('missing');s.add('expired',-1);s.add('invalid',3,{subscriptionEndsAtMs:NaN});await s.run();assert.equal(s.notices().length,0);
});
test('transaction rechecks renewal, deletion and suspension before writing a reminder',async()=>{
 for(const change of [s=>s.records.get('users/u').subscriptionEndsAtMs=START+30*DAY,s=>s.records.set('accountDeletions/u',{}),s=>s.records.get('users/u').accountStatus='suspended',s=>s.records.delete('users/u')]){const s=setup();s.add('u',3);s.beforeTransaction(()=>change(s));await s.run();assert.equal(s.notices().length,0);}
});
test('paginated query handles repeated expiry dates beyond the first 100 accounts with bounded Auth batches',async()=>{
 const s=setup();for(let i=0;i<205;i++)s.add('user'+String(i).padStart(3,'0'),3);const counts=await s.run();assert.equal(counts.scanned,205);assert.equal(s.notices().length,205);assert.deepEqual(s.authSizes,[100,100,5]);
});
test('expired accounts are not sent an inaccurate before-expiry reminder after a delayed run',async()=>{
 const s=setup();s.add('u',0.1);s.beforeTransaction(()=>s.now(START+DAY));await s.run();assert.equal(s.notices().length,0);
});
