/* V15.19 Render Orchestrator: coordinates module rendering without owning business logic. */
function calendarSectionIsActive(){const section=$('calendar');return document.body.dataset.activeSection==='calendar'||section?.classList.contains('active')}
function renderVisibleWorkspace(){
  const id=document.body.dataset.activeSection||document.querySelector('main section.active')?.id||'dashboard';
  if(id==='calendar')renderCalendar({deferAnalysis:true});
  else if(id==='dashboard')renderDashboard();
  else if(id==='students')renderStudents();
  else if(id==='teachers')renderTeachers();
  else if(id==='teacherLeave')renderTeacherLeaves?.();
  else if(id==='lessons')renderLessons();
  else if(id==='makeups')renderMakeups();
  else if(id==='settlement')renderSettlement();
  else if(id==='finance')renderFinance();
  else if(id==='summerCamp')renderSummerCampClasses();
  else if(id==='teacherGroups')renderTeacherGroups();
  else if(id==='winterCamp')renderWinterCampClasses();
  else if(id==='winterTeacherGroups')renderWinterTeacherGroups();
  else if(id==='backup'){renderBackupHistory();updateLastBackupInfo();}
  else if(id==='security')renderDataIntegrity?.();
  window.DanbridgeNotifications?.render?.();
}
function renderAll(){
  /* 課表只依賴自己的必要預設值，必須在結算與其他頁面初始化前完成。 */
  renderCalendar();
  setDefaults();
  renderSelects();renderStudents();renderTeachers();renderTeacherLeaves?.();renderDashboard();renderLessons();renderSettlement();renderFinance();renderMakeups();renderSummerCampClasses();renderTeacherGroups();renderCampSelectors();initSummerRegistrationUI();renderWinterCampClasses();renderWinterTeacherGroups();renderWinterCampSelectors();renderBackupHistory();updateLastBackupInfo();renderDataIntegrity?.();window.DanbridgeNotifications?.render?.();
}
