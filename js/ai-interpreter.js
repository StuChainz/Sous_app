// ═══════════════════════════════════════════
// AI INTERPRETER ADAPTER
// ═══════════════════════════════════════════
// Experimental AI interpreter adapter.
// The local parser remains the primary meal interpretation path; this AI layer
// is secondary and must never save meals, mutate the active meal, or bypass review.
// app.js remains responsible for confirmation, conversion, and saving.

// Default to the local proxy. Set window.SOUS_AI_CONFIG.endpoint to call OpenAI directly (requires CORS support).
const DEFAULT_AI_ENDPOINT=typeof window!=='undefined'&&typeof window.sousApiUrl==='function'
  ? window.sousApiUrl('/api/interpret')
  : '/api/interpret';
const DEFAULT_AI_ACTION_ENDPOINT=typeof window!=='undefined'&&typeof window.sousApiUrl==='function'
  ? window.sousApiUrl('/api/interpret-action')
  : '/api/interpret-action';
const DEFAULT_AI_REPAIR_ENDPOINT=typeof window!=='undefined'&&typeof window.sousApiUrl==='function'
  ? window.sousApiUrl('/api/repair-transcript')
  : '/api/repair-transcript';
const DEFAULT_AI_MODEL='gpt-4.1-mini';
const AI_ACTION_TYPES=new Set(['add_food','replace_food','remove_food','change_quantity','repeat_meal','modify_meal_copy','add_usual_meal','clarify','none']);
const AI_ACTION_CHANGE_OPS=new Set(['replace','remove','scale','set_quantity','add']);

function fallbackCreateIngredientDraft(input={}){
  return {
    inputName:input.inputName||input.name||'',
    displayName:input.displayName||input.name||input.inputName||'',
    quantity:input.quantity!=null?input.quantity:1,
    unit:input.unit||'g'
  };
}

function fallbackCreateMealDraft({section=null,source='ai',ingredients=[],needsConfirmation=true,questions=[]}={}){
  return {
    section,
    source,
    createdAt:Date.now(),
    ingredients:ingredients.map(fallbackCreateIngredientDraft),
    needsConfirmation,
    questions
  };
}

function getAIInterpreterConfig(){
  let stored={};
  try{
    if(typeof localStorage!=='undefined') stored=JSON.parse(localStorage.getItem('sous_ai_config')||'{}')||{};
  }catch(e){stored={};}
  const globalConfig=typeof window!=='undefined'?(window.SOUS_AI_CONFIG||{}):{};
  const globalKey=typeof window!=='undefined'?window.SOUS_OPENAI_API_KEY:null;
  return {
    endpoint:globalConfig.endpoint||stored.endpoint||DEFAULT_AI_ENDPOINT,
    actionEndpoint:globalConfig.actionEndpoint||stored.actionEndpoint||DEFAULT_AI_ACTION_ENDPOINT,
    repairEndpoint:globalConfig.repairEndpoint||stored.repairEndpoint||DEFAULT_AI_REPAIR_ENDPOINT,
    apiKey:globalConfig.apiKey||stored.apiKey||globalKey||null,
    model:globalConfig.model||stored.model||DEFAULT_AI_MODEL
  };
}

function sanitizeTranscriptRepairCandidates(input){
  const raw=Array.isArray(input?.candidates)?input.candidates:[];
  const seen=new Set();
  return raw.map(candidate=>({
    transcript:String(candidate?.transcript||'').replace(/\s+/g,' ').trim(),
    score:Number(candidate?.score),
    reason:String(candidate?.reason||'').slice(0,160)
  })).filter(candidate=>{
    if(!candidate.transcript) return false;
    const key=candidate.transcript.toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,3).map(candidate=>({
    transcript:candidate.transcript,
    score:Number.isFinite(candidate.score)?Math.max(0,Math.min(1,candidate.score)):0,
    reason:candidate.reason
  }));
}

async function repairTranscriptWithAI({transcript='',alternatives=[],recentIngredients=[],foodHints=[],screenContext='normal_logging'}={}){
  const cleanTranscript=String(transcript||'').trim();
  if(!cleanTranscript) return [];
  const config=getAIInterpreterConfig();
  const endpoint=config.repairEndpoint||DEFAULT_AI_REPAIR_ENDPOINT;
  const isProxy=endpoint.startsWith('/')||endpoint.includes('/api/repair-transcript');
  if(!isProxy&&!config.apiKey) return [];
  try{
    const hasExplicitRepairEndpoint=typeof window!=='undefined'&&!!window.SOUS_AI_CONFIG?.repairEndpoint;
    if(isProxy&&typeof localStorage!=='undefined'&&localStorage.getItem('sous_voice_test_harness')==='1'&&!hasExplicitRepairEndpoint) return [];
  }catch(e){}

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),1000);
  try{
    const headers={'Content-Type':'application/json'};
    if(!isProxy&&config.apiKey) headers.Authorization=`Bearer ${config.apiKey}`;
    const res=await fetch(endpoint,{
      method:'POST',
      signal:controller.signal,
      headers,
      body:JSON.stringify({transcript:cleanTranscript,alternatives,recentIngredients,foodHints,screenContext})
    });
    if(!res.ok) return [];
    return sanitizeTranscriptRepairCandidates(await res.json());
  }catch(e){
    return [];
  }finally{
    clearTimeout(timeout);
  }
}

