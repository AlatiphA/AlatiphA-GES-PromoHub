/* Two registrations; PWA/tabs share admission on one online reading device. */
let readerSessionExpiryTimer=null;
let readerSessionLockDone=Promise.resolve(),readerSessionReleaseDone=Promise.resolve();
let readerSessionGrant=null,readerSessionTimer=null,readerSessionBusy=false,readerSessionEpoch=0,readerSessionUnlock=null;
function readerSessionId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function readerDeviceId(){let id=localStorage.getItem('ges-promohub-device-id');if(!/^[a-f0-9]{32}$/.test(id||'')){id=readerSessionId();localStorage.setItem('ges-promohub-device-id',id);}return id;}
// A fresh window token prevents a cloned tab from sharing a release token.
const readerBrowserSessionId=readerSessionId();
function readerSessionKey(uid){return 'ges-promohub-reader-grant-'+uid;}
function readerSessionPaid(){if(typeof securityOfflineAdminReading==='function'&&securityOfflineAdminReading())return false;const p=securityProfile||subscriptionCachedProfile();return !!(cloudUser||securityLocalOwner)&&!securityIsAdmin()&&(subscriptionPaid(p)||subscriptionLegacy(p));}
function readerSessionCloudAllowed(){return !readerSessionPaid()||!!(readerSessionGrant&&readerSessionGrant.uid===cloudUser?.uid&&readerSessionGrant.readingAccessMode!=='offline'&&navigator.onLine&&readerSessionGrant.online&&readerSessionGrant.expiresAtMs>Date.now());}
function readerSessionMessage(message,error){if(window.PromoHubReaderRecovery){window.PromoHubReaderRecovery.show(message,error);return;}securitySelectTab('account');securityMessage(message);accountPanel.classList.add('open');const status=document.getElementById('readerDevicesStatus');if(status)status.textContent=message;}
function readerSessionStop(message){if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();persistCurrentReaderPosition();backBtn.click();readerSessionGrant=null;cloudReady=false;readerSessionMessage(message);}
async function readerSessionLock(uid){
 // A released lock remains held until the Web Locks callback has settled.
 await readerSessionReleaseDone;
 if(!navigator.locks)return;
 await new Promise((resolve,reject)=>{
  const request=navigator.locks.request('promohub-reader-'+uid+'-'+readerBrowserSessionId,{ifAvailable:true},async lock=>{
  if(!lock){reject(new Error('A reader is already opening in this window. Wait a moment and try again.'));return;}
  await new Promise(unlock=>{readerSessionUnlock=unlock;resolve();});
  });
  readerSessionLockDone=request.catch(()=>{});
  request.catch(reject);
 });
}
function readerSessionTransient(error){return /^(functions\/)?(unavailable|deadline-exceeded|internal|cancelled)$/.test(String(error?.code||''))||/^(auth\/)?network-request-failed$/.test(String(error?.code||''))||/network error|failed to fetch|network request failed/i.test(String(error?.message||''));}
function readerSessionSavedGrant(uid,deviceId){
 const p=securityProfile||subscriptionCachedProfile();
 if(!p||p.accountStatus&&p.accountStatus!=='active'||(!subscriptionPaid(p)&&!subscriptionLegacy(p)))return null;
 let saved;try{saved=JSON.parse(localStorage.getItem(readerSessionKey(uid)));}catch{return null;}
 if(saved?.uid&&saved.uid!==uid||!['auto','offline'].includes(saved?.readingAccessMode)||saved?.deviceId!==deviceId||!Number.isFinite(saved?.offlineUntilMs)||saved.offlineUntilMs<=Date.now())return null;
 if(!subscriptionLegacy(p)&&Number.isFinite(Number(p.subscriptionEndsAtMs))&&Number(p.subscriptionEndsAtMs)<=Date.now())return null;
 return {...saved,uid,online:false,offlineUntilMs:!subscriptionLegacy(p)&&Number.isFinite(Number(p.subscriptionEndsAtMs))?Math.min(saved.offlineUntilMs,Number(p.subscriptionEndsAtMs)):saved.offlineUntilMs};
}
async function readerSessionClaim(renew=false){
 const uid=cloudUser?.uid||securityLocalOwner,epoch=readerSessionEpoch;
 if(!uid)return {exempt:true};
 const deviceId=readerDeviceId(),sessionId=readerBrowserSessionId;
 if(!navigator.onLine){
  const p=securityProfile||subscriptionCachedProfile();
  if(!subscriptionPaid(p)&&!subscriptionLegacy(p)){if(typeof subscriptionReadable==='function'&&!subscriptionReadable())throw Error('Your trial or subscription has expired. Open My Account to renew.');return {exempt:true,reason:'trial',offlineUntilMs:Number(p?.trialEndsAtMs)};}
  const saved=readerSessionSavedGrant(uid,deviceId);
  if(!saved)throw new Error('This browser needs one online access check before it can read offline. Connect and tap Retry.');
  return saved;
 }
 if(!cloudUser){const saved=readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw new Error('Your account is still connecting. Wait a moment, then tap Retry.');}
 if(typeof securityActivationPending!=='undefined'&&securityActivationPending?.uid===uid&&!securityProfile){
  let timer;try{await Promise.race([securityActivationPending.promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('Account confirmation is taking longer than expected. Tap Retry to try again.');e.code='functions/deadline-exceeded';reject(e);},12000);})]);}
  catch(e){const saved=epoch===readerSessionEpoch&&cloudUser?.uid===uid&&readerSessionTransient(e)&&readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw e;}finally{clearTimeout(timer);}
  if(epoch!==readerSessionEpoch||(cloudUser?.uid||securityLocalOwner)!==uid)throw Error('Account changed while opening the reader.');
 }
 let result;try{result=await securityCall('claimPromoHubReaderSession',{deviceId,sessionId,renew,resume:!!readerSessionSavedGrant(uid,deviceId),label:(/Android|iPhone|iPad/i.test(navigator.userAgent)?'Mobile':'Computer')+' · '+location.hostname});}catch(e){if(epoch!==readerSessionEpoch||(cloudUser?.uid||securityLocalOwner)!==uid)throw e;if(!readerSessionTransient(e)){try{localStorage.removeItem(readerSessionKey(uid));}catch{}throw e;}const saved=readerSessionSavedGrant(uid,deviceId);if(saved)return saved;throw e;}
 if(epoch!==readerSessionEpoch||(cloudUser?.uid||securityLocalOwner)!==uid)throw new Error('Account changed while opening the reader.');
 if(!result.exempt&&securityProfile&&['auto','strict','offline'].includes(result.readingAccessMode)&&securityProfile.readingAccessMode!==result.readingAccessMode){
  securityProfile.readingAccessMode=result.readingAccessMode;
  if(typeof subscriptionRender==='function')subscriptionRender();
  readerModeRender();
 }
 const grant={...result,deviceId,sessionId,uid,online:navigator.onLine!==false};
 if(!result.exempt){try{localStorage.setItem(readerSessionKey(uid),JSON.stringify(grant));}catch{}}
 return grant;
}
function readerSessionStateChanged(){
 const wasReady=cloudReady;cloudReady=subscriptionCloudAllowed();
 if(!wasReady&&cloudReady&&window.PromoHubSync?.retry)window.PromoHubSync.retry();
 if(typeof bookmarkLiveUpdate==='function')bookmarkLiveUpdate();
 if(window.PromoHubSync)window.PromoHubSync.update();
 if(typeof dashboardUpdate==='function')dashboardUpdate();
}
function readerSessionUseOffline(){
 const uid=cloudUser?.uid||securityLocalOwner;
 const saved=uid&&readerSessionSavedGrant(uid,readerDeviceId());
 if(!saved)return false;
 readerSessionGrant=saved;readerSessionWatchExpiry();readerSessionStateChanged();return true;
}
function readerSessionWatchExpiry(){
 clearTimeout(readerSessionExpiryTimer);readerSessionExpiryTimer=null;
 const grant=readerSessionGrant;if(!grant)return;
 const deadline=grant.readingAccessMode==='strict'?grant.expiresAtMs:
  grant.online&&!grant.exempt?Math.min(grant.expiresAtMs,grant.offlineUntilMs):grant.offlineUntilMs;
 if(!Number.isFinite(deadline)||deadline<=0)return;
 readerSessionExpiryTimer=setTimeout(()=>{
  if(readerSessionGrant!==grant)return;
  if(Date.now()<deadline){readerSessionWatchExpiry();return;}
  if(!grant.exempt&&grant.readingAccessMode!=='strict'&&readerSessionUseOffline())return;
  readerSessionStop('Your saved reading permission has expired. Connect to refresh access or renew your subscription.');
 },Math.min(2147483647,Math.max(0,deadline-Date.now())));
}
async function readerSessionHeartbeat(){
 if(document.visibilityState==='hidden'||typeof document.hasFocus==='function'&&!document.hasFocus())return;
 if(!rendition||!(cloudUser||securityLocalOwner)||readerSessionBusy)return;
 if(readerSessionGrant?.exempt&&!readerSessionPaid()){readerSessionStateChanged();return;}
 readerSessionBusy=true;const epoch=readerSessionEpoch;
 try {const grant=await readerSessionClaim(!!readerSessionGrant?.online&&readerSessionGrant.expiresAtMs>Date.now());if(epoch!==readerSessionEpoch)return;readerSessionGrant=grant;readerSessionWatchExpiry();readerSessionStateChanged();}
 catch(e){if(epoch!==readerSessionEpoch)return;try{if(!readerSessionTransient(e))localStorage.removeItem(readerSessionKey(cloudUser?.uid||securityLocalOwner));}catch{}readerSessionStop(e.message||'Reader session ended.');}
 finally{readerSessionBusy=false;}
}
function readerSessionRelease(){
 clearInterval(readerSessionTimer);readerSessionTimer=null;clearTimeout(readerSessionExpiryTimer);readerSessionExpiryTimer=null;
 const grant=readerSessionGrant;readerSessionGrant=null;
 if(readerSessionUnlock){readerSessionUnlock();readerSessionUnlock=null;}
 const serverRelease=grant&&!grant.exempt&&grant.online&&cloudUser?.uid===grant.uid&&navigator.onLine
  ? securityCall('managePromoHubDevices',{operation:'release',deviceId:grant.deviceId,sessionId:grant.sessionId}).catch(()=>{})
  : Promise.resolve();
 // Finish the old server release before a new claim can reuse this session ID.
 readerSessionReleaseDone=Promise.all([readerSessionReleaseDone,readerSessionLockDone,serverRelease]).then(()=>{});
 return readerSessionReleaseDone;
}
function readerSessionReset(){if(window.PromoHubDeviceList)window.PromoHubDeviceList.stop(true);readerSessionEpoch++;readerSessionRelease();if(window.PromoHubReaderRecovery)window.PromoHubReaderRecovery.reset();}
const readerSessionOpenLocal=openReader;
openReader=function(){
 if(securityIsAdmin()||typeof securityOfflineAdminReading==='function'&&securityOfflineAdminReading())return readerSessionOpenLocal();
 if(!cloudUser&&!readerSessionPaid()){
  const opened=readerSessionOpenLocal(),p=securityProfile||subscriptionCachedProfile();
  const until=Number(p?.trialEndsAtMs)||(!securityLocalOwner&&typeof subscriptionTrialMs!=='undefined'?Number(localStorage.getItem('ges-promohub-guest-trial-start'))+subscriptionTrialMs:0);
  if(opened!==false&&until>0){readerSessionGrant={exempt:true,reason:'trial',offlineUntilMs:until};readerSessionWatchExpiry();}
  return opened;
 }
 if(readerSessionBusy)return false;
 const uid=cloudUser?.uid||securityLocalOwner,file=selectedBookFile,epoch=readerSessionEpoch;
 readerSessionBusy=true;
 libraryScreen.style.display='none';readerApp.style.display='flex';
 (async()=>{
  try{
   await readerSessionLock(uid);
   if((cloudUser?.uid||securityLocalOwner)!==uid||selectedBookFile!==file||readerSessionEpoch!==epoch){readerSessionRelease();return;}
   const grant=await readerSessionClaim();
   readerSessionGrant=grant;
   if((cloudUser?.uid||securityLocalOwner)!==uid||selectedBookFile!==file||readerSessionEpoch!==epoch){readerSessionRelease();return;}
   readerSessionWatchExpiry();readerSessionStateChanged();
   if(readerSessionOpenLocal()===false){readerSessionRelease();readerApp.style.display='none';libraryScreen.style.display='flex';return;}
   clearInterval(readerSessionTimer);readerSessionTimer=setInterval(readerSessionHeartbeat,40000);
  }catch(e){if((cloudUser?.uid||securityLocalOwner)!==uid||readerSessionEpoch!==epoch)return;readerSessionRelease();readerApp.style.display='none';libraryScreen.style.display='flex';readerSessionMessage(e.message||'Unable to confirm reader access.',e);}
  finally{readerSessionBusy=false;}
 })();
};
backBtn.addEventListener('click',()=>{readerSessionEpoch++;readerSessionRelease();});
window.addEventListener('online',()=>{if(!readerSessionPaid())readerSessionStateChanged();return readerSessionHeartbeat();});
window.addEventListener('offline',()=>{
 cloudReady=false;
 if(rendition&&readerSessionPaid()&&!readerSessionUseOffline())readerSessionStop('This browser needs one online access check before it can read offline. Reconnect and tap Retry.');
 if(window.PromoHubSync)window.PromoHubSync.update();
});
function readerSessionForeground(){
 if(document.visibilityState==='hidden')return;
 if(rendition&&typeof loadReaderData==='function'){
  const saved=loadReaderData(),current=typeof currentLocation!=='undefined'?currentLocation?.start?.cfi:null;
  if(typeof saved?.location==='string'&&saved.location.startsWith('epubcfi(')&&saved.location!==current)rendition.display(saved.location).catch(()=>{});
 }
 return readerSessionHeartbeat();
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')readerSessionForeground();});
window.addEventListener('focus',readerSessionForeground);
// A matching press and click on the actual backdrop closes the profile, not a drag from the card.
let profileBackdropPressed=false;
accountPanel.addEventListener('pointerdown',e=>{profileBackdropPressed=e.target===accountPanel;});
accountPanel.addEventListener('pointercancel',()=>{profileBackdropPressed=false;});
accountPanel.addEventListener('click',e=>{if(e.target===accountPanel&&(profileBackdropPressed||e.detail===0))document.getElementById('accountClose').click();profileBackdropPressed=false;});
async function readerDevicesRefresh(){
 const status=document.getElementById('readerDevicesStatus'),list=document.getElementById('readerDevicesList'),uid=cloudUser?.uid,epoch=readerSessionEpoch,revision=window.PromoHubDeviceList?.revision();
 if(!uid){status.textContent='Sign in to manage registered devices.';list.replaceChildren();return;}
 status.textContent='Loading devices…';
 try{
  const result=await securityCall('managePromoHubDevices',{operation:'list'});
  if(cloudUser?.uid!==uid||epoch!==readerSessionEpoch)return;
  if(revision===window.PromoHubDeviceList?.revision())readerDevicesRender(result,uid,epoch);
  if(window.PromoHubDeviceList)window.PromoHubDeviceList.start();
 }catch(e){if(cloudUser?.uid===uid){status.textContent=e.message||'Unable to load devices.';}}
}
function readerDevicesRender(result,uid,epoch){
 if(cloudUser?.uid!==uid||epoch!==readerSessionEpoch)return;
 const status=document.getElementById('readerDevicesStatus'),list=document.getElementById('readerDevicesList');
  list.replaceChildren();const access='Automatic reading';status.textContent=result.exempt?'Administrator access is exempt from these limits.':`${access} · ${result.devices.length} of 2 registrations · 1 online reading device`;
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
}
document.getElementById('readerDevicesRefresh').addEventListener('click',readerDevicesRefresh);

function readerModeRender(){
 const status=document.getElementById('automaticReadingStatus');if(!status)return;
 status.textContent='Reading works automatically with or without internet. Download books and open one while connected to prepare this browser.';
}
