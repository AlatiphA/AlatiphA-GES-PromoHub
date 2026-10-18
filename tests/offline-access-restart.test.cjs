'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function setup(savedStorage=null){
 const storage=savedStorage||new Map([['ges-promohub-security-owner','u'],['ges-promohub-device-id','a'.repeat(32)],['ges-promohub-migrated-u','true']]),nodes=new Map(),events={};let opens=0,calls=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='subscriptionPlan'?'m1':'',hidden:false,textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){}});return nodes.get(id);};
 const ctx={crypto:webcrypto,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},navigator:{onLine:false,userAgent:'Android'},location:{hostname:'example.test'},window:{addEventListener:(n,f)=>events[n]=f},document:{getElementById:node,addEventListener(){},activeElement:null},cloudUser:{uid:'u',emailVerified:true,getIdTokenResult:async()=>({claims:{promohubAdmin:true}})},cloudReady:false,cloudAuth:null,cloudDb:{doc:()=>({onSnapshot:()=>()=>{}})},accountPanel:node('accountPanel'),preferenceSyncTimer:null,progressSyncTimer:null,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},hideAuth(){},showAuth(){},resumeReaderAfterStartup(){},selectedBookFile:'book',libraryScreen:node('library'),readerApp:node('reader'),rendition:null,persistCurrentReaderPosition(){},backBtn:node('back'),openReader(){opens++;ctx.rendition={};},console};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(require.resolve('../public/security-ui.js'),'utf8'),ctx);
 const sub=fs.readFileSync(require.resolve('../public/subscription-ui.js'),'utf8');vm.runInContext(sub.slice(0,sub.indexOf('securityActions.premium=')),ctx);
 vm.runInContext(fs.readFileSync(require.resolve('../public/reader-sessions.js'),'utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 ctx.securityCall=async()=>{calls++;return {accountStatus:'active',accountTier:'free',trialEndsAtMs:1};};
 return {ctx,storage,node,run,opens:()=>opens,calls:()=>calls,settle:()=>new Promise(r=>setImmediate(r)),paid(){storage.set('ges-promohub-subscription-u',JSON.stringify({accountStatus:'active',accountTier:'premium',subscriptionSchema:1,subscriptionEndsAtMs:Date.now()+60000,readingAccessMode:'offline'}));storage.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'u',deviceId:'a'.repeat(32),readingAccessMode:'offline',offlineUntilMs:Date.now()+60000}));}};
}
test('admin confirmed online can restart offline after trial expiry, without restoring admin controls',async()=>{
 const s=setup();s.ctx.navigator.onLine=true;await s.run('securityActivateCore(cloudUser)');assert.equal(s.calls(),1);
 s.run('securityProfile=null;securityClaims={}');s.ctx.navigator.onLine=false;
 await s.run('securityAuthChanged(cloudUser)');assert.equal(s.run('securityIsAdmin()'),false);assert.equal(s.run('subscriptionReadable()'),true);
 s.ctx.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(s.calls(),1);assert.equal(s.ctx.cloudReady,false);
});
test('paid offline startup uses the real subscription cache and browser grant',async()=>{
 const s=setup();s.paid();await s.run('securityAuthChanged(cloudUser)');s.ctx.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(s.calls(),0);assert.equal(s.ctx.cloudReady,false);
});
test('internal callable failure preserves a valid paid offline grant on a connected network with no service',async()=>{
 const s=setup();s.paid();s.ctx.navigator.onLine=true;s.ctx.securityCall=async()=>{throw Object.assign(Error('internal'),{code:'functions/internal'});};
 const grant=await s.run('readerSessionClaim()');assert.equal(grant.online,false);assert.ok(s.storage.has('ges-promohub-reader-grant-u'));
});
test('permission denial and old strict grants cannot fall back to paid offline access',async()=>{
 const s=setup();s.paid();s.ctx.navigator.onLine=true;s.ctx.securityCall=async()=>{throw Object.assign(Error('suspended'),{code:'functions/permission-denied'});};await assert.rejects(s.run('readerSessionClaim()'),/suspended/);
 assert.equal(s.storage.has('ges-promohub-reader-grant-u'),false);s.paid();s.ctx.navigator.onLine=false;const g=JSON.parse(s.storage.get('ges-promohub-reader-grant-u'));g.readingAccessMode='strict';g.offlineUntilMs=0;s.storage.set('ges-promohub-reader-grant-u',JSON.stringify(g));assert.equal(s.run('securityOfflineReadingAllowed()'),false);await assert.rejects(s.run('readerSessionClaim()'),/online access check/);
});
test('admin receipt is browser and owner scoped, and removed on sign-out or confirmed role removal',()=>{
 const s=setup();s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"})');assert.equal(s.run('securityOfflineAdminReading()'),true);
 s.storage.set('ges-promohub-device-id','b'.repeat(32));assert.equal(s.run('securityOfflineAdminReading()'),false);s.storage.set('ges-promohub-device-id','a'.repeat(32));
 s.ctx.cloudUser={uid:'other',emailVerified:true};assert.equal(s.run('securityOfflineAdminReading()'),false);s.ctx.cloudUser={uid:'u',emailVerified:true};
 s.run('securityCacheAdminReading(cloudUser,{}, {accountStatus:"active"})');assert.equal(s.run('securityOfflineAdminReading()'),false);
 s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"});securityPrepareSignOut()');assert.equal(s.run('securityOfflineAdminReading()'),false);
});
test('offline subscription rendering with a deferred null Auth user does not throw or change cache ownership',()=>{
 const s=setup();s.paid();s.ctx.cloudUser=null;s.run('securityProfile=subscriptionCachedProfile();subscriptionRender()');assert.ok(s.storage.has('ges-promohub-subscription-u'));assert.equal(s.storage.has('ges-promohub-subscription-undefined'),false);
});
test('explicit activation denial revokes a previously cached administrator reading receipt',async()=>{
 const s=setup();s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"})');s.ctx.navigator.onLine=true;s.ctx.securityCall=async()=>{throw Object.assign(Error('Account is unavailable.'),{code:'functions/permission-denied'});};
 await s.run('securityAuthChanged(cloudUser)');assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);assert.equal(s.run('securityOfflineAdminReading()'),false);
});
test('a suspended profile cannot use a cached admin reading receipt',()=>{
 const s=setup();s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"});securityProfile={accountStatus:"suspended"};securityOfflineDeferred=true');assert.equal(s.run('securityOfflineAdminReading()'),false);assert.equal(s.run('subscriptionReadable()'),false);
});
test('authoritative activation denial cannot use offline fallback when connectivity drops during the call',async()=>{
 const s=setup();s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"})');s.ctx.navigator.onLine=true;s.ctx.securityCall=async()=>{s.ctx.navigator.onLine=false;throw Object.assign(Error('Account is unavailable.'),{code:'functions/permission-denied'});};await s.run('securityAuthChanged(cloudUser)');assert.equal(s.run('securityOfflineDeferred'),false);assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);
});
test('administrator record can be saved without the reader module being available',()=>{
 const s=setup();s.run('readerDeviceId=undefined');assert.equal(s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"})'),true);assert.ok(s.storage.has('ges-promohub-admin-reader-u'));
});
test('verified online admin rendering repairs a missing record before an offline restart',async()=>{
 const s=setup();s.ctx.navigator.onLine=true;await s.run('securityActivateCore(cloudUser)');s.storage.delete('ges-promohub-admin-reader-u');s.run('subscriptionRender()');assert.ok(s.storage.has('ges-promohub-admin-reader-u'));assert.match(s.node('subscriptionHint').textContent,/Offline reading is ready/);
 s.run('securityProfile=null;securityClaims={}');s.ctx.navigator.onLine=false;await s.run('securityAuthChanged(cloudUser)');assert.equal(s.run('subscriptionReadable()'),true);s.ctx.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(s.run('securityIsAdmin()'),false);
});
test('storage failure is reported as offline preparation unavailable while admin stays online',async()=>{
 const s=setup();s.ctx.navigator.onLine=true;const set=s.ctx.localStorage.setItem;s.ctx.console={warn(){}};s.ctx.localStorage.setItem=(key,value)=>{if(key.startsWith('ges-promohub-admin-reader-'))throw Error('quota');set(key,value);};await s.run('securityActivateCore(cloudUser)');assert.match(s.node('subscriptionHint').textContent,/could not be prepared/);assert.equal(s.run('securityIsAdmin()'),true);assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);
});
test('admin render during explicit sign-out cannot recreate the cleared offline record',async()=>{
 const s=setup();s.ctx.navigator.onLine=true;await s.run('securityActivateCore(cloudUser)');s.run('securityPrepareSignOut();subscriptionRender()');assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);
});
test('offline or nonadmin rendering never mints a missing administrator reading record',async()=>{
 const s=setup();s.ctx.navigator.onLine=true;await s.run('securityActivateCore(cloudUser)');s.storage.delete('ges-promohub-admin-reader-u');s.ctx.navigator.onLine=false;s.run('subscriptionRender()');assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);
 s.ctx.navigator.onLine=true;s.run('securityClaims={};subscriptionRender()');assert.equal(s.storage.has('ges-promohub-admin-reader-u'),false);
});
test('new device identity is generated and verified before saving admin reading record',()=>{
 const s=setup();s.storage.delete('ges-promohub-device-id');assert.equal(s.run('securityCacheAdminReading(cloudUser,{promohubAdmin:true},{accountStatus:"active"})'),true);const receipt=JSON.parse(s.storage.get('ges-promohub-admin-reader-u'));assert.match(receipt.deviceId,/^[a-f0-9]{32}$/);assert.equal(receipt.deviceId,s.storage.get('ges-promohub-device-id'));
});
test('a fully new offline runtime restores persisted admin reading with verified or deferred null Auth',async()=>{
 for(const hasUser of [true,false]){const online=setup();online.ctx.navigator.onLine=true;await online.run('securityActivateCore(cloudUser)');const cold=setup(online.storage);if(!hasUser)cold.ctx.cloudUser=null;await cold.run('securityAuthChanged(cloudUser)');assert.equal(cold.run('securityIsAdmin()'),false);assert.equal(cold.run('subscriptionReadable()'),true);cold.ctx.openReader();await cold.settle();assert.equal(cold.opens(),1);assert.equal(cold.calls(),0);}
});
test('logout and returning to the same account invalidate pending book loads',()=>{
 const s=setup();s.ctx.readerLoadGeneration=4;s.ctx.localPreferences=()=>({});s.ctx.applyLibraryDayNight=()=>{};s.ctx.BOOKS=[];s.ctx.confirm=()=>false;
 s.run('securitySwitchLocal(null);securitySwitchLocal({uid:"u"})');assert.equal(s.ctx.readerLoadGeneration,6);assert.equal(s.run('securityLocalOwner'),'u');
});
