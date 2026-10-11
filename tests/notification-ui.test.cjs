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
 const callbacks=new Map(),storage=new Map(),writes=[],alerts=[],calls=[],routes=[];
 const db={collection:path=>{const q={orderBy(){return q;},limit(){return q;},onSnapshot(...args){const fn=typeof args[0]==='function'?args[0]:args[1];callbacks.set(path,fn);return ()=>{};}};return q;},doc:path=>({path}),batch(){return {set:(r,v)=>writes.push({path:r.path,value:v}),update:(r,v)=>writes.push({path:r.path,value:v}),commit:async()=>{}};}};
 const firestore=()=>db;firestore.FieldValue={serverTimestamp:()=>123};
 const document={activeElement:new Element(),visibilityState:'visible',getElementById:id=>ids[id],querySelectorAll:()=>buttons,createElement:()=>new Element()};
 const window={addEventListener(){}};const navigator={onLine:true,serviceWorker:{addEventListener:(_,fn)=>window.workerMessage=fn,getRegistration:async()=>({showNotification:async(title,data)=>alerts.push({title,...data})})}};
 const context={window,document,navigator,firebase:{firestore},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Notification:{permission:'granted',requestPermission:async()=>'granted'},securityCall:async(name,data)=>calls.push({name,data}),location:{href:'https://example.test/index.html',search:''},history:{state:{},replaceState:(_,__,url)=>routes.push(url)},URL,URLSearchParams,console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/notifications.js'),'utf8'),context);
 function emit(path,records,fromCache=false){callbacks.get(path)({docs:records.map(n=>({id:n.id,data:()=>n})),metadata:{fromCache}});}
 return {api:window.PromoHubInbox,ids,buttons,callbacks,storage,writes,alerts,calls,context,emit,routes};
}
const user=uid=>({uid,emailVerified:true}),note=(id,body='A plain message')=>({id,title:'Notice',body,createdAt:100,read:false});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('personal and announcement read states merge into the recent unread badge',()=>{
 const s=setup();s.api.start(user('u'));s.emit('users/u/notifications',[note('p')]);s.emit('announcements',[note('a')]);assert.equal(s.buttons[0].badge.textContent,'2');
 s.emit('users/u/announcementReads',[{id:'a',read:true}]);assert.equal(s.buttons[0].badge.textContent,'1');assert.equal(s.ids.notificationList.children.length,2);
});
test('account switches clear visible data and discard delayed old-account snapshots',()=>{
 const s=setup();s.api.start(user('u'));s.emit('users/u/notifications',[note('private','Private to U')]);const delayed=s.callbacks.get('users/u/notifications');s.api.open();s.api.start(user('b'));
 delayed({docs:[{id:'old',data:()=>note('old','Private to U')}],metadata:{fromCache:false}});assert.equal(s.ids.notificationList.children.length,1);assert.equal(s.ids.notificationList.children[0].textContent,'No messages loaded yet.');assert.equal(s.ids.notificationDialog.open,false);
 s.api.reset();assert.equal(s.buttons[0].hidden,false);
});
test('offline cache belongs to the matching account and read actions require a connection',()=>{
 const s=setup();s.storage.set('ges-promohub-inbox-u',JSON.stringify({personal:[{...note('p'),createdAtMs:100}],announcements:[],receipts:{}}));s.context.navigator.onLine=false;
 s.api.start(user('u'));assert.equal(s.buttons[0].badge.textContent,'1');assert.equal(s.ids.notificationMarkAll.disabled,true);assert.match(s.ids.notificationStatus.textContent,/Offline/);
 s.api.start(user('b'));assert.equal(s.buttons[0].badge.hidden,true);
});
test('message bodies render as text and marking read touches only owned notice and receipt paths',async()=>{
 const s=setup();s.api.start(user('u'));s.emit('users/u/notifications',[note('p','<img src=x onerror=alert(1)>')]);s.emit('announcements',[note('a')]);
 assert.equal(s.ids.notificationList.children[0].children[1].textContent,'<img src=x onerror=alert(1)>');
 await s.ids.notificationMarkAll.events.click();assert.deepEqual(s.writes.map(w=>w.path).sort(),['users/u/announcementReads/a','users/u/notifications/p']);assert.equal(s.buttons[0].badge.hidden,true);
});
test('browser alerts skip startup history, use opt-in and discard a changed account after permission prompt',async()=>{
 const s=setup();s.storage.set('ges-promohub-alerts-u','true');s.context.document.visibilityState='hidden';s.api.start(user('u'));s.emit('users/u/notifications',[note('old')]);await flush();assert.equal(s.alerts.length,0);
 s.emit('users/u/notifications',[note('new'),note('old')]);await flush();assert.equal(s.alerts.length,1);assert.equal(s.alerts[0].data.uid,'u');
 let resolve;s.context.Notification.requestPermission=()=>new Promise(r=>resolve=r);s.api.start(user('b'));const prompt=s.ids.notificationAlerts.events.click();s.api.start(user('c'));resolve('granted');await prompt;assert.equal(s.storage.has('ges-promohub-alerts-b'),false);
});
test('notification route opens only for the intended account, without reader navigation',()=>{
 const s=setup();s.context.location.href='https://example.test/index.html?inbox=1&noticeUid=u';s.context.location.search='?inbox=1&noticeUid=u';s.api.start(user('u'));assert.equal(s.ids.notificationDialog.open,true);assert.equal(s.routes[0],'https://example.test/index.html');
 const wrong=setup();wrong.context.location.href='https://example.test/index.html?inbox=1&noticeUid=u';wrong.context.location.search='?inbox=1&noticeUid=u';wrong.api.start(user('b'));assert.equal(wrong.ids.notificationDialog.open,false);
});

