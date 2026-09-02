const { test, expect } = require('@playwright/test');

const RELEASE = '20.15.7';
const CLOUD_RELEASE = '20.26.153';
const SCHEDULER_STUDENT_TOOLS_RELEASE = '20.26.139';
const APP_SHELL_RELEASE = '20.26.139';
const BUSINESS_RELEASE = '20.23.0';
const TEACHER_KPI_RELEASE = '20.22.0';
const BRANCH_SCOPE_RELEASE = '20.22.0';
const ROLE_UX_RELEASE = '20.26.139';
const REPORT_STYLE_RELEASE = '20.26.139';
const ROLE_UX_STYLE_RELEASE = '20.26.139';
const PWA_RELEASE = '20.26.153';
const PWA_STYLE_RELEASE = '20.18.0';
const CLEAN_FIELD_RELEASE = '20.19.0';
const LANGUAGE_RELEASE = '20.25.0';
const INTERFACE_CLARITY_STYLE_RELEASE = '20.25.5';
const SCHEDULER_UI_RELEASE = '20.26.8';
const PREMIUM_CONTROLS_RELEASE = '20.25.10';
const PERMANENT_HISTORY_RELEASE = '20.26.98';
const APPLICATION_FEATURES_RELEASE = '20.26.98';
const SCHEDULING_EFFICIENCY_RELEASE = '20.26.98';
const CROSS_PLATFORM_LAYOUT_RELEASE = '20.26.153';

test('signed-out entry keeps private application content isolated', async ({ page }) => {
  await page.route('https://www.gstatic.com/**', route => route.abort());
  await page.route('https://*.googleapis.com/**', route => route.abort());

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveClass(/auth-locked/);

  const isolation = await page.locator('main').evaluate(element => ({ display: getComputedStyle(element).display }));
  expect(isolation).toEqual({ display: 'none' });
});

test('永久操作日誌在重新整理後仍可從 IndexedDB 完整讀回',async({page},testInfo)=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  const key=`staging:e2e@example.com:${testInfo.project.name}-${Date.now()}`,rows=[{schema:'danbridge-operation-journal-v1',operationId:'device:1',status:'pending',attempts:0,operation:{operationId:'device:1',recordId:'lesson-1'}}];
  await page.evaluate(async({key,rows})=>{const{createBrowserOperationJournalStorage}=await import('/js/core/browser-operation-journal-storage.js?v=20.26.106'),storage=createBrowserOperationJournalStorage({indexedDB,locks:navigator.locks,key});await storage.save(rows);sessionStorage.setItem('e2eJournalKey',key)},{key,rows});
  await page.reload({waitUntil:'domcontentloaded'});
  const readback=await page.evaluate(async()=>{const key=sessionStorage.getItem('e2eJournalKey'),{createBrowserOperationJournalStorage}=await import('/js/core/browser-operation-journal-storage.js?v=20.26.106');return createBrowserOperationJournalStorage({indexedDB,locks:navigator.locks,key}).load()});
  expect(readback).toEqual(rows);
});

test('sign-in area is integrated into the black-gold stage without a floating card', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const panel = await page.locator('.auth-card-minimal').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      radius: style.borderRadius,
      shadow: style.boxShadow,
      background: style.backgroundImage,
      leftBorder: style.borderLeftWidth,
      topBorder: style.borderTopWidth
    };
  });
  expect(panel.radius).toBe('0px');
  expect(panel.shadow).toBe('none');
  expect(panel.background).toContain('linear-gradient');
  expect(panel.leftBorder === '1px' || panel.topBorder === '1px').toBeTruthy();
});

test('critical teacher and finance resources load the current release', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const sources = await page.locator('script[src]').evaluateAll(elements => elements.map(element => element.getAttribute('src')));
  expect(sources).toContain(`./js/modules/business/business-logic.js?v=${BUSINESS_RELEASE}`);
  expect(sources).toContain(`./js/modules/notifications/notification-center.js?v=${RELEASE}`);
  expect(sources).toContain(`./js/core/firebase-auth-and-cloud-sync.module.js?v=${CLOUD_RELEASE}`);
  expect(sources).toContain(`./js/app/app-shell.js?v=${APP_SHELL_RELEASE}`);
  expect(sources).toContain(`./js/app/scheduler-student-tools.js?v=${SCHEDULER_STUDENT_TOOLS_RELEASE}`);
  expect(sources).toContain(`./js/ui/clean-field-hints.js?v=${CLEAN_FIELD_RELEASE}`);
  expect(sources).toContain(`./js/modules/teachers/teacher-kpi.js?v=${TEACHER_KPI_RELEASE}`);
  expect(sources).toContain('./js/modules/teachers/teacher-leave.js?v=20.26.139');
  expect(sources).toContain(`./js/core/branch-business-scope.js?v=${BRANCH_SCOPE_RELEASE}`);
  expect(sources).toContain(`./js/app/v20014-role-responsive-ux.js?v=${ROLE_UX_RELEASE}`);
  expect(sources).toContain(`./js/core/pwa-installation.js?v=${PWA_RELEASE}`);
  expect(sources).toContain(`./js/core/ui-language.js?v=${LANGUAGE_RELEASE}`);
  expect(sources).toContain(`./js/modules/calendar/scheduler-ui.js?v=${SCHEDULER_UI_RELEASE}`);
  expect(sources).toContain(`./js/core/permanent-operation-history.js?v=${PERMANENT_HISTORY_RELEASE}`);
  expect(sources).toContain(`./js/modules/application-and-business-features.js?v=${APPLICATION_FEATURES_RELEASE}`);
  expect(sources).toContain(`./js/app/v20-scheduling-efficiency.js?v=${SCHEDULING_EFFICIENCY_RELEASE}`);
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(styles).toContain(`./css/core/73-v20014-role-responsive-ux.css?v=${ROLE_UX_STYLE_RELEASE}`);
  expect(styles).toContain('./css/teachers/24-teacher-leave.css?v=20.26.139');
  expect(styles).toContain(`./css/core/37-v15252-lesson-reporting-and-toolbar-fix.css?v=${REPORT_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/77-pwa-install-and-update.css?v=${PWA_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/67-v185-interface-clarity.css?v=${INTERFACE_CLARITY_STYLE_RELEASE}`);
  expect(styles).toContain(`./css/core/78-v20259-premium-responsive-controls.css?v=${PREMIUM_CONTROLS_RELEASE}`);
  expect(styles).toContain(`./css/core/84-v2026146-cross-platform-layout-guard.css?v=${CROSS_PLATFORM_LAYOUT_RELEASE}`);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBe('./manifest.webmanifest');
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIcon).toBe('./icon-192.png?v=20.18.1');
});

