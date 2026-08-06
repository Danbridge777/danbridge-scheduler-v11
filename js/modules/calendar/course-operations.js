/* Danbridge Scheduler V15.7 — Calendar Course Operations
   Extracted without changing data schema or runtime behavior. */

function openLessonModal(date=todayStr(),start='16:00',id=''){cancelSelectionForNewAction();renderSelects();renderLessonBranchOptions();clearLessonForm();toggleQuickStudent(false);$('lessonDate').value=date;$('startTime').value=start;$('endTime').value=addMinutes(start,60);if(id)fillLessonForm(id);$('lessonModal').classList.add('show');handleLocationChange();syncCampField()}

function closeLessonModal(){toggleQuickStudent(false);$('lessonModal').classList.remove('show')}

function clearLessonForm(){['lessonId','lessonTitle','lessonCampId','lessonAddress','lessonMeetingUrl','lessonNote'].forEach(id=>$(id).value='');$('lessonDate').value=todayStr();$('startTime').value='16:00';$('endTime').value='17:00';$('lessonState').value='active';$('lessonStatus').value='未上課';$('chargeStudent').value='yes';$('payTeacher').value='yes';$('paymentStatus').value='unpaid';$('lessonBranch').value='art_museum';$('lessonDeliveryMode').value='onsite';$('lessonOnlinePlatform').value='Google Meet';handleBranchChange();$('repeatMode').value='none';$('repeatUntil').value='';$('seriesScopeWrap').style.display='none';$('seriesScope').value='one';$('modalDeleteBtn').style.display='none';syncCoTeacherOptions()}

function fillLessonForm(id){const x=db.lessons.find(l=>l.id===id);if(!x)return;$('lessonId').value=x.id;$('lessonDate').value=x.date;$('startTime').value=x.start;$('endTime').value=x.end;$('lessonStudent').value=x.studentId;$('lessonTeacher').value=x.teacherId||lessonTeacherIds(x)[0]||'';$('lessonTitle').value=x.title||'';$('lessonCampId').value=x.campId||'';$('lessonBranch').value=x.branchId==='unassigned'?'':(x.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(x.location)||'art_museum');$('lessonDeliveryMode').value=window.DanbridgeAccess?.deliveryModeFromLesson?.(x)||'onsite';handleBranchChange();$('lessonRoom').value=x.room||'';$('lessonLocation').value=x.location||'';$('lessonAddress').value=x.address||'';$('lessonOnlinePlatform').value=x.onlinePlatform||'Google Meet';$('lessonMeetingUrl').value=x.meetingUrl||'';$('paymentStatus').value=x.paymentStatus||'unpaid';$('lessonState').value=x.lessonState||(x.isDraft?'draft':'active');$('lessonStatus').value=x.status==='草稿'?'未上課':(x.status||'未上課');$('chargeStudent').value=x.chargeStudent||'yes';$('payTeacher').value=x.payTeacher||'yes';$('lessonNote').value=x.note||'';$('seriesScopeWrap').style.display=x.seriesId?'block':'none';$('seriesScope').value='one';$('modalDeleteBtn').style.display='inline-block';handleLocationChange();syncCoTeacherOptions();syncCampField();const ids=new Set(lessonTeacherIds(x));ids.delete($('lessonTeacher').value);document.querySelectorAll('#coTeacherChecks input').forEach(cb=>cb.checked=ids.has(cb.value))}

