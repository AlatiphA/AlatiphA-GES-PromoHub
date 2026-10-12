'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/admin-overview.js'),'utf8');
function setup(){
 class Element{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.events={};this.value='';this.hidden=false;}append(...xs){this.children.push(...xs);if(this.tag==='select'&&!this.value)this.value=xs[0]?.value||'';}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(k,f){this.events[k]=f;}remove(){}click(){this.events.click?.();}}
 const host=new Element('host'),summary=new Element('p'),downloads=[];let current=true,gen=0;
 const report={asOfMs:Date.UTC(2026,9,12,8),monthStartMs:Date.UTC(2026,9,1),summary:{activeSubscriptions:2,expiringSubscriptions:1,pendingPayments:3,verifiedPayments:4,verifiedTotalGhs:150,verifiedMonthPayments:2,verifiedMonthTotalGhs:70,invalidLedgerRecords:0},expiring:[],pending:[],verified:[]};
 const ctx={securityIsAdmin:()=>current,adminCancelSearch(){},securityMessage(){},securityAdminStart:()=>({host,gen:++gen}),securityAdminCurrent:s=>current&&s.gen===gen,securityCall:async()=>report,document:{createElement:tag=>new Element(tag),getElementById:()=>summary,body:new Element('body')},Date,Blob,URL,setTimeout};
 vm.createContext(ctx);vm.runInContext(source,ctx);vm.runInContext('overviewDownload=(name,rows)=>capture(name,rows)',Object.assign(ctx,{capture:(name,rows)=>downloads.push({name,rows})}));
 const nodes=()=>{const out=[];function walk(e){out.push(e);e.children.forEach(walk);}walk(host);return out;};
 return {ctx,host,summary,downloads,report,nodes,run:s=>vm.runInContext(s,ctx),revoke:()=>current=false};
}
test('CSV quotes cells, preserves Unicode and neutralizes spreadsheet formula prefixes',()=>{
 const s=setup();const csv=s.run(`overviewCsv([['Name','Email'],['=HYPERLINK("https://bad")','\t@formula'],['Abdul-Latif','name@example.test']])`);assert.equal(csv.charCodeAt(0),0xfeff);assert.ok(csv.includes('"\'=HYPERLINK(""https://bad"")"'));assert.ok(csv.includes("'\t@formula"));assert.ok(csv.includes('Abdul-Latif'));assert.ok(csv.endsWith('\r\n'));
});
test('overview renders labelled cards and read-only exports with no payment mutations',async()=>{
 const s=setup();await s.run('adminOverview()');assert.ok(s.nodes().some(e=>e.textContent==='Active paid subscriptions'));assert.ok(s.nodes().some(e=>e.textContent==='Verified total, all time'));assert.match(s.summary.textContent,/read-only/);await s.nodes().find(e=>e.tag==='button'&&e.textContent==='Overview summary').events.click();assert.equal(s.downloads.length,1);assert.match(s.downloads[0].name,/promohub-summary/);
});
test('verified CSV follows pagination through empty pages and keeps names rather than UIDs',async()=>{
 const s=setup();await s.run('adminOverview()');let calls=0;s.ctx.securityCall=async(name,input)=>{assert.equal(name,'getPromoHubAdminExport');assert.equal(input.kind,'verified');return ++calls===1?{rows:[],cursor:'next'}:{rows:[{name:'Reader',email:'reader@example.test',plan:'1 month',amountGhs:20,transactionId:'TX123456',approvedAtMs:s.report.asOfMs,approvedByName:'Owner',approvedByEmail:'owner@example.test'}],cursor:null};};
 await s.nodes().find(e=>e.tag==='button'&&e.textContent==='Verified payments').events.click();assert.equal(calls,2);assert.equal(s.downloads.length,1);assert.equal(s.downloads[0].rows[1][0],'Reader');assert.equal(s.downloads[0].rows[1][4],'TX123456');
});
test('late overview results after account change are discarded and reset clears retained report data',async()=>{
 const s=setup();let resolve;s.ctx.securityCall=()=>new Promise(r=>resolve=r);const pending=s.run('adminOverview()');s.revoke();s.run('adminOverviewReset()');resolve(s.report);await pending;assert.equal(s.host.children.length,0);assert.equal(s.run('adminOverviewReport'),null);
});
test('revocation during an export prevents file creation even after a server response arrives',async()=>{
 const s=setup();await s.run('adminOverview()');let resolve;s.ctx.securityCall=()=>new Promise(r=>resolve=r);const pending=s.nodes().find(e=>e.tag==='button'&&e.textContent==='Pending payments').events.click();s.revoke();s.run('adminOverviewReset()');resolve({rows:[{name:'Private'}],cursor:null});await pending;assert.equal(s.downloads.length,0);
});

test('cancelling a paginated export discards its buffered rows instead of downloading a partial file',async()=>{
 const s=setup();await s.run('adminOverview()');let resolve;s.ctx.securityCall=()=>new Promise(r=>resolve=r);const pending=s.nodes().find(e=>e.tag==='button'&&e.textContent==='Active subscriptions').events.click();s.nodes().find(e=>e.tag==='button'&&e.textContent==='Cancel export').events.click();resolve({rows:[{name:'Reader'}],cursor:null});await pending;assert.equal(s.downloads.length,0);assert.ok(s.nodes().some(e=>e.textContent==='Export cancelled. No file downloaded.'));
});
