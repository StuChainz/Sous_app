// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
const KEYS={profile:'sous_profile',weights:'sous_weights',log:'sous_log',recipes:'sous_recipes',recalDismissed:'sous_recal_dismissed'};
const getProfile=()=>{try{return JSON.parse(localStorage.getItem(KEYS.profile)||'null')||{};}catch(e){return{};}};
const getWeights=()=>{try{return JSON.parse(localStorage.getItem(KEYS.weights)||'[]');}catch(e){return[];}};
const getLog=()=>{try{return JSON.parse(localStorage.getItem(KEYS.log)||'{}');}catch(e){return{};}};
const getRecipes=()=>{try{return JSON.parse(localStorage.getItem(KEYS.recipes)||'[]');}catch(e){return[];}};
const saveLog=l=>localStorage.setItem(KEYS.log,JSON.stringify(l));
const saveWeights=w=>localStorage.setItem(KEYS.weights,JSON.stringify(w));
const saveProfile=p=>localStorage.setItem(KEYS.profile,JSON.stringify(p));
const saveRecipes=r=>localStorage.setItem(KEYS.recipes,JSON.stringify(r));
const todayStr=()=>new Date().toISOString().slice(0,10);
