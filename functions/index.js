'use strict';
const admin = require('firebase-admin');
// Bridge namespace calls to modular APIs for Admin SDK 14.
if (typeof admin.firestore !== 'function') {
 const {getFirestore, FieldValue, FieldPath} = require('firebase-admin/firestore');
 admin.firestore = Object.assign(getFirestore, {FieldValue, FieldPath});
}
if (typeof admin.auth !== 'function') admin.auth = require('firebase-admin/auth').getAuth;
const {onCall,HttpsError} = require('firebase-functions/v2/https');
const policy = require('./policy');
const subscriptions = require('./subscriptions.cjs');
admin.initializeApp();
const db = admin.firestore();
const stamp = () => admin.firestore.FieldValue.serverTimestamp();
const options = {region:'us-central1', maxInstances:10};
function identity(req) {
 if (!req.auth) throw new HttpsError('unauthenticated','Sign in first.');
 if (!policy.verified(req.auth.token)) throw new HttpsError('permission-denied','Verify your email first.');
 return req.auth.uid;
}
async function member(req, requireAdmin=false) {
 const uid = identity(req), snap = await db.doc(`users/${uid}`).get();
 if (!policy.active(snap.data())) throw new HttpsError('permission-denied','Account is not active.');
 if (requireAdmin) {
  const actual=await admin.auth().getUser(uid);
  if (actual.disabled || actual.customClaims?.promohubAdmin !== true || !policy.administrator(req.auth.token,snap.data())) throw new HttpsError('permission-denied','Administrator access required.');
 }
 return uid;
}
function target(req) {
 const uid = req.data?.uid;
 if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument','Invalid account.');
 return uid;
}
function audit(tx,actor,action,uid,details={}) {
 tx.set(db.collection('auditLogs').doc(), {actor,action,targetUid:uid,details,createdAt:stamp()});
}
exports.initializePromoHubAccount = onCall(options,async req => {
 const uid=identity(req), record=await admin.auth().getUser(uid);
 if ((await db.doc(`accountDeletions/${uid}`).get()).exists) throw new HttpsError('permission-denied','Account deletion is in progress.');
 if (!record.emailVerified || record.disabled) throw new HttpsError('permission-denied','Account cannot be activated.');
 const ref=db.doc(`users/${uid}`);
 await db.runTransaction(async tx => {
  const old=await tx.get(ref), p=old.data() || {};
  if (old.exists && p.accountStatus && !policy.active(p)) throw new HttpsError('permission-denied','Account is not active.');
  const data={displayName:policy.safeName(p.displayName || p.name || record.displayName),email:record.email || '',photoURL:record.photoURL || '',emailVerified:true,updatedAt:stamp()};
  // Never accept tier, status, or role from a browser. Preserve valid existing server-managed values.
  if (!old.exists || !p.accountStatus) data.accountStatus='active';
  if (!old.exists || p.securitySchemaVersion !== 2 || !['free','premium'].includes(p.accountTier)) data.accountTier='free';
  Object.assign(data,subscriptions.initial(p));
  data.securitySchemaVersion=2;
  if (!old.exists) data.createdAt=stamp();
  tx.set(ref,data,{merge:true});
 });
 return (await ref.get()).data();
});
exports.requestPremiumAccess = onCall(options,async req => {
 const uid=await member(req), ref=db.doc(`premiumRequests/${uid}`), user=db.doc(`users/${uid}`);
 await db.runTransaction(async tx => {
  const [u,r]=await Promise.all([tx.get(user),tx.get(ref)]);
  if (!policy.active(u.data())) throw new HttpsError('permission-denied','Account is not active.');
  if(u.data().subscriptionSchema===1)throw new HttpsError('failed-precondition','Select a subscription plan and submit your MoMo payment reference.');
  if (u.data().accountTier==='premium') throw new HttpsError('failed-precondition','Premium is already active.');
  if (r.data()?.status==='pending') return;
  tx.set(ref,{uid,status:'pending',requestedAt:stamp(),updatedAt:stamp()});
  audit(tx,uid,'premium.request',uid);
 });
 return {status:'pending'};
});
exports.reviewPremiumRequest = onCall(options,async req => {
 const actor=await member(req,true), uid=target(req), decision=req.data?.decision;
 if (!policy.reviewDecision(decision)) throw new HttpsError('invalid-argument','Invalid decision.');
 const ref=db.doc(`premiumRequests/${uid}`), user=db.doc(`users/${uid}`);
 await db.runTransaction(async tx => {
  const [a,r,u]=await Promise.all([tx.get(db.doc(`users/${actor}`)),tx.get(ref),tx.get(user)]);
  if (!policy.administrator(req.auth.token,a.data())) throw new HttpsError('permission-denied','Administrator access required.');
  if (r.data()?.status!=='pending' || !policy.active(u.data())) throw new HttpsError('failed-precondition','No active pending request.');
  tx.update(ref,{status:decision,reviewedBy:actor,reviewedAt:stamp(),updatedAt:stamp()});
  if(decision==='approved')throw new HttpsError('failed-precondition','Approve paid plans through subscription payment verification.');
  if (decision==='approved') tx.update(user,{accountTier:'premium',updatedAt:stamp()});
  audit(tx,actor,`premium.${decision}`,uid);
 });
 return {status:decision};
});
exports.managePromoHubUser = onCall(options,async req => {
 const actor=await member(req,true), uid=target(req), action=req.data?.action;
 if (uid===actor) throw new HttpsError('failed-precondition','You cannot restrict your own account.');
 if (!policy.userAction(action)) throw new HttpsError('invalid-argument','Invalid action.');
 const targetAuth=await admin.auth().getUser(uid);
 if (targetAuth.customClaims?.promohubAdmin) throw new HttpsError('permission-denied','Manage administrators through the owner bootstrap process.');
 await db.runTransaction(async tx => {
  const [a,u]=await Promise.all([tx.get(db.doc(`users/${actor}`)),tx.get(db.doc(`users/${uid}`))]);
  if (!policy.administrator(req.auth.token,a.data())) throw new HttpsError('permission-denied','Administrator access required.');
  if (!u.exists) throw new HttpsError('not-found','Account not found.');
  const changes={updatedAt:stamp()};
  if(action==='free'){changes.accountTier='free';changes.subscriptionSchema=1;changes.subscriptionEndsAtMs=0;changes.subscriptionStatus='cancelled';}
  else changes.accountStatus={suspend:'suspended',disable:'disabled',reactivate:'active'}[action];
  tx.update(u.ref,changes); audit(tx,actor,`account.${action}`,uid);
 });
 // Status in Firestore is authoritative even if token revocation fails.
 if(action==='suspend' || action==='disable') await admin.auth().revokeRefreshTokens(uid);
 return {ok:true};
});
exports.getPromoHubUsers = onCall(options,async req => {
 await member(req,true);
 let q=db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(25);
 if(typeof req.data?.cursor==='string') q=q.startAfter(req.data.cursor);
 const snap=await q.get();
 return {users:snap.docs.map(d=>({uid:d.id,...d.data()})),cursor:snap.size===25?snap.docs.at(-1).id:null};
});
exports.getPromoHubAdminSummary = onCall(options,async req => {
 await member(req,true);
 const [users,pending,premium]=await Promise.all([db.collection('users').count().get(),db.collection('subscriptionRequests').where('status','==','pending').count().get(),db.collection('users').where('accountTier','==','premium').count().get()]);
 return {users:users.data().count,pending:pending.data().count,premium:premium.data().count};
});
exports.getPromoHubAdminRecords = onCall(options,async req => {
 await member(req,true);
 const kind=req.data?.kind || 'requests';
 if(!['requests','payments','audit'].includes(kind))throw new HttpsError('invalid-argument','Invalid records view.');
 const query=kind==='audit' ? db.collection('auditLogs').orderBy('createdAt','desc').limit(50) : db.collection(kind==='payments'?'subscriptionRequests':'premiumRequests').where('status','==','pending').limit(50);
 const snap=await query.get(), accounts=new Map();
 function account(uid){
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))return Promise.resolve({displayName:'',email:'',available:false});
  if(!accounts.has(uid))accounts.set(uid,db.doc(`users/${uid}`).get().then(s=>{
   const p=s.data() || {};
   return {displayName:typeof p.displayName==='string'?p.displayName:typeof p.name==='string'?p.name:'',email:typeof p.email==='string'?p.email:'',available:s.exists};
  }));
  return accounts.get(uid);
 }
 const records=await Promise.all(snap.docs.map(async d=>{
  const r={...d.data(),id:d.id};
  const [targetAccount,actorAccount]=await Promise.all([account(kind==='audit'?r.targetUid:r.uid),kind==='audit'?account(r.actor):Promise.resolve(null)]);
  return {...r,account:targetAccount,...(kind==='audit'?{actorAccount}:{})};
 }));
 return {records};
});
exports.deletePromoHubAccount = onCall(options,async req => {
 const uid=identity(req);
 if (Date.now()/1000 - req.auth.token.auth_time > 300) throw new HttpsError('failed-precondition','Sign in again before deleting your account.');
 if(req.auth.token.promohubAdmin) throw new HttpsError('failed-precondition','Remove administrator privileges through the owner process first.');
 if(req.data?.confirmation!=='DELETE') throw new HttpsError('invalid-argument','Type DELETE to confirm.');
 const ref=db.doc(`users/${uid}`);
 // Deny cloud access before cleanup. Retries remain possible with recent authentication.
 await db.doc(`accountDeletions/${uid}`).set({startedAt:stamp()});
 await ref.set({accountStatus:'disabled',updatedAt:stamp()},{merge:true});
 await db.recursiveDelete(ref);
 await db.doc(`premiumRequests/${uid}`).delete();
 await db.doc(`subscriptionRequests/${uid}`).delete();
 await admin.auth().deleteUser(uid);
 return {ok:true};
});

Object.assign(exports,require('./payments.cjs')({onCall,options,HttpsError,db,member,identity,target,stamp,audit,policy}));
