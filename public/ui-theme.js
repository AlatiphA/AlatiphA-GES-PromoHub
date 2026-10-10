/* Interface appearance is independent of EPUB reading preferences. */
(function(){
 const key='ges-promohub-ui-theme',modes=['system','light','dark'];
 const media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 let choice='system';try{const saved=localStorage.getItem(key);if(modes.includes(saved))choice=saved;}catch{}
 function apply(mode){
  const preference=modes.includes(mode)?mode:choice;
  const resolved=preference==='system'?(media?.matches?'dark':'light'):preference;
  document.documentElement.dataset.uiTheme=resolved;
  document.documentElement.style.colorScheme=resolved;
  const lib=document.getElementById('libraryScreen');if(lib)lib.setAttribute('data-theme',resolved);
  for(const select of document.querySelectorAll('[data-ui-theme-choice]'))select.value=choice;
  const button=document.getElementById('libraryDayNightBtn');
  if(button){button.innerHTML=choice==='system'?'<i class="fa-solid fa-desktop" aria-hidden="true"></i>':resolved==='dark'?'<i class="fa-solid fa-moon" aria-hidden="true"></i>':'<i class="fa-solid fa-sun" aria-hidden="true"></i>';button.setAttribute('aria-label',`App appearance: ${choice} (${resolved}). Change appearance`);button.title=`App appearance: ${choice} (${resolved})`;}
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',resolved==='dark'?'#151a1c':'#f4f2ed');
  const frame=document.getElementById('faqFrame');try{frame?.contentWindow?.postMessage({type:'GES_PROMOHUB_THEME',theme:resolved},location.origin);}catch{}
  return resolved;
 }
 window.applyInterfaceTheme=apply;
 window.setInterfaceTheme=function(mode){if(!modes.includes(mode))return;choice=mode;try{localStorage.setItem(key,mode);}catch{}apply();};
 window.cycleInterfaceTheme=function(){window.setInterfaceTheme(modes[(modes.indexOf(choice)+1)%modes.length]);};
 apply();
 document.addEventListener('DOMContentLoaded',()=>{
  apply();
  for(const select of document.querySelectorAll('[data-ui-theme-choice]'))select.addEventListener('change',()=>window.setInterfaceTheme(select.value));
  document.getElementById('faqFrame')?.addEventListener('load',()=>apply());
 },{once:true});
 const systemChanged=()=>{if(choice==='system')apply();};
 if(media?.addEventListener)media.addEventListener('change',systemChanged);else media?.addListener?.(systemChanged);
 window.addEventListener('storage',e=>{if(e.key===key){choice=modes.includes(e.newValue)?e.newValue:'system';apply();}});
})();
