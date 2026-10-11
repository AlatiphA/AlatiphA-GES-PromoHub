'use strict';
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(v).digest('hex');
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
module.exports=function({onCall,onDocumentWritten,options,HttpsError,db,admin,member,stamp,audit}){
 const ref=(uid,id)=>db.doc(`users/${uid}/notifications/${id}`);
 const notice=(title,body,type)=>({title,body,type,read:false,createdAt:stamp()});
 async function put(uid,id,data){
  await db.runTransaction(async tx=>{
   const [u,n,deleted]=await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(ref(uid,id)),tx.get(db.doc(`accountDeletions/${uid}`))]);
   if(!u.exists || deleted.exists || n.exists)return;
   tx.set(ref(uid,id),data);
  });
 }
 async function tellAdmins(id,data){
  // Auth claims, not client-editable profile flags, identify administrators.
  let page;
  do{
   const batch=await admin.auth().listUsers(1000,page);
   for(const a of batch.users){
    if(a.disabled || !a.emailVerified || a.customClaims?.promohubAdmin!==true)continue;
    const p=await db.doc(`users/${a.uid}`).get();if(p.data()?.accountStatus!=='active')continue;
    await put(a.uid,id,data);
   }
   page=batch.pageToken;
  }while(page);
 }
 const sendPromoHubMessage=onCall(options,async req=>{
  const actor=await member(req,true),data=req.data||{};
  const title=text(data.title,120),body=text(data.body,1500),id=data.requestId;
  const uid=data.uid || '',audience=data.audience;
  if(!title || !body || typeof id!=='string' || !/^[A-Za-z0-9_-]{16,80}$/.test(id)
   || !['all','user'].includes(audience) || (audience==='user' && (typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))))throw new HttpsError('invalid-argument','Enter a title, message and recipient.');
  if(data.title.length>120 || data.body.length>1500)throw new HttpsError('invalid-argument','Keep the title under 121 and the message under 1501 characters.');
  const key=hash(actor+'|'+id),fingerprint=hash(JSON.stringify([title,body,audience,audience==='user'?uid:'']));
  const command=db.doc('notificationCommands/'+key),throttle=db.doc('notificationLimits/'+actor);
  await db.runTransaction(async tx=>{
   const [existing,limit,profile,target,deletion]=await Promise.all([tx.get(command),tx.get(throttle),tx.get(db.doc('users/'+actor)),audience==='user'?tx.get(db.doc('users/'+uid)):Promise.resolve(null),audience==='user'?tx.get(db.doc('accountDeletions/'+uid)):Promise.resolve(null)]);
   if(profile.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Administrator is not active.');
   if(existing.exists){if(existing.data().fingerprint!==fingerprint)throw new HttpsError('already-exists','This request was used for a different message.');return;}
   if(target && (!target.exists || deletion.exists || target.data().accountStatus!=='active'))throw new HttpsError('failed-precondition','The recipient must be an active account.');
   const now=Date.now();if(now-(limit.data()?.lastAtMs||0)<10000)throw new HttpsError('resource-exhausted','Wait 10 seconds before sending another message.');
   // A broadcast is one shared document, not one copy for every account.
   const destination=audience==='all'?db.doc('announcements/'+key):ref(uid,key);
   tx.set(destination,{...notice(title,body,audience==='all'?'announcement':'message'),actorName:text(profile.data().displayName,100)||'Administrator'});
   tx.set(command,{fingerprint,actor,audience,targetUid:audience==='user'?uid:'',createdAt:stamp()});
   tx.set(throttle,{lastAtMs:now});audit(tx,actor,'notification.sent',audience==='user'?uid:actor,{audience});
  });
  return {ok:true,id:key};
 });
 const recordPromoHubSignIn=onCall(options,async req=>{
  const uid=await member(req),method=req.data?.method;
  if(!['password','google'].includes(method))throw new HttpsError('invalid-argument','Invalid sign-in method.');
  // Refresh/restoration never calls this endpoint, and old tokens cannot claim a new login.
  if(!Number.isFinite(req.auth.token.auth_time) || Math.abs(Date.now()/1000-req.auth.token.auth_time)>300)return {recorded:false};
  const dedupe=db.doc('notificationSignIns/'+uid);let created=false;
  await db.runTransaction(async tx=>{
   created=false;const p=await tx.get(dedupe);if(Date.now()-(p.data()?.atMs||0)<120000)return;
   tx.set(dedupe,{uid,atMs:Date.now(),authTime:req.auth.token.auth_time,method});created=true;
  });
  return {recorded:created};
 });
 const trigger={region:'africa-south1',maxInstances:10,retry:true};
 const onPromoHubAccountNotice=onDocumentWritten({...trigger,document:'users/{uid}'},async e=>{
  const before=e.data?.before.exists?e.data.before.data():null,after=e.data?.after.exists?e.data.after.data():null;
  if(!after || !e.id)return;
  const uid=e.params.uid,key=hash(e.id),name=text(after.displayName||after.email,100)||'A reader';
  if(!before){
   await put(uid,key,notice('Welcome to PromoHub','Your account is ready. Open My Account to view your trial or subscription and reading mode.','welcome'));
   await tellAdmins(key,notice('New PromoHub account',name+' created an account.','account'));
   return;
  }
  if(before.accountStatus!==after.accountStatus){
   const status={active:'reactivated',suspended:'suspended',disabled:'disabled'}[after.accountStatus];
   if(status)await put(uid,key,notice('Account access updated','Your account was '+status+'. Check My Account for current access.','account'));
  }else if((before.readingAccessMode||'strict')!==(after.readingAccessMode||'strict')){
   await put(uid,key,notice('Reading mode updated','Your reading mode was changed to '+(after.readingAccessMode==='offline'?'Offline':'Online')+'. Check Devices and sessions for the current setting.','mode'));
  }else if(before.subscriptionStatus!==after.subscriptionStatus && after.subscriptionStatus==='cancelled'){
   await put(uid,key,notice('Subscription access updated','Your paid access was removed. Open My Account to check your current subscription.','subscription'));
  }
 });
 const onPromoHubPaymentNotice=onDocumentWritten({...trigger,document:'subscriptionRequests/{uid}'},async e=>{
  const before=e.data?.before.exists?e.data.before.data():null,after=e.data?.after.exists?e.data.after.data():null;
  if(!after || !e.id)return;
  if(before && before.status===after.status && before.requestedAtMs===after.requestedAtMs)return;
  const uid=e.params.uid,key=hash(e.id),p=await db.doc('users/'+uid).get();if(!p.exists)return;
  if(after.status==='pending'){
   await put(uid,key,notice('Payment submitted','Your MoMo payment is awaiting administrator verification. Submission does not activate a subscription.','payment'));
   await tellAdmins(key,notice('Payment awaiting review',(text(p.data().displayName||p.data().email,100)||'A reader')+' submitted a subscription payment. Open Administration, then Subscription payments to verify it.','payment'));
  }else if(['approved','rejected'].includes(after.status)){
   await put(uid,key,notice('Payment '+after.status,after.status==='approved'?'Your verified subscription payment was approved. Open My Account to see your plan and expiry.':'Your payment was rejected. Check the transaction ID and amount, or contact the administrator.','payment'));
  }
 });
 const onPromoHubSignInNotice=onDocumentWritten({...trigger,document:'notificationSignIns/{uid}'},async e=>{
  const after=e.data?.after.exists?e.data.after.data():null;if(!after || !e.id)return;
  const p=await db.doc('users/'+e.params.uid).get();if(p.data()?.accountStatus!=='active')return;
  await tellAdmins(hash(e.id),notice('Reader signed in',(text(p.data().displayName||p.data().email,100)||'A reader')+' signed in using '+(after.method==='google'?'Google':'email and password')+'.','signin'));
 });
 return {sendPromoHubMessage,recordPromoHubSignIn,onPromoHubAccountNotice,onPromoHubPaymentNotice,onPromoHubSignInNotice};
};
