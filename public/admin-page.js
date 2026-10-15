/* The administration page never starts an EPUB reader or claims a reading session. */
let cloudUser=null,securityProfile=null,securityClaims={},securityEpoch=0,adminStop=null;
function securityMessage(text){document.getElementById('securityMessage').textContent=text;}
async function securityCall(name,data={}){return (await firebase.app().functions('us-central1').httpsCallable(name)(data)).data;}
async function securityWork(work){try{await work();}catch(e){securityMessage(e.message || 'Operation failed.');}}
function adminLock(message){if(typeof quizAdminReset==='function')quizAdminReset();if(typeof adminOverviewReset==='function')adminOverviewReset();if(typeof notificationAdminReset==='function')notificationAdminReset();adminCancelSearch();adminSearchComposing=false;securityResetAdmin();document.getElementById('securityAdmin').hidden=true;document.getElementById('adminAccess').textContent=message;document.getElementById('adminIdentity').textContent='';}
async function adminAuthChanged(user){
 const epoch=++securityEpoch;if(adminStop){adminStop();adminStop=null;}cloudUser=user;securityClaims={};securityProfile=null;securityMessage('');adminLock('Checking administrator access…');
 if(!user){adminLock('Sign in to PromoHub with your administrator account, then return here.');return;}
 try{
  const claims=(await user.getIdTokenResult(true)).claims;if(epoch!==securityEpoch)return;securityClaims=claims;
  if(!user.emailVerified || securityClaims.promohubAdmin!==true){adminLock('This account does not have administrator access.');return;}
  const snapshot=await firebase.firestore().doc('users/'+user.uid).get();if(epoch!==securityEpoch)return;securityProfile=snapshot.data();
  if(!securityIsAdmin()){adminLock('Administrator access is unavailable for this account.');return;}
  document.getElementById('adminAccess').textContent='';document.getElementById('adminIdentity').textContent=(securityProfile.displayName || user.displayName || 'Administrator')+(user.email?' · '+user.email:'');document.getElementById('securityAdmin').hidden=false;
  adminStop=firebase.firestore().doc('users/'+user.uid).onSnapshot(s=>{if(epoch!==securityEpoch)return;securityProfile=s.data();if(!securityIsAdmin())adminLock('Administrator access is no longer available.');},e=>{if(epoch===securityEpoch)adminLock('Unable to verify administrator access. '+e.message);});
  if(typeof adminOverview==='function')await adminOverview();else await securityUsers();
 }catch(e){if(epoch===securityEpoch)adminLock('Unable to load Administration. Check your internet connection and reload. '+e.message);}
}
/* Debounced prefix search. Editing invalidates earlier results before the timer fires. */
let adminSearchTimer=null,adminSearchComposing=false;
function adminCancelSearch(){if(adminSearchTimer!==null){clearTimeout(adminSearchTimer);adminSearchTimer=null;}}
function adminSearchInvalidate(){securityAdminEpoch++;document.getElementById('securityNextPage').disabled=true;document.getElementById('securityPreviousPage').disabled=true;}
function adminSearchNow(){adminCancelSearch();if(!securityIsAdmin())return;securityMessage('');return securityWork(()=>securityUsers());}
function adminScheduleSearch(){
 adminCancelSearch();if(!securityIsAdmin() || securityAdminView!=='users')return;
 adminSearchInvalidate();if(adminSearchComposing)return;
 const epoch=securityEpoch;
 adminSearchTimer=setTimeout(()=>{adminSearchTimer=null;if(epoch===securityEpoch && securityAdminView==='users' && securityIsAdmin())adminSearchNow();},350);
}
const securityActions={questionReports:()=>questionReportsAdmin(),pushSettings:()=>pushSettingsAdmin(),quizzes:()=>quizAdmin(),overview:()=>typeof adminOverview==='function'?adminOverview():securityUsers(),users:()=>securityUsers(),more:()=>securityUsers(true),previous:()=>securityUsers('previous'),payments:()=>subscriptionAdminPayments(),messages:()=>notificationCompose(),audit:()=>securityRecords('audit')};
document.getElementById('securityControls').addEventListener('click',e=>{const action=e.target.closest('[data-security]')?.dataset.security;if(action && securityActions[action]){adminCancelSearch();securityWork(securityActions[action]);}});
document.getElementById('securityUserFilters').addEventListener('submit',e=>{e.preventDefault();if(!adminSearchComposing)adminSearchNow();});
const adminSearchInput=document.getElementById('securityUserSearch');
adminSearchInput.addEventListener('input',e=>{if(e.isComposing)adminSearchComposing=true;adminScheduleSearch();});
adminSearchInput.addEventListener('compositionstart',()=>{adminSearchComposing=true;adminCancelSearch();if(securityAdminView==='users')adminSearchInvalidate();});
adminSearchInput.addEventListener('compositionend',()=>{adminSearchComposing=false;adminScheduleSearch();});
for(const id of ['securityUserSearchField','securityUserTier','securityUserStatus','securityUserMode'])document.getElementById(id).addEventListener('change',()=>{adminSearchComposing=false;adminSearchNow();});
document.getElementById('securityUserClear').addEventListener('click',()=>{adminSearchComposing=false;adminSearchInput.value='';document.getElementById('securityUserSearchField').value='name';for(const id of ['securityUserTier','securityUserStatus','securityUserMode'])document.getElementById(id).value='all';adminSearchNow();});
try{if(!firebase.apps.length)firebase.initializeApp(window.GES_PROMOHUB_FIREBASE_CONFIG);firebase.auth().onAuthStateChanged(user=>{securityWork(()=>adminAuthChanged(user));});}catch(e){adminLock('Unable to start Administration. Check your internet connection and reload. '+e.message);}
