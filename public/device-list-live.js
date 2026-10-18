'use strict';
window.PromoHubDeviceList=(()=>{
 const panel=document.getElementById('accountPanel'),section=document.getElementById('readerDevicesSection');
 let unsubscribe=null,uid=null,epoch=null,generation=0,version=0,last=null,signature='',expiryTimer=null,displayOwner=null;
 const profileVisible=()=>panel?.classList.contains('open')&&section?.open;
 const recoveryVisible=()=>window.PromoHubReaderRecovery?.deviceListOpen()===true;
 const visible=()=>(profileVisible()||recoveryVisible())&&document.visibilityState!=='hidden';
 const permitted=()=>cloudUser?.uid&&cloudUser.emailVerified&&securityProfile?.accountStatus==='active'&&navigator.onLine!==false&&visible();
 function stop(clear=false){generation++;if(unsubscribe)unsubscribe();unsubscribe=null;clearTimeout(expiryTimer);expiryTimer=null;uid=null;epoch=null;if(clear){last=null;signature='';displayOwner=null;version++;document.getElementById('readerDevicesList').replaceChildren();document.getElementById('readerDevicesStatus').textContent='';}}
 function paint(){
  if(!last||!permitted()||uid!==cloudUser?.uid||epoch!==securityEpoch)return;
  clearTimeout(expiryTimer);expiryTimer=null;
  const now=Date.now(),lease=last.lease,rows=(Array.isArray(last.devices)?last.devices:[]).map(d=>({...d,active:lease?.deviceId===d.id&&lease.expiresAtMs>now}));
  const result={devices:rows,readingAccessMode:'auto',exempt:securityIsAdmin()};
  const next=JSON.stringify([uid,profileVisible(),recoveryVisible(),result.readingAccessMode,result.exempt,rows.map(d=>[d.id,d.label,d.active])]);
  if(next!==signature){signature=next;version++;if(profileVisible())readerDevicesRender(result,uid,readerSessionEpoch);if(recoveryVisible())window.PromoHubReaderRecovery.renderDevices(result);}
  if(lease?.expiresAtMs>now)expiryTimer=setTimeout(paint,Math.min(2147483647,lease.expiresAtMs-now+20));
 }
 function start(){
  if(!permitted()){stop();return;}
  if(unsubscribe&&uid===cloudUser.uid&&epoch===securityEpoch){paint();return;}
  stop();uid=cloudUser.uid;epoch=securityEpoch;if(displayOwner&&displayOwner!==uid){document.getElementById('readerDevicesList').replaceChildren();document.getElementById('readerDevicesStatus').textContent='Loading devices…';}displayOwner=uid;const mine=++generation,owner=uid,authEpoch=epoch;
  // Never use the previous account's state while the first server snapshot loads.
  last=null;signature='';
  unsubscribe=cloudDb.doc(`users/${owner}/access/reader`).onSnapshot({includeMetadataChanges:true},snapshot=>{
   if(mine!==generation||cloudUser?.uid!==owner||securityEpoch!==authEpoch||!permitted())return;
   // Cached absence is not evidence that a registration was removed.
   if(snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)return;
   last=snapshot.exists?snapshot.data():{devices:[],lease:null};paint();
  },()=>{
   if(mine!==generation||cloudUser?.uid!==owner)return;
   stop();document.getElementById('readerDevicesStatus').textContent='Live device updates paused. Reconnect and select Manage devices to refresh.';
  });
 }
 section?.addEventListener('toggle',start);
 if(panel)new MutationObserver(start).observe(panel,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',start);
 window.addEventListener('online',start);
 window.addEventListener('offline',()=>{stop();if(visible())document.getElementById('readerDevicesStatus').textContent='Device list saved on screen. Reconnect for live updates.';});
 return {start,stop,revision:()=>version,observeRecovery:dialog=>new MutationObserver(start).observe(dialog,{attributes:true,attributeFilter:['open']})};
})();
