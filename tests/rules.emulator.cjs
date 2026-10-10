'use strict';
const {test,before,after}=require('node:test'),fs=require('node:fs'),path=require('node:path');
// Dependencies live under functions so deployment excludes test tooling.
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('../functions/node_modules/@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,serverTimestamp}=require('../functions/node_modules/firebase/firestore');
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-promohub',firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async context=>{
  const seedDb=context.firestore();
  for(const uid of ['alice','bob','suspended','trial','expired','paid'])await setDoc(doc(seedDb,'users',uid),{displayName:uid,photoURL:'',accountStatus:uid==='suspended'?'suspended':'active',accountTier:'premium',securitySchemaVersion:2});
  for(const uid of ['trial','expired','paid'])await updateDoc(doc(seedDb,'users',uid),{subscriptionSchema:1,accountTier:uid==='paid'?'premium':'free',trialEndsAtMs:Date.now()+604800000,subscriptionEndsAtMs:uid==='paid'?Date.now()+86400000:Date.now()-1000});
 });
});
after(async()=>{if(env)await env.cleanup();});
function client(uid,verified=true){return env.authenticatedContext(uid,{email_verified:verified}).firestore();}
function progress(){return {bookId:'mat1',location:'epubcfi(/6/2)',chapter:'one',progress:10,updatedAt:serverTimestamp()};}
test('verified active owner can save own progress',()=>assertSucceeds(setDoc(doc(client('alice'),'users/alice/readerData/mat1'),progress())));
test('owner cannot change tier',()=>assertFails(updateDoc(doc(client('alice'),'users/alice'),{accountTier:'premium'})));
test('unverified token cannot access progress',()=>assertFails(getDoc(doc(client('alice',false),'users/alice/readerData/mat1'))));
test('cross-account write is denied',()=>assertFails(setDoc(doc(client('bob'),'users/alice/readerData/mat1'),progress())));
test('suspended user cannot write progress',()=>assertFails(setDoc(doc(client('suspended'),'users/suspended/readerData/mat1'),progress())));
test('client cannot create profile or approve Premium',async()=>{
 await assertFails(setDoc(doc(client('new'),'users/new'),{accountStatus:'active',accountTier:'premium'}));
 await assertFails(setDoc(doc(client('alice'),'premiumRequests/alice'),{status:'approved'}));
});
test('client cannot create audit logs',()=>assertFails(setDoc(doc(client('alice'),'auditLogs/fake'),{action:'approved'})));
test('invalid progress percentage is denied',()=>assertFails(setDoc(doc(client('alice'),'users/alice/readerData/mat1'),{...progress(),progress:999})));
test('profile permits only allowed fields with server timestamp',()=>assertSucceeds(updateDoc(doc(client('alice'),'users/alice'),{displayName:'Alice',updatedAt:serverTimestamp()})));
test('v1.6.0 reading path accepts existing book-specific schema',()=>assertSucceeds(setDoc(doc(client('alice'),'users/alice/reading/mat1-epub'),{bookFile:'./library/mat1.epub',cfi:'epubcfi(/6/2)',chapter:'one',progress:10,updatedAtMs:Date.now(),updatedAt:serverTimestamp()})));
test('v1.6.0 reader preferences path remains writable',()=>assertSucceeds(setDoc(doc(client('alice'),'users/alice/preferences/reader'),{theme:'sepia',libraryTheme:'light',fontSize:120,fontFamily:'serif',updatedAtMs:Date.now(),updatedAt:serverTimestamp()})));
test('v1.6.0 bookmark schema is accepted for verified owner',()=>assertSucceeds(setDoc(doc(client('alice'),'users/alice/bookmarks/legacy'),{bookFile:'./library/mat1.epub',cfi:'epubcfi(/6/2)',chapter:'one',progress:10,date:'2026-10-09',updatedAtMs:Date.now(),updatedAt:serverTimestamp()})));
test('suspended user cannot write original reader schema',()=>assertFails(setDoc(doc(client('suspended'),'users/suspended/reading/mat1-epub'),{bookFile:'./library/mat1.epub',cfi:'epubcfi(/6/2)',chapter:'one',progress:10,updatedAtMs:Date.now(),updatedAt:serverTimestamp()})));

test('trial and expired accounts cannot save or read cloud reader data',async()=>{
 for(const uid of ['trial','expired']){
  await assertFails(setDoc(doc(client(uid),`users/${uid}/readerData/mat1`),progress()));
  await assertFails(getDoc(doc(client(uid),`users/${uid}/readerData/mat1`)));
 }
});
test('paid subscription permits cloud saving and clients cannot extend expiry',async()=>{
 await assertSucceeds(setDoc(doc(client('paid'),'users/paid/readerData/mat1'),progress()));
 await assertFails(updateDoc(doc(client('paid'),'users/paid'),{subscriptionEndsAtMs:Date.now()+999999999}));
});
test('trial users can still edit their name but cannot submit client-approved payments',async()=>{
 await assertSucceeds(updateDoc(doc(client('trial'),'users/trial'),{displayName:'Trial reader',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(client('trial'),'subscriptionRequests/trial'),{status:'approved'}));
 await assertFails(setDoc(doc(client('trial'),'subscriptionPayments/fake'),{uid:'trial'}));
});