function saveLesson(){$('startTime').value=snapTimeTo5($('startTime').value);$('endTime').value=snapTimeTo5($('endTime').value);const sid=$('lessonStudent').value,primary=$('lessonTeacher').value;if(!$('lessonDate').value||!$('startTime').value||!$('endTime').value||!sid||!primary||!$('lessonBranch').value)return alert('日期、時間、學生、老師、歸屬校區都要填');if($('endTime').value<=$('startTime').value)return alert('結束時間必須晚於開始時間');const group=isGroupStudentId(sid),teacherIds=group?[...new Set([primary,...selectedCoTeacherIds()])]:[primary];if(!group&&teacherIds.length>1)return alert('只有團班可以安排多位老師。');const id=$('lessonId').value||createLessonId(),old=db.lessons.find(x=>x.id===id),o={...(old||{}),id,date:$('lessonDate').value,start:$('startTime').value,end:$('endTime').value,studentId:sid,teacherId:primary,teacherIds,title:$('lessonTitle').value,campId:group?normalizeCampCode($('lessonCampId').value):'',room:$('lessonDeliveryMode').value==='onsite'?$('lessonRoom').value.trim():'',location:$('lessonDeliveryMode').value==='home'?'到府':$('lessonDeliveryMode').value==='online'?'線上課':(branchRecord($('lessonBranch').value)?.name||''),branchId:$('lessonBranch').value,deliveryMode:$('lessonDeliveryMode').value,address:$('lessonDeliveryMode').value==='home'?$('lessonAddress').value.trim():'',onlinePlatform:$('lessonDeliveryMode').value==='online'?$('lessonOnlinePlatform').value:'',meetingUrl:$('lessonDeliveryMode').value==='online'?$('lessonMeetingUrl').value.trim():'',paymentStatus:$('paymentStatus').value,status:$('lessonStatus').value,chargeStudent:$('chargeStudent').value,payTeacher:$('payTeacher').value,note:$('lessonNote').value,seriesId:old?.seriesId||'',lessonState:$('lessonState').value||'active',isDraft:($('lessonState').value==='draft'),draftOriginal:null};const conflict=conflictDetail(o,id);if(conflict){const msg=`${conflict.type}撞課：${conflict.name}\n已排 ${conflict.lesson.date} ${conflict.lesson.start}–${conflict.lesson.end}｜${student(conflict.lesson.studentId).name||''} ${conflict.lesson.title||''}`;if(o.isDraft){if(!confirm(msg+'\n\n草稿仍可儲存，是否繼續？'))return}else return alert(msg)};const teacherWarning=teacherConflictDetail(o,id);if(teacherWarning&&!confirm(`老師時間重複：${teacherWarning.name}\n已排 ${teacherWarning.lesson.date} ${teacherWarning.lesson.start}–${teacherWarning.lesson.end}｜${student(teacherWarning.lesson.studentId).name||''} ${teacherWarning.lesson.title||''}\n\n仍要新增／儲存嗎？重複課程會以亮紅色顯示。`))return;snapshot();if(old&&old.seriesId&&$('seriesScope').value!=='one'){const scope=$('seriesScope').value,targets=db.lessons.filter(l=>l.seriesId===old.seriesId&&(scope==='all'||l.date>=old.date));const dateDelta=(new Date(o.date)-new Date(old.date))/86400000,timeDelta=(+o.start.slice(0,2)*60 + +o.start.slice(3))-(+old.start.slice(0,2)*60 + +old.start.slice(3));let changed=0;for(const l of targets){const before={...l},ns=shiftTime(l.start,timeDelta),ne=shiftTime(l.end,timeDelta);const candidate={...l,date:shiftDate(l.date,dateDelta),start:ns,end:ne,teacherId:o.teacherId,teacherIds:[...o.teacherIds],studentId:o.studentId,title:o.title,campId:o.campId,room:o.room,location:o.location,branchId:o.branchId,deliveryMode:o.deliveryMode,address:o.address,onlinePlatform:o.onlinePlatform,meetingUrl:o.meetingUrl,paymentStatus:o.paymentStatus,status:o.status,chargeStudent:o.chargeStudent,payTeacher:o.payTeacher,note:o.note,lessonState:o.lessonState,isDraft:o.isDraft,draftOriginal:null};if(!ns||!ne||hasConflict(candidate,l.id))continue;Object.assign(l,candidate);logChange('系列修改',l,before);window.syncMakeupForLessonStatus?.(l,before.status);changed++}toast(`已更新系列中的 ${changed} 堂課`)}else{const i=db.lessons.findIndex(x=>x.id===id);if(i>=0){const before={...db.lessons[i]};db.lessons[i]=o;logChange('修改課程',o,before);window.syncMakeupForLessonStatus?.(o,before.status)}else{if($('repeatMode').value==='weekly')o.seriesId=createSeriesId();db.lessons.push(o);logChange('新增課程',o);if($('repeatMode').value==='weekly'&&$('repeatUntil').value){let d=new Date(o.date+'T00:00:00'),until=new Date($('repeatUntil').value+'T00:00:00'),added=0;while(true){d.setDate(d.getDate()+7);if(d>until)break;const n={...o,id:createLessonId(),date:localDate(d),status:'未上課',paymentStatus:'unpaid',teacherIds:[...o.teacherIds],lessonState:o.lessonState,isDraft:o.isDraft,draftOriginal:null};if(!hasConflict(n,'')){db.lessons.push(n);added++}}toast(`已建立首堂課及 ${added} 堂每週課程`)}}if(i<0)window.syncMakeupForLessonStatus?.(o,'')}closeLessonModal();saveDB()}

