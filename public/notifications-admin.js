/* Administrator messages use the same server-side role checks as user management. */
let notificationComposerTarget=null,notificationSendPending=null;
function notificationAdminReset(){notificationComposerTarget=null;notificationSendPending=null;}
function notificationCompose(user=null){
 if(!securityIsAdmin())return;
 adminCancelSearch();notificationComposerTarget=user?{uid:user.uid,name:securityAccountLabel(user)}:null;
 const state=securityAdminStart('messages','Send a message');state.host.replaceChildren();
 const form=document.createElement('form');form.className='messageComposer';form.style.gridColumn='1 / -1';
 const recipient=document.createElement('p');recipient.textContent=user?'Recipient: '+securityAccountLabel(user):'Recipients: all active accounts, including trial and expired subscriptions.';
 const hint=document.createElement('p');hint.textContent='Messages appear in Notifications. This is one-way messaging; user replies and closed-app push are not included.';
 const titleLabel=document.createElement('label');titleLabel.textContent='Title';const title=document.createElement('input');title.maxLength=120;title.required=true;titleLabel.append(title);
 const bodyLabel=document.createElement('label');bodyLabel.textContent='Message';const body=document.createElement('textarea');body.maxLength=1500;body.required=true;bodyLabel.append(body);
 const send=document.createElement('button');send.type='submit';send.textContent=user?'Send to this user':'Send announcement';
 const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 form.append(recipient,hint,titleLabel,bodyLabel,send,feedback);state.host.append(form);
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!securityAdminCurrent(state)||send.disabled)return;
  const input={title:title.value.trim(),body:body.value.trim(),audience:user?'user':'all',...(user?{uid:user.uid}:{})};
  if(!input.title||!input.body){feedback.textContent='Enter a title and message.';return;}
  const signature=JSON.stringify([cloudUser.uid,input]);
  if(notificationSendPending?.signature!==signature)notificationSendPending={signature,requestId:crypto.randomUUID()};
  if(!confirm(user?'Send this message to '+securityAccountLabel(user)+'?':'Send this announcement to all active accounts?'))return;
  send.disabled=true;feedback.textContent='Sending…';
  try{
   await securityCall('sendPromoHubMessage',{...input,requestId:notificationSendPending.requestId});
   if(!securityAdminCurrent(state))return;
   notificationSendPending=null;title.value='';body.value='';feedback.textContent=user?'Message sent.':'Announcement published.';
  }catch(error){if(securityAdminCurrent(state))feedback.textContent=error.message || 'Unable to send. Retry without changing the message to avoid duplicate delivery.';}
  finally{if(securityAdminCurrent(state))send.disabled=false;}
 });
 title.focus();
}
