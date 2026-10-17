'use strict';
function revisionRows(){return window.PromoHubRevisionCore.rows(quizRead('history',[]),quizRead('attempt',null),securityLocalOwner,quizCore);}
function revisionShow(){quizSave();quizEpoch++;clearInterval(quizTimer);quizLeaseRelease();revisionRender();}
function revisionRender(selectedBank){
 quizView='revision';
 const heading=document.getElementById('quizHeading');if(heading)heading.textContent='Revision dashboard';
 quizBody.replaceChildren();quizBody.append(quizButton('Back to practice',()=>{quizEpoch++;quizSetup();}));
 const records=revisionRows(),banks=new Map();for(const r of records)if(r.bankId&&!banks.has(r.bankId))banks.set(r.bankId,r.title);
 const filter=selectedBank??(records.find(r=>r.bankId)?.bankId||'all'),data=window.PromoHubRevisionCore.summarize(records,filter);
 quizBody.append(quizEl('p','Based on up to 20 completed practice attempts saved for this account on this browser. Results do not sync between devices.','quizHint'));
 if(!records.length){quizBody.append(quizEl('h3','Start your revision record'),quizEl('p','Complete a practice test to see topic scores, weak areas and your progress.'));return;}
 const label=quizEl('label','Question set','quizField'),select=quizEl('select');select.setAttribute('aria-label','Revision question set');const all=quizEl('option','All question sets');all.value='all';select.append(all);for(const [id,title] of banks){const o=quizEl('option',title);o.value=id;select.append(o);}select.value=filter;select.onchange=()=>{quizEpoch++;revisionRender(select.value);};label.append(select);quizBody.append(label);
 const stats=quizEl('div',undefined,'revisionStats');for(const [label,value] of [['Practice accuracy',data.percent===null?'No scores':data.percent+'%'],['Completed attempts',String(data.attempts)],['Weak topics',String(data.weak.length)]]){const box=quizEl('section',undefined,'revisionStat');box.append(quizEl('span',label),quizEl('strong',value));stats.append(box);}quizBody.append(stats);
 const change=data.comparison;quizBody.append(quizEl('h3','Improvement over time'));if(change)quizBody.append(quizEl('p','Latest '+change.n+' attempts: '+change.latest+'%. Previous '+change.n+': '+change.previous+'%. '+(change.change>0?'Up '+change.change:change.change<0?'Down '+Math.abs(change.change):'No change')+(change.change?' percentage points.':'.')));else quizBody.append(quizEl('p','Complete at least two tests in this selection to compare results.'));
 quizBody.append(quizEl('p','Accuracy counts correct answers out of all questions, including unanswered ones. Repeated questions and mistake revision count again; different sets and difficulties can affect comparisons. These are practice indicators, not an examination prediction.','quizHint'));
 const tools=quizEl('div',undefined,'quizTools');const weak=quizButton('Practise my weak topics',()=>revisionStartWeak(filter,data.weak.filter(t=>t.bankId===filter).map(t=>t.topic),weak));weak.className='quizPrimary';weak.disabled=filter==='all'||!data.weak.some(t=>t.bankId===filter)||!subscriptionReadable();tools.append(weak);quizBody.append(tools);
 if(filter==='all')quizBody.append(quizEl('p','Choose a question set above to practise its weak topics.','quizHint'));
 if(!subscriptionReadable())quizBody.append(quizEl('p','Your saved revision record is available. Renew reading access before starting practice.','quizHint'));
 quizBody.append(quizEl('h3','Scores by topic'),quizEl('p','Weak means below 70% accuracy with at least 3 recorded question results. Smaller samples are marked “More practice needed”. Topic scores use only attempts with saved topic detail.','quizHint'));
 if(data.covered<data.attempts)quizBody.append(quizEl('p',(data.attempts-data.covered)+' older result(s) have no topic detail. Their overall scores remain in the history.','quizHint'));
 if(!data.topics.length)quizBody.append(quizEl('p','Complete another test to begin topic tracking.'));
 const topics=quizEl('div',undefined,'revisionTopics');for(const t of data.topics){const row=quizEl('article',undefined,'revisionTopic');row.append(quizEl('h4',t.topic),quizEl('p',(filter==='all'?t.title+' · ':'')+t.correct+'/'+t.total+' correct · '+t.percent+'% · '+t.unanswered+' unanswered'),quizEl('span',t.total<3?'More practice needed':t.weak?'Weak topic':'On track','revisionTopicState'));const bar=quizEl('progress');bar.max=100;bar.value=t.percent;bar.setAttribute('aria-label',t.topic+' accuracy');row.append(bar);topics.append(row);}quizBody.append(topics);
 const history=quizEl('details',undefined,'revisionHistory');history.append(quizEl('summary','Recent attempt scores'));const list=quizEl('ol');for(const r of data.records.slice(0,10)){const item=quizEl('li');item.append(quizEl('strong',r.percent+'% · '+r.correct+'/'+r.total),quizEl('span',r.title+' · '+new Date(r.finishedAtMs).toLocaleString()));list.append(item);}history.append(list);quizBody.append(history);
 if(quizWarning)quizNotice(quizWarning);
}
async function revisionStartWeak(bankId,topics,button){
 if(quizBusy)return;const epoch=quizEpoch,owner=securityLocalOwner;
 const current=()=>epoch===quizEpoch&&owner===securityLocalOwner;
 try{
  if(!subscriptionReadable())throw new Error('Renew reading access before starting practice.');
  if(bankId==='all'||!topics.length)throw new Error('Choose a question set with weak topics first.');
  const previous=quizRead('attempt',null);if(quizCore.validAttempt(previous,owner)&&!previous.finishedAtMs&&!confirm('Replace the unfinished practice attempt with weak-topic practice?'))return;
  if(button)button.disabled=true;
  const bank=await quizLoadBank(bankId);if(!current())return;
  const pool=window.PromoHubRevisionCore.weakBank(bank,topics,quizCore);
  const settings={owner,count:Math.min(10,pool.questions.length),minutes:0};quizCore.create(pool,settings);
  await quizLease();if(!current())return;
  quizAttempt=quizCore.create(pool,settings);quizAttempt.title=bank.title+' - weak-topic practice';quizView='practice';quizSave();const h=document.getElementById('quizHeading');if(h)h.textContent='Practice tests';quizQuestion();
 }catch(e){if(current())quizNotice(e.message||'Unable to start weak-topic practice.');}finally{if(current()&&button)button.disabled=false;}
}
function revisionOpen(){quizOpen('revision');}
