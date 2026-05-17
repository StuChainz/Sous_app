// ═══════════════════════════════════════════
// AI RESPONSE CACHE
// ═══════════════════════════════════════════
// Common app responses are plain text for now.
// Later, the same event keys can point to cached AI-generated audio.
// No API call is needed for repeated status phrases like saves or prompts.

const AI_RESPONSE_MAP={
  meal_saved:'Meal saved.',
  ingredient_added:'Added {ingredient}.',
  ask_quantity:'How much {ingredient}?',
  unknown_food:"I couldn't match {ingredient}.",
  confirm_food_match:'Did you mean {food}?',
  start_voice_log:'Ready to log {section}.',
  cancelled:'Cancelled.',
  logged:'Logged.',
  added:'Added.',
  saved_to_breakfast:'Saved to breakfast.',
  saved_to_lunch:'Saved to lunch.',
  saved_to_dinner:'Saved to dinner.',
  saved_to_snacks:'Saved to snacks.',
  saved_to_supplements:'Saved to supplements.',
  deleted:'Deleted.',
  undone:'Undone.',
  done:'Done.',
  got_it:'Got it.',
  realtime_ready:'Realtime ready.',
  realtime_stopped:'Realtime stopped.',
  realtime_error:'Realtime is unavailable. Using standard voice.',
  clarification_needed:'I need one more detail.'
};

const AI_RESPONSE_STATIC_BASE='assets/voice-cache/';
const AI_RESPONSE_RUNTIME_CACHE={};
let AI_RESPONSE_STATIC_CACHE={};
let AI_RESPONSE_STATIC_PROMISE=null;

function cachedResponseValue(data,key){
  const value=data&&data[key];
  if(value==null||value==='') return key.replace(/_/g,' ');
  return String(value);
}

function applyCachedResponseTemplate(template,data={}){
  return String(template||'Okay.').replace(/\{([a-zA-Z0-9_]+)\}/g,(_,key)=>cachedResponseValue(data,key));
}

function setRuntimeCachedResponse(eventKey,text){
  if(!eventKey||text==null) return;
  AI_RESPONSE_RUNTIME_CACHE[String(eventKey)]=String(text);
}

async function loadStaticResponseCache(){
  if(typeof fetch!=='function') return AI_RESPONSE_STATIC_CACHE;
  if(AI_RESPONSE_STATIC_PROMISE) return AI_RESPONSE_STATIC_PROMISE;
  AI_RESPONSE_STATIC_PROMISE=(async()=>{
    try{
      const manifestRes=await fetch(AI_RESPONSE_STATIC_BASE+'manifest.json',{cache:'force-cache'});
      if(!manifestRes.ok) return AI_RESPONSE_STATIC_CACHE;
      const manifest=await manifestRes.json();
      const responses=manifest&&manifest.responses||{};
      const entries=await Promise.all(Object.keys(responses).map(async key=>{
        try{
          const res=await fetch(AI_RESPONSE_STATIC_BASE+responses[key],{cache:'force-cache'});
          if(!res.ok) return null;
          const data=await res.json();
          return [key,String(data.text||'')];
        }catch(e){return null;}
      }));
      AI_RESPONSE_STATIC_CACHE=entries.reduce((acc,entry)=>{
        if(entry&&entry[0]&&entry[1]) acc[entry[0]]=entry[1];
        return acc;
      },{});
    }catch(e){}
    return AI_RESPONSE_STATIC_CACHE;
  })();
  return AI_RESPONSE_STATIC_PROMISE;
}

function getCachedResponse(eventKey,data={}){
  const template=
    AI_RESPONSE_RUNTIME_CACHE[eventKey]||
    AI_RESPONSE_STATIC_CACHE[eventKey]||
    AI_RESPONSE_MAP[eventKey];
  if(!template) return '';
  return applyCachedResponseTemplate(template,data);
}

async function getCachedResponseAsync(eventKey,data={}){
  if(!AI_RESPONSE_STATIC_CACHE[eventKey]) await loadStaticResponseCache();
  return getCachedResponse(eventKey,data);
}

if(typeof window!=='undefined'){
  window.AI_RESPONSE_MAP=AI_RESPONSE_MAP;
  window.AI_RESPONSE_RUNTIME_CACHE=AI_RESPONSE_RUNTIME_CACHE;
  window.getCachedResponse=getCachedResponse;
  window.getCachedResponseAsync=getCachedResponseAsync;
  window.setRuntimeCachedResponse=setRuntimeCachedResponse;
  window.loadStaticResponseCache=loadStaticResponseCache;
  loadStaticResponseCache();
}
if(typeof module!=='undefined') module.exports={AI_RESPONSE_MAP,getCachedResponse,getCachedResponseAsync,setRuntimeCachedResponse,loadStaticResponseCache};
