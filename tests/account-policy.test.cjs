'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const p=require('../functions/policy');
test('profile flags cannot substitute for a verified Auth token',()=>{
 assert.equal(p.verified({email_verified:false,emailVerified:true}),false);
 assert.equal(p.verified({email_verified:'true'}),false);
 assert.equal(p.verified({email_verified:true}),true);
});
test('admin requires exact owner-issued claim, verified token and active status',()=>{
 for(const status of ['suspended','disabled',undefined])assert.equal(p.administrator({email_verified:true,promohubAdmin:true},{accountStatus:status}),false);
 assert.equal(p.administrator({email_verified:true,role:'admin'},{accountStatus:'active'}),false);
 assert.equal(p.administrator({email_verified:false,promohubAdmin:true},{accountStatus:'active'}),false);
 assert.equal(p.administrator({email_verified:true,promohubAdmin:true},{accountStatus:'active'}),true);
});
test('Premium approvals and lifecycle actions reject unknown operations',()=>{
 assert.equal(p.reviewDecision('premium'),false);assert.equal(p.reviewDecision('approved'),true);
 assert.equal(p.userAction('admin'),false);assert.equal(p.userAction('reactivate'),true);
});
