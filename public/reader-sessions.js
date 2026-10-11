/* Two browser/PWA registrations and one online reader lease per paid account. */
let readerSessionExpiryTimer=null;
let readerSessionGrant=null,readerSessionTimer=null,readerSessionBusy=false,readerSessionEpoch=0,readerSessionUnlock=null;
function readerSessionId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function readerDeviceId(){let id=localStorage.getItem('ges-promohub-device-id');if(!/^[a-f0-9]{32}$/.test(id||'')){id=readerSessionId();localStorage.setItem('ges-promohub-device-id',id);}return id;}
let readerBrowserSessionId;
try {readerBrowserSessionId=navigator.locks ? sessionStorage.getItem('ges-promohub-reader-session') : null;if(!/^[a-f0-9]{32}$/.test(readerBrowserSessionId||'')){readerBrowserSessionId=readerSessionId();sessionStorage.setItem('ges-promohub-reader-session',readerBrowserSessionId);}} catch {readerBrowserSessionId=readerSessionId();}
function readerSessionKey(uid){return 'ges-promohub-reader-grant-'+uid;}
function readerSessionPaid(){const p=securityProfile||subscriptionCachedProfile();return !!(cloudUser||securityLocalOwner)&&!securityIsAdmin()&&(subscriptionPaid(p)||subscriptionLegacy(p));}
function readerSessionCloudAllowed(){return !readerSessionPaid()||!!(readerSessionGrant&&readerSessionGrant.uid===cloudUser?.uid&&readerSessionGrant.online&&readerSessionGrant.expiresAtMs>Date.now());}
function readerSessionMessage(message){securitySelectTab('account');securityMessage(message);accountPanel.classList.add('open');const status=document.getElementById('readerDevicesStatus');if(status)status.textContent=message;}
function readerSessionStop(message){persistCurrentReaderPosition();if(rendition)backBtn.click();readerSessionGrant=null;cloudReady=false;readerSessionMessage(message);}
async function readerSessionLock(uid){
 if(!navigator.locks)return;
 await new Promise((resolve,reject)=>navigator.locks.request('promohub-reader-'+uid,{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error('This account already has a reader open in another tab. Close it first.'));return;}
  await new Promise(unlock=>{readerSessionUnlock=unlock;resolve();});
 }).catch(reject));
}
async function readerSessionClaim(renew=false){
 const uid=cloudUser?.uid||securityLocalOwner,epoch=readerSessionEpoch;
 if(!uid)return {exempt:true};
 const deviceId=readerDeviceId(),sessionId=readerBrowserSessionId;
 if(!navigator.onLine){
  const p=securityProfile||subscriptionCachedProfile();
  if(!subscriptionPaid(p)&&!subscriptionLegacy(p))return {exempt:true};
  let saved;try{saved=JSON.parse(localStorage.getItem(readerSessionKey(uid)));}catch{}
  if(saved?.readingAccessMode==='strict'||saved?.deviceId!==deviceId||!Number.isFinite(saved?.offlineUntilMs)||saved.offlineUntilMs<=Date.now())throw new Error('Connect to the internet to confirm this registered device before reading offline.');
  return {...saved,uid,online:false};
 }
 if(!cloudUser)throw new Error('Sign in online to confirm this device.');
 const result=await securityCall('claimPromoHubReaderSession',{deviceId,sessionId,renew,label:(/Android|iPhone|iPad/i.test(navigator.userAgent)?'Mobile':'Computer')+' · '+location.hostname});
 if(epoch!==readerSessionEpoch||cloudUser?.uid!==uid)throw new Error('Account changed while opening the reader.');
 const grant={...result,deviceId,sessionId,uid,online:true};
 if(!result.exempt){try{localStorage.setItem(readerSessionKey(uid),JSON.stringify(grant));}catch{}}
 return grant;
}
function readerSessionWatchExpiry(){
 clearTimeout(readerSessionExpiryTimer);readerSessionExpiryTimer=null;
 const grant=readerSessionGrant;
 if(grant?.readingAccessMode==='strict'&&!grant.exempt){
  readerSessionExpiryTimer=setTimeout(()=>{if(readerSessionGrant===grant&&rendition)readerSessionStop('Your online reader session could not be verified. Reconnect and open the book again.');},Math.max(0,grant.expiresAtMs-Date.now()));
 }
}
async function readerSessionHeartbeat(){
 if(!rendition||!(cloudUser||securityLocalOwner)||readerSessionBusy)return;
 if(readerSessionGrant?.exempt&&!readerSessionPaid())return;
 readerSessionBusy=true;const epoch=readerSessionEpoch;
 try {const grant=await readerSessionClaim(!!readerSessionGrant?.online&&readerSessionGrant.expiresAtMs>Date.now());if(epoch!==readerSessionEpoch)return;readerSessionGrant=grant;readerSessionWatchExpiry();cloudReady=subscriptionCloudAllowed();}
 catch(e){if(epoch!==readerSessionEpoch)return;if(!navigator.onLine&&readerSessionGrant?.readingAccessMode!=='strict'&&readerSessionGrant?.offlineUntilMs>Date.now()){readerSessionGrant.online=false;cloudReady=false;}else{try{localStorage.removeItem(readerSessionKey(cloudUser?.uid||securityLocalOwner));}catch{}readerSessionStop(e.message||'Reader session ended.');}}
 finally{readerSessionBusy=false;}
}
function readerSessionRelease(){
 clearInterval(readerSessionTimer);readerSessionTimer=null;clearTimeout(readerSessionExpiryTimer);readerSessionExpiryTimer=null;
 const grant=readerSessionGrant;readerSessionGrant=null;
 if(readerSessionUnlock){readerSessionUnlock();readerSessionUnlock=null;}
 if(grant&&!grant.exempt&&grant.online&&cloudUser?.uid===grant.uid&&navigator.onLine)securityCall('managePromoHubDevices',{operation:'release',deviceId:grant.deviceId,sessionId:grant.sessionId}).catch(()=>{});
}
function readerSessionReset(){readerSessionEpoch++;readerSessionRelease();}
const readerSessionOpenLocal=openReader;
openReader=function(){
 if((!cloudUser&&!readerSessionPaid())||securityIsAdmin())return readerSessionOpenLocal();
 if(readerSessionBusy)return false;
 const uid=cloudUser?.uid||securityLocalOwner,file=selectedBookFile,epoch=readerSessionEpoch;
 readerSessionBusy=true;
 libraryScreen.style.display='none';readerApp.style.display='flex';
 (async()=>{
  try{
   await readerSessionLock(uid);
   const grant=await readerSessionClaim();
   readerSessionGrant=grant;
   if((cloudUser?.uid||securityLocalOwner)!==uid||selectedBookFile!==file||readerSessionEpoch!==epoch){readerSessionRelease();return;}cloudReady=subscriptionCloudAllowed();
   readerSessionWatchExpiry();
   if(readerSessionOpenLocal()===false){readerSessionRelease();readerApp.style.display='none';libraryScreen.style.display='flex';return;}
   clearInterval(readerSessionTimer);readerSessionTimer=setInterval(readerSessionHeartbeat,40000);
  }catch(e){if((cloudUser?.uid||securityLocalOwner)!==uid||readerSessionEpoch!==epoch)return;readerSessionRelease();readerApp.style.display='none';libraryScreen.style.display='flex';readerSessionMessage(e.message||'Unable to confirm reader access.');}
  finally{readerSessionBusy=false;}
 })();
};
backBtn.addEventListener('click',()=>{readerSessionEpoch++;readerSessionRelease();});
window.addEventListener('online',readerSessionHeartbeat);
window.addEventListener('offline',()=>{
 if(rendition&&readerSessionPaid()&&readerSessionGrant?.readingAccessMode==='strict')readerSessionStop('Strict online mode requires an internet connection. Reconnect to resume from your saved position.');
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')readerSessionHeartbeat();});
// A matching press and click on the actual backdrop closes the profile, not a drag from the card.
let profileBackdropPressed=false;
accountPanel.addEventListener('pointerdown',e=>{profileBackdropPressed=e.target===accountPanel;});
accountPanel.addEventListener('pointercancel',()=>{profileBackdropPressed=false;});
accountPanel.addEventListener('click',e=>{if(e.target===accountPanel&&(profileBackdropPressed||e.detail===0))document.getElementById('accountClose').click();profileBackdropPressed=false;});
async function readerDevicesRefresh(){
 const status=document.getElementById('readerDevicesStatus'),list=document.getElementById('readerDevicesList'),uid=cloudUser?.uid,epoch=readerSessionEpoch;
 if(!uid){status.textContent='Sign in to manage registered devices.';list.replaceChildren();return;}
 status.textContent='Loading devices…';
 try{
  const result=await securityCall('managePromoHubDevices',{operation:'list'});
  if(cloudUser?.uid!==uid||epoch!==readerSessionEpoch)return;
  list.replaceChildren();const access=result.readingAccessMode==='strict'?'Strict online, internet required':'Offline allowed, up to 24 hours';status.textContent=result.exempt?'Administrator access is exempt from these limits.':`${access} · ${result.devices.length} of 2 registrations · 1 online reading session`;
  for(const d of result.devices){
   const row=document.createElement('article');row.className='securityRecord';
   const name=document.createElement('p');name.textContent=d.label+(d.id===readerDeviceId()?' · This browser':'')+(d.active?' · Reading now':'');row.append(name);
   const remove=document.createElement('button');remove.textContent='Remove device';remove.onclick=()=>securityWork(async()=>{
    if(!confirm('Remove this browser/PWA registration? Its next online access check will end reading.'))return;
    await securityCall('managePromoHubDevices',{operation:'remove',deviceId:d.id});
    if(cloudUser?.uid!==uid)return;
    if(d.id===readerDeviceId()){localStorage.removeItem(readerSessionKey(uid));if(rendition)readerSessionStop('This device was removed. Open a book online to register again.');}
    await readerDevicesRefresh();
   });row.append(remove);list.append(row);
  }
 }catch(e){if(cloudUser?.uid===uid){status.textContent=e.message||'Unable to load devices.';}}
}
document.getElementById('readerDevicesRefresh').addEventListener('click',readerDevicesRefresh);
