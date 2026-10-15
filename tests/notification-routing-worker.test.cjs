'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function worker(scope='https://ges-promohub.web.app/'){const events={},cache=new Map(),shown=[],focused=[];const self={location:{origin:new URL(scope).origin},registration:{scope,showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[{url:new URL('index.html',scope).href,focus:async()=>focused.push('focus'),postMessage:v=>focused.push(v)}],openWindow:async url=>focused.push(url)},addEventListener:(name,f)=>events[name]=f};const c={match:async k=>cache.get(String(k))?.clone(),put:async(k,v)=>cache.set(String(k),v)};vm.runInNewContext(fs.readFileSync(require.resolve('../public/sw.js'),'utf8'),{self,caches:{open:async()=>c},URL,Response,console});self.clients.matchAll= self.clients.matchAll;async function emit(name,event){let work;events[name]({...event,waitUntil:p=>work=p});await work;}return {self,shown,focused,emit,bind:async(uid,url=new URL('index.html',scope).href)=>{let ack;await emit('message',{data:{type:'PROMOHUB_PUSH_BIND',uid},source:{url},ports:[{postMessage:v=>ack=v.ok}]});return ack;}};}

test('worker carries exact targets to warm and cold clients on root and GitHub subpaths',async()=>{
 for(const scope of ['https://ges-promohub.web.app/','https://alatipha.github.io/AlatiphA-GES-PromoHub/']){
 const w=worker(scope);await w.bind('u');const data={uid:'u',push:true,noticeId:'notice-123',source:'personal'};
 await w.emit('notificationclick',{notification:{close(){},data}});assert.equal(w.focused[1].noticeId,'notice-123');assert.equal(w.focused[1].source,'personal');
 w.self.clients.matchAll=async()=>[];await w.emit('notificationclick',{notification:{close(){},data}});const url=new URL(w.focused.at(-1));assert.equal(url.pathname,new URL('index.html',scope).pathname);assert.equal(url.searchParams.get('noticeId'),'notice-123');assert.equal(url.searchParams.get('noticeUid'),'u');
 await w.emit('push',{data:{json:()=>({data:{...data,promoHub:'1'}})}});assert.equal(w.shown[0].options.data.noticeId,'notice-123');
 }
});
