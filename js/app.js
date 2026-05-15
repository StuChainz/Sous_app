// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
let currentTab='home';
function switchTab(tab,opts={}){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.bottom-tabs .tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('pane-'+tab).classList.add('active');
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  const prev=currentTab; currentTab=tab;
  if(tab==='home') renderHome();
  if(tab==='history') { if(typeof renderHistoryDay==='function') renderHistoryDay(); }
  if(tab==='recipes') { if(typeof renderRecipeList==='function') renderRecipeList(); }
  if(tab==='log'){
    if(opts.fresh){
      if(opts.silent&&typeof startSilentLog==='function') startSilentLog(opts.section||null,opts.quick||false);
      else if(typeof startFreshLog==='function') startFreshLog(opts.section||null);
    }
    else { if(typeof resumeLog==='function') resumeLog(); }
  }
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function showToast(msg,d=2200){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._tid); t._tid=setTimeout(()=>t.classList.remove('show'),d);
}
function updateClock(){
  const n=new Date(),h=n.getHours();
  document.getElementById('clock').textContent=String(h).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  const el=document.getElementById('home-greeting');
  if(el) el.textContent=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
}

// ═══════════════════════════════════════════
// DATE SELECTION
// ═══════════════════════════════════════════
function localDateStr(d=new Date()){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function formatDisplayDate(dateStr){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y,m,d]=dateStr.split('-');
  return d+'-'+months[parseInt(m,10)-1]+'-'+y.slice(2);
}
let selectedLogDate=localDateStr();
let currentEditMealId=null, currentEditMealDate=null;
let currentQuickMode=false;

function shiftDate(days){
  const d=new Date(selectedLogDate+'T12:00:00');
  d.setDate(d.getDate()+days);
  selectedLogDate=localDateStr(d);
  renderHome();
}

function updateDateNav(){
  const isToday=selectedLogDate===localDateStr();
  const lbl=document.getElementById('date-label');
  if(lbl) lbl.textContent=isToday?'Today':formatDisplayDate(selectedLogDate);
  const dateLbl=document.getElementById('home-date-label');
  if(dateLbl) dateLbl.textContent=isToday?'Today so far':formatDisplayDate(selectedLogDate);
  const mealsLbl=document.getElementById('home-meals-label');
  if(mealsLbl) mealsLbl.textContent=isToday?'Today\'s meals':'Meals on '+formatDisplayDate(selectedLogDate);
}

// ═══════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════
function calcStreak(){
  const log=getLog(); let streak=0;
  for(let i=0;i<365;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=localDateStr(d);
    if(log[ds]&&log[ds].meals&&log[ds].meals.length>0) streak++;
    else if(i===0) continue;
    else break;
  }
  return streak;
}

