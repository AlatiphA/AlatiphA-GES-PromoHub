'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../security-ui.js'),'utf8');
function setup(){
 class Element {
  constructor(){this.children=[];this.hidden=false;this.dataset={};this.attributes={};this.textContent='';}
  append(...items){this.children.push(...items);}replaceChildren(){this.children=[];this.textContent='';}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}focus(){}
  querySelectorAll(){return this.children.filter(c=>c.tag==='button');}
 }
 const ids={};for(const id of ['myAccountPanel','securityAdmin','myAccountTab','administrationTab','securityRecordsTitle','securityPagination','securityNextPage','securityRecords','securitySummary'])ids[id]=new Element();
 const nav=['users','requests','audit'].map(action=>{const e=new Element();e.dataset.security=action;return e;});
 const context={cloudUser:{uid:'admin',emailVerified:true},securityClaims:{promohubAdmin:true},securityProfile:{accountStatus:'active'},securityEpoch:1,document:{getElementById:id=>ids[id],createElement:tag=>{const e=new Element();e.tag=tag;return e;},querySelector:()=>new Element(),querySelectorAll:()=>nav},securityMessage(){},securityWork:async work=>work(),confirm:()=>true};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('let securityCursor=null'),source.indexOf('const securityActions=')),context);
 return {context,ids,nav,run:code=>vm.runInContext(code,context)};
}
test('tabs switch panels and revoked admin access falls back to My Account',()=>{
 const s=setup();s.run("securitySelectTab('admin')");assert.equal(s.ids.myAccountPanel.hidden,true);assert.equal(s.ids.securityAdmin.hidden,false);assert.equal(s.ids.administrationTab.attributes['aria-selected'],'true');
 s.context.securityClaims={};s.run("securitySelectTab('admin')");assert.equal(s.ids.myAccountPanel.hidden,false);assert.equal(s.ids.securityAdmin.hidden,true);
});
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
test('account markup has accessible tabs and Next page label',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');assert.match(html,/role="tablist"/);assert.match(html,/id="myAccountPanel" role="tabpanel"/);assert.match(html,/id="securityAdmin" role="tabpanel"/);assert.match(html,/>Next page<\/button>/);assert.doesNotMatch(html,/Next users/);
});
