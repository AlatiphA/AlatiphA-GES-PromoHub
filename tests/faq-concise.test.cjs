'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=f=>fs.readFileSync(require.resolve('../public/'+f),'utf8');
test('reading and practice FAQs contain short expandable answers and direct guide links',()=>{
 const h=read('faq.html');for(const [title,anchor,count] of [['Reading dashboard','guide-reading-dashboard',3],['Practice tests','guide-practice-tests',4]]){const start=h.indexOf('<h2 class="faqSectionTitle">'+title+'</h2>'),s=h.slice(start,h.indexOf('</section>',start));const answers=[...s.matchAll(/<div class="faqAnswer">([^<]+)<\/div>/g)];assert.equal(answers.length,count);for(const a of answers)assert.ok(a[1].split(/\s+/).length<=35);assert.equal((s.match(/aria-expanded="false"/g)||[]).length,count);assert.ok(s.includes('./user-guide.html#'+anchor));assert.equal(s.includes('200 cloud bookmarks'),false);}
});
test('both complete guides retain detailed limits and sources outside the concise FAQ blocks',()=>{
 for(const name of ['faq.html','user-guide.html']){const h=read(name);for(const anchor of ['guide-reading-dashboard','guide-practice-tests']){const start=h.indexOf('<section id="'+anchor+'">');assert.ok(start>h.indexOf('id="user-guide"'));assert.ok(h.includes('href="#'+anchor+'"'));}assert.ok(h.includes('200 cloud bookmarks'));assert.ok(h.includes('1 to 100 multiple-choice questions'));assert.ok(h.includes('0243443688'));assert.ok(h.includes('Optional support'));}
});
