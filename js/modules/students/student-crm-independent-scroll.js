(function(){
  'use strict';

  const SECTION_ID='students';
  const MIN_WIDTH=1041;
  const BOTTOM_GAP=18;
  let frame=0;

  function updateStudentCrmViewport(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const section=document.getElementById(SECTION_ID);
      if(!section)return;
      if(!section.classList.contains('active')||window.innerWidth<MIN_WIDTH){
        section.style.removeProperty('--student-crm-viewport-height');
        return;
      }
      const top=Math.max(0,section.getBoundingClientRect().top);
      const viewportHeight=window.visualViewport?.height||window.innerHeight;
      const available=Math.max(520,Math.floor(viewportHeight-top-BOTTOM_GAP));
      section.style.setProperty('--student-crm-viewport-height',`${available}px`);
    });
  }

  function init(){
    const section=document.getElementById(SECTION_ID);
    if(!section)return;

    new MutationObserver(updateStudentCrmViewport).observe(section,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',updateStudentCrmViewport,{passive:true});
    window.addEventListener('orientationchange',updateStudentCrmViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',updateStudentCrmViewport,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateStudentCrmViewport()});
    updateStudentCrmViewport();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
