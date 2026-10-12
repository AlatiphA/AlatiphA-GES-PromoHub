'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 class Element{constructor(){this.children=[];this.events={};this.hidden=false;this.open=false;this.disabled=false;this.textContent='';this.attrs={};}append(...n){this.children.push(...n);}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}addEventListener(k,f){this.events[k]=f;}showModal(){this.open=true;}close(){this.open=false;}focus(){}getBoundingClientRect(){return {left:0,right:600,top:0,bottom:600};}}
 const ids=Object.fromEntries(['downloadsDialog','downloadsList','downloadsStatus','downloadsStorage','downloadsAll','downloadsCancel','downloadsRefresh','downloadsOpen','downloadsClose'].map(k=>[k,new Element()]));
 const stores=new Map(),requests=[];let quota=false,confirm=true,zipValid=true,fetcher=async()=>new Response(new Uint8Array([80,75,3,4,0,1]),{headers:{'Content-Type':'application/epub+zip','Content-Length':'6'}});
 const caches={keys:async()=>[...stores.keys()],open:async name=>{if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);return {match:async key=>m.get(String(key))?.clone(),put:async(key,res)=>{if(quota)throw Object.assign(new Error('full'),{name:'QuotaExceededError'});m.set(String(key),res.clone());},delete:async key=>m.delete(String(key))};}};
 class Channel{constructor(){this.port1={close(){},onmessage:null};this.port2={postMessage:data=>this.port1.onmessage({data})};}}
 const navigator={onLine:true,serviceWorker:{controller:{postMessage:(type,ports)=>ports[0].postMessage({bookCache:'alatipha-ges-promohub-books-v1'})},addEventListener(){}},storage:{estimate:async()=>({usage:1024,quota:1048576})}};
 const document={baseURI:'https://example.test/AlatiphA-GES-PromoHub/',activeElement:new Element(),visibilityState:'visible',getElementById:id=>ids[id],createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};
 const BOOKS=[{title:'Book One',file:'./library/mat1.epub'},{title:'Book Two',file:'./library/mat2.epub'}];
 const context={window:{caches,addEventListener(){}},document,navigator,caches,BOOKS,MessageChannel:Channel,setTimeout,clearTimeout,URL,Date,AbortController,Blob,Headers,Response,ReadableStream,Uint8Array,Map,confirm:()=>confirm,fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);},JSZip:{loadAsync:async(blob,options)=>{assert.equal(options.checkCRC32,true);if(!zipValid)throw new Error('Corrupt ZIP');return {file:path=>path==='META-INF/container.xml'?{}:path==='mimetype'?{async:async()=> 'application/epub+zip'}:null};}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/downloads.js'),'utf8'),context);
 return {api:context.window.PromoHubDownloads,ids,stores,requests,navigator,setQuota:v=>quota=v,setConfirm:v=>confirm=v,setZip:v=>zipValid=v,setFetch:v=>fetcher=v,context,BOOKS};
}
const cache='alatipha-ges-promohub-books-v1',url='https://example.test/AlatiphA-GES-PromoHub/library/mat1.epub';
const row=s=>s.ids.downloadsList.children[0],state=s=>row(s).children[1].textContent;
async function prepared(){const s=setup();await s.api.scan();return s;}
test('complete validated downloads use the stable host-relative cache and reader ZIP integrity checks',async()=>{
 const s=await prepared();await s.api.download('./library/mat1.epub');assert.ok(s.stores.get(cache).has(url));assert.equal(s.requests[0].options.headers['X-PromoHub-Download'],'1');assert.equal(s.requests[0].options.cache,'no-store');assert.match(state(s),/Book downloaded/);assert.match(state(s),/1 KB/);
});
test('offline-ready requires cached reader dependencies as well as a complete book',async()=>{
 const s=await prepared();const shell=await s.context.caches.open('alatipha-ges-promohub-v1.8.3');
 for(const n of ['app','auth','firestore','functions'])await shell.put('https://www.gstatic.com/firebasejs/10.14.1/firebase-'+n+'-compat.js',new Response('sdk'));
 for(const u of ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'])await shell.put(u,new Response('js'));
 await s.api.scan();await s.api.download('./library/mat1.epub');assert.match(state(s),/Ready offline/);s.navigator.onLine=false;await s.api.scan();assert.match(state(s),/Ready offline/);assert.equal(s.ids.downloadsAll.disabled,true);
});
test('HTML responses and corrupt EPUB files never become ready downloads',async()=>{
 const s=await prepared();s.setFetch(async()=>new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}}));await s.api.download('./library/mat1.epub');assert.equal(s.stores.get(cache).has(url),false);assert.match(state(s),/instead of an EPUB/);
 s.setFetch(async()=>new Response(new Uint8Array([80,75,3,4,1])));s.setZip(false);await s.api.download('./library/mat1.epub');assert.equal(s.stores.get(cache).has(url),false);assert.match(state(s),/Corrupt ZIP/);
});
test('failed replacement and quota errors retain the previous complete download',async()=>{
 const s=await prepared();await s.api.download('./library/mat1.epub');s.setQuota(true);await s.api.download('./library/mat1.epub');assert.ok(s.stores.get(cache).has(url));assert.match(state(s),/Storage is full/);assert.match(state(s),/Previous download retained/);
});
test('removal deletes only the selected book and respects confirmation',async()=>{
 const s=await prepared();await s.api.downloadAll();const m=s.stores.get(cache);assert.equal(m.size,2);s.setConfirm(false);await s.api.remove('./library/mat1.epub');assert.equal(m.size,2);s.setConfirm(true);await s.api.remove('./library/mat1.epub');assert.equal(m.size,1);assert.match(s.ids.downloadsStatus.textContent,/Progress and bookmarks retained/);
});
test('cancelled streaming download stores no partial response and enables retry',async()=>{
 const s=await prepared();let reject;s.setFetch((u,o)=>new Promise((resolve,r)=>{reject=r;o.signal.addEventListener('abort',()=>r(new Error('aborted')));}));const work=s.api.download('./library/mat1.epub');await Promise.resolve();assert.equal(s.ids.downloadsCancel.hidden,false);s.ids.downloadsCancel.events.click();await work;assert.equal(s.stores.get(cache).has(url),false);assert.match(state(s),/cancelled/);assert.equal(s.ids.downloadsAll.disabled,false);
});
test('old workers cannot report offline downloads ready for a cache they do not serve',async()=>{
 const s=await prepared();s.navigator.serviceWorker.controller.postMessage=(type,ports)=>ports[0].postMessage({version:'v1.8.2'});await s.api.scan();assert.match(s.ids.downloadsStatus.textContent,/Reopen PromoHub/);await s.api.download('./library/mat1.epub');assert.equal(s.requests.length,0);
});

test('streaming downloads expose byte progress and only become stored after completion',async()=>{
 const s=await prepared();let finish;s.setFetch(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75,3,4]));finish=()=>{c.enqueue(new Uint8Array([0,1]));c.close();};}}),{headers:{'Content-Length':'6','Content-Type':'application/epub+zip'}}));
 const work=s.api.download('./library/mat1.epub');await new Promise(r=>setImmediate(r));assert.match(state(s),/Downloading/);assert.equal(row(s).children[2].hidden,false);assert.equal(s.stores.get(cache).has(url),false);finish();await work;assert.ok(s.stores.get(cache).has(url));
});
