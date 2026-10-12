/* Account security patch. SW cache version is independent of app version. */
const APP_VERSION='v1.8.2';
const PREFIX='alatipha-ges-promohub-';
const CACHE_NAME=PREFIX+APP_VERSION;
const CORE=['./navigation.css','./notifications.js','./notifications.css','./notifications-admin.js','./admin.html','./admin.css','./admin-ui.js','./admin-page.js','./','./index.html','./style.css','./app.js','./install.js','./security-ui.js', './subscription-ui.js','./ui-theme.js','./account-security.js','./reader-sessions.js','./firebase-config.js','./faq.html','./user-guide.html','./manifest.json','./icon-192.png','./icon-512.png'];
const OPTIONAL=['gespasco','mat1','mat2','etmala','nfatfges','eigala'].map(name=>'./library/'+name+'.epub').concat(['./fonts/OpenSans-VariableFont_wdth_wght.ttf','https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js','https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css',...['app','auth','firestore','functions'].map(name=>`https://www.gstatic.com/firebasejs/10.14.1/firebase-${name}-compat.js`)]);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE_NAME);
 await cache.addAll(CORE);
 const results=await Promise.allSettled(OPTIONAL.map(url=>cache.add(url)));
 results.forEach((r,i)=>{if(r.status==='rejected')console.warn('Optional precache unavailable:',OPTIONAL[i]);});
 // Keep current reader sessions on their current worker until they are closed.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE_NAME).map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url),same=url.origin===self.location.origin;
 if(same && url.pathname.startsWith('/__/'))return;
 const approvedCDN=['www.gstatic.com','cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname);
 if(!same&&!approvedCDN)return; // Never intercept or cache Auth, Functions, or Firestore API traffic.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME),cached=await cache.match(event.request);
  const shell=event.request.mode==='navigate'||/\.(?:html|js|css|json)$/.test(url.pathname);
  if(!shell&&cached)return cached;
  try{
   const response=await fetch(event.request);
   if(response.ok||response.type==='opaque')event.waitUntil(cache.put(event.request,response.clone()));
   if(!response.ok&&response.type!=='opaque'&&cached)return cached;
   return response;
  }catch(error){
   if(cached)return cached;
   if(event.request.mode==='navigate')return (await cache.match('./index.html')) || Response.error();
   return Response.error();
  }
 })());
});
self.addEventListener('message',event=>{if(event.data==='GET_VERSION'&&event.ports[0])event.ports[0].postMessage(APP_VERSION);});

// Focus the existing reader without changing its book; cold starts use an account-bound route.
self.addEventListener('notificationclick',event=>{
 event.notification.close();const uid=event.notification.data?.uid;if(typeof uid!=='string')return;
 event.waitUntil((async()=>{
  const root=new URL('./',self.registration.scope),index=new URL('index.html',root);
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
   const url=new URL(client.url);
   if(url.origin===root.origin && (url.pathname===root.pathname || url.pathname===index.pathname)){
    await client.focus();client.postMessage({type:'PROMOHUB_OPEN_INBOX',uid});return;
   }
  }
  index.searchParams.set('inbox','1');index.searchParams.set('noticeUid',uid);await self.clients.openWindow(index.href);
 })());
});
