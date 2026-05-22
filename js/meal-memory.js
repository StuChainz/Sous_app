// ═══════════════════════════════════════════
// PERSONAL MEAL MEMORY MATCHING
// Pure deterministic helpers. No meal mutation here.
// ═══════════════════════════════════════════
(function(){
  const SECTION_WORDS={
    breakfast:'breakfast',
    lunch:'lunch',
    dinner:'dinner',
    tea:'dinner',
    supper:'dinner',
    snack:'snacks',
    snacks:'snacks',
    supplement:'supplements',
    supplements:'supplements'
  };
  const RECALL_WORDS='add|log|track|use|copy|repeat';
  const MARKER_WORDS='my|usual|regular|saved';

  function normalizeMealMemoryPhrase(text){
    const normalized=typeof normaliseLogText==='function'
      ?normaliseLogText(text||'')
      :String(text||'').toLowerCase();
    return normalized
      .replace(/[^\w\s]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function mealMemoryHasQuantity(text){
    const s=normalizeMealMemoryPhrase(text);
    if(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?|grams?|kilograms?|millilit(?:re|er)s?|lit(?:re|er)s?|ounces?|tablespoons?|teaspoons?|slices?|scoops?|servings?|pieces?)\b/.test(s)) return true;
    return /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s+(?:g|kg|ml|l|oz|tbsp|tsp|cups?|grams?|kilograms?|millilit(?:re|er)s?|lit(?:re|er)s?|ounces?|tablespoons?|teaspoons?|slices?|scoops?|servings?|pieces?)\b/.test(s);
  }

  function mealMemorySection(text){
    const token=normalizeMealMemoryPhrase(text).split(/\s+/).find(word=>SECTION_WORDS[word]);
    return token?SECTION_WORDS[token]:null;
  }

  function splitMealMemoryTransform(text){
    const normalized=normalizeMealMemoryPhrase(text);
    const parts=normalized.split(/\s+but\s+/);
    if(parts.length<2) return {base:normalized,transformText:''};
    return {base:parts[0].trim(),transformText:parts.slice(1).join(' but ').trim()};
  }

  function stripMealMemoryCommandPrefix(text){
    let s=normalizeMealMemoryPhrase(text);
    s=s.replace(new RegExp('^(?:'+RECALL_WORDS+')\\s+(?:the\\s+)?(?=(?:'+MARKER_WORDS+')\\b)'),'');
    s=s.replace(/^same\s+as\s+(?:the\s+)?(?=(?:my|usual|regular|saved)\b)/,'');
    return s.replace(/\s+/g,' ').trim();
  }

  function parseMealMemoryCommand(transcript){
    const {base,transformText}=splitMealMemoryTransform(transcript);
    if(!base) return null;

    const stripped=stripMealMemoryCommandPrefix(base);
    let section=mealMemorySection(stripped);
    const markerMatch=stripped.match(new RegExp('^(?:'+MARKER_WORDS+')\\b(?:\\s+(.+))?$'));
    const sameAsMarker=/^same\s+as\s+(?:my|usual|regular|saved)\b/.test(base);
    const actionMarker=new RegExp('^(?:'+RECALL_WORDS+')\\s+(?:the\\s+)?(?:'+MARKER_WORDS+')\\b').test(base);

    if(!markerMatch&&!sameAsMarker&&!actionMarker) return null;
    if(mealMemoryHasQuantity(base)&&!transformText) return null;

    const marker=markerMatch?stripped.split(/\s+/)[0]:null;
    let query=markerMatch?String(markerMatch[1]||'').trim():'';
    if(!query&&sameAsMarker) query=stripMealMemoryCommandPrefix(base).replace(/^(?:my|usual|regular|saved)\b/,'').trim();
    query=query.replace(/\bmeal\b/g,' ').replace(/\s+/g,' ').trim();
    const querySection=mealMemorySection(query);
    if(querySection&&normalizeMealMemoryPhrase(query)===querySection){
      section=querySection;
      query='';
    }
    const sectionOnly=!!section&&!query;

    if(!query&&!sectionOnly) return null;
    return {
      type:'personal-meal-memory',
      section,
      query:sectionOnly?'':query,
      marker,
      sectionOnly,
      transformText,
      normalized:base,
      matchText:stripped
    };
  }

  function mealMemoryPhraseList(memory){
    const phrases=Array.isArray(memory?.phrases)?memory.phrases:[];
    const name=memory?.name?[memory.name,'my '+memory.name,'usual '+memory.name,'saved '+memory.name]:[];
    return [...phrases,...name].map(normalizeMealMemoryPhrase).filter(Boolean);
  }

  function scoreMealMemory(memory,transcript){
    const command=parseMealMemoryCommand(transcript);
    if(!command||!memory) return 0;
    if(command.section&&memory.section&&command.section!==memory.section) return 0;
    const phrases=mealMemoryPhraseList(memory);
    if(command.sectionOnly){
      if(command.section&&memory.section===command.section) return 650+(Number(memory.useCount)||0);
      return 0;
    }
    const candidates=[
      command.matchText,
      command.query,
      command.normalized
    ].map(normalizeMealMemoryPhrase).filter(Boolean);
    let best=0;
    phrases.forEach(phrase=>{
      candidates.forEach(candidate=>{
        if(!phrase||!candidate) return;
        if(phrase===candidate) best=Math.max(best,1000+phrase.length);
        else if(candidate.endsWith(' '+phrase)||phrase.endsWith(' '+candidate)) best=Math.max(best,850+Math.min(phrase.length,candidate.length));
        else if(phrase.includes(candidate)&&candidate.length>=3) best=Math.max(best,720+candidate.length);
        else if(candidate.includes(phrase)&&phrase.length>=3) best=Math.max(best,700+phrase.length);
      });
    });
    return best;
  }

  function findBestMealMemoryMatch(transcript,opts={}){
    const command=parseMealMemoryCommand(transcript);
    if(!command) return {matched:false,command:null,memory:null,score:0,ambiguous:false,matches:[]};
    const threshold=Number(opts.threshold)||650;
    const memories=Array.isArray(opts.memories)
      ?opts.memories
      :(typeof getMealMemories==='function'?getMealMemories():[]);
    const matches=memories
      .map(memory=>({memory,score:scoreMealMemory(memory,transcript)}))
      .filter(match=>match.score>=threshold)
      .sort((a,b)=>b.score-a.score);
    if(!matches.length) return {matched:false,command,memory:null,score:0,ambiguous:false,matches:[]};
    const topScore=matches[0].score;
    const strong=matches.filter(match=>Math.abs(match.score-topScore)<25);
    if(strong.length>1) return {matched:false,command,memory:null,score:topScore,ambiguous:true,matches:strong};
    return {matched:true,command,memory:matches[0].memory,score:topScore,ambiguous:false,matches};
  }

  window.normalizeMealMemoryPhrase=normalizeMealMemoryPhrase;
  window.scoreMealMemory=scoreMealMemory;
  window.findBestMealMemoryMatch=findBestMealMemoryMatch;
  window.parseMealMemoryCommand=parseMealMemoryCommand;
})();
