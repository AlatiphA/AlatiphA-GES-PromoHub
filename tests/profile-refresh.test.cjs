'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function setup(){
 const state={profile:false,auth:false,sidebar:false,faq:false,reloads:0,saves:0},events={},timers=[];
 const classes={add(){},remove(){},toggle(){}};
 const panel=key=>({classList:{contains:()=>state[key]},scrollTop:0,scrollHeight:800,clientHeight:400});const authScreen=panel('auth');
 const context={accountPanel:panel('profile'),authScreen,faqOverlay:panel('faq'),sidebarIsOpen:()=>state.sidebar,window:{scrollY:0},document:{body:{appendChild(){}},createElement:()=>({classList:classes}),addEventListener:(type,fn,options)=>{(events[type] ||= []).push({fn,options});}},setTimeout:fn=>timers.push(fn),persistCurrentReaderPosition:()=>state.saves++,location:{reload:()=>state.reloads++}};
 const start=app.indexOf('/* ---------- Pull to refresh ---------- */');vm.runInNewContext(app.slice(start,app.indexOf('/* ---------- Pinch changes EPUB',start)),context);
 const card={scrollTop:0,scrollHeight:900,clientHeight:400};
 function emit(type,y=10,x=20,targetCard=card,count=1){let prevented=false;const e={touches:Array.from({length:count},()=>({clientX:x,clientY:y})),target:{closest:()=>targetCard},cancelable:true,preventDefault(){prevented=true;}};for(const h of events[type]||[])h.fn(e);return prevented;}
 return {state,emit,timers,card,authScreen,events};
}
test('profile downward pull never reloads; boundary swipe is prevented without blocking inner scrolling',()=>{
 const s=setup();s.state.profile=true;s.emit('touchstart');assert.equal(s.emit('touchmove',110),true);s.emit('touchend');assert.equal(s.timers.length,0);assert.equal(s.state.reloads,0);
 s.card.scrollTop=200;s.emit('touchstart');assert.equal(s.emit('touchmove',110),false);
 s.card.scrollTop=500;s.emit('touchstart',110);assert.equal(s.emit('touchmove',10),true);
});
test('profile backdrop is contained but taps, horizontal gestures and two-finger gestures are untouched',()=>{
 const s=setup();s.state.profile=true;s.emit('touchstart',10,20,null);assert.equal(s.emit('touchmove',110,20,null),true);
 s.emit('touchstart');assert.equal(s.emit('touchmove',13),false);assert.equal(s.emit('touchmove',15,140),false);
 s.emit('touchstart',10,20,s.card,2);assert.equal(s.emit('touchmove',110,20,s.card,2),false);
 assert.equal(s.events.touchmove.at(-1).options.passive,false);
});
test('opening profile during a gesture or scheduled reload cancels refresh',()=>{
 const s=setup();s.emit('touchstart');s.emit('touchmove',110);s.state.profile=true;s.emit('touchend');assert.equal(s.timers.length,0);
 s.state.profile=false;s.emit('touchstart');s.emit('touchmove',110);s.emit('touchend');assert.equal(s.timers.length,1);s.state.profile=true;s.timers[0]();assert.equal(s.state.reloads,0);
});
test('touch cancellation and additional fingers clear armed refresh',()=>{
 const s=setup();s.emit('touchstart');s.emit('touchmove',110);s.emit('touchcancel');s.emit('touchend');assert.equal(s.timers.length,0);
 s.emit('touchstart');s.emit('touchmove',110);s.emit('touchmove',130,20,s.card,2);s.emit('touchend');assert.equal(s.timers.length,0);
});
test('normal app refresh still saves current reading position before reload',()=>{
 const s=setup();s.emit('touchstart');s.emit('touchmove',110);s.emit('touchend');s.timers[0]();assert.equal(s.state.saves,1);assert.equal(s.state.reloads,1);
});
test('login scrolling uses its actual scroll container and never arms refresh',()=>{
 const s=setup();s.state.auth=true;s.authScreen.scrollTop=100;s.emit('touchstart',10,20,null);assert.equal(s.emit('touchmove',110,20,null),false);s.emit('touchend');assert.equal(s.timers.length,0);
});
