'use strict';
window.PromoHubReaderRecovery=(()=>{
 let dialog,title,status,devices,password,authBox,authButton,retry,manage,request=null,busy=false,pendingDevice=null,serial=0,listRequested=false;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const owner=()=>cloudUser?.uid||securityLocalOwner;
 const current=r=>r&&request===r&&owner()===r.uid&&selectedBookFile===r.file;
 function reset(){listRequested=false;serial++;request=null;pendingDevice=null;busy=false;if(password)password.value='';if(dialog?.open)dialog.close();}
 function controls(value){busy=value;if(retry)retry.disabled=value;if(manage)manage.disabled=value;if(authButton)authButton.disabled=value;}
 function init(){if(dialog)return;dialog=el('dialog');dialog.className='readerAccessDialog';dialog.setAttribute('aria-labelledby','readerAccessTitle');
 const heading=el('div');heading.className='readerAccessHeading';title=el('h2','Reading access');title.id='readerAccessTitle';const close=el('button','×');close.type='button';close.className='navIconButton';close.setAttribute('aria-label','Close reading access');close.onclick=reset;heading.append(title,close);
 status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const actions=el('div');actions.className='readerAccessActions';retry=el('button','Retry opening book');retry.type='button';retry.onclick=resume;manage=el('button','Registered devices');manage.type='button';manage.onclick=loadDevices;actions.append(retry,manage);devices=el('div');
 authBox=el('form');authBox.hidden=true;const label=el('label','Confirm your current password');password=el('input');password.type='password';password.autocomplete='current-password';label.append(password);authButton=el('button','Confirm and open book');authButton.type='submit';authBox.append(label,authButton);authBox.onsubmit=e=>{e.preventDefault();verifyAndRemove();};
 dialog.append(heading,status,actions,devices,authBox);if(window.PromoHubDeviceList)window.PromoHubDeviceList.observeRecovery(dialog);dialog.addEventListener('cancel',reset);document.body.append(dialog);}
 async function resume(){const r=request;if(!current(r)||busy)return;reset();openReader();}
 function show(message,error){listRequested=false;init();title.textContent='Reading access';retry.hidden=false;serial++;request={uid:owner(),file:selectedBookFile};pendingDevice=null;password.value='';authBox.hidden=true;devices.replaceChildren();status.textContent=message;controls(false);manage.hidden=!cloudUser||navigator.onLine===false||/^(functions\/)?already-exists$/.test(String(error?.code||''));if(!dialog.open)dialog.showModal();if(error?.code==='functions/resource-exhausted'||error?.code==='resource-exhausted')loadDevices();}
 async function loadDevices(){const r=request,ticket=++serial,revision=window.PromoHubDeviceList?.revision();if(!current(r)||busy)return;if(!cloudUser||navigator.onLine===false){status.textContent='Connect to the internet to check registered devices.';return;}controls(true);status.textContent='Checking your registered browsers…';try{const result=await securityCall('managePromoHubDevices',{operation:'list'});if(!current(r)||ticket!==serial)return;listRequested=true;if(revision===window.PromoHubDeviceList?.revision())renderDevices(result);if(window.PromoHubDeviceList)window.PromoHubDeviceList.start();
 }catch(e){if(current(r)&&ticket===serial)status.textContent=e.message||'Unable to load devices. Reconnect and retry.';}finally{if(current(r)&&ticket===serial)controls(false);}}
 function deviceListOpen(){return !!(dialog?.open&&listRequested&&current(request)&&!request.manageOnly);}
 function renderDevices(result){const r=request;if(!deviceListOpen())return;devices.replaceChildren();if(authBox.hidden)status.textContent=result.devices.length?'Choose an unused browser to remove, then this book will open here. Your subscription, books and saved reading data stay intact.':'No browsers are registered. Tap Retry to register this browser and open the book.';
 for(const d of result.devices){const row=el('article');row.append(el('p',d.label+(d.id===readerDeviceId()?' · This browser':'')+(d.active?' · Reading now':'')));const remove=el('button','Remove this registration and open book');remove.type='button';remove.onclick=()=>removeDevice(d.id,r);row.append(remove);devices.append(row);}
 }
 function manageDevice(id,label,onRemoved){
  if(!cloudUser||typeof id!=='string'||!id)return;
  listRequested=false;init();serial++;request={uid:cloudUser.uid,file:selectedBookFile,manageOnly:true,onRemoved};pendingDevice=null;password.value='';authBox.hidden=true;devices.replaceChildren();
  title.textContent='Remove device';retry.hidden=true;manage.hidden=true;controls(false);devices.append(el('p',label||'Selected registration'));
  if(!dialog.open)dialog.showModal();
  if(navigator.onLine===false){status.textContent='Reconnect to remove this registration. No device has been removed.';return;}
  status.textContent='Removing the selected registration…';removeDevice(id,request);
 }
 async function removeDevice(id,r){
  if(!current(r)||busy)return;
  if(navigator.onLine===false){status.textContent='Reconnect to remove this registration. No device has been removed.';return;}
  controls(true);
  try{
   await securityCall('managePromoHubDevices',{operation:'remove',deviceId:id});if(!current(r))return;
   try{if(id===readerDeviceId())localStorage.removeItem(readerSessionKey(r.uid));}catch{}
   controls(false);
   if(r.manageOnly){const done=r.onRemoved;reset();if(typeof done==='function')await done();}else resume();
  }catch(e){
   if(!current(r))return;
   if(/failed-precondition|requires-recent-login/.test(String(e.code||''))){
    pendingDevice=id;authBox.hidden=false;const user=cloudUser,hasPassword=user?.providerData?.some(p=>p.providerId==='password');password.parentElement.hidden=!hasPassword;
    authButton.textContent=r.manageOnly?(hasPassword?'Confirm and remove device':'Confirm with Google and remove device'):(hasPassword?'Confirm and open book':'Confirm with Google and open book');
    status.textContent='Confirm it is you to remove this registration. You stay signed in.';if(hasPassword)password.focus();
   }else status.textContent=e.message||'Unable to remove this registration.';
  }finally{if(current(r))controls(false);}
 }
 async function verifyAndRemove(){const r=request,id=pendingDevice,user=cloudUser;if(!current(r)||busy||!id||!user||user.uid!==r.uid)return;if(navigator.onLine===false){status.textContent='Connect to the internet to confirm your identity.';return;}controls(true);try{if(user.providerData?.some(p=>p.providerId==='password')){const secret=password.value;password.value='';if(!secret)throw Error('Enter your current password.');await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email,secret));}else if(user.providerData?.some(p=>p.providerId==='google.com')){await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());}else throw Error('Use My Account to confirm your sign-in method.');
 if(!current(r)||cloudUser?.uid!==user.uid)return;await user.getIdToken(true);if(!current(r))return;controls(false);authBox.hidden=true;await removeDevice(id,r);
 }catch(e){if(current(r))status.textContent=typeof accountSecurityError==='function'?accountSecurityError(e):e.message||'Verification could not be completed.';}finally{if(password)password.value='';if(current(r))controls(false);}}
 return {show,reset,manageDevice,deviceListOpen,renderDevices};
})();
