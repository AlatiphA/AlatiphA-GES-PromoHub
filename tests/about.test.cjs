'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=name=>fs.readFileSync(require.resolve('../public/'+name),'utf8');
function setup(options={}){
 const nodes=new Map(),events={},timers=new Map();let id=0,calls=0,reloads=0;const lifecycle=[];
 const node=name=>{if(!nodes.has(name))nodes.set(name,{textContent:'',disabled:false,addEventListener:(e,f)=>events[name+':'+e]=f,remove(){}});return nodes.get(name);};
 const ctx={APP_VERSION:'1.11.12',persistCurrentReaderPosition:()=>{lifecycle.push('save');if(options.saveError)throw Error('Storage');},readerSessionRelease:()=>{lifecycle.push('release');return options.releaseSession?options.releaseSession():Promise.resolve();},document:{getElementById:node,createElement:()=>({}),head:{appendChild(){}}},window:{location:{reload:()=>{reloads++;lifecycle.push('reload');}},addEventListener:(e,f)=>events[e]=f,navigator:{},matchMedia:()=>({matches:!!options.standalone})},navigator:{onLine:!options.offline,userAgent:options.ios?'iPhone':'Chrome'},localStorage:{getItem:()=>options.dismissed?'1':null,setItem(){}},setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),console:{error(){}},AbortController,fetch:async(url,init)=>{calls++;assert.equal(init.cache,'no-store');if(options.error)throw Error('Network');return {ok:true,json:async()=>({version:options.release||'1.11.12'})};}};
 if(options.registration)ctx.navigator.serviceWorker={controller:{},getRegistration:async()=>options.registration,addEventListener:(e,f)=>events['sw:'+e]=f,removeEventListener:e=>delete events['sw:'+e]};
 ctx.window.navigator=ctx.navigator;
 vm.createContext(ctx);vm.runInContext(read('install.js'),ctx);vm.runInContext(read('about.js'),ctx);
 return {ctx,node,events,timers,lifecycle,reloads:()=>reloads,calls:()=>calls,update:()=>events['aboutInstallUpdate:click'](),check:()=>events['aboutCheckUpdates:click'](),install:()=>events['aboutInstallApp:click']()};
}
test('release numbers match across app, worker, shell cache, About and release metadata',()=>{
 const v=JSON.parse(read('version.json')).version;assert.equal(v,'1.11.12');assert.equal(JSON.parse(read('manifest.json')).version,v);
 assert.ok(read('app.js').includes('const APP_VERSION = "'+v+'"'));assert.ok(read('sw.js').includes("const APP_VERSION='v"+v+"'"));assert.ok(read('sw.js').includes('const CACHE_NAME=PREFIX+APP_VERSION'));
 assert.ok(read('index.html').includes('id="aboutAppVersion">'+v));assert.ok(read('sw.js').includes("'./about.js'"));
 for(const name of ['faq.html','user-guide.html']){assert.ok(read(name).includes('v'+v));assert.ok(!read(name).includes('v1.11.10'));}
 assert.match(read('style.css'),/:not\(#profileAppearanceSettings\):not\(#profileAboutSettings\)/);
});
test('offline update check does not claim latest or make a request',async()=>{const s=setup({offline:true});await s.check();assert.equal(s.calls(),0);assert.match(s.node('aboutUpdateStatus').textContent,/Connect to the internet/);assert.equal(s.node('aboutCheckUpdates').disabled,false);});
test('successful release check reports current version and checks worker',async()=>{let updates=0;const s=setup({registration:{update:async()=>updates++}});await s.check();assert.equal(updates,1);assert.match(s.node('aboutUpdateStatus').textContent,/up to date.*1.11.12/);assert.equal(s.timers.size,0);});
test('checking stages an update and never activates or reloads automatically',async()=>{let messages=0;const s=setup({registration:{waiting:{postMessage:()=>messages++},update:async()=>{}}});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Select Install update/);assert.equal(s.node('aboutInstallUpdate').hidden,false);assert.equal(messages,0);assert.equal(s.reloads(),0);});
test('new release is compared numerically',async()=>{const s=setup({release:'1.11.13'});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/An update is ready/);const older=setup({release:'1.11.9'});await older.check();assert.match(older.node('aboutUpdateStatus').textContent,/up to date/);assert.equal(older.node('aboutInstallUpdate').hidden,true);});
test('failed or invalid release check restores button and reports error',async()=>{for(const o of [{error:true},{release:'bad'}]){const s=setup(o);await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Could not check/);assert.equal(s.node('aboutCheckUpdates').disabled,false);assert.equal(s.timers.size,0);}});
test('worker installation failure does not claim success',async()=>{const s=setup({registration:{update:async()=>{},installing:{state:'redundant',addEventListener(){},removeEventListener(){}}}});await s.check();assert.match(s.node('aboutUpdateStatus').textContent,/Could not check/);});
test('manual install remains available after banner dismissal',async()=>{const s=setup({dismissed:true});let prompts=0,prevented=0;s.events.beforeinstallprompt({preventDefault:()=>prevented++,prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'accepted'})});await s.install();assert.equal(prevented,1);assert.equal(prompts,1);assert.match(s.node('aboutInstallStatus').textContent,/Installation accepted/);await s.install();assert.equal(prompts,1);});
test('standalone and appinstalled show Installed',async()=>{const s=setup({standalone:true});assert.equal(s.node('aboutInstallApp').textContent,'Installed');assert.equal(s.node('aboutInstallApp').disabled,true);const b=setup();b.events.appinstalled();assert.equal(b.node('aboutInstallApp').textContent,'Installed');});
test('install fallback includes iOS steps and catches rejected prompt',async()=>{const s=setup({ios:true});await s.install();assert.match(s.node('aboutInstallStatus').textContent,/Share.*Add to Home Screen/);const b=setup();b.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{throw Error('Blocked');}});await b.install();assert.match(b.node('aboutInstallStatus').textContent,/could not start/);});

