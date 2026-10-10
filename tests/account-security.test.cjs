'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../account-security.js'),'utf8');
function client(){
 const calls=[],elements={},user={uid:'u',email:'u@example.test',providerData:[{providerId:'password'}],async reauthenticateWithCredential(c){calls.push(['reauth',c]);},async getIdToken(){calls.push(['token']);},async updatePassword(p){calls.push(['password',p]);},async verifyBeforeUpdateEmail(e){calls.push(['email',e]);},async reload(){calls.push(['reload']);}};
 const scope={securityEpoch:1,cloudUser:user,cloudAuth:{currentUser:user},securityProfile:{accountStatus:'active'},navigator:{onLine:true},firebase:{auth:{EmailAuthProvider:{credential:(email,password)=>({email,password})}}},location:{origin:'https://example.test',search:''},URLSearchParams,document:{getElementById:id=>elements[id]||={textContent:'',value:'',addEventListener(){},open:false},querySelectorAll:()=>[]},securityCall:async(name,data)=>{calls.push([name,data]);return name==='preparePromoHubLoginEmail'?{newEmail:data.newEmail}:{email:'new@example.test',pendingEmail:''};},securitySelectTab(){},accountPanel:{classList:{add(){}}},Date,Number,String};
 vm.createContext(scope);vm.runInContext(source,scope);return {scope,user,calls,elements};
}
test('password changes require matching new passwords and current-password reauthentication',async()=>{
 const c=client();await assert.rejects(c.scope.changePromoHubPassword(c.user,'old123','new123','other1'),/same new/);assert.equal(c.calls.length,0);
 await c.scope.changePromoHubPassword(c.user,'old123','new123','new123');assert.deepEqual(c.calls.map(c=>c[0]),['reauth','token','password']);
});
test('offline and Google-only credential changes are blocked before Auth mutations',async()=>{
 const c=client();c.scope.navigator.onLine=false;await assert.rejects(c.scope.changePromoHubPassword(c.user,'old123','new123','new123'),/internet/);assert.equal(c.calls.length,0);
 c.scope.navigator.onLine=true;c.user.providerData=[{providerId:'google.com'}];await assert.rejects(c.scope.changePromoHubPassword(c.user,'old123','new123','new123'),/Google-only/);assert.equal(c.calls.length,0);
});
test('account switching during reauthentication prevents a password update',async()=>{
 const c=client();c.user.reauthenticateWithCredential=async()=>{c.scope.securityEpoch++;};await assert.rejects(c.scope.changePromoHubPassword(c.user,'old123','new123','new123'),/account changed/);assert.ok(!c.calls.some(c=>c[0]==='password'));
});
test('email change uses verification-first Auth flow and sends no passwords to callable backend',async()=>{
 const c=client();await c.scope.requestPromoHubLoginEmail(c.user,'old123',' NEW@example.test ');
 const call=c.calls.find(c=>c[0]==='preparePromoHubLoginEmail');assert.equal(call[1].newEmail,'new@example.test');assert.deepEqual(Object.keys(call[1]),['newEmail']);assert.equal(c.calls.at(-1)[0],'email');assert.equal(c.user.email,'u@example.test');
});
test('switching accounts during email preparation prevents sending the verification link',async()=>{
 const c=client();c.scope.securityCall=async()=>{c.scope.securityEpoch++;return {newEmail:'new@example.test'};};await assert.rejects(c.scope.requestPromoHubLoginEmail(c.user,'old123','new@example.test'),/account changed/);assert.ok(!c.calls.some(c=>c[0]==='email'));
});
test('failed operations clear password fields and release the busy guard',async()=>{
 const c=client(),field={value:'secret'};c.scope.document.querySelectorAll=q=>q.includes('type="password"')?[field]:[];
 await c.scope.accountSecurityPerform(async()=>{throw Error('Failed');});assert.equal(field.value,'');assert.equal(c.elements.accountSecurityStatus.textContent,'Failed');
 await c.scope.accountSecurityPerform(async()=> 'Done');assert.equal(c.elements.accountSecurityStatus.textContent,'Done');
});
function backend(){
 const data=new Map([['users/u',{email:'u@example.test',accountStatus:'active',accountTier:'premium',subscriptionEndsAtMs:9999999999999}]]),user={uid:'u',email:'u@example.test',emailVerified:true,providerData:[{providerId:'password'}],customClaims:{promohubAdmin:true}},events=[];
 const ref=path=>({path,async get(){return {exists:data.has(path),data:()=>data.get(path)};}});
 const db={doc:ref,async runTransaction(fn){const writes=[];const r=await fn({get:r=>r.get(),update:(r,v)=>writes.push(()=>data.set(r.path,{...data.get(r.path),...v}))});writes.forEach(f=>f());return r;}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const admin={auth:()=>({getUser:async()=>user,getUserByEmail:async email=>{if(email==='taken@example.test')return {uid:'other'};throw Object.assign(Error('missing'),{code:'auth/user-not-found'});}})};
 const out=require('../functions/account-security.cjs')({onCall:(o,f)=>f,options:{},HttpsError,db,admin,stamp:()=>123,audit:(tx,actor,action,uid)=>events.push({actor,action,uid}),policy:require('../functions/policy')});
 const req=(token={},input={})=>({auth:{uid:'u',token:{email:'u@example.test',email_verified:true,auth_time:Date.now()/1000,...token}},data:input});return {data,user,out,req,events};
}
test('email preparation requires recent verified Auth and rejects taken addresses',async()=>{
 const b=backend();await assert.rejects(b.out.preparePromoHubLoginEmail(b.req({auth_time:1},{newEmail:'new@example.test'})),e=>e.code==='failed-precondition');
 await assert.rejects(b.out.preparePromoHubLoginEmail(b.req({email_verified:false},{newEmail:'new@example.test'})),e=>e.code==='permission-denied');
 await assert.rejects(b.out.preparePromoHubLoginEmail(b.req({},{newEmail:'taken@example.test'})),e=>e.code==='already-exists');
 assert.equal(b.data.get('users/u').pendingLoginEmail,undefined);
});
test('email preparation stores only pending metadata and retains paid access and Auth claims',async()=>{
 const b=backend();await b.out.preparePromoHubLoginEmail(b.req({},{newEmail:' New@example.test ',uid:'other',accountTier:'free'}));const p=b.data.get('users/u');assert.equal(p.email,'u@example.test');assert.equal(p.pendingLoginEmail,'new@example.test');assert.equal(p.accountTier,'premium');assert.equal(p.subscriptionEndsAtMs,9999999999999);assert.equal(b.user.customClaims.promohubAdmin,true);assert.equal(b.data.has('users/other'),false);
});
test('disabled, suspended, deleting, Google-only and stale-email sessions cannot prepare changes',async()=>{
 for(const kind of ['disabled','suspended','deleting','google','stale']){const b=backend();if(kind==='disabled')b.user.disabled=true;if(kind==='suspended')b.data.get('users/u').accountStatus='suspended';if(kind==='deleting')b.data.set('accountDeletions/u',{});if(kind==='google')b.user.providerData=[{providerId:'google.com'}];const req=b.req(kind==='stale'?{email:'old@example.test'}:{},{newEmail:'new@example.test'});await assert.rejects(b.out.preparePromoHubLoginEmail(req));assert.equal(b.data.get('users/u').pendingLoginEmail,undefined);}
});
test('email synchronisation trusts verified Auth, clears completed pending email and preserves subscription',async()=>{
 const b=backend();b.data.get('users/u').pendingLoginEmail='new@example.test';b.user.email='new@example.test';const r=await b.out.synchronizePromoHubLoginEmail(b.req({email:'new@example.test'},{email:'injected@example.test'}));assert.equal(r.email,'new@example.test');const p=b.data.get('users/u');assert.equal(p.email,'new@example.test');assert.equal(p.pendingLoginEmail,'');assert.equal(p.accountTier,'premium');assert.equal(b.events.at(-1).action,'account.emailChanged');
 b.user.emailVerified=false;await assert.rejects(b.out.synchronizePromoHubLoginEmail(b.req({email:'new@example.test'})),e=>e.code==='permission-denied');
});
