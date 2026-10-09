'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function setup(open = false) {
  const state = {open, header: false, footer: false, popup: true, documentClicks: 0};
  const buttons = {};
  function button(name) { return {addEventListener: (type, handler) => buttons[name] = handler}; }
  const context = {menuBtn: button('top'), bottomMenuBtn: button('bottom'),
    toggleSidebar: () => {state.open = !state.open; state.header = state.open; state.footer = false;},
    showControls: () => {state.header = true; state.footer = true;}};
  const start = source.indexOf('function handleSidebarButtonClick');
  vm.runInNewContext(source.slice(start, source.indexOf('/* ==========\n   OTHER EVENTS', start)), context);
  return {state, click: (name, touch = false) => {
    let stopped = false, prevented = false;
    buttons[name]({sourceCapabilities: {firesTouchEvents: touch}, preventDefault: () => {prevented = true;}, stopPropagation: () => {stopped = true;}});
    if (!stopped) {state.documentClicks++; state.popup = false;}
    assert.equal(prevented, true);
  }};
}
test('top and bottom menu buttons open and close sidebar with controls visible on desktop and mobile', () => {
  for (const name of ['top', 'bottom']) for (const touch of [false, true]) {
    const h = setup(); h.click(name, touch);
    assert.equal(h.state.open, true); assert.equal(h.state.header, true); assert.equal(h.state.footer, true);
    h.click(name, touch); assert.equal(h.state.open, false); assert.equal(h.state.header, true); assert.equal(h.state.footer, true);
  }
});
test('menu clicks never reach document popup dismissal or outside-click listeners', () => {
  for (const name of ['top', 'bottom']) {
    const h = setup(); h.click(name); assert.equal(h.state.popup, true); assert.equal(h.state.documentClicks, 0);
  }
});
test('outside-click sidebar guard excludes button descendants as well as buttons', () => {
  assert.ok(source.includes('!menuBtn.contains(e.target)'));
  assert.ok(source.includes('!bottomMenuBtn.contains(e.target)'));
});
