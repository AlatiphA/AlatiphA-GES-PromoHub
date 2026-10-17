/* Background Auth cannot discard a valid offline reading scope. */
let securityGuestChosen=false,securityOfflineDeferred=false,securityExplicitSignOut=false;
try{securityGuestChosen=sessionStorage.getItem('ges-promohub-guest-choice')==='true';}catch{}
function securityChooseGuest(){
 securityGuestChosen=true;
 try{sessionStorage.setItem('ges-promohub-guest-choice','true');}catch{}
 securityAuthChanged(null,true);
 if(cloudAuth)cloudAuth.signOut().catch(e=>console.warn('Guest sign-out:',e));
}
function securityPrepareSignOut(){securityClearAdminReading();if(window.PromoHubPush)window.PromoHubPush.pause();securityEndGuestChoice();securityExplicitSignOut=true;}
/* This receipt permits local reading only. It never restores administrative claims. */
function securityClearAdminReading(){
 if(!securityLocalOwner)return;
 try{localStorage.removeItem('ges-promohub-admin-reader-'+securityLocalOwner);}catch{}
}
function securityCacheAdminReading(user,claims,profile){
 if(securityExplicitSignOut||securityGuestChosen||!user?.uid||user.uid!==securityLocalOwner)return false;
 const key='ges-promohub-admin-reader-'+user.uid;
 try{
  if(!user.emailVerified||claims?.promohubAdmin!==true||profile?.accountStatus!=='active'){localStorage.removeItem(key);return false;}
  // Save independently of the reader module; verify durable storage before reporting readiness.
  let deviceId=localStorage.getItem('ges-promohub-device-id');
  if(!/^[a-f0-9]{32}$/.test(deviceId||'')){
   const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
   deviceId=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
   localStorage.setItem('ges-promohub-device-id',deviceId);
  }
  const receipt=JSON.stringify({uid:user.uid,deviceId,verifiedAtMs:Date.now()});
  localStorage.setItem(key,receipt);
  return localStorage.getItem(key)===receipt&&localStorage.getItem('ges-promohub-device-id')===deviceId;
 }catch(error){console.warn('Offline administrator reading record could not be saved:',error?.message||'Storage unavailable');return false;}
}
function securityOfflineAdminReading(){
 if(!securityLocalOwner||securityGuestChosen||cloudUser&&(cloudUser.uid!==securityLocalOwner||!cloudUser.emailVerified))return false;
 if(securityProfile&&securityProfile.accountStatus!=='active')return false;
 /* A completed online account check supersedes every cached reading receipt. */
 if(securityProfile&&!securityOfflineDeferred)return securityIsAdmin();
 try{
  const receipt=JSON.parse(localStorage.getItem('ges-promohub-admin-reader-'+securityLocalOwner));
  return receipt?.uid===securityLocalOwner&&/^[a-f0-9]{32}$/.test(receipt.deviceId||'')&&receipt.deviceId===localStorage.getItem('ges-promohub-device-id')&&Number.isFinite(receipt.verifiedAtMs)&&receipt.verifiedAtMs>0&&receipt.verifiedAtMs<=Date.now();
 }catch{return false;}
}
function securityOfflineStatusRender(){
 if(!securityOfflineDeferred)return;
 const p=subscriptionCachedProfile(),admin=securityOfflineAdminReading();
 document.getElementById('accountType').textContent=admin?'Administrator reading access · offline':subscriptionPaid(p)?'Paid subscription · offline · expires '+subscriptionDate(p.subscriptionEndsAtMs):subscriptionLegacy(p)?'Existing Premium access · offline':'Local reading access · offline';
 document.getElementById('accountPanel')?.classList?.remove('profileRefreshing');
}
function securityOfflineReadingAllowed(){
 if(securityOfflineAdminReading())return true;
 if(!securityLocalOwner)return securityGuestChosen && subscriptionReadable();
 const p=securityProfile || subscriptionCachedProfile();
 if(!p || p.accountStatus!=='active')return false;
 if(!subscriptionPaid(p) && !subscriptionLegacy(p))return Number(p.trialEndsAtMs)>Date.now();
 if(p.readingAccessMode!=='offline')return false;
 try{
  const g=JSON.parse(localStorage.getItem('ges-promohub-reader-grant-'+securityLocalOwner));
  return g?.uid===securityLocalOwner && g.readingAccessMode==='offline' && g.deviceId===localStorage.getItem('ges-promohub-device-id') && /^[a-f0-9]{32}$/.test(g.deviceId||'') && Number.isFinite(g.offlineUntilMs) && g.offlineUntilMs>Date.now();
 }catch{return false;}
}
function securityEndGuestChoice(){securityGuestChosen=false;try{sessionStorage.removeItem('ges-promohub-guest-choice');}catch{}}
let securityLocalOwner=localStorage.getItem('ges-promohub-security-owner') || '';
function securityLocalSuffix(){return securityLocalOwner ? '-user-'+securityLocalOwner : '';}
function securitySwitchLocal(user){
 const next=user?.uid || '';
 if(securityLocalOwner!==next){
  if(rendition)backBtn.click();
  localStorage.setItem('ges-promohub-account-prefs-'+(securityLocalOwner || 'guest'),JSON.stringify(localPreferences()));
  securityLocalOwner=next;
  if(next)localStorage.setItem('ges-promohub-security-owner',next);else localStorage.removeItem('ges-promohub-security-owner');
  let p={fontSize:100,fontFamily:'serif',theme:'dark',libraryTheme:'dark',updatedAtMs:0};
  try{p=JSON.parse(localStorage.getItem('ges-promohub-account-prefs-'+(next || 'guest'))) || p;}catch(e){console.warn(e);}
  fontSize=p.fontSize;fontFamily=p.fontFamily;
  for(const k of ['fontSize','fontFamily'])localStorage.setItem(k,String(p[k]));
  localStorage.setItem('reader-theme',p.theme);localStorage.setItem('library-theme',p.libraryTheme);localStorage.setItem('ges-promohub-pref-updated',String(p.updatedAtMs || 0));
  applyLibraryDayNight();
 }
 if(next && !localStorage.getItem('ges-promohub-migrated-'+next)){
  if(confirm('Copy existing device reading progress and bookmarks into this account? Original local data will be retained.')){
   for(const b of BOOKS){
    const id=b.file.replace(/^\.\/library\//,'').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();
    for(const key of [READER_DATA_KEY+'-'+id,'ges-promohub-bookmarks-'+b.file]){
     const old=localStorage.getItem(key);if(old && !localStorage.getItem(key+securityLocalSuffix()))localStorage.setItem(key+securityLocalSuffix(),old);
    }
   }
  }
  localStorage.setItem('ges-promohub-migrated-'+next,'true');
 }
}
/* Integrates account security into the existing v1.6.0 profile panel. */
let securityProfile=null,securityClaims={},securityEpoch=0,securityStop=null,securityRegistering=false;
function securityMessage(text){document.getElementById('securityMessage').textContent=text;}
async function securityCall(name,data={}){return (await firebase.app().functions('us-central1').httpsCallable(name)(data)).data;}
async function securityWork(work){try{await work();}catch(e){securityMessage(e.message || 'Operation failed.');}}
function securityRender(){
 if(securityProfile)document.getElementById('accountPanel')?.classList?.remove('profileRefreshing');
 if(typeof window!=='undefined'&&window.PromoHubPush)window.PromoHubPush.update();
 if(typeof window!=='undefined'&&window.PromoHubSync)window.PromoHubSync.update();
 if(typeof bookmarkLiveUpdate==='function')bookmarkLiveUpdate();
 if(typeof dashboardUpdate==='function')dashboardUpdate();
 document.getElementById('accountName').textContent=securityProfile?.displayName || cloudUser?.displayName || cloudUser?.email || 'PromoHub user';
 document.getElementById('accountType').textContent=cloudUser?.emailVerified ? (securityProfile ? `${securityProfile.accountTier || 'free'} · ${securityProfile.accountStatus || 'connecting'}` : 'Account details updating…') : 'Email verification required';
 const administrationLink=document.getElementById('administrationLink');if(administrationLink)administrationLink.hidden=!securityIsAdmin();
 if(!securityIsAdmin())securityResetAdmin();
 const verification=document.getElementById('securityVerification');if(verification)verification.hidden=!!cloudUser?.emailVerified;
 subscriptionRender();if(typeof readerModeRender==='function')readerModeRender();if(typeof window!=='undefined'&&window.PromoHubDeviceList)window.PromoHubDeviceList.start();if(typeof accountSecurityRender==='function')accountSecurityRender();
 if(document.activeElement!==document.getElementById('securityName'))document.getElementById('securityName').value=securityProfile?.displayName || cloudUser?.displayName || '';
}
let securityActivationPending=null;
function securityActivate(user){
 const attempt={uid:user?.uid};attempt.promise=securityActivateCore(user);securityActivationPending=attempt;
 attempt.promise.finally(()=>{if(securityActivationPending===attempt)securityActivationPending=null;}).catch(()=>{});
 return attempt.promise;
}
async function securityActivateCore(user){
 const epoch=securityEpoch;
 cloudReady=false;if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();if(!user?.emailVerified){securityProfile=null;securityRender();securityMessage('Verify your email, then select Check verification.');return false;}
 const claims=(await user.getIdTokenResult()).claims;
 if(epoch!==securityEpoch)return false;
 const profile=await securityCall('initializePromoHubAccount');
 if(epoch!==securityEpoch)return false;
 securityClaims=claims;securityProfile=profile;
 securityCacheAdminReading(user,claims,profile);
 cloudReady=subscriptionCloudAllowed();securityRender();
 if(securityStop)securityStop();
 securityStop=cloudDb.doc(`users/${user.uid}`).onSnapshot(s=>{if(epoch!==securityEpoch)return;securityProfile=s.data();securityCacheAdminReading(user,securityClaims,securityProfile);const wasReady=cloudReady;cloudReady=subscriptionCloudAllowed();securityRender();if(!wasReady && cloudReady)securityWork(async()=>{if(epoch!==securityEpoch)return;await mergePreferencesFromCloud();await syncCurrentBookCloud();});if(!cloudReady)securityMessage('Cloud syncing is paused in Offline mode, during trial or after expiry. Local reading data is retained.');},e=>{cloudReady=false;if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();securityMessage(e.message);});
 return cloudReady;
}
async function securityAuthChanged(user,explicit=false){
 explicit=explicit || securityExplicitSignOut;securityExplicitSignOut=false;
 if(user && !explicit && securityGuestChosen && !cloudUser && !securityLocalOwner)return;
 if(!explicit && !user && !cloudUser && !securityLocalOwner && securityGuestChosen && subscriptionReadable()){
  /* A repeated null callback must not reset an active guest reader or quiz.
     An explicitly opened sign-in form stays open. */
  resumeReaderAfterStartup();return;
 }
 if(!explicit && typeof navigator!=='undefined' && !navigator.onLine && (!user || user.emailVerified && user.uid===securityLocalOwner) && securityOfflineReadingAllowed()){
  if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();
  securityOfflineDeferred=true;securityEpoch++;cloudReady=false;cloudUser=user || null;
  if(typeof updateAccountUI==='function')updateAccountUI(cloudUser);
  if(!user)securityClaims={};
  clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);
  if(securityStop){securityStop();securityStop=null;}
  if(typeof readerSessionGrant!=='undefined' && readerSessionGrant)readerSessionGrant.online=false;
  if(typeof subscriptionSidebarRender==='function')subscriptionSidebarRender();
  securityOfflineStatusRender();
  hideAuth();resumeReaderAfterStartup();return;
 }
 securityOfflineDeferred=false;
 if(window.PromoHubPush)window.PromoHubPush.pause();
 if(typeof bookmarkLiveStop==='function')bookmarkLiveStop();

 if(typeof quizReset==='function')quizReset();
 securityMessage('');
 if(window.PromoHubInbox)window.PromoHubInbox.reset();
 if(typeof readerSessionReset==='function')readerSessionReset();
 securityEpoch++;securityResetAdmin();subscriptionResetPayment();if(typeof accountSecurityReset==='function')accountSecurityReset();clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);if(securityStop){securityStop();securityStop=null;}
 securitySwitchLocal(user);
 cloudUser=user || null;cloudReady=false;securityProfile=null;securityClaims={};
 if(typeof updateAccountUI==='function')updateAccountUI(cloudUser);
 subscriptionSidebarRender();
 if(typeof dashboardReset==='function')dashboardReset();
 if(!user){accountPanel.classList.remove('open');if(securityGuestChosen && subscriptionReadable())hideAuth();else showAuth();if(resumeReaderAfterStartup())hideAuth();return;}
 securityEndGuestChoice();
 hideAuth();if(securityRegistering)return;
 const authEpoch=securityEpoch;
 if(window.PromoHubInbox)window.PromoHubInbox.prepare(user);
 resumeReaderAfterStartup();
 try{const ready=await securityActivate(user);if(authEpoch!==securityEpoch)return;if(window.PromoHubInbox)window.PromoHubInbox.start(user);updateAccountUI(user);if(authEpoch!==securityEpoch)return;securityRender();securityWork(subscriptionMyPayment);if(ready){await mergePreferencesFromCloud();await syncCurrentBookCloud();}else if(!subscriptionReadable())accountPanel.classList.add('open');}
 catch(e){if(authEpoch!==securityEpoch)return;if(!/^(functions\/)?(permission-denied|unauthenticated)$/.test(String(e?.code||'')) && typeof navigator!=='undefined' && (!navigator.onLine || typeof readerSessionTransient==='function'&&readerSessionTransient(e)) && securityOfflineReadingAllowed()){securityOfflineDeferred=true;cloudReady=false;securityOfflineStatusRender();hideAuth();return;}if(/^(functions\/)?(permission-denied|unauthenticated)$/.test(String(e?.code||''))){securityClearAdminReading();try{localStorage.removeItem('ges-promohub-reader-grant-'+user.uid);}catch{}}if(window.PromoHubInbox)window.PromoHubInbox.start(user);cloudReady=false;if(typeof readerSessionTransient!=='function'||!readerSessionTransient(e))accountPanel.classList.add('open');securityMessage(e.message);securityRender();}
}
function securityIsAdmin(){return cloudUser?.emailVerified===true && securityClaims.promohubAdmin===true && securityProfile?.accountStatus==='active';}
function securitySelectTab(){const panel=document.getElementById('myAccountPanel');if(panel)panel.hidden=false;}
function securityResetAdmin(){securitySelectTab();}
const securityActions={
 resend:async()=>{await cloudUser.sendEmailVerification();securityMessage('Verification email sent.');},
 check:async()=>{await cloudUser.reload();await cloudUser.getIdToken(true);await securityAuthChanged(cloudAuth.currentUser);},
 premium:async()=>{await securityCall('requestPremiumAccess');securityMessage('Premium request submitted.');},
 name:async()=>{await cloudDb.doc(`users/${cloudUser.uid}`).update({displayName:document.getElementById('securityName').value.trim().slice(0,100),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});securityMessage('Name updated.');},
 delete:async()=>{document.getElementById('securityDeletion').hidden=false;securityMessage('Deletion removes your cloud account and reader data. Local copies and audit records remain.');},
 confirmDelete:async()=>{
 if(document.getElementById('securityDeleteConfirm').value!=='DELETE')throw new Error('Type DELETE to confirm.');
 if(cloudUser.providerData.some(p=>p.providerId==='password'))await cloudUser.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(cloudUser.email,document.getElementById('securityPassword').value));
 else await cloudUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
 await cloudUser.getIdToken(true);await securityCall('deletePromoHubAccount',{confirmation:'DELETE'});await cloudAuth.signOut();document.getElementById('securityPassword').value='';
 }
};
document.getElementById('securityControls').addEventListener('click',e=>{const a=e.target.closest('[data-security]')?.dataset.security;if(a)securityWork(securityActions[a]);});
document.getElementById('authResetBtn').onclick=async()=>{try{await cloudAuth.sendPasswordResetEmail(authEmail.value.trim());authError.textContent='If the account exists, a password reset email will be sent.';}catch(e){authError.textContent=e.message;}};

if(typeof window!=='undefined' && window.addEventListener)window.addEventListener('online',()=>{if(securityOfflineDeferred && cloudAuth)securityWork(()=>securityAuthChanged(cloudAuth.currentUser));});
