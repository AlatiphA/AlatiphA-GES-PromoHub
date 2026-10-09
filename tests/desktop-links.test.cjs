'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const desktop = app.slice(app.indexOf('    /* Desktop content clicks:'), app.indexOf('    /* Use document-level capture listener'));
const linksStart = app.indexOf('    /* Use document-level capture listener');
const links = app.slice(linksStart, app.indexOf('    }, true);', linksStart) + '    }, true);'.length);
function harness({fine = true, touched = false, sidebar = false, popup = false} = {}) {
  const calls = [], listeners = [];
  const note = {id: 'note1'};
  const doc = {
    addEventListener: (name, fn, capture) => listeners.push({fn, capture}),
    getElementById: id => id === 'note1' ? note : null,
    defaultView: {frameElement: {getBoundingClientRect: () => ({left: 100})}}
  };
  const context = {
    doc, document: {getElementById: () => popup ? {remove: () => calls.push('closePopup')} : null},
    window: {innerWidth: 1000, matchMedia: () => ({matches: fine}), open: () => calls.push('external')},
    _tt: touched ? Date.now() : null, Date,
    sidebarIsOpen: () => sidebar, toggleSidebar: () => calls.push('closeSidebar'),
    pagePrev: () => calls.push('prev'), pageNext: () => calls.push('next'),
    hideControls: () => calls.push('hide'), toggleControls: () => calls.push('controls'),
    showFootnote: el => calls.push(el === note ? 'note' : 'wrongNote'),
    rendition: {display: href => {calls.push(href); return Promise.resolve();}},
    isTocPage: false, isNotesPage: false, section: {href: 'chapter.xhtml'}, console, confirm: () => true
  };
  vm.runInNewContext(desktop + links, context);
  function click(x, {anchor = null, interactive = false, detail = 1, touch = false} = {}) {
    let stopped = false;
    const target = {nodeType: 1, closest: selector => selector === 'a[href]' ? anchor : anchor || (interactive ? {} : null)};
    const e = {target, clientX: x, detail, sourceCapabilities: {firesTouchEvents: touch},
      preventDefault() {}, stopPropagation() {stopped = true;}, stopImmediatePropagation() {stopped = true;}};
    for (const listener of listeners.filter(l => l.capture)) listener.fn(e);
    if (!stopped) for (const listener of listeners.filter(l => !l.capture)) listener.fn(e);
  }
  return {calls, click};
}
const anchor = (href, note = false) => ({getAttribute: name => name === 'href' ? href : name === 'epub:type' && note ? 'noteref' : '', classList: {contains: () => false}});
test('desktop footnotes at both page edges open notes without navigating pages', () => {
  for (const x of [0, 800]) {const h = harness(); h.click(x, {anchor: anchor('#note1', true)}); assert.deepEqual(h.calls, ['note']);}
});
test('desktop internal and external book links bypass page navigation', () => {
  const h = harness(); h.click(0, {anchor: anchor('chapter2.xhtml#section')}); h.click(800, {anchor: anchor('https://example.org')});
  assert.deepEqual(h.calls, ['chapter2.xhtml#section', 'external']);
});
test('ordinary desktop clicks retain previous, centre controls and next zones with iframe offset', () => {
  const h = harness(); h.click(0); h.click(400); h.click(800);
  assert.deepEqual(h.calls, ['prev', 'hide', 'controls', 'next', 'hide']);
});
test('touch generated, recent touch, keyboard and interactive clicks do not turn pages', () => {
  for (const options of [{fine: false}, {touched: true}]) {const h = harness(options); h.click(0); assert.deepEqual(h.calls, []);}
  const h = harness(); h.click(0, {touch: true}); h.click(0, {detail: 0}); h.click(0, {interactive: true}); assert.deepEqual(h.calls, []);
});
test('clicking ordinary content dismisses popup or sidebar without turning a page', () => {
  const p = harness({popup: true}); p.click(0); assert.deepEqual(p.calls, ['closePopup']);
  const s = harness({sidebar: true}); s.click(800); assert.deepEqual(s.calls, ['closeSidebar']);
});
test('navigation overlay never enables desktop pointer interception', () => {
  const css = fs.readFileSync(require.resolve('../style.css'), 'utf8');
  assert.match(css, /\.navZone\s*\{[^}]*pointer-events:\s*none/);
  assert.doesNotMatch(css, /\.navZone\s*\{[^}]*pointer-events:\s*(all|auto)/);
});
