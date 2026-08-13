/* V15.19 App Shell: navigation and initial defaults. */
function switchTab(id){const role=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'',allowed=role==='teacher'?new Set(['dashboard','calendar','lessons']):role==='branch_manager'?new Set(['dashboard','students','teachers','calendar','lessons','makeups','settlement','finance']):null;if(allowed&&!allowed.has(id))id='dashboard';if(id==='calendar'){const mode=$('calendarMode'),date=$('calendarDate');if(mode)mode.value='month';if(date)date.value=todayStr()}if(id!=='calendar')cancelSelectionForNewAction();document.body.dataset.activeSection=id;document.querySelectorAll('section').forEach(s=>s.classList.toggle('active',s.id===id));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));if(id==='calendar')renderCalendar();else if(id==='dashboard')renderDashboard();else if(id==='lessons')requestAnimationFrame(()=>setTimeout(()=>{if(document.body.dataset.activeSection==='lessons')renderLessons()},0));else if(id==='finance')renderFinance();if(role==='teacher'&&matchMedia('(max-width:1100px)').matches)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}
function ensureCalendarDefaults(){const date=$('calendarDate');if(date&&!date.value)date.value=todayStr()}
function setDefaults(){ensureCalendarDefaults();if(!$('lessonMonth').value)$('lessonMonth').value=monthNow();renderSettlementMonthOptions();if(!$('settleMonth').value)$('settleMonth').value='2026-07'}

function installNavigationHandlers(){
  const navigation=document.querySelector('nav');
  if(!navigation||navigation.dataset.tabHandlerInstalled==='true')return;
  navigation.dataset.tabHandlerInstalled='true';
  navigation.addEventListener('click',event=>{
    const button=event.target.closest('button[data-tab]');
    if(button) switchTab(button.dataset.tab);
  },true);
}
window.installNavigationHandlers=installNavigationHandlers;
installNavigationHandlers();
