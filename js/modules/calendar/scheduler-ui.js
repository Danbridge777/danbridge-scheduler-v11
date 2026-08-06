/**
 * Danbridge Scheduler V15.6 — Calendar UI module
 * Extracted without changing existing global function names or behavior.
 * Contains calendar rendering, selection, clipboard, keyboard and drag handlers.
 */

function calendarFilterState(){return{teacher:$('calendarTeacherFilter')?.value||'',location:$('calendarLocationFilter')?.value||'',student:$('calendarStudentFilter')?.value||'',room:$('calendarRoomFilter')?.value||'',state:$('calendarStateFilter')?.value||'',search:($('calendarSearch')?.value||'').trim().toLowerCase()}}
function lessonMatchesCalendar(l,f=calendarFilterState()){if(f.teacher&&!lessonTeacherIds(l).includes(f.teacher))return false;if(f.location&&locationLabel(l)!==f.location)return false;if(f.student&&l.studentId!==f.student)return false;if(f.room&&(l.room||'')!==f.room)return false;if(f.state&&(l.lessonState||(l.isDraft?'draft':'active'))!==f.state)return false;if(f.search){const hay=[l.date,l.start,l.end,l.title,l.room,l.location,l.address,l.status,student(l.studentId).name,student(l.studentId).parent,lessonTeacherNames(l),effectiveCampId(l)].join(' ').toLowerCase();if(!hay.includes(f.search))return false}return true}
function lessonHoverText(l){const s=student(l.studentId),teacherView=(window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)==='teacher',parent=!teacherView&&s.parent?`\n家長：${s.parent}`:'',contact=!teacherView&&s.contact?`\n聯絡：${s.contact}`:'',addr=l.location==='到府'&&l.address?`\n地址：${l.address}`:'',payment=teacherView?'':`\n付款：${l.paymentStatus==='paid'?'已繳':l.paymentStatus==='waived'?'免收':'未繳'}`;return `${l.date} ${l.start}–${l.end}\n學生／班級：${s.name||'未命名'}${parent}${contact}\n老師：${lessonTeacherNames(l)||'未指定'}\n課程：${l.title||'未命名'}\n地點：${locationLabel(l)} ${l.room||''}${addr}\n狀態：${l.status||''}${payment}\n備註：${l.note||'—'}`}
function visibleCalendarRange(){const mode=$('calendarMode').value,d=new Date(($('calendarDate').value||todayStr())+'T00:00:00');if(mode==='week'){const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));const sun=new Date(mon);sun.setDate(mon.getDate()+6);return{start:localDate(mon),end:localDate(sun),days:7}}const start=new Date(d.getFullYear(),d.getMonth(),1),end=new Date(d.getFullYear(),d.getMonth()+1,0);return{start:localDate(start),end:localDate(end),days:end.getDate()}}
function teacherGapWeekRange(){
  const base=new Date(($('calendarDate')?.value||todayStr())+'T00:00:00'),monday=new Date(base),day=base.getDay();
  monday.setDate(base.getDate()+(day===0?1:-((day+6)%7)));
  const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  return{start:localDate(monday),end:localDate(sunday)};
}
function renderCalendarAnalysis(){
  const box=$('calendarAnalysis');if(!box)return;
  const currentRole=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'';
  if(currentRole==='teacher'){box.replaceChildren();box.hidden=true;return}
  box.hidden=false;
  const r=visibleCalendarRange(),gapRange=teacherGapWeekRange(),f=calendarFilterState();
  const ls=db.lessons.filter(l=>l.date>=r.start&&l.date<=r.end&&lessonMatchesCalendar(l,f)&&!['取消','停課'].includes(l.status));
  const gapLessons=db.lessons.filter(l=>l.date>=gapRange.start&&l.date<=gapRange.end&&lessonMatchesCalendar(l,f)&&!['取消','停課'].includes(l.status));
  const rooms=[...new Set(ls.map(l=>l.room).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  const available=Math.max(1,r.days*14*60);
  const roomRows=rooms.map(room=>{const mins=ls.filter(l=>l.room===room&&l.location!=='線上課').reduce((a,l)=>a+Math.max(0,minutesOf(l.end)-minutesOf(l.start)),0),pct=Math.min(100,mins/available*100);return{room,mins,pct}}).sort((a,b)=>b.mins-a.mins);
  const gapRows=[];
  for(const t of db.teachers){
    for(let d=new Date(gapRange.start+'T00:00:00'),end=new Date(gapRange.end+'T00:00:00');d<=end;d.setDate(d.getDate()+1)){
      const ds=localDate(d),arr=gapLessons.filter(l=>l.date===ds&&lessonTeacherIds(l).includes(t.id)).sort((a,b)=>a.start.localeCompare(b.start));
      for(let i=0;i<arr.length-1;i++){const gap=minutesOf(arr[i+1].start)-minutesOf(arr[i].end);if(gap>=30)gapRows.push({teacher:t.name,date:ds,start:arr[i].end,end:arr[i+1].start,gap})}
    }
  }
  gapRows.sort((a,b)=>b.gap-a.gap||a.date.localeCompare(b.date));
  box.innerHTML=`<div class="analysis-panel"><h3>教室使用率</h3><div class="small">以目前顯示範圍 08:00–22:00 計算。</div>${roomRows.length?`<table class="analysis-table"><thead><tr><th>教室</th><th>使用時數</th><th>使用率</th></tr></thead><tbody>${roomRows.map(x=>`<tr><td><b>${esc(x.room)}</b></td><td>${fmtHours(x.mins/60)} hr</td><td>${x.pct.toFixed(1)}%<div class="usage-bar"><span style="width:${x.pct}%"></span></div></td></tr>`).join('')}</tbody></table>`:'<div class="small" style="padding:10px 0">目前範圍沒有已指定教室的課程。</div>'}</div><div class="analysis-panel"><h3>老師空堂分析</h3><div class="small">${gapRange.start}～${gapRange.end}；只列出同一天兩堂課之間至少 30 分鐘的空檔。基準日為週日時改算下一週。</div><div class="gap-list">${gapRows.length?gapRows.slice(0,100).map(x=>`<div class="gap-item"><b>${esc(x.teacher)}</b>｜${x.date}｜${x.start}–${x.end}<span class="pill red" style="margin-left:6px">${fmtHours(x.gap/60)} hr</span></div>`).join(''):'<div class="small">本週沒有符合條件的空堂。</div>'}</div></div>`;
}
function renderCalendar(){ensureCalendarDefaults();const mode=$('calendarMode').value,date=new Date($('calendarDate').value+'T00:00:00'),f=calendarFilterState();if(mode==='month')renderMonth(date,f);else renderWeek(date,f);renderCalendarAnalysis();setTimeout(enableDesktopMarquee,0)}
function updateSelectionCount(){
  const count=selectedLessonIds.size;
  const bar=$('selectionBar'),label=$('selectionCount'),btn=$('selectionModeBtn');
  if(label)label.textContent=`已選 ${count} 堂`;
  if(bar)bar.classList.toggle('hidden',!selectionMode&&!count);
  if(btn)btn.textContent=(selectionMode||count)?'多選中':'部分選取';
}
function clearCalendarSelectionState(){
  selectedLessonIds.clear();selectionMode=false;dragState=null;
  updateSelectionCount();
  document.querySelectorAll('#calendarCanvas .selected,#calendarCanvas .marquee-hit,#calendarCanvas .dragging,#calendarCanvas .drop-target').forEach(element=>element.classList.remove('selected','marquee-hit','dragging','drop-target'));
  window.DanbridgeCalendarInteractions?.refresh?.();
}
function toggleSelectionMode(force){
  selectionMode=typeof force==='boolean'?force:!selectionMode;
  if(!selectionMode)selectedLessonIds.clear();
  updateSelectionCount();
  renderCalendar();
}
function toggleLessonSelection(id){
  if(!id)return;
  selectionMode=true;
  if(selectedLessonIds.has(id))selectedLessonIds.delete(id);else selectedLessonIds.add(id);
  updateSelectionCount();
  renderCalendar();
}
function selectVisibleLessons(){
  selectionMode=true;
  document.querySelectorAll('#calendarCanvas [data-id]').forEach(el=>selectedLessonIds.add(el.dataset.id));
  updateSelectionCount();
  renderCalendar();
}
function clearLessonSelection(){
  selectedLessonIds.clear();
  selectionMode=false;
  updateSelectionCount();
  renderCalendar();
}
function copySelectedLessons(){
  const source=db.lessons.filter(l=>selectedLessonIds.has(l.id)&&!['取消','停課'].includes(l.status));
  if(!source.length)return alert('請先框選或按住 Control／Command 點選要複製的課程。');
  const monthKeys=[...new Set(source.map(l=>l.date.slice(0,7)))];
  if(monthKeys.length!==1)return alert('請只選取同一個月份的課程後再複製到下個月。');
  const fromMonth=monthKeys[0];
  const [y,m]=fromMonth.split('-').map(Number),toMonth=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}`;
  if(!confirm(`確定將已選取的 ${source.length} 堂課複製到 ${toMonth}？\n原課程會保留。`))return;
  snapshot();
  const keys=new Set(db.lessons.map(keyOf));let added=0,skipped=0;
  for(const old of source){
    const candidate={...old,id:createLessonId(),date:mapDateByCalendarWeek(old.date,fromMonth,toMonth),status:'未上課',paymentStatus:'unpaid',teacherIds:[...lessonTeacherIds(old)]};
    if(keys.has(keyOf(candidate))||conflictDetail(candidate,'')){skipped++;continue}
    db.lessons.push(candidate);keys.add(keyOf(candidate));logChange('複製選取到下個月',candidate,old);added++;
  }
  selectedLessonIds.clear();selectionMode=false;saveDB();
  alert(`已複製 ${added} 堂到 ${toMonth}${skipped?`，略過 ${skipped} 堂重複或撞課課程`:''}。`);
}
function deleteSelectedLessons(){
  const ids=[...selectedLessonIds];
  if(!ids.length)return alert('請先選取要刪除的課程。');
  if(!confirm(`確定刪除已選取的 ${ids.length} 堂課？`))return;
  snapshot();
  const idSet=new Set(ids),removed=db.lessons.filter(l=>idSet.has(l.id));
  removed.forEach(l=>{window.syncMakeupForDeletedLesson?.(l);logChange('刪除選取課程',null,l)});
  db.lessons=db.lessons.filter(l=>!idSet.has(l.id));
  selectedLessonIds.clear();selectionMode=false;saveDB();toast(`已刪除 ${removed.length} 堂課`);
}
function cancelSelectionAndPaste(clearClipboard=false){
  selectedLessonIds.clear();
  selectionMode=false;
  const bar=$('selectionBar'),btn=$('selectionModeBtn');
  bar?.classList.add('hidden');
  if(btn)btn.textContent='部分選取';
  updateSelectionCount();
  cancelPasteClickMode(clearClipboard);
}
function cancelSelectionForNewAction(){
  if(selectionMode||selectedLessonIds.size||pasteClickMode){
    cancelSelectionAndPaste(false);
  }
}
function calendarActionChanged(){
  cancelSelectionForNewAction();
  renderCalendar();
}
function calendarTeacherTargetChanged(){
  const targetId=$('calendarTeacherFilter')?.value||'';
  if(!pasteClickMode){calendarActionChanged();return}
  selectedLessonIds.clear();selectionMode=false;updateSelectionCount();renderCalendar();
  const msg=$('pasteModeMessage'),target=teacher(targetId);
  if(msg)msg.textContent=targetId?`📋 貼到老師：${target.name||'未命名老師'}`:`📋 保留原老師貼上`;
}
function cellClick(e,d){
  if(e.target.closest('.lesson,button'))return;
  if(pasteClickMode){
    contextPasteTarget={date:d,time:''};
    contextPasteLessons();
    return;
  }
  if(selectionMode||selectedLessonIds.size){
    cancelSelectionAndPaste(false);
    renderCalendar();
  }
}
function weekCellClick(e,d,t){
  if(e.target.closest('.week-event,button'))return;
  if(pasteClickMode){
    contextPasteTarget={date:d,time:t};
    contextPasteLessons();
    return;
  }
  if(selectionMode||selectedLessonIds.size){
    cancelSelectionAndPaste(false);
    renderCalendar();
  }
}
function showCalendarContextMenu(x,y,target){contextPasteTarget=target||null;const m=$('calendarContextMenu');if(!m)return;m.classList.add('show');const gap=12,rect=m.getBoundingClientRect();m.style.left=Math.max(gap,Math.min(x,window.innerWidth-rect.width-gap))+'px';m.style.top=Math.max(gap,Math.min(y,window.innerHeight-rect.height-gap))+'px'}
function hideCalendarContextMenu(){$('calendarContextMenu')?.classList.remove('show')}
function setPasteHoverTarget(el){
  document.querySelectorAll('#calendarCanvas .paste-click-target').forEach(x=>x.classList.remove('paste-click-target'));
  if(pasteClickMode&&el)el.classList.add('paste-click-target');
}
function beginPasteClickMode(count){
  pasteClickMode=true;
  document.body.classList.add('lesson-paste-mode');
  const banner=$('pasteModeBanner'),msg=$('pasteModeMessage');
  if(msg)msg.textContent=`📋 已複製 ${count} 堂課`;
  banner?.classList.add('show');
}
function cancelPasteClickMode(clearClipboard=false){
  pasteClickMode=false;
  document.body.classList.remove('lesson-paste-mode');
  $('pasteModeBanner')?.classList.remove('show');
  document.querySelectorAll('#calendarCanvas .paste-click-target').forEach(x=>x.classList.remove('paste-click-target'));
  contextPasteTarget=null;
  if(clearClipboard){
    lessonClipboard=[];
    try{localStorage.removeItem('danbridge_lesson_clipboard')}catch{}
  }
}
function copyCurrentSelection(){
  const rows=db.lessons.filter(l=>selectedLessonIds.has(l.id));
  if(!rows.length)return false;
  /* 每次複製都完全覆蓋舊剪貼簿，第一次 Ctrl+C 也直接生效。 */
  lessonClipboard=[];
  try{localStorage.removeItem('danbridge_lesson_clipboard')}catch{}
  lessonClipboard=rows.map(l=>JSON.parse(JSON.stringify(l))).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  try{localStorage.setItem('danbridge_lesson_clipboard',JSON.stringify(lessonClipboard))}catch{}
  lastSelectionCopyAt=Date.now();
  /* 複製完成後立刻離開多選；剪貼簿保留，下一個動作可直接貼上或拖曳。 */
  selectedLessonIds.clear();
  selectionMode=false;
  updateSelectionCount();
  document.querySelectorAll('#calendarCanvas [data-id]').forEach(el=>{
    el.classList.remove('selected','marquee-hit');
    el.setAttribute('draggable','true');
  });
  beginPasteClickMode(lessonClipboard.length);
  return true;
}
function contextCopyLessons(){
  if(!copyCurrentSelection()){hideCalendarContextMenu();return alert('請先框選或點選要複製的課程。')}
  hideCalendarContextMenu();
}
function getLessonClipboard(){if(lessonClipboard.length)return lessonClipboard;try{return JSON.parse(localStorage.getItem('danbridge_lesson_clipboard')||'[]')}catch{return[]}}
function exitSelectionAfterPaste(){selectedLessonIds.clear();selectionMode=false;const bar=$('selectionBar'),btn=$('selectionModeBtn');bar?.classList.add('hidden');if(btn)btn.textContent='部分選取';updateSelectionCount()}
function contextPasteLessons(){
  const rows=getLessonClipboard();
  if(!rows.length){hideCalendarContextMenu();return alert('目前沒有已複製的課程。')}
  if(!contextPasteTarget?.date){hideCalendarContextMenu();return alert('請先把滑鼠移到要貼上的日期格或時間格，再按 Ctrl+V。')}
  // 以最早選取課程作為錨點：點哪一天，第一筆就貼到哪一天；
  // 其餘課程保留與第一筆之間的實際天數差，避免整批多偏一天。
  const first=rows[0];
  const dateDelta=Math.round((new Date(contextPasteTarget.date+'T00:00:00')-new Date(first.date+'T00:00:00'))/86400000);
  let timeDelta=0;
  if(contextPasteTarget.time){
    const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};
    timeDelta=toMin(contextPasteTarget.time)-toMin(first.start);
  }
  snapshot();
  const keys=new Set(db.lessons.map(keyOf));
  const targetTeacherId=$('calendarTeacherFilter')?.value||'';
  let added=0,skipped=0,teacherWarnings=0;
  for(const old of rows){
    const targetDateStr=shiftDate(old.date,dateDelta);
    const ns=shiftTime(old.start,timeDelta),ne=shiftTime(old.end,timeDelta);
    if(!ns||!ne){skipped++;continue}
    const targetTeacherIds=targetTeacherId?[targetTeacherId]:[...lessonTeacherIds(old)];
    const n={...old,id:createLessonId(),date:targetDateStr,start:ns,end:ne,status:'未上課',paymentStatus:'unpaid',teacherId:targetTeacherIds[0]||'',teacherIds:targetTeacherIds};
    if(keys.has(keyOf(n))||conflictDetail(n,'')){skipped++;continue}
    if(teacherConflictDetail(n,''))teacherWarnings++;
    db.lessons.push(n);keys.add(keyOf(n));logChange('依日期間距貼上課程',n,old);added++;
  }
  hideCalendarContextMenu();exitSelectionAfterPaste();cancelPasteClickMode(true);saveDB();
  const targetLabel=targetTeacherId?`給 ${teacher(targetTeacherId).name||'目標老師'}`:'';
  toast(`已${targetLabel}貼上 ${added} 堂，略過 ${skipped} 堂${teacherWarnings?`，老師重疊 ${teacherWarnings} 堂已標紅`:''}`)
}
function enableDesktopMarquee(){const canvas=$('calendarCanvas');if(!canvas||canvas.dataset.marqueeBound==='1')return;canvas.dataset.marqueeBound='1';canvas.addEventListener('mousemove',e=>{const cell=e.target.closest('[data-date]');if(cell){contextPasteTarget={date:cell.dataset.date||'',time:cell.dataset.time||''};setPasteHoverTarget(cell)}else if(pasteClickMode)setPasteHoverTarget(null)});canvas.addEventListener('mouseleave',()=>{if(pasteClickMode)setPasteHoverTarget(null)});canvas.addEventListener('contextmenu',e=>{e.preventDefault();const item=e.target.closest('[data-id]');if(item&&!selectedLessonIds.has(item.dataset.id)){selectedLessonIds.clear();selectedLessonIds.add(item.dataset.id);selectionMode=true;updateSelectionCount();renderCalendar();setTimeout(()=>showCalendarContextMenu(e.clientX,e.clientY,{date:e.target.closest('[data-date]')?.dataset.date||db.lessons.find(l=>l.id===item.dataset.id)?.date,time:e.target.closest('[data-time]')?.dataset.time||''}),0);return}const cell=e.target.closest('[data-date]');showCalendarContextMenu(e.clientX,e.clientY,{date:cell?.dataset.date||'',time:cell?.dataset.time||''})});canvas.addEventListener('mousedown',e=>{if(pasteClickMode)return;if(e.button!==0||e.target.closest('[data-id],button,input,select'))return;const rect=canvas.getBoundingClientRect();marqueeState={x:e.clientX,y:e.clientY,moved:false};selectionMode=true;$('selectionModeBtn').textContent='多選中';canvas.classList.add('marquee-active');const box=$('marqueeBox');box.style.left=e.clientX+'px';box.style.top=e.clientY+'px';box.style.width='0';box.style.height='0';box.style.display='block';e.preventDefault()});window.addEventListener('mousemove',e=>{if(!marqueeState)return;const x=Math.min(marqueeState.x,e.clientX),y=Math.min(marqueeState.y,e.clientY),w=Math.abs(e.clientX-marqueeState.x),h=Math.abs(e.clientY-marqueeState.y);if(w>4||h>4)marqueeState.moved=true;const box=$('marqueeBox');box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';const sel={left:x,top:y,right:x+w,bottom:y+h};document.querySelectorAll('#calendarCanvas [data-id]').forEach(el=>{const r=el.getBoundingClientRect(),hit=!(r.right<sel.left||r.left>sel.right||r.bottom<sel.top||r.top>sel.bottom);el.classList.toggle('marquee-hit',hit)});});window.addEventListener('mouseup',()=>{if(!marqueeState)return;const hits=[...document.querySelectorAll('#calendarCanvas [data-id].marquee-hit')],wasMoved=marqueeState.moved;if(wasMoved){hits.forEach(el=>selectedLessonIds.add(el.dataset.id));updateSelectionCount()}document.querySelectorAll('.marquee-hit').forEach(el=>el.classList.remove('marquee-hit'));$('marqueeBox').style.display='none';canvas.classList.remove('marquee-active');marqueeState=null;if(wasMoved&&hits.length)renderCalendar();else if(!wasMoved&&(selectionMode||selectedLessonIds.size)){cancelSelectionAndPaste(false);renderCalendar()}})}
function resolveKeyboardPasteTarget(){
  if(contextPasteTarget?.date)return contextPasteTarget;
  const hovered=document.querySelector('#calendarCanvas [data-date]:hover');
  if(hovered)return{date:hovered.dataset.date||'',time:hovered.dataset.time||''};
  const focused=document.activeElement?.closest?.('[data-date]');
  if(focused)return{date:focused.dataset.date||'',time:focused.dataset.time||''};
  return null;
}
function handleCalendarShortcuts(e){
  const tag=(e.target?.tagName||'').toLowerCase();
  if(['input','textarea','select'].includes(tag)||e.target?.isContentEditable)return;
  if(e.key==='Escape'){
    if(pasteClickMode||selectionMode||selectedLessonIds.size){
      e.preventDefault();
      cancelSelectionAndPaste(false);
      renderCalendar();
      toast('已取消多選／貼上模式');
    }
    return;
  }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedLessonIds.size){
    e.preventDefault();
    deleteSelectedLessons();
    return;
  }
  const mod=e.ctrlKey||e.metaKey;
  if(!mod)return;
  const key=e.key.toLowerCase();
  if(key==='c'){
    if(!selectedLessonIds.size)return;
    e.preventDefault();
    e.stopPropagation();
    copyCurrentSelection();
    return;
  }
  if(key==='v'){
    const rows=getLessonClipboard();
    if(!rows.length)return;
    e.preventDefault();
    e.stopPropagation();
    const target=resolveKeyboardPasteTarget();
    if(!target?.date){
      beginPasteClickMode(rows.length);
      toast('請把滑鼠移到目標日期／時間，再按 Ctrl+V，或直接點一下貼上');
      return;
    }
    contextPasteTarget=target;
    contextPasteLessons();
  }
}
function attachDragHandlers(){
  const DRAG_HOLD_MS=550, MOVE_CANCEL_PX=12;
  const role=document.body.dataset.cloudRole||window.DanbridgeAccess?.getContext?.().role||window.currentCloudRole?.()||'';
  const canMove=!role||role==='owner';
  document.querySelectorAll('#calendarCanvas [data-id]').forEach(el=>{
    el.setAttribute('draggable',canMove&&!selectionMode?'true':'false');
    let pointerId=null,startX=0,startY=0,dragStarted=false,suppressClick=false;
    let globalPointerCleanup=null;
    const removeGlobalPointerListeners=()=>{
      if(globalPointerCleanup){globalPointerCleanup();globalPointerCleanup=null}
    };
    const clearTouchDrag=()=>{
      clearTimeout(touchTimer);touchTimer=null;
      el.classList.remove('drag-arming');
      if(!dragStarted)el.classList.remove('dragging');
      document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
      if(!dragStarted){dragState=null;document.body.classList.remove('touch-drag-active')}
      removeGlobalPointerListeners();
    };
    el.addEventListener('click',e=>{
      e.stopPropagation();
      if(suppressClick){e.preventDefault();suppressClick=false;return}
      if(e.ctrlKey||e.metaKey){e.preventDefault();selectionMode=true;if($('selectionModeBtn'))$('selectionModeBtn').textContent='多選中';toggleLessonSelection(el.dataset.id);return}
      if(selectionMode){toggleLessonSelection(el.dataset.id);return}
      editLesson(el.dataset.id)
    });
    if(!canMove)return;
    /* 即使目前正在多選也先綁定；複製退出多選後不必重畫就能立刻拖曳。 */
    el.addEventListener('dragstart',e=>{if(selectionMode){e.preventDefault();return}dragState=el.dataset.id;el.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragState)});
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');dragState=null;document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'))});
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'||selectionMode)return;
      removeGlobalPointerListeners();
      pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;dragStarted=false;suppressClick=false;
      el.classList.add('drag-arming');
      touchTimer=setTimeout(()=>{
        dragStarted=true;suppressClick=true;dragState=el.dataset.id;
        try{el.setPointerCapture(pointerId)}catch{}
        el.classList.remove('drag-arming');el.classList.add('dragging');document.body.classList.add('touch-drag-active');
        if(navigator.vibrate)navigator.vibrate(18);
      },DRAG_HOLD_MS)
    },{passive:true});
    el.addEventListener('pointermove',e=>{
      if(pointerId!==e.pointerId)return;
      const moved=Math.hypot(e.clientX-startX,e.clientY-startY);
      if(!dragStarted&&moved>MOVE_CANCEL_PX){clearTouchDrag();pointerId=null;return}
      if(!dragStarted||!dragState)return;
      e.preventDefault();
      document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-date]');
      if(target)target.classList.add('drop-target')
    },{passive:false});
    const finishPointer=e=>{
      if(pointerId!==e.pointerId)return;
      clearTimeout(touchTimer);touchTimer=null;el.classList.remove('drag-arming');
      const wasDragging=dragStarted&&!!dragState;
      const target=wasDragging?document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-date]'):null;
      el.classList.remove('dragging');document.body.classList.remove('touch-drag-active');document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
      if(target)moveLessonTo(dragState,target.dataset.date,target.dataset.time);
      dragState=null;dragStarted=false;pointerId=null;
      removeGlobalPointerListeners();
    };
    const cancelPointer=e=>{
      if(pointerId!==e.pointerId)return;
      clearTimeout(touchTimer);touchTimer=null;
      el.classList.remove('drag-arming','dragging');
      document.body.classList.remove('touch-drag-active');
      document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
      dragState=null;dragStarted=false;pointerId=null;suppressClick=true;
      removeGlobalPointerListeners();
    };
    el.addEventListener('pointerup',finishPointer);
    el.addEventListener('pointercancel',cancelPointer);
    el.addEventListener('lostpointercapture',cancelPointer);
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'||selectionMode||pointerId!==e.pointerId)return;
      const onGlobalUp=event=>finishPointer(event);
      const onGlobalCancel=event=>cancelPointer(event);
      window.addEventListener('pointerup',onGlobalUp,true);
      window.addEventListener('pointercancel',onGlobalCancel,true);
      globalPointerCleanup=()=>{
        window.removeEventListener('pointerup',onGlobalUp,true);
        window.removeEventListener('pointercancel',onGlobalCancel,true);
      };
    },{passive:true});
  });
  /* 放下區永遠註冊；拖曳中途若選取狀態改變也不會失去 drop。 */
  if(!canMove)return;
  document.querySelectorAll('#calendarCanvas [data-date]').forEach(c=>{
    c.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';c.classList.add('drop-target')});
    c.addEventListener('dragleave',()=>c.classList.remove('drop-target'));
    c.addEventListener('drop',e=>{e.preventDefault();c.classList.remove('drop-target');moveLessonTo(e.dataTransfer.getData('text/plain'),c.dataset.date,c.dataset.time)})
  })
}
