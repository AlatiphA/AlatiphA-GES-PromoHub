'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../public'),faq=fs.readFileSync(path.join(root,'faq.html'),'utf8');
function harness(clipboard){
 const status={textContent:''},copy={addEventListener(_,fn){this.click=fn;}};
 const questions=[0,1].map(()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(_,fn){this.click=fn;}}));
 const items=questions.map(q=>{const set=new Set();return {classList:{contains:k=>set.has(k),remove:k=>set.delete(k),add:k=>set.add(k)},querySelector:()=>q};});
 questions.forEach((q,i)=>q.closest=()=>items[i]);
 const document={querySelectorAll:s=>s==='.faqQuestion'?questions:items,getElementById:id=>id==='copyBtn'?copy:status};
 const scripts=[...faq.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 const main=scripts.find(s=>s.includes('querySelectorAll(".faqQuestion")'));
 assert.ok(main,'FAQ interaction script exists');
 vm.runInNewContext(main,{document,navigator:{clipboard}});
 return {status,copy,questions,items};
}
test('FAQ support number copies and clipboard failure gives a usable fallback',async()=>{
 let copied;const good=harness({writeText:async v=>{copied=v;}});await good.copy.click();assert.equal(copied,'0243443688');assert.equal(good.status.textContent,'Number copied.');
 const failed=harness({writeText:async()=>{throw Error('denied');}});await failed.copy.click();assert.match(failed.status.textContent,/0243443688/);
 const unavailable=harness(undefined);await unavailable.copy.click();assert.match(unavailable.status.textContent,/0243443688/);
});
test('FAQ accordion updates expanded state and closes the earlier question',()=>{
 const h=harness();h.questions[0].click();assert.equal(h.questions[0].attrs['aria-expanded'],'true');
 h.questions[1].click();assert.equal(h.questions[0].attrs['aria-expanded'],'false');assert.equal(h.questions[1].attrs['aria-expanded'],'true');
 h.questions[1].click();assert.equal(h.questions[1].attrs['aria-expanded'],'false');
});
test('complete guide links resolve and optional support remains separate from subscription activation',()=>{
 for(const file of ['faq.html','user-guide.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,file+' duplicate IDs');
 for(const link of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(link[1]),file+' missing '+link[1]);
 assert.match(html,/7-day trial/);for(const price of ['GH₵20','GH₵50','GH₵80','GH₵100'])assert.ok(html.includes(price));
 assert.match(html,/Optional support/);assert.match(html,/0243443688/);assert.match(html,/separate from/);
 }
 assert.ok(faq.indexOf('id="user-guide"')>faq.indexOf('Support the Developer'));
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert.match(sw,/\.\/user-guide\.html/);
});
