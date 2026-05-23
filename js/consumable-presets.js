(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const PRESET_GROUPS={
    alcohol:[
      preset('prosecco-125ml','prosecco 125ml',['prosecco','glass of prosecco','125ml prosecco'], 'alcohol',125,'ml',86,0.1,2.1,0,'high'),
      preset('champagne-125ml','champagne 125ml',['champagne','glass of champagne','125ml champagne'], 'alcohol',125,'ml',95,0.1,1.8,0,'high'),
      preset('white-wine-125ml','white wine 125ml',['white wine','small white wine','glass of white wine','125ml white wine'], 'alcohol',125,'ml',94,0.1,0.8,0,'high'),
      preset('white-wine-175ml','white wine 175ml',['large white wine','175ml white wine'], 'alcohol',175,'ml',131,0.2,1.1,0,'high'),
      preset('red-wine-125ml','red wine 125ml',['red wine','small red wine','glass of red wine','125ml red wine'], 'alcohol',125,'ml',95,0.1,0.3,0,'high'),
      preset('red-wine-175ml','red wine 175ml',['large red wine','175ml red wine'], 'alcohol',175,'ml',133,0.2,0.4,0,'high'),
      preset('beer-pint-568ml','beer pint 568ml',['pint of beer','beer pint','568ml beer'], 'alcohol',568,'ml',182,2.3,17.1,0,'high'),
      preset('beer-bottle-330ml','beer bottle 330ml',['bottle of beer','beer bottle','330ml beer'], 'alcohol',330,'ml',142,1.7,11.6,0,'high'),
      preset('lager-pint-568ml','lager pint 568ml',['pint of lager','lager pint','568ml lager'], 'alcohol',568,'ml',136,1.7,0,0,'high'),
      preset('cider-pint-568ml','cider pint 568ml',['pint of cider','cider pint','568ml cider'], 'alcohol',568,'ml',216,0,17,0,'medium'),
      preset('single-spirit-25ml','single spirit 25ml',['single spirit','single measure','25ml spirit'], 'alcohol',25,'ml',55,0,0,0,'medium'),
      preset('double-spirit-50ml','double spirit 50ml',['double spirit','double measure','50ml spirit'], 'alcohol',50,'ml',110,0,0,0,'medium'),
      preset('gin-slimline-tonic','gin and slimline tonic',['gin and slimline tonic','gin slimline tonic','gin with slimline tonic','g and slimline t'], 'alcohol',1,'serving',61,0,0,0,'medium'),
      preset('gin-regular-tonic','gin and regular tonic',['gin and regular tonic','gin regular tonic','gin and tonic','gin with tonic','g and t'], 'alcohol',1,'serving',118,0,15,0,'medium'),
      preset('generic-cocktail','generic cocktail',['cocktail','mixed cocktail','house cocktail'], 'alcohol',1,'serving',200,0,20,0,'medium')
    ],
    soft_drink:[
      preset('cola-330ml','cola 330ml',['cola','coke','regular coke','330ml cola'], 'soft_drink',330,'ml',135,0,36,0,'high'),
      preset('diet-cola-330ml','diet cola 330ml',['diet cola','diet coke','coke zero','zero coke','330ml diet cola'], 'soft_drink',330,'ml',1,0,0,0,'high'),
      preset('lemonade-330ml','lemonade 330ml',['lemonade','330ml lemonade'], 'soft_drink',330,'ml',73,0,19.1,0,'high'),
      preset('tonic-150ml','tonic 150ml',['tonic','regular tonic','150ml tonic'], 'soft_drink',150,'ml',51,0,12.9,0,'high'),
      preset('slimline-tonic-150ml','slimline tonic 150ml',['slimline tonic','diet tonic','150ml slimline tonic'], 'soft_drink',150,'ml',3,0,0,0,'high'),
      preset('orange-juice-250ml','orange juice 250ml',['orange juice','glass of orange juice','250ml orange juice'], 'soft_drink',250,'ml',90,2.3,21.5,0,'high'),
      preset('sparkling-water-330ml','sparkling water 330ml',['sparkling water','soda water','330ml sparkling water'], 'soft_drink',330,'ml',0,0,0,0,'high'),
      preset('mocktail-generic','mocktail generic',['mocktail','generic mocktail','non alcoholic cocktail'], 'soft_drink',1,'serving',120,0,30,0,'medium')
    ],
    side:[
      preset('bread-basket','bread basket',['bread basket','table bread','restaurant bread'], 'side',1,'serving',320,10,58,6,'medium'),
      preset('side-fries','side fries',['side fries','chips','side chips','fries'], 'side',1,'serving',350,4,45,17,'medium'),
      preset('side-salad','side salad',['side salad','green salad','house salad'], 'side',1,'serving',70,2,8,4,'medium')
    ],
    sauce:[
      preset('sauce-dressing','sauce/dressing',['sauce','dressing','sauce dressing','side sauce','salad dressing'], 'sauce',1,'serving',80,0,4,7,'medium')
    ]
  };

  const CONSUMABLE_PRESETS=Object.values(PRESET_GROUPS).flat();

  function preset(id,name,aliases,category,defaultQuantity,defaultUnit,kcal,protein,carbs,fat,confidence){
    return {
      id,
      name,
      aliases,
      category,
      defaultQuantity,
      defaultUnit,
      kcal,
      protein,
      carbs,
      fat,
      source:'consumable_preset',
      confidence,
      editable:true,
      loggable:true,
      reservable:true
    };
  }

  function clone(value){
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(text){
    return String(text||'')
      .toLowerCase()
      .replace(/&/g,' and ')
      .replace(/['’]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim()
      .replace(/\s+/g,' ');
  }

  function textIncludesPhrase(text,phrase){
    const normalizedText=` ${normalizeText(text)} `;
    const normalizedPhrase=normalizeText(phrase);
    return !!normalizedPhrase&&normalizedText.includes(` ${normalizedPhrase} `);
  }

  function getConsumablePresets(){
    return clone(CONSUMABLE_PRESETS);
  }

  function findConsumablePresetByText(text){
    const normalized=normalizeText(text);
    if(!normalized) return null;

    const matches=[];
    CONSUMABLE_PRESETS.forEach((item,index)=>{
      [item.name,...(item.aliases||[])].forEach(phrase=>{
        if(textIncludesPhrase(normalized,phrase)){
          matches.push({item,index,score:normalizeText(phrase).length});
        }
      });
    });

    if(!matches.length) return null;
    matches.sort((a,b)=>b.score-a.score||a.index-b.index);
    return clone(matches[0].item);
  }

  function createConsumablePresetRow(presetItem,overrides={}){
    if(!presetItem) return null;
    const quantity=overrides.quantity??presetItem.defaultQuantity??presetItem.quantity??1;
    const unit=overrides.unit??presetItem.defaultUnit??presetItem.unit??'serving';
    const kcal=roundNumber(overrides.kcal??presetItem.kcal);
    const protein=roundMacro(overrides.protein??presetItem.protein);
    const carbs=roundMacro(overrides.carbs??presetItem.carbs);
    const fat=roundMacro(overrides.fat??presetItem.fat);
    const row={
      id:overrides.id||`consumable_${presetItem.id}`,
      presetId:presetItem.id,
      name:overrides.name||presetItem.name,
      quantity,
      unit,
      defaultQuantity:presetItem.defaultQuantity??quantity,
      defaultUnit:presetItem.defaultUnit??unit,
      estimatedGrams:unit==='g'?Math.round(Number(quantity)||0):null,
      weight:unit==='g'?Math.round(Number(quantity)||0):null,
      calories:kcal,
      kcal,
      protein,
      carbs,
      fat,
      fibre:roundMacro(overrides.fibre??presetItem.fibre),
      category:presetItem.category||'custom',
      source:overrides.source||presetItem.source||'consumable_preset',
      confidence:overrides.confidence||presetItem.confidence||'medium',
      editable:overrides.editable??presetItem.editable??true,
      loggable:overrides.loggable??presetItem.loggable??true,
      reservable:overrides.reservable??presetItem.reservable??true,
      notes:overrides.notes||''
    };
    return row;
  }

  function createCustomConsumableEstimate({name,kcal,protein,carbs,fat,quantity,unit}={}){
    const cleanName=String(name||'Custom item').trim()||'Custom item';
    const defaultQuantity=quantity??1;
    const defaultUnit=unit||'serving';
    return {
      id:`custom-${slugify(cleanName)}`,
      name:cleanName,
      aliases:[],
      category:'custom',
      defaultQuantity,
      defaultUnit,
      kcal:roundNumber(kcal),
      protein:roundMacro(protein),
      carbs:roundMacro(carbs),
      fat:roundMacro(fat),
      source:'consumable_ai_estimate',
      confidence:'low',
      editable:true,
      loggable:true,
      reservable:true
    };
  }

  function roundNumber(value){
    return Math.max(0,Math.round(Number(value)||0));
  }

  function roundMacro(value){
    return Math.max(0,Math.round((Number(value)||0)*10)/10);
  }

  function slugify(value){
    return normalizeText(value).replace(/\s+/g,'-')||'item';
  }

  return {
    CONSUMABLE_PRESET_GROUPS:clone(PRESET_GROUPS),
    CONSUMABLE_PRESETS:getConsumablePresets(),
    getConsumablePresets,
    findConsumablePresetByText,
    createConsumablePresetRow,
    createCustomConsumableEstimate
  };
});
