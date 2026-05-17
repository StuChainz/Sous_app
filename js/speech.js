// ═══════════════════════════════════════════
// LOG STATE
// ═══════════════════════════════════════════
let meal=[], itemQueue=[], pendingFood=null, currentAmbig=null;
let tapRec=null, alwaysOnRec=null, isRecording=false, alwaysOnActive=false, isSpeaking=false;
let _voiceMode=false;
let nextIngId=1;
let modalSelectedFood=null, modalActiveTab='search';
let undoSnapshot=null;
let _editBaseValues=null,_editFoodKey=null,_pendingOverride=null;
let currentMealSection=null;
let _inlineEditId=null,_inlineManualMacros=false,_confirmManualMacros=false;
let _pendingFoodChoice=null;
let sousRealtime=null;

function snapshotMeal(){undoSnapshot=meal.map(i=>({...i}));updateUndoBtn();}
function updateUndoBtn(){const r=document.getElementById('undo-row');if(r)r.style.display=undoSnapshot?'flex':'none';}
function _persistDraft(){
  if(typeof saveDraft!=='function') return;
  const quick=typeof currentQuickMode!=='undefined'&&currentQuickMode;
  const editing=typeof currentEditMealId!=='undefined'&&currentEditMealId;
  if(quick||editing) return;
  const ingredients=meal.map(i=>({...i}));
  const draft=typeof createMealDraft==='function'
    ? createMealDraft({section:currentMealSection||null,source:'cooking-session',ingredients})
    : {section:currentMealSection||null,ingredients:[]};
  draft.meal=ingredients;
  draft.savedAt=Date.now();
  saveDraft(draft);
}
function undoLastAction(){
  if(!undoSnapshot) return;
  meal.length=0; undoSnapshot.forEach(i=>meal.push(i));
  undoSnapshot=null; updateUndoBtn(); renderCurrentMeal(); showToast('Undone');
  _persistDraft();
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION CONSTRUCTOR
// ═══════════════════════════════════════════
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

// ═══════════════════════════════════════════
// QUEUE HELPERS
// ═══════════════════════════════════════════
function itemBriefName(item){
  if(!item) return 'item';
  const wt=item.customMacro?'':(' '+itemWeightLabel(item));
  return (item.name||'item')+wt;
}
function batchPhrase(items){
  const names=items.map(itemBriefName);
  if(names.length===0) return '';
  if(names.length===1) return names[0];
  if(names.length===2) return names[0]+' and '+names[1];
  return names.slice(0,-1).join(', ')+', and '+names[names.length-1];
}
function shouldAutoAdd(item){
  return item && !item.ambiguous && (item.confidence==='high' || item.needsConfirm===false || item.customMacro);
}
function isClearIngredient(item){
  return item && !item.command && !item.ambiguous && (item.customMacro || (item.rawFood && item.weightSpecified));
}
function showBatchHeard(results){
  const transcript=document.getElementById('transcript-text');
  const items=results.filter(r=>!r.command);
  if(transcript && items.length>1){
    transcript.textContent='Heard '+items.length+' items: '+items.map(i=>i.name||i.label||'unknown').join(', ');
  }
}
function applyFoodOverride(item){
  if(!item||item.customMacro||item.customUnitNutrition||!item.weight) return item;
  const key=(item.rawFood?item.rawFood.name:item.name);
  const override=typeof getFoodOverride==='function'?getFoodOverride(key):null;
  if(!override) return item;
  const r=item.weight/100;
  item.kcal=Math.round(override.kcal*r);
  item.protein=Math.round(override.protein*r*10)/10;
  item.carbs=Math.round(override.carbs*r*10)/10;
  item.fat=Math.round(override.fat*r*10)/10;
  item.fibre=Math.round((override.fibre||0)*r*10)/10;
  return item;
}
function _pluralUnit(label,qty){
  const l=String(label||'unit');
  if(Number(qty)===1) return l;
  if(l.endsWith('y')) return l.slice(0,-1)+'ies';
  if(/(?:s|x|ch|sh)$/i.test(l)) return l+'es';
  return l.endsWith('s')?l:l+'s';
}
function _formatQty(qty){
  const n=Number(qty)||0;
  return String(Math.round(n*10)/10).replace(/\.0$/,'');
}
function itemWeightLabel(item){
  if(!item) return '—';
  if(item.customMacro) return 'manual macro entry';
  if(item.serving&&item.serving.label&&item.serving.quantity){
    const q=Math.round(Number(item.serving.quantity)*10)/10;
    return _formatQty(q)+' '+_pluralUnit(item.serving.label,q);
  }
  const inferred=inferServingFromWeight(item);
  if(inferred){
    return _formatQty(inferred.quantity)+' '+_pluralUnit(inferred.label,inferred.quantity);
  }
  const unit=item.type==='liquid'?'ml':'g';
  return (item.weight||0)+unit;
}
function getServingUnitForFood(foodOrName){
  const name=typeof foodOrName==='string'?foodOrName:foodOrName?.name;
  const custom=typeof getCustomServingUnit==='function'?getCustomServingUnit(name):null;
  if(custom) return custom;
  const food=typeof foodOrName==='object'?foodOrName:null;
  if(food&&food.defaultUnit&&Array.isArray(food.units)){
    return food.units.find(u=>u.label===food.defaultUnit)||food.units[0]||null;
  }
  return null;
}
function defaultServingQty(food,unit){
  const explicit=unit?.defaultQty??food?.defaultQty;
  if(explicit&&Number(explicit)>0) return Number(explicit);
  return 1;
}
function inferServingFromWeight(item){
  if(!item||!item.weight) return null;
  const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
  const unit=getServingUnitForFood(food||item.name);
  if(!unit||!unit.label||!unit.grams) return null;
  const qty=Number(item.weight)/Number(unit.grams);
  if(!Number.isFinite(qty)||qty<=0) return null;
  const rounded=Math.round(qty*10)/10;
  if(Math.abs(qty-rounded)>0.01) return null;
  return {label:unit.label,quantity:rounded,grams:unit.grams};
}
function syncServingFromWeight(item){
  if(!item) return item;
  const inferred=inferServingFromWeight(item);
  if(inferred) item.serving=inferred;
  else if(item.serving&&item.serving.grams) delete item.serving;
  return item;
}
function buildItemFromFoodServing(food,qty,unit){
  const q=Math.max(0,Number(qty)||0);
  if(!food||!unit||q<=0) return null;
  const npu=unit.nutritionPerUnit||null;
  const grams=unit.grams?Math.round(unit.grams*q):null;
  let item;
  if(npu){
    item={
      name:food.name,
      weight:grams,
      kcal:Math.round((Number(npu.calories)||0)*q),
      protein:Math.round((Number(npu.protein)||0)*q*10)/10,
      carbs:Math.round((Number(npu.carbs)||0)*q*10)/10,
      fat:Math.round((Number(npu.fat)||0)*q*10)/10,
      fibre:Math.round((Number(npu.fibre)||0)*q*10)/10
    };
  } else if(grams){
    const r=grams/(food.w||100);
    item={name:food.name,weight:grams,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10};
  } else return null;
  item.icon=food.icon;
  item.type=food.type||'solid';
  item.rawFood=food;
  item.serving={label:unit.label,quantity:q,grams:unit.grams||undefined};
  if(npu) item.customUnitNutrition=true;
  return item;
}
function _unitFields(prefix){
  return {
    label:document.getElementById(prefix+'-unit-label'),
    grams:document.getElementById(prefix+'-unit-grams'),
    kcal:document.getElementById(prefix+'-unit-kcal'),
    protein:document.getElementById(prefix+'-unit-protein'),
    carbs:document.getElementById(prefix+'-unit-carbs'),
    fat:document.getElementById(prefix+'-unit-fat')
  };
}
function readCustomUnitFromFields(prefix){
  const f=_unitFields(prefix);
  if(!f.label) return {unit:null,attempted:false};
  const raw=[f.label,f.grams,f.kcal,f.protein,f.carbs,f.fat].map(el=>el?.value?.trim()||'');
  const attempted=raw.some(Boolean);
  if(!attempted) return {unit:null,attempted:false};
  const label=raw[0];
  if(!label) return {error:'Unit name required',attempted:true};
  const grams=raw[1]?parseFloat(raw[1]):null;
  if(raw[1]&&(!grams||grams<=0)) return {error:'Enter a valid unit weight',attempted:true};
  const macroInputs=raw.slice(2);
  const hasMacros=macroInputs.some(Boolean);
  const unit={label};
  if(grams) unit.grams=grams;
  if(hasMacros){
    if(macroInputs.some(v=>v==='')) return {error:'Enter all per-unit macro fields, or leave them all blank',attempted:true};
    const vals=macroInputs.map(parseFloat);
    if(vals.some(v=>Number.isNaN(v)||v<0)) return {error:'Enter valid per-unit macros',attempted:true};
    unit.nutritionPerUnit={calories:vals[0],protein:vals[1],carbs:vals[2],fat:vals[3]};
  }
  if(!unit.grams&&!unit.nutritionPerUnit) return {error:'Add grams or per-unit nutrition',attempted:true};
  return {unit,attempted:true};
}
function populateCustomUnitFields(prefix,unit){
  const f=_unitFields(prefix);
  if(!f.label) return;
  f.label.value=unit?.label||'';
  f.grams.value=unit?.grams||'';
  f.kcal.value=unit?.nutritionPerUnit?.calories??'';
  f.protein.value=unit?.nutritionPerUnit?.protein??'';
  f.carbs.value=unit?.nutritionPerUnit?.carbs??'';
  f.fat.value=unit?.nutritionPerUnit?.fat??'';
}
function autoAddItem(item){
  syncServingFromWeight(item);
  applyFoodOverride(item);
  snapshotMeal(); meal.push(item); _persistDraft();
}
function autoAddClearItems(items){
  if(!items.length) return;
  snapshotMeal();
  items.forEach(item=>{
    syncServingFromWeight(item);
    applyFoodOverride(item);
    meal.push(item);
  });
  _persistDraft();
  renderCurrentMeal();
  updateHome();
  showToast('Added '+batchPhrase(items)+' ✓',2400);
}
function announceAutoAdded(items,after){
  if(!items.length){ if(after) after(); return; }
  const phrase=batchPhrase(items);
  const msg=items.length===1 ? `Added ${phrase}.` : `Added ${items.length} items: ${phrase}.`;
  const transcript=document.getElementById('transcript-text');
  if(transcript) transcript.textContent=msg;
  showToast(msg,2600);
  speak(msg,after);
}
function hideVoiceCorrectBar(){
  const b=document.getElementById('voice-correct-bar');if(b)b.style.display='none';
  const cb=document.getElementById('voice-create-food-btn');if(cb)cb.style.display='none';
}
function showNoMatchFallback(rawText){
  const msg=document.getElementById('voice-correct-msg');
  const createBtn=document.getElementById('voice-create-food-btn');
  if(msg) msg.textContent='No match — create custom food?';
  if(createBtn){
    createBtn.textContent='Create "'+rawText+'"';
    createBtn.style.display='';
    createBtn.onclick=()=>{hideVoiceCorrectBar();openCreateCustomFood(rawText);};
  }
  const bar=document.getElementById('voice-correct-bar');
  if(bar) bar.style.display='flex';
}
function _normaliseChoiceText(text){
  let s=String(text||'').toLowerCase().trim();
  if(typeof normaliseLogText==='function') s=normaliseLogText(s);
  if(typeof stripSegmentPrefix==='function') s=stripSegmentPrefix(s);
  if(typeof cleanSegment==='function') s=cleanSegment(s);
  s=s
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams?|kg|ml|l|tbsp|tsp|oz|cups?|pieces?|slices?|servings?|portions?|cans?|tins?)\b/gi,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/\b(?:of|some|a|an|the)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  return s;
}
function _foodChoiceKeys(food){
  if(!food) return [];
  const keys=[food.name,...(food.kw||[]),...(food.aliases||[])]
    .map(_normaliseChoiceText)
    .filter(k=>k.length>1);
  return [...new Set(keys)];
}
const FOOD_CHOICE_FILLER_WORDS=new Set(['fresh','cooked','raw','large','small','medium','pink','red','white','black','green']);
function _foodChoiceDisplayName(text){
  let s=String(text||'').trim();
  if(typeof stripSegmentPrefix==='function') s=stripSegmentPrefix(s);
  s=s
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams?|kg|ml|l|tbsp|tsp|oz|cups?|pieces?|slices?|servings?|portions?|cans?|tins?)\b/gi,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/\b(?:of|some|a|an|the)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
  return s;
}
function _singularChoiceToken(token){
  const t=String(token||'').toLowerCase();
  if(t.endsWith('ies')&&t.length>4) return t.slice(0,-3)+'y';
  if(t.endsWith('es')&&t.length>4) return t.slice(0,-2);
  if(t.endsWith('s')&&t.length>3) return t.slice(0,-1);
  return t;
}
function _choiceTokens(text,{dropFillers=false}={}){
  const tokens=_normaliseChoiceText(text).split(/\s+/).filter(t=>t.length>2);
  const filtered=dropFillers?tokens.filter(t=>!FOOD_CHOICE_FILLER_WORDS.has(t)):tokens;
  return filtered.map(_singularChoiceToken);
}
function _choiceTokenMatches(a,b){
  return _singularChoiceToken(a)===_singularChoiceToken(b);
}
function _choiceEsc(text){
  return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _relatedFoodMatches(rawName,preferredFood=null,limit=8){
  const phrase=_normaliseChoiceText(rawName);
  if(!phrase) return preferredFood?[preferredFood]:[];
  const allFoods=[
    ...(typeof getCustomFoods==='function'?getCustomFoods():[]),
    ...(typeof getFoodDatabase==='function'?getFoodDatabase():(typeof FOODS!=='undefined'?FOODS:[]))
  ];
  const seen=new Set();
  const foods=allFoods.filter(food=>{
    const key=String(food?.id||food?.name||'').toLowerCase();
    if(!food||!food.name||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const phraseTokens=_choiceTokens(phrase);
  const meaningTokens=_choiceTokens(phrase,{dropFillers:true});
  const tokens=meaningTokens.length?meaningTokens:phraseTokens;
  const scores=[];
  foods.forEach(food=>{
    const keys=_foodChoiceKeys(food);
    const keyTokens=keys.flatMap(k=>_choiceTokens(k));
    let score=preferredFood&&food.name===preferredFood.name?70:0;
    keys.forEach(k=>{
      if(k===phrase) score+=120;
      else if(k.includes(phrase)||phrase.includes(k)) score+=80;
    });
    tokens.forEach(token=>{
      if(keyTokens.some(kt=>_choiceTokenMatches(kt,token))) score+=28;
      else if(keys.some(k=>k.includes(token))) score+=14;
    });
    if(score>0) scores.push({food,score});
  });
  return scores
    .sort((a,b)=>b.score-a.score||String(a.food.name).localeCompare(String(b.food.name)))
    .slice(0,limit)
    .map(s=>s.food);
}
function _foodChoiceReviewFor(item,rawSegment){
  if(!item||item.command||item.ambiguous||item.customMacro||item.foodChoiceConfirmed||!item.rawFood) return null;
  const heard=_normaliseChoiceText(rawSegment||item.heardName||item.name);
  if(!heard) return null;
  if(typeof shouldConfirmFoodMatch==='function'){
    if(!shouldConfirmFoodMatch(heard,item)) return null;
  } else if(typeof getFoodTextMatch==='function'){
    const match=getFoodTextMatch(heard,{includeCustom:true});
    if(match&&match.food){
      const sameFood=match.food===item.rawFood||String(match.food.id||match.food.name)===String(item.rawFood.id||item.rawFood.name);
      if(sameFood&&!match.shouldConfirm) return null;
      if(sameFood&&match.shouldConfirm) return {heard,matchedKey:match.key,item,match};
    }
  }
  const keys=_foodChoiceKeys(item.rawFood);
  if(keys.includes(heard)) return null;
  const useful=keys
    .filter(k=>k.length>3)
    .sort((a,b)=>b.length-a.length)
    .find(k=>heard.includes(k)||k.includes(heard));
  if(!useful) return null;
  return {heard,matchedKey:useful,item};
}
function _extractHeardFoodSegments(rawText,count){
  const raw=String(rawText||'').trim();
  if(!raw) return [];
  if(typeof splitIngredients==='function'){
    const parts=splitIngredients(raw);
    if(parts.length) return parts;
  }
  return count===1?[raw]:[];
}
function maybeShowFoodChoiceReview(results,rawText){
  if(!rawText||!Array.isArray(results)||!results.length) return false;
  const foodResults=results.filter(r=>!r.command);
  if(!foodResults.length) return false;
  const segments=_extractHeardFoodSegments(rawText,foodResults.length);
  let foodIdx=0;
  for(let i=0;i<results.length;i++){
    const item=results[i];
    if(item.command) continue;
    const rawSegment=segments[foodIdx]||rawText;
    foodIdx++;
    const review=_foodChoiceReviewFor(item,rawSegment);
    if(review){
      const rawName=_foodChoiceDisplayName(rawSegment)||review.heard;
      showFoodChoiceReview({
        rawName,
        originalText:rawSegment,
        existingItem:item,
        existingFood:item.rawFood,
        relatedMatches:_relatedFoodMatches(rawName,item.rawFood),
        before:results.slice(0,i),
        after:results.slice(i+1)
      });
      return true;
    }
  }
  return false;
}
function _ensureFoodChoiceScreen(){
  let screen=document.getElementById('ls-food-choice');
  if(screen) return screen;
  screen=document.createElement('div');
  screen.className='log-screen';
  screen.id='ls-food-choice';
  screen.style.cssText='background:var(--bg);padding:16px 20px calc(var(--tab-h) + 24px);';
  screen.innerHTML=`
    <div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:4px;">Check the food</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;" id="fc-sub"></div>
    <div id="fc-existing-wrap" style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;">Existing matches</div>
      <div id="fc-existing-list" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>
    <div style="background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Create new food</div>
      <div class="custom-field-group" style="margin-bottom:10px;">
        <div class="custom-field-label">Food name</div>
        <input type="text" class="custom-input" id="fc-name">
      </div>
      <div class="custom-label-row">
        <div class="custom-field-group"><div class="custom-field-label">Calories per 100g</div><input type="number" class="custom-input" id="fc-kcal" min="0"></div>
        <div class="custom-field-group"><div class="custom-field-label">Protein per 100g</div><input type="number" class="custom-input" id="fc-protein" min="0" step="0.1"></div>
      </div>
      <div class="custom-label-row">
        <div class="custom-field-group"><div class="custom-field-label">Carbs per 100g</div><input type="number" class="custom-input" id="fc-carbs" min="0" step="0.1"></div>
        <div class="custom-field-group"><div class="custom-field-label">Fat per 100g</div><input type="number" class="custom-input" id="fc-fat" min="0" step="0.1"></div>
      </div>
      <button type="button" class="btn-primary" id="fc-create" style="margin-top:12px;">Create new food</button>
    </div>
    <div style="display:flex;justify-content:center;padding:2px 0 8px;">
      <button type="button" id="fc-cancel" style="background:none;border:none;color:var(--text-muted);font-size:13px;font-family:inherit;padding:8px 12px;cursor:pointer;">Cancel</button>
    </div>`;
  const confirm=document.getElementById('ls-confirm');
  if(confirm&&confirm.parentNode) confirm.parentNode.insertBefore(screen,confirm.nextSibling);
  return screen;
}
function _macroPer100FromItem(item,field,foodField){
  if(!item) return 0;
  if(item.weightSpecified&&item.weight){
    return Math.round((Number(item[field])||0)*100/item.weight*10)/10;
  }
  const food=item.rawFood;
  return food?Number(food[foodField])||0:Number(item[field])||0;
}
function showFoodChoiceReview(state){
  _pendingFoodChoice=state;
  _ensureFoodChoiceScreen();
  const rawName=state.rawName||state.originalText||'this food';
  const amount=state.existingItem?.weightSpecified?state.existingItem.weight:100;
  document.getElementById('fc-sub').textContent='I heard "'+rawName+'". Choose an existing match or create it as a new food.';
  const existingWrap=document.getElementById('fc-existing-wrap');
  const existingList=document.getElementById('fc-existing-list');
  const matches=state.relatedMatches||_relatedFoodMatches(rawName,state.existingFood);
  existingList.innerHTML='';
  if(matches.length){
    existingWrap.style.display='block';
    matches.forEach(food=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.cssText='width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:9px 11px;font-family:inherit;cursor:pointer;color:var(--text);';
      const kcal=Math.round(Number(food.kcal)||0);
      const p=Math.round((Number(food.p)||0)*10)/10;
      btn.innerHTML=`<span style="font-size:14px;font-weight:500;">${_choiceEsc(food.name)}</span><span style="font-size:12px;color:var(--text-muted);font-family:'Geist Mono',monospace;white-space:nowrap;">${kcal} kcal · ${p}g P</span>`;
      btn.addEventListener('click',()=>resolveFoodChoiceFood(food));
      existingList.appendChild(btn);
    });
  } else existingWrap.style.display='none';
  document.getElementById('fc-name').value=rawName;
  document.getElementById('fc-kcal').value=_macroPer100FromItem(state.existingItem,'kcal','kcal');
  document.getElementById('fc-protein').value=_macroPer100FromItem(state.existingItem,'protein','p');
  document.getElementById('fc-carbs').value=_macroPer100FromItem(state.existingItem,'carbs','c');
  document.getElementById('fc-fat').value=_macroPer100FromItem(state.existingItem,'fat','f');
  document.getElementById('fc-create').onclick=()=>resolveFoodChoiceCreate(amount);
  document.getElementById('fc-cancel').onclick=()=>{_pendingFoodChoice=null;showLogScreen('listening');setTimeout(restartAlwaysOn,400);};
  showLogScreen('food-choice');
  pauseAlwaysOn();
  requestAnimationFrame(()=>document.getElementById('fc-name')?.focus());
}
function _continueFoodChoiceWith(item){
  const state=_pendingFoodChoice;
  _pendingFoodChoice=null;
  const next=[...(state?.before||[]),item,...(state?.after||[])];
  handleParsed(next,'');
}
function resolveFoodChoiceExisting(){
  if(!_pendingFoodChoice||!_pendingFoodChoice.existingItem) return;
  const item={..._pendingFoodChoice.existingItem,heardName:_pendingFoodChoice.rawName,foodChoiceConfirmed:true};
  _continueFoodChoiceWith(item);
}
function resolveFoodChoiceFood(food){
  if(!_pendingFoodChoice||!food) return;
  if(_pendingFoodChoice.existingFood&&food.name===_pendingFoodChoice.existingFood.name){
    resolveFoodChoiceExisting();
    return;
  }
  const base=_pendingFoodChoice.existingItem||{};
  let grams=base.weightSpecified?Math.max(1,Math.round(base.weight||food.w||100)):null;
  if(grams==null&&base.weight&&base.rawFood){
    grams=Math.max(1,Math.round(base.weight));
  }
  const item={...base,name:food.name,rawFood:food,icon:food.icon,type:food.type||'solid',confidence:'high',needsConfirm:false,foodChoiceConfirmed:true,heardName:_pendingFoodChoice.rawName};
  if(grams!=null){
    const r=grams/(food.w||100);
    Object.assign(item,{weight:grams,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,weightSpecified:true});
  } else {
    Object.assign(item,{weight:food.w,kcal:food.kcal,protein:food.p,carbs:food.c,fat:food.f,fibre:food.fi||0,weightSpecified:false});
  }
  _continueFoodChoiceWith(item);
}
function resolveFoodChoiceCreate(amount){
  if(!_pendingFoodChoice) return;
  const name=(document.getElementById('fc-name')?.value||'').trim();
  if(!name){showToast('Enter a food name');return;}
  const kcal=parseFloat(document.getElementById('fc-kcal')?.value)||0;
  const protein=parseFloat(document.getElementById('fc-protein')?.value)||0;
  const carbs=parseFloat(document.getElementById('fc-carbs')?.value)||0;
  const fat=parseFloat(document.getElementById('fc-fat')?.value)||0;
  const customFood=typeof addCustomFood==='function'?addCustomFood({name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'}):{name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'};
  const grams=_pendingFoodChoice.existingItem?.weightSpecified?Math.max(1,Math.round(amount||100)):100;
  const r=grams/100;
  const item={id:nextIngId++,name,weight:grams,kcal:Math.round(kcal*r),protein:Math.round(protein*r*10)/10,carbs:Math.round(carbs*r*10)/10,fat:Math.round(fat*r*10)/10,fibre:0,icon:'ti-clipboard',type:'solid',rawFood:customFood,weightSpecified:true,confidence:'high',needsConfirm:false,foodChoiceConfirmed:true,heardName:_pendingFoodChoice.rawName};
  _continueFoodChoiceWith(item);
}
function showVoiceCorrectBar(msg){
  const b=document.getElementById('voice-correct-bar'),m=document.getElementById('voice-correct-msg');
  if(!b) return;
  if(m) m.textContent=msg;
  b.style.display='flex';
}
function showVoiceCorrection(text){
  const inp=document.getElementById('text-input');
  if(inp) inp.value=text;
  showVoiceCorrectBar('Did you say this? Edit and send, or tap mic.');
  if(inp) requestAnimationFrame(()=>{inp.focus();inp.select();});
}
function showVoiceRetry(msg){
  const inp=document.getElementById('text-input');
  if(inp) inp.value='';
  showVoiceCorrectBar(msg||"Didn't catch that — try again");
}

function handleParsed(results,rawText=''){
  if(!results||!results.length){
    const rt=(rawText||'').trim();
    if(rt.length>1){
      const qty=typeof extractQuantity==='function'?extractQuantity(rt):null;
      const rawName=_foodChoiceDisplayName(rt)||_normaliseChoiceText(rt)||rt;
      if(typeof showMultiFoodFallback==='function'){
        showMultiFoodFallback(rawName,[],[]);
      } else {
        showFoodChoiceReview({
          rawName,
          originalText:rt,
          existingItem:{weightSpecified:qty&&qty.grams!=null,weight:qty&&qty.grams!=null?Math.round(qty.grams):100},
          existingFood:null,
          relatedMatches:_relatedFoodMatches(rawName),
          before:[],
          after:[]
        });
      }
    } else {
      if(_voiceMode) showVoiceRetry("Didn't catch that — try again");
      else showToast("Didn't catch that — try again!");
    }
    _voiceMode=false; return;
  }
  _voiceMode=false;
  if(results.length===1 && results[0].command && !['summary'].includes(results[0].command)){
    const handled=applyCorrectionCommand(results[0]);
    refreshSummaryIfVisible();
    const _activeScr=document.querySelector('.log-screen.active')?.id;
    if(handled && _activeScr==='ls-listening') renderCurrentMeal();
    updateHome();
    if(handled && _activeScr==='ls-listening') setTimeout(restartAlwaysOn,400);
    return;
  }
  if(results[0].command==='summary'){
    if(!meal.length){showToast('Add some ingredients first!');return;}
    stopAllRec(); showSummary(); return;
  }
  if(maybeShowFoodChoiceReview(results,rawText)) return;
  showBatchHeard(results);
  const foodResults=results.filter(r=>!r.command);
  const reviewItems=foodResults.filter(r=>!isClearIngredient(r));
  if(reviewItems.length){
    const clearItems=foodResults.filter(isClearIngredient);
    autoAddClearItems(clearItems);
    showMultiConfirm(reviewItems);
    return;
  }
  if(batchNeedsMultiConfirm(results)){showMultiConfirm(results);return;}
  itemQueue.push(...results);
  processQueue([]);
}
function processQueue(autoAdded=[]){
  updateQueueDisplay();
  if(!itemQueue.length){
    showLogScreen('listening');
    if(autoAdded.length){
      announceAutoAdded(autoAdded,()=>setTimeout(restartAlwaysOn,250));
    } else {
      const transcript=document.getElementById('transcript-text');
      if(transcript) transcript.textContent='—';
      setTimeout(restartAlwaysOn,400);
    }
    updateHome();
    return;
  }
  const next=itemQueue.shift();
  if(next && next.command){ applyCorrectionCommand(next); refreshSummaryIfVisible(); processQueue(autoAdded); return; }
  updateQueueDisplay();
  if(shouldAutoAdd(next)){
    if(!next.weightSpecified && next.rawFood){
      if(autoAdded.length) showToast('Added '+batchPhrase(autoAdded)+'. One more thing.',2200);
      askQuantity(next);
      return;
    }
    autoAddItem(next);
    autoAdded.push(next);
    processQueue(autoAdded);
    return;
  }
  showConfirm(next);
}
function updateQueueDisplay(){
  const bar=document.getElementById('queue-bar'),chips=document.getElementById('queue-items'),rem=document.getElementById('queue-remaining');
  if(itemQueue.length){
    bar.classList.add('show');
    chips.innerHTML=itemQueue.map(q=>`<span class="queue-chip">${q.name||q.label||'?'}</span>`).join('');
    if(rem){rem.className='queue-remaining show';rem.textContent=itemQueue.length+' more ingredient'+(itemQueue.length>1?'s':'')+' queued';}
  } else {
    bar.classList.remove('show');
    if(rem) rem.className='queue-remaining';
  }
}

// ═══════════════════════════════════════════
// LOG SCREEN NAVIGATION
// ═══════════════════════════════════════════
function renderCurrentMeal(){
  const container=document.getElementById('current-meal-list');
  if(!container) return;
  if(!meal.length){container.style.display='none';return;}
  meal.forEach(i=>{if(!i.id)i.id=nextIngId++;});
  const t=sumMacros(meal);
  container.style.display='block';
  container.style.overflow='visible';
  container.innerHTML='';
  if(typeof currentQuickMode!=='undefined'&&currentQuickMode){
    const qsRow=document.createElement('div');
    qsRow.style.cssText='padding:8px 12px;border-bottom:.5px solid var(--border);display:flex;justify-content:flex-end;';
    const qsBtn=document.createElement('button');
    qsBtn.style.cssText='background:var(--accent);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;';
    qsBtn.textContent='Quick Save';
    qsBtn.addEventListener('click',()=>{
      if(!meal.length){showToast('Add some ingredients first!');return;}
      saveMealToLog();
      showToast('Meal saved! 🎉',2500);
      currentQuickMode=false;
      setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);
    });
    qsRow.appendChild(qsBtn);
    container.appendChild(qsRow);
  }
  const header=document.createElement('div');
  header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);border-radius:var(--radius-sm) var(--radius-sm) 0 0;';
  header.innerHTML=`<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Added so far</span><span style="font-size:12px;color:var(--accent);font-family:'Geist Mono',monospace;">${Math.round(t.kcal)} kcal · ${Math.round(t.protein)}g P</span>`;
  container.appendChild(header);
  meal.forEach(i=>{
    const row=document.createElement('div');
    if(_inlineEditId===i.id){
      row.style.cssText='display:flex;flex-direction:column;padding:6px 12px;border-bottom:.5px solid var(--border);background:var(--bg-2);gap:6px;';
      // Row 1: name + weight stepper
      const topRow=document.createElement('div');
      topRow.style.cssText='display:flex;align-items:center;gap:6px;';
      const nameIn=document.createElement('input');
      nameIn.type='text'; nameIn.value=i.name; nameIn.id='ile-name';
      nameIn.style.cssText='flex:1;min-width:0;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--accent);border-radius:6px;padding:4px 7px;outline:none;font-family:inherit;';
      const wtIn=document.createElement('input');
      wtIn.type='number'; wtIn.value=i.weight??''; wtIn.placeholder='g'; wtIn.id='ile-weight';
      wtIn.style.cssText='width:52px;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:4px 6px;outline:none;font-family:inherit;text-align:center;';
      const btnStyle='background:var(--card);border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;';
      const minusBtn=document.createElement('button');
      minusBtn.textContent='−'; minusBtn.type='button'; minusBtn.style.cssText=btnStyle;
      minusBtn.addEventListener('click',()=>stepIngWeight(i.id,-10));
      const plusBtn=document.createElement('button');
      plusBtn.textContent='+'; plusBtn.type='button'; plusBtn.style.cssText=btnStyle;
      plusBtn.addEventListener('click',()=>stepIngWeight(i.id,+10));
      const confirmBtn=document.createElement('button');
      confirmBtn.textContent='✓';
      confirmBtn.style.cssText='background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;';
      confirmBtn.addEventListener('click',()=>commitInlineEdit(i.id));
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.title='Remove';
      delBtn.style.cssText='background:none;border:none;padding:2px 6px;cursor:pointer;color:var(--text-muted);font-size:15px;flex-shrink:0;';
      delBtn.addEventListener('click',()=>{_inlineEditId=null;deleteFromCurrentMeal(i.id);});
      const handleKey=e=>{
        if(e.key==='Enter'){e.preventDefault();commitInlineEdit(i.id);}
        if(e.key==='Escape'){_inlineEditId=null;renderCurrentMeal();}
      };
      nameIn.addEventListener('keydown',handleKey);
      wtIn.addEventListener('keydown',handleKey);
      topRow.appendChild(nameIn); topRow.appendChild(minusBtn); topRow.appendChild(wtIn); topRow.appendChild(plusBtn); topRow.appendChild(confirmBtn); topRow.appendChild(delBtn);
      // Row 2: macro inputs
      const macroRow=document.createElement('div');
      macroRow.style.cssText='display:flex;gap:4px;';
      const ileMacroDefs=[{id:'ile-kcal',label:'kcal',val:i.kcal??0,accent:true},{id:'ile-protein',label:'P',val:i.protein??0},{id:'ile-carbs',label:'C',val:i.carbs??0},{id:'ile-fat',label:'F',val:i.fat??0}];
      ileMacroDefs.forEach(({id,label,val,accent})=>{
        const wrap=document.createElement('div');
        wrap.style.cssText='flex:1;text-align:center;background:var(--card);border:.5px solid var(--border);border-radius:8px;padding:4px;';
        const inp=document.createElement('input');
        inp.type='number'; inp.id=id; inp.value=val;
        inp.style.cssText='width:100%;text-align:center;border:none;background:transparent;font-family:"Geist Mono",monospace;font-size:13px;font-weight:500;outline:none;padding:0;color:'+(accent?'var(--accent)':'var(--text)')+';-moz-appearance:textfield;';
        inp.addEventListener('keydown',handleKey);
        inp.addEventListener('input',()=>{_inlineManualMacros=true;});
        const lbl=document.createElement('div');
        lbl.textContent=label;
        lbl.style.cssText='font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-top:1px;';
        wrap.appendChild(inp); wrap.appendChild(lbl);
        macroRow.appendChild(wrap);
      });
      row.appendChild(topRow); row.appendChild(macroRow);
      container.appendChild(row);
      requestAnimationFrame(()=>{const w=document.getElementById('ile-weight');if(w){w.focus();w.select();}});
    } else {
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);background:var(--card);';
      const label=document.createElement('span');
      label.style.cssText='font-size:13px;color:var(--text);flex:1;min-width:0;';
      label.textContent=i.name+(i.weight||i.serving?' '+itemWeightLabel(i):'');
      const macros=document.createElement('span');
      macros.style.cssText='font-size:12px;color:var(--text-muted);font-family:\'Geist Mono\',monospace;margin-right:6px;';
      macros.textContent=i.kcal+' kcal · '+i.protein+'g P';
      const editBtn=document.createElement('button');
      editBtn.title='Edit'; editBtn.innerHTML='<i class="ti ti-pencil"></i>';
      editBtn.style.cssText='background:none;border:none;padding:2px 5px;cursor:pointer;color:var(--text-muted);font-size:14px;';
      editBtn.addEventListener('click',()=>{snapshotMeal();_inlineEditId=i.id;_inlineManualMacros=false;renderCurrentMeal();});
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.title='Remove';
      delBtn.style.cssText='background:none;border:none;padding:2px 6px;cursor:pointer;color:var(--text-muted);font-size:15px;';
      delBtn.addEventListener('click',()=>deleteFromCurrentMeal(i.id));
      row.appendChild(label); row.appendChild(macros); row.appendChild(editBtn); row.appendChild(delBtn);
      container.appendChild(row);
    }
  });
}

function renderRecentIngredients(){
  const panel=document.getElementById('recent-ing-panel');
  if(!panel) return;
  const recent=(typeof getRecentIngredients==='function'?getRecentIngredients():[]).slice(0,5);
  if(!recent.length){panel.style.display='none';panel.innerHTML='';return;}
  panel.style.display='block';
  panel.style.margin='8px 20px 10px';
  panel.style.background='var(--card)';
  panel.style.border='.5px solid var(--border)';
  panel.style.borderRadius='var(--radius-sm)';
  panel.style.overflow='hidden';
  panel.innerHTML='';
  const header=document.createElement('div');
  header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);';
  header.innerHTML='<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Recent</span>';
  panel.appendChild(header);
  recent.forEach(r=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);cursor:pointer;';
    row.addEventListener('click',()=>addIngredientFromRecent(r));
    const label=document.createElement('span');
    label.style.cssText='font-size:13px;color:var(--text);flex:1;min-width:0;';
    label.textContent=r.name||'—';
    const meta=document.createElement('span');
    meta.style.cssText='font-size:12px;color:var(--text-muted);font-family:\'Geist Mono\',monospace;margin-left:8px;flex-shrink:0;';
    const bits=[];
    if(r.kcal!=null&&r.kcal!=='') bits.push(Math.round(Number(r.kcal))+' kcal');
    if(r.protein!=null&&r.protein!=='') bits.push(Math.round(Number(r.protein)*10)/10+'g P');
    if(r.weight||r.serving) bits.unshift(itemWeightLabel(r));
    meta.textContent=bits.join(' · ');
    row.appendChild(label);
    row.appendChild(meta);
    panel.appendChild(row);
  });
}
function addIngredientFromRecent(r){
  if(!r||!r.name) return;
  snapshotMeal();
  meal.push({
    id:nextIngId++,
    name:r.name,
    weight:r.weight,
    serving:r.serving?{...r.serving}:undefined,
    kcal:Math.round(Number(r.kcal))||0,
    protein:Math.round(Number(r.protein||0)*10)/10,
    carbs:Math.round(Number(r.carbs||0)*10)/10,
    fat:Math.round(Number(r.fat||0)*10)/10,
    fibre:Math.round(Number(r.fibre||0)*10)/10,
    icon:r.icon||'ti-clipboard',
    type:r.type||'solid',
  });
  _persistDraft();
  showToast('Added '+r.name+' ✓');
  renderCurrentMeal();
  updateHome();
}