function aiActionReferenceTrigger(transcript){
  const s=String(transcript||'').toLowerCase();
  if(/\b(same|usual|regular|yesterday|last time|normally|instead of|swap|replace|change|make that|make it|usually have|normally have|the one i usually|the one i normally)\b/.test(s)) return true;
  return /\b(half|halve|double)\b.*\b(that|it|last|current|yesterday|lunch|breakfast|dinner|snack|meal|from)\b/.test(s);
}

function cloneAIContextIngredient(item,index,prefix){
  if(!item) return null;
  return {
    ref:prefix+':item:'+index,
    name:String(item.name||'').trim(),
    weight:item.weight!=null?Math.round(Number(item.weight)||0):null,
    serving:item.serving?{
      label:item.serving.label||null,
      quantity:item.serving.quantity??null,
      grams:item.serving.grams??null
    }:null
  };
}

function isoDateOffset(days){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

function buildAIActionContext({section=null}={}){
  const context={
    currentSection:section||null,
    today:isoDateOffset(0),
    yesterday:isoDateOffset(-1),
    currentMeal:[],
    historyMeals:[],
    usualMeals:[],
    recentIngredients:[]
  };

  try{
    if(Array.isArray(window.meal||meal)){
      const active=window.meal||meal;
      context.currentMeal=active.map((item,index)=>cloneAIContextIngredient(item,index,'current')).filter(Boolean);
    }
  }catch(e){}

  try{
    const log=typeof getLog==='function'?getLog():{};
    Object.keys(log||{}).sort().reverse().slice(0,14).forEach(date=>{
      const meals=Array.isArray(log[date]?.meals)?log[date].meals:[];
      meals.forEach((mealObj,index)=>{
        const ref='history:'+date+':'+index;
        context.historyMeals.push({
          ref,
          date,
          section:mealObj.section||null,
          name:mealObj.name||'Meal',
          ingredients:(mealObj.ingredients||[]).map((item,itemIndex)=>cloneAIContextIngredient(item,itemIndex,ref)).filter(Boolean)
        });
      });
    });
    context.historyMeals=context.historyMeals.slice(0,24);
  }catch(e){}

  try{
    const usuals=typeof getUsualMeals==='function'?getUsualMeals():{};
    Object.keys(usuals||{}).forEach(sectionKey=>{
      const list=Array.isArray(usuals[sectionKey])?usuals[sectionKey]:[];
      list.forEach((usual,index)=>{
        const ref='usual:'+sectionKey+':'+index;
        context.usualMeals.push({
          ref,
          section:usual.section||sectionKey,
          name:usual.name||'Usual meal',
          useCount:usual.useCount||0,
          ingredients:(usual.ingredients||[]).map((item,itemIndex)=>cloneAIContextIngredient(item,itemIndex,ref)).filter(Boolean)
        });
      });
    });
  }catch(e){}

  try{
    context.recentIngredients=(typeof getRecentIngredients==='function'?getRecentIngredients():[])
      .slice(0,20)
      .map(item=>({name:item.name||'',weight:item.weight??null}));
  }catch(e){}

  return context;
}

function sanitizeAIAction(action){
  if(!action||typeof action!=='object'||!AI_ACTION_TYPES.has(action.type)) return null;
  const clean={
    type:action.type,
    confidence:['low','medium','high'].includes(action.confidence)?action.confidence:'low',
    message:action.message==null?null:String(action.message).slice(0,160),
    food:action.food==null?null:String(action.food).trim(),
    targetFood:action.targetFood==null?null:String(action.targetFood).trim(),
    replacementFood:action.replacementFood==null?null:String(action.replacementFood).trim(),
    quantityText:action.quantityText==null?null:String(action.quantityText).trim(),
    factor:Number.isFinite(Number(action.factor))?Number(action.factor):null,
    section:action.section==null?null:String(action.section).trim(),
    usualRef:action.usualRef==null?null:String(action.usualRef).trim(),
    source:action.source&&typeof action.source==='object'?{...action.source}:null,
    target:action.target&&typeof action.target==='object'?{...action.target}:null,
    changes:Array.isArray(action.changes)?action.changes.filter(change=>change&&AI_ACTION_CHANGE_OPS.has(change.op)).map(change=>({
      op:change.op,
      targetRef:change.targetRef==null?null:String(change.targetRef).trim(),
      from:change.from==null?null:String(change.from).trim(),
      to:change.to==null?null:String(change.to).trim(),
      food:change.food==null?null:String(change.food).trim(),
      quantityText:change.quantityText==null?null:String(change.quantityText).trim(),
      factor:Number.isFinite(Number(change.factor))?Number(change.factor):null
    })):[]
  };
  return clean;
}

async function interpretMealActionWithAI({transcript='',section=null,countryCode=null}={}){
  const cleanTranscript=String(transcript||'').trim();
  if(!cleanTranscript||!aiActionReferenceTrigger(cleanTranscript)) return null;
  const config=getAIInterpreterConfig();
  const endpoint=config.actionEndpoint||DEFAULT_AI_ACTION_ENDPOINT;
  const isProxy=endpoint.startsWith('/')||endpoint.includes('/api/interpret-action');
  if(!isProxy&&!config.apiKey) return null;
  const context=buildAIActionContext({section});

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const headers={'Content-Type':'application/json'};
    if(!isProxy&&config.apiKey) headers['Authorization']=`Bearer ${config.apiKey}`;
    const res=await fetch(endpoint,{
      method:'POST',
      signal:controller.signal,
      headers,
      body:JSON.stringify({transcript:cleanTranscript,section,countryCode,context})
    });
    if(!res.ok) return null;
    return sanitizeAIAction(await res.json());
  }catch(e){
    return null;
  }finally{
    clearTimeout(timeout);
  }
}

