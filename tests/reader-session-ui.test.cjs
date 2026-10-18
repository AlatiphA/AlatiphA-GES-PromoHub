'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
function setup(){
 const data=new Map(),handlers={},nodes=new Map();let opens=0,closed=0,claims=0,mode='ok',resolveClaim;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},classList:{add(){},remove(){}},addEventListener(n,f){handlers[id+n]=f;},click(){closed++;},replaceChildren(){},append(){}});return nodes.get(id);};
 const context={crypto:webcrypto,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},sessionStorage:{getItem:()=>null,setItem(){}},navigator:{onLine:true,userAgent:'Windows'},location:{hostname:'example.test'},securityEpoch:1,securityLocalOwner:'u',cloudUser:{uid:'u'},securityProfile:{paid:true},securityIsAdmin:()=>false,subscriptionPaid:p=>p?.paid,subscriptionLegacy:()=>false,subscriptionCachedProfile:()=>context.securityProfile,subscriptionCloudAllowed:()=>context.readerSessionCloudAllowed(),securitySelectTab(){},securityMessage(){},accountPanel:node('panel'),document:{getElementById:node,addEventListener(n,f){handlers[n]=f;},createElement:()=>node('new')},window:{addEventListener(n,f){handlers[n]=f;}},setTimeout:f=>{handlers.expiry=f;return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){},selectedBookFile:'book1',rendition:null,cloudReady:false,libraryScreen:node('library'),readerApp:node('reader'),persistCurrentReaderPosition(){},backBtn:node('back'),securityWork:f=>f(),confirm:()=>true,openReader(){opens++;context.rendition={};},securityCall:async(name,args)=>{if(name==='managePromoHubDevices')return {ok:true};claims++;if(mode==='denied')throw new Error('Another session');if(mode==='wait')await new Promise(r=>resolveClaim=r);return {exempt:false,readingAccessMode:mode==='strict'?'strict':'auto',expiresAtMs:Date.now()+120000,offlineUntilMs:mode==='strict'?0:Date.now()+2592000000};}};
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
test('strict lease expiry closes reader even if heartbeat is stalled',async()=>{const s=setup();s.setMode('strict');s.context.openReader();await s.settle();vm.runInContext('readerSessionGrant.expiresAtMs=Date.now()-1;readerSessionWatchExpiry()',s.context);s.handlers.expiry();assert.equal(s.context.rendition,null);});
test('offline-enabled account retains permission until subscription expiry on disconnect',async()=>{const s=setup();s.context.openReader();await s.settle();const grant=JSON.parse(s.data.get('ges-promohub-reader-grant-u'));assert.ok(grant.offlineUntilMs-Date.now()>2591900000);s.context.navigator.onLine=false;s.handlers.offline();assert.ok(s.context.rendition);await s.context.readerSessionHeartbeat();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);});
test('reconnecting after mode changes replaces old offline permission with strict grant',async()=>{const s=setup();s.context.openReader();await s.settle();s.setMode('strict');await s.context.readerSessionHeartbeat();const grant=JSON.parse(s.data.get('ges-promohub-reader-grant-u'));assert.equal(grant.offlineUntilMs,0);s.context.navigator.onLine=false;s.handlers.offline();assert.equal(s.context.rendition,null);});

test('automatic permission enables cloud syncing while online and pauses it offline',async()=>{const s=setup();s.context.openReader();await s.settle();assert.equal(s.context.cloudReady,true);s.context.navigator.onLine=false;s.handlers.offline();assert.equal(s.context.cloudReady,false);assert.equal(s.context.readerSessionCloudAllowed(),false);});
test('account exposes automatic reading without a user mode mutator',()=>{const s=setup();s.context.readerModeRender();assert.match(s.node('automaticReadingStatus').textContent,/automatically/);assert.equal(typeof s.context.readerModeSave,'undefined');});

