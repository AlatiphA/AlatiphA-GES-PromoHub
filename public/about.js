/* Compare the running page, active worker and a fresh published release before reporting current. */
(() => {
 'use strict';
 const running=APP_VERSION,check=document.getElementById('aboutCheckUpdates'),install=document.getElementById('aboutInstallUpdate'),status=document.getElementById('aboutUpdateStatus');
 document.getElementById('aboutAppVersion').textContent=running;
 document.getElementById('aboutInstallApp')?.addEventListener('click',async()=>{if(typeof window.promoHubInstall==='function')await window.promoHubInstall();else document.getElementById('aboutInstallStatus').textContent='Open your browser menu and choose Install app or Add to Home screen.';});
 let registration=null,checking=false,installing=false,reloadRequested=false,latest=null,active=null,changed=false,activationCheck=null;
 const say=text=>status.textContent=text;
 function newer(a,b){const parse=v=>String(v||'').replace(/^v/,'').split('.').map(Number);if(!/^v?\d+\.\d+\.\d+$/.test(a||''))return false;const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
 const reloadNeeded=()=>changed||newer(active,running)||newer(latest,running);
 function render(){check.disabled=checking||installing||!registration;install.hidden=!registration?.waiting&&!reloadNeeded();install.disabled=checking||installing||!!registration?.installing;install.textContent=installing?'Installing...':registration?.waiting?'Install update':'Reload app';}
 function ready(){say('Update ready to install. Select Install update to update and refresh PromoHub.');render();}
 function workerVersion(worker){return new Promise(resolve=>{if(!worker){resolve(null);return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},2500);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(typeof e.data==='string'?e.data:null);};try{worker.postMessage('GET_VERSION',[channel.port2]);}catch{clearTimeout(timer);channel.port1.close();resolve(null);}});}
 async function publishedVersion(){
  const url=new URL('./version.json',window.location.href);url.searchParams.set('release-check',Date.now()+'-'+Math.random());
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(url.href,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Release check unavailable');
   const value=(await response.json()).version;if(!/^\d+\.\d+\.\d+$/.test(value||''))throw Error('Release metadata unavailable');return value;
  }finally{clearTimeout(timer);}
 }
 function withTimeout(work,milliseconds,message){let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}
 function describe(verified=false){
  if(installing){render();return;}
  if(registration?.waiting){ready();return;}
  if(registration?.installing){say('Downloading update...');render();return;}
  if(reloadNeeded()){say('A newer release is available. Reload the app to finish updating.');render();return;}
  if(verified&&latest===running&&active?.replace(/^v/,'')===running)say('You are up to date. Version '+running+'.');
  else say(verified?'The app cache is not yet verified. Check again before going offline.':'Check for a newer release.');
  render();
 }
 function waitForInstall(worker){return new Promise((resolve,reject)=>{
  let done=false;const timer=setTimeout(()=>finish(Error('Update download timed out.')),60000);
  function finish(error){if(done)return;done=true;clearTimeout(timer);worker.removeEventListener?.('statechange',change);error?reject(error):resolve();}
  function change(){if(['installed','activated'].includes(worker.state))finish();else if(worker.state==='redundant')finish(Error('Update download failed.'));}
  worker.addEventListener?.('statechange',change);change();
 });}
 function activateUpdate(worker){return new Promise((resolve,reject)=>{
  let done=false;const channel=new MessageChannel();const timer=setTimeout(()=>finish(Error('Update activation timed out.')),30000);
  const poll=setInterval(change,250);
  function finish(error){if(done)return;done=true;clearTimeout(timer);clearInterval(poll);channel.port1.close();worker.removeEventListener?.('statechange',change);if(activationCheck===change)activationCheck=null;error?reject(error):resolve();}
  function change(){if(navigator.serviceWorker.controller===worker||(['activating','activated'].includes(worker.state)&&registration.active===worker))finish();else if(worker.state==='redundant')finish(Error('Update activation failed.'));}
  activationCheck=change;worker.addEventListener?.('statechange',change);
  // Navigation after this worker's acknowledgement releases old live requests that can block activation.
  channel.port1.onmessage=e=>{const version=String(e.data?.version||'').replace(/^v/,'');if(e.data?.activationRequested===true&&/^\d+\.\d+\.\d+$/.test(version)&&!newer(running,version))finish();};
  try{change();if(!done)worker.postMessage({type:'PROMOHUB_ACTIVATE_UPDATE'},[channel.port2]);}catch(error){finish(error);}
 });}
 function watch(worker){if(!worker)return;worker.addEventListener('statechange',async()=>{if(worker.state==='installed'){if(installing||checking)return;active=await workerVersion(registration.active||navigator.serviceWorker.controller);describe();}else if(worker.state==='redundant'){if(installing||checking)return;say('Update could not be prepared. Check your connection and retry.');render();}});}
 async function checkUpdates(){
  if(!registration||checking||installing)return;
  if(!navigator.onLine){say('Connect to the internet to check the latest release.');render();return;}
  checking=true;say('Checking latest release...');render();let verified=false;
  try{
   latest=await publishedVersion();verified=true;
   await withTimeout(registration.update(),30000,'Update check timed out.');active=await workerVersion(registration.active||navigator.serviceWorker.controller);
   if(registration.installing){watch(registration.installing);say('Downloading update...');await waitForInstall(registration.installing);}
   describe(verified);
  }catch(e){active=await workerVersion(registration.active||navigator.serviceWorker.controller);if(registration.waiting||reloadNeeded())describe();else say('Could not verify the latest release. Please retry.');console.error('Update check failed:',e);}
  finally{checking=false;render();}
 }
 async function installUpdate(){
  if(checking||installing||reloadRequested||(!registration?.waiting&&!reloadNeeded()))return;
  installing=true;say('Installing update...');render();
  try{
   if(typeof persistCurrentReaderPosition==='function')persistCurrentReaderPosition();
   if(registration.installing)await waitForInstall(registration.installing);
   if(!registration.waiting&&newer(latest,running)&&!newer(active,running)&&!changed){
    await withTimeout(registration.update(),30000,'Update check timed out.');if(registration.installing)await waitForInstall(registration.installing);
    active=await workerVersion(registration.active||navigator.serviceWorker.controller);
    if(!registration.waiting&&!newer(active,running))throw Error('The new app cache is not ready yet.');
   }
   const worker=registration.waiting;if(worker)await activateUpdate(worker);
   // Release the current reading session before the refreshed page can claim it.
   if(typeof readerSessionRelease==='function')await withTimeout(readerSessionRelease(),15000,'Reading session is still closing.');
   if(typeof persistCurrentReaderPosition==='function')persistCurrentReaderPosition();
   if(!reloadRequested){reloadRequested=true;say('Finishing update. Refreshing...');window.location.reload();}
  }catch(error){installing=false;say('Could not finish the update. Check your connection and retry Install update.');render();console.error('Update installation failed:',error);}
 }
 check.addEventListener('click',checkUpdates);install.addEventListener('click',installUpdate);
 if(!('serviceWorker' in navigator)){say('App updates are not supported in this browser.');check.disabled=true;return;}
 navigator.serviceWorker.addEventListener('controllerchange',async()=>{if(installing){activationCheck?.();return;}active=await workerVersion(navigator.serviceWorker.controller);changed=newer(active,running);describe();});
 check.disabled=true;
 (async()=>await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}))().then(async value=>{registration=value;registration.addEventListener('updatefound',()=>{if(!installing)say('Downloading update...');watch(registration.installing);render();});active=await workerVersion(registration.active||navigator.serviceWorker.controller);if(registration.installing)watch(registration.installing);describe();}).catch(e=>{say('Update service unavailable. Reopen the app online and retry.');console.error('Service worker registration failed:',e);});
})();
