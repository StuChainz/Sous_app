// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
// Keep the legacy sous_theme key so existing installs retain preferences.
const THEME_STORAGE_KEY='sous_theme';
const HIGHLIGHTS=['yellow','blue','pink'];

function normalizeThemeMode(mode){
  return mode==='dark'?'dark':'light';
}

function normalizeHighlight(hl){
  if(hl==='midnight'||hl==='ceramic-midnight') return 'blue';
  if(hl==='phosphor'||hl==='ceramic-phosphor'||hl==='ember'||hl==='ceramic') return 'yellow';
  return HIGHLIGHTS.includes(hl)?hl:'yellow';
}

function themeFromLegacyPalette(palette){
  if(palette==='ember') return {mode:'dark',hl:'yellow'};
  if(palette==='midnight') return {mode:'dark',hl:'blue'};
  if(palette==='phosphor') return {mode:'dark',hl:'yellow'};
  if(palette==='ceramic-midnight') return {mode:'light',hl:'blue'};
  if(palette==='ceramic-phosphor') return {mode:'light',hl:'yellow'};
  return {mode:'light',hl:'yellow'};
}

function readStoredTheme(){
  try{
    const saved=JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)||'{}')||{};
    if(saved.mode||saved.hl) return {mode:normalizeThemeMode(saved.mode),hl:normalizeHighlight(saved.hl)};
    return themeFromLegacyPalette(saved.palette);
  }catch(e){
    return {mode:'light',hl:'yellow'};
  }
}

function applyTheme(theme={},persist=true){
  const mode=normalizeThemeMode(theme.mode);
  const hl=normalizeHighlight(theme.hl);
  document.documentElement.setAttribute('data-mode',mode);
  document.documentElement.setAttribute('data-hl',hl);
  document.documentElement.setAttribute('data-palette',mode==='dark'?'ink':'paper');
  document.documentElement.classList.toggle('theme-light',mode==='light');
  document.documentElement.classList.toggle('theme-dark',mode==='dark');
  if(document.body){
    document.body.classList.toggle('theme-light',mode==='light');
    document.body.classList.toggle('theme-dark',mode==='dark');
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mode==='light'?'#F4F0E6':'#1A1611');
  try{if(persist)localStorage.setItem(THEME_STORAGE_KEY,JSON.stringify({mode,hl}));}catch(e){}
}

function currentTheme(){
  return {
    mode:normalizeThemeMode(document.documentElement.getAttribute('data-mode')),
    hl:normalizeHighlight(document.documentElement.getAttribute('data-hl'))
  };
}

function setThemeMode(mode){
  applyTheme({...currentTheme(),mode});
  syncThemeUI();
}

function setThemeAccent(hl){
  applyTheme({...currentTheme(),hl});
  syncThemeUI();
}

function syncThemeUI(){
  const {mode,hl}=currentTheme();
  document.querySelectorAll('#seg-mode .seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.val===mode));
  document.querySelectorAll('.accent-swatch').forEach(s=>s.classList.toggle('active',s.dataset.accent===hl));
}

(function initTheme(){
  applyTheme(readStoredTheme(),false);
  document.addEventListener('DOMContentLoaded',()=>{applyTheme(currentTheme(),false);syncThemeUI();});
})();
