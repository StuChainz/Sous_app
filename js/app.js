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

function canUseAIInterpretation(){
  const plan=(localStorage.getItem('userPlan')||'pro').trim().toLowerCase();
  return plan==='pro';
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
  return d.toISOString().slice(0,10);
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
async function handleTranscript(transcript,rawText){
  const cleanTranscript=String(transcript||'').trim();
  if(handleDeterministicMemoryCommand(parseDeterministicMemoryCommand(cleanTranscript),cleanTranscript)) return;
  if(cleanTranscript&&canUseAIInterpretation()&&typeof aiActionReferenceTrigger==='function'&&aiActionReferenceTrigger(cleanTranscript)&&typeof interpretMealActionWithAI==='function'){
    try{
      const action=await interpretMealActionWithAI({
        transcript:cleanTranscript,
        section:typeof currentMealSection!=='undefined'?currentMealSection:null,
        countryCode:typeof currentCountry!=='undefined'?currentCountry:null
      });
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
      results:typeof voiceDebugResultSummary==='function'?voiceDebugResultSummary(results):results
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
    handleParsed(results,rawText);
    return;
  }

  const key=transcript.trim().toLowerCase();
  if(key===_lastAITranscript){
    // Same input already sent to AI — don't duplicate the call
    if(mixedPartial){
      // Partial match: force confirmation so nothing is auto-saved
      const flagged=results.map(r=>r.command?r:{...r,needsConfirm:true,weightSpecified:false});
      handleParsed(flagged,rawText);
    } else {
      handleParsed(results,rawText);
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
            showMultiFoodFallback(heardName,before,after);
            return;
          }
          handleParsed(aiItems,rawText);
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
    handleParsed(flagged,rawText);
  } else {
    handleParsed(results,rawText);
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
      items.push({...foodScale(food,food.w),rawFood:food,confidence:'manual',needsConfirm:false,weightSpecified:false});
    } else if(seg.showCreate&&seg.customName.trim()){
      const name=seg.customName.trim();
      const kcal=parseFloat(seg.customKcal)||0;
      const protein=parseFloat(seg.customProtein)||0;
      const carbs=parseFloat(seg.customCarbs)||0;
      const fat=parseFloat(seg.customFat)||0;
      const cf=typeof addCustomFood==='function'
        ?addCustomFood({name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'})
        :{name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'};
      items.push({...foodScale(cf,100),rawFood:cf,confidence:'manual',needsConfirm:false,weightSpecified:false});
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
  document.getElementById('clock').textContent=String(h).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  const el=document.getElementById('home-greeting');
  if(el) el.textContent=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
}

// ═══════════════════════════════════════════
// DATE SELECTION
// ═══════════════════════════════════════════
function localDateStr(d=new Date()){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
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
  const id=m.id;
  const source=m.source==='photo_estimate'?' · photo estimate':'';
  return`<div class="meal-item" style="cursor:pointer;" onclick="startEditMeal(${id})"><div class="meal-item-left"><div class="meal-item-name">${m.name}</div><div class="meal-item-detail">${time} · ${n} ingredient${n!==1?'s':''}${source}</div></div><div class="meal-item-kcal">${Math.round(m.totals.kcal)} kcal</div><button class="meal-delete-btn" onclick="event.stopPropagation();deleteMealFromHome(${id})" aria-label="Delete meal" title="Delete">×</button></div>`;
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
  const statusEl=document.getElementById('photo-estimate-status');
  const formEl=document.getElementById('photo-estimate-form');
  const saveBtn=document.getElementById('photo-estimate-save-btn');
  if(statusEl){
    statusEl.style.display=status?'block':'none';
    statusEl.textContent=status;
  }
  if(formEl) formEl.style.display=showForm?'block':'none';
  if(saveBtn) saveBtn.style.display=showForm?'block':'none';
}
function closePhotoEstimateModal(){
  const modal=document.getElementById('photo-estimate-modal');
  if(!modal) return;
  modal.classList.remove('show');
  setTimeout(()=>{modal.style.display='none';},200);
  ['photo-estimate-input','photo-estimate-library-input'].forEach(id=>{
    const input=document.getElementById(id);
    if(input) input.value='';
  });
}
function openPhotoEstimateCameraPicker(){
  document.getElementById('photo-estimate-input')?.click();
}
function openPhotoEstimateLibraryPicker(){
  document.getElementById('photo-estimate-library-input')?.click();
}
function openPhotoEstimatePicker(){
  openPhotoEstimateCameraPicker();
}
function resizePhotoForEstimate(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read photo.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Could not load photo.'));
      img.onload=()=>{
        const maxW=1024;
        const scale=Math.min(1,maxW/img.width);
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',0.7));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
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
    calories:Math.round(Number(item.calories)||0),
    protein:roundMacro(item.protein),
    carbs:roundMacro(item.carbs),
    fat:roundMacro(item.fat),
    confidence:item.confidence||estimate?.confidence||'low',
    notes:item.notes||''
  }));
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
  const confidence=_photoEstimateDraft.confidence?`Confidence: ${photoEstimateEsc(_photoEstimateDraft.confidence)}`:'';
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
    const confidence=item.confidence?` · ${photoEstimateEsc(item.confidence)} confidence`:'';
    const rowNote=item.notes?`<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">${photoEstimateEsc(item.notes)}</div>`:'';
    html+=`<div style="background:var(--card);border:.5px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:8px;">`;
    html+=`<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">`;
    html+=`<input type="text" class="custom-input" id="photo-item-name-${id}" value="${photoEstimateEsc(item.name)}" oninput="photoEstimateSyncRows()" aria-label="Food name" style="flex:1;min-width:0;padding:7px 8px;font-size:13px;">`;
    html+=`<button type="button" onclick="deletePhotoEstimateItem('${id}')" title="Remove item" aria-label="Remove item" style="background:none;border:none;padding:4px 7px;cursor:pointer;color:var(--text-muted);font-size:16px;">✕</button>`;
    html+=`</div>`;
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:5px;">`;
    html+=`<input type="number" class="custom-input" id="photo-item-grams-${id}" value="${grams}" min="0" placeholder="g" oninput="photoEstimateSyncRows()" aria-label="Estimated grams" style="padding:6px 7px;font-size:12px;">`;
    html+=`<input type="number" class="custom-input" id="photo-item-kcal-${id}" value="${Math.round(Number(item.calories)||0)}" min="0" placeholder="kcal" oninput="photoEstimateSyncRows()" aria-label="Calories" style="padding:6px 7px;font-size:12px;">`;
    html+=`<input type="number" class="custom-input" id="photo-item-protein-${id}" value="${roundMacro(item.protein)}" min="0" step="0.1" placeholder="protein" oninput="photoEstimateSyncRows()" aria-label="Protein" style="padding:6px 7px;font-size:12px;">`;
    html+=`</div>`;
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">`;
    html+=`<input type="number" class="custom-input" id="photo-item-carbs-${id}" value="${roundMacro(item.carbs)}" min="0" step="0.1" placeholder="carbs" oninput="photoEstimateSyncRows()" aria-label="Carbs" style="padding:6px 7px;font-size:12px;">`;
    html+=`<input type="number" class="custom-input" id="photo-item-fat-${id}" value="${roundMacro(item.fat)}" min="0" step="0.1" placeholder="fat" oninput="photoEstimateSyncRows()" aria-label="Fat" style="padding:6px 7px;font-size:12px;">`;
    html+=`</div>`;
    html+=`<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:5px;">grams · kcal · protein${confidence}</div>`;
    html+=rowNote;
    html+=`</div>`;
  });
  itemsEl.innerHTML=html;
  updatePhotoEstimateTotals();
}
function setPhotoEstimatePortion(value){
  if(!_photoEstimateDraft) return;
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
  photoEstimateSyncRows();
  _photoEstimateDraft.items=(_photoEstimateDraft.items||[]).filter(item=>item.id!==id);
  renderPhotoEstimateItemRows();
}
function renderPhotoEstimateReview(estimate){
  _photoEstimatePortion=1;
  _photoEstimateDraft={
    mealName:estimate?.mealName||'Restaurant meal',
    confidence:estimate?.confidence||'low',
    items:normalisePhotoEstimateItems(estimate),
    totals:photoEstimateTotalsFallback(estimate),
    notes:estimate?.notes||''
  };
  document.getElementById('photo-meal-name').value=estimate?.mealName||'Restaurant meal';
  document.getElementById('photo-meal-section').value=photoEstimateSectionDefault();
  const portion=document.getElementById('photo-portion-select');
  if(portion) portion.value='1';
  renderPhotoEstimateItemRows();
  showPhotoEstimateModal({showForm:true});
}
async function handlePhotoEstimateFile(file){
  if(!file) return;
  showPhotoEstimateModal({status:'Estimating from photo...',showForm:false});
  try{
    const image=await resizePhotoForEstimate(file);
    const photoEstimateUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/photo-estimate'):'/api/photo-estimate';
    const res=await fetch(photoEstimateUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const detail=data.detail||data.error||'Photo estimate failed.';
      throw new Error(detail);
    }
    renderPhotoEstimateReview(data);
  }catch(e){
    console.warn('[Sous Photo Estimate]',e);
    const detail=String(e&&e.message||'').trim();
    const message=detail
      ? `Could not estimate this photo: ${detail}`
      : 'Could not estimate this photo. Please try another photo or log the meal manually.';
    showPhotoEstimateModal({status:message,showForm:false});
  }
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
      fibre:0,
      icon:'ti-camera',
      type:'solid',
      confidence:item.confidence||'low',
      notes:item.notes||'',
      source:'photo_estimate'
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
    source:'photo_estimate',
    confidence:_photoEstimateDraft.confidence||'low',
    notes:_photoEstimateDraft.notes||'',
    portionScale:_photoEstimatePortion,
    ingredients,
    savedIngredients:ingredients,
    totals
  };
  log[date].meals.push(mealObj);
  log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  saveLog(log);
  closePhotoEstimateModal();
  _photoEstimateDraft=null;
  _photoEstimatePortion=1;
  showToast('Photo estimate saved',2400);
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

function renderHomeMealSections(meals){
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const jsEsc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const ingLabel=i=>`${i.name}${i.weight||i.serving?' '+(typeof itemWeightLabel==='function'?itemWeightLabel(i):(i.weight+'g')):''}`;
  const buckets={breakfast:[],lunch:[],dinner:[],snacks:[],supplements:[]};
  meals.forEach(m=>{
    const sk=homeMealSectionKey(m);
    (buckets[sk]||buckets.snacks).push(m);
  });
  Object.keys(buckets).forEach(k=>buckets[k].sort((a,b)=>new Date(a.time)-new Date(b.time)));
  return HOME_MEAL_SECTIONS.map(({key,label})=>{
    const arr=buckets[key];
    const inner=arr.length?arr.map(homeMealRowHtml).join(''):'<div class="home-meal-empty">Nothing logged yet</div>';
    const hasLogged=hasMealForSectionOnSelectedDate(key,meals);

    let quickBlocks='';
    if(!hasLogged){
      // 1. Usual meals grid (up to 3)
      const usuals=(typeof getUsualMealsForSection==='function'?getUsualMealsForSection(key):(usualsBySection[key]||[])).slice(0,3);
      if(usuals.length){
        const cards=usuals.map((u,i)=>{
          const span=usuals.length===3&&i===2?' style="grid-column:1/-1;min-height:auto;"':'';
          const cls=i===0?'usual-card most-used':'usual-card';
          const mt=sumMacros(u.ingredients||[]);
          const kcal=Math.round(mt.kcal||0);
          const ingredients=u.ingredients||[];
          const ingCount=ingredients.length;
          const preview=ingredients.slice(0,2).map(ingLabel).join(', ')+(ingredients.length>2?' +' +(ingredients.length-2):'');
          const meta=preview||`${ingCount} ingredient${ingCount!==1?'s':''}`;
          return`<div role="button" tabindex="0" class="${cls}"${span} onclick="logUsualMealByIndex('${key}',${i})"><div class="usual-card-name">${esc(u.name)}</div><div class="usual-card-meta">${esc(meta)} · <span class="kcal">${kcal} kcal</span></div><button type="button" class="usual-card-menu-btn" onclick="event.stopPropagation();openUsualMealMenu('${jsEsc(key)}',${i})" aria-label="Manage usual meal">⋯</button></div>`;
        }).join('');
        quickBlocks+=`<div class="usuals-grid">${cards}</div>`;
      }

      // 2. Repeat last meal
      const last=getLastMealBySection(key);
      if(last){
        const nm=esc((last.name||'').trim()||'Unnamed meal');
        const sourceDate=formatQuickLogSourceDate(last._historyDate);
        const details=(last.ingredients||[]).slice(0,2).map(ingLabel).join(', ');
        quickBlocks+=`<div class="home-section-repeat-card" onclick="repeatLastMealForSection('${key}')"><div class="home-section-repeat-row"><div class="home-section-last-meal">↻ ${sourceDate?esc(sourceDate)+': ':'Last: '}<strong>${nm}</strong>${details?' · '+esc(details):''}</div><i class="ti ti-chevron-right repeat-chevron"></i></div></div>`;
      }

      // 3. Per-section recent ingredient chips
      const sectionRecent=getRecentIngredientsForSection(key);
      if(sectionRecent.length){
        const chips=sectionRecent.map(r=>`<button type="button" class="recent-chip" onclick="startLogWithRecentIngredientByName('${jsEsc(r.name)}','${key}')">${esc(r.name)}</button>`).join('');
        quickBlocks+=`<div class="recent-chips">${chips}</div>`;
      }
    }

    const loggedBlock=`<div class="home-meal-logged-block"><div class="home-meal-logged-hint">Logged</div>${inner}</div>`;
    return`<div class="home-meal-section"><div class="home-meal-section-header"><div class="home-meal-section-title">${label}</div><button type="button" class="home-meal-section-add" onclick="startLogWithSection('${key}')">+ Add</button></div>${quickBlocks}${loggedBlock}</div>`;
  }).join('');
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
  const h=new Date().getHours();
  document.getElementById('home-greeting').textContent=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  document.getElementById('home-name').innerHTML='Hello, <em>'+(profile.name||'chef')+'</em>';
  const hasProfile=!!(profile.targetKcal||profile.name);
  document.getElementById('no-profile-banner').style.display=hasProfile?'none':'block';
  const streak=calcStreak();
  const sEl=document.getElementById('home-streak');
  if(streak>0){sEl.style.display='block';document.getElementById('home-streak-text').textContent=`🔥 ${streak} day streak`;}
  else sEl.style.display='none';
  const kcal=Math.round(t.kcal||0);
  document.getElementById('home-kcal').textContent=kcal.toLocaleString();
  const tk=profile.targetKcal||null;
  document.getElementById('home-kcal-goal').textContent=tk?`of ${tk.toLocaleString()} kcal goal`:'Set up profile for targets';
  const CIRC=213.628,pct=tk?Math.min(1,kcal/tk):0;
  document.getElementById('kcal-ring-fill').style.strokeDashoffset=CIRC*(1-pct);
  document.getElementById('kcal-ring-pct').textContent=Math.round(pct*100)+'%';
  [['protein',t.protein||0,profile.targetProtein],['carbs',t.carbs||0,profile.targetCarbs],['fat',t.fat||0,profile.targetFat]].forEach(([id,val,tgt])=>{
    const v=Math.round(val),p=tgt?Math.min(100,Math.round(v/tgt*100)):0;
    document.getElementById('bar-'+id).style.width=p+'%';
    document.getElementById('val-'+id).textContent=tgt?`${v} / ${tgt}g`:`${v}g`;
  });
  const meals=dayData.meals||[];
  const listEl=document.getElementById('home-meals-list');
  listEl.innerHTML=renderHomeMealSections(meals);
  renderHomeRecentIngredients();
}

function homeLogWeight(){
  const inp=document.getElementById('home-bw-input');
  const val=parseFloat(inp.value);
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

function deleteMealFromHome(id){
  const log=getLog();
  const day=log[selectedLogDate];
  if(!day) return;
  day.meals=day.meals.filter(m=>m.id!==id);
  day.totals=sumMacros(day.meals.map(m=>m.totals));
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
const SOUS_CACHE_VERSION='sous-v4';

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
  const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="%23533ab7"/><text x="256" y="360" font-size="300" text-anchor="middle" fill="%23fff" font-family="sans-serif">🍴</text></svg>`;
  const manifest={
    name:'Sous — Voice Calorie Counter',
    short_name:'Sous',
    description:'Track meals with your voice',
    start_url:location.href,
    display:'standalone',
    background_color:'#f4f2ee',
    theme_color:'#533ab7',
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
      navigator.serviceWorker.register(swUrl,{scope:'./'})
        .then(registration=>registration.update().catch(()=>{}))
        .catch(()=>{});
    }catch(e){}
  }
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
}

function init(){
  setCurrentCountry(typeof getUserCountry==='function'?getUserCountry():'GLOBAL');
  updateClock(); setInterval(updateClock,10000);
  initDateNav();
  initPhotoEstimate();
  renderHome();
  wireLogButtons();
  initProfile();
  renderRecipeList();
  initPWA();
  if(window.speechSynthesis){window.speechSynthesis.onvoiceschanged=()=>window.speechSynthesis.getVoices();window.speechSynthesis.getVoices();}
}
if(!window.SOUS_SKIP_INIT) init();
