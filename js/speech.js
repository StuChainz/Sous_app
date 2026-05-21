// ═══════════════════════════════════════════
// LOG STATE
// ═══════════════════════════════════════════
let meal=[], itemQueue=[], pendingFood=null, currentAmbig=null;
let tapRec=null, alwaysOnRec=null, clarificationRec=null, isRecording=false, alwaysOnActive=false, isSpeaking=false;
let voiceSessionActive=false, voiceCurrentlyListening=false, processingTranscript=false, voiceSessionStoppedManually=false, voiceSessionUseRealtime=false, voiceTestSessionActive=false;
let voiceRestartTimer=null, voiceProcessingTimer=null, voiceSpeakingTimer=null, voiceListeningWatchdogTimer=null, voiceRecognizerStartTimer=null, voiceNoSpeechRetries=0;
let voiceSessionState='idle', tapRecStarting=false, tapRecStopping=false, sousRealtimeStarting=false, voicePausedForVisibility=false, voiceMicWarmupActive=false;
let voiceRestartCount=0, voiceSuccessCueCount=0, voiceFlowCueCooldownUntil=0, voiceDebugOverlayEl=null, voiceDebugOverlayTimer=null, voiceDebugOverlayDismissed=false, voiceDebugOverlayUpdateQueued=false;
let voiceTapHardResetCount=0;
let voiceListenStartedAt=0;
let voiceTestEvents=[];
let voiceTranscriptTurn=0, activeVoiceTranscriptTurn=0, lastAcceptedTranscript='', lastAcceptedTranscriptAt=0;
let voiceSessionId=0, voiceRecognizerRunId=0;
let voiceOutcomeTurns=new Set();
let voicePromptOwner=null;
let _voiceMode=false;
let nextIngId=1;
let modalSelectedFood=null, modalActiveTab='search';
let undoSnapshot=null;
let _editBaseValues=null,_editFoodKey=null,_pendingOverride=null;
let currentMealSection=null;
let _inlineEditId=null,_inlineManualMacros=false,_confirmManualMacros=false;
let _pendingFoodChoice=null;
let sousRealtime=null;
let _lastSpeakAt=0;
let _suppressNextConfirmSpeechUntil=0;
let clarificationState=null;
let voiceRecoveryState={issue:null,attempts:0};
const VOICE_RESTART_MIN_MS=180;
const VOICE_RESTART_DEFAULT_MS=260;
const VOICE_POST_SPEECH_QUIET_MS=420;
const VOICE_LISTENING_STALL_MS=15000;
const VOICE_AUDIO_START_TIMEOUT_MS=1800;
const VOICE_TTS_START_TIMEOUT_MS=2500;
const VOICE_TTS_FALLBACK_START_TIMEOUT_MS=900;
const VOICE_PROCESSING_TIMEOUT_MS=10000;
const VOICE_SPEAKING_TIMEOUT_MS=14000;
const VOICE_MIC_WARMUP_TIMEOUT_MS=1800;
const VOICE_RECOGNIZER_START_TIMEOUT_MS=3500;
const VOICE_FLOW_CUE_MIN_SUCCESSES=3;
const VOICE_FLOW_CUE_COOLDOWN_MS=18000;
const VOICE_FLOW_CUE_CHANCE=0.55;
const VOICE_SESSION_STATES=new Set(['idle','listening','processing','speaking','restarting','error']);
const VOICE_DEBUG_KEY='sous_voice_debug_trace';
const VOICE_DEBUG_OVERLAY_KEY='sous_voice_debug_overlay';
const VOICE_DEBUG_LIMIT=200;
let voiceDebugEvents=[];
let voiceDebugSeq=0;

function voiceOwnerSnapshot(extra={}){
  return {
    sessionId:voiceSessionId,
    recognizerRunId:voiceRecognizerRunId,
    turnId:activeVoiceTranscriptTurn||null,
    promptOwner:voicePromptOwner?{...voicePromptOwner}:null,
    sessionActive:!!voiceSessionActive,
    voiceState:voiceSessionState,
    ...extra
  };
}
function isCurrentVoiceOwner(owner={}){
  if(owner.sessionId!=null&&owner.sessionId!==voiceSessionId) return false;
  if(owner.recognizerRunId!=null&&owner.recognizerRunId!==voiceRecognizerRunId) return false;
  if(owner.turnId!=null&&owner.turnId!==activeVoiceTranscriptTurn) return false;
  return true;
}
function traceStaleVoiceCallback(source,owner={},data={}){
  return voiceDebugTrace('stale_callback_ignored',{
    source,
    owner,
    currentOwner:voiceOwnerSnapshot(),
    ...data
  });
}
function nextVoiceSessionId(reason){
  voiceSessionId++;
  voiceDebugTrace('voice_owner_changed',{ownerType:'session',sessionId:voiceSessionId,reason});
  return voiceSessionId;
}
function nextVoiceRecognizerRunId(source,reason){
  voiceRecognizerRunId++;
  voiceDebugTrace('voice_owner_changed',{ownerType:'recognizer_run',source,recognizerRunId:voiceRecognizerRunId,reason});
  return voiceRecognizerRunId;
}

function voiceDebugClarificationSnapshot(){
  return clarificationState?.active?{
    active:true,
    baseItem:clarificationState.baseItem,
    originalTranscript:clarificationState.originalTranscript||null,
    family:clarificationState.family||null,
    step:clarificationState.step,
    missingFields:clarificationState.missingFields||[],
    knownQuantity:clarificationState.knownQuantity??null,
    knownUnit:clarificationState.knownUnit||null,
    candidateFood:clarificationState.candidateFood?.name||null,
    defaultFood:clarificationState.defaultFood?.name||null,
    mealSection:clarificationState.mealSection||null,
    attempts:clarificationState.attempts||0
  }:null;
}
function voiceDebugResultSummary(results){
  return (results||[]).map(r=>{
    if(!r) return null;
    if(r.command) return {command:r.command,target:r.target||null,replacement:r.replacement||null,grams:r.grams||null};
    if(r.ambiguous) return {ambiguous:true,label:r.label||null,amount:r.amount||null,matches:(r.matches||[]).map(f=>f.name).slice(0,4)};
    return {
      name:r.name||null,
      weight:r.weight||null,
      weightSpecified:!!r.weightSpecified,
      confidence:r.confidence||null,
      needsConfirm:!!r.needsConfirm,
      rawFood:r.rawFood?.name||null
    };
  }).filter(Boolean);
}
function voiceDebugContextSnapshot(){
  const nav=typeof navigator!=='undefined'?navigator:null;
  const win=typeof window!=='undefined'?window:null;
  let standalone=false, silentMode=false, realtimeEnabled=false;
  try{standalone=!!(win&&win.matchMedia&&win.matchMedia('(display-mode: standalone)').matches)||!!nav?.standalone;}catch(e){}
  try{silentMode=localStorage.getItem('sous_voice_feedback')==='0';}catch(e){}
  try{realtimeEnabled=localStorage.getItem('sous_realtime_voice')==='1'||new URLSearchParams(location.search).get('realtime')==='1';}catch(e){}
  return {
    visibility:typeof document!=='undefined'?document.visibilityState:null,
    standalone,
    online:nav?nav.onLine:null,
    userAgent:nav?String(nav.userAgent||'').slice(0,160):null,
    speechRecognition:!!(win&&(win.SpeechRecognition||win.webkitSpeechRecognition)),
    speechSynthesis:!!(win&&win.speechSynthesis),
    realtimeEnabled,
    silentMode,
    currentTab:typeof currentTab!=='undefined'?currentTab:null,
    logScreen:typeof document!=='undefined'?(document.querySelector('.log-screen.active')?.id||null):null
  };
}
function recordVoiceTestEvent(type,entry){
  const harnessAllowed=typeof sousVoiceTestHarnessAllowed==='function'&&sousVoiceTestHarnessAllowed();
  if(!voiceTestSessionActive&&!harnessAllowed&&!['transcript received','session paused'].includes(type)) return;
  const item={
    t:new Date().toISOString(),
    type,
    event:entry?.event||null,
    voiceState:voiceSessionState,
    activeScreen:typeof document!=='undefined'?(document.querySelector('.log-screen.active')?.id||null):null,
    transcript:entry?.transcript??entry?.originalTranscript??null,
    route:entry?.route||null,
    prompt:entry?.prompt||null,
    action:entry?.action||null,
    key:entry?.key||null,
    reason:entry?.reason||entry?.issue||null,
    turnId:entry?.turnId??null,
    outcome:entry?.outcome||null,
    screen:entry?.screen||null,
    routeDetail:entry?.routeDetail||null,
    results:entry?.results||entry?.items||null,
    item:entry?.item||null
  };
  voiceTestEvents.push(item);
  if(voiceTestEvents.length>500) voiceTestEvents=voiceTestEvents.slice(-500);
}
function recordVoiceTestEventFromTrace(entry){
  if(!entry) return;
  const directEvents=new Set([
    'transcript_turn_started',
    'transcript_accepted',
    'outcome_decided',
    'ui_updated',
    'voice_feedback_requested',
    'voice_feedback_started',
    'voice_feedback_ended',
    'voice_feedback_played',
    'voice_feedback_blocked',
    'silent_mode_skipped_feedback',
    'fallback_timer_started',
    'fallback_timer_cancelled',
    'fallback_timer_ignored_stale_turn',
    'session_restart_requested',
    'session_restart_completed',
    'session_start',
    'session_stop',
    'recognizer_start',
    'recognizer_end',
    'recognizer_error',
    'no_speech',
    'interim_transcript',
    'final_transcript',
    'quantity_prompt_shown',
    'multi_confirm_voice_prompt',
    'fallback_shown',
    'ingredient_added'
  ]);
  if(directEvents.has(entry.event)) recordVoiceTestEvent(entry.event,entry);
  if(entry.event==='transcript_heard') recordVoiceTestEvent('transcript received',entry);
  if(entry.event==='parser_result') recordVoiceTestEvent('parser result',entry);
  if(entry.event==='clarification_prompt'||entry.event==='clarification_shown'||entry.event==='clarification_started') recordVoiceTestEvent('clarification shown',entry);
  if(entry.event==='multi_confirm_voice_prompt') recordVoiceTestEvent('clarification shown',entry);
  if(entry.event==='ingredient_added') recordVoiceTestEvent('ingredient row added',entry);
  if(entry.event==='feedback_audio') recordVoiceTestEvent('voice feedback requested',entry);
  if(entry.event==='state_transition'&&/page hidden|pagehide|screen leave|session stopped|test session stopped/i.test(entry.reason||'')) recordVoiceTestEvent('session paused',entry);
  if(entry.event==='test_session_stopped') recordVoiceTestEvent('session paused',entry);
  if(entry.event==='test_session_listening'||(entry.event==='state_transition'&&/restart/i.test(entry.reason||''))) recordVoiceTestEvent('session restarted',entry);
  if(entry.event==='voice_error'||entry.event==='voice_recovery'||entry.event==='transcript_rejected') recordVoiceTestEvent('error/fallback shown',entry);
  if(entry.event==='fallback_shown'||entry.event==='no_speech') recordVoiceTestEvent('error/fallback shown',entry);
  if(entry.event==='final_action'&&['fallback_resolve_ui','voice_retry'].includes(entry.action)) recordVoiceTestEvent('error/fallback shown',entry);
}
function voiceDebugTrace(event,data={}){
  const screen=typeof document!=='undefined'?(document.querySelector('.log-screen.active')?.id||null):null;
  const entry={
    t:new Date().toISOString(),
    ts:Date.now(),
    seq:++voiceDebugSeq,
    event,
    voiceState:voiceSessionState,
    sessionActive:!!voiceSessionActive,
    sessionId:voiceSessionId,
    recognizerRunId:voiceRecognizerRunId,
    recognizerActive:!!(voiceCurrentlyListening||isRecording||clarificationRec||(sousRealtime&&sousRealtime.active)),
    promptOwner:voicePromptOwner?{...voicePromptOwner}:null,
    screen,
    turnId:data.turnId??(activeVoiceTranscriptTurn||null),
    ...data
  };
  voiceDebugEvents.push(entry);
  if(voiceDebugEvents.length>VOICE_DEBUG_LIMIT) voiceDebugEvents=voiceDebugEvents.slice(-VOICE_DEBUG_LIMIT);
  recordVoiceTestEventFromTrace(entry);
  if(voiceDebugConsoleEnabled()) console.debug('[Sous Voice Debug]',entry);
  updateVoiceDebugOverlaySoon();
  return entry;
}
function setVoicePromptOwner(type,data={}){
  voicePromptOwner={
    type,
    turnId:data.turnId??(activeVoiceTranscriptTurn||null),
    prompt:data.prompt||null,
    item:data.item||null,
    screen:typeof document!=='undefined'?(document.querySelector('.log-screen.active')?.id||null):null,
    startedAt:Date.now()
  };
  voiceDebugTrace('prompt_owner_set',{owner:voicePromptOwner});
  return voicePromptOwner;
}
function clearVoicePromptOwner(reason='resolved'){
  if(!voicePromptOwner) return;
  const owner=voicePromptOwner;
  voicePromptOwner=null;
  voiceDebugTrace('prompt_owner_cleared',{owner,reason});
}
function voiceDebugConsoleEnabled(){
  try{return voiceDebugOverlayEnabled()||localStorage.getItem('sous_voice_debug_console')==='true'||new URLSearchParams(location.search).get('voiceDebug')==='1';}
  catch(e){return false;}
}
function pendingQuantitySnapshot(){
  if(!pendingFood) return null;
  return {
    active:document.querySelector('.log-screen.active')?.id==='ls-quantity',
    name:pendingFood.name||null,
    weight:pendingFood.weight??null,
    weightSpecified:!!pendingFood.weightSpecified,
    serving:pendingFood.serving?{...pendingFood.serving}:null,
    rawFood:pendingFood.rawFood?.name||null,
    usualMealOption:pendingFood.usualMealOption?.name||null
  };
}
function currentMealRowsSnapshot(){
  return meal.map(item=>({
    id:item.id??null,
    name:item.name||null,
    weight:item.weight??null,
    serving:item.serving?{...item.serving}:null,
    kcal:item.kcal??null,
    protein:item.protein??null,
    carbs:item.carbs??null,
    fat:item.fat??null,
    rawFood:item.rawFood?.name||null
  }));
}
function sousVoiceDebugExport(){
  return {
    createdAt:new Date().toISOString(),
    note:'Local debug export only. Sous does not upload this automatically.',
    owner:voiceOwnerSnapshot(),
    trace:voiceDebugEvents.slice(),
    voiceState:sousVoiceStateSnapshot(),
    context:voiceDebugContextSnapshot(),
    pendingClarification:voiceDebugClarificationSnapshot(),
    pendingQuantity:pendingQuantitySnapshot(),
    currentMealRows:currentMealRowsSnapshot()
  };
}
function voiceDebugTracePayload(){
  return JSON.stringify(sousVoiceDebugExport(),null,2);
}
function copyTextToClipboard(text){
  if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(()=>true);
  return new Promise(resolve=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=text;
      ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok=document.execCommand('copy');
      ta.remove();
      resolve(ok);
    }catch(e){resolve(false);}
  });
}
window.sousVoiceDebug=()=>voiceDebugEvents.slice();
window.clearSousVoiceDebug=()=>{voiceDebugEvents=[];voiceDebugSeq=0;try{localStorage.removeItem(VOICE_DEBUG_KEY);}catch(e){};return true;};
window.__sousVoiceTrace=()=>voiceDebugEvents.slice();
window.__sousPrintVoiceTrace=()=>{
  const trace=voiceDebugEvents.slice();
  console.table(trace.map(e=>({seq:e.seq,t:e.t,event:e.event,turnId:e.turnId,state:e.voiceState,source:e.source||'',route:e.route||'',text:e.transcript||e.prompt||e.key||e.reason||e.error||''})));
  return trace;
};
window.__sousExportVoiceDebug=sousVoiceDebugExport;
window.__sousCopyVoiceTrace=()=>copyTextToClipboard(voiceDebugTracePayload());

