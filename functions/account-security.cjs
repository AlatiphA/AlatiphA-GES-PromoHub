'use strict';
// Login credentials remain in Firebase Auth. These callables synchronise only email metadata.
module.exports=function({onCall,options,HttpsError,db,admin,stamp,audit,policy}){
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 const normalize=value=>String(value||'').trim().toLowerCase();
 async function identity(req,recent){
  if(!req.auth)fail('unauthenticated','Sign in first.');
  const uid=req.auth.uid,record=await admin.auth().getUser(uid);
  if(record.disabled||!record.emailVerified||!policy.verified(req.auth.token))fail('permission-denied','An active verified account is required.');
  if(!record.email||normalize(req.auth.token.email)!==normalize(record.email))fail('failed-precondition','Sign in again with your current verified login email.');
  if(recent){const age=Date.now()/1000-Number(req.auth.token.auth_time||0);if(!Number.isFinite(age)||age<0||age>300)fail('failed-precondition','Confirm your current password again.');}
  if((await db.doc(`accountDeletions/${uid}`).get()).exists)fail('permission-denied','Account deletion is in progress.');
  return {uid,record,email:normalize(record.email)};
 }
 async function active(tx,uid){const ref=db.doc(`users/${uid}`),snap=await tx.get(ref);if(!policy.active(snap.data()))fail('permission-denied','Account is not active.');return {ref,profile:snap.data()};}
 return {
  preparePromoHubLoginEmail:onCall(options,async req=>{
   const auth=await identity(req,true),newEmail=normalize(req.data?.newEmail);
   if(!auth.record.providerData?.some(p=>p.providerId==='password'))fail('failed-precondition','Manage Google-only credentials in your Google account.');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)||newEmail.length>254||newEmail===auth.email)fail('invalid-argument','Enter a valid different login email.');
   try{const other=await admin.auth().getUserByEmail(newEmail);if(other.uid!==auth.uid)fail('already-exists','That email is unavailable. Choose another address.');}catch(e){if(e.code!=='auth/user-not-found')throw e;}
   await db.runTransaction(async tx=>{
    const {ref}=await active(tx,auth.uid);
    tx.update(ref,{pendingLoginEmail:newEmail,updatedAt:stamp()});
    audit(tx,auth.uid,'account.emailVerificationRequested',auth.uid);
   });
   return {newEmail};
  }),
  synchronizePromoHubLoginEmail:onCall(options,async req=>{
   const auth=await identity(req,false);
   return db.runTransaction(async tx=>{
    const {ref,profile}=await active(tx,auth.uid),completed=normalize(profile.pendingLoginEmail)===auth.email;
    const updates={email:auth.record.email,emailVerified:true,updatedAt:stamp()};
    if(completed)updates.pendingLoginEmail='';
    tx.update(ref,updates);
    if(normalize(profile.email)!==auth.email)audit(tx,auth.uid,'account.emailChanged',auth.uid);
    return {email:auth.record.email,pendingEmail:completed?'':profile.pendingLoginEmail||''};
   });
  })
 };
};
