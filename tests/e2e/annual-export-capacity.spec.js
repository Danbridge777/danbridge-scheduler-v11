const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('桌機實際匯出分布於一整年的 30,000 堂課，首尾資料與總數完整',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','30,000 筆容量驗收只需在桌機引擎執行一次');
  test.setTimeout(60_000);
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(450);
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:false});window.currentCloudRole=()=> 'owner';
    const lessons=Array.from({length:30_000},(_,index)=>{const day=new Date(Date.UTC(2026,0,1+(index%365))).toISOString().slice(0,10);return{id:`annual-${String(index).padStart(5,'0')}`,studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],date:day,start:'09:00',end:'10:00',status:'未上課',chargeStudent:'yes',payTeacher:'yes',paymentStatus:'unpaid'}});
    db={...db,students:[{id:'student-1',name:'全年容量學生',parent:'全年容量家長',courseType:'1對1',rate:800}],teachers:[{id:'teacher-1',name:'全年容量老師',payrollMode:'hourly',rate:600,minWeeklyHours:0,workDays:[1,2,3,4,5]}],lessons,summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],teacherLeaveRecords:[]};
    window.renderSettlementMonthOptions();window.setFinanceWorkspaceMonth('2026-12',false);window.switchTab('finance');
  });
  await page.waitForTimeout(50);
  await page.evaluate(()=>window.activateFinancePane('collections'));
  await expect(page.locator('#downloadAnnualSettlementExcel')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#downloadAnnualSettlementExcel').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('Danbridge-2026-年度資料.xls');
  const annualExcel=await fs.readFile(await download.path(),'utf8');
  expect(annualExcel).toContain('<td>30000</td>');
  expect(annualExcel).toContain('annual-00000');
  expect(annualExcel).toContain('annual-29999');
  expect(annualExcel).toContain('全年容量家長');
  await expect(page.locator('#settleMonth')).toHaveValue('2026-12');
});
