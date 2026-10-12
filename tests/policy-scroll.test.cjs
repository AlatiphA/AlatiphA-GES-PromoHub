'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../public'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('login and sign-up have no duplicate appearance selector, while the account retains it',()=>{const h=read('index.html'),auth=h.slice(h.indexOf('<!-- AUTH SCREEN -->'),h.indexOf('<!-- ACCOUNT PANEL -->'));assert.equal(auth.includes('data-ui-theme-choice'),false);assert.equal((h.match(/data-ui-theme-choice/g)||[]).length,1);assert.equal(h.includes('id="libraryDayNightBtn"'),false);});
test('public policy pages load their own styling without reader scroll locks or gesture handlers',()=>{
 for(const file of ['privacy.html','terms.html']){const html=read(file),styles=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(styles,['./auth-pages.css']);assert.equal(html.includes('./app.js'),false);assert.equal(html.includes('./reader-sessions.js'),false);assert.ok(html.includes('class="legalPage"'));assert.ok(html.includes('class="legalFooter"'));}
});
test('support presents one linked email followed by linked telephone beneath the policy navigation',()=>{
 const h=read('index.html'),support=h.slice(h.indexOf('<section class="authSupport"'),h.indexOf('</section>',h.indexOf('<section class="authSupport"')));assert.ok(support.includes('<h3>Support</h3>'));assert.ok(support.indexOf('href="mailto:alatipha@ymail.com"')<support.indexOf('href="tel:+233243443688"'));assert.equal((support.match(/href="mailto:/g)||[]).length,1);const nav=h.slice(h.indexOf('<nav aria-label="Help and policies"'),h.indexOf('</nav>',h.indexOf('<nav aria-label="Help and policies"')));assert.equal(nav.includes('tel:'),false);
 for(const name of ['privacy.html','terms.html']){const html=read(name);assert.ok(html.includes('<h2>Support</h2>'));assert.ok(html.indexOf('href="mailto:')<html.indexOf('href="tel:'));}
});
