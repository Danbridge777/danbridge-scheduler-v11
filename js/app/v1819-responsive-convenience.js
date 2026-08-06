/* Danbridge Scheduler V18.19 — responsive convenience enhancements only. */
(function(){
  'use strict';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const memoryKey='danbridge_ui_filter_memory_v1819';
  const filterIds=['calendarMode','calendarDate','calendarTeacherFilter','calendarLocationFilter','calendarStudentFilter','calendarRoomFilter','calendarStateFilter','calendarSearch','lessonMonth','filterStudent','filterTeacher','teacherKpiMonth','teacherKpiBranch','financeMonth','financeBranchScope','settleMonth','settlementBranchScope','summerRegistrationMonth'];
  const emptyTargets={studentRows:'目前沒有學生資料',lessonRows:'目前篩選條件沒有課程紀錄',makeupRows:'目前沒有符合條件的補課紀錄',studentSettleRows:'本月沒有學生收款資料',teacherSettleRows:'本月沒有老師薪資資料',settlementHistoryRows:'目前沒有結算紀錄',fixedExpenseRows:'目前沒有固定支出',oneTimeExpenseRows:'目前沒有一次性支出'};

  function readMemory(){try{return JSON.parse(localStorage.getItem(memoryKey)||'{}')}catch{return{}}}
  function saveMemory(){const values=readMemory();filterIds.forEach(id=>{const el=document.getElementById(id);if(el)values[id]=el.value});try{localStorage.setItem(memoryKey,JSON.stringify(values))}catch{}}
  function restoreMemory(){
    const values=readMemory();
    filterIds.forEach(id=>{
      const el=document.getElementById(id),value=values[id];
      if(!el||value===undefined||value===null)return;
      if(el.tagName==='SELECT'&&!Array.from(el.options).some(option=>option.value===value))return;
      el.value=value;
    });
  }
  function installFilterMemory(){
    restoreMemory();
    document.addEventListener('change',event=>{if(filterIds.includes(event.target?.id))saveMemory()},true);
    document.addEventListener('input',event=>{if(filterIds.includes(event.target?.id))saveMemory()},true);
    let attempts=0;const timer=setInterval(()=>{restoreMemory();if(++attempts>=12)clearInterval(timer)},250);
  }

  function installDayFocus(){
    const canvas=$('#calendarCanvas');if(!canvas)return;
    canvas.addEventListener('click',event=>{
      if($('#calendarMode')?.value!=='month'||event.target.closest('.lesson,.day-add'))return;
      const header=event.target.closest('.day-num'),cell=header?.closest('.day-cell');if(!cell)return;
      event.stopPropagation();
      const opening=!cell.classList.contains('v1819-day-focus');
      $$('.day-cell.v1819-day-focus',canvas).forEach(day=>day.classList.remove('v1819-day-focus'));
      if(opening){cell.classList.add('v1819-day-focus');cell.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'})}
    },true);
  }

  function decorateScrollableTables(){
    $$('.table-wrap').forEach(wrap=>{const table=$('table',wrap);if(table)wrap.classList.toggle('v1819-sticky-first-column',table.scrollWidth>wrap.clientWidth+2)});
  }

  function decorateMobileCalendarDates(){
    $$('#calendarCanvas .month-grid .day-cell').forEach(cell=>{
      const header=$('.day-num',cell),parts=String(cell.dataset.date||'').split('-').map(Number);
      if(!header||parts.length!==3||parts.some(Number.isNaN))return;
      const date=new Date(parts[0],parts[1]-1,parts[2]);
      header.dataset.mobileDateLabel=`${parts[1]}月${parts[2]}日・星期${['日','一','二','三','四','五','六'][date.getDay()]}`;
    });
  }

  function updateEmptyStates(){
    Object.entries(emptyTargets).forEach(([id,label])=>{
      const body=document.getElementById(id),wrap=body?.closest('.table-wrap');if(!body||!wrap)return;
      let empty=$(':scope > .v1819-empty-state',wrap);
      const isEmpty=!body.children.length;
      if(isEmpty&&!empty){empty=document.createElement('div');empty.className='v1819-empty-state';empty.textContent=label;wrap.append(empty)}
      if(empty)empty.hidden=!isEmpty;
    });
  }

  function makeActionBar(modalId,selectors){
    const modal=document.querySelector(`#${modalId} > .modal`);if(!modal||$('.v1819-modal-actions',modal))return;
    const buttons=selectors.map(selector=>$(selector,modal)).filter(Boolean);if(!buttons.length)return;
    const bar=document.createElement('div');bar.className='v1819-modal-actions';buttons[0].before(bar);buttons.forEach(button=>bar.append(button));
  }
  function installModalActions(){
    makeActionBar('lessonModal',['button[onclick="saveLesson()"]','#modalDeleteBtn']);
    makeActionBar('teacherReportModal',['#startClassFocusBtn','#quickCompleteTeacherReportBtn','#saveTeacherReportBtn','#cancelTeacherReportBtn']);
    makeActionBar('batchModal',['button[onclick="previewBatch()"]','button[onclick="applyBatch()"]']);
    const lineActions=$('#v181LineBillingPreview .v181-line-preview-actions');if(lineActions)lineActions.classList.add('v1819-modal-actions');
  }

  function installBackToTop(){
    if($('#v1819BackToTop'))return;
    const button=document.createElement('button');button.id='v1819BackToTop';button.className='v1819-back-to-top';button.type='button';button.setAttribute('aria-label','回到頁面頂端');button.textContent='↑';
    button.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));document.body.append(button);
    const update=()=>button.classList.toggle('show',window.scrollY>520);window.addEventListener('scroll',update,{passive:true});update();
  }

  function observeDynamicUi(){
    let queued=false;const refresh=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateScrollableTables();decorateMobileCalendarDates();updateEmptyStates();installModalActions()})};
    new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',refresh,{passive:true});refresh();
  }
  function init(){installFilterMemory();installDayFocus();installBackToTop();observeDynamicUi()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