function delayedLocks(){
 let held=false,finish;
 return {api:{async request(name,options,callback){if(held)return callback(null);held=true;try{await callback({name});await new Promise(resolve=>{finish=resolve;});}finally{held=false;}}},finish(){assert.ok(finish,'old lock callback is awaiting release');const resolve=finish;finish=null;resolve();},held:()=>held};
}
test('reopening waits for the previous server release before fresh admission',async()=>{
 const s=setup();s.context.openReader();await s.settle();let release,claims=0;
 s.context.securityCall=async(name,args)=>{if(args?.operation==='release'){await new Promise(resolve=>release=resolve);return {ok:true};}claims++;return {readingAccessMode:'auto',expiresAtMs:Date.now()+120000,offlineUntilMs:Date.now()+60000};};
 s.context.backBtn.click();s.context.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(claims,0);release();await s.settle();assert.equal(s.opens(),2);assert.equal(claims,1);
});
test('account switch while waiting for release prevents the pending reopen',async()=>{
 const s=setup(),locks=delayedLocks();s.context.navigator.locks=locks.api;s.context.openReader();await s.settle();s.context.backBtn.click();s.context.openReader();await s.settle();s.context.readerSessionReset();s.context.cloudUser={uid:'other'};s.context.securityLocalOwner='other';locks.finish();await s.settle();assert.equal(s.opens(),1);
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

test('automatic reader stays open on disconnect and reacquires its online lease on reconnect',async()=>{
 const s=setup();s.context.openReader();await s.settle();assert.equal(s.context.cloudReady,true);s.context.navigator.onLine=false;s.handlers.offline();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);s.context.navigator.onLine=true;await s.context.readerSessionHeartbeat();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,true);assert.equal(s.opens(),1);
});
test('automatic offline expiry stops reading even when heartbeat is stalled',async()=>{
 const s=setup();s.context.openReader();await s.settle();s.context.navigator.onLine=false;s.handlers.offline();vm.runInContext('readerSessionGrant.offlineUntilMs=Date.now()-1;readerSessionWatchExpiry()',s.context);s.data.delete('ges-promohub-reader-grant-u');s.handlers.expiry();assert.equal(s.context.rendition,null);
});
test('an expired online lease falls back to valid saved permission and pauses cloud writes',async()=>{
 const s=setup();s.context.openReader();await s.settle();vm.runInContext('readerSessionGrant.expiresAtMs=Date.now()-1;readerSessionWatchExpiry()',s.context);s.handlers.expiry();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);assert.equal(vm.runInContext('readerSessionGrant.online',s.context),false);
});
test('a reconnect rejection ends reading instead of silently using offline permission',async()=>{
 const s=setup();s.context.openReader();await s.settle();s.context.navigator.onLine=false;s.handlers.offline();s.context.navigator.onLine=true;s.context.securityCall=async()=>{throw Object.assign(Error('Another device is reading'),{code:'functions/already-exists'});};await s.context.readerSessionHeartbeat();assert.equal(s.context.rendition,null);assert.equal(s.data.has('ges-promohub-reader-grant-u'),false);assert.equal(s.context.cloudReady,false);
});
test('temporary service loss uses automatic saved permission even when navigator reports online',async()=>{
 const s=setup();s.context.openReader();await s.settle();s.context.securityCall=async()=>{throw Object.assign(Error('Unavailable'),{code:'functions/unavailable'});};await s.context.readerSessionHeartbeat();assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);assert.equal(vm.runInContext('readerSessionGrant.online',s.context),false);
});