function showLogScreen(id){
  document.querySelectorAll('.log-screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('ls-'+id).classList.add('active');
  if(id==='listening'){renderCurrentMeal();renderRecentIngredients();}
  else stopSousRealtimeVoice(false);
}

// ═══════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════
function speak(text,onEnd){
  if(!window.speechSynthesis){if(onEnd)onEnd();return;}
  window.speechSynthesis.cancel();
  isSpeaking=true; setMicState('speaking');
  const u=new SpeechSynthesisUtterance(text);
  u.rate=0.96; u.pitch=1.05; u.volume=1;
  const voices=window.speechSynthesis.getVoices();
  const score=v=>{
    const n=(v.name||'').toLowerCase(),l=(v.lang||'').toLowerCase();
    let s=0;
    if(/natural|neural|premium|enhanced|online|wavenet|studio/.test(n)) s+=120;
    if(/google/.test(n)) s+=60;
    if(/microsoft/.test(n)&&/online|natural/.test(n)) s+=80;
    if(/(samantha|ava|allison|serena|moira|karen|tessa|zoe|joanna|matthew|emma|amelia|aria|jenny|libby|sonia|guy|davis|tony|jane|nancy)/.test(n)) s+=70;
    if(/(microsoft mark|microsoft david|microsoft zira)\s*-/.test(n)) s-=40;
    if(/compact|espeak|festival/.test(n)) s-=80;
    if(l.startsWith('en')) s+=20;
    if(l==='en-us'||l==='en-gb') s+=10;
    return s;
  };
  const pref=voices.slice().sort((a,b)=>score(b)-score(a))[0];
  if(pref) u.voice=pref;
  u.onend=u.onerror=()=>{isSpeaking=false;if(onEnd)onEnd();};
  setTimeout(()=>window.speechSynthesis.speak(u),30);
}
function speakThenListen(text,onResult){
  pauseAlwaysOn();
  speak(text,()=>setTimeout(()=>startClarificationListen(onResult),200));
}

function speakCachedResponse(key,data={},onEnd){
  const fallback=()=>speak(typeof getCachedResponse==='function'?getCachedResponse(key,data):'Okay.',onEnd);
  if(typeof getCachedResponseAsync==='function'){
    getCachedResponseAsync(key,data).then(text=>speak(text,onEnd)).catch(fallback);
  } else fallback();
}

// ═══════════════════════════════════════════
// MIC STATE
// ═══════════════════════════════════════════
function setMicState(state){
  const btn=document.getElementById('mic-btn'),dot=document.getElementById('aob-dot'),
        txt=document.getElementById('aob-text'),status=document.getElementById('listen-status'),
        wf=document.getElementById('waveform');
  const prs=['pr1','pr2','pr3'].map(id=>document.getElementById(id));
  if(!btn) return;
  btn.className='mic-btn'+(state!=='idle'?' '+state:'');
  prs.forEach(p=>{if(p)p.className='pulse-ring'+(['listening','recording'].includes(state)?' active':'');});
  wf.className='waveform'+(state==='recording'?' active':state==='speaking'?' speaking':'');
  const map={
    idle:     {dc:'aob-dot',          tc:'aob-text',    tt:'Say "Hey Sous" or tap mic',            st:'Tap to speak',         sc:'listen-status'},
    listening:{dc:'aob-dot listening',tc:'aob-text on', tt:'Listening for "Hey Sous"…',            st:'Always on · tap to speak now', sc:'listen-status on'},
    wake:     {dc:'aob-dot wake',     tc:'aob-text on', tt:'Wake word detected…',                  st:'Hey Sous — go ahead!', sc:'listen-status on'},
    recording:{dc:'aob-dot active',   tc:'aob-text on', tt:'Recording…',                           st:'Listening…',           sc:'listen-status on'},
    speaking: {dc:'aob-dot speaking', tc:'aob-text on', tt:'Speaking…',                            st:'Sous is talking…',     sc:'listen-status on'},
  };
  const m=map[state]||map.idle;
  dot.className=m.dc; txt.className=m.tc; txt.textContent=m.tt;
  if(status){status.className=m.sc;status.textContent=m.st;}
}

// ═══════════════════════════════════════════
// CONFIRM SCREEN
// ═══════════════════════════════════════════
function showConfirm(parsed){
  pendingFood=parsed;
  _confirmManualMacros=false;
  document.getElementById('confirm-name').textContent=parsed.name;
  document.getElementById('confirm-weight').textContent=itemWeightLabel(parsed)+(parsed.customMacro?'':' · raw');
  document.getElementById('confirm-icon').className='ti '+(parsed.icon||'ti-meat');
  const editable=!parsed.weightSpecified&&!!parsed.rawFood;
  const cKcal=document.getElementById('c-kcal'),cProt=document.getElementById('c-protein'),cCarbs=document.getElementById('c-carbs'),cFat=document.getElementById('c-fat');
  [cKcal,cProt,cCarbs,cFat].forEach((el,idx)=>{
    if(!el) return;
    const vals=[parsed.kcal,parsed.protein,parsed.carbs,parsed.fat];
    el.value=vals[idx];
    el.readOnly=!editable;
    el.tabIndex=editable?0:-1;
    el.oninput=editable?()=>{_confirmManualMacros=true;}:null;
  });
  document.getElementById('pill-raw').className='toggle-pill active';
  document.getElementById('pill-cooked').className='toggle-pill inactive';
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(editable){
    qtyRow.style.display='block';
    qtyInput.value=parsed.weight;
    qtyInput.oninput=()=>{
      if(_confirmManualMacros||!pendingFood?.rawFood) return;
      const g=parseFloat(qtyInput.value);
      if(!g||g<=0) return;
      const food=pendingFood.rawFood,r=g/food.w;
      if(cKcal) cKcal.value=Math.round(food.kcal*r);
      if(cProt) cProt.value=Math.round(food.p*r*10)/10;
      if(cCarbs) cCarbs.value=Math.round(food.c*r*10)/10;
      if(cFat) cFat.value=Math.round(food.f*r*10)/10;
    };
  } else {
    qtyRow.style.display='none';
    qtyInput.value='';
    qtyInput.oninput=null;
  }
  showLogScreen('confirm');
  pauseAlwaysOn();
  speak(`Check this: ${parsed.name}, ${itemWeightLabel(parsed)}. Confirm?`,()=>startConfirmListen());
}
function startConfirmListen(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||document.querySelector('.log-screen.active')?.id!=='ls-confirm') return;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  r.onresult=e=>{
    const t=e.results[0][0].transcript.toLowerCase().trim();
    document.getElementById('transcript-text').textContent='"'+t+'"';
    if(/yes|confirm|correct|add|yep|yeah|right|ok/.test(t)) doConfirm();
    else if(/change|no|wrong|different|cancel|again/.test(t)) doChange();
    else showToast('Say "yes" to confirm or "change" to try again');
  };
  r.onerror=()=>{}; r.onend=()=>{};
  try{r.start();}catch(e){}
}
function doConfirm(){
  if(!pendingFood) return;
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(qtyRow.style.display!=='none'&&pendingFood.rawFood){
    const grams=parseFloat(qtyInput.value);
    if(grams&&grams>0){
      pendingFood.weight=Math.round(grams);
      if(_confirmManualMacros){
        pendingFood.kcal=parseFloat(document.getElementById('c-kcal')?.value)||0;
        pendingFood.protein=parseFloat(document.getElementById('c-protein')?.value)||0;
        pendingFood.carbs=parseFloat(document.getElementById('c-carbs')?.value)||0;
        pendingFood.fat=parseFloat(document.getElementById('c-fat')?.value)||0;
        // Override prompt when macros differ from DB food
        const food=pendingFood.rawFood,r=grams/food.w;
        const dbKcal=Math.round(food.kcal*r);
        if(pendingFood.kcal!==dbKcal){
          const r2=100/pendingFood.weight;
          _pendingOverride={key:food.name,name:pendingFood.name,macros:{kcal:Math.round(pendingFood.kcal*r2),protein:Math.round(pendingFood.protein*r2*10)/10,carbs:Math.round(pendingFood.carbs*r2*10)/10,fat:Math.round(pendingFood.fat*r2*10)/10,fibre:Math.round((pendingFood.fibre||0)*r2*10)/10}};
          setTimeout(()=>_showOverridePrompt(pendingFood.name||food.name),900);
        }
      } else {
        const food=pendingFood.rawFood,r=grams/food.w;
        pendingFood.kcal=Math.round(food.kcal*r);
        pendingFood.protein=Math.round(food.p*r*10)/10;
        pendingFood.carbs=Math.round(food.c*r*10)/10;
        pendingFood.fat=Math.round(food.f*r*10)/10;
        pendingFood.fibre=Math.round((food.fi||0)*r*10)/10;
      }
    }
  }
  syncServingFromWeight(pendingFood);
  snapshotMeal(); meal.push(pendingFood); _persistDraft();
  _confirmManualMacros=false;
  const name=pendingFood.name;
  speak(itemQueue.length ? 'Added. Next.' : 'Added.',()=>{
    pendingFood=null;
    processQueue();
    if(document.querySelector('.log-screen.active')?.id==='ls-listening') setTimeout(restartAlwaysOn,300);
  });
}
function doChange(){
  pendingFood=null;
  speak('OK, what would you like to add?',()=>{showLogScreen('listening');setTimeout(restartAlwaysOn,300);});
}