const HOME_MEAL_SECTIONS=[
  {key:'breakfast',label:'Breakfast'},
  {key:'lunch',label:'Lunch'},
  {key:'dinner',label:'Dinner'},
  {key:'snacks',label:'Snacks'},
  {key:'supplements',label:'Supplements'}
];
function homeMealSectionKey(m){
  const k=String(m.section||'').toLowerCase().trim();
  if(['breakfast','lunch','dinner','snacks','supplements'].includes(k)) return k;
  const n=String(m.name||'').toLowerCase();
  if(n.includes('supplement')) return 'supplements';
  if(n.includes('breakfast')) return 'breakfast';
  if(n.includes('lunch')) return 'lunch';
  if(n.includes('dinner')) return 'dinner';
  if(n.includes('snack')) return 'snacks';
  const h=new Date(m.time).getHours();
  if(h<11) return 'breakfast';
  if(h<15) return 'lunch';
  if(h<21) return 'dinner';
  return 'snacks';
}
function hasMealForSectionOnSelectedDate(section, meals){
  const list=meals||[];
  return list.some(m=>homeMealSectionKey(m)===section);
}
function getMealsForLogDate(dateStr){
  if(!dateStr) return [];
  return (getLog()[dateStr]||{}).meals||[];
}
function getDefaultQuickAddSection(forDateStr){
  const meals=getMealsForLogDate(forDateStr);
  const h=new Date().getHours();
  let candidate;
  if(h<11) candidate='breakfast';
  else if(h<16) candidate='lunch';
  else if(h<21) candidate='dinner';
  else candidate='snacks';
  if(hasMealForSectionOnSelectedDate(candidate,meals)) return 'snacks';
  return candidate;
}
function homeMealRowHtml(m){
  const time=new Date(m.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const n=m.ingredients?m.ingredients.length:0;
  const id=m.id;
  return`<div class="meal-item" style="cursor:pointer;" onclick="startEditMeal(${id})"><div class="meal-item-left"><div class="meal-item-name">${m.name}</div><div class="meal-item-detail">${time} · ${n} ingredient${n!==1?'s':''}</div></div><div class="meal-item-kcal">${Math.round(m.totals.kcal)} kcal</div><button class="meal-delete-btn" onclick="event.stopPropagation();deleteMealFromHome(${id})" aria-label="Delete meal" title="Delete">×</button></div>`;
}
function getRecentIngredientsForSection(section){
  const log=getLog();
  const names=new Set();
  Object.values(log).forEach(day=>{
    (day.meals||[]).forEach(m=>{
      if(homeMealSectionKey(m)===section){
        (m.ingredients||[]).forEach(i=>{if(i.name)names.add(i.name.toLowerCase().trim());});
      }
    });
  });
  return(typeof getRecentIngredients==='function'?getRecentIngredients():[])
    .filter(r=>names.has((r.name||'').toLowerCase().trim()))
    .slice(0,6);
}
function startLogWithRecentIngredientByName(name,section){
  const r=(typeof getRecentIngredients==='function'?getRecentIngredients():[]).find(x=>x.name===name);
  if(r) startLogWithRecentIngredient(r,section);
}
function logUsualMealByIndex(section,idx){
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  if(!u||!u.ingredients||!u.ingredients.length) return;
  const log=getLog();
  const date=selectedLogDate||localDateStr();
  const mealSection=section||u.section||getDefaultQuickAddSection(date);
  const ingredients=u.ingredients.map((ing,i)=>({...ing,id:Date.now()+i}));
  const mt=sumMacros(ingredients);
  const mealObj={
    id:Date.now(),
    name:u.name,
    time:new Date().toISOString(),
    section:mealSection,
    ingredients,
    totals:{kcal:Math.round(mt.kcal),protein:Math.round(mt.protein*10)/10,carbs:Math.round(mt.carbs*10)/10,fat:Math.round(mt.fat*10)/10,fibre:Math.round(mt.fibre*10)/10}
  };
  if(!log[date]) log[date]={meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  log[date].meals.push(mealObj);
  log[date].totals=sumMacros(log[date].meals.map(m=>m.totals));
  saveLog(log);
  if(typeof updateUsualMeals==='function') updateUsualMeals(mealObj,u.name);
  if(typeof addToRecentIngredients==='function') ingredients.forEach(i=>addToRecentIngredients(i));
  showToast(`${u.name} · ${Math.round(mt.kcal)} kcal saved`,2500);
  renderHome();
}

let _usualMenuSection=null,_usualMenuIdx=null;
function openUsualMealMenu(section,idx){
  _usualMenuSection=section; _usualMenuIdx=idx;
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  const el=document.getElementById('usual-meal-menu-title');
  if(el&&u) el.textContent=u.name;
  document.getElementById('usual-meal-menu-modal')?.classList.add('show');
}
function closeUsualMealMenu(){
  document.getElementById('usual-meal-menu-modal')?.classList.remove('show');
  _usualMenuSection=null; _usualMenuIdx=null;
}
function doRenameUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  closeUsualMealMenu();
  if(!u) return;
  const newName=window.prompt('New name for this usual meal:',u.name);
  if(newName&&newName.trim()&&newName.trim()!==u.name){
    renameUsualMeal(section,idx,newName.trim());
    renderHome();
  }
}
function doRemoveUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  closeUsualMealMenu();
  removeUsualMeal(section,idx);
  renderHome();
}
function doEditCopyUsualMeal(){
  const section=_usualMenuSection,idx=_usualMenuIdx;
  closeUsualMealMenu();
  editCopyUsualMeal(section,idx);
}
function editCopyUsualMeal(section,idx){
  const usuals=typeof getUsualMealsForSection==='function'?getUsualMealsForSection(section):[];
  const u=usuals[idx];
  if(!u||!u.ingredients||!u.ingredients.length) return;
  currentEditMealId=null; currentEditMealDate=null;
  switchTab('log',{fresh:true,silent:true,section:u.section||section,quick:true});
  addMealToCurrent(u);
}

