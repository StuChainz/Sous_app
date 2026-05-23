// ═══════════════════════════════════════════
// LOCAL DATA BACKUP / RESTORE
// ═══════════════════════════════════════════
const JOT_BACKUP_SCHEMA_VERSION=1;
const JOT_PRE_IMPORT_BACKUP_KEY='jot_pre_import_backup_v1';
const JOT_BACKUP_KEYS=[
  {key:'sous_profile',type:'object',fallback:{}},
  {key:'sous_weights',type:'array',fallback:[]},
  {key:'sous_log',type:'object',fallback:{}},
  {key:'sous_recipes',type:'array',fallback:[]},
  {key:'sous_recent_ingredients',type:'array',fallback:[]},
  {key:'sous_usual_meals',type:'object',fallback:{}},
  {key:'sous_meal_memories_v1',type:'array',fallback:[]},
  {key:'userCustomFoods',type:'array',fallback:[]},
  {key:'sous_custom_serving_units',type:'object',fallback:{}},
  {key:'userFoodOverrides',type:'object',fallback:{}},
  {key:'sous_theme',type:'object',fallback:{mode:'light',hl:'yellow'}},
  {key:'userCountry',type:'string',fallback:'GLOBAL'},
  {key:'sous_voice_input_mode',type:'string',fallback:'hold',allowed:['hold','continuous']},
  {key:'sous_voice_feedback',type:'string',fallback:'1',allowed:['0','1']},
  {key:'sous_realtime_voice',type:'string',fallback:'0',allowed:['0','1']}
];

function cloneBackupValue(value){
  if(value==null) return value;
  try{return JSON.parse(JSON.stringify(value));}catch(e){return value;}
}

function readBackupJsonKey(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    if(raw==null) return cloneBackupValue(fallback);
    const parsed=JSON.parse(raw);
    return parsed==null?cloneBackupValue(fallback):parsed;
  }catch(e){
    return cloneBackupValue(fallback);
  }
}

function readBackupStringKey(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    return raw==null?String(fallback):String(raw);
  }catch(e){
    return String(fallback);
  }
}

function backupValueMatchesType(value,type){
  if(type==='array') return Array.isArray(value);
  if(type==='object') return value&&typeof value==='object'&&!Array.isArray(value);
  if(type==='string') return typeof value==='string';
  return false;
}

function readJotBackupData(){
  return JOT_BACKUP_KEYS.reduce((data,def)=>{
    data[def.key]=def.type==='string'
      ?readBackupStringKey(def.key,def.fallback)
      :readBackupJsonKey(def.key,def.fallback);
    return data;
  },{});
}

function countUsualMeals(usualMeals){
  return Object.values(usualMeals||{}).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
}

function countLoggedMeals(log){
  return Object.values(log||{}).reduce((sum,day)=>sum+(Array.isArray(day?.meals)?day.meals.length:0),0);
}

function buildJotBackupCounts(data){
  return {
    logDays:Object.keys(data.sous_log||{}).length,
    loggedMeals:countLoggedMeals(data.sous_log),
    weights:Array.isArray(data.sous_weights)?data.sous_weights.length:0,
    recipes:Array.isArray(data.sous_recipes)?data.sous_recipes.length:0,
    recentIngredients:Array.isArray(data.sous_recent_ingredients)?data.sous_recent_ingredients.length:0,
    usualMeals:countUsualMeals(data.sous_usual_meals),
    mealMemories:Array.isArray(data.sous_meal_memories_v1)?data.sous_meal_memories_v1.length:0,
    customFoods:Array.isArray(data.userCustomFoods)?data.userCustomFoods.length:0,
    customServingUnits:Object.keys(data.sous_custom_serving_units||{}).length,
    foodOverrides:Object.keys(data.userFoodOverrides||{}).length
  };
}

function createJotBackup(){
  const data=readJotBackupData();
  return {
    app:'Jot',
    schemaVersion:JOT_BACKUP_SCHEMA_VERSION,
    exportedAt:new Date().toISOString(),
    source:'local',
    counts:buildJotBackupCounts(data),
    data
  };
}

function validateJotBackup(backup){
  if(!backup||typeof backup!=='object'||Array.isArray(backup)) return {ok:false,error:'Backup file is not a JSON object.'};
  if(backup.app!=='Jot') return {ok:false,error:'This is not a Jot backup.'};
  if(backup.schemaVersion!==JOT_BACKUP_SCHEMA_VERSION) return {ok:false,error:'This backup uses an unsupported schema version.'};
  if(!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data)) return {ok:false,error:'Backup data is missing.'};
  for(const def of JOT_BACKUP_KEYS){
    if(!Object.prototype.hasOwnProperty.call(backup.data,def.key)) return {ok:false,error:'Backup is missing '+def.key+'.'};
    const value=backup.data[def.key];
    if(!backupValueMatchesType(value,def.type)) return {ok:false,error:def.key+' has the wrong data type.'};
    if(def.allowed&&!def.allowed.includes(value)) return {ok:false,error:def.key+' has an unsupported value.'};
    try{JSON.stringify(value);}catch(e){return {ok:false,error:def.key+' cannot be saved safely.'};}
  }
  return {ok:true,summary:buildJotBackupCounts(backup.data)};
}

