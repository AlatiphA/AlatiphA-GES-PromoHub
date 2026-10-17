(function(root){
 'use strict';
 const bankId=id=>typeof id==='string'&&/^[-a-z0-9]{1,60}$/.test(id);
 function record(a,core){
  if(!core.validAttempt(a,a?.owner)||!a.finishedAtMs)return null;
  const topics=new Map();a.questions.forEach((q,i)=>{const topic=q.topic.trim();let row=topics.get(topic);if(!row){row={topic,correct:0,total:0,unanswered:0};topics.set(topic,row);}row.total++;if(a.answers[i]===q.answer)row.correct++;if(a.answers[i]===null)row.unanswered++;});
  return {revisionSchema:1,owner:a.owner,bankId:a.bankId,bankVersion:a.bankVersion,title:a.title,startedAtMs:a.startedAtMs,finishedAtMs:a.finishedAtMs,...core.score(a),topics:[...topics.values()]};
 }
 function normalize(r,owner){
  if(!r||r.owner!==undefined&&r.owner!==owner||typeof r.title!=='string'||!Number.isFinite(r.startedAtMs)||r.startedAtMs<=0||!Number.isFinite(r.finishedAtMs)||r.finishedAtMs<r.startedAtMs||!Number.isInteger(r.total)||r.total<1||r.total>100||!Number.isInteger(r.correct)||r.correct<0||r.correct>r.total)return null;
  const row={...r,bankId:bankId(r.bankId)?r.bankId:'',percent:Math.round(r.correct/r.total*100),topics:null};
  if(r.revisionSchema===1&&row.bankId&&Array.isArray(r.topics)&&r.topics.length<=100){const names=new Set();let correct=0,total=0;const valid=r.topics.length>0&&r.topics.every(t=>{if(!t||typeof t.topic!=='string'||!t.topic.trim()||names.has(t.topic.trim())||!Number.isInteger(t.total)||t.total<1||!Number.isInteger(t.correct)||t.correct<0||t.correct>t.total||!Number.isInteger(t.unanswered)||t.unanswered<0||t.unanswered>t.total-t.correct)return false;names.add(t.topic.trim());total+=t.total;correct+=t.correct;return true;});if(valid&&total===r.total&&correct===r.correct)row.topics=r.topics.map(t=>({...t,topic:t.topic.trim()}));}
  return row;
 }
 function rows(history,latest,owner,core){
  const recent=Array.isArray(history)?history.slice(0,20):[];const recovered=core.validAttempt(latest,owner)&&latest.finishedAtMs?record(latest,core):null;
  if(recovered){const i=recent.findIndex(r=>r?.startedAtMs===recovered.startedAtMs);if(i>=0)recent[i]=recovered;else recent.unshift(recovered);}
  const seen=new Set();return recent.map(r=>normalize(r,owner)).filter(r=>{if(!r||seen.has(r.startedAtMs))return false;seen.add(r.startedAtMs);return true;}).sort((a,b)=>b.finishedAtMs-a.finishedAtMs).slice(0,20);
 }
 function summarize(records,filter='all'){
  const selected=records.filter(r=>filter==='all'||r.bankId===filter),topics=new Map();let correct=0,total=0,covered=0;
  for(const r of selected){correct+=r.correct;total+=r.total;if(!r.topics)continue;covered++;for(const t of r.topics){const key=JSON.stringify([r.bankId,t.topic]);let row=topics.get(key);if(!row){row={bankId:r.bankId,title:r.title,topic:t.topic,correct:0,total:0,unanswered:0};topics.set(key,row);}row.correct+=t.correct;row.total+=t.total;row.unanswered+=t.unanswered;}}
  const topicRows=[...topics.values()].map(t=>({...t,percent:Math.round(t.correct/t.total*100),weak:t.total>=3&&Math.round(t.correct/t.total*100)<70})).sort((a,b)=>a.percent-b.percent||a.topic.localeCompare(b.topic));
  const average=list=>{const count=list.reduce((n,r)=>n+r.total,0);return count?Math.round(list.reduce((n,r)=>n+r.correct,0)/count*100):null;};const n=Math.min(5,Math.floor(selected.length/2)),latest=n?average(selected.slice(0,n)):null,previous=n?average(selected.slice(n,2*n)):null;
  return {records:selected,topics:topicRows,weak:topicRows.filter(t=>t.weak),attempts:selected.length,covered,correct,total,percent:total?Math.round(correct/total*100):null,comparison:n?{n,latest,previous,change:latest-previous}:null};
 }
 function weakBank(bank,topics,core){
  if(!core.validBank(bank))throw new Error('Invalid question bank.');const names=new Set(topics),questions=bank.questions.filter(q=>names.has(q.topic.trim()));if(!questions.length)throw new Error('These topics are not in the current question set. Choose another set or take a new practice test.');return {...bank,questions};
 }
 const api={record,normalize,rows,summarize,weakBank};if(typeof module==='object'&&module.exports)module.exports=api;root.PromoHubRevisionCore=api;
})(typeof window==='object'?window:globalThis);
