'use strict';
module.exports=function({onCall,options,HttpsError,db,admin,member,stamp,audit}){
 const subscriptions=require('./subscriptions.cjs'),starter=require('./starter-quiz.json');
 const fail=m=>{throw new HttpsError('invalid-argument',m);};
 function id(v){if(typeof v!=='string'||!/^[-a-z0-9]{1,60}$/.test(v))fail('Invalid bank ID.');return v;}
 function text(v,max,label){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('Invalid '+label+'.');return v.trim();}
 function validate(b){
  if(!b||b.schema!==1||!Array.isArray(b.questions)||!b.questions.length||b.questions.length>100)fail('A bank needs 1 to 100 questions.');
  const seen=new Set(),bank={schema:1,id:id(b.id),title:text(b.title,120,'title'),questions:b.questions.map(q=>{
   const qid=text(q?.id,80,'question ID');if(seen.has(qid))fail('Duplicate question ID.');seen.add(qid);
   if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)fail('Use 2 to 6 options.');const opts=q.options.map(o=>text(o,500,'answer option'));
   if(new Set(opts.map(o=>o.toLowerCase())).size!==opts.length||!Number.isInteger(q.answer)||q.answer<0||q.answer>=opts.length)fail('Invalid correct answer or duplicate options.');
   return {id:qid,topic:text(q.topic,80,'topic'),prompt:text(q.prompt,1500,'question'),options:opts,answer:q.answer,explanation:text(q.explanation,2000,'explanation'),source:text(q.source,1000,'source')};
  })};if(Buffer.byteLength(JSON.stringify(bank))>400000)fail('Bank is too large.');return bank;
 }
 async function access(req,adminOnly=false){const uid=await member(req,adminOnly);if(adminOnly)return uid;const [user,p]=await Promise.all([admin.auth().getUser(uid),db.doc('users/'+uid).get()]);if(user.disabled||!user.emailVerified||!(user.customClaims?.promohubAdmin===true||subscriptions.readable(p.data())))throw new HttpsError('permission-denied','Active reading access required.');return uid;}
 const opts={...options,maxInstances:3};
 return {
 getPromoHubQuizBanks:onCall(opts,async req=>{await access(req);const s=await db.collection('quizPublished').orderBy('__name__').limit(101).get();const map=new Map([[starter.id,{id:starter.id,title:starter.title,version:starter.version,topics:[...new Set(starter.questions.map(q=>q.topic))],count:starter.questions.length}]]);for(const d of s.docs){const b=d.data();if(b.status==='published')map.set(d.id,{id:d.id,title:b.title,version:b.version,topics:[...new Set(b.questions.map(q=>q.topic))],count:b.questions.length});else map.delete(d.id);}await access(req);return {banks:[...map.values()],limited:s.docs.length>100};}),
 getPromoHubQuizBank:onCall(opts,async req=>{await access(req);const bankId=id(req.data?.id),s=await db.doc('quizPublished/'+bankId).get(),b=s.exists?s.data():bankId===starter.id?starter:null;if(!b||s.exists&&b.status!=='published')throw new HttpsError('not-found','Question bank is not published.');await access(req);return validate({...b,id:bankId, schema:1})&&{schema:1,id:bankId,title:b.title,version:b.version,questions:b.questions};}),
 getPromoHubQuizAdmin:onCall(opts,async req=>{await access(req,true);if(req.data?.id){const bankId=id(req.data.id),s=await db.doc('quizBanks/'+bankId).get();await access(req,true);if(!s.exists&&bankId!==starter.id)throw new HttpsError('not-found','Bank not found.');return s.exists?s.data():{...starter,version:0,status:'draft'};}const s=await db.collection('quizBanks').orderBy('__name__').limit(100).get();await access(req,true);return {banks:s.docs.map(d=>{const b=d.data();return {id:d.id,title:b.title,version:b.version,status:b.status,count:b.questions.length};})};}),
 savePromoHubQuizBank:onCall(opts,async req=>{
  const actor=await access(req,true),bank=validate(req.data?.bank),status=req.data?.status,expected=req.data?.expectedVersion;
  if(!['draft','published','disabled'].includes(status)||!Number.isInteger(expected)||expected<0)fail('Invalid bank status or version.');
  if(status==='published'&&req.data?.reviewed!==true)throw new HttpsError('failed-precondition','Confirm that every answer and explanation has been reviewed.');
  await access(req,true);let version;
  await db.runTransaction(async tx=>{const ref=db.doc('quizBanks/'+bank.id),s=await tx.get(ref);if((s.exists?s.data().version:0)!==expected)throw new HttpsError('aborted','This bank changed. Reload before saving.');const user=await tx.get(db.doc('users/'+actor));if(user.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Administrator account is not active.');version=expected+1;tx.set(ref,{...bank,version,status,updatedAt:stamp(),updatedBy:actor});if(status==='published')tx.set(db.doc('quizPublished/'+bank.id),{...bank,version,status,updatedAt:stamp()});else if(status==='disabled')tx.set(db.doc('quizPublished/'+bank.id),{id:bank.id,status,version});audit(tx,actor,'quiz.'+status,actor,{bankId:bank.id,version});});
  return {ok:true,version,status};
 })};
};
