'use strict';
// Owner-only local operation using Application Default Credentials. Never publish this script as an endpoint.
const admin = require('firebase-admin');
// Bridge namespace calls to modular APIs for Admin SDK 14.
if (typeof admin.firestore !== 'function') {
 const {getFirestore, FieldValue, FieldPath} = require('firebase-admin/firestore');
 admin.firestore = Object.assign(getFirestore, {FieldValue, FieldPath});
}
if (typeof admin.auth !== 'function') admin.auth = require('firebase-admin/auth').getAuth;
admin.initializeApp({projectId:'ges-promohub'});
(async()=>{
 const uid=process.argv[2], revoke=process.argv[3]==='revoke';
 if(!uid) throw new Error('Usage: node bootstrap-admin.cjs UID [revoke]');
 const user=await admin.auth().getUser(uid);
 if(!user.emailVerified || user.disabled) throw new Error('An enabled, verified account is required.');
 const profile=(await admin.firestore().doc(`users/${uid}`).get()).data() || {};
 const claims={...user.customClaims};
 if(revoke) delete claims.promohubAdmin; else claims.promohubAdmin=true;
 await admin.auth().setCustomUserClaims(uid,claims);
 await admin.firestore().doc(`users/${uid}`).set({accountStatus:'active',accountTier:profile.securitySchemaVersion===2 && profile.accountTier==='premium'?'premium':'free',securitySchemaVersion:2,email:user.email,displayName:user.displayName || '',photoURL:user.photoURL || '',updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 console.log(revoke?'Administrator access removed.':'Administrator access granted. Sign out and sign in again.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
