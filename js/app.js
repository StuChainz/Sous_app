// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
let currentTab='home';
let currentCountry='GLOBAL';
function setAppViewportHeight(){
  const h=window.visualViewport?.height||window.innerHeight;
  if(h) document.documentElement.style.setProperty('--app-height',Math.round(h)+'px');
}
function updateStandaloneModeClass(){
  const standalone=window.navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
  document.documentElement.classList.toggle('standalone-ios',!!standalone);
}
setAppViewportHeight();
updateStandaloneModeClass();
window.addEventListener('resize',setAppViewportHeight,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(setAppViewportHeight,250),{passive:true});
window.visualViewport?.addEventListener('resize',setAppViewportHeight,{passive:true});
function getFoodDatabase(){
  const foods=typeof getPreferredFoods==='function'?getPreferredFoods(currentCountry):FOODS;
  return foods&&foods.length?foods:FOODS;
}
window.getFoodDatabase=getFoodDatabase;
function setCurrentCountry(countryCode){
  currentCountry=typeof normaliseUserCountry==='function'?normaliseUserCountry(countryCode):String(countryCode||'GLOBAL').toUpperCase().trim()||'GLOBAL';
  window.currentCountry=currentCountry;
  return currentCountry;
}
window.setCurrentCountry=setCurrentCountry;
function switchTab(tab,opts={}){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bottom-tabs .tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('pane-'+tab).classList.add('active');
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  const prev=currentTab; currentTab=tab;
  if(prev==='log'&&tab!=='log'){
    if(typeof stopAllVoiceActivity==='function') stopAllVoiceActivity('screen leave');
    else if(typeof stopAllRec==='function') stopAllRec();
  }
  if(tab==='home') renderHome();
  if(tab==='history') { if(typeof renderHistoryDay==='function') renderHistoryDay(); }
  if(tab==='recipes') { if(typeof renderRecipeList==='function') renderRecipeList(); }
  if(tab==='profile') { if(typeof renderMealMemoryManagement==='function') renderMealMemoryManagement(); }
  if(tab==='log'){
    if(opts.fresh){
      if(opts.silent&&typeof startSilentLog==='function') startSilentLog(opts.section||null,opts.quick||false);
      else if(typeof startFreshLog==='function') startFreshLog(opts.section||null);
    }
    else { if(typeof resumeLog==='function') resumeLog(); }
  }
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function showToast(msg,d=2200){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._tid); t._tid=setTimeout(()=>t.classList.remove('show'),d);
}
function shouldConfirmFoodMatch(rawText,item){
  if(!item||!item.rawFood||typeof getFoodTextMatch!=='function') return true;
  const text=typeof _normaliseChoiceText==='function'?_normaliseChoiceText(rawText):String(rawText||'');
  const match=getFoodTextMatch(text,{includeCustom:true});
  if(!match||!match.food) return true;
  const matchedKey=String(match.food.id||match.food.name);
  const itemKey=String(item.rawFood.id||item.rawFood.name);
  return matchedKey!==itemKey||match.shouldConfirm;
}
window.shouldConfirmFoodMatch=shouldConfirmFoodMatch;

function nutritionPer100gFromFood(food){
  if(!food) return null;
  if(food.nutritionPer100g) return {...food.nutritionPer100g};
  const w=Number(food.w)||100;
  return {
    calories:Math.round((Number(food.kcal)||0)*100/w),
    protein:Math.round((Number(food.p)||0)*100/w*10)/10,
    carbs:Math.round((Number(food.c)||0)*100/w*10)/10,
    fat:Math.round((Number(food.f)||0)*100/w*10)/10,
    fibre:Math.round((Number(food.fi)||0)*100/w*10)/10
  };
}
function createMealDraft({section=null,source='manual',ingredients=[],needsConfirmation,questions}={}){
  const draft={section,source,createdAt:Date.now(),ingredients:ingredients.map(createIngredientDraft)};
  if(needsConfirmation!=null) draft.needsConfirmation=!!needsConfirmation;
  if(questions!=null) draft.questions=questions;
  return draft;
}
function createIngredientDraft(input={}){
  const food=input.rawFood||input.food||null;
  const serving=input.serving||null;
  const unit=serving?.label||input.unit||(input.type==='liquid'?'ml':'g');
  const quantity=serving?.quantity!=null?serving.quantity:(input.quantity!=null?input.quantity:(input.weight!=null?input.weight:1));
  const draft={
    inputName:input.inputName||input.heardName||input.name||input.displayName||'',
    displayName:input.displayName||input.name||input.inputName||'',
    quantity,
    unit
  };
  if(food?.id) draft.matchedFoodId=food.id;
  if(input.weight!=null) draft.grams=Math.round(Number(input.weight)||0);
  const per100=nutritionPer100gFromFood(food);
  if(per100) draft.nutritionPer100g=per100;
  if(serving?.nutritionPerUnit) draft.nutritionPerUnit={...serving.nutritionPerUnit};
  if(input.confidence) draft.confidence=input.confidence;
  return draft;
}
function draftIngredientToMealItem(ingredient){
  const grams=ingredient.grams!=null?Math.round(Number(ingredient.grams)||0):null;
  const per100=ingredient.nutritionPer100g||null;
  const r=grams&&per100?grams/100:0;
  return {
    name:ingredient.displayName||ingredient.inputName,
    weight:grams,
    kcal:Math.round((Number(per100?.calories)||0)*r),
    protein:Math.round((Number(per100?.protein)||0)*r*10)/10,
    carbs:Math.round((Number(per100?.carbs)||0)*r*10)/10,
    fat:Math.round((Number(per100?.fat)||0)*r*10)/10,
    fibre:Math.round((Number(per100?.fibre)||0)*r*10)/10,
    icon:'ti-clipboard',
    type:ingredient.unit==='ml'?'liquid':'solid'
  };
}
function draftToMeal(draft){
  const ingredients=(draft.meal||draft.savedIngredients||draft.ingredients||[]).map(i=>{
    if(i.displayName||i.inputName) return draftIngredientToMealItem(i);
    return {...i};
  });
  const mt=typeof sumMacros==='function'?sumMacros(ingredients):{kcal:0,protein:0,carbs:0,fat:0,fibre:0};
  return {
    name:draft.name||'Meal',
    time:draft.time||new Date(draft.createdAt||Date.now()).toISOString(),
    section:draft.section,
    ingredients,
    totals:{
      kcal:Math.round(mt.kcal),
      protein:Math.round(mt.protein*10)/10,
      carbs:Math.round(mt.carbs*10)/10,
      fat:Math.round(mt.fat*10)/10,
      fibre:Math.round(mt.fibre*10)/10
    }
  };
}
window.createMealDraft=createMealDraft;
window.createIngredientDraft=createIngredientDraft;
window.draftToMeal=draftToMeal;

// ═══════════════════════════════════════════
// AI FALLBACK — PARSER → AI INTERPRETATION
// ═══════════════════════════════════════════
// Experimental. Parser is always tried first.
// AI is only called when the parser finds zero food items, OR when the parser
// found some food(s) but meaningful unresolved words remain in the transcript.
// All AI results require user confirmation — nothing is auto-saved.

let _lastAITranscript=null;

function hasExplicitAIDevOverride(){
  try{
    if(localStorage.getItem('sous_voice_test_harness')==='1') return true;
    const globalConfig=window.SOUS_AI_CONFIG||{};
    if(globalConfig.dev===true||globalConfig.allowAI===true) return true;
    const stored=safeJsonParse(localStorage.getItem('sous_ai_config'),{});
    return stored.dev===true||stored.allowAI===true;
  }catch(e){
    return false;
  }
}
function canUseAIInterpretation(){
  const plan=(localStorage.getItem('userPlan')||'').trim().toLowerCase();
  return plan==='pro'||hasExplicitAIDevOverride();
}

function normalizeAIActionText(text){
  if(typeof normaliseLogText==='function') return normaliseLogText(text||'');
  return String(text||'').toLowerCase().trim();
}

function aiActionCurrentIndexFromRef(ref){
  const match=String(ref||'').match(/^current:item:(\d+)$/);
  if(!match) return -1;
  const index=Number(match[1]);
  return Number.isInteger(index)&&index>=0&&index<meal.length?index:-1;
}

function findCurrentMealItemIndexByName(name){
  const target=normalizeAIActionText(name);
  if(!target) return meal.length?meal.length-1:-1;
  let best=-1,bestScore=0;
  meal.forEach((item,index)=>{
    const itemName=normalizeAIActionText(item.name||'');
    const rawName=normalizeAIActionText(item.rawFood?.name||'');
    const haystack=[itemName,rawName].filter(Boolean).join(' ');
    let score=0;
    if(itemName===target||rawName===target) score=1000;
    else if(haystack.includes(target)) score=700+target.length;
    else {
      target.split(/\s+/).filter(t=>t.length>2).forEach(token=>{
        if(haystack.includes(token)) score+=token.length;
      });
    }
    if(score>0&&index===meal.length-1) score+=2;
    if(score>bestScore){best=index;bestScore=score;}
  });
  return bestScore>0?best:-1;
}

function aiActionTargetIndex(action={},change=null){
  const ref=change?.targetRef||action.target?.ref||null;
  const refIndex=aiActionCurrentIndexFromRef(ref);
  if(refIndex>=0) return refIndex;
  if(action.target?.scope==='last_item') return meal.length?meal.length-1:-1;
  return findCurrentMealItemIndexByName(change?.from||change?.food||action.targetFood||action.target?.food||action.food);
}

function aiActionResolveFood(name){
  const text=String(name||'').trim();
  if(!text) return {food:null,error:'missing_food'};
  if(typeof resolveReplacementFood==='function'){
    const resolved=resolveReplacementFood(text);
    if(resolved.ambiguous) return {food:null,ambiguous:true,options:resolved.options||[]};
    return {food:resolved.food||null,error:resolved.food?null:'food_not_found'};
  }
  const food=typeof findFoodByText==='function'?findFoodByText(text):null;
  return {food,error:food?null:'food_not_found'};
}

function aiActionCommitCurrentMeal(message,key='updated'){
  if(typeof _persistDraft==='function') _persistDraft();
  if(typeof renderCurrentMeal==='function') renderCurrentMeal();
  if(typeof updateHome==='function') updateHome();
  if(message) showToast(message,2600);
  if(typeof speakCachedResponse==='function') speakCachedResponse(key,{},()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
  else if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);
}

function applyAIReplaceFood(action,change=null){
  const replacement=change?.to||change?.food||action.replacementFood||action.food;
  const idx=aiActionTargetIndex(action,change);
  if(idx<0) return {ok:false,message:"Couldn't find that item."};
  const resolved=aiActionResolveFood(replacement);
  if(resolved.ambiguous) return {ok:false,message:'Which one did you mean?'};
  if(!resolved.food) return {ok:false,message:"Couldn't match the replacement food."};
  snapshotMeal();
  const item=meal[idx];
  const grams=item.weight||resolved.food.w;
  if(typeof recalcMealItemFromFood==='function') recalcMealItemFromFood(item,resolved.food,grams);
  else Object.assign(item,foodScale(resolved.food,grams),{rawFood:resolved.food});
  if(typeof syncServingFromWeight==='function') syncServingFromWeight(item);
  aiActionCommitCurrentMeal('Updated '+item.name,'updated');
  return {ok:true};
}

function applyAIRemoveFood(action,change=null){
  const idx=aiActionTargetIndex(action,change);
  if(idx<0) return {ok:false,message:"Couldn't find that item."};
  snapshotMeal();
  const removed=meal.splice(idx,1)[0];
  aiActionCommitCurrentMeal((removed?.name||'Item')+' removed','removed');
  return {ok:true};
}

function applyAIChangeQuantity(action,change=null){
  const shouldUseSourceFirst=!!(action.source&&(action.source.ref||action.source.kind==='history_meal'||action.source.kind==='usual_meal'||action.source.date||action.source.dateOffset!=null||action.source.when));
  if(shouldUseSourceFirst){
    const sourceMeal=action.source.kind==='usual_meal'?findAIUsualMeal(action):findAIHistoryMeal(action.source);
    if(sourceMeal){
      const sourceItems=(sourceMeal.ingredients||[]).map(cloneMealIngredientForAIAction);
      const targetIndex=findAIItemIndex(sourceItems,{targetRef:action.target?.ref,from:action.targetFood||action.target?.food||action.food});
      if(targetIndex>=0){
        const item=sourceItems[targetIndex];
        const result=applyAIChangeToClonedItems(sourceItems,{
          op:Number.isFinite(Number(action.factor))?'scale':'set_quantity',
          targetRef:null,
          from:item.name,
          to:null,
          food:item.name,
          quantityText:action.quantityText,
          factor:action.factor
        });
        if(!result.ok) return result;
        return addAIClonedItemsToCurrent([sourceItems[targetIndex]],sourceMeal,'history-item-ai');
      }
    }
  }
  const idx=aiActionTargetIndex(action,change);
  if(idx<0&&action.source){
    const sourceMeal=action.source.kind==='usual_meal'?findAIUsualMeal(action):findAIHistoryMeal(action.source);
    if(sourceMeal){
      const sourceItems=(sourceMeal.ingredients||[]).map(cloneMealIngredientForAIAction);
      const targetIndex=findAIItemIndex(sourceItems,{targetRef:action.target?.ref,from:action.targetFood||action.target?.food||action.food});
      if(targetIndex>=0){
        const item=sourceItems[targetIndex];
        const result=applyAIChangeToClonedItems(sourceItems,[{
          op:Number.isFinite(Number(action.factor))?'scale':'set_quantity',
          targetRef:null,
          from:item.name,
          to:null,
          food:item.name,
          quantityText:action.quantityText,
          factor:action.factor
        }][0]);
        if(!result.ok) return result;
        return addAIClonedItemsToCurrent([sourceItems[targetIndex]],sourceMeal,'history-item-ai');
      }
    }
  }
  if(idx<0) return {ok:false,message:"Couldn't find that item."};
  const item=meal[idx];
  const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
  let grams=null;
  const factor=change?.factor??action.factor;
  if(Number.isFinite(Number(factor))&&Number(factor)>0){
    grams=Math.round((item.weight||food?.w||100)*Number(factor));
  } else {
    const quantityText=change?.quantityText||action.quantityText;
    grams=typeof gramsFromQuantityText==='function'?gramsFromQuantityText(quantityText,food):null;
  }
  if(!grams||grams<=0) return {ok:false,message:"I couldn't catch the amount."};
  snapshotMeal();
  if(food&&typeof recalcMealItemFromFood==='function') recalcMealItemFromFood(item,food,grams);
  else item.weight=Math.round(grams);
  if(typeof syncServingFromWeight==='function') syncServingFromWeight(item);
  aiActionCommitCurrentMeal('Updated '+item.name,'updated');
  return {ok:true};
}

function applyAIActionToCurrentMeal(action){
  if(!action||!action.type) return {ok:false};
  if(action.type==='replace_food') return applyAIReplaceFood(action);
  if(action.type==='remove_food') return applyAIRemoveFood(action);
  if(action.type==='change_quantity') return applyAIChangeQuantity(action);
  if(action.type==='repeat_meal'||action.type==='add_usual_meal') return applyAIRepeatMeal(action);
  if(action.type==='modify_meal_copy') return applyAIModifyMealCopy(action);
  return {ok:false,unsupported:true};
}

function cloneMealIngredientForAIAction(item,index=0){
  const copy={...(item||{})};
  delete copy.id;
  if(!copy.name) copy.name='Item '+(index+1);
  return copy;
}

function localDateOffset(days){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return localDateKey(d);
}

function aiHistoryMealFromRef(ref){
  const match=String(ref||'').match(/^history:(\d{4}-\d{2}-\d{2}):(\d+)$/);
  if(!match||typeof getLog!=='function') return null;
  const log=getLog();
  const date=match[1],index=Number(match[2]);
  const mealObj=log[date]?.meals?.[index];
  return mealObj?{...mealObj,_historyDate:date,_historyIndex:index}:null;
}

function aiUsualMealFromRef(ref){
  const match=String(ref||'').match(/^usual:([^:]+):(\d+)$/);
  if(!match||typeof getUsualMeals!=='function') return null;
  const section=match[1],index=Number(match[2]);
  const mealObj=getUsualMeals()?.[section]?.[index];
  return mealObj?{...mealObj,section:mealObj.section||section,_usualIndex:index}:null;
}

function aiMealSearchScore(mealObj,query){
  const q=normalizeAIActionText(query);
  if(!q) return 0;
  const haystack=normalizeAIActionText([
    mealObj?.name,
    mealObj?.section,
    ...(mealObj?.ingredients||[]).map(i=>i.name)
  ].filter(Boolean).join(' '));
  if(!haystack) return 0;
  if(haystack.includes(q)) return 600+q.length;
  return q.split(/\s+/).filter(t=>t.length>2).reduce((score,token)=>score+(haystack.includes(token)?token.length:0),0);
}

function findAIHistoryMeal(source={}){
  const byRef=aiHistoryMealFromRef(source?.ref);
  if(byRef) return byRef;
  if(typeof getLog!=='function') return null;
  const log=getLog();
  const section=String(source?.section||'').toLowerCase().trim();
  const date=source?.date||(
    Number.isFinite(Number(source?.dateOffset))?localDateOffset(Number(source.dateOffset)):
    source?.when==='yesterday'?localDateOffset(-1):null
  );
  const dates=(date?[date]:Object.keys(log||{}).sort().reverse()).filter(Boolean);
  let best=null,bestScore=-1;
  dates.forEach(day=>{
    const meals=Array.isArray(log[day]?.meals)?log[day].meals:[];
    meals.forEach((mealObj,index)=>{
      if(section&&String(mealObj.section||'').toLowerCase()!==section) return;
      let score=source?.when==='latest'||date?1000-index:10-index;
      if(source?.query) score+=aiMealSearchScore(mealObj,source.query);
      if(score>bestScore){best={...mealObj,_historyDate:day,_historyIndex:index};bestScore=score;}
    });
  });
  return best;
}

function findAIUsualMeal(action={}){
  const byRef=aiUsualMealFromRef(action.usualRef||action.source?.ref);
  if(byRef) return byRef;
  if(typeof findUsualMealByCommand==='function'){
    const usual=findUsualMealByCommand({
      command:'addUsualMeal',
      section:action.section||action.source?.section||null,
      query:action.source?.query||action.food||action.targetFood||''
    });
    if(usual) return usual;
  }
  if(typeof getUsualMeals!=='function') return null;
  const usuals=getUsualMeals()||{};
  let best=null,bestScore=0;
  Object.keys(usuals).forEach(section=>{
    (usuals[section]||[]).forEach((mealObj,index)=>{
      const score=aiMealSearchScore(mealObj,action.source?.query||action.food||action.targetFood||action.replacementFood);
      if(score>bestScore){best={...mealObj,section:mealObj.section||section,_usualIndex:index};bestScore=score;}
    });
  });
  return best;
}

function aiItemIndexFromAnyRef(ref){
  const match=String(ref||'').match(/:item:(\d+)$/);
  if(!match) return -1;
  const index=Number(match[1]);
  return Number.isInteger(index)&&index>=0?index:-1;
}

