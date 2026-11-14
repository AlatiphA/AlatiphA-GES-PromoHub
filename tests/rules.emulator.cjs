'use strict';
const {test,before,after}=require('node:test'),fs=require('node:fs'),path=require('node:path');
// Dependencies live under functions so deployment excludes test tooling.
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('../functions/node_modules/@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,serverTimestamp,Bytes,collection,getDocs}=require('../functions/node_modules/firebase/firestore');
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-promohub',firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async context=>{
  const seedDb=context.firestore();
  for(const uid of ['alice','bob','suspended','trial','expired','paid'])await setDoc(doc(seedDb,'users',uid),{displayName:uid,photoURL:'',accountStatus:uid==='suspended'?'suspended':'active',accountTier:'premium',securitySchemaVersion:2});
  for(const uid of ['trial','expired','paid'])await updateDoc(doc(seedDb,'users',uid),{subscriptionSchema:1,accountTier:uid==='trial'?'free':'premium',trialEndsAtMs:Date.now()+604800000,subscriptionEndsAtMs:uid==='paid'?Date.now()+86400000:Date.now()-1000});
  await setDoc(doc(seedDb,'users/complimentary'),{accountStatus:'active',accountTier:'free',subscriptionSchema:1,subscriptionEndsAtMs:0,complimentaryReadingAccess:true});
  await setDoc(doc(seedDb,'protectedLibrary/current'),{schema:1,books:{}});
  await setDoc(doc(seedDb,'protectedLibraryChunks/book'),{bookId:'gespasco',data:Bytes.fromUint8Array(new Uint8Array([80,75,3,4]))});
 });
});
after(async()=>{if(env)await env.cleanup();});
function client(uid,verified=true){return env.authenticatedContext(uid,{email_verified:verified}).firestore();}
function progress(){return {bookId:'mat1',location:'epubcfi(/6/2)',chapter:'one',progress:10,updatedAt:serverTimestamp()};}

test('protected books deny unauthenticated, unverified, trial, expired and suspended readers',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),client('paid',false),client('trial'),client('expired'),client('suspended')]){
  await assertFails(getDoc(doc(db,'protectedLibrary/current')));
  await assertFails(getDoc(doc(db,'protectedLibraryChunks/book')));
 }
});
test('protected books allow paid, legacy Premium, complimentary and active administrators',async()=>{
 const adminDb=env.authenticatedContext('trial',{email_verified:true,promohubAdmin:true}).firestore();
 for(const db of [client('paid'),client('alice'),client('complimentary'),adminDb]){
  await assertSucceeds(getDoc(doc(db,'protectedLibrary/current')));
  await assertSucceeds(getDoc(doc(db,'protectedLibraryChunks/book')));
  await assertFails(getDocs(collection(db,'protectedLibraryChunks')));
 }
});
test('readers cannot upload protected chunks or publish a library manifest',async()=>{
 await assertFails(setDoc(doc(client('paid'),'protectedLibraryChunks/fake'),{bookId:'gespasco',data:Bytes.fromUint8Array(new Uint8Array([1]))}));
 await assertFails(setDoc(doc(client('complimentary'),'protectedLibrary/current'),{schema:1,books:{}}));
});
test('revoking complimentary access immediately denies further protected book reads',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/complimentary'),{complimentaryReadingAccess:false}));
 try{await assertFails(getDoc(doc(client('complimentary'),'protectedLibraryChunks/book')));}
 finally{await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/complimentary'),{complimentaryReadingAccess:true}));}
});
test('admin publication requires the complete protected book set',async()=>{
 const db=env.authenticatedContext('trial',{email_verified:true,promohubAdmin:true}).firestore();
 const books=Object.fromEntries(['gespasco','mat2','etmala','nfatfges','eigala'].map(id=>[id,{file:'./library/'+id+'.epub'}]));
 await assertFails(setDoc(doc(db,'protectedLibrary/current'),{schema:1,updatedAtMs:Date.now(),books:{gespasco:books.gespasco}}));
 await assertSucceeds(setDoc(doc(db,'protectedLibrary/current'),{schema:1,updatedAtMs:Date.now(),books}));
});
test('only a verified active administrator can upload bounded protected chunks',async()=>{
 const data={bookId:'gespasco',sha256:'a'.repeat(64),index:0,total:1,data:Bytes.fromUint8Array(new Uint8Array([80,75,3,4]))};
 const adminDb=env.authenticatedContext('trial',{email_verified:true,promohubAdmin:true}).firestore();
 await assertSucceeds(setDoc(doc(adminDb,'protectedLibraryChunks/admin-upload'),data));
 await assertFails(setDoc(doc(adminDb,'protectedLibraryChunks/oversized'),{...data,data:Bytes.fromUint8Array(new Uint8Array(307201))}));
 await assertFails(setDoc(doc(env.authenticatedContext('suspended',{email_verified:true,promohubAdmin:true}).firestore(),'protectedLibraryChunks/suspended-upload'),data));
});
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
test('clients cannot change login email or pending email metadata',async()=>{
 for(const update of [{email:'injected@example.test'},{pendingLoginEmail:'injected@example.test'},{emailVerified:true}]){
  await assertFails(updateDoc(doc(client('alice'),'users/alice'),{...update,updatedAt:serverTimestamp()}));
 }
});

