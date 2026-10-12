'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('login support links resolve on both subpath and root hosting and preserve authentication action IDs',()=>{
 const html=read('index.html'),auth=html.slice(html.indexOf('<!-- AUTH SCREEN -->'),html.indexOf('<!-- ACCOUNT PANEL -->'));
 for(const file of ['faq.html','privacy.html','terms.html']){assert.ok(auth.includes('href="./'+file+'"'));assert.ok(fs.existsSync(path.join(root,file)));assert.equal(new URL('./'+file,'https://alatipha.github.io/AlatiphA-GES-PromoHub/index.html').pathname,'/AlatiphA-GES-PromoHub/'+file);}
 assert.ok(auth.includes('href="tel:+233243443688"'));assert.ok(auth.includes('href="mailto:alatipha@ymail.com"'));assert.ok(auth.includes('Start 7-day guest trial'));assert.equal(auth.includes('target="_blank"'),false);
 for(const id of ['authEmail','authPassword','authPasswordToggle','authOfflineBtn','googleSignInBtn','authPrimaryBtn'])assert.equal((auth.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
});
test('policy pages are public, describe actual storage/payment boundaries, and are precached',()=>{
 for(const file of ['privacy.html','terms.html']){const html=read(file);assert.ok(html.includes('class="legalPage"'));assert.ok(html.includes('href="./index.html"'));assert.ok(html.includes('0243443688'));assert.ok(html.includes('alatipha@ymail.com'));assert.equal(html.includes('src="./app.js"'),false);assert.ok(read('sw.js').includes('./'+file));}
 const privacy=read('privacy.html'),terms=read('terms.html');assert.ok(privacy.includes('Payment ledgers, audit records and a deletion marker'));assert.ok(privacy.includes('quiz results do not currently synchronise'));assert.ok(privacy.includes('Data Protection Act, 2012 (Act 843)'));assert.ok(terms.includes('not automatically debit or renew'));assert.ok(terms.includes('does not restart an existing trial'));
});
