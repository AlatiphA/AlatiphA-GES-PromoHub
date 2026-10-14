'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/reading-dashboard.js'),'utf8');
function setup(){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.replaceCount=0;}append(...n){for(const node of n){node.parent=this;this.children.push(node);}}replaceChildren(...n){this.replaceCount++;this.children=[];this.append(...n);}insertBefore(node,before){node.remove();node.parent=this;node.isConnected=true;const i=before?this.children.indexOf(before):-1;this.children.splice(i<0?this.children.length:i,0,node);}remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;this.isConnected=false;}}setAttribute(){}addEventListener(){}querySelector(){return null;}}
 const host=new Node('div'),store=new Map(),events={},ctx={document:{getElementById:()=>host,createElement:tag=>new Node(tag),querySelectorAll:()=>[]},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},BOOKS:[{file:'./library/one.epub',title:'One'},{file:'./library/two.epub',title:'Two'}],READER_DATA_KEY:'data',securityLocalOwner:'a',securityLocalSuffix:()=>ctx.securityLocalOwner?'-user-'+ctx.securityLocalOwner:'',cloudReady:false,cloudUser:null,cloudDb:null,navigator:{onLine:true},readerSessionBusy:false,selectedBookFile:'',readerTitle:{},rendition:null,openReader:()=>{ctx.opened=(ctx.opened||0)+1;},backBtn:{addEventListener:(e,f)=>events.back=f},window:{addEventListener:(e,f)=>events[e]=f},Date,console,clearTimeout(){},setTimeout:()=>1};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,host,store,events,run:s=>vm.runInContext(s,ctx)};
}
test('unchanged account/background updates preserve the dashboard and focused bookmark node',()=>{
 const s=setup();s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(a)',progress:23,updatedAtMs:2}));s.store.set('ges-promohub-bookmarks-./library/one.epub-user-a',JSON.stringify([{cfi:'epubcfi(note)',chapter:'Note'}]));s.run('dashboardUpdate()');
 const section=s.host.children[0],mark=s.run('dashboardView.markList.children[0]'),count=s.host.replaceCount;for(let i=0;i<10;i++)s.run('dashboardUpdate()');assert.equal(s.host.replaceCount,count);assert.equal(s.host.children[0],section);assert.equal(s.run('dashboardView.markList.children[0]'),mark);
});
test('changed progress updates text while preserving Continue reading and recent book elements',()=>{
 const s=setup();s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(a)',progress:23,updatedAtMs:2}));s.run('dashboardUpdate()');const section=s.host.children[0],resume=s.run('dashboardView.resume'),recent=s.run('dashboardView.list.children[0]');s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(b)',progress:24,updatedAtMs:3}));s.run('dashboardUpdate()');assert.equal(s.host.children[0],section);assert.equal(s.run('dashboardView.resume'),resume);assert.equal(s.run('dashboardView.list.children[0]'),recent);assert.equal(s.run('dashboardView.percent.textContent'),'24% completed');
});
test('updates defer while scrolling but account switches immediately remove the old scope',()=>{
 const s=setup();s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(a)',progress:23,updatedAtMs:2}));s.run('dashboardUpdate()');s.run('dashboardScrollUntil=Date.now()+1000');s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(b)',progress:24,updatedAtMs:3}));s.run('dashboardRender()');assert.equal(s.run('dashboardView.percent.textContent'),'23% completed');s.run('dashboardScrollUntil=0;dashboardRender()');assert.equal(s.run('dashboardView.percent.textContent'),'24% completed');s.ctx.securityLocalOwner='b';s.run('dashboardScrollUntil=Date.now()+1000;dashboardUpdate()');assert.equal(s.run('dashboardView.card.hidden'),true);assert.equal(s.run('dashboardView.list.children.length'),0);
});
test('background updates never push the library down while the reader scrolls toward the dashboard',()=>{
 const s=setup();s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(a)',progress:23,updatedAtMs:2}));s.run('dashboardUpdate()');let top=30,text='23% completed';const anchor={getBoundingClientRect:()=>({top,bottom:top+100})},grid={scrollTop:150,getBoundingClientRect:()=>({top:0,bottom:600}),querySelectorAll:()=>[anchor]};s.ctx.document.querySelector=()=>grid;Object.defineProperty(s.run('dashboardView.percent'),'textContent',{get:()=>text,set:value=>{text=value;top+=100;}});s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(b)',progress:24,updatedAtMs:3}));s.run('dashboardUpdate()');assert.equal(grid.scrollTop,150);
 assert.doesNotMatch(source,/scrollTop\s*(?:[+\-]?=)|scrollIntoView\(/);
});
test('dashboard reads current account only, separates guest, and handles malformed storage',()=>{
 const s=setup();s.store.set('data-one-epub-user-a',JSON.stringify({location:'epubcfi(a)',progress:23,updatedAtMs:2}));s.store.set('data-two-epub-user-b',JSON.stringify({location:'epubcfi(b)',progress:89,updatedAtMs:9}));
 assert.equal(s.run('dashboardRows()[0].percent'),23);s.ctx.securityLocalOwner='b';s.run('dashboardUpdate()');assert.equal(s.run('dashboardRows()[0].title'),'Two');s.ctx.securityLocalOwner='';s.run('dashboardUpdate()');assert.equal(s.run('dashboardRows().some(b=>b.at>0)'),false);
 s.store.set('data-one-epub','invalid');assert.equal(s.run('dashboardRows()[0].percent'),null);
});
test('Continue reading uses existing access gate, bookmark target is account-scoped and consumed once',()=>{
 const s=setup();s.run("dashboardOpen('./library/two.epub','epubcfi(note)')");assert.equal(s.ctx.opened,1);assert.equal(s.run('dashboardStart()'),'epubcfi(note)');assert.equal(s.run('dashboardStart()'),null);
 s.run("dashboardOpen('./library/one.epub','epubcfi(private)')");s.ctx.securityLocalOwner='b';assert.equal(s.run('dashboardStart()'),null);
 s.ctx.openReader=()=>false;s.run("dashboardOpen('./library/one.epub','epubcfi(blocked)')");assert.equal(s.run('dashboardStart()'),null);
 s.run("dashboardOpen('./library/unknown.epub')");assert.equal(s.ctx.selectedBookFile,'./library/one.epub');
});
test('dashboard bookmark labels are text, bounded and not HTML',()=>{
 const s=setup();s.store.set('ges-promohub-bookmarks-./library/one.epub-user-a',JSON.stringify(Array.from({length:15},(_,i)=>({cfi:'epubcfi('+i+')',chapter:'<img onerror=evil()>',date:new Date(i*1000).toISOString()}))));s.run('dashboardRender()');
 const tree=s.host.children[0],list=tree.children.find(n=>n.className==='dashboardBookmarks');assert.equal(list.children.length,12);assert.equal(list.children[0].children[1].textContent,'<img onerror=evil()>');assert.equal(list.children[0].children[1].innerHTML,undefined);
});
test('trial, offline or disallowed cloud state never requests cloud dashboard records',async()=>{
 const s=setup();s.ctx.cloudUser={uid:'a'};s.ctx.cloudDb={collection:()=>assert.fail('Cloud request')};await s.run('dashboardRefreshCloud()');s.ctx.cloudReady=true;s.ctx.navigator.onLine=false;await s.run('dashboardRefreshCloud()');
});
test('delayed cloud results are discarded after account switch',async()=>{
 const s=setup();let release;const pending=new Promise(r=>release=r);s.ctx.cloudReady=true;s.ctx.cloudUser={uid:'a'};s.ctx.cloudDb={collection:()=>({doc:()=>({collection:name=>name==='reading'?{doc:()=>({get:()=>pending})}:{limit:()=>({get:()=>pending})}})})};
 const work=s.run('dashboardRefreshCloud()');s.ctx.securityLocalOwner='b';s.ctx.cloudReady=false;s.ctx.cloudUser={uid:'b'};s.run('dashboardReset()');release({exists:true,data:()=>({cfi:'epubcfi(secret)',updatedAtMs:10}),forEach:f=>f({data:()=>({bookFile:'./library/one.epub',cfi:'epubcfi(secret)'})})});await work;assert.equal(s.store.size,0);assert.equal(s.run('dashboardRemoteMarks.length'),0);
});
test('cloud refresh keeps newer device progress and never changes current rendition',async()=>{
 const s=setup();s.ctx.cloudReady=true;s.ctx.cloudUser={uid:'a'};s.ctx.rendition={};s.ctx.selectedBookFile='./library/one.epub';s.store.set('data-two-epub-user-a',JSON.stringify({location:'epubcfi(local)',updatedAtMs:20}));
 s.ctx.cloudDb={collection:()=>({doc:()=>({collection:name=>name==='reading'?{doc:()=>({get:async()=>({exists:true,data:()=>({cfi:'epubcfi(remote)',progress:50,updatedAtMs:10})})})}:{limit:()=>({get:async()=>({forEach(){}})})}})})};await s.run('dashboardRefreshCloud()');assert.equal(s.store.has('data-one-epub-user-a'),false);assert.equal(JSON.parse(s.store.get('data-two-epub-user-a')).location,'epubcfi(local)');
});
test('dashboard shares library scroller, responsive styles and service worker precache',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'),css=fs.readFileSync(require.resolve('../public/reading-dashboard.css'),'utf8'),sw=fs.readFileSync(require.resolve('../public/sw.js'),'utf8');
 assert.match(html,/<div class="libraryGrid">\s*<div id="readingDashboard"/);assert.match(css,/max-width:520px/);assert.match(css,/grid-template-columns:1fr/);for(const name of ['reading-dashboard.js','reading-dashboard.css'])assert.ok(sw.includes(name));
});
