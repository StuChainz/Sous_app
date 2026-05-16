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
  cancelled:'Cancelled.'
};

function cachedResponseValue(data,key){
  const value=data&&data[key];
  if(value==null||value==='') return key.replace(/_/g,' ');
  return String(value);
}

function getCachedResponse(eventKey,data={}){
  const template=AI_RESPONSE_MAP[eventKey]||'Okay.';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g,(_,key)=>cachedResponseValue(data,key));
}

if(typeof window!=='undefined'){
  window.AI_RESPONSE_MAP=AI_RESPONSE_MAP;
  window.getCachedResponse=getCachedResponse;
}
if(typeof module!=='undefined') module.exports={AI_RESPONSE_MAP,getCachedResponse};
