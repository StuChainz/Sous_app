// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
const paletteFromMA=(mode,accent)=>
  mode==='light'
    ?(accent==='ember'?'ceramic':accent==='phosphor'?'ceramic-phosphor':'ceramic-midnight')
    :accent;

const modeAccentFromPalette=p=>{
  if(!p||p==='ember')          return{mode:'dark',accent:'ember'};
  if(p==='phosphor')           return{mode:'dark',accent:'phosphor'};
  if(p==='midnight')           return{mode:'dark',accent:'midnight'};
  if(p==='ceramic')            return{mode:'light',accent:'ember'};
  if(p==='ceramic-phosphor')   return{mode:'light',accent:'phosphor'};
  if(p==='ceramic-midnight')   return{mode:'light',accent:'midnight'};
  return{mode:'dark',accent:'ember'};
};

function applyTheme(palette){
  document.documentElement.setAttribute('data-palette',palette||'ember');
  try{localStorage.setItem('sous_theme',JSON.stringify({palette:palette||'ember'}));}catch(e){}
}

function setThemeMode(mode){
  const cur=modeAccentFromPalette(document.documentElement.getAttribute('data-palette'));
  applyTheme(paletteFromMA(mode,cur.accent));
  syncThemeUI();
}

function setThemeAccent(accent){
  const cur=modeAccentFromPalette(document.documentElement.getAttribute('data-palette'));
  applyTheme(paletteFromMA(cur.mode,accent));
  syncThemeUI();
}

function syncThemeUI(){
  const p=document.documentElement.getAttribute('data-palette')||'ember';
  const{mode,accent}=modeAccentFromPalette(p);
  document.querySelectorAll('#seg-mode .seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.val===mode));
  document.querySelectorAll('.accent-swatch').forEach(s=>s.classList.toggle('active',s.dataset.accent===accent));
}

(function initTheme(){
  try{
    const saved=JSON.parse(localStorage.getItem('sous_theme')||'{}');
    applyTheme(saved.palette||'ember');
  }catch(e){applyTheme('ember');}
  // syncThemeUI runs after DOM is ready
  document.addEventListener('DOMContentLoaded',syncThemeUI);
})();