function renderHomeMealSections(meals){
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const jsEsc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const buckets={breakfast:[],lunch:[],dinner:[],snacks:[],supplements:[]};
  meals.forEach(m=>{
    const sk=homeMealSectionKey(m);
    (buckets[sk]||buckets.snacks).push(m);
  });
  Object.keys(buckets).forEach(k=>buckets[k].sort((a,b)=>new Date(a.time)-new Date(b.time)));
  return HOME_MEAL_SECTIONS.map(({key,label})=>{
    const arr=buckets[key];
    const inner=arr.length?arr.map(homeMealRowHtml).join(''):'<div class="home-meal-empty">Nothing logged yet</div>';
    const hasLogged=hasMealForSectionOnSelectedDate(key,meals);

    let quickBlocks='';
    if(!hasLogged){
      // 1. Usual meals grid (up to 3)
      const usuals=(typeof getUsualMealsForSection==='function'?getUsualMealsForSection(key):(usualsBySection[key]||[])).slice(0,3);
      if(usuals.length){
        const cards=usuals.map((u,i)=>{
          const span=usuals.length===3&&i===2?' style="grid-column:1/-1;min-height:auto;"':'';
          const cls=i===0?'usual-card most-used':'usual-card';
          const mt=sumMacros(u.ingredients||[]);
          const kcal=Math.round(mt.kcal||0);
          const ingCount=(u.ingredients||[]).length;
          return`<div role="button" tabindex="0" class="${cls}"${span} onclick="logUsualMealByIndex('${key}',${i})"><div class="usual-card-name">${esc(u.name)}</div><div class="usual-card-meta">${ingCount} ingredient${ingCount!==1?'s':''} · <span class="kcal">${kcal} kcal</span></div><button type="button" class="usual-card-menu-btn" onclick="event.stopPropagation();openUsualMealMenu('${jsEsc(key)}',${i})" aria-label="Manage usual meal">⋯</button></div>`;
        }).join('');
        quickBlocks+=`<div class="usuals-grid">${cards}</div>`;
      }

      // 2. Repeat last meal
      const last=getLastMealBySection(key);
      if(last){
        const nm=esc((last.name||'').trim()||'Unnamed meal');
        quickBlocks+=`<div class="home-section-repeat-card" onclick="repeatLastMealForSection('${key}')"><div class="home-section-repeat-row"><div class="home-section-last-meal">↻ Yesterday: <strong>${nm}</strong></div><i class="ti ti-chevron-right repeat-chevron"></i></div></div>`;
      }

      // 3. Per-section recent ingredient chips
      const sectionRecent=getRecentIngredientsForSection(key);
      if(sectionRecent.length){
        const chips=sectionRecent.map(r=>`<button type="button" class="recent-chip" onclick="startLogWithRecentIngredientByName('${jsEsc(r.name)}','${key}')">${esc(r.name)}</button>`).join('');
        quickBlocks+=`<div class="recent-chips">${chips}</div>`;
      }
    }

    const loggedBlock=`<div class="home-meal-logged-block"><div class="home-meal-logged-hint">Logged</div>${inner}</div>`;
    return`<div class="home-meal-section"><div class="home-meal-section-header"><div class="home-meal-section-title">${label}</div><button type="button" class="home-meal-section-add" onclick="startLogWithSection('${key}')">+ Add</button></div>${quickBlocks}${loggedBlock}</div>`;
  }).join('');
}