function voiceDebugOverlayEnabled(){
  try{return !voiceDebugOverlayDismissed&&localStorage.getItem(VOICE_DEBUG_OVERLAY_KEY)==='true';}
  catch(e){return false;}
}
function voiceDebugDevMode(){
  try{
    const host=location.hostname;
    return location.protocol==='file:'||
      host==='localhost'||host==='127.0.0.1'||host==='[::1]'||host==='::1'||
      new URLSearchParams(location.search).get('voiceDebug')==='1'||
      localStorage.getItem('sous_voice_debug_dev')==='true';
  }catch(e){return false;}
}
function setVoiceDebugOverlayEnabled(enabled){
  try{localStorage.setItem(VOICE_DEBUG_OVERLAY_KEY,enabled?'true':'false');}catch(e){}
  voiceDebugOverlayDismissed=false;
  updateVoiceDebugOverlay();
  return enabled;
}
window.__sousToggleVoiceDebugPanel=()=>setVoiceDebugOverlayEnabled(!voiceDebugOverlayEnabled());
function latestVoiceDebugEntry(list,predicate){
  for(let i=list.length-1;i>=0;i--){
    if(predicate(list[i])) return list[i];
  }
  return null;
}
function voiceLifecycleSnapshot(opts={}){
  const includeAlwaysOn=!!opts.includeAlwaysOn;
  return {
    state:voiceSessionState,
    sessionId:voiceSessionId,
    recognizerRunId:voiceRecognizerRunId,
    owner:voiceOwnerSnapshot(),
    sessionActive:!!voiceSessionActive,
    testSessionActive:!!voiceTestSessionActive,
    recognizerActive:!!(voiceCurrentlyListening||isRecording||(includeAlwaysOn&&alwaysOnActive)||clarificationRec||(sousRealtime&&sousRealtime.active)),
    voiceCurrentlyListening:!!voiceCurrentlyListening,
    isRecording:!!isRecording,
    tapRecStarting:!!tapRecStarting,
    tapRecStopping:!!tapRecStopping,
    tapHardResetCount:voiceTapHardResetCount,
    processing:!!processingTranscript,
    speaking:!!isSpeaking,
    restartCount:voiceRestartCount
  };
}
function shortVoiceDebugText(value){
  if(value==null||value==='') return '—';
  const text=typeof value==='string'?value:JSON.stringify(value);
  return text.length>72?text.slice(0,69)+'...':text;
}
function escapeVoiceDebugHtml(value){
  return String(value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}
function copyVoiceDebugTrace(button){
  const payload=voiceDebugTracePayload();
  const done=ok=>{
    if(button){
      const original=button.dataset.label||button.textContent||'copy';
      button.dataset.label=original;
      button.textContent=ok?'copied':'failed';
      setTimeout(()=>{button.textContent=button.dataset.label||original;},1400);
    }
  };
  copyTextToClipboard(payload).then(done).catch(()=>done(false));
}
function summarizeVoiceDebugAction(entry){
  if(!entry) return '—';
  if(entry.event==='final_action') return shortVoiceDebugText(entry.action||entry.command||entry.event);
  if(entry.event==='parser_result') return shortVoiceDebugText('parser '+((entry.results||[]).length)+' result'+((entry.results||[]).length===1?'':'s'));
  if(entry.event==='ai_result') return shortVoiceDebugText('ai '+((entry.items||[]).length)+' item'+((entry.items||[]).length===1?'':'s'));
  if(entry.event==='transcript_routed') return shortVoiceDebugText('route '+(entry.route||'unknown'));
  if(entry.event==='transcript_repaired') return shortVoiceDebugText('repaired '+(entry.from||'')+' -> '+(entry.to||''));
  if(entry.event==='voice_timing') return shortVoiceDebugText('timing '+(entry.totalMs||entry.processingMs||0)+'ms');
  if(entry.event==='voice_recovery') return shortVoiceDebugText('recovery '+(entry.issue||'unknown'));
  return shortVoiceDebugText(entry.event);
}
function voiceDebugOverlaySnapshot(){
  const list=window.sousVoiceDebug?window.sousVoiceDebug():[];
  const transcriptEntry=latestVoiceDebugEntry(list,e=>e&&(
    e.event==='transcript_heard'||
    e.event==='clarification_heard'||
    e.transcript||
    e.rawText
  ));
  const actionEntry=latestVoiceDebugEntry(list,e=>e&&[
    'final_action',
    'parser_result',
    'ai_result',
    'transcript_repaired',
    'transcript_routed',
    'voice_timing',
    'voice_recovery'
  ].includes(e.event));
  const errorEntry=latestVoiceDebugEntry(list,e=>e&&(
    e.event==='voice_error'||
    e.event==='ai_error'||
    e.error||
    e.message
  ));
  const transitionEntry=latestVoiceDebugEntry(list,e=>e&&e.event==='state_transition');
  const transcriptText=document.getElementById('transcript-text')?.textContent||'';
  return {
    ...voiceLifecycleSnapshot({includeAlwaysOn:true}),
    lastTranscript:shortVoiceDebugText(transcriptEntry?.transcript||transcriptEntry?.rawText||transcriptText.replace(/^"|"$/g,'')),
    lastAction:summarizeVoiceDebugAction(actionEntry),
    lastError:shortVoiceDebugText(errorEntry?.error||errorEntry?.message||errorEntry?.issue),
    lastReason:shortVoiceDebugText(transitionEntry?.reason)
  };
}
function ensureVoiceDebugOverlay(){
  if(!voiceDebugOverlayEnabled()){
    if(voiceDebugOverlayEl) voiceDebugOverlayEl.style.display='none';
    if(voiceDebugOverlayTimer){clearInterval(voiceDebugOverlayTimer);voiceDebugOverlayTimer=null;}
    return null;
  }
  if(!document.body) return null;
  if(!voiceDebugOverlayEl){
    const el=document.createElement('div');
    el.id='voice-debug-overlay';
    el.setAttribute('aria-live','polite');
    el.style.cssText=[
      'position:fixed',
      'right:10px',
      'bottom:10px',
      'z-index:99999',
      'width:min(310px,calc(100vw - 20px))',
      'max-height:42vh',
      'overflow:auto',
      'padding:9px 10px',
      'border-radius:8px',
      'background:rgba(10,14,18,.92)',
      'color:#f8fafc',
      'box-shadow:0 8px 28px rgba(0,0,0,.3)',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'letter-spacing:0',
      'text-align:left',
      'pointer-events:auto'
    ].join(';');
    const buttonStyle='border:0;background:rgba(255,255,255,.14);color:#fff;border-radius:5px;height:22px;padding:0 7px;font:11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    el.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px"><strong style="font-size:11px">Voice debug</strong><div style="display:flex;gap:5px"><button type="button" data-copy-trace style="'+buttonStyle+'">copy</button><button type="button" data-close-overlay aria-label="Close voice debug overlay" style="'+buttonStyle+';width:22px;padding:0">x</button></div></div><div data-voice-debug-rows></div>';
    el.querySelector('[data-copy-trace]').addEventListener('click',e=>copyVoiceDebugTrace(e.currentTarget));
    el.querySelector('[data-close-overlay]').addEventListener('click',()=>{
      voiceDebugOverlayDismissed=true;
      if(voiceDebugOverlayEl) voiceDebugOverlayEl.style.display='none';
      if(voiceDebugOverlayTimer){clearInterval(voiceDebugOverlayTimer);voiceDebugOverlayTimer=null;}
    });
    document.body.appendChild(el);
    voiceDebugOverlayEl=el;
  }
  voiceDebugOverlayEl.style.display='block';
  if(!voiceDebugOverlayTimer) voiceDebugOverlayTimer=setInterval(updateVoiceDebugOverlay,1000);
  return voiceDebugOverlayEl;
}
function updateVoiceDebugOverlay(){
  const el=ensureVoiceDebugOverlay();
  if(!el) return;
  const s=voiceDebugOverlaySnapshot();
  const rows=[
    ['state',s.state],
    ['recognizer',s.recognizerActive?'yes':'no'],
    ['session',s.sessionActive?'yes':'no'],
    ['transcript',s.lastTranscript],
    ['action',s.lastAction],
    ['error',s.lastError],
    ['restarts',s.restartCount],
    ['reason',s.lastReason]
  ];
  const rowsEl=el.querySelector('[data-voice-debug-rows]');
  if(rowsEl){
    rowsEl.innerHTML=rows.map(([k,v])=>'<div style="display:grid;grid-template-columns:78px 1fr;gap:7px;margin:2px 0"><span style="color:#94a3b8">'+escapeVoiceDebugHtml(k)+'</span><span style="word-break:break-word">'+escapeVoiceDebugHtml(v)+'</span></div>').join('');
  }
}
function updateVoiceDebugOverlaySoon(){
  if(!voiceDebugOverlayEnabled()||voiceDebugOverlayUpdateQueued) return;
  voiceDebugOverlayUpdateQueued=true;
  setTimeout(()=>{
    voiceDebugOverlayUpdateQueued=false;
    updateVoiceDebugOverlay();
  },0);
}

function snapshotMeal(){undoSnapshot=meal.map(i=>({...i}));updateUndoBtn();}
function updateUndoBtn(){const r=document.getElementById('undo-row');if(r)r.style.display=undoSnapshot?'flex':'none';}
function _persistDraft(){
  if(typeof saveDraft!=='function') return;
  const quick=typeof currentQuickMode!=='undefined'&&currentQuickMode;
  const editing=typeof currentEditMealId!=='undefined'&&currentEditMealId;
  if(quick||editing) return;
  const ingredients=meal.map(i=>({...i}));
  const draft=typeof createMealDraft==='function'
    ? createMealDraft({section:currentMealSection||null,source:'cooking-session',ingredients})
    : {section:currentMealSection||null,ingredients:[]};
  draft.meal=ingredients;
  draft.savedAt=Date.now();
  saveDraft(draft);
}
function undoLastAction(){
  if(!undoSnapshot) return;
  meal.length=0; undoSnapshot.forEach(i=>meal.push(i));
  undoSnapshot=null; updateUndoBtn(); renderCurrentMeal(); showToast('Undone');
  speakCachedResponse('undone');
  _persistDraft();
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION CONSTRUCTOR
// ═══════════════════════════════════════════
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

function cookingModeEnabled(){
  try{return localStorage.getItem('sous_cooking_mode')==='1';}
  catch(e){return false;}
}
function logVoiceState(event,extra={}){
  console.log('[Sous Voice State]',{
    event,
    voiceSessionState,
    voiceSessionActive,
    voiceCurrentlyListening,
    processingTranscript,
    tapRecStarting,
    tapRecStopping,
    voiceMicWarmupActive,
    realtimeStarting:sousRealtimeStarting,
    clarificationActive:!!(clarificationRec||clarificationState?.active),
    realtimeActive:!!(sousRealtime&&sousRealtime.active),
    recognitionExists:!!tapRec,
    ...extra
  });
}
function setVoiceSessionState(nextState,reason,data={}){
  if(!VOICE_SESSION_STATES.has(nextState)) return voiceSessionState;
  const previousState=voiceSessionState;
  if(previousState===nextState) return voiceSessionState;
  voiceSessionState=nextState;
  voiceDebugTrace('state_transition',{
    previousState,
    nextState,
    reason,
    timestamp:new Date().toISOString(),
    ...data
  });
  voiceDebugTrace('state_change',{
    from:previousState,
    to:nextState,
    reason,
    ...data
  });
  return voiceSessionState;
}
function clearVoiceRestartTimer(){
  if(voiceRestartTimer){
    clearTimeout(voiceRestartTimer);
    voiceRestartTimer=null;
  }
}
function clearVoiceProcessingTimer(){
  if(voiceProcessingTimer){
    clearTimeout(voiceProcessingTimer);
    voiceProcessingTimer=null;
  }
}
function clearVoiceSpeakingTimer(){
  if(voiceSpeakingTimer){
    clearTimeout(voiceSpeakingTimer);
    voiceSpeakingTimer=null;
  }
}
function clearVoiceListeningWatchdog(){
  if(voiceListeningWatchdogTimer){
    clearTimeout(voiceListeningWatchdogTimer);
    voiceListeningWatchdogTimer=null;
  }
}
function clearVoiceRecognizerStartTimer(){
  if(voiceRecognizerStartTimer){
    clearTimeout(voiceRecognizerStartTimer);
    voiceRecognizerStartTimer=null;
  }
}
function clearVoiceTimers(){
  clearVoiceRestartTimer();
  clearVoiceProcessingTimer();
  clearVoiceSpeakingTimer();
  clearVoiceListeningWatchdog();
  clearVoiceRecognizerStartTimer();
}
function isVoiceSilentMode(){
  try{return typeof localStorage!=='undefined'&&localStorage.getItem('sous_voice_feedback')==='0';}
  catch(e){return false;}
}
function finishSkippedVoiceFeedback(onEnd){
  if(onEnd){setTimeout(onEnd,0);return;}
  if(voiceSessionActive&&document.querySelector('.log-screen.active')?.id==='ls-listening'){
    scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
  }
}
function startVoiceListeningWatchdog(source='tap'){
  clearVoiceListeningWatchdog();
  voiceListeningWatchdogTimer=setTimeout(()=>{
    voiceListeningWatchdogTimer=null;
    if(!voiceSessionActive||voiceSessionState!=='listening'||processingTranscript||isSpeaking) return;
    voiceDebugTrace('voice_recovery',{issue:'listening_stalled',source});
    voiceDebugTrace('voice_error',{source,error:'listening_stalled'});
    logVoiceState('listening watchdog restart',{source});
    if(source==='realtime'||(sousRealtime&&sousRealtime.active)){
      voiceSessionUseRealtime=false;
      stopSousRealtimeVoice(false);
    } else if(source==='tap'&&!tapRecognizerHasHeardSpeech()){
      recoverTapRecognizerStack('listening_stalled_no_audio',voiceOwnerSnapshot({source:'tap'}),{warmup:true,trace:false});
      return;
    } else {
      requestTapStop('listening stalled');
      stopTapRec();
    }
    if(voiceSessionActive) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
  },VOICE_LISTENING_STALL_MS);
}
function resetVoiceRecovery(){
  voiceRecoveryState={issue:null,attempts:0};
}
function beginVoiceTranscriptTurn(transcript){
  const turnId=++voiceTranscriptTurn;
  activeVoiceTranscriptTurn=turnId;
  lastAcceptedTranscript=String(transcript||'').trim();
  lastAcceptedTranscriptAt=Date.now();
  voiceDebugTrace('transcript_turn_started',{turnId,transcript:lastAcceptedTranscript});
  return turnId;
}
function isCurrentVoiceTranscriptTurn(turnId){
  return !!turnId&&turnId===activeVoiceTranscriptTurn;
}
function markVoiceOutcome(turnId,outcome,data={}){
  if(!turnId||voiceOutcomeTurns.has(turnId)) return false;
  voiceOutcomeTurns.add(turnId);
  voiceDebugTrace('outcome_decided',{turnId,outcome,...data});
  return true;
}
function voiceRecoveryPrompt(issue){
  if(issue==='partial') return 'Say that again';
  return "Didn't catch that";
}
function transcriptRecoveryIssue(transcript,isLowConfidence){
  if(!voiceSessionActive||clarificationState?.active) return null;
  if(isLowConfidence) return 'low_confidence';
  if(typeof parseText!=='function') return null;
  const results=parseText(transcript);
  const reason=typeof aiEscalationReason==='function'
    ?aiEscalationReason(transcript,results)
    :(!results||!results.length?'empty':'none');
  if(reason==='empty'){
    const text=String(transcript||'').trim();
    if(/[a-z]{2,}/i.test(text)&&text.split(/\s+/).filter(Boolean).length>1) return null;
    return 'empty';
  }
  if(reason==='partial'){
    const foods=Array.isArray(results)?results.filter(r=>r&&!r.command):[];
    if(foods.length&&/\b(?:and|with|plus)\b|[,;]/i.test(String(transcript||''))) return null;
    return 'partial';
  }
  return null;
}
function maybeRecoverVoiceTranscript(issue,transcript,turnId=null){
  if(!issue||!voiceSessionActive) return false;
  if(turnId&&!isCurrentVoiceTranscriptTurn(turnId)){
    voiceDebugTrace('fallback_timer_ignored_stale_turn',{turnId,currentTurnId:activeVoiceTranscriptTurn,issue,transcript});
    return false;
  }
  if(voiceRecoveryState.issue===issue) voiceRecoveryState.attempts++;
  else voiceRecoveryState={issue,attempts:1};
  voiceDebugTrace('voice_recovery',{
    issue,
    attempt:voiceRecoveryState.attempts,
    transcript
  });
  if(voiceRecoveryState.attempts>1) return false;
  const prompt=voiceRecoveryPrompt(issue);
  const el=document.getElementById('transcript-text');
  if(el) el.textContent=prompt;
  voiceDebugTrace('ui_updated',{turnId,screen:document.querySelector('.log-screen.active')?.id||null,reason:'voice_recovery',prompt});
  showToast(prompt);
  markVoiceOutcome(turnId,'voice_recovery',{issue,prompt});
  speakRecoveryCue(()=>scheduleVoiceSessionRestart(300),{force:true});
  return true;
}
function quantityPromptCancelCommand(transcript){
  const text=typeof normaliseLogText==='function'
    ?normaliseLogText(transcript)
    :String(transcript||'').toLowerCase().trim();
  if(/^(cancel|cancel that|actually no|no|nope|never mind|nevermind|forget it|remove that|delete that|undo that)$/.test(text)){
    return {command:'cancelPendingQuantity'};
  }
  const command=typeof parseText==='function'?(parseText(text)||[]).find(r=>r&&r.command):null;
  if(!command||!pendingFood) return null;
  const pendingName=typeof normaliseLogText==='function'
    ?normaliseLogText(pendingFood.name||'')
    :String(pendingFood.name||'').toLowerCase().trim();
  const target=typeof normaliseLogText==='function'
    ?normaliseLogText(command.target||'')
    :String(command.target||'').toLowerCase().trim();
  if(command.command==='remove'&&target&&pendingName&&(target.includes(pendingName)||pendingName.includes(target))){
    return {command:'cancelPendingQuantity', target:command.target};
  }
  if(command.command==='undo') return {command:'cancelPendingQuantity'};
  return null;
}
function cancelPendingQuantityFromVoice(command,turnId){
  if(!pendingFood) return false;
  const name=pendingFood.name||command?.target||'item';
  pendingFood=null;
  clearVoicePromptOwner('quantity_cancelled');
  voiceDebugTrace('final_action',{action:'command',command:'remove',handled:true,reason:'pending_quantity_cancelled',target:name,turnId});
  showToast('Removed '+name);
  showLogScreen('listening');
  speakCachedResponse('deleted',{},()=>maybeResumeVoiceSession(250),{force:true});
  return true;
}
function handleVoiceMealFlowCommand(transcript,turnId){
  const text=typeof normaliseLogText==='function'
    ?normaliseLogText(transcript)
    :String(transcript||'').toLowerCase().trim();
  if(!/^(?:finish|finish this|finish the)\s+meal$/.test(text)) return false;
  if(!meal.length){
    const message='Add ingredients first';
    const el=document.getElementById('transcript-text');
    if(el) el.textContent=message;
    showToast(message);
    voiceDebugTrace('final_action',{action:'save_meal_empty',command:'save_meal',handled:true,turnId});
    markVoiceOutcome(turnId,'save_meal_empty',{transcript});
    speak('Try again',()=>scheduleVoiceSessionRestart(300),{force:true});
    return true;
  }
  voiceDebugTrace('final_action',{action:'summary',command:'save_meal',handled:true,turnId});
  markVoiceOutcome(turnId,'summary',{transcript});
  stopAllRec();
  showSummary();
  return true;
}
function logRestartBlocked(reason){
  console.log('[Sous Voice] restart blocked: '+reason);
  logVoiceState('restart blocked',{reason});
}
function voiceRestartBlockReason(){
  if(!voiceSessionActive) return 'session inactive';
  if(voicePausedForVisibility) return 'page hidden';
  if(voiceMicWarmupActive) return 'mic warming up';
  if(tapRecStarting) return 'recognition starting';
  if(tapRecStopping) return 'recognition stopping';
  if(voiceCurrentlyListening||isRecording) return 'already listening';
  if(processingTranscript||voiceSessionState==='processing') return 'processing transcript';
  if(isSpeaking||voiceSessionState==='speaking') return 'speaking';
  if(clarificationRec) return 'clarification active';
  const correction=document.getElementById('voice-correct-bar');
  if(correction&&correction.style.display!=='none') return 'clarification active';
  if(voiceSessionStoppedManually) return 'manually stopped';
  if(cookingModeEnabled()&&alwaysOnActive) return 'cooking mode owns recognizer';
  if(sousRealtimeStarting) return 'realtime starting';
  if(sousRealtime&&sousRealtime.active) return 'realtime owns recognizer';
  if(currentTab!=='log') return 'not on log tab';
  const active=document.querySelector('.log-screen.active');
  if(active&&active.id!=='ls-listening') return 'review active';
  return null;
}
function canRestartVoiceListening(){
  const reason=voiceRestartBlockReason();
  if(reason){logRestartBlocked(reason);return false;}
  return true;
}
function cancelTapFinalizer(reason='tap finalizer cancelled'){
  if(tapRec&&typeof tapRec.__sousCancelFinalizer==='function') tapRec.__sousCancelFinalizer(reason);
}
function tapRecognizerHasHeardSpeech(){
  return !!(tapRec&&typeof tapRec.__sousHasHeardSpeech==='function'&&tapRec.__sousHasHeardSpeech());
}
function hardResetTapRecognizer(reason='tap recognizer hard reset',owner=null){
  const rec=tapRec;
  voiceTapHardResetCount++;
  clearVoiceRecognizerStartTimer();
  clearVoiceListeningWatchdog();
  cancelTapFinalizer(reason);
  if(rec&&typeof rec.__sousSetOwner==='function'){
    rec.__sousSetOwner({...(owner||voiceOwnerSnapshot({source:'tap'})),recognizerRunId:-1,hardReset:true});
  }
  tapRec=null;
  tapRecStarting=false;
  tapRecStopping=false;
  voiceCurrentlyListening=false;
  isRecording=false;
  try{rec&&rec.abort&&rec.abort();}catch(e){
    try{rec&&rec.stop&&rec.stop();}catch(e2){}
  }
  if(voiceSessionState==='listening'||voiceSessionState==='restarting') setVoiceSessionState(voiceSessionActive?'restarting':'idle',reason);
  if(!isSpeaking&&!processingTranscript) setMicState(alwaysOnActive&&cookingModeEnabled()?'listening':'idle');
  voiceDebugTrace('tap_recognizer_hard_reset',{reason,count:voiceTapHardResetCount,owner:owner||null});
}
function recoverTapRecognizerStack(reason='tap recognizer recovery',owner=null,opts={}){
  if(opts.trace!==false){
    voiceDebugTrace('voice_recovery',{issue:reason,source:'tap',hardReset:true});
    voiceDebugTrace('voice_error',{source:'tap',error:reason});
  }
  hardResetTapRecognizer(reason,owner);
  if(!voiceSessionActive||processingTranscript||isSpeaking||voiceSessionStoppedManually) return;
  const restart=()=>{if(voiceSessionActive&&!processingTranscript&&!isSpeaking&&!voiceSessionStoppedManually) scheduleVoiceSessionRestart(opts.delay||VOICE_RESTART_DEFAULT_MS);};
  if(opts.warmup){
    warmUpVoiceInput().then(restart).catch(restart);
  } else restart();
}
function startTapRecognizerStartWatchdog(owner){
  clearVoiceRecognizerStartTimer();
  voiceRecognizerStartTimer=setTimeout(()=>{
    voiceRecognizerStartTimer=null;
    if(!isCurrentVoiceOwner(owner)){
      traceStaleVoiceCallback('tap_start_watchdog',owner,{source:'tap'});
      return;
    }
    if(!tapRecStarting||voiceCurrentlyListening||isRecording||voiceSessionState==='listening') return;
    recoverTapRecognizerStack('recognition_start_stalled',owner,{warmup:true,delay:VOICE_RESTART_DEFAULT_MS});
  },VOICE_RECOGNIZER_START_TIMEOUT_MS);
}
function requestTapStop(reason){
  if(!tapRec) return;
  clearVoiceRecognizerStartTimer();
  cancelTapFinalizer(reason||'tap stop requested');
  if(tapRecStopping) return;
  if(!isRecording&&!voiceCurrentlyListening&&!tapRecStarting) return;
  tapRecStopping=true;
  logVoiceState('recognition stop requested',{reason});
  voiceDebugTrace('recognizer_stop',{source:'tap',phase:'requested',reason});
  try{tapRec.stop();}
  catch(e){
    tapRecStopping=false;
    if(tapRecStarting) tapRecStarting=false;
  }
}
function stopRecognitionForState(reason){
  clearVoiceListeningWatchdog();
  clearVoiceRecognizerStartTimer();
  requestTapStop(reason);
  if(sousRealtime&&sousRealtime.active) stopSousRealtimeVoice(false);
  if(clarificationRec){
    try{clarificationRec.stop();}catch(e){}
    clarificationRec=null;
  }
  voiceCurrentlyListening=false;
  isRecording=false;
}
function setVoiceProcessing(active,reason='processing',opts={}){
  processingTranscript=!!active;
  clearVoiceProcessingTimer();
  if(processingTranscript){
    clearVoiceRestartTimer();
    if(!opts.keepRealtime) stopRecognitionForState(reason);
    else {voiceCurrentlyListening=false;isRecording=false;}
    setVoiceSessionState('processing',reason);
    setMicState('processing');
    voiceProcessingTimer=setTimeout(()=>{
      if(!processingTranscript) return;
      voiceDebugTrace('voice_recovery',{issue:'processing_timeout'});
      voiceDebugTrace('voice_error',{source:'voice_state',error:'processing_timeout'});
      if(sousRealtime&&sousRealtime.active) stopSousRealtimeVoice(false);
      processingTranscript=false;
      setVoiceSessionState('error','processing timeout');
      setMicState('idle');
      if(voiceSessionActive) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    },VOICE_PROCESSING_TIMEOUT_MS);
  } else if(voiceSessionState==='processing'){
    setVoiceSessionState(voiceSessionActive?'restarting':'idle',reason+' finished');
  }
}
function setVoiceSpeaking(active,reason='speaking',onTimeout,opts={}){
  clearVoiceSpeakingTimer();
  isSpeaking=!!active;
  if(isSpeaking){
    clearVoiceRestartTimer();
    stopRecognitionForState(reason);
    setVoiceSessionState('speaking',reason);
    setMicState('speaking');
    voiceSpeakingTimer=setTimeout(()=>{
      if(!isSpeaking) return;
      voiceDebugTrace('voice_recovery',{issue:'speaking_timeout'});
      voiceDebugTrace('voice_error',{source:'speech',error:'speaking_timeout'});
      try{if(window.speechSynthesis) window.speechSynthesis.cancel();}catch(e){}
      isSpeaking=false;
      setVoiceSessionState('error','speaking timeout');
      setMicState('idle');
      if(typeof onTimeout==='function') onTimeout();
      else if(voiceSessionActive) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    },VOICE_SPEAKING_TIMEOUT_MS);
  } else {
    if(voiceSessionState==='speaking') setVoiceSessionState(voiceSessionActive?'restarting':'idle',reason+' finished');
    if(opts.restart!==false&&voiceSessionActive&&document.querySelector('.log-screen.active')?.id==='ls-listening') scheduleVoiceSessionRestart(VOICE_POST_SPEECH_QUIET_MS);
    else if(!voiceSessionActive) setMicState('idle');
  }
}
function scheduleVoiceSessionRestart(delay=VOICE_RESTART_DEFAULT_MS){
  clearVoiceRestartTimer();
  const safeDelay=Math.max(VOICE_RESTART_MIN_MS,Math.min(700,Number(delay)||VOICE_RESTART_DEFAULT_MS));
  logVoiceState('restart scheduled',{delay:safeDelay});
  voiceDebugTrace('session_restart',{phase:'requested',delay:safeDelay,turnId:activeVoiceTranscriptTurn||null});
  voiceDebugTrace('session_restart_requested',{delay:safeDelay,turnId:activeVoiceTranscriptTurn||null});
  if(!isSpeaking&&!processingTranscript) setVoiceSessionState('restarting','restart scheduled',{delay:safeDelay});
  voiceRestartTimer=setTimeout(()=>{
    voiceRestartTimer=null;
    const block=voiceRestartBlockReason();
    if(block){
      logRestartBlocked(block);
      if(voiceSessionActive&&['processing transcript','speaking','recognition starting','recognition stopping','realtime starting'].includes(block)){
        scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
      }
      return;
    }
    console.log('[Sous Voice] restarting for next item');
    voiceRestartCount++;
    updateVoiceDebugOverlaySoon();
    logVoiceState('restarting for next item');
    if(voiceTestSessionActive){
      voiceCurrentlyListening=true;
      isRecording=false;
      setVoiceSessionState('listening','test session restart');
      setMicState('recording');
      voiceDebugTrace('session_restart',{phase:'completed',route:'test_session',restartCount:voiceRestartCount,turnId:activeVoiceTranscriptTurn||null});
      voiceDebugTrace('session_restart_completed',{route:'test_session',restartCount:voiceRestartCount,turnId:activeVoiceTranscriptTurn||null});
      voiceDebugTrace('test_session_listening',{restartCount:voiceRestartCount});
      return;
    }
    if(voiceSessionUseRealtime) startSousRealtimeVoice();
    else startTapRec({sessionRestart:true});
  },safeDelay);
}
function maybeResumeVoiceSession(delay=VOICE_RESTART_DEFAULT_MS){
  if(voiceSessionActive) scheduleVoiceSessionRestart(delay);
  else if(cookingModeEnabled()) setTimeout(restartAlwaysOn,delay);
}
async function warmUpVoiceInput(){
  if(!navigator.mediaDevices?.getUserMedia) return false;
  try{
    if(localStorage.getItem('sous_voice_fake_mic_test')==='1'&&sousVoiceTestHarnessAllowed()){
      voiceDebugTrace('voice_mic_warmup',{status:'skipped',reason:'fake_mic_test'});
      return true;
    }
  }catch(e){}
  if(voiceMicWarmupActive) return false;
  voiceMicWarmupActive=true;
  setMicState('arming');
  voiceDebugTrace('voice_mic_warmup',{status:'started'});
  let timeout=null;
  try{
    const warmup=navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true
      }
    });
    const stream=await Promise.race([
      warmup,
      new Promise((_,reject)=>{
        timeout=setTimeout(()=>reject(new Error('mic warmup timeout')),VOICE_MIC_WARMUP_TIMEOUT_MS);
      })
    ]);
    if(timeout){clearTimeout(timeout);timeout=null;}
    try{stream&&stream.getTracks&&stream.getTracks().forEach(track=>track.stop());}catch(e){}
    voiceDebugTrace('voice_mic_warmup',{status:'ready'});
    return true;
  }catch(e){
    voiceDebugTrace('voice_mic_warmup',{status:'skipped',error:e?.message||String(e)});
    return false;
  }finally{
    if(timeout) clearTimeout(timeout);
    voiceMicWarmupActive=false;
  }
}
async function beginVoiceSession(){
  stopAllVoiceActivity('session starting');
  voiceRestartCount=0;
  voiceSuccessCueCount=0;
  voiceFlowCueCooldownUntil=0;
  voiceOutcomeTurns=new Set();
  voiceSessionActive=true;
  nextVoiceSessionId('session started');
  voiceSessionStoppedManually=false;
  voicePausedForVisibility=false;
  voiceSessionUseRealtime=realtimeVoiceEnabled();
  voiceDebugTrace('session_start',{useRealtime:voiceSessionUseRealtime});
  setVoiceSessionState('restarting','session started',{useRealtime:voiceSessionUseRealtime});
  console.log('[Sous Voice] session started');
  logVoiceState('session started',{useRealtime:voiceSessionUseRealtime});
  const startVoiceInput=async()=>{
    if(!voiceSessionActive||voiceSessionStoppedManually) return;
    if(voiceSessionUseRealtime){ startSousRealtimeVoice(); return; }
    await warmUpVoiceInput();
    if(voiceSessionActive&&!voiceSessionStoppedManually) startTapRec();
  };
  speakCachedResponse('session_ready',{},startVoiceInput,{force:true});
}
function endVoiceSession(label='Voice logging stopped'){
  if(!voiceSessionActive&&!isRecording&&!voiceCurrentlyListening&&!sousRealtime) return;
  console.log('[Sous Voice] session stopped');
  logVoiceState('session stopped');
  voiceDebugTrace('session_stop',{label});
  stopAllVoiceActivity('session stopped');
  setMicState('idle');
  const status=document.getElementById('listen-status');
  if(status) status.textContent=label;
}
function stopAllVoiceActivity(reason){
  logVoiceState('hard cleanup',{reason});
  if(voiceSessionActive||isRecording||voiceCurrentlyListening||sousRealtime||clarificationRec){
    voiceDebugTrace('session_stop',{reason});
  }
  nextVoiceSessionId(reason);
  cancelTapFinalizer(reason||'stop all voice activity');
  clearVoiceTimers();
  voiceSessionActive=false;
  voiceTestSessionActive=false;
  voiceSessionStoppedManually=true;
  voiceCurrentlyListening=false;
  processingTranscript=false;
  voiceSessionUseRealtime=false;
  voiceNoSpeechRetries=0;
  voiceMicWarmupActive=false;
  tapRecStarting=false;
  tapRecStopping=false;
  sousRealtimeStarting=false;
  voicePausedForVisibility=false;
  resetVoiceRecovery();
  clarificationState=null;
  stopSousRealtimeVoice(false);
  try{if(tapRec)tapRec.stop();}catch(e){}
  try{if(clarificationRec)clarificationRec.stop();}catch(e){}
  try{if(alwaysOnRec)alwaysOnRec.stop();}catch(e){}
  tapRec=null;
  clarificationRec=null;
  isRecording=false;
  isSpeaking=false;
  alwaysOnActive=false;
  setVoiceSessionState('idle',reason);
}

const VOICE_PHRASE_REPAIRS=[
  {label:'semi skim milk',pattern:/\bsemi\s+skim\s+milk\b/gi,to:'semi skimmed milk'},
  {label:'semi skimmed',pattern:/\bsemi\s+skimmed\b(?!\s+milk)/gi,to:'semi skimmed milk'},
  {label:'semi skim',pattern:/\bsemi\s+skim\b(?!\s+milk)/gi,to:'semi skimmed milk'},
  {label:'skim milk',pattern:/\bskim\s+milk\b/gi,to:'skimmed milk'},
  {label:'ml unit',pattern:/\b(\d+(?:[.,]\d+)?)\s*(?:mil|mill|mils|mills)\b/gi,to:'$1 ml'},
  {label:'table spoon',pattern:/\btable\s+spoons?\b/gi,to:'tablespoon'},
  {label:'tea spoon',pattern:/\btea\s+spoons?\b/gi,to:'teaspoon'}
];
const VOICE_COMMON_FOOD_REPAIRS=[
  {from:'jeans',to:['cheese','beans']},
  {from:'gene',to:['cheese','beans']},
  {from:'genes',to:['cheese','beans']},
  {from:'way',to:['whey']},
  {from:'weigh',to:['whey']},
  {from:'source',to:['sauce']},
  {from:'sore',to:['sauce']},
  {from:'sores',to:['sauce']},
  {from:'saws',to:['sauce']},
  {from:'bred',to:['bread']},
  {from:'mill',to:['milk']},
  {from:'meet',to:['meat']},
  {from:'flower',to:['flour']},
  {from:'floor',to:['flour']},
  {from:'serial',to:['cereal']},
  {from:'serials',to:['cereal']},
  {from:'gramme',to:['gram']},
  {from:'grammes',to:['grams']},
  {from:'tbs',to:['tbsp']},
  {from:'chilly',to:['chilli']},
  {from:'chili',to:['chilli']},
  {from:'muscles',to:['mussels']},
  {from:'stake',to:['steak']},
  {from:'pairs',to:['pears']},
  {from:'peace',to:['peas']},
  {from:'piece',to:['peas']}
];

