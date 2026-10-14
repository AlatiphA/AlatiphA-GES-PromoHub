'use strict';
/* Status covers reading positions and bookmarks, not quiz results or downloads. */
window.PromoHubSync=(()=>{
 let owner=null,epoch=0,pending={},last=0,error=false,storageError=false,retrying=false;const active=new Set();let revision=0;
 function currentOwner(){return typeof securityLocalOwner==='string'?securityLocalOwner:'';}
 function key(suffix){return 'ges-promohub-sync-'+suffix+'-'+(owner||'guest');}
 function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}}
 function refreshScope(){const next=currentOwner();if(next===owner)return;owner=next;epoch++;active.clear();const stored=read(key('pending'),null);pending=stored||{};if(!pending||typeof pending!=='object'||Array.isArray(pending))pending={};last=Number(read(key('last'),0))||0;error=false;storageError=false;retrying=false;if(stored===null&&owner&&typeof BOOKS!=='undefined'){for(const b of BOOKS){const id=b.file.replace(/^\.\/library\//,'').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();const data=read(READER_DATA_KEY+'-'+id+'-user-'+owner,{}),marks=read('ges-promohub-bookmarks-'+b.file+'-user-'+owner,[]);if(data.location)pending['reading|'+b.file]='initial';if(Array.isArray(marks)&&marks.length)pending['bookmarks|'+b.file]='initial';}persist();}}
 function persist(){try{localStorage.setItem(key('pending'),JSON.stringify(pending));localStorage.setItem(key('last'),JSON.stringify(last));}catch{storageError=true;}}
 function allowed(){return !!owner&&typeof cloudReady!=='undefined'&&cloudReady&&typeof cloudUser!=='undefined'&&cloudUser?.uid===owner&&typeof subscriptionCloudAllowed==='function'&&subscriptionCloudAllowed();}
 function state(){refreshScope();if((!allowed()||!navigator.onLine)&&(active.size||retrying)){epoch++;active.clear();retrying=false;}const count=Object.keys(pending).length;let text;
  if(storageError)text='Device storage unavailable';
  else if(!owner)text='Saved on this device';
  else if(!navigator.onLine)text='Waiting for internet';
  else if(!allowed())text='Saved on this device · Cloud sync paused';
  else if(error)text='Sync failed · Retry';
  else if(active.size||retrying)text='Syncing…';
  else if(count)text='Changes waiting to sync';
  else text=last?'Synced':'Ready to sync';
  return {text,pending:count,last,retrying,canRetry:allowed()&&navigator.onLine&&!retrying&&!active.size};
 }
 function render(){const s=state();document.querySelectorAll('[data-sync-status]').forEach(host=>{const label=host.querySelector('[data-sync-label]'),button=host.querySelector('[data-sync-retry]');if(label&&label.textContent!==s.text)label.textContent=s.text;if(button){button.disabled=!s.canRetry;button.onclick=retry;}host.title='Reading positions and bookmarks. Practice results and downloaded books stay on this device.';});}
 function dirty(item){refreshScope();pending[item]=String(Date.now())+'-'+(++revision);persist();render();}
 function begin(item){refreshScope();const token={epoch,owner,item,revision:pending[item]};active.add(token);render();return token;}
 function complete(token,success){refreshScope();if(!token||token.epoch!==epoch||token.owner!==owner)return;active.delete(token);if(success){if(pending[token.item]===token.revision)delete pending[token.item];last=Date.now();}else error=true;persist();render();}
 function received(){refreshScope();last=Date.now();persist();render();}
 function localFailure(){refreshScope();storageError=true;render();}
 async function retry(){refreshScope();if(!state().canRetry)return;const runEpoch=epoch;retrying=true;error=false;render();try{
  if(typeof progressSyncTimer!=='undefined')clearTimeout(progressSyncTimer);
  const jobs=BOOKS.map(b=>bookmarkSync(b.file));
  for(const b of BOOKS)if(pending['reading|'+b.file])jobs.push(syncProgressRetry(b.file));
  await Promise.allSettled(jobs);if(epoch===runEpoch&&allowed()&&typeof bookmarkLiveUpdate==='function')bookmarkLiveUpdate();
 }catch{if(epoch===runEpoch)error=true;}finally{if(epoch===runEpoch){retrying=false;render();}}}
 document.addEventListener('DOMContentLoaded',render);
 window.addEventListener('online',render);window.addEventListener('offline',render);window.addEventListener('storage',e=>{if(e.key?.startsWith('ges-promohub-sync-')){owner=null;render();}});
 return {dirty,begin,complete,received,localFailure,update:render,retry,state};
})();