function ensureHomeRecentIngredientsMount(){
  let el=document.getElementById('home-recent-ingredients');
  if(el) return el;
  const label=document.getElementById('home-meals-label');
  if(!label||!label.parentNode) return null;
  el=document.createElement('div');
  el.id='home-recent-ingredients';
  label.parentNode.insertBefore(el, label);
  return el;
}
function renderHomeRecentIngredients(){
  // Recent ingredients are now rendered per-section inside renderHomeMealSections
  const mount=ensureHomeRecentIngredientsMount();
  if(mount){mount.innerHTML='';mount.style.display='none';}
}

function renderHome(){
  updateDateNav();
  const profile=getProfile();
  const log=getLog();
  const dayData=log[selectedLogDate]||{meals:[],totals:{kcal:0,protein:0,carbs:0,fat:0,fibre:0}};
  const t=dayData.totals||{kcal:0,protein:0,carbs:0,fat:0,fibre:0};
  const h=new Date().getHours();
  document.getElementById('home-greeting').textContent=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  document.getElementById('home-name').innerHTML='Hello, <em>'+(profile.name||'chef')+'</em>';
  const hasProfile=!!(profile.targetKcal||profile.name);
  document.getElementById('no-profile-banner').style.display=hasProfile?'none':'block';
  const streak=calcStreak();
  const sEl=document.getElementById('home-streak');
  if(streak>0){sEl.style.display='block';document.getElementById('home-streak-text').textContent=`🔥 ${streak} day streak`;}
  else sEl.style.display='none';
  const kcal=Math.round(t.kcal||0);
  document.getElementById('home-kcal').textContent=kcal.toLocaleString();
  const tk=profile.targetKcal||null;
  document.getElementById('home-kcal-goal').textContent=tk?`of ${tk.toLocaleString()} kcal goal`:'Set up profile for targets';
  const CIRC=213.628,pct=tk?Math.min(1,kcal/tk):0;
  document.getElementById('kcal-ring-fill').style.strokeDashoffset=CIRC*(1-pct);
  document.getElementById('kcal-ring-pct').textContent=Math.round(pct*100)+'%';
  [['protein',t.protein||0,profile.targetProtein],['carbs',t.carbs||0,profile.targetCarbs],['fat',t.fat||0,profile.targetFat]].forEach(([id,val,tgt])=>{
    const v=Math.round(val),p=tgt?Math.min(100,Math.round(v/tgt*100)):0;
    document.getElementById('bar-'+id).style.width=p+'%';
    document.getElementById('val-'+id).textContent=tgt?`${v} / ${tgt}g`:`${v}g`;
  });
  const meals=dayData.meals||[];
  const listEl=document.getElementById('home-meals-list');
  listEl.innerHTML=renderHomeMealSections(meals);
  renderHomeRecentIngredients();
}

function homeLogWeight(){
  const inp=document.getElementById('home-bw-input');
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
  recalcTDEE();
  renderHome();
  showToast('Weight logged + targets updated ✓');
}

function startCookingLog(){ currentEditMealId=null; currentEditMealDate=null; switchTab('log',{fresh:true}); }
function startLogWithSection(key){ currentEditMealId=null; currentEditMealDate=null; switchTab('log',{fresh:true,silent:true,section:key}); }
function startLogWithRecentIngredient(recent, section=null){
  currentEditMealId=null; currentEditMealDate=null;
  const logDateKey=selectedLogDate;
  const resolvedSection=(section!=null&&section!=='')?section:getDefaultQuickAddSection(logDateKey);
  switchTab('log',{fresh:true,silent:true,section:resolvedSection,quick:true});
  if(typeof addIngredientFromRecent==='function') addIngredientFromRecent(recent);
}
function repeatLastMealForSection(section){
  currentEditMealId=null; currentEditMealDate=null;
  switchTab('log',{fresh:true,silent:true,section,quick:true});
  addMealToCurrent(getLastMealBySection(section));
}
function addMealToCurrent(sourceMeal){
  if(!sourceMeal||!sourceMeal.ingredients||!sourceMeal.ingredients.length) return;
  snapshotMeal();
  sourceMeal.ingredients.forEach(ing=>{
    meal.push({...ing,id:nextIngId++});
  });
  currentMealSection=sourceMeal.section||currentMealSection;
  if(typeof _persistDraft==='function') _persistDraft();
  renderCurrentMeal();
}