function findAIItemIndex(items,change={}){
  const refIndex=aiItemIndexFromAnyRef(change.targetRef);
  if(refIndex>=0&&refIndex<items.length) return refIndex;
  const target=change.from||change.food;
  if(!target) return items.length===1?0:-1;
  let best=-1,bestScore=0;
  items.forEach((item,index)=>{
    const haystack=normalizeAIActionText([item.name,item.rawFood?.name].filter(Boolean).join(' '));
    const q=normalizeAIActionText(target);
    let score=0;
    if(haystack===q) score=1000;
    else if(haystack.includes(q)) score=700+q.length;
    else q.split(/\s+/).filter(t=>t.length>2).forEach(token=>{if(haystack.includes(token)) score+=token.length;});
    if(score>bestScore){best=index;bestScore=score;}
  });
  return bestScore>0?best:-1;
}

function applyAIChangeToClonedItems(items,change){
  if(!change||!change.op) return {ok:true};
  if(change.op==='add'){
    const resolved=aiActionResolveFood(change.food||change.to);
    if(!resolved.food) return {ok:false,message:"Couldn't match the food to add."};
    const grams=typeof gramsFromQuantityText==='function'?gramsFromQuantityText(change.quantityText,resolved.food):null;
    items.push({...foodScale(resolved.food,grams||resolved.food.w),rawFood:resolved.food,weightSpecified:!!grams});
    return {ok:true};
  }
  const idx=findAIItemIndex(items,change);
  if(idx<0) return {ok:false,message:"Couldn't find that item."};
  if(change.op==='remove'){
    items.splice(idx,1);
    return {ok:true};
  }
  if(change.op==='replace'){
    const resolved=aiActionResolveFood(change.to||change.food);
    if(!resolved.food) return {ok:false,message:"Couldn't match the replacement food."};
    const grams=items[idx].weight||resolved.food.w;
    items[idx]={...foodScale(resolved.food,grams),rawFood:resolved.food,weightSpecified:!!items[idx].weight};
    return {ok:true};
  }
  if(change.op==='scale'||change.op==='set_quantity'){
    const item=items[idx];
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    let grams=null;
    if(change.op==='scale'&&Number.isFinite(Number(change.factor))&&Number(change.factor)>0){
      grams=Math.round((item.weight||food?.w||100)*Number(change.factor));
    } else {
      grams=typeof gramsFromQuantityText==='function'?gramsFromQuantityText(change.quantityText,food):null;
    }
    if(!grams||grams<=0) return {ok:false,message:"I couldn't catch the amount."};
    if(food&&typeof foodScale==='function') items[idx]={...item,...foodScale(food,grams),rawFood:food,weightSpecified:true};
    else items[idx]={...item,weight:Math.round(grams),weightSpecified:true};
    return {ok:true};
  }
  return {ok:true};
}

