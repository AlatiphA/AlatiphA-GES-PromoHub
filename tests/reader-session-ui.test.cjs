'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function setup(){
 const data=new Map(),handlers={},nodes=new Map();let opens=0,closed=0,claims=0,mode='ok',resolveClaim;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},classList:{add(){},remove(){}},addEventListener(n,f){handlers[id+n]=f;},click(){closed++;},replaceChildren(){},append(){}});return nodes.get(id);};
 const context={crypto:webcrypto,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},sessionStorage:{getItem:()=>null,setItem(){}},navigator:{onLine:true,userAgent:'Windows'},location:{hostname:'example.test'},securityEpoch:1,securityLocalOwner:'u',cloudUser:{uid:'u'},securityProfile:{paid:true},securityIsAdmin:()=>false,subscriptionPaid:p=>p?.paid,subscriptionLegacy:()=>false,subscriptionCachedProfile:()=>context.securityProfile,subscriptionCloudAllowed:()=>context.readerSessionCloudAllowed(),securitySelectTab(){},securityMessage(){},accountPanel:node('panel'),document:{getElementById:node,addEventListener(n,f){handlers[n]=f;},createElement:()=>node('new')},window:{addEventListener(n,f){handlers[n]=f;}},setTimeout:f=>{handlers.expiry=f;return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){},selectedBookFile:'book1',rendition:null,cloudReady:false,libraryScreen:node('library'),readerApp:node('reader'),persistCurrentReaderPosition(){},backBtn:node('back'),securityWork:f=>f(),confirm:()=>true,openReader(){opens++;context.rendition={};},securityCall:async(name,args)=>{if(name==='managePromoHubDevices')return {ok:true};claims++;if(mode==='denied')throw new Error('Another session');if(mode==='wait')await new Promise(r=>resolveClaim=r);return {exempt:false,readingAccessMode:mode==='strict'?'strict':'offline',expiresAtMs:Date.now()+120000,offlineUntilMs:mode==='strict'?0:Date.now()+2592000000};}};
 context.backBtn.click=()=>{context.rendition=null;closed++;handlers.backclick?.();};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/reader-sessions.js'),'utf8'),context);
 const settle=()=>new Promise(r=>setImmediate(r));
 return {context,data,handlers,node,settle,opens:()=>opens,closed:()=>closed,claims:()=>claims,setMode:v=>mode=v,resolve:()=>resolveClaim?.()};
}
test('paid reader waits for server admission and denial never opens EPUB',async()=>{const s=setup();s.setMode('denied');s.context.openReader();await s.settle();assert.equal(s.opens(),0);assert.equal(s.node('library').style.display,'flex');assert.equal(s.context.cloudReady,false);});
test('offline paid reader requires an account-scoped nonexpired registration grant',async()=>{const s=setup();s.context.navigator.onLine=false;s.context.openReader();await s.settle();assert.equal(s.opens(),0);const id=s.context.readerDeviceId();s.data.set('ges-promohub-reader-grant-u',JSON.stringify({readingAccessMode:'offline',deviceId:id,offlineUntilMs:Date.now()+10000}));s.context.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(s.context.cloudReady,false);assert.equal(s.claims(),0);});
test('expired offline grant ends reading on the next check',async()=>{const s=setup();s.context.openReader();await s.settle();s.context.navigator.onLine=false;const id=s.context.readerDeviceId();s.data.set('ges-promohub-reader-grant-u',JSON.stringify({readingAccessMode:'offline',deviceId:id,offlineUntilMs:1}));vm.runInContext('readerSessionGrant.offlineUntilMs=1',s.context);await s.context.readerSessionHeartbeat();assert.equal(s.context.rendition,null);assert.equal(s.context.cloudReady,false);});
test('late session claim cannot reopen a book after an account switch',async()=>{const s=setup();s.setMode('wait');s.context.openReader();await s.settle();s.context.readerSessionReset();s.context.cloudUser={uid:'other'};s.context.securityLocalOwner='other';s.resolve();await s.settle();assert.equal(s.opens(),0);});
test('removed or denied session stops reader and cloud saving, and Back releases the lease',async()=>{const s=setup();s.context.openReader();await s.settle();assert.equal(s.opens(),1);s.setMode('denied');await s.context.readerSessionHeartbeat();assert.equal(s.context.rendition,null);assert.equal(s.context.cloudReady,false);});

test('strict admission grants no offline access and loss of connection saves and closes reader',async()=>{const s=setup();s.setMode('strict');s.context.openReader();await s.settle();assert.equal(s.opens(),1);s.context.navigator.onLine=false;s.handlers.offline();assert.equal(s.context.rendition,null);s.context.openReader();await s.settle();assert.equal(s.opens(),1);});
test('strict lease expiry closes reader even if heartbeat is stalled',async()=>{const s=setup();s.setMode('strict');s.context.openReader();await s.settle();s.handlers.expiry();assert.equal(s.context.rendition,null);});
test('offline-enabled account retains permission until subscription expiry on disconnect',async()=>{const s=setup();s.context.openReader();await s.settle();const grant=JSON.parse(s.data.get('ges-promohub-reader-grant-u'));assert.ok(grant.offlineUntilMs-Date.now()>2591900000);s.context.navigator.onLine=false;s.handlers.offline();assert.ok(s.context.rendition);await s.context.readerSessionHeartbeat();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);});
test('reconnecting after mode changes replaces old offline permission with strict grant',async()=>{const s=setup();s.context.openReader();await s.settle();s.setMode('strict');await s.context.readerSessionHeartbeat();const grant=JSON.parse(s.data.get('ges-promohub-reader-grant-u'));assert.equal(grant.offlineUntilMs,0);s.context.navigator.onLine=false;s.handlers.offline();assert.equal(s.context.rendition,null);});

