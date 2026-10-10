'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../subscription-ui.js'),'utf8');
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
 const sw=fs.readFileSync(require.resolve('../sw.js'),'utf8'),security=fs.readFileSync(require.resolve('../security-ui.js'),'utf8');assert.match(sw,/subscription-ui\.js/);assert.match(security,/securityEpoch\+\+;securityResetAdmin\(\);subscriptionResetPayment\(\)/);
});
