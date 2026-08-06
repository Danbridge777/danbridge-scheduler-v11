/* Danbridge Scheduler — Makeup Management Module
 * Extracted in V15.13 without changing existing behavior.
 */

function addMakeupForLesson(lesson, reason = '學生請假') {
  db.makeups ||= [];

  const existingMakeup = db.makeups.find(makeup => makeup.sourceLessonId === lesson.id);
  if (existingMakeup) {
    if(existingMakeup.status==='cancelled'){
      existingMakeup.status='pending';existingMakeup.scheduledLessonId='';existingMakeup.teacherId=lesson.teacherId;existingMakeup.branchId=lesson.branchId||window.DanbridgeAccess?.recordBranchId?.(lesson)||existingMakeup.branchId;existingMakeup.cancelledAt='';existingMakeup.reopenedAt=new Date().toISOString();
    }
    return existingMakeup;
  }

  const makeup = {
    id: uid(),
    sourceLessonId: lesson.id,
    studentId: lesson.studentId,
    teacherId: lesson.teacherId,
    branchId: lesson.branchId || window.DanbridgeAccess?.recordBranchId?.(lesson) || '',
    originalDate: lesson.date,
    originalStart: lesson.start,
    originalEnd: lesson.end,
    hours: hours(lesson.start, lesson.end),
    reason,
    status: 'pending',
    scheduledLessonId: '',
    createdAt: new Date().toISOString()
  };
  db.makeups.push(makeup);
  return makeup;
}