function addAIClonedItemsToCurrent(items,sourceMeal,source='ai-memory'){
  const clean=(items||[]).filter(Boolean);
  if(!clean.length) return {ok:false,message:"That meal doesn't have ingredients yet."};
  snapshotMeal();
  clean.forEach((item,index)=>{
    addIngredientToMeal(cloneMealIngredientForAIAction(item,index),{source,skipSnapshot:true,skipPersist:true});
  });
  currentMealSection=sourceMeal?.section||currentMealSection||defaultSectionFromTime();
  if(typeof _persistDraft==='function') _persistDraft();
  if(typeof renderCurrentMeal==='function') renderCurrentMeal();
  if(typeof updateHome==='function') updateHome();
  showToast('Added '+(sourceMeal?.name||'meal'),2600);
  if(typeof speakSuccessCue==='function') speakSuccessCue(()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
  return {ok:true};
}

function applyAIRepeatMeal(action){
  const sourceMeal=action.type==='add_usual_meal'?findAIUsualMeal(action):findAIHistoryMeal(action.source||{section:action.section,when:'latest'});
  if(!sourceMeal) return {ok:false,message:"Couldn't find that meal."};
  return addAIClonedItemsToCurrent(sourceMeal.ingredients||[],sourceMeal,action.type==='add_usual_meal'?'usual-ai':'history-ai');
}

function applyAIModifyMealCopy(action){
  const sourceMeal=action.source?.kind==='usual_meal'?findAIUsualMeal(action):findAIHistoryMeal(action.source||{});
  if(!sourceMeal) return {ok:false,message:"Couldn't find that meal."};
  let items=(sourceMeal.ingredients||[]).map(cloneMealIngredientForAIAction);
  for(const change of action.changes||[]){
    const result=applyAIChangeToClonedItems(items,change);
    if(!result.ok) return result;
  }
  return addAIClonedItemsToCurrent(items,sourceMeal,'modified-history-ai');
}

function deterministicMemorySection(text){
  const s=String(text||'').toLowerCase();
  if(/\bbreakfast\b/.test(s)) return 'breakfast';
  if(/\blunch\b/.test(s)) return 'lunch';
  if(/\b(?:dinner|tea|supper)\b/.test(s)) return 'dinner';
  if(/\b(?:snack|snacks)\b/.test(s)) return 'snacks';
  if(/\bsupplements?\b/.test(s)) return 'supplements';
  return null;
}
function deterministicMemoryQuery(text){
  return String(text||'')
    .replace(/\b(?:add|log|track|use|copy|repeat|same|again|my|the|meal|usual|regular|last)\b/g,' ')
    .replace(/\b(?:as|from|like|for)\s+yesterday(?:'s)?\b/g,' ')
    .replace(/\byesterday(?:'s)?\b/g,' ')
    .replace(/\b(?:breakfast|lunch|dinner|tea|supper|snack|snacks|supplements?)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function parseDeterministicMemoryCommand(transcript){
  const normalized=typeof normaliseLogText==='function'
    ?normaliseLogText(transcript)
    :String(transcript||'').toLowerCase().trim();
  if(!normalized) return null;
  const section=deterministicMemorySection(normalized);
  const query=deterministicMemoryQuery(normalized);
  const asksUsual=/\b(?:usual|regular)\b/.test(normalized);
  const asksYesterday=/\byesterday(?:'s)?\b/.test(normalized);
  const asksRepeat=/^(?:same|repeat|copy|last)\b/.test(normalized)||/\b(?:same|repeat|copy)\s+(?:meal|breakfast|lunch|dinner|tea|supper|snacks?|supplements?)\b/.test(normalized);
  const asksMemoryEdit=/\b(?:replace|change|swap|instead|remove|delete|half|halve|double|thing|something)\b/.test(normalized);
  const asksPlainYesterdayCopy=asksYesterday&&!asksMemoryEdit&&(/^(?:same(?:\s+as)?|repeat|copy|use|log)?\s*yesterday(?:'s)?(?:\s+(?:meal|breakfast|lunch|dinner|tea|supper|snacks?|supplements?))?$/.test(normalized)||/^(?:same(?:\s+as)?|repeat|copy|use|log)\s+(?:the\s+)?(?:breakfast|lunch|dinner|tea|supper|snacks?|supplements?)\s+from\s+yesterday$/.test(normalized));
  if(asksUsual) return {type:'usual',section,query};
  if(asksRepeat||asksPlainYesterdayCopy){
    if(!asksYesterday&&!section&&!/\bmeal\b/.test(normalized)) return null;
    return {type:'history',section,query,when:asksYesterday?'yesterday':'latest'};
  }
  return null;
}
function deterministicYesterdayMealResult(section,query){
  if(section||query||typeof getLog!=='function') return null;
  const date=localDateOffset(-1);
  const meals=Array.isArray(getLog()?.[date]?.meals)?getLog()[date].meals:[];
  if(meals.length===1) return {meal:{...meals[0],_historyDate:date,_historyIndex:0}};
  if(meals.length>1) return {ambiguous:true,message:'Which meal from yesterday?'};
  return {missing:true};
}
function handleDeterministicMemoryCommand(command,transcript){
  if(!command) return false;
  if(typeof voiceDebugTrace==='function'){
    voiceDebugTrace('parser_result',{
      source:'deterministic-memory',
      transcript:String(transcript||'').trim(),
      escalationReason:'none',
      results:[{command:command.type,section:command.section||null,query:command.query||'',when:command.when||null}]
    });
  }
  let sourceMeal=null;
  if(command.type==='usual'){
    sourceMeal=findAIUsualMeal({section:command.section,source:{query:command.query,section:command.section,kind:'usual_meal'}});
  } else {
    const yesterday=command.when==='yesterday'?deterministicYesterdayMealResult(command.section,command.query):null;
    if(yesterday?.ambiguous){
      showToast(yesterday.message,2600);
      if(typeof speakCachedResponse==='function') speakCachedResponse('clarification_needed',{},()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
      else if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);
      return true;
    }
    sourceMeal=yesterday?.meal||findAIHistoryMeal({section:command.section,query:command.query,when:command.when});
  }
  if(!sourceMeal){
    const message=command.type==='usual'?"Couldn't find that usual meal.":"Couldn't find that meal.";
    showToast(message,2600);
    if(typeof speakCachedResponse==='function') speakCachedResponse('recovery',{},()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
    else if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);
    return true;
  }
  const source=command.type==='usual'?'usual-deterministic':'history-deterministic';
  const applied=addAIClonedItemsToCurrent(sourceMeal.ingredients||[],sourceMeal,source);
  if(!applied.ok&&applied.message) showToast(applied.message,2600);
  return true;
}

function mealMemoryDebugSummary(memory){
  if(!memory) return null;
  return {
    id:memory.id||null,
    name:memory.name||'',
    section:memory.section||null,
    ingredientCount:Array.isArray(memory.ingredients)?memory.ingredients.length:0,
    useCount:Number(memory.useCount)||0
  };
}
function mealMemoryTransformTarget(items,target){
  const q=normalizeAIActionText(target);
  if(!q) return {index:items.length===1?0:-1,ambiguous:false,score:items.length===1?500:0};
  const matches=[];
  items.forEach((item,index)=>{
    const haystack=normalizeAIActionText([item.name,item.rawFood?.name].filter(Boolean).join(' '));
    let score=0;
    if(haystack===q) score=1000;
    else if(haystack.includes(q)) score=760+q.length;
    else if(q.includes(haystack)&&haystack.length>2) score=700+haystack.length;
    else q.split(/\s+/).filter(token=>token.length>2).forEach(token=>{if(haystack.includes(token)) score+=token.length;});
    if(score>0) matches.push({index,score});
  });
  matches.sort((a,b)=>b.score-a.score);
  if(!matches.length) return {index:-1,ambiguous:false,score:0};
  const tied=matches.filter(match=>Math.abs(match.score-matches[0].score)<20);
  return {index:matches[0].index,ambiguous:tied.length>1,score:matches[0].score};
}
function parseMealMemoryTransform(transformText){
  const text=typeof normalizeMealMemoryPhrase==='function'
    ?normalizeMealMemoryPhrase(transformText)
    :normalizeAIActionText(transformText);
  if(!text) return null;
  let m=text.match(/^(?:no|without|remove|delete)\s+(?:the\s+)?(.+)$/);
  if(m) return {op:'remove',target:m[1].trim()};
  m=text.match(/^(?:half|halve)\s+(?:the\s+)?(.+)$/);
  if(m) return {op:'scale',factor:0.5,target:m[1].trim()};
  m=text.match(/^double\s+(?:the\s+)?(.+)$/);
  if(m) return {op:'scale',factor:2,target:m[1].trim()};
  const quantityStart='(?:about\\s+|around\\s+|roughly\\s+)?(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\\b.*';
  m=text.match(new RegExp('^(?:make|set|change)\\s+(?:the\\s+)?(.+?)\\s+(?:to\\s+)?('+quantityStart+')$'));
  if(m) return {op:'set_quantity',target:m[1].trim(),quantityText:m[2].trim()};
  m=text.match(/^(?:add|with|plus)\s+(.+)$/);
  if(m) return {op:'add',addText:m[1].trim(),target:m[1].trim()};
  return {op:'unsupported',target:text};
}
function applyMealMemoryTransformToItems(items,transformText){
  const transform=parseMealMemoryTransform(transformText);
  if(!transform) return {ok:true,items,transform:null};
  if(transform.op==='unsupported') return {ok:false,items,transform,reason:'unsupported_transform',target:transform.target};
  if(transform.op==='add'){
    const parsed=typeof parseText==='function'?parseText(transform.addText):[];
    const foodItems=(Array.isArray(parsed)?parsed:[]).filter(item=>item&&!item.command);
    if(!foodItems.length) return {ok:false,items,transform,reason:'add_parse_failed',target:transform.addText};
    foodItems.forEach((item,index)=>{
      const copy=cloneMealMemoryIngredientForRecall(item,index);
      if(copy) items.push(copy);
    });
    return {ok:true,items,transform};
  }
  const target=mealMemoryTransformTarget(items,transform.target);
  if(target.ambiguous) return {ok:false,items,transform,reason:'ambiguous_target',target:transform.target};
  if(target.index<0) return {ok:false,items,transform,reason:'target_not_found',target:transform.target};
  const change={
    op:transform.op,
    targetRef:'meal-memory:item:'+target.index,
    from:items[target.index]?.name||transform.target,
    food:transform.target,
    quantityText:transform.quantityText,
    factor:transform.factor
  };
  const result=applyAIChangeToClonedItems(items,change);
  if(!result.ok) return {ok:false,items,transform,reason:'change_failed',target:transform.target,message:result.message};
  if(!items.length) return {ok:false,items,transform,reason:'empty_after_transform',target:transform.target};
  return {ok:true,items,transform};
}
function ensureMealMemoryChoiceScreen(){
  let screen=document.getElementById('ls-meal-memory-choice');
  if(screen) return screen;
  screen=document.createElement('div');
  screen.className='log-screen';
  screen.id='ls-meal-memory-choice';
  screen.style.cssText='background:var(--bg);padding:16px 20px calc(var(--tab-h) + 24px);';
  const title=document.createElement('div');
  title.style.cssText='font-size:18px;font-weight:600;color:var(--text);margin-bottom:4px;';
  title.textContent='Which saved meal?';
  const sub=document.createElement('div');
  sub.id='meal-memory-choice-sub';
  sub.style.cssText='font-size:13px;color:var(--text-muted);margin-bottom:14px;';
  const list=document.createElement('div');
  list.id='meal-memory-choice-list';
  list.style.cssText='display:flex;flex-direction:column;gap:8px;';
  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.id='meal-memory-choice-cancel';
  cancel.textContent='Cancel';
  cancel.style.cssText='margin:14px auto 0;display:block;background:none;border:none;color:var(--text-muted);font-size:13px;font-family:inherit;padding:8px 12px;cursor:pointer;';
  screen.append(title,sub,list,cancel);
  const confirm=document.getElementById('ls-confirm');
  if(confirm&&confirm.parentNode) confirm.parentNode.insertBefore(screen,confirm.nextSibling);
  else document.body.appendChild(screen);
  return screen;
}
function showMealMemoryChoicePrompt(matches,transcript){
  const safeMatches=(Array.isArray(matches)?matches:[]).filter(match=>match?.memory);
  if(!safeMatches.length){
    showToast('Which saved meal?',2600);
    if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);
    return;
  }
  ensureMealMemoryChoiceScreen();
  const sub=document.getElementById('meal-memory-choice-sub');
  if(sub) sub.textContent='I heard "'+String(transcript||'').trim()+'". Tap the saved meal to use.';
  const list=document.getElementById('meal-memory-choice-list');
  if(list){
    list.innerHTML='';
    safeMatches.forEach(match=>{
      const memory=match.memory;
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.cssText='width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:10px 12px;font-family:inherit;cursor:pointer;color:var(--text);';
      const info=document.createElement('div');
      const name=document.createElement('div');
      name.style.cssText='font-size:14px;font-weight:600;';
      name.textContent=memory.name||'Saved meal';
      const meta=document.createElement('div');
      meta.style.cssText='font-size:12px;color:var(--text-muted);margin-top:2px;';
      const count=Array.isArray(memory.ingredients)?memory.ingredients.length:0;
      meta.textContent=[memory.section||'meal',count+' item'+(count!==1?'s':'')].join(' · ');
      info.append(name,meta);
      const kcal=document.createElement('div');
      kcal.style.cssText="font-size:12px;color:var(--text-muted);font-family:'Geist Mono',monospace;white-space:nowrap;";
      kcal.textContent=Math.round(Number(memory.totals?.kcal)||0)+' kcal';
      btn.append(info,kcal);
      btn.addEventListener('click',()=>{
        const applied=addMealMemoryToCurrent(memory);
        if(!applied.ok&&applied.message) showToast(applied.message,2600);
        if(typeof showLogScreen==='function') showLogScreen('listening');
        if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(250);
      });
      list.appendChild(btn);
    });
  }
  const cancel=document.getElementById('meal-memory-choice-cancel');
  if(cancel) cancel.onclick=()=>{if(typeof showLogScreen==='function') showLogScreen('listening'); if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);};
  if(typeof showLogScreen==='function') showLogScreen('meal-memory-choice');
  showToast('Which saved meal?',2600);
}
function handlePersonalMealMemoryCommand(transcript){
  if(typeof findBestMealMemoryMatch!=='function') return false;
  const match=findBestMealMemoryMatch(transcript);
  if(!match?.command) return false;
  if(match.ambiguous){
    if(typeof voiceDebugTrace==='function'){
      voiceDebugTrace('parser_result',{
        source:'personal-meal-memory',
        transcript:String(transcript||'').trim(),
        escalationReason:'ambiguous',
        results:(match.matches||[]).map(item=>({command:'personal_meal_memory',ambiguous:true,score:item.score,memory:mealMemoryDebugSummary(item.memory)}))
      });
      voiceDebugTrace('transcript_routed',{route:'personal-meal-memory-ambiguous',source:'handleTranscript',transcript:String(transcript||'').trim()});
    }
    showMealMemoryChoicePrompt(match.matches,transcript);
    return true;
  }
  if(!match.matched||!match.memory) return false;
  if(typeof voiceDebugTrace==='function'){
    voiceDebugTrace('parser_result',{
      source:'personal-meal-memory',
      transcript:String(transcript||'').trim(),
      escalationReason:'none',
      results:[{command:'personal_meal_memory',score:match.score,memory:mealMemoryDebugSummary(match.memory),transformText:match.command.transformText||''}]
    });
    voiceDebugTrace('transcript_routed',{route:'personal-meal-memory',source:'handleTranscript',transcript:String(transcript||'').trim()});
  }
  let transformed=null;
  let applied=null;
  if(match.command.transformText){
    const items=match.memory.ingredients.map(cloneMealMemoryIngredientForRecall).filter(Boolean);
    transformed=applyMealMemoryTransformToItems(items,match.command.transformText);
    if(transformed.ok){
      applied=addMealMemoryToCurrent(match.memory,{ingredients:transformed.items,silentToast:true});
      if(typeof voiceDebugTrace==='function') voiceDebugTrace('meal_memory_transform_applied',{transcript:String(transcript||'').trim(),memory:mealMemoryDebugSummary(match.memory),transform:transformed.transform});
      if(applied.ok) showToast('Added '+(match.memory.name||'meal'),2600);
    } else {
      applied=addMealMemoryToCurrent(match.memory,{silentToast:true});
      if(typeof voiceDebugTrace==='function') voiceDebugTrace('meal_memory_transform_rejected',{transcript:String(transcript||'').trim(),memory:mealMemoryDebugSummary(match.memory),transform:transformed.transform,reason:transformed.reason,target:transformed.target});
      if(applied.ok) showToast('I added the meal. Check the edit for '+(transformed.target||'that item')+'.',3200);
    }
  } else {
    applied=addMealMemoryToCurrent(match.memory);
  }
  if(!applied.ok){
    if(applied.message) showToast(applied.message,2600);
    if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(320);
    return true;
  }
  if(typeof voiceDebugTrace==='function') voiceDebugTrace('final_action',{action:'personal_meal_memory_recall',memory:mealMemoryDebugSummary(match.memory),transformText:match.command.transformText||'',transformApplied:!!(transformed&&transformed.ok)});
  if(typeof speakSuccessCue==='function') speakSuccessCue();
  else if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(250);
  return true;
}

function aiActionHasSourceRef(action){
  const source=action?.source||{};
  return !!(action?.usualRef||source.ref||source.kind==='history_meal'||source.kind==='usual_meal'||source.date||source.dateOffset!=null||source.when||source.section||source.query);
}
function aiActionHasTarget(action,change=null){
  const target=action?.target||{};
  return !!(change?.targetRef||change?.from||change?.food||action?.targetFood||action?.food||target.ref||target.food||target.scope==='last_item'||target.scope==='current_meal');
}
function aiActionGuard(action){
  if(!action||!action.type||action.type==='none') return {ok:false,reason:'empty'};
  if(action.type==='clarify') return {ok:true};
  if(action.confidence==='low') return {ok:false,reason:'low_confidence'};
  if(action.type==='repeat_meal'){
    if(!aiActionHasSourceRef(action)) return {ok:false,reason:'missing_source'};
    return {ok:true};
  }
  if(action.type==='add_usual_meal'){
    if(!(action.usualRef||action.source?.ref||action.section||action.source?.section||action.source?.query||action.food||action.targetFood)) return {ok:false,reason:'missing_usual_ref'};
    return {ok:true};
  }
  if(action.type==='modify_meal_copy'){
    if(!aiActionHasSourceRef(action)) return {ok:false,reason:'missing_source'};
    if(!Array.isArray(action.changes)||!action.changes.length) return {ok:false,reason:'missing_changes'};
    const invalid=action.changes.find(change=>{
      if(change.op==='add') return !(change.food||change.to);
      if(change.op==='scale'||change.op==='set_quantity') return !aiActionHasTarget(action,change)||!(change.quantityText||Number.isFinite(Number(change.factor)));
      if(change.op==='replace') return !aiActionHasTarget(action,change)||!(change.to||change.food);
      return !aiActionHasTarget(action,change);
    });
    if(invalid) return {ok:false,reason:'invalid_change'};
    return {ok:true};
  }
  if(['replace_food','remove_food','change_quantity'].includes(action.type)){
    if(!aiActionHasTarget(action)) return {ok:false,reason:'missing_target'};
    if(action.type==='replace_food'&&!(action.replacementFood||action.food)) return {ok:false,reason:'missing_replacement'};
    if(action.type==='change_quantity'&&!(action.quantityText||Number.isFinite(Number(action.factor)))) return {ok:false,reason:'missing_quantity'};
    return {ok:true};
  }
  return {ok:false,reason:'unsupported_action'};
}

// Words that carry no food meaning and are safe to ignore when scanning
// for unresolved terms after parser matches.
const _PARTIAL_FILLER=new Set([
  'a','an','the','of','in','on','for','with','and','plus','or','but',
  'some','any','i','had','ate','have','add','log','track','hey','sous','sue',
  'please','about','approx','approximately','also','not','no','bit','little',
  'very','really','quite','just','extra','more','then','too','so',
  'cooked','raw','fresh','large','small','medium','big','whole','full',
  'thing','something','unknown','other','another','stuff',
  'half','piece','pieces','slice','slices','serving','servings',
  'portion','portions','can','cans','tin','tins'
]);

// Words that look like food ingredients.  If any of these remain in the
// transcript after stripping matched foods and fillers, the parse is partial.
const _PARTIAL_MEANINGFUL=new Set([
  'sauce','dressing','beans','bean','cheese','curry','yoghurt','yogurt',
  'bread','rice','pasta','noodles','noodle','soup','gravy','cream',
  'butter','oil','milk','egg','eggs','meat','fish','chicken','beef',
  'pork','lamb','turkey','duck','tofu','nuts','nut','seeds','seed',
  'flour','sugar','honey','jam','ketchup','mayo','mustard','vinegar',
  'salsa','hummus','pesto','tahini','salad','wrap','burger','sandwich',
  'bagel','cereal','oats','granola','fruit','veg','vegetable','vegetables',
  'chocolate','cake','cookie','biscuit','muffin','brownie','chips','crisps',
  'cracker','crackers','popcorn','avocado','spinach','broccoli','tomato',
  'potato','potatoes','carrot','onion','garlic','ginger','lemon','lime',
  'apple','banana','orange','strawberry','mango','mushroom','mushrooms',
  'pepper','peppers','lettuce','cucumber','corn','peas','lentils','lentil',
  'chickpeas','chickpea','tempeh','sausage','bacon','ham','steak','mince',
  'fillet','quark','cottage','feta','cheddar','mozzarella','parmesan'
]);

// Returns true when the parser matched food(s) but the original transcript
// still contains unresolved meaningful food-like words — indicating a partial
// interpretation that should not be silently accepted.
function detectMixedPartial(transcript,results){
  const foodResults=results.filter(r=>!r.command&&!r.ambiguous&&r.rawFood);
  const ambigResults=results.filter(r=>!r.command&&r.ambiguous);
  // Only relevant when something was matched (exact food or ambig trigger)
  if(!foodResults.length&&!ambigResults.length) return false;

  let text=typeof normaliseLogText==='function'?normaliseLogText(transcript):transcript.toLowerCase();

  // Strip quantity patterns
  text=text.replace(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?)\b/gi,' ');
  text=text.replace(/\b\d+\b/g,' ');

  // Strip each matched food's name and keyword aliases
  for(const result of foodResults){
    const food=result.rawFood;
    const terms=[
      food.name.toLowerCase(),
      result.heardName,
      result.rawFoodName,
      ...(food.kw||[]),
      ...(food.aliases||[])
    ];
    for(const kw of terms){
      if(!kw) continue;
      const esc=kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replace(new RegExp('\\b'+esc+'\\b','gi'),' ');
    }
  }

  // Strip ambiguous trigger labels and their option names so they don't
  // count as unresolved — e.g. "chicken" from the chicken ambig trigger.
  for(const result of ambigResults){
    const labels=[result.label,result.heardName,result.rawFoodName];
    for(const rawLabel of labels){
      const label=String(rawLabel||'').toLowerCase().trim();
      if(!label) continue;
      const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replace(new RegExp('\\b'+esc+'\\b','gi'),' ');
    }
    for(const opt of(result.matches||[])){
      const optName=String(opt.name||'').toLowerCase();
      if(optName){
        const esc=optName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        text=text.replace(new RegExp('\\b'+esc+'\\b','gi'),' ');
      }
    }
  }

  // Check remaining tokens for meaningful food words
  const tokens=text.split(/\s+/).map(t=>t.trim().toLowerCase()).filter(t=>t.length>1);
  for(const token of tokens){
    if(!_PARTIAL_FILLER.has(token)&&_PARTIAL_MEANINGFUL.has(token)) return true;
  }
  return false;
}

function aiEscalationReason(transcript,results){
  if(results&&results.some(r=>r&&r.command)) return 'none';
  if(parserIsUncertain(results)) return 'empty';
  if(detectMixedPartial(transcript,results)) return 'partial';
  if(results&&results.some(r=>!r.command&&r.confidence==='low')) return 'low-confidence';
  return 'none';
}

// Convert an AI draft's ingredients back into parser-shaped items so
// handleParsed can process them through the existing confirmation flow.
function aiDraftToParserResults(draft){
  if(!draft||!Array.isArray(draft.ingredients)||!draft.ingredients.length) return null;
  const WEIGHT_UNITS={g:1,kg:1000,ml:1,l:1000,oz:28.35,tbsp:15,tsp:5};
  return draft.ingredients.map(ing=>{
    const name=String(ing.displayName||ing.inputName||'').trim();
    if(!name) return null;
    const qty=typeof ing.quantity==='number'?ing.quantity:1;
    const unit=String(ing.unit||'').toLowerCase().trim();
    const isWeightUnit=Object.prototype.hasOwnProperty.call(WEIGHT_UNITS,unit);
    const food=typeof findFoodByText==='function'?findFoodByText(name):null;
    const grams=isWeightUnit
      ?Math.round(qty*(WEIGHT_UNITS[unit]||1))
      :food?Math.round(food.w*qty):Math.round(qty*100);
    if(food){
      return{
        ...foodScale(food,grams),
        rawFood:food,
        confidence:'ai',
        needsConfirm:true,
        // weightSpecified false so isClearIngredient never auto-adds AI items
        weightSpecified:false
      };
    }
    // Food not in local database — surface name for manual review
    return{
      name,
      weight:grams,
      kcal:0,protein:0,carbs:0,fat:0,fibre:0,
      icon:'ti-clipboard',
      confidence:'ai',
      needsConfirm:true,
      weightSpecified:false
    };
  }).filter(Boolean);
}

// Async entry point used by speech.js instead of the raw parseText→handleParsed pair.
// Tries the parser; falls back to AI when the parser finds no food OR when the
// parser found food(s) but meaningful unresolved words remain in the transcript.
async function handleTranscript(transcript,rawText,voiceContext=null){
  const cleanTranscript=String(transcript||'').trim();
  const voiceTurnOk=phase=>typeof isVoiceTurnValid!=='function'||isVoiceTurnValid(voiceContext,phase);
  if(!voiceTurnOk('handle_transcript_start')) return;
  if(handlePersonalMealMemoryCommand(cleanTranscript)) return;
  if(handleDeterministicMemoryCommand(parseDeterministicMemoryCommand(cleanTranscript),cleanTranscript)) return;
  if(cleanTranscript&&canUseAIInterpretation()&&typeof aiActionReferenceTrigger==='function'&&aiActionReferenceTrigger(cleanTranscript)&&typeof interpretMealActionWithAI==='function'){
    try{
      const action=await interpretMealActionWithAI({
        transcript:cleanTranscript,
        section:typeof currentMealSection!=='undefined'?currentMealSection:null,
        countryCode:typeof currentCountry!=='undefined'?currentCountry:null
      });
      if(!voiceTurnOk('handle_transcript_after_ai_action')) return;
      if(action&&action.type==='clarify'){
        const msg=action.message||'I need one more detail.';
        showToast(msg,3200);
        const el=document.getElementById('transcript-text'); if(el) el.textContent=msg;
        if(typeof speakCachedResponse==='function') speakCachedResponse('clarification_needed',{},()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
        return;
      }
      if(action&&['replace_food','remove_food','change_quantity','repeat_meal','add_usual_meal','modify_meal_copy'].includes(action.type)){
        if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_action_result',{transcript:cleanTranscript,action});
        const guard=aiActionGuard(action);
        if(!guard.ok){
          if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_action_rejected',{transcript:cleanTranscript,action,reason:guard.reason});
          if(guard.reason==='low_confidence'){
            showToast("I need one more detail.",2600);
            if(typeof speakCachedResponse==='function') speakCachedResponse('clarification_needed',{},()=>typeof maybeResumeVoiceSession==='function'&&maybeResumeVoiceSession(320));
            return;
          }
        } else {
          if(!voiceTurnOk('handle_transcript_before_ai_action_apply')) return;
          const applied=applyAIActionToCurrentMeal(action);
          if(applied.ok) return;
          if(applied.message) showToast(applied.message,2600);
        }
      } else if(action&&typeof voiceDebugTrace==='function'){
        voiceDebugTrace('ai_action_rejected',{transcript:cleanTranscript,action,reason:action.type==='none'?'none':'unsupported_action'});
      } else if(typeof voiceDebugTrace==='function'){
        voiceDebugTrace('ai_action_result',{transcript:cleanTranscript,action:null,reason:'empty_or_unavailable'});
      }
    }catch(e){
      console.warn('[Sous] AI action error:',e);
      if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_action_error',{transcript:cleanTranscript,message:e?.message||String(e)});
    }
  }
  const results=parseText(transcript);
  const escalationReason=aiEscalationReason(transcript,results);
  const uncertain=escalationReason==='empty'||escalationReason==='low-confidence';
  const mixedPartial=escalationReason==='partial';
  if(typeof voiceDebugTrace==='function'){
    voiceDebugTrace('parser_result',{
      source:'handleTranscript',
      transcript:transcript.trim(),
      escalationReason,
      results:typeof voiceDebugResultSummary==='function'?voiceDebugResultSummary(results):results,
      diagnostics:typeof parserDiagnostics==='function'?parserDiagnostics(transcript,results):null
    });
    voiceDebugTrace('voice_decision',{
      step:'parser_escalation',
      source:'handleTranscript',
      transcript:transcript.trim(),
      reason:escalationReason,
      resultCount:Array.isArray(results)?results.length:0
    });
  }

  if(escalationReason==='none'){
    console.log('[Sous] parser →',results.filter(r=>!r.command).length,'food item(s)');
    if(!voiceTurnOk('handle_transcript_parser_result')) return;
    handleParsed(results,rawText,voiceContext);
    return;
  }

  const key=transcript.trim().toLowerCase();
  if(key===_lastAITranscript){
    // Same input already sent to AI — don't duplicate the call
    if(mixedPartial){
      // Partial match: force confirmation so nothing is auto-saved
      const flagged=results.map(r=>r.command?r:{...r,needsConfirm:true,weightSpecified:false});
      if(!voiceTurnOk('handle_transcript_repeat_partial')) return;
      handleParsed(flagged,rawText,voiceContext);
    } else {
      if(!voiceTurnOk('handle_transcript_repeat_result')) return;
      handleParsed(results,rawText,voiceContext);
    }
    return;
  }
  _lastAITranscript=key;

  if(mixedPartial){
    console.log('[Sous] parser partial match — unresolved meaningful words, trying AI for:',transcript.trim());
  } else if(escalationReason==='low-confidence'){
    console.log('[Sous] parser low confidence — trying AI for:',transcript.trim());
  } else {
    console.log('[Sous] parser uncertain — trying AI for:',transcript.trim());
  }

  if(canUseAIInterpretation()){
    console.log('[Sous] AI allowed');
    if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_escalation',{transcript:transcript.trim(),reason:escalationReason,allowed:true});
    if(typeof voiceDebugTrace==='function') voiceDebugTrace('voice_decision',{step:'ai_interpret_escalation',transcript:transcript.trim(),reason:escalationReason,allowed:true});
    try{
      if(typeof interpretMealWithAI==='function'){
        const draft=await interpretMealWithAI({
          transcript:transcript.trim(),
          section:typeof currentMealSection!=='undefined'?currentMealSection:null,
          countryCode:typeof currentCountry!=='undefined'?currentCountry:null
        });
        if(!voiceTurnOk('handle_transcript_after_ai_fallback')) return;
        const aiItems=aiDraftToParserResults(draft);
        if(typeof voiceDebugTrace==='function'){
          voiceDebugTrace('ai_result',{
            transcript:transcript.trim(),
            items:typeof voiceDebugResultSummary==='function'?voiceDebugResultSummary(aiItems||[]):aiItems||[],
            needsConfirmation:!!(draft&&draft.needsConfirmation)
          });
        }
        if(aiItems&&aiItems.length){
          console.log('[Sous] AI →',aiItems.length,'ingredient(s) (needs confirmation)');
          // Route unknown items (not in local database) through the multi-food
          // fallback screen so the user can name/create them before saving.
          const firstUnknownIdx=aiItems.findIndex(i=>!i.rawFood);
          if(firstUnknownIdx>=0){
            const unknown=aiItems[firstUnknownIdx];
            const before=aiItems.slice(0,firstUnknownIdx);
            const after=aiItems.slice(firstUnknownIdx+1);
            // Use the AI's name for the unknown item, not the full rawText.
            // rawText spans the whole transcript and would cause splitIngredients
            // to produce segments that overlap with items already in `before`.
            const heardName=(typeof _foodChoiceDisplayName==='function'&&unknown.name?_foodChoiceDisplayName(unknown.name):null)||unknown.name||rawText||transcript;
            if(!voiceTurnOk('handle_transcript_before_multi_food_fallback')) return;
            showMultiFoodFallback(heardName,before,after);
            return;
          }
          if(!voiceTurnOk('handle_transcript_before_ai_handle_parsed')) return;
          handleParsed(aiItems,rawText,voiceContext);
          return;
        }
      }
    }catch(e){
      console.warn('[Sous] AI fallback error:',e);
      if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_error',{transcript:transcript.trim(),message:e?.message||String(e)});
    }
  } else {
    console.log('[Sous] AI blocked: free plan');
    if(typeof voiceDebugTrace==='function') voiceDebugTrace('ai_escalation',{transcript:transcript.trim(),reason:escalationReason,allowed:false});
    if(typeof voiceDebugTrace==='function') voiceDebugTrace('voice_decision',{step:'ai_interpret_escalation',transcript:transcript.trim(),reason:escalationReason,allowed:false});
  }

  // AI unavailable or returned nothing — use parser results
  if(mixedPartial){
    // Partial: force confirmation, don't auto-save incomplete interpretation
    const flagged=results.map(r=>r.command?r:{...r,needsConfirm:true,weightSpecified:false});
    if(!voiceTurnOk('handle_transcript_final_partial')) return;
    handleParsed(flagged,rawText,voiceContext);
  } else {
    if(!voiceTurnOk('handle_transcript_final_result')) return;
    handleParsed(results,rawText,voiceContext);
  }
}
// ═══════════════════════════════════════════
// MULTI-FOOD FALLBACK — resolve screen
// ═══════════════════════════════════════════
// Shown when parser/AI can't fully resolve the input phrase. Splits the phrase
// on "and", "with", "plus", and comma, then lets the user pick an existing
// food or create a new one for each part individually.

let _multiResolvePending=null;

function showMultiFoodFallback(rawPhrase,beforeItems,afterItems){
  if(typeof voiceDebugTrace==='function'){
    voiceDebugTrace('fallback_shown',{
      route:'multi_food_resolve',
      rawText:String(rawPhrase||''),
      beforeCount:Array.isArray(beforeItems)?beforeItems.length:0,
      afterCount:Array.isArray(afterItems)?afterItems.length:0
    });
  }
  // Split into segments using the parser's splitIngredients when available,
  // falling back to a simple separator split.
  let terms=[];
  if(typeof splitIngredients==='function') terms=splitIngredients(rawPhrase||'');
  if(!terms.length){
    terms=(rawPhrase||'').split(/\b(?:and|with|plus)\b|,/i)
      .map(s=>s.trim()).filter(s=>s.length>1);
  }
  if(!terms.length) terms=[rawPhrase||'ingredient'];

  _multiResolvePending={
    segments:terms.map(term=>{
      const displayName=(typeof _foodChoiceDisplayName==='function'
        ?_foodChoiceDisplayName(term):null)||term;
      return{
        term,displayName,
        quantity:typeof extractQuantity==='function'?extractQuantity(term):null,
        selectedFood:null,
        customName:'',customKcal:'',customProtein:'',customCarbs:'',customFat:'',
        skipped:false,showCreate:false,
        matches:typeof _relatedFoodMatches==='function'?_relatedFoodMatches(term,null,4):[]
      };
    }),
    before:beforeItems||[],
    after:afterItems||[]
  };
  _renderMultiResolve();
  showLogScreen('multi-resolve');
}
window.showMultiFoodFallback=showMultiFoodFallback;

function _ensureMultiResolveScreen(){
  let s=document.getElementById('ls-multi-resolve');
  if(s) return s;
  s=document.createElement('div');
  s.className='log-screen';
  s.id='ls-multi-resolve';
  s.style.cssText='background:var(--bg);overflow-y:auto;';
  const anchor=document.getElementById('ls-food-choice')||document.getElementById('ls-multi-confirm');
  if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(s,anchor.nextSibling);
  else document.getElementById('pane-log')?.appendChild(s);
  return s;
}

function mrfSyncInputs(){
  if(!_multiResolvePending) return;
  _multiResolvePending.segments.forEach((seg,idx)=>{
    if(!seg.showCreate) return;
    const n=document.getElementById('mrf-name-'+idx);if(n) seg.customName=n.value;
    const k=document.getElementById('mrf-kcal-'+idx);if(k) seg.customKcal=k.value;
    const p=document.getElementById('mrf-p-'+idx);if(p) seg.customProtein=p.value;
    const c=document.getElementById('mrf-c-'+idx);if(c) seg.customCarbs=c.value;
    const f=document.getElementById('mrf-f-'+idx);if(f) seg.customFat=f.value;
  });
}

function _renderMultiResolve(){
  const screen=_ensureMultiResolveScreen();
  if(!screen||!_multiResolvePending) return;
  const{segments}=_multiResolvePending;
  const addable=segments.filter(s=>s.selectedFood||(s.showCreate&&s.customName.trim())).length;
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html=`<div style="padding:16px 20px calc(var(--tab-h,80px) + 24px);">`;
  html+=`<div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:4px;">Identify ingredients</div>`;
  html+=`<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Couldn't fully match your input. Resolve each item below.</div>`;

  segments.forEach((seg,idx)=>{
    const border=seg.selectedFood?'var(--accent)':'var(--border)';
    html+=`<div style="background:var(--card);border:.5px solid ${border};border-radius:10px;padding:10px 12px;margin-bottom:10px;">`;
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${seg.skipped?'0':'8'}px;">`;
    html+=`<div style="font-size:14px;font-weight:600;color:${seg.skipped?'var(--text-muted)':'var(--text)'};${seg.skipped?'text-decoration:line-through;':''}">`;
    html+=esc(seg.displayName||seg.term);
    html+=`</div>`;
    html+=seg.skipped
      ?`<button type="button" onclick="mrfUnskip(${idx})" style="background:none;border:none;font-size:12px;color:var(--accent);cursor:pointer;padding:2px 6px;">Undo</button>`
      :`<button type="button" onclick="mrfSkip(${idx})" style="background:none;border:none;font-size:12px;color:var(--text-muted);cursor:pointer;padding:2px 6px;">Skip</button>`;
    html+=`</div>`;

    if(!seg.skipped){
      if(seg.matches.length){
        html+=`<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">Existing matches</div>`;
        html+=`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">`;
        seg.matches.forEach((food,fi)=>{
          const sel=seg.selectedFood&&seg.selectedFood.name===food.name;
          html+=`<button type="button" onclick="mrfSelect(${idx},${fi})" style="font-size:12px;padding:5px 10px;border-radius:20px;cursor:pointer;font-family:inherit;border:.5px solid ${sel?'var(--accent)':'var(--border)'};background:${sel?'var(--accent)':'var(--card-2)'};color:${sel?'#fff':'var(--text)'};">${esc(food.name)}</button>`;
        });
        html+=`</div>`;
      }
      html+=`<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Create new</div>`;
      html+=`<button type="button" onclick="mrfToggleCreate(${idx})" style="font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:inherit;padding:2px 0;">${seg.showCreate?'Hide ▲':'+ Add custom'}</button>`;
      if(seg.showCreate){
        html+=`<div style="margin-top:8px;border-top:.5px solid var(--border);padding-top:8px;">`;
        html+=`<input type="text" id="mrf-name-${idx}" value="${esc(seg.customName||(seg.displayName||seg.term))}" placeholder="Food name" style="width:100%;box-sizing:border-box;font-size:13px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-family:inherit;outline:none;margin-bottom:6px;">`;
        html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">`;
        [{id:'mrf-kcal-'+idx,val:seg.customKcal,ph:'kcal / 100g'},{id:'mrf-p-'+idx,val:seg.customProtein,ph:'protein g'},{id:'mrf-c-'+idx,val:seg.customCarbs,ph:'carbs g'},{id:'mrf-f-'+idx,val:seg.customFat,ph:'fat g'}].forEach(({id,val,ph})=>{
          html+=`<input type="number" id="${id}" value="${esc(String(val||''))}" placeholder="${ph}" min="0" step="0.1" style="font-size:12px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-family:inherit;outline:none;">`;
        });
        html+=`</div></div>`;
      }
    }
    html+=`</div>`;
  });

  const btnOk=addable>0;
  html+=`<button type="button" onclick="mrfCommit()" ${btnOk?'':'disabled'} style="width:100%;padding:13px;font-size:15px;font-weight:600;border-radius:10px;border:none;cursor:${btnOk?'pointer':'default'};background:${btnOk?'var(--accent)':'var(--card-2)'};color:${btnOk?'#fff':'var(--text-muted)'};font-family:inherit;margin-bottom:8px;">${btnOk?`Add ${addable} ingredient${addable!==1?'s':''} to meal`:'Select or create items above'}</button>`;
  html+=`<div style="display:flex;justify-content:center;"><button type="button" onclick="mrfCancel()" style="background:none;border:none;color:var(--text-muted);font-size:13px;font-family:inherit;padding:8px 12px;cursor:pointer;">Cancel</button></div>`;
  html+=`</div>`;
  screen.innerHTML=html;
}

function mrfSelect(idx,foodIdx){
  mrfSyncInputs();
  if(!_multiResolvePending) return;
  const seg=_multiResolvePending.segments[idx];
  if(!seg) return;
  const food=seg.matches[foodIdx];
  if(!food) return;
  // Second tap deselects
  seg.selectedFood=(seg.selectedFood&&seg.selectedFood.name===food.name)?null:food;
  if(seg.selectedFood) seg.showCreate=false;
  _renderMultiResolve();
}
function mrfSkip(idx){
  mrfSyncInputs();
  if(!_multiResolvePending) return;
  _multiResolvePending.segments[idx].skipped=true;
  _renderMultiResolve();
}
function mrfUnskip(idx){
  mrfSyncInputs();
  if(!_multiResolvePending) return;
  _multiResolvePending.segments[idx].skipped=false;
  _renderMultiResolve();
}
function mrfToggleCreate(idx){
  mrfSyncInputs();
  if(!_multiResolvePending) return;
  const seg=_multiResolvePending.segments[idx];
  seg.showCreate=!seg.showCreate;
  if(seg.showCreate){
    seg.selectedFood=null;
    if(!seg.customName) seg.customName=seg.displayName||seg.term;
  }
  _renderMultiResolve();
}
function mrfCommit(){
  mrfSyncInputs();
  if(!_multiResolvePending) return;
  const{segments,before,after}=_multiResolvePending;
  const items=[];
  for(const seg of segments){
    if(seg.skipped) continue;
    if(seg.selectedFood){
      const food=seg.selectedFood;
      const grams=typeof quantityToGramsForFood==='function'
        ?quantityToGramsForFood(seg.quantity,food)
        :seg.quantity?.grams;
      const serving=typeof quantityServingForFood==='function'
        ?quantityServingForFood(seg.quantity,food)
        :null;
      items.push({
        ...foodScale(food,grams!=null?grams:food.w),
        rawFood:food,
        confidence:'manual',
        needsConfirm:false,
        weightSpecified:grams!=null,
        ...(serving?{serving}: {})
      });
    } else if(seg.showCreate&&seg.customName.trim()){
      const name=seg.customName.trim();
      const kcal=parseFloat(seg.customKcal)||0;
      const protein=parseFloat(seg.customProtein)||0;
      const carbs=parseFloat(seg.customCarbs)||0;
      const fat=parseFloat(seg.customFat)||0;
      const cf=typeof addCustomFood==='function'
        ?addCustomFood({name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'})
        :{name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'};
      const grams=seg.quantity?.grams!=null?Math.max(1,Math.round(seg.quantity.grams)):100;
      items.push({...foodScale(cf,grams),rawFood:cf,confidence:'manual',needsConfirm:false,weightSpecified:seg.quantity?.grams!=null});
    }
  }
  _multiResolvePending=null;

  if(!items.length&&!before.length&&!after.length){
    showLogScreen('listening');
    if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(400);
    else if(typeof restartAlwaysOn==='function') setTimeout(restartAlwaysOn,400);
    return;
  }

  console.log('[Sous] resolved items added:',items);

  // Multiple resolved items: skip per-item quantity confirmation and add with
  // default weights so the user lands directly on the meal editor.
  const all=[...before,...items,...after];
  if(items.length>1){
    handleParsed(all.map(i=>i.command?i:{...i,weightSpecified:true}),'');
  } else {
    handleParsed(all,'');
  }
}
function mrfCancel(){
  _multiResolvePending=null;
  showLogScreen('listening');
  if(typeof maybeResumeVoiceSession==='function') maybeResumeVoiceSession(400);
  else if(typeof restartAlwaysOn==='function') setTimeout(restartAlwaysOn,400);
}

function updateClock(){
  const n=new Date(),h=n.getHours();
  const clock=document.getElementById('clock');
  if(clock) clock.textContent=String(h).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  if(!clock) return;
  const el=document.getElementById('home-greeting');
  if(el) el.textContent=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
}

// ═══════════════════════════════════════════
// DATE SELECTION
// ═══════════════════════════════════════════
function localDateStr(d=new Date()){
  return localDateKey(d);
}
function formatDisplayDate(dateStr){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y,m,d]=dateStr.split('-');
  return d+'-'+months[parseInt(m,10)-1]+'-'+y.slice(2);
}
function formatQuickLogSourceDate(dateStr){
  if(!dateStr) return '';
  const d=new Date(dateStr+'T12:00:00');
  if(Number.isNaN(d.getTime())) return '';
  const today=new Date(localDateStr()+'T12:00:00');
  const diffDays=Math.round((today-d)/86400000);
  if(diffDays===1) return 'Yesterday';
  if(diffDays>=2&&diffDays<=6) return d.toLocaleDateString('en-GB',{weekday:'long'});
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
let selectedLogDate=localDateStr();
let currentEditMealId=null, currentEditMealDate=null;
let currentQuickMode=false;

function shiftDate(days){
  const d=new Date(selectedLogDate+'T12:00:00');
  d.setDate(d.getDate()+days);
  selectedLogDate=localDateStr(d);
  renderHome();
}

function updateDateNav(){
  const isToday=selectedLogDate===localDateStr();
  const lbl=document.getElementById('date-label');
  if(lbl) lbl.textContent=isToday?'Today':formatDisplayDate(selectedLogDate);
  const picker=document.getElementById('date-picker');
  if(picker) picker.value=selectedLogDate;
  const dateLbl=document.getElementById('home-date-label');
  if(dateLbl) dateLbl.textContent=isToday?'Today so far':formatDisplayDate(selectedLogDate);
  const mealsLbl=document.getElementById('home-meals-label');
  if(mealsLbl) mealsLbl.textContent=isToday?'Today\'s meals':'Meals on '+formatDisplayDate(selectedLogDate);
}

// ═══════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════
function calcStreak(){
  const log=getLog(); let streak=0;
  for(let i=0;i<365;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=localDateStr(d);
    if(log[ds]&&log[ds].meals&&log[ds].meals.length>0) streak++;
    else if(i===0) continue;
    else break;
  }
  return streak;
}

const HOME_MEAL_SECTIONS=[
  {key:'breakfast',label:'Breakfast'},
  {key:'lunch',label:'Lunch'},
  {key:'dinner',label:'Dinner'},
  {key:'snacks',label:'Snacks'},
  {key:'supplements',label:'Supplements'}
];
function homeMealSectionKey(m){
  const k=String(m.section||'').toLowerCase().trim();
  if(['breakfast','lunch','dinner','snacks','supplements'].includes(k)) return k;
  const n=String(m.name||'').toLowerCase();
  if(n.includes('supplement')) return 'supplements';
  if(n.includes('breakfast')) return 'breakfast';
  if(n.includes('lunch')) return 'lunch';
  if(n.includes('dinner')) return 'dinner';
  if(n.includes('snack')) return 'snacks';
  const h=new Date(m.time).getHours();
  if(h<11) return 'breakfast';
  if(h<15) return 'lunch';
  if(h<21) return 'dinner';
  return 'snacks';
}
function hasMealForSectionOnSelectedDate(section, meals){
  const list=meals||[];
  return list.some(m=>homeMealSectionKey(m)===section);
}
function getMealsForLogDate(dateStr){
  if(!dateStr) return [];
  return (getLog()[dateStr]||{}).meals||[];
}
function getDefaultQuickAddSection(forDateStr){
  const meals=getMealsForLogDate(forDateStr);
  const h=new Date().getHours();
  let candidate;
  if(h<11) candidate='breakfast';
  else if(h<16) candidate='lunch';
  else if(h<21) candidate='dinner';
  else candidate='snacks';
  if(hasMealForSectionOnSelectedDate(candidate,meals)) return 'snacks';
  return candidate;
}
function homeMealRowHtml(m){
  const time=new Date(m.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const n=m.ingredients?m.ingredients.length:0;
  const id=Number(m.id)||0;
  const source=m.source==='photo_estimate'?' · photo estimate':'';
  return`<div class="meal-item" style="cursor:pointer;" onclick="startEditMeal(${id})"><div class="meal-item-left"><div class="meal-item-name">${escapeHtml(m.name||'Meal')}</div><div class="meal-item-detail">${escapeHtml(time)} · ${n} ingredient${n!==1?'s':''}${source}</div></div><div class="meal-item-kcal">${Math.round(Number(m.totals?.kcal)||0)} kcal</div><button class="meal-delete-btn" onclick="event.stopPropagation();deleteMealFromHome(${id})" aria-label="Delete meal" title="Delete">×</button></div>`;
}
function getRecentIngredientsForSection(section){
  const log=getLog();
  const names=new Set();
  Object.values(log).forEach(day=>{
    (day.meals||[]).forEach(m=>{
      if(homeMealSectionKey(m)===section){
        (m.ingredients||[]).forEach(i=>{if(i.name)names.add(i.name.toLowerCase().trim());});
      }
    });
  });
  return(typeof getRecentIngredients==='function'?getRecentIngredients():[])
    .filter(r=>names.has((r.name||'').toLowerCase().trim()))
    .slice(0,6);
}
function startLogWithRecentIngredientByName(name,section){
  const r=(typeof getRecentIngredients==='function'?getRecentIngredients():[]).find(x=>x.name===name);
  if(r) startLogWithRecentIngredient(r,section);
}
function logUsualMealByIndex(section,idx){
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  if(!u||!u.ingredients||!u.ingredients.length) return;
  const log=getLog();
  const date=selectedLogDate||localDateStr();
  const mealSection=section||u.section||getDefaultQuickAddSection(date);
  const ingredients=u.ingredients.map((ing,i)=>{
    const item={...ing,serving:ing.serving?{...ing.serving}:undefined,id:Date.now()+i};
    if(typeof syncServingFromWeight==='function') syncServingFromWeight(item);
    return item;
  });
  const draft=createMealDraft({section:mealSection,source:'usual-meal',ingredients});
  draft.name=u.name;
  draft.savedIngredients=ingredients;
  const mealObj=draftToMeal(draft);
  mealObj.id=Date.now();
  const mt=mealObj.totals;
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  log[date].meals.push(mealObj);
  log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  saveLog(log);
  if(typeof updateUsualMeals==='function') updateUsualMeals(mealObj,u.name);
  if(typeof addToRecentIngredients==='function') ingredients.forEach(i=>addToRecentIngredients(i));
  showToast(`${u.name} · ${Math.round(mt.kcal)} kcal saved`,2500);
  renderHome();
}

let _photoEstimateDraft=null;
let _photoEstimatePortion=1;
let _photoEstimateTrace=[];
let _photoEstimateTraceStart=0;
let _photoEstimateLastError=null;
let _photoEstimatePreviewUrl=null;
let _photoEstimateSlowTimer=null;
let _photoEstimateProgressTimer=null;
let _photoEstimateProgressValue=0;
let _photoEstimateProgressTarget=0;
let _photoEstimateProgressActive=false;
let _photoEstimateProgressLabel='Working';
let _photoEstimateAdjustInProgress=false;
let _photoEstimateLastAdjustError=null;
let _photoEstimateManualDirty=false;
let _photoEstimatePreviousDraft=null;
const PHOTO_ESTIMATE_MAX_DIMENSION=1024;
const PHOTO_ESTIMATE_JPEG_QUALITY=0.75;
let _menuScanFile=null;
let _menuScanPreviewUrl=null;
let _menuScanInFlight=false;
let _menuScanLastResult=null;
let _menuScanPhotoUpdateTarget=null;

function photoEstimateSafeMeta(meta={}){
  const safe={};
  Object.entries(meta||{}).forEach(([key,value])=>{
    if(/image|base64|dataUrl|src/i.test(key)) return;
    safe[key]=value;
  });
  try{return JSON.parse(JSON.stringify(safe));}
  catch(e){return {note:String(meta)};}
}
function resetPhotoEstimateTrace(){
  _photoEstimateTraceStart=performance?.now?performance.now():Date.now();
  _photoEstimateTrace=[];
  _photoEstimateLastError=null;
  _photoEstimateLastAdjustError=null;
}
function photoEstimateTrace(event,meta={}){
  if(!_photoEstimateTraceStart) resetPhotoEstimateTrace();
  const now=performance?.now?performance.now():Date.now();
  const entry={
    event,
    t:new Date().toISOString(),
    ms:Math.round(now-_photoEstimateTraceStart),
    ...photoEstimateSafeMeta(meta)
  };
  _photoEstimateTrace.push(entry);
  if(_photoEstimateTrace.length>100) _photoEstimateTrace.splice(0,_photoEstimateTrace.length-100);
  try{console.info('[Sous Photo Timing]',entry);}catch(e){}
  return entry;
}
function rememberPhotoEstimateError(error,context=''){
  _photoEstimateLastError={
    t:new Date().toISOString(),
    context,
    message:String(error?.message||error||'Unknown photo estimate error').slice(0,240)
  };
  photoEstimateTrace('photo_error',_photoEstimateLastError);
}
function setPhotoEstimateStatus(message){
  const statusEl=document.getElementById('photo-estimate-status');
  if(!statusEl) return;
  statusEl.style.display=message?'block':'none';
  statusEl.textContent=message||'';
}
function setPhotoAdjustStatus(message,tone=''){
  const el=document.getElementById('photo-adjust-status');
  if(!el) return;
  el.textContent=message||'';
  el.dataset.tone=tone||'';
}
function setPhotoProgressVisible(show){
  const el=document.getElementById('photo-estimate-progress');
  if(el) el.style.display=show?'block':'none';
}
function photoProgressLabel(stage,pct){
  if(/^could not/i.test(String(stage||''))) return 'Failed';
  if(pct>=100) return 'Ready';
  return _photoEstimateProgressLabel||'Working';
}
function renderPhotoProgress(stage){
  const pct=Math.max(0,Math.min(100,Math.round(_photoEstimateProgressValue)));
  const stageEl=document.getElementById('photo-progress-stage');
  const pctEl=document.getElementById('photo-progress-percent');
  const fill=document.getElementById('photo-progress-fill');
  if(stageEl&&stage) stageEl.textContent=stage;
  if(pctEl) pctEl.textContent=photoProgressLabel(stage,pct);
  if(fill) fill.style.width=pct+'%';
}
function stopPhotoProgress(){
  _photoEstimateProgressActive=false;
  if(_photoEstimateProgressTimer){
    clearInterval(_photoEstimateProgressTimer);
    _photoEstimateProgressTimer=null;
  }
}
function startPhotoProgress(stage='Loading photo',target=12){
  stopPhotoProgress();
  _photoEstimateProgressValue=0;
  _photoEstimateProgressTarget=Math.max(0,Math.min(88,target));
  _photoEstimateProgressLabel='Working';
  _photoEstimateProgressActive=true;
  setPhotoProgressVisible(true);
  renderPhotoProgress(stage);
  photoEstimateTrace('photo_progress_started',{stage,target:_photoEstimateProgressTarget});
  _photoEstimateProgressTimer=setInterval(()=>{
    if(!_photoEstimateProgressActive) return;
    if(_photoEstimateProgressValue>=_photoEstimateProgressTarget) return;
    const remaining=_photoEstimateProgressTarget-_photoEstimateProgressValue;
    const step=Math.max(0.12,Math.min(1.1,remaining*0.06));
    _photoEstimateProgressValue=Math.min(_photoEstimateProgressTarget,_photoEstimateProgressValue+step);
    renderPhotoProgress();
  },180);
}
function setPhotoProgressStage(stage,target,label='Working'){
  if(!_photoEstimateProgressActive) startPhotoProgress(stage,target);
  _photoEstimateProgressLabel=label||'Working';
  _photoEstimateProgressTarget=Math.max(_photoEstimateProgressValue,Math.min(88,Number(target)||_photoEstimateProgressTarget));
  renderPhotoProgress(stage);
  photoEstimateTrace('photo_progress_stage_changed',{stage,target:_photoEstimateProgressTarget,label:_photoEstimateProgressLabel});
}
function completePhotoProgress(){
  if(!_photoEstimateProgressActive) setPhotoProgressVisible(true);
  stopPhotoProgress();
  _photoEstimateProgressValue=100;
  _photoEstimateProgressTarget=100;
  _photoEstimateProgressLabel='Ready';
  renderPhotoProgress('Ready');
  photoEstimateTrace('photo_progress_completed');
}
function failPhotoProgress(message){
  stopPhotoProgress();
  _photoEstimateProgressLabel='Failed';
  renderPhotoProgress('Could not estimate');
  photoEstimateTrace('photo_progress_failed',{message:String(message||'').slice(0,160)});
}
function clearPhotoEstimateSlowTimer(){
  if(_photoEstimateSlowTimer){
    clearTimeout(_photoEstimateSlowTimer);
    _photoEstimateSlowTimer=null;
  }
}
function startPhotoEstimateSlowTimer(){
  clearPhotoEstimateSlowTimer();
  _photoEstimateSlowTimer=setTimeout(()=>{
    photoEstimateTrace('photo_slow_state_shown');
    setPhotoEstimateStatus('Still working — you can keep logging manually');
  },12000);
}
function setPhotoEstimatePreview(file){
  const img=document.getElementById('photo-estimate-preview');
  if(_photoEstimatePreviewUrl){
    URL.revokeObjectURL(_photoEstimatePreviewUrl);
    _photoEstimatePreviewUrl=null;
  }
  if(!img) return;
  if(!file){
    img.removeAttribute('src');
    img.style.display='none';
    return;
  }
  _photoEstimatePreviewUrl=URL.createObjectURL(file);
  img.src=_photoEstimatePreviewUrl;
  img.style.display='block';
}

function photoEstimateSectionDefault(){
  return typeof getDefaultQuickAddSection==='function'
    ? getDefaultQuickAddSection(selectedLogDate||localDateStr())
    : 'snacks';
}
function showPhotoEstimateModal({status='',showForm=false}={}){
  const modal=document.getElementById('photo-estimate-modal');
  if(!modal) return;
  modal.style.display='flex';
  requestAnimationFrame(()=>modal.classList.add('show'));
  const formEl=document.getElementById('photo-estimate-form');
  const saveBtn=document.getElementById('photo-estimate-save-btn');
  setPhotoEstimateStatus(status);
  if(formEl) formEl.style.display=showForm?'block':'none';
  if(saveBtn) saveBtn.style.display=showForm?'block':'none';
}
function closePhotoEstimateModal(){
  const modal=document.getElementById('photo-estimate-modal');
  if(!modal) return;
  clearPhotoEstimateSlowTimer();
  stopPhotoProgress();
  setPhotoProgressVisible(false);
  _photoEstimateAdjustInProgress=false;
  _photoEstimatePreviousDraft=null;
  _photoEstimateManualDirty=false;
  _menuScanPhotoUpdateTarget=null;
  setPhotoAdjustStatus('');
  const title=document.getElementById('photo-estimate-title');
  const adjustBox=document.querySelector('#photo-estimate-form .photo-adjust-box');
  const saveBtn=document.getElementById('photo-estimate-save-btn');
  const note=document.getElementById('photo-estimate-note');
  if(title) title.textContent='Review photo estimate';
  if(adjustBox) adjustBox.style.display='block';
  if(saveBtn) saveBtn.textContent='Save estimate';
  if(note) note.textContent='Photo estimates are approximate. Portion size and hidden oils/sauces may be wrong.';
  setPhotoEstimatePreview(null);
  modal.classList.remove('show');
  setTimeout(()=>{modal.style.display='none';},200);
  ['photo-estimate-input','photo-estimate-library-input'].forEach(id=>{
    const input=document.getElementById(id);
    if(input) input.value='';
  });
}
function openPhotoEstimateCameraPicker(){
  _menuScanPhotoUpdateTarget=null;
  resetPhotoEstimateTrace();
  photoEstimateTrace('photo_picker_opened',{source:'camera'});
  document.getElementById('photo-estimate-input')?.click();
}
function openPhotoEstimateLibraryPicker(){
  _menuScanPhotoUpdateTarget=null;
  resetPhotoEstimateTrace();
  photoEstimateTrace('photo_picker_opened',{source:'library'});
  document.getElementById('photo-estimate-library-input')?.click();
}
function openPhotoEstimatePicker(){
  openPhotoEstimateCameraPicker();
}
function isMenuScanPhotoUpdateMeal(meal){
  if(!meal||typeof meal!=='object') return false;
  if(meal.source==='menu_scan') return true;
  const rows=Array.isArray(meal.ingredients)?meal.ingredients:[];
  return rows.some(row=>row&&['menu_scan','consumable_ai_estimate'].includes(row.source));
}
window.isMenuScanPhotoUpdateMeal=isMenuScanPhotoUpdateMeal;
function getMenuScanPhotoUpdateMeal(target){
  const log=getLog();
  const meals=log[target?.dateStr]?.meals||[];
  let idx=Number.isInteger(target?.mealIdx)?target.mealIdx:-1;
  if(!meals[idx]&&target?.mealId!=null){
    idx=meals.findIndex(meal=>String(meal?.id)===String(target.mealId));
  }
  const meal=meals[idx];
  return meal?{log,meals,meal,idx}:null;
}
function openMenuScanPhotoUpdate(dateStr,mealIdx){
  const log=getLog();
  const meal=log[dateStr]?.meals?.[mealIdx];
  if(!isMenuScanPhotoUpdateMeal(meal)){
    showToast('Photo update is only available for menu-scanned meals');
    return;
  }
  resetPhotoEstimateTrace();
  _menuScanPhotoUpdateTarget={dateStr,mealIdx,mealId:meal.id};
  photoEstimateTrace('menu_scan_photo_update_picker_opened',{dateStr,mealIdx});
  document.getElementById('photo-estimate-input')?.click();
}
window.openMenuScanPhotoUpdate=openMenuScanPhotoUpdate;
async function decodePhotoForEstimate(file){
  photoEstimateTrace('image_decode_started',{
    fileType:file.type||'unknown',
    fileSizeKb:Math.round((file.size||0)/1024)
  });
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      photoEstimateTrace('image_decode_finished',{route:'createImageBitmap',width:bitmap.width,height:bitmap.height});
      return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
    }catch(e){
      const bitmap=await createImageBitmap(file);
      photoEstimateTrace('image_decode_finished',{route:'createImageBitmap_fallback',width:bitmap.width,height:bitmap.height});
      return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
    }
  }
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.decoding='async';
    img.src=url;
    if(typeof img.decode==='function') await img.decode();
    else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
    photoEstimateTrace('image_decode_finished',{route:'image_element',width:img.naturalWidth||img.width,height:img.naturalHeight||img.height});
    return {image:img,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,close:()=>{}};
  }finally{
    URL.revokeObjectURL(url);
  }
}
function canvasToJpegBlob(canvas,quality){
  return new Promise((resolve,reject)=>{
    if(canvas.toBlob){
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not compress photo.')),'image/jpeg',quality);
      return;
    }
    try{
      const dataUrl=canvas.toDataURL('image/jpeg',quality);
      const [header,data]=dataUrl.split(',');
      const binary=atob(data||'');
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      resolve(new Blob([bytes],{type:(header.match(/data:([^;]+)/)||[])[1]||'image/jpeg'}));
    }catch(e){reject(e);}
  });
}
function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read compressed photo.'));
    reader.onload=()=>resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
async function resizePhotoForEstimate(file){
  const decoded=await decodePhotoForEstimate(file);
  try{
    photoEstimateTrace('image_resize_started',{
      width:decoded.width,
      height:decoded.height,
      maxDimension:PHOTO_ESTIMATE_MAX_DIMENSION,
      jpegQuality:PHOTO_ESTIMATE_JPEG_QUALITY
    });
    const longest=Math.max(decoded.width,decoded.height)||1;
    const scale=Math.min(1,PHOTO_ESTIMATE_MAX_DIMENSION/longest);
    const width=Math.max(1,Math.round(decoded.width*scale));
    const height=Math.max(1,Math.round(decoded.height*scale));
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx) throw new Error('Could not prepare photo for upload.');
    ctx.drawImage(decoded.image,0,0,width,height);
    const blob=await canvasToJpegBlob(canvas,PHOTO_ESTIMATE_JPEG_QUALITY);
    const dataUrl=await blobToDataUrl(blob);
    photoEstimateTrace('image_resize_finished',{
      originalWidth:decoded.width,
      originalHeight:decoded.height,
      width,
      height,
      originalBytes:file.size||0,
      resizedBytes:blob.size||0,
      resizedKb:Math.round((blob.size||0)/1024)
    });
    return {image:dataUrl,bytes:blob.size,width,height};
  }finally{
    decoded.close?.();
  }
}

function menuScanRoundMacro(value,key='macro'){
  const n=Number(value);
  if(!Number.isFinite(n)) return 0;
  return key==='kcal'?Math.round(n):Math.round(n*10)/10;
}
function menuScanMacroSet(value={}){
  return {
    kcal:menuScanRoundMacro(value.kcal,'kcal'),
    protein:menuScanRoundMacro(value.protein),
    carbs:menuScanRoundMacro(value.carbs),
    fat:menuScanRoundMacro(value.fat)
  };
}
function menuScanHasTargets(profile){
  return ['targetKcal','targetProtein','targetCarbs','targetFat'].every(key=>{
    const n=Number(profile?.[key]);
    return Number.isFinite(n)&&n>0;
  });
}
function menuScanProfileTargets(profile){
  return {
    kcal:menuScanRoundMacro(profile.targetKcal,'kcal'),
    protein:menuScanRoundMacro(profile.targetProtein),
    carbs:menuScanRoundMacro(profile.targetCarbs),
    fat:menuScanRoundMacro(profile.targetFat)
  };
}
function menuScanCurrentDayTotals(){
  const date=selectedLogDate||localDateStr();
  const day=(getLog()[date]||{}).totals||{};
  return menuScanMacroSet({
    kcal:day.kcal??0,
    protein:day.protein??0,
    carbs:day.carbs??0,
    fat:day.fat??0
  });
}
function menuScanCurrentSection(){
  if(typeof getJotMealWindow==='function') return getJotMealWindow();
  if(typeof photoEstimateSectionDefault==='function') return photoEstimateSectionDefault();
  return 'snacks';
}
function setMenuScanStatus(message='',tone=''){
  const el=document.getElementById('menu-scan-status');
  if(!el) return;
  el.textContent=message;
  el.dataset.tone=tone||'';
}
function setMenuScanBusy(busy){
  _menuScanInFlight=!!busy;
  const btn=document.getElementById('menu-scan-submit-btn');
  if(btn){
    btn.disabled=!!busy;
    btn.textContent=busy?'Scanning...':'Scan';
  }
}
function clearMenuScanResults(){
  _menuScanLastResult=null;
  const el=document.getElementById('menu-scan-results');
  if(el) el.innerHTML='';
}
function setMenuScanPreview(file){
  const img=document.getElementById('menu-scan-preview');
  if(_menuScanPreviewUrl){
    URL.revokeObjectURL(_menuScanPreviewUrl);
    _menuScanPreviewUrl=null;
  }
  if(!img) return;
  if(!file){
    img.removeAttribute('src');
    img.style.display='none';
    return;
  }
  _menuScanPreviewUrl=URL.createObjectURL(file);
  img.src=_menuScanPreviewUrl;
  img.style.display='block';
}
function openMenuScanModal(){
  const modal=document.getElementById('menu-scan-modal');
  if(!modal) return;
  clearMenuScanResults();
  setMenuScanStatus('');
  setMenuScanBusy(false);
  _menuScanFile=null;
  setMenuScanPreview(null);
  ['menu-scan-input','menu-scan-library-input'].forEach(id=>{
    const input=document.getElementById(id);
    if(input) input.value='';
  });
  modal.style.display='flex';
  requestAnimationFrame(()=>modal.classList.add('show'));
}
function closeMenuScanModal(){
  const modal=document.getElementById('menu-scan-modal');
  if(!modal) return;
  setMenuScanBusy(false);
  _menuScanFile=null;
  setMenuScanPreview(null);
  modal.classList.remove('show');
  setTimeout(()=>{modal.style.display='none';},200);
  ['menu-scan-input','menu-scan-library-input'].forEach(id=>{
    const input=document.getElementById(id);
    if(input) input.value='';
  });
}
function openMenuScanCameraPicker(){
  document.getElementById('menu-scan-input')?.click();
}
function openMenuScanLibraryPicker(){
  document.getElementById('menu-scan-library-input')?.click();
}
function handleMenuScanFile(file){
  if(!file) return;
  _menuScanFile=file;
  clearMenuScanResults();
  setMenuScanStatus('Menu photo ready.');
  setMenuScanPreview(file);
}
function menuScanFormatMacroSet(macros){
  const m=menuScanMacroSet(macros||{});
  return `<div class="menu-scan-macros">
    <div class="menu-scan-macro"><b>${m.kcal}</b><span>kcal</span></div>
    <div class="menu-scan-macro"><b>${m.protein}g</b><span>protein</span></div>
    <div class="menu-scan-macro"><b>${m.carbs}g</b><span>carbs</span></div>
    <div class="menu-scan-macro"><b>${m.fat}g</b><span>fat</span></div>
  </div>`;
}
function menuScanEstimateLikely(estimate={}){
  return {
    kcal:estimate.kcal?.likely??0,
    protein:estimate.protein?.likely??0,
    carbs:estimate.carbs?.likely??0,
    fat:estimate.fat?.likely??0
  };
}
function menuScanRowKey(row={}){
  if(row.presetId) return `preset:${row.presetId}`;
  return [
    row.source||'row',
    String(row.name||'').toLowerCase().trim(),
    row.quantity??'',
    row.unit||''
  ].join(':');
}
function menuScanReviewItemFromRow(row={},idx=0){
  const quantity=row.quantity==null?'':`${row.quantity}${row.unit?` ${row.unit}`:''}`;
  const ocrNote=row.ocr?.lowConfidence
    ? `Low confidence menu read: we think this says ${row.name||'this item'}. Tap to correct.`
    : '';
  const notes=[quantity,ocrNote,row.notes].map(v=>String(v||'').trim()).filter(Boolean).join(' · ');
  return {
    id:'menu_'+Date.now()+'_'+idx,
    name:String(row.name||'Menu item').trim()||'Menu item',
    estimatedGrams:row.estimatedGrams!=null
      ? Math.round(Number(row.estimatedGrams)||0)
      : (row.unit==='g'?Math.round(Number(row.quantity)||0):null),
    calories:Math.round(Number(row.calories??row.kcal)||0),
    protein:roundMacro(row.protein),
    carbs:roundMacro(row.carbs),
    fat:roundMacro(row.fat),
    fibre:roundMacro(row.fibre??row.fiber),
    confidence:row.confidence||'medium',
    notes,
    source:row.source||'menu_scan',
    presetId:row.presetId||null
  };
}
function menuScanBuildReviewEstimate(suggestion){
  const reserved=Array.isArray(_menuScanLastResult?.reservedItems)?_menuScanLastResult.reservedItems:[];
  const suggestionRows=Array.isArray(suggestion?.rows)?suggestion.rows:[];
  const seen=new Set();
  const combined=[];
  [...reserved,...suggestionRows].forEach(row=>{
    if(!row||typeof row!=='object') return;
    const key=menuScanRowKey(row);
    if(seen.has(key)) return;
    seen.add(key);
    combined.push(row);
  });
  return {
    source:'menu_scan',
    mealName:suggestion?.suggestedName||'Menu choice',
    section:menuScanCurrentSection(),
    confidence:suggestion?.confidence||'medium',
    reviewTitle:'Review menu choice',
    saveLabel:'Save meal',
    disableAdjust:true,
    reviewNote:'Menu recommendations are approximate. Restaurant portions, oils, sauces, and prep can vary.',
    notes:[
      _menuScanLastResult?.requestSummary,
      suggestion?.ocr?.lowConfidence ? `Low confidence menu read: we think this says ${suggestion.suggestedName||'this item'}. Tap to correct.` : '',
      suggestion?.reason,
      suggestion?.portionAssumptions,
      ...(Array.isArray(suggestion?.warnings)?suggestion.warnings:[])
    ].map(v=>String(v||'').trim()).filter(Boolean).join('\n'),
    items:combined.map(menuScanReviewItemFromRow)
  };
}
function useMenuScanSuggestion(index){
  const suggestions=Array.isArray(_menuScanLastResult?.suggestions)?_menuScanLastResult.suggestions:[];
  const suggestion=suggestions[index];
  const rows=Array.isArray(suggestion?.rows)?suggestion.rows:[];
  if(!suggestion||!rows.length){
    setMenuScanStatus('This recommendation has no editable rows. Try another option or rescan.','warn');
    return;
  }
  const estimate=menuScanBuildReviewEstimate(suggestion);
  if(!estimate.items.length){
    setMenuScanStatus('This recommendation has no editable rows. Try another option or rescan.','warn');
    return;
  }
  closeMenuScanModal();
  renderPhotoEstimateReview(estimate);
}
function renderMenuScanResults(data){
  _menuScanLastResult=data;
  const el=document.getElementById('menu-scan-results');
  if(!el) return;
  const reserved=Array.isArray(data?.reservedItems)?data.reservedItems:[];
  const suggestions=Array.isArray(data?.suggestions)?data.suggestions:[];
  let html='';
  html+=`<div class="menu-scan-summary">`;
  if(data?.requestSummary) html+=`<div class="menu-scan-summary-title">${photoEstimateEsc(data.requestSummary)}</div>`;
  html+=`<div class="menu-scan-muted">Reserved: ${reserved.length?reserved.map(item=>photoEstimateEsc(item.name||'Reserved item')).join(', '):'None'}</div>`;
  html+=`<div class="menu-scan-muted" style="margin-top:8px;">Estimate confidence reflects menu readability and portion uncertainty, not how healthy the option is.</div>`;
  html+=`<div class="menu-scan-muted" style="margin-top:8px;">Remaining before reserved</div>`;
  html+=menuScanFormatMacroSet(data?.remainingBefore);
  html+=`<div class="menu-scan-muted" style="margin-top:8px;">Remaining after reserved</div>`;
  html+=menuScanFormatMacroSet(data?.remainingAfterReserved);
  html+=`</div>`;

  if(!suggestions.length){
    html+=`<div class="menu-scan-card"><div class="menu-scan-muted">No recommendations returned. Try a clearer menu photo.</div></div>`;
  }
  suggestions.slice(0,5).forEach((item,idx)=>{
    const likely=menuScanEstimateLikely(item.estimate||{});
    const warnings=[
      item.portionAssumptions,
      ...(Array.isArray(item.warnings)?item.warnings:[])
    ].map(v=>String(v||'').trim()).filter(Boolean);
    const ocr=item.ocr&&typeof item.ocr==='object'?item.ocr:null;
    html+=`<div class="menu-scan-card">`;
    html+=`<div class="menu-scan-card-head"><div class="menu-scan-card-title">${photoEstimateEsc(item.suggestedName||'Menu option')}</div><div class="menu-scan-confidence">Estimate confidence: ${photoEstimateEsc(item.confidence||'low')}</div></div>`;
    if(ocr?.lowConfidence){
      html+=`<div class="menu-scan-ocr" title="Tap Use this, then edit the row name if needed.">`;
      html+=`${ocr.correctionRejected?'Low confidence menu read':'We think this says'} ${photoEstimateEsc(item.suggestedName||'this item')}. <span>Tap to correct.</span>`;
      html+=`</div>`;
    }
    html+=menuScanFormatMacroSet(likely);
    if(item.reason) html+=`<div class="menu-scan-muted" style="margin-top:8px;">${photoEstimateEsc(item.reason)}</div>`;
    if(warnings.length) html+=`<div class="menu-scan-warning">${warnings.map(photoEstimateEsc).join('<br>')}</div>`;
    html+=`<button class="btn-secondary menu-scan-use-btn" type="button" data-menu-scan-use="${idx}" data-testid="menu-scan-use-btn">Use this</button>`;
    html+=`</div>`;
  });
  el.innerHTML=html;
}
async function submitMenuScan(){
  if(_menuScanInFlight) return;
  const profile=getProfile();
  if(!menuScanHasTargets(profile)){
    setMenuScanStatus('Add macro targets in Profile before using menu recommendations.','warn');
    return;
  }
  if(!_menuScanFile){
    setMenuScanStatus('Choose a menu photo first.','warn');
    return;
  }
  clearMenuScanResults();
  setMenuScanBusy(true);
  setMenuScanStatus('Preparing menu photo...');
  try{
    const resized=await resizePhotoForEstimate(_menuScanFile);
    const menuScanUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/menu-scan'):'/api/menu-scan';
    setMenuScanStatus('Scanning menu...');
    const res=await fetch(menuScanUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        image:resized.image,
        requestText:document.getElementById('menu-scan-request')?.value||'',
        selectedDate:selectedLogDate||localDateStr(),
        currentMealSection:menuScanCurrentSection(),
        profileTargets:menuScanProfileTargets(profile),
        currentDayTotals:menuScanCurrentDayTotals()
      })
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const detail=data.detail||data.error||'Could not scan this menu.';
      throw new Error(detail);
    }
    renderMenuScanResults(data);
    setMenuScanStatus('Recommendations ready.');
  }catch(e){
    console.warn('[Sous Menu Scan]',e);
    setMenuScanStatus(String(e?.message||'Could not scan this menu. Try another photo.'),'warn');
  }finally{
    setMenuScanBusy(false);
  }
}
function roundMacro(n){
  const val=Number(n);
  if(!Number.isFinite(val)||val<0) return 0;
  return Math.round(val*10)/10;
}
function photoEstimateEsc(value){
  return String(value??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function photoEstimateTotalsFallback(estimate){
  const totals=estimate?.totals||{};
  return {
    calories:Number(totals.calories??estimate?.estimatedCalories??0)||0,
    protein:Number(totals.protein??estimate?.protein??0)||0,
    carbs:Number(totals.carbs??estimate?.carbs??0)||0,
    fat:Number(totals.fat??estimate?.fat??0)||0
  };
}
function normalisePhotoEstimateItems(estimate){
  const fallback=photoEstimateTotalsFallback(estimate);
  const rawItems=Array.isArray(estimate?.items)?estimate.items:[];
  const usable=rawItems.length?rawItems:[{
    name:estimate?.mealName||'Photo meal',
    estimatedGrams:null,
    calories:fallback.calories,
    protein:fallback.protein,
    carbs:fallback.carbs,
    fat:fallback.fat,
    confidence:estimate?.confidence||'low',
    notes:estimate?.notes||''
  }];
  return usable.map((item,idx)=>({
    id:'photo_'+Date.now()+'_'+idx,
    name:(item.name||'Photo item').trim()||'Photo item',
    estimatedGrams:item.estimatedGrams!=null?Math.round(Number(item.estimatedGrams)||0):null,
    calories:Math.round(Number(item.calories??item.kcal)||0),
    protein:roundMacro(item.protein),
    carbs:roundMacro(item.carbs),
    fat:roundMacro(item.fat),
    fibre:roundMacro(item.fibre??item.fiber),
    confidence:item.confidence||estimate?.confidence||'low',
    notes:item.notes||'',
    source:item.source||estimate?.source||'photo_estimate',
    presetId:item.presetId||null
  }));
}
function normalisePhotoAdjustItems(adjustment){
  const rawItems=Array.isArray(adjustment?.items)?adjustment.items:[];
  return rawItems.map((item,idx)=>({
    id:'photo_'+Date.now()+'_adj_'+idx,
    name:(item.name||'Photo item').trim()||'Photo item',
    estimatedGrams:item.grams!=null?Math.round(Number(item.grams)||0):null,
    calories:Math.max(0,Math.round(Number(item.kcal??item.calories)||0)),
    protein:roundMacro(item.protein),
    carbs:roundMacro(item.carbs),
    fat:roundMacro(item.fat),
    fibre:roundMacro(item.fibre??item.fiber),
    confidence:item.confidence||'low',
    notes:item.reason||item.notes||''
  })).filter(item=>item.name);
}
function photoAdjustWholeMealName(data,previousDraft,items){
  const explicit=String(data?.mealName||data?.title||'').trim();
  if(explicit) return explicit;
  const previousItems=Array.isArray(previousDraft?.items)?previousDraft.items:[];
  if(previousItems.length===1&&items.length===1){
    return String(items[0]?.name||'').trim();
  }
  return '';
}
function applyPhotoEstimateMealName(name){
  const clean=String(name||'').trim();
  if(!clean||!_photoEstimateDraft) return;
  _photoEstimateDraft.mealName=clean;
  const input=document.getElementById('photo-meal-name');
  if(input) input.value=clean;
  const title=document.getElementById('photo-estimate-title');
  if(title&&/^review photo estimate$/i.test(title.textContent||'')){
    title.textContent=`Review ${clean}`;
  }
}
function clonePhotoEstimateDraft(draft=_photoEstimateDraft){
  if(!draft) return null;
  try{return JSON.parse(JSON.stringify(draft));}
  catch(e){return null;}
}
function markPhotoEstimateManualEdit(){
  if(_photoEstimateAdjustInProgress) return;
  _photoEstimateManualDirty=true;
}
function photoEstimateTotalsFromItems(items){
  return (items||[]).reduce((tot,item)=>({
    calories:tot.calories+(Number(item.calories)||0),
    protein:tot.protein+(Number(item.protein)||0),
    carbs:tot.carbs+(Number(item.carbs)||0),
    fat:tot.fat+(Number(item.fat)||0)
  }),{calories:0,protein:0,carbs:0,fat:0});
}
function updatePhotoEstimateTotals(){
  if(!_photoEstimateDraft) return;
  const totals=photoEstimateTotalsFromItems(_photoEstimateDraft.items||[]);
  const kcal=document.getElementById('photo-kcal');
  const protein=document.getElementById('photo-protein');
  const carbs=document.getElementById('photo-carbs');
  const fat=document.getElementById('photo-fat');
  if(kcal) kcal.value=Math.round(totals.calories);
  if(protein) protein.value=roundMacro(totals.protein);
  if(carbs) carbs.value=roundMacro(totals.carbs);
  if(fat) fat.value=roundMacro(totals.fat);
}
function photoEstimateSyncRows(){
  if(!_photoEstimateDraft||!Array.isArray(_photoEstimateDraft.items)) return;
  _photoEstimateDraft.items.forEach(item=>{
    const suffix=item.id;
    const name=document.getElementById('photo-item-name-'+suffix);
    const grams=document.getElementById('photo-item-grams-'+suffix);
    const kcal=document.getElementById('photo-item-kcal-'+suffix);
    const protein=document.getElementById('photo-item-protein-'+suffix);
    const carbs=document.getElementById('photo-item-carbs-'+suffix);
    const fat=document.getElementById('photo-item-fat-'+suffix);
    if(name) item.name=name.value.trim();
    if(grams) item.estimatedGrams=grams.value===''?null:Math.max(0,Math.round(Number(grams.value)||0));
    if(kcal) item.calories=Math.max(0,Math.round(Number(kcal.value)||0));
    if(protein) item.protein=roundMacro(protein.value);
    if(carbs) item.carbs=roundMacro(carbs.value);
    if(fat) item.fat=roundMacro(fat.value);
  });
  updatePhotoEstimateTotals();
}
function renderPhotoEstimateItemRows(){
  const itemsEl=document.getElementById('photo-items-list');
  if(!itemsEl||!_photoEstimateDraft) return;
  const items=_photoEstimateDraft.items||[];
  const confidence=_photoEstimateDraft.confidence?`Estimate confidence: ${photoEstimateEsc(_photoEstimateDraft.confidence)}`:'';
  const notes=_photoEstimateDraft.notes?photoEstimateEsc(_photoEstimateDraft.notes):'';
  let html='';
  if(confidence||notes){
    html+=`<div style="margin-bottom:8px;color:var(--text-muted);white-space:pre-wrap;">${[confidence,notes].filter(Boolean).join('\n')}</div>`;
  }
  if(!items.length){
    html+=`<div style="background:var(--card);border:.5px solid var(--border);border-radius:8px;padding:10px;color:var(--text-muted);">No items found. Try another photo or log manually.</div>`;
  }
  items.forEach(item=>{
    const id=item.id;
    const grams=item.estimatedGrams==null?'':item.estimatedGrams;
    const confidence=item.confidence?` · estimate confidence: ${photoEstimateEsc(item.confidence)}`:'';
    const rowNote=item.notes?`<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">${photoEstimateEsc(item.notes)}</div>`:'';
    html+=`<div style="background:var(--card);border:.5px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">`;
    html+=`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">`;
    html+=`<input type="text" class="custom-input" id="photo-item-name-${id}" value="${photoEstimateEsc(item.name)}" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Food name" style="flex:1;min-width:0;padding:7px 8px;font-size:13px;">`;
    html+=`<button type="button" onclick="deletePhotoEstimateItem('${id}')" title="Remove item" aria-label="Remove item" style="background:none;border:none;padding:4px 7px;cursor:pointer;color:var(--text-muted);font-size:16px;">✕</button>`;
    html+=`</div>`;
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:5px;">`;
    html+=`<label style="display:block;"><span style="display:block;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Qty / g</span><input type="number" class="custom-input" id="photo-item-grams-${id}" value="${grams}" min="0" placeholder="qty" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Quantity or grams" style="width:100%;padding:6px 7px;font-size:12px;"></label>`;
    html+=`<label style="display:block;"><span style="display:block;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">kcal</span><input type="number" class="custom-input" id="photo-item-kcal-${id}" value="${Math.round(Number(item.calories)||0)}" min="0" placeholder="kcal" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Calories" style="width:100%;padding:6px 7px;font-size:12px;"></label>`;
    html+=`<label style="display:block;"><span style="display:block;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Protein</span><input type="number" class="custom-input" id="photo-item-protein-${id}" value="${roundMacro(item.protein)}" min="0" step="0.1" placeholder="protein" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Protein" style="width:100%;padding:6px 7px;font-size:12px;"></label>`;
    html+=`</div>`;
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">`;
    html+=`<label style="display:block;"><span style="display:block;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Carbs</span><input type="number" class="custom-input" id="photo-item-carbs-${id}" value="${roundMacro(item.carbs)}" min="0" step="0.1" placeholder="carbs" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Carbs" style="width:100%;padding:6px 7px;font-size:12px;"></label>`;
    html+=`<label style="display:block;"><span style="display:block;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Fat</span><input type="number" class="custom-input" id="photo-item-fat-${id}" value="${roundMacro(item.fat)}" min="0" step="0.1" placeholder="fat" oninput="markPhotoEstimateManualEdit();photoEstimateSyncRows()" aria-label="Fat" style="width:100%;padding:6px 7px;font-size:12px;"></label>`;
    html+=`</div>`;
    html+=`<div style="font-size:10px;color:var(--text-muted);margin-top:5px;">Qty/unit or grams · kcal · protein · carbs · fat${confidence}</div>`;
    html+=rowNote;
    html+=`</div>`;
  });
  itemsEl.innerHTML=html;
  updatePhotoEstimateTotals();
}
function setPhotoEstimatePortion(value){
  if(!_photoEstimateDraft) return;
  markPhotoEstimateManualEdit();
  photoEstimateSyncRows();
  const next=Number(value)||1;
  const prev=Number(_photoEstimatePortion)||1;
  const ratio=prev>0?next/prev:next;
  _photoEstimatePortion=next;
  _photoEstimateDraft.items=(_photoEstimateDraft.items||[]).map(item=>({
    ...item,
    estimatedGrams:item.estimatedGrams==null?null:Math.max(0,Math.round((Number(item.estimatedGrams)||0)*ratio)),
    calories:Math.max(0,Math.round((Number(item.calories)||0)*ratio)),
    protein:roundMacro((Number(item.protein)||0)*ratio),
    carbs:roundMacro((Number(item.carbs)||0)*ratio),
    fat:roundMacro((Number(item.fat)||0)*ratio)
  }));
  renderPhotoEstimateItemRows();
}
function deletePhotoEstimateItem(id){
  if(!_photoEstimateDraft) return;
  markPhotoEstimateManualEdit();
  photoEstimateSyncRows();
  _photoEstimateDraft.items=(_photoEstimateDraft.items||[]).filter(item=>item.id!==id);
  renderPhotoEstimateItemRows();
}
function renderPhotoEstimateReview(estimate){
  _photoEstimatePortion=1;
  _photoEstimateManualDirty=false;
  _photoEstimatePreviousDraft=null;
  _photoEstimateDraft={
    mealName:estimate?.mealName||'Restaurant meal',
    source:estimate?.source||'photo_estimate',
    confidence:estimate?.confidence||'low',
    items:normalisePhotoEstimateItems(estimate),
    totals:photoEstimateTotalsFallback(estimate),
    notes:estimate?.notes||'',
    updateTarget:estimate?.updateTarget||null
  };
  const title=document.getElementById('photo-estimate-title');
  if(title) title.textContent=estimate?.reviewTitle||'Review photo estimate';
  document.getElementById('photo-meal-name').value=estimate?.mealName||'Restaurant meal';
  document.getElementById('photo-meal-section').value=estimate?.section||photoEstimateSectionDefault();
  const portion=document.getElementById('photo-portion-select');
  if(portion) portion.value='1';
  const adjustInput=document.getElementById('photo-adjust-input');
  const revertBtn=document.getElementById('photo-adjust-revert-btn');
  const adjustBox=document.querySelector('#photo-estimate-form .photo-adjust-box');
  const saveBtn=document.getElementById('photo-estimate-save-btn');
  const note=document.getElementById('photo-estimate-note');
  if(adjustInput) adjustInput.value='';
  if(revertBtn) revertBtn.style.display='none';
  if(adjustBox) adjustBox.style.display=estimate?.disableAdjust?'none':'block';
  if(saveBtn) saveBtn.textContent=estimate?.saveLabel||'Save estimate';
  if(note) note.textContent=estimate?.reviewNote||'Photo estimates are approximate. Portion size and hidden oils/sauces may be wrong.';
  setPhotoAdjustStatus('');
  renderPhotoEstimateItemRows();
  photoEstimateTrace('review_rows_rendered',{itemCount:_photoEstimateDraft.items.length});
  completePhotoProgress();
  showPhotoEstimateModal({showForm:true});
}
function buildPhotoAdjustPayload(correction){
  photoEstimateSyncRows();
  const section=document.getElementById('photo-meal-section')?.value||photoEstimateSectionDefault();
  return {
    correction,
    section,
    date:selectedLogDate||localDateStr(),
    previousEstimate:{
      mealName:(document.getElementById('photo-meal-name')?.value||_photoEstimateDraft?.mealName||'Restaurant meal').trim(),
      confidence:_photoEstimateDraft?.confidence||'low',
      notes:_photoEstimateDraft?.notes||'',
      items:(_photoEstimateDraft?.items||[]).map(item=>({
        name:item.name,
        estimatedGrams:item.estimatedGrams,
        calories:item.calories,
        protein:item.protein,
        carbs:item.carbs,
        fat:item.fat,
        fibre:item.fibre||0,
        confidence:item.confidence||'low',
        notes:item.notes||''
      }))
    }
  };
}
function applyPhotoAdjustResult(data){
  const items=normalisePhotoAdjustItems(data);
  if(!items.length) throw new Error('No revised rows returned.');
  const mealName=photoAdjustWholeMealName(data,_photoEstimateDraft,items);
  _photoEstimateDraft={
    ..._photoEstimateDraft,
    items,
    notes:[data.summary||'',...(Array.isArray(data.warnings)?data.warnings:[])].filter(Boolean).join('\n')
  };
  applyPhotoEstimateMealName(mealName);
  renderPhotoEstimateItemRows();
  photoEstimateTrace('photo_adjust_replaced_rows',{itemCount:items.length,mealNameUpdated:!!mealName});
  const revertBtn=document.getElementById('photo-adjust-revert-btn');
  if(revertBtn) revertBtn.style.display=_photoEstimatePreviousDraft?'inline-flex':'none';
  _photoEstimateManualDirty=false;
}
async function adjustPhotoEstimate(){
  if(!_photoEstimateDraft||_photoEstimateAdjustInProgress) return;
  const input=document.getElementById('photo-adjust-input');
  const correction=(input?.value||'').trim();
  if(!correction){
    setPhotoAdjustStatus('Type what needs changing first.','warn');
    return;
  }
  _photoEstimateAdjustInProgress=true;
  _photoEstimatePreviousDraft=clonePhotoEstimateDraft();
  const btn=document.getElementById('photo-adjust-btn');
  if(btn) btn.disabled=true;
  setPhotoAdjustStatus(_photoEstimateManualDirty?'Using your current edits as the starting point.':'Updating estimate...');
  if(_photoEstimateManualDirty) photoEstimateTrace('photo_adjust_preserved_manual_edits');
  photoEstimateTrace('photo_adjust_started',{correctionLength:correction.length,itemCount:_photoEstimateDraft.items?.length||0});
  startPhotoProgress('Updating estimate',12);
  try{
    const payload=buildPhotoAdjustPayload(correction);
    const adjustUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/photo-estimate-adjust'):'/api/photo-estimate-adjust';
    setPhotoProgressStage('Estimating meal',72,'Estimating');
    const res=await fetch(adjustUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.detail||data.error||'Could not update estimate.');
    setPhotoProgressStage('Building review rows',88,'Reviewing');
    applyPhotoAdjustResult(data);
    completePhotoProgress();
    photoEstimateTrace('photo_adjust_success',{itemCount:_photoEstimateDraft.items?.length||0,serverAiMs:data?._timings?.aiMs??null});
    if(input) input.value='';
    setPhotoAdjustStatus('Estimate updated. Review the rows before saving.');
  }catch(e){
    console.warn('[Sous Photo Adjust]',e);
    _photoEstimateLastAdjustError={
      t:new Date().toISOString(),
      message:String(e?.message||e||'Could not update estimate.').slice(0,240)
    };
    failPhotoProgress(_photoEstimateLastAdjustError.message);
    photoEstimateTrace('photo_adjust_failed',_photoEstimateLastAdjustError);
    setPhotoAdjustStatus(_photoEstimateLastAdjustError.message,'warn');
  }finally{
    _photoEstimateAdjustInProgress=false;
    if(btn) btn.disabled=false;
  }
}
function revertPhotoEstimateAdjustment(){
  if(!_photoEstimatePreviousDraft) return;
  _photoEstimateDraft=clonePhotoEstimateDraft(_photoEstimatePreviousDraft);
  _photoEstimatePreviousDraft=null;
  _photoEstimateManualDirty=false;
  renderPhotoEstimateItemRows();
  const revertBtn=document.getElementById('photo-adjust-revert-btn');
  if(revertBtn) revertBtn.style.display='none';
  setPhotoAdjustStatus('Previous estimate restored.');
}
function menuScanPhotoUpdateRows(meal){
  return (Array.isArray(meal?.ingredients)?meal.ingredients:[]).map(item=>({
    name:item.name,
    estimatedGrams:item.weight??item.estimatedGrams??null,
    calories:item.kcal??item.calories??0,
    kcal:item.kcal??item.calories??0,
    protein:item.protein||0,
    carbs:item.carbs||0,
    fat:item.fat||0,
    confidence:item.confidence||'low',
    notes:item.notes||'',
    source:item.source||'menu_scan',
    presetId:item.presetId||null
  }));
}
async function handleMenuScanPhotoUpdateFile(file){
  const target=_menuScanPhotoUpdateTarget;
  const found=getMenuScanPhotoUpdateMeal(target);
  const meal=found?.meal;
  if(!meal||!isMenuScanPhotoUpdateMeal(meal)){
    _menuScanPhotoUpdateTarget=null;
    showToast('Could not find that menu-scanned meal');
    return;
  }
  if(!_photoEstimateTraceStart) resetPhotoEstimateTrace();
  photoEstimateTrace('menu_scan_photo_update_selected',{
    fileType:file.type||'unknown',
    fileSizeKb:Math.round((file.size||0)/1024),
    itemCount:meal.ingredients?.length||0
  });
  _photoEstimateDraft=null;
  setPhotoEstimatePreview(file);
  showPhotoEstimateModal({status:'Loading photo',showForm:false});
  startPhotoProgress('Loading photo',8);
  startPhotoEstimateSlowTimer();
  try{
    setPhotoEstimateStatus('Compressing image');
    setPhotoProgressStage('Compressing image',24,'Preparing');
    const resized=await resizePhotoForEstimate(file);
    const updateUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/menu-scan/photo-update'):'/api/menu-scan/photo-update';
    setPhotoEstimateStatus('Uploading');
    setPhotoProgressStage('Uploading',38,'Uploading');
    photoEstimateTrace('upload_started',{
      route:'menu_scan_photo_update',
      resizedBytes:resized.bytes||0,
      width:resized.width||null,
      height:resized.height||null
    });
    setPhotoEstimateStatus('Updating estimate');
    setPhotoProgressStage('Estimating meal',72,'Estimating');
    const res=await fetch(updateUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        image:resized.image,
        existingRows:menuScanPhotoUpdateRows(meal),
        mealName:meal.name||'Menu meal',
        notes:meal.notes||'',
        section:meal.section||null,
        mealId:meal.id||null
      })
    });
    const data=await res.json().catch(()=>({}));
    photoEstimateTrace('upload_finished',{status:res.status,ok:res.ok,route:'menu_scan_photo_update'});
    if(!res.ok){
      const detail=data.detail||data.error||'Could not update estimate.';
      throw new Error(detail);
    }
    setPhotoEstimateStatus('Building editable rows');
    setPhotoProgressStage('Building review rows',88,'Reviewing');
    renderPhotoEstimateReview({
      ...data,
      source:'menu_scan',
      section:data.section||meal.section||photoEstimateSectionDefault(),
      mealName:data.mealName||meal.name||'Updated menu meal',
      reviewTitle:data.reviewTitle||'Review updated menu estimate',
      saveLabel:data.saveLabel||'Update meal',
      disableAdjust:data.disableAdjust!==false,
      reviewNote:data.reviewNote||'Review and edit before replacing this saved menu-scan meal. Estimates are approximate.',
      updateTarget:{...target,mealIdx:found.idx,mealId:meal.id}
    });
  }catch(e){
    console.warn('[Sous Menu Scan Photo Update]',e);
    rememberPhotoEstimateError(e,'menu_scan_photo_update');
    const detail=String(e&&e.message||'').trim();
    const message=detail
      ? `Could not update this menu meal: ${detail}`
      : 'Could not update this menu meal. Please try another photo.';
    failPhotoProgress(message);
    showPhotoEstimateModal({status:message,showForm:false});
  }finally{
    clearPhotoEstimateSlowTimer();
  }
}
async function handlePhotoEstimateFile(file){
  if(!file) return;
  if(_menuScanPhotoUpdateTarget){
    await handleMenuScanPhotoUpdateFile(file);
    return;
  }
  if(!_photoEstimateTraceStart) resetPhotoEstimateTrace();
  photoEstimateTrace('photo_selected',{
    fileType:file.type||'unknown',
    fileSizeKb:Math.round((file.size||0)/1024)
  });
  _photoEstimateDraft=null;
  setPhotoEstimatePreview(file);
  showPhotoEstimateModal({status:'Loading photo',showForm:false});
  startPhotoProgress('Loading photo',8);
  startPhotoEstimateSlowTimer();
  try{
    setPhotoEstimateStatus('Compressing image');
    setPhotoProgressStage('Compressing image',24,'Preparing');
    const resized=await resizePhotoForEstimate(file);
    const photoEstimateUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/photo-estimate'):'/api/photo-estimate';
    setPhotoEstimateStatus('Uploading');
    setPhotoProgressStage('Uploading',38,'Uploading');
    photoEstimateTrace('upload_started',{
      resizedBytes:resized.bytes||0,
      width:resized.width||null,
      height:resized.height||null
    });
    setPhotoEstimateStatus('Estimating meal');
    setPhotoProgressStage('Estimating meal',72,'Estimating');
    photoEstimateTrace('ai_started',{route:'server'});
    const res=await fetch(photoEstimateUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image:resized.image})
    });
    const data=await res.json().catch(()=>({}));
    photoEstimateTrace('upload_finished',{status:res.status,ok:res.ok});
    photoEstimateTrace('ai_finished',{
      serverAiMs:data?._timings?.aiMs??null,
      serverTotalMs:data?._timings?.totalMs??null
    });
    if(!res.ok){
      const detail=data.detail||data.error||'Photo estimate failed.';
      throw new Error(detail);
    }
    setPhotoEstimateStatus('Building editable rows');
    setPhotoProgressStage('Building review rows',88,'Reviewing');
    renderPhotoEstimateReview(data);
  }catch(e){
    console.warn('[Sous Photo Estimate]',e);
    rememberPhotoEstimateError(e,'estimate');
    const detail=String(e&&e.message||'').trim();
    const message=detail
      ? `Could not estimate this photo: ${detail}`
      : 'Could not estimate this photo. Please try another photo or log the meal manually.';
    failPhotoProgress(message);
    showPhotoEstimateModal({status:message,showForm:false});
  }finally{
    clearPhotoEstimateSlowTimer();
  }
}
function replaceMenuScanPhotoUpdateMeal(updateTarget,mealObj){
  const found=getMenuScanPhotoUpdateMeal(updateTarget);
  if(!found?.meal||!isMenuScanPhotoUpdateMeal(found.meal)) return false;
  const original=found.meal;
  const date=updateTarget.dateStr;
  found.meals[found.idx]={
    ...original,
    ...mealObj,
    id:original.id||mealObj.id,
    time:original.time||mealObj.time,
    source:'menu_scan',
    updatedAt:new Date().toISOString()
  };
  found.log[date].totals=sumMacros(found.log[date].meals.map(m=>m.totals));
  saveLog(found.log);
  return true;
}
function saveReviewedPhotoEstimate(){
  if(!_photoEstimateDraft) return;
  photoEstimateSyncRows();
  const section=document.getElementById('photo-meal-section')?.value||photoEstimateSectionDefault();
  const name=(document.getElementById('photo-meal-name')?.value||'Restaurant meal').trim()||'Restaurant meal';
  const sourceItems=Array.isArray(_photoEstimateDraft.items)?_photoEstimateDraft.items:[];
  const ingredients=sourceItems
    .map((item,idx)=>({
      id:Date.now()+idx,
      name:(item.name||'Photo item').trim(),
      weight:item.estimatedGrams!=null?Math.round(Number(item.estimatedGrams)||0):null,
      kcal:Math.round(Number(item.calories)||0),
      protein:roundMacro(item.protein),
      carbs:roundMacro(item.carbs),
      fat:roundMacro(item.fat),
      fibre:roundMacro(item.fibre),
      icon:'ti-camera',
      type:'solid',
      confidence:item.confidence||'low',
      notes:item.notes||'',
      source:item.source||_photoEstimateDraft.source||'photo_estimate',
      presetId:item.presetId||undefined
    }))
    .filter(item=>item.name);
  if(!ingredients.length){
    showToast('Keep at least one item before saving');
    return;
  }
  const mt=sumMacros(ingredients);
  const totals={
    kcal:Math.round(mt.kcal),
    protein:roundMacro(mt.protein),
    carbs:roundMacro(mt.carbs),
    fat:roundMacro(mt.fat),
    fibre:0
  };
  const log=getLog();
  const date=selectedLogDate||localDateStr();
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const mealObj={
    id:Date.now(),
    name,
    time:new Date().toISOString(),
    section,
    source:_photoEstimateDraft.source||'photo_estimate',
    confidence:_photoEstimateDraft.confidence||'low',
    notes:_photoEstimateDraft.notes||'',
    portionScale:_photoEstimatePortion,
    ingredients,
    savedIngredients:ingredients,
    totals
  };
  if(_photoEstimateDraft.updateTarget){
    const updated=replaceMenuScanPhotoUpdateMeal(_photoEstimateDraft.updateTarget,mealObj);
    if(!updated){
      showToast('Could not update that menu-scanned meal');
      return;
    }
    closePhotoEstimateModal();
    _photoEstimateDraft=null;
    _photoEstimatePortion=1;
    showToast('Menu meal updated',2400);
    renderHome();
    if(currentTab==='history'&&typeof renderHistoryDay==='function') renderHistoryDay();
    return;
  }
  log[date].meals.push(mealObj);
  log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  saveLog(log);
  closePhotoEstimateModal();
  const savedSource=_photoEstimateDraft.source||'photo_estimate';
  _photoEstimateDraft=null;
  _photoEstimatePortion=1;
  showToast(savedSource==='menu_scan'?'Menu choice saved':'Photo estimate saved',2400);
  renderHome();
}

let _usualMenuSection=null,_usualMenuIdx=null;
function openUsualMealMenu(section,idx){
  _usualMenuSection=section; _usualMenuIdx=idx;
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  const el=document.getElementById('usual-meal-menu-title');
  if(el&&u) el.textContent=u.name;
  document.getElementById('usual-meal-menu-modal')?.classList.add('show');
}
function closeUsualMealMenu(){
  document.getElementById('usual-meal-menu-modal')?.classList.remove('show');
  _usualMenuSection=null; _usualMenuIdx=null;
}
function doRenameUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  closeUsualMealMenu();
  if(!u) return;
  const newName=window.prompt('New name for this usual meal:',u.name);
  if(newName&&newName.trim()&&newName.trim()!==u.name){
    renameUsualMeal(section,idx,newName.trim());
    renderHome();
  }
}
function doRemoveUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  closeUsualMealMenu();
  removeUsualMeal(section,idx);
  renderHome();
}
function doEditCopyUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  closeUsualMealMenu();
  editCopyUsualMeal(section,idx);
}
function editCopyUsualMeal(section,idx){
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  if(!u||!u.ingredients||!u.ingredients.length) return;
  currentEditMealId=null; currentEditMealDate=null;
  switchTab('log',{fresh:true,silent:true,section:u.section||section,quick:true});
  addMealToCurrent(u);
}

