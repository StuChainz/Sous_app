// ═══════════════════════════════════════════
// AI INTERPRETER ADAPTER
// ═══════════════════════════════════════════
// Experimental AI interpreter adapter.
// The local parser remains the primary meal interpretation path; this AI layer
// is secondary and must never save meals, mutate the active meal, or bypass review.
// app.js remains responsible for confirmation, conversion, and saving.

const DEFAULT_AI_ENDPOINT='https://api.openai.com/v1/responses';
const DEFAULT_AI_MODEL='gpt-4.1-mini';

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
    apiKey:globalConfig.apiKey||stored.apiKey||globalKey||null,
    model:globalConfig.model||stored.model||DEFAULT_AI_MODEL
  };
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
  if(!config.apiKey) return emptyAIDraft(section,makeMealDraft);

  const prompt=[
    'Return JSON only. No explanations. No text outside JSON.',
    'Shape: {"section":string|null,"ingredients":[{"name":string,"quantity":number,"unit":string}]}',
    'Interpret the cooking transcript into ingredient entries.',
    countryCode?`Country code: ${countryCode}`:null,
    `Section: ${section||''}`,
    `Transcript: ${cleanTranscript}`
  ].filter(Boolean).join('\n');

  try{
    // Request body follows the OpenAI Responses API shape (/v1/responses).
    // If switching to Chat Completions (/v1/chat/completions), body must use `messages` + `response_format` instead.
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    let res;
    try{
      res=await fetch(config.endpoint,{
        method:'POST',
        signal:controller.signal,
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${config.apiKey}`
        },
        body:JSON.stringify({
          model:config.model,
          input:prompt,
          text:{
            format:{
              type:'json_schema',
              name:'meal_draft',
              strict:true,
              schema:{
                type:'object',
                additionalProperties:false,
                properties:{
                  section:{type:['string','null']},
                  ingredients:{
                    type:'array',
                    items:{
                      type:'object',
                      additionalProperties:false,
                      properties:{
                        name:{type:'string'},
                        quantity:{type:'number'},
                        unit:{type:'string'}
                      },
                      required:['name','quantity','unit']
                    }
                  }
                },
                required:['section','ingredients']
              }
            }
          }
        })
      });
    }finally{
      clearTimeout(timeout);
    }
    if(!res.ok) return emptyAIDraft(section,makeMealDraft);

    const data=await res.json();
    const rawText=extractAIResponseText(data);
    const parsed=safeParseAIJSON(rawText);
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

if(typeof window!=='undefined') window.interpretMealWithAI=interpretMealWithAI;
if(typeof module!=='undefined') module.exports={interpretMealWithAI};
