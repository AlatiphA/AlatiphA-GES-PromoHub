'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../public/subscription-ui.js'),'utf8');
function setup(){
 const elements={subscriptionPlan:{value:'m1'},subscriptionRenewBtn:{hidden:true},subscriptionExpiryReminder:{hidden:true}},stored=new Map();let admin=false,opened=0,focused=0;
 elements.subscriptionPlan.focus=()=>focused++;elements.subscriptionPlan.scrollIntoView=()=>{};
 const ctx={cloudUser:{uid:'u',emailVerified:true},securityProfile:{subscriptionSchema:1,accountTier:'premium',accountStatus:'active',subscriptionEndsAtMs:Date.now()+3*86400000},securityLocalOwner:'u',securityIsAdmin:()=>admin,openAccount:()=>opened++,securitySelectTab(){},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},document:{getElementById:id=>elements[id]||={}},Date,JSON,Number,Map};
 vm.createContext(ctx);vm.runInContext(code.slice(0,code.indexOf('securityActions.premium=')),ctx);
 return {ctx,elements,run:s=>vm.runInContext(s,ctx),admin:v=>admin=v,opened:()=>opened,focused:()=>focused};
}
test('days remaining distinguishes expired, sub-day, singular and plural remaining access',()=>{
 const s=setup();for(const [ms,text] of [[0,'Expired'],[3600000,'Less than 1 day remaining'],[86400000,'1 day remaining'],[2*86400000,'2 days remaining']])assert.equal(s.run('subscriptionRemaining('+ms+',0)'),text);
});
test('paid and expired subscribers see renewal controls while admin and trial accounts do not',()=>{
 const s=setup();s.run('subscriptionRender()');assert.match(s.elements.subscriptionStatus.textContent,/days remaining/);assert.equal(s.elements.subscriptionRenewBtn.hidden,false);assert.equal(s.elements.subscriptionExpiryReminder.hidden,false);
 s.ctx.securityProfile.subscriptionEndsAtMs=Date.now()-1000;s.run('subscriptionRender()');assert.match(s.elements.subscriptionExpiryReminder.textContent,/expired/);assert.equal(s.elements.subscriptionRenewBtn.hidden,false);
 s.admin(true);s.run('subscriptionRender()');assert.equal(s.elements.subscriptionRenewBtn.hidden,true);assert.equal(s.elements.subscriptionExpiryReminder.hidden,true);
 s.admin(false);s.ctx.securityProfile.accountTier='free';s.run('subscriptionRender()');assert.equal(s.elements.subscriptionRenewBtn.hidden,true);
});
test('renewal opens and focuses existing plans without submitting payments and account reset clears old warnings',()=>{
 const s=setup();s.run('subscriptionRenew()');assert.equal(s.opened(),1);assert.equal(s.focused(),1);s.run('subscriptionRender();subscriptionResetPayment()');assert.equal(s.elements.subscriptionRenewBtn.hidden,true);assert.equal(s.elements.subscriptionExpiryReminder.textContent,'');
});
