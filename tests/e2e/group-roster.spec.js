const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test('建立團班、勾選同名不同家長學生、課表存名單並按月產生各自帳單',async({page})=>{
 await isolateApplicationAuth(page);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:true});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'kid-a',name:'小安',parent:'王家長',courseType:'1對1',rate:600},{id:'kid-b',name:'小安',parent:'李家長',courseType:'團班',rate:800}],lessons:[],teachers:[{id:'t',name:'測試老師',rate:500}],summerCampRegistrations:[],winterCampRegistrations:[]};
  saveDB=()=>{renderSelects();renderStudents()};commitScheduleMutation=()=>{};
  renderSelects();switchTab('students');renderStudents();renderStudentGroupRoster();
 });
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
 await page.locator('#createGroupRosterButton').click();
 await expect(page.locator('#studentGroupMembersWrap')).toBeVisible();
 const controlSizes=await page.evaluate(()=>['studentIsGroupRoster','studentName','studentCourseType'].map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect(),s=getComputedStyle(el);return{id,width:r.width,height:r.height,appearance:s.appearance}}));
 expect(controlSizes[0]).toMatchObject({width:18,height:18,appearance:'none'});
 expect(controlSizes[1].height).toBe(48);expect(controlSizes[2].height).toBe(48);
 await page.locator('#studentGroupMembers input[value="kid-a"]').focus();
 await page.keyboard.press('Space');
 await expect(page.locator('#studentGroupMembers input[value="kid-a"]')).toBeChecked();
 await page.keyboard.press('Space');
 await expect(page.locator('#studentGroupMembers input[value="kid-a"]')).not.toBeChecked();
 await page.locator('#studentName').fill('週二英文團班');
 await page.locator('#studentBillingBranch').selectOption('hexi');
 await page.locator('#studentGroupMembers input[value="kid-a"]').check();
 await page.locator('#studentGroupMembers input[value="kid-b"]').check();
 await expect(page.locator('#studentGroupMembers')).toContainText('王家長');
 await expect(page.locator('#studentGroupMembers')).toContainText('李家長');
 await page.locator('#studentGroupFields').screenshot({path:require('node:path').join(require('node:os').tmpdir(),'danbridge-group-roster-controls-'+test.info().project.name+'.png')});
 await page.locator('#students button[onclick="saveStudent()"]').click();
 const id=await page.evaluate(()=>db.students.find(s=>s.isGroupRoster)?.id);expect(id).toBeTruthy();
 await page.evaluate(()=>openLessonModal('2026-09-08','16:00'));
 await page.locator('#lessonStudent').selectOption(id);
 await page.locator('#lessonTeacher').selectOption('t');
 await page.locator('#lessonBranch').selectOption('art_museum');
 await expect(page.locator('#lessonBillingBranch')).toHaveValue('hexi');
 await page.locator('#endTime').selectOption('17:30');
 await expect(page.locator('#lessonGroupStudents input:checked')).toHaveCount(2);
 await page.locator('#lessonModal button[onclick="saveLesson()"]').click();
 const result=await page.evaluate(()=>({lessons:db.lessons,wang:studentLineBillingText('kid-a','2026-09'),lee:studentLineBillingText('kid-b','2026-09'),total:studentTuitionRevenue('2026-09'),oct:studentTuitionRevenue('2026-10'),names:lessonGroupRosterText(db.lessons[0])}));
 expect(dialogs).toEqual([]);expect(result.lessons).toHaveLength(1);expect(result.lessons[0].groupStudentIds).toEqual(['kid-a','kid-b']);
 expect(result.total).toBe(2100);expect(result.oct).toBe(0);
 expect(result.wang).toContain('NT$900');expect(result.wang).not.toContain('李家長');
 expect(result.lee).toContain('NT$1,200');expect(result.lee).not.toContain('王家長');
 expect(result.names).toBe('小安、小安');
 await page.evaluate(()=>{switchTab('finance');window.__danbridgeFinanceWorkspaceMonth='2026-09';document.getElementById('settleMonth').value='2026-09';renderSettlement()});
 await expect(page.locator('#studentSettleRows tr')).toHaveCount(2);
 await expect(page.locator('#studentSettleRows')).toContainText('NT$900');
 await expect(page.locator('#studentSettleRows')).toContainText('NT$1,200');
 await expect(page.locator('#studentSettleRows')).not.toContainText('週二英文團班');
 const actualSettlement=await page.evaluate(()=>{const d=settleData();return{amount:d.sr.reduce((n,r)=>n+r.amount,0),teacherHours:d.tr[0].h,teacherPay:d.tr[0].amount}});
 expect(actualSettlement).toEqual({amount:2100,teacherHours:1.5,teacherPay:750});
 const campusPayroll=await page.evaluate(()=>{
  const d=window.DanbridgeBranchBusiness;
  return ['hexi','art_museum'].map(scope=>{const x=d.settlementDataFor('2026-09',scope);return {scope,revenue:x.sr.reduce((n,r)=>n+r.amount,0),hours:x.tr.reduce((n,r)=>n+r.h,0),pay:x.tr.reduce((n,r)=>n+r.amount,0)}});
 });
 expect(campusPayroll).toEqual([{scope:'hexi',revenue:2100,hours:0,pay:0},{scope:'art_museum',revenue:0,hours:1.5,pay:750}]);
 expect(await page.evaluate(()=>({hexi:studentTuitionRevenue('2026-09','hexi'),art:studentTuitionRevenue('2026-09','art_museum')}))).toEqual({hexi:2100,art:0});
 await page.evaluate(()=>switchTab('students'));
 await page.evaluate(id=>editStudent(id),id);
 await page.locator('#studentGroupMembers input[value="kid-b"]').uncheck();
 await page.locator('#students button[onclick="saveStudent()"]').click();
 expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(2100);
 await page.evaluate(id=>openLessonModal('2026-09-08','16:00',id),result.lessons[0].id);
 await expect(page.locator('#lessonGroupStudents input:checked')).toHaveCount(2);
 await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'danbridge-group-roster-'+test.info().project.name+'.png'),fullPage:false});
});

