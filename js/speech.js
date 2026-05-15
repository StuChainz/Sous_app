// ═══════════════════════════════════════════
// LOG STATE
// ═══════════════════════════════════════════
let meal=[], itemQueue=[], pendingFood=null, currentAmbig=null;
let tapRec=null, alwaysOnRec=null, isRecording=false, alwaysOnActive=false, isSpeaking=false;
let _voiceMode=false;
let nextIngId=1;
let modalSelectedFood=null, modalActiveTab='search';
let undoSnapshot=null;
let _editBaseValues=null,_editFoodKey=null,_pendingOverride=null;
let currentMealSection=null;
let _inlineEditId=null;

function snapshotMeal(){undoSnapshot=meal.map(i=>({...i}));updateUndoBtn();}
function updateUndoBtn(){const r=document.getElementById('undo-row');if(r)r.style.display=undoSnapshot?'flex':'none';}
function _persistDraft(){
  if(typeof saveDraft!=='function') return;
  const quick=typeof currentQuickMode!=='undefined'&&currentQuickMode;
  const editing=typeof currentEditMealId!=='undefined'&&currentEditMealId;
  if(quick||editing) return;
  saveDraft({meal:meal.map(i=>({...i})),section:currentMealSection||null,savedAt:Date.now()});
}
function undoLastAction(){
  if(!undoSnapshot) return;
  meal.length=0; undoSnapshot.forEach(i=>meal.push(i));
  undoSnapshot=null; updateUndoBtn(); renderCurrentMeal(); showToast('Undone');
  _persistDraft();
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION CONSTRUCTOR
// ═══════════════════════════════════════════
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

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
function showBatchHeard(results){
  const transcript=document.getElementById('transcript-text');
  const items=results.filter(r=>!r.command);
  if(transcript && items.length>1){
    transcript.textContent='Heard '+items.length+' items: '+items.map(i=>i.name||i.label||'unknown').join(', ');
  }
}
function applyFoodOverride(item){
  if(!item||item.customMacro||!item.weight) return item;
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
function autoAddItem(item){
  applyFoodOverride(item);
  snapshotMeal(); meal.push(item); _persistDraft();
}
function announceAutoAdded(items,after){
  if(!items.length){ if(after) after(); return; }
  const phrase=batchPhrase(items);
  const msg=items.length===1 ? `Added ${phrase}.` : `Added ${items.length} items: ${phrase}.`;
  const transcript=document.getElementById('transcript-text');
  if(transcript) transcript.textContent=msg;
  showToast(msg,2600);
  speak(msg,after);
}
function hideVoiceCorrectBar(){const b=document.getElementById('voice-correct-bar');if(b)b.style.display='none';}
function showVoiceCorrectBar(msg){
  const b=document.getElementById('voice-correct-bar'),m=document.getElementById('voice-correct-msg');
  if(!b) return;
  if(m) m.textContent=msg;
  b.style.display='flex';
}
function showVoiceCorrection(text){
  const inp=document.getElementById('text-input');
  if(inp) inp.value=text;
  showVoiceCorrectBar('Did you say this? Edit and send, or tap mic.');
  if(inp) requestAnimationFrame(()=>{inp.focus();inp.select();});
}
function showVoiceRetry(msg){
  const inp=document.getElementById('text-input');
  if(inp) inp.value='';
  showVoiceCorrectBar(msg||"Didn't catch that — try again");
}

function handleParsed(results){
  if(!results||!results.length){
    if(_voiceMode) showVoiceRetry("Didn't catch that — try again");
    else showToast("Didn't catch that — try again!");
    _voiceMode=false; return;
  }
  _voiceMode=false;
  if(results.length===1 && results[0].command && !['summary'].includes(results[0].command)){
    const handled=applyCorrectionCommand(results[0]);
    refreshSummaryIfVisible();
    const _activeScr=document.querySelector('.log-screen.active')?.id;
    if(handled && _activeScr==='ls-listening') renderCurrentMeal();
    updateHome();
    if(handled && _activeScr==='ls-listening') setTimeout(restartAlwaysOn,400);
    return;
  }
  if(results[0].command==='summary'){
    if(!meal.length){showToast('Add some ingredients first!');return;}
    stopAllRec(); showSummary(); return;
  }
  showBatchHeard(results);
  if(batchNeedsMultiConfirm(results)){showMultiConfirm(results);return;}
  itemQueue.push(...results);
  processQueue([]);
}
function processQueue(autoAdded=[]){
  updateQueueDisplay();
  if(!itemQueue.length){
    showLogScreen('listening');
    if(autoAdded.length){
      announceAutoAdded(autoAdded,()=>setTimeout(restartAlwaysOn,250));
    } else {
      const transcript=document.getElementById('transcript-text');
      if(transcript) transcript.textContent='—';
      setTimeout(restartAlwaysOn,400);
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
  header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);';
  header.innerHTML=`<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Added so far</span><span style="font-size:12px;color:var(--accent);font-family:'Geist Mono',monospace;">${Math.round(t.kcal)} kcal · ${Math.round(t.protein)}g P</span>`;
  container.appendChild(header);
  meal.forEach(i=>{
    const row=document.createElement('div');
    if(_inlineEditId===i.id){
      row.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:.5px solid var(--border);background:var(--bg-2);';
      const nameIn=document.createElement('input');
      nameIn.type='text'; nameIn.value=i.name; nameIn.id='ile-name';
      nameIn.style.cssText='flex:1;min-width:0;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--accent);border-radius:6px;padding:4px 7px;outline:none;font-family:inherit;';
      const wtIn=document.createElement('input');
      wtIn.type='number'; wtIn.value=i.weight??''; wtIn.placeholder='g'; wtIn.id='ile-weight';
      wtIn.style.cssText='width:52px;font-size:13px;color:var(--text);background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:4px 6px;outline:none;font-family:inherit;text-align:center;';
      const minusBtn=document.createElement('button');
      minusBtn.textContent='−'; minusBtn.type='button';
      minusBtn.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;';
      minusBtn.addEventListener('click',()=>stepIngWeight(i.id,-10));
      const plusBtn=document.createElement('button');
      plusBtn.textContent='+'; plusBtn.type='button';
      plusBtn.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;';
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
      row.appendChild(nameIn); row.appendChild(minusBtn); row.appendChild(wtIn); row.appendChild(plusBtn); row.appendChild(confirmBtn); row.appendChild(delBtn);
      container.appendChild(row);
      requestAnimationFrame(()=>{const w=document.getElementById('ile-weight');if(w){w.focus();w.select();}});
    } else {
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);';
      const label=document.createElement('span');
      label.style.cssText='font-size:13px;color:var(--text);flex:1;min-width:0;';
      label.textContent=i.name+(i.weight?' '+i.weight+'g':'');
      const macros=document.createElement('span');
      macros.style.cssText='font-size:12px;color:var(--text-muted);font-family:\'Geist Mono\',monospace;margin-right:6px;';
      macros.textContent=i.kcal+' kcal · '+i.protein+'g P';
      const editBtn=document.createElement('button');
      editBtn.title='Edit'; editBtn.innerHTML='<i class="ti ti-pencil"></i>';
      editBtn.style.cssText='background:none;border:none;padding:2px 5px;cursor:pointer;color:var(--text-muted);font-size:14px;';
      editBtn.addEventListener('click',()=>{snapshotMeal();_inlineEditId=i.id;renderCurrentMeal();});
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.title='Remove';
      delBtn.style.cssText='background:none;border:none;padding:2px 6px;cursor:pointer;color:var(--text-muted);font-size:15px;';
      delBtn.addEventListener('click',()=>deleteFromCurrentMeal(i.id));
      row.appendChild(label); row.appendChild(macros); row.appendChild(editBtn); row.appendChild(delBtn);
      container.appendChild(row);
    }
  });
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
    meta.textContent=bits.join(' · ');
    row.appendChild(label);
    row.appendChild(meta);
    panel.appendChild(row);
  });
}
function addIngredientFromRecent(r){
  if(!r||!r.name) return;
  snapshotMeal();
  meal.push({
    id:nextIngId++,
    name:r.name,
    kcal:Math.round(Number(r.kcal))||0,
    protein:Math.round(Number(r.protein||0)*10)/10,
    carbs:Math.round(Number(r.carbs||0)*10)/10,
    fat:Math.round(Number(r.fat||0)*10)/10,
    fibre:Math.round(Number(r.fibre||0)*10)/10,
    icon:r.icon||'ti-clipboard',
  });
  _persistDraft();
  showToast('Added '+r.name+' ✓');
  renderCurrentMeal();
  updateHome();
}

