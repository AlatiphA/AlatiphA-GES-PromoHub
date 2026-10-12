'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/reading-dashboard.js'),'utf8');
function setup(){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(){}addEventListener(){}querySelector(){return null;}}
 const host=new Node('div'),store=new Map(),events={},ctx={document:{getElementById:()=>host,createElement:tag=>new Node(tag),querySelectorAll:()=>[]},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},BOOKS:[{file:'./library/one.epub',title:'One'},{file:'./library/two.epub',title:'Two'}],READER_DATA_KEY:'data',securityLocalOwner:'a',securityLocalSuffix:()=>ctx.securityLocalOwner?'-user-'+ctx.securityLocalOwner:'',cloudReady:false,cloudUser:null,cloudDb:null,navigator:{onLine:true},readerSessionBusy:false,selectedBookFile:'',readerTitle:{},rendition:null,openReader:()=>{ctx.opened=(ctx.opened||0)+1;},backBtn:{addEventListener:(e,f)=>events.back=f},window:{addEventListener:(e,f)=>events[e]=f},Date,console};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,host,store,events,run:s=>vm.runInContext(s,ctx)};
}
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
