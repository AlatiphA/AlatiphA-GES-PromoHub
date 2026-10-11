'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const shared=fs.readFileSync(require.resolve('../public/admin-ui.js'),'utf8'),page=fs.readFileSync(require.resolve('../public/admin-page.js'),'utf8');
function setup(){
 const ids={},timers=new Map();let time=0,next=0,calls=[];
 function el(){return {hidden:false,disabled:false,value:'',dataset:{},children:[],handlers:{},textContent:'',addEventListener(k,f){this.handlers[k]=f;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){}};}
 const c={document:{getElementById:id=>ids[id]||(ids[id]=el()),querySelectorAll:()=>[],createElement:el},setTimeout(f,ms){timers.set(++next,{f,at:time+ms});return next;},clearTimeout(id){timers.delete(id);},firebase:{apps:[{}],auth:()=>({onAuthStateChanged(){}})}};
 vm.createContext(c);vm.runInContext(shared+page,c);vm.runInContext("cloudUser={uid:'admin',emailVerified:true};securityClaims={promohubAdmin:true};securityProfile={accountStatus:'active'};securityAdminView='users';",c);
 c.record=()=>calls.push({search:ids.securityUserSearch.value,tier:ids.securityUserTier.value});vm.runInContext('securityUsers=async()=>record();',c);
 function emit(id,event,data={}){ids[id].handlers[event]({preventDefault(){},...data});}
 function advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.f();}}
 return {ids,c,calls,emit,advance,run:code=>vm.runInContext(code,c),timers};
}
test('typing searches only the latest value after 350 ms idle',()=>{
 const s=setup();s.ids.securityUserSearch.value='A';s.emit('securityUserSearch','input');s.advance(300);assert.equal(s.calls.length,0);
 s.ids.securityUserSearch.value='Ahmed';s.emit('securityUserSearch','input');s.advance(349);assert.equal(s.calls.length,0);s.advance(1);assert.equal(s.calls.length,1);assert.equal(s.calls[0].search,'Ahmed');
});
test('filter selection searches immediately and cancels scheduled typing request',()=>{
 const s=setup();s.emit('securityUserSearch','input');s.ids.securityUserTier.value='premium';s.emit('securityUserTier','change');assert.equal(s.calls.length,1);assert.equal(s.calls[0].tier,'premium');s.advance(400);assert.equal(s.calls.length,1);
});
test('Enter searches immediately once, Clear resets query and filters',()=>{
 const s=setup();s.ids.securityUserSearch.value='Owner';s.emit('securityUserSearch','input');s.emit('securityUserFilters','submit');s.advance(400);assert.equal(s.calls.length,1);
 s.ids.securityUserTier.value='premium';s.emit('securityUserClear','click');assert.equal(s.calls.length,2);assert.equal(s.calls[1].search,'');assert.equal(s.calls[1].tier,'all');
});
test('composition waits for completed text before searching',()=>{
 const s=setup();s.emit('securityUserSearch','compositionstart');s.emit('securityUserSearch','input',{isComposing:true});s.advance(400);assert.equal(s.calls.length,0);
 s.ids.securityUserSearch.value='Completed';s.emit('securityUserSearch','compositionend');s.advance(350);assert.equal(s.calls.length,1);
});
test('typing invalidates older responses and navigation or account lock cancels pending search',()=>{
 const s=setup();const epoch=s.run('securityAdminEpoch');s.emit('securityUserSearch','input');assert.ok(s.run('securityAdminEpoch')>epoch);assert.equal(s.ids.securityNextPage.disabled,true);
 s.c.subscriptionAdminPayments=async()=>{};s.emit('securityControls','click',{target:{closest:()=>({dataset:{security:'payments'}})}});s.advance(400);assert.equal(s.calls.length,0);
 s.run("securityAdminView='users'");s.emit('securityUserSearch','input');s.run("adminLock('Signed out')");s.advance(400);assert.equal(s.calls.length,0);
});
test('changing search resets server pagination and old response cannot render while debounce is pending',async()=>{
 const s=setup();vm.runInContext(shared.slice(shared.indexOf('async function securityUsers'),shared.indexOf('async function securityRecords')),s.c);
 let resolve;s.c.securityCall=()=>new Promise(r=>resolve=r);
 s.run('securityUserPage=3;securityUserQuery={search:"old"};securityUserStarts=[null,null,null,{uid:"old"}];');
 const pending=s.run('securityUsers()');s.ids.securityUserSearch.value='new';s.emit('securityUserSearch','input');resolve({users:[{uid:'old',displayName:'Old result'}],cursor:null});await pending;assert.equal(s.ids.securityRecords.children.length,0);
 s.c.securityCall=async(name,data)=>name==='getPromoHubAdminSummary'?{}:{users:[],cursor:null};await s.run('adminSearchNow()');assert.equal(s.run('securityUserPage'),0);
});