test('主選單在桌機、平板與手機都只顯示一致文字',async({page})=>{
  const expected=['總覽','學生／家長','老師','請假管理','課表','課程紀錄','補課中心','冬／夏令營','公司財務','備份／iPad','安全設定'];
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.body.classList.remove('auth-locked'));
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const items=await page.locator('body>nav>button[data-tab]').evaluateAll(buttons=>buttons.map(button=>{const style=getComputedStyle(button);const rect=button.getBoundingClientRect();return{label:button.textContent.trim(),before:getComputedStyle(button,'::before').content,after:getComputedStyle(button,'::after').content,marginTop:style.marginTop,display:style.display,height:rect.height,overflowing:button.scrollWidth>button.clientWidth+1||button.scrollHeight>button.clientHeight+1}}));
    expect(items.map(item=>item.label)).toEqual(expected);
    expect(items.every(item=>item.before==='none'&&item.after==='none'&&item.marginTop==='0px')).toBeTruthy();
    expect(items.every(item=>item.display==='flex'&&!item.overflowing)).toBeTruthy();
    expect(new Set(items.map(item=>item.height)).size).toBe(1);
  }
});

test('老師請假頁在 Daniel、AA、老師三種角色下呈現正確範圍並提交精確時數',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(450);
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.evaluate(()=>{document.body.classList.remove('auth-locked');document.getElementById('authScreen').style.display='none';window.currentCloudRole=()=>window.DanbridgeAccess.getContext().role;db={...db,teachers:[{id:'teacher-1',name:'張毅'},{id:'teacher-2',name:'AA'}]};window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',teacherId:'',canManageSchedule:false});window.__leaveTestPayload=null;window.__danbridgeSaveTeacherLeave=async payload=>{window.__leaveTestPayload=structuredClone(payload);return{ok:true}};window.__danbridgeSetTeacherLeaves([{id:'leave-existing',leaveId:'leave-existing',teacherId:'teacher-1',teacherName:'張毅',leaveType:'sick',date:'2026-09-02',start:'09:00',end:'10:30',hours:1.5,note:'看診',status:'active',revision:1}]);window.renderAll();window.switchTab('teacherLeave')});
 await expect(page.locator('#teacherLeave')).toHaveClass(/active/);await expect(page.locator('#teacherLeaveRows')).toContainText('張毅');await expect(page.locator('#teacherLeaveRows')).toContainText('1.5 小時');
 await page.locator('#teacherLeaveTeacher').selectOption('teacher-1');await page.locator('#teacherLeaveType').selectOption('bereavement');await page.locator('#teacherLeaveDate').fill('2026-09-04');await page.locator('#teacherLeaveStart').selectOption('13:00');await page.locator('#teacherLeaveEnd').selectOption('15:30');await expect(page.locator('#teacherLeaveHoursPreview')).toHaveText('共 2.5 小時');await page.locator('#teacherLeaveSaveBtn').click();await expect.poll(()=>page.evaluate(()=>window.__leaveTestPayload?.input)).toEqual({teacherId:'teacher-1',leaveType:'bereavement',date:'2026-09-04',start:'13:00',end:'15:30',note:''});
 const roles=await page.evaluate(()=>{const result={};window.DanbridgeAccess.setContext({role:'teacher',email:'teacher@example.com',teacherId:'teacher-1',canManageSchedule:false});window.DanbridgeRoleResponsive.apply();window.renderTeacherLeaves();result.teacher={tabs:[...document.querySelectorAll('nav button[data-tab]')].filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').map(button=>button.dataset.tab),teacherDisabled:document.getElementById('teacherLeaveTeacher').disabled,teacherValue:document.getElementById('teacherLeaveTeacher').value};window.DanbridgeAccess.setContext({role:'teacher',email:'aa@example.com',teacherId:'teacher-2',canManageSchedule:true});window.DanbridgeRoleResponsive.apply();window.renderTeacherLeaves();result.scheduler={tabs:[...document.querySelectorAll('nav button[data-tab]')].filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').map(button=>button.dataset.tab),teacherDisabled:document.getElementById('teacherLeaveTeacher').disabled};return result});
 expect(roles.teacher).toEqual({tabs:['dashboard','teacherLeave','calendar','lessons'],teacherDisabled:true,teacherValue:'teacher-1'});expect(roles.scheduler).toEqual({tabs:['teacherLeave','calendar'],teacherDisabled:false});
});

