'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const events={},section={open:true,addEventListener:(n,f)=>events['section:'+n]=f},panel={opened:true,classList:{contains:()=>panel.opened}},status={replaceChildren(){}},renders=[],subscriptions=[];let observer,timer,clears=0;
 const ctx={window:{addEventListener:(n,f)=>events[n]=f},document:{visibilityState:'visible',getElementById:id=>id==='accountPanel'?panel:id==='readerDevicesSection'?section:status,addEventListener:(n,f)=>events[n]=f},
 navigator:{onLine:true},cloudUser:{uid:'u',emailVerified:true},securityProfile:{accountStatus:'active',readingAccessMode:'strict'},securityEpoch:1,readerSessionEpoch:1,securityIsAdmin:()=>false,
 MutationObserver:class{constructor(fn){observer=fn;}observe(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{clears++;timer=null;},
 readerDevicesRender:(r,uid,epoch)=>renders.push({r,uid,epoch}),cloudDb:{doc:path=>({onSnapshot:(options,next,error)=>{const sub={path,next,error,stopped:false};subscriptions.push(sub);return ()=>sub.stopped=true;}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/device-list-live.js'),'utf8'),ctx);
 return {ctx,api:ctx.window.PromoHubDeviceList,events,section,panel,status,renders,subscriptions,observe:()=>observer(),timer:()=>timer,emit:(sub,data,metadata={fromCache:false})=>sub.next({exists:!!data,data:()=>data,metadata})};
}
const state=(ids,lease=null)=>({devices:ids.map(id=>({id,label:'Mobile '+id,lastSeenAtMs:Date.now()})),lease});
test('live registrations and removals render without reopening the profile',()=>{
 const s=setup();s.api.start();const sub=s.subscriptions[0];assert.equal(sub.path,'users/u/access/reader');
 s.emit(sub,state(['phone']));s.emit(sub,state(['phone','pc']));s.emit(sub,state(['pc']));
 assert.deepEqual(s.renders.map(x=>Array.from(x.r.devices,d=>d.id)),[['phone'],['phone','pc'],['pc']]);assert.equal(s.renders[2].uid,'u');
});
test('heartbeats do not rebuild unchanged rows and Reading now clears on lease expiry',()=>{
 const s=setup();s.api.start();const sub=s.subscriptions[0];s.emit(sub,state(['phone'],{deviceId:'phone',expiresAtMs:Date.now()+10000}));assert.equal(s.renders[0].r.devices[0].active,true);
 s.emit(sub,state(['phone'],{deviceId:'phone',expiresAtMs:Date.now()+20000}));assert.equal(s.renders.length,1);
 s.emit(sub,state(['phone'],{deviceId:'phone',expiresAtMs:Date.now()-1}));assert.equal(s.renders.length,2);assert.equal(s.renders[1].r.devices[0].active,false);
});
test('cached absence and pending writes cannot erase the server device list',()=>{
 const s=setup();s.api.start();const sub=s.subscriptions[0];s.emit(sub,state(['phone']));s.emit(sub,null,{fromCache:true});s.emit(sub,state([]),{hasPendingWrites:true});assert.equal(s.renders.length,1);s.emit(sub,null);assert.equal(s.renders[1].r.devices.length,0);
});
test('closing profile or section unsubscribes and late callbacks are ignored',()=>{
 for(const mode of ['profile','section']){const s=setup();s.api.start();const sub=s.subscriptions[0];if(mode==='profile'){s.panel.opened=false;s.observe();}else{s.section.open=false;s.events['section:toggle']();}assert.equal(sub.stopped,true);s.emit(sub,state(['private']));assert.equal(s.renders.length,0);}
});
test('background and offline listeners stop and reconnect starts a fresh snapshot',()=>{
 const s=setup();s.api.start();const first=s.subscriptions[0];s.ctx.document.visibilityState='hidden';s.events.visibilitychange();assert.equal(first.stopped,true);s.ctx.document.visibilityState='visible';s.events.visibilitychange();assert.equal(s.subscriptions.length,2);
 s.ctx.navigator.onLine=false;s.events.offline();assert.equal(s.subscriptions[1].stopped,true);s.ctx.navigator.onLine=true;s.events.online();assert.equal(s.subscriptions.length,3);s.emit(s.subscriptions[2],state(['new']));assert.equal(s.renders[0].r.devices[0].id,'new');
});
test('account changes discard old callbacks and clear old state before listening',()=>{
 const s=setup();s.api.start();const first=s.subscriptions[0];s.emit(first,state(['old']));s.ctx.cloudUser={uid:'other',emailVerified:true};s.ctx.securityEpoch++;s.api.start();assert.equal(first.stopped,true);s.emit(first,state(['leak']));assert.equal(s.renders.length,1);s.emit(s.subscriptions[1],state(['other-device']));assert.equal(s.renders[1].uid,'other');
});
test('unverified, inactive and signed-out accounts never attach listeners',()=>{
 for(const mode of ['unverified','suspended','signedout']){const s=setup();if(mode==='unverified')s.ctx.cloudUser.emailVerified=false;if(mode==='suspended')s.ctx.securityProfile.accountStatus='suspended';if(mode==='signedout')s.ctx.cloudUser=null;s.api.start();assert.equal(s.subscriptions.length,0);}
});
test('listener errors preserve rows and give an explicit refresh path',()=>{
 const s=setup();s.api.start();const sub=s.subscriptions[0];s.emit(sub,state(['phone']));sub.error(Error('denied'));assert.equal(sub.stopped,true);assert.equal(s.renders.length,1);assert.match(s.status.textContent,/Live device updates paused/);s.api.start();assert.equal(s.subscriptions.length,2);
});
test('legacy mode fields do not change automatic policy or rebuild device rows',()=>{
 const s=setup();s.api.start();s.emit(s.subscriptions[0],state(['phone']));s.ctx.securityProfile.readingAccessMode='offline';s.api.start();assert.equal(s.renders.length,1);assert.equal(s.renders[0].r.readingAccessMode,'auto');assert.equal(s.subscriptions.length,1);
});
test('PC reading-access list receives live snapshots without opening the profile',()=>{
 const s=setup();s.panel.opened=false;let open=true;const received=[];s.ctx.window.PromoHubReaderRecovery={deviceListOpen:()=>open,renderDevices:r=>received.push(r)};
 s.api.start();const sub=s.subscriptions[0];s.emit(sub,state(['phone','pc']));s.emit(sub,state(['pc']));assert.equal(s.renders.length,0);assert.equal(received.length,2);assert.equal(received[1].devices[0].id,'pc');open=false;s.api.start();assert.equal(sub.stopped,true);
});
