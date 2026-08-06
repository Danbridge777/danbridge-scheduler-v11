let draftMode=false,db=loadDB(),dragState=null,touchTimer=null,historyStack=[],redoStack=[],selectionMode=false,selectedLessonIds=new Set(),batchPreviewCache=null,lessonClipboard=[],contextPasteTarget=null,marqueeState=null,pasteClickMode=false;function snapshot(){const state=JSON.stringify(db);if(historyStack[historyStack.length-1]!==state)historyStack.push(state);if(historyStack.length>100)historyStack.shift();redoStack.length=0;updateUndoRedoButtons()}function toast(msg){const e=$('toast');e.textContent=msg;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1600)}function updateUndoRedoButtons(){const u=$('undoBtn'),r=$('redoBtn');if(u)u.disabled=!historyStack.length;if(r)r.disabled=!redoStack.length}function undoLast(){const x=historyStack.pop();if(!x)return toast('沒有可復原的操作');redoStack.push(JSON.stringify(db));if(redoStack.length>100)redoStack.shift();db=JSON.parse(x);selectedLessonIds.clear();selectionMode=false;saveDB();toast('已復原上一個操作')}function redoLast(){const x=redoStack.pop();if(!x)return toast('沒有可重做的操作');historyStack.push(JSON.stringify(db));if(historyStack.length>100)historyStack.shift();db=JSON.parse(x);selectedLessonIds.clear();selectionMode=false;saveDB();toast('已重做上一個操作')}function student(id){return db.students.find(x=>x.id===id)||{}}function teacher(id){return db.teachers.find(x=>x.id===id)||{}}function lessonTeacherIds(l){const ids=isGroupStudentId(l?.studentId)&&Array.isArray(l?.teacherIds)&&l.teacherIds.length?l.teacherIds:[l?.teacherId||(Array.isArray(l?.teacherIds)?l.teacherIds[0]:'')];return [...new Set(ids.filter(Boolean))]}function lessonTeacherNames(l){return lessonTeacherIds(l).map(id=>teacher(id).name).filter(Boolean).join('、')}function isGroupStudentId(id){return student(id).courseType==='團班'}function normalizeCampCode(v){return String(v||'').trim().replace(/\s+/g,'').toUpperCase()}function effectiveCampId(l){return normalizeCampCode(l?.campId)}function legacyCampAliases(l){return new Set([normalizeCampCode(l?.title),normalizeCampCode(student(l?.studentId).name)].filter(Boolean))}function sameCampIdentity(a,b){const ca=effectiveCampId(a),cb=effectiveCampId(b);if(ca&&cb)return ca===cb;if(ca&&!cb)return legacyCampAliases(b).has(ca);if(!ca&&cb)return legacyCampAliases(a).has(cb);return false}function sameCampSlot(a,b){
  const ca=effectiveCampId(a),cb=effectiveCampId(b);
  // 安全條件：至少一筆必須有明確營隊代碼，避免一般團班只因名稱碰巧相同而放行。
  if(!ca&&!cb)return false;
  // 舊版課程可能沒有正確保存 courseType，因此不再用學生類型阻擋。
  // 只要營隊代碼可由 campId、課程名稱或班級名稱辨識為相同，且日期與完整時段一致，
  // 就允許同一營隊的不同班共用老師。
  return sameCampIdentity(a,b)&&a.date===b.date&&a.start===b.start&&a.end===b.end;
}function syncCampField(){const wrap=$('lessonCampIdWrap');if(!wrap)return;const group=isGroupStudentId($('lessonStudent')?.value||'');wrap.classList.toggle('hidden',!group);if(!group&&$('lessonCampId'))$('lessonCampId').value=''}function handleLessonStudentChange(){if($('lessonDeliveryMode')?.value==='home'){const addr=student($('lessonStudent')?.value||'').homeAddress||'';if(addr&&!$('lessonAddress').value.trim())$('lessonAddress').value=addr}handleLocationChange();syncCoTeacherOptions();syncCampField()}function branchRecord(id){return (db.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).find(b=>b.id===id)}function renderLessonBranchOptions(){const el=$('lessonBranch');if(!el)return;const current=el.value,branches=(db.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).filter(b=>!['home_service','online','unassigned'].includes(b.id));el.innerHTML='<option value="">請選擇校區</option>'+branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');if(current)el.value=current}function handleBranchChange(){const branch=branchRecord($('lessonBranch')?.value||''),room=$('lessonRoom'),current=room?.value||'';if(room){const rooms=branch?.rooms||[];room.innerHTML='<option value="">未指定教室</option>'+rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')+(current&&!rooms.includes(current)?`<option value="${esc(current)}">${esc(current)}</option>`:'');room.value=current}$('lessonUnassignedWarning')?.classList.toggle('hidden',!!$('lessonBranch')?.value);handleLocationChange()}function locationBg(loc){return loc==='河西一路'?'#dbeafe':loc==='到府'?'#ffedd5':loc==='線上課'?'#ede9fe':'#dcfce7'}function locationLabel(l){const mode=window.DanbridgeAccess?.deliveryModeFromLesson?.(l)||'onsite',branch=window.DanbridgeAccess?.branchName?.(l.branchId)||l.location||'未歸屬校區';return mode==='home'?`${branch}・到府`:mode==='online'?`${branch}・線上`:branch}function handleLocationChange(){renderLessonBranchOptions();const mode=$('lessonDeliveryMode')?.value||'onsite',branch=branchRecord($('lessonBranch')?.value||'');$('lessonLocation').value=mode==='home'?'到府':mode==='online'?'線上課':(branch?.name||'');$('lessonRoomWrap')?.classList.toggle('hidden',mode!=='onsite');$('lessonAddressWrap').classList.toggle('hidden',mode!=='home');$('lessonOnlineWrap')?.classList.toggle('hidden',mode!=='online');if(mode==='home'&&!$('lessonAddress').value)$('lessonAddress').value=student($('lessonStudent').value).homeAddress||'';if(mode!=='onsite')$('lessonRoom').value='';if(mode!=='home')$('lessonAddress').value='';if(mode!=='online'){if($('lessonMeetingUrl'))$('lessonMeetingUrl').value=''}renderLessonMapLink()}function renderLessonMapLink(){const a=$('lessonAddress')?.value.trim()||'',box=$('lessonMapLinkWrap');if(!box)return;box.innerHTML=a?`<a class="map-link" href="${mapUrl(a)}" target="_blank" rel="noopener">📍 開啟 Google Maps</a>`:''}function logChange(type,lesson,before=null){const clone=v=>v==null?v:JSON.parse(JSON.stringify(v)),ctx=window.DanbridgeAccess?.getContext?.()||{},name=(document.body.dataset.cloudDisplayName||ctx.email||'目前使用者').trim();db.changes||=[];db.changes.unshift({id:uid(),at:new Date().toISOString(),type,lessonId:lesson?.id||before?.id||'',studentId:lesson?.studentId||before?.studentId||'',actorName:name,actorEmail:ctx.email||'',before:clone(before),after:clone(lesson),undone:false});db.changes=db.changes.slice(0,500)}