test('刪除課程可沿用同一 ID 重建且永久日誌只追加不覆寫',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:false});
    window.currentCloudRole=()=> 'owner';
    const lesson={id:'stable-lesson-id',date:'2026-08-16',start:'09:15',end:'10:15',studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],title:'PERMANENT_HISTORY_TEST',status:'未上課'};
    const deletion={id:'delete-change-id',at:'2026-08-15T09:00:00.000Z',type:'刪除課程',lessonId:lesson.id,studentId:lesson.studentId,actorName:'Daniel',actorEmail:'owner@example.com',before:structuredClone(lesson),after:null};
    db={...db,students:[{id:'student-1',name:'Student'}],teachers:[{id:'teacher-1',name:'Teacher'}],lessons:[],changes:[structuredClone(deletion)]};
    const originalSave=window.saveDB;window.saveDB=()=>{};
    undoRecentChange(deletion.id);
    const revived=structuredClone(db.lessons),afterRevive=structuredClone(db.changes),inverseId=afterRevive[0].id;
    undoRecentChange(inverseId);
    const afterSecond=structuredClone(db.changes),activeAfterSecond=window.DanbridgePermanentOperationHistory.reversedChangeIds(afterSecond);
    window.saveDB=originalSave;
    return{revived,afterRevive,afterSecond,activeAfterSecond:[...activeAfterSecond],original:deletion};
  });
  expect(result.revived).toHaveLength(1);
  expect(result.revived[0].id).toBe('stable-lesson-id');
  expect(result.afterRevive).toHaveLength(2);
  expect(result.afterRevive[1]).toEqual(result.original);
  expect(result.afterRevive[0].undoOfChangeId).toBe('delete-change-id');
  expect(result.afterRevive[0].before).toBeNull();
  expect(result.afterRevive[0].after.id).toBe('stable-lesson-id');
  expect(result.afterSecond).toHaveLength(3);
  expect(result.afterSecond[2]).toEqual(result.original);
  expect(result.activeAfterSecond).not.toContain('delete-change-id');
});

test('large schedule notification table stays on one aligned row', async ({ page }) => {
  await page.goto('/');
  const css = await page.locator('link[href*="46-v168-schedule-notifications.css"]').getAttribute('href');
  expect(css).toContain('v=20.0.12');
  const stylesheet = await (await page.request.get(css)).text();
  expect(stylesheet).toContain('.schedule-notification-table{width:max-content;min-width:100%');
  expect(stylesheet).toMatch(/\.schedule-notification-table th\{[^}]*white-space:nowrap;vertical-align:middle/);
  expect(stylesheet).toMatch(/\.schedule-notification-table td\{[^}]*vertical-align:middle;[^}]*white-space:nowrap/);
});

test('teacher schedule hides the location legend', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('body').evaluate(element => {
    element.classList.add('teacher-cloud-role');
    element.dataset.roleUx = 'teacher';
  });
  await expect(page.locator('#calendar .location-legend')).toBeHidden();
});

test('owner lesson navigation paints before the heavy table render', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.currentCloudRole=()=> 'owner';
    const originalRender=window.renderLessons,originalFrame=window.requestAnimationFrame,frames=[];let rendered=false;
    window.renderLessons=()=>{rendered=true};
    window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
    try{
      window.switchTab('lessons');
      const immediate=document.getElementById('lessons').classList.contains('active')&&document.querySelector('nav button[data-tab="lessons"]').classList.contains('active');
      const renderedDuringSwitch=rendered,queuedFrames=frames.length;
      await new Promise(resolve=>setTimeout(resolve,0));
      const renderedBeforeFrame=rendered;
      frames.splice(0).forEach(callback=>callback(performance.now()));
      await new Promise(resolve=>setTimeout(resolve,0));
      return{immediate,renderedDuringSwitch,renderedBeforeFrame,queuedFrames,rendered};
    }finally{window.renderLessons=originalRender;window.requestAnimationFrame=originalFrame}
  });
  expect(result.immediate).toBe(true);
  expect(result.renderedDuringSwitch).toBe(false);
  expect(result.renderedBeforeFrame).toBe(false);
  expect(result.queuedFrames).toBeGreaterThan(0);
  expect(result.rendered).toBe(true);
});

test('every owner navigation and dashboard shortcut responds before heavy rendering', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',canManageSchedule:false});window.currentCloudRole=()=> 'owner';
    const renderNames=['renderDashboard','renderStudents','renderCalendar','renderLessons','renderFinance'],rendererByTab={dashboard:'renderDashboard',students:'renderStudents',calendar:'renderCalendar',lessons:'renderLessons',finance:'renderFinance'},originals={},originalFrame=window.requestAnimationFrame,frames=[],renderCalls=[];
    renderNames.forEach(name=>{originals[name]=window[name];window[name]=()=>{renderCalls.push(name)}});
    window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
    try{
      const tabs=['dashboard','students','teachers','teacherLeave','calendar','lessons','makeups','camps','finance','data','security'],checks=[];
      for(const tab of tabs){
        const before=renderCalls.length,expectedRenderer=rendererByTab[tab]??null;window.switchTab(tab);
        const section=document.getElementById(tab).classList.contains('active'),button=document.querySelector(`nav button[data-tab="${tab}"]`).classList.contains('active'),renderedDuringSwitch=renderCalls.length!==before,queuedFrames=frames.length;
        frames.splice(0).forEach(callback=>callback(performance.now()));await new Promise(resolve=>setTimeout(resolve,0));
        const callsAfterFrame=renderCalls.slice(before);
        checks.push({tab,section,button,renderedDuringSwitch,frameScheduled:!expectedRenderer||queuedFrames>0,rendererCorrect:expectedRenderer?callsAfterFrame.length>0&&callsAfterFrame.every(name=>name===expectedRenderer):callsAfterFrame.length===0,callsAfterFrame});
      }
      const shortcutTargets=[...document.querySelectorAll('#dashboard button[onclick*="switchTab"]')].map(button=>button.getAttribute('onclick').match(/switchTab\('([^']+)'\)/)?.[1]).filter(Boolean);
      return{checks,shortcutTargets};
    }finally{renderNames.forEach(name=>window[name]=originals[name]);window.requestAnimationFrame=originalFrame}
  });
  const failedChecks=result.checks.filter(item=>!item.section||!item.button||item.renderedDuringSwitch||!item.frameScheduled||!item.rendererCorrect);
  expect(failedChecks,JSON.stringify(result.checks)).toEqual([]);
  expect(result.shortcutTargets.sort()).toEqual(['calendar','calendar','calendar','lessons','makeups'].sort());
});

