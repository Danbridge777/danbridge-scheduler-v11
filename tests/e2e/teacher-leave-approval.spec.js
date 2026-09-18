const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test('Owner 審核前後顯示 14/14 到 13/14，並列出漏課學生與時數',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',teacherId:'',canManageSchedule:false});
  db={...db,teachers:[{id:'teacher-one',name:'Wendy',employmentStartDate:'2022-01-01',standardDailyHours:8}],students:[{id:'student-one',name:'Alice'}],lessons:[{id:'lesson-one',teacherId:'teacher-one',studentId:'student-one',date:'2026-09-21',start:'09:00',end:'10:00',status:'未上課'}]};
  window.__approvalPayload=null;window.__danbridgeSaveTeacherLeave=async payload=>{window.__approvalPayload=structuredClone(payload);return{ok:true}};window.switchTab('teacherLeave');document.getElementById('teacherLeaveYear').value='2026';document.getElementById('teacherLeaveBalanceTeacher').value='teacher-one';window.__danbridgeSetTeacherLeaves([{id:'leave-one',leaveId:'leave-one',teacherId:'teacher-one',teacherName:'Wendy',leaveType:'annual',date:'2026-09-21',start:'09:00',end:'17:00',hours:8,days:1,status:'pending',revision:1}]);
 });
 await expect(page.locator('#teacherLeaveQuotaGrid')).toContainText('14/14');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('Alice');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('1 小時');await page.locator('#teacherLeavePendingQueue').getByRole('button',{name:'核准'}).click();await expect.poll(()=>page.evaluate(()=>window.__approvalPayload)).toMatchObject({action:'approve',leaveId:'leave-one',expectedRevision:1});
 await page.evaluate(()=>window.__danbridgeSetTeacherLeaves([{id:'leave-one',leaveId:'leave-one',teacherId:'teacher-one',teacherName:'Wendy',leaveType:'annual',date:'2026-09-21',start:'09:00',end:'17:00',hours:8,days:1,status:'approved',revision:2}]));await expect(page.locator('#teacherLeaveQuotaGrid')).toContainText('13/14');await expect(page.locator('#teacherLeavePendingQueue')).toContainText('目前沒有待審核申請');
});
