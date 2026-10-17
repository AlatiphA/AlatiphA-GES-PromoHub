/* Account security patch. SW cache version is independent of app version. */
const APP_VERSION='v1.10.1';
const PREFIX='alatipha-ges-promohub-';
const CACHE_NAME=PREFIX+APP_VERSION;
const PUSH_CACHE=PREFIX+'push-bind-v1';
const BOOK_CACHE='alatipha-ges-promohub-books-v1';
const BOOK_FILES=['gespasco','mat1','mat2','etmala','nfatfges','eigala'].map(name=>'./library/'+name+'.epub');
const CORE=['./revision-core.js','./revision-dashboard.js','./reader-recovery.js','./push-notifications.js','./question-reports.js','./reports-push-admin.js','./sync-status.js','./sync-status.css','./auth-pages.css','./privacy.html','./terms.html','./quiz-core.js','./practice-tests.js','./practice-tests.css','./quiz-admin.js','./starter-quiz.json','./reading-dashboard.js','./reading-dashboard.css','./admin-overview.js','./downloads.js','./downloads.css','./navigation.css','./notifications.js','./notifications.css','./notifications-admin.js','./admin.html','./admin.css','./admin-ui.js','./admin-page.js','./','./index.html','./style.css','./app.js','./install.js','./security-ui.js', './subscription-ui.js','./ui-theme.js','./account-security.js','./reader-sessions.js','./firebase-config.js','./faq.html','./user-guide.html','./manifest.json','./icon-192.png','./icon-512.png'];
const OPTIONAL=['./fonts/OpenSans-VariableFont_wdth_wght.ttf','https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js','https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css',...['app','auth','firestore','functions','messaging'].map(name=>`https://www.gstatic.com/firebasejs/10.14.1/firebase-${name}-compat.js`)];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await cache.addAll(CORE);
 const results=await Promise.allSettled(OPTIONAL.map(url=>cache.add(url)));
 results.forEach((r,i)=>{if(r.status==='rejected')console.warn('Optional precache unavailable:',OPTIONAL[i]);});
 // Keep current reader sessions on their current worker until they are closed.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Promote existing complete books before removing old application-shell caches.
 const names=(await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE_NAME&&name!==BOOK_CACHE&&name!==PUSH_CACHE),books=await caches.open(BOOK_CACHE);
 for(const file of BOOK_FILES){
  if(await books.match(file))continue;
  for(const name of names){const old=await caches.open(name),response=await old.match(file);if(!response?.ok)continue;
   const blob=await response.clone().blob(),magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());
   if(magic[0]===80&&magic[1]===75&&magic[2]===3&&magic[3]===4){await books.put(file,response);break;}
  }
 }
 await Promise.all(names.map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url),same=url.origin===self.location.origin;
 if(same && url.pathname.startsWith('/__/'))return;
 // A user-requested download must reach the network rather than reuse an old book.
 if(same && event.request.headers?.get('X-PromoHub-Download')==='1')return;
 const approvedCDN=['www.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname);
 if(!same&&!approvedCDN)return; // Never intercept or cache Auth, Functions, or Firestore API traffic.
 event.respondWith((async()=>{
  const isBook=same && /\.epub$/.test(url.pathname);
  const cache=await caches.open(isBook?BOOK_CACHE:CACHE_NAME),cached=await cache.match(event.request);
  const shell=event.request.mode==='navigate'||/\.(?:html|js|css|json)$/.test(url.pathname);
  if(!shell&&cached)return cached;
  try{
   const response=await fetch(event.request);
   if(!isBook && (response.ok||response.type==='opaque'))event.waitUntil(cache.put(event.request,response.clone()));
   // Books are stored only after a complete validated explicit download.
   if(!response.ok&&response.type!=='opaque'&&cached)return cached;
   return response;
  }catch(error){
   if(cached)return cached;
   if(event.request.mode==='navigate')return (await cache.match('./index.html')) || Response.error();
   return Response.error();
  }
 })());
});
self.addEventListener('message',event=>{if(event.data?.type==='PROMOHUB_PUSH_BIND')event.waitUntil(storePushBinding(event));if(event.data==='GET_VERSION'&&event.ports[0])event.ports[0].postMessage(APP_VERSION);if(event.data==='PROMOHUB_DOWNLOADS_CAPABILITIES'&&event.ports[0])event.ports[0].postMessage({bookCache:BOOK_CACHE,version:APP_VERSION});});

// Focus the existing reader without changing its book; cold starts use an account-bound route.
self.addEventListener('notificationclick',event=>{
 event.notification.close();const uid=event.notification.data?.uid;if(typeof uid!=='string')return;const noticeId=event.notification.data?.noticeId,source=event.notification.data?.source;const target=typeof noticeId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(noticeId)&&['personal','announcement'].includes(source)?{noticeId,source}:{};
 event.waitUntil((async()=>{
  if(event.notification.data?.push===true && (await readPushBinding())!==uid)return;
  const root=new URL('./',self.registration.scope),index=new URL('index.html',root);
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
   const url=new URL(client.url);
   if(url.origin===root.origin && (url.pathname===root.pathname || url.pathname===index.pathname)){
    await client.focus();client.postMessage({type:'PROMOHUB_OPEN_INBOX',uid,...target});return;
   }
  }
  if(target.noticeId){index.searchParams.set('noticeId',target.noticeId);index.searchParams.set('noticeSource',target.source);}index.searchParams.set('inbox','1');index.searchParams.set('noticeUid',uid);await self.clients.openWindow(index.href);
 })());
});

async function readPushBinding(){try{const c=await caches.open(PUSH_CACHE),r=await c.match(new URL('push-binding',self.registration.scope).href);return r?(await r.json()).uid||'':'';}catch{return '';}}
async function storePushBinding(event){
 let ok=false;try{const root=new URL('./',self.registration.scope),source=new URL(event.source.url);if(source.origin!==root.origin||!source.pathname.startsWith(root.pathname))throw Error('Wrong app scope');const uid=event.data.uid;if(typeof uid!=='string'||uid.length>128)throw Error('Invalid binding');const c=await caches.open(PUSH_CACHE);await c.put(new URL('push-binding',root).href,new Response(JSON.stringify({uid}),{headers:{'Content-Type':'application/json'}}));ok=true;}catch{}event.ports?.[0]?.postMessage({ok});
}
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let payload;try{payload=event.data?.json();}catch{return;}const d=payload?.data;if(d?.promoHub!=='1'||typeof d.uid!=='string'||d.uid!==(await readPushBinding()))return;
 const root=new URL('./',self.registration.scope);await self.registration.showNotification(String(d.title||'PromoHub').slice(0,120),{body:'Open PromoHub to view your notification.',icon:new URL('icon-192.png',root).href,badge:new URL('icon-192.png',root).href,tag:'promohub-push-'+String(d.eventId||'notice').slice(0,64),data:{uid:d.uid,push:true,noticeId:d.noticeId,source:d.source}});
})());});
