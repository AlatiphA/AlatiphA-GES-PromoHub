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
 document.getElementById('accountName').textContent=securityProfile?.displayName || cloudUser?.displayName || 'GES PromoHub User';
 document.getElementById('accountType').textContent=cloudUser?.emailVerified ? `${securityProfile?.accountTier || 'free'} · ${securityProfile?.accountStatus || 'connecting'}` : 'Email verification required';
 document.getElementById('administrationTab').hidden=!securityIsAdmin();
 if(!securityIsAdmin())securityResetAdmin();
 document.getElementById('securityVerification').hidden=!!cloudUser?.emailVerified;
 subscriptionRender();
 if(document.activeElement!==document.getElementById('securityName'))document.getElementById('securityName').value=securityProfile?.displayName || cloudUser?.displayName || '';
}
async function securityActivate(user){
 const epoch=securityEpoch;
 cloudReady=false;if(!user?.emailVerified){securityProfile=null;securityRender();securityMessage('Verify your email, then select Check verification.');return false;}
 securityClaims=(await user.getIdTokenResult()).claims;
 securityProfile=await securityCall('initializePromoHubAccount');
 if(epoch!==securityEpoch)return false;
 cloudReady=subscriptionCloudAllowed();securityRender();
 if(securityStop)securityStop();
 securityStop=cloudDb.doc(`users/${user.uid}`).onSnapshot(s=>{if(epoch!==securityEpoch)return;securityProfile=s.data();const wasReady=cloudReady;cloudReady=subscriptionCloudAllowed();securityRender();if(!wasReady && cloudReady)securityWork(async()=>{if(epoch!==securityEpoch)return;await mergePreferencesFromCloud();await syncCurrentBookCloud();});if(!cloudReady)securityMessage('Cloud sync is unavailable during trial or after expiry. Local reader data is retained.');},e=>{cloudReady=false;securityMessage(e.message);});
 return cloudReady;
}
async function securityAuthChanged(user){
 securityEpoch++;securityResetAdmin();subscriptionResetPayment();clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);if(securityStop){securityStop();securityStop=null;}
 securitySwitchLocal(user);
 cloudUser=user || null;cloudReady=false;securityProfile=null;securityClaims={};subscriptionSidebarRender();
 if(!user){accountPanel.classList.remove('open');showAuth();if(resumeReaderAfterStartup())hideAuth();return;}
 hideAuth();if(securityRegistering)return;
 resumeReaderAfterStartup();
 try{const ready=await securityActivate(user);await updateAccountUI(user);securityRender();securityWork(subscriptionMyPayment);if(ready){await mergePreferencesFromCloud();await syncCurrentBookCloud();}else if(!subscriptionReadable())accountPanel.classList.add('open');}
 catch(e){cloudReady=false;accountPanel.classList.add('open');securityMessage(e.message);securityRender();}
}
let securityCursor=null,securityAdminView='',securityAdminEpoch=0;
function securityIsAdmin(){return cloudUser?.emailVerified===true && securityClaims.promohubAdmin===true && securityProfile?.accountStatus==='active';}
function securitySelectTab(tab){
 const admin=tab==='admin' && securityIsAdmin();
 document.getElementById('myAccountPanel').hidden=admin;
 document.getElementById('securityAdmin').hidden=!admin;
 for(const [id,selected] of [['myAccountTab',!admin],['administrationTab',admin]]){
  const b=document.getElementById(id);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;
 }
}
function securityAccountLabel(account){return account?.displayName || account?.email || 'Account unavailable';}
function securityIdentity(row,account,prefix=''){
 const p=document.createElement('p');p.className='securityIdentity';
 const name=document.createElement('strong');name.textContent=prefix+securityAccountLabel(account);p.append(name);
 if(account?.email && account.email!==securityAccountLabel(account)){const email=document.createElement('span');email.textContent=account.email;p.append(email);}
 row.append(p);
}
function securityAdminStart(view,title){
 securityAdminView=view;
 for(const b of document.querySelectorAll('.securityAdminNavigation button'))b.setAttribute('aria-pressed',String(b.dataset.security===view));
 document.getElementById('securityRecordsTitle').textContent=title;
 document.getElementById('securityPagination').hidden=view!=='users';
 document.getElementById('securityNextPage').disabled=true;
 const host=document.getElementById('securityRecords');host.textContent='Loading…';
 return {host,adminEpoch:++securityAdminEpoch,authEpoch:securityEpoch};
}
function securityAdminCurrent(state){return state.adminEpoch===securityAdminEpoch && state.authEpoch===securityEpoch && securityIsAdmin();}
function securityResetAdmin(){
 securityCursor=null;securityAdminView='';securityAdminEpoch++;
 document.getElementById('securityRecords').replaceChildren();document.getElementById('securitySummary').textContent='';
 document.getElementById('securityRecordsTitle').textContent='Choose a view above';
 document.getElementById('securityPagination').hidden=true;document.getElementById('securityNextPage').disabled=true;
 for(const b of document.querySelectorAll('.securityAdminNavigation button'))b.setAttribute('aria-pressed','false');
 securitySelectTab('account');
}
async function securityUsers(more=false){
 if(!securityIsAdmin())return;
 if(more && (securityAdminView!=='users'||!securityCursor))return;
 const cursor=more?securityCursor:null,state=securityAdminStart('users','Users');
 try{
  const result=await securityCall('getPromoHubUsers',cursor?{cursor}:{});
  if(!securityAdminCurrent(state))return;
  securityCursor=result.cursor || null;state.host.replaceChildren();
  for(const u of result.users){
   const row=document.createElement('article');row.className='securityRecord';securityIdentity(row,u);
   const status=document.createElement('p');status.className='securityStatus';status.textContent=`${u.accountTier || 'free'} · ${u.accountStatus || 'unknown'}`;row.append(status);
   const actions=document.createElement('div');actions.className='securityActions';
   for(const [action,label] of [['suspend','Suspend'],['reactivate','Reactivate'],['disable','Disable sign-in'],['free','Set to Free']]){
    const b=document.createElement('button');b.textContent=label;b.disabled=u.uid===cloudUser.uid;
    if(b.disabled)b.title='Your administrator account must be managed by the project owner.';
    b.onclick=()=>securityWork(async()=>{
     if(!securityAdminCurrent(state)||!confirm(`${label}: ${securityAccountLabel(u)}${u.email && u.email!==securityAccountLabel(u)?' ('+u.email+')':''}?`))return;
     b.disabled=true;try{await securityCall('managePromoHubUser',{uid:u.uid,action});if(securityAdminCurrent(state))await securityUsers();}finally{if(securityAdminCurrent(state))b.disabled=false;}
    });actions.append(b);
   }row.append(actions);state.host.append(row);
  }
  if(!result.users.length)state.host.textContent='No users on this page.';
  document.getElementById('securityNextPage').disabled=!securityCursor;
  const summary=await securityCall('getPromoHubAdminSummary');
  if(securityAdminCurrent(state))document.getElementById('securitySummary').textContent=`Users: ${summary.users} · Premium profiles: ${summary.premium} · Pending requests: ${summary.pending}`;
 }catch(e){if(securityAdminCurrent(state)){securityMessage(e.message || 'Unable to load users.');if(state.host.textContent==='Loading…')state.host.textContent='Select Users to try again.';}}
}
async function securityRecords(kind){
 if(!securityIsAdmin())return;
 const state=securityAdminStart(kind,kind==='audit'?'Recent audit':'Premium requests');
 try{
  const result=await securityCall('getPromoHubAdminRecords',{kind});if(!securityAdminCurrent(state))return;state.host.replaceChildren();
  const labels={'subscription.request':'Subscription payment submitted','subscription.approved':'Subscription activated','subscription.rejected':'Subscription payment rejected','premium.request':'Premium requested','premium.approved':'Premium approved','premium.rejected':'Premium rejected','account.suspend':'Account suspended','account.reactivate':'Account reactivated','account.disable':'Sign-in disabled','account.free':'Changed to Free'};
  for(const r of result.records){
   const row=document.createElement('article');row.className='securityRecord';
   if(kind==='audit'){
    const action=document.createElement('h4');action.textContent=labels[r.action] || String(r.action || 'Account activity').replace(/[._-]/g,' ');row.append(action);
    securityIdentity(row,r.account,'Account: ');securityIdentity(row,r.actorAccount,'By: ');
   }else{
    securityIdentity(row,r.account);const actions=document.createElement('div');actions.className='securityActions';
    for(const decision of ['approved','rejected']){
     const b=document.createElement('button');b.textContent=decision==='approved'?'Approve':'Reject';b.disabled=!r.account?.available;
     if(b.disabled)b.title='Account details are unavailable. Reload after deploying the updated function.';
     b.onclick=()=>securityWork(async()=>{
      if(!securityAdminCurrent(state)||!confirm(`${b.textContent} Premium for ${securityAccountLabel(r.account)}?`))return;
      for(const button of actions.querySelectorAll('button'))button.disabled=true;
      try{await securityCall('reviewPremiumRequest',{uid:r.uid,decision});if(securityAdminCurrent(state))await securityRecords('requests');}
      finally{if(securityAdminCurrent(state))for(const button of actions.querySelectorAll('button'))button.disabled=false;}
     });actions.append(b);
    }row.append(actions);
   }state.host.append(row);
  }
  if(!result.records.length)state.host.textContent=kind==='audit'?'No recent activity.':'No pending Premium requests.';
 }catch(e){if(securityAdminCurrent(state)){state.host.textContent='Select this view to try again.';securityMessage(e.message || 'Unable to load records.');}}
}
document.querySelector('.accountTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-account-tab]');if(tab)securitySelectTab(tab.dataset.accountTab);});
document.querySelector('.accountTabs').addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 const tabs=Array.from(document.querySelectorAll('[data-account-tab]')).filter(b=>!b.hidden);const index=tabs.indexOf(e.target);if(index<0)return;
 e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 securitySelectTab(tabs[next].dataset.accountTab);tabs[next].focus();
});
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
 },users:()=>securityUsers(),more:()=>securityUsers(true),requests:()=>securityRecords('requests'),audit:()=>securityRecords('audit')
};
document.getElementById('securityControls').addEventListener('click',e=>{const a=e.target.closest('[data-security]')?.dataset.security;if(a)securityWork(securityActions[a]);});
document.getElementById('authResetBtn').onclick=async()=>{try{await cloudAuth.sendPasswordResetEmail(authEmail.value.trim());authError.textContent='If the account exists, a password reset email will be sent.';}catch(e){authError.textContent=e.message;}};
