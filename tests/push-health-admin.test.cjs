'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.events={};}append(...v){this.children.push(...v);if(this.tag==='select'&&!this.value&&v.length)this.value=v[0].value;}replaceChildren(...v){this.children=[];this.textContent='';this.append(...v);}setAttribute(){}addEventListener(k,f){this.events[k]=f;}}
 const host=new E('div'),state={host},calls=[];let current=true,pending=null;
 const ctx={document:{createElement:tag=>new E(tag)},securityAdminStart:()=>state,securityAdminCurrent:s=>current&&s===state,securityCall:async(name,data)=>{calls.push({name,data});if(name==='getPromoHubUsers')return {users:[{uid:'u',displayName:'Zaida',email:'z@example.test'}]};if(pending)return pending;return {enabled:true,accountStatus:'active',authStatus:'active_verified',deleting:false,devices:[{browser:1,enabled:false,stale:false,categories:['messages'],lastSeenMs:100}],latest:{state:'failed',attemptedAtMs:200,accepted:0,alreadyAccepted:0,failed:1,skipped:0,reasons:{},errorCode:'messaging/invalid-argument'}};},Date,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../public/reports-push-admin.js'),'utf8'),ctx);
 ctx.pushDiagnosticsAdmin(state);return {host,calls,disable:()=>current=false,defer:p=>pending=p};
}
const flush=()=>new Promise(r=>setImmediate(r));
const flat=e=>[e.textContent,...e.children.map(flat)].flat().join(' ');
test('administration push checker shows human names and accepted-versus-display distinction without sending messages',async()=>{
 const s=setup();await flush();const card=s.host.children[0],select=card.children.find(e=>e.tag==='select'&&e.children.some(o=>o.value==='u')),check=card.children.find(e=>e.tag==='button'&&e.textContent==='Check delivery');assert.equal(select.children[0].textContent,'Zaida · z@example.test');await check.onclick();assert.equal(s.calls.at(-1).name,'getPromoHubPushDiagnostics');assert.equal(s.calls.at(-1).data.uid,'u');assert.ok(flat(card).includes('messaging/invalid-argument'));assert.ok(flat(card).includes('Browser 1: disabled'));assert.ok(flat(card).includes('not confirmed displayed'));assert.ok(!s.calls.some(c=>/send|register|setPromo/.test(c.name)));
});
test('late diagnostics results cannot update an administration page after account change',async()=>{
 const s=setup();await flush();let release;s.defer(new Promise(r=>release=r));const card=s.host.children[0],check=card.children.find(e=>e.tag==='button'&&e.textContent==='Check delivery');const work=check.onclick();s.disable();release({enabled:true,devices:[],latest:null});await work;assert.ok(!flat(card).includes('No delivery check has been recorded'));
});