test('role navigation matrix rejects every forbidden workspace', async ({ page }) => {
  await page.goto('/');
  const matrix=await page.evaluate(()=>{
    document.body.classList.remove('auth-locked');
    const attempt=(role,canManageSchedule,tabs)=>{window.DanbridgeAccess.setContext({role,canManageSchedule});window.currentCloudRole=()=>role;return tabs.map(tab=>{window.switchTab(tab);return[tab,document.body.dataset.activeSection]})};
    return{
      owner:attempt('owner',false,['dashboard','students','teachers','teacherLeave','calendar','lessons','makeups','camps','finance','data','security']),
      scheduler:attempt('teacher',true,['teacherLeave','students','calendar','dashboard','lessons','finance','security']),
      teacher:attempt('teacher',false,['teacherLeave','dashboard','calendar','lessons','students','teachers','finance','security']),
      manager:attempt('branch_manager',false,['teacherLeave','dashboard','students','teachers','calendar','lessons','makeups','settlement','finance','data','security'])
    };
  });
  expect(matrix.owner.every(([requested,active])=>requested===active)).toBe(true);
  expect(matrix.scheduler).toEqual([['teacherLeave','teacherLeave'],['students','calendar'],['calendar','calendar'],['dashboard','calendar'],['lessons','calendar'],['finance','calendar'],['security','calendar']]);
  expect(matrix.teacher).toEqual([['teacherLeave','teacherLeave'],['dashboard','dashboard'],['calendar','calendar'],['lessons','lessons'],['students','dashboard'],['teachers','dashboard'],['finance','dashboard'],['security','dashboard']]);
  expect(matrix.manager).toEqual([['teacherLeave','dashboard'],['dashboard','dashboard'],['students','students'],['teachers','teachers'],['calendar','calendar'],['lessons','lessons'],['makeups','makeups'],['settlement','finance'],['finance','finance'],['data','dashboard'],['security','dashboard']]);
});

test('ordinary teacher cannot reveal owner or aa-only controls', async ({ page }) => {
  await page.goto('/');
  const result=await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','scheduler-cloud-role','branch-manager-cloud-role');document.body.classList.add('teacher-cloud-role');
    window.DanbridgeAccess.setContext({role:'teacher',teacherId:'teacher-ordinary',email:'teacher@example.com',canManageSchedule:false});
    const hiddenIds=['students','teachers','makeups','camps','winterCamps','settlement','finance','data','security'];
    return{
      privateSections:hiddenIds.filter(id=>getComputedStyle(document.getElementById(id)).display!=='none'),
      schedulerClass:document.body.classList.contains('scheduler-cloud-role'),
      allowed:['dashboard','calendar','lessons'].map(tab=>{window.switchTab(tab);return document.body.dataset.activeSection}),
      rejected:['students','teachers','finance','security'].map(tab=>{window.switchTab(tab);return document.body.dataset.activeSection})
    };
  });
  expect(result.privateSections).toEqual([]);
  expect(result.schedulerClass).toBe(false);
  expect(result.allowed).toEqual(['dashboard','calendar','lessons']);
  expect(result.rejected).toEqual(['dashboard','dashboard','dashboard','dashboard']);
});

