const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test('long leave notes retain a reachable edit/cancel column',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess={getContext:()=>({role:'owner'})};
  db.teachers=[{id:'fixture_teacher',name:'STAGING_SHADOW_TEACHER'}];
  window.switchTab('teacherLeave');document.getElementById('teacherLeaveMonth').value='2026-09';
  window.__danbridgeSetTeacherLeaves([{id:'fixture_leave',leaveId:'fixture_leave',teacherId:'fixture_teacher',teacherName:'STAGING_SHADOW_TEACHER',date:'2026-09-18',start:'09:00',end:'10:00',hours:1,leaveType:'personal',note:'STAGING_AUDIT339_TEACHER_LEAVE_20260918'.repeat(10),status:'pending',revision:2}]);
 });
 const edit=page.locator('#teacherLeaveRows').getByRole('button',{name:'編輯',exact:true});
 await edit.click();await expect(page.locator('#teacherLeaveSaveBtn')).toHaveText('更新申請');
 await expect(page.locator('#teacherLeaveNote')).toHaveValue('STAGING_AUDIT339_TEACHER_LEAVE_20260918'.repeat(10));
 const fits=await page.locator('#teacherLeave .table-wrap').evaluate(el=>el.scrollWidth<=Math.max(el.clientWidth,900)+3);
 expect(fits).toBe(true);
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#teacherLeaveRows').getByRole('button',{name:'取消',exact:true}).click();
});
