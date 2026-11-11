/* Paid subscription metadata is authoritative on the server; guest trial is device-local. */
function subscriptionResetPayment(){for(const id of ['subscriptionRenewBtn','subscriptionExpiryReminder']){const element=document.getElementById(id);if(element){element.hidden=true;if(id==='subscriptionExpiryReminder')element.textContent='';}}document.getElementById('subscriptionRequestStatus').textContent='';document.getElementById('subscriptionReference').value='';document.getElementById('securityPremiumButton').disabled=false;}
const subscriptionMemory=new Map();
function subscriptionLocalRead(key){try{return localStorage.getItem(key);}catch{return subscriptionMemory.get(key)||null;}}
function subscriptionLocalWrite(key,value){subscriptionMemory.set(key,value);try{localStorage.setItem(key,value);}catch{}}
const subscriptionPlans={m1:{months:1,price:20,label:'1 month'},m3:{months:3,price:50,label:'3 months'},m6:{months:6,price:80,label:'6 months'},m12:{months:12,price:100,label:'12 months'}};
const subscriptionGuestTrialMs=3*24*60*60*1000;
const subscriptionGuestBookFile='./library/mat1.epub';
function subscriptionLegacy(p){return p?.subscriptionSchema!==1 && p?.securitySchemaVersion===2 && p?.accountTier==='premium';}
function subscriptionComplimentary(p){return p?.complimentaryReadingAccess===true;}
function subscriptionPaid(p){return p?.subscriptionSchema===1 && p.accountTier==='premium' && Number(p.subscriptionEndsAtMs)>Date.now();}
function subscriptionCloudAllowed(){return (typeof readerSessionCloudAllowed!=='function'||readerSessionCloudAllowed()) && !!(cloudUser?.emailVerified && securityProfile?.accountStatus==='active' && (securityIsAdmin() || subscriptionPaid(securityProfile) || subscriptionLegacy(securityProfile)));}
function subscriptionCachedProfile(){
 if(!securityLocalOwner)return null;
 try{return JSON.parse(subscriptionLocalRead('ges-promohub-subscription-'+securityLocalOwner));}catch{return null;}
}
function subscriptionReadable(){
 if(typeof securityOfflineAdminReading==='function'&&securityOfflineAdminReading())return true;
 if(cloudUser && securityIsAdmin())return true;
 const p=securityProfile || subscriptionCachedProfile();
 if(securityLocalOwner && p)return (p.accountStatus==='active' && (subscriptionPaid(p)||subscriptionLegacy(p)||subscriptionComplimentary(p)||Number(p.trialEndsAtMs)>Date.now()));
 const trialKey='ges-promohub-guest-trial-start'+(securityLocalOwner?'-'+securityLocalOwner:'');
 let start=Number(subscriptionLocalRead(trialKey));
 if(!start){start=Date.now();subscriptionLocalWrite(trialKey,String(start));}
 return Date.now()<start+subscriptionGuestTrialMs;
}
function subscriptionFullLibraryAccess(){
 if(typeof securityOfflineAdminReading==='function'&&securityOfflineAdminReading())return true;
 if(cloudUser&&typeof securityIsAdmin==='function'&&securityIsAdmin())return true;
 const p=securityProfile||subscriptionCachedProfile();
 return !!(p?.accountStatus==='active'&&(subscriptionPaid(p)||subscriptionLegacy(p)||subscriptionComplimentary(p)));
}
function subscriptionBookAllowed(file){return subscriptionReadable()&&(subscriptionFullLibraryAccess()||file===subscriptionGuestBookFile);}
function subscriptionBookAccessMessage(file){
 if(subscriptionBookAllowed(file))return '';
 if(!subscriptionReadable())return 'Your free reading period has ended. Subscribe to continue reading.';
 return 'Free trial access includes only Model Aptitude Test for GES 1. Subscribe to unlock this book and the rest of the library.';
}
function subscriptionPromptBookAccess(file){
 const message=subscriptionBookAccessMessage(file);if(!message)return false;
 if(cloudUser||securityLocalOwner){openAccount();securitySelectTab('account');securityMessage(message);}
 else{showAuth();authError.textContent=message;}
 return true;
}
function subscriptionRenderBookLocks(){
 if(typeof document.querySelectorAll!=='function')return;
 const readable=subscriptionReadable(),full=subscriptionFullLibraryAccess();
 for(const card of document.querySelectorAll('.bookCard')){
  const file=card.dataset.file,locked=!readable||!full&&file!==subscriptionGuestBookFile;
  card.classList?.toggle('bookLocked',locked);
  const action=card.querySelector('.bookDownloadButton');if(!action)continue;
  if(locked){action.textContent='Locked';action.disabled=true;action.title=subscriptionBookAccessMessage(file);action.setAttribute('aria-label',action.title);}
 }
 window.PromoHubDownloads?.render?.();
}
function subscriptionRemaining(ms,now=Date.now()){
 const left=Number(ms)-now;if(!Number.isFinite(left)||left<=0)return 'Expired';
 if(left<86400000)return 'Less than 1 day remaining';
 const days=Math.ceil(left/86400000);return days+' '+(days===1?'day':'days')+' remaining';
}
function subscriptionRenew(){
 openAccount();if(!cloudUser)return;
 securitySelectTab('account');const section=document.getElementById('profileSubscriptionSettings');if(section)section.open=true;const plan=document.getElementById('subscriptionPlan');plan?.scrollIntoView?.({block:'nearest'});plan?.focus?.();
}
function subscriptionDate(ms){return Number(ms)>0?new Date(Number(ms)).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Not active';}
function subscriptionSidebarRender(){
 subscriptionRenderBookLocks();
 const status=document.getElementById('sidebarSubscriptionStatus'),button=document.getElementById('sidebarSubscriptionButton'),hint=document.getElementById('sidebarSubscriptionHint');
 if(!status || !button || !hint)return;
 const p=securityProfile || subscriptionCachedProfile();
 button.hidden=false;button.textContent='View plans';hint.textContent='Paid plans include cloud saving and device syncing.';
 if(securityIsAdmin()){status.textContent='Administrator access';button.hidden=true;hint.textContent='Full access. No subscription purchase required.';return;}
 if(cloudUser && !cloudUser.emailVerified){status.textContent='Email verification required';return;}
 if(p?.accountStatus && p.accountStatus!=='active'){status.textContent='Account inactive';button.textContent='My Account';return;}
 if(subscriptionLegacy(p)){status.textContent='Existing Premium access';button.textContent='My Account';return;}
 if(subscriptionComplimentary(p)){status.textContent='Complimentary reading access · local only';button.textContent='View plans';hint.textContent='Paid plans include cloud saving and device syncing.';return;}
 if(subscriptionPaid(p)){status.textContent=`Subscribed · ${subscriptionRemaining(p.subscriptionEndsAtMs)} · expires ${subscriptionDate(p.subscriptionEndsAtMs)}`;button.textContent='Renew subscription';return;}
 if(p){status.textContent=Number(p.trialEndsAtMs)>Date.now()?`Free trial · ends ${subscriptionDate(p.trialEndsAtMs)} · device only`:'Trial/subscription expired';return;}
 if(cloudUser || securityLocalOwner){status.textContent='Checking account access...';return;}
 subscriptionReadable();
 const start=Number(subscriptionLocalRead('ges-promohub-guest-trial-start'));
 status.textContent=Date.now()<start+subscriptionGuestTrialMs?`Guest trial · ends ${subscriptionDate(start+subscriptionGuestTrialMs)} · device only`:'Guest trial expired';
 button.textContent='Sign in / View plans';
}
function subscriptionRender(){
 if(typeof window!=='undefined'&&window.PromoHubSync)window.PromoHubSync.update();
 if(typeof bookmarkLiveUpdate==='function')bookmarkLiveUpdate();
 subscriptionSidebarRender();
 const p=securityProfile,renewButton=document.getElementById('subscriptionRenewBtn'),reminder=document.getElementById('subscriptionExpiryReminder');
 const dated=!!p && p.subscriptionSchema===1 && p.accountTier==='premium' && Number(p.subscriptionEndsAtMs)>0 && Number.isFinite(Number(p.subscriptionEndsAtMs));
 const renew=dated && p.accountStatus==='active' && !securityIsAdmin();
 if(renewButton){renewButton.hidden=!renew;renewButton.textContent=subscriptionComplimentary(p)?'View paid plans':'Renew subscription';}
 if(reminder){reminder.hidden=!renew || subscriptionComplimentary(p) || Number(p.subscriptionEndsAtMs)>Date.now()+7*86400000;reminder.textContent=renew?(subscriptionPaid(p)?subscriptionRemaining(p.subscriptionEndsAtMs)+'. Renew early to extend your current expiry.':'Your paid subscription has expired. Renew to restore reading access.') : '';}
 if(!p||!cloudUser?.uid)return;
 subscriptionLocalWrite('ges-promohub-subscription-'+cloudUser.uid,JSON.stringify(p));
 // Repair a missing receipt whenever a verified online administrator is rendered.
 const adminReadingReady=typeof securityCacheAdminReading==='function'&&typeof securityOfflineDeferred!=='undefined'&&!securityOfflineDeferred&&navigator.onLine!==false&&securityIsAdmin()?securityCacheAdminReading(cloudUser,securityClaims,p):null;
 const text=securityIsAdmin()?'Administrator access':subscriptionLegacy(p)?'Existing Premium access':subscriptionComplimentary(p)?'Complimentary reading access · local only':subscriptionPaid(p)?`Paid subscription · ${subscriptionRemaining(p.subscriptionEndsAtMs)} · expires ${subscriptionDate(p.subscriptionEndsAtMs)}`:Number(p.trialEndsAtMs)>Date.now()?`Free trial · ends ${subscriptionDate(p.trialEndsAtMs)} · local reading only`:'Trial/subscription expired · renew to continue';
 document.getElementById('subscriptionStatus').textContent=text;
 const admin=securityIsAdmin(),purchaseControls=document.getElementById('subscriptionPurchaseControls');if(purchaseControls)purchaseControls.hidden=admin;
 document.getElementById('subscriptionHint').textContent=admin?'Full access. No subscription purchase required.'+(adminReadingReady===true?' Reading is ready on this device.':adminReadingReady===false?' Device reading could not be prepared. Keep the connection on and reopen My Account.':''):subscriptionComplimentary(p)?'An administrator granted local reading access. Paid plans enable cloud saving and device syncing.':'Your 7-day account trial includes local reading of Model Aptitude Test for GES 1 only. Paid plans unlock all books; trial reading data stays on this device.';
 document.getElementById('accountType').textContent=text;
 const premium=document.getElementById('securityPremiumButton');premium.textContent='Submit payment for review';
 document.getElementById('subscriptionPaymentDetails').textContent=`Pay GH₵${subscriptionPlans[document.getElementById('subscriptionPlan').value].price} to MTN MoMo 0243443688, Abdul-Latif Ahmed. Then enter the unique MoMo transaction ID from your SMS or receipt below, not the payment description.`;
}
async function subscriptionMyPayment(){
 const epoch=securityEpoch,result=await securityCall('getMyPromoHubPayment');if(epoch!==securityEpoch)return;
 const r=result.request;document.getElementById('subscriptionRequestStatus').textContent=r?`${subscriptionPlans[r.planId]?.label || 'Plan'} · GH₵${r.amountGhs} · ${r.status} · Transaction ID: ${r.reference}`:'No payment submitted yet.';
 document.getElementById('securityPremiumButton').disabled=r?.status==='pending';
}
securityActions.premium=async()=>{
 await securityCall('submitPromoHubPayment',{planId:document.getElementById('subscriptionPlan').value,reference:document.getElementById('subscriptionReference').value.trim()});
 securityMessage('Payment submitted. An administrator will check the MoMo transaction before activating your plan.');await subscriptionMyPayment();
};
securityActions.paymentStatus=subscriptionMyPayment;
document.getElementById('subscriptionPlan').addEventListener('change',subscriptionRender);
const subscriptionOpenReader=openReader;
openReader=function(){
 if(!subscriptionReadable()){
  if(cloudUser){accountPanel.classList.add('open');securitySelectTab('account');securityMessage('Your trial/subscription has expired. Select a plan and submit a payment.');}
  else{showAuth();authError.textContent='Your 3-day guest trial has ended. Sign in to select a paid plan.';}
  return false;
 }
 if(typeof subscriptionBookAllowed==='function'&&!subscriptionBookAllowed(selectedBookFile)){if(typeof subscriptionPromptBookAccess==='function')subscriptionPromptBookAccess(selectedBookFile);return false;}
 return subscriptionOpenReader();
};
function subscriptionCheckExpiry(){
 subscriptionSidebarRender();
 if(securityProfile){const wasReady=cloudReady;cloudReady=subscriptionCloudAllowed();subscriptionRender();if(wasReady&&!cloudReady){clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);}}
 if(!subscriptionReadable() && rendition){persistCurrentReaderPosition();backBtn.click();if(cloudUser){accountPanel.classList.add('open');securitySelectTab('account');}else showAuth();}
}
setInterval(subscriptionCheckExpiry,30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')subscriptionCheckExpiry();});

document.getElementById('subscriptionRenewBtn')?.addEventListener('click',subscriptionRenew);
document.getElementById('sidebarSubscriptionButton')?.addEventListener('click',e=>{
 e.stopPropagation();openAccount();
 if(cloudUser){securitySelectTab('account');document.getElementById('subscriptionStatus')?.scrollIntoView?.({block:'nearest'});}
});
subscriptionSidebarRender();