function renderMakeups() {
  const filter = $('makeupFilter')?.value || 'pending';
  const rows = (db.makeups || []).filter(
    makeup => filter === 'all' || makeup.status === filter
  );
  const tableBody = $('makeupRows');
  if (!tableBody) return;

  tableBody.innerHTML = rows.map(makeup => `
    <tr class="${makeup.status === 'pending' ? 'makeup-pending' : ''}">
      <td><b>${esc(student(makeup.studentId).name)}</b></td>
      <td>${makeup.originalDate} ${makeup.originalStart}–${makeup.originalEnd}</td>
      <td>${makeup.hours} hr</td>
      <td>${esc(makeup.reason)}</td>
      <td>${makeup.status === 'pending' ? '待安排' : makeup.status === 'scheduled' ? '已安排' : makeup.status === 'cancelled' ? '已取消' : '已完成'}</td>
      <td class="row-actions">
        ${makeup.status === 'pending' ? `<button class="btn primary" onclick="scheduleMakeup('${makeup.id}')">安排補課</button>` : ''}
        ${makeup.status === 'scheduled' ? '<span class="small">等待補課老師完成回報</span>' : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="small">目前沒有符合條件的補課。</td></tr>';
}

function scheduleMakeup(id) {
  const makeup = db.makeups.find(item => item.id === id);
  if (!makeup) return;

  openLessonModal(todayStr(), makeup.originalStart);
  $('lessonStudent').value = makeup.studentId;
  $('lessonTeacher').value = makeup.teacherId;
  $('lessonTitle').value = '補課';
  $('lessonStatus').value = '補課';
  $('lessonNote').value = `補 ${makeup.originalDate} 的課程｜MAKEUP:${makeup.id}`;
  window.__danbridgePendingMakeupId = makeup.id;
}

function finishMakeup(id) {
  const makeup = db.makeups.find(item => item.id === id);
  if (!makeup) return;
  const lesson = db.lessons.find(item => item.id === makeup.scheduledLessonId);
  if (!lesson || !lessonCountsAsTaught(lesson)) return alert('補課必須由補課老師在實際補課課程中完成回報，不能直接手動結案。');
  completeMakeupForLesson(lesson);
  saveDB();toast('補課已完成');
}

function completeMakeupForLesson(lesson){
  const makeupId=lessonMakeupId(lesson),makeup=(db.makeups||[]).find(item=>item.id===makeupId||item.scheduledLessonId===lesson.id);
  if(!makeup||lesson.teacherReportStatus!=='makeup_completed')return false;
  const teacherId=lesson.teacherId||lessonTeacherIds(lesson)[0]||makeup.teacherId,completedAt=lesson.teacherReportUpdatedAt||makeup.completedAt||new Date().toISOString();
  if(makeup.status==='done'&&makeup.scheduledLessonId===lesson.id&&makeup.teacherId===teacherId&&makeup.completedAt===completedAt)return false;
  makeup.status='done';makeup.scheduledLessonId=lesson.id;makeup.teacherId=teacherId;makeup.completedAt=completedAt;return true;
}
window.completeMakeupForLesson=completeMakeupForLesson;

function cancelOpenMakeupForSourceLesson(lesson){
  const makeup=(db.makeups||[]).find(item=>item.sourceLessonId===lesson.id&&!['done','cancelled'].includes(item.status));
  if(!makeup)return false;
  const scheduled=(db.lessons||[]).find(item=>item.id===makeup.scheduledLessonId);
  if(scheduled){scheduled.status='取消';scheduled.payTeacher='no';scheduled.chargeStudent='no';scheduled.cancelledBecauseSourceRestored=true;}
  makeup.status='cancelled';makeup.cancelledAt=new Date().toISOString();return true;
}
window.cancelOpenMakeupForSourceLesson=cancelOpenMakeupForSourceLesson;

function syncMakeupForLessonStatus(lesson, previousStatus = ''){
  if(!lesson)return false;
  if(lesson.status==='學生請假'){
    const existing=(db.makeups||[]).find(item=>item.sourceLessonId===lesson.id),before=existing?.status||'';
    const makeup=addMakeupForLesson(lesson);
    return !existing||makeup?.status!==before;
  }
  if(previousStatus==='學生請假')return cancelOpenMakeupForSourceLesson(lesson);
  return false;
}
window.syncMakeupForLessonStatus=syncMakeupForLessonStatus;

function syncMakeupForDeletedLesson(lesson){
  if(!lesson)return false;
  let changed=false;
  if(lesson.status==='學生請假')changed=cancelOpenMakeupForSourceLesson(lesson)||changed;
  const makeupId=lessonMakeupId(lesson);
  if(makeupId){
    const makeup=(db.makeups||[]).find(item=>item.id===makeupId||item.scheduledLessonId===lesson.id);
    if(makeup){
      makeup.status='pending';makeup.scheduledLessonId='';makeup.completedAt='';makeup.rescheduledAt=new Date().toISOString();changed=true;
    }
  }
  return changed;
}
window.syncMakeupForDeletedLesson=syncMakeupForDeletedLesson;

const saveLessonBeforeMakeupLink=window.saveLesson;
window.saveLesson=function(){
  const makeupId=String(window.__danbridgePendingMakeupId||'');
  const lessonIdsBefore=new Set((db.lessons||[]).map(item=>String(item.id)));
  const result=saveLessonBeforeMakeupLink?.apply(this,arguments);
  if(!makeupId)return result;
  const makeup=(db.makeups||[]).find(item=>item.id===makeupId);
  const lesson=(db.lessons||[]).find(item=>lessonMakeupId(item)===makeupId)||(db.lessons||[]).find(item=>!lessonIdsBefore.has(String(item.id)));
  if(!makeup||!lesson)return result;
  lesson.makeupId=makeup.id;lesson.sourceLessonId=makeup.sourceLessonId;lesson.isMakeup=true;lesson.chargeStudent='no';lesson.payTeacher='yes';
  makeup.scheduledLessonId=lesson.id;makeup.teacherId=lesson.teacherId||lessonTeacherIds(lesson)[0]||makeup.teacherId;makeup.branchId=lesson.branchId||makeup.branchId;makeup.status='scheduled';
  window.__danbridgePendingMakeupId='';saveDB();return result;
};

const closeLessonModalBeforeMakeup=window.closeLessonModal;
window.closeLessonModal=function(){window.__danbridgePendingMakeupId='';return closeLessonModalBeforeMakeup?.apply(this,arguments)};
