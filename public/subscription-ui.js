/* Paid subscription metadata is authoritative on the server; guest trial is device-local. */
function subscriptionResetPayment(){for(const id of ['subscriptionRenewBtn','subscriptionExpiryReminder']){const element=document.getElementById(id);if(element){element.hidden=true;if(id==='subscriptionExpiryReminder')element.textContent='';}}document.getElementById('subscriptionRequestStatus').textContent='';document.getElementById('subscriptionReference').value='';document.getElementById('securityPremiumButton').disabled=false;}
const subscriptionMemory=new Map();
function subscriptionLocalRead(key){try{return localStorage.getItem(key);}catch{return subscriptionMemory.get(key)||null;}}
function subscriptionLocalWrite(key,value){subscriptionMemory.set(key,value);try{localStorage.setItem(key,value);}catch{}}
const subscriptionPlans={m1:{months:1,price:20,label:'1 month'},m3:{months:3,price:50,label:'3 months'},m6:{months:6,price:80,label:'6 months'},m12:{months:12,price:100,label:'12 months'}};
const subscriptionTrialMs=7*24*60*60*1000;
function subscriptionLegacy(p){return p?.subscriptionSchema!==1 && p?.securitySchemaVersion===2 && p?.accountTier==='premium';}
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
 if(securityLocalOwner && p)return (p.accountStatus==='active' && (subscriptionPaid(p)||subscriptionLegacy(p)||Number(p.trialEndsAtMs)>Date.now()));
 const trialKey='ges-promohub-guest-trial-start'+(securityLocalOwner?'-'+securityLocalOwner:'');
 let start=Number(subscriptionLocalRead(trialKey));
 if(!start){start=Date.now();subscriptionLocalWrite(trialKey,String(start));}
 return Date.now()<start+subscriptionTrialMs;
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
 const status=document.getElementById('sidebarSubscriptionStatus'),button=document.getElementById('sidebarSubscriptionButton'),hint=document.getElementById('sidebarSubscriptionHint');
 if(!status || !button || !hint)return;
 const p=securityProfile || subscriptionCachedProfile();
 button.hidden=false;button.textContent='View plans';hint.textContent='Paid plans include cloud saving and device syncing.';
 if(securityIsAdmin()){status.textContent='Administrator access';button.hidden=true;hint.textContent='Full access. No subscription purchase required.';return;}
 if(cloudUser && !cloudUser.emailVerified){status.textContent='Email verification required';return;}
 if(p?.accountStatus && p.accountStatus!=='active'){status.textContent='Account inactive';button.textContent='My Account';return;}
 if(subscriptionLegacy(p)){status.textContent='Existing Premium access';button.textContent='My Account';return;}
 if(subscriptionPaid(p)){status.textContent=`Subscribed · ${subscriptionRemaining(p.subscriptionEndsAtMs)} · expires ${subscriptionDate(p.subscriptionEndsAtMs)}`;button.textContent='Renew subscription';return;}
 if(p){status.textContent=Number(p.trialEndsAtMs)>Date.now()?`Free trial · ends ${subscriptionDate(p.trialEndsAtMs)} · device only`:'Trial/subscription expired';return;}
 if(cloudUser || securityLocalOwner){status.textContent='Checking account access...';return;}
 subscriptionReadable();
 const start=Number(subscriptionLocalRead('ges-promohub-guest-trial-start'));
 status.textContent=Date.now()<start+subscriptionTrialMs?`Guest trial · ends ${subscriptionDate(start+subscriptionTrialMs)} · device only`:'Guest trial expired';
 button.textContent='Sign in / View plans';
}
function subscriptionRender(){
 if(typeof window!=='undefined'&&window.PromoHubSync)window.PromoHubSync.update();
 if(typeof bookmarkLiveUpdate==='function')bookmarkLiveUpdate();
 subscriptionSidebarRender();
 const p=securityProfile,renewButton=document.getElementById('subscriptionRenewBtn'),reminder=document.getElementById('subscriptionExpiryReminder');
 const dated=!!p && p.subscriptionSchema===1 && p.accountTier==='premium' && Number(p.subscriptionEndsAtMs)>0 && Number.isFinite(Number(p.subscriptionEndsAtMs));
 const renew=dated && p.accountStatus==='active' && !securityIsAdmin();
 if(renewButton)renewButton.hidden=!renew;
 if(reminder){reminder.hidden=!renew || Number(p.subscriptionEndsAtMs)>Date.now()+7*86400000;reminder.textContent=renew?(subscriptionPaid(p)?subscriptionRemaining(p.subscriptionEndsAtMs)+'. Renew early to extend your current expiry.':'Your paid subscription has expired. Renew to restore reading access.') : '';}
 if(!p||!cloudUser?.uid)return;
 subscriptionLocalWrite('ges-promohub-subscription-'+cloudUser.uid,JSON.stringify(p));
 // Repair a missing receipt whenever a verified online administrator is rendered.
 const adminReadingReady=typeof securityCacheAdminReading==='function'&&typeof securityOfflineDeferred!=='undefined'&&!securityOfflineDeferred&&navigator.onLine!==false&&securityIsAdmin()?securityCacheAdminReading(cloudUser,securityClaims,p):null;
 const text=securityIsAdmin()?'Administrator access':subscriptionLegacy(p)?'Existing Premium access':subscriptionPaid(p)?`Paid subscription · ${subscriptionRemaining(p.subscriptionEndsAtMs)} · expires ${subscriptionDate(p.subscriptionEndsAtMs)}`:Number(p.trialEndsAtMs)>Date.now()?`Free trial · ends ${subscriptionDate(p.trialEndsAtMs)} · local reading only`:'Trial/subscription expired · renew to continue';
 document.getElementById('subscriptionStatus').textContent=text;
 const admin=securityIsAdmin(),purchaseControls=document.getElementById('subscriptionPurchaseControls');if(purchaseControls)purchaseControls.hidden=admin;
 document.getElementById('subscriptionHint').textContent=admin?'Full access. No subscription purchase required.'+(adminReadingReady===true?' Offline reading is ready on this device.':adminReadingReady===false?' Offline reading could not be prepared in this browser. Keep the connection on and reopen My Account.':''):'The 7-day free trial saves reading data on this device only. Paid plans enable cloud saving and device syncing.';
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
  else{showAuth();authError.textContent='Your device trial has expired. Sign in or create an account to select a paid plan.';}
  return false;
 }
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