test('browser notification taps arriving before account restoration wait for the matching account',()=>{
 const s=setup();s.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u'}});s.api.start(user('u'));assert.equal(s.ids.notificationDialog.open,true);
 const wrong=setup();wrong.context.window.workerMessage({data:{type:'PROMOHUB_OPEN_INBOX',uid:'u'}});wrong.api.start(user('b'));assert.equal(wrong.ids.notificationDialog.open,false);
});

test('bell is present before authentication and opens a safe loading shell',()=>{
 const s=setup();assert.equal(s.buttons[0].hidden,false);assert.equal(s.buttons[0].badge.hidden,true);
 s.api.open();assert.equal(s.ids.notificationDialog.open,true);assert.match(s.ids.notificationStatus.textContent,/Restoring/);assert.equal(s.ids.notificationAlerts.disabled,true);
});
test('prepare immediately restores only matching cached messages without starting server listeners',()=>{
 const s=setup();s.storage.set('ges-promohub-inbox-u',JSON.stringify({personal:[{...note('p'),createdAtMs:100}],announcements:[],receipts:{}}));
 s.api.prepare(user('u'));assert.equal(s.buttons[0].badge.textContent,'1');assert.equal(s.callbacks.size,0);s.api.open();
 s.api.start(user('u'));assert.equal(s.ids.notificationDialog.open,true);assert.equal(s.callbacks.size,3);
 s.api.prepare(user('b'));assert.equal(s.ids.notificationDialog.open,false);assert.equal(s.buttons[0].badge.hidden,true);assert.equal(s.ids.notificationList.children[0].textContent,'No messages loaded yet.');
});
test('markup renders bells immediately and account cache preparation precedes server activation',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');assert.equal((html.match(/data-open-inbox aria-label="Notifications"/g)||[]).length,2);assert.doesNotMatch(html,/data-open-inbox[^>]* hidden/);
 const js=fs.readFileSync(require.resolve('../public/security-ui.js'),'utf8');const auth=js.slice(js.indexOf('async function securityAuthChanged'));
 assert.ok(auth.indexOf('PromoHubInbox.prepare(user)')<auth.indexOf('await securityActivate(user)'));
 assert.match(auth,/await securityActivate\(user\);if\(authEpoch!==securityEpoch\)return/);
});

test('internal Administration and standalone guide links reuse the top-level app window',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');assert.match(html,/id="administrationLink"[^>]*href=".\/admin.html"/);assert.doesNotMatch(html,/id="administrationLink"[^>]*target="_blank"/);
 const faq=fs.readFileSync(require.resolve('../public/faq.html'),'utf8');assert.match(faq,/href=".\/user-guide.html" target="_top"/);
 const admin=fs.readFileSync(require.resolve('../public/admin.html'),'utf8');assert.match(admin,/href=".\/index.html">Back to PromoHub/);
 const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');assert.match(app,/getElementById\("administrationLink"\)\?\.addEventListener\("click", persistCurrentReaderPosition\)/);assert.match(app,/addEventListener\("pagehide", persistCurrentReaderPosition\)/);
});
