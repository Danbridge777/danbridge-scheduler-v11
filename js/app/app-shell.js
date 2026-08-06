/* V15.19 App Shell: navigation and initial defaults. */
function switchTab(id){const role=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'',allowed=role==='teacher'?new Set(['dashboard','calendar','lessons']):role==='branch_manager'?new Set(['dashboard','students','teachers','calendar','lessons','makeups','settlement','finance']):null;if(allowed&&!allowed.has(id))id='dashboard';if(id!=='calendar')cancelSelectionForNewAction();document.body.dataset.activeSection=id;document.querySelectorAll('section').forEach(s=>s.classList.toggle('active',s.id===id));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));if(id==='calendar')renderCalendar();if(id==='finance')renderFinance();if(role==='teacher'&&matchMedia('(max-width:1100px)').matches)window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}
function ensureCalendarDefaults(){const date=$('calendarDate');if(date&&!date.value)date.value=todayStr()}
function setDefaults(){ensureCalendarDefaults();if(!$('lessonMonth').value)$('lessonMonth').value=monthNow();renderSettlementMonthOptions();if(!$('settleMonth').value)$('settleMonth').value='2026-07'}

document.querySelectorAll('nav button').forEach(button=>{
  button.onclick=()=>switchTab(button.dataset.tab);
});
