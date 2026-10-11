'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./helpers/notification-backend.cjs');
function ready(){const s=setup();for(const uid of ['a','u','b']){s.data.set('users/'+uid,{accountStatus:'active',displayName:uid,email:uid+'@example.test'});s.authUsers.set(uid,{emailVerified:true,customClaims:uid==='a'?{promohubAdmin:true}:{}});}return s;}
const input={audience:'all',title:'Study reminder',body:'Open the guide.',requestId:'11111111-1111-1111-1111-111111111111'};
function event(id,uid,before,after){return {id,params:{uid},data:{before:{exists:!!before,data:()=>before},after:{exists:!!after,data:()=>after}}};}
test('only a verified current active administrator can publish a message',async()=>{
 const s=ready();for(const req of [s.request('u',{},input),s.request('a',{email_verified:false,promohubAdmin:true},input)])await assert.rejects(s.output.sendPromoHubMessage(req),e=>e.code==='permission-denied');
 s.authUsers.set('a',{customClaims:{}});await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},input)),e=>e.code==='permission-denied');
 s.authUsers.set('a',{customClaims:{promohubAdmin:true}});s.data.set('users/a',{accountStatus:'suspended'});await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},input)),e=>e.code==='permission-denied');
});
test('broadcast is a single shared record; retries preserve it and collisions are rejected',async()=>{
 const s=ready();for(let i=0;i<1000;i++)s.data.set('users/reader'+i,{accountStatus:'active'});
 const req=s.request('a',{promohubAdmin:true},input),first=await s.output.sendPromoHubMessage(req),count=s.data.size;
 await s.output.sendPromoHubMessage(req);assert.equal(s.data.size,count);assert.equal([...s.data.keys()].filter(k=>k.startsWith('announcements/')).length,1);
 assert.equal([...s.data.keys()].filter(k=>k.includes('/notifications/')).length,0);assert.equal(s.data.get('announcements/'+first.id).actorName,'a');
 await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,body:'Changed'})),e=>e.code==='already-exists');
});
test('personal messages are addressed only to the selected active account',async()=>{
 const s=ready(),result=await s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,audience:'user',uid:'u'}));
 assert.equal(s.data.get('users/u/notifications/'+result.id).body,input.body);assert.equal([...s.data.keys()].filter(k=>k.startsWith('users/b/notifications/')).length,0);
 for(const uid of ['missing','../bad'])await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,audience:'user',uid,requestId:'22222222-2222-2222-2222-222222222222'})));
 s.data.set('accountDeletions/u',{});await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,audience:'user',uid:'u',requestId:'33333333-3333-3333-3333-333333333333'})),e=>e.code==='failed-precondition');
});
test('blank, excessive and invalid messages fail; repeated new sends are throttled',async()=>{
 const s=ready();for(const changes of [{body:''},{title:'x'.repeat(121)},{body:'x'.repeat(1501)},{audience:'unknown'},{requestId:'short'}])await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,...changes})),e=>e.code==='invalid-argument');
 await s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},input));await assert.rejects(s.output.sendPromoHubMessage(s.request('a',{promohubAdmin:true},{...input,requestId:'22222222-2222-2222-2222-222222222222'})),e=>e.code==='resource-exhausted');
});
test('account trigger is idempotent, preserves read status, and never recreates deleted profiles',async()=>{
 const s=ready(),e=event('join','u',null,s.data.get('users/u'));await s.output.onPromoHubAccountNotice(e);
 const path=[...s.data.keys()].find(k=>k.startsWith('users/u/notifications/'));assert.ok(path);s.data.get(path).read=true;const count=s.data.size;
 await s.output.onPromoHubAccountNotice(e);assert.equal(s.data.size,count);assert.equal(s.data.get(path).read,true);
 s.data.delete('users/u');s.data.set('accountDeletions/u',{});await s.output.onPromoHubAccountNotice(event('late','u',null,{accountStatus:'active'}));assert.equal(s.data.has('users/u'),false);assert.equal([...s.data.keys()].filter(k=>k.startsWith('users/u/notifications/')).length,1);
});
test('account mode and status changes notify the owner, not ordinary readers',async()=>{
 const s=ready();await s.output.onPromoHubAccountNotice(event('mode','u',{readingAccessMode:'strict'},{readingAccessMode:'offline'}));await s.output.onPromoHubAccountNotice(event('status','u',{accountStatus:'active'},{accountStatus:'suspended'}));
 const notes=[...s.data].filter(([k])=>k.startsWith('users/u/notifications/')).map(([,v])=>v);assert.equal(notes.length,2);assert.ok(notes.some(n=>n.body.includes('Offline')));assert.ok(notes.some(n=>n.body.includes('suspended')));assert.equal([...s.data.keys()].filter(k=>k.startsWith('users/b/notifications/')).length,0);
});
test('payment notices are private and retries do not duplicate or reset notices',async()=>{
 const s=ready(),pending=event('payment','u',null,{status:'pending',requestedAtMs:1});await s.output.onPromoHubPaymentNotice(pending);const count=s.data.size;await s.output.onPromoHubPaymentNotice(pending);assert.equal(s.data.size,count);
 await s.output.onPromoHubPaymentNotice(event('approve','u',{status:'pending'},{status:'approved'}));assert.ok([...s.data].some(([k,v])=>k.startsWith('users/u/notifications/') && v.title==='Payment approved'));
 assert.equal([...s.data.keys()].filter(k=>k.startsWith('users/b/notifications/')).length,0);
 const before=s.data.size;await s.output.onPromoHubPaymentNotice(event('unrelated','u',{status:'approved',requestedAtMs:1},{status:'approved',requestedAtMs:1}));assert.equal(s.data.size,before);
});
test('explicit recent sign-ins are deduplicated; old tokens and unknown methods cannot create events',async()=>{
 const s=ready(),r=s.request('u',{}, {method:'password'});assert.equal((await s.output.recordPromoHubSignIn(r)).recorded,true);assert.equal((await s.output.recordPromoHubSignIn(r)).recorded,false);
 assert.equal((await s.output.recordPromoHubSignIn(s.request('b',{auth_time:1},{method:'google'}))).recorded,false);await assert.rejects(s.output.recordPromoHubSignIn(s.request('u',{}, {method:'restore'})),e=>e.code==='invalid-argument');
});
