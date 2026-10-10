'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
test('Pages workflow validates first and publishes only public without the redirect',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/promohub-pages.yml'),'utf8');
 assert.match(workflow,/branches: \[main\]/);assert.match(workflow,/needs: validate-and-package/);assert.match(workflow,/run: npm test/);assert.match(workflow,/path: public/);
 assert.match(workflow,/pages: write/);assert.match(workflow,/id-token: write/);assert.ok(!fs.existsSync(path.join(root,'index.html')));
});
test('same public app and manifest work at the domain root and repository subpath',async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),prefix='/AlatiphA-GES-PromoHub/';
  const name=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):url.pathname.slice(1);
  const file=path.join(publicDir,name||'index.html');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  for(const prefix of ['/','/AlatiphA-GES-PromoHub/']){
   const base=origin+prefix,response=await fetch(base),html=await response.text();assert.equal(response.status,200);assert.match(html,/id="authScreen"/);assert.doesNotMatch(html,/Opening PromoHub at its current address/);
   for(const m of html.matchAll(/(?:src|href)="([^"#?]+)"/g)){
    const url=new URL(m[1],base);if(url.origin!==origin)continue;
    assert.ok(url.pathname.startsWith(prefix));assert.equal((await fetch(url)).status,200,url.href);
   }
   const manifest=await (await fetch(base+'manifest.json')).json();
   assert.ok(new URL(manifest.start_url,base).pathname.startsWith(prefix));assert.equal(new URL(manifest.scope,base).pathname,prefix);
   assert.equal((await fetch(new URL('./sw.js',base))).status,200);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