function toggleQuickStudent(show=true){const box=$('quickStudentBox');if(!box)return;box.classList.toggle('hidden',!show);if(show){$('quickStudentName').focus()}else{clearQuickStudentForm()}}function clearQuickStudentForm(){['quickStudentName','quickParentName','quickParentContact','quickHomeAddress','quickRate'].forEach(id=>{if($(id))$(id).value=''});if($('quickCourseType'))$('quickCourseType').value='1對1';if($('quickBilling'))$('quickBilling').value='hour';if($('v20QuickTeacher'))$('v20QuickTeacher').value='';if($('v20QuickBranch'))$('v20QuickBranch').selectedIndex=0;if($('v20QuickDuration'))$('v20QuickDuration').value='60'}function saveQuickStudent(){const role=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'';if(role!=='owner')return alert('目前帳號沒有新增學生的權限。');const name=$('quickStudentName').value.trim();if(!name)return alert('請輸入學生姓名');const duplicate=db.students.find(s=>String(s.name||'').trim().toLowerCase()===name.toLowerCase());if(duplicate&&!confirm(`已有「${name}」，仍要新增嗎？`)){$('lessonStudent').value=duplicate.id;toggleQuickStudent(false);handleLessonStudentChange();return}const branch=$('v20QuickBranch')?.value||'',duration=+$('v20QuickDuration')?.value||60;snapshot();const o=studentDefaults({id:uid(),name,parent:$('quickParentName').value.trim(),contact:$('quickParentContact').value.trim(),homeAddress:$('quickHomeAddress').value.trim(),courseType:$('quickCourseType').value,billing:$('quickBilling').value,rate:+$('quickRate').value||0,preferredTeacherId:$('v20QuickTeacher')?.value||'',branchIds:branch?[branch]:[],note:''});db.students.push(o);saveDB();renderSelects();$('lessonStudent').value=o.id;if(o.preferredTeacherId)$('lessonTeacher').value=o.preferredTeacherId;if(branch){$('lessonBranch').value=branch;handleBranchChange()}$('endTime').value=addMinutes($('startTime').value,duration);toggleQuickStudent(false);handleLessonStudentChange();window.realtimeConflicts?.();toast(`已新增並選取 ${o.name}`)}










