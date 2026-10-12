'use strict';
let quizAdminEpoch=0;
function quizAdminReset(){quizAdminEpoch++;}
function quizAdminEl(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
async function quizAdmin(){
 if(!securityIsAdmin())return;adminCancelSearch();const epoch=++quizAdminEpoch,state=securityAdminStart('quizzes','Practice question banks');
 const current=()=>epoch===quizAdminEpoch&&securityAdminCurrent(state);const root=quizAdminEl('div');root.className='quizAdmin';state.host.replaceChildren(root);
 const note=quizAdminEl('p','Review every correct answer, explanation and source before publishing. Draft edits do not change an already published bank. Disable stops new online downloads; offline copies remain on devices. The built-in starter contains 12 adapted foundation questions. Starter edits and disabling apply to signed-in online downloads; guests and previously saved offline copies retain the built-in starter.');root.append(note);
 const list=quizAdminEl('div'),editor=quizAdminEl('div');root.append(list,editor);let model=null,saving=false;
 function btn(text,fn){const b=quizAdminEl('button',text);b.type='button';b.onclick=fn;return b;}
 function field(host,label,tag,value,change){const l=quizAdminEl('label',label);l.className='quizField';const n=quizAdminEl(tag);n.value=value;n.oninput=()=>{change(n.value);review.checked=false;};l.append(n);host.append(l);return n;}
 const review=quizAdminEl('input');review.type='checkbox';
 function draw(){
  editor.replaceChildren();if(!model)return;review.checked=false;
  const title=quizAdminEl('h3',model.title||'New question set');editor.append(title);
  const idField=field(editor,'Bank ID (lowercase letters, numbers and hyphens)','input',model.id,v=>model.id=v);idField.disabled=model.version>0;
  field(editor,'Title','input',model.title,v=>model.title=v);
  model.questions.forEach((q,index)=>{const d=quizAdminEl('details');d.append(quizAdminEl('summary',(index+1)+'. '+(q.prompt||'New question')));field(d,'Topic','input',q.topic,v=>q.topic=v);field(d,'Question','textarea',q.prompt,v=>q.prompt=v);field(d,'Options, one per line','textarea',q.options.join('\n'),v=>{q.options=v.split('\n');});field(d,'Correct option number (1 to '+q.options.length+')','input',String(q.answer+1),v=>q.answer=Number(v)-1);field(d,'Explanation','textarea',q.explanation,v=>q.explanation=v);field(d,'Source or book/chapter/question reference','textarea',q.source,v=>q.source=v);d.append(btn('Remove question',()=>{model.questions.splice(index,1);draw();}));editor.append(d);});
  editor.append(btn('Add question',()=>{if(model.questions.length>=100){securityMessage('A set supports up to 100 questions.');return;}model.questions.push({id:crypto.randomUUID(),topic:'',prompt:'',options:['',''],answer:0,explanation:'',source:''});draw();}));const label=quizAdminEl('label');label.className='quizReview';label.append(review,quizAdminEl('span','I have checked every question, correct answer, explanation and source.'));editor.append(label);
  const tools=quizAdminEl('div');tools.className='quizTools';for(const [text,status] of [['Save draft','draft'],['Publish reviewed bank','published'],['Disable bank','disabled']])tools.append(btn(text,()=>save(status)));editor.append(tools);
 }
 async function save(status){
  if(saving||!current()||!model)return;if(!window.PromoHubQuizCore.validBank(model)){securityMessage('Complete each question, source and explanation; use distinct options and a valid correct option number.');return;}if(status==='published'&&!review.checked){securityMessage('Confirm the review checkbox before publishing.');return;}
  if(status!=='draft'&&!confirm((status==='published'?'Publish':'Disable')+' '+model.title+'?'))return;saving=true;editor.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await securityCall('savePromoHubQuizBank',{bank:model,expectedVersion:model.version||0,status,reviewed:review.checked});if(!current())return;model.version=result.version;model.status=result.status;securityMessage('Question set saved as '+status+'.');draw();await loadList();}catch(e){if(current())securityMessage(e.message||'Save failed.');}finally{saving=false;if(current())editor.querySelectorAll('button').forEach(b=>b.disabled=false);}
 }
 async function edit(id){if(saving||!current())return;try{const bank=await securityCall('getPromoHubQuizAdmin',{id});if(!current())return;model=bank;draw();}catch(e){if(current())securityMessage(e.message);}}
 async function loadList(){try{const r=await securityCall('getPromoHubQuizAdmin');if(!current())return;list.replaceChildren();const tools=quizAdminEl('div');tools.className='quizTools';tools.append(btn('Edit starter bank',()=>edit('assessment-learning')),btn('New question bank',()=>{if(saving)return;model={schema:1,id:'',title:'',version:0,status:'draft',questions:[]};draw();}));list.append(tools);
  const imp=quizAdminEl('input');imp.type='file';imp.accept='.json,application/json';const lab=quizAdminEl('label','Import a question-bank JSON file');lab.className='quizField';lab.append(imp);list.append(lab);imp.onchange=async()=>{if(saving||!current())return;const file=imp.files[0];if(!file)return;try{if(file.size>400000)throw new Error('Question bank exceeds 400 KB.');const b=JSON.parse(await file.text());if(!current())return;if(!window.PromoHubQuizCore.validBank(b))throw new Error('Invalid question bank.');model={...b,version:0,status:'draft'};draw();securityMessage('Imported as a new draft. Existing IDs cannot be overwritten without loading their current version.');}catch(e){if(current())securityMessage(e.message);}};
  r.banks.forEach(b=>list.append(btn(b.title+' · '+b.status+' · '+b.count+' questions',()=>edit(b.id))));
 }catch(e){if(current())securityMessage(e.message);}}
 await loadList();
}
