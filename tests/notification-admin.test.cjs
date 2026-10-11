'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 class El{constructor(){this.children=[];this.style={};this.value='';this.events={};}append(...n){this.children.push(...n);}replaceChildren(){this.children=[];}addEventListener(k,f){this.events[k]=f;}setAttribute(){}focus(){}}
 const host=new El(),calls=[],state={current:true};let fail=true;
 const ctx={document:{createElement:()=>new El()},securityIsAdmin:()=>state.current,securityAccountLabel:u=>u.email,securityAdminStart:()=>({host}),securityAdminCurrent:()=>state.current,adminCancelSearch(){},cloudUser:{uid:'a'},crypto:{randomUUID:()=> '11111111-1111-1111-1111-111111111111'},confirm:()=>true,securityCall:async(name,data)=>{calls.push({name,data});if(fail)throw Error('Retry');}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/notifications-admin.js'),'utf8'),ctx);
 return {ctx,host,calls,state,setFail:v=>fail=v};
}
test('administrator composer uses the selected readable identity and retains the delivery ID on retry',async()=>{
 const s=setup();s.ctx.notificationCompose({uid:'u',email:'reader@example.test'});const form=s.host.children[0],title=form.children[2].children[0],body=form.children[3].children[0];
 assert.equal(form.children[0].textContent,'Recipient: reader@example.test');title.value='Study';body.value='Message';await form.events.submit({preventDefault(){}});s.setFail(false);await form.events.submit({preventDefault(){}});
 assert.equal(s.calls.length,2);assert.equal(s.calls[0].data.requestId,s.calls[1].data.requestId);assert.equal(s.calls[0].data.uid,'u');assert.equal(s.calls[0].data.audience,'user');assert.equal(body.value,'');
});
test('revoked administrator or stale composer cannot send messages',async()=>{
 const s=setup();s.ctx.notificationCompose();const form=s.host.children[0];form.children[2].children[0].value='Title';form.children[3].children[0].value='Body';s.state.current=false;await form.events.submit({preventDefault(){}});assert.equal(s.calls.length,0);s.ctx.notificationAdminReset();
});
test('notification taps focus an existing reader in the correct scope or open an account-bound inbox route',async()=>{
 const listeners={},messages=[];let opened,focused=false;
 const client={url:'https://example.test/PromoHub/index.html',focus:async()=>{focused=true;},postMessage:m=>messages.push(m)};
 const self={registration:{scope:'https://example.test/PromoHub/'},addEventListener:(k,f)=>listeners[k]=f,clients:{matchAll:async()=>[{url:'https://example.test/OtherApp/'},client],openWindow:async u=>opened=u}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/sw.js'),'utf8'),{self,URL,console});
 let work;listeners.notificationclick({notification:{close(){},data:{uid:'u'}},waitUntil:p=>work=p});await work;assert.equal(focused,true);assert.equal(messages[0].uid,'u');assert.equal(opened,undefined);
 self.clients.matchAll=async()=>[{url:'https://example.test/OtherApp/'}];listeners.notificationclick({notification:{close(){},data:{uid:'u'}},waitUntil:p=>work=p});await work;assert.equal(opened,'https://example.test/PromoHub/index.html?inbox=1&noticeUid=u');
});
