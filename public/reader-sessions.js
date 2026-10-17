/* Two browser/PWA registrations and one online reader lease per paid account. */
let readerSessionExpiryTimer=null;
let readerSessionGrant=null,readerSessionTimer=null,readerSessionBusy=false,readerSessionEpoch=0,readerSessionUnlock=null;
function readerSessionId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function readerDeviceId(){let id=localStorage.getItem('ges-promohub-device-id');if(!/^[a-f0-9]{32}$/.test(id||'')){id=readerSessionId();localStorage.setItem('ges-promohub-device-id',id);}return id;}
let readerBrowserSessionId;
try {readerBrowserSessionId=navigator.locks ? sessionStorage.getItem('ges-promohub-reader-session') : null;if(!/^[a-f0-9]{32}$/.test(readerBrowserSessionId||'')){readerBrowserSessionId=readerSessionId();sessionStorage.setItem('ges-promohub-reader-session',readerBrowserSessionId);}} catch {readerBrowserSessionId=readerSessionId();}
function readerSessionKey(uid){return 'ges-promohub-reader-grant-'+uid;}
function readerSessionPaid(){const p=securityProfile||subscriptionCachedProfile();return !!(cloudUser||securityLocalOwner)&&!securityIsAdmin()&&(subscriptionPaid(p)||subscriptionLegacy(p));}
function readerSessionCloudAllowed(){return !readerSessionPaid()||!!(securityProfile?.readingAccessMode!=='offline'&&readerSessionGrant&&readerSessionGrant.uid===cloudUser?.uid&&readerSessionGrant.readingAccessMode!=='offline'&&readerSessionGrant.online&&readerSessionGrant.expiresAtMs>Date.now());}
function readerSessionMessage(message,error){if(window.PromoHubReaderRecovery){window.PromoHubReaderRecovery.show(message,error);return;}securitySelectTab('account');securityMessage(message);accountPanel.classList.add('open');const status=document.getElementById('readerDevicesStatus');if(status)status.textContent=message;}
function readerSessionStop(message){if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();persistCurrentReaderPosition();if(rendition)backBtn.click();readerSessionGrant=null;cloudReady=false;readerSessionMessage(message);}
async function readerSessionLock(uid){
 if(!navigator.locks)return;
 await new Promise((resolve,reject)=>navigator.locks.request('promohub-reader-'+uid,{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error('This account already has a reader open in another tab. Close it first.'));return;}
  await new Promise(unlock=>{readerSessionUnlock=unlock;resolve();});
 }).catch(reject));
}
function readerSessionTransient(error){return /^(functions\/)?(unavailable|deadline-exceeded)$/.test(String(error?.code||''))||/^(auth\/)?network-request-failed$/.test(String(error?.code||''))||/network error|failed to fetch|network request failed/i.test(String(error?.message||''));}
function readerSessionSavedGrant(uid,deviceId){
 const p=securityProfile||subscriptionCachedProfile();
 if(!p||p.accountStatus&&p.accountStatus!=='active'||p.readingAccessMode==='strict'||(!subscriptionPaid(p)&&!subscriptionLegacy(p)))return null;
 let saved;try{saved=JSON.parse(localStorage.getItem(readerSessionKey(uid)));}catch{return null;}
 if(saved?.uid&&saved.uid!==uid||saved?.readingAccessMode!=='offline'||saved?.deviceId!==deviceId||!Number.isFinite(saved?.offlineUntilMs)||saved.offlineUntilMs<=Date.now())return null;
 if(!subscriptionLegacy(p)&&Number.isFinite(Number(p.subscriptionEndsAtMs))&&Number(p.subscriptionEndsAtMs)<=Date.now())return null;
 return {...saved,uid,online:false,offlineUntilMs:!subscriptionLegacy(p)&&Number.isFinite(Number(p.subscriptionEndsAtMs))?Math.min(saved.offlineUntilMs,Number(p.subscriptionEndsAtMs)):saved.offlineUntilMs};
}
async function readerSessionClaim(renew=false){
 const uid=cloudUser?.uid||securityLocalOwner,epoch=readerSessionEpoch;
 if(!uid)return {exempt:true};
 const deviceId=readerDeviceId(),sessionId=readerBrowserSessionId;
 if(!navigator.onLine){
  const p=securityProfile||subscriptionCachedProfile();
  if(!subscriptionPaid(p)&&!subscriptionLegacy(p)){if(typeof subscriptionReadable==='function'&&!subscriptionReadable())throw Error('Your trial or subscription has expired. Open My Account to renew.');return {exempt:true};}
  const saved=readerSessionSavedGrant(uid,deviceId);
  if(!saved)throw new Error('This browser needs one online access check before it can read offline. Connect and tap Retry.');
  return saved;
 }
 if(!cloudUser){const saved=readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw new Error('Your account is still connecting. Wait a moment, then tap Retry.');}
 if(typeof securityActivationPending!=='undefined'&&securityActivationPending?.uid===uid&&!securityProfile){
  let timer;try{await Promise.race([securityActivationPending.promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('Account confirmation is taking longer than expected. Tap Retry to try again.');e.code='functions/deadline-exceeded';reject(e);},12000);})]);}
  catch(e){const saved=epoch===readerSessionEpoch&&cloudUser?.uid===uid&&readerSessionTransient(e)&&readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw e;}finally{clearTimeout(timer);}
  if(epoch!==readerSessionEpoch||cloudUser?.uid!==uid)throw Error('Account changed while opening the reader.');
 }
 let result;try{result=await securityCall('claimPromoHubReaderSession',{deviceId,sessionId,renew,label:(/Android|iPhone|iPad/i.test(navigator.userAgent)?'Mobile':'Computer')+' · '+location.hostname});}catch(e){if(epoch!==readerSessionEpoch||cloudUser?.uid!==uid)throw e;const saved=readerSessionTransient(e)&&readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw e;}
 if(epoch!==readerSessionEpoch||cloudUser?.uid!==uid)throw new Error('Account changed while opening the reader.');
 if(!result.exempt&&securityProfile&&['strict','offline'].includes(result.readingAccessMode)&&securityProfile.readingAccessMode!==result.readingAccessMode){
  securityProfile.readingAccessMode=result.readingAccessMode;
  if(typeof subscriptionRender==='function')subscriptionRender();
  readerModeRender();
 }
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
 try {const grant=await readerSessionClaim(!!readerSessionGrant?.online&&(readerSessionGrant.readingAccessMode==='offline'||readerSessionGrant.expiresAtMs>Date.now()));if(epoch!==readerSessionEpoch)return;readerSessionGrant=grant;readerSessionWatchExpiry();cloudReady=subscriptionCloudAllowed();}
 catch(e){if(epoch!==readerSessionEpoch)return;if(!navigator.onLine&&readerSessionGrant?.readingAccessMode!=='strict'&&readerSessionGrant?.offlineUntilMs>Date.now()){readerSessionGrant.online=false;cloudReady=false;}else{try{if(!readerSessionTransient(e)&&navigator.onLine!==false)localStorage.removeItem(readerSessionKey(cloudUser?.uid||securityLocalOwner));}catch{}readerSessionStop(e.message||'Reader session ended.');}}
 finally{readerSessionBusy=false;}
}
function readerSessionRelease(){
 clearInterval(readerSessionTimer);readerSessionTimer=null;clearTimeout(readerSessionExpiryTimer);readerSessionExpiryTimer=null;
 const grant=readerSessionGrant;readerSessionGrant=null;
 if(readerSessionUnlock){readerSessionUnlock();readerSessionUnlock=null;}
 if(grant&&!grant.exempt&&grant.online&&cloudUser?.uid===grant.uid&&navigator.onLine)securityCall('managePromoHubDevices',{operation:'release',deviceId:grant.deviceId,sessionId:grant.sessionId}).catch(()=>{});
}
function readerSessionReset(){readerSessionEpoch++;readerSessionRelease();if(window.PromoHubReaderRecovery)window.PromoHubReaderRecovery.reset();}
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
  }catch(e){if((cloudUser?.uid||securityLocalOwner)!==uid||readerSessionEpoch!==epoch)return;readerSessionRelease();readerApp.style.display='none';libraryScreen.style.display='flex';readerSessionMessage(e.message||'Unable to confirm reader access.',e);}
  finally{readerSessionBusy=false;}
 })();
};
backBtn.addEventListener('click',()=>{readerSessionEpoch++;readerSessionRelease();});
window.addEventListener('online',readerSessionHeartbeat);
window.addEventListener('offline',()=>{
 if(rendition&&readerSessionPaid()&&readerSessionGrant?.readingAccessMode==='strict')readerSessionStop('Online mode requires an internet connection. Reconnect to resume from your saved position.');
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
  list.replaceChildren();const access=result.readingAccessMode==='strict'?'Online mode, internet required':'Offline mode, local saving until subscription expiry';status.textContent=result.exempt?'Administrator access is exempt from these limits.':`${access} · ${result.devices.length} of 2 registrations · 1 online reading session`;
  for(const d of result.devices){
   const row=document.createElement('article');row.className='securityRecord';
   const name=document.createElement('p');name.textContent=d.label+(d.id===readerDeviceId()?' · This browser':'')+(d.active?' · Reading now':'');row.append(name);
   const remove=document.createElement('button');remove.textContent='Remove device';remove.onclick=()=>securityWork(async()=>{
    if(!confirm('Remove this browser/PWA registration? Its next online access check will end reading.'))return;
    const finished=async()=>{
     if(cloudUser?.uid!==uid||epoch!==readerSessionEpoch)return;
     if(d.id===readerDeviceId()){localStorage.removeItem(readerSessionKey(uid));if(rendition)readerSessionStop('This device was removed. Open a book online to register again.');}
     await readerDevicesRefresh();
    };
    if(window.PromoHubReaderRecovery?.manageDevice){window.PromoHubReaderRecovery.manageDevice(d.id,name.textContent,finished);return;}
    try{await securityCall('managePromoHubDevices',{operation:'remove',deviceId:d.id});await finished();}
    catch(e){if(cloudUser?.uid===uid)status.textContent=e.message||'Unable to remove this registration.';}
   });row.append(remove);list.append(row);
  }
 }catch(e){if(cloudUser?.uid===uid){status.textContent=e.message||'Unable to load devices.';}}
}
document.getElementById('readerDevicesRefresh').addEventListener('click',readerDevicesRefresh);