test('inbox notices are private, server-created, and permit only true read marks',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/trial/notifications/n'),{title:'Notice',body:'Private',read:false,createdAt:serverTimestamp()});await setDoc(doc(db,'users/suspended/notifications/n'),{title:'Access changed',body:'Suspended',read:false,createdAt:serverTimestamp()});});
 await assertSucceeds(getDoc(doc(client('trial'),'users/trial/notifications/n')));
 await assertSucceeds(getDoc(doc(client('suspended'),'users/suspended/notifications/n')));
 await assertFails(getDoc(doc(client('bob'),'users/trial/notifications/n')));
 await assertFails(getDoc(doc(client('trial',false),'users/trial/notifications/n')));
 await assertFails(setDoc(doc(client('trial'),'users/trial/notifications/fake'),{title:'Fake',read:false}));
 await assertFails(updateDoc(doc(client('trial'),'users/trial/notifications/n'),{body:'Changed',read:true,readAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(client('trial'),'users/trial/notifications/n'),{read:true,readAt:1}));
 await assertSucceeds(updateDoc(doc(client('trial'),'users/trial/notifications/n'),{read:true,readAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(client('trial'),'users/trial/notifications/n'),{read:false,readAt:serverTimestamp()}));
});
test('announcements work for trial and expired active accounts; receipts cannot forge content or another account',async()=>{
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'announcements/notice'),{title:'Announcement',body:'Study reminder',createdAt:serverTimestamp()});});
 for(const uid of ['trial','expired'])await assertSucceeds(getDoc(doc(client(uid),'announcements/notice')));
 await assertFails(getDoc(doc(client('suspended'),'announcements/notice')));
 await assertFails(setDoc(doc(client('trial'),'announcements/fake'),{body:'Fake'}));
 await assertSucceeds(setDoc(doc(client('trial'),'users/trial/announcementReads/notice'),{read:true,readAt:serverTimestamp()}));
 await assertFails(setDoc(doc(client('bob'),'users/trial/announcementReads/notice'),{read:true,readAt:serverTimestamp()}));
 await assertFails(setDoc(doc(client('trial'),'users/trial/announcementReads/missing'),{read:true,readAt:serverTimestamp()}));
 await assertFails(setDoc(doc(client('trial'),'users/trial/announcementReads/notice'),{read:true,readAt:serverTimestamp(),body:'Forged'}));
 await assertFails(setDoc(doc(client('trial'),'notificationCommands/fake'),{audience:'all'}));
});

const tombstone={bookFile:'./library/mat1.epub',cfi:'epubcfi(/6/2)',chapter:'one',progress:10,date:'2026-10-14',deleted:true,updatedAtMs:Date.now(),updatedAt:serverTimestamp()};
test('bookmark deletion record is readable across sessions and stale clients cannot overwrite or erase it',async()=>{
 const ref=doc(client('alice'),'users/alice/bookmarks/deleted-bookmark');
 await assertSucceeds(setDoc(ref,tombstone));
 await assertSucceeds(getDoc(doc(client('alice'),'users/alice/bookmarks/deleted-bookmark')));
 await assertFails(setDoc(ref,{...tombstone,deleted:false}));
 await assertFails(updateDoc(ref,{deleted:false,updatedAt:serverTimestamp()}));
 await assertFails(require('../functions/node_modules/firebase/firestore').deleteDoc(ref));
 await assertFails(setDoc(doc(client('bob'),'users/alice/bookmarks/deleted-bookmark'),tombstone));
});

test('question reports, review state and push device tokens remain private to callable backend operations',async()=>{
 const db=client('alice');
 for(const path of ['questionReports/test','configuration/pushNotifications','users/alice/pushDevices/test','users/alice/pushDeliveries/test','users/alice/pushState/registration','users/alice/pushStatus/latest']){
  await assertFails(setDoc(doc(db,path),{enabled:true,status:'reviewed',token:'injected'}));
  await assertFails(getDoc(doc(db,path)));
 }
});

test('device-list state allows only verified active owner get; all client writes and collection lists remain denied',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  const seed=c.firestore();for(const uid of ['alice','bob','suspended','trial','expired'])await setDoc(doc(seed,`users/${uid}/access/reader`),{devices:[{id:'private-device',label:'Mobile'}],lease:null});
 });
 await assertSucceeds(getDoc(doc(client('alice'),'users/alice/access/reader')));
 for(const uid of ['trial','expired'])await assertSucceeds(getDoc(doc(client(uid),`users/${uid}/access/reader`)));
 await assertFails(getDoc(doc(client('bob'),'users/alice/access/reader')));
 await assertFails(getDoc(doc(client('alice',false),'users/alice/access/reader')));
 await assertFails(getDoc(doc(client('suspended'),'users/suspended/access/reader')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users/alice/access/reader')));
 await assertFails(setDoc(doc(client('alice'),'users/alice/access/reader'),{devices:[],lease:null}));
 await assertFails(updateDoc(doc(client('alice'),'users/alice/access/reader'),{devices:[]}));
 const {collection,getDocs,deleteDoc}=require('../functions/node_modules/firebase/firestore');
 await assertFails(deleteDoc(doc(client('alice'),'users/alice/access/reader')));
 await assertFails(getDocs(collection(client('alice'),'users/alice/access')));
 await assertFails(getDoc(doc(client('alice'),'users/alice/access/anything-else')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountDeletions/bob'),{started:true}));
 await assertFails(getDoc(doc(client('bob'),'users/bob/access/reader')));
});