// ═══════════════════════════════════════════
// QUANTITY PROMPT (voice — high confidence, no weight)
// ═══════════════════════════════════════════
function parseGramsFromText(text){
  const m=text.match(/(\d+(?:\.\d+)?)\s*(?:g(?:rams?)?)?/i);
  return m?parseFloat(m[1]):null;
}
function commitQuantity(grams){
  if(!pendingFood||!pendingFood.rawFood) return;
  const food=pendingFood.rawFood;
  const r=grams/food.w;
  const item=syncServingFromWeight({id:nextIngId++,name:food.name,weight:Math.round(grams),kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,type:food.type||'solid',rawFood:food});
  snapshotMeal(); meal.push(item); _persistDraft();
  showToast('Added '+item.name+' '+Math.round(grams)+'g ✓');
  pendingFood=null;
  showLogScreen('listening');
  renderCurrentMeal();
  processQueue();
}
function findUsualMealForIngredientName(name){
  if(typeof getUsualMeals!=='function') return null;
  const query=typeof normaliseLogText==='function'?normaliseLogText(name):String(name||'').toLowerCase().trim();
  if(!query) return null;
  const usuals=getUsualMeals()||{};
  let best=null,bestScore=0;
  Object.keys(usuals).forEach(section=>{
    const list=Array.isArray(usuals[section])?usuals[section]:[];
    list.forEach((u,index)=>{
      const nameText=typeof normaliseLogText==='function'?normaliseLogText(u.name||''):String(u.name||'').toLowerCase();
      const ingText=(u.ingredients||[]).map(i=>typeof normaliseLogText==='function'?normaliseLogText(i.name||''):String(i.name||'').toLowerCase()).join(' ');
      let score=0;
      if(nameText===query) score=900;
      else if(nameText.includes(query)) score=700+query.length;
      else if(ingText.split(/\s+/).includes(query)) score=650+query.length;
      else if(ingText.includes(query)) score=500+query.length;
      if(score>bestScore){best={...u,section:u.section||section,_usualIndex:index};bestScore=score;}
    });
  });
  return bestScore>0?best:null;
}
function commitUsualFromQuantityPrompt(){
  if(!pendingFood) return;
  const usual=pendingFood.usualMealOption||findUsualMealForIngredientName(pendingFood.name);
  if(!usual){showToast('No usual meal found for this');return;}
  snapshotMeal();
  if(typeof addMealToCurrent==='function') addMealToCurrent(usual);
  else (usual.ingredients||[]).forEach(ing=>meal.push({...ing,id:nextIngId++}));
  showToast('Added '+usual.name+' ✓');
  pendingFood=null;
  showLogScreen('listening');
  renderCurrentMeal();
  processQueue();
}
function askQuantity(item){
  pendingFood=item;
  const usual=findUsualMealForIngredientName(item.name);
  pendingFood.usualMealOption=usual||null;
  document.getElementById('qty-food-name').textContent=item.name;
  document.getElementById('qty-default-btn').textContent='Use default ('+item.weight+'g)';
  const usualBtn=document.getElementById('qty-usual-btn');
  if(usualBtn){
    usualBtn.style.display=usual?'block':'none';
    usualBtn.textContent=usual?'Use usual '+usual.name:'Use usual';
  }
  document.getElementById('qty-input').value='';
  showLogScreen('quantity');
  pauseAlwaysOn();
  speakThenListen('How much '+item.name+'?',voiceAnswer=>{
    if(document.querySelector('.log-screen.active')?.id!=='ls-quantity') return;
    const grams=parseGramsFromText(voiceAnswer);
    if(grams&&grams>0){
      commitQuantity(grams);
    } else {
      showToast('Didn\'t catch that — type it or use default');
    }
  });
}

