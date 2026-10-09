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
 document.getElementById('securityAdmin').hidden=!(securityClaims.promohubAdmin===true && securityProfile?.accountStatus==='active');
 document.getElementById('securityName').value=securityProfile?.displayName || cloudUser?.displayName || '';
}
async function securityActivate(user){
 const epoch=securityEpoch;
 cloudReady=false;if(!user?.emailVerified){securityProfile=null;securityRender();securityMessage('Verify your email, then select Check verification.');return false;}
 securityClaims=(await user.getIdTokenResult()).claims;
 securityProfile=await securityCall('initializePromoHubAccount');
 if(epoch!==securityEpoch)return false;
 cloudReady=securityProfile.accountStatus==='active';securityRender();
 if(securityStop)securityStop();
 securityStop=cloudDb.doc(`users/${user.uid}`).onSnapshot(s=>{if(epoch!==securityEpoch)return;securityProfile=s.data();cloudReady=!!(user.emailVerified && securityProfile?.accountStatus==='active');securityRender();if(!cloudReady)securityMessage('Cloud access is restricted. Local reader data is retained.');},e=>{cloudReady=false;securityMessage(e.message);});
 return cloudReady;
}
async function securityAuthChanged(user){
 securityEpoch++;clearTimeout(preferenceSyncTimer);clearTimeout(progressSyncTimer);if(securityStop){securityStop();securityStop=null;}
 securitySwitchLocal(user);
 cloudUser=user || null;cloudReady=false;securityProfile=null;securityClaims={};
 if(!user){accountPanel.classList.remove('open');showAuth();if(resumeReaderAfterStartup())hideAuth();return;}
 hideAuth();if(securityRegistering)return;
 resumeReaderAfterStartup();
 try{const ready=await securityActivate(user);await updateAccountUI(user);if(ready){await mergePreferencesFromCloud();await syncCurrentBookCloud();}else accountPanel.classList.add('open');}
 catch(e){cloudReady=false;accountPanel.classList.add('open');securityMessage(e.message);securityRender();}
}
let securityCursor=null;
async function securityUsers(more=false){
 if(more&&!securityCursor){securityMessage('No more users.');return;}
 const result=await securityCall('getPromoHubUsers',more?{cursor:securityCursor}:{});securityCursor=result.cursor;const host=document.getElementById('securityRecords');host.replaceChildren();
 for(const u of result.users){const row=document.createElement('div');const p=document.createElement('p');p.textContent=`${u.displayName || u.email || u.uid}: ${u.accountTier}, ${u.accountStatus}`;row.append(p);
 for(const action of ['suspend','reactivate','disable','free']){const b=document.createElement('button');b.textContent=action;b.onclick=()=>securityWork(async()=>{if(!confirm(`${action} this account?`))return;await securityCall('managePromoHubUser',{uid:u.uid,action});await securityUsers();});row.append(b);}host.append(row);}
 const s=await securityCall('getPromoHubAdminSummary');document.getElementById('securitySummary').textContent=`Users: ${s.users}, Premium: ${s.premium}, pending: ${s.pending}`;
}
async function securityRecords(kind){
 const result=await securityCall('getPromoHubAdminRecords',{kind});const host=document.getElementById('securityRecords');host.replaceChildren();
 for(const r of result.records){const row=document.createElement('div');const p=document.createElement('p');p.textContent=kind==='audit'?`${r.action}: ${r.targetUid}`:`Premium request: ${r.uid}`;row.append(p);
 if(kind!=='audit')for(const decision of ['approved','rejected']){const b=document.createElement('button');b.textContent=decision==='approved'?'Approve':'Reject';b.onclick=()=>securityWork(async()=>{if(!confirm(`${b.textContent} this request?`))return;await securityCall('reviewPremiumRequest',{uid:r.uid,decision});await securityRecords('requests');});row.append(b);}host.append(row);}
 if(!result.records.length)host.textContent='No records.';
}
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
