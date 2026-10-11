'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync(require.resolve('../public/admin.css'),'utf8'),html=fs.readFileSync(require.resolve('../public/admin.html'),'utf8');
test('administration explicitly releases inherited fixed reader bounds and document overflow',()=>{
 assert.match(html,/<html[^>]+class="adminRoot"/);
 const root=css.match(/html\.adminRoot\{([^}]+)\}/)[1],body=css.match(/body\.adminPage\{([^}]+)\}/)[1],main=css.match(/\.adminPage main\.adminShell\{([^}]+)\}/)[1];
 assert.match(root,/overflow-y:auto/);assert.match(body,/height:auto/);assert.match(body,/touch-action:pan-y/);assert.match(main,/position:static/);assert.match(main,/inset:auto/);assert.match(main,/height:auto/);assert.match(main,/overflow:visible/);
});
test('user cards switch from desktop grid to one column and pagination remains in document flow',()=>{
 assert.match(css,/#securityRecords\[data-view="users"\]\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1000px\)/);assert.match(css,/@media\(max-width:640px\)[\s\S]+#securityRecords\[data-view="users"\]\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#securityPagination #securityPageLabel\{flex:1 0 100%/);
 assert.ok(html.indexOf('id="securityPagination"')>html.indexOf('id="securityRecords"'));
});