// ═══════════════════════════════════════════
// AMBIGUOUS SCREEN
// ═══════════════════════════════════════════
function showAmbiguous(matches,amount,label,question){
  currentAmbig={matches,amount,label,question};
  let selectedIdx=0;
  document.getElementById('ambig-sub').textContent='I heard "'+label+'"';
  document.getElementById('ambig-listen-text').textContent='Say the name or tap to choose';
  const container=document.getElementById('ambig-options');
  container.innerHTML='';
  matches.forEach((food,i)=>{
    const r=amount?amount/food.w:1,kcal=Math.round(food.kcal*r);
    const div=document.createElement('div');
    div.className='ambig-opt'+(i===0?' selected':'');
    div.innerHTML=`<div><div class="ambig-opt-name">${food.name}</div><div class="ambig-opt-macros">${Math.round(food.p*r)}g protein · ${Math.round(food.c*r)}g carbs · ${Math.round(food.f*r)}g fat</div></div><div class="ambig-opt-right"><div class="ambig-opt-kcal">${kcal} kcal</div><i class="ti ti-check ambig-check"></i></div>`;
    div.addEventListener('click',()=>{container.querySelectorAll('.ambig-opt').forEach(o=>o.classList.remove('selected'));div.classList.add('selected');selectedIdx=i;});
    container.appendChild(div);
  });
  document.getElementById('ambig-confirm-btn').onclick=()=>resolveAmbig(matches[selectedIdx],amount);
  showLogScreen('ambiguous');
  speakThenListen(question,voiceAnswer=>{
    const ans=voiceAnswer.toLowerCase();
    let resolved=null;
    for(const food of matches){
      if(food.name.toLowerCase().split(' ').some(part=>ans.includes(part)&&part.length>3)){resolved=food;break;}
    }
    if(resolved) resolveAmbig(resolved,amount);
    else{document.getElementById('ambig-listen-text').textContent='Didn\'t catch that — tap to choose';showToast('Tap your choice or say the name again');}
  });
}
function resolveAmbig(food,amount){
  const r=amount?amount/food.w:1;
  const resolved=syncServingFromWeight({name:food.name,weight:amount?Math.round(amount):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,type:food.type||'solid',rawFood:food,weightSpecified:amount!=null});
  currentAmbig=null;
  if(!amount){askQuantity(resolved);}else{showConfirm(resolved);}
}

