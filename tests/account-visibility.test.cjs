'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/security-ui.js'),'utf8'),html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
function setup(missing=[]){
 const ids=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],{hidden:false,textContent:'',value:'',addEventListener(){}}]));for(const id of missing)delete ids[id];
 const ctx={localStorage:{getItem:()=>null},cloudUser:{uid:'u',emailVerified:true,displayName:'Reader'},document:{getElementById:id=>ids[id]||null,activeElement:null},subscriptionRender(){},subscriptionCloudAllowed:()=>true,subscriptionSidebarRender(){},console};
 vm.createContext(ctx);vm.runInContext(source,ctx);vm.runInContext("securityProfile={displayName:'Reader',accountTier:'premium',accountStatus:'active'};securityClaims={};",ctx);
 return {ids,ctx,run:s=>vm.runInContext(s,ctx)};
}
test('ordinary verified users render using the actual account markup and hide verification controls',()=>{
 const s=setup();s.run('securityRender()');assert.equal(s.ids.administrationLink.hidden,true);assert.equal(s.ids.securityVerification.hidden,true);assert.equal(s.ids.myAccountPanel.hidden,false);assert.equal(s.ids.accountName.textContent,'Reader');
});
test('missing optional administration and panel controls cannot abort profile visibility rendering',()=>{
 for(const missing of [['administrationLink'],['myAccountPanel'],['securityVerification'],['administrationLink','myAccountPanel','securityVerification']]){const s=setup(missing);assert.doesNotThrow(()=>s.run('securityRender()'));assert.equal(s.ids.accountName.textContent,'Reader');if(s.ids.securityVerification)assert.equal(s.ids.securityVerification.hidden,true);}
});
test('administrator link and verification state continue to depend on trusted claims and verified Auth',()=>{
 const s=setup();s.run('securityClaims={promohubAdmin:true};securityRender()');assert.equal(s.ids.administrationLink.hidden,false);s.ctx.cloudUser.emailVerified=false;s.run('securityRender()');assert.equal(s.ids.administrationLink.hidden,true);assert.equal(s.ids.securityVerification.hidden,false);
});
