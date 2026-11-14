/* Admin-only one-time migration for locally held EPUB source files. */
(() => {
 'use strict';
 const CHUNK_BYTES=300*1024;
 const BOOKS=[
  {id:'gespasco',file:'./library/gespasco.epub',name:'gespasco.epub',title:'GES Promotion Aptitude Test Pasco'},
  {id:'mat2',file:'./library/mat2.epub',name:'mat2.epub',title:'Model Aptitude Test for GES 2'},
  {id:'etmala',file:'./library/etmala.epub',name:'etmala.epub',title:'Effective Teaching Methods'},
  {id:'nfatfges',file:'./library/nfatfges.epub',name:'nfatfges.epub',title:'Notes for Aptitude Test for GES'},
  {id:'eigala',file:'./library/eigala.epub',name:'eigala.epub',title:'Education in Ghana'}
 ];
 const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
 function protectedLibraryAdminRender(){
  if(!securityIsAdmin())return;
  const state=securityAdminStart('library','Protected book library'),host=state.host;
  host.replaceChildren();
  const intro=document.createElement('p');intro.textContent='Move the five paid books into access-controlled Firestore storage. Model Aptitude Test for GES 1 remains the public guest sample.';
  const steps=document.createElement('p');steps.textContent='Choose the five matching EPUB files from the protected-library-source folder in the PromoHub project. The secure library is published only after all five files upload and pass SHA-256 checks.';
  const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.epub,application/epub+zip';input.setAttribute('aria-label','Choose the five paid EPUB source files');
  const button=document.createElement('button');button.type='button';button.textContent='Upload and protect books';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  button.addEventListener('click',()=>{void upload(state,input,status,button);});
  host.append(intro,steps,input,button,status);
 }
 async function upload(state,input,status,button){
  if(!securityAdminCurrent(state)||!input.files?.length)return;
  const selected=new Map([...input.files].map(file=>[file.name.toLowerCase(),file]));
  const files=BOOKS.map(book=>({book,file:selected.get(book.name)}));
  const missing=files.filter(item=>!item.file);
  if(missing.length){status.textContent='Select all five source files. Missing: '+missing.map(x=>x.book.name).join(', ')+'.';return;}
  if(files.some(x=>x.file.size<4||x.file.size>20*1024*1024)){status.textContent='One or more files are empty or larger than 20 MB. Nothing was uploaded.';return;}
  button.disabled=true;input.disabled=true;status.textContent='Checking the selected EPUB files…';
  try{
   const prepared=[];
   for(const item of files){
    if(!securityAdminCurrent(state))throw new Error('Administrator access changed. Sign in again and retry.');
    const bytes=new Uint8Array(await item.file.arrayBuffer()),magic=bytes.subarray(0,4);
    if(magic[0]!==80||magic[1]!==75||magic[2]!==3||magic[3]!==4)throw new Error(item.book.name+' is not a valid ZIP-based EPUB. Nothing was uploaded.');
    const digest=hex(await crypto.subtle.digest('SHA-256',bytes));prepared.push({...item,bytes,digest});
   }
   const db=firebase.firestore(),books={};
   for(let b=0;b<prepared.length;b++){
    const {book,bytes,digest}=prepared[b],count=Math.ceil(bytes.length/CHUNK_BYTES);
    status.textContent='Uploading '+book.title+' ('+(b+1)+' of '+prepared.length+')…';
    for(let index=0;index<count;index++){
     if(!securityAdminCurrent(state))throw new Error('Administrator access changed during upload. Sign in again and retry.');
     const part=bytes.slice(index*CHUNK_BYTES,Math.min(bytes.length,(index+1)*CHUNK_BYTES));
     const id=book.id+'_'+digest.slice(0,20)+'_'+String(index).padStart(3,'0');
     await db.collection('protectedLibraryChunks').doc(id).set({bookId:book.id,sha256:digest,index,total:count,data:firebase.firestore.Blob.fromUint8Array(part)});
    }
    books[book.id]={file:book.file,title:book.title,size:bytes.length,sha256:digest,chunkCount:count,chunkBytes:CHUNK_BYTES};
   }
   if(!securityAdminCurrent(state))throw new Error('Administrator access changed before publishing. The files are stored but not made available; sign in again and retry.');
   await db.doc('protectedLibrary/current').set({schema:1,updatedAtMs:Date.now(),books});
   status.textContent='Protected library is ready. All five books are uploaded and the access-controlled manifest is published. Eligible subscribers can now read or download them; direct public URLs are no longer used.';
  }catch(error){status.textContent='Library setup did not finish: '+(error.message||'upload failed')+'. The manifest was not published unless all five uploads completed.';}
  finally{if(securityAdminCurrent(state)){button.disabled=false;input.disabled=false;}}
 }
 window.protectedLibraryAdminRender=protectedLibraryAdminRender;
})();
