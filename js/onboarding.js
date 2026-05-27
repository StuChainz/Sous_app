// First-run onboarding. Profile setup stays in localStorage; logging uses the real flow.
(function(){
  const STORAGE_KEY='sous_onboarding_seen';
  const EXAMPLE='2 eggs and toast';
  let index=0;
  let overlay;
  let cards=[];
  let dotsWrap;
  let backBtn;
  let nextBtn;
  let skipBtn;
  let coach;
  let previousFocus=null;
  let guideActive=false;
  let guideStep='profile';
  let guideEdited=false;
  let guideStartLogCount=0;
  let guideTimer=null;
  let featureOnly=false;

  function setSeen(){
    try{localStorage.setItem(STORAGE_KEY,'1');}catch(e){}
  }

  function hasSeen(){
    try{return localStorage.getItem(STORAGE_KEY)==='1';}catch(e){return true;}
  }

  function readProfile(){
    try{return typeof getProfile==='function'?getProfile():JSON.parse(localStorage.getItem('sous_profile')||'{}')||{};}catch(e){return{};}
  }

  function latestWeightKg(profile){
    try{
      const weights=typeof getWeights==='function'?getWeights():JSON.parse(localStorage.getItem('sous_weights')||'[]');
      if(Array.isArray(weights)&&weights.length){
        const latest=[...weights].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-1)[0];
        if(latest&&latest.kg) return Number(latest.kg);
      }
    }catch(e){}
    return Number(profile.currentWeight)||null;
  }

  function populateProfileForm(){
    const profile=readProfile();
    const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!=null&&value!=='') el.value=String(value);};
    set('onboarding-age',profile.age||'');
    set('onboarding-sex',profile.sex||'male');
    set('onboarding-height',profile.height?Math.round(Number(profile.height)*10)/10:'');
    const weight=latestWeightKg(profile);
    set('onboarding-weight',weight?Math.round(weight*10)/10:'');
    set('onboarding-goal',profile.goal||'maintain');
  }

  function saveProfileSetup(){
    const profile=readProfile();
    const age=parseFloat(document.getElementById('onboarding-age')?.value)||profile.age||null;
    const height=parseFloat(document.getElementById('onboarding-height')?.value)||profile.height||null;
    const weight=parseFloat(document.getElementById('onboarding-weight')?.value)||latestWeightKg(profile)||null;
    const sex=document.getElementById('onboarding-sex')?.value||profile.sex||'male';
    const goal=document.getElementById('onboarding-goal')?.value||profile.goal||'maintain';
    const next={
      ...profile,
      age,
      sex,
      height,
      goal,
      activity:profile.activity||1.55,
      heightUnit:profile.heightUnit||'cm',
      weightUnit:profile.weightUnit||'kg'
    };
    if(weight) next.currentWeight=weight;
    try{
      if(typeof saveProfile==='function') saveProfile(next);
      else localStorage.setItem('sous_profile',JSON.stringify(next));
      if(weight&&typeof upsertTodayWeight==='function') upsertTodayWeight(weight);
      if(typeof loadProfileData==='function') loadProfileData();
      if(typeof profState==='object'&&profState){
        const targets={
          targetKcal:profState.targetKcal||next.targetKcal||null,
          targetProtein:profState.targetProtein||next.targetProtein||null,
          targetCarbs:profState.targetCarbs||next.targetCarbs||null,
          targetFat:profState.targetFat||next.targetFat||null,
          currentWeight:profState.currentWeight||next.currentWeight||null
        };
        if(typeof saveProfile==='function') saveProfile({...getProfile(),...targets});
      }
      if(typeof renderHome==='function') renderHome();
    }catch(e){}
  }

  function mealLogCount(){
    try{
      const log=typeof getLog==='function'?getLog():JSON.parse(localStorage.getItem('sous_log')||'{}');
      return Object.values(log||{}).reduce((sum,day)=>sum+(Array.isArray(day?.meals)?day.meals.length:0),0);
    }catch(e){return 0;}
  }

  function activeLogScreen(){
    return document.querySelector('.log-screen.active')?.id||'';
  }

  function currentMealCount(){
    return document.querySelectorAll('#current-meal-list .capture-row,#ing-list .ing-item').length;
  }

  function clearHighlights(){
    document.querySelectorAll('.onboarding-highlight').forEach(el=>el.classList.remove('onboarding-highlight'));
  }

  function highlight(selectors){
    clearHighlights();
    selectors.forEach(selector=>{
      document.querySelector(selector)?.classList.add('onboarding-highlight');
    });
  }

  function setCoach(title,text,selectors=[],actions=[]){
    if(!coach) return;
    document.getElementById('onboarding-coach-title').textContent=title;
    document.getElementById('onboarding-coach-text').textContent=text;
    const actionWrap=document.getElementById('onboarding-coach-actions');
    actionWrap.innerHTML='';
    actions.forEach(action=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=action.primary?'btn-primary':'btn-secondary';
      btn.textContent=action.label;
      btn.addEventListener('click',action.handler);
      actionWrap.appendChild(btn);
    });
    coach.classList.add('show');
    highlight(selectors);
  }

  function hideCoach(){
    if(coach) coach.classList.remove('show');
    clearHighlights();
  }

  function submitExample(){
    const input=document.getElementById('text-input');
    if(input) input.value=EXAMPLE;
    document.getElementById('send-btn')?.click();
  }

  function completeOnboarding(){
    setSeen();
    guideActive=false;
    if(guideTimer){clearInterval(guideTimer);guideTimer=null;}
    hideCoach();
    hideOverlay({markSeen:false});
  }

  function skipAll(){
    setSeen();
    guideActive=false;
    if(guideTimer){clearInterval(guideTimer);guideTimer=null;}
    hideCoach();
    hideOverlay({markSeen:false});
  }

  function renderCoach(){
    if(!guideActive) return;
    const screen=activeLogScreen();
    if(screen==='ls-multi-confirm'){
      setCoach('Review ingredients','Use the real review step, then add them to the meal.',['#mc-list','#mc-add-btn'],[
        {label:'Add to meal',primary:true,handler:()=>document.getElementById('mc-add-btn')?.click()},
        {label:'Skip',handler:skipAll}
      ]);
      return;
    }
    if(screen==='ls-confirm'){
      setCoach('Confirm first','Check the item before it joins the meal.',['#confirm-btn'],[
        {label:'Confirm add',primary:true,handler:()=>document.getElementById('confirm-btn')?.click()},
        {label:'Skip',handler:skipAll}
      ]);
      return;
    }
    if(screen==='ls-quantity'){
      setCoach('Choose amount','Use the suggested amount or type your own.',['#qty-input','#qty-default-btn'],[
        {label:'Use default',primary:true,handler:()=>document.getElementById('qty-default-btn')?.click()},
        {label:'Skip',handler:skipAll}
      ]);
      return;
    }
    if(guideStep==='log'){
      setCoach('Hold to speak','Try "'+EXAMPLE+'" or type it below.',['#mic-btn','#text-input'],[
        {label:'Use typed example',primary:true,handler:submitExample},
        {label:'Skip',handler:skipAll}
      ]);
      return;
    }
    if(guideStep==='review-edit'){
      setCoach('Tap to edit','Change one quantity, then review the meal.',['#current-meal-list','#finished-meal-btn'],[
        {label:'Review meal',primary:true,handler:()=>document.getElementById('finished-meal-btn')?.click()},
        {label:'Skip',handler:skipAll}
      ]);
      return;
    }
    if(guideStep==='save'){
      setCoach('Review before save','Everything is editable here. Save when it looks right.',['#ing-list','#save-meal-btn'],[
        {label:'Save meal',primary:true,handler:()=>document.getElementById('save-meal-btn')?.click()},
        {label:'Skip',handler:skipAll}
      ]);
    }
  }

  function monitorGuide(){
    if(!guideActive) return;
    const screen=activeLogScreen();
    if(guideStep==='log'&&currentMealCount()>0) guideStep='review-edit';
    if(guideStep==='review-edit'&&screen==='ls-summary') guideStep='save';
    if(guideStep==='review-edit'&&guideEdited) guideStep='save';
    if(guideStep==='save'&&mealLogCount()>guideStartLogCount){
      showFeatures();
      return;
    }
    renderCoach();
  }

  function startGuidedLog(){
    hideOverlay({markSeen:false});
    guideActive=true;
    guideStep='log';
    guideEdited=false;
    guideStartLogCount=mealLogCount();
    if(typeof switchTab==='function') switchTab('log',{fresh:true,silent:true});
    if(guideTimer) clearInterval(guideTimer);
    guideTimer=setInterval(monitorGuide,450);
    setTimeout(monitorGuide,150);
  }

  function render(){
    if(!overlay||!cards.length) return;
    cards.forEach((card,i)=>card.classList.toggle('active',i===index));
    dotsWrap.innerHTML=cards.map((_,i)=>`<span class="onboarding-dot${i===index?' active':''}"></span>`).join('');
    backBtn.disabled=index===0||featureOnly;
    nextBtn.textContent=index===0?'Start first log':'Got it';
    nextBtn.setAttribute('aria-label',index===0?'Start first log':'Got it');
  }

  function show(){
    if(!overlay) return;
    previousFocus=document.activeElement;
    featureOnly=false;
    index=0;
    populateProfileForm();
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    render();
    setTimeout(()=>document.getElementById('onboarding-age')?.focus(),0);
  }

  function showFeatures(){
    guideActive=false;
    if(guideTimer){clearInterval(guideTimer);guideTimer=null;}
    hideCoach();
    previousFocus=document.activeElement;
    featureOnly=true;
    index=1;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    render();
    setTimeout(()=>nextBtn?.focus(),0);
  }

  function hideOverlay({markSeen=true}={}){
    if(!overlay) return;
    if(markSeen) setSeen();
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    if(previousFocus&&typeof previousFocus.focus==='function') previousFocus.focus();
  }

  function next(){
    if(index===0){
      saveProfileSetup();
      startGuidedLog();
      return;
    }
    completeOnboarding();
  }

  function back(){
    if(index<=0||featureOnly) return;
    index-=1;
    render();
  }

  function onKeydown(event){
    if(!overlay?.classList.contains('show')) return;
    if(event.key==='Escape') skipAll();
    if(event.key==='ArrowRight') next();
    if(event.key==='ArrowLeft') back();
  }

  function initOnboarding(){
    overlay=document.getElementById('onboarding-overlay');
    coach=document.getElementById('onboarding-coach');
    if(!overlay) return;
    cards=[...overlay.querySelectorAll('[data-onboarding-card]')];
    dotsWrap=document.getElementById('onboarding-dots');
    backBtn=document.getElementById('onboarding-back');
    nextBtn=document.getElementById('onboarding-next');
    skipBtn=document.getElementById('onboarding-skip');

    backBtn?.addEventListener('click',back);
    nextBtn?.addEventListener('click',next);
    skipBtn?.addEventListener('click',skipAll);
    document.addEventListener('keydown',onKeydown);
    document.getElementById('edit-save-btn')?.addEventListener('click',()=>{if(guideActive) guideEdited=true;setTimeout(monitorGuide,350);});

    window.__sousShowOnboarding=show;
    window.__sousStartGuidedOnboarding=startGuidedLog;
    window.__sousOnboardingState=()=>({seen:hasSeen(),guideActive,guideStep,guideEdited,featureOnly,index});
    render();
    if(!hasSeen()) show();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initOnboarding);
  else initOnboarding();
})();
