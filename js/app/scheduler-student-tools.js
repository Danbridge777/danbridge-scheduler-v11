(function(){
  const original=window.saveQuickStudent;
  const appendStudentOption=(id,student,placeholder)=>{
    const select=$(id);if(!select)return;
    const value=String(student.id||'');
    if(!value||[...select.options].some(option=>String(option.value)===value))return;
    const option=document.createElement('option');option.value=value;option.textContent=student.name||'未命名學生';
    select.appendChild(option);
    if(placeholder&&select.options[0]&&!select.options[0].value)select.options[0].textContent=placeholder;
  };
  const exposeStudentImmediately=student=>{
    // The lesson dialog only needs one new option. Rebuilding every student,
    // teacher and room selector here made Safari translate hundreds of new DOM
    // nodes before the modal could close. Append the one record to each student
    // selector instead; the normal workspace render keeps canonical ordering.
    appendStudentOption('lessonStudent',student,'請選擇學生');
    appendStudentOption('filterStudent',student,'全部學生');
    appendStudentOption('calendarStudentFilter',student,'全部學生');
    appendStudentOption('smartStudent',student,'請選擇學生');
  };
  const deferStudentPersistence=()=>{
    const persist=()=>{
      try{saveDB({studentMutation:'student.create',skipRender:true})}
      catch(error){console.error('Quick student persistence failed',error);window.toast?.('學生已保留在畫面；背景同步將自動重試。')}
    };
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(persist,0));
    else setTimeout(persist,0);
  };
  window.saveQuickStudent=function(){
    const access=window.DanbridgeAccess?.getContext?.()||{},role=window.currentCloudRole?.()||access.role||'',scheduler=access.canManageSchedule===true;
    if(role!=='owner'&&!scheduler)return original?.();
    const name=$('quickStudentName').value.trim();
    if(!name)return alert('請輸入學生姓名');
    const duplicate=db.students.find(s=>String(s.name||'').trim().toLowerCase()===name.toLowerCase());
    if(duplicate&&(role!=='owner'||!confirm(`已有「${name}」，仍要新增嗎？`))){$('lessonStudent').value=duplicate.id;toggleQuickStudent(false);handleLessonStudentChange();return toast(`已選取既有學生 ${duplicate.name}`)}
    const branch=$('v20QuickBranch')?.value||'',duration=+$('v20QuickDuration')?.value||60,courseType=$('quickCourseType').value;
    const owner=role==='owner',student=studentDefaults({id:uid(),name,parent:owner?$('quickParentName').value.trim():'',contact:owner?$('quickParentContact').value.trim():'',homeAddress:owner?$('quickHomeAddress').value.trim():'',courseType,billing:normalizedStudentBilling(courseType),rate:owner?(+$('quickRate').value||0):0,preferredTeacherId:$('v20QuickTeacher')?.value||'',branchIds:branch?[branch]:[],attendanceBranchId:branch,billingBranchId:$('quickBillingBranch')?.value||'',status:'active',note:''});
    db.students.push(student);exposeStudentImmediately(student);$('lessonStudent').value=student.id;
    if(student.preferredTeacherId)$('lessonTeacher').value=student.preferredTeacherId;
    if(branch){$('lessonBranch').value=branch;handleBranchChange()}
    $('endTime').value=addMinutes($('startTime').value,duration);toggleQuickStudent(false);handleLessonStudentChange();window.realtimeConflicts?.();toast(`已新增並選取 ${student.name}`);deferStudentPersistence();
  };
})();
