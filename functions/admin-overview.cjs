'use strict';
const subscriptions=require('./subscriptions.cjs'),plans=subscriptions.plans,{createHash}=require('node:crypto'),DAY=86400000;
function amount(value){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return null;const cents=Math.round(value*100);return Number.isSafeInteger(cents)?cents:null;}
function receipt(p,now,id){const reference=subscriptions.reference(p.reference);return typeof p.uid==='string'&&p.uid.length>0&&typeof p.approvedBy==='string'&&p.approvedBy.length>0&&Object.hasOwn(plans,p.planId)&&!!reference&&(!id||id===createHash('sha256').update(reference).digest('hex'))&&typeof p.approvedAtMs==='number'&&p.approvedAtMs>0&&p.approvedAtMs<=now&&amount(p.amountGhs)!==null;}
function paid(p,now){return p?.subscriptionSchema===1&&p.accountTier==='premium'&&p.accountStatus==='active'&&Number.isFinite(Number(p.subscriptionEndsAtMs))&&Number(p.subscriptionEndsAtMs)>now;}
module.exports=function({onCall,options,HttpsError,db,admin,member,clock=Date.now}){
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
 const identityCache=()=>{
  const map=new Map();return async uid=>{if(!validId(uid))return {name:'Account unavailable',email:''};if(!map.has(uid))map.set(uid,db.doc('users/'+uid).get().then(s=>{const p=s.data()||{};return {name:typeof p.displayName==='string'&&p.displayName?p.displayName:typeof p.name==='string'&&p.name?p.name:typeof p.email==='string'&&p.email?p.email:'Account unavailable',email:typeof p.email==='string'?p.email:''};}));return map.get(uid);};
 };
 async function page(collection,cursor,limit=100){let q=db.collection(collection).orderBy('__name__').limit(limit);if(cursor)q=q.startAfter(cursor);return q.get();}
 async function active(docs,now){
  const candidates=docs.filter(d=>paid(d.data(),now));if(!candidates.length)return [];
  const users=(await admin.auth().getUsers(candidates.map(d=>({uid:d.id})))).users,auth=new Map(users.map(u=>[u.uid,u]));
  return candidates.filter(d=>{const u=auth.get(d.id);return u&&!u.disabled&&u.emailVerified&&u.customClaims?.promohubAdmin!==true;});
 }
 function monthStart(now){const d=new Date(now);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);}
 function profileRow(d,now){const p=d.data();return {name:p.displayName||p.name||p.email||'Account unavailable',email:p.email||'',plan:plans[p.subscriptionPlan]?.label||'Paid plan',expiresAtMs:Number(p.subscriptionEndsAtMs),daysRemaining:Math.ceil((Number(p.subscriptionEndsAtMs)-now)/DAY)};}
 async function requestRow(d,account,now){const p=d.data(),who=await account(p.uid||d.id);return {...who,plan:plans[p.planId]?.label||'Unknown plan',amountGhs:typeof p.amountGhs==='number'?p.amountGhs:null,transactionId:typeof p.reference==='string'?p.reference:'',requestedAtMs:Number(p.requestedAtMs)||0,waitingDays:Math.max(0,Math.floor((now-(Number(p.requestedAtMs)||now))/DAY))};}
 async function paymentRow(d,account){const p=d.data(),[who,actor]=await Promise.all([account(p.uid),account(p.approvedBy)]);return {...who,plan:plans[p.planId]?.label||p.planId||'Paid plan',amountGhs:amount(p.amountGhs)/100,transactionId:typeof p.reference==='string'?p.reference:'',approvedAtMs:p.approvedAtMs,approvedByName:actor.name,approvedByEmail:actor.email};}
 const getPromoHubAdminOverview=onCall({...options,timeoutSeconds:540,maxInstances:3},async req=>{
  await member(req,true);const now=clock(),month=monthStart(now),account=identityCache();
  const summary={activeSubscriptions:0,expiringSubscriptions:0,pendingPayments:0,verifiedPayments:0,verifiedTotalGhs:0,verifiedMonthPayments:0,verifiedMonthTotalGhs:0,invalidLedgerRecords:0};
  let allCents=0,monthCents=0,cursor=null;const expiring=[],pending=[],verified=[];
  function preview(rows,row,sort){rows.push(row);rows.sort(sort);if(rows.length>20)rows.pop();}
  while(true){const snap=await page('users',cursor);for(const d of await active(snap.docs,now)){summary.activeSubscriptions++;const row=profileRow(d,now);if(row.expiresAtMs<=now+7*DAY){summary.expiringSubscriptions++;preview(expiring,row,(a,b)=>a.expiresAtMs-b.expiresAtMs);}}if(snap.docs.length<100)break;cursor=snap.docs.at(-1).id;}
  cursor=null;
  while(true){const snap=await page('subscriptionRequests',cursor);for(const d of snap.docs){if(d.data().status!=='pending')continue;summary.pendingPayments++;if(pending.length<20 || (Number(d.data().requestedAtMs)||0)<pending.at(-1).requestedAtMs)preview(pending,await requestRow(d,account,now),(a,b)=>a.requestedAtMs-b.requestedAtMs);}if(snap.docs.length<100)break;cursor=snap.docs.at(-1).id;}
  cursor=null;
  while(true){const snap=await page('subscriptionPayments',cursor);for(const d of snap.docs){const p=d.data();if(!receipt(p,now,d.id)){summary.invalidLedgerRecords++;continue;}const cents=amount(p.amountGhs);allCents+=cents;summary.verifiedPayments++;if(p.approvedAtMs>=month){monthCents+=cents;summary.verifiedMonthPayments++;}if(!Number.isSafeInteger(allCents)||!Number.isSafeInteger(monthCents))throw new HttpsError('failed-precondition','Payment totals exceed the supported numeric range.');
   // Resolve identities only for records that can enter the latest-20 preview.
   if(verified.length<20 || p.approvedAtMs>verified.at(-1).approvedAtMs)preview(verified,await paymentRow(d,account),(a,b)=>b.approvedAtMs-a.approvedAtMs);
  }if(snap.docs.length<100)break;cursor=snap.docs.at(-1).id;}
  summary.verifiedTotalGhs=allCents/100;summary.verifiedMonthTotalGhs=monthCents/100;
  await member(req,true);return {asOfMs:now,monthStartMs:month,summary,expiring,pending,verified,previewLimit:20};
 });
 const getPromoHubAdminExport=onCall({...options,timeoutSeconds:120,maxInstances:3},async req=>{
  await member(req,true);const {kind,period='all',cursor=null}=req.data||{};
  if(!['active','expiring','pending','verified'].includes(kind)||!['all','month'].includes(period)||(cursor!==null&&!validId(cursor)))throw new HttpsError('invalid-argument','Invalid report or cursor.');
  const now=clock(),asOf=req.data?.asOfMs===undefined?now:Number(req.data.asOfMs);
  if(!Number.isFinite(asOf)||asOf<=0||asOf>now+60000||now-asOf>3600000)throw new HttpsError('invalid-argument','Refresh Overview and start the export again.');
  const collection=kind==='pending'?'subscriptionRequests':kind==='verified'?'subscriptionPayments':'users',snap=await page(collection,cursor),account=identityCache(),rows=[];
  if(kind==='active'||kind==='expiring'){for(const d of await active(snap.docs,asOf)){const row=profileRow(d,asOf);if(kind==='active'||row.expiresAtMs<=asOf+7*DAY)rows.push(row);}}
  else if(kind==='pending'){for(const d of snap.docs)if(d.data().status==='pending')rows.push(await requestRow(d,account,asOf));}
  else {for(const d of snap.docs){const p=d.data();if(receipt(p,asOf,d.id)&&(period==='all'||p.approvedAtMs>=monthStart(asOf)))rows.push(await paymentRow(d,account));}}
  await member(req,true);return {rows,asOfMs:asOf,cursor:snap.docs.length===100?snap.docs.at(-1).id:null};
 });
 return {getPromoHubAdminOverview,getPromoHubAdminExport};
};
module.exports.amount=amount;module.exports.receipt=receipt;
