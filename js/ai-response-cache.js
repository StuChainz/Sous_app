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
  updated:'Updated.',
  removed:'Removed.',
  cleared:'Cleared.',
  recovery:"Didn't catch that.",
  flow:'Anything else?',
  session_continuing:'Continuing.',
  session_resumed:'Session resumed.',
  session_ready:'Ready.',
  session_picked_up:'Picked up where you left off.',
  got_it:'Got it.',
  clarify_type:'What type?',
  clarify_quantity:'How much?',
  clarify_type_quantity:'What type and how much?',
  clarify_confirm_food:'Did you mean {food}?',
  realtime_ready:'Realtime ready.',
  realtime_stopped:'Realtime stopped.',
  realtime_error:'Realtime is unavailable. Using standard voice.',
  clarification_needed:'I need one more detail.'
};

const AI_RESPONSE_STATIC_BASE='assets/voice-cache/';
const AI_RESPONSE_RUNTIME_CACHE={};
const AI_RESPONSE_AUDIO_SEMANTICS={
  added:{variants:['added_01','added_02','added_03','added_04','added_05','added_06','added_07','added_08','added_09'],fallback:'added'},
  logged:{variants:['logged_01','logged_02','logged_03','logged_04','logged_05'],fallback:'logged'},
  updated:{variants:['updated_01','updated_02','updated_03'],fallback:null},
  deleted:{variants:['removed_01','removed_02'],fallback:'deleted'},
  removed:{variants:['removed_01','removed_02'],fallback:'deleted'},
  undone:{variants:['undone_01','undone_02'],fallback:'undone'},
  done:{variants:['done_01','done_02','added_04'],fallback:'done'},
  cleared:{variants:['cleared_01','cleared_02'],fallback:null},
  recovery:{variants:['recovery_try_again','recovery_didnt_catch','recovery_say_again'],fallback:null},
  flow:{variants:['flow_anything_else','flow_what_next','flow_next_one','flow_ready_for_the_next_one','flow_go_on','flow_still_with_you'],fallback:'flow_anything_else'},
  session_continuing:{variants:['session_continuing'],fallback:null},
  session_resumed:{variants:['session_resumed'],fallback:null},
  session_ready:{variants:['session_ready'],fallback:null},
  session_picked_up:{variants:['session_picked_up'],fallback:'session_continuing'},
  clarify_type:{variants:['clarify_type'],fallback:'clarification_needed'},
  clarify_quantity:{variants:['clarify_amount'],fallback:'clarification_needed'},
  clarify_type_quantity:{variants:['clarify_type_quantity'],fallback:'clarification_needed'},
  clarify_confirm_food:{variants:['clarify_confirm_food'],fallback:'clarification_needed'}
};
let AI_RESPONSE_STATIC_CACHE={};
let AI_RESPONSE_STATIC_AUDIO={};  // key → resolved audio URL (if file exists)
let AI_RESPONSE_AUDIO_EXISTS={};  // audio URL → boolean after a HEAD probe
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
  const semantic=AI_RESPONSE_AUDIO_SEMANTICS[eventKey];
  if(semantic){
    const available=semantic.variants
      .map(key=>AI_RESPONSE_STATIC_BASE+'audio/'+key+'.mp3')
      .filter(url=>AI_RESPONSE_AUDIO_EXISTS[url]);
    if(available.length) return available[Math.floor(Math.random()*available.length)];
    if(semantic.fallback&&AI_RESPONSE_STATIC_AUDIO[semantic.fallback]) return AI_RESPONSE_STATIC_AUDIO[semantic.fallback];
  }
  return AI_RESPONSE_STATIC_AUDIO[eventKey]||null;
}

async function getCachedAudioUrlAsync(eventKey){
  await loadStaticResponseCache();
  const semantic=AI_RESPONSE_AUDIO_SEMANTICS[eventKey];
  if(semantic){
    const urls=semantic.variants.map(key=>AI_RESPONSE_STATIC_BASE+'audio/'+key+'.mp3');
    const checks=await Promise.all(urls.map(async url=>{
      if(AI_RESPONSE_AUDIO_EXISTS[url]!=null) return AI_RESPONSE_AUDIO_EXISTS[url];
      try{
        const res=await fetch(url,{method:'HEAD',cache:'force-cache'});
        AI_RESPONSE_AUDIO_EXISTS[url]=!!res.ok;
      }catch(e){AI_RESPONSE_AUDIO_EXISTS[url]=false;}
      return AI_RESPONSE_AUDIO_EXISTS[url];
    }));
    const available=urls.filter((url,index)=>checks[index]);
    if(available.length) return available[Math.floor(Math.random()*available.length)];
    if(semantic.fallback&&AI_RESPONSE_STATIC_AUDIO[semantic.fallback]) return AI_RESPONSE_STATIC_AUDIO[semantic.fallback];
  }
  return getCachedAudioUrl(eventKey);
}

function getCachedAudioSemanticOptions(eventKey){
  const semantic=AI_RESPONSE_AUDIO_SEMANTICS[eventKey];
  if(!semantic) return {variants:[],fallback:eventKey};
  return {
    variants:semantic.variants.slice(),
    fallback:semantic.fallback
  };
}

if(typeof window!=='undefined'){
  window.AI_RESPONSE_MAP=AI_RESPONSE_MAP;
  window.AI_RESPONSE_AUDIO_SEMANTICS=AI_RESPONSE_AUDIO_SEMANTICS;
  window.AI_RESPONSE_RUNTIME_CACHE=AI_RESPONSE_RUNTIME_CACHE;
  window.getCachedResponse=getCachedResponse;
  window.getCachedResponseAsync=getCachedResponseAsync;
  window.getCachedAudioUrl=getCachedAudioUrl;
  window.getCachedAudioUrlAsync=getCachedAudioUrlAsync;
  window.getCachedAudioSemanticOptions=getCachedAudioSemanticOptions;
  window.setRuntimeCachedResponse=setRuntimeCachedResponse;
  window.loadStaticResponseCache=loadStaticResponseCache;
  loadStaticResponseCache();
}
if(typeof module!=='undefined') module.exports={AI_RESPONSE_MAP,AI_RESPONSE_AUDIO_SEMANTICS,getCachedResponse,getCachedResponseAsync,getCachedAudioUrl,getCachedAudioUrlAsync,getCachedAudioSemanticOptions,setRuntimeCachedResponse,loadStaticResponseCache};
