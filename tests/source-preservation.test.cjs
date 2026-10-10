'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'),app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
test('current profile and authentication controls remain present',()=>{for(const id of ['authScreen','profileBtn','libraryProfileBtn','accountPanel','authPrimaryBtn','googleSignInBtn','faqOverlay'])assert.ok(html.includes('id="'+id+'"'));assert.ok(html.includes('./security-ui.js'));assert.ok(!html.includes('./accounts.js'));});
test('current native reading and preferences cloud paths remain used',()=>{assert.ok(app.includes('.collection("reading")'));assert.ok(app.includes('.collection("preferences").doc("reader")'));assert.ok(app.includes('.where("bookFile", "==", selectedBookFile)'));});