for (const schedulerAccount of [
  { name: 'aa', teacherId: 'aa', email: 'aa0966626336@gmail.com' }
]) test(`${schedulerAccount.name} scheduler stays private, centered and contained on every device`, async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.DanbridgeRoleResponsive));
  const result = await page.evaluate(schedulerAccount => {
    document.body.classList.remove('auth-locked');
    document.body.classList.add('teacher-cloud-role');
    window.DanbridgeAccess.setContext({role:'teacher',teacherId:schedulerAccount.teacherId,email:schedulerAccount.email,canManageSchedule:true});
    window.currentCloudRole=()=> 'teacher';
    window.DanbridgeRoleResponsive?.apply?.();
    window.renderCalendar?.();
    const selectionBar=document.getElementById('selectionBar');
    selectionBar.classList.remove('hidden');
    const selectionRect=selectionBar.getBoundingClientRect();
    const calendarCardRect=document.querySelector('#calendar>.card').getBoundingClientRect();
    const contextMenu=document.getElementById('calendarContextMenu');
    document.querySelectorAll('main section.active').forEach(section=>section.classList.remove('active'));document.getElementById('calendar').classList.add('active');
    const contextHiddenByDefault=getComputedStyle(contextMenu).display==='none';
    contextMenu.classList.add('show');
    const contextVisibleOnCalendar=getComputedStyle(contextMenu).display!=='none';
    document.getElementById('calendar').classList.remove('active');document.getElementById('students').classList.add('active');
    const contextHiddenOnStudents=getComputedStyle(contextMenu).display==='none';
    window.switchTab('students');
    const studentNavigationRejected=document.body.dataset.activeSection==='calendar'&&!document.getElementById('students').classList.contains('active');
    const studentContentHidden=getComputedStyle(document.getElementById('students')).display==='none';
    document.getElementById('students').classList.remove('active');document.getElementById('calendar').classList.add('active');contextMenu.classList.remove('show');
    const sampleLesson=db.lessons[0];
    if(sampleLesson)window.editLesson(sampleLesson.id);
    const backdrop = document.getElementById('lessonModal');
    backdrop.classList.add('show');
    document.getElementById('lessonAddressWrap').classList.remove('hidden');
    document.getElementById('lessonOnlineWrap').classList.remove('hidden');
    const modal = backdrop.querySelector('.modal');
    const modalRect = modal.getBoundingClientRect();
    const visibleControls = [...modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,button')].filter(control => {
      const style = getComputedStyle(control), rect = control.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return {
      viewportWidth: innerWidth,
      modalLeft: modalRect.left,
      modalRight: modalRect.right,
      overflow: document.documentElement.scrollWidth - innerWidth,
      uncentered: visibleControls.filter(control => getComputedStyle(control).textAlign !== 'center').map(control => control.id || control.textContent.trim().slice(0, 20)),
      escaped: visibleControls.filter(control => { const rect = control.getBoundingClientRect(); return rect.left < modalRect.left - 1 || rect.right > modalRect.right + 1 || rect.left < -1 || rect.right > innerWidth + 1; }).map(control => control.id || control.textContent.trim().slice(0, 20)),
      privateVisible: ['quickParentName','quickParentContact','quickHomeAddress','paymentStatus','chargeStudent','payTeacher','quickBilling','quickRate'].filter(id => {const el=document.getElementById(id),rect=el.getBoundingClientRect();return getComputedStyle(el).display!=='none'&&rect.width>0&&rect.height>0}),
      scheduleFieldsHidden: ['lessonAddress','lessonMeetingUrl','lessonNote','lessonState'].filter(id => getComputedStyle(document.getElementById(id)).display === 'none'),
      singleClickOpenedEditor: !sampleLesson || document.getElementById('lessonId').value===sampleLesson.id,
      capabilityAllowsEditing: window.calendarOwnerCanEdit?.()===true,
      ownerContextActionsHidden: [...document.querySelectorAll('#calendarContextMenu .v20-owner-action')].filter(element=>getComputedStyle(element).display==='none').length,
      filterGrid: getComputedStyle(document.querySelector('#calendar .calendar-toolbar-filters')).gridTemplateColumns,
      filterAlignments: [...document.querySelectorAll('#calendar .calendar-toolbar-filters input,#calendar .calendar-toolbar-filters select')].map(control=>getComputedStyle(control).textAlign),
      workspaceCardBackground: getComputedStyle(document.querySelector('#calendar>.card')).backgroundColor,
      wendyHeaderBackground: getComputedStyle(document.querySelector('header')).backgroundImage,
      teacherSelectAlign: getComputedStyle(document.getElementById('lessonTeacher')).textAlign,
      teacherSelectPadding: [getComputedStyle(document.getElementById('lessonTeacher')).paddingLeft,getComputedStyle(document.getElementById('lessonTeacher')).paddingRight],
      idleSelectionMarkers: [...document.querySelectorAll('#calendarCanvas .selectable:not(.selected)')].filter(card=>getComputedStyle(card,'::before').display!=='none').length,
      editingToolsHidden: ['#calendar .calendar-head-add','#calendar .calendar-quick-add','#calendar .weekly-copy-btn','#calendar #selectionModeBtn','#calendar .day-add','#courseDrawerEditBtn'].filter(selector => {
        const element=document.querySelector(selector);return !element||element.hidden||getComputedStyle(element).display==='none';
      }),
      forbiddenSections: ['dashboard','students','teachers','lessons','makeups','camps','finance','data','security'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none'),
      studentSectionVisible: getComputedStyle(document.querySelector('nav button[data-tab="students"]')).display!=='none',
      addStudentButtonVisible: getComputedStyle(document.querySelector('#lessonModal .student-select-row>button')).display!=='none',
      reportTabVisible: getComputedStyle(document.querySelector('nav button[data-tab="lessons"]')).display!=='none',
      reportShortcutExists: Boolean(document.getElementById('teacherReportShortcut')),
      selectionPosition: getComputedStyle(selectionBar).position,
      selectionContained: selectionRect.left>=calendarCardRect.left-1&&selectionRect.right<=calendarCardRect.right+1
      ,contextHiddenByDefault,contextVisibleOnCalendar,contextHiddenOnStudents,studentNavigationRejected,studentContentHidden
    };
  }, schedulerAccount);
  expect(result.modalLeft).toBeGreaterThanOrEqual(0);
  expect(result.modalRight).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.uncentered).toEqual([]);
  expect(result.escaped).toEqual([]);
  expect(result.privateVisible).toEqual([]);
  expect(result.scheduleFieldsHidden).toEqual([]);
  expect(result.singleClickOpenedEditor).toBe(true);
  expect(result.capabilityAllowsEditing).toBe(true);
  expect(result.ownerContextActionsHidden).toBe(0);
  expect(result.filterAlignments.every(value=>value==='center')).toBe(true);
  expect(result.workspaceCardBackground).toBe('rgb(255, 250, 243)');
  expect(result.wendyHeaderBackground).not.toContain('102, 80, 143');
  expect(result.teacherSelectAlign).toBe('center');
  expect(result.teacherSelectPadding[0]).toBe(result.teacherSelectPadding[1]);
  expect(result.idleSelectionMarkers).toBe(0);
  expect(result.editingToolsHidden).toEqual([]);
  expect(result.forbiddenSections).toEqual([]);
  expect(result.studentSectionVisible).toBe(false);
  expect(result.addStudentButtonVisible).toBe(true);
  expect(result.reportTabVisible).toBe(false);
  expect(result.reportShortcutExists).toBe(false);
  expect(result.selectionPosition).toBe('static');
  expect(result.selectionContained).toBe(true);
  expect(result.contextHiddenByDefault).toBe(true);
  expect(result.contextVisibleOnCalendar).toBe(true);
  expect(result.contextHiddenOnStudents).toBe(true);
  expect(result.studentNavigationRejected).toBe(true);
  expect(result.studentContentHidden).toBe(true);
});

test('English mode translates the major application workspaces', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.DanbridgeLanguage.setLanguage('en'));
  const translatedBody = await page.locator('body').textContent();
  for (const label of ['Security', 'Smart Scheduling Assistant', 'Lesson Reports', 'Notification Center', 'Finance Center']) {
    expect(translatedBody).toContain(label);
  }
  for (const untranslated of ['安全設定', '智慧排課助手', '課程回報', '通知中心', '財務中心']) {
    expect(translatedBody).not.toContain(untranslated);
  }
});

