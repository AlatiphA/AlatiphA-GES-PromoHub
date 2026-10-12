'use strict';
/* Existing account-scoped stores remain authoritative. No new cloud writes. */
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
function dashboardRender(){
 const host=document.getElementById('readingDashboard');if(!host)return;
 host.replaceChildren();const rows=dashboardRows(),recent=rows.filter(b=>b.at>0||b.data.location),last=recent[0];
 const section=dashboardNode('section',undefined,'readingDashboardSection');section.append(dashboardNode('h2','Your reading'));
 section.append(dashboardNode('p','Saved on this device. Cloud progress refreshes when syncing is available.','dashboardHint'));
 if(last){const card=dashboardNode('div',undefined,'dashboardContinue');card.append(dashboardNode('h3',last.title));
  card.append(dashboardNode('p',last.percent===null?'Saved position':last.percent+'% completed'));
  const btn=dashboardNode('button','Continue reading');btn.type='button';btn.onclick=()=>dashboardOpen(last.file);card.append(btn);section.append(card);
 }else section.append(dashboardNode('p','Open a book to start your reading dashboard.','dashboardHint'));
 section.append(dashboardNode('h3','Recent books'));const list=dashboardNode('div',undefined,'dashboardRecent');
 recent.slice(0,6).forEach(b=>{const btn=dashboardNode('button',undefined,'dashboardRecentBook');btn.type='button';btn.append(dashboardNode('strong',b.title),dashboardNode('span',b.percent===null?'Saved position':b.percent+'% completed'));btn.onclick=()=>dashboardOpen(b.file);list.append(btn);});section.append(list);
 section.append(dashboardNode('h3','Bookmark shortcuts'));const marks=[];
 for(const b of rows){const seen=new Set();for(const m of [...b.marks,...dashboardRemoteMarks.filter(m=>m.bookFile===b.file)]){if(typeof m.cfi!=='string'||!m.cfi.startsWith('epubcfi(')||seen.has(m.cfi))continue;seen.add(m.cfi);marks.push({...m,book:b});}}
 marks.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
 const markList=dashboardNode('div',undefined,'dashboardBookmarks');marks.slice(0,12).forEach(m=>{const btn=dashboardNode('button');btn.type='button';btn.append(dashboardNode('strong',m.book.title),dashboardNode('span',(m.chapter||'Saved passage')+(dashboardPercent(m.progress)===null?'':' · '+dashboardPercent(m.progress)+'%')));btn.onclick=()=>dashboardOpen(m.book.file,m.cfi);markList.append(btn);});section.append(markList);
 section.append(dashboardNode('p',marks.length?'Showing '+Math.min(12,marks.length)+' bookmark shortcuts. Open a book for its full bookmark list.':'No bookmarks yet. Save a bookmark while reading.','dashboardHint'));
 host.append(section);
 document.querySelectorAll('.bookCard').forEach(card=>{let n=card.querySelector('.dashboardBookProgress');if(!n){n=dashboardNode('div',undefined,'dashboardBookProgress');card.append(n);}const b=rows.find(b=>b.file===card.dataset.file);if(!b)return;n.replaceChildren(dashboardNode('span',b.percent===null?'Not started':b.percent+'% completed'));if(b.percent!==null){const bar=document.createElement('progress');bar.max=100;bar.value=b.percent;bar.setAttribute('aria-label',b.title+' reading progress');n.append(bar);}});
}
function dashboardReset(){dashboardGeneration++;dashboardScope=securityLocalOwner;dashboardCloudStarted=false;dashboardRemoteMarks=[];dashboardTarget=null;dashboardRender();}
async function dashboardRefreshCloud(){
 if(dashboardCloudStarted||!cloudReady||!cloudUser||!cloudDb||!navigator.onLine)return;
 dashboardCloudStarted=true;const generation=dashboardGeneration,owner=securityLocalOwner,uid=cloudUser.uid;
 const current=()=>generation===dashboardGeneration&&owner===securityLocalOwner&&cloudUser?.uid===uid&&cloudReady&&navigator.onLine;
 try{
  const col=cloudDb.collection('users').doc(uid);
  const [reading,marks]=await Promise.all([Promise.all(BOOKS.map(b=>col.collection('reading').doc(dashboardId(b.file)).get())),col.collection('bookmarks').limit(200).get()]);
  if(!current())return;
  reading.forEach((s,i)=>{const remote=s.exists?s.data():null,b=BOOKS[i],local=dashboardRead(dashboardDataKey(b.file),{});if(!remote||typeof remote.cfi!=='string'||!remote.cfi.startsWith('epubcfi(')||!(Number(remote.updatedAtMs)>Number(local.updatedAtMs||0))||(rendition&&selectedBookFile===b.file))return;
   try{localStorage.setItem(dashboardDataKey(b.file),JSON.stringify({...local,location:remote.cfi,progress:remote.progress,chapter:remote.chapter||'',updatedAtMs:remote.updatedAtMs}));}catch{}
  });
  dashboardRemoteMarks=[];marks.forEach(s=>{const m=s.data();if(BOOKS.some(b=>b.file===m.bookFile))dashboardRemoteMarks.push(m);});dashboardRender();
 }catch{if(current())dashboardCloudStarted=false; /* Keep local dashboard usable. */}
}
function dashboardUpdate(){if(dashboardScope!==securityLocalOwner)dashboardReset();dashboardRender();dashboardRefreshCloud();}
backBtn.addEventListener('click',()=>{dashboardTarget=null;dashboardCloudStarted=false;dashboardUpdate();});
document.querySelectorAll('.bookCard').forEach(card=>card.addEventListener('click',()=>{dashboardTarget=null;},true));
window.addEventListener('storage',dashboardUpdate);
window.addEventListener('online',()=>{dashboardCloudStarted=false;dashboardUpdate();});
dashboardUpdate();
