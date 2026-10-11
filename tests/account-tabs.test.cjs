'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/admin-ui.js'),'utf8');
function setup(){
 class Element {
  constructor(){this.children=[];this.hidden=false;this.dataset={};this.attributes={};this.textContent='';}
  append(...items){this.children.push(...items);}replaceChildren(){this.children=[];this.textContent='';}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}focus(){}
  querySelectorAll(){return this.children.filter(c=>c.tag==='button');}
 }
 const ids={};for(const id of ['myAccountPanel','securityAdmin','myAccountTab','administrationTab','securityRecordsTitle','securityPagination','securityNextPage','securityRecords','securitySummary','securityUserFilters','securityUserSearch','securityUserSearchField','securityUserTier','securityUserStatus','securityUserMode','securityPreviousPage','securityPageLabel'])ids[id]=new Element();
 const nav=['users','requests','audit'].map(action=>{const e=new Element();e.dataset.security=action;return e;});
 const context={cloudUser:{uid:'admin',emailVerified:true},securityClaims:{promohubAdmin:true},securityProfile:{accountStatus:'active'},securityEpoch:1,document:{getElementById:id=>ids[id],createElement:tag=>{const e=new Element();e.tag=tag;return e;},querySelector:()=>new Element(),querySelectorAll:()=>nav},securityMessage(){},securityWork:async work=>work(),confirm:()=>true};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,ids,nav,run:code=>vm.runInContext(code,context)};
}
test('identity uses text nodes, names and emails; email-only and missing profiles never show UIDs',()=>{
 const s=setup();const row=s.ids.securityRecords;s.context.row=row;
 s.run("securityIdentity(row,{displayName:'<img onerror=alert(1)>',email:'u@example.test',uid:'RAW_UID'})");
 assert.equal(row.children[0].children[0].textContent,'<img onerror=alert(1)>');assert.equal(row.children[0].children[1].textContent,'u@example.test');
 row.replaceChildren();s.run("securityIdentity(row,{email:'u@example.test',uid:'RAW_UID'})");assert.equal(row.children[0].children.length,1);
 assert.equal(s.run("securityAccountLabel({uid:'RAW_UID'})"),'Account unavailable');
});
test('user pagination enables Next page only when a cursor exists and hides it in other views',async()=>{
 const s=setup();let calls=0;s.context.securityCall=async name=>name==='getPromoHubAdminSummary'?{users:2,premium:0,pending:0}:{users:[{uid:'u',displayName:'Reader',email:'reader@example.test'}],cursor:++calls===1?'next':null};
 await s.run('securityUsers()');assert.equal(s.ids.securityNextPage.disabled,false);assert.equal(s.ids.securityPagination.hidden,false);
 await s.run('securityUsers(true)');assert.equal(s.ids.securityNextPage.disabled,true);
 s.run("securityAdminStart('audit','Recent audit')");assert.equal(s.ids.securityPagination.hidden,true);
});
test('delayed admin result is discarded after an account switch',async()=>{
 const s=setup();let resolve;s.context.securityCall=()=>new Promise(r=>resolve=r);const pending=s.run('securityUsers()');s.context.securityEpoch++;s.run('securityResetAdmin()');resolve({users:[{uid:'u',displayName:'Old account'}],cursor:null});await pending;assert.equal(s.ids.securityRecords.children.length,0);
});
test('Premium and audit records show enriched identities and no raw identifiers',async()=>{
 const s=setup();s.context.securityCall=async()=>({records:[{uid:'RAW_UID',account:{displayName:'Reader',email:'reader@example.test',available:true},actorAccount:{displayName:'Owner',email:'owner@example.test'},action:'premium.approved'}]});
 await s.run("securityRecords('requests')");let row=s.ids.securityRecords.children[0];assert.equal(row.children[0].children[0].textContent,'Reader');assert.equal(row.children[1].children[0].textContent,'Approve');
 await s.run("securityRecords('audit')");row=s.ids.securityRecords.children[0];assert.equal(row.children[1].children[0].textContent,'Account: Reader');assert.equal(row.children[2].children[0].textContent,'By: Owner');
});
test('administration moves to a dedicated page and pagination keeps clear labels',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'),admin=fs.readFileSync(require.resolve('../public/admin.html'),'utf8');assert.match(html,/href=".\/admin.html" target="_blank"/);assert.doesNotMatch(html,/id="securityAdmin"/);assert.match(admin,/>Next page<\/button>/);assert.doesNotMatch(admin,/Next users/);
});

