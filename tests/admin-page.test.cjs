'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../public/admin-page.js'),'utf8'),shared=fs.readFileSync(require.resolve('../public/admin-ui.js'),'utf8');
function setup(){
 const ids={},el=()=>({hidden:false,textContent:'',value:'',children:[],addEventListener(){},setAttribute(){},replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}});
 const context={clearTimeout(){},document:{getElementById:id=>ids[id]||(ids[id]=el()),querySelectorAll:()=>[],createElement:el},firebase:{apps:[{}],auth:()=>({onAuthStateChanged(){}}),firestore:()=>({doc:()=>({get:async()=>({data:()=>({accountStatus:'active',displayName:'Owner'})}),onSnapshot:()=>()=>{}})})}};
 vm.createContext(context);vm.runInContext(shared+code,context);vm.runInContext('securityUsers=async()=>{globalThis.userLoads=(globalThis.userLoads||0)+1;}',context);
 return {context,ids,run:c=>vm.runInContext(c,context)};
}
const user=(admin=true)=>({uid:'owner',emailVerified:true,email:'owner@example.test',getIdTokenResult:async()=>({claims:{promohubAdmin:admin}})});
test('standalone admin denies signed-out and ordinary users without loading directory',async()=>{
 const s=setup();await s.run('adminAuthChanged(null)');assert.equal(s.ids.securityAdmin.hidden,true);assert.match(s.ids.adminAccess.textContent,/Sign in/);
 s.context.user=user(false);await s.run('adminAuthChanged(user)');assert.equal(s.ids.securityAdmin.hidden,true);assert.equal(s.context.userLoads,undefined);
});
test('verified active administrator loads directory and sign-out clears records',async()=>{
 const s=setup();s.context.user=user();await s.run('adminAuthChanged(user)');assert.equal(s.ids.securityAdmin.hidden,false);assert.equal(s.context.userLoads,1);assert.match(s.ids.adminIdentity.textContent,/owner@example.test/);
 s.ids.securityRecords.children=[{}];await s.run('adminAuthChanged(null)');assert.equal(s.ids.securityRecords.children.length,0);assert.equal(s.ids.securityAdmin.hidden,true);
});
test('late credentials from previous account cannot grant access after sign-out',async()=>{
 const s=setup();let resolve;s.context.user={...user(),getIdTokenResult:()=>new Promise(r=>resolve=r)};const pending=s.run('adminAuthChanged(user)');await s.run('adminAuthChanged(null)');resolve({claims:{promohubAdmin:true}});await pending;assert.equal(s.ids.securityAdmin.hidden,true);assert.equal(s.context.userLoads,undefined);
});
test('administration uses relative assets without loading reader or claiming sessions',()=>{
 const html=fs.readFileSync(require.resolve('../public/admin.html'),'utf8'),sw=fs.readFileSync(require.resolve('../public/sw.js'),'utf8');assert.match(html,/href="\.\/index.html"/);assert.match(html,/src="\.\/admin-ui.js"/);assert.doesNotMatch(html,/src="\.\/(?:app|reader-sessions|subscription-ui)\.js"/);for(const asset of ['admin.html','admin.css','admin-ui.js','admin-page.js'])assert.ok(sw.includes(asset));
});
