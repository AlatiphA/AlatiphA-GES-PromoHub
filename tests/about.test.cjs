'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=name=>fs.readFileSync(require.resolve('../public/'+name),'utf8');
function setup(options={}){
 const nodes=new Map(),events={},timers=new Map();let id=0,calls=0;
 const node=name=>{if(!nodes.has(name))nodes.set(name,{textContent:'',disabled:false,addEventListener:(e,f)=>events[name+':'+e]=f,remove(){}});return nodes.get(name);};
 const ctx={APP_VERSION:'1.11.11',document:{getElementById:node,createElement:()=>({}),head:{appendChild(){}}},window:{addEventListener:(e,f)=>events[e]=f,navigator:{},matchMedia:()=>({matches:!!options.standalone})},navigator:{onLine:!options.offline,userAgent:options.ios?'iPhone':'Chrome'},localStorage:{getItem:()=>options.dismissed?'1':null,setItem(){}},setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),console:{error(){}},AbortController,fetch:async(url,init)=>{calls++;assert.equal(init.cache,'no-store');if(options.error)throw Error('Network');return {ok:true,json:async()=>({version:options.release||'1.11.11'})};}};
 if(options.registration)ctx.navigator.serviceWorker={getRegistration:async()=>options.registration};
 ctx.window.navigator=ctx.navigator;
 vm.createContext(ctx);vm.runInContext(read('install.js'),ctx);vm.runInContext(read('about.js'),ctx);
 return {ctx,node,events,timers,calls:()=>calls,check:()=>events['aboutCheckUpdates:click'](),install:()=>events['aboutInstallApp:click']()};
}
test('release numbers match across app, worker, shell cache, About and release metadata',()=>{
 const v=JSON.parse(read('version.json')).version;assert.equal(v,'1.11.11');assert.equal(JSON.parse(read('manifest.json')).version,v);
 assert.ok(read('app.js').includes('const APP_VERSION = "'+v+'"'));assert.ok(read('sw.js').includes("const APP_VERSION='v"+v+"'"));assert.ok(read('sw.js').includes('const CACHE_NAME=PREFIX+APP_VERSION'));
 assert.ok(read('index.html').includes('id="aboutAppVersion">'+v));assert.ok(read('sw.js').includes("'./about.js'"));
 for(const name of ['faq.html','user-guide.html']){assert.ok(read(name).includes('v'+v));assert.ok(!read(name).includes('v1.11.10'));}
 assert.match(read('style.css'),/:not\(#profileAppearanceSettings\):not\(#profileAboutSettings\)/);
});
test('offline update check does not claim latest or make a request',async()=>{const s=setup({offline:true});await s.check();assert.equal(s.calls(),0);assert.match(s.node('aboutUpdateStatus').textContent,/Connect to the internet/);assert.equal(s.node('aboutCheckUpdates').disabled,false);});
test('successful release check reports current version and checks worker',async()=>{let updates=0;const s=setup({registration:{update:async()=>updates++}});await s.check();assert.equal(updates,1);assert.match(s.node('aboutUpdateStatus').textContent,/up to date.*1.11.11/);assert.equal(s.timers.size,0);});
test('waiting worker asks for safe reopening without forced activation',async()=>{const s=setup({registration:{waiting:{},update:async()=>{}}});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Close all PromoHub/);assert.ok(!read('about.js').includes('skipWaiting'));});
test('new release is compared numerically',async()=>{const s=setup({release:'1.11.12'});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/1.11.12 is available/);const older=setup({release:'1.11.9'});await older.check();assert.match(older.node('aboutUpdateStatus').textContent,/up to date/);});
test('failed or invalid release check restores button and reports error',async()=>{for(const o of [{error:true},{release:'bad'}]){const s=setup(o);await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Could not check/);assert.equal(s.node('aboutCheckUpdates').disabled,false);assert.equal(s.timers.size,0);}});
test('worker installation failure does not claim success',async()=>{const s=setup({registration:{update:async()=>{},installing:{state:'redundant',addEventListener(){},removeEventListener(){}}}});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Could not check/);});
test('manual install remains available after banner dismissal',async()=>{const s=setup({dismissed:true});let prompts=0,prevented=0;s.events.beforeinstallprompt({preventDefault:()=>prevented++,prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'accepted'})});await s.install();assert.equal(prevented,1);assert.equal(prompts,1);assert.match(s.node('aboutInstallStatus').textContent,/Installation accepted/);await s.install();assert.equal(prompts,1);});
test('standalone and appinstalled show Installed',async()=>{const s=setup({standalone:true});assert.equal(s.node('aboutInstallApp').textContent,'Installed');assert.equal(s.node('aboutInstallApp').disabled,true);const b=setup();b.events.appinstalled();assert.equal(b.node('aboutInstallApp').textContent,'Installed');});
test('install fallback includes iOS steps and catches rejected prompt',async()=>{const s=setup({ios:true});await s.install();assert.match(s.node('aboutInstallStatus').textContent,/Share.*Add to Home Screen/);const b=setup();b.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{throw Error('Blocked');}});await b.install();assert.match(b.node('aboutInstallStatus').textContent,/could not start/);});

test('hosting headers have valid Firebase key/value entries',()=>{const config=JSON.parse(fs.readFileSync(require.resolve('../firebase.json'),'utf8'));for(const rule of config.hosting.headers){assert.equal(typeof rule.source,'string');for(const header of rule.headers){assert.equal(typeof header.key,'string');assert.equal(typeof header.value,'string');assert.equal(header.source,undefined);}}});
