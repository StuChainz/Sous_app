// Friend-testing bug report tools. Local-only: no uploads, no analytics.
(function(){
  const TEST_MODE_KEY='sous_test_mode';
  const consoleErrors=[];
  let bugButton;
  let modal;
  let noteInput;
  let statusEl;
  let previousFocus=null;

  function normaliseError(value){
    if(value==null) return null;
    if(value instanceof Error) return {
      name:value.name||'Error',
      message:value.message||String(value),
      stack:value.stack||null
    };
    if(typeof value==='object') {
      try{return JSON.parse(JSON.stringify(value));}catch(e){return String(value);}
    }
    return String(value);
  }

  function rememberConsoleError(entry){
    consoleErrors.push({
      t:new Date().toISOString(),
      ...entry
    });
    if(consoleErrors.length>20) consoleErrors.splice(0,consoleErrors.length-20);
  }

  window.addEventListener('error',event=>{
    rememberConsoleError({
      type:'error',
      message:event.message||null,
      source:event.filename||null,
      line:event.lineno||null,
      column:event.colno||null,
      error:normaliseError(event.error)
    });
  });

  window.addEventListener('unhandledrejection',event=>{
    rememberConsoleError({
      type:'unhandledrejection',
      reason:normaliseError(event.reason)
    });
  });

  function urlEnablesTestMode(){
    try{return new URLSearchParams(location.search).get('test')==='1';}
    catch(e){return false;}
  }

  function persistUrlTestMode(){
    if(!urlEnablesTestMode()) return;
    try{localStorage.setItem(TEST_MODE_KEY,'1');}catch(e){}
  }

  function storageEnablesTestMode(){
    try{return localStorage.getItem(TEST_MODE_KEY)==='1';}
    catch(e){return false;}
  }

  function storageDisablesTestMode(){
    try{return localStorage.getItem(TEST_MODE_KEY)==='0';}
    catch(e){return false;}
  }

  function testModeEnabled(){
    if(urlEnablesTestMode()||storageEnablesTestMode()) return true;
    return !storageDisablesTestMode();
  }

  function syncButton(){
    if(!bugButton) return;
    bugButton.classList.toggle('show',testModeEnabled());
  }

  function setStatus(text){
    if(statusEl) statusEl.textContent=text||'';
  }

  function openBugModal(){
    if(!modal) return;
    previousFocus=document.activeElement;
    modal.style.display='flex';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    setStatus('');
    setTimeout(()=>noteInput?.focus(),0);
  }

  function closeBugModal(){
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    modal.style.display='none';
    setStatus('');
    if(previousFocus&&typeof previousFocus.focus==='function') previousFocus.focus();
  }

  function clonePlain(value){
    if(value==null) return value;
    try{return JSON.parse(JSON.stringify(value));}
    catch(e){return String(value);}
  }

  function getStandaloneMode(){
    try{
      return !!(window.navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches);
    }catch(e){return false;}
  }

  function getCurrentTab(){
    try{
      if(typeof currentTab!=='undefined') return currentTab;
    }catch(e){}
    return document.querySelector('.tab-pane.active')?.id?.replace(/^pane-/,'')||null;
  }

  function getCurrentScreen(){
    const activePane=document.querySelector('.tab-pane.active');
    if(activePane?.id==='pane-log') return activePane.querySelector('.log-screen.active')?.id||activePane.id;
    if(activePane?.id==='pane-recipes') return activePane.querySelector('.rs-screen.active')?.id||activePane.id;
    return activePane?.id||null;
  }

  function getMealRowsFromVoiceState(){
    try{
      if(typeof window.__sousVoiceState==='function'){
        const state=window.__sousVoiceState();
        if(Array.isArray(state?.meal)) return clonePlain(state.meal);
      }
    }catch(e){}
    try{
      if(typeof meal!=='undefined'&&Array.isArray(meal)){
        return meal.map(item=>({
          id:item.id??null,
          name:item.name||null,
          weight:item.weight??null,
          serving:item.serving?clonePlain(item.serving):null,
          kcal:item.kcal??null,
          protein:item.protein??null,
          carbs:item.carbs??null,
          fat:item.fat??null,
          rawFood:item.rawFood?.name||null
        }));
      }
    }catch(e){}
    return Array.from(document.querySelectorAll('#current-meal-list .meal-item,#ing-list .ing-item')).map(row=>row.textContent.trim()).filter(Boolean);
  }

  function getPendingQuantity(){
    try{
      if(typeof pendingFood==='undefined'||!pendingFood) return null;
      return {
        active:document.querySelector('.log-screen.active')?.id==='ls-quantity',
        name:pendingFood.name||null,
        weight:pendingFood.weight??null,
        weightSpecified:!!pendingFood.weightSpecified,
        serving:pendingFood.serving?clonePlain(pendingFood.serving):null,
        rawFood:pendingFood.rawFood?.name||null,
        usualMealOption:pendingFood.usualMealOption?.name||null
      };
    }catch(e){return null;}
  }

  function getPendingClarification(){
    try{
      if(typeof window.__sousVoiceState==='function'){
        const state=window.__sousVoiceState();
        if(state?.clarification) return clonePlain(state.clarification);
      }
    }catch(e){}
    try{
      if(typeof voiceDebugClarificationSnapshot==='function') return clonePlain(voiceDebugClarificationSnapshot());
    }catch(e){}
    try{
      if(typeof clarificationState==='undefined'||!clarificationState?.active) return null;
      return clonePlain(clarificationState);
    }catch(e){return null;}
  }

  function getVoiceState(){
    try{
      if(typeof window.__sousVoiceState==='function') return clonePlain(window.__sousVoiceState());
    }catch(e){}
    try{
      if(typeof voiceLifecycleSnapshot==='function') return clonePlain(voiceLifecycleSnapshot({includeAlwaysOn:true}));
    }catch(e){}
    return null;
  }

  function getLastTranscriptText(){
    return document.getElementById('transcript-text')?.textContent||null;
  }

  function getVoiceTrace(){
    try{
      if(typeof window.__sousVoiceTrace==='function') return window.__sousVoiceTrace().slice(-150);
    }catch(e){}
    try{
      if(typeof window.sousVoiceDebug==='function') return window.sousVoiceDebug().slice(-150);
    }catch(e){}
    return [];
  }

  function getVoiceDecisionTrace(){
    try{
      if(typeof window.__sousVoiceDecisionTrace==='function') return window.__sousVoiceDecisionTrace().slice(-8);
    }catch(e){}
    return [];
  }

  function getVoiceTestEvents(){
    try{
      if(typeof window.__sousLastVoiceEvents==='function') return window.__sousLastVoiceEvents().slice(-50);
    }catch(e){}
    return [];
  }

  function getPhotoTimingTrace(){
    try{
      if(typeof window.__sousPhotoTimingTrace==='function') return clonePlain(window.__sousPhotoTimingTrace().slice(-100));
    }catch(e){}
    return [];
  }

  function getBarcodeTimingTrace(){
    try{
      if(typeof window.__sousBarcodeTimingTrace==='function') return clonePlain(window.__sousBarcodeTimingTrace().slice(-80));
    }catch(e){}
    return [];
  }

  function getLastPhotoError(){
    try{
      if(typeof window.__sousLastPhotoError==='function') return clonePlain(window.__sousLastPhotoError());
    }catch(e){}
    return null;
  }

  function getLastBarcodeError(){
    try{
      if(typeof window.__sousLastBarcodeError==='function') return clonePlain(window.__sousLastBarcodeError());
    }catch(e){}
    return null;
  }

  function getPhotoEstimateState(){
    try{
      if(typeof window.__sousPhotoEstimateState==='function') return clonePlain(window.__sousPhotoEstimateState());
    }catch(e){}
    return {
      hasPhotoEstimate:false,
      photoEstimateItemCount:0,
      photoAdjustInProgress:false,
      lastPhotoAdjustError:null
    };
  }

  function safeJsonParse(raw,fallback){
    try{
      if(raw==null) return fallback;
      const parsed=JSON.parse(raw);
      return parsed==null?fallback:parsed;
    }catch(e){return fallback;}
  }

  function getScriptVersions(){
    const versions={};
    document.querySelectorAll('script[src]').forEach(script=>{
      try{
        const url=new URL(script.getAttribute('src'),location.href);
        if(!/\/js\//.test(url.pathname)) return;
        versions[url.pathname.split('/').pop()]=url.searchParams.get('v')||null;
      }catch(e){}
    });
    return versions;
  }

  function getAppVersionInfo(){
    let appVersion=null;
    let buildIdentifier=null;
    let serviceWorkerController=null;
    try{
      appVersion=window.SOUS_APP_VERSION||document.querySelector('meta[name="app-version"]')?.content||null;
    }catch(e){}
    try{
      buildIdentifier=window.SOUS_BUILD_ID||document.querySelector('meta[name="build-id"]')?.content||null;
    }catch(e){}
    try{
      serviceWorkerController=navigator.serviceWorker?.controller?.scriptURL||null;
    }catch(e){}
    return {
      appName:'Jot',
      appVersion,
      buildIdentifier,
      serviceWorkerController,
      scriptVersions:getScriptVersions()
    };
  }

  function getSelectedDate(){
    try{
      if(typeof selectedLogDate!=='undefined') return selectedLogDate||null;
    }catch(e){}
    return document.getElementById('date-picker')?.value||null;
  }

  function getVoiceInputModeSummary(){
    try{
      if(typeof window.getVoiceInputMode==='function') return window.getVoiceInputMode();
    }catch(e){}
    try{return localStorage.getItem('sous_voice_input_mode')||null;}catch(e){return null;}
  }

  function getVoiceStatusSummary(voiceState){
    const state=voiceState&&typeof voiceState==='object'?voiceState:null;
    return {
      inputMode:getVoiceInputModeSummary(),
      state:state?.state||null,
      sessionActive:state?.sessionActive??null,
      recognizerActive:state?.recognizerActive??null,
      listening:state?.voiceCurrentlyListening??state?.isRecording??null,
      processing:state?.processing??null,
      speaking:state?.speaking??null,
      restartCount:state?.restartCount??null,
      activeScreen:state?.activeScreen||null,
      lastCorrectionText:state?.voiceCorrectText||null
    };
  }

  function getSafeVoiceState(voiceState){
    const state=voiceState&&typeof voiceState==='object'?voiceState:null;
    if(!state) return null;
    return {
      state:state.state||null,
      sessionActive:state.sessionActive??null,
      testSessionActive:state.testSessionActive??null,
      recognizerActive:state.recognizerActive??null,
      voiceCurrentlyListening:state.voiceCurrentlyListening??null,
      isRecording:state.isRecording??null,
      processing:state.processing??null,
      speaking:state.speaking??null,
      voiceInputMode:state.voiceInputMode||getVoiceInputModeSummary(),
      voiceHoldActive:state.voiceHoldActive??null,
      restartCount:state.restartCount??null,
      activeScreen:state.activeScreen||null,
      listenStatus:state.listenStatus||null,
      voiceCorrectText:state.voiceCorrectText||null,
      currentTab:state.currentTab||getCurrentTab(),
      currentMealItemCount:Array.isArray(state.meal)?state.meal.length:null,
      reviewItemCount:Array.isArray(state.reviewIngredientNames)?state.reviewIngredientNames.length:null,
      hasClarification:!!state.clarification
    };
  }

  function countUsualMealsSafe(value){
    return Object.values(value||{}).reduce((sum,list)=>sum+(Array.isArray(list)?list.length:0),0);
  }

  function countLoggedMealsSafe(log){
    return Object.values(log||{}).reduce((sum,day)=>sum+(Array.isArray(day?.meals)?day.meals.length:0),0);
  }

  function storageItemCount(value,type){
    if(type==='array') return Array.isArray(value)?value.length:null;
    if(type==='object') return value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).length:null;
    return null;
  }

  function summariseStorageKey(key,type='json'){
    let raw=null;
    try{raw=localStorage.getItem(key);}catch(e){}
    const present=raw!=null;
    const summary={present,bytes:present?raw.length:0,type};
    if(!present) return summary;
    if(type==='string') return summary;
    const fallback=type==='array'?[]:{};
    const parsed=safeJsonParse(raw,fallback);
    summary.count=storageItemCount(parsed,type);
    return summary;
  }

  function getLocalStorageSummary(){
    const read=key=>{try{return localStorage.getItem(key);}catch(e){return null;}};
    const log=safeJsonParse(read('sous_log'),{});
    const recipes=safeJsonParse(read('sous_recipes'),[]);
    const usualMeals=safeJsonParse(read('sous_usual_meals'),{});
    const mealMemories=safeJsonParse(read('sous_meal_memories_v1'),[]);
    const customFoods=safeJsonParse(read('userCustomFoods'),[]);
    const knownKeys={
      sous_profile:summariseStorageKey('sous_profile','object'),
      sous_weights:summariseStorageKey('sous_weights','array'),
      sous_log:summariseStorageKey('sous_log','object'),
      sous_recipes:summariseStorageKey('sous_recipes','array'),
      sous_recent_ingredients:summariseStorageKey('sous_recent_ingredients','array'),
      sous_usual_meals:summariseStorageKey('sous_usual_meals','object'),
      sous_meal_memories_v1:summariseStorageKey('sous_meal_memories_v1','array'),
      userCustomFoods:summariseStorageKey('userCustomFoods','array'),
      userFoodOverrides:summariseStorageKey('userFoodOverrides','object'),
      sous_custom_serving_units:summariseStorageKey('sous_custom_serving_units','object'),
      sous_voice_input_mode:summariseStorageKey('sous_voice_input_mode','string'),
      sous_voice_feedback:summariseStorageKey('sous_voice_feedback','string'),
      sous_realtime_voice:summariseStorageKey('sous_realtime_voice','string'),
      sous_test_mode:summariseStorageKey('sous_test_mode','string')
    };
    let totalKeys=0, sousKeyCount=0, knownPresentCount=0;
    try{
      totalKeys=localStorage.length;
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(key.startsWith('sous_')) sousKeyCount++;
      }
      knownPresentCount=Object.values(knownKeys).filter(item=>item.present).length;
    }catch(e){}
    return {
      totalKeys,
      sousKeyCount,
      knownPresentCount,
      unknownKeyCount:Math.max(0,totalKeys-knownPresentCount),
      knownKeys,
      sensitiveCounts:{
        logDayCount:Object.keys(log||{}).length,
        totalMealCount:countLoggedMealsSafe(log),
        recipeCount:Array.isArray(recipes)?recipes.length:0,
        usualMealCount:countUsualMealsSafe(usualMeals),
        mealMemoryCount:Array.isArray(mealMemories)?mealMemories.length:0,
        customFoodCount:Array.isArray(customFoods)?customFoods.length:0
      }
    };
  }

  function getCurrentMealSummary(){
    const rows=getMealRowsFromVoiceState();
    return {
      itemCount:Array.isArray(rows)?rows.length:0,
      hasPendingQuantity:!!getPendingQuantity(),
      hasPendingClarification:!!getPendingClarification()
    };
  }

  function buildDiagnosticsReport(note=''){
    const photoEstimateState=getPhotoEstimateState();
    const voiceState=getVoiceState();
    return {
      app:'Jot',
      reportType:'beta-diagnostics',
      schemaVersion:1,
      testerNote:String(note||'').trim(),
      timestamp:new Date().toISOString(),
      ...getAppVersionInfo(),
      currentURL:location.href,
      userAgent:navigator.userAgent,
      standalonePWA:getStandaloneMode(),
      online:navigator.onLine,
      currentTab:getCurrentTab(),
      currentScreen:getCurrentScreen(),
      selectedDate:getSelectedDate(),
      currentMealSummary:getCurrentMealSummary(),
      currentVoiceInputMode:getVoiceInputModeSummary(),
      voiceStatus:getVoiceStatusSummary(voiceState),
      voiceState:getSafeVoiceState(voiceState),
      lastTranscriptText:getLastTranscriptText(),
      voiceTrace:getVoiceTrace(),
      voiceDecisionTrace:getVoiceDecisionTrace(),
      voiceTestEvents:getVoiceTestEvents(),
      photoEstimateState,
      hasPhotoEstimate:photoEstimateState.hasPhotoEstimate,
      photoEstimateItemCount:photoEstimateState.photoEstimateItemCount,
      photoAdjustInProgress:photoEstimateState.photoAdjustInProgress,
      lastPhotoAdjustError:photoEstimateState.lastPhotoAdjustError,
      photoTimingTrace:getPhotoTimingTrace(),
      barcodeTimingTrace:getBarcodeTimingTrace(),
      lastPhotoEstimateError:getLastPhotoError(),
      lastBarcodeError:getLastBarcodeError(),
      localStorageSummary:getLocalStorageSummary(),
      recentConsoleErrors:consoleErrors.slice(-20)
    };
  }

  function buildBugReport(note=''){
    return buildDiagnosticsReport(note);
  }

  function reportText(note=''){
    return JSON.stringify(buildDiagnosticsReport(note),null,2);
  }

  function fallbackCopy(text){
    return new Promise(resolve=>{
      try{
        const textarea=document.createElement('textarea');
        textarea.value=text;
        textarea.setAttribute('readonly','');
        textarea.style.cssText='position:fixed;left:-9999px;top:0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok=document.execCommand('copy');
        textarea.remove();
        resolve(ok);
      }catch(e){resolve(false);}
    });
  }

  async function copyText(text){
    if(navigator.clipboard?.writeText){
      try{
        await navigator.clipboard.writeText(text);
        return true;
      }catch(e){}
    }
    return fallbackCopy(text);
  }

  async function copyBugReport(note=''){
    const text=reportText(note);
    const copied=await copyText(text);
    if(!copied) {
      throw new Error('Clipboard copy failed. Select and copy the report text below.');
    }
    return text;
  }

  function downloadBugReport(note=''){
    const report=buildDiagnosticsReport(note);
    const stamp=report.timestamp.replace(/[:.]/g,'-').slice(0,19);
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='jot-diagnostics-'+stamp+'.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return report;
  }

  function showFallbackReport(text){
    const output=document.getElementById('bug-report-output');
    if(!output) return;
    output.value=text;
    output.style.display='block';
    output.focus();
    output.select();
  }

  function hideFallbackReport(){
    const output=document.getElementById('bug-report-output');
    if(!output) return;
    output.value='';
    output.style.display='none';
  }

  function enableTestMode(){
    try{localStorage.setItem(TEST_MODE_KEY,'1');}catch(e){}
    syncButton();
    return true;
  }

  function disableTestMode(){
    try{localStorage.setItem(TEST_MODE_KEY,'0');}catch(e){}
    syncButton();
    return true;
  }

  function wireBugReport(){
    persistUrlTestMode();
    bugButton=document.getElementById('bug-report-button');
    modal=document.getElementById('bug-report-modal');
    noteInput=document.getElementById('bug-report-note');
    statusEl=document.getElementById('bug-report-status');
    const closeBtn=document.getElementById('bug-report-close');
    const cancelBtn=document.getElementById('bug-report-cancel');
    const copyBtn=document.getElementById('bug-report-copy');
    const downloadBtn=document.getElementById('bug-report-download');

    bugButton?.addEventListener('click',openBugModal);
    document.getElementById('profile-diagnostics-btn')?.addEventListener('click',openBugModal);
    closeBtn?.addEventListener('click',closeBugModal);
    cancelBtn?.addEventListener('click',closeBugModal);
    modal?.addEventListener('click',event=>{if(event.target===modal) closeBugModal();});
    copyBtn?.addEventListener('click',async()=>{
      setStatus('Copying...');
      hideFallbackReport();
      const text=reportText(noteInput?.value||'');
      try{
        const copied=await copyText(text);
        if(!copied) throw new Error('Clipboard copy failed. Select and copy the report text below.');
        setStatus('Copied. Send the diagnostics JSON to Stu on WhatsApp.');
      }catch(error){
        showFallbackReport(text);
        setStatus(error.message||'Could not copy bug report.');
      }
    });
    downloadBtn?.addEventListener('click',()=>{
      try{
        hideFallbackReport();
        downloadBugReport(noteInput?.value||'');
        setStatus('Downloaded diagnostics JSON.');
      }catch(error){
        showFallbackReport(reportText(noteInput?.value||''));
        setStatus('Download failed. Select and copy the report text below.');
      }
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&modal?.classList.contains('show')) closeBugModal();
    });
    syncButton();
  }

  window.__sousEnableTestMode=enableTestMode;
  window.__sousDisableTestMode=disableTestMode;
  window.__sousCopyBugReport=copyBugReport;
  window.__sousDownloadBugReport=downloadBugReport;
  window.__sousBuildDiagnosticsReport=buildDiagnosticsReport;
  window.__sousBuildBugReport=buildBugReport;
  window.__sousRecentConsoleErrors=()=>consoleErrors.slice();

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wireBugReport);
  else wireBugReport();
})();