function lessonBlocksScheduling(l){
  if(!l||l.isDraft)return false;
  const status=String(l.status||'').trim().toLowerCase();
  const state=String(l.lessonState||'').trim().toLowerCase();
  const inactive=new Set(['取消','已取消','停課','cancel','cancelled','canceled','stopped','inactive','deleted']);
  return !inactive.has(status)&&!inactive.has(state)&&state!=='draft';
}

function teacherConflictDetail(o,ignore=''){
  if(!lessonBlocksScheduling(o))return null;
  const ignored=new Set(Array.isArray(ignore)?ignore:[ignore].filter(Boolean));
  const oTeachers=new Set(lessonTeacherIds(o));
  for(const l of db.lessons){
    if(ignored.has(l.id)||!lessonBlocksScheduling(l)||l.date!==o.date||!(o.start<l.end&&o.end>l.start))continue;
    const teacherHit=lessonTeacherIds(l).find(id=>oTeachers.has(id));
    if(teacherHit)return{type:'老師',name:teacher(teacherHit).name||'未命名老師',teacherId:teacherHit,lesson:l};
  }
  return null;
}

function lessonTeacherConflictNames(l){
  if(!lessonBlocksScheduling(l))return [];
  const names=new Set();
  const ids=new Set(lessonTeacherIds(l));
  for(const x of db.lessons){
    if(x.id===l.id||!lessonBlocksScheduling(x)||x.date!==l.date||!(l.start<x.end&&l.end>x.start))continue;
    lessonTeacherIds(x).forEach(id=>{if(ids.has(id))names.add(teacher(id).name||'未命名老師')});
  }
  return [...names];
}

function hasTeacherOverlap(l){return lessonTeacherConflictNames(l).length>0}

function conflictDetail(o,ignore=''){
  if(!lessonBlocksScheduling(o))return null;
  const ignored=new Set(Array.isArray(ignore)?ignore:[ignore].filter(Boolean));
  for(const l of db.lessons){
    if(ignored.has(l.id)||!lessonBlocksScheduling(l)||l.date!==o.date||!(o.start<l.end&&o.end>l.start))continue;
    // 老師重疊改為警告，不阻止儲存；學生與教室規則維持原樣。
    if(l.studentId===o.studentId&&!isGroupStudentId(o.studentId))return{type:'學生',name:student(l.studentId).name||'未命名學生',lesson:l};
    if(o.deliveryMode==='onsite'&&l.deliveryMode!=='home'&&l.deliveryMode!=='online'&&o.branchId===l.branchId&&o.room&&l.room===o.room)return{type:'教室',name:locationLabel(o)+' '+o.room,lesson:l};
  }
  return null;
}

