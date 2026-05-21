(function(){
  const htmlEscapes={
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  };

  function safeText(value){
    return value==null?'':String(value);
  }

  function escapeHtml(value){
    return safeText(value).replace(/[&<>"']/g,ch=>htmlEscapes[ch]);
  }

  function safeJsonParse(value,fallback){
    try{
      if(value==null||value==='')return fallback;
      const parsed=JSON.parse(value);
      return parsed===undefined?fallback:parsed;
    }catch(e){
      return fallback;
    }
  }

  function localDateKey(date=new Date()){
    const d=date instanceof Date?date:new Date(date);
    if(Number.isNaN(d.getTime())){
      const now=new Date();
      return localDateKey(now);
    }
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function clampNumber(value,min,max,fallback=min){
    const n=Number(value);
    if(!Number.isFinite(n))return fallback;
    return Math.min(max,Math.max(min,n));
  }

  window.safeText=window.safeText||safeText;
  window.escapeHtml=window.escapeHtml||escapeHtml;
  window.safeJsonParse=window.safeJsonParse||safeJsonParse;
  window.localDateKey=window.localDateKey||localDateKey;
  window.clampNumber=window.clampNumber||clampNumber;
})();