function emptyAIDraft(section,makeMealDraft){
  return makeMealDraft({
    section,
    source:'ai',
    ingredients:[],
    needsConfirmation:true,
    questions:[]
  });
}

function safeParseAIJSON(text){
  if(!text||typeof text!=='string') return null;
  try{return JSON.parse(text);}
  catch(e){}
  const start=text.indexOf('{');
  const end=text.lastIndexOf('}');
  if(start===-1||end===-1||end<=start) return null;
  try{return JSON.parse(text.slice(start,end+1));}
  catch(e){return null;}
}

function extractAIResponseText(data){
  if(!data) return '';
  if(typeof data.output_text==='string') return data.output_text;
  if(Array.isArray(data.output)){
    return data.output.flatMap(item=>Array.isArray(item.content)?item.content:[])
      .map(part=>part.text||part.output_text||'')
      .filter(Boolean)
      .join('\n');
  }
  return data.choices?.[0]?.message?.content||data.choices?.[0]?.text||'';
}

function normalizeAIIngredients(ingredients,makeIngredientDraft){
  if(!Array.isArray(ingredients)) return [];
  return ingredients.map(item=>{
    const name=String(item?.name||item?.inputName||item?.displayName||'').trim();
    if(!name) return null;
    const quantity=Number(item?.quantity);
    const unit=String(item?.unit||'').trim()||'g';
    return makeIngredientDraft({
      inputName:name,
      displayName:name,
      quantity:Number.isFinite(quantity)?quantity:1,
      unit,
      confidence:'ai'
    });
  }).filter(Boolean);
}

async function interpretMealWithAI({transcript='',section=null,countryCode=null,context=null}={}){
  void context;
  const makeMealDraft=typeof createMealDraft==='function'?createMealDraft:fallbackCreateMealDraft;
  const makeIngredientDraft=typeof createIngredientDraft==='function'?createIngredientDraft:fallbackCreateIngredientDraft;
  const cleanTranscript=String(transcript||'').trim();
  if(!cleanTranscript) return emptyAIDraft(section,makeMealDraft);

  const config=getAIInterpreterConfig();

  // Only require an API key when calling OpenAI directly (absolute URL).
  // The local proxy (/api/interpret) holds the key server-side.
  const isProxy=config.endpoint.startsWith('/')||config.endpoint.includes('/api/interpret');
  if(!isProxy&&!config.apiKey) return emptyAIDraft(section,makeMealDraft);

  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    let res;
    try{
      const headers={'Content-Type':'application/json'};
      if(!isProxy&&config.apiKey) headers['Authorization']=`Bearer ${config.apiKey}`;
      res=await fetch(config.endpoint,{
        method:'POST',
        signal:controller.signal,
        headers,
        body:JSON.stringify({transcript:cleanTranscript,section,countryCode})
      });
    }finally{
      clearTimeout(timeout);
    }
    if(!res.ok) return emptyAIDraft(section,makeMealDraft);

    const parsed=await res.json();
    if(!parsed||!Array.isArray(parsed.ingredients)) return emptyAIDraft(section,makeMealDraft);

    return makeMealDraft({
      section:parsed.section||section,
      source:'ai',
      ingredients:normalizeAIIngredients(parsed.ingredients,makeIngredientDraft),
      needsConfirmation:true,
      questions:[]
    });
  }catch(e){
    return emptyAIDraft(section,makeMealDraft);
  }
}

if(typeof window!=='undefined'){
  window.repairTranscriptWithAI=repairTranscriptWithAI;
  window.interpretMealWithAI=interpretMealWithAI;
  window.interpretMealActionWithAI=interpretMealActionWithAI;
  window.buildAIActionContext=buildAIActionContext;
  window.aiActionReferenceTrigger=aiActionReferenceTrigger;
}
if(typeof module!=='undefined') module.exports={repairTranscriptWithAI,interpretMealWithAI,interpretMealActionWithAI,buildAIActionContext,aiActionReferenceTrigger,sanitizeAIAction};