function hasConflict(o,ignore=''){const c=conflictDetail(o,ignore);return c?c.type:''}

function deleteCurrentLesson(){const id=$('lessonId').value;if(id&&confirm('確定刪除這堂課？')){snapshot();const old=db.lessons.find(x=>x.id===id);window.syncMakeupForDeletedLesson?.(old);db.lessons=db.lessons.filter(x=>x.id!==id);if(old)logChange('刪除課程',null,old);closeLessonModal();saveDB()}}

let activeCourseDrawerId='';

function courseDrawerStatusClass(status){
  if(status==='已上課')return 'status-complete';
  if(status==='補課')return 'status-makeup';
  if(status==='學生請假'||status==='老師請假')return 'status-leave';
  if(status==='取消'||status==='停課')return 'status-cancel';
  return 'status-pending';
}

function formatCourseDrawerDate(date){
  try{return new Date(date+'T00:00:00').toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'short'})}catch{return date||'—'}
}

function openCourseDrawer(id){
  const l=db.lessons.find(x=>x.id===id);if(!l)return;
  activeCourseDrawerId=id;
  const s=student(l.studentId),teachers=lessonTeacherNames(l)||'未指定老師';
  const mode=window.DanbridgeAccess?.deliveryModeFromLesson?.(l)||'onsite';const place=mode==='home'?`${locationLabel(l)}${l.address?'・'+l.address:''}`:mode==='online'?`${locationLabel(l)}${l.onlinePlatform?'・'+l.onlinePlatform:''}`:`${locationLabel(l)}${l.room?'・'+l.room:''}`;
  const role=window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role||'',teacherView=role==='teacher',payment=l.paymentStatus==='paid'?'已繳':l.paymentStatus==='waived'?'免收':'未繳';
  $('courseDrawerTitle').textContent=s.name||l.title||'課程';
  $('courseDrawerSubtitle').textContent=`${formatCourseDrawerDate(l.date)}・${l.start}–${l.end}`;
  $('courseDrawerBody').innerHTML=`
    <div class="course-drawer-status-row">
      <span class="course-detail-badge ${courseDrawerStatusClass(l.status)}">${esc(l.status||'未上課')}</span>
      ${teacherView?'':`<span class="course-detail-badge ${l.paymentStatus==='paid'||l.paymentStatus==='waived'?'payment-paid':'payment-unpaid'}">${payment}</span>`}
    </div>
    <div class="course-detail-grid">
      <div class="course-detail-item"><div class="course-detail-label">上課時間</div><div class="course-detail-value">${esc(l.start)}–${esc(l.end)}<br>${hours(l.start,l.end)} 小時</div></div>
      <div class="course-detail-item"><div class="course-detail-label">課程／班別</div><div class="course-detail-value">${esc(l.title||s.courseType||'一般課程')}</div></div>
      <div class="course-detail-item wide"><div class="course-detail-label">授課老師</div><div class="course-detail-value">${esc(teachers)}</div></div>
      <div class="course-detail-item wide"><div class="course-detail-label">上課地點</div><div class="course-detail-value">${esc(place||'未指定')}</div></div>
      ${teacherView?'':`<div class="course-detail-item"><div class="course-detail-label">課表營收</div><div class="course-detail-value">${money(lessonCharge(l))}</div></div><div class="course-detail-item"><div class="course-detail-label">收費確認</div><div class="course-detail-value">${l.chargeStudent==='no'?'尚未確認':'已確認'}</div></div><div class="course-detail-item"><div class="course-detail-label">老師薪資</div><div class="course-detail-value">${l.payTeacher==='no'?'不計薪':money(lessonPay(l))}</div></div>`}
    </div>
    ${l.teacherReportContent||l.teacherReportHomework||l.teacherReportNote?`<div class="course-detail-section-title">老師課堂回報</div><div class="course-detail-note">${l.teacherReportContent?`<b>課程內容</b>\n${esc(l.teacherReportContent)}\n\n`:''}${l.teacherReportHomework?`<b>家庭作業</b>\n${esc(l.teacherReportHomework)}\n\n`:''}${l.teacherReportFeedback?`<b>老師回饋</b>\n${esc(l.teacherReportFeedback)}\n\n`:''}${l.teacherReportNote?`<b>內部備註</b>\n${esc(l.teacherReportNote)}`:''}</div>`:''}
    <div class="course-detail-section-title">課程備註</div>
    <div class="course-detail-note">${esc(l.note||'目前沒有備註。')}</div>`;
  const reportBtn=$('courseDrawerReportBtn');
  if(reportBtn){
    const canReport=window.canCurrentUserReportLesson?.(l.id)===true;
    reportBtn.hidden=!canReport;
    reportBtn.onclick=()=>{const lessonId=activeCourseDrawerId;closeCourseDrawer();window.openLessonReport?.(lessonId)};
  }
  const editBtn=$('courseDrawerEditBtn');
  const ownerCanEdit=!role||role==='owner';
  editBtn.hidden=!ownerCanEdit;
  editBtn.onclick=ownerCanEdit?()=>{const lessonId=activeCourseDrawerId;closeCourseDrawer();openLessonModal(todayStr(),'16:00',lessonId)}:null;
  $('courseDrawerBackdrop').classList.add('show');$('courseDrawer').classList.add('show');$('courseDrawer').setAttribute('aria-hidden','false');document.body.classList.add('course-drawer-open');
}

