// ═══════════════════════════════════════════
// LOG STATE
// ═══════════════════════════════════════════
let meal=[], itemQueue=[], pendingFood=null, currentAmbig=null;
let tapRec=null, alwaysOnRec=null, isRecording=false, alwaysOnActive=false, isSpeaking=false;
let nextIngId=1;
let modalSelectedFood=null, modalActiveTab='search';

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
function autoAddItem(item){
  meal.push(item);
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
function handleParsed(results){
  if(!results||!results.length){showToast("Didn't catch that — try again!");return;}
  if(results.length===1 && results[0].command && !['summary'].includes(results[0].command)){
    const handled=applyCorrectionCommand(results[0]);
    refreshSummaryIfVisible();
    updateHome();
    if(handled && document.querySelector('.log-screen.active')?.id==='ls-listening') setTimeout(restartAlwaysOn,400);
    return;
  }
  if(results[0].command==='summary'){
    if(!meal.length){showToast('Add some ingredients first!');return;}
    stopAllRec(); showSummary(); return;
  }
  showBatchHeard(results);
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
  if(next.ambiguous){
    if(autoAdded.length){
      const msg='Added '+batchPhrase(autoAdded)+'. Need one check.';
      const transcript=document.getElementById('transcript-text');
      if(transcript) transcript.textContent=msg;
      showToast(msg,2200);
    }
    showAmbiguous(next.matches,next.amount,next.label,next.question);
    return;
  }
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
  const t=sumMacros(meal);
  container.style.display='block';
  container.innerHTML=
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:.5px solid var(--border);">
       <span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Added so far</span>
       <span style="font-size:12px;color:var(--accent);font-family:'Geist Mono',monospace;">${Math.round(t.kcal)} kcal · ${Math.round(t.protein)}g P</span>
     </div>`+
    meal.map(i=>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:.5px solid var(--border);">
         <span style="font-size:13px;color:var(--text);">${i.name}${i.weight?' <span style="color:var(--text-muted);">'+i.weight+'g</span>':''}</span>
         <span style="font-size:12px;color:var(--text-muted);font-family:'Geist Mono',monospace;">${i.kcal} kcal · ${i.protein}g P</span>
       </div>`
    ).join('');
}