function showLogScreen(id){
  document.querySelectorAll('.log-screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('ls-'+id).classList.add('active');
  if(id==='listening'){renderCurrentMeal();renderRecentIngredients();}
}

// ═══════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════
function speak(text,onEnd){
  if(!window.speechSynthesis){if(onEnd)onEnd();return;}
  window.speechSynthesis.cancel();
  isSpeaking=true; setMicState('speaking');
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
  u.onend=u.onerror=()=>{isSpeaking=false;if(onEnd)onEnd();};
  setTimeout(()=>window.speechSynthesis.speak(u),30);
}
function speakThenListen(text,onResult){
  pauseAlwaysOn();
  speak(text,()=>setTimeout(()=>startClarificationListen(onResult),200));
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
  const map={
    idle:     {dc:'aob-dot',          tc:'aob-text',    tt:'Say "Hey Sous" or tap mic',            st:'Tap to speak',         sc:'listen-status'},
    listening:{dc:'aob-dot listening',tc:'aob-text on', tt:'Listening for "Hey Sous"…',            st:'Always on · tap to speak now', sc:'listen-status on'},
    wake:     {dc:'aob-dot wake',     tc:'aob-text on', tt:'Wake word detected…',                  st:'Hey Sous — go ahead!', sc:'listen-status on'},
    recording:{dc:'aob-dot active',   tc:'aob-text on', tt:'Recording…',                           st:'Listening…',           sc:'listen-status on'},
    speaking: {dc:'aob-dot speaking', tc:'aob-text on', tt:'Speaking…',                            st:'Sous is talking…',     sc:'listen-status on'},
  };
  const m=map[state]||map.idle;
  dot.className=m.dc; txt.className=m.tc; txt.textContent=m.tt;
  if(status){status.className=m.sc;status.textContent=m.st;}
}

// ═══════════════════════════════════════════
// CONFIRM SCREEN
// ═══════════════════════════════════════════
function showConfirm(parsed){
  pendingFood=parsed;
  document.getElementById('confirm-name').textContent=parsed.name;
  document.getElementById('confirm-weight').textContent=itemWeightLabel(parsed)+(parsed.customMacro?'':' · raw');
  document.getElementById('confirm-icon').className='ti '+(parsed.icon||'ti-meat');
  document.getElementById('c-kcal').textContent=parsed.kcal;
  document.getElementById('c-protein').textContent=parsed.protein+'g';
  document.getElementById('c-carbs').textContent=parsed.carbs+'g';
  document.getElementById('c-fat').textContent=parsed.fat+'g';
  document.getElementById('pill-raw').className='toggle-pill active';
  document.getElementById('pill-cooked').className='toggle-pill inactive';
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(!parsed.weightSpecified&&parsed.rawFood){
    qtyRow.style.display='block';
    qtyInput.value=parsed.weight;
  } else {
    qtyRow.style.display='none';
    qtyInput.value='';
  }
  showLogScreen('confirm');
  pauseAlwaysOn();
  speak(`Check this: ${parsed.name}, ${itemWeightLabel(parsed)}. Confirm?`,()=>startConfirmListen());
}
function startConfirmListen(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR||document.querySelector('.log-screen.active')?.id!=='ls-confirm') return;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  r.onresult=e=>{
    const t=e.results[0][0].transcript.toLowerCase().trim();
    document.getElementById('transcript-text').textContent='"'+t+'"';
    if(/yes|confirm|correct|add|yep|yeah|right|ok/.test(t)) doConfirm();
    else if(/change|no|wrong|different|cancel|again/.test(t)) doChange();
    else showToast('Say "yes" to confirm or "change" to try again');
  };
  r.onerror=()=>{}; r.onend=()=>{};
  try{r.start();}catch(e){}
}
function doConfirm(){
  if(!pendingFood) return;
  const qtyRow=document.getElementById('confirm-qty-row');
  const qtyInput=document.getElementById('confirm-qty-input');
  if(qtyRow.style.display!=='none'&&pendingFood.rawFood){
    const grams=parseFloat(qtyInput.value);
    if(grams&&grams>0){
      const food=pendingFood.rawFood,r=grams/food.w;
      pendingFood.weight=Math.round(grams);
      pendingFood.kcal=Math.round(food.kcal*r);
      pendingFood.protein=Math.round(food.p*r*10)/10;
      pendingFood.carbs=Math.round(food.c*r*10)/10;
      pendingFood.fat=Math.round(food.f*r*10)/10;
      pendingFood.fibre=Math.round((food.fi||0)*r*10)/10;
    }
  }
  snapshotMeal(); meal.push(pendingFood); _persistDraft();
  const name=pendingFood.name;
  speak(itemQueue.length ? 'Added. Next.' : 'Added.',()=>{
    pendingFood=null;
    processQueue();
    if(document.querySelector('.log-screen.active')?.id==='ls-listening') setTimeout(restartAlwaysOn,300);
  });
}
function doChange(){
  pendingFood=null;
  speak('OK, what would you like to add?',()=>{showLogScreen('listening');setTimeout(restartAlwaysOn,300);});
}

