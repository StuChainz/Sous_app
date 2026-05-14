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
    if(opts.fresh){ if(typeof startFreshLog==='function') startFreshLog(opts.section||null); }
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
function homeMealRowHtml(m){
  const time=new Date(m.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const n=m.ingredients?m.ingredients.length:0;
  return`<div class="meal-item"><div class="meal-item-left"><div class="meal-item-name">${m.name}</div><div class="meal-item-detail">${time} · ${n} ingredient${n!==1?'s':''}</div></div><div class="meal-item-kcal">${Math.round(m.totals.kcal)} kcal</div></div>`;
}
function renderHomeMealSections(meals){
  const buckets={breakfast:[],lunch:[],dinner:[],snacks:[],supplements:[]};
  meals.forEach(m=>{
    const sk=homeMealSectionKey(m);
    (buckets[sk]||buckets.snacks).push(m);
  });
  Object.keys(buckets).forEach(k=>buckets[k].sort((a,b)=>new Date(a.time)-new Date(b.time)));
  return HOME_MEAL_SECTIONS.map(({key,label},i)=>{
    const arr=buckets[key];
    const inner=arr.length?arr.map(homeMealRowHtml).join(''):'<div class="meal-item-detail" style="padding:6px 4px 14px;">Nothing logged yet</div>';
    const mb=i<HOME_MEAL_SECTIONS.length-1?'16px':'0';
    return`<div style="margin-bottom:${mb}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div class="section-label" style="margin-bottom:0;">${label}</div><button onclick="startLogWithSection('${key}')" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:2px 0;">+ Add</button></div>${inner}</div>`;
  }).join('');
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

function startCookingLog(){ switchTab('log',{fresh:true}); }
function startLogWithSection(key){ switchTab('log',{fresh:true,section:key}); }

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