window.ensureTeacherHoursMetric=function(){
 const summary=document.querySelector('#dashboard .summary');
 if(!summary)return;
 let metric=document.querySelector('#dashboard .teacher-hours-metric');
 if(!metric){
   metric=document.createElement('div');
   metric.className='metric teacher-hours-metric';
   metric.innerHTML='<span>本月即時時數</span><b id="mTeacherHours">0.0 小時</b><small>0 堂已完成</small>';
   const lessonMetric=document.getElementById('mLessons')?.closest('.metric');
   if(lessonMetric)lessonMetric.insertAdjacentElement('afterend',metric);else summary.appendChild(metric);
 }
 metric.style.setProperty('display',document.body.classList.contains('teacher-cloud-role')?'flex':'none','important');
};
const __originalRenderDashboardForHours=renderDashboard;
renderDashboard=function(){window.ensureTeacherHoursMetric?.();__originalRenderDashboardForHours();window.ensureTeacherHoursMetric?.();};
function renderMonth(date,f){const y=date.getFullYear(),m=date.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),offset=(first.getDay()+6)%7,total=Math.ceil((offset+last.getDate())/7)*7;let h='<div class="month-grid">'+['一','二','三','四','五','六','日'].map(x=>`<div class="day-head">週${x}</div>`).join('');for(let i=0;i<total;i++){const d=new Date(y,m,1-offset+i),ds=localDate(d),out=d.getMonth()!==m,ls=db.lessons.filter(l=>l.date===ds&&lessonMatchesCalendar(l,f)).sort((a,b)=>a.start.localeCompare(b.start));h+=`<div class="day-cell ${out?'out':''} ${ds===todayStr()?'today':''}" data-date="${ds}" onclick="cellClick(event,'${ds}')"><div class="day-num"><span>${d.getDate()}</span><button type="button" class="day-add" aria-label="在 ${ds} 新增課程" title="新增課程" onclick="event.stopPropagation();openLessonModal('${ds}')">＋</button></div>${ls.map(lessonCard).join('')}</div>`}h+='</div>';$('calendarCanvas').innerHTML=h;$('calendarTitle').textContent=`${y} 年 ${m+1} 月`;attachDragHandlers()}function lessonCard(l){const t=teacher(l.teacherId),s=student(l.studentId),sel=selectedLessonIds.has(l.id);return `<div class="lesson ${(l.lessonState==='draft'||l.isDraft)?'lesson-draft':''} ${sel?'selected':''} ${hasTeacherOverlap(l)?'teacher-overlap':''} ${calendarFilterState().search?'calendar-search-hit':''}" title="${esc(lessonHoverText(l))}" draggable="${selectionMode?'false':'true'}" data-id="${l.id}" style="--teacher:${t.color||'#2563eb'};--location-bg:${locationBg(l.location)}"><b>${l.isDraft?'<span class=\"draft-tag\">草稿</span> ':''}${l.start}–${l.end}｜${esc(s.name)}</b><span class="meta">${esc(lessonTeacherNames(l))}${effectiveCampId(l)?`｜營隊:${esc(effectiveCampId(l))}`:''}｜📍${esc(locationLabel(l))}${l.location==='到府'&&l.address?' '+esc(l.address):''}｜${esc(l.title||'')}｜${esc(l.room||'')}｜${l.paymentStatus==='paid'?'✓已繳':'未繳'}${hasTeacherOverlap(l)?`｜⚠老師重複：${esc(lessonTeacherConflictNames(l).join('、'))}`:''}</span>${l.teacherReportStatus?`<div class="lesson-report-summary"><span class="report-badge ${esc(l.teacherReportStatus)}">${esc(window.teacherReportLabel?.(l.teacherReportStatus)||l.teacherReportStatus)}</span>${l.teacherReportContent?`<br>內容：${esc(l.teacherReportContent)}`:''}${l.teacherReportHomework?`<br>作業：${esc(l.teacherReportHomework)}`:''}</div>`:''}</div>`}function renderMobileWeek(date,f){const day=date.getDay(),mon=new Date(date);mon.setDate(date.getDate()-((day+6)%7));const days=Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d}),role=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'';let h='<div class="mobile-week-agenda">';for(const d of days){const ds=localDate(d),ls=db.lessons.filter(l=>l.date===ds&&lessonMatchesCalendar(l,f)).sort((a,b)=>a.start.localeCompare(b.start));h+=`<section class="mobile-week-day ${ds===todayStr()?'today':''}"><header><div><b>${d.getMonth()+1}月${d.getDate()}日・星期${weekday(ds)}</b><span>${ls.length} 堂課</span></div>${role==='owner'?`<button type="button" class="btn mobile-week-add" onclick="openLessonModal('${ds}')">＋</button>`:''}</header><div class="mobile-week-lessons">${ls.length?ls.map(lessonCard).join(''):'<p>沒有課程</p>'}</div></section>`}h+='</div>';$('calendarCanvas').innerHTML=h;$('calendarTitle').textContent=`${localDate(days[0])} ～ ${localDate(days[6])}`;attachDragHandlers()}function renderWeek(date,f){if(matchMedia('(max-width:700px)').matches)return renderMobileWeek(date,f);const day=date.getDay(),mon=new Date(date);mon.setDate(date.getDate()-((day+6)%7));const days=Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d}),startHour=8,endHour=22,totalSlots=(endHour-startHour)*12;let h='<div class="week-grid"><div class="week-head" style="grid-column:1;grid-row:1">時間</div>'+days.map((d,i)=>`<div class="week-head" style="grid-column:${i+2};grid-row:1">${d.getMonth()+1}/${d.getDate()} 週${weekday(localDate(d))}</div>`).join('');for(let slot=0;slot<totalSlots;slot++){const totalMin=startHour*60+slot*5,hr=Math.floor(totalMin/60),min=totalMin%60,time=`${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}`,row=slot+2,isHour=min===0,isHalf=min===30,label=time;h+=`<div class="time-label ${isHour?'hour':isHalf?'half-hour':''}" style="grid-column:1;grid-row:${row}">${label}</div>`;for(let i=0;i<days.length;i++){const ds=localDate(days[i]),lineClass=isHour?'full-hour':isHalf?'half-hour':'';h+=`<div class="time-slot ${lineClass}" style="grid-column:${i+2};grid-row:${row}" data-date="${ds}" data-time="${time}" onclick="weekCellClick(event,'${ds}','${time}')"></div>`}}for(let i=0;i<days.length;i++){const ds=localDate(days[i]),ls=db.lessons.filter(l=>l.date===ds&&lessonMatchesCalendar(l,f)).sort((a,b)=>a.start.localeCompare(b.start));for(const l of ls){const [sh,sm]=l.start.split(':').map(Number),[eh,em]=l.end.split(':').map(Number),startMin=sh*60+sm,endMin=eh*60+em,clampedStart=Math.max(startHour*60,Math.min(endHour*60-5,startMin)),clampedEnd=Math.max(clampedStart+5,Math.min(endHour*60,endMin)),startSlot=Math.round((clampedStart-startHour*60)/5),span=Math.max(1,Math.round((clampedEnd-clampedStart)/5)),rowStart=startSlot+2,rowEnd=Math.min(totalSlots+2,rowStart+span);h+=`<div class="week-event ${(l.lessonState==='draft'||l.isDraft)?'lesson-draft':''} ${selectedLessonIds.has(l.id)?'selected':''} ${hasTeacherOverlap(l)?'teacher-overlap':''} ${calendarFilterState().search?'calendar-search-hit':''}" title="${esc(lessonHoverText(l))}" draggable="${selectionMode?'false':'true'}" data-id="${l.id}" style="grid-column:${i+2};grid-row:${rowStart}/${rowEnd};--teacher:${teacher(l.teacherId).color||'#2563eb'};--location-bg:${locationBg(l.location)}"><b>${l.isDraft?'<span class=\"draft-tag\">草稿</span> ':''}${l.start}–${l.end} ${esc(student(l.studentId).name)}</b><span class="week-event-meta">${esc(lessonTeacherNames(l))}${effectiveCampId(l)?`｜營隊:${esc(effectiveCampId(l))}`:''}｜📍${esc(locationLabel(l))}${hasTeacherOverlap(l)?`｜⚠${esc(lessonTeacherConflictNames(l).join('、'))}`:''}</span></div>`}}h+='</div>';$('calendarCanvas').innerHTML=h;$('calendarTitle').textContent=`${localDate(days[0])} ～ ${localDate(days[6])}｜每 5 分鐘一格`;attachDragHandlers()}
/* V13.11 restored calendar multi-selection controls */
function moveCalendar(n){cancelSelectionForNewAction();const d=new Date($('calendarDate').value+'T00:00:00');if($('calendarMode').value==='month')d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+7*n);$('calendarDate').value=localDate(d);renderCalendar()}
let lastSelectionCopyAt=0;
document.addEventListener('click',e=>{if(!e.target.closest('#calendarContextMenu'))hideCalendarContextMenu()});
document.addEventListener('change',e=>{if(!e.target.closest('#calendar .toolbar'))return;const id=e.target.id||'';if(['calendarMode','calendarDate','calendarTeacherFilter','calendarLocationFilter','calendarStudentFilter','calendarRoomFilter'].includes(id))cancelSelectionForNewAction()});
document.addEventListener('keydown',handleCalendarShortcuts,true);
document.addEventListener('copy',e=>{
  const tag=(e.target?.tagName||'').toLowerCase();
  if(['input','textarea','select'].includes(tag)||e.target?.isContentEditable||!selectedLessonIds.size)return;
  e.preventDefault();
  if(Date.now()-lastSelectionCopyAt>120)copyCurrentSelection();
});




