// ═══════════════════════════════════════════
// QUANTITY PROMPT (voice — high confidence, no weight)
// ═══════════════════════════════════════════
function parseGramsFromText(text){
  const m=text.match(/(\d+(?:\.\d+)?)\s*(?:g(?:rams?)?)?/i);
  return m?parseFloat(m[1]):null;
}
function commitQuantity(grams){
  if(!pendingFood||!pendingFood.rawFood) return;
  const food=pendingFood.rawFood;
  const r=grams/food.w;
  const item={id:nextIngId++,name:food.name,weight:Math.round(grams),kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon};
  snapshotMeal(); meal.push(item); _persistDraft();
  showToast('Added '+item.name+' '+Math.round(grams)+'g ✓');
  pendingFood=null;
  showLogScreen('listening');
  renderCurrentMeal();
  processQueue();
}
function askQuantity(item){
  pendingFood=item;
  document.getElementById('qty-food-name').textContent=item.name;
  document.getElementById('qty-default-btn').textContent='Use default ('+item.weight+'g)';
  document.getElementById('qty-input').value='';
  showLogScreen('quantity');
  pauseAlwaysOn();
  speakThenListen('How much '+item.name+'?',voiceAnswer=>{
    if(document.querySelector('.log-screen.active')?.id!=='ls-quantity') return;
    const grams=parseGramsFromText(voiceAnswer);
    if(grams&&grams>0){
      commitQuantity(grams);
    } else {
      showToast('Didn\'t catch that — type it or use default');
    }
  });
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
  });
}
function resolveAmbig(food,amount){
  const r=amount?amount/food.w:1;
  const resolved={name:food.name,weight:amount?Math.round(amount):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,rawFood:food,weightSpecified:amount!=null};
  currentAmbig=null;
  if(!amount){askQuantity(resolved);}else{showConfirm(resolved);}
}

