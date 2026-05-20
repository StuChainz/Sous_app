// Lightweight first-launch tour. Keep this isolated from logging and voice state.
(function(){
  const STORAGE_KEY='sous_onboarding_seen';
  let index=0;
  let overlay;
  let cards=[];
  let dotsWrap;
  let backBtn;
  let nextBtn;
  let skipBtn;
  let previousFocus=null;

  function setSeen(){
    try{localStorage.setItem(STORAGE_KEY,'1');}catch(e){}
  }

  function hasSeen(){
    try{return localStorage.getItem(STORAGE_KEY)==='1';}catch(e){return true;}
  }

  function render(){
    if(!overlay||!cards.length) return;
    cards.forEach((card,i)=>card.classList.toggle('active',i===index));
    dotsWrap.innerHTML=cards.map((_,i)=>`<span class="onboarding-dot${i===index?' active':''}"></span>`).join('');
    backBtn.disabled=index===0;
    nextBtn.textContent=index===cards.length-1?'Start logging':'Next';
    nextBtn.setAttribute('aria-label',index===cards.length-1?'Start logging':'Next onboarding card');
  }

  function show(){
    if(!overlay) return;
    previousFocus=document.activeElement;
    index=0;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    render();
    setTimeout(()=>nextBtn?.focus(),0);
  }

  function hide({markSeen=true}={}){
    if(!overlay) return;
    if(markSeen) setSeen();
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    if(previousFocus&&typeof previousFocus.focus==='function') previousFocus.focus();
  }

  function next(){
    if(index>=cards.length-1){
      hide();
      return;
    }
    index+=1;
    render();
  }

  function back(){
    if(index<=0) return;
    index-=1;
    render();
  }

  function onKeydown(event){
    if(!overlay?.classList.contains('show')) return;
    if(event.key==='Escape') hide();
    if(event.key==='ArrowRight') next();
    if(event.key==='ArrowLeft') back();
  }

  function initOnboarding(){
    overlay=document.getElementById('onboarding-overlay');
    if(!overlay) return;
    cards=[...overlay.querySelectorAll('[data-onboarding-card]')];
    dotsWrap=document.getElementById('onboarding-dots');
    backBtn=document.getElementById('onboarding-back');
    nextBtn=document.getElementById('onboarding-next');
    skipBtn=document.getElementById('onboarding-skip');

    backBtn?.addEventListener('click',back);
    nextBtn?.addEventListener('click',next);
    skipBtn?.addEventListener('click',()=>hide());
    document.addEventListener('keydown',onKeydown);

    window.__sousShowOnboarding=show;
    render();
    if(!hasSeen()) show();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initOnboarding);
  else initOnboarding();
})();
