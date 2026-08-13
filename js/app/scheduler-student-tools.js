(function(){
  const original=window.saveQuickStudent;
  window.saveQuickStudent=function(){
    const scheduler=window.DanbridgeAccess?.getContext?.().canManageSchedule===true;
    if(!scheduler)return original?.();
    const name=$('quickStudentName').value.trim();
    if(!name)return alert('請輸入學生姓名');
    const duplicate=db.students.find(s=>String(s.name||'').trim().toLowerCase()===name.toLowerCase());
    if(duplicate){$('lessonStudent').value=duplicate.id;toggleQuickStudent(false);handleLessonStudentChange();return toast(`已選取既有學生 ${duplicate.name}`)}
    const branch=$('v20QuickBranch')?.value||'',duration=+$('v20QuickDuration')?.value||60;
    const student=studentDefaults({id:uid(),name,parent:$('quickParentName').value.trim(),contact:$('quickParentContact').value.trim(),homeAddress:$('quickHomeAddress').value.trim(),courseType:$('quickCourseType').value,preferredTeacherId:$('v20QuickTeacher')?.value||'',branchIds:branch?[branch]:[],status:'active'});
    db.students.push(student);saveDB();renderSelects();$('lessonStudent').value=student.id;
    if(student.preferredTeacherId)$('lessonTeacher').value=student.preferredTeacherId;
    if(branch){$('lessonBranch').value=branch;handleBranchChange()}
    $('endTime').value=addMinutes($('startTime').value,duration);toggleQuickStudent(false);handleLessonStudentChange();window.realtimeConflicts?.();toast(`已新增並選取 ${student.name}`);
  };
})();