test('offline mode never enables cloud syncing even with internet available',async()=>{const s=setup();s.context.openReader();await s.settle();assert.equal(s.context.cloudReady,false);assert.equal(s.context.readerSessionCloudAllowed(),false);});
test('user mode switch requires connection and clears old offline permission when selecting online',async()=>{const s=setup();let request;s.context.securityCall=async(name,data)=>{request={name,data};return {ok:true};};s.context.navigator.onLine=false;await s.context.readerModeSave();assert.equal(request,undefined);s.context.navigator.onLine=true;s.node('myReadingMode').value='strict';s.data.set('ges-promohub-reader-grant-u','old');await s.context.readerModeSave();assert.equal(request.name,'setMyPromoHubReadingMode');assert.equal(request.data.mode,'strict');assert.equal(request.data.uid,undefined);assert.equal(s.context.securityProfile.readingAccessMode,'strict');assert.equal(s.data.has('ges-promohub-reader-grant-u'),false);});
test('late own-mode response cannot change another account',async()=>{const s=setup();let resolve;s.context.securityCall=()=>new Promise(r=>resolve=r);s.node('myReadingMode').value='offline';const pending=s.context.readerModeSave();s.context.cloudUser={uid:'other'};s.context.securityEpoch++;s.context.securityProfile={paid:true,readingAccessMode:'strict'};resolve({ok:true});await pending;assert.equal(s.context.securityProfile.readingAccessMode,'strict');});
test('My Account selector defaults online and preserves explicit offline mode',()=>{const s=setup();s.context.cloudUser.emailVerified=true;s.context.readerModeRender();assert.equal(s.node('myReadingMode').value,'strict');s.context.securityProfile.readingAccessMode='offline';s.context.readerModeRender();assert.equal(s.node('myReadingMode').value,'offline');});

function delayedLocks(){
 let held=false,finish;
 return {api:{async request(name,options,callback){if(held)return callback(null);held=true;try{await callback({name});await new Promise(resolve=>{finish=resolve;});}finally{held=false;}}},finish(){assert.ok(finish,'old lock callback is awaiting release');const resolve=finish;finish=null;resolve();},held:()=>held};
}
test('mode switch waits for actual browser lock release before reopening',async()=>{
 const s=setup(),locks=delayedLocks();s.context.navigator.locks=locks.api;
 let message='';s.context.window.PromoHubReaderRecovery={show:text=>message=text};
 s.context.openReader();await s.settle();assert.equal(s.opens(),1);
 s.node('myReadingMode').value='offline';const saving=s.context.readerModeSave();await s.settle();
 assert.equal(s.opens(),1);assert.equal(locks.held(),true);assert.equal(message,'');
 locks.finish();await saving;await s.settle();assert.equal(s.opens(),2);assert.equal(message,'');assert.equal(s.context.securityProfile.readingAccessMode,'offline');
});
test('mode switch waits for server release before claiming again in either direction',async()=>{
 for(const mode of ['strict','offline']){
  const s=setup();s.context.openReader();await s.settle();let release,claims=0;
  s.context.securityCall=async(name,args)=>{if(args?.operation==='release'){await new Promise(resolve=>release=resolve);return {ok:true};}if(name==='setMyPromoHubReadingMode')return {ok:true};claims++;return {readingAccessMode:mode,expiresAtMs:Date.now()+120000,offlineUntilMs:Date.now()+60000};};
  s.node('myReadingMode').value=mode;const saving=s.context.readerModeSave();await s.settle();assert.equal(s.opens(),1);assert.equal(claims,0);
  release();await saving;await s.settle();assert.equal(s.opens(),2);assert.equal(claims,1);
 }
});
test('account switch during lock release cannot reopen or overwrite the new account',async()=>{
 const s=setup(),locks=delayedLocks();s.context.navigator.locks=locks.api;s.context.openReader();await s.settle();
 s.node('myReadingMode').value='offline';const saving=s.context.readerModeSave();await s.settle();s.context.readerSessionReset();s.context.securityEpoch++;s.context.cloudUser={uid:'other'};s.context.securityProfile={paid:true,readingAccessMode:'strict'};
 locks.finish();await saving;await s.settle();assert.equal(s.opens(),1);assert.equal(s.context.securityProfile.readingAccessMode,'strict');
});
test('a lock owned by another tab still blocks reader admission',async()=>{
 const s=setup();let message='';s.context.navigator.locks={request:async(name,options,callback)=>callback(null)};s.context.window.PromoHubReaderRecovery={show:text=>message=text};s.context.openReader();await s.settle();assert.equal(s.opens(),0);assert.match(message,/another tab/);assert.equal(s.claims(),0);
});
test('ordinary Back then reopen also waits for browser lock release',async()=>{
 const s=setup(),locks=delayedLocks();s.context.navigator.locks=locks.api;s.context.openReader();await s.settle();s.context.backBtn.click();s.context.openReader();await s.settle();assert.equal(s.opens(),1);locks.finish();await s.settle();assert.equal(s.opens(),2);
});
test('a failed server release settles and allows a fresh checked admission',async()=>{
 const s=setup();s.context.openReader();await s.settle();const call=s.context.securityCall;s.context.securityCall=async(name,args)=>{if(args?.operation==='release')throw Error('network unavailable');return call(name,args);};s.context.backBtn.click();s.context.openReader();await s.settle();assert.equal(s.opens(),2);
});