function weekMonday(dateStr){const d=new Date(dateStr+'T00:00:00'),day=d.getDay();d.setDate(d.getDate()-((day+6)%7));return d}
function copyVisibleWeekToNextWeek(){
  const selected=db.lessons.filter(l=>selectedLessonIds.has(l.id)&&!['取消','停課'].includes(l.status));
  let baseValue=$('calendarDate').value||todayStr();
  if(selected.length){
    const mondayKeys=[...new Set(selected.map(l=>localDate(weekMonday(l.date))))];
    if(mondayKeys.length>1)return alert('目前選取的課程跨越不同週，請只框選同一週後再複製。');
    baseValue=selected[0].date;
  }
  const monday=weekMonday(baseValue),sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  const nextMonday=new Date(monday);nextMonday.setDate(monday.getDate()+7);const nextSunday=new Date(sunday);nextSunday.setDate(sunday.getDate()+7);
  const from=localDate(monday),to=localDate(sunday),targetFrom=localDate(nextMonday),targetTo=localDate(nextSunday);
  const source=(selected.length?selected:db.lessons.filter(l=>l.date>=from&&l.date<=to&&!['取消','停課'].includes(l.status))).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  if(!source.length)return alert(`目前週（${from}～${to}）沒有可複製的課程。`);
  if(!confirm(`確定將${selected.length?'已選取的':'目前週的'} ${source.length} 堂課複製到下一週？\n\n${from}～${to}\n→ ${targetFrom}～${targetTo}\n\n原本課程會保留。`))return;
  snapshot();
  const existingKeys=new Set(db.lessons.map(keyOf));let added=0,duplicates=0,conflicts=0;const conflictRows=[];
  for(const lesson of source){const candidate={...lesson,id:createLessonId(),date:shiftDate(lesson.date,7),status:'未上課',paymentStatus:'unpaid',teacherIds:[...lessonTeacherIds(lesson)]};const key=keyOf(candidate);if(existingKeys.has(key)){duplicates++;continue}const conflict=conflictDetail(candidate,'');if(conflict){conflicts++;conflictRows.push(`${candidate.date} ${candidate.start}｜${student(candidate.studentId).name||candidate.title||'課程'}：${conflict.type}撞課 ${conflict.name||''}`);continue}const teacherWarning=teacherConflictDetail(candidate,'');if(teacherWarning)conflictRows.push(`${candidate.date} ${candidate.start}｜老師時間重複 ${teacherWarning.name}（已允許並標紅）`);db.lessons.push(candidate);existingKeys.add(key);logChange('複製目前顯示週到下一週',candidate,lesson);added++}
  clearCalendarSelectionState();cancelPasteClickMode(false);saveDB();if(added>0){$('calendarMode').value='week';$('calendarDate').value=targetFrom;renderCalendar()}
  let message=`已複製 ${added} 堂到下一週（${targetFrom}～${targetTo}）。${added>0?'\n畫面已自動切換，可再次複製到下下週。':''}`;if(duplicates)message+=`\n略過 ${duplicates} 堂完全重複課程。`;if(conflicts)message+=`\n略過 ${conflicts} 堂撞課。`;if(conflictRows.length)message+=`\n\n明細：\n${conflictRows.slice(0,10).join('\n')}${conflictRows.length>10?'\n……':''}`;alert(message)
}