function normalizeVoiceTranscriptText(text){
  return String(text||'').replace(/\s+/g,' ').trim();
}
function normalizeVoiceAlternative(input){
  if(input==null) return null;
  if(typeof input==='string') return {text:normalizeVoiceTranscriptText(input),confidence:null,source:'alternative'};
  const text=normalizeVoiceTranscriptText(input.transcript||input.text||input.raw||'');
  if(!text) return null;
  const confidence=typeof input.confidence==='number'?input.confidence:null;
  return {text,confidence,source:input.source||'alternative',repair:input.repair||null};
}
function uniqVoiceCandidates(candidates){
  const seen=new Set();
  return (candidates||[]).map(normalizeVoiceAlternative).filter(candidate=>{
    if(!candidate||!candidate.text) return false;
    const key=candidate.text.toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function voiceFoodMatchScore(clean,results){
  let score=0;
  const foods=(results||[]).filter(r=>r&&!r.command);
  foods.forEach(item=>{
    if(item.rawFood) score+=item.rawFood.source==='recent_ingredient'?85:55;
    if(item.weightSpecified) score+=30;
    if(item.serving) score+=20;
  });
  try{
    if(typeof getFoodTextMatch==='function'){
      const match=getFoodTextMatch(clean,{includeCustom:true});
      if(match&&match.food){
        score+=match.confidence==='high'?80:match.confidence==='medium'?55:30;
        if(match.food.source==='recent_ingredient'||String(match.food.id||'').startsWith('recent_')) score+=45;
        if(['exact-name','exact-alias','covered-alias'].includes(match.matchType)) score+=35;
      }
    }
  }catch(e){}
  try{
    if(typeof getRecentIngredients==='function'){
      const norm=typeof normaliseLogText==='function'?normaliseLogText(clean):clean.toLowerCase();
      const recent=getRecentIngredients().slice(0,12);
      if(recent.some(item=>{
        const name=typeof normaliseLogText==='function'?normaliseLogText(item.name||''):String(item.name||'').toLowerCase();
        return name&&(` ${norm} `).includes(` ${name} `);
      })) score+=45;
    }
  }catch(e){}
  return score;
}
function voiceQuantitySignalScore(clean){
  let score=0;
  if(/\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s*(?:g|grams?|kg|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|oz|tbsp|tablespoons?|tsp|teaspoons?|cups?)\b/i.test(clean)) score+=65;
  if(/\b(?:slice|slices|scoop|scoops|serving|servings|piece|pieces|handful|splash|cup|cups|tablespoon|teaspoon|tbsp|tsp)\b/i.test(clean)) score+=35;
  if(/\b(?:actually\s+)?(?:make|change|set)\s+(?:that|it|last)?\s*(?:to)?\s*(?:\d+(?:[.,]\d+)?|one|two|half|quarter)/i.test(clean)) score+=35;
  return score;
}
function voiceRecognitionConfidenceScore(confidence){
  return typeof confidence==='number'&&confidence>0?Math.round(Math.max(0,Math.min(confidence,1))*18):0;
}
function voiceParsedScore(text){
  const clean=normalizeVoiceTranscriptText(text);
  if(!clean||typeof parseText!=='function') return {score:-100,results:[],reason:'empty'};
  let results=[];
  try{results=parseText(clean)||[];}catch(e){results=[];}
  const commands=results.filter(r=>r&&r.command);
  if(commands.length){
    const targeted=commands.filter(cmd=>cmd.target||cmd.replacement||cmd.quantityText||cmd.grams||['undo','clear'].includes(cmd.command)).length;
    return {score:940+commands.length*35+targeted*45+voiceQuantitySignalScore(clean),results,reason:'command'};
  }
  const foods=results.filter(r=>r&&!r.command);
  const resolved=foods.filter(r=>!r.ambiguous);
  const clear=foods.filter(isClearIngredient);
  const specified=foods.filter(r=>r.weightSpecified);
  const ambiguous=foods.filter(r=>r.ambiguous);
  const low=foods.filter(r=>r.confidence==='low'||r.needsConfirm);
  const reason=typeof aiEscalationReason==='function'?aiEscalationReason(clean,results):(!foods.length?'empty':'none');
  let score=foods.length*110+resolved.length*35+clear.length*45+specified.length*35;
  score+=voiceFoodMatchScore(clean,results)+voiceQuantitySignalScore(clean);
  score-=ambiguous.length*18+low.length*18;
  if(reason==='none') score+=70;
  if(reason==='partial') score-=35;
  if(reason==='low-confidence') score-=20;
  if(reason==='empty') score-=90;
  return {score,results,reason};
}
function voicePhraseRepairVariants(text,base={}){
  const clean=normalizeVoiceTranscriptText(text);
  const variants=[];
  VOICE_PHRASE_REPAIRS.forEach(rule=>{
    const repaired=normalizeVoiceTranscriptText(clean.replace(rule.pattern,rule.to));
    if(!repaired||repaired===clean) return;
    variants.push({
      text:repaired,
      confidence:base.confidence??null,
      source:'phrase_repair',
      repair:{from:rule.label,to:rule.to}
    });
  });
  return variants;
}
function voiceRepairVariants(text,base={}){
  const clean=normalizeVoiceTranscriptText(text);
  const variants=voicePhraseRepairVariants(clean,base);
  VOICE_COMMON_FOOD_REPAIRS.forEach(rule=>{
    const re=new RegExp('\\b'+rule.from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi');
    if(!re.test(clean)) return;
    rule.to.forEach(to=>{
      const repaired=clean.replace(re,to);
      variants.push({
        text:repaired,
        confidence:base.confidence??null,
        source:'food_repair',
        repair:{from:rule.from,to}
      });
    });
  });
  return variants;
}
function chooseVoiceTranscript(transcript,{alternatives=[],confidence=null,source='tap'}={}){
  const original=normalizeVoiceTranscriptText(transcript);
  const baseCandidates=uniqVoiceCandidates([
    {text:original,confidence,source:'primary'},
    ...alternatives
  ]);
  const repairCandidates=baseCandidates.flatMap(candidate=>voiceRepairVariants(candidate.text,candidate));
  const candidates=uniqVoiceCandidates([...baseCandidates,...repairCandidates]);
  const scored=candidates.map(candidate=>{
    const parsed=voiceParsedScore(candidate.text);
    return {
      ...candidate,
      ...parsed,
      score:parsed.score+voiceRecognitionConfidenceScore(candidate.confidence)
    };
  }).sort((a,b)=>b.score-a.score);
  const originalScore=voiceParsedScore(original);
  const best=scored[0]||{text:original,score:originalScore.score,reason:originalScore.reason,results:originalScore.results};
  const shouldReplace=best.text&&best.text!==original&&(
    best.score>=originalScore.score+35||
    (originalScore.reason==='empty'&&best.score>0)||
    (originalScore.reason==='partial'&&best.reason==='none')
  );
  voiceDebugTrace('transcript_candidates',{
    source,
    transcript:original,
    alternatives:baseCandidates.map(c=>({text:c.text,confidence:c.confidence,source:c.source})).slice(0,8),
    top:scored.slice(0,5).map(c=>({text:c.text,score:Math.round(c.score),reason:c.reason,source:c.source,repair:c.repair||null}))
  });
  if(!shouldReplace) return {transcript:original,original,changed:false,score:originalScore.score,reason:originalScore.reason,alternatives:baseCandidates};
  voiceDebugTrace('transcript_repaired',{
    source,
    from:original,
    to:best.text,
    scoreBefore:Math.round(originalScore.score),
    scoreAfter:Math.round(best.score),
    reasonBefore:originalScore.reason,
    reasonAfter:best.reason,
    repair:best.repair||null
  });
  return {
    transcript:best.text,
    original,
    changed:true,
    score:best.score,
    reason:best.reason,
    forceHighConfidence:best.reason==='none'||best.score>originalScore.score+70,
    alternatives:baseCandidates
  };
}

async function routeFinalVoiceTranscript(transcript,{source='tap',confidence=null,lowConfidence=null,alternatives=[],timing={}}={}){
  const selected=chooseVoiceTranscript(transcript,{alternatives,confidence,source});
  const clean=String(selected.transcript||'').trim();
  if(!clean) return false;
  if(processingTranscript){
    voiceDebugTrace('transcript_rejected',{source,transcript:clean,reason:'processing'});
    return false;
  }
  voiceNoSpeechRetries=0;
  const turnId=beginVoiceTranscriptTurn(clean);
  logVoiceState('speech result received',{source,transcript:clean,originalTranscript:selected.original,confidence});
  voiceDebugTrace('transcript_heard',{source,transcript:clean,originalTranscript:selected.original,confidence,corrected:selected.changed,turnId});
  voiceDebugTrace('transcript_accepted',{source,transcript:clean,originalTranscript:selected.original,confidence,corrected:selected.changed,turnId});
  const isLow=lowConfidence==null
    ?(!selected.forceHighConfidence&&typeof confidence==='number'&&confidence>0&&confidence<0.75)
    :!!lowConfidence;
  const routeStartedAt=Date.now();
  _voiceMode=true;
  setVoiceProcessing(true,'transcript processing');
  console.log('[Sous Voice] processing transcript');
  logVoiceState('transcript processing started',{transcript:clean,lowConfidence:isLow,source});
  const done=(opts={})=>{
    setVoiceProcessing(false,'transcript processing');
    logVoiceState('transcript processing finished',{source});
    voiceDebugTrace('voice_timing',{
      source,
      transcript:clean,
      corrected:selected.changed,
      listenToFinalMs:timing.listenStartedAt?Math.max(0,routeStartedAt-timing.listenStartedAt):null,
      firstHeardToFinalMs:timing.firstHeardAt?Math.max(0,routeStartedAt-timing.firstHeardAt):null,
      processingMs:Math.max(0,Date.now()-routeStartedAt),
      totalMs:timing.listenStartedAt?Math.max(0,Date.now()-timing.listenStartedAt):null
    });
    if(opts.restart!==false&&document.querySelector('.log-screen.active')?.id==='ls-listening') scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    return true;
  };
  try{
    if(document.querySelector('.log-screen.active')?.id==='ls-multi-confirm'){
      voiceDebugTrace('transcript_routed',{route:'multi_confirm_fill',source,transcript:clean});
      markVoiceOutcome(turnId,'multi_confirm_fill',{source,transcript:clean});
      try{handleMultiConfirmVoiceFill(clean);}catch(e){console.warn('[Sous Voice] multi-confirm fill error',e);}
      return done({restart:false});
    }
    if(document.querySelector('.log-screen.active')?.id==='ls-quantity'){
      voiceDebugTrace('transcript_routed',{route:'quantity_answer',source,transcript:clean});
      markVoiceOutcome(turnId,'quantity_answer',{source,transcript:clean});
      const quantityCancel=quantityPromptCancelCommand(clean);
      if(quantityCancel&&cancelPendingQuantityFromVoice(quantityCancel,turnId)){
        return done({restart:false});
      }
      const grams=typeof parseGramsFromText==='function'?parseGramsFromText(clean):null;
      if(grams&&grams>0){
        commitQuantity(grams);
      } else if(pendingFood&&typeof normaliseLogText==='function'&&normaliseLogText(clean)===normaliseLogText(pendingFood.name||'')){
        voiceDebugTrace('ui_updated',{turnId,screen:'ls-quantity',reason:'quantity_repeat_prompt',prompt:'How much '+pendingFood.name+'?'});
        askQuantity(pendingFood);
      } else {
        const el=document.getElementById('transcript-text');
        if(el) el.textContent="Didn't catch that";
        voiceDebugTrace('ui_updated',{turnId,screen:'ls-quantity',reason:'quantity_answer_recovery',prompt:"Didn't catch that"});
        speakRecoveryCue(null,{force:true});
      }
      return done({restart:false});
    }
    if(clarificationState?.active){
      voiceDebugTrace('transcript_routed',{route:'clarification',source,transcript:clean});
      markVoiceOutcome(turnId,'clarification_answer',{source,transcript:clean});
      await Promise.resolve(handleClarification(clean));
      return done({restart:false});
    }
    if(handleVoiceMealFlowCommand(clean,turnId)){
      voiceDebugTrace('transcript_routed',{route:'meal_flow_command',source,transcript:clean,turnId});
      return done({restart:false});
    }
    const recoveryIssue=transcriptRecoveryIssue(clean,isLow);
    if(maybeRecoverVoiceTranscript(recoveryIssue,clean,turnId)){
      voiceDebugTrace('transcript_routed',{route:'voice_recovery',source,issue:recoveryIssue,transcript:clean,turnId});
      return done({restart:false});
    }
    if(isLow){
      voiceDebugTrace('transcript_routed',{route:'low_confidence_review',source,transcript:clean});
      markVoiceOutcome(turnId,'low_confidence_review',{source,transcript:clean});
      showVoiceCorrection(clean);
      return done();
    }
    voiceDebugTrace('transcript_routed',{route:'normal_parser',source,transcript:clean});
    await Promise.resolve(handleTranscript(clean,clean));
    markVoiceOutcome(turnId,'normal_parser',{source,transcript:clean});
    return done();
  }catch(e){
    console.warn('[Sous Voice] transcript error',e);
    return done();
  }
}

function sousVoiceTestHarnessAllowed(){
  try{
    const host=location.hostname;
    return location.protocol==='file:'||
      host==='localhost'||host==='127.0.0.1'||host==='[::1]'||host==='::1'||
      new URLSearchParams(location.search).get('sousVoiceTest')==='1'||
      localStorage.getItem('sous_voice_test_harness')==='1';
  }catch(e){return false;}
}
function sousVoiceStateSnapshot(){
  return {
    ...voiceLifecycleSnapshot(),
    activeScreen:document.querySelector('.log-screen.active')?.id||null,
    transcriptText:document.getElementById('transcript-text')?.textContent||'',
    listenStatus:document.getElementById('listen-status')?.textContent||'',
    voiceCorrectText:document.getElementById('voice-correct-bar')?.style.display!=='none'
      ?(document.getElementById('voice-correct-msg')?.textContent||'')
      :'',
    reviewIngredientNames:Array.from(document.querySelectorAll('#mc-list > div')).map(card=>card.querySelector('select option:checked')?.textContent||card.textContent||'').filter(Boolean),
    currentTab:typeof currentTab!=='undefined'?currentTab:null,
    clarification:voiceDebugClarificationSnapshot(),
    meal:meal.map(item=>({
      id:item.id,
      name:item.name,
      weight:item.weight,
      kcal:item.kcal,
      protein:item.protein,
      carbs:item.carbs,
      fat:item.fat
    }))
  };
}
function exposeSousVoiceTestHarness(){
  if(!sousVoiceTestHarnessAllowed()) return;
  window.__sousVoiceState=sousVoiceStateSnapshot;
  window.__sousLastVoiceEvents=()=>voiceTestEvents.slice();
  window.__sousStartVoiceTestSession=(presetSection=null)=>{
    if(typeof switchTab==='function') switchTab('log',{fresh:true,silent:true,section:presetSection||null});
    else startSilentLog(presetSection||null);
    clearVoiceTimers();
    hideVoiceCorrectBar();
    voiceRestartCount=0;
    voiceSuccessCueCount=0;
    voiceFlowCueCooldownUntil=0;
    voiceOutcomeTurns=new Set();
    voiceSessionActive=true;
    nextVoiceSessionId('test session started');
    voiceTestSessionActive=true;
    voiceSessionStoppedManually=false;
    voicePausedForVisibility=false;
    voiceSessionUseRealtime=false;
    voiceTestEvents=[];
    voiceCurrentlyListening=true;
    isRecording=false;
    processingTranscript=false;
    isSpeaking=false;
    setVoiceSessionState('listening','test session started');
    setMicState('recording');
    voiceDebugTrace('test_session_started');
    return sousVoiceStateSnapshot();
  };
  window.__sousStopVoiceTestSession=()=>{
    stopAllVoiceActivity('test session stopped');
    setMicState('idle');
    voiceDebugTrace('test_session_stopped');
    return sousVoiceStateSnapshot();
  };
  window.__sousTestVoiceTranscript=async input=>{
    const payload=typeof input==='object'&&input?input:{transcript:input};
    const clean=String(payload.transcript||payload.text||'').trim();
    voiceDebugTrace('test_helper_bypasses_recognizer',{helper:'__sousTestVoiceTranscript',transcript:clean,routeDetail:'routes directly into final transcript handler'});
    clearVoiceListeningWatchdog();
    clearVoiceRestartTimer();
    voiceCurrentlyListening=false;
    isRecording=false;
    const el=document.getElementById('transcript-text');
    if(el) el.textContent=clean?'"'+clean+'"':'—';
    if(!clean){
      voiceDebugTrace('transcript_heard',{source:'test',transcript:'',empty:true});
      voiceDebugTrace('transcript_rejected',{source:'test',transcript:'',reason:'empty'});
      if(voiceSessionActive) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
      return false;
    }
    const alternatives=Array.isArray(payload.alternatives)?payload.alternatives:[];
    return routeFinalVoiceTranscript(clean,{source:'test',confidence:payload.confidence??1,lowConfidence:false,alternatives});
  };
}
exposeSousVoiceTestHarness();

// ═══════════════════════════════════════════
// QUEUE HELPERS
// ═══════════════════════════════════════════
function itemBriefName(item){
  if(!item) return 'item';
  const wt=item.customMacro?'':(' '+itemWeightLabel(item));
  return (item.name||'item')+wt;
}
function batchPhrase(items){
  const names=items.map(itemBriefName);
  if(names.length===0) return '';
  if(names.length===1) return names[0];
  if(names.length===2) return names[0]+' and '+names[1];
  return names.slice(0,-1).join(', ')+', and '+names[names.length-1];
}
function shouldAutoAdd(item){
  return item && !item.ambiguous && (item.confidence==='high' || item.needsConfirm===false || item.customMacro);
}
function shouldAskQuantityBeforeReview(item){
  return shouldAutoAdd(item)&&!!item.rawFood&&!item.weightSpecified&&!item.customMacro;
}
function isClearIngredient(item){
  return item && !item.command && !item.ambiguous && (item.customMacro || (item.rawFood && item.weightSpecified));
}
function showBatchHeard(results){
  const transcript=document.getElementById('transcript-text');
  const items=results.filter(r=>!r.command);
  if(transcript && items.length>1){
    transcript.textContent='Heard '+items.length+' items: '+items.map(i=>i.name||i.label||'unknown').join(', ');
  }
}
function applyFoodOverride(item){
  if(!item||item.customMacro||item.customUnitNutrition||!item.weight) return item;
  const key=(item.rawFood?item.rawFood.name:item.name);
  const override=typeof getFoodOverride==='function'?getFoodOverride(key):null;
  if(!override) return item;
  const r=item.weight/100;
  item.kcal=Math.round(override.kcal*r);
  item.protein=Math.round(override.protein*r*10)/10;
  item.carbs=Math.round(override.carbs*r*10)/10;
  item.fat=Math.round(override.fat*r*10)/10;
  item.fibre=Math.round((override.fibre||0)*r*10)/10;
  return item;
}
function _pluralUnit(label,qty){
  const l=String(label||'unit');
  if(Number(qty)===1) return l;
  if(l.endsWith('y')) return l.slice(0,-1)+'ies';
  if(/(?:s|x|ch|sh)$/i.test(l)) return l+'es';
  return l.endsWith('s')?l:l+'s';
}
function _formatQty(qty){
  const n=Number(qty)||0;
  return String(Math.round(n*10)/10).replace(/\.0$/,'');
}
function itemWeightLabel(item){
  if(!item) return '—';
  if(item.customMacro) return 'manual macro entry';
  if(item.serving&&item.serving.label&&item.serving.quantity){
    const q=Math.round(Number(item.serving.quantity)*10)/10;
    return _formatQty(q)+' '+_pluralUnit(item.serving.label,q);
  }
  const inferred=inferServingFromWeight(item);
  if(inferred){
    return _formatQty(inferred.quantity)+' '+_pluralUnit(inferred.label,inferred.quantity);
  }
  const unit=item.type==='liquid'?'ml':'g';
  return (item.weight||0)+unit;
}
function getServingUnitForFood(foodOrName){
  const name=typeof foodOrName==='string'?foodOrName:foodOrName?.name;
  const custom=typeof getCustomServingUnit==='function'?getCustomServingUnit(name):null;
  if(custom) return custom;
  const food=typeof foodOrName==='object'?foodOrName:null;
  if(food&&food.defaultUnit&&Array.isArray(food.units)){
    return food.units.find(u=>u.label===food.defaultUnit)||food.units[0]||null;
  }
  return null;
}
function defaultServingQty(food,unit){
  const explicit=unit?.defaultQty??food?.defaultQty;
  if(explicit&&Number(explicit)>0) return Number(explicit);
  return 1;
}
function inferServingFromWeight(item){
  if(!item||!item.weight) return null;
  const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
  const unit=getServingUnitForFood(food||item.name);
  if(!unit||!unit.label||!unit.grams) return null;
  const qty=Number(item.weight)/Number(unit.grams);
  if(!Number.isFinite(qty)||qty<=0) return null;
  const rounded=Math.round(qty*10)/10;
  if(Math.abs(qty-rounded)>0.01) return null;
  return {label:unit.label,quantity:rounded,grams:unit.grams};
}
function syncServingFromWeight(item){
  if(!item) return item;
  const inferred=inferServingFromWeight(item);
  if(inferred) item.serving=inferred;
  else if(item.serving&&item.serving.grams) delete item.serving;
  return item;
}
function buildItemFromFoodServing(food,qty,unit){
  const q=Math.max(0,Number(qty)||0);
  if(!food||!unit||q<=0) return null;
  const npu=unit.nutritionPerUnit||null;
  const grams=unit.grams?Math.round(unit.grams*q):null;
  let item;
  if(npu){
    item={
      name:food.name,
      weight:grams,
      kcal:Math.round((Number(npu.calories)||0)*q),
      protein:Math.round((Number(npu.protein)||0)*q*10)/10,
      carbs:Math.round((Number(npu.carbs)||0)*q*10)/10,
      fat:Math.round((Number(npu.fat)||0)*q*10)/10,
      fibre:Math.round((Number(npu.fibre)||0)*q*10)/10
    };
  } else if(grams){
    const r=grams/(food.w||100);
    item={name:food.name,weight:grams,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10};
  } else return null;
  item.icon=food.icon;
  item.type=food.type||'solid';
  item.rawFood=food;
  item.serving={label:unit.label,quantity:q,grams:unit.grams||undefined};
  if(npu) item.customUnitNutrition=true;
  return item;
}
function _unitFields(prefix){
  return {
    label:document.getElementById(prefix+'-unit-label'),
    grams:document.getElementById(prefix+'-unit-grams'),
    kcal:document.getElementById(prefix+'-unit-kcal'),
    protein:document.getElementById(prefix+'-unit-protein'),
    carbs:document.getElementById(prefix+'-unit-carbs'),
    fat:document.getElementById(prefix+'-unit-fat')
  };
}
function readCustomUnitFromFields(prefix){
  const f=_unitFields(prefix);
  if(!f.label) return {unit:null,attempted:false};
  const raw=[f.label,f.grams,f.kcal,f.protein,f.carbs,f.fat].map(el=>el?.value?.trim()||'');
  const attempted=raw.some(Boolean);
  if(!attempted) return {unit:null,attempted:false};
  const label=raw[0];
  if(!label) return {error:'Unit name required',attempted:true};
  const grams=raw[1]?parseFloat(raw[1]):null;
  if(raw[1]&&(!grams||grams<=0)) return {error:'Enter a valid unit weight',attempted:true};
  const macroInputs=raw.slice(2);
  const hasMacros=macroInputs.some(Boolean);
  const unit={label};
  if(grams) unit.grams=grams;
  if(hasMacros){
    if(macroInputs.some(v=>v==='')) return {error:'Enter all per-unit macro fields, or leave them all blank',attempted:true};
    const vals=macroInputs.map(parseFloat);
    if(vals.some(v=>Number.isNaN(v)||v<0)) return {error:'Enter valid per-unit macros',attempted:true};
    unit.nutritionPerUnit={calories:vals[0],protein:vals[1],carbs:vals[2],fat:vals[3]};
  }
  if(!unit.grams&&!unit.nutritionPerUnit) return {error:'Add grams or per-unit nutrition',attempted:true};
  return {unit,attempted:true};
}
function populateCustomUnitFields(prefix,unit){
  const f=_unitFields(prefix);
  if(!f.label) return;
  f.label.value=unit?.label||'';
  f.grams.value=unit?.grams||'';
  f.kcal.value=unit?.nutritionPerUnit?.calories??'';
  f.protein.value=unit?.nutritionPerUnit?.protein??'';
  f.carbs.value=unit?.nutritionPerUnit?.carbs??'';
  f.fat.value=unit?.nutritionPerUnit?.fat??'';
}
// ─────────────────────────────────────────────
// SHARED INGREDIENT ADDITION — single pathway
// All flows that push an ingredient into the live
// meal array MUST go through this function.
// ─────────────────────────────────────────────
function addIngredientToMeal(item, options = {}) {
  if (!item) return null;
  const source = options.source || 'unknown';
  const skipSnapshot = !!options.skipSnapshot;
  const skipPersist = !!options.skipPersist;
  const applyOverride = !!options.applyOverride;

  // Assign a stable ID if the item doesn't already have one
  if (!item.id) item.id = nextIngId++;

  // Normalise serving fields (idempotent, safe to run every time)
  if (typeof syncServingFromWeight === 'function') syncServingFromWeight(item);

  // Apply per-food macro overrides only when the caller opts in
  if (applyOverride && typeof applyFoodOverride === 'function') applyFoodOverride(item);

  // Snapshot before mutating meal (skip for batch callers that snapshot once)
  if (!skipSnapshot) snapshotMeal();

  // ── THE SINGLE meal.push ──
  meal.push(item);

  console.log('[Sous Meal] ingredient added via shared pathway');
  console.log('[Sous Meal] source:', source);
  voiceDebugTrace('ingredient_added',{source,item:voiceDebugResultSummary([item])[0]});
  voiceDebugTrace('final_action',{action:'ingredient_added',source,item:voiceDebugResultSummary([item])[0]});
  voiceDebugTrace('ui_updated',{screen:document.querySelector('.log-screen.active')?.id||null,reason:'ingredient_row_added',item:voiceDebugResultSummary([item])[0]});

  // Persist draft (skip for batch callers that persist once after the loop)
  if (!skipPersist) _persistDraft();

  return item;
}

function autoAddItem(item){
  addIngredientToMeal(item, {source:'voice', applyOverride:true});
}
function autoAddClearItems(items){
  if(!items.length) return;
  snapshotMeal();
  items.forEach(item=>{
    addIngredientToMeal(item, {source:'voice', applyOverride:true, skipSnapshot:true, skipPersist:true});
  });
  _persistDraft();
  renderCurrentMeal();
  updateHome();
  showToast('Added '+batchPhrase(items)+' ✓',2400);
}
function announceAutoAdded(items,after){
  if(!items.length){ if(after) after(); return; }
  const phrase=batchPhrase(items);
  const msg=items.length===1 ? `Added ${phrase}.` : `Added ${items.length} items: ${phrase}.`;
  const transcript=document.getElementById('transcript-text');
  if(transcript) transcript.textContent=msg;
  showToast(msg,2600);
  speakSuccessCue(after);
}
function hideVoiceCorrectBar(){
  const b=document.getElementById('voice-correct-bar');if(b)b.style.display='none';
  const cb=document.getElementById('voice-create-food-btn');if(cb)cb.style.display='none';
}
function showNoMatchFallback(rawText){
  voiceDebugTrace('fallback_shown',{route:'no_match',rawText});
  const msg=document.getElementById('voice-correct-msg');
  const createBtn=document.getElementById('voice-create-food-btn');
  if(msg) msg.textContent='No match — create custom food?';
  if(createBtn){
    createBtn.textContent='Create "'+rawText+'"';
    createBtn.style.display='';
    createBtn.onclick=()=>{hideVoiceCorrectBar();openCreateCustomFood(rawText);};
  }
  const bar=document.getElementById('voice-correct-bar');
  if(bar) bar.style.display='flex';
}
function _normaliseChoiceText(text){
  let s=String(text||'').toLowerCase().trim();
  if(typeof normaliseLogText==='function') s=normaliseLogText(s);
  if(typeof stripSegmentPrefix==='function') s=stripSegmentPrefix(s);
  if(typeof cleanSegment==='function') s=cleanSegment(s);
  s=s
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams?|kg|ml|l|tbsp|tsp|oz|cups?|pieces?|slices?|servings?|portions?|cans?|tins?)\b/gi,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/\b(?:of|some|a|an|the)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  return s;
}
function _foodChoiceKeys(food){
  if(!food) return [];
  const keys=[food.name,...(food.kw||[]),...(food.aliases||[])]
    .map(_normaliseChoiceText)
    .filter(k=>k.length>1);
  return [...new Set(keys)];
}
const FOOD_CHOICE_FILLER_WORDS=new Set(['fresh','cooked','raw','large','small','medium','pink','red','white','black','green']);
function _foodChoiceDisplayName(text){
  let s=String(text||'').trim();
  if(typeof stripSegmentPrefix==='function') s=stripSegmentPrefix(s);
  s=s
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams?|kg|ml|l|tbsp|tsp|oz|cups?|pieces?|slices?|servings?|portions?|cans?|tins?)\b/gi,' ')
    .replace(/\b\d+(?:\.\d+)?\b/g,' ')
    .replace(/\b(?:of|some|a|an|the)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
  return s;
}
function _singularChoiceToken(token){
  const t=String(token||'').toLowerCase();
  if(t.endsWith('ies')&&t.length>4) return t.slice(0,-3)+'y';
  if(t.endsWith('es')&&t.length>4) return t.slice(0,-2);
  if(t.endsWith('s')&&t.length>3) return t.slice(0,-1);
  return t;
}
function _choiceTokens(text,{dropFillers=false}={}){
  const tokens=_normaliseChoiceText(text).split(/\s+/).filter(t=>t.length>2);
  const filtered=dropFillers?tokens.filter(t=>!FOOD_CHOICE_FILLER_WORDS.has(t)):tokens;
  return filtered.map(_singularChoiceToken);
}
function _choiceTokenMatches(a,b){
  return _singularChoiceToken(a)===_singularChoiceToken(b);
}
function _choiceEsc(text){
  return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _relatedFoodMatches(rawName,preferredFood=null,limit=8){
  const phrase=_normaliseChoiceText(rawName);
  if(!phrase) return preferredFood?[preferredFood]:[];
  const allFoods=[
    ...(typeof getCustomFoods==='function'?getCustomFoods():[]),
    ...(typeof getFoodDatabase==='function'?getFoodDatabase():(typeof FOODS!=='undefined'?FOODS:[]))
  ];
  const seen=new Set();
  const foods=allFoods.filter(food=>{
    const key=String(food?.id||food?.name||'').toLowerCase();
    if(!food||!food.name||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const phraseTokens=_choiceTokens(phrase);
  const meaningTokens=_choiceTokens(phrase,{dropFillers:true});
  const tokens=meaningTokens.length?meaningTokens:phraseTokens;
  const scores=[];
  foods.forEach(food=>{
    const keys=_foodChoiceKeys(food);
    const keyTokens=keys.flatMap(k=>_choiceTokens(k));
    let score=preferredFood&&food.name===preferredFood.name?70:0;
    keys.forEach(k=>{
      if(k===phrase) score+=120;
      else if(k.includes(phrase)||phrase.includes(k)) score+=80;
    });
    tokens.forEach(token=>{
      if(keyTokens.some(kt=>_choiceTokenMatches(kt,token))) score+=28;
      else if(keys.some(k=>k.includes(token))) score+=14;
    });
    if(score>0) scores.push({food,score});
  });
  return scores
    .sort((a,b)=>b.score-a.score||String(a.food.name).localeCompare(String(b.food.name)))
    .slice(0,limit)
    .map(s=>s.food);
}
function _foodChoiceReviewFor(item,rawSegment){
  if(!item||item.command||item.ambiguous||item.customMacro||item.foodChoiceConfirmed||!item.rawFood) return null;
  const heard=_normaliseChoiceText(rawSegment||item.heardName||item.name);
  if(!heard) return null;
  if(typeof shouldConfirmFoodMatch==='function'){
    if(!shouldConfirmFoodMatch(heard,item)) return null;
  } else if(typeof getFoodTextMatch==='function'){
    const match=getFoodTextMatch(heard,{includeCustom:true});
    if(match&&match.food){
      const sameFood=match.food===item.rawFood||String(match.food.id||match.food.name)===String(item.rawFood.id||item.rawFood.name);
      if(sameFood&&!match.shouldConfirm) return null;
      if(sameFood&&match.shouldConfirm) return {heard,matchedKey:match.key,item,match};
    }
  }
  const keys=_foodChoiceKeys(item.rawFood);
  if(keys.includes(heard)) return null;
  const useful=keys
    .filter(k=>k.length>3)
    .sort((a,b)=>b.length-a.length)
    .find(k=>heard.includes(k)||k.includes(heard));
  if(!useful) return null;
  return {heard,matchedKey:useful,item};
}
function _extractHeardFoodSegments(rawText,count){
  const raw=String(rawText||'').trim();
  if(!raw) return [];
  if(typeof splitIngredients==='function'){
    const parts=splitIngredients(raw);
    if(parts.length) return parts;
  }
  return count===1?[raw]:[];
}
function maybeShowFoodChoiceReview(results,rawText){
  if(!rawText||!Array.isArray(results)||!results.length) return false;
  const foodResults=results.filter(r=>!r.command);
  if(!foodResults.length) return false;
  if(foodResults.length>1) return false;
  const segments=_extractHeardFoodSegments(rawText,foodResults.length);
  let foodIdx=0;
  for(let i=0;i<results.length;i++){
    const item=results[i];
    if(item.command) continue;
    const rawSegment=segments[foodIdx]||rawText;
    foodIdx++;
    const review=_foodChoiceReviewFor(item,rawSegment);
    if(review){
      const rawName=_foodChoiceDisplayName(rawSegment)||review.heard;
      showFoodChoiceReview({
        rawName,
        originalText:rawSegment,
        existingItem:item,
        existingFood:item.rawFood,
        relatedMatches:_relatedFoodMatches(rawName,item.rawFood),
        before:results.slice(0,i),
        after:results.slice(i+1)
      });
      return true;
    }
  }
  return false;
}
function getPendingFoodChoiceReview(results,rawText){
  if(!rawText||!Array.isArray(results)||!results.length) return null;
  const foodResults=results.filter(r=>!r.command);
  if(!foodResults.length) return null;
  if(foodResults.length>1) return null;
  const segments=_extractHeardFoodSegments(rawText,foodResults.length);
  let foodIdx=0;
  for(let i=0;i<results.length;i++){
    const item=results[i];
    if(item.command) continue;
    const rawSegment=segments[foodIdx]||rawText;
    foodIdx++;
    const review=_foodChoiceReviewFor(item,rawSegment);
    if(review){
      const rawName=_foodChoiceDisplayName(rawSegment)||review.heard;
      return{
        rawName,
        originalText:rawSegment,
        existingItem:item,
        existingFood:item.rawFood,
        relatedMatches:_relatedFoodMatches(rawName,item.rawFood),
        before:results.slice(0,i),
        after:results.slice(i+1)
      };
    }
  }
  return null;
}
function isClarificationVoiceContext(){
  return !!(_voiceMode||voiceSessionActive||voiceCurrentlyListening||isRecording);
}
function normalisedClarificationFamilyName(value){
  const text=String(value||'ingredient').trim()||'ingredient';
  if(typeof normaliseLogText==='function') return normaliseLogText(text);
  return text.toLowerCase().trim();
}
function extractClarificationQuantityInfo(text,food){
  const qty=typeof extractQuantity==='function'?extractQuantity(text):null;
  if(!qty) return {known:false,grams:null,unit:null};
  const grams=typeof quantityToGramsForFood==='function'
    ?quantityToGramsForFood(qty,food||null)
    :qty.grams;
  if(grams==null) return {known:false,grams:null,unit:null};
  const raw=String(text||'').toLowerCase();
  const unitMatch=raw.match(/\b(?:\d+(?:[.,]\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s*(g|grams?|kg|kilograms?|ml|millilit(?:re|er)s?|l|lit(?:re|er)s?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cups?|slices?|pieces?|servings?|portions?|cans?|tins?|scoops?|pots?)\b/i);
  const unit=unitMatch?normaliseClarificationInput(unitMatch[1]).replace(/s$/,''):null;
  return {known:true,grams:Math.max(1,Math.round(grams)),unit};
}
function clarificationQuantityText(grams,unit){
  if(grams==null) return '';
  const n=Math.max(1,Math.round(grams));
  if(unit&&['ml','l','oz','tbsp','tsp','cup','kg'].includes(unit)) return `${n}${unit}`;
  return `${n}g`;
}
function clarificationMissingFieldsFor(item,rawText,food){
  const q=extractClarificationQuantityInfo(rawText,food);
  const missing=['type'];
  if(!q.known) missing.push('quantity');
  return {missingFields:missing,quantityInfo:q};
}
function likelyNeedsFoodRecoveryPrompt(rawText,item){
  const family=normalisedClarificationFamilyName(item?.label||'');
  const heard=normalisedClarificationFamilyName(rawText||'');
  if(!family||!heard||heard===family) return false;
  if(!heard.split(/\s+/).includes(family.split(/\s+/).slice(-1)[0])) return false;
  const allowedByFamily={
    yogurt:new Set(['greek','natural','plain','fat','free','full','low','zero','percent','skyr']),
    yoghurt:new Set(['greek','natural','plain','fat','free','full','low','zero','percent','skyr']),
    bread:new Set(['white','brown','wholemeal','wholegrain','rye','sliced','medium','toast']),
    milk:new Set(['semi','skimmed','whole','oat','almond','full','fat']),
    cheese:new Set(['cheddar','mozzarella','grated','mature','low','fat'])
  };
  const familyKey=family.includes('yog')?'yogurt':family.split(/\s+/).slice(-1)[0];
  const allowed=allowedByFamily[familyKey]||new Set();
  const ignored=new Set([
    'add','log','track','please','some','about','approximately','approx',
    'i','had','ate','have','hey','sous','sue','of','a','an','the',
    'one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','couple','half','quarter',
    'slice','slices','piece','pieces','serving','servings','portion','portions',
    'scoop','scoops','cup','cups','pot','pots','can','cans','tin','tins',
    'handful','splash','drizzle','pinch','knob','pat'
  ]);
  const extras=heard.split(/\s+/).filter(token=>
    token&&
    !ignored.has(token)&&
    token!==familyKey&&
    !family.split(/\s+/).includes(token)&&
    !/^\d/.test(token)&&
    !['g','kg','ml','l','oz','tbsp','tsp','cup','cups'].includes(token)
  );
  return !!extras.length&&extras.some(token=>!allowed.has(token));
}
function clarificationPromptForState(state=clarificationState){
  const missing=(state?.missingFields||[]).filter(Boolean);
  const family=state?.family||state?.baseItem||'that';
  const label=family.split(/\s+/).slice(-1)[0]||family;
  if(missing.includes('confirm_intent')){
    return {text:`Did you mean ${label}?`,cacheKey:'clarify_confirm_food',data:{food:label}};
  }
  const needsType=missing.includes('type');
  const needsQuantity=missing.includes('quantity');
  if(needsType&&needsQuantity) return {text:`What type and how much?`,cacheKey:'clarify_type_quantity',data:{}};
  if(needsType) return {text:`What type of ${label}?`,cacheKey:'clarify_type',data:{}};
  if(needsQuantity) return {text:`How much ${label}?`,cacheKey:'clarify_quantity',data:{}};
  return {text:'One more detail?',cacheKey:'clarification_needed',data:{}};
}
function promptIngredientClarification(){
  if(!clarificationState?.active) return;
  const prompt=clarificationPromptForState(clarificationState);
  clarificationState.step=(clarificationState.missingFields||[]).join('_')||'detail';
  setVoicePromptOwner('clarification',{
    prompt:prompt.text,
    item:{
      baseItem:clarificationState.baseItem,
      family:clarificationState.family,
      missingFields:clarificationState.missingFields||[]
    }
  });
  voiceDebugTrace('clarification_shown',{prompt:prompt.text,cacheKey:prompt.cacheKey,missingFields:clarificationState.missingFields||[]});
  voiceDebugTrace('clarification_prompt',{prompt:prompt.text,cacheKey:prompt.cacheKey,missingFields:clarificationState.missingFields||[]});
  const el=document.getElementById('transcript-text');
  if(el) el.textContent=prompt.text;
  speakThenListen(prompt.text,handleClarification,prompt.cacheKey,prompt.data,{force:true});
}
function beginIngredientClarification(baseItem,fallback,context={}){
  const base=String(baseItem||'ingredient').trim()||'ingredient';
  const defaultFood=context.defaultFood||context.candidateFood||null;
  const quantityInfo=context.quantityInfo||extractClarificationQuantityInfo(context.originalTranscript||base,defaultFood);
  const missingFields=Array.isArray(context.missingFields)&&context.missingFields.length
    ?context.missingFields.slice()
    :['type',...(quantityInfo.known?[]:['quantity'])];
  clarificationState={
    active:true,
    baseItem:base,
    originalTranscript:context.originalTranscript||base,
    family:context.family||base,
    knownQuantity:quantityInfo.known?quantityInfo.grams:null,
    knownUnit:quantityInfo.known?quantityInfo.unit:null,
    missingFields,
    candidateFood:context.candidateFood||null,
    defaultFood,
    mealSection:context.mealSection||currentMealSection||null,
    step:missingFields.join('_')||'detail',
    attempts:0,
    fallback:typeof fallback==='function'?fallback:null
  };
  voiceDebugTrace('clarification_started',{baseItem:base,missingFields,knownQuantity:clarificationState.knownQuantity,knownUnit:clarificationState.knownUnit});
  pauseAlwaysOn();
  requestTapStop('ingredient clarification starting');
  showLogScreen('listening');
  promptIngredientClarification();
}
function clearIngredientClarification(){
  clarificationState=null;
  clearVoicePromptOwner('clarification_resolved');
}
function cancelIngredientClarification({resume=true}={}){
  if(!clarificationState?.active) return;
  voiceDebugTrace('clarification_cancelled',{resume});
  clearIngredientClarification();
  try{if(clarificationRec)clarificationRec.stop();}catch(e){}
  clarificationRec=null;
  if(resume) maybeResumeVoiceSession(400);
}
function fallbackIngredientClarification(){
  const fallback=clarificationState?.fallback;
  voiceDebugTrace('clarification_fallback');
  clearIngredientClarification();
  if(typeof fallback==='function') fallback();
  else maybeResumeVoiceSession(400);
}
function shouldAskAgainForClarification(results,rawText){
  if(!Array.isArray(results)||!results.length) return true;
  const foods=results.filter(r=>!r.command);
  if(!foods.length) return true;
  if(foods.some(r=>r.ambiguous)) return true;
  if(getPendingFoodChoiceReview(results,rawText)) return true;
  return false;
}
function normaliseClarificationInput(text){
  return String(text||'')
    .replace(/\bgrams?\b/gi,'g')
    .replace(/\bmillilit(?:re|er)s?\b/gi,'ml')
    .replace(/\blit(?:re|er)s?\b/gi,'l')
    .replace(/\bounces?\b/gi,'oz')
    .replace(/\btablespoons?\b/gi,'tbsp')
    .replace(/\bteaspoons?\b/gi,'tsp')
    .replace(/[,:;]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function quantityFirstClarificationInput(text){
  const input=normaliseClarificationInput(text);
  const m=input.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|tbsp|tsp|cups?)\b$/i);
  if(!m) return input;
  return `${m[2]} ${m[3]} ${m[1]}`.replace(/\s+/g,' ').trim();
}
function clarificationInputWithoutQuantity(text){
  return normaliseClarificationInput(text)
    .replace(/\b(?:\d+(?:[.,]\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?|slices?|pieces?|servings?|portions?|pots?)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function clarificationAnswerQuantityInfo(answer,state){
  const food=state?.candidateFood||state?.defaultFood||null;
  return extractClarificationQuantityInfo(answer,food);
}
function scaleClarifiedFoodItem(item,grams){
  if(!item||item.command||!item.rawFood||grams==null) return item;
  const scaled=typeof foodScale==='function'?foodScale(item.rawFood,grams):{
    name:item.rawFood.name,
    weight:Math.round(grams),
    kcal:item.kcal,
    protein:item.protein,
    carbs:item.carbs,
    fat:item.fat,
    fibre:item.fibre,
    icon:item.icon,
    type:item.type||item.rawFood.type||'solid'
  };
  return {
    ...item,
    ...scaled,
    rawFood:item.rawFood,
    confidence:item.confidence||'high',
    needsConfirm:false,
    weightSpecified:true
  };
}
function mergeClarificationQuantity(results,state,answer){
  const answerQty=clarificationAnswerQuantityInfo(answer,state);
  const grams=answerQty.known?answerQty.grams:state?.knownQuantity;
  if(grams==null) return results;
  return (results||[]).map(item=>scaleClarifiedFoodItem(item,grams));
}
function repairClarificationAnswer(answer,state){
  const text=String(answer||'').trim();
  if(!text||!state) return text;
  const family=normalisedClarificationFamilyName(state.family||state.baseItem||'');
  const missing=state.missingFields||[];
  if(!missing.includes('type')||!family.includes('yog')) return text;
  const normal=normaliseClarificationInput(text).toLowerCase();
  if(/\b(full|free|zero|0|nonfat|non fat)\s+fat\b|\bfat\s+free\b/.test(normal)) return text;
  const withoutQuantity=normal
    .replace(/\b(?:\d+(?:[.,]\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s*(?:g|kg|ml|l|oz|tbsp|tsp|cups?|grams?|slices?|pieces?|servings?|portions?|pots?)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
  if(withoutQuantity==='fat'){
    return normal.replace(/\bfat\b/,'fat free');
  }
  return text;
}
function parseClarificationInput(baseItem,answer,state=clarificationState){
  const answerQty=clarificationAnswerQuantityInfo(answer,state);
  const carryQty=!answerQty.known&&state?.knownQuantity!=null
    ?clarificationQuantityText(state.knownQuantity,state.knownUnit)
    :'';
  const answerQtyText=answerQty.known?clarificationQuantityText(answerQty.grams,answerQty.unit):'';
  const answerWithoutQty=answerQty.known?clarificationInputWithoutQuantity(answer):'';
  const fullInput=normaliseClarificationInput(`${carryQty} ${answer} ${baseItem}`);
  const candidates=[
    normaliseClarificationInput(`${carryQty} ${answer}`),
    quantityFirstClarificationInput(`${carryQty} ${answer}`),
    normaliseClarificationInput(answer),
    quantityFirstClarificationInput(answer),
    normaliseClarificationInput(`${answerQtyText} ${answerWithoutQty} ${baseItem}`),
    normaliseClarificationInput(`${answerWithoutQty} ${baseItem} ${answerQtyText}`),
    fullInput,
    quantityFirstClarificationInput(fullInput),
    normaliseClarificationInput(`${carryQty} ${baseItem} ${answer}`),
    quantityFirstClarificationInput(`${carryQty} ${baseItem} ${answer}`)
  ].filter((text,index,arr)=>text&&arr.indexOf(text)===index);
  let fallback={text:fullInput,results:typeof parseText==='function'?parseText(fullInput):[]};
  for(const text of candidates){
    const results=typeof parseText==='function'?parseText(text):[];
    if(shouldAskAgainForClarification(results,text)) continue;
    const hasWeight=results.some(r=>!r.command&&r.weightSpecified);
    if(hasWeight) return {text,results};
    if(!shouldAskAgainForClarification(fallback.results,fallback.text)) fallback={text,results};
    else fallback={text,results};
  }
  return fallback;
}
const VOICE_CLARIFY_AMBIGUOUS_LABELS=new Set([
  'cheese','milk','yoghurt','yogurt','greek yoghurt','greek yogurt',
  'rice','bread','chicken','pork','lamb','turkey','fish','tuna'
]);
function shouldVoiceClarifyAmbiguous(item){
  const label=typeof normaliseLogText==='function'?normaliseLogText(item?.label||''):String(item?.label||'').toLowerCase().trim();
  return VOICE_CLARIFY_AMBIGUOUS_LABELS.has(label);
}
function resolveAmbiguousDefault(item){
  const food=item?.matches&&item.matches[0];
  if(!food) return null;
  const amount=item.amount!=null?Math.max(1,Math.round(item.amount)):food.w;
  const r=amount/(food.w||100);
  return {
    name:food.name,
    weight:amount,
    kcal:Math.round(food.kcal*r),
    protein:Math.round(food.p*r*10)/10,
    carbs:Math.round(food.c*r*10)/10,
    fat:Math.round(food.f*r*10)/10,
    fibre:Math.round((food.fi||0)*r*10)/10,
    icon:food.icon,
    type:food.type||'solid',
    rawFood:food,
    confidence:'high',
    needsConfirm:false,
    weightSpecified:item.amount!=null,
    foodChoiceConfirmed:true,
    heardName:item.label||food.name
  };
}
function maybeStartIngredientClarification(results,rawText){
  if(clarificationState?.active||!isClarificationVoiceContext()) return false;
  if(!Array.isArray(results)||!results.length) return false;
  const foodResults=results.filter(r=>!r.command);
  if(foodResults.length!==1) return false;
  const item=foodResults[0];
  if(item.ambiguous){
    const defaultFood=item.matches&&item.matches[0]||null;
    const detail=clarificationMissingFieldsFor(item,rawText,defaultFood);
    if(likelyNeedsFoodRecoveryPrompt(rawText,item)) detail.missingFields.unshift('confirm_intent');
    if(!shouldVoiceClarifyAmbiguous(item)){
      const resolved=resolveAmbiguousDefault(item);
      if(resolved){
        voiceDebugTrace('ambiguous_default',{label:item.label,selected:resolved.name,amount:resolved.weight});
        handleParsed([resolved],rawText);
        return true;
      }
    }
    beginIngredientClarification(item.label||rawText||'ingredient',()=>showMultiConfirm(foodResults),{
      originalTranscript:rawText,
      family:item.label||rawText||'ingredient',
      quantityInfo:detail.quantityInfo,
      missingFields:detail.missingFields,
      candidateFood:defaultFood,
      defaultFood,
      mealSection:currentMealSection||null
    });
    return true;
  }
  const reviewState=getPendingFoodChoiceReview(results,rawText);
  if(reviewState){
    const quantityInfo=extractClarificationQuantityInfo(rawText,reviewState.existingFood);
    beginIngredientClarification(reviewState.rawName||rawText||'ingredient',()=>showFoodChoiceReview(reviewState),{
      originalTranscript:rawText,
      family:reviewState.rawName||rawText||'ingredient',
      quantityInfo,
      missingFields:['type',...(quantityInfo.known?[]:['quantity'])],
      candidateFood:reviewState.existingFood||null,
      defaultFood:reviewState.existingFood||null,
      mealSection:currentMealSection||null
    });
    return true;
  }
  const heard=typeof normaliseLogText==='function'?normaliseLogText(rawText):String(rawText||'').toLowerCase().trim();
  if(['cheese'].includes(heard)&&item.rawFood){
    const rawName=_foodChoiceDisplayName(rawText)||heard;
    const quantityInfo=extractClarificationQuantityInfo(rawText,item.rawFood);
    beginIngredientClarification(rawName,()=>showFoodChoiceReview({
      rawName,
      originalText:rawText,
      existingItem:item,
      existingFood:item.rawFood,
      relatedMatches:_relatedFoodMatches(rawName,item.rawFood),
      before:[],
      after:[]
    }),{
      originalTranscript:rawText,
      family:rawName,
      quantityInfo,
      missingFields:['type',...(quantityInfo.known?[]:['quantity'])],
      candidateFood:item.rawFood,
      defaultFood:item.rawFood,
      mealSection:currentMealSection||null
    });
    return true;
  }
  return false;
}
function handleClarification(transcript){
  if(!clarificationState?.active) return;
  const answer=String(transcript||'').trim();
  voiceDebugTrace('clarification_heard',{transcript:answer});
  if(!answer){
    clarificationState.attempts++;
    if(clarificationState.attempts>=2){fallbackIngredientClarification();return;}
    speakRecoveryThenListen(handleClarification);
    return;
  }
  const normalAnswer=typeof normaliseLogText==='function'?normaliseLogText(answer):answer.toLowerCase();
  if(/^(cancel|stop|skip|never mind|nevermind|no thanks|forget it)$/.test(normalAnswer)){
    cancelIngredientClarification();
    return;
  }
  const normalBase=typeof normaliseLogText==='function'?normaliseLogText(clarificationState.baseItem):String(clarificationState.baseItem||'').toLowerCase().trim();
  if(normalAnswer===normalBase){
    clarificationState.attempts++;
    if(clarificationState.attempts>=2){fallbackIngredientClarification();return;}
    const el=document.getElementById('transcript-text');
    if(el) el.textContent="Didn't catch that, try again";
    speakRecoveryThenListen(handleClarification);
    return;
  }
  const command=typeof parseText==='function'?parseText(answer).find(r=>r.command):null;
  if(command){
    clearIngredientClarification();
    handleParsed([command],answer);
    return;
  }

  const missing=clarificationState.missingFields||[];
  const normalYes=/^(yes|yeah|yep|correct|right|that'?s right|exactly|ok|okay)$/i.test(normalAnswer);
  const normalNo=/^(no|nope|wrong|not that|different)$/i.test(normalAnswer);
  if(missing.includes('confirm_intent')&&normalYes){
    clarificationState.missingFields=missing.filter(field=>field!=='confirm_intent');
    voiceDebugTrace('clarification_confirmed_intent',{family:clarificationState.family,remaining:clarificationState.missingFields});
    promptIngredientClarification();
    return;
  }
  if(missing.includes('confirm_intent')&&normalNo){
    fallbackIngredientClarification();
    return;
  }

  const repairedAnswer=repairClarificationAnswer(answer,clarificationState);
  if(repairedAnswer!==answer) voiceDebugTrace('clarification_answer_repaired',{from:answer,to:repairedAnswer});
  const answerQty=clarificationAnswerQuantityInfo(repairedAnswer,clarificationState);
  if(answerQty.known){
    clarificationState.knownQuantity=answerQty.grams;
    clarificationState.knownUnit=answerQty.unit;
    clarificationState.missingFields=missing.filter(field=>field!=='quantity'&&field!=='confirm_intent');
  }

  const parsed=parseClarificationInput(clarificationState.baseItem,repairedAnswer,clarificationState);
  let results=mergeClarificationQuantity(parsed.results,clarificationState,repairedAnswer);
  voiceDebugTrace('clarification_parsed',{input:parsed.text,results:voiceDebugResultSummary(results)});
  if(shouldAskAgainForClarification(results,parsed.text)){
    clarificationState.attempts++;
    if(clarificationState.attempts>=2){fallbackIngredientClarification();return;}
    const el=document.getElementById('transcript-text');
    if(el) el.textContent="Didn't catch that, try again";
    speakRecoveryThenListen(handleClarification);
    return;
  }
  const firstFood=results.find(r=>r&&!r.command);
  if(firstFood?.rawFood){
    clarificationState.candidateFood=firstFood.rawFood;
    clarificationState.defaultFood=firstFood.rawFood;
    clarificationState.baseItem=firstFood.name||clarificationState.baseItem;
    clarificationState.family=firstFood.name||clarificationState.family;
  }
  if(firstFood&&!firstFood.weightSpecified&&clarificationState.knownQuantity==null&&missing.includes('quantity')){
    clarificationState.missingFields=['quantity'];
    clarificationState.attempts=0;
    voiceDebugTrace('clarification_partial',{resolvedType:firstFood.name,missingFields:clarificationState.missingFields});
    promptIngredientClarification();
    return;
  }

  clearIngredientClarification();
  voiceDebugTrace('clarification_resolved',{input:parsed.text,results:voiceDebugResultSummary(results)});
  speakCachedResponse('got_it',{},()=>handleParsed(results,parsed.text));
}
function _ensureFoodChoiceScreen(){
  let screen=document.getElementById('ls-food-choice');
  if(screen) return screen;
  screen=document.createElement('div');
  screen.className='log-screen';
  screen.id='ls-food-choice';
  screen.style.cssText='background:var(--bg);padding:16px 20px calc(var(--tab-h) + 24px);';
  screen.innerHTML=`
    <div style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:4px;">Check the food</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;" id="fc-sub"></div>
    <div id="fc-existing-wrap" style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;">Existing matches</div>
      <div id="fc-existing-list" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>
    <div style="background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Create new food</div>
      <div class="custom-field-group" style="margin-bottom:10px;">
        <div class="custom-field-label">Food name</div>
        <input type="text" class="custom-input" id="fc-name">
      </div>
      <div class="custom-label-row">
        <div class="custom-field-group"><div class="custom-field-label">Calories per 100g</div><input type="number" class="custom-input" id="fc-kcal" min="0"></div>
        <div class="custom-field-group"><div class="custom-field-label">Protein per 100g</div><input type="number" class="custom-input" id="fc-protein" min="0" step="0.1"></div>
      </div>
      <div class="custom-label-row">
        <div class="custom-field-group"><div class="custom-field-label">Carbs per 100g</div><input type="number" class="custom-input" id="fc-carbs" min="0" step="0.1"></div>
        <div class="custom-field-group"><div class="custom-field-label">Fat per 100g</div><input type="number" class="custom-input" id="fc-fat" min="0" step="0.1"></div>
      </div>
      <button type="button" class="btn-primary" id="fc-create" style="margin-top:12px;">Create new food</button>
    </div>
    <div style="display:flex;justify-content:center;padding:2px 0 8px;">
      <button type="button" id="fc-cancel" style="background:none;border:none;color:var(--text-muted);font-size:13px;font-family:inherit;padding:8px 12px;cursor:pointer;">Cancel</button>
    </div>`;
  const confirm=document.getElementById('ls-confirm');
  if(confirm&&confirm.parentNode) confirm.parentNode.insertBefore(screen,confirm.nextSibling);
  return screen;
}
function _macroPer100FromItem(item,field,foodField){
  if(!item) return 0;
  if(item.weightSpecified&&item.weight){
    return Math.round((Number(item[field])||0)*100/item.weight*10)/10;
  }
  const food=item.rawFood;
  return food?Number(food[foodField])||0:Number(item[field])||0;
}
function showFoodChoiceReview(state){
  _pendingFoodChoice=state;
  _ensureFoodChoiceScreen();
  const rawName=state.rawName||state.originalText||'this food';
  const amount=state.existingItem?.weightSpecified?state.existingItem.weight:100;
  document.getElementById('fc-sub').textContent='I heard "'+rawName+'". Choose an existing match or create it as a new food.';
  const existingWrap=document.getElementById('fc-existing-wrap');
  const existingList=document.getElementById('fc-existing-list');
  const matches=state.relatedMatches||_relatedFoodMatches(rawName,state.existingFood);
  existingList.innerHTML='';
  if(matches.length){
    existingWrap.style.display='block';
    matches.forEach(food=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.cssText='width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:9px 11px;font-family:inherit;cursor:pointer;color:var(--text);';
      const kcal=Math.round(Number(food.kcal)||0);
      const p=Math.round((Number(food.p)||0)*10)/10;
      btn.innerHTML=`<span style="font-size:14px;font-weight:500;">${_choiceEsc(food.name)}</span><span style="font-size:12px;color:var(--text-muted);font-family:'Geist Mono',monospace;white-space:nowrap;">${kcal} kcal · ${p}g P</span>`;
      btn.addEventListener('click',()=>resolveFoodChoiceFood(food));
      existingList.appendChild(btn);
    });
  } else existingWrap.style.display='none';
  document.getElementById('fc-name').value=rawName;
  document.getElementById('fc-kcal').value=_macroPer100FromItem(state.existingItem,'kcal','kcal');
  document.getElementById('fc-protein').value=_macroPer100FromItem(state.existingItem,'protein','p');
  document.getElementById('fc-carbs').value=_macroPer100FromItem(state.existingItem,'carbs','c');
  document.getElementById('fc-fat').value=_macroPer100FromItem(state.existingItem,'fat','f');
  document.getElementById('fc-create').onclick=()=>resolveFoodChoiceCreate(amount);
  document.getElementById('fc-cancel').onclick=()=>{_pendingFoodChoice=null;showLogScreen('listening');maybeResumeVoiceSession(400);};
  showLogScreen('food-choice');
  pauseAlwaysOn();
  requestAnimationFrame(()=>document.getElementById('fc-name')?.focus());
}
function _continueFoodChoiceWith(item){
  const state=_pendingFoodChoice;
  _pendingFoodChoice=null;
  const next=[...(state?.before||[]),item,...(state?.after||[])];
  handleParsed(next,'');
}
function resolveFoodChoiceExisting(){
  if(!_pendingFoodChoice||!_pendingFoodChoice.existingItem) return;
  const item={..._pendingFoodChoice.existingItem,heardName:_pendingFoodChoice.rawName,foodChoiceConfirmed:true};
  _continueFoodChoiceWith(item);
}
function resolveFoodChoiceFood(food){
  if(!_pendingFoodChoice||!food) return;
  if(_pendingFoodChoice.existingFood&&food.name===_pendingFoodChoice.existingFood.name){
    resolveFoodChoiceExisting();
    return;
  }
  const base=_pendingFoodChoice.existingItem||{};
  let grams=base.weightSpecified?Math.max(1,Math.round(base.weight||food.w||100)):null;
  if(grams==null&&base.weight&&base.rawFood){
    grams=Math.max(1,Math.round(base.weight));
  }
  const item={...base,name:food.name,rawFood:food,icon:food.icon,type:food.type||'solid',confidence:'high',needsConfirm:false,foodChoiceConfirmed:true,heardName:_pendingFoodChoice.rawName};
  if(grams!=null){
    const r=grams/(food.w||100);
    Object.assign(item,{weight:grams,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,weightSpecified:true});
  } else {
    Object.assign(item,{weight:food.w,kcal:food.kcal,protein:food.p,carbs:food.c,fat:food.f,fibre:food.fi||0,weightSpecified:false});
  }
  _continueFoodChoiceWith(item);
}
function resolveFoodChoiceCreate(amount){
  if(!_pendingFoodChoice) return;
  const name=(document.getElementById('fc-name')?.value||'').trim();
  if(!name){showToast('Enter a food name');return;}
  const kcal=parseFloat(document.getElementById('fc-kcal')?.value)||0;
  const protein=parseFloat(document.getElementById('fc-protein')?.value)||0;
  const carbs=parseFloat(document.getElementById('fc-carbs')?.value)||0;
  const fat=parseFloat(document.getElementById('fc-fat')?.value)||0;
  const customFood=typeof addCustomFood==='function'?addCustomFood({name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'}):{name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'};
  const grams=_pendingFoodChoice.existingItem?.weightSpecified?Math.max(1,Math.round(amount||100)):100;
  const r=grams/100;
  const item={id:nextIngId++,name,weight:grams,kcal:Math.round(kcal*r),protein:Math.round(protein*r*10)/10,carbs:Math.round(carbs*r*10)/10,fat:Math.round(fat*r*10)/10,fibre:0,icon:'ti-clipboard',type:'solid',rawFood:customFood,weightSpecified:true,confidence:'high',needsConfirm:false,foodChoiceConfirmed:true,heardName:_pendingFoodChoice.rawName};
  _continueFoodChoiceWith(item);
}
function showVoiceCorrectBar(msg){
  const b=document.getElementById('voice-correct-bar'),m=document.getElementById('voice-correct-msg');
  if(!b) return;
  if(m) m.textContent=msg;
  b.style.display='flex';
}
function showVoiceCorrection(text){
  voiceDebugTrace('fallback_shown',{route:'low_confidence_review',transcript:text});
  const inp=document.getElementById('text-input');
  if(inp) inp.value=text;
  showVoiceCorrectBar('Did you say this? Edit and send, or tap mic.');
  if(inp) requestAnimationFrame(()=>{inp.focus();inp.select();});
}
function showVoiceRetry(msg){
  voiceDebugTrace('fallback_shown',{route:'voice_retry',message:msg||"Didn't catch that — try again"});
  const inp=document.getElementById('text-input');
  if(inp) inp.value='';
  showVoiceCorrectBar(msg||"Didn't catch that — try again");
}

function handleParsed(results,rawText=''){
  voiceDebugTrace('handle_parsed_enter',{rawText,results:voiceDebugResultSummary(results)});
  if(results&&results.length) resetVoiceRecovery();
  if(!results||!results.length){
    const rt=(rawText||'').trim();
    voiceDebugTrace('final_action',{action:rt.length>1?'fallback_resolve_ui':'voice_retry',rawText:rt});
    voiceDebugTrace('fallback_shown',{route:rt.length>1?'resolve_ui':'voice_retry',rawText:rt});
    if(rt.length>1){
      const qty=typeof extractQuantity==='function'?extractQuantity(rt):null;
      const rawName=_foodChoiceDisplayName(rt)||_normaliseChoiceText(rt)||rt;
      if(typeof showMultiFoodFallback==='function'){
        showMultiFoodFallback(rawName,[],[]);
      } else {
        showFoodChoiceReview({
          rawName,
          originalText:rt,
          existingItem:{weightSpecified:qty&&qty.grams!=null,weight:qty&&qty.grams!=null?Math.round(qty.grams):100},
          existingFood:null,
          relatedMatches:_relatedFoodMatches(rawName),
          before:[],
          after:[]
        });
      }
      if(voiceSessionActive||voiceCurrentlyListening||isRecording){
        speakCachedResponse('clarification_needed',{},null,{force:true});
      }
    } else {
      if(_voiceMode){
        showVoiceRetry("Didn't catch that — try again");
        speakRecoveryCue();
      } else showToast("Didn't catch that — try again!");
    }
    _voiceMode=false; return;
  }
  _voiceMode=false;
  if(results.length===1 && results[0].command && !['summary'].includes(results[0].command)){
    const handled=applyCorrectionCommand(results[0]);
    voiceDebugTrace('final_action',{action:'command',command:results[0].command,handled});
    refreshSummaryIfVisible();
    const _activeScr=document.querySelector('.log-screen.active')?.id;
    if(handled && _activeScr==='ls-listening') renderCurrentMeal();
    updateHome();
    if(handled && _activeScr==='ls-listening') maybeResumeVoiceSession(250);
    return;
  }
  if(results[0].command==='summary'){
    voiceDebugTrace('final_action',{action:'summary'});
    if(!meal.length){showToast('Add some ingredients first!');return;}
    stopAllRec(); showSummary(); return;
  }
  if(maybeStartIngredientClarification(results,rawText)){
    voiceDebugTrace('final_action',{action:'voice_clarification'});
    return;
  }
  if(maybeShowFoodChoiceReview(results,rawText)){
    voiceDebugTrace('final_action',{action:'food_choice_review'});
    return;
  }
  showBatchHeard(results);
  const foodResults=results.filter(r=>!r.command);
  if(foodResults.length===1&&shouldAskQuantityBeforeReview(foodResults[0])){
    itemQueue.push(foodResults[0]);
    voiceDebugTrace('final_action',{action:'queue_quantity_prompt',queued:voiceDebugResultSummary(foodResults)});
    processQueue([]);
    return;
  }
  const reviewItems=foodResults.filter(r=>!isClearIngredient(r));
  if(reviewItems.length){
    const clearItems=foodResults.filter(isClearIngredient);
    autoAddClearItems(clearItems);
    voiceDebugTrace('final_action',{action:'multi_confirm',reviewItems:voiceDebugResultSummary(reviewItems),autoAdded:voiceDebugResultSummary(clearItems)});
    showMultiConfirm(reviewItems);
    return;
  }
  if(batchNeedsMultiConfirm(results)){
    voiceDebugTrace('final_action',{action:'multi_confirm',reviewItems:voiceDebugResultSummary(results.filter(r=>!r.command))});
    showMultiConfirm(results);return;
  }
  itemQueue.push(...results);
  voiceDebugTrace('final_action',{action:'queue',queued:voiceDebugResultSummary(results)});
  processQueue([]);
}
function processQueue(autoAdded=[]){
  updateQueueDisplay();
  if(!itemQueue.length){
    showLogScreen('listening');
    if(autoAdded.length){
      announceAutoAdded(autoAdded,()=>maybeResumeVoiceSession(250));
    } else {
      const transcript=document.getElementById('transcript-text');
      if(transcript) transcript.textContent='—';
      maybeResumeVoiceSession(VOICE_RESTART_DEFAULT_MS);
    }
    updateHome();
    return;
  }
  const next=itemQueue.shift();
  if(next && next.command){ applyCorrectionCommand(next); refreshSummaryIfVisible(); processQueue(autoAdded); return; }
  updateQueueDisplay();
  if(shouldAutoAdd(next)){
    if(!next.weightSpecified && next.rawFood){
      if(autoAdded.length) showToast('Added '+batchPhrase(autoAdded)+'. One more thing.',2200);
      askQuantity(next);
      return;
    }
    autoAddItem(next);
    autoAdded.push(next);
    processQueue(autoAdded);
    return;
  }
  showConfirm(next);
}
function updateQueueDisplay(){
  const bar=document.getElementById('queue-bar'),chips=document.getElementById('queue-items'),rem=document.getElementById('queue-remaining');
  if(itemQueue.length){
    bar.classList.add('show');
    chips.innerHTML=itemQueue.map(q=>`<span class="queue-chip">${q.name||q.label||'?'}</span>`).join('');
    if(rem){rem.className='queue-remaining show';rem.textContent=itemQueue.length+' more ingredient'+(itemQueue.length>1?'s':'')+' queued';}
  } else {
    bar.classList.remove('show');
    if(rem) rem.className='queue-remaining';
  }
}

// ═══════════════════════════════════════════
// LOG SCREEN NAVIGATION
// ═══════════════════════════════════════════
function renderCurrentMeal(){
  const container=document.getElementById('current-meal-list');
  if(!container) return;
  if(!meal.length){container.style.display='none';return;}
  meal.forEach(i=>{if(!i.id)i.id=nextIngId++;});
  const t=sumMacros(meal);
  container.style.display='block';
  container.style.overflow='visible';
  container.innerHTML='';
  if(typeof currentQuickMode!=='undefined'&&currentQuickMode){
    const qsRow=document.createElement('div');
    qsRow.style.cssText='padding:8px 12px;border-bottom:.5px solid var(--border);display:flex;justify-content:flex-end;';
    const qsBtn=document.createElement('button');
    qsBtn.style.cssText='background:var(--accent);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;';
    qsBtn.textContent='Quick Save';
    qsBtn.addEventListener('click',()=>{
      if(!meal.length){showToast('Add some ingredients first!');return;}
      saveMealToLog();
      showToast('Meal saved! 🎉',2500);
      currentQuickMode=false;
      setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);
    });
    qsRow.appendChild(qsBtn);
    container.appendChild(qsRow);
  }
  const header=document.createElement('div');
  header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);border-radius:var(--radius-sm) var(--radius-sm) 0 0;';
  header.innerHTML=`<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Added so far</span><span style="font-size:12px;color:var(--accent);font-family:'Geist Mono',monospace;">${Math.round(t.kcal)} kcal · ${Math.round(t.protein)}g P</span>`;
  container.appendChild(header);
  meal.forEach(i=>{
    const row=document.createElement('div');
    if(_inlineEditId===i.id){
      row.style.cssText='display:flex;flex-direction:column;padding:6px 12px;border-bottom:.5px solid var(--border);background:var(--bg-2);gap:6px;';
      // Row 1: name + weight stepper
      const topRow=document.createElement('div');
      topRow.style.cssText='display:flex;align-items:center;gap:6px;';
      const nameIn=document.createElement('input');
      nameIn.type='text'; nameIn.value=i.name; nameIn.id='ile-name';
      nameIn.style.cssText='flex:1;min-width:0;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--accent);border-radius:6px;padding:4px 7px;outline:none;font-family:inherit;';
      const wtIn=document.createElement('input');
      wtIn.type='number'; wtIn.value=i.weight??''; wtIn.placeholder='g'; wtIn.id='ile-weight';
      wtIn.style.cssText='width:52px;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:4px 6px;outline:none;font-family:inherit;text-align:center;';
      const btnStyle='background:var(--card);border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;';
      const minusBtn=document.createElement('button');
      minusBtn.textContent='−'; minusBtn.type='button'; minusBtn.style.cssText=btnStyle;
      minusBtn.addEventListener('click',()=>stepIngWeight(i.id,-10));
      const plusBtn=document.createElement('button');
      plusBtn.textContent='+'; plusBtn.type='button'; plusBtn.style.cssText=btnStyle;
      plusBtn.addEventListener('click',()=>stepIngWeight(i.id,+10));
      const confirmBtn=document.createElement('button');
      confirmBtn.textContent='✓';
      confirmBtn.style.cssText='background:var(--accent);color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;';
      confirmBtn.addEventListener('click',()=>commitInlineEdit(i.id));
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.title='Remove';
      delBtn.style.cssText='background:none;border:none;padding:2px 6px;cursor:pointer;color:var(--text-muted);font-size:15px;flex-shrink:0;';
      delBtn.addEventListener('click',()=>{_inlineEditId=null;deleteFromCurrentMeal(i.id);});
      const handleKey=e=>{
        if(e.key==='Enter'){e.preventDefault();commitInlineEdit(i.id);}
        if(e.key==='Escape'){_inlineEditId=null;renderCurrentMeal();}
      };
      nameIn.addEventListener('keydown',handleKey);
      wtIn.addEventListener('keydown',handleKey);
      topRow.appendChild(nameIn); topRow.appendChild(minusBtn); topRow.appendChild(wtIn); topRow.appendChild(plusBtn); topRow.appendChild(confirmBtn); topRow.appendChild(delBtn);
      // Row 2: macro inputs
      const macroRow=document.createElement('div');
      macroRow.style.cssText='display:flex;gap:4px;';
      const ileMacroDefs=[{id:'ile-kcal',label:'kcal',val:i.kcal??0,accent:true},{id:'ile-protein',label:'P',val:i.protein??0},{id:'ile-carbs',label:'C',val:i.carbs??0},{id:'ile-fat',label:'F',val:i.fat??0}];
      ileMacroDefs.forEach(({id,label,val,accent})=>{
        const wrap=document.createElement('div');
        wrap.style.cssText='flex:1;text-align:center;background:var(--card);border:.5px solid var(--border);border-radius:8px;padding:4px;';
        const inp=document.createElement('input');
        inp.type='number'; inp.id=id; inp.value=val;
        inp.style.cssText='width:100%;text-align:center;border:none;background:transparent;font-family:"Geist Mono",monospace;font-size:13px;font-weight:500;outline:none;padding:0;color:'+(accent?'var(--accent)':'var(--text)')+';-moz-appearance:textfield;';
        inp.addEventListener('keydown',handleKey);
        inp.addEventListener('input',()=>{_inlineManualMacros=true;});
        const lbl=document.createElement('div');
        lbl.textContent=label;
        lbl.style.cssText='font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-top:1px;';
        wrap.appendChild(inp); wrap.appendChild(lbl);
        macroRow.appendChild(wrap);
      });
      row.appendChild(topRow); row.appendChild(macroRow);
      container.appendChild(row);
      requestAnimationFrame(()=>{const w=document.getElementById('ile-weight');if(w){w.focus();w.select();}});
    } else {
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);background:var(--card);';
      const label=document.createElement('span');
      label.style.cssText='font-size:13px;color:var(--text);flex:1;min-width:0;';
      label.textContent=i.name+(i.weight||i.serving?' '+itemWeightLabel(i):'');
      const macros=document.createElement('span');
      macros.style.cssText='font-size:12px;color:var(--text-muted);font-family:\'Geist Mono\',monospace;margin-right:6px;';
      macros.textContent=i.kcal+' kcal · '+i.protein+'g P';
      const editBtn=document.createElement('button');
      editBtn.title='Edit'; editBtn.innerHTML='<i class="ti ti-pencil"></i>';
      editBtn.style.cssText='background:none;border:none;padding:2px 5px;cursor:pointer;color:var(--text-muted);font-size:14px;';
      editBtn.addEventListener('click',()=>{snapshotMeal();_inlineEditId=i.id;_inlineManualMacros=false;renderCurrentMeal();});
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.title='Remove';
      delBtn.style.cssText='background:none;border:none;padding:2px 6px;cursor:pointer;color:var(--text-muted);font-size:15px;';
      delBtn.addEventListener('click',()=>deleteFromCurrentMeal(i.id));
      row.appendChild(label); row.appendChild(macros); row.appendChild(editBtn); row.appendChild(delBtn);
      container.appendChild(row);
    }
  });
  voiceDebugTrace('ui_updated',{screen:document.querySelector('.log-screen.active')?.id||null,reason:'render_current_meal',mealCount:meal.length});
}

function renderRecentIngredients(){
  const panel=document.getElementById('recent-ing-panel');
  if(!panel) return;
  const recent=(typeof getRecentIngredients==='function'?getRecentIngredients():[]).slice(0,5);
  if(!recent.length){panel.style.display='none';panel.innerHTML='';return;}
  panel.style.display='block';
  panel.style.margin='8px 20px 10px';
  panel.style.background='var(--card)';
  panel.style.border='.5px solid var(--border)';
  panel.style.borderRadius='var(--radius-sm)';
  panel.style.overflow='hidden';
  panel.innerHTML='';
  const header=document.createElement('div');
  header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);';
  header.innerHTML='<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Recent</span>';
  panel.appendChild(header);
  recent.forEach(r=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);cursor:pointer;';
    row.addEventListener('click',()=>addIngredientFromRecent(r));
    const label=document.createElement('span');
    label.style.cssText='font-size:13px;color:var(--text);flex:1;min-width:0;';
    label.textContent=r.name||'—';
    const meta=document.createElement('span');
    meta.style.cssText='font-size:12px;color:var(--text-muted);font-family:\'Geist Mono\',monospace;margin-left:8px;flex-shrink:0;';
    const bits=[];
    if(r.kcal!=null&&r.kcal!=='') bits.push(Math.round(Number(r.kcal))+' kcal');
    if(r.protein!=null&&r.protein!=='') bits.push(Math.round(Number(r.protein)*10)/10+'g P');
    if(r.weight||r.serving) bits.unshift(itemWeightLabel(r));
    meta.textContent=bits.join(' · ');
    row.appendChild(label);
    row.appendChild(meta);
    panel.appendChild(row);
  });
}
function addIngredientFromRecent(r){
  if(!r||!r.name) return;
  addIngredientToMeal({
    name:r.name,
    weight:r.weight,
    serving:r.serving?{...r.serving}:undefined,
    kcal:Math.round(Number(r.kcal))||0,
    protein:Math.round(Number(r.protein||0)*10)/10,
    carbs:Math.round(Number(r.carbs||0)*10)/10,
    fat:Math.round(Number(r.fat||0)*10)/10,
    fibre:Math.round(Number(r.fibre||0)*10)/10,
    icon:r.icon||'ti-clipboard',
    type:r.type||'solid',
  }, {source:'recent'});
  showToast('Added '+r.name+' ✓');
  renderCurrentMeal();
  updateHome();
}

function showLogScreen(id){
  document.querySelectorAll('.log-screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('ls-'+id).classList.add('active');
  if(id==='listening'){renderCurrentMeal();renderRecentIngredients();}
  else stopSousRealtimeVoice(false);
  voiceDebugTrace('ui_updated',{screen:'ls-'+id,reason:'show_log_screen'});
}

// ═══════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════
function cachedFeedbackKeyForSpokenText(text){
  const clean=String(text||'').toLowerCase().replace(/[.!?]+$/,'').trim();
  if(!clean) return null;
  if(['added','logged','done','got it','undone','deleted','removed','updated','cleared'].includes(clean)) return clean.replace(/\s+/g,'_');
  if(/^added\b/.test(clean)) return 'added';
  if(/^logged\b/.test(clean)) return 'logged';
  if(/^removed\b/.test(clean)) return 'removed';
  if(/^(updated|changed)\b/.test(clean)) return 'updated';
  if(/^undone\b/.test(clean)) return 'undone';
  if(/^cleared\b/.test(clean)) return 'cleared';
  if(/didn'?t catch|try again/.test(clean)) return 'recovery';
  return null;
}
function speak(text,onEnd,opts={}){
  if(!text){finishSkippedVoiceFeedback(onEnd);return;}
  const cachedKey=!opts.skipCache?cachedFeedbackKeyForSpokenText(text):null;
  if(cachedKey&&typeof speakCachedResponse==='function'){
    speakCachedResponse(cachedKey,{},onEnd,opts);
    return;
  }
  if(isVoiceSilentMode()){
    console.log('[Sous Voice] silent mode enabled');
    if(!opts.skipCache){
      voiceDebugTrace('feedback_audio',{key:null,route:'silent'});
      voiceDebugTrace('voice_feedback_blocked',{key:null,route:'silent',text});
      voiceDebugTrace('silent_mode_skipped_feedback',{key:null,route:'silent',text});
    }
    finishSkippedVoiceFeedback(onEnd);
    return;
  }
  const now=Date.now();
  if(!opts.force&&now-_lastSpeakAt<500){
    console.log('[Sous Voice] skipped (debounce)');
    if(!opts.skipCache){
      voiceDebugTrace('feedback_audio',{key:null,route:'skipped_debounce'});
      voiceDebugTrace('voice_feedback_blocked',{key:null,route:'skipped_debounce',text});
    }
    finishSkippedVoiceFeedback(onEnd);
    return;
  }
  _lastSpeakAt=now;
  if(!window.speechSynthesis){
    voiceDebugTrace('voice_feedback_blocked',{key:null,route:'speech_synthesis_unavailable',text});
    finishSkippedVoiceFeedback(onEnd);
    return;
  }
  window.speechSynthesis.cancel();
  let finished=false;
  let started=false;
  let startTimer=null;
  const finish=reason=>{
    if(finished) return;
    finished=true;
    if(startTimer){clearTimeout(startTimer);startTimer=null;}
    voiceDebugTrace('voice_feedback_ended',{key:null,route:'browser_tts',reason,text});
    setVoiceSpeaking(false,reason,null,{restart:!onEnd});
    if(onEnd) setTimeout(onEnd,Number.isFinite(opts.postSpeechDelayMs)?opts.postSpeechDelayMs:VOICE_POST_SPEECH_QUIET_MS);
  };
  setVoiceSpeaking(true,'speech synthesis',()=>finish('speech timeout'));
  if(!opts.skipCache){
    voiceDebugTrace('feedback_audio',{key:null,route:'browser_tts'});
    voiceDebugTrace('voice_feedback_requested',{key:null,route:'browser_tts',text});
  }
  const u=new SpeechSynthesisUtterance(text);
  u.rate=0.96; u.pitch=1.05; u.volume=1;
  const voices=window.speechSynthesis.getVoices();
  const score=v=>{
    const n=(v.name||'').toLowerCase(),l=(v.lang||'').toLowerCase();
    let s=0;
    if(/natural|neural|premium|enhanced|online|wavenet|studio/.test(n)) s+=120;
    if(/google/.test(n)) s+=60;
    if(/microsoft/.test(n)&&/online|natural/.test(n)) s+=80;
    if(/(samantha|ava|allison|serena|moira|karen|tessa|zoe|joanna|matthew|emma|amelia|aria|jenny|libby|sonia|guy|davis|tony|jane|nancy)/.test(n)) s+=70;
    if(/(microsoft mark|microsoft david|microsoft zira)\s*-/.test(n)) s-=40;
    if(/compact|espeak|festival/.test(n)) s-=80;
    if(l.startsWith('en')) s+=20;
    if(l==='en-us'||l==='en-gb') s+=10;
    return s;
  };
  const pref=voices.slice().sort((a,b)=>score(b)-score(a))[0];
  if(pref) u.voice=pref;
  u.onstart=()=>{started=true;if(startTimer){clearTimeout(startTimer);startTimer=null;}voiceDebugTrace('feedback_audio_started',{route:'browser_tts'});voiceDebugTrace('voice_feedback_started',{key:null,route:'browser_tts',text});voiceDebugTrace('voice_feedback_played',{key:null,route:'browser_tts',text});};
  u.onend=()=>finish('speech ended');
  u.onerror=()=>{voiceDebugTrace('voice_error',{source:'speech',error:'speech_error'});finish('speech error');};
  setTimeout(()=>{
    try{
      window.speechSynthesis.speak(u);
      startTimer=setTimeout(()=>{
        if(finished||started) return;
        try{
          if(window.speechSynthesis&&window.speechSynthesis.speaking) return;
          window.speechSynthesis&&window.speechSynthesis.cancel();
        }catch(e){}
        voiceDebugTrace('voice_error',{source:'speech',error:'speech_start_timeout'});
        finish('speech start timeout');
      },Number.isFinite(opts.startTimeoutMs)?opts.startTimeoutMs:VOICE_TTS_START_TIMEOUT_MS);
    }
    catch(e){finish('speech failed');}
  },30);
}
function speakThenListen(text,onResult,cacheKey=null,data={},opts={}){
  pauseAlwaysOn();
  const done=()=>resumeListeningAfterPrompt(onResult);
  if(cacheKey) speakCachedResponse(cacheKey,data,done,opts);
  else speak(text,done,opts);
}
function resumeListeningAfterPrompt(onResult,delay=260){
  if(onResult===handleClarification&&voiceSessionActive){
    voiceDebugTrace('clarification_listen_scheduled',{route:voiceSessionUseRealtime?'realtime_session':'tap_session',delay});
    scheduleVoiceSessionRestart(delay);
    return;
  }
  setTimeout(()=>startClarificationListen(onResult),delay);
}
function speakRecoveryThenListen(onResult){
  pauseAlwaysOn();
  speakRecoveryCue(()=>resumeListeningAfterPrompt(onResult),{force:true});
}

function speakCachedResponse(key,data={},onEnd,opts={}){
  if(isVoiceSilentMode()){
    voiceDebugTrace('feedback_audio',{key,route:'silent'});
    voiceDebugTrace('voice_feedback_blocked',{key,route:'silent'});
    voiceDebugTrace('silent_mode_skipped_feedback',{key,route:'silent'});
    finishSkippedVoiceFeedback(onEnd);
    return;
  }
  const now=Date.now();
  if(!opts.force&&now-_lastSpeakAt<500){
    console.log('[Sous Voice] skipped (debounce)');
    voiceDebugTrace('feedback_audio',{key,route:'skipped_debounce'});
    voiceDebugTrace('voice_feedback_blocked',{key,route:'skipped_debounce'});
    finishSkippedVoiceFeedback(onEnd);
    return;
  }
  const fallbackTTS=(text,fallbackOpts={})=>{
    if(!text){ voiceDebugTrace('feedback_audio',{key,route:'none'}); voiceDebugTrace('voice_feedback_blocked',{key,route:'no_feedback_text'}); finishSkippedVoiceFeedback(onEnd); return; }
    console.log('[Sous Voice] speaking:',key);
    voiceDebugTrace('feedback_audio',{key,route:'browser_tts'});
    voiceDebugTrace('voice_feedback_requested',{key,route:'browser_tts',text});
    _lastSpeakAt=0;
    speak(text,onEnd,{
      skipCache:true,
      force:!!opts.force,
      startTimeoutMs:Number.isFinite(fallbackOpts.startTimeoutMs)?fallbackOpts.startTimeoutMs:opts.startTimeoutMs,
      postSpeechDelayMs:Number.isFinite(fallbackOpts.postSpeechDelayMs)?fallbackOpts.postSpeechDelayMs:opts.postSpeechDelayMs
    });
  };
  const fastFallbackOpts={startTimeoutMs:VOICE_TTS_FALLBACK_START_TIMEOUT_MS,postSpeechDelayMs:120};
  const tryAudio=(audioUrl,text)=>{
    const audio=new Audio(audioUrl);
    let finished=false;
    let started=false;
    let audioStartTimer=null;
    const finish=reason=>{
      if(finished) return;
      finished=true;
      if(audioStartTimer){clearTimeout(audioStartTimer);audioStartTimer=null;}
      voiceDebugTrace('voice_feedback_ended',{key,route:'cached_audio',reason});
      setVoiceSpeaking(false,reason,null,{restart:!onEnd});
      if(onEnd) setTimeout(onEnd,VOICE_POST_SPEECH_QUIET_MS);
    };
    const markStarted=reason=>{
      if(started) return;
      started=true;
      if(audioStartTimer){clearTimeout(audioStartTimer);audioStartTimer=null;}
      voiceDebugTrace('feedback_audio_started',{key,route:'cached_audio',reason});
      voiceDebugTrace('voice_feedback_started',{key,route:'cached_audio',reason});
      voiceDebugTrace('voice_feedback_played',{key,route:'cached_audio',reason});
    };
    audio.onended=()=>finish('cached speech ended');
    audio.onplaying=()=>markStarted('playing');
    audio.onerror=()=>{
      if(audioStartTimer){clearTimeout(audioStartTimer);audioStartTimer=null;}
      voiceDebugTrace('voice_error',{source:'cached_speech',error:'audio_error',key});
      voiceDebugTrace('voice_feedback_blocked',{key,route:'cached_audio_error'});
      setVoiceSpeaking(false,'cached speech error',null,{restart:false});
      fallbackTTS(text,fastFallbackOpts);
    };
    _lastSpeakAt=Date.now();
    console.log('[Sous Voice] speaking:',key);
    voiceDebugTrace('feedback_audio',{key,route:'cached_audio',audioUrl});
    voiceDebugTrace('voice_feedback_requested',{key,route:'cached_audio',audioUrl});
    setVoiceSpeaking(true,'cached speech '+key,()=>finish('cached speech timeout'));
    audioStartTimer=setTimeout(()=>{
      if(finished||started) return;
      voiceDebugTrace('voice_error',{source:'cached_speech',error:'audio_start_timeout',key});
      voiceDebugTrace('voice_feedback_blocked',{key,route:'cached_audio_start_timeout'});
      try{audio.pause();audio.src='';}catch(e){}
      setVoiceSpeaking(false,'cached speech start timeout',null,{restart:false});
      fallbackTTS(text,fastFallbackOpts);
    },VOICE_AUDIO_START_TIMEOUT_MS);
    audio.play().then(()=>markStarted('play_resolved')).catch(()=>{
      if(audioStartTimer){clearTimeout(audioStartTimer);audioStartTimer=null;}
      voiceDebugTrace('voice_error',{source:'cached_speech',error:'play_failed',key});
      voiceDebugTrace('voice_feedback_blocked',{key,route:'cached_audio_play_failed'});
      setVoiceSpeaking(false,'cached speech failed',null,{restart:false});
      fallbackTTS(text,fastFallbackOpts);
    });
  };
  const resolve=(text,audioUrl)=>{
    if(audioUrl) tryAudio(audioUrl,text);
    else fallbackTTS(text);
  };
  if(typeof getCachedAudioUrlAsync==='function'&&typeof getCachedResponseAsync==='function'){
    Promise.all([
      getCachedResponseAsync(key,data).catch(()=>''),
      getCachedAudioUrlAsync(key).catch(()=>null)
    ]).then(([text,audioUrl])=>resolve(text,audioUrl));
  } else {
    const text=typeof getCachedResponse==='function'?getCachedResponse(key,data):'';
    const audioUrl=typeof getCachedAudioUrl==='function'?getCachedAudioUrl(key):null;
    resolve(text,audioUrl);
  }
}
function maybeSpeakFlowCue(reason,onEnd){
  if(!voiceSessionActive||isVoiceSilentMode()){if(onEnd)onEnd();return false;}
  if(document.querySelector('.log-screen.active')?.id!=='ls-listening'){if(onEnd)onEnd();return false;}
  const now=Date.now();
  const enoughLogged=reason!=='after_success'||voiceSuccessCueCount>=VOICE_FLOW_CUE_MIN_SUCCESSES;
  if(!enoughLogged||now<voiceFlowCueCooldownUntil||now-_lastSpeakAt<900){if(onEnd)onEnd();return false;}
  if(Math.random()>VOICE_FLOW_CUE_CHANCE){if(onEnd)onEnd();return false;}
  voiceSuccessCueCount=0;
  voiceFlowCueCooldownUntil=now+VOICE_FLOW_CUE_COOLDOWN_MS;
  voiceDebugTrace('voice_flow_cue',{reason});
  speakCachedResponse('flow',{},onEnd);
  return true;
}
function speakSuccessCue(onEnd){
  voiceSuccessCueCount++;
  speakCachedResponse('added',{},()=>{
    const spokeFlowCue=maybeSpeakFlowCue('after_success',onEnd);
    if(!spokeFlowCue&&!onEnd&&voiceSessionActive&&document.querySelector('.log-screen.active')?.id==='ls-listening'){
      scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    }
  });
}
function speakRecoveryCue(onEnd,opts={}){
  speakCachedResponse('recovery',{},onEnd,opts);
}

// ═══════════════════════════════════════════
// MIC STATE
// ═══════════════════════════════════════════
function setMicState(state){
  const btn=document.getElementById('mic-btn'),dot=document.getElementById('aob-dot'),
        txt=document.getElementById('aob-text'),status=document.getElementById('listen-status'),
        wf=document.getElementById('waveform');
  const prs=['pr1','pr2','pr3'].map(id=>document.getElementById(id));
  if(!btn) return;
  btn.className='mic-btn'+(state!=='idle'?' '+state:'');
  prs.forEach(p=>{if(p)p.className='pulse-ring'+(['listening','recording'].includes(state)?' active':'');});
  wf.className='waveform'+(state==='recording'?' active':state==='speaking'?' speaking':'');
  const cooking=cookingModeEnabled();
  const map=cooking?{
    idle:      {dc:'aob-dot',          tc:'aob-text',    tt:'Say "Hey Sous" or tap mic', st:'Tap to speak',              sc:'listen-status'},
    listening: {dc:'aob-dot listening',tc:'aob-text on', tt:'Listening for "Hey Sous"…', st:'Always on · tap to speak',  sc:'listen-status on'},
    wake:      {dc:'aob-dot wake',     tc:'aob-text on', tt:'Wake word detected…',       st:'Hey Sous — go ahead!',      sc:'listen-status on'},
    recording: {dc:'aob-dot active',   tc:'aob-text on', tt:'Recording…',                st:'Listening… say a food',     sc:'listen-status on'},
    processing:{dc:'aob-dot speaking', tc:'aob-text on', tt:'Adding…',                   st:'Adding…',                   sc:'listen-status on'},
    speaking:  {dc:'aob-dot speaking', tc:'aob-text on', tt:'Sous is talking…',          st:'Sous is talking…',          sc:'listen-status on'},
  }:{
    idle:      {dc:'aob-dot',          tc:'aob-text',    tt:'Tap mic to start voice logging', st:voiceSessionActive?'Ready for next food':'Tap mic to start voice logging', sc:'listen-status'},
    listening: {dc:'aob-dot listening',tc:'aob-text on', tt:'Listening… say a food',          st:'Listening… say a food', sc:'listen-status on'},
    wake:      {dc:'aob-dot listening',tc:'aob-text on', tt:'Listening… say a food',          st:'Listening… say a food', sc:'listen-status on'},
    recording: {dc:'aob-dot active',   tc:'aob-text on', tt:'Listening… say a food',          st:'Listening… say a food', sc:'listen-status on'},
    processing:{dc:'aob-dot speaking', tc:'aob-text on', tt:'Adding…',                        st:'Adding…',               sc:'listen-status on'},
    speaking:  {dc:'aob-dot speaking', tc:'aob-text on', tt:'Ready for next food',             st:'Ready for next food',   sc:'listen-status on'},
  };
  const m=map[state]||map.idle;
  if(state==='arming'&&!map.arming){
    m.dc='aob-dot speaking';
    m.tc='aob-text on';
    m.tt='Getting mic ready...';
    m.st='Getting mic ready...';
    m.sc='listen-status on';
  }
  dot.className=m.dc; txt.className=m.tc; txt.textContent=m.tt;
  if(status){status.className=m.sc;status.textContent=m.st;}
}

// ═══════════════════════════════════════════
// CONFIRM SCREEN
// ═══════════════════════════════════════════
function showConfirm(parsed){
  pendingFood=parsed;
  _confirmManualMacros=false;
  document.getElementById('confirm-name').textContent=parsed.name;
  document.getElementById('confirm-weight').textContent=itemWeightLabel(parsed)+(parsed.customMacro?'':' · raw');
  document.getElementById('confirm-icon').className='ti '+(parsed.icon||'ti-meat');
  const editable=!parsed.weightSpecified&&!!parsed.rawFood;
  const cKcal=document.getElementById('c-kcal'),cProt=document.getElementById('c-protein'),cCarbs=document.getElementById('c-carbs'),cFat=document.getElementById('c-fat');
  [cKcal,cProt,cCarbs,cFat].forEach((el,idx)=>{
    if(!el) return;
    const vals=[parsed.kcal,parsed.protein,parsed.carbs,parsed.fat];
    el.value=vals[idx];
    el.readOnly=!editable;
    el.tabIndex=editable?0:-1;
    el.oninput=editable?()=>{_confirmManualMacros=true;}:null;
  });
  document.getElementById('pill-raw').className='toggle-pill active';
  document.getElementById('pill-cooked').className='toggle-pill inactive';
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(editable){
    qtyRow.style.display='block';
    qtyInput.value=parsed.weight;
    qtyInput.oninput=()=>{
      if(_confirmManualMacros||!pendingFood?.rawFood) return;
      const g=parseFloat(qtyInput.value);
      if(!g||g<=0) return;
      const food=pendingFood.rawFood,r=g/food.w;
      if(cKcal) cKcal.value=Math.round(food.kcal*r);
      if(cProt) cProt.value=Math.round(food.p*r*10)/10;
      if(cCarbs) cCarbs.value=Math.round(food.c*r*10)/10;
      if(cFat) cFat.value=Math.round(food.f*r*10)/10;
    };
  } else {
    qtyRow.style.display='none';
    qtyInput.value='';
    qtyInput.oninput=null;
  }
  showLogScreen('confirm');
  pauseAlwaysOn();
  if(Date.now()<_suppressNextConfirmSpeechUntil){
    _suppressNextConfirmSpeechUntil=0;
    setTimeout(startConfirmListen,200);
  } else {
    speak(`Check this: ${parsed.name}, ${itemWeightLabel(parsed)}. Confirm?`,()=>startConfirmListen());
  }
}
function startConfirmListen(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||document.querySelector('.log-screen.active')?.id!=='ls-confirm') return;
  if(clarificationRec){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked',{source:'confirm'});
    return;
  }
  if(isRecording||voiceCurrentlyListening||sousRealtime){console.log('[Sous Voice] recognizer conflict avoided');}
  requestTapStop('confirm listen starting');
  stopSousRealtimeVoice(false);
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  clarificationRec=r;
  r.onstart=()=>{voiceCurrentlyListening=true;isRecording=true;setVoiceSessionState('listening','confirm recognition started');setMicState('recording');};
  r.onresult=e=>{
    clarificationRec=null;
    voiceCurrentlyListening=false;
    isRecording=false;
    const t=e.results[0][0].transcript.toLowerCase().trim();
    document.getElementById('transcript-text').textContent='"'+t+'"';
    if(/yes|confirm|correct|add|yep|yeah|right|ok/.test(t)) doConfirm();
    else if(/change|no|wrong|different|cancel|again/.test(t)) doChange();
    else showToast('Say "yes" to confirm or "change" to try again');
  };
  r.onerror=()=>{voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;};
  r.onend=()=>{voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;if(voiceSessionState==='listening')setVoiceSessionState(voiceSessionActive?'restarting':'idle','confirm recognition ended');};
  try{r.start();}
  catch(e){voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;setVoiceSessionState('error','confirm recognition start failed',{error:e.name||e.message||'start failed'});}
}
function doConfirm(){
  if(!pendingFood) return;
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(qtyRow.style.display!=='none'&&pendingFood.rawFood){
    const grams=parseFloat(qtyInput.value);
    if(grams&&grams>0){
      pendingFood.weight=Math.round(grams);
      if(_confirmManualMacros){
        pendingFood.kcal=parseFloat(document.getElementById('c-kcal')?.value)||0;
        pendingFood.protein=parseFloat(document.getElementById('c-protein')?.value)||0;
        pendingFood.carbs=parseFloat(document.getElementById('c-carbs')?.value)||0;
        pendingFood.fat=parseFloat(document.getElementById('c-fat')?.value)||0;
        // Override prompt when macros differ from DB food
        const food=pendingFood.rawFood,r=grams/food.w;
        const dbKcal=Math.round(food.kcal*r);
        if(pendingFood.kcal!==dbKcal){
          const r2=100/pendingFood.weight;
          _pendingOverride={key:food.name,name:pendingFood.name,macros:{kcal:Math.round(pendingFood.kcal*r2),protein:Math.round(pendingFood.protein*r2*10)/10,carbs:Math.round(pendingFood.carbs*r2*10)/10,fat:Math.round(pendingFood.fat*r2*10)/10,fibre:Math.round((pendingFood.fibre||0)*r2*10)/10}};
          setTimeout(()=>_showOverridePrompt(pendingFood.name||food.name),900);
        }
      } else {
        const food=pendingFood.rawFood,r=grams/food.w;
        pendingFood.kcal=Math.round(food.kcal*r);
        pendingFood.protein=Math.round(food.p*r*10)/10;
        pendingFood.carbs=Math.round(food.c*r*10)/10;
        pendingFood.fat=Math.round(food.f*r*10)/10;
        pendingFood.fibre=Math.round((food.fi||0)*r*10)/10;
      }
    }
  }
  addIngredientToMeal(pendingFood, {source:'voice'});
  _confirmManualMacros=false;
  const name=pendingFood.name;
  speakSuccessCue(()=>{
    pendingFood=null;
    processQueue();
    if(document.querySelector('.log-screen.active')?.id==='ls-listening') maybeResumeVoiceSession(300);
  });
}
function doChange(){
  pendingFood=null;
  speak('OK, what would you like to add?',()=>{showLogScreen('listening');maybeResumeVoiceSession(300);});
}

// ═══════════════════════════════════════════
// QUANTITY PROMPT (voice — high confidence, no weight)
// ═══════════════════════════════════════════
function parseGramsFromText(text){
  if(typeof extractQuantity==='function'){
    const qty=extractQuantity(text);
    const food=pendingFood?.rawFood||null;
    const grams=typeof quantityToGramsForFood==='function'
      ?quantityToGramsForFood(qty,food)
      :qty?.grams;
    if(grams!=null) return grams;
  }
  const m=String(text||'').match(/(\d+(?:\.\d+)?)\s*(?:g(?:rams?)?)?/i);
  return m?parseFloat(m[1]):null;
}
function commitQuantity(grams){
  if(!pendingFood||!pendingFood.rawFood) return;
  const food=pendingFood.rawFood;
  const r=grams/food.w;
  const item={name:food.name,weight:Math.round(grams),kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,type:food.type||'solid',rawFood:food};
  addIngredientToMeal(item, {source:'voice'});
  clearVoicePromptOwner('quantity_resolved');
  showToast('Added '+item.name+' '+Math.round(grams)+'g ✓');
  pendingFood=null;
  showLogScreen('listening');
  renderCurrentMeal();
  if(itemQueue.length) processQueue();
  else {
    updateQueueDisplay();
    updateHome();
  }
  speakSuccessCue(()=>maybeResumeVoiceSession(250));
}
function findUsualMealForIngredientName(name){
  if(typeof getUsualMeals!=='function') return null;
  const query=typeof normaliseLogText==='function'?normaliseLogText(name):String(name||'').toLowerCase().trim();
  if(!query) return null;
  const usuals=getUsualMeals()||{};
  let best=null,bestScore=0;
  Object.keys(usuals).forEach(section=>{
    const list=Array.isArray(usuals[section])?usuals[section]:[];
    list.forEach((u,index)=>{
      const nameText=typeof normaliseLogText==='function'?normaliseLogText(u.name||''):String(u.name||'').toLowerCase();
      const ingText=(u.ingredients||[]).map(i=>typeof normaliseLogText==='function'?normaliseLogText(i.name||''):String(i.name||'').toLowerCase()).join(' ');
      let score=0;
      if(nameText===query) score=900;
      else if(nameText.includes(query)) score=700+query.length;
      else if(ingText.split(/\s+/).includes(query)) score=650+query.length;
      else if(ingText.includes(query)) score=500+query.length;
      if(score>bestScore){best={...u,section:u.section||section,_usualIndex:index};bestScore=score;}
    });
  });
  return bestScore>0?best:null;
}
function commitUsualFromQuantityPrompt(){
  if(!pendingFood) return;
  const usual=pendingFood.usualMealOption||findUsualMealForIngredientName(pendingFood.name);
  if(!usual){showToast('No usual meal found for this');return;}
  snapshotMeal();
  if(typeof addMealToCurrent==='function') addMealToCurrent(usual);
  else {
    (usual.ingredients||[]).forEach(ing=>addIngredientToMeal({...ing}, {source:'repeat', skipSnapshot:true, skipPersist:true}));
    _persistDraft();
  }
  showToast('Added '+usual.name+' ✓');
  clearVoicePromptOwner('usual_from_quantity');
  pendingFood=null;
  showLogScreen('listening');
  renderCurrentMeal();
  if(itemQueue.length) processQueue();
  else {
    updateQueueDisplay();
    updateHome();
  }
  speakSuccessCue(()=>maybeResumeVoiceSession(250));
}
function askQuantity(item){
  pendingFood=item;
  const usual=findUsualMealForIngredientName(item.name);
  pendingFood.usualMealOption=usual||null;
  document.getElementById('qty-food-name').textContent=item.name;
  document.getElementById('qty-default-btn').textContent='Use default ('+item.weight+'g)';
  const usualBtn=document.getElementById('qty-usual-btn');
  if(usualBtn){
    usualBtn.style.display=usual?'block':'none';
    usualBtn.textContent=usual?'Use usual '+usual.name:'Use usual';
  }
  document.getElementById('qty-input').value='';
  const prompt='How much '+item.name+'?';
  const itemSummary=voiceDebugResultSummary([item])[0];
  setVoicePromptOwner('quantity',{prompt,item:itemSummary});
  voiceDebugTrace('quantity_prompt_shown',{item:itemSummary,prompt});
  showLogScreen('quantity');
  pauseAlwaysOn();
  speakThenListen(prompt,voiceAnswer=>{
    if(document.querySelector('.log-screen.active')?.id!=='ls-quantity') return;
    const quantityCancel=quantityPromptCancelCommand(voiceAnswer);
    if(quantityCancel&&cancelPendingQuantityFromVoice(quantityCancel,activeVoiceTranscriptTurn||null)) return;
    const grams=parseGramsFromText(voiceAnswer);
    if(grams&&grams>0){
      commitQuantity(grams);
      return false;
    } else {
      showToast('Didn\'t catch that — type it or use default');
    }
  },'clarify_quantity',{}, {force:true});
}

// ═══════════════════════════════════════════
// AMBIGUOUS SCREEN
// ═══════════════════════════════════════════
function showAmbiguous(matches,amount,label,question){
  currentAmbig={matches,amount,label,question};
  let selectedIdx=0;
  document.getElementById('ambig-sub').textContent='I heard "'+label+'"';
  document.getElementById('ambig-listen-text').textContent='Say the name or tap to choose';
  const container=document.getElementById('ambig-options');
  container.innerHTML='';
  matches.forEach((food,i)=>{
    const r=amount?amount/food.w:1,kcal=Math.round(food.kcal*r);
    const div=document.createElement('div');
    div.className='ambig-opt'+(i===0?' selected':'');
    div.innerHTML=`<div><div class="ambig-opt-name">${food.name}</div><div class="ambig-opt-macros">${Math.round(food.p*r)}g protein · ${Math.round(food.c*r)}g carbs · ${Math.round(food.f*r)}g fat</div></div><div class="ambig-opt-right"><div class="ambig-opt-kcal">${kcal} kcal</div><i class="ti ti-check ambig-check"></i></div>`;
    div.addEventListener('click',()=>{container.querySelectorAll('.ambig-opt').forEach(o=>o.classList.remove('selected'));div.classList.add('selected');selectedIdx=i;});
    container.appendChild(div);
  });
  document.getElementById('ambig-confirm-btn').onclick=()=>resolveAmbig(matches[selectedIdx],amount);
  showLogScreen('ambiguous');
  speakThenListen(question,voiceAnswer=>{
    const ans=voiceAnswer.toLowerCase();
    let resolved=null;
    for(const food of matches){
      if(food.name.toLowerCase().split(' ').some(part=>ans.includes(part)&&part.length>3)){resolved=food;break;}
    }
    if(resolved) resolveAmbig(resolved,amount);
    else{document.getElementById('ambig-listen-text').textContent='Didn\'t catch that — tap to choose';showToast('Tap your choice or say the name again');}
  },'clarify_type',{}, {force:true});
}
function resolveAmbig(food,amount){
  const r=amount?amount/food.w:1;
  const resolved=syncServingFromWeight({name:food.name,weight:amount?Math.round(amount):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,type:food.type||'solid',rawFood:food,weightSpecified:amount!=null});
  currentAmbig=null;
  if(!amount){askQuantity(resolved);}else{showConfirm(resolved);}
}

// ═══════════════════════════════════════════
// MULTI-CONFIRM (batch ingredient review)
// ═══════════════════════════════════════════
let pendingBatch=[];
function _multiConfirmNeedsType(entry){
  return !!entry?.ambiguous;
}
function _multiConfirmNeedsQuantity(entry){
  return !entry?.weightSpecified;
}
function _multiConfirmPromptForPendingBatch(){
  const needsType=pendingBatch.some(_multiConfirmNeedsType);
  const needsQuantity=pendingBatch.some(_multiConfirmNeedsQuantity);
  if(!needsType&&!needsQuantity) return null;
  if(needsType&&needsQuantity) return {text:'What type and how much?',cacheKey:'clarify_type_quantity'};
  if(needsType) return {text:'What type?',cacheKey:'clarify_type'};
  return {text:'How much?',cacheKey:'clarify_quantity'};
}
function _multiConfirmHasUnresolvedRows(){
  return !!_multiConfirmPromptForPendingBatch();
}
function _announceMultiConfirmPrompt(prompt,turnId,phase='scheduled'){
  if(!prompt) return;
  const transcript=document.getElementById('transcript-text');
  if(transcript) transcript.textContent=prompt.text;
  setVoicePromptOwner('multi_confirm',{
    turnId,
    prompt:prompt.text,
    items:voiceDebugResultSummary(pendingBatch.map(entry=>entry.rawItem||{
      ambiguous:entry.ambiguous,
      label:entry.label,
      amount:entry.weight
    }))
  });
  voiceDebugTrace('multi_confirm_voice_prompt',{
    turnId,
    prompt:prompt.text,
    cacheKey:prompt.cacheKey,
    phase,
    needsType:pendingBatch.some(_multiConfirmNeedsType),
    needsQuantity:pendingBatch.some(_multiConfirmNeedsQuantity)
  });
}
function scheduleMultiConfirmResolutionPrompt(){
  const prompt=_multiConfirmPromptForPendingBatch();
  if(!prompt) return;
  if(!(voiceSessionActive||voiceCurrentlyListening||isRecording)) return;
  const turnId=activeVoiceTranscriptTurn||null;
  _announceMultiConfirmPrompt(prompt,turnId,'scheduled');
  voiceDebugTrace('voice_feedback_requested',{turnId,key:prompt.cacheKey,route:'scheduled',prompt:prompt.text});
  setTimeout(()=>promptMultiConfirmResolution(turnId),20);
}
function _uniqueFoodsByName(foods){
  const seen=new Set();
  return (foods||[]).filter(food=>{
    const key=String(food?.name||'').toLowerCase();
    if(!food||!food.name||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function _multiConfirmFamilyOptions(heard){
  const db=typeof getFoodDatabase==='function'?getFoodDatabase():typeof FOODS!=='undefined'?FOODS:[];
  const text=_multiConfirmTextKey(heard);
  if(/\bcheese\b/.test(text)){
    return db.filter(food=>{
      const keys=[food.name,...(food.kw||[]),...(food.aliases||[])].map(_multiConfirmTextKey);
      return food.icon==='ti-cheese'||keys.some(key=>/\b(?:cheese|cheddar|mozzarella|parmesan|feta)\b/.test(key));
    }).slice(0,8);
  }
  return [];
}
function _multiConfirmOptionsForItem(item){
  if(item?.ambiguous) return _uniqueFoodsByName(item.matches||[]);
  const food=item?.rawFood||null;
  if(!food) return [];
  const heard=typeof normaliseLogText==='function'
    ?normaliseLogText(item.heardName||item.name||food.name)
    :String(item.heardName||item.name||food.name).toLowerCase().trim();
  const familyMatch=/(cheese|milk|bread|rice|yoghurt|yogurt|chicken|fish|tuna)\b/.test(heard);
  const related=familyMatch&&typeof _relatedFoodMatches==='function'
    ?_relatedFoodMatches(heard,food,7)
    :[];
  return _uniqueFoodsByName([food,...related,..._multiConfirmFamilyOptions(heard)]);
}
function _entryFood(entry){
  if(entry.showCreate) return null;
  return entry.options&&entry.options.length?entry.options[entry.selectedIdx||0]:entry.food;
}
function _multiConfirmTextKey(value){
  const text=typeof normaliseLogText==='function'?normaliseLogText(value||''):String(value||'').toLowerCase().trim();
  return text.replace(/[^a-z0-9]+/g,' ').trim();
}
function _multiConfirmEntryScore(entry,item){
  const itemKeys=[
    item?.name,
    item?.label,
    item?.heardName,
    item?.rawFood?.name,
    ...(item?.rawFood?.aliases||[]),
    ...(item?.rawFood?.kw||[]),
    ...((item?.matches||[]).flatMap(food=>[food.name,...(food.aliases||[]),...(food.kw||[])]))
  ].map(_multiConfirmTextKey).filter(Boolean);
  const entryKeys=[
    entry.label,
    entry.rawItem?.heardName,
    entry.rawItem?.name,
    entry.food?.name,
    ...((entry.options||[]).flatMap(food=>[food.name,...(food.aliases||[]),...(food.kw||[])]))
  ].map(_multiConfirmTextKey).filter(Boolean);
  let score=0;
  itemKeys.forEach(itemKey=>{
    entryKeys.forEach(entryKey=>{
      if(!itemKey||!entryKey) return;
      if(itemKey===entryKey) score=Math.max(score,100);
      else if(itemKey.includes(entryKey)||entryKey.includes(itemKey)) score=Math.max(score,60+Math.min(itemKey.length,entryKey.length));
    });
  });
  return score;
}
function _selectEntryFood(entry,item){
  if(!entry||!entry.options?.length) return false;
  const candidateFoods=[item?.rawFood,...(item?.matches||[])].filter(Boolean);
  const idx=entry.options.findIndex(food=>candidateFoods.some(candidate=>food.name===candidate.name||food.id===candidate.id));
  if(idx>=0){
    entry.selectedIdx=idx;
    entry.ambiguous=false;
    entry.showCreate=false;
    entry.manualMacros=false;
    return true;
  }
  const itemKeys=[
    item?.name,
    item?.label,
    item?.heardName,
    item?.rawFood?.name
  ].map(_multiConfirmTextKey).filter(Boolean);
  let bestIdx=-1,bestScore=0;
  entry.options.forEach((food,index)=>{
    const foodKeys=[food.name,...(food.aliases||[]),...(food.kw||[])].map(_multiConfirmTextKey).filter(Boolean);
    itemKeys.forEach(itemKey=>{
      foodKeys.forEach(foodKey=>{
        if(!itemKey||!foodKey) return;
        let score=0;
        if(itemKey===foodKey) score=100;
        else if(itemKey.includes(foodKey)||foodKey.includes(itemKey)) score=60+Math.min(itemKey.length,foodKey.length);
        if(score>bestScore){bestScore=score;bestIdx=index;}
      });
    });
  });
  if(bestIdx<0||bestScore<60) return false;
  entry.selectedIdx=bestIdx;
  entry.ambiguous=false;
  entry.showCreate=false;
  entry.manualMacros=false;
  return true;
}
function handleMultiConfirmVoiceFill(transcript){
  const active=document.querySelector('.log-screen.active')?.id;
  if(active!=='ls-multi-confirm'||!pendingBatch.length) return false;
  const results=typeof parseText==='function'?parseText(transcript).filter(r=>r&&!r.command):[];
  if(!results.length){
    showToast("Didn't catch that");
    voiceDebugTrace('multi_confirm_voice_fill_miss',{transcript,reason:'no_results'});
    return true;
  }
  const used=new Set();
  let updated=0;
  results.forEach(item=>{
    let bestIdx=-1,bestScore=0;
    pendingBatch.forEach((entry,idx)=>{
      if(used.has(idx)) return;
      const score=_multiConfirmEntryScore(entry,item);
      if(score>bestScore){bestScore=score;bestIdx=idx;}
    });
    if(bestIdx<0||bestScore<50) return;
    const entry=pendingBatch[bestIdx];
    used.add(bestIdx);
    _selectEntryFood(entry,item);
    const amount=item.ambiguous?item.amount:item.weight;
    if((item.weightSpecified||item.ambiguous)&&amount!=null){
      entry.weight=Math.max(1,Math.round(amount));
      entry.weightSpecified=true;
    }
    _updateEntryMacros(entry);
    updated++;
  });
  if(updated){
    renderMultiConfirm();
    const stillUnresolved=_multiConfirmHasUnresolvedRows();
    showToast('Updated '+updated+' item'+(updated!==1?'s':''));
    voiceDebugTrace('multi_confirm_voice_fill',{transcript,updated});
    const el=document.getElementById('transcript-text');
    if(el) el.textContent=stillUnresolved?'Review updated':'Review ready';
  } else {
    showToast("Didn't match that");
    voiceDebugTrace('multi_confirm_voice_fill_miss',{transcript,results:voiceDebugResultSummary(results)});
  }
  return true;
}
function promptMultiConfirmResolution(turnId=null){
  if(!pendingBatch.length) return;
  const prompt=_multiConfirmPromptForPendingBatch();
  if(!prompt) return;
  if(!(voiceSessionActive||voiceCurrentlyListening||isRecording)) return;
  _announceMultiConfirmPrompt(prompt,turnId||activeVoiceTranscriptTurn||null,'listening');
  speakThenListen(prompt.text,handleMultiConfirmVoiceFill,prompt.cacheKey,{}, {force:true});
}
function _updateEntryMacros(entry){
  if(entry.manualMacros) return;
  const food=_entryFood(entry);
  const w=Math.max(1,Math.round(entry.weight||1));
  if(food){
    const r=w/food.w;
    entry.editKcal=Math.round(food.kcal*r);
    entry.editProtein=Math.round(food.p*r*10)/10;
    entry.editCarbs=Math.round(food.c*r*10)/10;
    entry.editFat=Math.round(food.f*r*10)/10;
  } else {
    const ri=entry.rawItem||{};
    const origW=ri.weight||w;
    const r=origW>0?w/origW:1;
    entry.editKcal=Math.round((ri.kcal||0)*r);
    entry.editProtein=Math.round((ri.protein||0)*r*10)/10;
    entry.editCarbs=Math.round((ri.carbs||0)*r*10)/10;
    entry.editFat=Math.round((ri.fat||0)*r*10)/10;
  }
}
function batchNeedsMultiConfirm(results){
  const food=results.filter(r=>!r.command);
  if(!food.length) return false;
  if(food.some(r=>!isClearIngredient(r))) return true;
  return false;
}
function showMultiConfirm(results){
  pendingBatch=results.filter(r=>!r.command).map(r=>{
    const options=_multiConfirmOptionsForItem(r);
    let entry;
    if(r.ambiguous) entry={ambiguous:true,label:r.label,options,selectedIdx:0,weight:r.amount||100,weightSpecified:r.amount!=null,rawItem:r,manualMacros:false,showCreate:false,customName:r.label||'',customKcal:'',customProtein:'',customCarbs:'',customFat:''};
    else {
      const selectedIdx=Math.max(0,options.findIndex(food=>r.rawFood&&(food.name===r.rawFood.name||food.id===r.rawFood.id)));
      entry={ambiguous:false,label:r.name,options,selectedIdx,food:r.rawFood||null,weight:r.weight||r.rawFood?.w||100,weightSpecified:!!r.weightSpecified,rawItem:r,manualMacros:false,showCreate:false,customName:r.heardName||r.name||'',customKcal:'',customProtein:'',customCarbs:'',customFat:''};
    }
    _updateEntryMacros(entry);
    return entry;
  });
  renderMultiConfirm();
  showLogScreen('multi-confirm');
  if(_multiConfirmHasUnresolvedRows()) scheduleMultiConfirmResolutionPrompt();
  else if(voiceSessionActive||voiceCurrentlyListening||isRecording) speakCachedResponse('got_it',{},null,{force:true});
}
function renderMultiConfirm(){
  const list=document.getElementById('mc-list');
  if(!list) return;
  list.innerHTML='';
  pendingBatch.forEach((entry,idx)=>{
    const card=document.createElement('div');
    card.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;';
    const title=document.createElement('div');
    title.style.cssText='font-size:12px;color:var(--text-muted);margin-bottom:5px;';
    title.textContent=entry.ambiguous?`Heard "${entry.label}"`:entry.label;
    card.appendChild(title);
    if(entry.options&&entry.options.length){
      const select=document.createElement('select');
      select.style.cssText='width:100%;font-size:14px;background:var(--card);border:.5px solid var(--border);border-radius:7px;padding:7px 8px;color:var(--text);font-family:inherit;margin-bottom:8px;';
      entry.options.forEach((food,fi)=>{
        const opt=document.createElement('option');
        opt.value=String(fi);
        opt.textContent=food.name;
        select.appendChild(opt);
      });
      const customOpt=document.createElement('option');
      customOpt.value='new';
      customOpt.textContent='+ New item';
      select.appendChild(customOpt);
      select.value=entry.showCreate?'new':String(entry.selectedIdx||0);
      select.addEventListener('change',()=>{
        if(select.value==='new'){
          entry.showCreate=true;
          if(!entry.customName) entry.customName=entry.label||'New item';
        } else {
          entry.showCreate=false;
          entry.selectedIdx=parseInt(select.value,10)||0;
          entry.manualMacros=false;
        }
        _updateEntryMacros(entry);
        renderMultiConfirm();
      });
      card.appendChild(select);
    }
    if(entry.showCreate){
      const customWrap=document.createElement('div');
      customWrap.style.cssText='border:.5px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px;background:var(--bg-2);';
      const nameInput=document.createElement('input');
      nameInput.type='text';
      nameInput.value=entry.customName||entry.label||'';
      nameInput.placeholder='Food name';
      nameInput.style.cssText='width:100%;box-sizing:border-box;font-size:13px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-family:inherit;outline:none;margin-bottom:6px;';
      nameInput.addEventListener('input',()=>{entry.customName=nameInput.value;});
      customWrap.appendChild(nameInput);
      const grid=document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:5px;';
      [
        ['customKcal','kcal / 100g'],
        ['customProtein','protein g'],
        ['customCarbs','carbs g'],
        ['customFat','fat g']
      ].forEach(([key,placeholder])=>{
        const inp=document.createElement('input');
        inp.type='number';
        inp.value=entry[key]||'';
        inp.placeholder=placeholder;
        inp.min='0';
        inp.step='0.1';
        inp.style.cssText='font-size:12px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-family:inherit;outline:none;';
        inp.addEventListener('input',()=>{entry[key]=inp.value;});
        grid.appendChild(inp);
      });
      customWrap.appendChild(grid);
      card.appendChild(customWrap);
    }
    const qRow=document.createElement('div');
    qRow.style.cssText='display:flex;align-items:center;gap:6px;';
    const btnStyle='border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;background:var(--card-2);';
    const minusBtn=document.createElement('button');
    minusBtn.textContent='−'; minusBtn.type='button'; minusBtn.style.cssText=btnStyle;
    minusBtn.addEventListener('click',()=>{entry.weight=Math.max(1,(entry.weight||10)-10);_updateEntryMacros(entry);renderMultiConfirm();});
    const wtIn=document.createElement('input');
    wtIn.type='number'; wtIn.value=Math.round(entry.weight); wtIn.min=1;
    wtIn.style.cssText='width:60px;text-align:center;font-size:14px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-family:inherit;outline:none;';
    const applyWeightInput=({rerender=false}={})=>{
      entry.weight=Math.max(1,parseFloat(wtIn.value)||1);
      entry.weightSpecified=true;
      _updateEntryMacros(entry);
      if(rerender) renderMultiConfirm();
    };
    wtIn.addEventListener('input',()=>applyWeightInput());
    wtIn.addEventListener('change',()=>applyWeightInput({rerender:true}));
    const plusBtn=document.createElement('button');
    plusBtn.textContent='+'; plusBtn.type='button'; plusBtn.style.cssText=btnStyle;
    plusBtn.addEventListener('click',()=>{entry.weight=(entry.weight||0)+10;_updateEntryMacros(entry);renderMultiConfirm();});
    const gLbl=document.createElement('span');
    gLbl.textContent='g'; gLbl.style.cssText='font-size:13px;color:var(--text-muted);margin-right:auto;';
    const rmBtn=document.createElement('button');
    rmBtn.textContent='×'; rmBtn.type='button';
    rmBtn.style.cssText='background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:2px 4px;flex-shrink:0;';
    rmBtn.addEventListener('click',()=>{pendingBatch.splice(idx,1);if(!pendingBatch.length){clearVoicePromptOwner('multi_confirm_empty');showLogScreen('listening');return;}renderMultiConfirm();});
    qRow.appendChild(minusBtn); qRow.appendChild(wtIn); qRow.appendChild(plusBtn); qRow.appendChild(gLbl); qRow.appendChild(rmBtn);
    card.appendChild(qRow);
    // Macro inputs row
    const macroRow=document.createElement('div');
    macroRow.style.cssText='display:flex;gap:4px;margin-top:8px;';
    const mcMacroDefs=[{key:'editKcal',label:'kcal',accent:true},{key:'editProtein',label:'P'},{key:'editCarbs',label:'C'},{key:'editFat',label:'F'}];
    mcMacroDefs.forEach(({key,label,accent})=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='flex:1;text-align:center;background:var(--bg-2);border:.5px solid var(--border);border-radius:8px;padding:5px 4px;';
      const inp=document.createElement('input');
      inp.type='number'; inp.value=entry[key]??0;
      inp.style.cssText='width:100%;text-align:center;border:none;background:transparent;font-family:"Geist Mono",monospace;font-size:13px;font-weight:500;outline:none;padding:0;-moz-appearance:textfield;color:'+(accent?'var(--accent)':'var(--text)')+';';
      inp.addEventListener('input',()=>{entry.manualMacros=true;entry[key]=parseFloat(inp.value)||0;});
      const lbl=document.createElement('div');
      lbl.textContent=label;
      lbl.style.cssText='font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-top:2px;';
      wrap.appendChild(inp); wrap.appendChild(lbl);
      macroRow.appendChild(wrap);
    });
    card.appendChild(macroRow);
    list.appendChild(card);
  });
  const addBtn=document.getElementById('mc-add-btn');
  if(addBtn) addBtn.textContent='Add '+pendingBatch.length+' ingredient'+(pendingBatch.length!==1?'s':'')+' to meal';
}
function commitMultiConfirm(){
  if(!pendingBatch.length){clearVoicePromptOwner('multi_confirm_empty');showLogScreen('listening');return;}
  snapshotMeal();
  let overrideCandidate=null;
  pendingBatch.forEach(entry=>{
    const food=_entryFood(entry);
    const w=Math.max(1,Math.round(entry.weight));
    let item;
    if(entry.showCreate&&entry.customName&&entry.customName.trim()){
      const name=entry.customName.trim();
      const kcal=parseFloat(entry.customKcal)||0;
      const protein=parseFloat(entry.customProtein)||0;
      const carbs=parseFloat(entry.customCarbs)||0;
      const fat=parseFloat(entry.customFat)||0;
      const cf=typeof addCustomFood==='function'
        ?addCustomFood({name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'})
        :{name,w:100,kcal,p:protein,c:carbs,f:fat,fi:0,icon:'ti-clipboard',type:'solid'};
      const r=w/(cf.w||100);
      item={name:cf.name,weight:w,kcal:Math.round(cf.kcal*r),protein:Math.round(cf.p*r*10)/10,carbs:Math.round(cf.c*r*10)/10,fat:Math.round(cf.f*r*10)/10,fibre:0,icon:cf.icon,rawFood:cf};
    } else if(entry.manualMacros){
      const base=food?{name:food.name,icon:food.icon,rawFood:food}:{...(entry.rawItem||{})};
      item={...base,weight:w,kcal:entry.editKcal||0,protein:entry.editProtein||0,carbs:entry.editCarbs||0,fat:entry.editFat||0,fibre:food?Math.round((food.fi||0)*w/food.w*10)/10:(entry.rawItem?.fibre||0)};
      if(food&&w){
        const r2=100/w;
        const dbKcal=Math.round(food.kcal*w/food.w);
        if((entry.editKcal||0)!==dbKcal) overrideCandidate={key:food.name,name:food.name,macros:{kcal:Math.round((entry.editKcal||0)*r2),protein:Math.round((entry.editProtein||0)*r2*10)/10,carbs:Math.round((entry.editCarbs||0)*r2*10)/10,fat:Math.round((entry.editFat||0)*r2*10)/10,fibre:0}};
      }
    } else if(food){
      const r=w/food.w;
      item={name:food.name,weight:w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,rawFood:food};
    } else {
      const ri=entry.rawItem||{};
      const origW=ri.weight||w;
      const r=origW>0?w/origW:1;
      item={...ri,weight:w,kcal:Math.round((ri.kcal||0)*r),protein:Math.round((ri.protein||0)*r*10)/10,carbs:Math.round((ri.carbs||0)*r*10)/10,fat:Math.round((ri.fat||0)*r*10)/10,fibre:Math.round((ri.fibre||0)*r*10)/10};
    }
    addIngredientToMeal(item, {source:'voice', skipSnapshot:true, skipPersist:true});
  });
  _persistDraft();
  if(overrideCandidate){_pendingOverride=overrideCandidate;setTimeout(()=>_showOverridePrompt(overrideCandidate.name),600);}
  const count=pendingBatch.length; pendingBatch=[];
  clearVoicePromptOwner('multi_confirm_committed');
  showLogScreen('listening');
  updateHome();
  showToast('Added '+count+' ingredient'+(count!==1?'s':'')+' ✓');
  speakSuccessCue();
  maybeResumeVoiceSession(250);
}

// ═══════════════════════════════════════════
// SUMMARY SCREEN
// ═══════════════════════════════════════════
function defaultSectionFromTime(){
  const h=new Date().getHours();
  if(h<11) return 'breakfast';
  if(h<15) return 'lunch';
  if(h<21) return 'dinner';
  return 'snacks';
}
function showSummary(announce=true){
  if(!currentMealSection) currentMealSection=defaultSectionFromTime();
  const sel=document.getElementById('sum-section-select');
  if(sel) sel.value=currentMealSection;
  const nameInput=document.getElementById('sum-meal-name');
  if(nameInput&&(announce||!nameInput.value.trim())) nameInput.value=generateMealNameFromIngredients(meal,currentMealSection);
  const saveUsual=document.getElementById('sum-save-usual');
  if(saveUsual&&announce) saveUsual.checked=false;
  const t=sumMacros(meal);
  document.getElementById('sum-kcal').textContent=Math.round(t.kcal);
  document.getElementById('sum-protein').textContent=Math.round(t.protein)+'g';
  document.getElementById('sum-carbs').textContent=Math.round(t.carbs)+'g';
  document.getElementById('sum-fat').textContent=Math.round(t.fat)+'g';
  document.getElementById('sum-fibre').textContent=Math.round(t.fibre)+'g';
  document.getElementById('sum-sub').textContent=meal.length+' ingredient'+(meal.length!==1?'s':'');
  const list=document.getElementById('ing-list');
  list.innerHTML='';
  meal.forEach(item=>{
    if(!item.id) item.id=nextIngId++;
    const d=document.createElement('div'); d.className='ing-item'; d.dataset.id=item.id;
    d.innerHTML=`<div><div class="ing-name">${item.name}</div><div class="ing-weight">${itemWeightLabel(item)}</div></div><div style="display:flex;align-items:center;"><div class="ing-kcal">${item.kcal} kcal</div><i class="ti ti-pencil ing-edit-icon"></i></div>`;
    d.addEventListener('click',()=>openEditModal(item.id));
    list.appendChild(d);
  });
  showLogScreen('summary');
  if(announce) speakCachedResponse('done');
}

// ═══════════════════════════════════════════
// MANUAL ADD MODAL
// ═══════════════════════════════════════════
function openAddModal(){
  modalSelectedFood=null; modalActiveTab='search';
  document.getElementById('food-search').value='';
  document.getElementById('gram-input').value='100';
  document.getElementById('serving-unit-qty').value='1';
  document.getElementById('serving-unit-row').style.display='none';
  document.getElementById('selected-preview-box').style.display='none';
  renderFoodResults('');
  ['custom-name','custom-weight','custom-kcal','custom-protein','custom-carbs','custom-fat','custom-fibre','custom-unit-label','custom-unit-grams','custom-unit-kcal','custom-unit-protein','custom-unit-carbs','custom-unit-fat'].forEach(id=>{document.getElementById(id).value='';});
  switchModalTab('search');
  const m=document.getElementById('add-modal');
  m.style.display='flex';
  requestAnimationFrame(()=>m.classList.add('show'));
  setTimeout(()=>document.getElementById('food-search').focus(),150);
}
function openCustomEntry(){
  openAddModal();
  switchModalTab('custom');
  setTimeout(()=>document.getElementById('custom-name').focus(),150);
}
function setCustomFoodType(type){
  document.getElementById('custom-type-solid').classList.toggle('active',type==='solid');
  document.getElementById('custom-type-liquid').classList.toggle('active',type==='liquid');
  const servingLbl=document.getElementById('custom-serving-lbl');
  if(servingLbl) servingLbl.textContent='Default serving size ('+(type==='liquid'?'ml':'g')+') — optional';
  const per100Labels=document.querySelectorAll('.custom-per100-lbl');
  per100Labels.forEach(el=>{el.textContent=el.dataset.macro+' per 100'+(type==='liquid'?'ml':'g');});
}
function openCreateCustomFood(query){
  openAddModal();
  switchModalTab('custom');
  setCustomFoodType('solid');
  setTimeout(()=>{
    const nameEl=document.getElementById('custom-name');
    if(nameEl){nameEl.value=query||'';nameEl.focus();}
    if(query) setTimeout(()=>document.getElementById('custom-kcal').focus(),80);
  },150);
}
function closeAddModal(){
  const m=document.getElementById('add-modal');
  m.classList.remove('show');
  setTimeout(()=>{m.style.display='none';},300);
  modalSelectedFood=null;
}
function switchModalTab(tab){
  modalActiveTab=tab;
  document.getElementById('panel-search').style.display=tab==='search'?'block':'none';
  document.getElementById('panel-custom').style.display=tab==='custom'?'block':'none';
  document.getElementById('tab-search-btn').className='tab-btn'+(tab==='search'?' active':'');
  document.getElementById('tab-custom-btn').className='tab-btn'+(tab==='custom'?' active':'');
}
function renderFoodResults(query){
  const container=document.getElementById('food-results');
  const q=query.toLowerCase().trim();
  const customs=typeof getCustomFoods==='function'?getCustomFoods():[];
  const customMatches=q?customs.filter(f=>f.name.toLowerCase().includes(q)):customs.slice(0,5);
  const dbFoods=typeof getFoodDatabase==='function'?getFoodDatabase():FOODS;
  const dbMatches=q?dbFoods.filter(f=>f.name.toLowerCase().includes(q)||(f.kw&&f.kw.some(k=>k.includes(q)))):dbFoods.slice(0,20);
  container.innerHTML='';
  customMatches.forEach(food=>{
    const div=document.createElement('div');
    div.className='food-result-item'+(food===modalSelectedFood?' selected':'');
    div.innerHTML=`<span class="fri-name">${food.name}</span><span class="fri-custom-badge">custom</span><span class="fri-kcal">${food.kcal} kcal/100g</span>`;
    div.addEventListener('click',()=>selectFood(food));
    container.appendChild(div);
  });
  dbMatches.forEach(food=>{
    const div=document.createElement('div');
    div.className='food-result-item'+(food===modalSelectedFood?' selected':'');
    div.innerHTML=`<span class="fri-name">${food.name}</span><span class="fri-kcal">${food.kcal} kcal/100g</span>`;
    div.addEventListener('click',()=>selectFood(food));
    container.appendChild(div);
  });
  if(q&&customMatches.length===0&&dbMatches.length===0){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='create-custom-food-btn';
    btn.textContent='+ Create "'+query+'" as custom food';
    btn.addEventListener('click',()=>openCreateCustomFood(query));
    container.appendChild(btn);
  }
}
function selectFood(food){
  modalSelectedFood=food;
  const gramInput=document.getElementById('gram-input');
  if(gramInput&&food.defaultServing) gramInput.value=food.defaultServing;
  const unit=getServingUnitForFood(food);
  const unitRow=document.getElementById('serving-unit-row');
  const unitQty=document.getElementById('serving-unit-qty');
  const unitLabel=document.getElementById('serving-unit-label');
  if(unitRow&&unitQty&&unitLabel&&unit){
    unitRow.style.display='flex';
    unitQty.value=defaultServingQty(food,unit);
    unitLabel.textContent=_pluralUnit(unit.label,Number(unitQty.value)||1);
    if(unit.grams&&gramInput) gramInput.value=Math.round(unit.grams*(Number(unitQty.value)||1));
  } else if(unitRow){
    unitRow.style.display='none';
  }
  document.querySelectorAll('.food-result-item').forEach(el=>el.classList.toggle('selected',el.querySelector('.fri-name').textContent===food.name));
  document.getElementById('spb-name').textContent=food.name;
  document.getElementById('spb-per100').textContent=`per 100g · ${food.kcal} kcal · ${food.p}g P · ${food.c}g C · ${food.f}g F`;
  document.getElementById('selected-preview-box').style.display='block';
  updatePreviewMacros();
  document.getElementById('selected-preview-box').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function updatePreviewMacros(){
  if(!modalSelectedFood) return;
  const unit=getServingUnitForFood(modalSelectedFood);
  const unitRow=document.getElementById('serving-unit-row');
  const qty=parseFloat(document.getElementById('serving-unit-qty')?.value)||0;
  const byServing=unit&&unitRow&&unitRow.style.display!=='none'&&qty>0;
  const item=byServing?buildItemFromFoodServing(modalSelectedFood,qty,unit):null;
  if(item){
    if(unit.grams) document.getElementById('gram-input').value=Math.round(unit.grams*qty);
    document.getElementById('serving-unit-label').textContent=_pluralUnit(unit.label,qty);
    document.getElementById('pmg-kcal').textContent=Math.round(item.kcal);
    document.getElementById('pmg-p').textContent=Math.round(item.protein*10)/10+'g';
    document.getElementById('pmg-c').textContent=Math.round(item.carbs*10)/10+'g';
    document.getElementById('pmg-f').textContent=Math.round(item.fat*10)/10+'g';
    return;
  }
  const grams=parseFloat(document.getElementById('gram-input').value)||100;
  const r=grams/(modalSelectedFood.w||100);
  document.getElementById('pmg-kcal').textContent=Math.round(modalSelectedFood.kcal*r);
  document.getElementById('pmg-p').textContent=Math.round(modalSelectedFood.p*r*10)/10+'g';
  document.getElementById('pmg-c').textContent=Math.round(modalSelectedFood.c*r*10)/10+'g';
  document.getElementById('pmg-f').textContent=Math.round(modalSelectedFood.f*r*10)/10+'g';
}
function addManualIngredient(){
  if(modalActiveTab==='search'){
    if(!modalSelectedFood){showToast('Pick a food first');return;}
    const unit=getServingUnitForFood(modalSelectedFood);
    const unitRow=document.getElementById('serving-unit-row');
    const servingQty=parseFloat(document.getElementById('serving-unit-qty')?.value)||0;
    let newItem=null;
    if(unit&&unitRow&&unitRow.style.display!=='none'&&servingQty>0){
      newItem=buildItemFromFoodServing(modalSelectedFood,servingQty,unit);
      if(!newItem){showToast('Enter a valid serving amount');return;}
      newItem.id=nextIngId++;
    } else {
      const grams=parseFloat(document.getElementById('gram-input').value)||100;
      if(grams<=0){showToast('Enter a valid amount');return;}
      const r=grams/(modalSelectedFood.w||100);
      newItem={id:nextIngId++,name:modalSelectedFood.name,weight:Math.round(grams),kcal:Math.round(modalSelectedFood.kcal*r),protein:Math.round(modalSelectedFood.p*r*10)/10,carbs:Math.round(modalSelectedFood.c*r*10)/10,fat:Math.round(modalSelectedFood.f*r*10)/10,fibre:Math.round((modalSelectedFood.fi||0)*r*10)/10,icon:modalSelectedFood.icon,type:modalSelectedFood.type||'solid',rawFood:modalSelectedFood};
    }
    addIngredientToMeal(newItem, {source:'manual', applyOverride:true});
    const foodName=modalSelectedFood.name;
    showToast('Added '+foodName+' ✓');
    if(newItem.weight){
      const r2=100/Math.round(newItem.weight);
      _pendingOverride={key:foodName,name:foodName,macros:{kcal:Math.round(newItem.kcal*r2),protein:Math.round(newItem.protein*r2*10)/10,carbs:Math.round(newItem.carbs*r2*10)/10,fat:Math.round(newItem.fat*r2*10)/10,fibre:Math.round((newItem.fibre||0)*r2*10)/10}};
      setTimeout(()=>_showOverridePrompt(foodName),350);
    }
  } else {
    const name=document.getElementById('custom-name').value.trim();
    if(!name){showToast('Enter a food name');return;}
    const unitResult=readCustomUnitFromFields('custom');
    if(unitResult.error){showToast(unitResult.error);return;}
    const servingRaw=document.getElementById('custom-weight').value;
    const serving=servingRaw!==''?parseFloat(servingRaw)||100:100;
    const kcalPer100=parseFloat(document.getElementById('custom-kcal').value)||0;
    const proteinPer100=parseFloat(document.getElementById('custom-protein').value)||0;
    const carbsPer100=parseFloat(document.getElementById('custom-carbs').value)||0;
    const fatPer100=parseFloat(document.getElementById('custom-fat').value)||0;
    const fibrePer100=parseFloat(document.getElementById('custom-fibre').value)||0;
    const foodType=document.getElementById('custom-type-liquid').classList.contains('active')?'liquid':'solid';
    const customFood=typeof addCustomFood==='function'?addCustomFood({
      name,w:100,kcal:kcalPer100,p:proteinPer100,c:carbsPer100,f:fatPer100,fi:fibrePer100,
      defaultServing:servingRaw!==''?serving:undefined,icon:'ti-clipboard',type:foodType
    }):null;
    if(unitResult.unit&&typeof setCustomServingUnit==='function') setCustomServingUnit(name,unitResult.unit);
    const unit=unitResult.unit||getServingUnitForFood(name);
    const unitItem=unit?buildItemFromFoodServing(customFood||{name,w:100,kcal:kcalPer100,p:proteinPer100,c:carbsPer100,f:fatPer100,fi:fibrePer100,icon:'ti-clipboard',type:foodType},1,unit):null;
    const r=serving/100;
    addIngredientToMeal(
      unitItem
        ? {...unitItem}
        : {name,weight:serving,kcal:Math.round(kcalPer100*r),protein:Math.round(proteinPer100*r*10)/10,carbs:Math.round(carbsPer100*r*10)/10,fat:Math.round(fatPer100*r*10)/10,fibre:Math.round(fibrePer100*r*10)/10,icon:'ti-clipboard',type:foodType,rawFood:customFood||undefined},
      {source:'manual'}
    );
    showToast('Saved & added '+name+' ✓');
  }
  closeAddModal();
  showLogScreen('listening');
  renderCurrentMeal();
}

// ═══════════════════════════════════════════
// EDIT INGREDIENT MODAL
// ═══════════════════════════════════════════
function openEditModal(id){
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  document.getElementById('edit-ing-id').value=id;
  document.getElementById('edit-name').value=item.name;
  document.getElementById('edit-weight').value=item.weight??'';
  document.getElementById('edit-kcal').value=item.kcal;
  document.getElementById('edit-protein').value=item.protein;
  document.getElementById('edit-carbs').value=item.carbs;
  document.getElementById('edit-fat').value=item.fat;
  document.getElementById('edit-fibre').value=item.fibre??'';
  const foodForUnit=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
  const savedUnit=typeof getCustomServingUnit==='function'?getCustomServingUnit(foodForUnit?.name||item.name):null;
  populateCustomUnitFields('edit',savedUnit||item.serving||getServingUnitForFood(foodForUnit||item.name));
  _editBaseValues=null; _editFoodKey=null;
  if(item.weight&&!item.customMacro){
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    if(food){
      const r=item.weight/100;
      _editBaseValues={kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10};
      _editFoodKey=food.name;
    }
  }
  const m=document.getElementById('edit-modal');
  m.style.display='flex';
  requestAnimationFrame(()=>m.classList.add('show'));
}
function closeEditModal(){
  const m=document.getElementById('edit-modal');
  m.classList.remove('show');
  setTimeout(()=>{m.style.display='none';},300);
}
function _refreshAfterEdit(){
  const active=document.querySelector('.log-screen.active')?.id;
  if(active==='ls-listening') renderCurrentMeal(); else showSummary(false);
}
function saveEdit(){
  const id=parseInt(document.getElementById('edit-ing-id').value);
  const name=document.getElementById('edit-name').value.trim();
  const weightRaw=document.getElementById('edit-weight').value;
  const weight=weightRaw!==''?parseFloat(weightRaw)||null:null;
  const kcal=parseFloat(document.getElementById('edit-kcal').value)||0;
  const protein=parseFloat(document.getElementById('edit-protein').value)||0;
  const carbs=parseFloat(document.getElementById('edit-carbs').value)||0;
  const fat=parseFloat(document.getElementById('edit-fat').value)||0;
  const fibre=parseFloat(document.getElementById('edit-fibre').value)||0;
  if(!name){showToast('Food name required');return;}
  const unitResult=readCustomUnitFromFields('edit');
  if(unitResult.error){showToast(unitResult.error);return;}
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  snapshotMeal();
  item.name=name; item.weight=weight; item.kcal=kcal; item.protein=protein; item.carbs=carbs; item.fat=fat; item.fibre=fibre;
  if(unitResult.unit&&typeof setCustomServingUnit==='function'){
    const unitKey=item.rawFood?.name||_editFoodKey||name;
    setCustomServingUnit(unitKey,unitResult.unit);
    if(!item.serving&&weight&&unitResult.unit.grams&&Math.abs(weight/unitResult.unit.grams-Math.round(weight/unitResult.unit.grams))<0.001){
      const qty=Math.round(weight/unitResult.unit.grams);
      item.serving={label:unitResult.unit.label,quantity:qty,grams:unitResult.unit.grams};
    }
  }
  syncServingFromWeight(item);
  _persistDraft();
  closeEditModal(); _refreshAfterEdit(); showToast('Updated ✓');
  if(_editBaseValues&&weight&&_editFoodKey){
    const changed=kcal!==_editBaseValues.kcal||Math.abs(protein-_editBaseValues.protein)>0.05||Math.abs(carbs-_editBaseValues.carbs)>0.05||Math.abs(fat-_editBaseValues.fat)>0.05;
    if(changed){
      const r=100/weight;
      _pendingOverride={key:_editFoodKey,name:name,macros:{kcal:Math.round(kcal*r),protein:Math.round(protein*r*10)/10,carbs:Math.round(carbs*r*10)/10,fat:Math.round(fat*r*10)/10,fibre:Math.round(fibre*r*10)/10}};
      _showOverridePrompt(name);
    }
  }
}
function _showOverridePrompt(foodName){
  const el=document.getElementById('override-prompt');
  if(!el) return;
  const lbl=document.getElementById('override-prompt-label');
  if(lbl) lbl.textContent='Use these values for '+foodName+' next time?';
  el.style.display='flex';
  requestAnimationFrame(()=>el.classList.add('show'));
}
function _closeOverridePrompt(){
  const el=document.getElementById('override-prompt');
  if(!el) return;
  el.classList.remove('show');
  setTimeout(()=>{el.style.display='none';},300);
  _pendingOverride=null;
}
function _confirmOverride(){
  if(_pendingOverride&&_pendingOverride.key&&typeof setFoodOverride==='function'){
    setFoodOverride(_pendingOverride.key,_pendingOverride.macros);
    showToast('Saved as default for '+_pendingOverride.name);
  }
  _closeOverridePrompt();
}
function deleteIngredient(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  snapshotMeal(); meal.splice(idx,1); _persistDraft();
  closeEditModal(); _refreshAfterEdit(); showToast(name+' removed');
  speakCachedResponse('deleted',{},()=>maybeResumeVoiceSession(VOICE_RESTART_DEFAULT_MS));
}
function deleteFromCurrentMeal(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  snapshotMeal(); meal.splice(idx,1); _persistDraft();
  renderCurrentMeal(); showToast(name+' removed');
  speakCachedResponse('deleted',{},()=>maybeResumeVoiceSession(VOICE_RESTART_DEFAULT_MS));
}
function stepIngWeight(id,delta){
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  const cur=item.weight||0;
  const unitStep=item.serving?.grams||inferServingFromWeight(item)?.grams||10;
  const next=Math.max(1,cur+(delta<0?-unitStep:unitStep));
  if(next===cur) return;
  if(_inlineManualMacros){
    // Persist whatever the user typed in macro inputs before re-render
    const kEl=document.getElementById('ile-kcal'),pEl=document.getElementById('ile-protein'),cEl=document.getElementById('ile-carbs'),fEl=document.getElementById('ile-fat');
    if(kEl) item.kcal=parseFloat(kEl.value)||0;
    if(pEl) item.protein=parseFloat(pEl.value)||0;
    if(cEl) item.carbs=parseFloat(cEl.value)||0;
    if(fEl) item.fat=parseFloat(fEl.value)||0;
  } else if(cur>0){
    const r=next/cur;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.weight=next;
  syncServingFromWeight(item);
  renderCurrentMeal();
}
function commitInlineEdit(id){
  const item=meal.find(i=>i.id===id);
  if(!item){_inlineEditId=null;renderCurrentMeal();return;}
  const newName=(document.getElementById('ile-name')?.value||'').trim();
  if(!newName){showToast('Name required');return;}
  const wtVal=document.getElementById('ile-weight')?.value;
  const newWeight=wtVal!=null&&wtVal!==''?parseFloat(wtVal)||null:null;
  if(_inlineManualMacros){
    item.kcal=parseFloat(document.getElementById('ile-kcal')?.value)||0;
    item.protein=parseFloat(document.getElementById('ile-protein')?.value)||0;
    item.carbs=parseFloat(document.getElementById('ile-carbs')?.value)||0;
    item.fat=parseFloat(document.getElementById('ile-fat')?.value)||0;
  } else if(newWeight!==null&&item.weight&&item.weight>0&&newWeight!==item.weight){
    const r=newWeight/item.weight;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.name=newName; item.weight=newWeight;
  syncServingFromWeight(item);
  _persistDraft();
  _inlineManualMacros=false;
  _inlineEditId=null; renderCurrentMeal(); showToast('Updated ✓');
  if(item.weight&&!item.customMacro){
    const food=item.rawFood||(typeof findFoodByText==='function'?findFoodByText(item.name):null);
    if(food){
      const r2=100/item.weight;
      _pendingOverride={key:food.name,name:item.name,macros:{kcal:Math.round(item.kcal*r2),protein:Math.round(item.protein*r2*10)/10,carbs:Math.round(item.carbs*r2*10)/10,fat:Math.round(item.fat*r2*10)/10,fibre:Math.round((item.fibre||0)*r2*10)/10}};
      setTimeout(()=>_showOverridePrompt(item.name),200);
    }
  }
}

// ═══════════════════════════════════════════
// MEAL SAVING
// ═══════════════════════════════════════════
function getMealName(){
  const h=new Date().getHours();
  if(h<10) return 'Breakfast'; if(h<12) return 'Late breakfast';
  if(h<15) return 'Lunch'; if(h<18) return 'Afternoon snack';
  if(h<21) return 'Dinner'; return 'Evening snack';
}
function generateMealNameFromIngredients(ingredients,fallbackSection){
  const sectionLabels={breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snacks:'Snacks',supplements:'Supplements'};
  const fallback=sectionLabels[fallbackSection]||getMealName();
  const names=(ingredients||[]).map(i=>(i.name||'').trim()).filter(Boolean);
  if(names.length===0) return fallback;
  if(names.length===1) return names[0];
  if(names.length===2) return names[0]+' + '+names[1];
  if(names.length===3) return names[0]+', '+names[1]+' + '+names[2];
  return names[0]+' + '+(names.length-1)+' items';
}
function saveMealToLog(saveAsUsual=false){
  const date=(typeof selectedLogDate!=='undefined'?selectedLogDate:todayStr()),log=getLog();
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const section=currentMealSection||defaultSectionFromTime();
  const nameInput=document.getElementById('sum-meal-name');
  const typedName=nameInput?(nameInput.value.trim()||''):'';
  const name=typedName||generateMealNameFromIngredients(meal,section);
  const ingredients=meal.slice();
  const draft=typeof createMealDraft==='function'?createMealDraft({section,source:'cooking-session',ingredients}):{section,source:'cooking-session',ingredients};
  draft.name=name;
  draft.savedIngredients=ingredients;
  const mealObj=typeof draftToMeal==='function'?draftToMeal(draft):{name,time:new Date().toISOString(),section,ingredients,totals:sumMacros(ingredients)};
  if(typeof currentEditMealId!=='undefined'&&currentEditMealId&&typeof currentEditMealDate!=='undefined'&&currentEditMealDate){
    const editDate=currentEditMealDate;
    if(!log[editDate]) log[editDate]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
    const idx=log[editDate].meals.findIndex(m=>m.id===currentEditMealId);
    mealObj.id=currentEditMealId;
    if(idx!==-1) log[editDate].meals[idx]=mealObj;
    else log[editDate].meals.push(mealObj);
    log[editDate].totals=sumMacros(log[editDate].meals.map(m=>m.totals));
    currentEditMealId=null; currentEditMealDate=null;
  } else {
    mealObj.id=Date.now();
    log[date].meals.push(mealObj);
    log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  }
  saveLog(log);
  if(typeof clearDraft==='function') clearDraft();
  if(saveAsUsual&&window.updateUsualMeals) window.updateUsualMeals(mealObj,typedName);
  meal.forEach(i=>window.addToRecentIngredients(i));
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION
// ═══════════════════════════════════════════
function buildTapRec(){
  if(!SR) return null;
  let tapOwner=null;
  let pendingTranscript="";
  let pendingAlternatives=[];
  let finalizeTimer=null;
  let utteranceStartTime=null;
  let pendingConfidence=null;
  let lastInterimTrace='';

  const BASE_DELAY=380;
  const QUANTITY_TAIL_DELAY=650;
  const EXTENDED_DELAY=1050;
  const MAX_UTTERANCE_MS=10000;

  function currentTapOwner(){
    return tapOwner||voiceOwnerSnapshot({source:'tap'});
  }
  function isCurrentTapOwner(owner=currentTapOwner()){
    return isCurrentVoiceOwner(owner);
  }
  function traceStaleTapCallback(label,owner=currentTapOwner(),extra={}){
    traceStaleVoiceCallback(label,owner,{source:'tap',...extra});
  }
  function clearPendingTapTranscript(){
    pendingTranscript="";
    pendingAlternatives=[];
    pendingConfidence=null;
    utteranceStartTime=null;
  }
  function clearTapFinalizeTimer(reason,opts={}){
    if(finalizeTimer){
      clearTimeout(finalizeTimer);
      voiceDebugTrace('fallback_timer_cancelled',{route:'speech_finalize',transcript:opts.transcript??pendingTranscript,reason});
    }
    finalizeTimer=null;
    if(opts.clearPending) clearPendingTapTranscript();
  }

  function getAdaptiveDelay(text){
    const t=String(text||'').toLowerCase().replace(/\s+/g,' ').trim();
    if(!t) return BASE_DELAY;
    if(/\b(?:and|with|change|swap|replace|instead|to|for)\s*$/.test(t)) return EXTENDED_DELAY;
    if(/\b(?:instead\s+of|change\s+that\s+to|make\s+that|actually\s+make|swap\s+.+\s+(?:for|with))\b/.test(t)) return EXTENDED_DELAY;
    if(/\b(?:\d+(?:[.,]\d+)?|one|two|three|half|quarter)\s*(?:g|grams?|kg|ml|millilit(?:re|er)s?|l|oz|tbsp|tablespoons?|tsp|teaspoons?|cups?|slices?|scoops?)?\s*$/.test(t)) return QUANTITY_TAIL_DELAY;
    return BASE_DELAY;
  }

  async function finalizeTranscript(owner=currentTapOwner()){
    if(!isCurrentTapOwner(owner)){
      traceStaleTapCallback('tap_finalize',owner,{pendingTranscript:pendingTranscript.trim()||null});
      return;
    }
    if(!pendingTranscript) return;

    const transcript=pendingTranscript.trim();
    const finalConf=pendingConfidence;
    const alternatives=pendingAlternatives.slice(0,10);
    const firstHeardAt=utteranceStartTime;

    clearPendingTapTranscript();
    clearTapFinalizeTimer('finalizing_transcript',{transcript});

    requestTapStop('finalizing transcript');

    stopTapRec();
    routeFinalVoiceTranscript(transcript,{
      source:'tap',
      confidence:finalConf,
      alternatives,
      timing:{listenStartedAt:voiceListenStartedAt,firstHeardAt}
    });
  }

  const r=new SR(); r.lang='en-GB'; r.interimResults=true; r.continuous=true; r.maxAlternatives=3;
  function speechResultAlternatives(result){
    const alts=[];
    if(!result) return alts;
    const count=Math.min(result.length||0,3);
    for(let i=0;i<count;i++){
      const alt=result[i];
      const text=normalizeVoiceTranscriptText(alt?.transcript||'');
      if(text) alts.push({text,confidence:alt?.confidence??null,source:i===0?'primary':'speech_alt'});
    }
    return alts;
  }
  function combineSpeechAlternativeGroups(groups,limit=10){
    if(!groups.length) return [];
    let combined=[{text:'',confidence:null,source:'speech_alt'}];
    groups.forEach(group=>{
      const next=[];
      const usable=group.length?group:[{text:'',confidence:null,source:'speech_alt'}];
      combined.forEach(prefix=>{
        usable.forEach(alt=>{
          const text=normalizeVoiceTranscriptText([prefix.text,alt.text].filter(Boolean).join(' '));
          const confidence=[prefix.confidence,alt.confidence].filter(v=>typeof v==='number');
          next.push({
            text,
            confidence:confidence.length?Math.min(...confidence):null,
            source:alt.source||prefix.source||'speech_alt'
          });
        });
      });
      combined=next.slice(0,limit);
    });
    return combined.filter(c=>c.text);
  }
  function mergePendingAlternatives(previousText,existing,newSegmentAlternatives){
    const previous=normalizeVoiceTranscriptText(previousText);
    const bases=existing.length?existing:[previous?{text:previous,confidence:pendingConfidence,source:'primary'}:{text:'',confidence:null,source:'primary'}];
    const merged=[];
    bases.forEach(base=>{
      (newSegmentAlternatives.length?newSegmentAlternatives:[{text:'',confidence:null,source:'speech_alt'}]).forEach(alt=>{
        const text=normalizeVoiceTranscriptText([base.text,alt.text].filter(Boolean).join(' '));
        if(text) merged.push({text,confidence:alt.confidence??base.confidence??null,source:alt.source||base.source||'speech_alt'});
      });
    });
    return uniqVoiceCandidates(merged).slice(0,10);
  }
  r.__sousSetOwner=owner=>{tapOwner=owner||null;};
  r.__sousCancelFinalizer=reason=>clearTapFinalizeTimer(reason||'tap finalizer cancelled',{clearPending:true});
  r.__sousHasHeardSpeech=()=>!!(pendingTranscript.trim()||lastInterimTrace);
  r.onstart=()=>{const owner=currentTapOwner();if(!isCurrentTapOwner(owner)){traceStaleTapCallback('tap_onstart',owner);return;}clearVoiceRecognizerStartTimer();tapRecStarting=false;tapRecStopping=false;isRecording=true;voiceCurrentlyListening=true;voiceListenStartedAt=Date.now();setVoiceSessionState('listening','recognition started');voiceDebugTrace('recognizer_start',{source:'tap',phase:'started'});voiceDebugTrace('session_restart',{phase:'completed',route:'tap_recognition',restartCount:voiceRestartCount,turnId:activeVoiceTranscriptTurn||null});voiceDebugTrace('session_restart_completed',{route:'tap_recognition',restartCount:voiceRestartCount,turnId:activeVoiceTranscriptTurn||null});console.log('[Sous Voice] listening');logVoiceState('recognition actually started');setMicState('recording');startVoiceListeningWatchdog('tap');};
  r.onresult=e=>{
    const owner=currentTapOwner();
    if(!isCurrentTapOwner(owner)){
      traceStaleTapCallback('tap_onresult',owner);
      return;
    }
    startVoiceListeningWatchdog('tap');
    let interim='',final='',finalConf=null;
    const finalAltGroups=[];
    for(let i=e.resultIndex;i<e.results.length;i++){
      const res=e.results[i];
      if(res.isFinal){
        final+=res[0].transcript;
        finalAltGroups.push(speechResultAlternatives(res));
        if(finalConf===null)finalConf=res[0].confidence;
      }else interim+=res[0].transcript;
    }
    const el=document.getElementById('transcript-text');
    const heard=[pendingTranscript,final,interim].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    if(el) el.textContent=heard?'"'+heard+'"':'—';
    if(interim&&heard&&heard!==lastInterimTrace){
      lastInterimTrace=heard;
      voiceDebugTrace('interim_transcript',{source:'tap',transcript:heard,turnId:activeVoiceTranscriptTurn||voiceTranscriptTurn+1});
    }
    if(final){
      if(!pendingTranscript) utteranceStartTime=Date.now();
      const previousTranscript=pendingTranscript;
      const newAlternatives=combineSpeechAlternativeGroups(finalAltGroups);
      pendingTranscript=[pendingTranscript,final.trim()].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      pendingAlternatives=mergePendingAlternatives(previousTranscript,pendingAlternatives,newAlternatives);
      if(finalConf!==null) pendingConfidence=finalConf;
      voiceDebugTrace('final_transcript',{source:'tap',transcript:pendingTranscript,confidence:pendingConfidence,turnId:activeVoiceTranscriptTurn||voiceTranscriptTurn+1});
      voiceDebugTrace('speech_alternatives',{
        source:'tap',
        transcript:pendingTranscript,
        alternatives:pendingAlternatives.map(a=>({text:a.text,confidence:a.confidence,source:a.source})).slice(0,8)
      });

      clearTapFinalizeTimer('new_final_segment');

      const delay=getAdaptiveDelay(pendingTranscript);

      voiceDebugTrace('fallback_timer_started',{route:'speech_finalize',transcript:pendingTranscript,delay});
      const finalizeOwner={...owner};
      finalizeTimer=setTimeout(()=>finalizeTranscript(finalizeOwner),delay);

      if(voiceSessionState!=='listening'||!voiceCurrentlyListening){
        finalizeTranscript(finalizeOwner);
      } else if(Date.now()-utteranceStartTime>MAX_UTTERANCE_MS){
        finalizeTranscript(finalizeOwner);
      }
    }
  };
  r.onerror=e=>{
    const owner=currentTapOwner();
    if(!isCurrentTapOwner(owner)){
      traceStaleTapCallback('tap_onerror',owner,{error:e?.error||'unknown',pendingTranscript:pendingTranscript.trim()||null});
      return;
    }
    clearVoiceRecognizerStartTimer();
    clearVoiceListeningWatchdog();
    const err=e.error||'unknown';
    logVoiceState('recognition error',{error:err});
    voiceDebugTrace('recognizer_error',{source:'tap',error:err});
    voiceDebugTrace('voice_error',{source:'tap',error:err});
    if(err==='no-speech') voiceDebugTrace('no_speech',{source:'tap',pendingTranscript:pendingTranscript.trim()||null,turnId:activeVoiceTranscriptTurn||null});
    if(err==='no-speech'&&pendingTranscript.trim()){
      voiceDebugTrace('voice_recovery',{issue:'no_speech_after_transcript',transcript:pendingTranscript.trim()});
      finalizeTranscript(owner);
      return;
    }
    if(err==='no-speech'&&(processingTranscript||voiceSessionState==='processing'||(lastAcceptedTranscriptAt&&Date.now()-lastAcceptedTranscriptAt<10000))){
      voiceDebugTrace('voice_recovery',{issue:'stale_no_speech_ignored',transcript:lastAcceptedTranscript||null,turnId:activeVoiceTranscriptTurn||null});
      voiceDebugTrace('fallback_timer_ignored_stale_turn',{route:'speech_error',issue:'stale_no_speech_ignored',transcript:lastAcceptedTranscript||null,turnId:activeVoiceTranscriptTurn||null});
      clearTapFinalizeTimer('stale_no_speech_ignored',{clearPending:true});
      tapRecStarting=false;
      tapRecStopping=false;
      stopTapRec();
      if(voiceSessionActive&&!processingTranscript&&!isSpeaking) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
      return;
    }
    clearTapFinalizeTimer('recognition_error_'+err,{clearPending:true});
    tapRecStarting=false;
    tapRecStopping=false;
    stopTapRec();
    if(err==='not-allowed'||err==='audio-capture'){
      document.getElementById('perm-warn').style.display='block';
      speakCachedResponse('realtime_error');
      endVoiceSession();
    } else if(err==='no-speech'&&voiceSessionActive){
      if(voiceNoSpeechRetries>=2){showVoiceRetry("Didn't catch that — try again");endVoiceSession();return;}
      voiceNoSpeechRetries++;
      resetVoiceRecovery();
      voiceDebugTrace('voice_recovery',{issue:'no_speech',attempt:voiceNoSpeechRetries});
      showToast("Didn't catch that");
      speakRecoveryCue(()=>scheduleVoiceSessionRestart(300),{force:true});
    } else if(err==='no-speech') showVoiceRetry("Didn't catch that — try again");
    else if(err==='network'||err==='service-not-allowed'){
      showVoiceRetry("Voice service is unavailable — try again");
      endVoiceSession();
    } else if(err!=='aborted'){
      showVoiceRetry("Couldn't understand that");
      endVoiceSession();
    }
  };
  r.onend=()=>{
    const owner=currentTapOwner();
    if(!isCurrentTapOwner(owner)){
      traceStaleTapCallback('tap_onend',owner,{hadFinalizeTimer:!!finalizeTimer});
      return;
    }
    clearVoiceRecognizerStartTimer();
    clearVoiceListeningWatchdog();
    const wasListening=voiceSessionState==='listening';
    tapRecStarting=false;
    tapRecStopping=false;
    logVoiceState('recognition ended');
    voiceDebugTrace('recognizer_end',{source:'tap',wasListening,hadFinalizeTimer:!!finalizeTimer});
    if(!finalizeTimer) stopTapRec();
    if(wasListening&&voiceSessionActive&&!processingTranscript&&!isSpeaking&&!voiceSessionStoppedManually){
      voiceDebugTrace('voice_recovery',{issue:'unexpected_end'});
      scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    }
  };
  return r;
}
function stopTapRec(){
  clearVoiceListeningWatchdog();
  clearVoiceRecognizerStartTimer();
  cancelTapFinalizer('tap recognition stopped');
  if(isRecording||voiceCurrentlyListening) console.log('[Sous Voice] tap listen stop');
  isRecording=false;
  voiceCurrentlyListening=false;
  tapRecStarting=false;
  tapRecStopping=false;
  if(voiceSessionState==='listening') setVoiceSessionState(voiceSessionActive?'restarting':'idle','recognition stopped');
  if(!isSpeaking&&!processingTranscript)setMicState(alwaysOnActive&&cookingModeEnabled()?'listening':'idle');
}
function realtimeVoiceEnabled(){
  try{
    return localStorage.getItem('sous_realtime_voice')==='1' || new URLSearchParams(location.search).get('realtime')==='1';
  }catch(e){return false;}
}
function realtimeClientSecret(data){
  return data && (data.client_secret?.value || data.client_secret || data.value);
}
function realtimeFoodContext(){
  const foods=typeof getFoodDatabase==='function'?getFoodDatabase():(typeof FOODS!=='undefined'?FOODS:[]);
  return (foods||[]).map(food=>({
    name:food.name,
    aliases:[...(food.kw||[]),...(food.aliases||[])]
  }));
}
function sendRealtimeEvent(event){
  if(!sousRealtime||!sousRealtime.dc||sousRealtime.dc.readyState!=='open') return false;
  sousRealtime.dc.send(JSON.stringify(event));
  return true;
}
function extractRealtimeActionText(event){
  if(!event) return '';
  if(typeof event.response?.output_text==='string') return event.response.output_text;
  const output=event.response?.output||event.output||[];
  if(!Array.isArray(output)) return '';
  return output.flatMap(item=>Array.isArray(item.content)?item.content:[])
    .map(part=>part.text||part.transcript||part.output_text||'')
    .filter(Boolean)
    .join('\n');
}
function normalizeRealtimeSection(section){
  return ['breakfast','lunch','dinner','snacks','supplements'].includes(section)?section:null;
}
function extractRealtimeJsonObject(raw){
  const text=String(raw||'').replace(/```(?:json)?/gi,'```').replace(/```/g,'').trim();
  const start=text.indexOf('{');
  if(start<0) return text;
  let depth=0,inString=false,escape=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(escape){escape=false;continue;}
    if(ch==='\\'){escape=true;continue;}
    if(ch==='"'){inString=!inString;continue;}
    if(inString) continue;
    if(ch==='{') depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0) return text.slice(start,i+1);
    }
  }
  return text.slice(start);
}
function parseRealtimeAction(raw){
  const json=extractRealtimeJsonObject(raw);
  try{return JSON.parse(json);}
  catch(e){return null;}
}
function sanitizeRealtimeIngredient(ingredient){
  if(!ingredient||typeof ingredient!=='object') return null;
  const name=String(ingredient.name||'').trim();
  if(!name) return null;
  const quantity=ingredient.quantity==null||ingredient.quantity===''?null:Number(ingredient.quantity);
  return{
    name,
    quantity:Number.isFinite(quantity)?quantity:null,
    unit:ingredient.unit==null||ingredient.unit===''?null:String(ingredient.unit).trim()
  };
}
function normalizeRealtimeAction(action){
  if(!action||typeof action!=='object') return null;
  const type=String(action.type||'').trim();
  if(type==='cancel') return {type:'cancel'};
  if(type==='clarify'){
    return {type:'clarify',message:String(action.message||'').trim()};
  }
  if(type!=='log_ingredients') return null;
  const ingredients=Array.isArray(action.ingredients)
    ? action.ingredients.map(sanitizeRealtimeIngredient).filter(Boolean)
    : [];
  return{
    type:'log_ingredients',
    section:normalizeRealtimeSection(action.section),
    transcript:String(action.transcript||'').trim(),
    ingredients,
    needsConfirmation:true
  };
}
function realtimeIngredientPhrase(ingredient){
  const name=String(ingredient?.name||'').trim();
  if(!name) return '';
  const qty=ingredient.quantity==null?'':String(ingredient.quantity).trim();
  let unit=String(ingredient.unit||'').trim();
  const normName=typeof normaliseLogText==='function'?normaliseLogText(name):name.toLowerCase();
  const normUnit=typeof normaliseLogText==='function'?normaliseLogText(unit):unit.toLowerCase();
  if(normUnit&&normName&&(normName===normUnit||normName===normUnit.replace(/s$/,'')||normUnit===normName.replace(/s$/,''))){
    unit='';
  }
  return [qty,unit,name].filter(Boolean).join(' ');
}
function transcriptFromRealtimeAction(action){
  const ingredientText=Array.isArray(action.ingredients)
    ? action.ingredients.map(realtimeIngredientPhrase).filter(Boolean).join(' and ')
    : '';
  return ingredientText||String(action.transcript||'').trim();
}
function forceRealtimeReviewResults(results){
  return (results||[]).map(result=>{
    if(!result||result.command) return result;
    return {...result,needsConfirm:true,weightSpecified:false};
  });
}
function routeRealtimeTranscriptToReview(transcript){
  const text=String(transcript||'').trim();
  if(!text) return false;
  voiceDebugTrace('final_transcript',{source:'realtime',transcript:text,turnId:activeVoiceTranscriptTurn||voiceTranscriptTurn+1});
  voiceDebugTrace('transcript_heard',{source:'realtime',transcript:text});
  if(clarificationState?.active){
    voiceDebugTrace('transcript_routed',{route:'clarification',source:'realtime',transcript:text});
    handleClarification(text);
    return true;
  }
  const results=typeof parseText==='function'?parseText(text):[];
  voiceDebugTrace('parser_result',{source:'realtime',transcript:text,results:voiceDebugResultSummary(results),forcedReview:true});
  const forced=forceRealtimeReviewResults(results);
  handleParsed(forced,text);
  return Array.isArray(forced)&&forced.some(item=>item&&!item.command);
}
function handleRealtimeActionText(text){
  const raw=String(text||'').trim();
  if(processingTranscript) setVoiceProcessing(false,'realtime response received');
  if(!raw) return;
  logVoiceState('speech result received',{source:'realtime',raw});
  let action=normalizeRealtimeAction(parseRealtimeAction(raw));
  if(!action){
    console.log('[Sous Realtime] error', 'Invalid action JSON; using transcript parser');
    const fallback=raw.replace(/```(?:json)?|```/gi,'').trim();
    const el=document.getElementById('transcript-text');
    if(el&&fallback) el.textContent='"'+fallback+'"';
    stopSousRealtimeVoice(false);
    console.log('[Sous Voice] processing transcript');
    setVoiceProcessing(true,'realtime fallback processing');
    routeRealtimeTranscriptToReview(fallback);
    setVoiceProcessing(false,'realtime fallback processing');
    maybeResumeVoiceSession(VOICE_RESTART_DEFAULT_MS);
    return;
  }
  console.log('[Sous Realtime] action received');
  if(action.type==='cancel'){
    stopSousRealtimeVoice(true);
    return;
  }
  if(action.type==='clarify'){
    const msg=String(action.message||'').trim();
    const uiMsg=msg||(typeof getCachedResponse==='function'?getCachedResponse('clarification_needed'):'I need one more detail.');
    const el=document.getElementById('transcript-text');
    if(el) el.textContent=uiMsg;
    showToast(uiMsg,2600);
    voiceDebugTrace('clarification_shown',{source:'realtime',prompt:uiMsg});
    stopSousRealtimeVoice(false);
    speakCachedResponse('clarification_needed');
    return;
  }
  if(action.type==='log_ingredients'){
    const section=normalizeRealtimeSection(action.section);
    if(section) currentMealSection=section;
    const transcript=transcriptFromRealtimeAction(action);
    if(!transcript){
      stopSousRealtimeVoice(false);
      speakCachedResponse('clarification_needed');
      return;
    }
    const el=document.getElementById('transcript-text');
    if(el) el.textContent='"'+transcript+'"';
    _suppressNextConfirmSpeechUntil=Date.now()+3000;
    stopSousRealtimeVoice(false);
    console.log('[Sous Voice] processing transcript');
    setVoiceProcessing(true,'realtime action processing');
    routeRealtimeTranscriptToReview(transcript);
    setVoiceProcessing(false,'realtime action processing');
    if(action.ingredients&&action.ingredients.length) speakSuccessCue();
    else speakCachedResponse('logged');
    if(document.querySelector('.log-screen.active')?.id==='ls-listening') maybeResumeVoiceSession(VOICE_RESTART_DEFAULT_MS);
  }
}
function handleRealtimeServerEvent(event){
  if(!event||!event.type) return;
  if(event.type==='input_audio_buffer.speech_stopped'){
    finishSousRealtimeVoice();
    return;
  }
  if(event.type.endsWith('.delta')){
    const delta=event.delta||event.text||event.transcript||'';
    if(delta&&sousRealtime) sousRealtime.textBuffer=(sousRealtime.textBuffer||'')+delta;
    return;
  }
  if(event.type==='response.done'||event.type==='response.completed'){
    const text=extractRealtimeActionText(event)||(sousRealtime&&sousRealtime.textBuffer)||'';
    if(sousRealtime) sousRealtime.textBuffer='';
    handleRealtimeActionText(text);
  }
  if(event.type==='error'){
    console.log('[Sous Realtime] error', event.error?.message||event.error||'Realtime error');
    voiceDebugTrace('voice_error',{source:'realtime',error:event.error?.message||event.error||'Realtime error'});
    if(processingTranscript) setVoiceProcessing(false,'realtime error');
    stopSousRealtimeVoice(false);
    voiceSessionUseRealtime=false;
    speakCachedResponse('realtime_error',{},()=>voiceSessionActive?scheduleVoiceSessionRestart(200):setTimeout(startTapRec,200));
  }
}
function finishSousRealtimeVoice(){
  if(!sousRealtime||!sousRealtime.active) return;
  if(sousRealtime.finishing) return;
  sousRealtime.finishing=true;
  clearVoiceListeningWatchdog();
  try{sousRealtime.stream&&sousRealtime.stream.getAudioTracks().forEach(track=>track.stop());}catch(e){}
  setVoiceProcessing(true,'realtime response pending',{keepRealtime:true});
  if(!sendRealtimeEvent({
    type:'response.create',
    response:{
      output_modalities:['text'],
      instructions:'Return one compact JSON action for the spoken request. If there was no clear request, return {"type":"clarify","message":"What would you like to log?"}.'
    }
  })){
    setVoiceProcessing(false,'realtime response unavailable');
    stopSousRealtimeVoice(true);
  }
  else {
    clearTimeout(sousRealtime.idleTimer);
    sousRealtime.idleTimer=setTimeout(()=>stopSousRealtimeVoice(true),12000);
  }
}
async function startSousRealtimeVoice(){
  logVoiceState('recognition start requested',{source:'realtime'});
  if(sousRealtimeStarting){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked',{source:'realtime',reason:'starting'});
    return;
  }
  if(sousRealtime&&sousRealtime.active){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked',{source:'realtime'});
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){
    startTapRec({sessionRestart:voiceSessionActive});
    return;
  }
  if(isRecording||voiceCurrentlyListening||clarificationRec){console.log('[Sous Voice] recognizer conflict avoided');}
  requestTapStop('realtime starting');
  try{if(clarificationRec)clarificationRec.stop();}catch(e){}
  clarificationRec=null;
  nextVoiceRecognizerRunId('realtime','recognition start requested');
  voiceDebugTrace('recognizer_start',{source:'realtime',phase:'requested'});
  hideVoiceCorrectBar();
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const inp=document.getElementById('text-input'); if(inp) inp.value='';
  sousRealtimeStarting=true;
  setVoiceSessionState('restarting','realtime start requested');
  setMicState('recording');
  try{
    const realtimeSessionUrl=typeof window.sousApiUrl==='function'?window.sousApiUrl('/api/realtime/session'):'/api/realtime/session';
    const tokenRes=await fetch(realtimeSessionUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        section:currentMealSection||null,
        foods:realtimeFoodContext()
      })
    });
    const tokenData=await tokenRes.json().catch(()=>({}));
    if(!tokenRes.ok) throw new Error(tokenData.error||'Realtime session failed');
    const secret=realtimeClientSecret(tokenData);
    if(!secret) throw new Error('Realtime client secret missing');

    const pc=new RTCPeerConnection();
    const dc=pc.createDataChannel('oai-events');
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true
      }
    });
    stream.getAudioTracks().forEach(track=>pc.addTrack(track,stream));
    const audio=document.createElement('audio');
    audio.autoplay=true;
    pc.ontrack=e=>{audio.srcObject=e.streams[0];};
    sousRealtime={active:true,pc,dc,stream,audio,textBuffer:'',idleTimer:null};
    dc.addEventListener('open',()=>{
      console.log('[Sous Realtime] connected');
      sousRealtimeStarting=false;
      isRecording=true;
      voiceCurrentlyListening=true;
      setVoiceSessionState('listening','realtime connected');
      voiceDebugTrace('recognizer_start',{source:'realtime',phase:'started'});
      voiceDebugTrace('session_restart',{phase:'completed',route:'realtime',restartCount:voiceRestartCount,turnId:activeVoiceTranscriptTurn||null});
      console.log('[Sous Voice] listening');
      logVoiceState('recognition actually started',{source:'realtime'});
      setMicState('recording');
      startVoiceListeningWatchdog('realtime');
      clearTimeout(sousRealtime.idleTimer);
      sousRealtime.idleTimer=setTimeout(()=>stopSousRealtimeVoice(true),60000);
    });
    dc.addEventListener('message',e=>{
      try{handleRealtimeServerEvent(JSON.parse(e.data));}
      catch(err){console.log('[Sous Realtime] error', err.message);}
    });
    pc.addEventListener('connectionstatechange',()=>{
      if(['failed','disconnected','closed'].includes(pc.connectionState)){
        const wasListening=voiceSessionState==='listening';
        stopSousRealtimeVoice(false);
        if(wasListening&&voiceSessionActive&&!processingTranscript&&!isSpeaking){
          voiceDebugTrace('voice_recovery',{issue:'realtime_unexpected_end',state:pc.connectionState});
          scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
        }
      }
    });

    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes=await fetch('https://api.openai.com/v1/realtime/calls',{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+secret,
        'Content-Type':'application/sdp'
      },
      body:offer.sdp
    });
    if(!sdpRes.ok) throw new Error('Realtime connection failed');
    await pc.setRemoteDescription({type:'answer',sdp:await sdpRes.text()});
  }catch(e){
    console.log('[Sous Realtime] error', e.message);
    voiceDebugTrace('voice_error',{source:'realtime',error:e.message});
    voiceDebugTrace('recognizer_error',{source:'realtime',error:e.message});
    sousRealtimeStarting=false;
    stopSousRealtimeVoice(false);
    voiceSessionUseRealtime=false;
    setVoiceSessionState('error','realtime start failed',{error:e.message});
    speakCachedResponse('realtime_error',{},()=>voiceSessionActive?scheduleVoiceSessionRestart(200):setTimeout(startTapRec,200));
  }
}
function stopSousRealtimeVoice(announce=false){
  sousRealtimeStarting=false;
  clearVoiceListeningWatchdog();
  if(!sousRealtime) return;
  const rt=sousRealtime;
  sousRealtime=null;
  clearTimeout(rt.idleTimer);
  try{rt.dc&&rt.dc.close();}catch(e){}
  try{rt.pc&&rt.pc.close();}catch(e){}
  try{rt.stream&&rt.stream.getTracks().forEach(track=>track.stop());}catch(e){}
  if(rt.audio) rt.audio.srcObject=null;
  isRecording=false;
  voiceCurrentlyListening=false;
  if(voiceSessionState==='listening') setVoiceSessionState(voiceSessionActive?'restarting':'idle','realtime stopped');
  logVoiceState('recognition ended',{source:'realtime'});
  voiceDebugTrace('recognizer_end',{source:'realtime',announce});
  if(!isSpeaking&&!processingTranscript) setMicState(alwaysOnActive&&cookingModeEnabled()?'listening':'idle');
}
function startTapRec(opts={}){
  if(!SR){showToast('Speech not supported — use text input');return;}
  if(opts.sessionRestart&&!canRestartVoiceListening()) return;
  logVoiceState('recognition start requested',{sessionRestart:!!opts.sessionRestart});
  hideVoiceCorrectBar();
  const block=voiceRestartBlockReason();
  const allowedDirectBlocks=['session inactive','not on log tab','cooking mode owns recognizer'];
  if(block&&!(allowedDirectBlocks.includes(block)&&!opts.sessionRestart)){
    logRestartBlocked(block);
    return;
  }
  if(tapRecStarting||tapRecStopping){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked',{source:'tap',reason:tapRecStarting?'starting':'stopping'});
    return;
  }
  if(isRecording||voiceCurrentlyListening){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked');
    return;
  }
  if(!tapRec) tapRec=buildTapRec();
  if(sousRealtime&&sousRealtime.active){console.log('[Sous Voice] recognizer conflict avoided');stopSousRealtimeVoice(false);}
  if(clarificationRec){console.log('[Sous Voice] recognizer conflict avoided');try{clarificationRec.stop();}catch(e){}clarificationRec=null;}
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const inp=document.getElementById('text-input'); if(inp) inp.value='';
  console.log('[Sous Voice] tap listen start');
  nextVoiceRecognizerRunId('tap','recognition start requested');
  const owner=voiceOwnerSnapshot({source:'tap'});
  if(tapRec&&typeof tapRec.__sousSetOwner==='function') tapRec.__sousSetOwner(owner);
  voiceDebugTrace('recognizer_start',{source:'tap',phase:'requested',sessionRestart:!!opts.sessionRestart});
  setVoiceSessionState('restarting','recognition start requested',{source:'tap'});
  tapRecStarting=true;
  startTapRecognizerStartWatchdog(owner);
  try{tapRec.start();}
  catch(e){
    clearVoiceRecognizerStartTimer();
    tapRecStarting=false;
    logVoiceState('recognition error',{error:e.name||e.message||'start failed'});
    voiceDebugTrace('recognizer_error',{source:'tap_start',error:e.name||e.message||'start failed'});
    voiceDebugTrace('voice_error',{source:'tap_start',error:e.name||e.message||'start failed'});
    if(e.name==='InvalidStateError'){
      recoverTapRecognizerStack('recognition_start_overlap',owner,{delay:VOICE_RESTART_DEFAULT_MS});
      return;
    }
    cancelTapFinalizer('recognizer replacement');
    tapRec=buildTapRec();
    if(tapRec&&typeof tapRec.__sousSetOwner==='function') tapRec.__sousSetOwner(owner);
    tapRecStarting=true;
    startTapRecognizerStartWatchdog(owner);
    try{tapRec.start();}
    catch(e2){
      clearVoiceRecognizerStartTimer();
      tapRecStarting=false;
      setVoiceSessionState('error','recognition start failed',{error:e2.name||e2.message||'restart failed'});
      voiceDebugTrace('recognizer_error',{source:'tap_start',error:e2.name||e2.message||'restart failed'});
      voiceDebugTrace('voice_error',{source:'tap_start',error:e2.name||e2.message||'restart failed'});
      logVoiceState('recognition error',{error:e2.name||e2.message||'restart failed'});
      if(voiceSessionActive) scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS);
    }
  }
}
function startClarificationListen(onResult){
  if(!SR){
    voiceDebugTrace('voice_error',{source:'clarification_start',error:'speech_recognition_unavailable'});
    return;
  }
  if(clarificationRec){
    console.log('[Sous Voice] duplicate recognizer blocked');
    logVoiceState('duplicate recognizer blocked',{source:'clarification'});
    return;
  }
  if(isRecording||voiceCurrentlyListening||sousRealtime){console.log('[Sous Voice] recognizer conflict avoided');}
  requestTapStop('clarification listen starting');
  stopSousRealtimeVoice(false);
  nextVoiceRecognizerRunId('clarification','clarification listen requested');
  voiceDebugTrace('recognizer_start',{source:'clarification',phase:'requested'});
  voiceDebugTrace('clarification_listen_start_requested',{route:'short_recognizer',active:!!clarificationState?.active});
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  clarificationRec=r;
  r.onstart=()=>{voiceDebugTrace('recognizer_start',{source:'clarification',phase:'started'});voiceDebugTrace('clarification_listen_started',{route:'short_recognizer'});voiceCurrentlyListening=true;isRecording=true;setVoiceSessionState('listening','clarification recognition started');setMicState('recording');};
  r.onresult=e=>{const t=e.results[0][0].transcript;voiceDebugTrace('final_transcript',{source:'clarification',transcript:t,turnId:activeVoiceTranscriptTurn||voiceTranscriptTurn+1});voiceDebugTrace('clarification_listen_result',{route:'short_recognizer',transcript:t});const el=document.getElementById('transcript-text');if(el)el.textContent='"'+t+'"';voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;setMicState('idle');if(voiceSessionState==='listening')setVoiceSessionState(voiceSessionActive?'restarting':'idle','clarification result');const shouldAutoResume=onResult(t)!==false;if(shouldAutoResume&&onResult!==handleClarification&&!clarificationState?.active)maybeResumeVoiceSession(400);};
  r.onerror=e=>{
    voiceDebugTrace('recognizer_error',{source:'clarification',error:e?.error||'recognition_error'});
    if(e?.error==='no-speech') voiceDebugTrace('no_speech',{source:'clarification'});
    voiceDebugTrace('voice_error',{source:'clarification_recognition',error:e?.error||'recognition_error'});
    voiceCurrentlyListening=false;
    isRecording=false;
    clarificationRec=null;
    setMicState('idle');
    if(voiceSessionState==='listening')setVoiceSessionState(voiceSessionActive?'restarting':'idle','clarification error');
    if(clarificationState?.active&&(e?.error==='no-speech'||onResult===handleClarification)){
      onResult('');
    } else maybeResumeVoiceSession(400);
  };
  r.onend=()=>{voiceDebugTrace('recognizer_end',{source:'clarification'});voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;setMicState('idle');if(voiceSessionState==='listening')setVoiceSessionState(voiceSessionActive?'restarting':'idle','clarification ended');};
  try{r.start();}
  catch(e){voiceDebugTrace('recognizer_error',{source:'clarification_start',error:e.name||e.message||'start failed'});voiceDebugTrace('voice_error',{source:'clarification_start',error:e.name||e.message||'start failed'});voiceCurrentlyListening=false;isRecording=false;clarificationRec=null;setVoiceSessionState('error','clarification recognition start failed',{error:e.name||e.message||'start failed'});maybeResumeVoiceSession(400);}
}
function buildAlwaysOn(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=true; r.maxAlternatives=1;
  r.onstart=()=>{alwaysOnActive=true;if(!isRecording&&!isSpeaking)setMicState('listening');};
  r.onresult=e=>{
    if(isRecording||isSpeaking) return;
    const t=e.results[e.results.length-1][0].transcript.toLowerCase().trim();
    const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+t+'"';
    voiceDebugTrace('transcript_heard',{source:'always_on',transcript:t});
    if(clarificationState?.active){
      voiceDebugTrace('transcript_routed',{route:'clarification',source:'always_on',transcript:t});
      handleClarification(t);return;
    }
    if(/hey\s+s[uo][eu]/.test(t)){
      voiceDebugTrace('transcript_routed',{route:'wake_word',source:'always_on',transcript:t});
      setMicState('wake');
      setTimeout(()=>{try{r.stop();}catch(e){}alwaysOnActive=false;startTapRec();},500);
      return;
    }
    const results=parseText(t);
    voiceDebugTrace('parser_result',{source:'always_on',transcript:t,results:voiceDebugResultSummary(results)});
    if(results&&results.length) handleParsed(results);
  };
  r.onerror=e=>{alwaysOnActive=false;if(e.error==='not-allowed')document.getElementById('perm-warn').style.display='block';else if(cookingModeEnabled()&&e.error!=='aborted'&&e.error!=='no-speech')setTimeout(restartAlwaysOn,1000);};
  r.onend=()=>{alwaysOnActive=false;if(cookingModeEnabled()&&!isRecording&&!isSpeaking)setTimeout(restartAlwaysOn,500);};
  return r;
}
function pauseAlwaysOn(){if(alwaysOnRec){try{alwaysOnRec.stop();}catch(e){}}alwaysOnActive=false;}
function restartAlwaysOn(){
  if(!cookingModeEnabled()){console.log('[Sous Voice] cooking mode disabled');return;}
  const active=document.querySelector('.log-screen.active');
  if(!active||active.id!=='ls-listening'||currentTab!=='log') return;
  if(alwaysOnActive) return;
  if(isRecording||isSpeaking) return;
  if(!alwaysOnRec) alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();setMicState('listening');}catch(e){}
}
function startAlwaysOn(){
  if(!cookingModeEnabled()){console.log('[Sous Voice] cooking mode disabled');return;}
  if(!SR){document.getElementById('perm-warn').style.display='block';return;}
  if(alwaysOnActive) return;
  alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();}catch(e){document.getElementById('perm-warn').style.display='block';}
}
function stopAllRec(){
  stopAllVoiceActivity('stop all recognition');
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  setVoiceSpeaking(false,'stop all recognition');
}

// ═══════════════════════════════════════════
// LOG ENTRY POINTS
// ═══════════════════════════════════════════
function startFreshLog(presetSection=null){
  const draft=typeof getDraft==='function'?getDraft():null;
  const draftItems=draft&&(Array.isArray(draft.meal)?draft.meal:(Array.isArray(draft.savedIngredients)?draft.savedIngredients:null));
  const hasDraft=Array.isArray(draftItems)&&draftItems.length>0;
  meal=[]; itemQueue=[]; pendingFood=null; currentAmbig=null; undoSnapshot=null; updateUndoBtn();
  currentMealSection=hasDraft?(draft.section||presetSection):presetSection;
  currentQuickMode=false; currentEditMealId=null; currentEditMealDate=null;
  if(hasDraft){
    draftItems.forEach(i=>meal.push({...i,id:i.id||nextIngId++}));
    if(meal.length) nextIngId=Math.max(...meal.map(i=>i.id||0))+1;
  }
  stopAllRec();
  showLogScreen('listening');
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const pw=document.getElementById('perm-warn'); if(pw) pw.style.display='none';
  if(hasDraft){
    showToast('Restored your in-progress meal',2800);
    speakCachedResponse('session_picked_up',{},()=>{if(cookingModeEnabled())setTimeout(startAlwaysOn,200);else console.log('[Sous Voice] cooking mode disabled');});
  } else {
    speakCachedResponse('session_ready',{},()=>{if(cookingModeEnabled())setTimeout(startAlwaysOn,200);else console.log('[Sous Voice] cooking mode disabled');});
  }
}
function startSilentLog(presetSection=null,quick=false){
  meal=[];
  itemQueue=[];
  pendingFood=null;
  currentAmbig=null;
  undoSnapshot=null;
  updateUndoBtn();
  currentMealSection=presetSection;
  currentQuickMode=quick;

  stopAllRec();
  showLogScreen('listening');

  const el=document.getElementById('transcript-text');
  if(el) el.textContent='—';

  const pw=document.getElementById('perm-warn');
  if(pw) pw.style.display='none';

  setMicState('idle');
}
function resumeLog(){
  stopAllRec();
  const active=document.querySelector('.log-screen.active');
  if(cookingModeEnabled()&&(!active||active.id==='ls-listening')) setTimeout(restartAlwaysOn,400);
  else console.log('[Sous Voice] cooking mode disabled');
}

// ═══════════════════════════════════════════
// LOG BUTTON WIRING (done after DOM ready)
// ═══════════════════════════════════════════
function wireLogButtons(){
  try{
    if(new URLSearchParams(location.search).get('voiceDebug')==='1') setVoiceDebugOverlayEnabled(true);
  }catch(e){}
  updateVoiceDebugOverlay();
  document.addEventListener('keydown',e=>{
    if(!voiceDebugDevMode()) return;
    const key=String(e.key||'').toLowerCase();
    if(key==='v'&&e.altKey&&(e.ctrlKey||e.metaKey)){
      e.preventDefault();
      setVoiceDebugOverlayEnabled(!voiceDebugOverlayEnabled());
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(!voiceSessionActive) return;
    if(document.hidden){
      voicePausedForVisibility=true;
      clearVoiceRestartTimer();
      stopRecognitionForState('page hidden');
      setVoiceSessionState('idle','page hidden');
      return;
    }
    if(voicePausedForVisibility){
      voicePausedForVisibility=false;
      speakCachedResponse('session_resumed',{},()=>scheduleVoiceSessionRestart(VOICE_RESTART_DEFAULT_MS));
    }
  });
  window.addEventListener('pagehide',()=>{
    if(!voiceSessionActive) return;
    voicePausedForVisibility=true;
    clearVoiceRestartTimer();
    stopRecognitionForState('pagehide');
    setVoiceSessionState('idle','pagehide');
  });
  document.addEventListener('pointerdown',e=>{
    if(!clarificationState?.active) return;
    if(e.target?.closest?.('#mic-btn,#transcript-text')) return;
    cancelIngredientClarification({resume:false});
  },true);
  document.getElementById('log-cancel-btn').addEventListener('click',()=>{currentEditMealId=null;currentEditMealDate=null;currentQuickMode=false;if(typeof clearDraft==='function')clearDraft();stopAllRec();setMicState('idle');switchTab('home');});
  document.getElementById('finished-meal-btn').addEventListener('click',()=>{if(!meal.length){showToast('Add some ingredients first!');return;}stopAllRec();showSummary();});
  document.getElementById('mic-btn').addEventListener('click',()=>{
    if(isSpeaking){window.speechSynthesis&&window.speechSynthesis.cancel();setVoiceSpeaking(false,'mic tapped during speech');}
    if(voiceSessionActive){endVoiceSession();return;}
    beginVoiceSession();
  });
  document.getElementById('send-btn').addEventListener('click',()=>{endVoiceSession();submitText();});
  document.getElementById('voice-retry-btn').addEventListener('click',()=>{hideVoiceCorrectBar();if(!voiceSessionActive)beginVoiceSession();else startTapRec({sessionRestart:true});});
  // voice-create-food-btn onclick is set dynamically in showNoMatchFallback with the raw text closure
  document.getElementById('text-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitText();});
  document.getElementById('confirm-btn').addEventListener('click',doConfirm);
  document.getElementById('change-btn').addEventListener('click',doChange);
  document.getElementById('summary-btn-conf').addEventListener('click',()=>{if(meal.length){stopAllRec();showSummary();}else showToast('Add ingredients first!');});
  document.getElementById('ambig-custom').addEventListener('click',()=>{currentAmbig=null;openCustomEntry();});
  document.getElementById('ambig-skip').addEventListener('click',()=>{currentAmbig=null;showLogScreen('listening');maybeResumeVoiceSession(400);});
  document.getElementById('mc-add-btn').addEventListener('click',commitMultiConfirm);
  document.getElementById('mc-cancel-btn').addEventListener('click',()=>{pendingBatch=[];clearVoicePromptOwner('multi_confirm_cancelled');showLogScreen('listening');maybeResumeVoiceSession(400);});
  document.getElementById('add-custom-btn').addEventListener('click',()=>openCustomEntry());
  document.getElementById('add-more-btn').addEventListener('click',()=>openAddModal());
  document.getElementById('sum-section-select').addEventListener('change',e=>{currentMealSection=e.target.value;});
  document.getElementById('save-meal-btn').addEventListener('click',()=>{
    const saveAsUsual=!!document.getElementById('sum-save-usual')?.checked;
    saveMealToLog(saveAsUsual);
    showToast(saveAsUsual?'Meal logged and saved for quick add 🎉':'Meal logged 🎉',2500);
    speakCachedResponse('logged');
    currentQuickMode=false;
    setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);
  });
  // Add modal
  document.getElementById('modal-close-btn').addEventListener('click',closeAddModal);
  document.getElementById('add-modal').addEventListener('click',e=>{if(e.target===document.getElementById('add-modal'))closeAddModal();});
  document.getElementById('tab-search-btn').addEventListener('click',()=>switchModalTab('search'));
  document.getElementById('tab-custom-btn').addEventListener('click',()=>switchModalTab('custom'));
  document.getElementById('food-search').addEventListener('input',e=>renderFoodResults(e.target.value));
  document.getElementById('gram-input').addEventListener('input',updatePreviewMacros);
  document.getElementById('serving-unit-qty').addEventListener('input',updatePreviewMacros);
  document.getElementById('modal-add-btn').addEventListener('click',addManualIngredient);
  // Edit modal
  document.getElementById('undo-btn').addEventListener('click',undoLastAction);
  document.getElementById('edit-modal-close-btn').addEventListener('click',closeEditModal);
  document.getElementById('edit-modal').addEventListener('click',e=>{if(e.target===document.getElementById('edit-modal'))closeEditModal();});
  document.getElementById('edit-save-btn').addEventListener('click',saveEdit);
  document.getElementById('edit-delete-btn').addEventListener('click',()=>deleteIngredient(parseInt(document.getElementById('edit-ing-id').value)));
  document.getElementById('pill-raw').addEventListener('click',()=>{document.getElementById('pill-raw').className='toggle-pill active';document.getElementById('pill-cooked').className='toggle-pill inactive';});
  document.getElementById('pill-cooked').addEventListener('click',()=>{document.getElementById('pill-cooked').className='toggle-pill active';document.getElementById('pill-raw').className='toggle-pill inactive';});
  // Quantity prompt screen
  document.getElementById('qty-send-btn').addEventListener('click',()=>{
    const g=parseFloat(document.getElementById('qty-input').value);
    if(!g||g<=0){showToast('Enter an amount in grams');return;}
    commitQuantity(g);
  });
  document.getElementById('qty-input').addEventListener('keydown',e=>{if(e.key==='Enter'){const g=parseFloat(e.target.value);if(g&&g>0)commitQuantity(g);}});
  document.getElementById('qty-default-btn').addEventListener('click',()=>{
    if(!pendingFood) return;
    addIngredientToMeal({...pendingFood}, {source:'voice'});
    showToast('Added '+pendingFood.name+' ✓');
    pendingFood=null;
    showLogScreen('listening');
    renderCurrentMeal();
    if(itemQueue.length) processQueue();
    else {
      updateQueueDisplay();
      updateHome();
    }
    speakSuccessCue(()=>maybeResumeVoiceSession(250));
  });
  document.getElementById('qty-usual-btn')?.addEventListener('click',commitUsualFromQuantityPrompt);
  // Confirm screen — live macro update when weight input changes
  document.getElementById('confirm-qty-input').addEventListener('input',e=>{
    const grams=parseFloat(e.target.value);
    if(!pendingFood||!pendingFood.rawFood||!grams||grams<=0) return;
    const food=pendingFood.rawFood,r=grams/food.w;
    document.getElementById('c-kcal').textContent=Math.round(food.kcal*r);
    document.getElementById('c-protein').textContent=Math.round(food.p*r*10)/10+'g';
    document.getElementById('c-carbs').textContent=Math.round(food.c*r*10)/10+'g';
    document.getElementById('c-fat').textContent=Math.round(food.f*r*10)/10+'g';
    document.getElementById('confirm-weight').textContent=Math.round(grams)+'g · raw';
  });
}
function submitText(){
  const inp=document.getElementById('text-input'),val=inp.value.trim();
  if(!val) return;
  hideVoiceCorrectBar();
  _voiceMode=false;
  const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+val+'"';
  inp.value=''; handleTranscript(val,val);
}