function getJotMealWindow(){
  const h=new Date().getHours();
  return h<11?'breakfast':h<16?'lunch':h<21?'dinner':'snacks';
}

function renderHomeMealSections(meals){
  const esc=s=>escapeHtml(s);
  const jsEsc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const ingLabel=i=>`${i.name}${i.weight||i.serving?' '+(typeof itemWeightLabel==='function'?itemWeightLabel(i):(i.weight+'g')):''}`;
  const buckets={breakfast:[],lunch:[],dinner:[],snacks:[],supplements:[]};
  meals.forEach(m=>{
    const sk=homeMealSectionKey(m);
    (buckets[sk]||buckets.snacks).push(m);
  });
  Object.keys(buckets).forEach(k=>buckets[k].sort((a,b)=>new Date(a.time)-new Date(b.time)));
  const activeKey=getJotMealWindow();
  const activeLabel=(HOME_MEAL_SECTIONS.find(s=>s.key===activeKey)?.label||activeKey).toLowerCase();
  let html='';
  const usuals=(typeof getUsualMealsForSection==='function'?getUsualMealsForSection(activeKey):(usualsBySection[activeKey]||[])).slice(0,3);
  if(usuals.length){
    const cards=usuals.map((u,i)=>{
      const cls=i===0?'usual-card most-used':'usual-card';
      const mt=sumMacros(u.ingredients||[]);
      const kcal=Math.round(mt.kcal||0);
      const useCount=Number(u.useCount)||Number(u.count)||0;
      const macroBits=[Math.round(mt.protein||0)+'P',Math.round(mt.carbs||0)+'C',Math.round(mt.fat||0)+'F'].join(' ');
      return`<div role="button" tabindex="0" class="${cls}" onclick="logUsualMealByIndex('${activeKey}',${i})"><div class="usual-card-copy"><div class="usual-card-name">${esc(u.name)}</div><div class="usual-card-meta">${useCount?`<span class="x">x${useCount}</span>`:''}<span class="kcal">${kcal} kcal · ${macroBits}</span></div></div><button type="button" class="usual-add-btn" onclick="event.stopPropagation();logUsualMealByIndex('${activeKey}',${i})" aria-label="Add ${esc(u.name)}"><i class="ti ti-plus"></i></button><button type="button" class="usual-card-menu-btn" onclick="event.stopPropagation();openUsualMealMenu('${jsEsc(activeKey)}',${i})" aria-label="Manage usual meal">⋯</button></div>`;
    }).join('');
    html+=`<div class="home-usuals">${cards}</div>`;
  } else {
    html+=`<div class="home-section-repeat-card" onclick="startLogWithSection('${activeKey}')"><div class="home-section-repeat-row"><div class="home-section-last-meal"><strong>No usual ${esc(activeLabel)} yet</strong> · log one and save it as usual</div><i class="ti ti-chevron-right repeat-chevron"></i></div></div>`;
  }

  const last=getLastMealBySection(activeKey);
  if(last){
    const nm=esc((last.name||'').trim()||'Unnamed meal');
    const sourceDate=formatQuickLogSourceDate(last._historyDate);
    html+=`<div class="home-section-repeat-card" onclick="repeatLastMealForSection('${activeKey}')"><div class="home-section-repeat-row"><div class="home-section-last-meal">${sourceDate?esc(sourceDate):'Last'} · <strong>${nm}</strong></div><i class="ti ti-chevron-right repeat-chevron"></i></div></div>`;
  }

  const sectionRecent=getRecentIngredientsForSection(activeKey);
  if(sectionRecent.length){
    const chips=sectionRecent.slice(0,8).map(r=>`<button type="button" class="recent-chip" onclick="startLogWithRecentIngredientByName('${esc(jsEsc(r.name))}','${activeKey}')">+ ${esc(r.name)}</button>`).join('');
    html+=`<div class="section-label"><span>Recent · tap to add</span></div><div class="recent-chips">${chips}</div>`;
  }

  html+='<div class="today-meals-label">Today’s meals</div>';
  html+=HOME_MEAL_SECTIONS.map(({key,label})=>{
    const arr=buckets[key];
    const inner=arr.length?arr.map(homeMealRowHtml).join(''):'<div class="home-meal-empty">Nothing logged yet</div>';
    const loggedBlock=`<div class="home-meal-logged-block"><div class="home-meal-logged-hint">Logged</div>${inner}</div>`;
    return`<div class="home-meal-section"><div class="home-meal-section-header"><div class="home-meal-section-title">${label}</div><button type="button" class="home-meal-section-add" onclick="startLogWithSection('${key}')">+ Add</button></div>${loggedBlock}</div>`;
  }).join('');
  return html;
}