function copyVisibleMonth(){const base=new Date($('calendarDate').value+'T00:00:00'),m=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`;copyMonth(m)}function copyMonth(m){
  snapshot();

  const [y,mo]=m.split('-').map(Number);
  const ny=mo===12?y+1:y;
  const nm=mo===12?1:mo+1;
  const nextM=`${ny}-${String(nm).padStart(2,'0')}`;

  const sourceLessons=db.lessons.filter(
    l=>l.date.startsWith(m)&&!['取消','停課'].includes(l.status)
  );

  // 完整防重複：同日期、時間、學生、老師、課名、教室皆相同就略過。
  const existingKeys=new Set(
    db.lessons
      .filter(l=>l.date.startsWith(nextM))
      .map(l=>[
        l.date,l.start,l.end,l.studentId,lessonTeacherIds(l).slice().sort().join(','),l.title||'',l.room||''
      ].join('|'))
  );

  let added=0;
  let skipped=0;

  for(const lesson of sourceLessons){
    // 依照月曆的「第幾週＋星期幾」對應到下個月。
    // 例如來源月第一週的星期二、星期三，會一起落在目標月第一週，
    // 不會因為分別加 28 天而被拆到不同週。
    const newDate=mapDateByCalendarWeek(lesson.date,m,nextM);
    if(!newDate){
      skipped++;
      continue;
    }
    const key=[
      newDate,lesson.start,lesson.end,lesson.studentId,
      lessonTeacherIds(lesson).slice().sort().join(','),lesson.title||'',lesson.room||''
    ].join('|');

    if(existingKeys.has(key)){
      skipped++;
      continue;
    }

    db.lessons.push({
      ...lesson,
      id:createLessonId(),
      date:newDate,
      status:'未上課',
      paymentStatus:'unpaid'
    });

    existingKeys.add(key);
    added++;
  }

  saveDB();
  alert(`已新增 ${added} 堂到 ${nextM}，跳過 ${skipped} 堂重複或無法對應的課程。`);
}




$('lessonModal').addEventListener('click',e=>{if(e.target===$('lessonModal'))closeLessonModal()});$('batchModal').addEventListener('click',e=>{if(e.target===$('batchModal'))closeBatchModal()});


ensureV81Migration();renderAll();
