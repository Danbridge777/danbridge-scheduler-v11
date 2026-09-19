const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test('restored and switched non-Owner roles never see or enable immediate approval; unsent input survives',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  db={...db,teachers:[{id:'teacher-one',name:'Role fixture',employmentStartDate:'2022-01-01'}],students:[],lessons:[]};
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.switchTab('teacherLeave');window.clearTeacherLeaveForm();
 });
 const approve=page.locator('#teacherLeaveApproveImmediately'),wrap=page.locator('#teacherLeaveOwnerApproveWrap');
 await expect(wrap).toBeVisible();await expect(approve).toBeEnabled();await expect(approve).toBeChecked();
 await page.locator('#teacherLeaveNote').fill('Keep unsent role-change note');
 for(const role of [{role:'teacher',canManageSchedule:false},{role:'teacher',canManageSchedule:true},{role:'branch_manager',canManageSchedule:false}]){
  await page.evaluate(role=>{window.DanbridgeAccess.setContext({...role,email:'teacher@example.com',teacherId:'teacher-one',branchIds:['east']});window.renderTeacherLeaves()},role);
  await expect(wrap).toBeHidden();await expect(approve).toBeDisabled();await expect(approve).not.toBeChecked();await expect(page.locator('#teacherLeaveNote')).toHaveValue('Keep unsent role-change note');
 }
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.renderTeacherLeaves()});
 await expect(wrap).toBeVisible();await expect(approve).toBeEnabled();await expect(approve).not.toBeChecked();
 await page.locator('#teacherLeaveType').selectOption('annual');await expect(page.locator('#teacherLeaveBereavementWrap')).toBeHidden();
 await page.locator('#teacherLeaveType').selectOption('bereavement');await expect(page.locator('#teacherLeaveBereavementWrap')).toBeVisible();
});

test('Owner 審核前後顯示 14/14 到 13/14，並列出漏課學生與時數',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',teacherId:'',canManageSchedule:false});
  db={...db,teachers:[{id:'teacher-one',name:'Wendy',employmentStartDate:'2022-01-01',standardDailyHours:8}],students:[{id:'student-one',name:'Alice'}],lessons:[{id:'lesson-one',teacherId:'teacher-one',studentId:'student-one',date:'2026-09-21',start:'09:00',end:'10:00',status:'未上課'}]};
  window.__approvalPayload=null;window.__danbridgeSaveTeacherLeave=async payload=>{window.__approvalPayload=structuredClone(payload);return{ok:true}};window.switchTab('teacherLeave');document.getElementById('teacherLeaveYear').value='2026';document.getElementById('teacherLeaveBalanceTeacher').value='teacher-one';window.__danbridgeSetTeacherLeaves([{id:'leave-one',leaveId:'leave-one',teacherId:'teacher-one',teacherName:'Wendy',leaveType:'annual',date:'2026-09-21',start:'09:00',end:'17:00',hours:8,days:1,status:'pending',revision:1}]);
 });
 await expect(page.locator('#teacherLeaveQuotaGrid')).toContainText('14/14');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('Alice');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('1 小時');await page.locator('#teacherLeavePendingQueue').getByRole('button',{name:'核准'}).click();await expect.poll(()=>page.evaluate(()=>window.__approvalPayload)).toMatchObject({action:'approve',leaveId:'leave-one',expectedRevision:1});
 await page.evaluate(()=>window.__danbridgeSetTeacherLeaves([{id:'leave-one',leaveId:'leave-one',teacherId:'teacher-one',teacherName:'Wendy',leaveType:'annual',date:'2026-09-21',start:'09:00',end:'17:00',hours:8,days:1,status:'approved',revision:2,requiresCompletion:true}]));await expect(page.locator('#teacherLeaveQuotaGrid')).toContainText('13/14');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('尚未按完成');await expect(page.locator('#teacherLeaveDashboardBadge')).toHaveText('1');
});
