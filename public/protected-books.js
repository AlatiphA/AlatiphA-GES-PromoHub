/* Protected premium EPUBs are stored in Firestore and released only by Firestore rules. */
(() => {
 'use strict';
 const CHUNK_BYTES=300*1024,BOOK_CACHE='alatipha-ges-promohub-books-v1';
 const BOOKS={
  './library/gespasco.epub':{id:'gespasco',title:'GES Promotion Aptitude Test Pasco'},
  './library/mat2.epub':{id:'mat2',title:'Model Aptitude Test for GES 2'},
  './library/etmala.epub':{id:'etmala',title:'Effective Teaching Methods'},
  './library/nfatfges.epub':{id:'nfatfges',title:'Notes for Aptitude Test for GES'},
  './library/eigala.epub':{id:'eigala',title:'Education in Ghana'}
 };
 const urlFor=file=>new URL(file,document.baseURI).href;
 const abortIfNeeded=signal=>{if(signal?.aborted)throw new Error('Download cancelled.');};
 const timed=(promise,label,signal)=>new Promise((resolve,reject)=>{
  let done=false;const timer=setTimeout(()=>{if(done)return;done=true;reject(new Error(label+' timed out. Connect and retry.'));},15000);
  const cancel=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error('Download cancelled.'));};
  signal?.addEventListener('abort',cancel,{once:true});
  Promise.resolve(promise).then(value=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(value);},error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(error);});
 });
 async function cached(file){
  if(!('caches'in window))return null;
  const response=await (await caches.open(BOOK_CACHE)).match(urlFor(file));
  return response?.ok?response:null;
 }
 async function getBlob(file,{preferCached=true,onProgress=()=>{},signal}={}){
  const config=BOOKS[file];if(!config)throw new Error('Unknown protected book.');
  if(typeof subscriptionBookAllowed!=='function'||!subscriptionBookAllowed(file))throw new Error(typeof subscriptionBookAccessMessage==='function'?subscriptionBookAccessMessage(file)||'An active subscription or complimentary reading grant is required.':'Reading access is not ready. Reopen PromoHub and retry.');
  if(preferCached){const saved=await cached(file);if(saved)return saved.blob();}
  if(navigator.onLine===false)throw new Error('Connect to the internet and download this book first to read it offline.');
  if(!window.firebase?.apps?.length||!cloudUser?.uid||cloudUser.emailVerified!==true)throw new Error('Sign in with a verified PromoHub account to open this book.');
  const db=firebase.firestore(),manifestSnap=await timed(db.doc('protectedLibrary/current').get(), 'Protected library check',signal);
  if(!manifestSnap.exists)throw new Error('Protected books have not been uploaded yet. Ask the administrator to finish the library setup.');
  const manifest=manifestSnap.data(),entry=manifest?.schema===1?manifest.books?.[config.id]:null;
  if(!entry||entry.file!==file||!Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>20*1024*1024||!Number.isSafeInteger(entry.chunkCount)||entry.chunkCount<1||entry.chunkCount>100||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw new Error('This book is not ready in protected storage. Ask the administrator to finish the library setup.');
  const parts=[];let received=0;onProgress(0,entry.size);
  for(let index=0;index<entry.chunkCount;index++){
   abortIfNeeded(signal);
   const id=config.id+'_'+entry.sha256.slice(0,20)+'_'+String(index).padStart(3,'0');
   const snap=await timed(db.collection('protectedLibraryChunks').doc(id).get(),'Protected book download',signal);
   const data=snap.exists?snap.data():null,bytes=data?.data?.toUint8Array?.();
   if(!data||data.bookId!==config.id||data.sha256!==entry.sha256||data.index!==index||data.total!==entry.chunkCount||!bytes?.byteLength||bytes.byteLength>CHUNK_BYTES)throw new Error('A protected book section is missing or incomplete. Please retry the download.');
   parts.push(bytes);received+=bytes.byteLength;onProgress(received,entry.size);
  }
  abortIfNeeded(signal);
  const blob=new Blob(parts,{type:'application/epub+zip'});
  if(blob.size!==entry.size)throw new Error('The protected book download is incomplete. Please retry.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256)throw new Error('The protected book failed its integrity check. Please retry the download.');
  const magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(magic[0]!==80||magic[1]!==75||magic[2]!==3||magic[3]!==4)throw new Error('The protected file is not a valid EPUB book.');
  return blob;
 }
 window.PromoHubProtectedBooks=Object.freeze({isProtected:file=>Object.prototype.hasOwnProperty.call(BOOKS,file),getBlob,bookCache:BOOK_CACHE,chunkBytes:CHUNK_BYTES});
})();
