'use strict';
function normalize(value){return typeof value==='string'?value.trim().normalize('NFKC').toLowerCase():'';}
function entry(uid,p){return {uid,displayName:String(p.displayName||p.name||'').slice(0,100),email:String(p.email||'').slice(0,254),nameKey:normalize(p.displayName||p.name).slice(0,100),emailKey:normalize(p.email).slice(0,254),accountTier:p.accountTier==='premium'?'premium':'free',accountStatus:['active','suspended','disabled'].includes(p.accountStatus)?p.accountStatus:'unknown',readingAccessMode:p.readingAccessMode==='offline'?'offline':'strict',subscriptionSchema:p.subscriptionSchema||0,subscriptionEndsAtMs:Number(p.subscriptionEndsAtMs)||0,trialEndsAtMs:Number(p.trialEndsAtMs)||0};}
module.exports=({onCall,onDocumentWritten,options,HttpsError,db,admin,member})=>{
 const meta=db.doc('adminDirectoryStatus/users'),collection='adminUserDirectory';
 const validUid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
 async function synchronize(uid){
  const source=db.doc(`users/${uid}`),dest=db.doc(`${collection}/${uid}`);
  await db.runTransaction(async tx=>{const [s,d]=await Promise.all([tx.get(source),tx.get(dest)]);if(!s.exists){if(d.exists)tx.delete(dest);return;}const value=entry(uid,s.data());if(JSON.stringify(d.data())!==JSON.stringify(value))tx.set(dest,value);});
 }
 return {
  syncPromoHubUserDirectory:onDocumentWritten({...options,document:'users/{uid}',retry:true},event=>synchronize(event.params.uid)),
  preparePromoHubUserDirectory:onCall(options,async req=>{
   await member(req,true);const cursor=req.data?.cursor;
   if(cursor!==undefined&&!validUid(cursor))throw new HttpsError('invalid-argument','Invalid directory cursor.');
   let q=db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(100);
   if(cursor)q=q.startAfter(cursor);
   const page=await q.get();
   await db.runTransaction(async tx=>{
    const current=await Promise.all(page.docs.map(d=>tx.get(db.doc(`users/${d.id}`))));
    for(let i=0;i<page.docs.length;i++){const dest=db.doc(`${collection}/${page.docs[i].id}`);if(current[i].exists)tx.set(dest,entry(page.docs[i].id,current[i].data()));else tx.delete(dest);}
    if(page.size<100)tx.set(meta,{schema:1,ready:true});
   });
   return {processed:page.size,cursor:page.size===100?page.docs.at(-1).id:null};
  }),
  getPromoHubUsers:onCall(options,async req=>{
   await member(req,true);
   const data=req.data||{},search=normalize(data.search||''),searchField=data.searchField||'name',tier=data.tier||'all',status=data.status||'all',mode=data.mode||'all';
   if(search.length>100||!['name','email'].includes(searchField)||!['all','free','premium'].includes(tier)||!['all','active','suspended','disabled'].includes(status)||!['all','strict','offline'].includes(mode))throw new HttpsError('invalid-argument','Invalid search or filter.');
   if(!(await meta.get()).data()?.ready)return {users:[],cursor:null,needsDirectory:true};
   const field=searchField==='email'?'emailKey':'nameKey',signature=JSON.stringify([search,searchField,tier,status,mode]);
   let q=db.collection(collection);
   for(const [key,value] of [['accountTier',tier],['accountStatus',status],['readingAccessMode',mode]])if(value!=='all')q=q.where(key,'==',value);
   q=q.orderBy(field).orderBy(admin.firestore.FieldPath.documentId());
   if(search)q=q.startAt(search).endAt(search+'\uf8ff');
   const cursor=data.cursor;
   if(cursor!==undefined){if(!cursor||cursor.signature!==signature||!validUid(cursor.uid)||typeof cursor.value!=='string'||(search&&!cursor.value.startsWith(search)))throw new HttpsError('invalid-argument','Search changed. Return to the first page.');q=q.startAfter(cursor.value,cursor.uid);}
   const snap=await q.limit(26).get(),docs=snap.docs.slice(0,25),last=docs.at(-1);
   return {users:docs.map(d=>{const {nameKey,emailKey,...p}=d.data();return p;}),cursor:snap.size>25?{signature,value:last.data()[field],uid:last.id}:null};
  })
 };
};
module.exports.normalize=normalize;
module.exports.entry=entry;
