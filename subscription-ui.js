/* Paid subscription metadata is authoritative on the server; guest trial is device-local. */
function subscriptionResetPayment(){document.getElementById('subscriptionRequestStatus').textContent='';document.getElementById('subscriptionReference').value='';document.getElementById('securityPremiumButton').disabled=false;}
const subscriptionMemory=new Map();
function subscriptionLocalRead(key){try{return localStorage.getItem(key);}catch{return subscriptionMemory.get(key)||null;}}
function subscriptionLocalWrite(key,value){subscriptionMemory.set(key,value);try{localStorage.setItem(key,value);}catch{}}
const subscriptionPlans={m1:{months:1,price:20,label:'1 month'},m3:{months:3,price:50,label:'3 months'},m6:{months:6,price:80,label:'6 months'},m12:{months:12,price:100,label:'12 months'}};
const subscriptionTrialMs=7*24*60*60*1000;
function subscriptionLegacy(p){return p?.subscriptionSchema!==1 && p?.securitySchemaVersion===2 && p?.accountTier==='premium';}
function subscriptionPaid(p){return p?.subscriptionSchema===1 && p.accountTier==='premium' && Number(p.subscriptionEndsAtMs)>Date.now();}
function subscriptionCloudAllowed(){return !!(cloudUser?.emailVerified && securityProfile?.accountStatus==='active' && (securityIsAdmin() || subscriptionPaid(securityProfile) || subscriptionLegacy(securityProfile)));}
function subscriptionCachedProfile(){
 if(!securityLocalOwner)return null;
 try{return JSON.parse(subscriptionLocalRead('ges-promohub-subscription-'+securityLocalOwner));}catch{return null;}
}
function subscriptionReadable(){
 if(cloudUser && securityIsAdmin())return true;
 const p=securityProfile || subscriptionCachedProfile();
 if(securityLocalOwner && p)return (p.accountStatus==='active' && (subscriptionPaid(p)||subscriptionLegacy(p)||Number(p.trialEndsAtMs)>Date.now()));
 const trialKey='ges-promohub-guest-trial-start'+(securityLocalOwner?'-'+securityLocalOwner:'');
 let start=Number(subscriptionLocalRead(trialKey));
 if(!start){start=Date.now();subscriptionLocalWrite(trialKey,String(start));}
 return Date.now()<start+subscriptionTrialMs;
}
function subscriptionDate(ms){return Number(ms)>0?new Date(Number(ms)).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Not active';}
function subscriptionRender(){
 const p=securityProfile;if(!p)return;
 subscriptionLocalWrite('ges-promohub-subscription-'+cloudUser.uid,JSON.stringify(p));
 const text=securityIsAdmin()?'Administrator access':subscriptionLegacy(p)?'Existing Premium access':subscriptionPaid(p)?`Paid subscription · expires ${subscriptionDate(p.subscriptionEndsAtMs)}`:Number(p.trialEndsAtMs)>Date.now()?`Free trial · ends ${subscriptionDate(p.trialEndsAtMs)} · local reading only`:'Trial/subscription expired · renew to continue';
 document.getElementById('subscriptionStatus').textContent=text;
 document.getElementById('accountType').textContent=text;
 const premium=document.getElementById('securityPremiumButton');premium.textContent='Submit payment for review';
 document.getElementById('subscriptionPaymentDetails').textContent=`Pay GH₵${subscriptionPlans[document.getElementById('subscriptionPlan').value].price} to MTN MoMo 0243443688, Abdul-Latif Ahmed. Then enter the MoMo transaction reference below.`;
}
async function subscriptionMyPayment(){
 const epoch=securityEpoch,result=await securityCall('getMyPromoHubPayment');if(epoch!==securityEpoch)return;
 const r=result.request;document.getElementById('subscriptionRequestStatus').textContent=r?`${subscriptionPlans[r.planId]?.label || 'Plan'} · GH₵${r.amountGhs} · ${r.status} · Reference: ${r.reference}`:'No payment submitted yet.';
 document.getElementById('securityPremiumButton').disabled=r?.status==='pending';
}
securityActions.premium=async()=>{
 await securityCall('submitPromoHubPayment',{planId:document.getElementById('subscriptionPlan').value,reference:document.getElementById('subscriptionReference').value.trim()});
 securityMessage('Payment submitted. An administrator will check the MoMo transaction before activating your plan.');await subscriptionMyPayment();
};
securityActions.paymentStatus=subscriptionMyPayment;
securityActions.payments=()=>subscriptionAdminPayments();
document.getElementById('subscriptionPlan').addEventListener('change',subscriptionRender);
async function subscriptionAdminPayments(){
 if(!securityIsAdmin())return;const state=securityAdminStart('payments','Subscription payments');
 try{
  const result=await securityCall('getPromoHubAdminRecords',{kind:'payments'});if(!securityAdminCurrent(state))return;state.host.replaceChildren();
  for(const r of result.records){
   const row=document.createElement('article');row.className='securityRecord';securityIdentity(row,r.account);
   const detail=document.createElement('p');detail.textContent=`${subscriptionPlans[r.planId]?.label || 'Unknown plan'} · GH₵${r.amountGhs}\nMoMo reference: ${r.reference}`;row.append(detail);
   const label=document.createElement('label');label.textContent='Amount actually received (GH₵)';const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='0.01';label.append(amount);row.append(label);
   const verify=document.createElement('label');verify.className='subscriptionVerification';const checkbox=document.createElement('input');checkbox.type='checkbox';verify.append(checkbox,document.createTextNode(' I checked the recipient, reference and amount in my MoMo transaction history.'));row.append(verify);
   const actions=document.createElement('div');actions.className='securityActions';
   for(const decision of ['approved','rejected']){
    const b=document.createElement('button');b.textContent=decision==='approved'?'Verify and activate':'Reject payment';b.disabled=!r.account?.available;
    b.onclick=()=>securityWork(async()=>{
     if(!securityAdminCurrent(state))return;
     if(decision==='approved' && (!checkbox.checked || Number(amount.value)!==r.amountGhs))throw new Error('Confirm the received payment and enter the exact plan amount.');
     if(!confirm(`${b.textContent} for ${securityAccountLabel(r.account)}?`))return;
     b.disabled=true;try{await securityCall('reviewPromoHubPayment',{uid:r.uid,decision,verifiedPayment:checkbox.checked,amountGhs:Number(amount.value)});if(securityAdminCurrent(state))await subscriptionAdminPayments();}finally{if(securityAdminCurrent(state))b.disabled=false;}
    });actions.append(b);
   }row.append(actions);state.host.append(row);
  }
  if(!result.records.length)state.host.textContent='No pending subscription payments.';
 }catch(e){if(securityAdminCurrent(state)){state.host.textContent='Select Subscription payments to try again.';securityMessage(e.message);}}
}
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
 if(securityProfile){const wasReady=cloudReady;cloudReady=subscriptionCloudAllowed();subscriptionRender();if(wasReady&&!cloudReady){clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);}}
 if(!subscriptionReadable() && rendition){persistCurrentReaderPosition();backBtn.click();if(cloudUser){accountPanel.classList.add('open');securitySelectTab('account');}else showAuth();}
}
setInterval(subscriptionCheckExpiry,30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')subscriptionCheckExpiry();});
