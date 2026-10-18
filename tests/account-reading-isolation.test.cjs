'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function extract(name){const start=source.indexOf('async function '+name+'()');return source.slice(start,source.indexOf('\n}',start)+2);}
function setup(){
 let resolve;const pending=new Promise(r=>resolve=r),store=new Map(),displayed=[],scheduled=[];
 const ctx={securityLocalOwner:'admin',securityEpoch:1,cloudReady:true,cloudUser:{uid:'admin'},selectedBookFile:'one',rendition:{display:cfi=>{displayed.push(cfi);return Promise.resolve();}},localStorage:{setItem:(k,v)=>store.set(k,v)},cloudDb:{collection:()=>({doc:()=>({collection:()=>({doc:()=>({get:()=>pending})})})})},bookCloudId:()=>ctx.selectedBookFile,getBookReaderDataKey:()=>ctx.selectedBookFile+'-user-'+ctx.securityLocalOwner,loadReaderData:()=>JSON.parse(store.get(ctx.getBookReaderDataKey())||'{}'),scheduleProgressSync:d=>scheduled.push(d),console};
 vm.createContext(ctx);vm.runInContext(extract('mergeProgressFromCloud'),ctx);
 return {ctx,store,displayed,scheduled,resolve,reply:()=>resolve({exists:true,data:()=>({cfi:'epubcfi(admin)',progress:63,updatedAtMs:100})})};
}
test('delayed admin progress cannot become trial progress after logout and sign-in',async()=>{
 const s=setup(),work=s.ctx.mergeProgressFromCloud();
 s.ctx.securityEpoch++;s.ctx.securityLocalOwner='';s.ctx.cloudUser=null;s.ctx.cloudReady=false;
 s.ctx.securityEpoch++;s.ctx.securityLocalOwner='trial';s.ctx.cloudUser={uid:'trial'};
 s.reply();await work;assert.equal(s.store.size,0);assert.deepEqual(s.displayed,[]);assert.deepEqual(s.scheduled,[]);
});
test('late result cannot replace another book or a newly opened rendition',async()=>{
 for(const change of [s=>s.ctx.selectedBookFile='two',s=>s.ctx.rendition={},s=>s.ctx.securityEpoch+=2]){
  const s=setup(),work=s.ctx.mergeProgressFromCloud();change(s);s.reply();await work;assert.equal(s.store.size,0);assert.deepEqual(s.displayed,[]);
 }
});
test('current account still restores its own progress and preserves other accounts',async()=>{
 const s=setup();s.store.set('one-user-trial',JSON.stringify({progress:12}));const work=s.ctx.mergeProgressFromCloud();s.reply();await work;
 assert.equal(JSON.parse(s.store.get('one-user-admin')).progress,63);assert.equal(JSON.parse(s.store.get('one-user-trial')).progress,12);assert.deepEqual(s.displayed,['epubcfi(admin)']);
});
test('a missing old cloud record cannot schedule the new account data for upload',async()=>{
 const s=setup(),work=s.ctx.mergeProgressFromCloud();s.ctx.securityEpoch++;s.ctx.securityLocalOwner='trial';s.ctx.cloudUser={uid:'trial'};s.ctx.cloudReady=true;s.store.set('one-user-trial',JSON.stringify({location:'epubcfi(trial)'}));
 s.resolve({exists:false});await work;assert.deepEqual(s.scheduled,[]);
});
test('book download finishing after account switch or reader close cannot start an old reader',async()=>{
 for(const switchAccount of [true,false]){
  let release;const pending=new Promise(r=>release=r);let opened=0;
  const ctx={readerLoadGeneration:0,securityLocalOwner:'admin',securityEpoch:1,selectedBookFile:'one',fetch:()=>pending,ePub:()=>assert.fail('stale book parsed'),startReader:()=>opened++,console,alert:()=>assert.fail('stale alert')};
  vm.createContext(ctx);vm.runInContext(extract('loadBook'),ctx);const work=ctx.loadBook();
  if(switchAccount){ctx.securityLocalOwner='trial';ctx.securityEpoch++;}else ctx.readerLoadGeneration++;
  release({ok:true,blob:async()=>({})});await work;assert.equal(opened,0);
 }
});
test('destroyed reader relocation does not overwrite the new reader current location',()=>{
 const marker='  rendition.on(\n   "relocated",';const start=source.indexOf(marker),end=source.indexOf('\n );',start)+4;
 let callback;const location={start:{cfi:'epubcfi(trial)',href:'trial'}},ctx={rendition:{on:(_,f)=>callback=f},currentLocation:location,isCurrentReader:()=>false,console,loadReaderData:()=>assert.fail('stale reader accessed data'),updateReadingLocationDisplay:()=>assert.fail('stale UI update')};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);callback({start:{cfi:'epubcfi(admin)'}});assert.equal(ctx.currentLocation,location);
});

test('same-account Auth recovery keeps relocation saving, while account and reader changes invalidate it',()=>{
 const readingBook={},readingRendition={},saved=[];
 const ctx={book:readingBook,readingBook,rendition:readingRendition,readingRendition,securityLocalOwner:'admin',readingOwner:'admin',securityEpoch:2,readingEpoch:1,readerLoadGeneration:7,readingGeneration:7,selectedBookFile:'one',readingFile:'one',currentLocation:null,locationsReady:true,updateReadingLocationDisplay:()=>42,loadReaderData:()=>({}),saveReaderData:d=>saved.push(d),highlightActiveTOC(){},console};
 let callback;readingRendition.on=(_,f)=>callback=f;vm.createContext(ctx);
 vm.runInContext(source.match(/const isCurrentReader = [^;]+;/)[0],ctx);
 const start=source.indexOf('  rendition.on(\n   "relocated",'),end=source.indexOf('\n );',start)+4;
 vm.runInContext(source.slice(start,end),ctx);callback({start:{cfi:'epubcfi(current)',href:'chapter'}});assert.equal(saved.length,1);assert.equal(saved[0].progress,42);
 ctx.securityLocalOwner='trial';callback({start:{cfi:'epubcfi(old)'}});assert.equal(saved.length,1);
 ctx.securityLocalOwner='admin';ctx.readerLoadGeneration++;callback({start:{cfi:'epubcfi(old)'}});assert.equal(saved.length,1);
});
test('same-account Auth refresh does not discard a pending book download',async()=>{
 let release,opened=0;const pending=new Promise(r=>release=r),ctx={readerLoadGeneration:0,securityLocalOwner:'admin',securityEpoch:1,selectedBookFile:'one',fetch:()=>pending,ePub:()=>({}),startReader:()=>opened++,console,alert:()=>assert.fail('unexpected alert')};
 vm.createContext(ctx);vm.runInContext(extract('loadBook'),ctx);const work=ctx.loadBook();ctx.securityEpoch++;release({ok:true,blob:async()=>({})});await work;assert.equal(opened,1);
});
