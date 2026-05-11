// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
let profState={};
let recalSuggestion=null;
let overrideVisible=false;

// Rate options per goal
const RATE_OPTS={
  lose:[{val:'0.25',label:'−0.25'},{val:'0.5',label:'−0.5'},{val:'0.75',label:'−0.75'},{val:'1.0',label:'−1.0'}],
  gain:[{val:'0.1',label:'+0.1'},{val:'0.2',label:'+0.2'},{val:'0.3',label:'+0.3'},{val:'0.4',label:'+0.4'}],
};

function segSelect(groupId,btn){
  document.querySelectorAll('#'+groupId+' .seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  recalcTDEE();
}
function segSelectVal(groupId,val){
  document.querySelectorAll('#'+groupId+' .seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.val===val));
}
function getSegVal(groupId){
  const a=document.querySelector('#'+groupId+' .seg-btn.active');
  return a?a.dataset.val:null;
}

function onGoalChange(){
  const goal=document.getElementById('f-goal').value;
  const rateRow=document.getElementById('rate-row');
  const rateSub=document.getElementById('rate-sub');
  const seg=document.getElementById('seg-rate');
  if(goal==='maintain'){
    rateRow.style.display='none';
  } else {
    rateRow.style.display='flex';
    rateSub.textContent=goal==='lose'?'kg lost per week':'kg gained per week';
    const opts=RATE_OPTS[goal];
    const defaultVal=goal==='lose'?'0.5':'0.2';
    const current=getSegVal('seg-rate');
    // Only rebuild if options changed
    const existingVals=Array.from(seg.querySelectorAll('.seg-btn')).map(b=>b.dataset.val);
    if(JSON.stringify(existingVals)!==JSON.stringify(opts.map(o=>o.val))){
      seg.innerHTML=opts.map(o=>`<button class="seg-btn${o.val===defaultVal?' active':''}" data-val="${o.val}" onclick="segSelect('seg-rate',this)">${o.label}</button>`).join('');
    }
  }
  recalcTDEE();
}

function getProfileWeightForTargets(){
  const weights=getWeights();
  if(weights.length>0){
    const latest=[...weights].sort((a,b)=>a.date.localeCompare(b.date)).slice(-1)[0];
    if(latest&&latest.kg) return parseFloat(latest.kg);
  }
  const profInp=parseFloat(document.getElementById('prof-bw-input')?.value);
  if(profInp&&profInp>=20&&profInp<=400) return profInp;
  const homeInp=parseFloat(document.getElementById('home-bw-input')?.value);
  if(homeInp&&homeInp>=20&&homeInp<=400) return homeInp;
  if(profState.currentWeight&&profState.currentWeight>=20&&profState.currentWeight<=400) return parseFloat(profState.currentWeight);
  return null;
}

function upsertTodayWeight(val){
  if(!val||val<20||val>400) return false;
  const weights=getWeights(), today=todayStr();
  const idx=weights.findIndex(w=>w.date===today);
  if(idx>=0) weights[idx].kg=val; else weights.push({date:today,kg:val});
  weights.sort((a,b)=>a.date.localeCompare(b.date));
  saveWeights(weights);
  profState.currentWeight=val;
  saveProfile({...getProfile(),currentWeight:val});
  return true;
}

function calcTDEE(){
  const age=parseFloat(document.getElementById('f-age').value)||profState.age;
  const height=parseFloat(document.getElementById('f-height').value)||profState.height;
  const activity=parseFloat(document.getElementById('f-activity').value)||profState.activity||1.55;
  const goal=document.getElementById('f-goal').value||profState.goal||'maintain';
  const sex=getSegVal('seg-sex')||profState.sex||'male';
  const weight=getProfileWeightForTargets();
  if(!age||!height||!weight) return null;
  const bmr=sex==='male'?(10*weight)+(6.25*height)-(5*age)+5:(10*weight)+(6.25*height)-(5*age)-161;
  const tdee=Math.round(bmr*activity);
  const rate=parseFloat(getSegVal('seg-rate'))||(goal==='lose'?0.5:goal==='gain'?0.2:0);
  const dailyAdj=Math.round(rate*7700/7);
  let targetKcal=goal==='lose'?tdee-dailyAdj:goal==='gain'?tdee+dailyAdj:tdee;
  targetKcal=Math.max(1200,targetKcal);
  const proteinPerKg=(goal==='lose'&&rate>=0.75)?1.9:goal!=='maintain'?1.7:1.6;
  const targetProtein=Math.round(weight*proteinPerKg);
  const targetFat=Math.round((targetKcal*0.25)/9);
  const targetCarbs=Math.max(0,Math.round((targetKcal-targetProtein*4-targetFat*9)/4));
  return{tdee,targetKcal,targetProtein,targetCarbs,targetFat,weight,goal,rate};
}

function recalcTDEE(){
  const overrideOn=document.getElementById('override-toggle')?.classList.contains('on');
  if(overrideOn&&profState.overrideKcal){
    document.getElementById('tdee-kcal').textContent=profState.overrideKcal+' kcal';
    document.getElementById('tdee-protein').textContent=(profState.overrideProtein||'—')+'g';
    document.getElementById('tdee-carbs').textContent=(profState.overrideCarbs||'—')+'g';
    document.getElementById('tdee-fat').textContent=(profState.overrideFat||'—')+'g';
    document.getElementById('tdee-sub').textContent='Custom targets active';
    profState.targetKcal=profState.overrideKcal; profState.targetProtein=profState.overrideProtein;
    profState.targetCarbs=profState.overrideCarbs; profState.targetFat=profState.overrideFat;
    return;
  }
  const r=calcTDEE();
  if(!r){
    const missing=[];
    if(!document.getElementById('f-age').value&&!profState.age) missing.push('age');
    if(!document.getElementById('f-height').value&&!profState.height) missing.push('height');
    if(!getProfileWeightForTargets()) missing.push('bodyweight');
    document.getElementById('tdee-kcal').textContent='—';
    document.getElementById('tdee-protein').textContent='—';
    document.getElementById('tdee-carbs').textContent='—';
    document.getElementById('tdee-fat').textContent='—';
    document.getElementById('tdee-sub').textContent=missing.length?'Enter '+missing.join(', ')+' to calculate':'Enter details to calculate';
    return;
  }
  document.getElementById('tdee-kcal').textContent=r.targetKcal+' kcal';
  document.getElementById('tdee-protein').textContent=r.targetProtein+'g';
  document.getElementById('tdee-carbs').textContent=r.targetCarbs+'g';
  document.getElementById('tdee-fat').textContent=r.targetFat+'g';
  const lbl={lose:'Fat loss deficit',maintain:'Maintenance calories',gain:'Muscle gain surplus'};
  document.getElementById('tdee-sub').textContent=(lbl[r.goal]||'')+' · TDEE '+r.tdee+' kcal · using '+r.weight.toFixed(1)+'kg';
  profState.targetKcal=r.targetKcal; profState.targetProtein=r.targetProtein;
  profState.targetCarbs=r.targetCarbs; profState.targetFat=r.targetFat;
}

function toggleOverride(){
  overrideVisible=!overrideVisible;
  document.getElementById('override-section').style.display=overrideVisible?'block':'none';
}
function toggleOverrideActive(){
  const t=document.getElementById('override-toggle');
  t.classList.toggle('on');
  profState.overrideActive=t.classList.contains('on');
  if(profState.overrideActive){
    profState.overrideKcal=parseFloat(document.getElementById('o-kcal').value)||null;
    profState.overrideProtein=parseFloat(document.getElementById('o-protein').value)||null;
    profState.overrideCarbs=parseFloat(document.getElementById('o-carbs').value)||null;
    profState.overrideFat=parseFloat(document.getElementById('o-fat').value)||null;
  }
  recalcTDEE();
}
function overrideChanged(){
  if(document.getElementById('override-toggle').classList.contains('on')){
    profState.overrideKcal=parseFloat(document.getElementById('o-kcal').value)||null;
    profState.overrideProtein=parseFloat(document.getElementById('o-protein').value)||null;
    profState.overrideCarbs=parseFloat(document.getElementById('o-carbs').value)||null;
    profState.overrideFat=parseFloat(document.getElementById('o-fat').value)||null;
    recalcTDEE();
  }
}

function loadProfileData(){
  const saved=getProfile();
  if(!saved||!Object.keys(saved).length) return;
  profState={...profState,...saved};
  if(saved.name) document.getElementById('f-name').value=saved.name;
  if(saved.age)  document.getElementById('f-age').value=saved.age;
  if(saved.height) document.getElementById('f-height').value=saved.height;
  if(saved.goal) document.getElementById('f-goal').value=saved.goal;
  if(saved.activity) document.getElementById('f-activity').value=String(saved.activity);
  segSelectVal('seg-sex',saved.sex||'male');
  onGoalChange(); // build rate segment
  if(saved.goalRate) segSelectVal('seg-rate',String(saved.goalRate));
  if(saved.overrideKcal) document.getElementById('o-kcal').value=saved.overrideKcal;
  if(saved.overrideProtein) document.getElementById('o-protein').value=saved.overrideProtein;
  if(saved.overrideCarbs) document.getElementById('o-carbs').value=saved.overrideCarbs;
  if(saved.overrideFat) document.getElementById('o-fat').value=saved.overrideFat;
  if(saved.currentWeight&&!getWeights().length) document.getElementById('prof-bw-input').placeholder=String(saved.currentWeight);
  if(saved.overrideActive){document.getElementById('override-toggle').classList.add('on');document.getElementById('override-section').style.display='block';overrideVisible=true;}
  recalcTDEE();
  renderWeightHistory();
  checkRecalibration();
}

function saveProfileData(){
  profState.name=document.getElementById('f-name').value.trim();
  profState.age=parseFloat(document.getElementById('f-age').value)||null;
  profState.height=parseFloat(document.getElementById('f-height').value)||null;
  profState.goal=document.getElementById('f-goal').value;
  profState.activity=parseFloat(document.getElementById('f-activity').value)||1.55;
  profState.sex=getSegVal('seg-sex');
  profState.goalRate=parseFloat(getSegVal('seg-rate'))||null;
  profState.overrideKcal=parseFloat(document.getElementById('o-kcal').value)||null;
  profState.overrideProtein=parseFloat(document.getElementById('o-protein').value)||null;
  profState.overrideCarbs=parseFloat(document.getElementById('o-carbs').value)||null;
  profState.overrideFat=parseFloat(document.getElementById('o-fat').value)||null;
  profState.overrideActive=document.getElementById('override-toggle').classList.contains('on');

  // Treat a bodyweight typed into the Profile bodyweight box as usable target data.
  const typedWeight=parseFloat(document.getElementById('prof-bw-input').value);
  if(typedWeight&&typedWeight>=20&&typedWeight<=400){
    upsertTodayWeight(typedWeight);
    document.getElementById('prof-bw-input').value='';
  } else {
    const weightForTargets=getProfileWeightForTargets();
    if(weightForTargets) profState.currentWeight=weightForTargets;
  }

  recalcTDEE();
  saveProfile(profState);
  renderWeightHistory();
  renderHome();
  const hasTargets=!!profState.targetKcal;
  showToast(hasTargets?'Profile saved + targets calculated ✓':'Profile saved — add missing details for targets');
}

// ── Bodyweight ──────────────────────────────────
function profLogWeight(){
  const inp=document.getElementById('prof-bw-input');
  const val=parseFloat(inp.value);
  if(!val||val<20||val>400){showToast('Enter a valid weight');return;}
  const weights=getWeights(),today=todayStr();
  const idx=weights.findIndex(w=>w.date===today);
  if(idx>=0) weights[idx].kg=val; else weights.push({date:today,kg:val});
  weights.sort((a,b)=>a.date.localeCompare(b.date));
  saveWeights(weights);
  profState.currentWeight=val;
  saveProfile({...getProfile(),currentWeight:val});
  inp.value='';
  renderWeightHistory();
  recalcTDEE();
  renderHome();
  checkRecalibration();
  showToast('Weight logged + targets updated ✓');
}
function sevenDayAvg(){
  const weights=getWeights();
  if(!weights.length) return null;
  const r=weights.slice(-7);
  return r.reduce((s,w)=>s+w.kg,0)/r.length;
}
function renderWeightHistory(){
  const weights=getWeights();
  const section=document.getElementById('bw-hist-section'),avgWrap=document.getElementById('bw-avg-wrap');
  if(!weights.length){section.style.display='none';avgWrap.style.display='none';return;}
  section.style.display='block'; avgWrap.style.display='block';
  const avg=sevenDayAvg();
  document.getElementById('bw-avg-text').textContent='7-day avg: '+avg.toFixed(1)+' kg';
  if(weights.length>=7){
    const older=weights.slice(-14,-7),recent=weights.slice(-7);
    const avgOlder=older.length?older.reduce((s,w)=>s+w.kg,0)/older.length:avg;
    const avgRecent=recent.reduce((s,w)=>s+w.kg,0)/recent.length;
    const icon=document.getElementById('bw-avg-icon');
    if(avgRecent<avgOlder-0.1) icon.className='ti ti-trending-down';
    else if(avgRecent>avgOlder+0.1) icon.className='ti ti-trending-up';
    else icon.className='ti ti-minus';
  }
  const list=document.getElementById('bw-hist-list');
  list.innerHTML='';
  weights.slice(-7).reverse().forEach((entry,i,arr)=>{
    const prev=arr[i+1];
    const delta=prev?(entry.kg-prev.kg):null;
    const deltaStr=delta!==null?((delta>0?'+':'')+delta.toFixed(1)+' kg'):'';
    const cls=delta===null?'':delta>0.1?'up':delta<-0.1?'down':'same';
    const d=new Date(entry.date+'T12:00:00');
    const lbl=d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    const row=document.createElement('div'); row.className='bw-hist-row';
    row.innerHTML=`<span class="bw-hist-date">${lbl}</span><span class="bw-hist-val">${entry.kg.toFixed(1)} kg</span><span class="bw-hist-delta ${cls}">${deltaStr}</span>`;
    list.appendChild(row);
  });
}

// ── Recalibration ───────────────────────────────
function checkRecalibration(){
  const weights=getWeights();
  if(weights.length<14) return;
  const dismissed=localStorage.getItem(KEYS.recalDismissed);
  if(dismissed&&(Date.now()-parseInt(dismissed))<14*24*60*60*1000) return;
  const goal=profState.goal||'maintain';
  const recent=weights.slice(-7).map(w=>w.kg),older=weights.slice(-14,-7).map(w=>w.kg);
  if(recent.length<3||older.length<3) return;
  const avgRecent=recent.reduce((s,v)=>s+v,0)/recent.length;
  const avgOlder=older.reduce((s,v)=>s+v,0)/older.length;
  const weeklyChange=avgRecent-avgOlder;
  const rate=profState.goalRate||(goal==='lose'?0.5:goal==='gain'?0.2:0);
  const targetChange=goal==='lose'?-rate:goal==='gain'?rate:0;
  if(Math.abs(weeklyChange-targetChange)<0.15) return;
  const currentKcal=profState.targetKcal||2000;
  const kcalAdj=Math.round((targetChange-weeklyChange)*770);
  const newKcal=Math.max(1200,Math.min(4500,currentKcal+kcalAdj));
  const w=avgRecent,protPKg=goal==='lose'?1.9:1.7;
  const newProtein=Math.round(w*protPKg),newFat=Math.round((newKcal*0.25)/9);
  const newCarbs=Math.round((newKcal-newProtein*4-newFat*9)/4);
  recalSuggestion={newKcal,newProtein,newCarbs,newFat,weeklyChange,targetChange};
  const dir=weeklyChange>targetChange?'losing less than expected':'gaining faster than expected';
  document.getElementById('recal-body').textContent=`You're ${dir} (${weeklyChange>=0?'+':''}${weeklyChange.toFixed(2)} kg/wk vs target ${targetChange>=0?'+':''}${targetChange.toFixed(2)} kg/wk).`;
  document.getElementById('recal-banner').classList.add('show');
}
function showRecalModal(){
  if(!recalSuggestion) return;
  const s=recalSuggestion;
  document.getElementById('recal-modal-suggestion').innerHTML=`<div class="modal-suggestion-row"><span class="modal-suggestion-label">New calorie target</span><span class="modal-suggestion-val">${s.newKcal} kcal</span></div><div class="modal-suggestion-row"><span class="modal-suggestion-label">Protein</span><span class="modal-suggestion-val">${s.newProtein}g</span></div><div class="modal-suggestion-row"><span class="modal-suggestion-label">Carbs</span><span class="modal-suggestion-val">${s.newCarbs}g</span></div><div class="modal-suggestion-row"><span class="modal-suggestion-label">Fat</span><span class="modal-suggestion-val">${s.newFat}g</span></div>`;
  document.getElementById('recal-modal').classList.add('show');
}
function applyRecal(){
  if(!recalSuggestion) return;
  const s=recalSuggestion;
  profState.overrideKcal=s.newKcal; profState.overrideProtein=s.newProtein;
  profState.overrideCarbs=s.newCarbs; profState.overrideFat=s.newFat; profState.overrideActive=true;
  document.getElementById('o-kcal').value=s.newKcal; document.getElementById('o-protein').value=s.newProtein;
  document.getElementById('o-carbs').value=s.newCarbs; document.getElementById('o-fat').value=s.newFat;
  document.getElementById('override-toggle').classList.add('on');
  document.getElementById('override-section').style.display='block'; overrideVisible=true;
  recalcTDEE(); saveProfile(profState);
  localStorage.setItem(KEYS.recalDismissed,Date.now().toString());
  document.getElementById('recal-banner').classList.remove('show');
  closeRecalModal(); showToast('Targets updated ✓');
}
function dismissRecal(){localStorage.setItem(KEYS.recalDismissed,Date.now().toString());document.getElementById('recal-banner').classList.remove('show');}
function closeRecalModal(){document.getElementById('recal-modal').classList.remove('show');}
function initProfile(){loadProfileData();}
