'use strict';
const subscriptions=require('./subscriptions.cjs'),{createHash}=require('node:crypto');
module.exports=function({onCall,options,HttpsError,db,member,identity,target,stamp,audit,policy}){
 const hash=r=>createHash('sha256').update(r).digest('hex');
 return {
 submitPromoHubPayment:onCall(options,async req=>{
  const uid=await member(req),planId=req.data?.planId,plan=Object.hasOwn(subscriptions.plans,planId)?subscriptions.plans[planId]:null,reference=subscriptions.reference(req.data?.reference);
  if(!plan || !reference)throw new HttpsError('invalid-argument','Select a plan and enter a valid MoMo transaction reference (6 to 80 letters, numbers or hyphens).');
  const ref=db.doc(`subscriptionRequests/${uid}`);
  await db.runTransaction(async tx=>{
   const [u,r,used]=await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(ref),tx.get(db.doc(`subscriptionPayments/${hash(reference)}`))]);
   if(!policy.active(u.data()))throw new HttpsError('permission-denied','Account is not active.');
   if(used.exists)throw new HttpsError('already-exists','This payment reference has already been approved.');
   if(r.data()?.status==='pending'){
    if(r.data().reference===reference && r.data().planId===planId)return;
    throw new HttpsError('failed-precondition','Your previous payment is still awaiting review.');
   }
   tx.set(ref,{uid,planId,months:plan.months,amountGhs:plan.price,reference,status:'pending',requestedAtMs:Date.now(),updatedAt:stamp()});
   audit(tx,uid,'subscription.request',uid,{planId,amountGhs:plan.price});
  });return {status:'pending'};
 }),
 reviewPromoHubPayment:onCall(options,async req=>{
  const actor=await member(req,true),uid=target(req),decision=req.data?.decision;
  if(!['approved','rejected'].includes(decision))throw new HttpsError('invalid-argument','Invalid decision.');
  const ref=db.doc(`subscriptionRequests/${uid}`),user=db.doc(`users/${uid}`);
  let end=null;
  await db.runTransaction(async tx=>{
   const [a,u,r]=await Promise.all([tx.get(db.doc(`users/${actor}`)),tx.get(user),tx.get(ref)]);
   if(!policy.administrator(req.auth.token,a.data()))throw new HttpsError('permission-denied','Administrator access required.');
   if(!u.exists || !policy.active(u.data()) || r.data()?.status!=='pending')throw new HttpsError('failed-precondition','No active pending payment.');
   const request=r.data(),plan=Object.hasOwn(subscriptions.plans,request.planId)?subscriptions.plans[request.planId]:null,reference=subscriptions.reference(request.reference);
   if(!plan || !reference || request.amountGhs!==plan.price)throw new HttpsError('failed-precondition','Invalid payment details.');
   const receipt=db.doc(`subscriptionPayments/${hash(reference)}`),used=await tx.get(receipt);
   if(decision==='approved'){
    if(req.data?.verifiedPayment!==true || Number(req.data?.amountGhs)!==plan.price)throw new HttpsError('failed-precondition','Verify the received MoMo payment and confirm the exact plan amount.');
    if(used.exists)throw new HttpsError('already-exists','This payment was already applied to a subscription.');
    const now=Date.now(),start=subscriptions.paid(u.data(),now)?u.data().subscriptionEndsAtMs:now;
    end=subscriptions.addMonths(start,plan.months);
    tx.set(receipt,{uid,reference,planId:request.planId,amountGhs:plan.price,approvedBy:actor,approvedAtMs:now,startsAtMs:start,endsAtMs:end});
    tx.update(user,{subscriptionSchema:1,accountTier:'premium',subscriptionPlan:request.planId,subscriptionStatus:'active',subscriptionEndsAtMs:end,updatedAt:stamp()});
   }
   tx.update(ref,{status:decision,reviewedBy:actor,reviewedAtMs:Date.now(),updatedAt:stamp(),...(end?{subscriptionEndsAtMs:end}:{})});
   audit(tx,actor,`subscription.${decision}`,uid,{planId:request.planId,amountGhs:plan.price,...(end?{endsAtMs:end}:{})});
  });return {status:decision,subscriptionEndsAtMs:end};
 }),
 getMyPromoHubPayment:onCall(options,async req=>{
  const uid=identity(req);const r=await db.doc(`subscriptionRequests/${uid}`).get();return {request:r.exists?r.data():null};
 })
 };
};
