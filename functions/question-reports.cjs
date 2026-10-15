'use strict';
const {createHash}=require('node:crypto'),hash=v=>createHash('sha256').update(v).digest('hex');
module.exports=({onCall,options,HttpsError,db,admin,member,stamp,audit})=>{
 const starter=require('./starter-quiz.json'),opts={...options,maxInstances:3};
 const fail=m=>{throw new HttpsError('invalid-argument',m);};
 function text(v,max){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail('Invalid report text.');return v.trim();}
 async function access(req,isAdmin=false){const uid=await member(req,isAdmin),a=await admin.auth().getUser(uid);if(a.disabled||!a.emailVerified||(await db.doc('accountDeletions/'+uid).get()).exists)throw new HttpsError('permission-denied','Verified active account required.');return uid;}
 return {
 submitPromoHubQuestionReport:onCall(opts,async req=>{
  const uid=await access(req),d=req.data||{};if(d.ownerUid!==uid)throw new HttpsError('permission-denied','Account changed. Reopen the report.');const bankId=text(d.bankId,60),questionId=text(d.questionId,80),comment=text(d.comment,1500),category=d.category;
  if(!/^[-a-z0-9]{1,60}$/.test(bankId)||!Number.isInteger(d.bankVersion)||d.bankVersion<1||!['answer','explanation','wording','other'].includes(category))fail('Invalid question report.');
  const snapshot=d.snapshot;if(!snapshot||typeof snapshot.prompt!=='string'||snapshot.prompt.length>1500||typeof snapshot.explanation!=='string'||snapshot.explanation.length>2000||!Array.isArray(snapshot.options)||snapshot.options.length>6||snapshot.options.some(v=>typeof v!=='string'||v.length>500)||typeof snapshot.correctAnswer!=='string'||snapshot.correctAnswer.length>500)fail('Invalid question snapshot.');
  const published=await db.doc('quizPublished/'+bankId).get(),bank=published.exists?published.data():bankId===starter.id?starter:null;
  if(!bank)throw new HttpsError('not-found','Question bank unavailable.');const current=bank.questions?.find(q=>q.id===questionId)||null;
  if(bank.version===d.bankVersion&&!current)throw new HttpsError('not-found','Question unavailable.');
  const id=hash([uid,bankId,d.bankVersion,questionId].join('|')),ref=db.doc('questionReports/'+id),now=Date.now();
  let alreadyReported=false;await db.runTransaction(async tx=>{
   const [old,p,rate]=await Promise.all([tx.get(ref),tx.get(db.doc('users/'+uid)),tx.get(db.doc('questionReportRates/'+uid))]);
   if(p.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Account is not active.');if(old.exists){alreadyReported=true;return;}
   const r=rate.data()||{},day=Math.floor(now/86400000),count=r.day===day?Number(r.count)||0:0;
   if(now-Number(r.lastAtMs||0)<30000||count>=10)throw new HttpsError('resource-exhausted','Please wait before sending another report. Limit: 10 new reports per day.');
   tx.set(ref,{uid,bankId,bankVersion:d.bankVersion,questionId,category,comment,reportedSnapshot:{prompt:snapshot.prompt,options:snapshot.options,correctAnswer:snapshot.correctAnswer,explanation:snapshot.explanation},currentSnapshot:current?{prompt:current.prompt,options:current.options,correctAnswer:current.options[current.answer],explanation:current.explanation}:null,bankTitle:bank.title||bankId,currentVersion:bank.version||0,status:'open',version:1,createdAt:stamp(),createdAtMs:now});
   tx.set(db.doc('questionReportRates/'+uid),{day,count:count+1,lastAtMs:now});
  });return {ok:true,id,alreadyReported};
 }),
 getPromoHubQuestionReports:onCall(opts,async req=>{
  await access(req,true);const status=req.data?.status||'open',cursor=req.data?.cursor;
  if(!['open','reviewed','dismissed','all'].includes(status)||cursor&&!/^[a-f0-9]{64}$/.test(cursor))fail('Invalid report query.');
  let q=db.collection('questionReports');if(status!=='all')q=q.where('status','==',status);q=q.orderBy('__name__');if(cursor)q=q.startAfter(cursor);const snap=await q.limit(26).get(),docs=snap.docs.slice(0,25),rows=[],banks=new Map();
  for(const doc of docs){const r=doc.data(),p=await db.doc('users/'+r.uid).get(),u=p.data()||{};if(!banks.has(r.bankId)){const published=await db.doc('quizPublished/'+r.bankId).get();banks.set(r.bankId,published.exists?published.data():r.bankId===starter.id?starter:null);}const bank=banks.get(r.bankId),q=bank?.questions?.find(v=>v.id===r.questionId),current=q?{prompt:q.prompt,options:q.options,correctAnswer:q.options[q.answer],explanation:q.explanation}:null;rows.push({id:doc.id,bankId:r.bankId,bankTitle:r.bankTitle,bankVersion:r.bankVersion,currentVersion:bank?.version||0,questionId:r.questionId,category:r.category,comment:r.comment,status:r.status,version:r.version,createdAtMs:r.createdAtMs,reportedSnapshot:r.reportedSnapshot,currentSnapshot:current,reviewNote:r.reviewNote||'',displayName:u.displayName||u.email||'Account unavailable',email:u.email||''});}
  await access(req,true);return {reports:rows,nextCursor:snap.docs.length>25?docs.at(-1).id:null};
 }),
 reviewPromoHubQuestionReport:onCall(opts,async req=>{
  const actor=await access(req,true),d=req.data||{};if(!/^[a-f0-9]{64}$/.test(d.id||'')||!['reviewed','dismissed'].includes(d.status)||!Number.isInteger(d.expectedVersion)||d.expectedVersion<1)fail('Invalid report review.');const note=text(d.note,1500);
  await db.runTransaction(async tx=>{const ref=db.doc('questionReports/'+d.id),[s,p]=await Promise.all([tx.get(ref),tx.get(db.doc('users/'+actor))]);if(p.data()?.accountStatus!=='active')throw new HttpsError('permission-denied','Administrator inactive.');if(!s.exists)throw new HttpsError('not-found','Report not found.');const r=s.data();if(r.version!==d.expectedVersion)throw new HttpsError('aborted','Report changed. Reload it.');tx.update(ref,{status:d.status,version:r.version+1,reviewNote:note,reviewedBy:actor,reviewedAt:stamp()});audit(tx,actor,'questionReport.'+d.status,r.uid,{reportId:d.id,bankId:r.bankId});});return {ok:true};
 })};
};
