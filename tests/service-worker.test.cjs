'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const listeners={},deleted=[],fetched=[],stored=[];
 const cache={addAll:async()=>{},add:async()=>{},match:async()=>undefined,put:async r=>stored.push(r.url)};
 const scope={addEventListener:(name,f)=>listeners[name]=f,location:{origin:'https://example.test'},clients:{claim:async()=>{}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),{self:scope,caches:{open:async()=>cache,keys:async()=>['other-app-v1','alatipha-ges-promohub-v1.5.4','alatipha-ges-promohub-v1.5.8','alatipha-ges-promohub-v1.5.9','alatipha-ges-promohub-v1.5.10','alatipha-ges-promohub-v1.5.11'],delete:async n=>deleted.push(n)},fetch:async r=>{fetched.push(r.url);throw new Error('offline');},URL,Response,console,Promise});
 return {listeners,deleted,fetched,stored,cache};
}
test('activation keeps unrelated origin caches',async()=>{
 const s=setup();let work;s.listeners.activate({waitUntil:p=>work=p});await work;assert.deepEqual(s.deleted,['alatipha-ges-promohub-v1.5.4','alatipha-ges-promohub-v1.5.8','alatipha-ges-promohub-v1.5.9','alatipha-ges-promohub-v1.5.10']);
});
test('Auth, Functions and Firestore API traffic is not intercepted',()=>{
 const s=setup();for(const host of ['identitytoolkit.googleapis.com','firestore.googleapis.com','us-central1-ges-promohub.cloudfunctions.net'])s.listeners.fetch({request:{method:'GET',url:'https://'+host+'/data'},respondWith:()=>assert.fail('Sensitive endpoint intercepted')});assert.equal(s.fetched.length,0);
});
test('missing EPUB offline returns a failed response rather than app HTML',async()=>{
 const s=setup();let work;s.listeners.fetch({request:{method:'GET',url:'https://example.test/library/mat1.epub',mode:'cors'},respondWith:p=>work=p,waitUntil:()=>{}});const response=await work;assert.equal(response.type,'error');
});
test('failed core precache fails installation rather than activating an incomplete shell',async()=>{
 const s=setup();s.cache.addAll=async()=>{throw new Error('core missing');};let work;s.listeners.install({waitUntil:p=>work=p});await assert.rejects(work,/core missing/);
});
test('same-origin Firebase reserved auth routes are not intercepted',()=>{
 const s=setup();s.listeners.fetch({request:{method:'GET',url:'https://example.test/__/auth/handler'},respondWith:()=>assert.fail('Auth handler cached')});assert.equal(s.fetched.length,0);
});
