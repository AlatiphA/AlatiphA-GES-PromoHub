'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 class Element{
  constructor(){this.children=[];this.events={};this.hidden=false;this.open=false;this.textContent='';this.attrs={};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,f){this.events[k]=f;}querySelector(){return this.badge;}focus(){this.focused=true;}
  showModal(){this.open=true;}close(){this.open=false;}getBoundingClientRect(){return {left:10,right:500,top:10,bottom:500};}
 }
 const ids={},buttons=[new Element(),new Element()];buttons.forEach(b=>b.badge=new Element());
 for(const id of ['notificationDialog','notificationList','notificationStatus','notificationAlerts','notificationMarkAll','notificationClose'])ids[id]=new Element();
 const callbacks=new Map(),storage=new Map(),writes=[],alerts=[],calls=[],routes=[],documents=new Map();
 const db={collection:path=>{const q={orderBy(){return q;},limit(){return q;},onSnapshot(...args){const fn=typeof args[0]==='function'?args[0]:args[1];callbacks.set(path,fn);return ()=>{};}};return q;},doc:path=>({path,get:async()=>{const value=documents.get(path);if(value instanceof Promise)return value;return {exists:!!value,id:path.split("/").at(-1),data:()=>value};}}),batch(){return {set:(r,v)=>writes.push({path:r.path,value:v}),update:(r,v)=>writes.push({path:r.path,value:v}),commit:async()=>{}};}};
 const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>123};
 const document={activeElement:new Element(),visibilityState:'visible',getElementById:id=>ids[id],querySelectorAll:()=>buttons,createElement:()=>new Element()};
 const window={addEventListener(){}};const navigator={onLine:true,serviceWorker:{addEventListener:(_,fn)=>window.workerMessage=fn,getRegistration:async()=>({showNotification:async(title,data)=>alerts.push({title,...data})})}};
 const context={window,document,navigator,firebase:{firestore},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Notification:{permission:'granted',requestPermission:async()=>'granted'},securityCall:async(name,data)=>calls.push({name,data}),location:{href:'https://example.test/index.html',search:''},history:{state:{},replaceState:(_,__,url)=>routes.push(url)},URL,URLSearchParams,console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/notifications.js'),'utf8'),context);
 function emit(path,records,fromCache=false){callbacks.get(path)({docs:records.map(n=>({id:n.id,data:()=>n})),metadata:{fromCache}});}
 return {api:window.PromoHubInbox,ids,buttons,callbacks,storage,writes,alerts,calls,context,emit,routes,documents};
}
const user=uid=>({uid,emailVerified:true}),note=(id,body='A plain message')=>({id,title:'Notice',body,createdAt:100,read:false});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('warm push tap displays only the exact personal message and can return to all notices',async()=>{
 const s=setup();s.api.start(user('u'));s.emit('users/u/notifications',[note('first'),note('wanted','Target body')]);
 s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u',noticeId:'wanted',source:'personal'}});await flush();
 assert.equal(s.ids.notificationDialog.open,true);assert.equal(s.ids.notificationList.children.length,2);
 assert.equal(s.ids.notificationList.children[1].children[1].textContent,'Target body');
 s.ids.notificationList.children[0].events.click();assert.equal(s.ids.notificationList.children.length,2);
});
test('cold route waits for account restoration and fetches a notice outside the latest page',async()=>{
 const s=setup();s.context.location.search='?inbox=1&noticeUid=u&noticeId=older&noticeSource=personal';s.context.location.href='https://example.test/index.html'+s.context.location.search;
 s.documents.set('users/u/notifications/older',note('older','Older notice'));s.api.start(user('u'));await flush();
 assert.equal(s.ids.notificationDialog.open,true);assert.equal(s.ids.notificationList.children[1].children[1].textContent,'Older notice');assert.ok(!s.routes[0].includes('noticeId'));
});
test('announcement taps queued before sign-in open the selected announcement',async()=>{
 const s=setup();s.documents.set('announcements/a',note('a','Announcement body'));
 s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u',noticeId:'a',source:'announcement'}});s.api.start(user('u'));await flush();
 assert.equal(s.ids.notificationList.children[1].children[1].textContent,'Announcement body');
});
test('wrong-account taps and delayed target fetches cannot reveal another account message',async()=>{
 const s=setup();s.api.start(user('u'));s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'other',noticeId:'private',source:'personal'}});assert.equal(s.ids.notificationDialog.open,false);
 let release;s.documents.set('users/u/notifications/late',new Promise(r=>release=r));s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u',noticeId:'late',source:'personal'}});s.api.start(user('other'));release({exists:true,data:()=>note('late','secret')});await flush();assert.equal(s.ids.notificationDialog.open,false);assert.ok(!JSON.stringify(s.ids.notificationList.children).includes('secret'));
});
test('missing targets show an unavailable message and legacy alerts still open inbox',async()=>{
 const s=setup();s.api.start(user('u'));s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u',noticeId:'missing',source:'personal'}});await flush();assert.equal(s.ids.notificationStatus.textContent,'This notification is no longer available.');
 s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u'}});assert.equal(s.ids.notificationDialog.open,true);
});
