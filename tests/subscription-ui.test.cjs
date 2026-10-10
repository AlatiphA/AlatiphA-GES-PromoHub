'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/subscription-ui.js'),'utf8');
test('expired reader opening is blocked without falsely reporting restored success',()=>{
 let opens=0,panels=0;const scope={openReader:()=>{opens++;},subscriptionReadable:()=>false,cloudUser:{uid:'u'},accountPanel:{classList:{add:()=>panels++}},securitySelectTab(){},securityMessage(){},showAuth(){},authError:{}};
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('const subscriptionOpenReader='),source.indexOf('function subscriptionCheckExpiry')),scope);
 assert.equal(scope.openReader(),false);assert.equal(opens,0);assert.equal(panels,1);scope.subscriptionReadable=()=>true;scope.openReader();assert.equal(opens,1);
});
test('pending payment display does not get re-enabled by the subscription render timer',()=>{
 const elements={subscriptionPlan:{value:'m1'},securityPremiumButton:{disabled:true}},scope={cloudUser:{uid:'u'},securityProfile:{accountStatus:'active',subscriptionSchema:1,trialEndsAtMs:Date.now()+86400000},securityIsAdmin:()=>false,securityLocalOwner:'u',localStorage:{setItem(){},getItem(){}},document:{getElementById:id=>elements[id]||={}},Date,JSON,Number,Map};
 vm.createContext(scope);vm.runInContext(source.slice(0,source.indexOf('securityActions.premium=')),scope);vm.runInContext('subscriptionRender()',scope);assert.equal(elements.securityPremiumButton.disabled,true);
});
test('subscription UI is precached and account switching clears previous payment details',()=>{
 const sw=fs.readFileSync(require.resolve('../public/sw.js'),'utf8'),security=fs.readFileSync(require.resolve('../public/security-ui.js'),'utf8');assert.match(sw,/subscription-ui\.js/);assert.match(security,/securityEpoch\+\+;securityResetAdmin\(\);subscriptionResetPayment\(\)/);
});
test('sidebar shows scoped trial, paid expiry, renewal and free administrator access',()=>{
 const elements={subscriptionPlan:{value:'m1'}},values=new Map(),scope={cloudUser:{uid:'u',emailVerified:true},securityProfile:{accountStatus:'active',subscriptionSchema:1,trialEndsAtMs:Date.now()+86400000},securityLocalOwner:'u',securityIsAdmin:()=>false,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},document:{getElementById:id=>elements[id]||={}},Date,JSON,Number,Map};
 vm.createContext(scope);vm.runInContext(source.slice(0,source.indexOf('securityActions.premium=')),scope);
 vm.runInContext('subscriptionSidebarRender()',scope);assert.match(elements.sidebarSubscriptionStatus.textContent,/Free trial/);assert.equal(elements.sidebarSubscriptionButton.textContent,'View plans');
 scope.securityProfile.accountTier='premium';scope.securityProfile.subscriptionEndsAtMs=Date.now()+86400000;
 vm.runInContext('subscriptionSidebarRender()',scope);assert.match(elements.sidebarSubscriptionStatus.textContent,/Subscribed.*expires/);assert.equal(elements.sidebarSubscriptionButton.textContent,'Renew subscription');
 scope.securityIsAdmin=()=>true;vm.runInContext('subscriptionRender()',scope);assert.equal(elements.sidebarSubscriptionButton.hidden,true);assert.equal(elements.subscriptionPurchaseControls.hidden,true);assert.match(elements.subscriptionHint.textContent,/No subscription purchase required/);
 scope.securityIsAdmin=()=>false;scope.securityProfile={accountStatus:'active',trialEndsAtMs:1};vm.runInContext('subscriptionRender()',scope);assert.equal(elements.sidebarSubscriptionButton.hidden,false);assert.equal(elements.subscriptionPurchaseControls.hidden,false);assert.match(elements.sidebarSubscriptionStatus.textContent,/expired/);
});
test('guest sidebar does not display a previous account subscription',()=>{
 const elements={},scope={cloudUser:null,securityProfile:null,securityLocalOwner:'',securityIsAdmin:()=>false,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:id=>elements[id]||={}},Date,JSON,Number,Map};
 vm.createContext(scope);vm.runInContext(source.slice(0,source.indexOf('securityActions.premium=')),scope);vm.runInContext('subscriptionSidebarRender()',scope);assert.match(elements.sidebarSubscriptionStatus.textContent,/Guest trial/);assert.equal(elements.sidebarSubscriptionButton.textContent,'Sign in / View plans');
});
