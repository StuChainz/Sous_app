// ═══════════════════════════════════════════
// RECIPES
// ═══════════════════════════════════════════
let currentRecipe=null, cookSteps=[], cookStep=0, cookTimerInterval=null, cookTimerSecs=0, cookTimerRunning=false;

function showRsScreen(id){
  document.querySelectorAll('.rs-screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('rs-'+id);
  if(el) el.classList.add('active');
}

function renderRecipeList(){
  const recipes=getRecipes();
  const cont=document.getElementById('rs-list-content');
  if(!recipes.length){
    cont.innerHTML='<div class="empty-state"><i class="ti ti-chef-hat"></i>No recipes yet — tap New to add one</div>';
    return;
  }
  cont.innerHTML=recipes.map((r,i)=>{
    const t=r.totals||{kcal:0,protein:0};
    const ing=r.ingredients?r.ingredients.length:0;
    return`<div class="recipe-item" onclick="openRecipeDetail(${i})">
      <div>
        <div class="recipe-item-name">${r.name}</div>
        <div class="recipe-item-detail">${ing} ingredient${ing!==1?'s':''} · ${t.protein||0}g protein</div>
      </div>
      <div class="recipe-item-kcal">${Math.round(t.kcal||0)}<br><span style="font-size:10px;color:var(--text-muted);font-family:'Geist',sans-serif;font-weight:400;">kcal</span></div>
    </div>`;
  }).join('');
}

function openRecipeDetail(idx){
  const recipes=getRecipes();
  if(!recipes[idx]) return;
  currentRecipe={...recipes[idx],_idx:idx};
  showRecipeDetail(currentRecipe);
  showRsScreen('detail');
}

function showRecipeDetail(r){
  document.getElementById('rd-name').textContent=r.name||'Recipe';
  const t=r.totals||{kcal:0,protein:0,carbs:0,fat:0,fibre:0};
  document.getElementById('rd-totals').innerHTML=`
    <div class="total-row"><span class="total-label">Calories</span><span class="total-val">${Math.round(t.kcal||0)} kcal</span></div>
    <div class="total-row"><span class="total-label">Protein</span><span class="total-val">${Math.round(t.protein||0)}g</span></div>
    <div class="total-row"><span class="total-label">Carbs</span><span class="total-val">${Math.round(t.carbs||0)}g</span></div>
    <div class="total-row"><span class="total-label">Fat</span><span class="total-val">${Math.round(t.fat||0)}g</span></div>
    ${(t.fibre||0)>0?`<div class="total-row"><span class="total-label">Fibre</span><span class="total-val">${Math.round(t.fibre)}g</span></div>`:''}
  `;
  const ingList=document.getElementById('rd-ing-list');
  const ings=r.ingredients||[];
  ingList.innerHTML=ings.length?ings.map(ing=>`
    <div class="meal-item">
      <div class="meal-item-left">
        <div class="meal-item-name"><i class="ti ${ing.icon||'ti-bowl-spoon'}" style="margin-right:5px;font-size:13px;vertical-align:-1px;"></i>${ing.name}</div>
        <div class="meal-item-detail">${ing.weight}g · ${ing.protein}g prot · ${ing.carbs}g carbs · ${ing.fat}g fat</div>
      </div>
      <div class="meal-item-kcal">${ing.kcal} kcal</div>
    </div>`).join(''):'<div class="empty-state" style="padding:12px 0;"><i class="ti ti-list"></i>No ingredients detected</div>';
  const steps=r.steps||[];
  const stepsEl=document.getElementById('rd-steps-sec');
  const stepsList=document.getElementById('rd-steps-list');
  if(steps.length){
    stepsEl.style.display='block';
    stepsList.innerHTML=steps.map((s,i)=>`
      <div class="meal-item" style="align-items:flex-start;">
        <div style="width:24px;height:24px;background:var(--accent-soft);color:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;margin-right:10px;margin-top:1px;">${i+1}</div>
        <div style="font-size:14px;color:var(--text);line-height:1.5;">${s}</div>
      </div>`).join('');
  } else {
    stepsEl.style.display='none';
  }
  const delBtn=document.getElementById('rd-delete-btn');
  const cookBtn=document.getElementById('rd-cook-btn');
  delBtn.onclick=()=>deleteCurrentRecipe();
  cookBtn.style.display=steps.length?'':'none';
  delBtn.style.flex=steps.length?'':'1';
  cookBtn.onclick=()=>startCooking();
}

function importRecipe(){
  const name=document.getElementById('recipe-name-inp').value.trim();
  if(!name){showToast('Enter a recipe name first');return;}
  const text=document.getElementById('recipe-paste').value.trim();
  const {ingredients,steps,totals}=parseRecipeText(text);
  const recipe={id:Date.now().toString(),name,ingredients,steps,totals,created:new Date().toISOString()};
  const recipes=getRecipes();
  recipes.push(recipe);
  saveRecipes(recipes);
  document.getElementById('recipe-name-inp').value='';
  document.getElementById('recipe-paste').value='';
  renderRecipeList();
  showRsScreen('list');
  showToast(`"${name}" saved ✓`);
}

function deleteCurrentRecipe(){
  if(!currentRecipe) return;
  const recipes=getRecipes();
  const idx=currentRecipe._idx;
  if(idx===undefined||idx<0||idx>=recipes.length) return;
  const name=currentRecipe.name;
  recipes.splice(idx,1);
  saveRecipes(recipes);
  currentRecipe=null;
  renderRecipeList();
  showRsScreen('list');
  showToast(`"${name}" deleted`);
}

// ── Cooking mode ─────────────────────────────
function startCooking(){
  if(!currentRecipe) return;
  cookSteps=currentRecipe.steps||[];
  if(!cookSteps.length){showToast('No steps in this recipe');return;}
  cookStep=0;
  clearCookTimer();
  showRsScreen('cook');
  renderCookStep();
}

function renderCookStep(){
  const total=cookSteps.length;
  document.getElementById('cook-counter').textContent=`Step ${cookStep+1} of ${total}`;
  const text=cookSteps[cookStep];
  document.getElementById('cook-step-text').textContent=text;
  document.getElementById('cook-prev-btn').style.opacity=cookStep===0?'0.4':'1';
  document.getElementById('cook-prev-btn').disabled=cookStep===0;
  const nextBtn=document.getElementById('cook-next-btn');
  if(cookStep===total-1){
    nextBtn.textContent='Finish ✓';
    nextBtn.onclick=()=>showRecipeComplete();
  } else {
    nextBtn.innerHTML='Next <i class="ti ti-arrow-right" style="vertical-align:-2px;font-size:14px;"></i>';
    nextBtn.onclick=()=>cookNav(1);
  }
  // Detect timer hint in step text
  clearCookTimer();
  const timerMatch=text.match(/(\d+)\s*(?:to\s+\d+\s*)?(?:minutes?|mins?)/i);
  const wrap=document.getElementById('cook-timer-wrap');
  if(timerMatch){
    const mins=parseInt(timerMatch[1]);
    cookTimerSecs=mins*60;
    wrap.style.display='block';
    document.getElementById('cook-timer-val').textContent=fmtSecs(cookTimerSecs);
    document.getElementById('cook-timer-lbl').textContent='tap to start';
    document.getElementById('cook-timer-btn').textContent='Start timer';
    cookTimerRunning=false;
  } else {
    wrap.style.display='none';
  }
  // TTS
  if(window.speechSynthesis){
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(`Step ${cookStep+1}. ${text}`);
    utt.rate=0.95; utt.pitch=1;
    window.speechSynthesis.speak(utt);
  }
}

function showRecipeComplete(){
  const name=currentRecipe?currentRecipe.name:'Recipe';
  clearCookTimer();
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  document.getElementById('cook-counter').textContent='Complete';
  document.getElementById('cook-step-text').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;height:100%;gap:14px;padding-top:40px;">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;">
        <i class="ti ti-check" style="font-size:32px;color:var(--accent);"></i>
      </div>
      <div style="font-family:'Instrument Serif',serif;font-size:30px;letter-spacing:-0.01em;color:var(--text);">${name}</div>
      <div style="font-size:14px;color:var(--text-muted);">complete · enjoy!</div>
    </div>`;
  document.getElementById('cook-prev-btn').disabled=true;
  document.getElementById('cook-prev-btn').style.opacity='0.4';
  document.getElementById('cook-timer-wrap').style.display='none';
  const nextBtn=document.getElementById('cook-next-btn');
  nextBtn.textContent='Done';
  nextBtn.onclick=()=>finishCooking();
  if(window.speechSynthesis){
    const u=new SpeechSynthesisUtterance(`${name} complete. Enjoy!`);
    u.rate=0.96; u.pitch=1.05;
    setTimeout(()=>window.speechSynthesis.speak(u),30);
  }
}

function cookNav(dir){
  const total=cookSteps.length;
  const next=cookStep+dir;
  if(next<0||next>=total) return;
  cookStep=next;
  renderCookStep();
}

function stopCooking(){
  clearCookTimer();
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  showRsScreen('detail');
}

function finishCooking(){
  clearCookTimer();
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  // Offer to log the recipe as a meal
  if(currentRecipe&&currentRecipe.ingredients&&currentRecipe.ingredients.length){
    const r=currentRecipe;
    const log=getLog(),today=todayStr();
    if(!log[today]) log[today]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
    log[today].meals.push({name:r.name,time:new Date().toISOString(),ingredients:r.ingredients,totals:r.totals});
    ['kcal','protein','carbs','fat','fibre'].forEach(k=>{
      log[today].totals[k]=(log[today].totals[k]||0)+(r.totals[k]||0);
    });
    saveLog(log);
    showToast(`${r.name} logged to today ✓`);
  }
  showRsScreen('detail');
}

function toggleCookTimer(){
  if(cookTimerRunning){
    // Pause
    clearInterval(cookTimerInterval); cookTimerInterval=null; cookTimerRunning=false;
    document.getElementById('cook-timer-btn').textContent='Resume';
    document.getElementById('cook-timer-lbl').textContent='paused';
  } else {
    // Start / resume
    cookTimerRunning=true;
    document.getElementById('cook-timer-btn').textContent='Pause';
    document.getElementById('cook-timer-lbl').textContent='remaining';
    cookTimerInterval=setInterval(()=>{
      if(cookTimerSecs<=0){
        clearInterval(cookTimerInterval); cookTimerInterval=null; cookTimerRunning=false;
        document.getElementById('cook-timer-val').textContent='0:00';
        document.getElementById('cook-timer-lbl').textContent='done!';
        document.getElementById('cook-timer-btn').textContent='Done';
        if(window.speechSynthesis){
          const utt=new SpeechSynthesisUtterance('Timer done!');
          utt.rate=1; window.speechSynthesis.speak(utt);
        }
        return;
      }
      cookTimerSecs--;
      document.getElementById('cook-timer-val').textContent=fmtSecs(cookTimerSecs);
    },1000);
  }
}

function clearCookTimer(){
  if(cookTimerInterval){clearInterval(cookTimerInterval);cookTimerInterval=null;}
  cookTimerRunning=false; cookTimerSecs=0;
}

function fmtSecs(s){
  const m=Math.floor(s/60),sec=s%60;
  return m+':'+(sec<10?'0':'')+sec;
}
