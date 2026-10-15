'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./helpers/reports-push-backend.cjs'),starter=require('../functions/starter-quiz.json'),crypto=require('node:crypto');
const publicKey=crypto.createECDH('prime256v1').generateKeys().toString('base64url');
const report=()=>{const q=starter.questions[0];return {ownerUid:'u',bankId:starter.id,bankVersion:starter.version,questionId:q.id,category:'explanation',comment:'Please check the explanation.',snapshot:{prompt:q.prompt,options:q.options,correctAnswer:q.options[q.answer],explanation:q.explanation}};};
const enable=s=>s.output.setPromoHubPushSettings(s.request('admin',{enabled:true,publicKey}));
async function register(s,preferences={messages:true,payments:true,reminders:true}){await enable(s);return s.output.registerPromoHubPushDevice(s.request('u',{ownerUid:'u',token:'example-token-with-at-least-20-characters',preferences}));}
function event(type='message'){return {id:'event-1',params:{uid:'u',noticeId:'n'},data:{before:{exists:false},after:{exists:true,data:()=>({type,title:type==='payment'?'Payment approved':'Message',createdAtMs:Date.now()+1000})}}};}

test('general INVALID_ARGUMENT never silently disables otherwise valid browser registrations',async()=>{
 const s=setup(),r=await register(s);s.setSendError(Object.assign(Error('payload invalid'),{code:'messaging/invalid-argument'}));await assert.rejects(s.output.sendPromoHubPersonalPush(event()),/payload invalid/);assert.equal(s.data.get('users/u/pushDevices/'+r.id).enabled,true);assert.ok(s.data.get('users/u/pushState/registration').ids.includes(r.id));
 const d=await s.output.getPromoHubPushDiagnostics(s.request('admin',{uid:'u'}));assert.equal(d.latest.state,'failed');assert.equal(d.latest.errorCode,'messaging/invalid-argument');assert.equal(d.devices[0].enabled,true);
});
test('explicitly revoked tokens are disabled and diagnosable without exposing the token',async()=>{
 const s=setup(),r=await register(s);s.setSendError(Object.assign(Error('revoked'),{code:'messaging/registration-token-not-registered'}));await s.output.sendPromoHubPersonalPush(event());const d=await s.output.getPromoHubPushDiagnostics(s.request('admin',{uid:'u'}));assert.equal(d.latest.state,'failed');assert.equal(d.devices[0].enabled,false);assert.ok(!JSON.stringify(d).includes('example-token'));assert.equal(s.data.get('users/u/pushDevices/'+r.id).disabledReason,'messaging/registration-token-not-registered');
});
test('no enabled devices, category skips, master switch and FCM acceptance have distinct outcomes',async()=>{
 const s=setup();await enable(s);await s.output.sendPromoHubPersonalPush(event());assert.equal(s.data.get('users/u/pushStatus/latest').state,'no_enabled_devices');
 await register(s,{messages:false,payments:true,reminders:true});await s.output.sendPromoHubPersonalPush(event());assert.equal(s.data.get('users/u/pushStatus/latest').state,'no_matching_devices');assert.equal(s.data.get('users/u/pushStatus/latest').reasons.category_off,1);
 await register(s);await s.output.sendPromoHubPersonalPush(event());assert.equal(s.data.get('users/u/pushStatus/latest').state,'accepted_by_fcm');await s.output.sendPromoHubPersonalPush(event());assert.equal(s.sent.length,1);assert.equal(s.data.get('users/u/pushStatus/latest').state,'already_accepted');
 await s.output.setPromoHubPushSettings(s.request('admin',{enabled:false,publicKey}));await s.output.sendPromoHubPersonalPush({...event(),id:'off'});assert.equal(s.data.get('users/u/pushStatus/latest').state,'configuration_off');
});
test('Auth lookup failures remain visible and retryable rather than masquerading as an ineligible account',async()=>{
 const s=setup();await register(s);const get=s.authUsers.get.bind(s.authUsers);s.authUsers.get=uid=>{if(uid==='u')throw Object.assign(Error('temporary auth outage'),{code:'auth/internal-error'});return get(uid);};await assert.rejects(s.output.sendPromoHubPersonalPush(event()),/temporary auth outage/);assert.equal(s.data.get('users/u/pushStatus/latest').errorCode,'auth/internal-error');s.authUsers.get=get;await s.output.sendPromoHubPersonalPush(event());assert.equal(s.sent.length,1);
});
test('diagnostics require actual verified active admin and validate target identifiers',async()=>{
 const s=setup();await assert.rejects(s.output.getPromoHubPushDiagnostics(s.request('u',{uid:'admin'},{promohubAdmin:true})),/Administrator/);await assert.rejects(s.output.getPromoHubPushDiagnostics(s.request('admin',{uid:'../private'})),/Choose/);s.authUsers.get('admin').customClaims={};await assert.rejects(s.output.getPromoHubPushDiagnostics(s.request('admin',{uid:'u'})),/Administrator/);
});
test('production personal and broadcast payloads pass real Admin SDK validation with network transport stubbed',async()=>{
 const {createRequire}=require('node:module'),path=require('node:path'),fromFunctions=createRequire(path.resolve(__dirname,'../functions/index.js'));
 const {initializeApp,deleteApp}=fromFunctions('firebase-admin/app'),{getMessaging}=fromFunctions('firebase-admin/messaging');const app=initializeApp({projectId:'demo-promohub'},'push-payload-contract'),m=getMessaging(app),captured=[];
 m.messagingRequestHandler.invokeRequestHandler=async(host,url,request)=>{captured.push(request.message);return {name:'projects/demo-promohub/messages/test'};};
 try{const s=setup();await register(s);await s.output.sendPromoHubPersonalPush(event());const e=event();e.params={id:'broadcast'};e.id='broadcast';await s.output.sendPromoHubAnnouncementPush(e);for(const payload of s.sent)assert.equal(await m.send(payload),'projects/demo-promohub/messages/test');assert.equal(captured.length,2);assert.equal(captured[0].data.noticeId,'n');assert.equal(captured[1].data.source,'announcement');}finally{await deleteApp(app);}
});
