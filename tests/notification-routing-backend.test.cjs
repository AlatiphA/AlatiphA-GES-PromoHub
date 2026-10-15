'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),setup=require('./helpers/reports-push-backend.cjs'),starter=require('../functions/starter-quiz.json'),crypto=require('node:crypto');
const publicKey=crypto.createECDH('prime256v1').generateKeys().toString('base64url');
const report=()=>{const q=starter.questions[0];return {ownerUid:'u',bankId:starter.id,bankVersion:starter.version,questionId:q.id,category:'explanation',comment:'Please check the explanation.',snapshot:{prompt:q.prompt,options:q.options,correctAnswer:q.options[q.answer],explanation:q.explanation}};};
const enable=s=>s.output.setPromoHubPushSettings(s.request('admin',{enabled:true,publicKey}));
async function register(s,preferences={messages:true,payments:true,reminders:true}){await enable(s);return s.output.registerPromoHubPushDevice(s.request('u',{ownerUid:'u',token:'example-token-with-at-least-20-characters',preferences}));}
function event(type='message'){return {id:'event-1',params:{uid:'u',noticeId:'n'},data:{before:{exists:false},after:{exists:true,data:()=>({type,title:type==='payment'?'Payment approved':'Message',createdAtMs:Date.now()+1000})}}};}

test('personal and broadcast push payloads carry source and actual notice identity',async()=>{
 const s=setup();await register(s);await s.output.sendPromoHubPersonalPush(event());assert.equal(s.sent[0].data.noticeId,'n');assert.equal(s.sent[0].data.source,'personal');
 const e=event();e.id='broadcast';e.params={id:'announcement-1'};await s.output.sendPromoHubAnnouncementPush(e);assert.equal(s.sent.at(-1).data.noticeId,'announcement-1');assert.equal(s.sent.at(-1).data.source,'announcement');
});