// ═══════════════════════════════════════════
// MULTI-CONFIRM (batch ingredient review)
// ═══════════════════════════════════════════
let pendingBatch=[];
function _updateEntryMacros(entry){
  if(entry.manualMacros) return;
  const food=entry.ambiguous?entry.options[entry.selectedIdx]:entry.food;
  const w=Math.max(1,Math.round(entry.weight||1));
  if(food){
    const r=w/food.w;
    entry.editKcal=Math.round(food.kcal*r);
    entry.editProtein=Math.round(food.p*r*10)/10;
    entry.editCarbs=Math.round(food.c*r*10)/10;
    entry.editFat=Math.round(food.f*r*10)/10;
  } else {
    const ri=entry.rawItem||{};
    const origW=ri.weight||w;
    const r=origW>0?w/origW:1;
    entry.editKcal=Math.round((ri.kcal||0)*r);
    entry.editProtein=Math.round((ri.protein||0)*r*10)/10;
    entry.editCarbs=Math.round((ri.carbs||0)*r*10)/10;
    entry.editFat=Math.round((ri.fat||0)*r*10)/10;
  }
}
function batchNeedsMultiConfirm(results){
  const food=results.filter(r=>!r.command);
  if(!food.length) return false;
  if(food.some(r=>!isClearIngredient(r))) return true;
  return false;
}
function showMultiConfirm(results){
  pendingBatch=results.filter(r=>!r.command).map(r=>{
    let entry;
    if(r.ambiguous) entry={ambiguous:true,label:r.label,options:r.matches,selectedIdx:0,weight:r.amount||100,manualMacros:false};
    else entry={ambiguous:false,label:r.name,options:null,food:r.rawFood||null,weight:r.weight||r.rawFood?.w||100,rawItem:r,manualMacros:false};
    _updateEntryMacros(entry);
    return entry;
  });
  renderMultiConfirm();
  showLogScreen('multi-confirm');
}
function renderMultiConfirm(){
  const list=document.getElementById('mc-list');
  if(!list) return;
  list.innerHTML='';
  pendingBatch.forEach((entry,idx)=>{
    const card=document.createElement('div');
    card.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;';
    if(entry.ambiguous){
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';
      entry.options.forEach((food,fi)=>{
        const chip=document.createElement('button');
        chip.type='button'; chip.textContent=food.name;
        const sel=fi===entry.selectedIdx;
        chip.style.cssText='font-size:12px;padding:5px 11px;border-radius:20px;cursor:pointer;font-family:inherit;border:.5px solid '+(sel?'var(--accent);background:var(--accent);color:#fff;':'var(--border);background:var(--card-2);color:var(--text);');
        chip.addEventListener('click',()=>{entry.selectedIdx=fi;_updateEntryMacros(entry);renderMultiConfirm();});
        wrap.appendChild(chip);
      });
      card.appendChild(wrap);
    } else {
      const nm=document.createElement('div');
      nm.style.cssText='font-size:14px;font-weight:500;color:var(--text);margin-bottom:8px;';
      nm.textContent=entry.label; card.appendChild(nm);
    }
    const qRow=document.createElement('div');
    qRow.style.cssText='display:flex;align-items:center;gap:6px;';
    const btnStyle='border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;background:var(--card-2);';
    const minusBtn=document.createElement('button');
    minusBtn.textContent='−'; minusBtn.type='button'; minusBtn.style.cssText=btnStyle;
    minusBtn.addEventListener('click',()=>{entry.weight=Math.max(1,(entry.weight||10)-10);_updateEntryMacros(entry);renderMultiConfirm();});
    const wtIn=document.createElement('input');
    wtIn.type='number'; wtIn.value=Math.round(entry.weight); wtIn.min=1;
    wtIn.style.cssText='width:60px;text-align:center;font-size:14px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-family:inherit;outline:none;';
    wtIn.addEventListener('change',()=>{entry.weight=Math.max(1,parseFloat(wtIn.value)||1);_updateEntryMacros(entry);renderMultiConfirm();});
    const plusBtn=document.createElement('button');
    plusBtn.textContent='+'; plusBtn.type='button'; plusBtn.style.cssText=btnStyle;
    plusBtn.addEventListener('click',()=>{entry.weight=(entry.weight||0)+10;_updateEntryMacros(entry);renderMultiConfirm();});
    const gLbl=document.createElement('span');
    gLbl.textContent='g'; gLbl.style.cssText='font-size:13px;color:var(--text-muted);margin-right:auto;';
    const rmBtn=document.createElement('button');
    rmBtn.textContent='×'; rmBtn.type='button';
    rmBtn.style.cssText='background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:2px 4px;flex-shrink:0;';
    rmBtn.addEventListener('click',()=>{pendingBatch.splice(idx,1);if(!pendingBatch.length){showLogScreen('listening');return;}renderMultiConfirm();});
    qRow.appendChild(minusBtn); qRow.appendChild(wtIn); qRow.appendChild(plusBtn); qRow.appendChild(gLbl); qRow.appendChild(rmBtn);
    card.appendChild(qRow);
    // Macro inputs row
    const macroRow=document.createElement('div');
    macroRow.style.cssText='display:flex;gap:4px;margin-top:8px;';
    const mcMacroDefs=[{key:'editKcal',label:'kcal',accent:true},{key:'editProtein',label:'P'},{key:'editCarbs',label:'C'},{key:'editFat',label:'F'}];
    mcMacroDefs.forEach(({key,label,accent})=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='flex:1;text-align:center;background:var(--bg-2);border:.5px solid var(--border);border-radius:8px;padding:5px 4px;';
      const inp=document.createElement('input');
      inp.type='number'; inp.value=entry[key]??0;
      inp.style.cssText='width:100%;text-align:center;border:none;background:transparent;font-family:"Geist Mono",monospace;font-size:13px;font-weight:500;outline:none;padding:0;-moz-appearance:textfield;color:'+(accent?'var(--accent)':'var(--text)')+';';
      inp.addEventListener('input',()=>{entry.manualMacros=true;entry[key]=parseFloat(inp.value)||0;});
      const lbl=document.createElement('div');
      lbl.textContent=label;
      lbl.style.cssText='font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-top:2px;';
      wrap.appendChild(inp); wrap.appendChild(lbl);
      macroRow.appendChild(wrap);
    });
    card.appendChild(macroRow);
    list.appendChild(card);
  });
  const addBtn=document.getElementById('mc-add-btn');
  if(addBtn) addBtn.textContent='Add '+pendingBatch.length+' ingredient'+(pendingBatch.length!==1?'s':'')+' to meal';
}
function commitMultiConfirm(){
  if(!pendingBatch.length){showLogScreen('listening');return;}
  snapshotMeal();
  let overrideCandidate=null;
  pendingBatch.forEach(entry=>{
    const food=entry.ambiguous?entry.options[entry.selectedIdx]:entry.food;
    const w=Math.max(1,Math.round(entry.weight));
    let item;
    if(entry.manualMacros){
      const base=food?{name:food.name,icon:food.icon,rawFood:food}:{...(entry.rawItem||{})};
      item={...base,weight:w,kcal:entry.editKcal||0,protein:entry.editProtein||0,carbs:entry.editCarbs||0,fat:entry.editFat||0,fibre:food?Math.round((food.fi||0)*w/food.w*10)/10:(entry.rawItem?.fibre||0)};
      if(food&&w){
        const r2=100/w;
        const dbKcal=Math.round(food.kcal*w/food.w);
        if((entry.editKcal||0)!==dbKcal) overrideCandidate={key:food.name,name:food.name,macros:{kcal:Math.round((entry.editKcal||0)*r2),protein:Math.round((entry.editProtein||0)*r2*10)/10,carbs:Math.round((entry.editCarbs||0)*r2*10)/10,fat:Math.round((entry.editFat||0)*r2*10)/10,fibre:0}};
      }
    } else if(food){
      const r=w/food.w;
      item={name:food.name,weight:w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,rawFood:food};
    } else {
      const ri=entry.rawItem||{};
      const origW=ri.weight||w;
      const r=origW>0?w/origW:1;
      item={...ri,weight:w,kcal:Math.round((ri.kcal||0)*r),protein:Math.round((ri.protein||0)*r*10)/10,carbs:Math.round((ri.carbs||0)*r*10)/10,fat:Math.round((ri.fat||0)*r*10)/10,fibre:Math.round((ri.fibre||0)*r*10)/10};
    }
    syncServingFromWeight(item);
    item.id=nextIngId++; meal.push(item);
  });
  _persistDraft();
  if(overrideCandidate){_pendingOverride=overrideCandidate;setTimeout(()=>_showOverridePrompt(overrideCandidate.name),600);}
  const count=pendingBatch.length; pendingBatch=[];
  showLogScreen('listening');
  updateHome();
  showToast('Added '+count+' ingredient'+(count!==1?'s':'')+' ✓');
  setTimeout(restartAlwaysOn,400);
}

// ═══════════════════════════════════════════
// SUMMARY SCREEN
// ═══════════════════════════════════════════
function defaultSectionFromTime(){
  const h=new Date().getHours();
  if(h<11) return 'breakfast';
  if(h<15) return 'lunch';
  if(h<21) return 'dinner';
  return 'snacks';
}
function showSummary(announce=true){
  if(!currentMealSection) currentMealSection=defaultSectionFromTime();
  const sel=document.getElementById('sum-section-select');
  if(sel) sel.value=currentMealSection;
  const nameInput=document.getElementById('sum-meal-name');
  if(nameInput&&(announce||!nameInput.value.trim())) nameInput.value=generateMealNameFromIngredients(meal,currentMealSection);
  const saveUsual=document.getElementById('sum-save-usual');
  if(saveUsual&&announce) saveUsual.checked=false;
  const t=sumMacros(meal);
  document.getElementById('sum-kcal').textContent=Math.round(t.kcal);
  document.getElementById('sum-protein').textContent=Math.round(t.protein)+'g';
  document.getElementById('sum-carbs').textContent=Math.round(t.carbs)+'g';
  document.getElementById('sum-fat').textContent=Math.round(t.fat)+'g';
  document.getElementById('sum-fibre').textContent=Math.round(t.fibre)+'g';
  document.getElementById('sum-sub').textContent=meal.length+' ingredient'+(meal.length!==1?'s':'');
  const list=document.getElementById('ing-list');
  list.innerHTML='';
  meal.forEach(item=>{
    if(!item.id) item.id=nextIngId++;
    const d=document.createElement('div'); d.className='ing-item'; d.dataset.id=item.id;
    d.innerHTML=`<div><div class="ing-name">${item.name}</div><div class="ing-weight">${itemWeightLabel(item)}</div></div><div style="display:flex;align-items:center;"><div class="ing-kcal">${item.kcal} kcal</div><i class="ti ti-pencil ing-edit-icon"></i></div>`;
    d.addEventListener('click',()=>openEditModal(item.id));
    list.appendChild(d);
  });
  showLogScreen('summary');
  if(announce) speak('Meal total: '+Math.round(t.kcal)+' calories.');
}

