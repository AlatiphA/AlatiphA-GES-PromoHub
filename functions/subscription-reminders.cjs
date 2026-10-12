'use strict';
const {createHash}=require('node:crypto');
const DAY=86400000;
function stage(profile,now){
 const expiry=Number(profile?.subscriptionEndsAtMs),days=Math.ceil((expiry-now)/DAY);
 if(profile?.accountStatus!=='active'||profile.subscriptionSchema!==1||profile.accountTier!=='premium'||!Number.isFinite(expiry)||expiry<=now||days>7)return null;
 return {expiry,days,threshold:days<=1?1:days<=3?3:7};
}
module.exports=function({onSchedule,db,admin,stamp,clock=Date.now}){
 const sendPromoHubSubscriptionReminders=onSchedule({region:'us-central1',schedule:'0 8 * * *',timeZone:'Africa/Accra',maxInstances:1,concurrency:1,timeoutSeconds:540,attemptDeadlineSeconds:540,retryCount:3,minBackoffSeconds:60,maxBackoffSeconds:600,maxRetrySeconds:3600},async()=>{
  const start=clock(),counts={scanned:0,created:0};let cursor=null;
  while(true){
   let query=db.collection('users').where('subscriptionEndsAtMs','>',start).where('subscriptionEndsAtMs','<=',start+7*DAY).orderBy('subscriptionEndsAtMs').limit(100);
   if(cursor)query=query.startAfter(cursor);
   const page=await query.get();if(!page.docs.length)break;counts.scanned+=page.docs.length;
   const candidates=page.docs.filter(d=>stage(d.data(),clock()));
   if(candidates.length){
    const result=await admin.auth().getUsers(candidates.map(d=>({uid:d.id}))),auth=new Map(result.users.map(u=>[u.uid,u]));
    for(let offset=0;offset<candidates.length;offset+=10){
     await Promise.all(candidates.slice(offset,offset+10).map(async doc=>{
      const user=auth.get(doc.id);if(!user || user.disabled || !user.emailVerified || user.customClaims?.promohubAdmin===true)return;
      const candidate=stage(doc.data(),clock());if(!candidate)return;
      const id='expiry-'+createHash('sha256').update(doc.id+'|'+candidate.expiry+'|'+candidate.threshold).digest('hex'),notice=db.doc(`users/${doc.id}/notifications/${id}`);
      const created=await db.runTransaction(async tx=>{
       const [current,deleted,existing]=await Promise.all([tx.get(doc.ref),tx.get(db.doc(`accountDeletions/${doc.id}`)),tx.get(notice)]);
       const due=stage(current.data(),clock());
       if(!current.exists || deleted.exists || existing.exists || !due || due.expiry!==candidate.expiry || due.threshold!==candidate.threshold)return false;
       const expiry=new Date(due.expiry).toLocaleString('en-GB',{timeZone:'Africa/Accra',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
       const remaining=due.expiry-clock()<DAY?'less than 1 day':due.days+' '+(due.days===1?'day':'days');
       tx.set(notice,{title:'Subscription expiry reminder',body:`Your paid subscription has ${remaining} remaining and expires on ${expiry} (Ghana time). Select Renew subscription to choose a plan and submit a verified MoMo transaction ID. Renewal activates after administrator payment verification.`,type:'subscription.expiryReminder',subscriptionEndsAtMs:due.expiry,reminderThresholdDays:due.threshold,read:false,createdAt:stamp()});
       return true;
      });
      if(created)counts.created++;
     }));
    }
   }
   cursor=page.docs.at(-1);if(page.docs.length<100)break;
  }
  console.info('PromoHub subscription reminders completed',counts);return counts;
 });
 return {sendPromoHubSubscriptionReminders};
};
module.exports.stage=stage;
