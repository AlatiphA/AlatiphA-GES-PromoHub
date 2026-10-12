/* Complete book downloads use a stable cache separate from the app shell. */
(() => {
 'use strict';
 const CACHE='alatipha-ges-promohub-books-v1';
 const dialog=document.getElementById('downloadsDialog'),list=document.getElementById('downloadsList'),status=document.getElementById('downloadsStatus');
 const states=new Map(),rows=new Map(),catalog=new Map(BOOKS.map(b=>[b.file,b])),dependencies=['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',...['app','auth','firestore','functions'].map(n=>`https://www.gstatic.com/firebasejs/10.14.1/firebase-${n}-compat.js`)];
 let running=false,controller=null,ready=false,supported=!!window.caches&&!!navigator.serviceWorker,assetsReady=false,opener=null,scanEpoch=0,cancelled=false;
 const size=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
 const connected=()=>navigator.onLine!==false;
 const urlFor=file=>new URL(file,document.baseURI).href;
 const valid=async blob=>{const magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());return blob.size>=4&&magic[0]===80&&magic[1]===75&&magic[2]===3&&magic[3]===4;};
 function text(file){const s=states.get(file)||{};if(s.busy)return 'Downloading '+size(s.received||0)+(s.total?' of '+size(s.total)+' ('+Math.min(99,Math.round((s.received||0)/s.total*100))+'%)':'');if(s.error)return s.error+(s.bytes?' Previous download retained.':'');return s.bytes?(assetsReady?'Ready offline':'Book downloaded; reader setup incomplete')+' · '+size(s.bytes):'Not downloaded';}
 function render(){
  for(const [file,row] of rows){const s=states.get(file)||{};row.state.textContent=text(file);row.progress.hidden=!s.busy;row.progress.removeAttribute('value');if(s.total)row.progress.value=Math.min(99,(s.received||0)/s.total*100);row.download.textContent=s.bytes?'Download again':'Download';row.download.disabled=!supported||!ready||!connected()||running;row.remove.hidden=!s.bytes;row.remove.disabled=running;}
  for(const card of document.querySelectorAll('.bookCard')){const file=card.dataset.file;if(!catalog.has(file))continue;let label=card.querySelector('.offlineBookStatus');if(!label){label=document.createElement('div');label.className='offlineBookStatus';card.querySelector('.bookInfo')?.append(label);}label.textContent=text(file);}
  document.getElementById('downloadsAll').disabled=!supported||!ready||!connected()||running;
  document.getElementById('downloadsCancel').hidden=!running;
  document.getElementById('downloadsRefresh').disabled=running;
 }
 function workerVersion(){return new Promise(resolve=>{const worker=navigator.serviceWorker?.controller;if(!worker){resolve('');return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve('');},2000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage('PROMOHUB_DOWNLOADS_CAPABILITIES',[channel.port2]);});}
 async function scan(){
  if(running)return;const epoch=++scanEpoch;
  if(!supported){status.textContent='Offline downloads are unavailable in this browser. Use a browser with service workers and Cache Storage.';render();return;}
  try{
   ready=(await workerVersion())?.bookCache===CACHE;if(epoch!==scanEpoch)return;
   const cache=await caches.open(CACHE),allNames=(await caches.keys()).filter(n=>n.startsWith('alatipha-ges-promohub-'));
   let allAssets=true;
   for(const url of dependencies){let found=false;for(const name of allNames){if(await (await caches.open(name)).match(url)){found=true;break;}}if(!found)allAssets=false;}
   if(epoch!==scanEpoch)return;assetsReady=allAssets;
   for(const book of BOOKS){const response=await cache.match(urlFor(book.file));let bytes=0;if(response?.ok){const blob=await response.blob();if(await valid(blob))bytes=blob.size;}if(epoch!==scanEpoch)return;states.set(book.file,{bytes});}
   const count=[...states.values()].filter(s=>s.bytes).length,total=[...states.values()].reduce((n,s)=>n+(s.bytes||0),0);
   status.textContent=!ready?'Reopen PromoHub to finish the update before downloading books.':count+' of '+BOOKS.length+' books downloaded'+(total?' · '+size(total):'')+'. '+(!assetsReady?'Reader setup is incomplete. Connect and reopen PromoHub to cache its reader files.':!connected()?'Offline. Saved books are available subject to your reading access.':'Reader files are cached. Choose the books you need.');
   if(navigator.storage?.estimate){const estimate=await navigator.storage.estimate();if(epoch!==scanEpoch)return;document.getElementById('downloadsStorage').textContent=estimate.quota?'Browser storage: '+size(estimate.usage||0)+' used of about '+size(estimate.quota)+'. Shared with other data on this site.':'';}
  }catch(e){if(epoch!==scanEpoch)return;ready=false;status.textContent='Could not check browser storage: '+(e.message||'storage is unavailable.');}
  if(epoch===scanEpoch)render();
 }
 async function transfer(file){
  const book=catalog.get(file);if(!book)throw new Error('Unknown book.');
  const previous=states.get(file)?.bytes||0;controller=new AbortController();states.set(file,{bytes:previous,busy:true,received:0});render();
  try{
   const response=await fetch(urlFor(file),{cache:'no-store',headers:{'X-PromoHub-Download':'1'},signal:controller.signal});
   if(!response.ok || response.status!==200)throw new Error('Book download failed (HTTP '+response.status+').');
   if(/(?:text\/html|application\/json)/i.test(response.headers.get('Content-Type')||''))throw new Error('The server returned a page instead of an EPUB book.');
   const total=Number(response.headers.get('Content-Length'))||0;let blob;
   if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let received=0,last=0;try{while(true){const chunk=await reader.read();if(chunk.done)break;if(controller.signal.aborted)throw new Error('Download cancelled.');parts.push(chunk.value);received+=chunk.value.byteLength;states.set(file,{bytes:previous,busy:true,received,total});if(Date.now()-last>150){render();last=Date.now();}}}finally{reader.releaseLock();}blob=new Blob(parts,{type:'application/epub+zip'});}
   else blob=await response.blob();
   if(controller.signal.aborted || cancelled)throw new Error('Download cancelled.');
   if(!await valid(blob))throw new Error('Incomplete or invalid EPUB download.');
   if(typeof JSZip==='undefined')throw new Error('Reader ZIP library is unavailable. Reconnect and reopen PromoHub.');
   const zip=await JSZip.loadAsync(blob,{checkCRC32:true});
   if(!zip.file('META-INF/container.xml') || !zip.file('mimetype') || (await zip.file('mimetype').async('string')).trim()!=='application/epub+zip')throw new Error('Downloaded file is not a valid EPUB book.');
   if(controller.signal.aborted || cancelled)throw new Error('Download cancelled.');
   const headers=new Headers({'Content-Type':'application/epub+zip','Content-Length':String(blob.size)});
   await (await caches.open(CACHE)).put(urlFor(file),new Response(blob,{status:200,headers}));
   states.set(file,{bytes:blob.size});status.textContent=book.title+' downloaded. '+(!assetsReady?'Reconnect and reopen to finish caching reader files.':'');
  }catch(e){const error=controller?.signal.aborted||cancelled?'Download cancelled.':e.name==='QuotaExceededError'?'Storage is full. Remove an unused download and retry.':(e.message||'Download failed.');states.set(file,{bytes:previous,error});status.textContent=error;throw e;}
  finally{controller=null;render();}
 }
 async function download(file){if(running||!supported||!ready||!connected())return;if(!catalog.has(file))return;scanEpoch++;running=true;cancelled=false;try{await transfer(file);}catch(_){}finally{running=false;render();}}
 async function downloadAll(){if(running||!supported||!ready||!connected())return;scanEpoch++;running=true;cancelled=false;try{for(const b of BOOKS){if(cancelled)break;if(states.get(b.file)?.bytes)continue;await transfer(b.file);}}catch(_){}finally{running=false;render();}}
 async function remove(file){if(running||!catalog.has(file)||!supported)return;if(!confirm('Remove the downloaded copy of '+catalog.get(file).title+'? Your reading progress and bookmarks will remain.'))return;scanEpoch++;try{await (await caches.open(CACHE)).delete(urlFor(file));states.set(file,{bytes:0});status.textContent='Downloaded book removed. Progress and bookmarks retained.';render();}catch(e){status.textContent='Could not remove the download: '+e.message;}}
 function open(){opener=document.activeElement;if(typeof resetPullRefresh==='function')resetPullRefresh();if(!dialog.open)dialog.showModal();scan();}
 function close(){dialog.close();opener?.focus?.();}
 for(const b of BOOKS){const row=document.createElement('article');row.className='downloadRow';const heading=document.createElement('h3');heading.textContent=b.title;const state=document.createElement('p');state.className='downloadState';state.textContent='Checking download…';const progress=document.createElement('progress');progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','Download progress for '+b.title);const actions=document.createElement('div');actions.className='downloadsActions';const down=document.createElement('button');down.type='button';down.textContent='Download';down.setAttribute('aria-label','Download '+b.title);down.addEventListener('click',()=>download(b.file));const del=document.createElement('button');del.type='button';del.textContent='Remove download';del.setAttribute('aria-label','Remove download of '+b.title);del.addEventListener('click',()=>remove(b.file));actions.append(down,del);row.append(heading,state,progress,actions);list.append(row);rows.set(b.file,{state,progress,download:down,remove:del});}
 document.getElementById('downloadsOpen').addEventListener('click',e=>{e.stopPropagation();open();});document.getElementById('downloadsClose').addEventListener('click',close);
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
 document.getElementById('downloadsAll').addEventListener('click',downloadAll);document.getElementById('downloadsRefresh').addEventListener('click',scan);document.getElementById('downloadsCancel').addEventListener('click',()=>{cancelled=true;controller?.abort();});
 for(const event of ['online','offline'])window.addEventListener(event,()=>{render();if(!running)scan();});
 navigator.serviceWorker?.addEventListener('controllerchange',scan);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan();});
 window.PromoHubDownloads={open,scan,download,downloadAll,remove};render();scan();
})();
