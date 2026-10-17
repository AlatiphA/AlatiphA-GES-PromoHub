'use strict';
/* Existing account-scoped stores remain authoritative. No new cloud writes. */
let dashboardView=null,dashboardSignature="",dashboardScrollUntil=0,dashboardRenderTimer=null;
let dashboardGeneration=0,dashboardScope=null,dashboardCloudStarted=false,dashboardRemoteMarks=[],dashboardTarget=null;
function dashboardRead(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}}
function dashboardId(file){return file.replace(/^\.\/library\//,'').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();}
function dashboardDataKey(file){return READER_DATA_KEY+'-'+dashboardId(file)+securityLocalSuffix();}
function dashboardMarksKey(file){return 'ges-promohub-bookmarks-'+file+securityLocalSuffix();}
function dashboardPercent(value){return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,Math.floor(value))):null;}
function dashboardRows(){
 const visits=dashboardRead('ges-promohub-recent'+securityLocalSuffix(),{});
 return BOOKS.map(b=>{const d=dashboardRead(dashboardDataKey(b.file),{}),marks=dashboardRead(dashboardMarksKey(b.file),[]);
  return {...b,data:d,percent:dashboardPercent(d.progress),at:Math.max(Number(d.updatedAtMs)||0,Number(visits[b.file])||0),marks:Array.isArray(marks)?marks.filter(m=>typeof m?.cfi==='string'&&m.cfi.startsWith('epubcfi(')):[]};
 }).sort((a,b)=>b.at-a.at);
}
function dashboardNode(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function dashboardOpen(file,cfi){
 const b=BOOKS.find(b=>b.file===file);if(!b)return;
 if(readerSessionBusy)return;
 dashboardTarget=typeof cfi==='string'&&cfi.startsWith('epubcfi(')?{file,cfi,owner:securityLocalOwner}:null;
 selectedBookFile=file;try{localStorage.setItem('lastBook',file);}catch{}
 if(readerTitle)readerTitle.textContent=b.title;
 if(openReader()===false)dashboardTarget=null;
}
function dashboardStart(){
 const owner=securityLocalOwner,file=selectedBookFile;
 const target=dashboardTarget;dashboardTarget=null;
 try{const visits=dashboardRead('ges-promohub-recent'+securityLocalSuffix(),{});visits[file]=Date.now();localStorage.setItem('ges-promohub-recent'+securityLocalSuffix(),JSON.stringify(visits));}catch{}
 return target?.owner===owner&&target.file===file?target.cfi:null;
}
function dashboardText(node,text){if(node.textContent!==text)node.textContent=text;}
function dashboardProgress(bar,percent){
 bar.hidden=percent===null;
 // The native value property defaults to zero even when the value attribute is absent.
 // An absent value makes <progress> indeterminate, so zero must be explicitly assigned.
 if(percent!==null && (!bar.hasAttribute('value') || bar.value!==percent))bar.value=percent;
}
function dashboardVisibleMarks(rows){
 const marks=[];for(const b of rows){const seen=new Set();for(const m of [...b.marks,...dashboardRemoteMarks.filter(m=>m.bookFile===b.file)]){if(typeof m.cfi!=='string'||!m.cfi.startsWith('epubcfi(')||seen.has(m.cfi))continue;seen.add(m.cfi);marks.push({...m,book:b});}}
 return marks.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
}
function dashboardList(container,map,entries,keyOf,update){
 const keep=new Set();entries.forEach((entry,index)=>{const key=keyOf(entry);keep.add(key);let node=map.get(key);if(!node){node=dashboardNode('button');node.type='button';node.append(dashboardNode('strong',''),dashboardNode('span',''));node.setAttribute('data-dashboard-key',key);map.set(key,node);}update(node,entry);if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);});
 for(const [key,node] of map)if(!keep.has(key)){node.remove();map.delete(key);}
}
function dashboardRender(force=false){
 const host=document.getElementById('readingDashboard');if(!host)return;
 if(!force&&Date.now()<dashboardScrollUntil){clearTimeout(dashboardRenderTimer);dashboardRenderTimer=setTimeout(()=>dashboardRender(),Math.max(1,dashboardScrollUntil-Date.now()));return;}
 const rows=dashboardRows(),recent=rows.filter(b=>b.at>0||b.data.location).slice(0,6),last=recent[0],marks=dashboardVisibleMarks(rows),shortMarks=marks.slice(0,12);
 const signature=JSON.stringify([securityLocalOwner,rows.map(b=>[b.file,b.title,b.percent]),recent.map(b=>b.file),shortMarks.map(m=>[m.book.file,m.cfi,m.chapter,m.progress]),marks.length]);
 if(dashboardView?.host===host && signature===dashboardSignature)return;
 if(!dashboardView||dashboardView.host!==host){
  const section=dashboardNode('section',undefined,'readingDashboardSection');section.append(dashboardNode('h2','Your reading'));
  const practice=dashboardNode('button','Practice tests');practice.type='button';practice.onclick=()=>quizOpen();section.append(practice,dashboardNode('p','Saved on this device. Cloud progress refreshes when syncing is available.','dashboardHint'));
  const card=dashboardNode('div',undefined,'dashboardContinue'),title=dashboardNode('h3',''),percent=dashboardNode('p',''),resume=dashboardNode('button','Continue reading');resume.type='button';card.append(title,percent,resume);
  const empty=dashboardNode('p','Open a book to start your reading dashboard.','dashboardHint'),list=dashboardNode('div',undefined,'dashboardRecent'),markList=dashboardNode('div',undefined,'dashboardBookmarks'),note=dashboardNode('p','', 'dashboardHint');const recentCard=dashboardNode('details',undefined,'dashboardPanel dashboardDisclosure'),marksCard=dashboardNode('details',undefined,'dashboardPanel dashboardDisclosure');recentCard.open=false;marksCard.open=false;const recentSummary=dashboardNode('summary'),marksSummary=dashboardNode('summary');recentSummary.append(dashboardNode('h3','Recent books'));marksSummary.append(dashboardNode('h3','Bookmark shortcuts'));recentCard.append(recentSummary,list);marksCard.append(marksSummary,markList,note);section.append(card,empty,recentCard,marksCard);
  dashboardView={host,card,title,percent,resume,empty,list,markList,note,recent:new Map(),marks:new Map(),lastFile:''};resume.onclick=()=>dashboardOpen(dashboardView.lastFile);host.replaceChildren(section);
 }
 const view=dashboardView;view.lastFile=last?.file||'';view.card.hidden=!last;view.empty.hidden=!!last;if(last){dashboardText(view.title,last.title);dashboardText(view.percent,last.percent===null?'Saved position':last.percent+'% completed');}
 dashboardList(view.list,view.recent,recent,b=>b.file,(node,b)=>{node.className='dashboardRecentBook';dashboardText(node.children[0],b.title);dashboardText(node.children[1],b.percent===null?'Saved position':b.percent+'% completed');node.onclick=()=>dashboardOpen(b.file);});
 dashboardList(view.markList,view.marks,shortMarks,m=>m.book.file+'|'+m.cfi,(node,m)=>{dashboardText(node.children[0],m.book.title);dashboardText(node.children[1],(m.chapter||'Saved passage')+(dashboardPercent(m.progress)===null?'':' · '+dashboardPercent(m.progress)+'%'));node.onclick=()=>dashboardOpen(m.book.file,m.cfi);});
 dashboardText(view.note,marks.length?'Showing '+Math.min(12,marks.length)+' bookmark shortcuts. Open a book for its full bookmark list.':'No bookmarks yet. Save a bookmark while reading.');
 document.querySelectorAll('.bookCard').forEach(card=>{const b=rows.find(b=>b.file===card.dataset.file);if(!b)return;let n=card.querySelector('.dashboardBookProgress');if(!n){n=dashboardNode('div',undefined,'dashboardBookProgress');const text=dashboardNode('span',''),bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label',b.title+' reading progress');n.append(text,bar);card.append(n);}dashboardText(n.children[0],b.percent===null?'Not started':b.percent+'% completed');const bar=n.children[1];dashboardProgress(bar,b.percent);});
 dashboardSignature=signature;
}
function dashboardReset(){
 const changed=dashboardScope!==securityLocalOwner;dashboardGeneration++;dashboardScope=securityLocalOwner;dashboardCloudStarted=false;dashboardTarget=null;
 if(changed){clearTimeout(dashboardRenderTimer);dashboardRemoteMarks=[];dashboardView=null;dashboardSignature='';dashboardScrollUntil=0;}
 dashboardRender(changed);
}
async function dashboardRefreshCloud(){
 if(dashboardCloudStarted||!cloudReady||!cloudUser||!cloudDb||!navigator.onLine)return;
 dashboardCloudStarted=true;const generation=dashboardGeneration,owner=securityLocalOwner,uid=cloudUser.uid;
 const current=()=>generation===dashboardGeneration&&owner===securityLocalOwner&&cloudUser?.uid===uid&&cloudReady&&navigator.onLine;
 try{
  const col=cloudDb.collection('users').doc(uid);
  await Promise.all(BOOKS.map(b=>bookmarkSync(b.file)));if(!current())return;
  const [reading,marks]=await Promise.all([Promise.all(BOOKS.map(b=>col.collection('reading').doc(dashboardId(b.file)).get())),col.collection('bookmarks').limit(200).get()]);
  if(!current())return;
  reading.forEach((s,i)=>{const remote=s.exists?s.data():null,b=BOOKS[i],local=dashboardRead(dashboardDataKey(b.file),{});if(!remote||typeof remote.cfi!=='string'||!remote.cfi.startsWith('epubcfi(')||!(Number(remote.updatedAtMs)>Number(local.updatedAtMs||0))||(rendition&&selectedBookFile===b.file))return;
   try{localStorage.setItem(dashboardDataKey(b.file),JSON.stringify({...local,location:remote.cfi,progress:remote.progress,chapter:remote.chapter||'',updatedAtMs:remote.updatedAtMs}));}catch{}
  });
  dashboardRemoteMarks=[];marks.forEach(s=>{const m=s.data();if(m.deleted===true)return;if(BOOKS.some(b=>b.file===m.bookFile))dashboardRemoteMarks.push(m);});dashboardRender();
 }catch{if(current())dashboardCloudStarted=false; /* Keep local dashboard usable. */}
}
function dashboardUpdate(){if(dashboardScope!==securityLocalOwner)dashboardReset();dashboardRender();dashboardRefreshCloud();}
backBtn.addEventListener('click',()=>{dashboardTarget=null;dashboardCloudStarted=false;dashboardUpdate();});
document.querySelectorAll('.bookCard').forEach(card=>card.addEventListener('click',()=>{dashboardTarget=null;},true));
window.addEventListener('storage',dashboardUpdate);
window.addEventListener('online',()=>{dashboardCloudStarted=false;dashboardUpdate();});
dashboardUpdate();

const dashboardGrid=document.querySelector?.('.libraryGrid');
if(dashboardGrid)dashboardGrid.addEventListener('scroll',()=>{dashboardScrollUntil=Date.now()+180;clearTimeout(dashboardRenderTimer);dashboardRenderTimer=setTimeout(()=>dashboardRender(),180);},{passive:true});

// Refresh deletion records after returning from another device or browser tab.
window.addEventListener('focus',()=>{dashboardCloudStarted=false;dashboardUpdate();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){dashboardCloudStarted=false;dashboardUpdate();}});
