let securityCursor=null,securityAdminView='',securityAdminEpoch=0;
let securityUserPage=0,securityUserStarts=[null],securityUserQuery=null;
function securityIsAdmin(){return cloudUser?.emailVerified===true && securityClaims.promohubAdmin===true && securityProfile?.accountStatus==='active';}
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
 document.getElementById('securityUserFilters').hidden=view!=='users';
 document.getElementById('securityPagination').hidden=view!=='users';
 document.getElementById('securityNextPage').disabled=true;
 const host=document.getElementById('securityRecords');host.dataset.view=view;host.textContent='Loading…';
 return {host,adminEpoch:++securityAdminEpoch,authEpoch:securityEpoch};
}
function securityAdminCurrent(state){return state.adminEpoch===securityAdminEpoch && state.authEpoch===securityEpoch && securityIsAdmin();}
function securityResetAdmin(){
 securityCursor=null;securityUserPage=0;securityUserStarts=[null];securityUserQuery=null;document.getElementById('securityUserFilters').hidden=true;securityAdminView='';securityAdminEpoch++;
 document.getElementById('securityRecords').replaceChildren();document.getElementById('securitySummary').textContent='';
 document.getElementById('securityRecordsTitle').textContent='Choose a view above';
 document.getElementById('securityPagination').hidden=true;document.getElementById('securityNextPage').disabled=true;
 for(const b of document.querySelectorAll('.securityAdminNavigation button'))b.setAttribute('aria-pressed','false');

}
function securityUserFilters(){return {search:document.getElementById('securityUserSearch').value||'',searchField:document.getElementById('securityUserSearchField').value||'name',tier:document.getElementById('securityUserTier').value||'all',status:document.getElementById('securityUserStatus').value||'all',mode:'all'};}
async function securityUsers(direction=false){
 if(!securityIsAdmin())return;
 const next=direction===true||direction==='next',previous=direction==='previous',refresh=direction==='refresh';
 if(next&&(securityAdminView!=='users'||!securityCursor))return;
 if(previous&&(securityAdminView!=='users'||securityUserPage===0))return;
 const query=(next||previous||refresh)?securityUserQuery:securityUserFilters();
 if(!query)return;
 const page=next?securityUserPage+1:previous?securityUserPage-1:refresh?securityUserPage:0;
 const cursor=next?securityCursor:(previous||refresh)?securityUserStarts[page]:null;
 const state=securityAdminStart('users','Users');
 document.getElementById('securityPreviousPage').disabled=true;
 try{
  const request={...query,...(cursor?{cursor}:{})};
  let result=await securityCall('getPromoHubUsers',request);
  if(!securityAdminCurrent(state))return;
  if(result.needsDirectory){
   let buildCursor=null,processed=0;
   do{
    state.host.textContent='Preparing searchable users… '+processed+' processed';
    const batch=await securityCall('preparePromoHubUserDirectory',buildCursor?{cursor:buildCursor}:{});
    if(!securityAdminCurrent(state))return;
    processed+=batch.processed;buildCursor=batch.cursor;
   }while(buildCursor);
   result=await securityCall('getPromoHubUsers',request);
   if(!securityAdminCurrent(state))return;
   if(result.needsDirectory)throw new Error('User directory is still preparing. Select Users to retry.');
  }
  if(!(next||previous||refresh))securityUserStarts=[null];
  securityUserQuery=query;securityUserPage=page;securityUserStarts[page]=cursor;
  securityCursor=result.cursor || null;state.host.replaceChildren();
  for(const u of result.users){
   const row=document.createElement('article');row.className='securityRecord securityUserRow';securityIdentity(row,u);
   const status=document.createElement('p');status.className='securityStatus';status.textContent=`${u.accountTier || 'free'} · ${u.accountStatus || 'unknown'} · Automatic online/offline reading`;row.append(status);
   const details=document.createElement('details');details.className='securityUserManage';const summary=document.createElement('summary');summary.textContent='Manage';details.append(summary);
   const actions=document.createElement('div');actions.className='securityActions';
   for(const [action,label] of [['suspend','Suspend'],['reactivate','Reactivate'],['disable','Disable sign-in'],['free','Set to Free']]){
    const b=document.createElement('button');b.textContent=label;b.disabled=u.uid===cloudUser.uid;
    if(b.disabled)b.title='Your administrator account must be managed by the project owner.';
    b.onclick=()=>securityWork(async()=>{
     if(!securityAdminCurrent(state)||!confirm(`${label}: ${securityAccountLabel(u)}${u.email && u.email!==securityAccountLabel(u)?' ('+u.email+')':''}?`))return;
     b.disabled=true;try{await securityCall('managePromoHubUser',{uid:u.uid,action});if(securityAdminCurrent(state))await securityUsers('refresh');}finally{if(securityAdminCurrent(state))b.disabled=false;}
    });actions.append(b);
   }if(typeof notificationCompose==='function' && u.accountStatus==='active'){const message=document.createElement('button');message.type='button';message.textContent='Send message';message.onclick=()=>{if(securityAdminCurrent(state))notificationCompose(u);};actions.append(message);}
   details.append(actions);row.append(details);state.host.append(row);
  }
  if(!result.users.length)state.host.textContent='No users match this search and filters.';
  document.getElementById('securityNextPage').disabled=!securityCursor;
  document.getElementById('securityPreviousPage').disabled=securityUserPage===0;
  document.getElementById('securityPageLabel').textContent=`Page ${securityUserPage+1} · ${result.users.length} users shown`;
  const summary=await securityCall('getPromoHubAdminSummary');
  if(securityAdminCurrent(state))document.getElementById('securitySummary').textContent=`Users: ${summary.users} · Premium profiles: ${summary.premium} · Pending requests: ${summary.pending}`;
 }catch(e){if(securityAdminCurrent(state)){securityMessage(e.message || 'Unable to load users.');state.host.textContent='Unable to load users. Select Users to retry.';document.getElementById('securityPageLabel').textContent='';}}
}
async function securityRecords(kind){
 if(!securityIsAdmin())return;
 const state=securityAdminStart(kind,kind==='audit'?'Recent audit':'Premium requests');
 try{
  const result=await securityCall('getPromoHubAdminRecords',{kind});if(!securityAdminCurrent(state))return;state.host.replaceChildren();
  const labels={'account.readingMode':'Reading access mode changed','subscription.request':'Subscription payment submitted','subscription.approved':'Subscription activated','subscription.rejected':'Subscription payment rejected','premium.request':'Premium requested','premium.approved':'Premium approved','premium.rejected':'Premium rejected','account.suspend':'Account suspended','account.reactivate':'Account reactivated','account.disable':'Sign-in disabled','account.free':'Changed to Free'};
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

async function subscriptionAdminPayments(){
 if(!securityIsAdmin())return;const state=securityAdminStart('payments','Subscription payments');
 try{
  const result=await securityCall('getPromoHubAdminRecords',{kind:'payments'});if(!securityAdminCurrent(state))return;state.host.replaceChildren();
  for(const r of result.records){
   const row=document.createElement('article');row.className='securityRecord';securityIdentity(row,r.account);
   const detail=document.createElement('p');detail.textContent=`${({m1:'1 month',m3:'3 months',m6:'6 months',m12:'12 months'})[r.planId] || 'Unknown plan'} · GH₵${r.amountGhs}\nMoMo transaction ID: ${r.reference}`;row.append(detail);
   const label=document.createElement('label');label.textContent='Amount actually received (GH₵)';const amount=document.createElement('input');amount.type='number';amount.min='0';amount.step='0.01';label.append(amount);row.append(label);
   const verify=document.createElement('label');verify.className='subscriptionVerification';const checkbox=document.createElement('input');checkbox.type='checkbox';verify.append(checkbox,document.createTextNode(' I checked the recipient, transaction ID and amount in my MoMo transaction history.'));row.append(verify);
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