test('finance month helper stays clear of the month field', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const boxes = await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.className = 'v187-finance-month-bar';
    bar.innerHTML = '<label><span>資料月份</span><input type="month" value="2026-08"></label><small>切換後自動更新財務、老師 KPI、學生收款與支出資料</small>';
    document.body.appendChild(bar);
    const input = bar.querySelector('input').getBoundingClientRect();
    const helper = bar.querySelector('small').getBoundingClientRect();
    const result = { inputRight: input.right, inputBottom: input.bottom, helperLeft: helper.left, helperTop: helper.top };
    bar.remove();
    return result;
  });
  expect(boxes.helperLeft >= boxes.inputRight || boxes.helperTop >= boxes.inputBottom).toBe(true);
});

test('iPad lesson start and end fields do not overlap', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const boxes = await page.evaluate(() => {
    const modal = document.querySelector('#lessonModal .modal');
    modal.parentElement.classList.add('show');
    const start = document.getElementById('startTime').getBoundingClientRect();
    const end = document.getElementById('endTime').getBoundingClientRect();
    const reference = document.getElementById('lessonTitle').getBoundingClientRect();
    const startStyle = getComputedStyle(document.getElementById('startTime'));
    const endStyle = getComputedStyle(document.getElementById('endTime'));
    return { startLeft: start.left, startRight: start.right, startBottom: start.bottom, endLeft: end.left, endRight: end.right, endTop: end.top, startWidth: start.width, endWidth: end.width, referenceLeft: reference.left, referenceRight: reference.right, viewportWidth: innerWidth, startFormat: document.getElementById('startTime').dataset.timeFormat, endFormat: document.getElementById('endTime').dataset.timeFormat };
  });
  expect(boxes.endLeft >= boxes.startRight || boxes.endTop >= boxes.startBottom).toBe(true);
  expect(Math.abs(boxes.startWidth - boxes.endWidth)).toBeLessThanOrEqual(2);
  if (boxes.viewportWidth <= 700) {
    expect(Math.abs(boxes.startLeft - boxes.referenceLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxes.endLeft - boxes.referenceLeft)).toBeLessThanOrEqual(2);
    expect(boxes.startRight).toBeLessThanOrEqual(boxes.referenceRight + 1);
    expect(boxes.endRight).toBeLessThanOrEqual(boxes.referenceRight + 1);
    expect(boxes.startFormat).toBe('24-hour');
    expect(boxes.endFormat).toBe('24-hour');
  }
});

test('lesson start and end time values are centered with balanced inset', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => ['startTime','endTime'].map(id => {
    const style = getComputedStyle(document.getElementById(id));
    return { textAlign: style.textAlign, paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight), viewportWidth: innerWidth };
  }));
  for (const field of result) {
    expect(field.textAlign).toBe('center');
    expect(Math.abs(field.paddingLeft - field.paddingRight)).toBeLessThanOrEqual(1);
    expect(field.paddingLeft).toBeGreaterThanOrEqual(field.viewportWidth <= 700 ? 16 : 40);
  }
});

test('all editable time fields use locale-independent 24-hour controls', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(() => ['startTime','endTime','campTimeStart','campTimeEnd','winterCampTimeStart','winterCampTimeEnd'].map(id => {
    const field=document.getElementById(id);
    return {id,tag:field?.tagName,format:field?.dataset.timeFormat,first:field?.options?.[0]?.textContent,last:field?.options?.[field.options.length-1]?.textContent,count:field?.options?.length};
  }));
  for(const field of result){
    expect(field.tag).toBe('SELECT');
    expect(field.format).toBe('24-hour');
    expect(field.first).toBe('00:00');
    expect(field.last).toBe('23:55');
    expect(field.count).toBe(288);
  }
});

test('Windows receives its isolated performance profile', async ({ browser }) => {
  const context=await browser.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'});
  const page=await context.newPage();
  await page.addInitScript(()=>Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'Win32'}));
  await page.goto('/index.html',{waitUntil:'load'});
  await expect(page.locator('html')).toHaveClass(/danbridge-windows/);
  const result=await page.evaluate(()=>({isWindows:window.DanbridgePlatform?.isWindows,backdropFilter:getComputedStyle(document.getElementById('lessonModal')).backdropFilter,cardTransition:getComputedStyle(document.querySelector('.card')).transitionDuration}));
  expect(result.isWindows).toBe(true);
  expect(result.backdropFilter).toBe('none');
  expect(result.cardTransition).toBe('0s');
  await context.close();
});

test('non-Windows devices do not receive Windows performance overrides', async ({ browser }) => {
  const context=await browser.newContext({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'platform',{configurable:true,get:()=> 'MacIntel'});
    if('userAgentData' in navigator)Object.defineProperty(navigator,'userAgentData',{configurable:true,get:()=>undefined});
  });
  await page.goto('/index.html',{waitUntil:'load'});
  const result=await page.evaluate(()=>({isWindows:window.DanbridgePlatform?.isWindows,hasClass:document.documentElement.classList.contains('danbridge-windows')}));
  expect(result.isWindows).toBe(false);
  expect(result.hasClass).toBe(false);
  await context.close();
});

