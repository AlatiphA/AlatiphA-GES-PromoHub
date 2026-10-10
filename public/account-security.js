/* Online-only Auth operations. Passwords are never saved in local storage or offline queues. */
let accountSecurityOperation=null;
function accountSecurityPasswordProvider(user){return user?.providerData?.some(p=>p.providerId==='password')===true;}
function accountSecurityCurrent(user,epoch){return securityEpoch===epoch && cloudUser?.uid===user.uid && cloudAuth?.currentUser?.uid===user.uid;}
function accountSecurityError(error){
 const code=String(error?.code||'');
 if(/wrong-password|invalid-credential/.test(code))return 'Your current password was not accepted. Check it and retry.';
 if(/requires-recent-login|user-token-expired|invalid-user-token/.test(code))return 'Sign in again, then reopen Account Security. If you verified a new email, use that address.';
 if(/weak-password/.test(code))return 'Your new password does not meet the account password requirements.';
 if(/email-already-in-use|already-exists/.test(code))return 'That login email is unavailable. Use another address.';
 if(/network-request-failed|unavailable/.test(code))return 'Connect to the internet and retry. Credential changes are not queued offline.';
 return error?.message || 'The change could not be completed.';
}
function accountSecurityClearPasswords(){document.querySelectorAll('#accountSecuritySection input[type="password"]').forEach(input=>input.value='');}
function accountSecurityReset(){
 accountSecurityOperation=null;accountSecurityClearPasswords();
 const status=document.getElementById('accountSecurityStatus');if(status)status.textContent='';
 const email=document.getElementById('accountSecurityNewEmail');if(email)email.value='';
 document.querySelectorAll('#accountSecuritySection button,#accountSecuritySection input').forEach(e=>e.disabled=false);
 const section=document.getElementById('accountSecuritySection');if(section)section.open=false;
}
let accountSecurityLaunchRequested=new URLSearchParams(location.search).get('account-security')==='1';
function accountSecurityRender(){
 const user=cloudUser;if(!user)return;
 const password=accountSecurityPasswordProvider(user);
 document.getElementById('accountSecurityEmail').textContent=user.email||'';
 document.getElementById('accountSecurityPasswordControls').hidden=!password;
 document.getElementById('accountSecurityGoogleControls').hidden=password;
 document.getElementById('accountSecurityPending').textContent=securityProfile?.pendingLoginEmail?'Verification requested for '+securityProfile.pendingLoginEmail+'. Your login email changes only after verification.':'';
 if(accountSecurityLaunchRequested && user.emailVerified && securityProfile?.accountStatus==='active'){accountSecurityLaunchRequested=false;accountPanel.classList.add('open');securitySelectTab('account');document.getElementById('accountSecuritySection').open=true;}
}
async function accountSecurityReauthenticate(user,password,epoch){
 if(navigator.onLine===false)throw Error('Connect to the internet. Credential changes cannot be saved offline.');
 if(!accountSecurityPasswordProvider(user))throw Error('Manage Google-only credentials in your Google account.');
 if(!password)throw Error('Enter your current password.');
 if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email,password));
 if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 await user.getIdToken(true);
 if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
}
async function changePromoHubPassword(user,current,newPassword,confirmation,epoch=securityEpoch){
 if(!newPassword||newPassword!==confirmation)throw Error('Enter the same new password in both fields.');
 if(newPassword.length<6)throw Error('Use at least 6 characters; stricter Firebase password requirements also apply.');
 if(newPassword===current)throw Error('Choose a password different from your current password.');
 await accountSecurityReauthenticate(user,current,epoch);
 await user.updatePassword(newPassword);
}
async function requestPromoHubLoginEmail(user,current,newEmail,epoch=securityEpoch){
 newEmail=String(newEmail||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)||newEmail.length>254||newEmail===String(user.email||'').toLowerCase())throw Error('Enter a valid different login email.');
 await accountSecurityReauthenticate(user,current,epoch);
 const result=await securityCall('preparePromoHubLoginEmail',{newEmail});
 if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 const continueUrl=new URL('./index.html',location.href);
 continueUrl.search='?account-security=1';continueUrl.hash='';
 await user.verifyBeforeUpdateEmail(result.newEmail,{url:continueUrl.href});
 return result.newEmail;
}
async function refreshPromoHubLoginEmail(user,epoch=securityEpoch){
 await user.reload();if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 await user.getIdToken(true);if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 const result=await securityCall('synchronizePromoHubLoginEmail');
 if(!accountSecurityCurrent(user,epoch))throw Error('Your account changed. Sign in again.');
 if(securityProfile)securityProfile={...securityProfile,email:result.email,pendingLoginEmail:result.pendingEmail};
 document.getElementById('accountEmail').textContent=user.email||'';accountSecurityRender();return result;
}
async function accountSecurityPerform(operation){
 if(accountSecurityOperation)return;
 const user=cloudUser,epoch=securityEpoch,status=document.getElementById('accountSecurityStatus');
 if(!user || !accountSecurityCurrent(user,epoch)){accountSecurityClearPasswords();return;}
 if(navigator.onLine===false){accountSecurityClearPasswords();status.textContent='Connect to the internet. Credential changes are not saved offline.';return;}
 const token={};accountSecurityOperation=token;
 document.querySelectorAll('#accountSecuritySection button,#accountSecuritySection input').forEach(e=>e.disabled=true);
 status.textContent='Working...';
 try{const message=await operation(user,epoch);if(accountSecurityCurrent(user,epoch))status.textContent=message;}
 catch(e){if(accountSecurityCurrent(user,epoch))status.textContent=accountSecurityError(e);}
 finally{if(accountSecurityOperation===token){accountSecurityClearPasswords();accountSecurityOperation=null;document.querySelectorAll('#accountSecuritySection button,#accountSecuritySection input').forEach(e=>e.disabled=false);}}
}
document.getElementById('accountSecurityPasswordForm').addEventListener('submit',e=>{
 e.preventDefault();const f=e.currentTarget.elements;
 accountSecurityPerform(async(user,epoch)=>{await changePromoHubPassword(user,f.currentPassword.value,f.newPassword.value,f.confirmPassword.value,epoch);return 'Password changed. Use your new password next time you sign in.';});
});
document.getElementById('accountSecurityEmailForm').addEventListener('submit',e=>{
 e.preventDefault();const f=e.currentTarget.elements;
 accountSecurityPerform(async(user,epoch)=>{const email=await requestPromoHubLoginEmail(user,f.currentPassword.value,f.newEmail.value,epoch);return 'Verification link sent to '+email+'. Open it, then return and select Refresh verified email. If asked to sign in again, use the verified address.';});
});
document.getElementById('accountSecurityRefresh').addEventListener('click',()=>accountSecurityPerform(async(user,epoch)=>{
 const r=await refreshPromoHubLoginEmail(user,epoch);return r.pendingEmail?'Still awaiting verification for '+r.pendingEmail+'.':'Your verified login email is up to date.';
}));
document.getElementById('accountSecuritySection').addEventListener('toggle',e=>{if(!e.currentTarget.open)accountSecurityClearPasswords();});
for(const id of ['accountClose','logoutBtn'])document.getElementById(id)?.addEventListener('click',accountSecurityClearPasswords);
