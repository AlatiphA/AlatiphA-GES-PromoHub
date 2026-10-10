'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=require('../functions/subscriptions.cjs');
test('approved plan prices and calendar-month durations are fixed on the server',()=>{
 assert.deepEqual(Object.values(policy.plans).map(p=>[p.months,p.price]),[[1,20],[3,50],[6,80],[12,100]]);
 assert.equal(policy.addMonths(Date.UTC(2028,0,31),1),Date.UTC(2028,1,29));assert.equal(policy.addMonths(Date.UTC(2028,1,29),12),Date.UTC(2029,1,28));
});
test('trial permits local reading but no cloud storage, and expired paid access stops',()=>{
 const now=Date.now(),trial={accountStatus:'active',accountTier:'free',subscriptionSchema:1,trialEndsAtMs:now+1000};assert.equal(policy.readable(trial,now),true);assert.equal(policy.cloud(trial,now),false);
 const paid={...trial,accountTier:'premium',subscriptionEndsAtMs:now+1000};assert.equal(policy.cloud(paid,now),true);assert.equal(policy.cloud(paid,now+1001),false);assert.equal(policy.readable(paid,now+1001),false);
});
test('migration retains established Premium but does not trust older injected tiers',()=>{
 assert.deepEqual(policy.initial({accountTier:'premium',securitySchemaVersion:2}),{});assert.equal(policy.cloud({accountStatus:'active',accountTier:'premium',securitySchemaVersion:2}),true);
 assert.equal(policy.legacy({accountTier:'premium',securitySchemaVersion:1}),false);
});
test('client and server agree on trial, paid and expired access and guest expiry',()=>{
 const source=fs.readFileSync(require.resolve('../subscription-ui.js'),'utf8'),store=new Map(),elements={subscriptionPlan:{value:'m1'}};
 const scope={cloudUser:{uid:'u',emailVerified:true},securityProfile:{accountStatus:'active',accountTier:'free',subscriptionSchema:1,trialEndsAtMs:Date.now()+86400000},securityLocalOwner:'u',securityIsAdmin:()=>false,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>elements[id]||={}},Date,JSON,Number};vm.createContext(scope);vm.runInContext(source.slice(0,source.indexOf('securityActions.premium=')),scope);
 assert.equal(vm.runInContext('subscriptionCloudAllowed()',scope),false);assert.equal(vm.runInContext('subscriptionReadable()',scope),true);
 scope.securityProfile.trialEndsAtMs=Date.now()-1;assert.equal(vm.runInContext('subscriptionReadable()',scope),false);
 scope.securityProfile.accountTier='premium';scope.securityProfile.subscriptionEndsAtMs=Date.now()+86400000;assert.equal(vm.runInContext('subscriptionCloudAllowed()',scope),true);
 scope.cloudUser=null;scope.securityLocalOwner='';scope.securityProfile=null;assert.equal(vm.runInContext('subscriptionReadable()',scope),true);store.set('ges-promohub-guest-trial-start',String(Date.now()-8*86400000));assert.equal(vm.runInContext('subscriptionReadable()',scope),false);
});
