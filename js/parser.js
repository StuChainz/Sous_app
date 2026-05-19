// ═══════════════════════════════════════════
// FOOD PARSER
// ═══════════════════════════════════════════
const UNIT_TO_GRAMS={
  g:1,kg:1000,ml:1,l:1000,oz:28.35,tbsp:15,tsp:5,cup:240
};
const UNIT_PATTERN='g\\b|kg\\b|ml\\b|l\\b|oz\\b|tbsp\\b|tsp\\b|cups?\\b';
const COUNT_UNIT_PATTERN='pieces?|slices?|servings?|portions?|cans?|tins?|scoops?|rashers?|fillets?|breasts?|eggs?|wraps?|rolls?|pots?|biscuits?|crumpets?|muffins?';
const SPOKEN_NUMBERS={
  a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,couple:2
};
const NATURAL_QUANTITY_UNITS={
  handful:{solid:30,liquid:30},
  splash:{solid:10,liquid:15},
  drizzle:{solid:10,liquid:10},
  pinch:{solid:1,liquid:1},
  knob:{solid:10,liquid:10},
  pat:{solid:10,liquid:10}
};
function normalizeUnit(unit){
  return String(unit||'g').toLowerCase().replace(/s$/,'');
}
function normalizeCountUnit(unit){
  const u=String(unit||'').toLowerCase().trim().replace(/s$/,'');
  if(u==='rasher') return 'rasher';
  if(u==='fillet') return 'fillet';
  if(u==='breast') return 'breast';
  if(u==='egg') return 'egg';
  if(u==='wrap') return 'wrap';
  if(u==='roll') return 'roll';
  if(u==='pot') return 'pot';
  if(u==='biscuit') return 'biscuit';
  if(u==='crumpet') return 'crumpet';
  if(u==='muffin') return 'muffin';
  if(u==='scoop') return 'scoop';
  if(u==='slice') return 'slice';
  if(u==='can') return 'tin';
  if(u==='serving'||u==='portion'||u==='piece') return u;
  return u;
}
function parseSpokenNumber(value){
  const s=String(value||'').toLowerCase().trim();
  if(!s) return null;
  if(/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
  if(Object.prototype.hasOwnProperty.call(SPOKEN_NUMBERS,s)) return SPOKEN_NUMBERS[s];
  return null;
}
function normaliseLogText(text){
  return String(text||'')
    .toLowerCase()
    .replace(/[""]/g,'"')
    .replace(/['']/g,"'")
    .replace(/\bbrocoli\b/g,'broccoli')
    .replace(/\bcals\b/g,'calories')
    .replace(/\bkcals\b/g,'calories')
    .replace(/\bcal\b/g,'calories')
    .replace(/\bgrams\b/g,'g')
    .replace(/\bgram\b/g,'g')
    .replace(/\bkilograms\b/g,'kg')
    .replace(/\bkilogram\b/g,'kg')
    .replace(/\bounces\b/g,'oz')
    .replace(/\bounce\b/g,'oz')
    .replace(/\bmillilitres\b/g,'ml')
    .replace(/\bmilliliters\b/g,'ml')
    .replace(/\bmillilitre\b/g,'ml')
    .replace(/\bmilliliter\b/g,'ml')
    .replace(/\blitres\b/g,'l')
    .replace(/\bliters\b/g,'l')
    .replace(/\blitre\b/g,'l')
    .replace(/\bliter\b/g,'l')
    .replace(/\btablespoons\b/g,'tbsp')
    .replace(/\btablespoon\b/g,'tbsp')
    .replace(/\bteaspoons\b/g,'tsp')
    .replace(/\bteaspoon\b/g,'tsp')
    .replace(/\band\s+also\b/g,'and')
    .trim();
}
function parseAmount(text){
  text=normaliseLogText(text);
  const m=text.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+UNIT_PATTERN+')?','i'));
  if(!m) return null;
  const num=parseFloat(m[1]),unit=normalizeUnit(m[2]);
  return num*(UNIT_TO_GRAMS[unit]||1);
}
function findServingUnit(food,label){
  if(!food||!label||!Array.isArray(food.units)) return null;
  const wanted=normalizeCountUnit(label);
  return food.units.find(unit=>normalizeCountUnit(unit.label)===wanted)||null;
}
function quantityToGramsForFood(qty,food){
  if(!qty) return null;
  if(qty.grams!=null) return qty.grams;
  if(qty.multiplier!=null) return food?Math.round((food.w||100)*qty.multiplier):null;
  if(qty.naturalUnit){
    const unit=NATURAL_QUANTITY_UNITS[qty.naturalUnit];
    if(!unit) return null;
    const size=String(qty.size||'').toLowerCase();
    let grams=food?.type==='liquid'?unit.liquid:unit.solid;
    if(size==='small') grams*=0.7;
    if(size==='large'||size==='big') grams*=1.5;
    return Math.max(1,Math.round(grams*(qty.count||1)));
  }
  if(qty.count!=null){
    const serving=findServingUnit(food,qty.unit);
    if(serving&&serving.grams) return Math.round(Number(serving.grams)*qty.count);
    return food?Math.round((food.w||100)*qty.count):null;
  }
  return null;
}
// Structured quantity extraction for parseSingleSegment.
// Returns one of:
//   {grams: N}       explicit weight/volume — "100g", "1 tbsp", "tablespoon"
//   {count: N, unit}  count/serving unit     — "2 eggs", "two slices"
//   {multiplier: M}  relative word          — "half"    (caller scales by food.w)
//   null             no quantity found
function extractQuantity(seg){
  const s=normaliseLogText(seg);
  const numberPattern='\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple';
  // "one and a half cups milk"
  let m=s.match(new RegExp('\\b('+numberPattern+')\\s+and\\s+a\\s+half\\s*('+UNIT_PATTERN+')','i'));
  if(m){const num=parseSpokenNumber(m[1]);const unit=normalizeUnit(m[2]);if(num!=null)return{grams:(num+0.5)*(UNIT_TO_GRAMS[unit]||1)};}
  // "half a cup milk" / "quarter cup oats" → explicit fraction of a unit
  m=s.match(new RegExp('\\b(half|quarter)\\s+(?:a\\s+|an\\s+)?('+UNIT_PATTERN+')','i'));
  if(m){const unit=normalizeUnit(m[2]);return{grams:(m[1].toLowerCase()==='half'?0.5:0.25)*(UNIT_TO_GRAMS[unit]||1)};}
  // "half [food]" → half the food's default serving
  if(/\bhalf\b/i.test(s)) return{multiplier:0.5};
  if(/\bquarter\b/i.test(s)) return{multiplier:0.25};
  // Number + explicit unit → grams
  m=s.match(new RegExp('\\b('+numberPattern+')\\s*('+UNIT_PATTERN+')','i'));
  if(m){const num=parseSpokenNumber(m[1]);const unit=normalizeUnit(m[2]);if(num!=null)return{grams:num*(UNIT_TO_GRAMS[unit]||1)};}
  // Number + count word → count ("1 slice bread"); caller scales by food.w
  m=s.match(new RegExp('\\b('+numberPattern+')\\s*(?:of\\s+)?('+COUNT_UNIT_PATTERN+')\\b','i'));
  if(m){const num=parseSpokenNumber(m[1]);if(num!=null)return{count:num,unit:normalizeCountUnit(m[2])};}
  // "a handful of nuts", "small splash of milk"
  m=s.match(/\b(?:(small|large|big)\s+)?(?:a\s+|an\s+)?(handful|splash|drizzle|pinch|knob|pat)\b/i);
  if(m) return{naturalUnit:m[2].toLowerCase(),size:m[1]||null,count:1};
  // Unit alone, no leading number → implied 1 of that unit ("tablespoon olive oil")
  m=s.match(new RegExp('\\b('+UNIT_PATTERN+')','i'));
  if(m){const unit=normalizeUnit(m[1]);return{grams:UNIT_TO_GRAMS[unit]};}
  // Bare integer, no unit → count ("2 eggs"); caller scales by food.w
  m=s.match(new RegExp('\\b('+numberPattern+')\\b','i'));
  if(m){const num=parseSpokenNumber(m[1]);if(num!=null)return{count:num};}
  return null;
}
function foodScale(food,grams){
  const r=grams?grams/food.w:1;
  return{name:food.name,weight:grams?Math.round(grams):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round(food.fi*r*10)/10,icon:food.icon,type:food.type||'solid'};
}
function itemWeightLabel(item){
  if(!item) return '—';
  if(item.customMacro) return 'manual macro entry';
  const unit=item.type==='liquid'?'ml':'g';
  return (item.weight||0)+unit;
}
function parseMacroNumber(text,keys){
  const keyPattern=keys.join('|');
  let m=text.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:g\\s*)?(?:'+keyPattern+')\\b','i'));
  if(m) return parseFloat(m[1]);
  m=text.match(new RegExp('(?:'+keyPattern+')\\s*(?:of\\s*)?(\\d+(?:\\.\\d+)?)\\s*g?\\b','i'));
  return m?parseFloat(m[1]):null;
}
function parseCustomMacroEntry(seg){
  const s=normaliseLogText(seg);
  const macroText=s.replace(/\bfat\s+free\b/gi,'').replace(/\bfull\s+fat\b/gi,'');
  if(!/(calorie|protein|carb|fat)/i.test(macroText)) return null;
  if(!/(calorie|kcal|carb|fat|fibre|fiber)/i.test(macroText)&&/\b\d+(?:\.\d+)?\s*g\s+protein\b/i.test(macroText)){
    return null;
  }
  const kcal=parseMacroNumber(macroText,['calories','kcal']);
  const protein=parseMacroNumber(macroText,['protein','prot']);
  const carbs=parseMacroNumber(macroText,['carbs','carbohydrates','carb']);
  const fat=parseMacroNumber(macroText,['fat','fats']);
  const fibre=parseMacroNumber(macroText,['fibre','fiber']);
  if(kcal===null && protein===null && carbs===null && fat===null) return null;
  let name=s
    .replace(/^(hey\s+sous[,\s]*|hey\s+sue[,\s]*|add|log|track|i\s+had|i\s+ate|i\s+have)\s+/i,'')
    .replace(/\b\d+(?:\.\d+)?\s*(?:g\s*)?(?:calories|kcal|protein|prot|carbs|carbohydrates|carb|fat|fats|fibre|fiber)\b/gi,'')
    .replace(/\b(?:calories|kcal|protein|prot|carbs|carbohydrates|carb|fat|fats|fibre|fiber)\s*(?:of\s*)?\d+(?:\.\d+)?\s*g?\b/gi,'')
    .replace(/[,:;]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  name=name||'Manual entry';
  name=name.replace(/\b\w/g,c=>c.toUpperCase());
  return{
    name,
    weight:null,
    displayWeight:'manual macro entry',
    kcal:Math.round(kcal||0),
    protein:Math.round((protein||0)*10)/10,
    carbs:Math.round((carbs||0)*10)/10,
    fat:Math.round((fat||0)*10)/10,
    fibre:Math.round((fibre||0)*10)/10,
    icon:'ti-pencil',
    customMacro:true,
    confidence:'high',
    needsConfirm:false
  };
}

function getAllFoods(){
  const customs=typeof getCustomFoods==='function'?getCustomFoods():[];
  if(typeof getFoodMatchFoods==='function') return getFoodMatchFoods(null,true);
  return customs.length?[...customs,...FOODS]:FOODS;
}
function findFoodByText(text){
  if(typeof resolveIngredientLocally==='function'){
    const resolved=resolveIngredientLocally(text);
    return resolved.status==='matched'||resolved.status==='ambiguous'?resolved.food:null;
  }
  if(typeof matchFoodByText==='function') return matchFoodByText(text);
  const s=normaliseLogText(text||'');
  let bestFood=null,bestLen=0;
  for(const food of getAllFoods()){
    for(const kw of [...(food.kw||[]),food.name.toLowerCase()]){
      if(s.includes(kw)&&kw.length>bestLen){bestFood=food;bestLen=kw.length;}
    }
  }
  return bestFood;
}
function findMealIndexByText(text){
  const s=normaliseLogText(text||'');
  if(!meal.length) return -1;
  let best=-1,bestScore=0;
  meal.forEach((item,i)=>{
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    const names=[
      item.name,
      item.heardName,
      food?.name,
      ...(food?.aliases||[]),
      ...(food?.kw||[])
    ].map(n=>normaliseLogText(n||'')).filter(Boolean);
    let score=0;
    names.forEach((name,idx)=>{
      if(!name) return;
      let candidate=0;
      if(s===name) candidate=120+name.length;
      else if(s.includes(name)||name.includes(s)) candidate=80+Math.min(s.length,name.length);
      else {
        for(const part of name.split(/\s+/).filter(w=>w.length>2)) if(s.includes(part)) candidate+=part.length;
      }
      if(idx>1) candidate-=10;
      if(candidate>score) score=candidate;
    });
    if(score>bestScore){best=i;bestScore=score;}
  });
  return bestScore>0?best:-1;
}
function recalcMealItemFromFood(item,food,grams){
  const scaled=foodScale(food,grams||item.weight||food.w);
  Object.assign(item,scaled,{rawFood:food,customMacro:false,confidence:'high',needsConfirm:false});
  return item;
}
function gramsFromQuantityText(text,food){
  const qty=typeof extractQuantity==='function'?extractQuantity(text):null;
  if(typeof quantityToGramsForFood==='function'){
    const grams=quantityToGramsForFood(qty,food);
    if(grams!=null) return grams;
  }
  if(qty&&qty.grams!=null) return qty.grams;
  const m=String(text||'').match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return m?parseFloat(m[1]):null;
}
function cleanCorrectionTarget(text){
  return normaliseLogText(text||'')
    .replace(/^(?:the|that|this|my)\s+/,'')
    .replace(/\s+/g,' ')
    .trim();
}
function normaliseMealSectionWord(text){
  const s=String(text||'').toLowerCase().trim();
  if(s==='breakfast') return 'breakfast';
  if(s==='lunch') return 'lunch';
  if(s==='dinner'||s==='tea'||s==='supper') return 'dinner';
  if(s==='snack'||s==='snacks') return 'snacks';
  return null;
}
function parseUsualMealCommand(text){
  let s=normaliseLogText(text||'')
    .replace(/\bas\s+yesterday\b/g,'')
    .replace(/\bfrom\s+yesterday\b/g,'')
    .replace(/\s+/g,' ')
    .trim();
  let m=s.match(/^(?:add|log|track|use)?\s*(?:my\s+|the\s+)?(?:usual|regular|same)(?:\s+meal)?(?:\s+(.+))?$/);
  if(!m) return null;
  let query=String(m[1]||'').trim();
  query=query.replace(/^(?:for\s+)?(?:my\s+|the\s+)?/,'').replace(/\bmeal\b/g,'').trim();
  const section=normaliseMealSectionWord(query);
  return {command:'addUsualMeal',section,query:section?'':query};
}
function usualMealSearchText(usual){
  return [
    usual?.name,
    usual?.section,
    ...(usual?.ingredients||[]).map(i=>i.name)
  ].filter(Boolean).join(' ');
}
function findUsualMealByCommand(cmd){
  if(typeof getUsualMeals!=='function') return null;
  const usuals=getUsualMeals()||{};
  const sections=cmd.section?[cmd.section]:Object.keys(usuals);
  const query=normaliseLogText(cmd.query||'').trim();
  let best=null,bestScore=0;
  for(const section of sections){
    const list=Array.isArray(usuals[section])?usuals[section]:[];
    list.forEach((u,index)=>{
      let score=0;
      if(cmd.section&&!query) score=1000-index;
      if(query){
        const name=normaliseLogText(u.name||'');
        const haystack=normaliseLogText(usualMealSearchText(u));
        if(name===query) score=900;
        else if(name.includes(query)) score=700+query.length;
        else if(haystack.includes(query)) score=500+query.length;
        else {
          const tokens=query.split(/\s+/).filter(t=>t.length>2);
          score=tokens.reduce((sum,t)=>sum+(haystack.includes(t)?t.length:0),0);
        }
      }
      if(score>bestScore){best={...u,section:u.section||section};bestScore=score;}
    });
  }
  return bestScore>0?best:null;
}
function addUsualMealToCurrent(usual){
  if(!usual||!Array.isArray(usual.ingredients)||!usual.ingredients.length) return false;
  if(typeof addMealToCurrent==='function'){
    addMealToCurrent(usual);
  } else {
    usual.ingredients.forEach((ing,i)=>meal.push({...ing,id:typeof nextIngId!=='undefined'?nextIngId++:Date.now()+i}));
    if(typeof currentMealSection!=='undefined') currentMealSection=usual.section||currentMealSection;
  }
  return true;
}
function resolveReplacementFood(text){
  if(typeof resolveIngredientLocally==='function'){
    const resolved=resolveIngredientLocally(text);
    if(resolved.status==='matched') return {food:resolved.food};
    if(resolved.status==='ambiguous') return {ambiguous:true,options:resolved.options||[],question:resolved.question};
    return {food:null};
  }
  return {food:findFoodByText(text)};
}
function parseCorrectionCommand(text){
  const s=normaliseLogText(text||'').replace(/[,.;:]+/g,' ').replace(/\s+/g,' ').trim();
  if(/^(undo|undo that|undo it|undo last|undo last item|remove last|delete last)$/.test(s)) return {command:'undo'};
  const usual=parseUsualMealCommand(s);
  if(usual) return usual;
  let m=s.match(/^(?:remove|delete)\s+(.+)$/);
  if(m) return {command:'remove',target:cleanCorrectionTarget(m[1])};
  m=s.match(/^(?:actually\s+)?(?:make|change|set|edit)\s+(?:that|it|last|last item)(?:\s+(?:to|as))?\s+(.+)$/);
  if(m&&extractQuantity(m[1])) return {command:'changeLastWeight',quantityText:m[1]};
  m=s.match(/^(?:actually\s+)?(?:that|it|last|last item)\s+(?:was|is|should be)\s+(.+)$/);
  if(m&&extractQuantity(m[1])) return {command:'changeLastWeight',quantityText:m[1]};
  m=s.match(/^(?:actually\s+)?(?:make|change|set|edit)\s+(.+?)\s+(?:to|as)\s+(.+)$/);
  if(m&&extractQuantity(m[2])) return {command:'changeWeight',target:cleanCorrectionTarget(m[1]),quantityText:m[2]};
  m=s.match(/^(?:swap|switch)\s+(.+?)\s+(?:for|to|with)\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[1]),replacement:m[2]};
  m=s.match(/^(?:replace)\s+(.+?)\s+(?:with|for)\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[1]),replacement:m[2]};
  m=s.match(/^(.+?)\s+instead\s+of\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[2]),replacement:m[1]};
  m=s.match(/^(?:use|make it|make that)\s+(.+?)\s+instead$/);
  if(m) return {command:'changeLastFood',replacement:m[1]};
  m=s.match(/^(?:no|nope|nah)\s+(.+)$/);
  if(m) return extractQuantity(m[1])
    ?{command:'changeLastWeight',quantityText:m[1]}
    :{command:'changeLastFood',replacement:m[1]};
  m=s.match(/^actually\s+(.+?)\s+not\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[2]),replacement:m[1],fallbackToLast:true};
  m=s.match(/^(?:change|edit|replace)\s+(.+?)\s+(?:to|as|with)\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[1]),replacement:m[2]};
  m=s.match(/^actually\s+(?:that\s+was|it\s+was|it's|its)\s+(.+)$/);
  if(m) return {command:'changeLastFood',replacement:m[1]};
  m=s.match(/^actually\s+(.+)$/);
  if(m) return extractQuantity(m[1])
    ?{command:'changeLastWeight',quantityText:m[1]}
    :{command:'changeLastFood',replacement:m[1]};
  m=s.match(/^(.+?)\s+not\s+(.+)$/);
  if(m) return {command:'changeFood',target:cleanCorrectionTarget(m[2]),replacement:m[1],fallbackToLast:true};
  return null;
}
function applyCorrectionCommand(cmd){
  if(!cmd) return false;
  if(cmd.command==='undo'){
    if(!meal.length){speak('Nothing to undo.');return true;}
    const removed=meal.pop();
    showToast(`Removed ${removed.name}`); speak(`Removed ${removed.name}.`); return true;
  }
  if(cmd.command==='remove'){
    const idx=findMealIndexByText(cmd.target);
    if(idx<0){speak("Couldn't find that item.");return true;}
    const removed=meal.splice(idx,1)[0];
    showToast(`Removed ${removed.name}`); speak(`Removed ${removed.name}.`); return true;
  }
  if(cmd.command==='changeWeight'){
    const idx=findMealIndexByText(cmd.target);
    if(idx<0){speak("Couldn't find that item.");return true;}
    const item=meal[idx];
    const food=item.rawFood||findFoodByText(item.name);
    const grams=cmd.grams!=null?cmd.grams:gramsFromQuantityText(cmd.quantityText,food);
    if(!grams){speak("I couldn't catch the amount.");return true;}
    if(food) recalcMealItemFromFood(item,food,grams);
    else { item.weight=Math.round(grams); }
    if(typeof syncServingFromWeight==='function') syncServingFromWeight(item);
    showToast(`Updated ${item.name} to ${Math.round(grams)}g`);
    speak(`Updated ${item.name} to ${Math.round(grams)} grams.`);
    return true;
  }
  if(cmd.command==='changeLastWeight'){
    const idx=meal.length-1;
    if(idx<0){speak("Nothing to update.");return true;}
    const item=meal[idx];
    const food=item.rawFood||findFoodByText(item.name);
    const grams=cmd.grams!=null?cmd.grams:gramsFromQuantityText(cmd.quantityText,food);
    if(!grams){speak("I couldn't catch the amount.");return true;}
    if(food) recalcMealItemFromFood(item,food,grams);
    else { item.weight=Math.round(grams); }
    if(typeof syncServingFromWeight==='function') syncServingFromWeight(item);
    showToast(`Updated ${item.name} to ${Math.round(grams)}g`);
    speak(`Updated ${item.name} to ${Math.round(grams)} grams.`);
    return true;
  }
  if(cmd.command==='changeFood'||cmd.command==='changeLastFood'){
    let idx=cmd.command==='changeLastFood'?meal.length-1:findMealIndexByText(cmd.target);
    if(idx<0&&cmd.fallbackToLast) idx=meal.length-1;
    if(idx<0){speak("Couldn't find that item.");return true;}
    const resolved=resolveReplacementFood(cmd.replacement);
    if(resolved.ambiguous){
      const names=(resolved.options||[]).map(f=>f.name).filter(Boolean).slice(0,3).join(', ');
      speak(names?`Which one did you mean: ${names}?`:"I need a clearer replacement.");
      return true;
    }
    const food=resolved.food;
    if(!food){speak("I couldn't match the replacement food.");return true;}
    const old=meal[idx];
    recalcMealItemFromFood(old,food,old.weight||food.w);
    showToast(`Changed to ${old.name}`);
    speak(`Changed to ${old.name}.`);
    return true;
  }
  if(cmd.command==='addUsualMeal'){
    const usual=findUsualMealByCommand(cmd);
    if(!usual){speak("I couldn't find that usual meal.");return true;}
    if(!addUsualMealToCurrent(usual)){speak("That usual meal doesn't have ingredients yet.");return true;}
    showToast(`Added ${usual.name}`);
    speak(`Added ${usual.name}.`);
    return true;
  }
  return false;
}
function refreshSummaryIfVisible(){
  const active=document.querySelector('.log-screen.active');
  if(active&&active.id==='ls-summary') showSummary(false);
}

// Strip verb/wake-word prefixes that can lead each segment.
function stripSegmentPrefix(s){
  return s
    .replace(/^(hey\s+sous[,\s]*|hey\s+sue[,\s]*|add|log|track|i\s+had|i\s+ate|i\s+have)\s+/i,'')
    .replace(/^(some|a|an)\s+/i,'')
    .trim();
}
// Remove filler words that carry no food meaning.
// "fat", "free", and "full" are intentionally absent — they must be preserved
// in food compounds like "fat free" and "full fat".
function cleanSegment(s){
  return s
    .replace(/\b(add|please|some|about|approximately|approx)\b\s*/gi,'')
    .replace(/\s+/g,' ')
    .trim();
}
// Split normalised text on spoken conjunctions and punctuation separators.
function splitOnSeparators(text){
  const numberPattern='\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple';
  return text
    .replace(new RegExp('\\b('+numberPattern+')\\s+and\\s+a\\s+half\\s+('+UNIT_PATTERN+')','gi'),'$1 __ANDAHALF__ $2')
    .replace(/\s*[,;]\s*/g,' and ')
    .replace(/\s*&\s*/g,' and ')
    .replace(/\s+plus\s+/g,' and ')
    .split(/\s+and\s+/i)
    .map(s=>s.replace(/__ANDAHALF__/g,'and a half').trim())
    .filter(Boolean);
}
// Split parts further where a new quantity begins mid-segment.
function splitOnNewQuantity(parts){
  const re=/(?=\b\d+(?:\.\d+)?\s*(?:g\b|kg\b|ml\b|l\b|tbsp\b|tsp\b|oz\b|cups?\b|calories\b|kcal\b))/i;
  return parts.flatMap(part=>{
    const chunks=part.split(re).map(s=>s.trim()).filter(Boolean);
    return chunks.length>1?chunks:[part];
  });
}
function splitIngredients(text){
  text=normaliseLogText(text);
  // 1. Split on separators → 2. strip prefixes → 3. remove fillers → 4. split on new quantities.
  const separated=splitOnSeparators(text).map(s=>cleanSegment(stripSegmentPrefix(s))).filter(s=>s.length>1);
  return splitOnNewQuantity(separated).filter(s=>s.length>1);
}
const PARSER_AMBIG=[
  {trigger:['greek yogurt','greek yoghurt'],
   options:['Greek yoghurt','Fat free Greek yoghurt','Full fat Greek yoghurt'],
   question:'Which Greek yoghurt — regular, fat free, or full fat?'},
];

function parseSingleSegment(seg){
  seg=cleanSegment(stripSegmentPrefix(normaliseLogText(seg)));

  const custom=parseCustomMacroEntry(seg);
  if(custom) return custom;

  const qty=extractQuantity(seg);
  const explicitGrams=qty&&qty.grams!=null?qty.grams:null;
  // Check ambiguous triggers (parser-level first, then food-data AMBIG)
  for(const ag of [...PARSER_AMBIG,...AMBIG]){
    for(const trig of ag.trigger){
      if(new RegExp('\\b'+trig+'\\b','i').test(seg)){
        const textMatch=typeof getFoodTextMatch==='function'?getFoodTextMatch(seg,{includeCustom:true}):null;
        const specificMatch=textMatch&&textMatch.key!==trig&&textMatch.key.length>trig.length;
        if(!specificMatch){
          const baseFoods=typeof getFoodMatchFoods==='function'?getFoodMatchFoods(null,false):FOODS;
          const options=baseFoods.filter(f=>ag.options.includes(f.name));
          const resolvedAmount=qty&&options[0]?quantityToGramsForFood(qty,options[0]):null;
          return{ambiguous:true,matches:options,amount:resolvedAmount!=null?resolvedAmount:100,label:trig,question:ag.question};
        }
      }
    }
  }
  const bestFood=findFoodByText(seg);
  if(!bestFood) return null;
  // Resolve grams: explicit weight → multiplier×food.w → count×food.w → food default
  let grams=explicitGrams;
  if(grams==null&&qty){
    grams=quantityToGramsForFood(qty,bestFood);
  }
  return{...foodScale(bestFood,grams),rawFood:bestFood,confidence:'high',needsConfirm:false,weightSpecified:grams!==null};
}
function parseText(text){
  text=normaliseLogText(text);
  const correction=parseCorrectionCommand(text);
  if(correction) return [correction];
  if(/show\s+(meal\s+)?summary|meal\s+summary|that.?s\s+(all|it)|done|finish|all\s+done/i.test(text)) return[{command:'summary'}];
  text=text.replace(/^hey\s+s[uo][eu][,\s]*/i,'').trim();
  const correctionAfterWake=parseCorrectionCommand(text);
  if(correctionAfterWake) return [correctionAfterWake];
  if(/show\s+(meal\s+)?summary|that.?s\s+(all|it)|done|finish/i.test(text)) return[{command:'summary'}];
  const results=[];
  for(const seg of splitIngredients(text)){
    if(seg.length<2) continue;
    const p=parseSingleSegment(seg);
    if(p) results.push(p);
  }
  return results;
}
function parseRecipeText(text){
  const lines=text.split(/\n/).map(l=>l.trim()).filter(l=>l.length>2);
  const ingredients=[];
  const steps=[];
  const stepPattern=/^(?:\d+[\.\):\s]|step\s+\d+|•|-|\*)\s*/i;
  const amountPattern=/\d+(?:[.,]\d+)?\s*(?:g|grams?|kg|kilograms?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cups?|medium|large|small|pieces?|slices?|cans?|tins?)/i;

  for(const line of lines){
    const cleanLine=line.replace(stepPattern,'').trim();
    if(stepPattern.test(line)){
      const hasFoodAmount=amountPattern.test(line);
      const parsed=parseSingleSegment(cleanLine);
      if(parsed&&!parsed.ambiguous&&hasFoodAmount){
        ingredients.push(parsed);
      } else {
        steps.push(cleanLine||line.replace(/^[\d\.\)\-\*•]+\s*/,''));
      }
    } else {
      const parsed=parseSingleSegment(line);
      if(parsed&&!parsed.ambiguous){
        ingredients.push(parsed);
      }
    }
  }

  const totals={kcal:0,protein:0,carbs:0,fat:0,fibre:0};
  for(const ing of ingredients){
    totals.kcal+=ing.kcal||0;
    totals.protein+=ing.protein||0;
    totals.carbs+=ing.carbs||0;
    totals.fat+=ing.fat||0;
    totals.fibre+=ing.fibre||0;
  }
  totals.kcal=Math.round(totals.kcal);
  totals.protein=Math.round(totals.protein*10)/10;
  totals.carbs=Math.round(totals.carbs*10)/10;
  totals.fat=Math.round(totals.fat*10)/10;
  totals.fibre=Math.round(totals.fibre*10)/10;
  return{ingredients,steps,totals};
}