// ═══════════════════════════════════════════
// MULTI-CONFIRM (batch ingredient review)
// ═══════════════════════════════════════════
let pendingBatch=[];
function batchNeedsMultiConfirm(results){
  const food=results.filter(r=>!r.command);
  if(!food.length) return false;
  if(food.some(r=>r.ambiguous)) return true;
  if(food.length>1&&food.some(r=>!r.weightSpecified)) return true;
  return false;
}
function showMultiConfirm(results){
  pendingBatch=results.filter(r=>!r.command).map(r=>{
    if(r.ambiguous) return{ambiguous:true,label:r.label,options:r.matches,selectedIdx:0,weight:r.amount||100};
    return{ambiguous:false,label:r.name,options:null,food:r.rawFood||null,weight:r.weight||r.rawFood?.w||100,rawItem:r};
  });
  renderMultiConfirm();
  showLogScreen('multi-confirm');
}
function renderMultiConfirm(){
  const list=document.getElementById('mc-list');
  if(!list) return;
  list.innerHTML='';
  pendingBatch.forEach((entry,idx)=>{
    const card=document.createElement('div');
    card.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;';
    if(entry.ambiguous){
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';
      entry.options.forEach((food,fi)=>{
        const chip=document.createElement('button');
        chip.type='button'; chip.textContent=food.name;
        const sel=fi===entry.selectedIdx;
        chip.style.cssText='font-size:12px;padding:5px 11px;border-radius:20px;cursor:pointer;font-family:inherit;border:.5px solid '+(sel?'var(--accent);background:var(--accent);color:#fff;':'var(--border);background:var(--card-2);color:var(--text);');
        chip.addEventListener('click',()=>{entry.selectedIdx=fi;renderMultiConfirm();});
        wrap.appendChild(chip);
      });
      card.appendChild(wrap);
    } else {
      const nm=document.createElement('div');
      nm.style.cssText='font-size:14px;font-weight:500;color:var(--text);margin-bottom:8px;';
      nm.textContent=entry.label; card.appendChild(nm);
    }
    const qRow=document.createElement('div');
    qRow.style.cssText='display:flex;align-items:center;gap:6px;';
    const btnStyle='border:.5px solid var(--border);border-radius:6px;min-width:38px;height:34px;font-size:20px;line-height:1;cursor:pointer;color:var(--text);flex-shrink:0;padding:0;background:var(--card-2);';
    const minusBtn=document.createElement('button');
    minusBtn.textContent='−'; minusBtn.type='button'; minusBtn.style.cssText=btnStyle;
    minusBtn.addEventListener('click',()=>{entry.weight=Math.max(1,(entry.weight||10)-10);renderMultiConfirm();});
    const wtIn=document.createElement('input');
    wtIn.type='number'; wtIn.value=Math.round(entry.weight); wtIn.min=1;
    wtIn.style.cssText='width:60px;text-align:center;font-size:14px;background:var(--card);border:.5px solid var(--border);border-radius:6px;padding:5px 6px;color:var(--text);font-family:inherit;outline:none;';
    wtIn.addEventListener('change',()=>{entry.weight=Math.max(1,parseFloat(wtIn.value)||1);});
    const plusBtn=document.createElement('button');
    plusBtn.textContent='+'; plusBtn.type='button'; plusBtn.style.cssText=btnStyle;
    plusBtn.addEventListener('click',()=>{entry.weight=(entry.weight||0)+10;renderMultiConfirm();});
    const gLbl=document.createElement('span');
    gLbl.textContent='g'; gLbl.style.cssText='font-size:13px;color:var(--text-muted);margin-right:auto;';
    const rmBtn=document.createElement('button');
    rmBtn.textContent='×'; rmBtn.type='button';
    rmBtn.style.cssText='background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:2px 4px;flex-shrink:0;';
    rmBtn.addEventListener('click',()=>{pendingBatch.splice(idx,1);if(!pendingBatch.length){showLogScreen('listening');return;}renderMultiConfirm();});
    qRow.appendChild(minusBtn); qRow.appendChild(wtIn); qRow.appendChild(plusBtn); qRow.appendChild(gLbl); qRow.appendChild(rmBtn);
    card.appendChild(qRow);
    list.appendChild(card);
  });
  const addBtn=document.getElementById('mc-add-btn');
  if(addBtn) addBtn.textContent='Add '+pendingBatch.length+' ingredient'+(pendingBatch.length!==1?'s':'')+' to meal';
}
function commitMultiConfirm(){
  if(!pendingBatch.length){showLogScreen('listening');return;}
  snapshotMeal();
  pendingBatch.forEach(entry=>{
    const food=entry.ambiguous?entry.options[entry.selectedIdx]:entry.food;
    const w=Math.max(1,Math.round(entry.weight));
    let item;
    if(food){
      const r=w/food.w;
      item={name:food.name,weight:w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round((food.fi||0)*r*10)/10,icon:food.icon,rawFood:food};
    } else {
      const ri=entry.rawItem||{};
      const origW=ri.weight||w;
      const r=origW>0?w/origW:1;
      item={...ri,weight:w,kcal:Math.round((ri.kcal||0)*r),protein:Math.round((ri.protein||0)*r*10)/10,carbs:Math.round((ri.carbs||0)*r*10)/10,fat:Math.round((ri.fat||0)*r*10)/10,fibre:Math.round((ri.fibre||0)*r*10)/10};
    }
    item.id=nextIngId++; meal.push(item);
  });
  _persistDraft();
  const count=pendingBatch.length; pendingBatch=[];
  renderCurrentMeal(); updateHome();
  showLogScreen('listening');
  showToast('Added '+count+' ingredient'+(count!==1?'s':'')+' ✓');
  setTimeout(restartAlwaysOn,400);
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
  if(announce) speak('Meal total: '+Math.round(t.kcal)+' calories.');
}

