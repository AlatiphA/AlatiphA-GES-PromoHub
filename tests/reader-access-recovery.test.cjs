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

test('temporary online admission failure uses only a valid account-scoped Offline grant',async()=>{
 const s=setup(),c=s.context;await c.readerSessionClaim();const id=c.readerDeviceId();s.data.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'u',deviceId:id,readingAccessMode:'offline',offlineUntilMs:Date.now()+100000}));c.securityProfile={paid:true,accountStatus:'active',readingAccessMode:'offline'};c.securityCall=async()=>{throw Object.assign(Error('temporary connection failure'),{code:'functions/unavailable'});};const grant=await c.readerSessionClaim();assert.equal(grant.online,false);assert.equal(s.data.has('ges-promohub-reader-grant-u'),true);
 s.data.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'u',deviceId:id,readingAccessMode:'strict',offlineUntilMs:0}));await assert.rejects(c.readerSessionClaim(),/temporary/);s.data.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'u',deviceId:id,readingAccessMode:'auto',offlineUntilMs:Date.now()+100000}));c.securityCall=async()=>{throw Object.assign(Error('device removed'),{code:'functions/permission-denied'});};await assert.rejects(c.readerSessionClaim(),/removed/);
});
test('online opening waits for pending activation and cannot open after an account switch',async()=>{
 const s=setup(),c=s.context;c.securityProfile=null;let resolve;c.securityActivationPending={uid:'u',promise:new Promise(r=>resolve=r)};const work=c.readerSessionClaim();await s.settle();assert.equal(s.claims(),0);c.cloudUser={uid:'other'};resolve();await assert.rejects(work,/Account changed/);assert.equal(s.claims(),0);
});
test('a completed account restoration admits the selected book automatically',async()=>{
 const s=setup(),c=s.context;c.securityProfile=null;let resolve;c.securityActivationPending={uid:'u',promise:new Promise(r=>resolve=r)};c.openReader();await s.settle();assert.equal(s.opens(),0);c.securityProfile={paid:true};resolve();await s.settle();assert.equal(s.opens(),1);
});
test('offline grants cannot exceed current subscription expiry or cross account ownership',()=>{
 const s=setup(),c=s.context,id=c.readerDeviceId(),end=Date.now()+5000;c.securityProfile={paid:true,accountStatus:'active',readingAccessMode:'offline',subscriptionEndsAtMs:end};s.data.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'u',deviceId:id,readingAccessMode:'offline',offlineUntilMs:Date.now()+100000}));assert.equal(c.readerSessionSavedGrant('u',id).offlineUntilMs,end);s.data.set('ges-promohub-reader-grant-u',JSON.stringify({uid:'other',deviceId:id,readingAccessMode:'offline',offlineUntilMs:end}));assert.equal(c.readerSessionSavedGrant('u',id),null);
});
test('reader failures use focused recovery rather than opening profile',async()=>{
 const s=setup();let shown;s.context.window.PromoHubReaderRecovery={show:(message,error)=>shown={message,error}};s.setMode('denied');s.context.openReader();await s.settle();assert.equal(shown.message,'Another session');assert.equal(s.opens(),0);
});
test('expired offline account is not misclassified as exempt trial access',async()=>{
 const s=setup();s.context.navigator.onLine=false;s.context.securityProfile={paid:false};s.context.subscriptionReadable=()=>false;await assert.rejects(s.context.readerSessionClaim(),/expired/);
});