function deleteMealFromHome(id){
  const log=getLog();
  const day=log[selectedLogDate];
  if(!day) return;
  day.meals=day.meals.filter(m=>m.id!==id);
  day.totals=sumMacros(day.meals.map(m=>m.totals));
  saveLog(log);
  renderHome();
}

function startEditMeal(id){
  const log=getLog();
  const day=log[selectedLogDate];
  if(!day) return;
  const m=day.meals.find(m=>m.id===id);
  if(!m) return;
  currentEditMealId=id;
  currentEditMealDate=selectedLogDate;
  switchTab('log',{fresh:true,silent:true,section:m.section});
  addMealToCurrent(m);
}

// ═══════════════════════════════════════════
// HOME UPDATER (called from speech.js)
// ═══════════════════════════════════════════
function updateHome(){ if(currentTab==='home') renderHome(); }

// ═══════════════════════════════════════════
// PWA — MANIFEST + SERVICE WORKER
// ═══════════════════════════════════════════
function initPWA(){
  // Inject inline manifest via blob URL (enables Add to Home Screen / install prompt)
  const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="%23533ab7"/><text x="256" y="360" font-size="300" text-anchor="middle" fill="%23fff" font-family="sans-serif">🍴</text></svg>`;
  const manifest={
    name:'Sous — Voice Calorie Counter',
    short_name:'Sous',
    description:'Track meals with your voice',
    start_url:location.href,
    display:'standalone',
    background_color:'#f4f2ee',
    theme_color:'#533ab7',
    orientation:'portrait-primary',
    categories:['health','fitness'],
    icons:[
      {src:`data:image/svg+xml,${icon}`,sizes:'512x512',type:'image/svg+xml',purpose:'any'},
      {src:`data:image/svg+xml,${icon}`,sizes:'512x512',type:'image/svg+xml',purpose:'maskable'}
    ]
  };
  try{
    const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('link');
    link.rel='manifest'; link.href=url;
    document.head.appendChild(link);
  }catch(e){}

  // Service worker — caches this page for offline use
  if('serviceWorker' in navigator){
    const swSrc=`
const CACHE='sous-v1';
const PAGE='${location.href}';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([PAGE])).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(caches.match(PAGE).then(r=>r||fetch(e.request)).catch(()=>caches.match(PAGE)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    if(res&&res.status===200&&e.request.method==='GET'){
      const clone=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,clone));
    }
    return res;
  })));
});`;
    try{
      const swBlob=new Blob([swSrc],{type:'text/javascript'});
      const swUrl=URL.createObjectURL(swBlob);
      navigator.serviceWorker.register(swUrl,{scope:'/'}).catch(()=>{
        // blob-URL SW scope fallback — still registers, limited scope
        navigator.serviceWorker.register(swUrl).catch(()=>{});
      });
    }catch(e){}
  }
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function initDateNav(){
  document.getElementById('date-prev').addEventListener('click',()=>shiftDate(-1));
  document.getElementById('date-next').addEventListener('click',()=>shiftDate(1));
  document.getElementById('date-label').addEventListener('click',()=>{
    const picker=document.getElementById('date-picker');
    picker.value=selectedLogDate;
    try{ picker.showPicker(); } catch(e){ picker.click(); }
  });
  document.getElementById('date-picker').addEventListener('change',e=>{
    if(e.target.value){
      selectedLogDate=e.target.value;
      renderHome();
    }
  });
}

function init(){
  updateClock(); setInterval(updateClock,10000);
  initDateNav();
  renderHome();
  wireLogButtons();
  initProfile();
  renderRecipeList();
  initPWA();
  if(window.speechSynthesis){window.speechSynthesis.onvoiceschanged=()=>window.speechSynthesis.getVoices();window.speechSynthesis.getVoices();}
}
init();