function showLogScreen(id){
  document.querySelectorAll('.log-screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('ls-'+id).classList.add('active');
  if(id==='listening') renderCurrentMeal();
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
  meal.push(pendingFood);
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
  meal.push(item);
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
  const resolved={name:food.name,weight:amount?Math.round(amount):food.w,kcal:Math.round(food.kcal*r),protein:Math.round(food.p*r*10)/10,carbs:Math.round(food.c*r*10)/10,fat:Math.round(food.f*r*10)/10,fibre:Math.round(food.fi*r*10)/10,icon:food.icon,rawFood:food,weightSpecified:amount!=null};
  currentAmbig=null;
  if(!amount){askQuantity(resolved);}else{showConfirm(resolved);}
}

// ═══════════════════════════════════════════
// SUMMARY SCREEN
// ═══════════════════════════════════════════
function showSummary(announce=true){
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
    meal.push({id:nextIngId++,name:modalSelectedFood.name,weight:Math.round(grams),kcal:Math.round(modalSelectedFood.kcal*r),protein:Math.round(modalSelectedFood.p*r*10)/10,carbs:Math.round(modalSelectedFood.c*r*10)/10,fat:Math.round(modalSelectedFood.f*r*10)/10,fibre:Math.round((modalSelectedFood.fi||0)*r*10)/10,icon:modalSelectedFood.icon});
    showToast('Added '+modalSelectedFood.name+' ✓');
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
    meal.push({id:nextIngId++,name,weight,kcal,protein,carbs,fat,fibre,icon:'ti-clipboard'});
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
  document.getElementById('edit-modal').style.display='flex';
}
function closeEditModal(){document.getElementById('edit-modal').style.display='none';}
function saveEdit(){
  const id=parseInt(document.getElementById('edit-ing-id').value);
  const name=document.getElementById('edit-name').value.trim();
  const weightRaw=document.getElementById('edit-weight').value;
  const weight=weightRaw!==''?parseFloat(weightRaw)||null:null;
  const kcal=parseFloat(document.getElementById('edit-kcal').value)||0;
  const protein=parseFloat(document.getElementById('edit-protein').value)||0;
  const carbs=parseFloat(document.getElementById('edit-carbs').value)||0;
  const fat=parseFloat(document.getElementById('edit-fat').value)||0;
  if(!name){showToast('Food name required');return;}
  const item=meal.find(i=>i.id===id);
  if(!item) return;
  item.name=name; item.weight=weight; item.kcal=kcal; item.protein=protein; item.carbs=carbs; item.fat=fat;
  closeEditModal(); showSummary(false); showToast('Updated ✓');
}
function deleteIngredient(id){
  const idx=meal.findIndex(i=>i.id===id);
  if(idx===-1) return;
  const name=meal[idx].name;
  meal.splice(idx,1);
  closeEditModal(); showSummary(false); showToast(name+' removed');
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
function saveMealToLog(){
  const date=(typeof selectedLogDate!=='undefined'?selectedLogDate:todayStr()),log=getLog();
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const mt=sumMacros(meal);
  log[date].meals.push({id:Date.now(),name:getMealName(),time:new Date().toISOString(),ingredients:meal.slice(),totals:{kcal:Math.round(mt.kcal),protein:Math.round(mt.protein*10)/10,carbs:Math.round(mt.carbs*10)/10,fat:Math.round(mt.fat*10)/10,fibre:Math.round(mt.fibre*10)/10}});
  log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  saveLog(log);
}

// ═══════════════════════════════════════════
// SPEECH RECOGNITION
// ═══════════════════════════════════════════
function buildTapRec(){
  if(!SR) return null;
  const r=new SR(); r.lang='en-GB'; r.interimResults=true; r.continuous=false; r.maxAlternatives=3;
  r.onstart=()=>{isRecording=true;setMicState('recording');};
  r.onresult=e=>{
    let interim='',final='';
    for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t;else interim+=t;}
    const el=document.getElementById('transcript-text');
    if(el) el.textContent='"'+(final||interim)+'"';
    if(final){stopTapRec();handleParsed(parseText(final.trim()));}
  };
  r.onerror=e=>{stopTapRec();if(e.error==='not-allowed')document.getElementById('perm-warn').style.display='block';else if(e.error!=='aborted')showToast('Mic error: '+e.error);};
  r.onend=()=>stopTapRec();
  return r;
}
function stopTapRec(){isRecording=false;if(!isSpeaking)setMicState(alwaysOnActive?'listening':'idle');}
function startTapRec(){
  if(!SR){showToast('Speech not supported — use text input');return;}
  if(!tapRec) tapRec=buildTapRec();
  if(isRecording){try{tapRec.stop();}catch(e){}return;}
  pauseAlwaysOn();
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
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
function startFreshLog(){
  meal=[]; itemQueue=[]; pendingFood=null; currentAmbig=null;
  stopAllRec();
  showLogScreen('listening');
  const el=document.getElementById('transcript-text'); if(el) el.textContent='—';
  const pw=document.getElementById('perm-warn'); if(pw) pw.style.display='none';
  speak('Ready.',()=>setTimeout(startAlwaysOn,200));
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
  document.getElementById('log-cancel-btn').addEventListener('click',()=>{stopAllRec();setMicState('idle');switchTab('home');});
  document.getElementById('finished-meal-btn').addEventListener('click',()=>{if(!meal.length){showToast('Add some ingredients first!');return;}stopAllRec();showSummary();});
  document.getElementById('mic-btn').addEventListener('click',()=>{if(isSpeaking){window.speechSynthesis&&window.speechSynthesis.cancel();isSpeaking=false;}if(isRecording){try{tapRec&&tapRec.stop();}catch(e){}}else startTapRec();});
  document.getElementById('send-btn').addEventListener('click',submitText);
  document.getElementById('text-input').addEventListener('keydown',e=>{if(e.key==='Enter')submitText();});
  document.getElementById('confirm-btn').addEventListener('click',doConfirm);
  document.getElementById('change-btn').addEventListener('click',doChange);
  document.getElementById('summary-btn-conf').addEventListener('click',()=>{if(meal.length){stopAllRec();showSummary();}else showToast('Add ingredients first!');});
  document.getElementById('ambig-custom').addEventListener('click',()=>{currentAmbig=null;openCustomEntry();});
  document.getElementById('ambig-skip').addEventListener('click',()=>{currentAmbig=null;showLogScreen('listening');setTimeout(restartAlwaysOn,400);});
  document.getElementById('add-custom-btn').addEventListener('click',()=>openCustomEntry());
  document.getElementById('add-more-btn').addEventListener('click',()=>openAddModal());
  document.getElementById('save-meal-btn').addEventListener('click',()=>{saveMealToLog();showToast('Meal saved! 🎉',2500);setTimeout(()=>{meal=[];itemQueue=[];nextIngId=1;stopAllRec();switchTab('home');},1800);});
  // Add modal
  document.getElementById('modal-close-btn').addEventListener('click',closeAddModal);
  document.getElementById('add-modal').addEventListener('click',e=>{if(e.target===document.getElementById('add-modal'))closeAddModal();});
  document.getElementById('tab-search-btn').addEventListener('click',()=>switchModalTab('search'));
  document.getElementById('tab-custom-btn').addEventListener('click',()=>switchModalTab('custom'));
  document.getElementById('food-search').addEventListener('input',e=>renderFoodResults(e.target.value));
  document.getElementById('gram-input').addEventListener('input',updatePreviewMacros);
  document.getElementById('modal-add-btn').addEventListener('click',addManualIngredient);
  // Edit modal
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
    meal.push({...pendingFood,id:nextIngId++});
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
  const el=document.getElementById('transcript-text'); if(el) el.textContent='"'+val+'"';
  inp.value=''; handleParsed(parseText(val));
}
