/* V15.19 Render Orchestrator: coordinates module rendering without owning business logic. */
function calendarSectionIsActive(){const section=$('calendar');return document.body.dataset.activeSection==='calendar'||section?.classList.contains('active')}
function renderAll(){
  /* 課表只依賴自己的必要預設值，必須在結算與其他頁面初始化前完成。 */
  renderCalendar();
  setDefaults();
  renderSelects();renderStudents();renderTeachers();renderDashboard();renderLessons();renderSettlement();renderFinance();renderMakeups();renderSummerCampClasses();renderTeacherGroups();renderCampSelectors();initSummerRegistrationUI();renderWinterCampClasses();renderWinterTeacherGroups();renderWinterCampSelectors();renderBackupHistory();updateLastBackupInfo();renderDataIntegrity?.();window.DanbridgeNotifications?.render?.();
}