test('公司營收按歸屬校區分帳，跨校上課不改歸屬，未設定金額不漏列，切月份同步更新',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.waitForFunction(()=>!!document.querySelector('.v181-finance-nav'));
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','scheduler-cloud-role');
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  const l=(id,studentId,date,hours,extra={})=>({id,studentId,date,start:'16:00',end:hours===2?'18:00':'17:00',teacherId:'t',teacherIds:['t'],branchId:'art_museum',location:'美術東四路',room:'教室 1',status:'未上課',...extra});
  db={...db,students:[{id:'a',name:'同名',parent:'王家長',rate:600,courseType:'1對1',billingBranchId:'hexi',attendanceBranchId:'art_museum'},
   {id:'b',name:'同名',parent:'李家長',rate:800,courseType:'1對1',billingBranchId:'art_museum'},
   {id:'care',name:'月費學生',parent:'陳家長',rate:9000,courseType:'安親',billingBranchId:'hexi'},
   {id:'missing',name:'未設定學生',parent:'未設定家長',rate:500,courseType:'1對1',branchIds:['art_museum']}],
   teachers:[{id:'t',name:'測試老師',rate:500}],lessons:[l('a-sep','a','2026-09-01',2),l('b-sep','b','2026-09-02',1),l('missing-sep','missing','2026-09-03',1),l('a-oct','a','2026-10-01',1)],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[]};
  saveDB=()=>{renderSelects();renderStudents()};renderSelects();editStudent('a');
 });
 await expect(page.locator('#studentBillingBranch')).toHaveValue('hexi');
 await expect(page.locator('#studentAttendanceBranch')).toHaveValue('art_museum');
 await page.locator('#studentAttendanceBranch').selectOption('hexi');
 await page.locator('#students button[onclick="saveStudent()"]').click();
 await page.evaluate(()=>{switchTab('finance');document.getElementById('v187FinanceMonthOverview').value='2026-09';document.getElementById('v187FinanceMonthOverview').dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('#financeRevenue')).toHaveText('NT$11,500');
 await expect(page.locator('#financeUnassignedRevenue')).toContainText('NT$500');
 await page.locator('#financeBranchScope').selectOption('hexi');await expect(page.locator('#financeRevenue')).toHaveText('NT$10,200');
 await page.locator('#financeBranchScope').selectOption('art_museum');await expect(page.locator('#financeRevenue')).toHaveText('NT$800');
 await page.locator('#financeBranchScope').selectOption('unassigned');await expect(page.locator('#financeRevenue')).toHaveText('NT$500');
 await page.locator('#financeBranchScope').selectOption('all');
 await page.locator('#v187FinanceMonthOverview').fill('2026-10');await page.locator('#v187FinanceMonthOverview').dispatchEvent('change');
 await expect(page.locator('#financeRevenue')).toHaveText('NT$9,600');
});
