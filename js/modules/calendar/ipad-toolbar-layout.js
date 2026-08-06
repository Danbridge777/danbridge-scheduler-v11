(function(){
  function isIPadLike(){
    return /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function applyCalendarToolbarLayout(){
    const toolbar=document.querySelector('#calendar .toolbar');
    if(!toolbar) return;
    const usable=toolbar.getBoundingClientRect().width;
    const shouldFix=isIPadLike() || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    toolbar.classList.toggle('ipad-real-width-fix', shouldFix && usable < 1280 && window.innerWidth > 700);
    toolbar.classList.toggle('ipad-real-width-narrow', shouldFix && usable < 760 && window.innerWidth > 700);
  }
  function init(){
    applyCalendarToolbarLayout();
    const toolbar=document.querySelector('#calendar .toolbar');
    if(toolbar && 'ResizeObserver' in window){
      new ResizeObserver(applyCalendarToolbarLayout).observe(toolbar);
    }
    window.addEventListener('resize',applyCalendarToolbarLayout,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(applyCalendarToolbarLayout,150),{passive:true});
    document.addEventListener('click',e=>{if(e.target.closest('[data-tab="calendar"]'))setTimeout(applyCalendarToolbarLayout,30)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