function readerModeRender(){
 const select=document.getElementById('myReadingMode'),button=document.getElementById('myReadingModeSave');
 if(!select||!button)return;
 select.value=securityProfile?.readingAccessMode==='offline'?'offline':'strict';
 select.disabled=button.disabled=!cloudUser?.emailVerified||securityIsAdmin();
}
async function readerModeSave(){
 const uid=cloudUser?.uid,epoch=securityEpoch,select=document.getElementById('myReadingMode'),button=document.getElementById('myReadingModeSave');
 if(!uid||!navigator.onLine){securityMessage('Connect to the internet to change reading mode.');return;}
 if(readerSessionBusy){securityMessage('Wait for the current reader access check, then try again.');return;}
 const mode=select.value;button.disabled=true;
 try{
  await securityCall('setMyPromoHubReadingMode',{mode});
  if(cloudUser?.uid!==uid||securityEpoch!==epoch)return;
  const reopen=!!rendition;
  if(reopen){persistCurrentReaderPosition();backBtn.click();}else readerSessionReset();
  localStorage.removeItem(readerSessionKey(uid));
  if(securityProfile)securityProfile.readingAccessMode=mode;
  if(typeof subscriptionRender==='function')subscriptionRender();
  cloudReady=false;readerModeRender();
  securityMessage(mode==='offline'?'Offline mode selected. Open a book online once to confirm this browser; then read offline until subscription expiry. Cloud syncing is paused.':'Online mode selected. Internet is required while reading.');
  if(reopen)openReader();
 }catch(e){if(cloudUser?.uid===uid&&securityEpoch===epoch)securityMessage(e.message||'Unable to change reading mode.');}
 finally{if(cloudUser?.uid===uid&&securityEpoch===epoch)button.disabled=securityIsAdmin();}
}
document.getElementById('myReadingModeSave').addEventListener('click',()=>securityWork(readerModeSave));
