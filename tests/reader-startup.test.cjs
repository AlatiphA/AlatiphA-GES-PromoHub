'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const boot = html.match(/<script id="readerResumeBoot">([\s\S]*?)<\/script>/)[1];
function bootClasses(record, owner = 'alice', blocked = false) {
  const classes = new Set();
  vm.runInNewContext(boot, {sessionStorage: {getItem: () => {if(blocked)throw Error('blocked');return typeof record === 'string' ? record : JSON.stringify(record);}},
    localStorage: {getItem: () => owner}, document: {documentElement: {classList: {add: name => classes.add(name)}}}});
  return classes;
}
const saved = {view: 'reader', owner: 'alice', bookFile: './library/mat2.epub'};
test('reader reload hides library before body or external scripts can paint it', () => {
  assert.ok(bootClasses(saved).has('reader-resuming'));
  assert.ok(html.indexOf('id="readerResumeBoot"') < html.indexOf('<body'));
  assert.match(html, /html\.reader-resuming #libraryScreen\s*\{\s*visibility:\s*hidden !important/);
});
test('library, invalid sessions, different accounts and blocked storage retain normal library startup', () => {
  for(const record of [null, '{bad', {...saved, view: 'library'}, {...saved, bookFile: 'unknown.epub'}]) assert.equal(bootClasses(record).size, 0);
  assert.equal(bootClasses(saved, 'bob').size, 0);assert.equal(bootClasses(saved, 'alice', true).size, 0);
  assert.ok(bootClasses({...saved, owner: ''}, '').has('reader-resuming'));
});
test('startup always releases library suppression after reader restore or safe fallback', () => {
  const from = source.indexOf('function resumeReaderAfterStartup()');
  const fn = source.slice(from, source.indexOf('function persistCurrentReaderPosition()', from));
  for(const record of [saved, null, {...saved, owner: 'bob'}, {...saved, bookFile: 'unknown.epub'}]) {
    const calls = [];
    const context = {pendingReaderView: record, securityLocalOwner: 'alice', BOOKS: [{file: './library/mat2.epub', title: 'Book Two'}],
      selectedBookFile: '', readerTitle: {}, localStorage: {setItem() {}}, openReader: () => calls.push('reader'),
      document: {documentElement: {classList: {remove: name => calls.push(name)}}}};
    vm.createContext(context);vm.runInContext(fn, context);context.resumeReaderAfterStartup();
    assert.equal(calls.at(-1), 'reader-resuming');
    if(record === saved)assert.deepEqual(calls, ['reader', 'reader-resuming']);
  }
});