// ═══════════════════════════════════════════
// MANUAL ADD MODAL
// ═══════════════════════════════════════════
function openAddModal(){
  modalSelectedFood=null; modalActiveTab='search';
  document.getElementById('food-search').value='';
  document.getElementById('gram-input').value='100';
  document.getElementById('serving-unit-qty').value='1';
  document.getElementById('serving-unit-row').style.display='none';
  document.getElementById('selected-preview-box').style.display='none';
  renderFoodResults('');
  ['custom-name','custom-weight','custom-kcal','custom-protein','custom-carbs','custom-fat','custom-fibre','custom-unit-label','custom-unit-grams','custom-unit-kcal','custom-unit-protein','custom-unit-carbs','custom-unit-fat'].forEach(id=>{document.getElementById(id).value='';});
  switchModalTab('search');
  const m=document.getElementById('add-modal');
  m.style.display='flex';
  requestAnimationFrame(()=>m.classList.add('show'));
  setTimeout(()=>document.getElementById('food-search').focus(),150);
}
function openCustomEntry(){
  openAddModal();
  switchModalTab('custom');
  setTimeout(()=>document.getElementById('custom-name').focus(),150);
}
function setCustomFoodType(type){
  document.getElementById('custom-type-solid').classList.toggle('active',type==='solid');
  document.getElementById('custom-type-liquid').classList.toggle('active',type==='liquid');
  const servingLbl=document.getElementById('custom-serving-lbl');
  if(servingLbl) servingLbl.textContent='Default serving size ('+(type==='liquid'?'ml':'g')+') — optional';
  const per100Labels=document.querySelectorAll('.custom-per100-lbl');
  per100Labels.forEach(el=>{el.textContent=el.dataset.macro+' per 100'+(type==='liquid'?'ml':'g');});
}
function openCreateCustomFood(query){
  openAddModal();
  switchModalTab('custom');
  setCustomFoodType('solid');
  setTimeout(()=>{
    const nameEl=document.getElementById('custom-name');
    if(nameEl){nameEl.value=query||'';nameEl.focus();}
    if(query) setTimeout(()=>document.getElementById('custom-kcal').focus(),80);
  },150);
}
function closeAddModal(){
  const m=document.getElementById('add-modal');
  m.classList.remove('show');
  setTimeout(()=>{m.style.display='none';},300);
  modalSelectedFood=null;
}
function switchModalTab(tab){
  modalActiveTab=tab;
  document.getElementById('panel-search').style.display=tab==='search'?'block':'none';
  document.getElementById('panel-custom').style.display=tab==='custom'?'block':'none';
  document.getElementById('tab-search-btn').className='tab-btn'+(tab==='search'?' active':'');
  document.getElementById('tab-custom-btn').className='tab-btn'+(tab==='custom'?' active':'');
}
function renderFoodResults(query){
  const container=document.getElementById('food-results');
  const q=query.toLowerCase().trim();
  const customs=typeof getCustomFoods==='function'?getCustomFoods():[];
  const customMatches=q?customs.filter(f=>f.name.toLowerCase().includes(q)):customs.slice(0,5);
  const dbFoods=typeof getFoodDatabase==='function'?getFoodDatabase():FOODS;
  const dbMatches=q?dbFoods.filter(f=>f.name.toLowerCase().includes(q)||(f.kw&&f.kw.some(k=>k.includes(q)))):dbFoods.slice(0,20);
  container.innerHTML='';
  customMatches.forEach(food=>{
    const div=document.createElement('div');
    div.className='food-result-item'+(food===modalSelectedFood?' selected':'');
    div.innerHTML=`<span class="fri-name">${food.name}</span><span class="fri-custom-badge">custom</span><span class="fri-kcal">${food.kcal} kcal/100g</span>`;
    div.addEventListener('click',()=>selectFood(food));
    container.appendChild(div);
  });
  dbMatches.forEach(food=>{
    const div=document.createElement('div');
    div.className='food-result-item'+(food===modalSelectedFood?' selected':'');
    div.innerHTML=`<span class="fri-name">${food.name}</span><span class="fri-kcal">${food.kcal} kcal/100g</span>`;
    div.addEventListener('click',()=>selectFood(food));
    container.appendChild(div);
  });
  if(q&&customMatches.length===0&&dbMatches.length===0){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='create-custom-food-btn';
    btn.textContent='+ Create "'+query+'" as custom food';
    btn.addEventListener('click',()=>openCreateCustomFood(query));
    container.appendChild(btn);
  }
}
function selectFood(food){
  modalSelectedFood=food;
  const gramInput=document.getElementById('gram-input');
  if(gramInput&&food.defaultServing) gramInput.value=food.defaultServing;
  const unit=getServingUnitForFood(food);
  const unitRow=document.getElementById('serving-unit-row');
  const unitQty=document.getElementById('serving-unit-qty');
  const unitLabel=document.getElementById('serving-unit-label');
  if(unitRow&&unitQty&&unitLabel&&unit){
    unitRow.style.display='flex';
    unitQty.value=defaultServingQty(food,unit);
    unitLabel.textContent=_pluralUnit(unit.label,Number(unitQty.value)||1);
    if(unit.grams&&gramInput) gramInput.value=Math.round(unit.grams*(Number(unitQty.value)||1));
  } else if(unitRow){
    unitRow.style.display='none';
  }
  document.querySelectorAll('.food-result-item').forEach(el=>el.classList.toggle('selected',el.querySelector('.fri-name').textContent===food.name));
  document.getElementById('spb-name').textContent=food.name;
  document.getElementById('spb-per100').textContent=`per 100g · ${food.kcal} kcal · ${food.p}g P · ${food.c}g C · ${food.f}g F`;
  document.getElementById('selected-preview-box').style.display='block';
  updatePreviewMacros();
  document.getElementById('selected-preview-box').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function updatePreviewMacros(){
  if(!modalSelectedFood) return;
  const unit=getServingUnitForFood(modalSelectedFood);
  const unitRow=document.getElementById('serving-unit-row');
  const qty=parseFloat(document.getElementById('serving-unit-qty')?.value)||0;
  const byServing=unit&&unitRow&&unitRow.style.display!=='none'&&qty>0;
  const item=byServing?buildItemFromFoodServing(modalSelectedFood,qty,unit):null;
  if(item){
    if(unit.grams) document.getElementById('gram-input').value=Math.round(unit.grams*qty);
    document.getElementById('serving-unit-label').textContent=_pluralUnit(unit.label,qty);
    document.getElementById('pmg-kcal').textContent=Math.round(item.kcal);
    document.getElementById('pmg-p').textContent=Math.round(item.protein*10)/10+'g';
    document.getElementById('pmg-c').textContent=Math.round(item.carbs*10)/10+'g';
    document.getElementById('pmg-f').textContent=Math.round(item.fat*10)/10+'g';
    return;
  }
  const grams=parseFloat(document.getElementById('gram-input').value)||100;
  const r=grams/(modalSelectedFood.w||100);
  document.getElementById('pmg-kcal').textContent=Math.round(modalSelectedFood.kcal*r);
  document.getElementById('pmg-p').textContent=Math.round(modalSelectedFood.p*r*10)/10+'g';
  document.getElementById('pmg-c').textContent=Math.round(modalSelectedFood.c*r*10)/10+'g';
  document.getElementById('pmg-f').textContent=Math.round(modalSelectedFood.f*r*10)/10+'g';
}
function addManualIngredient(){
  if(modalActiveTab==='search'){
    if(!modalSelectedFood){showToast('Pick a food first');return;}
    const unit=getServingUnitForFood(modalSelectedFood);
    const unitRow=document.getElementById('serving-unit-row');
    const servingQty=parseFloat(document.getElementById('serving-unit-qty')?.value)||0;
    let newItem=null;
    if(unit&&unitRow&&unitRow.style.display!=='none'&&servingQty>0){
      newItem=buildItemFromFoodServing(modalSelectedFood,servingQty,unit);
      if(!newItem){showToast('Enter a valid serving amount');return;}
      newItem.id=nextIngId++;
    } else {
      const grams=parseFloat(document.getElementById('gram-input').value)||100;
      if(grams<=0){showToast('Enter a valid amount');return;}
      const r=grams/(modalSelectedFood.w||100);
      newItem={id:nextIngId++,name:modalSelectedFood.name,weight:Math.round(grams),kcal:Math.round(modalSelectedFood.kcal*r),protein:Math.round(modalSelectedFood.p*r*10)/10,carbs:Math.round(modalSelectedFood.c*r*10)/10,fat:Math.round(modalSelectedFood.f*r*10)/10,fibre:Math.round((modalSelectedFood.fi||0)*r*10)/10,icon:modalSelectedFood.icon,type:modalSelectedFood.type||'solid',rawFood:modalSelectedFood};
    }
    applyFoodOverride(newItem);
    syncServingFromWeight(newItem);
    snapshotMeal(); meal.push(newItem);
    _persistDraft();
    const foodName=modalSelectedFood.name;
    showToast('Added '+foodName+' ✓');
    if(newItem.weight){
      const r2=100/Math.round(newItem.weight);
      _pendingOverride={key:foodName,name:foodName,macros:{kcal:Math.round(newItem.kcal*r2),protein:Math.round(newItem.protein*r2*10)/10,carbs:Math.round(newItem.carbs*r2*10)/10,fat:Math.round(newItem.fat*r2*10)/10,fibre:Math.round((newItem.fibre||0)*r2*10)/10}};
      setTimeout(()=>_showOverridePrompt(foodName),350);
    }
  } else {
    const name=document.getElementById('custom-name').value.trim();
    if(!name){showToast('Enter a food name');return;}
    const unitResult=readCustomUnitFromFields('custom');
    if(unitResult.error){showToast(unitResult.error);return;}
    const servingRaw=document.getElementById('custom-weight').value;
    const serving=servingRaw!==''?parseFloat(servingRaw)||100:100;
    const kcalPer100=parseFloat(document.getElementById('custom-kcal').value)||0;
    const proteinPer100=parseFloat(document.getElementById('custom-protein').value)||0;
    const carbsPer100=parseFloat(document.getElementById('custom-carbs').value)||0;
    const fatPer100=parseFloat(document.getElementById('custom-fat').value)||0;
    const fibrePer100=parseFloat(document.getElementById('custom-fibre').value)||0;
    const foodType=document.getElementById('custom-type-liquid').classList.contains('active')?'liquid':'solid';
    const customFood=typeof addCustomFood==='function'?addCustomFood({
      name,w:100,kcal:kcalPer100,p:proteinPer100,c:carbsPer100,f:fatPer100,fi:fibrePer100,
      defaultServing:servingRaw!==''?serving:undefined,icon:'ti-clipboard',type:foodType
    }):null;
    if(unitResult.unit&&typeof setCustomServingUnit==='function') setCustomServingUnit(name,unitResult.unit);
    const unit=unitResult.unit||getServingUnitForFood(name);
    const unitItem=unit?buildItemFromFoodServing(customFood||{name,w:100,kcal:kcalPer100,p:proteinPer100,c:carbsPer100,f:fatPer100,fi:fibrePer100,icon:'ti-clipboard',type:foodType},1,unit):null;
    const r=serving/100;
    snapshotMeal();
    meal.push(unitItem?{...unitItem,id:nextIngId++}:{id:nextIngId++,name,weight:serving,kcal:Math.round(kcalPer100*r),protein:Math.round(proteinPer100*r*10)/10,carbs:Math.round(carbsPer100*r*10)/10,fat:Math.round(fatPer100*r*10)/10,fibre:Math.round(fibrePer100*r*10)/10,icon:'ti-clipboard',type:foodType,rawFood:customFood||undefined});
    _persistDraft();
    showToast('Saved & added '+name+' ✓');
  }
  closeAddModal();
  showLogScreen('listening');
  renderCurrentMeal();
}

// ═══════════════════════════════════════════
// EDIT INGREDIENT MODAL
// ═══════════════════════════════════════════
function openEditModal(id){
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  document.getElementById('edit-ing-id').value=id;
  document.getElementById('edit-name').value=item.name;
  document.getElementById('edit-weight').value=item.weight??'';
  document.getElementById('edit-kcal').value=item.kcal;
  document.getElementById('edit-protein').value=item.protein;
  document.getElementById('edit-carbs').value=item.carbs;
  document.getElementById('edit-fat').value=item.fat;
  document.getElementById('edit-fibre').value=item.fibre??'';
  const foodForUnit=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
  const savedUnit=typeof getCustomServingUnit==='function'?getCustomServingUnit(foodForUnit?.name||item.name):null;
  populateCustomUnitFields('edit',savedUnit||item.serving||getServingUnitForFood(foodForUnit||item.name));
  _editBaseValues=null; _editFoodKey=null;
  if(item.weight&&!item.customMacro){
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    if(food){
      const r=item.weight/100;
      _editBaseValues={kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10};
      _editFoodKey=food.name;
    }
  }
  const m=document.getElementById('edit-modal');
  m.style.display='flex';
  requestAnimationFrame(()=>m.classList.add('show'));
}
function closeEditModal(){
  const m=document.getElementById('edit-modal');
  m.classList.remove('show');
  setTimeout(()=>{m.style.display='none';},300);
}
function _refreshAfterEdit(){
  const active=document.querySelector('.log-screen.active')?.id;
  if(active==='ls-listening') renderCurrentMeal(); else showSummary(false);
}
function saveEdit(){
  const id=parseInt(document.getElementById('edit-ing-id').value);
  const name=document.getElementById('edit-name').value.trim();
  const weightRaw=document.getElementById('edit-weight').value;
  const weight=weightRaw!==''?parseFloat(weightRaw)||null:null;
  const kcal=parseFloat(document.getElementById('edit-kcal').value)||0;
  const protein=parseFloat(document.getElementById('edit-protein').value)||0;
  const carbs=parseFloat(document.getElementById('edit-carbs').value)||0;
  const fat=parseFloat(document.getElementById('edit-fat').value)||0;
  const fibre=parseFloat(document.getElementById('edit-fibre').value)||0;
  if(!name){showToast('Food name required');return;}
  const unitResult=readCustomUnitFromFields('edit');
  if(unitResult.error){showToast(unitResult.error);return;}
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  snapshotMeal();
  item.name=name; item.weight=weight; item.kcal=kcal; item.protein=protein; item.carbs=carbs; item.fat=fat; item.fibre=fibre;
  if(unitResult.unit&&typeof setCustomServingUnit==='function'){
    const unitKey=item.rawFood?.name||_editFoodKey||name;
    setCustomServingUnit(unitKey,unitResult.unit);
    if(!item.serving&&weight&&unitResult.unit.grams&&Math.abs(weight/unitResult.unit.grams-Math.round(weight/unitResult.unit.grams))<0.001){
      const qty=Math.round(weight/unitResult.unit.grams);
      item.serving={label:unitResult.unit.label,quantity:qty,grams:unitResult.unit.grams};
    }
  }
  syncServingFromWeight(item);
  _persistDraft();
  closeEditModal(); _refreshAfterEdit(); showToast('Updated ✓');
  if(_editBaseValues&&weight&&_editFoodKey){
    const changed=kcal!==_editBaseValues.kcal||Math.abs(protein-_editBaseValues.protein)>0.05||Math.abs(carbs-_editBaseValues.carbs)>0.05||Math.abs(fat-_editBaseValues.fat)>0.05;
    if(changed){
      const r=100/weight;
      _pendingOverride={key:_editFoodKey,name:name,macros:{kcal:Math.round(kcal*r),protein:Math.round(protein*r*10)/10,carbs:Math.round(carbs*r*10)/10,fat:Math.round(fat*r*10)/10,fibre:Math.round(fibre*r*10)/10}};
      _showOverridePrompt(name);
    }
  }
}
function _showOverridePrompt(foodName){
  const el=document.getElementById('override-prompt');
  if(!el) return;
  const lbl=document.getElementById('override-prompt-label');
  if(lbl) lbl.textContent='Use these values for '+foodName+' next time?';
  el.style.display='flex';
  requestAnimationFrame(()=>el.classList.add('show'));
}
function _closeOverridePrompt(){
  const el=document.getElementById('override-prompt');
  if(!el) return;
  el.classList.remove('show');
  setTimeout(()=>{el.style.display='none';},300);
  _pendingOverride=null;
}
function _confirmOverride(){
  if(_pendingOverride&&_pendingOverride.key&&typeof setFoodOverride==='function'){
    setFoodOverride(_pendingOverride.key,_pendingOverride.macros);
    showToast('Saved as default for '+_pendingOverride.name);
  }
  _closeOverridePrompt();
}
function deleteIngredient(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  snapshotMeal(); meal.splice(idx,1); _persistDraft();
  closeEditModal(); _refreshAfterEdit(); showToast(name+' removed');
}
function deleteFromCurrentMeal(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  snapshotMeal(); meal.splice(idx,1); _persistDraft();
  renderCurrentMeal(); showToast(name+' removed');
}
function stepIngWeight(id,delta){
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  const cur=item.weight||0;
  const unitStep=item.serving?.grams||inferServingFromWeight(item)?.grams||10;
  const next=Math.max(1,cur+(delta<0?-unitStep:unitStep));
  if(next===cur) return;
  if(_inlineManualMacros){
    // Persist whatever the user typed in macro inputs before re-render
    const kEl=document.getElementById('ile-kcal'),pEl=document.getElementById('ile-protein'),cEl=document.getElementById('ile-carbs'),fEl=document.getElementById('ile-fat');
    if(kEl) item.kcal=parseFloat(kEl.value)||0;
    if(pEl) item.protein=parseFloat(pEl.value)||0;
    if(cEl) item.carbs=parseFloat(cEl.value)||0;
    if(fEl) item.fat=parseFloat(fEl.value)||0;
  } else if(cur>0){
    const r=next/cur;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.weight=next;
  syncServingFromWeight(item);
  renderCurrentMeal();
}
function commitInlineEdit(id){
  const item=meal.find(i=>i.id===id);
  if(!item){_inlineEditId=null;renderCurrentMeal();return;}
  const newName=(document.getElementById('ile-name')?.value||'').trim();
  if(!newName){showToast('Name required');return;}
  const wtVal=document.getElementById('ile-weight')?.value;
  const newWeight=wtVal!=null&&wtVal!==''?parseFloat(wtVal)||null:null;
  if(_inlineManualMacros){
    item.kcal=parseFloat(document.getElementById('ile-kcal')?.value)||0;
    item.protein=parseFloat(document.getElementById('ile-protein')?.value)||0;
    item.carbs=parseFloat(document.getElementById('ile-carbs')?.value)||0;
    item.fat=parseFloat(document.getElementById('ile-fat')?.value)||0;
  } else if(newWeight!==null&&item.weight&&item.weight>0&&newWeight!==item.weight){
    const r=newWeight/item.weight;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.name=newName; item.weight=newWeight;
  syncServingFromWeight(item);
  _persistDraft();
  _inlineManualMacros=false;
  _inlineEditId=null; renderCurrentMeal(); showToast('Updated ✓');
  if(item.weight&&!item.customMacro){
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    if(food){
      const r2=100/item.weight;
      _pendingOverride={key:food.name,name:item.name,macros:{kcal:Math.round(item.kcal*r2),protein:Math.round(item.protein*r2*10)/10,carbs:Math.round(item.carbs*r2*10)/10,fat:Math.round(item.fat*r2*10)/10,fibre:Math.round((item.fibre||0)*r2*10)/10}};
      setTimeout(()=>_showOverridePrompt(item.name),200);
    }
  }
}

// ═══════════════════════════════════════════
// MEAL SAVING
// ═══════════════════════════════════════════
function getMealName(){
  const h=new Date().getHours();
  if(h<10) return 'Breakfast'; if(h<12) return 'Late breakfast';
  if(h<15) return 'Lunch'; if(h<18) return 'Afternoon snack';
  if(h<21) return 'Dinner'; return 'Evening snack';
}
function generateMealNameFromIngredients(ingredients,fallbackSection){
  const sectionLabels={breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snacks:'Snacks',supplements:'Supplements'};
  const fallback=sectionLabels[fallbackSection]||getMealName();
  const names=(ingredients||[]).map(i=>(i.name||'').trim()).filter(Boolean);
  if(names.length===0) return fallback;
  if(names.length===1) return names[0];
  if(names.length===2) return names[0]+' + '+names[1];
  if(names.length===3) return names[0]+', '+names[1]+' + '+names[2];
  return names[0]+' + '+(names.length-1)+' items';
}
function saveMealToLog(saveAsUsual=false){
  const date=(typeof selectedLogDate!=='undefined'?selectedLogDate:todayStr()),log=getLog();
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const section=currentMealSection||defaultSectionFromTime();
  const nameInput=document.getElementById('sum-meal-name');
  const typedName=nameInput?(nameInput.value.trim()||''):'';
  const name=typedName||generateMealNameFromIngredients(meal,section);
  const ingredients=meal.slice();
  const draft=typeof createMealDraft==='function'?createMealDraft({section,source:'cooking-session',ingredients}):{section,source:'cooking-session',ingredients};
  draft.name=name;
  draft.savedIngredients=ingredients;
  const mealObj=typeof draftToMeal==='function'?draftToMeal(draft):{name,time:new Date().toISOString(),section,ingredients,totals:sumMacros(ingredients)};
  if(typeof currentEditMealId!=='undefined'&&currentEditMealId&&typeof currentEditMealDate!=='undefined'&&currentEditMealDate){
    const editDate=currentEditMealDate;
    if(!log[editDate]) log[editDate]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
    const idx=log[editDate].meals.findIndex(m=>m.id===currentEditMealId);
    mealObj.id=currentEditMealId;
    if(idx!==-1) log[editDate].meals[idx]=mealObj;
    else log[editDate].meals.push(mealObj);
    log[editDate].totals=sumMacros(log[editDate].meals.map(m=>m.totals));
    currentEditMealId=null; currentEditMealDate=null;
  } else {
    mealObj.id=Date.now();
    log[date].meals.push(mealObj);
    log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  }
  saveLog(log);
  if(typeof clearDraft==='function') clearDraft();
  if(saveAsUsual&&window.updateUsualMeals) window.updateUsualMeals(mealObj,typedName);
  meal.forEach(i=>window.addToRecentIngredients(i));
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION
// ═══════════════════════════════════════════
function buildTapRec(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=true; r.continuous=false; r.maxAlternatives=3;
  r.onstart=()=>{isRecording=true;setMicState('recording');};
  r.onresult=e=>{
    let interim='',final='',finalConf=null;
    for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i];if(res.isFinal){final+=res[0].transcript;if(finalConf===null)finalConf=res[0].confidence;}else interim+=res[0].transcript;}
    const el=document.getElementById('transcript-text');
    if(el) el.textContent='"'+(final||interim)+'"';
    if(final){
      stopTapRec();
      const isLow=typeof finalConf==='number'&&finalConf>0&&finalConf<0.75;
      _voiceMode=true;
      if(isLow) showVoiceCorrection(final.trim());
      else handleTranscript(final.trim(),final.trim());
    }
  };
  r.onerror=e=>{
    stopTapRec();
    if(e.error==='not-allowed') document.getElementById('perm-warn').style.display='block';
    else if(e.error==='no-speech') showVoiceRetry("Didn't catch that — try again");
    else if(e.error!=='aborted') showVoiceRetry("Couldn't understand that");
  };
  r.onend=()=>stopTapRec();
  return r;
}
function stopTapRec(){isRecording=false;if(!isSpeaking)setMicState(alwaysOnActive?'listening':'idle');}
function realtimeVoiceEnabled(){
  try{
    return localStorage.getItem('sous_realtime_voice')==='1' || new URLSearchParams(location.search).get('realtime')==='1';
  }catch(e){return false;}
}
function realtimeClientSecret(data){
  return data && (data.client_secret?.value || data.client_secret || data.value);
}
function realtimeFoodContext(){
  const foods=typeof getFoodDatabase==='function'?getFoodDatabase():(typeof FOODS!=='undefined'?FOODS:[]);
  return (foods||[]).map(food=>({
    name:food.name,
    aliases:[...(food.kw||[]),...(food.aliases||[])]
  }));
}
function sendRealtimeEvent(event){
  if(!sousRealtime||!sousRealtime.dc||sousRealtime.dc.readyState!=='open') return false;
  sousRealtime.dc.send(JSON.stringify(event));
  return true;
}
function extractRealtimeActionText(event){
  if(!event) return '';
  if(typeof event.response?.output_text==='string') return event.response.output_text;
  const output=event.response?.output||event.output||[];
  if(!Array.isArray(output)) return '';
  return output.flatMap(item=>Array.isArray(item.content)?item.content:[])
    .map(part=>part.text||part.transcript||part.output_text||'')
    .filter(Boolean)
    .join('\n');
}
function normalizeRealtimeSection(section){
  return ['breakfast','lunch','dinner','snacks','supplements'].includes(section)?section:null;
}
function transcriptFromRealtimeAction(action){
  const cleaned=String(action.transcript||'').trim();
  if(cleaned) return cleaned;
  if(!Array.isArray(action.ingredients)) return '';
  return action.ingredients.map(ing=>{
    const name=String(ing.name||'').trim();
    if(!name) return '';
    const qty=ing.quantity==null?'':String(ing.quantity).trim();
    const unit=String(ing.unit||'').trim();
    return [qty,unit,name].filter(Boolean).join(' ');
  }).filter(Boolean).join(' and ');
}
function handleRealtimeActionText(text){
  const raw=String(text||'').trim();
  if(!raw) return;
  let action=null;
  try{
    const json=raw.match(/\{[\s\S]*\}/)?.[0]||raw;
    action=JSON.parse(json);
  }catch(e){
    console.log('[Sous Realtime] error', 'Invalid action JSON');
    showVoiceCorrection(raw);
    return;
  }
  if(!action||!action.type) return;
  console.log('[Sous Realtime] action received');
  if(action.type==='cancel'){
    stopSousRealtimeVoice(true);
    return;
  }
  if(action.type==='clarify'){
    const msg=String(action.message||'').trim()||(typeof getCachedResponse==='function'?getCachedResponse('clarification_needed'):'I need one more detail.');
    showToast(msg,2600);
    speak(msg);
    return;
  }
  if(action.type==='log_ingredients'){
    const section=normalizeRealtimeSection(action.section);
    if(section) currentMealSection=section;
    const transcript=transcriptFromRealtimeAction(action);
    if(!transcript){
      speakCachedResponse('clarification_needed');
      return;
    }
    const el=document.getElementById('transcript-text');
    if(el) el.textContent='"'+transcript+'"';
    handleTranscript(transcript,transcript);
  }
}
function handleRealtimeServerEvent(event){
  if(!event||!event.type) return;
  if(event.type.endsWith('.delta')){
    const delta=event.delta||event.text||event.transcript||'';
    if(delta&&sousRealtime) sousRealtime.textBuffer=(sousRealtime.textBuffer||'')+delta;
    return;
  }
  if(event.type==='response.done'||event.type==='response.completed'){
    const text=extractRealtimeActionText(event)||(sousRealtime&&sousRealtime.textBuffer)||'';
    if(sousRealtime) sousRealtime.textBuffer='';
    handleRealtimeActionText(text);
  }
  if(event.type==='error'){
    console.log('[Sous Realtime] error', event.error?.message||event.error||'Realtime error');
    stopSousRealtimeVoice(false);
    speakCachedResponse('realtime_error');
    setTimeout(restartAlwaysOn,300);
  }
}
function finishSousRealtimeVoice(){
  if(!sousRealtime||!sousRealtime.active) return;
  if(sousRealtime.finishing) return;
  sousRealtime.finishing=true;
  try{sousRealtime.stream&&sousRealtime.stream.getAudioTracks().forEach(track=>track.stop());}catch(e){}
  isRecording=false;
  setMicState('speaking');
  if(!sendRealtimeEvent({
    type:'response.create',
    response:{
      output_modalities:['text'],
      instructions:'Return one compact JSON action for the spoken request. If there was no clear request, return {"type":"clarify","message":"What would you like to log?"}.'
    }
  })) stopSousRealtimeVoice(true);
  else {
    clearTimeout(sousRealtime.idleTimer);
    sousRealtime.idleTimer=setTimeout(()=>stopSousRealtimeVoice(true),12000);
  }
}
async function startSousRealtimeVoice(){
  if(sousRealtime&&sousRealtime.active){
    stopSousRealtimeVoice(true);
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){
    startTapRec();
    return;
  }
  hideVoiceCorrectBar();
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const inp=document.getElementById('text-input'); if(inp) inp.value='';
  setMicState('recording');
  try{
    const tokenRes=await fetch('/api/realtime/session',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        section:currentMealSection||null,
        foods:realtimeFoodContext()
      })
    });
    const tokenData=await tokenRes.json().catch(()=>({}));
    if(!tokenRes.ok) throw new Error(tokenData.error||'Realtime session failed');
    const secret=realtimeClientSecret(tokenData);
    if(!secret) throw new Error('Realtime client secret missing');

    const pc=new RTCPeerConnection();
    const dc=pc.createDataChannel('oai-events');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getAudioTracks().forEach(track=>pc.addTrack(track,stream));
    const audio=document.createElement('audio');
    audio.autoplay=true;
    pc.ontrack=e=>{audio.srcObject=e.streams[0];};
    sousRealtime={active:true,pc,dc,stream,audio,textBuffer:'',idleTimer:null};
    dc.addEventListener('open',()=>{
      console.log('[Sous Realtime] connected');
      isRecording=true;
      setMicState('recording');
      speakCachedResponse('realtime_ready');
      clearTimeout(sousRealtime.idleTimer);
      sousRealtime.idleTimer=setTimeout(()=>stopSousRealtimeVoice(true),60000);
    });
    dc.addEventListener('message',e=>{
      try{handleRealtimeServerEvent(JSON.parse(e.data));}
      catch(err){console.log('[Sous Realtime] error', err.message);}
    });
    pc.addEventListener('connectionstatechange',()=>{
      if(['failed','disconnected','closed'].includes(pc.connectionState)) stopSousRealtimeVoice(false);
    });

    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes=await fetch('https://api.openai.com/v1/realtime/calls',{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+secret,
        'Content-Type':'application/sdp'
      },
      body:offer.sdp
    });
    if(!sdpRes.ok) throw new Error('Realtime connection failed');
    await pc.setRemoteDescription({type:'answer',sdp:await sdpRes.text()});
  }catch(e){
    console.log('[Sous Realtime] error', e.message);
    stopSousRealtimeVoice(false);
    speakCachedResponse('realtime_error',{},()=>setTimeout(startTapRec,200));
  }
}
function stopSousRealtimeVoice(announce=false){
  if(!sousRealtime) return;
  const rt=sousRealtime;
  sousRealtime=null;
  clearTimeout(rt.idleTimer);
  try{rt.dc&&rt.dc.close();}catch(e){}
  try{rt.pc&&rt.pc.close();}catch(e){}
  try{rt.stream&&rt.stream.getTracks().forEach(track=>track.stop());}catch(e){}
  if(rt.audio) rt.audio.srcObject=null;
  isRecording=false;
  if(!isSpeaking) setMicState(alwaysOnActive?'listening':'idle');
  if(announce) speakCachedResponse('realtime_stopped');
}
function startTapRec(){
  if(!SR){showToast('Speech not supported — use text input');return;}
  if(!tapRec) tapRec=buildTapRec();
  hideVoiceCorrectBar();
  if(isRecording){try{tapRec.stop();}catch(e){}return;}
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const inp=document.getElementById('text-input'); if(inp) inp.value='';
  try{tapRec.start();}catch(e){tapRec=buildTapRec();try{tapRec.start();}catch(e2){}}
}
function startClarificationListen(onResult){
  if(!SR) return;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  r.onstart=()=>setMicState('recording');
  r.onresult=e=>{const t=e.results[0][0].transcript;const el=document.getElementById('transcript-text');if(el)el.textContent='"'+t+'"';setMicState('idle');onResult(t);};
  r.onerror=()=>setMicState('idle'); r.onend=()=>setMicState('idle');
  try{r.start();}catch(e){}
}
function buildAlwaysOn(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=true; r.maxAlternatives=1;
  r.onstart=()=>{alwaysOnActive=true;if(!isRecording&&!isSpeaking)setMicState('listening');};
  r.onresult=e=>{
    if(isRecording||isSpeaking) return;
    const t=e.results[e.results.length-1][0].transcript.toLowerCase().trim();
    const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+t+'"';
    if(/hey\s+s[uo][eu]/.test(t)){
      setMicState('wake');
      setTimeout(()=>{try{r.stop();}catch(e){}alwaysOnActive=false;if(!tapRec)tapRec=buildTapRec();try{tapRec.start();}catch(e){}},500);
      return;
    }
    const results=parseText(t);
    if(results&&results.length) handleParsed(results);
  };
  r.onerror=e=>{alwaysOnActive=false;if(e.error==='not-allowed')document.getElementById('perm-warn').style.display='block';else if(e.error!=='aborted'&&e.error!=='no-speech')setTimeout(restartAlwaysOn,1000);};
  r.onend=()=>{alwaysOnActive=false;if(!isRecording&&!isSpeaking)setTimeout(restartAlwaysOn,500);};
  return r;
}
function pauseAlwaysOn(){if(alwaysOnRec){try{alwaysOnRec.stop();}catch(e){}}alwaysOnActive=false;}
function restartAlwaysOn(){
  const active=document.querySelector('.log-screen.active');
  if(!active||active.id!=='ls-listening'||currentTab!=='log') return;
  if(isRecording||isSpeaking) return;
  if(!alwaysOnRec) alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();setMicState('listening');}catch(e){}
}
function startAlwaysOn(){
  if(!SR){document.getElementById('perm-warn').style.display='block';return;}
  alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();}catch(e){document.getElementById('perm-warn').style.display='block';}
}
function stopAllRec(){
  stopSousRealtimeVoice(false);
  try{if(tapRec)tapRec.stop();}catch(e){}
  try{if(alwaysOnRec)alwaysOnRec.stop();}catch(e){}
  isRecording=false;alwaysOnActive=false;
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  isSpeaking=false;
}

