const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test('Owner 登入後重設為全部校區，摘要與統計使用同一範圍',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 const expected=await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  const date=window.todayStr(),month=date.slice(0,7),tomorrowDate=new Date(date+'T00:00:00');tomorrowDate.setDate(tomorrowDate.getDate()+1);const tomorrow=window.localDate(tomorrowDate);
  db={...db,branches:[{id:'art_museum',name:'美術東四路',locations:['美術東四路']},{id:'hexi',name:'河西一路',locations:['河西一路']}],students:[{id:'s1',name:'學生一'},{id:'s2',name:'學生二'}],teachers:[{id:'t1',name:'老師一'},{id:'t2',name:'老師二'}],lessons:[{id:'l1',date,start:'10:00',end:'11:00',studentId:'s1',teacherId:'t1',branchId:'art_museum',location:'美術東四路',status:'未上課'},{id:'l2',date:tomorrow,start:'13:00',end:'14:30',studentId:'s2',teacherId:'t2',branchId:'hexi',location:'河西一路',status:'未上課'}],makeups:[],changes:[]};
  window.DanbridgeAccess.setContext({role:'branch_manager',email:'temporary@example.test',branchIds:['unassigned'],readOnly:true});window.renderDashboard();
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.test',branchIds:[]});window.renderDashboard();
  return{month,date};
 });
 await expect(page.locator('#dashboardBranchScope')).toHaveValue('all');
 await expect(page.locator('#dashboardBranchScopeNote')).toHaveText('目前顯示：全部校區');
 await expect(page.locator('#mStudents')).toHaveText('2');
 await expect(page.locator('#mTeachers')).toHaveText('2');
 await expect(page.locator('#mLessons')).toHaveText('2');
 await expect(page.locator('#v33TodayLessons')).toHaveText('1');
 await expect(page.locator('#v32TodaySummary')).toHaveText('1 堂・1.0 小時');
 await page.locator('#dashboardBranchScope').selectOption('art_museum');
 await expect(page.locator('#dashboardBranchScope')).toHaveValue('art_museum');
 await expect(page.locator('#dashboardBranchScopeNote')).toHaveText('目前顯示：美術東四路');
 await expect(page.locator('#mStudents')).toHaveText('1');
 await expect(page.locator('#mTeachers')).toHaveText('1');
 await expect(page.locator('#mLessons')).toHaveText('1');
 await expect(page.locator('#v32TodaySummary')).toHaveText('1 堂・1.0 小時');
 await page.evaluate(()=>window.renderDashboard());
 await expect(page.locator('#dashboardBranchScope')).toHaveValue('art_museum');
});
