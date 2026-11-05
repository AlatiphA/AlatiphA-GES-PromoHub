'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function setup(){
 const listeners={},styles=[],sizes=[],saved=[],anchors=[],frames=[],nav={next:0,prev:0,toggle:0,hide:0};let marks=0,clock=1000;
 const doc={head:{appendChild:n=>styles.push(n)},createElement:()=>({}),addEventListener:(type,fn,opts={})=>(listeners[type]||=[]).push({fn,opts}),elementFromPoint:()=>({closest:()=>null})};
 const ctx={fontSize:100,book:{},rendition:{themes:{fontSize:s=>sizes.push(s)},display:async cfi=>anchors.push(cfi)},securityLocalOwner:'alice',selectedBookFile:'book1',readerLoadGeneration:1,currentLocation:{start:{cfi:'epubcfi(/6/2!/4/2:10)'}},
 localStorage:{setItem:(k,v)=>saved.push({k,v})},markPreferencesChanged:()=>marks++,requestAnimationFrame:fn=>frames.push(fn),console:{warn(){}},Date:class extends Date{static now(){return clock;}},Math,Promise,doc,
 document:{getElementById:()=>null,querySelector:()=>null},sidebarIsOpen:()=>false,toggleSidebar:()=>assert.fail('pinch closed sidebar'),viewer:{querySelector:()=>({getBoundingClientRect:()=>({left:0,width:400})})},window:{innerWidth:400},pageNext:()=>nav.next++,pagePrev:()=>nav.prev++,toggleControls:()=>nav.toggle++,hideControls:()=>nav.hide++};
 vm.createContext(ctx);const start=source.indexOf('let readerPinchSequence =');const end=source.indexOf('/* Sync the selected book whenever',start);vm.runInContext(source.slice(start,end),ctx);ctx.installPinchTextZoom(doc);
 const navStart=source.indexOf('    let _tx = null, _ty = null, _tt = null;');const navEnd=source.indexOf('    /* Desktop content clicks',navStart);vm.runInContext(source.slice(navStart,navEnd),ctx);
 function emit(type,touches,changed=touches,extra={}){let prevented=false,stopped=false;const e={touches,changedTouches:changed,cancelable:true,detail:1,preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;},...extra};
  for(const {fn} of [...(listeners[type]||[])].sort((a,b)=>Number(!!b.opts.capture)-Number(!!a.opts.capture))){fn(e);if(stopped)break;}return {prevented,stopped};}
 return {ctx,doc,listeners,styles,sizes,saved,anchors,frames,nav,emit,marks:()=>marks,flush:()=>{while(frames.length)frames.shift()();},advance:n=>clock+=n};
}
const one=(x=100,y=100)=>[{clientX:x,clientY:y}];
const pair=d=>[{clientX:100,clientY:100},{clientX:100+d,clientY:100}];
function pinch(s,d=150){s.emit('touchstart',pair(100));s.emit('touchmove',pair(d));s.emit('touchend',[],pair(d));}
test('pinch start is cancelled before navigation and touch intent is installed in each EPUB document',()=>{
 const s=setup();assert.match(s.styles[0].textContent,/html,body\{touch-action:pan-y !important\}/);assert.equal(s.styles.length,1);s.ctx.installPinchTextZoom(s.doc);assert.equal(s.styles.length,1);
 const capture=s.listeners.touchstart.find(x=>x.opts.capture);assert.equal(capture.opts.passive,false);assert.deepEqual(s.emit('touchstart',pair(100)),{prevented:true,stopped:true});
});
test('many moves produce no reflows or saves until both fingers release, then size and CFI update once',async()=>{
 const s=setup();s.emit('touchstart',pair(100));for(const d of [110,120,140,150])s.emit('touchmove',pair(d));assert.equal(s.ctx.fontSize,100);assert.equal(s.sizes.length,0);assert.equal(s.saved.length,0);assert.equal(s.marks(),0);
 s.emit('touchend',one(250),one(100));assert.equal(s.sizes.length,0);s.emit('touchmove',one(280));s.emit('touchend',[],one(280));assert.deepEqual(s.sizes,['150%']);assert.equal(s.saved.length,1);assert.equal(s.marks(),1);s.flush();await Promise.resolve();assert.deepEqual(s.anchors,['epubcfi(/6/2!/4/2:10)']);assert.equal(s.nav.next+s.nav.prev+s.nav.toggle,0);
});
test('zoom in and out clamp to the existing 70-200 percent range',()=>{
 const s=setup();pinch(s,1000);assert.equal(s.ctx.fontSize,200);pinch(s,1);assert.equal(s.ctx.fontSize,70);assert.deepEqual(s.sizes,['200%','70%']);
});
test('unchanged and zero-distance pinches do not save preferences or resize',()=>{
 const s=setup();pinch(s,100);s.emit('touchstart',pair(0));s.emit('touchmove',pair(100));s.emit('touchend',[]);assert.equal(s.sizes.length,0);assert.equal(s.marks(),0);
});
test('cancelled and three-finger sequences never resize or turn a page',()=>{
 for(const kind of ['cancel','third']){const s=setup();s.emit('touchstart',pair(100));s.emit('touchmove',pair(160));if(kind==='cancel')s.emit('touchcancel',one());else s.emit('touchstart',[...pair(160),{clientX:90,clientY:10}]);s.emit('touchend',one());s.emit('touchend',[],one());assert.equal(s.sizes.length,0);assert.equal(s.marks(),0);assert.equal(s.nav.next+s.nav.prev+s.nav.toggle,0);}
});
test('account, book and reader changes during a pinch discard the staged size',()=>{
 for(const kind of ['owner','file','reader','generation']){const s=setup();s.emit('touchstart',pair(100));s.emit('touchmove',pair(160));if(kind==='owner')s.ctx.securityLocalOwner='bob';if(kind==='file')s.ctx.selectedBookFile='book2';if(kind==='reader')s.ctx.rendition={};if(kind==='generation')s.ctx.readerLoadGeneration++;s.emit('touchend',[]);assert.equal(s.sizes.length,0);assert.equal(s.saved.length,0);}
});
test('late position restore is discarded after a book change or a newer pinch',()=>{
 const s=setup();pinch(s);s.ctx.selectedBookFile='book2';s.flush();assert.equal(s.anchors.length,0);
 const t=setup();pinch(t,150);pinch(t,120);t.flush();assert.equal(t.anchors.length,1);
});
test('single-finger swipes and centre taps still reach the existing navigation handlers',()=>{
 const s=setup();assert.equal(s.emit('touchstart',one(280)).prevented,false);s.emit('touchend',[],one(100));assert.equal(s.nav.next,1);
 s.emit('touchstart',one(100));s.emit('touchend',[],one(280));assert.equal(s.nav.prev,1);
 s.emit('touchstart',one(200));s.emit('touchend',[],one(200));assert.equal(s.nav.toggle,1);
});
test('pinch tails and native Safari gesture events cannot activate links or browser zoom',()=>{
 const s=setup();pinch(s);assert.equal(s.emit('click',[]).prevented,true);s.advance(900);assert.equal(s.emit('click',[]).prevented,false);
 for(const name of ['gesturestart','gesturechange','gestureend'])assert.equal(s.emit(name,[]).prevented,true);
});
test('storage and position failures are caught and a failed style change is not recorded as saved',async()=>{
 const s=setup();s.ctx.localStorage.setItem=()=>{throw Error('quota');};s.ctx.rendition.display=()=>Promise.reject(Error('closed'));assert.doesNotThrow(()=>pinch(s));s.flush();await Promise.resolve();await Promise.resolve();assert.equal(s.marks(),1);
 const t=setup();t.ctx.rendition.themes.fontSize=()=>{throw Error('closed');};assert.doesNotThrow(()=>pinch(t));assert.equal(t.ctx.fontSize,100);assert.equal(t.saved.length,0);assert.equal(t.marks(),0);
});