// ═══════════════════════════════════════════
// MANUAL ADD MODAL
// ═══════════════════════════════════════════
function openAddModal(){
  modalSelectedFood=null; modalActiveTab='search';
  document.getElementById('food-search').value='';
  document.getElementById('gram-input').value='100';
  document.getElementById('selected-preview-box').style.display='none';
  renderFoodResults('');
  ['custom-name','custom-weight','custom-kcal','custom-protein','custom-carbs','custom-fat','custom-fibre'].forEach(id=>{document.getElementById(id).value='';});
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
  const matches=q?FOODS.filter(f=>f.name.toLowerCase().includes(q)||(f.kw&&f.kw.some(k=>k.includes(q)))):FOODS.slice(0,20);
  container.innerHTML='';
  matches.forEach(food=>{
    const div=document.createElement('div');
    div.className='food-result-item'+(food===modalSelectedFood?' selected':'');
    div.innerHTML=`<span class="fri-name">${food.name}</span><span class="fri-kcal">${food.kcal} kcal/100g</span>`;
    div.addEventListener('click',()=>selectFood(food));
    container.appendChild(div);
  });
}
function selectFood(food){
  modalSelectedFood=food;
  document.querySelectorAll('.food-result-item').forEach(el=>el.classList.toggle('selected',el.querySelector('.fri-name').textContent===food.name));
  document.getElementById('spb-name').textContent=food.name;
  document.getElementById('spb-per100').textContent=`per 100g · ${food.kcal} kcal · ${food.p}g P · ${food.c}g C · ${food.f}g F`;
  document.getElementById('selected-preview-box').style.display='block';
  updatePreviewMacros();
  document.getElementById('selected-preview-box').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function updatePreviewMacros(){
  if(!modalSelectedFood) return;
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
    const grams=parseFloat(document.getElementById('gram-input').value)||100;
    if(grams<=0){showToast('Enter a valid amount');return;}
    const r=grams/(modalSelectedFood.w||100);
    const newItem={id:nextIngId++,name:modalSelectedFood.name,weight:Math.round(grams),kcal:Math.round(modalSelectedFood.kcal*r),protein:Math.round(modalSelectedFood.p*r*10)/10,carbs:Math.round(modalSelectedFood.c*r*10)/10,fat:Math.round(modalSelectedFood.f*r*10)/10,fibre:Math.round((modalSelectedFood.fi||0)*r*10)/10,icon:modalSelectedFood.icon,rawFood:modalSelectedFood};
    applyFoodOverride(newItem);
    snapshotMeal(); meal.push(newItem);
    _persistDraft();
    const foodName=modalSelectedFood.name;
    showToast('Added '+foodName+' ✓');
    const r2=100/Math.round(grams);
    _pendingOverride={key:foodName,name:foodName,macros:{kcal:Math.round(newItem.kcal*r2),protein:Math.round(newItem.protein*r2*10)/10,carbs:Math.round(newItem.carbs*r2*10)/10,fat:Math.round(newItem.fat*r2*10)/10,fibre:Math.round((newItem.fibre||0)*r2*10)/10}};
    setTimeout(()=>_showOverridePrompt(foodName),350);
  } else {
    const name=document.getElementById('custom-name').value.trim();
    if(!name){showToast('Enter a food name');return;}
    const weightRaw=document.getElementById('custom-weight').value;
    const weight=weightRaw!==''?parseFloat(weightRaw)||null:null;
    const kcal=parseFloat(document.getElementById('custom-kcal').value)||0;
    const protein=parseFloat(document.getElementById('custom-protein').value)||0;
    const carbs=parseFloat(document.getElementById('custom-carbs').value)||0;
    const fat=parseFloat(document.getElementById('custom-fat').value)||0;
    const fibre=parseFloat(document.getElementById('custom-fibre').value)||0;
    snapshotMeal(); meal.push({id:nextIngId++,name,weight,kcal,protein,carbs,fat,fibre,icon:'ti-clipboard'});
    _persistDraft();
    showToast('Added '+name+' ✓');
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
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  snapshotMeal();
  item.name=name; item.weight=weight; item.kcal=kcal; item.protein=protein; item.carbs=carbs; item.fat=fat; item.fibre=fibre;
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
}
function deleteFromCurrentMeal(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  snapshotMeal(); meal.splice(idx,1); _persistDraft();
  renderCurrentMeal(); showToast(name+' removed');
}
function stepIngWeight(id,delta){
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  const cur=item.weight||0;
  const next=Math.max(1,cur+delta);
  if(next===cur) return;
  if(cur>0){
    const r=next/cur;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.weight=next;
  renderCurrentMeal();
}
function commitInlineEdit(id){
  const item=meal.find(i=>i.id===id);
  if(!item){_inlineEditId=null;renderCurrentMeal();return;}
  const newName=(document.getElementById('ile-name')?.value||'').trim();
  if(!newName){showToast('Name required');return;}
  const wtVal=document.getElementById('ile-weight')?.value;
  const newWeight=wtVal!=null&&wtVal!==''?parseFloat(wtVal)||null:null;
  if(newWeight!==null&&item.weight&&item.weight>0&&newWeight!==item.weight){
    const r=newWeight/item.weight;
    item.kcal=Math.round(item.kcal*r*10)/10;
    item.protein=Math.round(item.protein*r*10)/10;
    item.carbs=Math.round(item.carbs*r*10)/10;
    item.fat=Math.round(item.fat*r*10)/10;
    item.fibre=Math.round((item.fibre||0)*r*10)/10;
  }
  item.name=newName; item.weight=newWeight;
  _persistDraft();
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
function saveMealToLog(){
  const date=(typeof selectedLogDate!=='undefined'?selectedLogDate:todayStr()),log=getLog();
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const mt=sumMacros(meal);
  const section=currentMealSection||defaultSectionFromTime();
  const nameInput=document.getElementById('sum-meal-name');
  const typedName=nameInput?(nameInput.value.trim()||''):'';
  const name=typedName||generateMealNameFromIngredients(meal,section);
  const mealObj={name,time:new Date().toISOString(),section,ingredients:meal.slice(),totals:{kcal:Math.round(mt.kcal),protein:Math.round(mt.protein*10)/10,carbs:Math.round(mt.carbs*10)/10,fat:Math.round(mt.fat*10)/10,fibre:Math.round(mt.fibre*10)/10}};
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
  window.updateUsualMeals(mealObj,typedName);
  meal.forEach(i=>window.addToRecentIngredients(i));
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION
// ═══════════════════════════════════════════
function buildTapRec(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=true; r.continuous=false; r.maxAlternatives=3;
  r.onstart=()=>{isRecording=true;setMicState('recording');};
  r.onresult=e=>{
    let interim='',final='',finalConf=null;
    for(let i=e.resultIndex;i<e.results.length;i++){const res=e.results[i];if(res.isFinal){final+=res[0].transcript;if(finalConf===null)finalConf=res[0].confidence;}else interim+=res[0].transcript;}
    const el=document.getElementById('transcript-text');
    if(el) el.textContent='"'+(final||interim)+'"';
    if(final){
      stopTapRec();
      const isLow=typeof finalConf==='number'&&finalConf>0&&finalConf<0.75;
      _voiceMode=true;
      if(isLow) showVoiceCorrection(final.trim());
      else handleParsed(parseText(final.trim()));
    }
  };
  r.onerror=e=>{
    stopTapRec();
    if(e.error==='not-allowed') document.getElementById('perm-warn').style.display='block';
    else if(e.error==='no-speech') showVoiceRetry("Didn't catch that — try again");
    else if(e.error!=='aborted') showVoiceRetry("Couldn't understand that");
  };
  r.onend=()=>stopTapRec();
  return r;
}
function stopTapRec(){isRecording=false;if(!isSpeaking)setMicState(alwaysOnActive?'listening':'idle');}
function startTapRec(){
  if(!SR){showToast('Speech not supported — use text input');return;}
  if(!tapRec) tapRec=buildTapRec();
  hideVoiceCorrectBar();
  if(isRecording){try{tapRec.stop();}catch(e){}return;}
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const inp=document.getElementById('text-input'); if(inp) inp.value='';
  try{tapRec.start();}catch(e){tapRec=buildTapRec();try{tapRec.start();}catch(e2){}}
}
function startClarificationListen(onResult){
  if(!SR) return;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=false; r.maxAlternatives=3;
  r.onstart=()=>setMicState('recording');
  r.onresult=e=>{const t=e.results[0][0].transcript;const el=document.getElementById('transcript-text');if(el)el.textContent='"'+t+'"';setMicState('idle');onResult(t);};
  r.onerror=()=>setMicState('idle'); r.onend=()=>setMicState('idle');
  try{r.start();}catch(e){}
}
function buildAlwaysOn(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=false; r.continuous=true; r.maxAlternatives=1;
  r.onstart=()=>{alwaysOnActive=true;if(!isRecording&&!isSpeaking)setMicState('listening');};
  r.onresult=e=>{
    if(isRecording||isSpeaking) return;
    const t=e.results[e.results.length-1][0].transcript.toLowerCase().trim();
    const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+t+'"';
    if(/hey\s+s[uo][eu]/.test(t)){
      setMicState('wake');
      setTimeout(()=>{try{r.stop();}catch(e){}alwaysOnActive=false;if(!tapRec)tapRec=buildTapRec();try{tapRec.start();}catch(e){}},500);
      return;
    }
    const results=parseText(t);
    if(results&&results.length) handleParsed(results);
  };
  r.onerror=e=>{alwaysOnActive=false;if(e.error==='not-allowed')document.getElementById('perm-warn').style.display='block';else if(e.error!=='aborted'&&e.error!=='no-speech')setTimeout(restartAlwaysOn,1000);};
  r.onend=()=>{alwaysOnActive=false;if(!isRecording&&!isSpeaking)setTimeout(restartAlwaysOn,500);};
  return r;
}
function pauseAlwaysOn(){if(alwaysOnRec){try{alwaysOnRec.stop();}catch(e){}}alwaysOnActive=false;}
function restartAlwaysOn(){
  const active=document.querySelector('.log-screen.active');
  if(!active||active.id!=='ls-listening'||currentTab!=='log') return;
  if(isRecording||isSpeaking) return;
  if(!alwaysOnRec) alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();setMicState('listening');}catch(e){}
}
function startAlwaysOn(){
  if(!SR){document.getElementById('perm-warn').style.display='block';return;}
  alwaysOnRec=buildAlwaysOn();
  try{alwaysOnRec.start();}catch(e){document.getElementById('perm-warn').style.display='block';}
}
function stopAllRec(){
  try{if(tapRec)tapRec.stop();}catch(e){}
  try{if(alwaysOnRec)alwaysOnRec.stop();}catch(e){}
  isRecording=false;alwaysOnActive=false;
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  isSpeaking=false;
}

// ═══════════════════════════════════════════
// LOG ENTRY POINTS
// ═══════════════════════════════════════════
function startFreshLog(presetSection=null){
  const draft=typeof getDraft==='function'?getDraft():null;
  const hasDraft=draft&&Array.isArray(draft.meal)&&draft.meal.length>0;
  meal=[]; itemQueue=[]; pendingFood=null; currentAmbig=null; undoSnapshot=null; updateUndoBtn();
  currentMealSection=hasDraft?(draft.section||presetSection):presetSection;
  currentQuickMode=false; currentEditMealId=null; currentEditMealDate=null;
  if(hasDraft){
    draft.meal.forEach(i=>meal.push({...i,id:i.id||nextIngId++}));
    if(meal.length) nextIngId=Math.max(...meal.map(i=>i.id||0))+1;
  }
  stopAllRec();
  showLogScreen('listening');
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const pw=document.getElementById('perm-warn'); if(pw) pw.style.display='none';
  if(hasDraft){
    showToast('Restored your in-progress meal',2800);
    speak('Picked up where you left off.',()=>setTimeout(startAlwaysOn,200));
  } else {
    speak('Ready.',()=>setTimeout(startAlwaysOn,200));
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
  if(!active||active.id==='ls-listening') setTimeout(restartAlwaysOn,400);
}

// ═══════════════════════════════════════════
// LOG BUTTON WIRING (done after DOM ready)
// ═══════════════════════════════════════════
function wireLogButtons(){
  document.getElementById('log-cancel-btn').addEventListener('click',()=>{currentEditMealId=null;currentEditMealDate=null;currentQuickMode=false;if(typeof clearDraft==='function')clearDraft();stopAllRec();setMicState('idle');switchTab('home');});
  document.getElementById('finished-meal-btn').addEventListener('click',()=>{if(!meal.length){showToast('Add some ingredients first!');return;}stopAllRec();showSummary();});
  document.getElementById('mic-btn').addEventListener('click',()=>{if(isSpeaking){window.speechSynthesis&&window.speechSynthesis.cancel();isSpeaking=false;}if(isRecording){try{tapRec&&tapRec.stop();}catch(e){}}else startTapRec();});
  document.getElementById('send-btn').addEventListener('click',submitText);
  document.getElementById('voice-retry-btn').addEventListener('click',()=>{hideVoiceCorrectBar();startTapRec();});
  document.getElementById('text-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitText();});
  document.getElementById('confirm-btn').addEventListener('click',doConfirm);
  document.getElementById('change-btn').addEventListener('click',doChange);
  document.getElementById('summary-btn-conf').addEventListener('click',()=>{if(meal.length){stopAllRec();showSummary();}else showToast('Add ingredients first!');});
  document.getElementById('ambig-custom').addEventListener('click',()=>{currentAmbig=null;openCustomEntry();});
  document.getElementById('ambig-skip').addEventListener('click',()=>{currentAmbig=null;showLogScreen('listening');setTimeout(restartAlwaysOn,400);});
  document.getElementById('mc-add-btn').addEventListener('click',commitMultiConfirm);
  document.getElementById('mc-cancel-btn').addEventListener('click',()=>{pendingBatch=[];showLogScreen('listening');setTimeout(restartAlwaysOn,400);});
  document.getElementById('add-custom-btn').addEventListener('click',()=>openCustomEntry());
  document.getElementById('add-more-btn').addEventListener('click',()=>openAddModal());
  document.getElementById('sum-section-select').addEventListener('change',e=>{currentMealSection=e.target.value;});
  document.getElementById('save-meal-btn').addEventListener('click',()=>{saveMealToLog();showToast('Meal saved! 🎉',2500);currentQuickMode=false;setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);});
  // Add modal
  document.getElementById('modal-close-btn').addEventListener('click',closeAddModal);
  document.getElementById('add-modal').addEventListener('click',e=>{if(e.target===document.getElementById('add-modal'))closeAddModal();});
  document.getElementById('tab-search-btn').addEventListener('click',()=>switchModalTab('search'));
  document.getElementById('tab-custom-btn').addEventListener('click',()=>switchModalTab('custom'));
  document.getElementById('food-search').addEventListener('input',e=>renderFoodResults(e.target.value));
  document.getElementById('gram-input').addEventListener('input',updatePreviewMacros);
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
    snapshotMeal(); meal.push({...pendingFood,id:nextIngId++}); _persistDraft();
    showToast('Added '+pendingFood.name+' ✓');
    pendingFood=null;
    showLogScreen('listening');
    renderCurrentMeal();
    processQueue();
  });
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
  inp.value=''; handleParsed(parseText(val));
}
