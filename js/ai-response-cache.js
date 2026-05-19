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
let AI_RESPONSE_STATIC_AUDIO={};  // key → resolved audio URL (if file exists)
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
          // support both old string format and new {text, audio} object format
          const entry=responses[key];
          const textPath=typeof entry==='string'?entry:(entry&&entry.text);
          const audioPath=entry&&typeof entry==='object'&&entry.audio?entry.audio:null;
          const res=await fetch(AI_RESPONSE_STATIC_BASE+textPath,{cache:'force-cache'});
          if(!res.ok) return null;
          const data=await res.json();
          const text=String(data.text||'');
          // probe audio URL — only store if server confirms it exists
          let audioUrl=null;
          if(audioPath){
            try{
              const aRes=await fetch(AI_RESPONSE_STATIC_BASE+audioPath,{method:'HEAD',cache:'force-cache'});
              if(aRes.ok) audioUrl=AI_RESPONSE_STATIC_BASE+audioPath;
            }catch(e){}
          }
          return [key,text,audioUrl];
        }catch(e){return null;}
      }));
      AI_RESPONSE_STATIC_CACHE={};
      AI_RESPONSE_STATIC_AUDIO={};
      entries.forEach(entry=>{
        if(!entry||!entry[0]) return;
        if(entry[1]) AI_RESPONSE_STATIC_CACHE[entry[0]]=entry[1];
        if(entry[2]) AI_RESPONSE_STATIC_AUDIO[entry[0]]=entry[2];
      });
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

function getCachedAudioUrl(eventKey){
  return AI_RESPONSE_STATIC_AUDIO[eventKey]||null;
}

async function getCachedAudioUrlAsync(eventKey){
  if(!AI_RESPONSE_STATIC_PROMISE) await loadStaticResponseCache();
  return getCachedAudioUrl(eventKey);
}

if(typeof window!=='undefined'){
  window.AI_RESPONSE_MAP=AI_RESPONSE_MAP;
  window.AI_RESPONSE_RUNTIME_CACHE=AI_RESPONSE_RUNTIME_CACHE;
  window.getCachedResponse=getCachedResponse;
  window.getCachedResponseAsync=getCachedResponseAsync;
  window.getCachedAudioUrl=getCachedAudioUrl;
  window.getCachedAudioUrlAsync=getCachedAudioUrlAsync;
  window.setRuntimeCachedResponse=setRuntimeCachedResponse;
  window.loadStaticResponseCache=loadStaticResponseCache;
  loadStaticResponseCache();
}
if(typeof module!=='undefined') module.exports={AI_RESPONSE_MAP,getCachedResponse,getCachedResponseAsync,getCachedAudioUrl,getCachedAudioUrlAsync,setRuntimeCachedResponse,loadStaticResponseCache};
