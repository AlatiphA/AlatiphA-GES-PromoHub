/* Account-scoped inbox. Browser alerts are optional and require a running app. */
(() => {
 'use strict';
 let uid='',generation=0,stops=[],personal=[],announcements=[],receipts={},message='Restoring your account…',seen=new Set(),loaded={},opener=null,pendingTap=null;
 const dialog=document.getElementById('notificationDialog'),list=document.getElementById('notificationList'),status=document.getElementById('notificationStatus');
 const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}};
 const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}};
 const cacheKey=()=> 'ges-promohub-inbox-'+uid;
 const enabled=()=>get('ges-promohub-alerts-'+uid,false)===true;
 const millis=value=>typeof value?.toMillis==='function'?value.toMillis():Number(value)||0;
 const items=()=>[...personal.map(n=>({...n,source:'personal'})),...announcements.map(n=>({...n,source:'announcement',read:receipts[n.id]===true}))].sort((a,b)=>b.createdAtMs-a.createdAtMs);
 const connected=()=>navigator.onLine!==false;
 function persist(){if(uid)save(cacheKey(),{personal,announcements,receipts});}
 function render(){
  const records=items(),unread=records.filter(n=>!n.read).length;
  for(const button of document.querySelectorAll('[data-open-inbox]')){button.hidden=false;button.setAttribute('aria-label','Notifications'+(unread?', '+unread+' unread in recent messages':''));const badge=button.querySelector('[data-inbox-badge]');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.hidden=!unread;}}
  status.textContent=message || (!uid?'Sign in with a verified account to see notifications.':!connected()?'Offline: showing previously loaded messages. Reconnect to receive messages or mark them read.':'Recent messages: up to 100 personal notices and 50 announcements.');
  document.getElementById('notificationAlerts').textContent=enabled()?'Disable browser alerts':'Enable browser alerts';
  document.getElementById('notificationAlerts').disabled=!uid;
  document.getElementById('notificationMarkAll').disabled=!uid || !connected() || !unread;
  list.replaceChildren();
  for(const n of records){
   const row=document.createElement('article');row.className='inboxMessage'+(n.read?'':' unread');
   const title=document.createElement('h3');title.textContent=n.title;
   const body=document.createElement('p');body.textContent=n.body;
   const meta=document.createElement('p');meta.className='inboxMeta';meta.textContent=(n.source==='announcement'?'Announcement':'Personal notice')+' · '+(n.createdAtMs?new Date(n.createdAtMs).toLocaleString():'Sending…')+(n.read?' · Read':' · Unread');
   row.append(title,body,meta);
   if(!n.read){const button=document.createElement('button');button.type='button';button.textContent='Mark read';button.disabled=!connected();button.addEventListener('click',()=>mark([n]));row.append(button);}
   list.append(row);
  }
  if(!records.length){const p=document.createElement('p');p.textContent=uid?'No messages loaded yet.':'Sign in to see your notifications.';list.append(p);}
 }
 function open(){opener=document.activeElement;if(typeof resetPullRefresh==='function')resetPullRefresh();if(!dialog.open)dialog.showModal();render();}
 function close(){if(dialog.open)dialog.close();opener?.focus?.();}
 async function mark(records){
  if(!uid || !connected()){message='Reconnect to mark messages read.';render();return;}
  const captured=uid,epoch=generation;
  try{
   const db=firebase.firestore();
   // Bound rule document-access checks as well as write count.
   for(let offset=0;offset<records.length;offset+=10){
    if(epoch!==generation)return;
    const batch=db.batch(),stamp=firebase.firestore.FieldValue.serverTimestamp();
    for(const n of records.slice(offset,offset+10)){if(n.source==='announcement')batch.set(db.doc(`users/${captured}/announcementReads/${n.id}`),{read:true,readAt:stamp});else batch.update(db.doc(`users/${captured}/notifications/${n.id}`),{read:true,readAt:stamp});}
    await batch.commit();
   }
   if(epoch!==generation)return;
   for(const n of records){if(n.source==='announcement')receipts[n.id]=true;else{const p=personal.find(p=>p.id===n.id);if(p)p.read=true;}}
   message='';persist();render();
  }catch(e){if(epoch===generation){message=e.message || 'Unable to mark messages read.';render();}}
 }
 async function alert(n,epoch,captured){
  if(!enabled() || typeof Notification==='undefined' || Notification.permission!=='granted' || !navigator.serviceWorker || document.visibilityState==='visible')return;
  try{const registration=await navigator.serviceWorker.getRegistration();if(epoch!==generation || uid!==captured || !registration)return;
   await registration.showNotification(n.title,{body:n.body,icon:'./icon-192.png',tag:'promohub-'+captured+'-'+n.id,data:{uid:captured}});
  }catch(_){/* The persistent inbox remains available when browser alerts fail. */}
 }
 function route(){
  const params=new URLSearchParams(location.search);if(params.get('inbox')!=='1'||!uid)return;
  if(!params.get('noticeUid') || params.get('noticeUid')===uid)open();
  const url=new URL(location.href);url.searchParams.delete('inbox');url.searchParams.delete('noticeUid');history.replaceState(history.state,'',url.href);
 }
 function reset(){
  generation++;for(const stop of stops)stop();stops=[];close();uid='';personal=[];announcements=[];receipts={};seen=new Set();loaded={};message='Sign in with a verified account to see notifications.';render();
 }
 function prepare(user){
  const keepOpen=dialog.open && (!uid || uid===user?.uid);
  reset();if(!user?.emailVerified)return;uid=user.uid;
  const cached=get(cacheKey(),{});personal=Array.isArray(cached.personal)?cached.personal.slice(0,100):[];announcements=Array.isArray(cached.announcements)?cached.announcements.slice(0,50):[];receipts=cached.receipts && typeof cached.receipts==='object'?cached.receipts:{};
  message=connected()?'Loading latest messages…':'Offline: showing previously loaded messages. Reconnect to receive messages or mark them read.';
  if(keepOpen)open();render();
 }
 function start(user){
  if(!user?.emailVerified){reset();return;}
  if(uid!==user.uid)prepare(user);
  for(const stop of stops)stop();stops=[];
  generation++;seen=new Set();loaded={};
  render();route();if(pendingTap){if(pendingTap.uid===uid && Date.now()-pendingTap.at<300000)open();pendingTap=null;}const epoch=generation,captured=uid,db=firebase.firestore();
  function receive(source,snapshot){
   if(epoch!==generation)return;
   if(source==='receipts'){receipts=Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data().read===true]));}
   else{
    const next=snapshot.docs.map(d=>{const n=d.data();return {id:d.id,title:String(n.title||''),body:String(n.body||''),read:n.read===true,createdAtMs:millis(n.createdAt)};});
    if(source==='personal')personal=next;else announcements=next;
    const server=snapshot.metadata?.fromCache!==true;
    for(const n of next){const key=source+':'+n.id;if(server && loaded[source] && !seen.has(key) && !n.read && !(source==='announcements' && receipts[n.id]))alert(n,epoch,captured);seen.add(key);}
    if(server)loaded[source]=true;
   }
   message='';persist();render();
  }
  const fail=source=>e=>{if(epoch!==generation)return;if(e.code==='permission-denied'){if(source==='personal')personal=[];if(source==='announcements')announcements=[];persist();}message='Unable to load messages. '+(e.message||'Reconnect and try again.');render();};
  stops.push(db.collection(`users/${uid}/notifications`).orderBy('createdAt','desc').limit(100).onSnapshot({includeMetadataChanges:true},s=>receive('personal',s),fail('personal')));
  stops.push(db.collection(`users/${uid}/announcementReads`).orderBy('readAt','desc').limit(100).onSnapshot(s=>receive('receipts',s),fail('receipts')));
  stops.push(db.collection('announcements').orderBy('createdAt','desc').limit(50).onSnapshot({includeMetadataChanges:true},s=>receive('announcements',s),fail('announcements')));
 }
 async function record(method,epoch,captured){try{await securityCall('recordPromoHubSignIn',{method});}catch(_){/* Sign-in must not depend on notification delivery. */}}
 function login(method){record(method,generation,uid);}
 document.querySelectorAll('[data-open-inbox]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();open();}));
 document.getElementById('notificationClose').addEventListener('click',close);
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 dialog.addEventListener('cancel',()=>{opener?.focus?.();});
 document.getElementById('notificationMarkAll').addEventListener('click',()=>mark(items().filter(n=>!n.read)));
 document.getElementById('notificationAlerts').addEventListener('click',async()=>{
  const captured=uid,epoch=generation;if(!uid)return;
  if(enabled()){save('ges-promohub-alerts-'+uid,false);render();return;}
  if(typeof Notification==='undefined' || !navigator.serviceWorker){message='This browser does not support these alerts. Use the inbox.';render();return;}
  try{const result=await Notification.requestPermission();if(epoch!==generation)return;save('ges-promohub-alerts-'+captured,result==='granted');message=result==='granted'?'Browser alerts enabled while PromoHub is running. Closed-app push is not included.':'Permission was not granted. Your inbox still works.';render();}catch(e){if(epoch===generation){message=e.message;render();}}
 });
 for(const name of ['online','offline','pageshow'])window.addEventListener(name,render);
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type!=='PROMOHUB_OPEN_INBOX' || typeof e.data.uid!=='string')return;if(!uid)pendingTap={uid:e.data.uid,at:Date.now()};else if(e.data.uid===uid)open();});
 window.PromoHubInbox={prepare,start,reset,open,login};render();
})();
