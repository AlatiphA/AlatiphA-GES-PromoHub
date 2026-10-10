'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
test('Hosting serves only public while Functions and rules retain their root paths',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
 assert.equal(config.hosting.public,'public');assert.equal(config.functions.source,'functions');assert.equal(config.firestore.rules,'firestore.rules');
 assert.ok(config.hosting.headers.some(h=>h.source==='sw.js'&&h.headers.some(v=>v.key==='Cache-Control'&&v.value==='no-cache')));
 for(const name of ['index.html','app.js','sw.js','faq.html','user-guide.html','library','fonts']){assert.ok(fs.existsSync(path.join(publicDir,name)));assert.ok(!fs.existsSync(path.join(root,name)));}
 for(const name of ['functions','tests','firebase.json','firestore.rules','.firebaserc'])assert.ok(!fs.existsSync(path.join(publicDir,name)));
});
test('service-worker local precache paths still exist at the same deployed URLs',()=>{
 const sw=fs.readFileSync(path.join(publicDir,'sw.js'),'utf8'),core=sw.match(/const CORE=\[([^\]]+)\]/)[1];
 for(const m of core.matchAll(/'([^']+)'/g))assert.ok(fs.existsSync(path.join(publicDir,m[1])),m[1]);
 for(const name of ['gespasco','mat1','mat2','etmala','nfatfges','eigala'])assert.ok(fs.existsSync(path.join(publicDir,'library',name+'.epub')));
});
test('HTML scripts, styles and manifest icons resolve inside Hosting root',()=>{
 for(const name of ['index.html','faq.html','user-guide.html']){
 const html=fs.readFileSync(path.join(publicDir,name),'utf8');
 for(const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)){
 const url=m[1];if(/^(?:https?:|mailto:|tel:|data:)/.test(url))continue;
 assert.ok(fs.existsSync(path.join(publicDir,url)),name+' references missing '+url);
 }
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(publicDir,'manifest.json'),'utf8'));
 for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(publicDir,icon.src)));
});
