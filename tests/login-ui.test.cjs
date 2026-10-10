'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8'),html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
function setup(){
 const ids={};function element(id){return ids[id] ||= {value:'',type:'password',style:{},attributes:{},listeners:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.listeners[k]=f;},reportValidity(){return true;},click(){this.clicks=(this.clicks||0)+1;}};}
 const context={document:{getElementById:element},authMode:'login',authName:element('authName'),authPassword:element('authPassword'),authPrimaryBtn:element('authPrimaryBtn'),authModeBtn:element('authModeBtn'),authError:element('authError')};vm.createContext(context);
 vm.runInContext(app.slice(app.indexOf('const authPasswordToggle ='),app.indexOf('if (authModeBtn) authModeBtn.addEventListener')),context);
 vm.runInContext(app.slice(app.indexOf('function setAuthMode(mode)'),app.indexOf('function showAuth()')),context);
 return {ids,context,run:code=>vm.runInContext(code,context)};
}
test('sign-up and sign-in update headings, name field and password autocomplete',()=>{
 const s=setup();s.run("setAuthMode('signup')");assert.equal(s.ids.authNameField.hidden,false);assert.equal(s.ids.authHeading.textContent,'Create your account');assert.equal(s.ids.authPassword.autocomplete,'new-password');assert.equal(s.ids.authPrimaryBtn.textContent,'Create account');
 s.run("setAuthMode('login')");assert.equal(s.ids.authNameField.hidden,true);assert.equal(s.ids.authHeading.textContent,'Welcome back');assert.equal(s.ids.authPassword.autocomplete,'current-password');assert.equal(s.ids.authModeBtn.textContent,'Sign up');
});
test('password toggle is accessible and mode switching restores concealed password',()=>{
 const s=setup();s.ids.authPasswordToggle.listeners.click();assert.equal(s.ids.authPassword.type,'text');assert.equal(s.ids.authPasswordToggle.attributes['aria-label'],'Hide password');assert.equal(s.ids.authPasswordToggle.attributes['aria-pressed'],'true');
 s.run("setAuthMode('signup')");assert.equal(s.ids.authPassword.type,'password');assert.equal(s.ids.authPasswordToggle.attributes['aria-pressed'],'false');
});
test('keyboard form submission invokes existing sign-in button and prevents page navigation',()=>{
 const s=setup();let prevented=false;s.ids.authForm.listeners.submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(s.ids.authPrimaryBtn.clicks,1);
});
test('auth markup preserves existing action IDs and provides explicit field labels',()=>{
 for(const id of ['authName','authEmail','authPassword','authPrimaryBtn','googleSignInBtn','authModeBtn','authResetBtn','authOfflineBtn','authError'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 for(const id of ['authName','authEmail','authPassword'])assert.match(html,new RegExp('for="'+id+'"'));
 assert.match(html,/Continue offline/);assert.match(html,/7 days/);assert.match(html,/id="authError"[^>]*role="status"/);
});
