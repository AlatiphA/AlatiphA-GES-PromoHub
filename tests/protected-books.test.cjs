'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto,createHash}=require('node:crypto');
const file='./library/gespasco.epub',source=fs.readFileSync(require.resolve('../public/protected-books.js'),'utf8');
function setup(options={}){
 const bytes=new Uint8Array(307205);bytes.set([80,75,3,4]);bytes[307204]=9;
 const sha=createHash('sha256').update(bytes).digest('hex'),entry={file,size:bytes.length,sha256:sha,chunkCount:2},calls=[];
 const snap=data=>({exists:!!data,data:()=>data});
 const db={doc:()=>({get:async()=>{calls.push('manifest');return snap(options.missingManifest?null:{schema:1,books:{gespasco:entry}});}}),collection:()=>({doc:id=>({get:async()=>{calls.push(id);const index=Number(id.slice(-3)),part=bytes.slice(index*307200,(index+1)*307200);if(options.corrupt&&index===1)part[0]^=1;return snap(options.missingChunk&&index===1?null:{bookId:'gespasco',sha256:sha,index,total:2,data:{toUint8Array:()=>part}});}})})};
 const caches={open:async()=>({match:async()=>options.saved?new Response(bytes):undefined})};
 const ctx={window:{firebase:{apps:[{}]},caches},firebase:{firestore:()=>db},caches,cloudUser:{uid:'paid',emailVerified:true},subscriptionBookAllowed:()=>options.allowed!==false,subscriptionBookAccessMessage:()=> 'Subscription required',document:{baseURI:'https://example.test/'},navigator:{onLine:!options.offline},URL,Blob,Response,Uint8Array,AbortController,crypto:webcrypto,setTimeout,clearTimeout};
 if(options.missingAccess)delete ctx.subscriptionBookAllowed;
 vm.runInNewContext(source,ctx);return {api:ctx.window.PromoHubProtectedBooks,calls,bytes};
}
test('protected download assembles all authorized chunks and validates content integrity',async()=>{
 const s=setup(),progress=[];const blob=await s.api.getBlob(file,{preferCached:false,onProgress:(a,b)=>progress.push([a,b])});
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),s.bytes);assert.equal(s.calls.length,3);assert.deepEqual(progress.at(-1),[s.bytes.length,s.bytes.length]);
});
test('a corrupted or missing protected chunk never becomes a book',async()=>{
 await assert.rejects(setup({corrupt:true}).api.getBlob(file),/integrity check/);
 await assert.rejects(setup({missingChunk:true}).api.getBlob(file),/missing or incomplete/);
});
test('saved protected books remain available offline with eligible reading access',async()=>{
 const s=setup({saved:true,offline:true});assert.equal((await s.api.getBlob(file)).size,s.bytes.length);assert.equal(s.calls.length,0);
});
test('expired access cannot return a saved protected book',async()=>{
 const s=setup({saved:true,allowed:false});await assert.rejects(s.api.getBlob(file),/Subscription required/);assert.equal(s.calls.length,0);
});
test('missing access policy fails closed even when a protected book is saved',async()=>{
 const s=setup({saved:true,missingAccess:true});await assert.rejects(s.api.getBlob(file),/Subscription required/);assert.equal(s.calls.length,0);
});
test('an offline reader without a saved copy receives recovery instructions',async()=>{
 await assert.rejects(setup({offline:true}).api.getBlob(file),/download this book first/);
});
test('missing protected library has a visible setup message',async()=>{
 await assert.rejects(setup({missingManifest:true}).api.getBlob(file),/not been uploaded yet/);
});