test('hosting headers have valid Firebase key/value entries',()=>{const config=JSON.parse(fs.readFileSync(require.resolve('../firebase.json'),'utf8'));for(const rule of config.hosting.headers){assert.equal(typeof rule.source,'string');for(const header of rule.headers){assert.equal(typeof header.key,'string');assert.equal(typeof header.value,'string');assert.equal(header.source,undefined);}}});

test('Install update waits for controller change and reading-session release before reloading once',async()=>{
 let sent=0,release;const worker={postMessage:m=>{assert.equal(m.type,'PROMOHUB_ACTIVATE_UPDATE');sent++;}};
 const s=setup({registration:{waiting:worker,update:async()=>{}},releaseSession:()=>new Promise(r=>release=r)});await s.check();
 const work=s.update();assert.equal(sent,1);assert.equal(s.reloads(),0);assert.deepEqual(s.lifecycle,['save']);await s.update();assert.equal(sent,1);
 s.ctx.navigator.serviceWorker.controller=worker;s.events['sw:controllerchange']();await Promise.resolve();assert.deepEqual(s.lifecycle,['save','release']);assert.equal(s.reloads(),0);
 release();await work;assert.equal(s.reloads(),1);assert.deepEqual(s.lifecycle,['save','release','save','reload']);assert.equal(s.timers.size,0);assert.equal(s.events['sw:controllerchange'],undefined);await s.update();assert.equal(s.reloads(),1);
});
test('activation timeout restores controls, removes its listener and never reloads later',async()=>{
 const worker={postMessage(){}};const s=setup({registration:{waiting:worker,update:async()=>{}}});await s.check();const work=s.update();
 [...s.timers.values()][0]();await work;assert.equal(s.reloads(),0);assert.equal(s.node('aboutInstallUpdate').disabled,false);assert.match(s.node('aboutUpdateStatus').textContent,/Could not finish/);assert.equal(s.events['sw:controllerchange'],undefined);assert.equal(s.timers.size,0);
});
test('a failed position save prevents activation and reload',async()=>{let sent=0;const s=setup({saveError:true,registration:{waiting:{postMessage:()=>sent++},update:async()=>{}}});await s.check();await s.update();assert.equal(sent,0);assert.equal(s.reloads(),0);});
test('without a waiting worker an available release still saves and releases before page refresh',async()=>{const s=setup({release:'1.11.13'});await s.check();await s.update();assert.deepEqual(s.lifecycle,['save','release','save','reload']);assert.equal(s.reloads(),1);});
test('checking a current release never allows an install-update refresh',async()=>{const s=setup();await s.check();await s.update();assert.equal(s.reloads(),0);});
test('worker message failure permits retry without premature reload',async()=>{const s=setup({registration:{waiting:{postMessage(){throw Error('Worker closed');}},update:async()=>{}}});await s.check();await s.update();assert.equal(s.reloads(),0);assert.equal(s.node('aboutInstallUpdate').disabled,false);assert.equal(s.timers.size,0);});
