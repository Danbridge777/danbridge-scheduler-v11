/* V18.16.1 — Keep an edited lesson visible after the calendar re-renders. */
(function(){
  const original=window.saveLesson;
  if(typeof original!=='function'||original.__visibilityGuard)return;
  function clearMismatchedCalendarFilters(lesson){
    const assignments={
      calendarTeacherFilter:lessonTeacherIds(lesson).includes($('calendarTeacherFilter')?.value||''),
      calendarStudentFilter:($('calendarStudentFilter')?.value||'')===lesson.studentId,
      calendarLocationFilter:($('calendarLocationFilter')?.value||'')===locationLabel(lesson),
      calendarRoomFilter:($('calendarRoomFilter')?.value||'')===(lesson.room||''),
      calendarStateFilter:($('calendarStateFilter')?.value||'')===(lesson.lessonState||(lesson.isDraft?'draft':'active'))
    };
    Object.entries(assignments).forEach(([id,matches])=>{const el=$(id);if(el?.value&&!matches)el.value=''});
    const search=$('calendarSearch');if(search?.value&&!lessonMatchesCalendar(lesson,{teacher:'',student:'',location:'',room:'',state:'',search:search.value.trim().toLowerCase()}))search.value='';
  }
  function guardedSaveLesson(){
    const editingId=$('lessonId')?.value||'',wasEditing=!!editingId;
    original();
    if(!wasEditing||$('lessonModal')?.classList.contains('show'))return;
    const saved=(db.lessons||[]).find(l=>l.id===editingId);
    if(!saved){alert('課程儲存後未能在資料中找到，已停止畫面切換。請立即使用「復原」或版本紀錄檢查資料。');return}
    const calendarDate=$('calendarDate');if(calendarDate)calendarDate.value=saved.date;
    clearMismatchedCalendarFilters(saved);window.renderCalendar?.();toast('課程已儲存並保留在目前課表');
  }
  guardedSaveLesson.__visibilityGuard=true;window.saveLesson=guardedSaveLesson;
})();