test('mobile lesson date and all single-line editor controls are contained and centered', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    const backdrop = document.getElementById('lessonModal');
    backdrop.classList.add('show');
    const modal = backdrop.querySelector('.modal');
    const modalRect = modal.getBoundingClientRect();
    const date = document.getElementById('lessonDate');
    date.value = '2026-08-10';
    const dateRect = date.getBoundingClientRect();
    const controls = [...modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,.btn')]
      .filter(control => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map(control => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return {
          id: control.id || control.textContent.trim().slice(0, 20),
          align: style.textAlign,
          lineHeight: style.lineHeight,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          height: rect.height
        };
      });
    return {
      viewportWidth: innerWidth,
      modalLeft: modalRect.left,
      modalRight: modalRect.right,
      dateLeft: dateRect.left,
      dateRight: dateRect.right,
      dateHeight: dateRect.height,
      dateAlign: getComputedStyle(date).textAlign,
      controls
    };
  });
  expect(result.dateAlign).toBe('center');
  expect(result.dateHeight).toBeLessThanOrEqual(52);
  expect(result.dateHeight).toBeGreaterThanOrEqual(48);
  expect(result.dateLeft).toBeGreaterThanOrEqual(result.modalLeft + 14);
  expect(result.dateRight).toBeLessThanOrEqual(result.modalRight - 14);
  for (const control of result.controls) {
    expect(control.align, control.id).toBe('center');
    expect(control.left, control.id).toBeGreaterThanOrEqual(result.modalLeft + 14);
    expect(control.right, control.id).toBeLessThanOrEqual(result.modalRight - 14);
    expect(control.height, control.id).toBeLessThanOrEqual(52);
  }
});

test('desktop roles use document scrolling instead of a sidebar scrollbar', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    return { width: window.innerWidth, overflow: getComputedStyle(document.querySelector('body > nav')).overflowY };
  });
  if (result.width >= 1100) expect(result.overflow).toBe('visible');
});

test('student teacher filter stays inside the viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    document.getElementById('authScreen')?.classList.add('hidden');
    document.querySelectorAll('[data-auth-isolated]').forEach(element => {
      element.inert = false;element.removeAttribute('aria-hidden');delete element.dataset.authIsolated;
    });
    window.switchTab('students');
    window.renderStudents?.();
    const filter = document.getElementById('crmTeacherFilter');
    const rect = filter?.getBoundingClientRect() || { left: -1, right: innerWidth + 1 };
    return { exists: !!filter, left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(result.exists).toBe(true);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width);
});

test('lesson report dialog scrolls independently for every role and viewport', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  for (const role of ['owner', 'branch_manager', 'teacher']) {
    const result = await page.evaluate(currentRole => {
      document.body.classList.remove('auth-locked', 'teacher-cloud-role', 'branch-manager-cloud-role');
      document.body.classList.toggle('teacher-cloud-role', currentRole === 'teacher');
      document.body.classList.toggle('branch-manager-cloud-role', currentRole === 'branch_manager');
      document.body.dataset.cloudRole = currentRole;
      document.body.dataset.roleUx = currentRole;
      const backdrop = document.getElementById('teacherReportModal');
      const dialog = backdrop.querySelector('.modal');
      backdrop.classList.add('show');
      const style = getComputedStyle(dialog);
      const rect = dialog.getBoundingClientRect();
      const output = { overflowY: style.overflowY, top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight };
      backdrop.classList.remove('show');
      return output;
    }, role);
    expect(['auto', 'scroll']).toContain(result.overflowY);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
  }
});

test('read-only lesson report actions stay hidden under responsive teacher styles', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    document.body.classList.add('teacher-cloud-role');
    const modal = document.getElementById('teacherReportModal');
    modal.dataset.readOnly = 'true';
    const ids = ['startClassFocusBtn', 'quickCompleteTeacherReportBtn', 'saveTeacherReportBtn'];
    return ids.map(id => {
      const button = document.getElementById(id);
      button.hidden = true;
      return { id, hidden: button.hidden, display: getComputedStyle(button).display };
    });
  });
  expect(result).toEqual([
    { id: 'startClassFocusBtn', hidden: true, display: 'none' },
    { id: 'quickCompleteTeacherReportBtn', hidden: true, display: 'none' },
    { id: 'saveTeacherReportBtn', hidden: true, display: 'none' }
  ]);
});

test('lesson editor scrolls independently above the mobile navigation', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const backdrop = document.getElementById('lessonModal');
    const dialog = backdrop.querySelector('.modal');
    backdrop.classList.add('show');
    const style = getComputedStyle(dialog);
    const backdropStyle = getComputedStyle(backdrop);
    const rect = dialog.getBoundingClientRect();
    const nav = document.querySelector('nav');
    return {
      overflowY: style.overflowY,
      touchAction: style.touchAction,
      backdropOverflow: backdropStyle.overflowY,
      modalZ: Number(backdropStyle.zIndex),
      navZ: nav ? Number(getComputedStyle(nav).zIndex) : 0,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: innerHeight
    };
  });
  expect(['auto', 'scroll']).toContain(result.overflowY);
  expect(result.touchAction).toContain('pan-y');
  expect(result.backdropOverflow).toBe('hidden');
  expect(result.modalZ).toBeGreaterThan(result.navZ);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
});

test('owner metric grids and numeric fields stay centered', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.dataset.cloudRole = 'owner';
    const metric = document.querySelector('.metric');
    const number = document.getElementById('studentRate');
    return {
      metricAlign: metric ? getComputedStyle(metric).textAlign : '',
      metricItems: metric ? getComputedStyle(metric).alignItems : '',
      numberAlign: number ? getComputedStyle(number).textAlign : ''
    };
  });
  expect(result.metricAlign).toBe('center');
  expect(result.metricItems).toBe('center');
  expect(result.numberAlign).toBe('center');
});