// Returns true when the parser found no food items and AI should be tried.
// Commands (undo, summary, etc.) are not food items — they are never uncertain.
function parserIsUncertain(results){
  if(!results||!results.length) return true;
  if(results.some(r=>r&&r.command)) return false;
  return results.filter(r=>!r.command).length===0;
}

// ═══════════════════════════════════════════
// PARSER TEST HARNESS
// ═══════════════════════════════════════════
function runParserTests(){
  const cases=[
    '100g chicken breast and 50g broccoli',
    '100g chicken breast 50g broccoli',
    'add 10g fat free greek yogurt and add 5g full fat greek yogurt',
    '2 eggs and toast',
    'one slice of toast',
    'pb',
    'evoo',
    'zucchini',
    'tablespoon olive oil',
    'bread instead of rice',
    'swap white rice for brown rice',
    'replace chicken breast with chicken thigh',
    'actually chicken thigh not breast',
    'use olive oil instead',
    'my usual breakfast',
    'usual oats',
    'same lunch',
    'change chicken breast to chicken thigh',
    'remove broccoli',
  ];

  console.group('runParserTests');
  for(const input of cases){
    const results=parseText(input);
    console.group(`%c"${input}"`, 'color:#888;font-style:italic');
    for(const r of results){
      if(r.command){
        console.log('%cCOMMAND','color:#a78bfa;font-weight:bold', r);
      } else if(r.ambiguous){
        const opts=r.matches.map(f=>f.name).join(' / ');
        console.log('%cAMBIG  ','color:#f59e0b;font-weight:bold', `"${r.label}" → [${opts}]  amount:${r.amount}g`);
      } else if(r){
        console.log('%cMATCH  ','color:#4ade80;font-weight:bold',
          `${r.name}  ${r.weight}g  ${r.kcal}kcal  p:${r.protein}g  c:${r.carbs}g  f:${r.fat}g`);
      } else {
        console.log('%cNO MATCH','color:#f87171;font-weight:bold', '—');
      }
    }
    if(!results.length) console.log('%cNO MATCH','color:#f87171;font-weight:bold','(empty result)');
    console.groupEnd();
  }
  console.groupEnd();
}