function ensureHomeRecentIngredientsMount(){
  let el=document.getElementById('home-recent-ingredients');
  if(el) return el;
  const label=document.getElementById('home-meals-label');
  if(!label||!label.parentNode) return null;
  el=document.createElement('div');
  el.id='home-recent-ingredients';
  label.parentNode.insertBefore(el, label);
  return el;
}
function renderHomeRecentIngredients(){
  // Recent ingredients are now rendered per-section inside renderHomeMealSections
  const mount=ensureHomeRecentIngredientsMount();
  if(mount){mount.innerHTML='';mount.style.display='none';}
}

function renderHome(){
  updateDateNav();
  const profile=getProfile();
  const log=getLog();
  const dayData=log[selectedLogDate]||{meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const t=dayData.totals||{kcal:0,protein:0,carbs:0,fat:0,fibre:0};
  const mealWindow=getJotMealWindow();
  const mealLabel=(HOME_MEAL_SECTIONS.find(s=>s.key===mealWindow)?.label)||'Snacks';
  const selectedDateObj=new Date(selectedLogDate+'T12:00:00');
  const selectedDateLabel=selectedDateObj.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  document.getElementById('home-greeting').textContent=(selectedLogDate===localDateStr()?'Today':'Viewing')+' · '+selectedDateLabel;
  const profileName=profile.name?'<span class="home-user">'+escapeHtml(profile.name)+'</span>':'';
  document.getElementById('home-name').innerHTML=escapeHtml(mealLabel)+profileName;
  const context=document.getElementById('home-meal-context');
  if(context){
    const mealsLeft=HOME_MEAL_SECTIONS.filter(s=>!hasMealForSectionOnSelectedDate(s.key,dayData.meals||[])).length;
    context.textContent=`${mealsLeft} meal${mealsLeft!==1?'s':''} to log`;
  }
  const avatar=document.getElementById('home-avatar');
  if(avatar) avatar.textContent=(profile.name||'J').trim().charAt(0).toUpperCase()||'J';
  const hasProfile=!!(profile.targetKcal||profile.name);
  document.getElementById('no-profile-banner').style.display=hasProfile?'none':'block';
  const streak=calcStreak();
  const sEl=document.getElementById('home-streak');
  if(streak>0){sEl.style.display='block';document.getElementById('home-streak-text').textContent=`${streak} day streak`;}
  else sEl.style.display='none';
  const kcal=Math.round(t.kcal||0);
  document.getElementById('home-kcal').textContent=kcal.toLocaleString();
  const tk=profile.targetKcal||null;
  document.getElementById('home-kcal-goal').textContent=tk?`/ ${tk.toLocaleString()} kcal`:'/ — kcal';
  const CIRC=213.628,pct=tk?Math.min(1,kcal/tk):0;
  const ring=document.getElementById('kcal-ring-fill');
  if(ring) ring.style.strokeDashoffset=CIRC*(1-pct);
  document.getElementById('kcal-ring-pct').textContent=tk?Math.round(pct*100)+'%':'0%';
  const progressState=document.getElementById('home-progress-state');
  if(progressState) progressState.textContent=!tk?'set target':pct>1?'over':pct>.88?'near cap':'on pace';
  const pill=document.getElementById('kcal-pill-fill');
  if(pill) pill.style.width=Math.round(pct*100)+'%';
  [['protein',t.protein||0,profile.targetProtein],['carbs',t.carbs||0,profile.targetCarbs],['fat',t.fat||0,profile.targetFat]].forEach(([id,val,tgt])=>{
    const v=Math.round(val),p=tgt?Math.min(100,Math.round(v/tgt*100)):0;
    document.getElementById('bar-'+id).style.width=p+'%';
    document.getElementById('val-'+id).textContent=`${v}g`;
  });
  const meals=dayData.meals||[];
  const listEl=document.getElementById('home-meals-list');
  const label=document.getElementById('home-meals-label');
  if(label) label.innerHTML=`<span>The usual · ${escapeHtml(mealLabel.toLowerCase())}</span><button type="button" class="home-meal-section-add" onclick="startLogWithSection('${mealWindow}')">+ Add</button>`;
  listEl.innerHTML=renderHomeMealSections(meals);
  renderHomeRecentIngredients();
}

function homeLogWeight(){
  const inp=document.getElementById('home-bw-input');
  const val=typeof displayToKg==='function'?displayToKg(inp.value):parseFloat(inp.value);
  if(!val||val<20||val>400){showToast('Enter a valid weight');return;}
  const weights=getWeights(),today=todayStr();
  const idx=weights.findIndex(w=>w.date===today);
  if(idx>=0) weights[idx].kg=val; else weights.push({date:today,kg:val});
  weights.sort((a,b)=>a.date.localeCompare(b.date));
  saveWeights(weights);
  profState.currentWeight=val;
  saveProfile({...getProfile(),currentWeight:val});
  inp.value='';
  recalcTDEE();
  renderHome();
  showToast('Weight logged + targets updated ✓');
}

function renderCurrentMeal(){
  const container=document.getElementById('current-meal-list');
  if(!container) return;
  if(!meal.length){container.style.display='none';container.innerHTML='';return;}
  meal.forEach(i=>{if(!i.id)i.id=nextIngId++;});
  const t=sumMacros(meal);
  container.style.display='block';
  container.innerHTML='';

  const header=document.createElement('div');
  header.className='capture-meal-header';
  header.innerHTML=`<span>Recognised</span><span>${Math.round(t.kcal)} kcal · ${Math.round(t.protein)}g P</span>`;
  container.appendChild(header);

  meal.forEach(i=>{
    const row=document.createElement('div');
    row.className='capture-row meal-item';
    row.dataset.id=i.id;
    const qty=i.weight||i.serving?itemWeightLabel(i):'item';
    row.innerHTML=`<span class="capture-qty">${escapeHtml(qty)}</span><span class="capture-name">${escapeHtml(i.name||'Item')}</span><span class="capture-kcal">${Math.round(Number(i.kcal)||0)} kcal</span><button type="button" title="Edit" class="capture-edit"><i class="ti ti-pencil"></i></button><button type="button" title="Remove" class="capture-remove">x</button>`;
    row.querySelector('.capture-edit')?.addEventListener('click',e=>{e.stopPropagation();openEditModal(i.id);});
    row.querySelector('.capture-remove')?.addEventListener('click',e=>{e.stopPropagation();deleteFromCurrentMeal(i.id);});
    row.addEventListener('click',()=>openEditModal(i.id));
    container.appendChild(row);
  });
  if(typeof voiceDebugTrace==='function') voiceDebugTrace('ui_updated',{screen:document.querySelector('.log-screen.active')?.id||null,reason:'render_current_meal_jot',mealCount:meal.length});
}

function updateJotReviewChrome(){
  const section=document.getElementById('sum-section-select')?.value||currentMealSection||getJotMealWindow();
  const label=HOME_MEAL_SECTIONS.find(s=>s.key===section)?.label||'Meal';
  const title=document.getElementById('sum-review-title');
  if(title) title.textContent=label+' · '+new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  const name=document.getElementById('sum-meal-name');
  if(name&&name.tagName==='TEXTAREA'){
    name.style.height='auto';
    name.style.height=Math.max(74,name.scrollHeight)+'px';
  }
  const chip=document.getElementById('listen-meal-chip');
  if(chip) chip.innerHTML='<i class="ti ti-point-filled"></i> '+escapeHtml(HOME_MEAL_SECTIONS.find(s=>s.key===(currentMealSection||section))?.label||label);
}

function initJotStructuralUi(){
  if(typeof showLogScreen==='function'&&!showLogScreen.__jotWrapped){
    const baseShowLogScreen=showLogScreen;
    showLogScreen=function(id){
      const ret=baseShowLogScreen(id);
      if(id==='summary') setTimeout(updateJotReviewChrome,0);
      if(id==='listening') setTimeout(updateJotReviewChrome,0);
      return ret;
    };
    showLogScreen.__jotWrapped=true;
  }
  document.getElementById('save-usual-btn')?.addEventListener('click',()=>{
    const chk=document.getElementById('sum-save-usual');
    if(chk) chk.checked=true;
    document.getElementById('save-meal-btn')?.click();
  });
  document.getElementById('ing-list')?.addEventListener('click',e=>{
    const row=e.target.closest?.('.ing-item');
    if(!row) return;
    document.querySelectorAll('#ing-list .ing-item.selected').forEach(el=>el.classList.remove('selected'));
    row.classList.add('selected');
  },true);
  document.getElementById('sum-section-select')?.addEventListener('change',updateJotReviewChrome);
  document.getElementById('sum-meal-name')?.addEventListener('input',updateJotReviewChrome);
}

function startCookingLog(){ currentEditMealId=null; currentEditMealDate=null; switchTab('log',{fresh:true}); }
function startLogWithSection(key){ currentEditMealId=null; currentEditMealDate=null; switchTab('log',{fresh:true,silent:true,section:key}); }
function startLogWithRecentIngredient(recent, section=null){
  currentEditMealId=null; currentEditMealDate=null;
  const logDateKey=selectedLogDate;
  const resolvedSection=(section!=null&&section!=='')?section:getDefaultQuickAddSection(logDateKey);
  switchTab('log',{fresh:true,silent:true,section:resolvedSection,quick:true});
  if(typeof addIngredientFromRecent==='function') addIngredientFromRecent(recent);
}
function repeatLastMealForSection(section){
  currentEditMealId=null; currentEditMealDate=null;
  switchTab('log',{fresh:true,silent:true,section,quick:true});
  addMealToCurrent(getLastMealBySection(section));
}
function addMealToCurrent(sourceMeal){
  if(!sourceMeal||!sourceMeal.ingredients||!sourceMeal.ingredients.length) return;
  snapshotMeal();
  sourceMeal.ingredients.forEach(ing=>{
    addIngredientToMeal({...ing}, {source:'repeat', skipSnapshot:true, skipPersist:true});
  });
  currentMealSection=sourceMeal.section||currentMealSection;
  if(typeof _persistDraft==='function') _persistDraft();
  renderCurrentMeal();
}
function cloneMealMemoryIngredientForRecall(item,index=0){
  const copy=typeof cloneMealMemoryIngredients==='function'
    ?cloneMealMemoryIngredients([item])[0]
    :JSON.parse(JSON.stringify(item||{}));
  if(!copy) return null;
  delete copy.id;
  if(!copy.name) copy.name='Item '+(index+1);
  return copy;
}
function addMealMemoryToCurrent(memory,options={}){
  if(!memory||!Array.isArray(memory.ingredients)||!memory.ingredients.length) return {ok:false,message:"That memory doesn't have ingredients yet."};
  const sourceIngredients=Array.isArray(options.ingredients)?options.ingredients:memory.ingredients;
  const items=sourceIngredients.map(cloneMealMemoryIngredientForRecall).filter(Boolean);
  if(!items.length) return {ok:false,message:"That memory doesn't have ingredients yet."};
  snapshotMeal();
  items.forEach(item=>{
    addIngredientToMeal(item,{source:'meal-memory',skipSnapshot:true,skipPersist:true});
  });
  if(memory.section) currentMealSection=memory.section;
  else currentMealSection=currentMealSection||defaultSectionFromTime();
  if(typeof _persistDraft==='function') _persistDraft();
  if(typeof renderCurrentMeal==='function') renderCurrentMeal();
  if(typeof updateHome==='function') updateHome();
  if(!options.skipUsage&&typeof updateMealMemory==='function'&&memory.id){
    updateMealMemory(memory.id,{useCount:(Number(memory.useCount)||0)+1,lastUsed:Date.now()});
    if(typeof renderMealMemoryManagement==='function') renderMealMemoryManagement();
  }
  if(!options.silentToast) showToast('Added '+(memory.name||'meal'),2600);
  return {ok:true,items};
}
function useMealMemoryFromProfile(id){
  const memory=typeof findMealMemoryById==='function'?findMealMemoryById(id):null;
  if(!memory) return;
  currentEditMealId=null; currentEditMealDate=null;
  switchTab('log',{fresh:true,silent:true,section:memory.section||null,quick:true});
  const applied=addMealMemoryToCurrent(memory);
  if(!applied.ok&&applied.message) showToast(applied.message,2600);
}
window.addMealMemoryToCurrent=addMealMemoryToCurrent;
window.useMealMemoryFromProfile=useMealMemoryFromProfile;
window.parseMealMemoryTransform=parseMealMemoryTransform;
window.applyMealMemoryTransformToItems=applyMealMemoryTransformToItems;

function deleteMealFromHome(id){
  const log=getLog();
  const day=log[selectedLogDate];
  if(!day) return;
  day.meals=day.meals.filter(m=>m.id!==id);
  if(day.meals.length===0) delete log[selectedLogDate];
  else day.totals=sumMacros(day.meals.map(m=>m.totals));
  saveLog(log);
  renderHome();
  if(typeof speakCachedResponse==='function') speakCachedResponse('deleted');
}

function startEditMeal(id){
  const log=getLog();
  const day=log[selectedLogDate];
  if(!day) return;
  const m=day.meals.find(m=>m.id===id);
  if(!m) return;
  currentEditMealId=id;
  currentEditMealDate=selectedLogDate;
  switchTab('log',{fresh:true,silent:true,section:m.section});
  addMealToCurrent(m);
}

// ═══════════════════════════════════════════
// HOME UPDATER (called from speech.js)
// ═══════════════════════════════════════════
function updateHome(){ if(currentTab==='home') renderHome(); }

// ═══════════════════════════════════════════
// PWA — MANIFEST + SERVICE WORKER
// ═══════════════════════════════════════════
const SOUS_CACHE_VERSION='sous-v24';

window.__sousClearCachesAndReload=async function(){
  if('serviceWorker' in navigator){
    const registrations=await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration=>registration.unregister()));
  }
  if('caches' in window){
    const keys=await caches.keys();
    await Promise.all(keys.map(key=>caches.delete(key)));
  }
  location.reload();
};

