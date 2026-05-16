// ═══════════════════════════════════════════
// AI INTERPRETER ADAPTER
// ═══════════════════════════════════════════
// Adapter shell only. Future AI interpretation must return a draft object.
// It must not save meals directly, mutate the active meal, or bypass review.
// app.js remains responsible for confirmation, conversion, and saving.

function fallbackCreateIngredientDraft(input={}){
  return {
    inputName:input.inputName||input.name||'',
    displayName:input.displayName||input.name||input.inputName||'',
    quantity:input.quantity!=null?input.quantity:1,
    unit:input.unit||'g'
  };
}

function fallbackCreateMealDraft({section=null,source='ai-stub',ingredients=[],needsConfirmation=true,questions=[]}={}){
  return {
    section,
    source,
    createdAt:Date.now(),
    ingredients:ingredients.map(fallbackCreateIngredientDraft),
    needsConfirmation,
    questions
  };
}

async function interpretMealWithAI({transcript='',section=null,countryCode=null,context=null}={}){
  void countryCode;
  void context;
  const makeMealDraft=typeof createMealDraft==='function'?createMealDraft:fallbackCreateMealDraft;
  const makeIngredientDraft=typeof createIngredientDraft==='function'?createIngredientDraft:fallbackCreateIngredientDraft;
  const cleanTranscript=String(transcript||'').trim();
  const mockIngredients=cleanTranscript?[makeIngredientDraft({
    inputName:cleanTranscript,
    displayName:cleanTranscript,
    quantity:1,
    unit:'serving',
    confidence:'low'
  })]:[];

  // Stub/mock only: no API calls, no API keys, no remote work.
  // Later, AI output should be normalised into ingredient drafts here.
  const draft=makeMealDraft({
    section,
    source:'ai-stub',
    ingredients:mockIngredients,
    needsConfirmation:true,
    questions:[]
  });

  return draft;
}

if(typeof window!=='undefined') window.interpretMealWithAI=interpretMealWithAI;
if(typeof module!=='undefined') module.exports={interpretMealWithAI};