// ═══════════════════════════════════════════
// LOG ENTRY POINTS
// ═══════════════════════════════════════════
function startFreshLog(presetSection=null){
  const draft=typeof getDraft==='function'?getDraft():null;
  const draftItems=draft&&(Array.isArray(draft.meal)?draft.meal:(Array.isArray(draft.savedIngredients)?draft.savedIngredients:null));
  const hasDraft=Array.isArray(draftItems)&&draftItems.length>0;
  meal=[]; itemQueue=[]; pendingFood=null; currentAmbig=null; undoSnapshot=null; updateUndoBtn();
  currentMealSection=hasDraft?(draft.section||presetSection):presetSection;
  currentQuickMode=false; currentEditMealId=null; currentEditMealDate=null;
  if(hasDraft){
    draftItems.forEach(i=>meal.push({...i,id:i.id||nextIngId++}));
    if(meal.length) nextIngId=Math.max(...meal.map(i=>i.id||0))+1;
  }
  stopAllRec();
  showLogScreen('listening');
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const pw=document.getElementById('perm-warn'); if(pw) pw.style.display='none';
  if(hasDraft){
    showToast('Restored your in-progress meal',2800);
    speak('Picked up where you left off.',()=>setTimeout(startAlwaysOn,200));
  } else {
    speak('Ready.',()=>setTimeout(startAlwaysOn,200));
  }
}
function startSilentLog(presetSection=null,quick=false){
  meal=[];
  itemQueue=[];
  pendingFood=null;
  currentAmbig=null;
  undoSnapshot=null;
  updateUndoBtn();
  currentMealSection=presetSection;
  currentQuickMode=quick;

  stopAllRec();
  showLogScreen('listening');

  const el=document.getElementById('transcript-text');
  if(el) el.textContent='—';

  const pw=document.getElementById('perm-warn');
  if(pw) pw.style.display='none';

  setMicState('idle');
}
function resumeLog(){
  stopAllRec();
  const active=document.querySelector('.log-screen.active');
  if(!active||active.id==='ls-listening') setTimeout(restartAlwaysOn,400);
}