function initPWA(){
  console.log(`[Sous] active cache version: ${SOUS_CACHE_VERSION}`);

  // Inject inline manifest via blob URL (enables Add to Home Screen / install prompt)
  const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="%23F4F0E6"/><circle cx="372" cy="354" r="34" fill="%23F8C91C"/><text x="256" y="330" font-size="210" text-anchor="middle" fill="%2317140F" font-family="Geist,Arial,sans-serif" font-weight="700">J</text></svg>`;
  const manifest={
    name:'Jot — Voice Food Log',
    short_name:'Jot',
    description:'Log meals quickly with your voice',
    start_url:location.href,
    display:'standalone',
    background_color:'#F4F0E6',
    theme_color:'#17140F',
    orientation:'portrait-primary',
    categories:['health','fitness'],
    icons:[
      {src:`data:image/svg+xml,${icon}`,sizes:'512x512',type:'image/svg+xml',purpose:'any'},
      {src:`data:image/svg+xml,${icon}`,sizes:'512x512',type:'image/svg+xml',purpose:'maskable'}
    ]
  };
  try{
    const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('link');
    link.rel='manifest'; link.href=url;
    document.head.appendChild(link);
  }catch(e){}

  // Service worker — keeps the installed PWA fresh while preserving offline fallback.
  if('serviceWorker' in navigator){
    try{
      const swUrl=new URL('sw.js',location.href);
      swUrl.searchParams.set('v',SOUS_CACHE_VERSION);
      navigator.serviceWorker.register(swUrl,{scope:'./'})
        .then(registration=>registration.update().catch(error=>{
          if(isSousDevHost()) console.warn('[Sous] service worker update failed',error);
        }))
        .catch(error=>{
          if(isSousDevHost()) console.warn('[Sous] service worker registration failed',error);
        });
    }catch(e){
      if(isSousDevHost()) console.warn('[Sous] service worker setup failed',e);
    }
  }
}

function isSousDevHost(){
  const host=location.hostname;
  return host==='localhost'||host==='127.0.0.1'||host==='[::1]'||host==='::1';
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function initDateNav(){
  document.getElementById('date-prev').addEventListener('click',()=>shiftDate(-1));
  document.getElementById('date-next').addEventListener('click',()=>shiftDate(1));
  document.getElementById('date-label').addEventListener('click',()=>{
    const picker=document.getElementById('date-picker');
    picker.value=selectedLogDate;
    try{ picker.showPicker(); } catch(e){ picker.click(); }
  });
  document.getElementById('date-picker').addEventListener('change',e=>{
    if(e.target.value){
      selectedLogDate=e.target.value;
      renderHome();
    }
  });
}

function initPhotoEstimate(){
  document.getElementById('photo-estimate-input')?.addEventListener('change',e=>handlePhotoEstimateFile(e.target.files&&e.target.files[0]));
  document.getElementById('photo-estimate-library-input')?.addEventListener('change',e=>handlePhotoEstimateFile(e.target.files&&e.target.files[0]));
  document.getElementById('photo-estimate-close-btn')?.addEventListener('click',closePhotoEstimateModal);
  document.getElementById('photo-estimate-cancel-btn')?.addEventListener('click',closePhotoEstimateModal);
  document.getElementById('photo-estimate-modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('photo-estimate-modal'))closePhotoEstimateModal();});
  document.getElementById('photo-estimate-save-btn')?.addEventListener('click',saveReviewedPhotoEstimate);
  document.getElementById('photo-portion-select')?.addEventListener('change',e=>setPhotoEstimatePortion(e.target.value));
  document.getElementById('photo-adjust-btn')?.addEventListener('click',adjustPhotoEstimate);
  document.getElementById('photo-adjust-revert-btn')?.addEventListener('click',revertPhotoEstimateAdjustment);
}

function initMenuScan(){
  document.getElementById('menu-scan-open-btn')?.addEventListener('click',openMenuScanModal);
  document.getElementById('menu-scan-camera-btn')?.addEventListener('click',openMenuScanCameraPicker);
  document.getElementById('menu-scan-library-btn')?.addEventListener('click',openMenuScanLibraryPicker);
  document.getElementById('menu-scan-input')?.addEventListener('change',e=>handleMenuScanFile(e.target.files&&e.target.files[0]));
  document.getElementById('menu-scan-library-input')?.addEventListener('change',e=>handleMenuScanFile(e.target.files&&e.target.files[0]));
  document.getElementById('menu-scan-submit-btn')?.addEventListener('click',submitMenuScan);
  document.getElementById('menu-scan-close-btn')?.addEventListener('click',closeMenuScanModal);
  document.getElementById('menu-scan-cancel-btn')?.addEventListener('click',closeMenuScanModal);
  document.getElementById('menu-scan-results')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-menu-scan-use]');
    if(!btn) return;
    useMenuScanSuggestion(Number(btn.dataset.menuScanUse));
  });
  document.getElementById('menu-scan-modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('menu-scan-modal'))closeMenuScanModal();});
}

window.openMenuScanModal=openMenuScanModal;
window.useMenuScanSuggestion=useMenuScanSuggestion;
window.__sousMenuScanState=()=>({
  hasFile:!!_menuScanFile,
  inFlight:!!_menuScanInFlight,
  hasResult:!!_menuScanLastResult,
  suggestionCount:Array.isArray(_menuScanLastResult?.suggestions)?_menuScanLastResult.suggestions.length:0
});
window.__sousPhotoTimingTrace=()=>_photoEstimateTrace.slice(-100);
window.__sousLastPhotoError=()=>_photoEstimateLastError?{..._photoEstimateLastError}:null;
window.__sousPhotoEstimateState=()=>({
  hasPhotoEstimate:!!_photoEstimateDraft,
  mealName:_photoEstimateDraft?.mealName||null,
  photoEstimateItemCount:Array.isArray(_photoEstimateDraft?.items)?_photoEstimateDraft.items.length:0,
  photoAdjustInProgress:!!_photoEstimateAdjustInProgress,
  lastPhotoAdjustError:_photoEstimateLastAdjustError?{..._photoEstimateLastAdjustError}:null
});

function init(){
  setCurrentCountry(typeof getUserCountry==='function'?getUserCountry():'GLOBAL');
  updateClock(); setInterval(updateClock,10000);
  initDateNav();
  initPhotoEstimate();
  initMenuScan();
  initJotStructuralUi();
  renderHome();
  wireLogButtons();
  initProfile();
  renderRecipeList();
  initPWA();
  if(window.speechSynthesis){window.speechSynthesis.onvoiceschanged=()=>window.speechSynthesis.getVoices();window.speechSynthesis.getVoices();}
}
if(!window.SOUS_SKIP_INIT) init();