test('automatic reconnect retries pending account sync after checked admission',async()=>{
 const s=setup();let retries=0;s.context.window.PromoHubSync={update(){},retry(){retries++;}};s.context.openReader();await s.settle();assert.equal(retries,1);
 s.context.navigator.onLine=false;s.handlers.offline();s.context.navigator.onLine=true;await s.handlers.online();assert.equal(retries,2);await s.context.readerSessionHeartbeat();assert.equal(retries,2);
});
test('administrator syncing resumes on reconnect even when no book is open',async()=>{
 const s=setup();s.context.securityIsAdmin=()=>true;s.context.cloudReady=true;s.context.navigator.onLine=false;s.handlers.offline();assert.equal(s.context.cloudReady,false);s.context.navigator.onLine=true;await s.handlers.online();assert.equal(s.context.cloudReady,true);assert.equal(s.claims(),0);
});
test('trial reading has an expiry timer online and after deferred offline authentication',async()=>{
 for(const offline of [false,true]){
  const s=setup();s.context.securityProfile={paid:false,trialEndsAtMs:Date.now()+100000};s.context.subscriptionCloudAllowed=()=>false;s.context.subscriptionReadable=()=>true;
  if(offline){s.context.cloudUser=null;s.context.navigator.onLine=false;}else s.context.securityCall=async()=>({exempt:true,reason:'trial',offlineUntilMs:Date.now()+100000});
  s.context.openReader();await s.settle();assert.equal(s.opens(),1);assert.equal(s.context.cloudReady,false);assert.equal(typeof s.handlers.expiry,'function');
  vm.runInContext('readerSessionGrant.offlineUntilMs=Date.now()-1;readerSessionWatchExpiry()',s.context);s.handlers.expiry();assert.equal(s.context.rendition,null);
 }
});
test('a server denial remains authoritative if the browser disconnects while awaiting its response',async()=>{
 const s=setup();s.context.openReader();await s.settle();let reject;s.context.securityCall=()=>new Promise((_,r)=>reject=r);const work=s.context.readerSessionHeartbeat();s.context.navigator.onLine=false;s.handlers.offline();reject(Object.assign(Error('Device removed'),{code:'functions/permission-denied'}));await work;assert.equal(s.context.rendition,null);assert.equal(s.data.has('ges-promohub-reader-grant-u'),false);
});
test('legacy long-lived access expiry timers stay within the browser timeout range',async()=>{
 const s=setup();const delays=[];s.context.setTimeout=(f,ms)=>{s.handlers.expiry=f;delays.push(ms);return 1;};
 s.context.securityCall=async()=>({readingAccessMode:'auto',offlineUntilMs:253402300799000,expiresAtMs:Date.now()+120000});s.context.openReader();await s.settle();s.context.navigator.onLine=false;s.handlers.offline();assert.ok(delays.every(ms=>ms<=2147483647));assert.equal(delays.at(-1),2147483647);
});
test('removed mode controls have no remaining event bindings on either page',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'),admin=fs.readFileSync(require.resolve('../public/admin.html'),'utf8'),events=fs.readFileSync(require.resolve('../public/admin-page.js'),'utf8');
 assert.doesNotMatch(html,/id="myReadingMode(?:Save)?"/);assert.doesNotMatch(admin,/id="securityUserMode"/);assert.doesNotMatch(events,/securityUserMode/);assert.match(html,/id="automaticReadingStatus"/);
});
test('denial on initial online opening removes old permission before a later offline attempt',async()=>{
 const s=setup();await s.context.readerSessionClaim();s.context.securityCall=async()=>{throw Object.assign(Error('Access denied'),{code:'functions/permission-denied'});};await assert.rejects(s.context.readerSessionClaim(),/denied/);assert.equal(s.data.has('ges-promohub-reader-grant-u'),false);s.context.navigator.onLine=false;await assert.rejects(s.context.readerSessionClaim(),/online access check/);
});
test('a transient in-flight check survives deferred null Auth for the same offline account',async()=>{
 const s=setup();s.context.openReader();await s.settle();let reject;s.context.securityCall=()=>new Promise((_,r)=>reject=r);const work=s.context.readerSessionHeartbeat();s.context.cloudUser=null;s.context.navigator.onLine=false;s.handlers.offline();reject(Object.assign(Error('Network lost'),{code:'functions/unavailable'}));await work;assert.ok(s.context.rendition);assert.equal(s.context.cloudReady,false);
});
