// ═══════════════════════════════════════════
// FOOD PARSER
// ═══════════════════════════════════════════
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
    .replace(/\btablespoons\b/g,'tbsp')
    .replace(/\btablespoon\b/g,'tbsp')
    .replace(/\bteaspoons\b/g,'tsp')
    .replace(/\bteaspoon\b/g,'tsp')
    .replace(/\band\s+also\b/g,'and')
    .trim();
}
function parseAmount(text){
  text=normaliseLogText(text);
  const m=text.match(/(\d+(?:\.\d+)?)\s*(g\b|kg\b|ml\b|litres?\b|oz\b|ounces?\b|tbsp\b|tsp\b|cups?\b)?/i);
  if(!m) return null;
  const num=parseFloat(m[1]),unit=(m[2]||'g').toLowerCase().replace(/s$/,'');
  const map={g:1,kg:1000,ml:1,litre:1000,oz:28.35,ounce:28.35,tbsp:15,tsp:5,cup:240};
  return num*(map[unit]||1);
}
// Structured quantity extraction for parseSingleSegment.
// Returns one of:
//   {grams: N}       explicit weight/volume — "100g", "1 tbsp", "tablespoon"
//   {count: N}       bare integer, no unit  — "2 eggs"  (caller scales by food.w)
//   {multiplier: M}  relative word          — "half"    (caller scales by food.w)
//   null             no quantity found
function extractQuantity(seg){
  const s=normaliseLogText(seg);
  const unitMap={g:1,kg:1000,ml:1,litre:1000,oz:28.35,ounce:28.35,tbsp:15,tsp:5,cup:240};
  // "half [food]" → half the food's default serving
  if(/\bhalf\b/i.test(s)) return{multiplier:0.5};
  // Number + explicit unit → grams
  let m=s.match(/(\d+(?:\.\d+)?)\s*(g\b|kg\b|ml\b|litres?\b|oz\b|ounces?\b|tbsp\b|tsp\b|cups?\b)/i);
  if(m){const unit=m[2].toLowerCase().replace(/s$/,'');return{grams:parseFloat(m[1])*(unitMap[unit]||1)};}
  // Unit alone, no leading number → implied 1 of that unit ("tablespoon olive oil")
  m=s.match(/\b(tbsp|tsp|cups?|oz|ml)\b/i);
  if(m){const unit=m[1].toLowerCase().replace(/s$/,'');return{grams:unitMap[unit]};}
  // Bare integer, no unit → count ("2 eggs"); caller scales by food.w
  m=s.match(/\b(\d+(?:\.\d+)?)\b/);
  if(m) return{count:parseFloat(m[1])};
  return null;
}
function foodScale(food,grams){
  const r=grams?grams/food.w:1;
  return{name:food.name,weight:grams?Math.round(grams):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round(food.fi*r*10)/10,icon:food.icon};
}
function itemWeightLabel(item){
  if(!item) return '—';
  if(item.customMacro) return 'manual macro entry';
  return (item.weight||0)+'g';
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

function findFoodByText(text){
  const s=normaliseLogText(text||'');
  let bestFood=null,bestLen=0;
  for(const food of FOODS){
    for(const kw of food.kw){
      if(s.includes(kw)&&kw.length>bestLen){bestFood=food;bestLen=kw.length;}
    }
    const name=food.name.toLowerCase();
    if(s.includes(name)&&name.length>bestLen){bestFood=food;bestLen=name.length;}
  }
  return bestFood;
}
function findMealIndexByText(text){
  const s=normaliseLogText(text||'');
  if(!meal.length) return -1;
  let best=-1,bestScore=0;
  meal.forEach((item,i)=>{
    const name=(item.name||'').toLowerCase();
    let score=0;
    if(s.includes(name)) score=name.length+20;
    else {
      for(const part of name.split(/\s+/).filter(w=>w.length>2)) if(s.includes(part)) score+=part.length;
    }
    if(score>bestScore){best=i;bestScore=score;}
  });
  return bestScore>0?best:-1;
}
function recalcMealItemFromFood(item,food,grams){
  const scaled=foodScale(food,grams||item.weight||food.w);
  Object.assign(item,scaled,{rawFood:food,customMacro:false,confidence:'high',needsConfirm:false});
  return item;
}
function parseCorrectionCommand(text){
  const s=normaliseLogText(text||'');
  if(/^(undo|undo last|undo last item|remove last|delete last)$/.test(s)) return {command:'undo'};
  let m=s.match(/^(?:remove|delete)\s+(.+)$/);
  if(m) return {command:'remove',target:m[1]};
  m=s.match(/^(?:change|make|set|edit)\s+(.+?)\s+(?:to|as)\s+(\d+(?:\.\d+)?)\s*g\b/);
  if(m) return {command:'changeWeight',target:m[1],grams:parseFloat(m[2])};
  m=s.match(/^(?:change|edit|replace)\s+(.+?)\s+(?:to|as|with)\s+(.+)$/);
  if(m) return {command:'changeFood',target:m[1],replacement:m[2]};
  m=s.match(/^actually\s+(?:that\s+was|it\s+was|it's|its)\s+(.+)$/);
  if(m) return {command:'changeLastFood',replacement:m[1]};
  m=s.match(/^(.+?)\s+not\s+(.+)$/);
  if(m) return {command:'changeLastFood',replacement:m[1]};
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
    if(food) recalcMealItemFromFood(item,food,cmd.grams);
    else { item.weight=Math.round(cmd.grams); }
    showToast(`Updated ${item.name} to ${Math.round(cmd.grams)}g`);
    speak(`Updated ${item.name} to ${Math.round(cmd.grams)} grams.`);
    return true;
  }
  if(cmd.command==='changeFood'||cmd.command==='changeLastFood'){
    const idx=cmd.command==='changeLastFood'?meal.length-1:findMealIndexByText(cmd.target);
    if(idx<0){speak("Couldn't find that item.");return true;}
    const food=findFoodByText(cmd.replacement);
    if(!food){speak("I couldn't match the replacement food.");return true;}
    const old=meal[idx];
    recalcMealItemFromFood(old,food,old.weight||food.w);
    showToast(`Changed to ${old.name}`);
    speak(`Changed to ${old.name}.`);
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
  return text
    .replace(/\s*[,;]\s*/g,' and ')
    .replace(/\s*&\s*/g,' and ')
    .replace(/\s+plus\s+/g,' and ')
    .split(/\s+and\s+/i)
    .map(s=>s.trim())
    .filter(Boolean);
}
// Split parts further where a new quantity begins mid-segment.
function splitOnNewQuantity(parts){
  const re=/(?=\b\d+(?:\.\d+)?\s*(?:g\b|kg\b|ml\b|tbsp\b|tsp\b|oz\b|cups?\b|calories\b|kcal\b))/i;
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
        const specificMatch=FOODS.find(f=>f.kw.some(kw=>kw!==trig&&kw.length>trig.length&&seg.includes(kw)));
        if(!specificMatch){
          const options=FOODS.filter(f=>ag.options.includes(f.name));
          return{ambiguous:true,matches:options,amount:explicitGrams||100,label:trig,question:ag.question};
        }
      }
    }
  }
  // Longest keyword match
  let bestFood=null,bestLen=0;
  for(const food of FOODS){
    for(const kw of food.kw){
      if(seg.includes(kw)&&kw.length>bestLen){bestFood=food;bestLen=kw.length;}
    }
  }
  if(!bestFood) return null;
  // Resolve grams: explicit weight → multiplier×food.w → count×food.w → food default
  let grams=explicitGrams;
  if(grams==null&&qty){
    if(qty.multiplier!=null) grams=Math.round(bestFood.w*qty.multiplier);
    else if(qty.count!=null)  grams=Math.round(bestFood.w*qty.count);
  }
  return{...foodScale(bestFood,grams),rawFood:bestFood,confidence:'high',needsConfirm:false};
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
  const amountPattern=/\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?|medium|large|small|piece|slice|can|tin)/i;

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

// ═══════════════════════════════════════════
// PARSER TEST HARNESS
// ═══════════════════════════════════════════
function runParserTests(){
  const cases=[
    '100g chicken breast and 50g broccoli',
    '100g chicken breast 50g broccoli',
    'add 10g fat free greek yogurt and add 5g full fat greek yogurt',
    '2 eggs and toast',
    'tablespoon olive oil',
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
