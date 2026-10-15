'use strict';
let quizEpoch=0,quizDialog=null,quizBody=null,quizTimer=null,quizHeartbeat=null,quizAttempt=null,quizBank=null,quizOwnLease=false,quizGrant=null,quizBusy=false,quizBanks=[],quizWarning='';
const quizCore=window.PromoHubQuizCore;
function quizKey(type){return 'ges-promohub-quiz-'+type+securityLocalSuffix();}
function quizRead(type,fallback){try{return JSON.parse(localStorage.getItem(quizKey(type)))??fallback;}catch{return fallback;}}
function quizWrite(type,data){try{localStorage.setItem(quizKey(type),JSON.stringify(data));}catch{quizWarning='Device saving is unavailable. Keep this window open to retain this attempt.';}}
function quizEl(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function quizButton(text,fn){const b=quizEl('button',text);b.type='button';b.onclick=fn;return b;}
function quizSave(){if(quizAttempt)quizWrite('attempt',quizAttempt);}
function quizLeaseRelease(){clearInterval(quizHeartbeat);quizHeartbeat=null;if(quizOwnLease&&readerSessionGrant===quizGrant)readerSessionRelease();quizOwnLease=false;quizGrant=null;}
function quizClose(){quizEpoch++;clearInterval(quizTimer);quizSave();quizLeaseRelease();quizBusy=false;if(quizDialog?.open)quizDialog.close();}
function quizReset(){quizClose();quizAttempt=null;quizBank=null;quizBanks=[];quizWarning='';}
function quizAccess(){
 if(!subscriptionReadable())return false;
 if(readerSessionPaid())return !!(quizGrant&&(quizGrant.exempt||quizGrant.readingAccessMode==='offline'&&quizGrant.offlineUntilMs>Date.now()||quizGrant.readingAccessMode==='strict'&&navigator.onLine&&quizGrant.expiresAtMs>Date.now()));
 return true;
}
async function quizLease(){
 if(!subscriptionReadable())throw new Error('Your reading access has expired. Open My Account to renew.');
 if(readerSessionBusy||quizBusy)throw new Error('A reader is opening. Please wait.');
 const epoch=quizEpoch,owner=securityLocalOwner;quizBusy=true;
 try{
  if(readerSessionPaid()){
   if(rendition&&readerSessionGrant){quizGrant=readerSessionGrant;quizOwnLease=false;}
   else{await readerSessionLock(owner);quizOwnLease=true;quizGrant=await readerSessionClaim();if(epoch!==quizEpoch||owner!==securityLocalOwner){if(readerSessionUnlock){readerSessionUnlock();readerSessionUnlock=null;}throw new Error('Account changed.');}readerSessionGrant=quizGrant;}
   clearInterval(quizHeartbeat);quizHeartbeat=setInterval(async()=>{
    if(!quizOwnLease||epoch!==quizEpoch||owner!==securityLocalOwner)return;
    try{const grant=await readerSessionClaim(true);if(epoch!==quizEpoch||owner!==securityLocalOwner)return;quizGrant=grant;readerSessionGrant=grant;quizWarning='';}
    catch(e){if(epoch===quizEpoch){quizWarning=e.message||'Reconnect to verify your reading session.';quizTick();}}
   },40000);
  }
 }catch(e){quizLeaseRelease();throw e;}finally{quizBusy=false;}
}
function quizTick(){
 if(!quizAttempt)return;
 if(quizAttempt.finishedAtMs){if(!quizAccess()){quizBody.replaceChildren(quizEl('p','Reading access is paused. Close and reopen Practice tests after reconnecting or renewing. Your result is saved.'));}return;}
 if(quizAttempt.deadlineMs&&Date.now()>=quizAttempt.deadlineMs){quizFinish(false);return;}
 const t=document.getElementById('quizTimer');if(t){const left=Math.max(0,Math.ceil((quizAttempt.deadlineMs-Date.now())/1000));t.textContent=quizAttempt.deadlineMs?'Time remaining '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'Untimed practice';}
 const field=document.getElementById('quizQuestionField');if(field)field.hidden=!quizAccess();
 const n=document.getElementById('quizAccessStatus');if(n)n.textContent=quizAccess()?quizWarning:(quizWarning||'Reading access is paused. Reconnect in Online mode, or renew expired access. The timer continues.');
}
function quizHistory(){const h=quizRead('history',[]);return Array.isArray(h)?h.filter(v=>v&&typeof v.title==='string'&&Number.isFinite(v.percent)).slice(0,20):[];}
function quizFinish(confirmFirst=true){
 if(!quizAttempt)return;if(confirmFirst&&!confirm('Submit this practice test? Unanswered questions receive no marks.'))return;
 const result=quizCore.finish(quizAttempt);quizSave();const history=quizHistory();if(!history.some(v=>v.startedAtMs===quizAttempt.startedAtMs))history.unshift({title:quizAttempt.title,startedAtMs:quizAttempt.startedAtMs,finishedAtMs:quizAttempt.finishedAtMs,...result});quizWrite('history',history.slice(0,20));clearInterval(quizTimer);quizResults();clearInterval(quizTimer);quizTimer=setInterval(quizTick,1000);
}
function quizResults(){
 quizBody.replaceChildren();if(!quizAttempt)return;const s=quizCore.score(quizAttempt);const score=quizEl('section',undefined,'quizScoreCard');score.append(quizEl('h3','Your results'),quizEl('p',s.correct+' / '+s.total+' correct','quizScoreValue'),quizEl('p',s.percent+'% · '+s.unanswered+' unanswered','quizScoreMeta'));quizBody.append(score,quizEl('p','Saved on this device. These are practice results, not official examination results.','quizHint'));
 if(!quizAccess()){quizBody.append(quizEl('p','Renew your reading access to view explanations or retry.'));return;}
 const actions=quizEl('div',undefined,'quizTools quizResultActions');actions.append(quizButton('Revise mistakes',async()=>{const epoch=quizEpoch,owner=securityLocalOwner;const retry=quizCore.retry(quizAttempt);if(!retry){quizNotice('All answers were correct.');return;}try{await quizLease();if(epoch!==quizEpoch||owner!==securityLocalOwner)return;quizAttempt=retry;quizSave();quizQuestion();}catch(e){quizNotice(e.message);}}),quizButton('New quiz',quizSetup));quizBody.append(actions,quizEl('h3','Answer review','quizSectionHeading'));
 quizAttempt.questions.forEach((q,i)=>{
  const correct=quizAttempt.answers[i]===q.answer,d=quizEl('details',undefined,'quizAnswerCard'),summary=quizEl('summary');summary.append(quizEl('span',correct?'Correct':'Review','quizAnswerBadge '+(correct?'isCorrect':'isIncorrect')),quizEl('span',(i+1)+'. '+q.prompt,'quizAnswerTitle'));d.append(summary);
  const content=quizEl('div',undefined,'quizAnswerContent');
  for(const [label,text] of [['Your answer',quizAttempt.answers[i]===null?'Unanswered':q.options[quizAttempt.answers[i]]],['Correct answer',q.options[q.answer]]]){const row=quizEl('p',undefined,'quizAnswerLine');row.append(quizEl('strong',label+': '),quizEl('span',text));content.append(row);}
  content.append(quizEl('h4','Explanation'),quizEl('p',q.explanation,'quizExplanation'));
  const sources=quizEl('details',undefined,'quizSourceDetails');sources.append(quizEl('summary','Source references'),quizEl('p',q.source));content.append(sources);if(typeof questionReportControl==='function')content.append(questionReportControl(q,quizAttempt));d.append(content);quizBody.append(d);
 });
}
function quizNotice(text){let n=document.getElementById('quizStatus');if(!n){n=quizEl('p');n.id='quizStatus';n.setAttribute('role','status');quizBody.prepend(n);}n.textContent=text;}
function quizQuestion(){
 if(!quizAttempt)return;quizBody.replaceChildren();const a=quizAttempt;if(a.finishedAtMs){quizResults();return;}
 if(a.deadlineMs&&Date.now()>=a.deadlineMs){quizFinish(false);return;}
 const timer=quizEl('p');timer.id='quizTimer';const status=quizEl('p');status.id='quizAccessStatus';status.setAttribute('role','status');quizBody.append(timer,status,quizEl('p','Question '+(a.index+1)+' of '+a.questions.length));
 const q=a.questions[a.index],fieldset=quizEl('fieldset');fieldset.id='quizQuestionField';fieldset.append(quizEl('legend',q.prompt));q.options.forEach((text,i)=>{const label=quizEl('label',undefined,'quizOption'),radio=document.createElement('input');radio.type='radio';radio.name='quizAnswer';radio.checked=a.answers[a.index]===i;radio.onchange=()=>{if(!quizAccess()){radio.checked=false;quizTick();return;}if(quizCore.answer(a,a.index,i)){quizSave();}else quizFinish(false);};label.append(radio,quizEl('span',text));fieldset.append(label);});quizBody.append(fieldset);
 const tools=quizEl('div',undefined,'quizTools'),prev=quizButton('Previous',()=>{if(a.index>0){a.index--;quizSave();quizQuestion();}}),next=quizButton('Next',()=>{if(a.index<a.questions.length-1){a.index++;quizSave();quizQuestion();}});prev.disabled=a.index===0;next.disabled=a.index===a.questions.length-1;tools.append(prev,next,quizButton('Submit test',()=>quizFinish()));quizBody.append(tools,quizEl('p','Closing pauses the display, not a timed countdown. Reopen Practice tests to resume.','quizHint'));clearInterval(quizTimer);quizTimer=setInterval(quizTick,1000);quizTick();
}
async function quizLoadBank(id){
 if(cloudUser&&navigator.onLine){const b=await securityCall('getPromoHubQuizBank',{id});if(!quizCore.validBank(b))throw new Error('Invalid published question bank.');return b;}
 const cached=quizRead('banks',{});const b=cached[id];if(quizCore.validBank(b))return b;
 if(id==='assessment-learning'){const b=await (await fetch('./starter-quiz.json')).json();if(quizCore.validBank(b))return b;}throw new Error('Download this question set while online first.');
}
async function quizSetup(){
 clearInterval(quizTimer);quizLeaseRelease();quizBody.replaceChildren();quizBody.append(quizEl('p','Loading question sets…'));const epoch=quizEpoch,owner=securityLocalOwner;
 try{
  const cached=quizRead('banks',{}),starter=await (await fetch('./starter-quiz.json')).json();if(epoch!==quizEpoch||owner!==securityLocalOwner)return;
  quizBanks=[{id:starter.id,title:starter.title,count:starter.questions.length,topics:[...new Set(starter.questions.map(q=>q.topic))]}];
  if(cloudUser&&navigator.onLine){try{const r=await securityCall('getPromoHubQuizBanks');if(epoch!==quizEpoch||owner!==securityLocalOwner)return;quizBanks=r.banks;}catch(e){quizWarning='Using saved question sets. '+e.message;quizBanks=[...new Map([...quizBanks,...Object.values(cached).filter(quizCore.validBank).map(b=>({id:b.id,title:b.title,count:b.questions.length,topics:[...new Set(b.questions.map(q=>q.topic))]}))].map(b=>[b.id,b])).values()];}}
  else quizBanks=[...new Map([...quizBanks,...Object.values(cached).filter(quizCore.validBank).map(b=>({id:b.id,title:b.title,count:b.questions.length,topics:[...new Set(b.questions.map(q=>q.topic))]}))].map(b=>[b.id,b])).values()];
  quizBody.replaceChildren();quizBody.append(quizEl('p','Choose a reviewed question set. Scores and attempts stay on this device.'));
  if(!quizBanks.length){quizBody.append(quizEl('p','No published question sets are available.'));return;}
  const form=document.createElement('form');form.className='quizSetupForm';const select=document.createElement('select'),topic=document.createElement('select'),count=document.createElement('input'),minutes=document.createElement('input');count.type=minutes.type='number';count.min='1';count.max='100';count.value='10';minutes.min='0';minutes.max='120';minutes.value='10';
  for(const b of quizBanks){const o=quizEl('option',b.title+' ('+b.count+' questions)');o.value=b.id;select.append(o);}const topics=()=>{topic.replaceChildren();const all=quizEl('option','All topics');all.value='all';topic.append(all);for(const t of quizBanks.find(b=>b.id===select.value).topics){const o=quizEl('option',t);o.value=t;topic.append(o);}};select.onchange=topics;topics();
  for(const [label,input] of [['Question set',select],['Topic',topic],['Questions',count],['Time limit (minutes)',minutes]]){const l=quizEl('label',label,'quizField');l.append(input);if(input===select||input===topic)l.classList.add('quizFieldWide');if(input===count)l.append(quizEl('small','Up to the number available for your topic.','quizFieldHelp'));if(input===minutes)l.append(quizEl('small','Choose 0 for untimed practice.','quizFieldHelp'));form.append(l);}
  const start=quizEl('button','Start practice');start.type='submit';start.className='quizPrimary';const startRow=quizEl('div',undefined,'quizSetupStart');startRow.append(start);form.append(startRow);form.onsubmit=async e=>{e.preventDefault();if(quizBusy)return;const previous=quizRead('attempt',null);if(quizCore.validAttempt(previous,securityLocalOwner)&&!previous.finishedAtMs&&!confirm('Replace the unfinished practice attempt?'))return;start.disabled=true;const epoch=quizEpoch,owner=securityLocalOwner;try{const b=await quizLoadBank(select.value);if(epoch!==quizEpoch||owner!==securityLocalOwner)return;const settings={owner,count:Number(count.value),minutes:Number(minutes.value),topic:topic.value};quizCore.create(b,settings);await quizLease();const a=quizCore.create(b,settings);if(epoch!==quizEpoch||owner!==securityLocalOwner)return;quizAttempt=a;quizSave();quizQuestion();}catch(e){if(epoch===quizEpoch)quizNotice(e.message);}finally{start.disabled=false;}};quizBody.append(form);
  quizBody.append(quizButton('Save question set for offline',async()=>{const epoch=quizEpoch,owner=securityLocalOwner;try{const b=await quizLoadBank(select.value);if(epoch!==quizEpoch||owner!==securityLocalOwner)return;const all=quizRead('banks',{});all[b.id]=b;quizWrite('banks',all);quizNotice(quizWarning||'Question set saved for offline practice. Your reading mode and subscription still apply.');}catch(e){if(epoch===quizEpoch)quizNotice(e.message);}}));
  const saved=quizRead('attempt',null);if(quizCore.validAttempt(saved,owner))quizBody.append(quizButton(saved.finishedAtMs?'View latest result':'Resume saved attempt',async()=>{try{await quizLease();if(epoch!==quizEpoch||owner!==securityLocalOwner)return;quizAttempt=saved;if(saved.finishedAtMs){quizResults();clearInterval(quizTimer);quizTimer=setInterval(quizTick,1000);}else quizQuestion();}catch(e){quizNotice(e.message);}}));
  const h=quizHistory();if(h.length){quizBody.append(quizEl('h3','Recent results'));h.slice(0,5).forEach(v=>quizBody.append(quizEl('p',v.title+' · '+v.percent+'% · '+new Date(v.finishedAtMs).toLocaleDateString())));}if(quizWarning)quizNotice(quizWarning);
 }catch(e){if(epoch===quizEpoch)quizNotice(e.message||'Question sets unavailable.');}
}
function quizOpen(){
 if(!quizDialog){quizDialog=document.createElement('dialog');quizDialog.className='quizDialog';quizDialog.id='quizDialog';quizDialog.setAttribute('aria-labelledby','quizHeading');const header=quizEl('div',undefined,'quizHeader'),h=quizEl('h2','Practice tests');h.id='quizHeading';const close=quizButton('',quizClose);close.className='quizClose';close.setAttribute('aria-label','Close practice tests');close.title='Close';close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';header.append(h,close);quizBody=quizEl('div',undefined,'quizBody');quizDialog.append(header,quizBody);document.body.append(quizDialog);quizDialog.addEventListener('cancel',e=>{e.preventDefault();quizClose();});quizDialog.addEventListener('click',e=>{if(e.target===quizDialog)quizClose();});}
 quizEpoch++;quizDialog.showModal();quizSetup();
}
window.addEventListener('pagehide',quizSave);
window.addEventListener('offline',quizTick);
window.addEventListener('online',quizTick);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')quizTick();});
