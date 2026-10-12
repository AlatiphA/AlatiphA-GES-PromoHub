'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8'),html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
test('reader controls target only the reader footer even when the library and auth footer coexist',()=>{
 const reader=new Set(),library=new Set(),auth=new Set(),nodes={readerFooter:{classList:{add:v=>reader.add(v),remove:v=>reader.delete(v)}}};
 const init=source.slice(source.indexOf('const footer ='),source.indexOf('const leftZone ='));
 const start=source.indexOf('function hideFooter()'),end=source.indexOf('function hideControls()',start);
 const ctx={document:{getElementById:id=>nodes[id]}};vm.createContext(ctx);vm.runInContext(init+source.slice(start,end),ctx);vm.runInContext('hideFooter()',ctx);assert.equal(reader.has('hideControls'),true);assert.equal(library.size,0);assert.equal(auth.size,0);vm.runInContext('showFooter()',ctx);assert.equal(reader.size,0);
});
test('library footer stays outside the scrolling book list and uses the requested copyright',()=>{
 const last=html.indexOf('data-file="./library/eigala.epub"'),foot=html.indexOf('<div class="libraryFooter">'),reader=html.indexOf('id="readerApp"');assert.ok(last<foot&&foot<reader);assert.match(html.slice(foot,reader),/© All Rights Reserved · AlatiphA Multimedia/);assert.equal(html.includes('© 2026 AlatiphA'),false);assert.equal((html.match(/id="readerFooter"/g)||[]).length,1);
});
