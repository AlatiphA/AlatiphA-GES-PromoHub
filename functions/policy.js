'use strict';
const PROFILE_FIELDS = ['displayName','photoURL'];
function verified(token) { return Boolean(token && token.email_verified === true); }
function active(profile) { return Boolean(profile && profile.accountStatus === 'active'); }
function administrator(token, profile) { return verified(token) && active(profile) && token.promohubAdmin === true; }
function reviewDecision(value) { return value === 'approved' || value === 'rejected'; }
function userAction(value) { return ['suspend','reactivate','disable','free'].includes(value); }
function safeName(value) { return typeof value === 'string' ? value.trim().slice(0,100) : ''; }
module.exports = {PROFILE_FIELDS, verified, active, administrator, reviewDecision, userAction, safeName};
