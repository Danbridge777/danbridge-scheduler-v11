const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('財務四個分頁先立即切換畫面，再於下一幀更新計算',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(350);
  await page.evaluate(()=>{document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';window.renderAll();window.switchTab('finance');window.__financeDeferredCalls=0;window.renderFinance=()=>window.__financeDeferredCalls++;window.renderSettlement=()=>window.__financeDeferredCalls++;window.renderTeacherKpi=()=>window.__financeDeferredCalls++});
  for(const pane of ['kpi','collections','expenses','overview']){
    const immediate=await page.evaluate(pane=>{window.__financeDeferredCalls=0;window.activateFinancePane(pane);return{calls:window.__financeDeferredCalls,button:document.querySelector(`.v181-finance-nav button[data-pane="${pane}"]`)?.classList.contains('active'),panel:document.querySelector(`.v181-finance-pane[data-pane="${pane}"]`)?.classList.contains('active')}},pane);
    expect(immediate).toEqual({calls:0,button:true,panel:true});
    await expect.poll(()=>page.evaluate(()=>window.__financeDeferredCalls)).toBeGreaterThan(0);
  }
});

test('財務分頁選中狀態以金色線條清楚標示且不靠淡色反白',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(350);
  await page.addStyleTag({content:'.v181-finance-nav button{transition:none!important}'});
  await page.evaluate(()=>{document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';window.renderAll();window.switchTab('finance')});
  const overview=page.locator('.v181-finance-nav button[data-pane="overview"]');
  const kpi=page.locator('.v181-finance-nav button[data-pane="kpi"]');
  await expect(overview).toHaveAttribute('aria-selected','true');
  const initial=await overview.evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundImage,border:s.borderColor,color:s.color,shadow:s.boxShadow}});
  expect(initial.background).toContain('linear-gradient');
  expect(initial.border).toBe('rgb(181, 138, 44)');
  expect(initial.color).toBe('rgb(23, 47, 70)');
  expect(initial.shadow).toContain('rgb(181, 138, 44)');
  await kpi.click();
  await expect(kpi).toHaveAttribute('aria-selected','true');
  await expect(overview).toHaveAttribute('aria-selected','false');
  const changed=await kpi.evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundImage,border:s.borderColor,color:s.color}});
  expect(changed).toEqual(expect.objectContaining({border:'rgb(181, 138, 44)',color:'rgb(23, 47, 70)'}));
  expect(changed.background).toContain('linear-gradient');
});

test('切換月份會同步更新家庭帳單、老師工時、底薪與請假扣款',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(450);
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:false});window.currentCloudRole=()=> 'owner';
    const workdayRows=month=>{const[y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),rows=[];for(let day=1;day<=last;day++){const date=`${month}-${String(day).padStart(2,'0')}`,weekday=new Date(`${date}T12:00:00`).getDay();if(weekday>=1&&weekday<=5)rows.push({id:`salary-${date}`,studentId:'salary-student',teacherId:'teacher-1',teacherIds:['teacher-1'],date,start:'09:00',end:'17:00',status:'未上課',chargeStudent:'no'})}return rows};
    db={...db,students:[{id:'child',name:'小安',parent:'王小美',courseType:'1對1',rate:800},{id:'salary-student',name:'薪資測試',parent:'內部測試',courseType:'1對1',rate:0}],teachers:[{id:'teacher-1',name:'Wendy',payrollMode:'fixed',baseSalary:44000,overtimeRate:500,deductionRate:300,minWeeklyHours:40,workDays:[1,2,3,4,5],rate:0}],lessons:[...workdayRows('2026-08'),...workdayRows('2026-09'),{id:'family-aug',studentId:'child',teacherId:'billing-teacher',teacherIds:['billing-teacher'],date:'2026-08-03',start:'18:00',end:'19:00',status:'未上課'},{id:'family-sep',studentId:'child',teacherId:'billing-teacher',teacherIds:['billing-teacher'],date:'2026-09-04',start:'18:00',end:'20:00',status:'未上課'}],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[]};
    window.__danbridgeSetTeacherLeaves([{id:'leave-sep',teacherId:'teacher-1',teacherName:'Wendy',leaveType:'personal',date:'2026-09-07',start:'09:00',end:'17:00',hours:8,status:'active',revision:1}]);
    window.renderAll();window.switchTab('finance');window.activateFinancePane('kpi');
  });

  const overviewMonth=page.locator('#v187FinanceMonthOverview');
  await overviewMonth.fill('2026-08');await overviewMonth.dispatchEvent('input');
  for(const id of ['financeMonth','settleMonth','teacherKpiMonth','oneTimeExpenseMonth'])await expect(page.locator(`#${id}`)).toHaveValue('2026-08');
  await page.locator('.v181-finance-nav button[data-pane="kpi"]').click();
  await expect(page.locator('#teacherPayCards')).toContainText('本月 21 個工作日');
  await expect(page.locator('#teacherPayCards')).toContainText('NT$44,000');
  await page.evaluate(()=>window.copyStudentLineBilling('child','2026-08','all',encodeURIComponent('child'),'summer'));
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/8\/3 18:00–19:00/);
  await expect(page.locator('#v181LineBillingPreviewText')).not.toHaveValue(/9\/4/);
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/8月共計：NT\$800/);
  await page.locator('#v181LineBillingPreview .v181-line-preview-actions .btn:not(.primary)').click();

  await page.locator('.v181-finance-nav button[data-pane="kpi"]').click();
  const kpiMonth=page.locator('#v187FinanceMonthKpi');
  await expect(kpiMonth).toBeVisible();
  await kpiMonth.fill('2026-09');await kpiMonth.dispatchEvent('input');
  for(const id of ['financeMonth','settleMonth','teacherKpiMonth','oneTimeExpenseMonth'])await expect(page.locator(`#${id}`)).toHaveValue('2026-09');
  await expect(page.locator('#teacherPayCards')).toContainText('本月 22 個工作日');
  await expect(page.locator('#teacherPayCards')).toContainText('請假 8 hr × NT$250');
  await expect(page.locator('#teacherPayCards')).toContainText('NT$42,000');
  await page.evaluate(()=>window.copyStudentLineBilling('child','2026-09','all',encodeURIComponent('child'),'summer'));
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/9\/4 18:00–20:00/);
  await expect(page.locator('#v181LineBillingPreviewText')).not.toHaveValue(/8\/3/);
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/9月共計：NT\$1,600/);
  await page.locator('#v181LineBillingPreview .v181-line-preview-actions .btn:not(.primary)').click();

  await page.evaluate(()=>window.activateFinancePane('collections'));
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#downloadAnnualSettlementExcel').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('Danbridge-2026-年度資料.xls');
  const annualExcel=await fs.readFile(await download.path(),'utf8');
  expect(annualExcel).toContain('2026-01');
  expect(annualExcel).toContain('2026-12');
  expect(annualExcel).toContain('全年正式課程逐筆明細');
  expect(annualExcel).toContain('salary-2026-08-03');
  expect(annualExcel).toContain('family-sep');
  expect(annualExcel).toContain('請假扣款');
  await expect(page.locator('#settleMonth')).toHaveValue('2026-09');
});
