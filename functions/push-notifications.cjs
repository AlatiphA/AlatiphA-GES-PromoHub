'use strict';
const {createHash,ECDH}=require('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex');
module.exports=({onCall,onDocumentWritten,options,HttpsError,db,admin,member,stamp,audit})=>{
 const opts={...options,maxInstances:3},config=db.doc('configuration/pushNotifications');
 async function access(req,isAdmin=false){const uid=await member(req,isAdmin),a=await admin.auth().getUser(uid);if(a.disabled||!a.emailVerified||(await db.doc('accountDeletions/'+uid).get()).exists)throw new HttpsError('permission-denied','Verified active account required.');return uid;}
 function validKey(v){try{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(v))return false;const bytes=Buffer.from(v,'base64url');if(bytes.length!==65||bytes[0]!==4)return false;ECDH.convertKey(bytes,'prime256v1',undefined,undefined,'uncompressed');return true;}catch{return false;}}
 async function settings(){const s=await config.get(),p=s.data()||{};return {enabled:p.enabled===true&&validKey(p.publicKey),publicKey:validKey(p.publicKey)?p.publicKey:''};}
 function preferences(v){if(!v||['messages','payments','reminders'].some(k=>typeof v[k]!=='boolean'))throw new HttpsError('invalid-argument','Choose notification categories.');return {messages:v.messages,payments:v.payments,reminders:v.reminders};}
 const errorCode=e=>typeof e?.code==='string'&&/^[a-zA-Z0-9_/-]{1,100}$/.test(e.code)?e.code:'push/internal-error';
 async function eligible(uid){
  try{const [p,a,deletion]=await Promise.all([db.doc('users/'+uid).get(),admin.auth().getUser(uid),db.doc('accountDeletions/'+uid).get()]);return p.data()?.accountStatus==='active'&&a.emailVerified&&!a.disabled&&!deletion.exists;}
  catch(e){if(e.code==='auth/user-not-found')return false;throw e;}
 }
 async function send(uid,eventId,type,createdAtMs,noticeId,source){
  const now=Date.now(),status=db.doc(`users/${uid}/pushStatus/latest`),report={eventId:hash(eventId),category:type,source:source||'personal',noticeId:String(noticeId||''),attemptedAtMs:now,state:'checking',accepted:0,alreadyAccepted:0,failed:0,skipped:0,registered:0,reasons:{},errorCode:''};
  const reason=k=>{report.skipped++;report.reasons[k]=(report.reasons[k]||0)+1;};
  const finish=async state=>{report.state=state;await status.set({...report,updatedAtMs:Date.now()});console.info('PromoHub push outcome',JSON.stringify({state,eventId:report.eventId,accepted:report.accepted,failed:report.failed,skipped:report.skipped,errorCode:report.errorCode}));};
  try{
   if(now-createdAtMs>86400000){await finish('notice_expired');return;}
   if(!(await eligible(uid))){await finish('account_ineligible');return;}
   const snap=await db.collection(`users/${uid}/pushDevices`).where('enabled','==',true).limit(5).get();report.registered=snap.docs.length;
   if(!snap.docs.length){await finish('no_enabled_devices');return;}
   for(const d of snap.docs){
    const device=d.data();
    if(device.enabled!==true){reason('disabled');continue;}
    if(!device.preferences?.[type]){reason('category_off');continue;}
    if(device.enabledAtMs>createdAtMs){reason('registered_after_notice');continue;}
    if(now-device.lastSeenMs>30*86400000){reason('registration_stale');continue;}
    const delivery=db.doc(`users/${uid}/pushDeliveries/`+hash(eventId+'|'+d.id));let claim=false;
    await db.runTransaction(async tx=>{const s=await tx.get(delivery),p=s.data();if(p?.state==='sent'){report.alreadyAccepted++;return;}if(p?.leaseUntilMs>now)throw Error('Push delivery still in progress; retry later.');tx.set(delivery,{state:'sending',leaseUntilMs:now+120000,updatedAtMs:now});claim=true;});if(!claim)continue;
    try{
     await (typeof admin.messaging === 'function' ? admin.messaging() : require('firebase-admin/messaging').getMessaging()).send({token:device.token,data:{promoHub:'1',uid,eventId:hash(eventId),noticeId:String(noticeId||''),source:source||'personal',title:type==='payments'?'Payment approved':type==='reminders'?'Subscription reminder':'PromoHub message',body:'Open PromoHub to view your notification.'},webpush:{headers:{TTL:'86400',Urgency:'normal'}}});
     report.accepted++;await delivery.set({state:'sent',sentAt:stamp(),updatedAtMs:Date.now()});
    }catch(e){
     report.failed++;report.errorCode=errorCode(e);await delivery.set({state:'failed',leaseUntilMs:0,errorCode:report.errorCode,updatedAtMs:Date.now()});
     // INVALID_ARGUMENT can describe a bad payload, not a revoked browser token.
     // Disable only when FCM explicitly identifies an unusable registration.
     if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code)){
      await db.doc(`users/${uid}/pushDevices/${d.id}`).set({enabled:false,disabledReason:report.errorCode},{merge:true});
      await db.runTransaction(async tx=>{const state=db.doc(`users/${uid}/pushState/registration`),s=await tx.get(state);tx.set(state,{ids:(s.data()?.ids||[]).filter(v=>v!==d.id)});});
     }else throw e;
    }
   }
   await finish(report.accepted?'accepted_by_fcm':report.failed?'failed':report.alreadyAccepted?'already_accepted':'no_matching_devices');
  }catch(e){report.errorCode=errorCode(e);await finish('failed');throw e;}
 }
 const time=n=>typeof n?.createdAt?.toMillis==='function'?n.createdAt.toMillis():Number(n.createdAtMs)||Date.now();
 return {
 getPromoHubPushDiagnostics:onCall(opts,async req=>{
  await access(req,true);const uid=req.data?.uid;if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new HttpsError('invalid-argument','Choose a user.');
  const [cfg,user,deleted,devices,last]=await Promise.all([settings(),db.doc('users/'+uid).get(),db.doc('accountDeletions/'+uid).get(),db.collection(`users/${uid}/pushDevices`).limit(100).get(),db.doc(`users/${uid}/pushStatus/latest`).get()]);
  let authStatus='active_verified';try{const a=await admin.auth().getUser(uid);if(a.disabled)authStatus='disabled';else if(!a.emailVerified)authStatus='unverified';}catch(e){authStatus=e.code==='auth/user-not-found'?'missing':'lookup_failed';}
  await access(req,true);
  const v=last.data();const latest=v?{state:String(v.state||''),attemptedAtMs:Number(v.attemptedAtMs)||0,updatedAtMs:Number(v.updatedAtMs)||0,category:['messages','payments','reminders'].includes(v.category)?v.category:'',accepted:Number(v.accepted)||0,alreadyAccepted:Number(v.alreadyAccepted)||0,failed:Number(v.failed)||0,skipped:Number(v.skipped)||0,reasons:Object.fromEntries(Object.entries(v.reasons||{}).filter(([k])=>['disabled','category_off','registered_after_notice','registration_stale'].includes(k)).map(([k,n])=>[k,Number(n)||0])),errorCode:typeof v.errorCode==='string'&&/^[a-zA-Z0-9_/-]{0,100}$/.test(v.errorCode)?v.errorCode:''}:null;
  return {enabled:cfg.enabled,accountStatus:user.data()?.accountStatus||'missing',authStatus,deleting:deleted.exists,devices:devices.docs.map((d,i)=>{const p=d.data();return {browser:i+1,enabled:p.enabled===true,lastSeenMs:Number(p.lastSeenMs)||0,stale:Date.now()-Number(p.lastSeenMs||0)>30*86400000,categories:['messages','payments','reminders'].filter(k=>p.preferences?.[k]===true)};}),latest};
 }),
 getPromoHubPushSettings:onCall(opts,async req=>{await access(req);return settings();}),
 setPromoHubPushSettings:onCall(opts,async req=>{const actor=await access(req,true);const d=req.data||{};if(typeof d.enabled!=='boolean'||!validKey(d.publicKey))throw new HttpsError('invalid-argument','Paste the public Web Push key generated by Firebase.');await db.runTransaction(async tx=>{const p=await tx.get(db.doc('users/'+actor));if(p.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Administrator inactive.');tx.set(config,{enabled:d.enabled,publicKey:d.publicKey,updatedAt:stamp()});audit(tx,actor,'push.configured',actor,{enabled:d.enabled});});return settings();}),
 registerPromoHubPushDevice:onCall(opts,async req=>{
  const uid=await access(req),d=req.data||{},prefs=preferences(d.preferences);if(d.ownerUid!==uid)throw new HttpsError('permission-denied','Account changed. Reopen notification settings.');if(typeof d.token!=='string'||d.token.length<20||d.token.length>4096||/[\s\x00-\x1f]/.test(d.token))throw new HttpsError('invalid-argument','Invalid push token.');if(!(await settings()).enabled)throw new HttpsError('failed-precondition','Push notifications have not been configured.');
  const id=hash(d.token),ref=db.doc(`users/${uid}/pushDevices/${id}`),now=Date.now();
  await db.runTransaction(async tx=>{const stateRef=db.doc(`users/${uid}/pushState/registration`),[old,state,user]=await Promise.all([tx.get(ref),tx.get(stateRef),tx.get(db.doc('users/'+uid))]);if(user.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Account inactive.');const oldId=/^[a-f0-9]{64}$/.test(d.previousId||'')&&d.previousId!==id?d.previousId:null,previousIds=state.data()?.ids||[],previousRecords=await Promise.all(previousIds.map(v=>tx.get(db.doc(`users/${uid}/pushDevices/${v}`)))),ids=previousIds.filter((v,i)=>v!==oldId&&previousRecords[i].data()?.enabled===true&&now-previousRecords[i].data().lastSeenMs<=30*86400000);if(!ids.includes(id)&&ids.length>=5)throw new HttpsError('resource-exhausted','Push limit reached. Disable an older browser first.');for(const oldToken of previousIds)if(oldToken!==id&&!ids.includes(oldToken))tx.delete(db.doc(`users/${uid}/pushDevices/${oldToken}`));if(oldId&&!previousIds.includes(oldId))tx.delete(db.doc(`users/${uid}/pushDevices/${oldId}`));tx.set(ref,{token:d.token,preferences:prefs,enabled:true,enabledAtMs:old.data()?.enabled===true&&now-old.data().lastSeenMs<=30*86400000?old.data().enabledAtMs:now,lastSeenMs:now,updatedAt:stamp()},{merge:true});tx.set(stateRef,{ids:[...new Set([...ids,id])]});});return {ok:true,id};
 }),
 unregisterPromoHubPushDevice:onCall(opts,async req=>{const uid=await access(req),id=req.data?.id;if(req.data?.ownerUid!==uid)throw new HttpsError('permission-denied','Account changed.');if(!/^[a-f0-9]{64}$/.test(id||''))throw new HttpsError('invalid-argument','Invalid push device.');await db.runTransaction(async tx=>{const state=db.doc(`users/${uid}/pushState/registration`),s=await tx.get(state);tx.set(state,{ids:(s.data()?.ids||[]).filter(v=>v!==id)});tx.delete(db.doc(`users/${uid}/pushDevices/${id}`));});return {ok:true};}),
 sendPromoHubPersonalPush:onDocumentWritten({document:'users/{uid}/notifications/{noticeId}',region:'africa-south1',retry:true,maxInstances:2,timeoutSeconds:540},async event=>{
  if(event.data?.before?.exists||!event.data?.after?.exists)return;if(!(await settings()).enabled){await db.doc(`users/${event.params.uid}/pushStatus/latest`).set({state:'configuration_off',attemptedAtMs:Date.now(),updatedAtMs:Date.now(),category:'',accepted:0,failed:0,skipped:0,errorCode:'',reasons:{}});return;}const n=event.data.after.data();const type=n.type==='message'?'messages':n.type==='payment'&&n.title==='Payment approved'?'payments':n.type==='subscription.expiryReminder'?'reminders':null;if(type)await send(event.params.uid,event.id,type,time(n),event.params.noticeId,'personal');
 }),
 sendPromoHubAnnouncementPush:onDocumentWritten({document:'announcements/{id}',region:'africa-south1',retry:true,maxInstances:1,timeoutSeconds:540},async event=>{
  if(event.data?.before?.exists||!event.data?.after?.exists||!(await settings()).enabled)return;let cursor;do{if(!(await settings()).enabled)return;let q=db.collection('users').orderBy('__name__').limit(100);if(cursor)q=q.startAfter(cursor);const snap=await q.get();for(let i=0;i<snap.docs.length;i+=10)await Promise.all(snap.docs.slice(i,i+10).filter(p=>p.data().accountStatus==='active').map(p=>send(p.id,event.id,'messages',time(event.data.after.data()),event.params.id,'announcement')));cursor=snap.docs.length===100?snap.docs.at(-1).id:null;}while(cursor);
 })};
};