window.__danbridgeActiveCourseDrawerId=()=>activeCourseDrawerId||'';
window.openCourseDrawer=openCourseDrawer;

function closeCourseDrawer(){
  $('courseDrawerBackdrop')?.classList.remove('show');$('courseDrawer')?.classList.remove('show');$('courseDrawer')?.setAttribute('aria-hidden','true');document.body.classList.remove('course-drawer-open');activeCourseDrawerId='';
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('courseDrawer')?.classList.contains('show')){e.preventDefault();closeCourseDrawer()}},true);

function editLesson(id){openCourseDrawer(id)}

function addMinutes(t,m){let[h,mi]=t.split(':').map(Number),n=h*60+mi+m;return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}

function snapTimeTo5(t){if(!t)return t;const[h,m]=t.split(':').map(Number),n=Math.max(0,Math.min(1435,Math.round((h*60+m)/5)*5));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}

function moveLessonTo(id,date,time){const l=db.lessons.find(x=>x.id===id);if(!l)return;const oldDur=Math.round(hours(l.start,l.end)*60),targetTeacherId=$('calendarTeacherFilter')?.value||'',n={...l,date};if(time){n.start=time;n.end=addMinutes(time,oldDur)}if(targetTeacherId){n.teacherId=targetTeacherId;n.teacherIds=[targetTeacherId]}const finish=()=>{clearCalendarSelectionState();cancelPasteClickMode(false)};const c=conflictDetail(n,id);if(c){finish();return alert(`拖曳後會造成${c.type}撞課：${c.name}\n${c.lesson.date} ${c.lesson.start}–${c.lesson.end}，已取消。`)}const tw=teacherConflictDetail(n,id);if(tw&&!confirm(`拖曳後老師 ${tw.name} 會時間重複。\n${tw.lesson.date} ${tw.lesson.start}–${tw.lesson.end}\n仍要移動嗎？重複課程會顯示亮紅色。`)){finish();return}snapshot();const before={...l};Object.assign(l,n);logChange(targetTeacherId&&before.teacherId!==targetTeacherId?'移動課程並更換老師':'移動課程',l,before);finish();saveDB();toast(targetTeacherId&&before.teacherId!==targetTeacherId?'課程已移動並更換老師':'課程已移動')}
