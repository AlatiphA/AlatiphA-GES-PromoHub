'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const handlers={},stores=new Map(),deleted=[],fetched=[],root='https://example.test/AlatiphA-GES-PromoHub/',stable='alatipha-ges-promohub-books-v1';
 const key=v=>new URL(typeof v==='string'?v:v.url,root).href;
 const caches={keys:async()=>[...stores.keys()],open:async name=>{if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {match:async r=>m.get(key(r))?.clone(),put:async(r,v)=>m.set(key(r),v.clone()),addAll:async()=>{},add:async()=>{}};},delete:async name=>{deleted.push(name);return stores.delete(name);}};
 const self={addEventListener:(name,fn)=>handlers[name]=fn,location:{origin:'https://example.test'},registration:{scope:root},clients:{claim:async()=>{}}};
 const context={self,caches,URL,Response,Uint8Array,console,Promise,fetch:async r=>{fetched.push(r);throw new Error('offline');}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/sw.js'),'utf8'),context);
 return {handlers,stores,deleted,fetched,caches,stable,root};
}
const book=()=>new Response(new Uint8Array([80,75,3,4,9]),{headers:{'Content-Type':'application/epub+zip'}});
test('activation migrates complete legacy books before deleting shell caches and retains unrelated caches',async()=>{
 const s=setup(),old=await s.caches.open('alatipha-ges-promohub-v1.8.2');await old.put('./library/mat1.epub',book());await old.put('./library/mat2.epub',new Response('<html>app</html>'));
 await s.caches.open('other-app');let work;s.handlers.activate({waitUntil:p=>work=p});await work;const saved=await s.caches.open(s.stable);
 assert.ok(await saved.match('./library/mat1.epub'));assert.equal(await saved.match('./library/mat2.epub'),undefined);assert.ok(s.deleted.includes('alatipha-ges-promohub-v1.8.2'));assert.equal(s.deleted.includes(s.stable),false);assert.ok(s.stores.has('other-app'));
});
test('stable downloaded books are served offline on GitHub subpaths and remain through subsequent activation',async()=>{
 const s=setup(),saved=await s.caches.open(s.stable);await saved.put('./library/mat1.epub',book());let work;s.handlers.fetch({request:{method:'GET',url:s.root+'library/mat1.epub',mode:'cors'},respondWith:p=>work=p});assert.equal((await work).status,200);assert.equal(s.fetched.length,0);
 s.handlers.activate({waitUntil:p=>work=p});await work;assert.ok(await saved.match('./library/mat1.epub'));
});
test('explicit download requests bypass cached books and absent books cannot fall back to app HTML',async()=>{
 const s=setup();s.handlers.fetch({request:{method:'GET',url:s.root+'library/mat1.epub',headers:{get:()=> '1'}},respondWith:()=>assert.fail('Explicit download was served from cache')});let work;s.handlers.fetch({request:{method:'GET',url:s.root+'library/mat2.epub',mode:'cors'},respondWith:p=>work=p,waitUntil(){}});assert.equal((await work).type,'error');
});
test('installation does not silently redownload books removed by the user',async()=>{
 const source=fs.readFileSync(require.resolve('../public/sw.js'),'utf8'),optional=source.match(/const OPTIONAL=([^;]+);/)[1];assert.doesNotMatch(optional,/\.epub|BOOK_FILES/);
});

test('failed migration leaves old caches intact rather than deleting their books',async()=>{
 const s=setup(),old=await s.caches.open('alatipha-ges-promohub-v1.8.2');await old.put('./library/mat1.epub',book());const open=s.caches.open;
 s.caches.open=async name=>{const c=await open(name);if(name===s.stable)c.put=async()=>{throw new Error('quota');};return c;};let work;s.handlers.activate({waitUntil:p=>work=p});await assert.rejects(work,/quota/);assert.equal(s.deleted.length,0);assert.ok(await old.match('./library/mat1.epub'));
});
