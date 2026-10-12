'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('reader controls stay together, preserve existing action IDs and have accessible back/profile controls',()=>{
 const html=read('index.html'),header=html.match(/<header>[\s\S]*?<\/header>/)[0];
 assert.match(header,/<div class="headerActions"[^>]*>[\s\S]*data-open-inbox[\s\S]*id="profileBtn"[\s\S]*<\/div>/);
 for(const id of ['backBtn','profileBtn','profileAvatar','libraryProfileBtn','libraryProfileAvatar','accountClose','faqCloseBtn'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(header,/aria-label="Back to Library"/);assert.match(header,/aria-label="Account"/);
 assert.match(html,/id="accountClose"[^>]*aria-label="Close account"/);
});
test('same back icon and current-window links are used across standalone app pages',()=>{
 const arrow='<path d="M19 12H5m7-7-7 7 7 7"/>';
 for(const file of ['index.html','admin.html','faq.html','user-guide.html'])assert.ok(read(file).includes(arrow),file);
 for(const file of ['admin.html','faq.html','user-guide.html'])assert.match(read(file),/class="navControl" href="\.\/index.html" aria-label="Back to PromoHub"/);
 const css=read('navigation.css');assert.match(css,/html\.faqEmbedded \.supportPageHeader\{display:none\}/);
});
test('FAQ sections precede the complete guide and shared navigation styling is available offline on every page',()=>{
 const faq=read('faq.html');assert.ok(faq.indexOf('Notifications &amp; messages')<faq.indexOf('class="userGuide"'));
 assert.ok(faq.indexOf('Support the Developer')<faq.indexOf('class="userGuide"'));
 for(const file of ['index.html','admin.html','faq.html','user-guide.html'])assert.match(read(file),/href="\.\/navigation.css"/);
 assert.ok(read('sw.js').includes("'./navigation.css'"));
});

test('each app page declares the shared browser favicon and its URL is precached',()=>{
 for(const f of ['index.html','admin.html','faq.html','user-guide.html'])assert.match(read(f),/rel="icon" type="image\/png" sizes="192x192" href=".\/icon-192.png"/);
 assert.ok(read('sw.js').includes("'./icon-192.png'"));
 const image=fs.readFileSync(path.join(__dirname,'../public/icon-192.png'));assert.equal(image.readUInt32BE(16),192);assert.equal(image.readUInt32BE(20),192);
});