// ═══════════════════════════════════════════
// LOG BUTTON WIRING (done after DOM ready)
// ═══════════════════════════════════════════
function wireLogButtons(){
  document.getElementById('log-cancel-btn').addEventListener('click',()=>{currentEditMealId=null;currentEditMealDate=null;currentQuickMode=false;if(typeof clearDraft==='function')clearDraft();stopAllRec();setMicState('idle');switchTab('home');});
  document.getElementById('finished-meal-btn').addEventListener('click',()=>{if(!meal.length){showToast('Add some ingredients first!');return;}stopAllRec();showSummary();});
  document.getElementById('mic-btn').addEventListener('click',()=>{
    if(isSpeaking){window.speechSynthesis&&window.speechSynthesis.cancel();isSpeaking=false;}
    if(sousRealtime&&sousRealtime.active){finishSousRealtimeVoice();return;}
    if(isRecording){try{tapRec&&tapRec.stop();}catch(e){}}
    else if(realtimeVoiceEnabled()) startSousRealtimeVoice();
    else startTapRec();
  });
  document.getElementById('send-btn').addEventListener('click',submitText);
  document.getElementById('voice-retry-btn').addEventListener('click',()=>{hideVoiceCorrectBar();startTapRec();});
  // voice-create-food-btn onclick is set dynamically in showNoMatchFallback with the raw text closure
  document.getElementById('text-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitText();});
  document.getElementById('confirm-btn').addEventListener('click',doConfirm);
  document.getElementById('change-btn').addEventListener('click',doChange);
  document.getElementById('summary-btn-conf').addEventListener('click',()=>{if(meal.length){stopAllRec();showSummary();}else showToast('Add ingredients first!');});
  document.getElementById('ambig-custom').addEventListener('click',()=>{currentAmbig=null;openCustomEntry();});
  document.getElementById('ambig-skip').addEventListener('click',()=>{currentAmbig=null;showLogScreen('listening');setTimeout(restartAlwaysOn,400);});
  document.getElementById('mc-add-btn').addEventListener('click',commitMultiConfirm);
  document.getElementById('mc-cancel-btn').addEventListener('click',()=>{pendingBatch=[];showLogScreen('listening');setTimeout(restartAlwaysOn,400);});
  document.getElementById('add-custom-btn').addEventListener('click',()=>openCustomEntry());
  document.getElementById('add-more-btn').addEventListener('click',()=>openAddModal());
  document.getElementById('sum-section-select').addEventListener('change',e=>{currentMealSection=e.target.value;});
  document.getElementById('save-meal-btn').addEventListener('click',()=>{
    const saveAsUsual=!!document.getElementById('sum-save-usual')?.checked;
    saveMealToLog(saveAsUsual);
    showToast(saveAsUsual?'Meal logged and saved for quick add 🎉':'Meal logged 🎉',2500);
    currentQuickMode=false;
    setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);
  });
  // Add modal
  document.getElementById('modal-close-btn').addEventListener('click',closeAddModal);
  document.getElementById('add-modal').addEventListener('click',e=>{if(e.target===document.getElementById('add-modal'))closeAddModal();});
  document.getElementById('tab-search-btn').addEventListener('click',()=>switchModalTab('search'));
  document.getElementById('tab-custom-btn').addEventListener('click',()=>switchModalTab('custom'));
  document.getElementById('food-search').addEventListener('input',e=>renderFoodResults(e.target.value));
  document.getElementById('gram-input').addEventListener('input',updatePreviewMacros);
  document.getElementById('serving-unit-qty').addEventListener('input',updatePreviewMacros);
  document.getElementById('modal-add-btn').addEventListener('click',addManualIngredient);
  // Edit modal
  document.getElementById('undo-btn').addEventListener('click',undoLastAction);
  document.getElementById('edit-modal-close-btn').addEventListener('click',closeEditModal);
  document.getElementById('edit-modal').addEventListener('click',e=>{if(e.target===document.getElementById('edit-modal'))closeEditModal();});
  document.getElementById('edit-save-btn').addEventListener('click',saveEdit);
  document.getElementById('edit-delete-btn').addEventListener('click',()=>deleteIngredient(parseInt(document.getElementById('edit-ing-id').value)));
  document.getElementById('pill-raw').addEventListener('click',()=>{document.getElementById('pill-raw').className='toggle-pill active';document.getElementById('pill-cooked').className='toggle-pill inactive';});
  document.getElementById('pill-cooked').addEventListener('click',()=>{document.getElementById('pill-cooked').className='toggle-pill active';document.getElementById('pill-raw').className='toggle-pill inactive';});
  // Quantity prompt screen
  document.getElementById('qty-send-btn').addEventListener('click',()=>{
    const g=parseFloat(document.getElementById('qty-input').value);
    if(!g||g<=0){showToast('Enter an amount in grams');return;}
    commitQuantity(g);
  });
  document.getElementById('qty-input').addEventListener('keydown',e=>{if(e.key==='Enter'){const g=parseFloat(e.target.value);if(g&&g>0)commitQuantity(g);}});
  document.getElementById('qty-default-btn').addEventListener('click',()=>{
    if(!pendingFood) return;
    snapshotMeal(); meal.push(syncServingFromWeight({...pendingFood,id:nextIngId++})); _persistDraft();
    showToast('Added '+pendingFood.name+' ✓');
    pendingFood=null;
    showLogScreen('listening');
    renderCurrentMeal();
    processQueue();
  });
  document.getElementById('qty-usual-btn')?.addEventListener('click',commitUsualFromQuantityPrompt);
  // Confirm screen — live macro update when weight input changes
  document.getElementById('confirm-qty-input').addEventListener('input',e=>{
    const grams=parseFloat(e.target.value);
    if(!pendingFood||!pendingFood.rawFood||!grams||grams<=0) return;
    const food=pendingFood.rawFood,r=grams/food.w;
    document.getElementById('c-kcal').textContent=Math.round(food.kcal*r);
    document.getElementById('c-protein').textContent=Math.round(food.p*r*10)/10+'g';
    document.getElementById('c-carbs').textContent=Math.round(food.c*r*10)/10+'g';
    document.getElementById('c-fat').textContent=Math.round(food.f*r*10)/10+'g';
    document.getElementById('confirm-weight').textContent=Math.round(grams)+'g · raw';
  });
}
function submitText(){
  const inp=document.getElementById('text-input'),val=inp.value.trim();
  if(!val) return;
  hideVoiceCorrectBar();
  _voiceMode=false;
  const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+val+'"';
  inp.value=''; handleTranscript(val,val);
}