test('mobile lesson dates, record month and form controls use consistent typography', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    const lessonDate = document.getElementById('lessonDate');
    const lessonMonth = document.getElementById('lessonMonth');
    const label = document.querySelector('#lessonModal label');
    const input = document.getElementById('lessonTitle');
    const button = document.querySelector('#lessonModal .btn');
    const color = document.getElementById('teacherColor');
    return {
      dateAlign: getComputedStyle(lessonDate).textAlign,
      monthAlign: getComputedStyle(lessonMonth).textAlign,
      labelWeight: getComputedStyle(label).fontWeight,
      inputWeight: getComputedStyle(input).fontWeight,
      buttonWeight: getComputedStyle(button).fontWeight,
      inputSize: getComputedStyle(input).fontSize,
      buttonSize: getComputedStyle(button).fontSize,
      colorWidth: color.getBoundingClientRect().width,
      viewportWidth: innerWidth
    };
  });
  expect(result.dateAlign).toBe('center');
  expect(result.monthAlign).toBe('center');
  if (result.viewportWidth <= 700) {
    expect(result.labelWeight).toBe('700');
    expect(result.inputWeight).toBe('700');
    expect(result.buttonWeight).toBe('700');
    expect(result.inputSize).toBe(result.buttonSize);
  }
  expect(result.colorWidth).toBeLessThanOrEqual(70);
});

test('all workspaces use the unified responsive control system', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const sections = [...document.querySelectorAll('main section')];
    const problems = [];
    const expectedFieldHeight = 44;
    const expectedButtonHeight = 44;
    for (const section of sections) {
      sections.forEach(item => item.classList.toggle('active', item === section));
      const controls = section.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"]),select,textarea');
      for (const control of controls) {
        const style = getComputedStyle(control);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = control.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cssHeight = parseFloat(style.height);
        if (cssHeight + 1 < expectedFieldHeight || rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${section.id}:${control.id || control.tagName}:field:h${Math.round(cssHeight)}:l${Math.round(rect.left)}:r${Math.round(rect.right)}:vw${innerWidth}`);
      }
      for (const button of section.querySelectorAll('.btn')) {
        const style = getComputedStyle(button);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = button.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cssMinHeight = parseFloat(style.minHeight);
        if (cssMinHeight + 1 < expectedButtonHeight || rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${section.id}:${button.id || button.textContent.trim().slice(0,20)}:button:h${Math.round(cssMinHeight)}:l${Math.round(rect.left)}:r${Math.round(rect.right)}:vw${innerWidth}`);
      }
    }
    return {
      problems,
      expectedFieldHeight,
      expectedButtonHeight,
      premiumSheet: [...document.styleSheets].find(sheet => sheet.href?.includes('78-v20259'))?.href || ''
    };
  });
  expect(result.premiumSheet).toContain('78-v20259-premium-responsive-controls.css');
  expect(result.problems).toEqual([]);
});

test('winter and summer registration month stays inside its card', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    const camps = document.getElementById('camps');
    camps.classList.add('active');
    const month = document.getElementById('summerRegistrationMonth');
    const card = month.parentElement;
    const label = card.querySelector(':scope > label');
    const cardRect = card.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const monthRect = month.getBoundingClientRect();
    const style = getComputedStyle(card);
    return {
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      labelLeft: labelRect.left,
      labelTop: labelRect.top,
      labelBottom: labelRect.bottom,
      monthLeft: monthRect.left,
      monthRight: monthRect.right,
      monthBottom: monthRect.bottom,
      paddingLeft: parseFloat(style.paddingLeft),
      paddingTop: parseFloat(style.paddingTop),
      monthAlign: getComputedStyle(month).textAlign
    };
  });
  expect(result.paddingLeft).toBeGreaterThanOrEqual(14);
  expect(result.paddingTop).toBeGreaterThanOrEqual(14);
  expect(result.labelLeft).toBeGreaterThanOrEqual(result.cardLeft + 13);
  expect(result.labelTop).toBeGreaterThanOrEqual(result.cardTop + 13);
  expect(result.labelBottom).toBeLessThan(result.monthBottom);
  expect(result.monthLeft).toBeGreaterThanOrEqual(result.cardLeft + 13);
  expect(result.monthRight).toBeLessThanOrEqual(result.cardRight - 13);
  expect(result.monthBottom).toBeLessThanOrEqual(result.cardBottom - 13);
  expect(result.monthAlign).toBe('center');
});

test('form fields do not show redundant placeholder hints', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[placeholder]')).toHaveCount(0);
});

test('public entry has no horizontal viewport overflow', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('Wendy receives an orange interface while lesson room colors stay unchanged', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const colors = await page.evaluate(() => {
    document.body.classList.add('teacher-cloud-role');
    document.body.dataset.cloudDisplayName = 'Wendy';
    document.body.classList.remove('auth-locked');
    const normal = document.createElement('div'); normal.className = 'week-event'; normal.style.setProperty('--location-bg','#dbeafe');
    document.querySelector('#calendarCanvas')?.append(normal);
    const result = { header: getComputedStyle(document.querySelector('body>header')).backgroundImage, nav: getComputedStyle(document.querySelector('body>nav')).backgroundImage, lesson: getComputedStyle(normal).backgroundImage };
    normal.remove(); return result;
  });
  expect(colors.header).toContain('187, 100, 40');
  expect(colors.nav).toContain('169, 85, 32');
  expect(colors.lesson).not.toContain('255, 247, 237');
});

test('Owner navigation uses a restrained premium gold palette', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const colors = await page.evaluate(() => {
    document.body.classList.remove('auth-locked');
    document.body.dataset.cloudRole = 'owner';
    const nav = document.querySelector('body>nav');
    const active = nav?.querySelector('button'); active?.classList.add('active');
    return { nav: getComputedStyle(nav).backgroundImage, active: active ? getComputedStyle(active).backgroundImage : '' };
  });
  expect(colors.nav).toContain('102, 81, 40');
  expect(colors.nav).toContain('123, 99, 49');
  expect(colors.active).toContain('214, 174, 67');
});

test('iPad install action opens usable Safari guidance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-webkit');
  await page.goto('/index.html', { waitUntil: 'load' });
  const install = page.locator('#pwaInstallBtn');
  await expect(install).toHaveCount(1);
  await install.evaluate(element => element.click());
  const guide = page.locator('#pwaInstallGuide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('加入主畫面');
  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await guide.locator('.pwa-guide-done').evaluate(element => element.click());
  await expect(guide).toBeHidden();
});
