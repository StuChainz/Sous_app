// ═══════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════
let histOffset=0; // 0=today, -1=yesterday, etc.
let calChart=null,proteinChart=null,weightChart=null,chartRange=30;

function histNav(dir){
  histOffset+=dir;
  if(histOffset>0) histOffset=0;
  renderHistoryDay();
}

function histDateStr(offset){
  const d=new Date(); d.setDate(d.getDate()+offset);
  return d.toISOString().slice(0,10);
}

function renderHistoryDay(){
  const ds=histDateStr(histOffset);
  const log=getLog(); const dayData=log[ds]||{meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  // Date label
  const lbl=document.getElementById('hist-date-label');
  if(histOffset===0) lbl.textContent='Today';
  else if(histOffset===-1) lbl.textContent='Yesterday';
  else{const d=new Date(ds+'T12:00:00');lbl.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
  document.getElementById('hist-next').disabled=histOffset>=0;
  // Day stats
  const t=dayData.totals||{};
  document.getElementById('hst-kcal').textContent=t.kcal?Math.round(t.kcal):'—';
  document.getElementById('hst-protein').textContent=t.protein?Math.round(t.protein)+'g':'—';
  document.getElementById('hst-carbs').textContent=t.carbs?Math.round(t.carbs)+'g':'—';
  document.getElementById('hst-fat').textContent=t.fat?Math.round(t.fat)+'g':'—';
  // Meals list
  const meals=dayData.meals||[];
  const listEl=document.getElementById('hist-meals-list');
  if(!meals.length){
    listEl.innerHTML='<div class="empty-state"><i class="ti ti-bowl-spoon"></i>Nothing logged this day</div>';
  } else {
    listEl.innerHTML='';
    meals.forEach((m,mIdx)=>{
      const time=new Date(m.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      const ings=m.ingredients||[];
      const curSection=typeof homeMealSectionKey==='function'?homeMealSectionKey(m):(m.section||'dinner');
      const sectionOpts=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snacks','Snacks'],['supplements','Supplements']].map(([v,l])=>`<option value="${v}"${curSection===v?' selected':''}>${l}</option>`).join('');
      const ingHtml=ings.map((ing,iIdx)=>`
        <div style="font-size:12px;color:var(--text-muted);padding:6px 14px;border-top:.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span>${ing.name}${ing.weight?' · '+ing.weight+'g':''} · ${ing.kcal} kcal</span>
          <div style="display:flex;gap:4px;">
            <button onclick="openHistoryIngredientEdit('${ds}',${mIdx},${iIdx})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:2px 6px;opacity:.7;" title="Edit ingredient"><i class="ti ti-pencil"></i></button>
            <button onclick="deleteHistoryIngredient('${ds}',${mIdx},${iIdx})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:14px;padding:2px 6px;opacity:.7;" title="Remove ingredient"><i class="ti ti-trash"></i></button>
          </div>
        </div>`).join('');
      const wrap=document.createElement('div');
      wrap.style.cssText='background:var(--card);border:.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;overflow:hidden;';
      wrap.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;">
          <div><div style="font-size:14px;font-weight:500;color:var(--text);">${m.name}</div><div style="font-size:11px;color:var(--text-muted);">${time} · ${ings.length} ingredient${ings.length!==1?'s':''} · <select onchange="changeHistoryMealSection('${ds}',${mIdx},this.value)" style="background:none;border:none;color:var(--text-muted);font-size:11px;font-family:inherit;cursor:pointer;padding:0;">${sectionOpts}</select></div></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="font-size:15px;font-weight:500;color:var(--accent);font-family:'Geist Mono',monospace;">${Math.round(m.totals.kcal)} kcal</div>
            <button onclick="deleteHistoryMeal('${ds}',${mIdx})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:16px;padding:2px 4px;opacity:.7;" title="Delete meal"><i class="ti ti-trash"></i></button>
          </div>
        </div>${ingHtml}`;
      listEl.appendChild(wrap);
    });
  }
  // Render charts (debounced)
  clearTimeout(window._chartTimer);
  window._chartTimer=setTimeout(renderCharts,100);
}

function changeHistoryMealSection(dateStr,mealIdx,section){
  const log=getLog();
  if(!log[dateStr]?.meals?.[mealIdx]) return;
  log[dateStr].meals[mealIdx].section=section;
  saveLog(log);
  renderHistoryDay();
  if(typeof updateHome==='function') updateHome();
}

function deleteHistoryMeal(dateStr,mealIdx){
  if(!confirm('Delete this meal? This cannot be undone.')) return;
  const log=getLog();
  if(!log[dateStr]||!log[dateStr].meals) return;
  const name=log[dateStr].meals[mealIdx]?.name||'meal';
  log[dateStr].meals.splice(mealIdx,1);
  // Recalculate day totals
  log[dateStr].totals=sumMacros(log[dateStr].meals.map(m=>m.totals));
  if(!log[dateStr].meals.length) delete log[dateStr];
  saveLog(log);
  renderHistoryDay();
  if(typeof showToast==='function') showToast(name+' deleted');
}

function deleteHistoryIngredient(dateStr,mealIdx,ingIdx){
  if(!confirm('Remove this ingredient?')) return;
  const log=getLog();
  if(!log[dateStr]?.meals?.[mealIdx]?.ingredients) return;
  const meal=log[dateStr].meals[mealIdx];
  const ingName=meal.ingredients[ingIdx]?.name||'ingredient';
  meal.ingredients.splice(ingIdx,1);
  // Recalculate meal totals from remaining ingredients
  meal.totals=sumMacros(meal.ingredients);
  // Recalculate day totals
  log[dateStr].totals=sumMacros(log[dateStr].meals.map(m=>m.totals));
  if(!meal.ingredients.length){
    log[dateStr].meals.splice(mealIdx,1);
    if(!log[dateStr].meals.length) delete log[dateStr];
  }
  saveLog(log);
  renderHistoryDay();
  if(typeof showToast==='function') showToast(ingName+' removed');
}

function openHistoryIngredientEdit(dateStr,mealIdx,ingIdx){
  const log=getLog();
  const ing=log[dateStr]?.meals?.[mealIdx]?.ingredients?.[ingIdx];
  if(!ing) return;
  document.getElementById('hist-edit-date').value=dateStr;
  document.getElementById('hist-edit-meal-idx').value=mealIdx;
  document.getElementById('hist-edit-ing-idx').value=ingIdx;
  document.getElementById('hist-edit-name').value=ing.name;
  document.getElementById('hist-edit-weight').value=ing.weight??'';
  document.getElementById('hist-edit-kcal').value=ing.kcal;
  document.getElementById('hist-edit-protein').value=ing.protein;
  document.getElementById('hist-edit-carbs').value=ing.carbs;
  document.getElementById('hist-edit-fat').value=ing.fat;
  document.getElementById('hist-edit-fibre').value=ing.fibre??'';
  const m=document.getElementById('hist-edit-modal');
  m.style.display='flex';
  requestAnimationFrame(()=>m.classList.add('show'));
}
function closeHistoryIngredientEdit(){
  const m=document.getElementById('hist-edit-modal');
  m.classList.remove('show');
  setTimeout(()=>{m.style.display='none';},300);
}
function saveHistoryIngredientEdit(){
  const dateStr=document.getElementById('hist-edit-date').value;
  const mealIdx=parseInt(document.getElementById('hist-edit-meal-idx').value);
  const ingIdx=parseInt(document.getElementById('hist-edit-ing-idx').value);
  const name=document.getElementById('hist-edit-name').value.trim();
  if(!name){showToast('Food name required');return;}
  const weightRaw=document.getElementById('hist-edit-weight').value;
  const weight=weightRaw!==''?parseFloat(weightRaw)||null:null;
  const kcal=parseFloat(document.getElementById('hist-edit-kcal').value)||0;
  const protein=parseFloat(document.getElementById('hist-edit-protein').value)||0;
  const carbs=parseFloat(document.getElementById('hist-edit-carbs').value)||0;
  const fat=parseFloat(document.getElementById('hist-edit-fat').value)||0;
  const fibreRaw=document.getElementById('hist-edit-fibre').value;
  const fibre=fibreRaw!==''?parseFloat(fibreRaw)||0:0;
  const log=getLog();
  if(!log[dateStr]?.meals?.[mealIdx]?.ingredients?.[ingIdx]) return;
  const ing=log[dateStr].meals[mealIdx].ingredients[ingIdx];
  ing.name=name; ing.weight=weight; ing.kcal=kcal; ing.protein=protein; ing.carbs=carbs; ing.fat=fat; ing.fibre=fibre;
  const meal=log[dateStr].meals[mealIdx];
  meal.totals=sumMacros(meal.ingredients);
  log[dateStr].totals=sumMacros(log[dateStr].meals.map(m=>m.totals));
  saveLog(log);
  closeHistoryIngredientEdit();
  renderHistoryDay();
  showToast('Updated ✓');
}
document.getElementById('hist-edit-save-btn').addEventListener('click',saveHistoryIngredientEdit);
document.getElementById('hist-edit-close-btn').addEventListener('click',closeHistoryIngredientEdit);
document.getElementById('hist-edit-cancel-btn').addEventListener('click',closeHistoryIngredientEdit);
document.getElementById('hist-edit-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeHistoryIngredientEdit();});

function setChartRange(days){
  chartRange=days;
  document.querySelectorAll('.range-btn').forEach(b=>b.classList.toggle('active',b.textContent===days+'d'));
  renderCharts();
}

function getChartLabels(days){
  const labels=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    labels.push(days<=14?d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric'}):d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
  }
  return labels;
}

function renderCharts(){
  if(typeof Chart==='undefined') return;
  const log=getLog(),weights=getWeights();
  const labels=getChartLabels(chartRange);
  const calVals=[],protVals=[],wtVals=[],wtAvgVals=[];
  const wtMap={};weights.forEach(w=>wtMap[w.date]=w.kg);

  for(let i=chartRange-1;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=d.toISOString().slice(0,10);
    calVals.push(log[ds]?Math.round(log[ds].totals.kcal):null);
    protVals.push(log[ds]?Math.round(log[ds].totals.protein):null);
    wtVals.push(wtMap[ds]||null);
  }
  // 7-day rolling avg for weight
  wtVals.forEach((_,i)=>{
    const slice=wtVals.slice(Math.max(0,i-6),i+1).filter(v=>v!==null);
    wtAvgVals.push(slice.length?Math.round(slice.reduce((a,b)=>a+b,0)/slice.length*10)/10:null);
  });

  const profile=getProfile();
  const gridColor='rgba(0,0,0,0.06)';
  const tickFont={family:'DM Sans',size:10};
  const baseOpts={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{}}},scales:{x:{grid:{color:gridColor},ticks:{font:tickFont,color:'#888',maxRotation:0,maxTicksLimit:chartRange<=14?chartRange:8}},y:{grid:{color:gridColor},ticks:{font:{...tickFont,family:'DM Mono'},color:'#888'}}}};

  // Calories
  if(calChart) calChart.destroy();
  calChart=new Chart(document.getElementById('chart-calories'),{type:'line',data:{labels,datasets:[{data:calVals,borderColor:'#533ab7',backgroundColor:'rgba(83,58,183,.08)',fill:true,tension:.3,pointRadius:3,pointBackgroundColor:'#533ab7',spanGaps:true}]},options:{...baseOpts,scales:{...baseOpts.scales,y:{...baseOpts.scales.y,beginAtZero:true}}}});

  // Protein
  if(proteinChart) proteinChart.destroy();
  proteinChart=new Chart(document.getElementById('chart-protein'),{type:'line',data:{labels,datasets:[{data:protVals,borderColor:'#639922',backgroundColor:'rgba(99,153,34,.08)',fill:true,tension:.3,pointRadius:3,pointBackgroundColor:'#639922',spanGaps:true}]},options:{...baseOpts,scales:{...baseOpts.scales,y:{...baseOpts.scales.y,beginAtZero:true}}}});

  // Weight
  if(weightChart) weightChart.destroy();
  weightChart=new Chart(document.getElementById('chart-weight'),{type:'line',data:{labels,datasets:[{data:wtVals,borderColor:'#ba7517',backgroundColor:'transparent',fill:false,tension:.2,pointRadius:3,pointBackgroundColor:'#ba7517',spanGaps:true,label:'Daily'},{data:wtAvgVals,borderColor:'#533ab7',backgroundColor:'transparent',fill:false,tension:.4,pointRadius:0,borderDash:[4,4],spanGaps:true,label:'7d avg'}]},options:{...baseOpts,plugins:{legend:{display:true,position:'top',labels:{font:{family:'DM Sans',size:10},boxWidth:20,color:'#888'}}}}});
}