test('administrator saves selected mode for correct named user and stale views do not mutate',async()=>{const s=setup();let request;s.context.securityCall=async(name,data)=>{if(name==='setPromoHubReadingMode'){request={name,data};return {ok:true};}if(name==='getPromoHubAdminSummary')return {users:1,premium:1,pending:0};return {users:[{uid:'u',displayName:'Reader',readingAccessMode:'offline'}],cursor:null};};await s.run('securityUsers()');const row=s.ids.securityRecords.children[0],field=row.children[2].children[1],select=field.children[0].children[0],save=field.children[1];assert.equal(select.value,'offline');select.value='strict';await save.onclick();assert.equal(request.name,'setPromoHubReadingMode');assert.equal(request.data.uid,'u');assert.equal(request.data.mode,'strict');request=null;s.context.securityEpoch++;await save.onclick();assert.equal(request,null);});

test('search and filters are sent to server and previous page reuses exact earlier cursor',async()=>{const s=setup();const requests=[];s.context.securityCall=async(name,data)=>{if(name==='getPromoHubAdminSummary')return {users:100,premium:10,pending:0};requests.push(data);return {users:[{uid:'u',displayName:'Reader'}],cursor:requests.length<3?{uid:'u'+requests.length}:null};};s.ids.securityUserSearch.value='ZA';s.ids.securityUserSearchField.value='email';s.ids.securityUserTier.value='premium';s.ids.securityUserStatus.value='active';s.ids.securityUserMode.value='strict';await s.run('securityUsers()');assert.equal(requests[0].search,'ZA');assert.equal(requests[0].searchField,'email');assert.equal(requests[0].tier,'premium');assert.equal(s.ids.securityPreviousPage.disabled,true);assert.equal(s.ids.securityRecords.children[0].children[2].tag,'details');await s.run('securityUsers(true)');assert.equal(requests[1].cursor.uid,'u1');assert.equal(s.ids.securityPreviousPage.disabled,false);await s.run("securityUsers('previous')");assert.equal(requests[2].cursor,undefined);assert.equal(s.ids.securityPreviousPage.disabled,true);assert.match(s.ids.securityPageLabel.textContent,/Page 1/);});
test('directory preparation processes bounded batches before showing searched results',async()=>{const s=setup();let lists=0,builds=0;s.context.securityCall=async(name,data)=>{if(name==='getPromoHubAdminSummary')return {};if(name==='preparePromoHubUserDirectory')return {processed:++builds===1?100:2,cursor:builds===1?'u100':null};return ++lists===1?{users:[],needsDirectory:true}:{users:[{uid:'u',displayName:'Indexed'}],cursor:null};};await s.run('securityUsers()');assert.equal(builds,2);assert.equal(lists,2);assert.equal(s.ids.securityRecords.children.length,1);});
test('new search returns to first page and non-user views hide search tools',async()=>{const s=setup();s.context.securityCall=async name=>name==='getPromoHubAdminSummary'?{}:{users:[],cursor:'next'};await s.run('securityUsers()');await s.run('securityUsers(true)');s.ids.securityUserSearch.value='new';await s.run('securityUsers()');assert.match(s.ids.securityPageLabel.textContent,/Page 1/);s.run("securityAdminStart('audit','Recent audit')");assert.equal(s.ids.securityUserFilters.hidden,true);});
