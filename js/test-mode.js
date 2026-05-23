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

  function buildBugReport(note=''){
    let appVersion=null;
    try{
      appVersion=typeof SOUS_CACHE_VERSION!=='undefined'?SOUS_CACHE_VERSION:null;
    }catch(e){}
    return {
      testerNote:String(note||'').trim(),
      timestamp:new Date().toISOString(),
      appVersion,
      currentURL:location.href,
      userAgent:navigator.userAgent,
      standalonePWA:getStandaloneMode(),
      online:navigator.onLine,
      currentTab:getCurrentTab(),
      currentScreen:getCurrentScreen(),
      currentMealRows:getMealRowsFromVoiceState(),
      pendingQuantityState:getPendingQuantity(),
      pendingClarificationState:getPendingClarification(),
      voiceState:getVoiceState(),
      lastTranscriptText:getLastTranscriptText(),
      voiceTrace:getVoiceTrace(),
      voiceDecisionTrace:getVoiceDecisionTrace(),
      voiceTestEvents:getVoiceTestEvents(),
      photoTimingTrace:getPhotoTimingTrace(),
      barcodeTimingTrace:getBarcodeTimingTrace(),
      lastPhotoEstimateError:getLastPhotoError(),
      lastBarcodeError:getLastBarcodeError(),
      recentConsoleErrors:consoleErrors.slice(-20)
    };
  }

  function reportText(note=''){
    return JSON.stringify(buildBugReport(note),null,2);
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
      console.info('[Sous bug report]',text);
      throw new Error('Clipboard copy failed. Bug report was printed to the console.');
    }
    return text;
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

    bugButton?.addEventListener('click',openBugModal);
    closeBtn?.addEventListener('click',closeBugModal);
    cancelBtn?.addEventListener('click',closeBugModal);
    modal?.addEventListener('click',event=>{if(event.target===modal) closeBugModal();});
    copyBtn?.addEventListener('click',async()=>{
      setStatus('Copying...');
      try{
        await copyBugReport(noteInput?.value||'');
        setStatus('Copied. Send the error log to Stu on WhatsApp.');
      }catch(error){
        setStatus(error.message||'Could not copy bug report.');
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
  window.__sousBuildBugReport=buildBugReport;
  window.__sousRecentConsoleErrors=()=>consoleErrors.slice();

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wireBugReport);
  else wireBugReport();
})();
