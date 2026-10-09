'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const start = source.indexOf('function readReaderView()');
const code = source.slice(start, source.indexOf('setAuthMode("login");', start));
function setup(record, owner = 'alice', broken = false) {
  const storage = new Map(record === undefined ? [] : [['ges-promohub-reader-view', typeof record === 'string' ? record : JSON.stringify(record)]]);
  const opened = [], listeners = {}, local = new Map(), data = new Map();
  const context = {
    sessionStorage: {getItem: key => {if(broken)throw Error('blocked');return storage.get(key) || null;}, setItem: (key, value) => {if(broken)throw Error('blocked');storage.set(key, value);}},
    localStorage: {setItem: (key, value) => local.set(key, value)},
    securityLocalOwner: owner, selectedBookFile: './library/mat1.epub', readerTitle: {},
    BOOKS: [{file: './library/mat1.epub', title: 'Book One'}, {file: './library/mat2.epub', title: 'Book Two'}],
    rendition: {}, currentLocation: {start: {cfi: 'epubcfi(/6/4!/4/2)', href: 'chapter2.xhtml'}},
    loadReaderData: () => data.get(context.securityLocalOwner + context.selectedBookFile) || {progress: 42},
    saveReaderData: value => data.set(context.securityLocalOwner + context.selectedBookFile, value),
    openReader: () => {opened.push({book: context.selectedBookFile, owner: context.securityLocalOwner, location: context.loadReaderData().location});context.rememberReaderView('reader');},
    window: {addEventListener: (name, handler) => listeners[name] = handler},
    document: {visibilityState: 'hidden', addEventListener: (name, handler) => listeners[name] = handler},
    console: {warn() {}}, Date
  };
  vm.createContext(context); vm.runInContext(code, context);
  return {context, opened, storage, data, listeners};
}
const reading = {view: 'reader', bookFile: './library/mat2.epub', owner: 'alice'};
test('refresh restores the exact saved book once in its account scope', () => {
  const h = setup(reading);h.data.set('alice./library/mat2.epub', {location: 'saved-cfi'});
  assert.equal(h.context.resumeReaderAfterStartup(), true);
  assert.deepEqual(h.opened, [{book: './library/mat2.epub', owner: 'alice', location: 'saved-cfi'}]);
  assert.equal(h.context.readerTitle.textContent, 'Book Two');assert.equal(h.context.resumeReaderAfterStartup(), false);
});
test('Back followed by refresh stays on library', () => {
  const h = setup(reading);h.context.rememberReaderView('library');
  const next = setup(h.storage.get('ges-promohub-reader-view'));
  assert.equal(next.context.resumeReaderAfterStartup(), false);assert.equal(next.opened.length, 0);
});
test('different accounts and guest never resume another account book', () => {
  for(const owner of ['bob', '']) {const h = setup(reading, owner);assert.equal(h.context.resumeReaderAfterStartup(), false);assert.equal(h.opened.length, 0);}
});
test('offline guest refresh restores the guest book', () => {
  const h = setup({...reading, owner: ''}, '');assert.equal(h.context.resumeReaderAfterStartup(), true);assert.equal(h.opened[0].owner, '');
});
test('missing, invalid, unknown book and inaccessible session storage fall back safely', () => {
  for(const record of [undefined, '{broken', {...reading, bookFile: './library/not-a-book.epub'}]) {
    const h = setup(record);assert.equal(h.context.resumeReaderAfterStartup(), false);
  }
  const h = setup(reading, 'alice', true);assert.equal(h.context.resumeReaderAfterStartup(), false);assert.doesNotThrow(() => h.context.rememberReaderView('reader'));
});
test('page hide and mobile backgrounding flush latest CFI to the account and book store', () => {
  const h = setup(reading);h.listeners.pagehide();const key = 'alice./library/mat1.epub';
  assert.equal(h.data.get(key).location, 'epubcfi(/6/4!/4/2)');assert.equal(h.data.get(key).progress, 42);
  h.context.currentLocation.start.cfi = 'new-cfi';h.listeners.visibilitychange();assert.equal(h.data.get(key).location, 'new-cfi');
  h.context.currentLocation = null;h.listeners.pagehide();assert.equal(h.data.get(key).location, 'new-cfi');
});
test('reader renderer sends saved local CFI to EPUB display', () => {
  const from = source.indexOf('  const readerData = loadReaderData();');
  const segment = source.slice(from, source.indexOf('  /* BACKGROUND SETUP', from));
  const displayed = [];vm.runInNewContext(segment, {loadReaderData: () => ({location: 'saved-cfi'}), rendition: {display: value => {displayed.push(value);return Promise.resolve();}}});
  assert.deepEqual(displayed, ['saved-cfi']);
});
test('startup restoration waits for account scope but does not wait on server operations', () => {
  const security = fs.readFileSync(require.resolve('../security-ui.js'), 'utf8');
  const fn = security.slice(security.indexOf('async function securityAuthChanged'), security.indexOf('let securityCursor'));
  assert.ok(fn.indexOf('securitySwitchLocal(user)') < fn.indexOf('resumeReaderAfterStartup()'));
  assert.ok(fn.lastIndexOf('resumeReaderAfterStartup()') < fn.indexOf('await securityActivate(user)'));
  assert.match(source, /if \(!firebaseConfigured\(\)\).*resumeReaderAfterStartup\(\)/);
});
