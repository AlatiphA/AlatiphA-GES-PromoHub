'use strict';
const subscriptions=require('./subscriptions.cjs');
const MAX_DEVICES=2,LEASE_MS=120000,OFFLINE_MS=86400000;
module.exports=({onCall,options,HttpsError,db,admin,policy})=>{
 function id(value){if(typeof value!=='string'||!/^[a-f0-9]{32}$/.test(value))throw new HttpsError('invalid-argument','Invalid device or session identifier.');return value;}
 async function account(req){
  if(!req.auth || !policy.verified(req.auth.token))throw new HttpsError('unauthenticated','Sign in with a verified account.');
  const uid=req.auth.uid,record=await admin.auth().getUser(uid);
  if(record.disabled||!record.emailVerified)throw new HttpsError('permission-denied','Account is unavailable.');
  return {uid,admin:record.customClaims?.promohubAdmin===true&&req.auth.token.promohubAdmin===true};
 }
 async function transact(req,work){
  const who=await account(req),ref=db.doc(`users/${who.uid}/access/reader`),profile=db.doc(`users/${who.uid}`);
  if((await db.doc(`accountDeletions/${who.uid}`).get()).exists)throw new HttpsError('permission-denied','Account deletion is in progress.');
  return db.runTransaction(async tx=>{
   const [p,s]=await Promise.all([tx.get(profile),tx.get(ref)]);
   if(!policy.active(p.data()))throw new HttpsError('permission-denied','Account is not active.');
   return work({who,p:p.data(),state:s.data()||{devices:[],lease:null},tx,ref,now:Date.now()});
  });
 }
 return {
  claimPromoHubReaderSession:onCall(options,async req=>{
   const deviceId=id(req.data?.deviceId),sessionId=id(req.data?.sessionId),renew=req.data?.renew===true;
   return transact(req,({who,p,state,tx,ref,now})=>{
    if(who.admin)return {exempt:true,reason:'administrator'};
    if(!subscriptions.readable(p,now))throw new HttpsError('permission-denied','Your trial or subscription has expired.');
    if(!subscriptions.cloud(p,now))return {exempt:true,reason:'trial'};
    const devices=Array.isArray(state.devices)?state.devices:[];
    let device=devices.find(d=>d.id===deviceId);
    if(renew&&!device)throw new HttpsError('permission-denied','This device was removed. Open My Account to register again.');
    if(!device&&devices.length>=MAX_DEVICES)throw new HttpsError('resource-exhausted','Two devices are already registered. Remove an unused device in My Account, then try again.');
    const lease=state.lease;
    if(lease&&lease.expiresAtMs>now&&(lease.deviceId!==deviceId||lease.sessionId!==sessionId))throw new HttpsError('already-exists','This account is reading in another session. Close that reader, or wait up to 2 minutes after it disconnects.');
    if(renew&&(!lease||lease.deviceId!==deviceId||lease.sessionId!==sessionId||lease.expiresAtMs<=now))throw new HttpsError('failed-precondition','Your reader session ended. Open the book again.');
    if(!device){device={id:deviceId,label:String(req.data?.label||'Browser / PWA').slice(0,80),registeredAtMs:now};devices.push(device);}
    device.lastSeenAtMs=now;
    const expiresAtMs=now+LEASE_MS,offlineUntilMs=Math.min(now+OFFLINE_MS,Number(p.subscriptionEndsAtMs)||now+OFFLINE_MS);
    tx.set(ref,{devices,lease:{deviceId,sessionId,expiresAtMs},updatedAtMs:now});
    return {exempt:false,expiresAtMs,offlineUntilMs,maxDevices:MAX_DEVICES,maxSessions:1};
   });
  }),
  managePromoHubDevices:onCall(options,async req=>{
   const operation=req.data?.operation||'list';
   if(!['list','remove','release'].includes(operation))throw new HttpsError('invalid-argument','Unknown device operation.');
   return transact(req,({who,state,tx,ref,now})=>{
    const devices=Array.isArray(state.devices)?state.devices:[],lease=state.lease;
    if(operation==='list')return {exempt:who.admin,maxDevices:MAX_DEVICES,maxSessions:1,devices:devices.map(d=>({...d,active:lease?.deviceId===d.id&&lease.expiresAtMs>now}))};
    const deviceId=id(req.data?.deviceId);
    if(operation==='remove'){
     const authTime=Number(req.auth.token.auth_time);
     if(!Number.isFinite(authTime)||now/1000-authTime>300)throw new HttpsError('failed-precondition','Sign out and sign in again before removing a device.');
     tx.set(ref,{devices:devices.filter(d=>d.id!==deviceId),lease:lease?.deviceId===deviceId?null:lease,updatedAtMs:now});
    }else{
     const sessionId=id(req.data?.sessionId);
     if(lease?.deviceId===deviceId&&lease.sessionId===sessionId)tx.set(ref,{devices,lease:null,updatedAtMs:now});
    }
    return {ok:true};
   });
  })
 };
};
