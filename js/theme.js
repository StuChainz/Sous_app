// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
const paletteFromMA=(mode,accent)=>
  mode==='light'
    ?(accent==='ember'?'ceramic':accent==='phosphor'?'ceramic-phosphor':'ceramic-midnight')
    :accent;

const normalizePalette=p=>
  ['ember','phosphor','midnight','ceramic','ceramic-phosphor','ceramic-midnight'].includes(p)?p:'ceramic';

const modeAccentFromPalette=p=>{
  if(!p)                       return{mode:'light',accent:'ember'};
  if(p==='ember')              return{mode:'dark',accent:'ember'};
  if(p==='phosphor')           return{mode:'dark',accent:'phosphor'};
  if(p==='midnight')           return{mode:'dark',accent:'midnight'};
  if(p==='ceramic')            return{mode:'light',accent:'ember'};
  if(p==='ceramic-phosphor')   return{mode:'light',accent:'phosphor'};
  if(p==='ceramic-midnight')   return{mode:'light',accent:'midnight'};
  return{mode:'light',accent:'ember'};
};

function applyTheme(palette,persist=true){
  const nextPalette=normalizePalette(palette);
  const mode=modeAccentFromPalette(nextPalette).mode;
  document.documentElement.setAttribute('data-palette',nextPalette);
  document.documentElement.classList.toggle('theme-light',mode==='light');
  document.documentElement.classList.toggle('theme-dark',mode==='dark');
  if(document.body){
    document.body.classList.toggle('theme-light',mode==='light');
    document.body.classList.toggle('theme-dark',mode==='dark');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='light'?'#F4EFE6':'#14110D');
  try{if(persist)localStorage.setItem('sous_theme',JSON.stringify({palette:nextPalette}));}catch(e){}
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
  const p=normalizePalette(document.documentElement.getAttribute('data-palette'));
  const{mode,accent}=modeAccentFromPalette(p);
  document.querySelectorAll('#seg-mode .seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.val===mode));
  document.querySelectorAll('.accent-swatch').forEach(s=>s.classList.toggle('active',s.dataset.accent===accent));
}

(function initTheme(){
  try{
    const saved=JSON.parse(localStorage.getItem('sous_theme')||'{}');
    applyTheme(saved.palette||'ceramic',false);
  }catch(e){applyTheme('ceramic',false);}
  // syncThemeUI runs after DOM is ready
  document.addEventListener('DOMContentLoaded',()=>{applyTheme(document.documentElement.getAttribute('data-palette'),false);syncThemeUI();});
})();