function formatJotBackupSummary(counts){
  return [
    (counts.logDays||0)+' log day'+((counts.logDays||0)===1?'':'s'),
    (counts.loggedMeals||0)+' logged meal'+((counts.loggedMeals||0)===1?'':'s'),
    (counts.recipes||0)+' recipe'+((counts.recipes||0)===1?'':'s'),
    (counts.usualMeals||0)+' usual meal'+((counts.usualMeals||0)===1?'':'s'),
    (counts.mealMemories||0)+' meal memor'+((counts.mealMemories||0)===1?'y':'ies'),
    (counts.customFoods||0)+' custom food'+((counts.customFoods||0)===1?'':'s')
  ].join('\n');
}

function writeJotBackupData(data){
  JOT_BACKUP_KEYS.forEach(def=>{
    const value=data[def.key];
    localStorage.setItem(def.key,def.type==='string'?value:JSON.stringify(value));
  });
}

function refreshJotAfterImport(){
  try{
    if(typeof setCurrentCountry==='function'&&typeof getUserCountry==='function') setCurrentCountry(getUserCountry());
    if(typeof applyTheme==='function'&&typeof readStoredTheme==='function') applyTheme(readStoredTheme(),false);
    if(typeof syncThemeUI==='function') syncThemeUI();
    if(typeof setVoiceInputMode==='function') setVoiceInputMode(localStorage.getItem('sous_voice_input_mode')||'hold');
  }catch(e){}
  try{
    if(typeof profState!=='undefined') profState={};
    ['f-name','f-age','f-height','f-height-ft','f-height-in','o-kcal','o-protein','o-carbs','o-fat','prof-bw-input'].forEach(id=>{const el=document.getElementById(id);if(el) el.value='';});
    document.getElementById('override-toggle')?.classList.remove('on');
    const override=document.getElementById('override-section');
    if(override) override.style.display='none';
    if(typeof overrideVisible!=='undefined') overrideVisible=false;
    if(typeof loadProfileData==='function') loadProfileData();
    if(typeof renderMealMemoryManagement==='function') renderMealMemoryManagement();
  }catch(e){}
  try{if(typeof renderHome==='function') renderHome();}catch(e){}
  try{if(typeof renderHistoryDay==='function') renderHistoryDay();}catch(e){}
  try{if(typeof renderRecipeList==='function') renderRecipeList();}catch(e){}
}

function importJotBackup(backup,opts={}){
  const validation=validateJotBackup(backup);
  if(!validation.ok){
    if(opts.toast!==false&&typeof showToast==='function') showToast(validation.error);
    return validation;
  }
  const summary=formatJotBackupSummary(validation.summary);
  if(opts.confirm!==false){
    const ok=window.confirm('Import this Jot backup?\n\n'+summary+'\n\nThis will replace your Jot logs, profile, recipes, memories, custom foods, and settings. A safety backup of current Jot data will be saved on this device first.');
    if(!ok) return {ok:false,cancelled:true,error:'Import cancelled.'};
  }
  try{
    const safetyBackup=createJotBackup();
    safetyBackup.preImportBackupFor=backup.exportedAt||null;
    safetyBackup.createdBeforeImportAt=new Date().toISOString();
    localStorage.setItem(JOT_PRE_IMPORT_BACKUP_KEY,JSON.stringify(safetyBackup));
    try{
      writeJotBackupData(backup.data);
    }catch(writeError){
      try{writeJotBackupData(safetyBackup.data);refreshJotAfterImport();}catch(restoreError){}
      if(opts.toast!==false&&typeof showToast==='function') showToast('Import failed; current Jot data was kept');
      return {ok:false,error:'Could not write the backup safely.'};
    }
  }catch(e){
    if(opts.toast!==false&&typeof showToast==='function') showToast('Import failed before anything was replaced');
    return {ok:false,error:'Could not save this import safely.'};
  }
  refreshJotAfterImport();
  if(opts.toast!==false&&typeof showToast==='function') showToast('Jot data imported ✓');
  return {ok:true,summary:validation.summary};
}

function parseAndImportJotBackupText(text,opts={}){
  let parsed;
  try{parsed=JSON.parse(text);}catch(e){
    const result={ok:false,error:'Backup file is not valid JSON.'};
    if(opts.toast!==false&&typeof showToast==='function') showToast(result.error);
    return result;
  }
  return importJotBackup(parsed,opts);
}

function exportJotData(){
  const backup=createJotBackup();
  const stamp=backup.exportedAt.slice(0,10);
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='jot-backup-'+stamp+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(typeof showToast==='function') showToast('Jot backup exported');
  return backup;
}

function chooseJotBackupFile(){
  document.getElementById('jot-backup-file')?.click();
}

function handleJotBackupFile(input){
  const file=input?.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>parseAndImportJotBackupText(String(reader.result||''));
  reader.onerror=()=>{if(typeof showToast==='function') showToast('Could not read backup file');};
  reader.readAsText(file);
  input.value='';
}

window.createJotBackup=createJotBackup;
window.exportJotData=exportJotData;
window.chooseJotBackupFile=chooseJotBackupFile;
window.handleJotBackupFile=handleJotBackupFile;
window.importJotBackup=importJotBackup;
window.parseAndImportJotBackupText=parseAndImportJotBackupText;
window.validateJotBackup=validateJotBackup;
