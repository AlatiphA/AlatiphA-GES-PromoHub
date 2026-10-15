'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const path = require('node:path');
test('deployed entry point exposes real Admin SDK Messaging send API', () => {
 const entry = path.resolve(__dirname, '../functions/index.js');
 const fromFunctions = createRequire(entry);
 const exports = fromFunctions(entry);
 const messaging = fromFunctions('firebase-admin/messaging').getMessaging();
 assert.equal(typeof messaging.send, 'function');
 const source = require('node:fs').readFileSync(path.resolve(__dirname, '../functions/push-notifications.cjs'), 'utf8');
 assert.ok(source.includes("require('firebase-admin/messaging').getMessaging()"));
 assert.ok(exports.sendPromoHubPersonalPush);
 assert.ok(exports.sendPromoHubAnnouncementPush);
});
