const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function boot({saved=null,dark=false,blocked=false}={}){
 const values=new Map(saved?[['ges-promohub-ui-theme',saved]]:[]),writes=[],events={},domEvents={},messages=[];
 const selects=[{value:'',addEventListener(k,fn){this[k]=fn;}},{value:'',addEventListener(k,fn){this[k]=fn;}}];
 const media={matches:dark,addEventListener(k,fn){this.change=fn;}};
 const html={dataset:{},style:{}};
 const nodes={libraryScreen:{setAttribute(k,v){this[k]=v;}},libraryDayNightBtn:{setAttribute(k,v){this[k]=v;}},faqFrame:{contentWindow:{postMessage(v){messages.push(v);}},addEventListener(){}}};
 const document={documentElement:html,getElementById:id=>nodes[id]||null,querySelectorAll:()=>selects,querySelector:()=>({setAttribute(){}}),addEventListener:(k,fn)=>domEvents[k]=fn};
 const window={matchMedia:()=>media,addEventListener:(k,fn)=>events[k]=fn};
 const localStorage={getItem(k){if(blocked)throw Error('blocked');return values.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');writes.push([k,v]);values.set(k,v);}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'ui-theme.js'),'utf8'),{window,document,localStorage,location:{origin:'https://example.test'}});
 return {window,html,selects,media,events,domEvents,writes,messages,nodes};
}
test('System defaults follow device appearance and invalid saved values fall back safely',()=>{
 assert.equal(boot().html.dataset.uiTheme,'light');
 assert.equal(boot({dark:true}).html.dataset.uiTheme,'dark');
 assert.equal(boot({saved:'night',dark:true}).html.dataset.uiTheme,'dark');
});
test('manual interface theme persists independently and ignores system changes',()=>{
 const b=boot({dark:true});b.window.setInterfaceTheme('light');
 assert.equal(b.html.dataset.uiTheme,'light');b.media.change();assert.equal(b.html.dataset.uiTheme,'light');
 assert.deepEqual(b.writes,[['ges-promohub-ui-theme','light']]);
 b.window.setInterfaceTheme('system');assert.equal(b.html.dataset.uiTheme,'dark');
 b.media.matches=false;b.media.change();assert.equal(b.html.dataset.uiTheme,'light');
 b.window.setInterfaceTheme('sepia');assert.equal(b.html.dataset.uiTheme,'light');
});
test('blocked storage permits theme switching and cross-tab changes synchronise',()=>{
 const b=boot({blocked:true});b.window.setInterfaceTheme('dark');assert.equal(b.html.dataset.uiTheme,'dark');
 b.events.storage({key:'ges-promohub-ui-theme',newValue:'light'});assert.equal(b.html.dataset.uiTheme,'light');
 b.events.storage({key:'reader-theme',newValue:'night'});assert.equal(b.html.dataset.uiTheme,'light');
});
test('login and account selectors agree, library button cycles choices, FAQ follows interface',()=>{
 const b=boot();b.domEvents.DOMContentLoaded();b.selects[0].value='dark';b.selects[0].change();
 assert.equal(b.selects[1].value,'dark');assert.equal(b.nodes.libraryScreen['data-theme'],'dark');
 assert.equal(b.messages.at(-1).theme,'dark');b.window.cycleInterfaceTheme();assert.equal(b.selects[0].value,'system');
 assert.equal(b.html.dataset.uiTheme,'light');
});
test('interface startup precedes stylesheet; book reading themes and account controls remain separate',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.indexOf('src="./ui-theme.js"')<html.indexOf('rel="stylesheet"'));
 assert.equal((html.match(/data-ui-theme-choice/g)||[]).length,2);
 for(const theme of ['light','sepia','dark','night'])assert.ok(html.includes(`data-theme="${theme}"`));
 const js=fs.readFileSync(path.join(root,'ui-theme.js'),'utf8');assert.ok(!js.includes('classList'));assert.ok(!js.includes('reader-theme'));
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert.ok(sw.includes('ui-theme.js'));
 const faq=fs.readFileSync(path.join(root,'faq.html'),'utf8');assert.ok(faq.includes('window.applyInterfaceTheme(t)'));
});
