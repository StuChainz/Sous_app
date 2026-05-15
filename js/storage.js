// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
const KEYS={profile:'sous_profile',weights:'sous_weights',log:'sous_log',recipes:'sous_recipes',recalDismissed:'sous_recal_dismissed',recentIngredients:'sous_recent_ingredients',usualMeals:'sous_usual_meals',draft:'sous_draft'};
const getProfile=()=>{try{return JSON.parse(localStorage.getItem(KEYS.profile)||'null')||{};}catch(e){return{};}};
const getWeights=()=>{try{return JSON.parse(localStorage.getItem(KEYS.weights)||'[]');}catch(e){return[];}};
const getLog=()=>{try{return JSON.parse(localStorage.getItem(KEYS.log)||'{}');}catch(e){return{};}};
const getRecipes=()=>{try{return JSON.parse(localStorage.getItem(KEYS.recipes)||'[]');}catch(e){return[];}};
const saveLog=l=>localStorage.setItem(KEYS.log,JSON.stringify(l));
const saveWeights=w=>localStorage.setItem(KEYS.weights,JSON.stringify(w));
const saveProfile=p=>localStorage.setItem(KEYS.profile,JSON.stringify(p));
const saveRecipes=r=>localStorage.setItem(KEYS.recipes,JSON.stringify(r));
const todayStr=()=>new Date().toISOString().slice(0,10);
function getRecentIngredients(){try{return JSON.parse(localStorage.getItem(KEYS.recentIngredients)||'[]');}catch(e){return[];}}
function saveRecentIngredients(r){localStorage.setItem(KEYS.recentIngredients,JSON.stringify(r));}
function addToRecentIngredients(ingredient){
  const list=getRecentIngredients().filter(r=>r.name.toLowerCase()!==ingredient.name.toLowerCase());
  list.unshift({name:ingredient.name,kcal:ingredient.kcal,protein:ingredient.protein,carbs:ingredient.carbs,fat:ingredient.fat,fibre:ingredient.fibre!=null?ingredient.fibre:0,lastUsed:Date.now()});
  saveRecentIngredients(list.slice(0,20));
}
window.getRecentIngredients=getRecentIngredients;
window.saveRecentIngredients=saveRecentIngredients;
window.addToRecentIngredients=addToRecentIngredients;

// ═══════════════════════════════════════════
// DRAFT (in-progress cooking log)
// ═══════════════════════════════════════════
function getDraft(){try{return JSON.parse(localStorage.getItem(KEYS.draft)||'null');}catch(e){return null;}}
function saveDraft(d){localStorage.setItem(KEYS.draft,JSON.stringify(d));}
function clearDraft(){localStorage.removeItem(KEYS.draft);}
window.getDraft=getDraft;
window.saveDraft=saveDraft;
window.clearDraft=clearDraft;
function getLastMealBySection(section){
  const log=getLog();
  const dates=Object.keys(log).sort().reverse();
  for(const date of dates){
    const meals=(log[date].meals||[]).slice().reverse();
    for(const m of meals){
      if((m.section||'').toLowerCase()===section.toLowerCase()) return m;
    }
  }
  return null;
}
window.getLastMealBySection=getLastMealBySection;

// ═══════════════════════════════════════════
// USUAL MEALS
// ═══════════════════════════════════════════
function getUsualMeals(){try{return JSON.parse(localStorage.getItem(KEYS.usualMeals)||'{}');}catch(e){return{};}}
function saveUsualMeals(u){localStorage.setItem(KEYS.usualMeals,JSON.stringify(u));}
function updateUsualMeals(mealObj,typedName=''){
  if(!mealObj.ingredients||!mealObj.ingredients.length) return;
  const section=mealObj.section||'snacks';
  const usual=getUsualMeals();
  if(!usual[section]) usual[section]=[];
  const fp=mealObj.ingredients.map(i=>i.name.toLowerCase().trim()).sort().join('|');
  const now=Date.now();
  const existing=usual[section].find(u=>u.ingredients.map(i=>i.name.toLowerCase().trim()).sort().join('|')===fp);
  if(existing){
    existing.useCount=(existing.useCount||1)+1;
    existing.lastUsed=now;
    if(typedName) existing.name=typedName;
    existing.ingredients=mealObj.ingredients;
  } else {
    usual[section].push({id:'usual_'+now+'_'+Math.random().toString(36).slice(2,7),section,name:mealObj.name,ingredients:mealObj.ingredients,useCount:1,lastUsed:now});
  }
  const recencyBoost=ts=>{const d=(Date.now()-ts)/86400000;return d<2?5:d<7?2:0;};
  usual[section].sort((a,b)=>(b.useCount+recencyBoost(b.lastUsed))-(a.useCount+recencyBoost(a.lastUsed)));
  usual[section]=usual[section].slice(0,5);
  saveUsualMeals(usual);
}
function getUsualMealsForSection(section){
  const usual=getUsualMeals();
  return (usual[section]||[]).filter(u=>!u.section||u.section===section);
}
function renameUsualMeal(section,idx,newName){
  const usual=getUsualMeals();
  if(!usual[section]||!usual[section][idx]) return;
  usual[section][idx].name=newName;
  saveUsualMeals(usual);
}
function removeUsualMeal(section,idx){
  const usual=getUsualMeals();
  if(!usual[section]) return;
  usual[section].splice(idx,1);
  saveUsualMeals(usual);
}
window.getUsualMeals=getUsualMeals;
window.getUsualMealsForSection=getUsualMealsForSection;
window.updateUsualMeals=updateUsualMeals;
window.renameUsualMeal=renameUsualMeal;
window.removeUsualMeal=removeUsualMeal;

// ═══════════════════════════════════════════
// USER FOOD OVERRIDES
// ═══════════════════════════════════════════
function getUserFoodOverrides(){try{return JSON.parse(localStorage.getItem('userFoodOverrides')||'{}');}catch(e){return{};}}
function saveUserFoodOverrides(o){localStorage.setItem('userFoodOverrides',JSON.stringify(o));}
function setFoodOverride(key,macros){const o=getUserFoodOverrides();o[key.toLowerCase().trim()]=macros;saveUserFoodOverrides(o);}
function getFoodOverride(key){if(!key) return null;const o=getUserFoodOverrides();return o[key.toLowerCase().trim()]||null;}
window.getUserFoodOverrides=getUserFoodOverrides;
window.setFoodOverride=setFoodOverride;
window.getFoodOverride=getFoodOverride;
