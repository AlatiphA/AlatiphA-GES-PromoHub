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
