'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.events={};this.value='';this.hidden=false;this.open=false;}append(...v){for(const x of v){x.parentElement=this;this.children.push(x);}}replaceChildren(...v){this.children=[];this.append(...v);}setAttribute(k,v){this[k]=v;}addEventListener(k,f){this.events[k]=f;}showModal(){this.open=true;}close(){this.open=false;}focus(){}}
 const body=new E('body'),calls=[];let opens=0,removed=0,verified=0,fresh=false,release;const user={uid:'u',email:'u@example.test',providerData:[{providerId:'password'}],reauthenticateWithCredential:async cred=>{assert.equal(cred.password,'secret');verified++;fresh=true;},getIdToken:async force=>assert.equal(force,true)};
 const ctx={window:{},document:{body,createElement:t=>new E(t)},navigator:{onLine:true},cloudUser:user,securityLocalOwner:'u',selectedBookFile:'book',openReader:()=>opens++,readerDeviceId:()=> 'current',readerSessionKey:uid=>'grant-'+uid,localStorage:{removeItem:key=>calls.push({removeKey:key})},firebase:{auth:{EmailAuthProvider:{credential:(email,password)=>({email,password})},GoogleAuthProvider:function(){}}},accountSecurityError:e=>e.message,securityCall:async(name,args)=>{calls.push({name,args});if(args.operation==='list')return {devices:[{id:'unused',label:'Old browser',active:false}]};if(args.operation==='remove'){if(!fresh)throw Object.assign(Error('recent authentication required'),{code:'functions/failed-precondition'});removed++;return {ok:true};}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/reader-recovery.js'),'utf8'),ctx);return {ctx,api:ctx.window.PromoHubReaderRecovery,body,calls,opens:()=>opens,removed:()=>removed,verified:()=>verified,makeFresh:()=>fresh=true};
}
const flush=()=>new Promise(r=>setImmediate(r));const walk=e=>[e,...e.children.flatMap(walk)];const find=(s,tag,text)=>walk(s.body).find(e=>e.tag===tag&&(text===undefined||e.textContent===text));
test('quota recovery lists unused registration and reauthenticates inline before removing and reopening',async()=>{
 const s=setup();s.api.show('Two devices registered',{code:'functions/resource-exhausted'});await flush();const button=find(s,'button','Remove this registration and open book');assert.ok(button);await button.onclick();const input=find(s,'input');assert.equal(input.type,'password');assert.equal(find(s,'form').hidden,false);assert.equal(s.removed(),0);input.value='secret';find(s,'form').onsubmit({preventDefault(){}});await flush();await flush();assert.equal(s.verified(),1);assert.equal(s.removed(),1);assert.equal(s.opens(),1);assert.equal(input.value,'');assert.equal(find(s,'dialog').open,false);
});
test('recently authenticated device replacement opens book without another sign-in',async()=>{
 const s=setup();s.makeFresh();s.api.show('quota',{code:'resource-exhausted'});await flush();await find(s,'button','Remove this registration and open book').onclick();assert.equal(s.verified(),0);assert.equal(s.removed(),1);assert.equal(s.opens(),1);
});
test('account switching while device list loads discards the response',async()=>{
 const s=setup();let release;s.ctx.securityCall=()=>new Promise(r=>release=r);s.api.show('quota',{code:'resource-exhausted'});s.ctx.cloudUser={uid:'other'};release({devices:[{id:'private',label:'private browser'}]});await flush();assert.equal(find(s,'button','Remove this registration and open book'),undefined);assert.equal(s.opens(),0);
});
test('closing recovery clears password and never opens the account profile',async()=>{
 const s=setup();s.api.show('offline check required');find(s,'input').value='not saved';s.api.reset();assert.equal(find(s,'input').value,'');assert.equal(find(s,'dialog').open,false);assert.equal(s.calls.length,0);assert.equal(s.opens(),0);
});
test('offline recovery explains connection requirement without invoking device mutation',async()=>{
 const s=setup();s.ctx.navigator.onLine=false;s.api.show('One access check required');assert.equal(find(s,'button','Registered devices').hidden,true);assert.equal(s.calls.length,0);
});

test('profile removal confirms password, refreshes once and never opens a book',async()=>{
 const s=setup();let refresh=0;s.api.manageDevice('unused','Old browser',()=>refresh++);await flush();
 assert.equal(find(s,'h2').textContent,'Remove device');assert.equal(find(s,'button','Retry opening book').hidden,true);
 assert.equal(find(s,'form').hidden,false);assert.ok(find(s,'button','Confirm and remove device'));
 find(s,'input').value='secret';find(s,'form').onsubmit({preventDefault(){}});await flush();await flush();
 assert.equal(s.removed(),1);assert.equal(s.verified(),1);assert.equal(refresh,1);assert.equal(s.opens(),0);assert.equal(find(s,'dialog').open,false);assert.equal(find(s,'input').value,'');
 assert.equal(s.calls.some(c=>c.removeKey),false);
});
test('recent profile confirmation removes this browser and clears only its saved permission',async()=>{
 const s=setup();let refresh=0;s.makeFresh();s.api.manageDevice('current','This browser',()=>refresh++);await flush();
 assert.equal(s.removed(),1);assert.equal(s.verified(),0);assert.equal(refresh,1);assert.equal(s.opens(),0);
 assert.deepEqual(s.calls.filter(c=>c.removeKey),[{removeKey:'grant-u'}]);
});
test('profile device removal supports Google confirmation',async()=>{
 const s=setup();let popup=0,refresh=0;s.ctx.cloudUser.providerData=[{providerId:'google.com'}];s.ctx.cloudUser.reauthenticateWithPopup=async()=>{popup++;s.makeFresh();};
 s.api.manageDevice('unused','Old browser',()=>refresh++);await flush();assert.ok(find(s,'button','Confirm with Google and remove device'));assert.equal(find(s,'input').parentElement.hidden,true);
 find(s,'form').onsubmit({preventDefault(){}});await flush();await flush();assert.equal(popup,1);assert.equal(s.removed(),1);assert.equal(refresh,1);assert.equal(s.opens(),0);
});
test('wrong password leaves registration intact and clears the entered password',async()=>{
 const s=setup();let refresh=0;s.ctx.cloudUser.reauthenticateWithCredential=async()=>{throw Error('Wrong password');};
 s.api.manageDevice('unused','Old browser',()=>refresh++);await flush();find(s,'input').value='wrong';find(s,'form').onsubmit({preventDefault(){}});await flush();
 assert.equal(s.removed(),0);assert.equal(refresh,0);assert.equal(s.opens(),0);assert.equal(find(s,'input').value,'');assert.equal(find(s,'form').hidden,false);assert.ok(walk(s.body).some(e=>e.textContent==='Wrong password'));
});
test('offline profile removal makes no request',async()=>{
 const s=setup();s.ctx.navigator.onLine=false;s.api.manageDevice('unused','Old browser',()=>assert.fail());await flush();assert.equal(s.calls.length,0);assert.equal(s.removed(),0);assert.equal(s.opens(),0);
});
test('closing or changing accounts during reauthentication prevents a subsequent removal',async()=>{
 for(const action of ['close','switch']){const s=setup();let release,refresh=0;s.ctx.cloudUser.reauthenticateWithCredential=()=>new Promise(r=>release=r);
 s.api.manageDevice('unused','Old browser',()=>refresh++);await flush();find(s,'input').value='secret';find(s,'form').onsubmit({preventDefault(){}});
 if(action==='close')s.api.reset();else s.ctx.cloudUser={uid:'other'};release();await flush();assert.equal(s.removed(),0);assert.equal(refresh,0);assert.equal(s.opens(),0);assert.equal(find(s,'input').value,'');}
});
test('ordinary reading recovery restores its controls after profile management',async()=>{
 const s=setup();s.api.manageDevice('unused','Old browser',()=>{});await flush();s.api.reset();s.api.show('Try reading again');
 assert.equal(find(s,'h2').textContent,'Reading access');assert.equal(find(s,'button','Retry opening book').hidden,false);assert.equal(find(s,'button','Registered devices').hidden,false);assert.equal(find(s,'form').hidden,true);
});
test('profile Remove device invokes inline recovery and refreshes the list after success',async()=>{
 const nodes={readerDevicesStatus:{},readerDevicesList:{children:[],replaceChildren(){this.children=[];},append(n){this.children.push(n);}}};let removal,lists=0;
 const ctx={document:{getElementById:id=>nodes[id],createElement:()=>({children:[],append(n){this.children.push(n);}})},cloudUser:{uid:'u'},readerSessionEpoch:1,
 securityCall:async(name,args)=>{assert.equal(args.operation,'list');lists++;return {devices:lists===1?[{id:'unused',label:'Mobile'}]:[],readingAccessMode:'strict'};},
 securityWork:fn=>fn(),confirm:()=>true,readerDeviceId:()=> 'current',window:{PromoHubReaderRecovery:{manageDevice:(id,label,done)=>{removal={id,label,done};}}}};
 const source=fs.readFileSync(require.resolve('../public/reader-sessions.js'),'utf8');const start=source.indexOf('async function readerDevicesRefresh()');const end=source.indexOf("document.getElementById('readerDevicesRefresh')",start);
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);await ctx.readerDevicesRefresh();await nodes.readerDevicesList.children[0].children[1].onclick();
 assert.equal(removal.id,'unused');assert.equal(lists,1);await removal.done();assert.equal(lists,2);assert.equal(nodes.readerDevicesList.children.length,0);
});
test('live recovery list updates preserve inline identity confirmation',async()=>{
 const s=setup();s.api.show('quota',{code:'resource-exhausted'});await flush();await find(s,'button','Remove this registration and open book').onclick();
 find(s,'input').value='secret';assert.equal(s.api.deviceListOpen(),true);s.api.renderDevices({devices:[{id:'new',label:'New browser'}]});
 assert.ok(find(s,'p','New browser'));assert.equal(find(s,'p','Old browser'),undefined);assert.equal(find(s,'form').hidden,false);assert.equal(find(s,'input').value,'secret');s.api.reset();assert.equal(s.api.deviceListOpen(),false);
});

test('session conflicts offer retry without device removal or password confirmation',async()=>{
 for(const code of ['already-exists','functions/already-exists']){const s=setup();s.api.show('Another registered device is reading',{code});await flush();assert.equal(find(s,'button','Registered devices').hidden,true);assert.equal(find(s,'form').hidden,true);assert.equal(s.calls.length,0);await find(s,'button','Retry opening book').onclick();assert.equal(s.opens(),1);assert.equal(s.removed(),0);}
});
