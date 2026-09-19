const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
const {calculateScopedPayroll}=require('../../functions/scoped-payroll-calculator.cjs');
async function installAuthoritativePayrollFixture(page){
 const source=await page.evaluate(()=>({db,leaves:window.__danbridgeGetTeacherLeaves()}));
 // Full private data stays on the test server side after role projection.
 await page.exposeFunction('__testScopedPayrollServer',input=>({schema:'danbridge-scoped-payroll-v1',...input,rows:calculateScopedPayroll({...source,...input}),sourceRevision:'test',verifiedAt:Date.now()}));
 await page.evaluate(()=>window.__danbridgeReadScopedPayroll=input=>window.__testScopedPayrollServer(input));
}
test.beforeEach(async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.DanbridgeBranchBusiness&&window.setFinanceWorkspaceMonth);
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  const row=(id,studentId,billingBranchId,end,teacherId='fixed')=>({id,studentId,billingBranchId,branchId:billingBranchId==='hexi'?'art_museum':'hexi',date:'2026-09-01',start:'09:00',end,teacherId,teacherIds:[teacherId],status:'未上課'});
  db={...db,branches:[{id:'hexi',name:'河西一路'},{id:'art_museum',name:'美術東四路'}],students:[
   {id:'a',name:'同名',parent:'家長甲',courseType:'1對1',rate:100,billingBranchId:'art_museum'},
   {id:'b',name:'同名',parent:'家長乙',courseType:'1對1',rate:200,billingBranchId:'hexi'},
   {id:'c',name:'安親',parent:'家長丙',courseType:'安親',billing:'month',rate:3000,billingBranchId:'hexi'},
   {id:'d',name:'未歸屬',parent:'家長丁',courseType:'1對1',rate:400},
   {id:'g',name:'團課',isGroupRoster:true,groupMemberIds:['a','b'],courseType:'團班',billingBranchId:'art_museum'}
  ],teachers:[{id:'fixed',name:'正職',payrollMode:'fixed',baseSalary:1200,overtimeRate:0,deductionRate:0,minWeeklyHours:0,workDays:[1,2,3,4,5]},{id:'hourly',name:'兼職',payrollMode:'hourly',rate:500}],lessons:[row('l1','a','art_museum','10:00'),row('l2','b','hexi','12:00'),row('l3','d','unassigned','11:00'),{...row('l4','g','art_museum','13:00'),groupStudentIds:['a','b']},{...row('l5','g','art_museum','10:30','hourly'),groupStudentIds:['a','b']}],fixedExpenses:[{id:'fa',branchId:'art_museum',amount:100,startMonth:'2026-01'},{id:'fu',amount:300,startMonth:'2026-01'}],oneTimeExpenses:[{id:'oh',branchId:'hexi',amount:200,month:'2026-09'}],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],settlementRecords:[],changes:[]};
  window.__danbridgeSetTeacherLeaves([]);window.renderAll();window.setFinanceWorkspaceMonth('2026-09');window.switchTab('finance');
 });
});

test('all Owner scope selectors share four choices and revenue/payroll/profit reconcile by ownership',async({page})=>{
 const ids=['dashboardBranchScope','financeBranchScope','teacherKpiBranch','settlementBranchScope','expenseBranchScope'];
 for(const id of ids)expect(await page.locator('#'+id+' option').evaluateAll(rows=>rows.map(r=>r.value).sort())).toEqual(['all','art_museum','hexi','unassigned']);
 const cases={all:[6150,1950,600,3600],art_museum:[1750,1350,100,300],hexi:[3600,300,200,3100],unassigned:[800,300,300,200]};
 for(const [scope,expected] of Object.entries(cases)){
  await page.evaluate(scope=>window.DanbridgeBranchBusiness.setScope('kpi',scope),scope);
  for(const id of ids.slice(1))await expect(page.locator('#'+id)).toHaveValue(scope);
  const result=await page.evaluate(()=>{const f=financeData('2026-09'),s=settleData();return{summary:[f.revenue,f.payroll,f.fixedTotal+f.oneTimeTotal,f.profit],settlement:[s.sr.reduce((n,r)=>n+r.amount,0),s.tr.reduce((n,r)=>n+r.amount,0)],payrollRows:f.payrollRows.map(r=>[r.teacher.id,r.amount])}});
  expect(result.summary,scope).toEqual(expected);expect(result.settlement,scope).toEqual(expected.slice(0,2));
 }
 await page.evaluate(()=>window.DanbridgeBranchBusiness.setScope('finance','art_museum'));
 const explicitMonth=await page.evaluate(()=>financeData('2026-10','all'));
 expect(explicitMonth.m).toBe('2026-10');expect(explicitMonth.revenue).toBe(3000);
});

test('four financial panes keep left-aligned headings and visible same-height campus controls in both languages',async({page})=>{
 for(const lang of ['zh','en']){
  await page.evaluate(lang=>window.DanbridgeLanguage.setLanguage(lang),lang);
  for(const [pane,id] of [['overview','financeBranchScope'],['kpi','teacherKpiBranch'],['collections','settlementBranchScope'],['expenses','expenseBranchScope']]){
   await page.locator(`.v181-finance-nav button[data-pane="${pane}"]`).click();await expect(page.locator('#'+id)).toBeVisible();
   const style=await page.locator(`.v181-finance-pane[data-pane="${pane}"] .v181-card-title h2`).first().evaluate(el=>({align:getComputedStyle(el).textAlign,overflow:el.scrollWidth>el.clientWidth+1}));
   expect(style).toEqual({align:'left',overflow:false});
   const bounds=await page.locator('#'+id).boundingBox();expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
 }
});

test('branch financial projection must match Owner ownership costs without foreign price disclosure',async({page})=>{
 await installAuthoritativePayrollFixture(page);
 const owner=await page.evaluate(async()=>{
  const expected=financeData('2026-09','art_museum');
  const {projectProductionBranchAccessDb}=await import('/js/core/production-role-view-projection.js');
  const access={role:'branch_manager',email:'aa@example.test',teacherId:'fixed',companyId:'danbridge',active:true,readOnly:true,hideFinancials:true,canViewBranchFinance:true,branchIds:['art_museum'],scheduleBranchIds:['hexi','art_museum']};
  db=projectProductionBranchAccessDb(db,access);window.DanbridgeAccess.setContext(access);
  window.DanbridgeScopedPayroll.ensure('2026-09','art_museum');
  return [expected.revenue,expected.payroll,expected.profit];
 });
 await page.waitForFunction(()=>window.DanbridgeScopedPayroll.ensure('2026-09','art_museum'));
 const branch=await page.evaluate(()=>{const f=financeData('2026-09','art_museum'),s=settleData();return{totals:[f.revenue,f.payroll,f.profit],settlement:s.tr.reduce((sum,r)=>sum+r.amount,0)}});
 expect(branch.totals).toEqual(owner);expect(branch.settlement).toBe(owner[1]);
 await page.evaluate(()=>renderFinance());
 await expect(page.locator('#financeUnassignedRevenue')).toBeHidden();
 await expect(page.locator('#financeUnassignedRevenue')).toHaveText('');
});

test('monthly Excel and CSV preserve the same fractional payroll as the screen',async({page})=>{
 await page.evaluate(()=>{db.teachers.find(t=>t.id==='fixed').baseSalary=1200.02;window.DanbridgeBranchBusiness.setScope('settlement','hexi')});
 expect(await page.evaluate(()=>settleData().tr.reduce((sum,r)=>sum+r.amount,0))).toBe(300.01);
 for(const fn of ['downloadSettlementExcel','downloadCSV']){
  const pending=page.waitForEvent('download');await page.evaluate(fn=>window[fn](),fn);const download=await pending;
  const content=await fs.readFile(await download.path(),'utf8');expect(content).toContain('300.01');
 }
});

test('annual export follows the chosen branch, labels it, and preserves the current month',async({page})=>{
 for(const [scope,name,ids] of [['hexi','河西一路',['l2']],['art_museum','美術東四路',['l1','l4','l5']],['unassigned','未歸屬校區',['l3']]]){
  await page.evaluate(scope=>window.DanbridgeBranchBusiness.setScope('settlement',scope),scope);
  const data=await page.evaluate(()=>{const annual=annualSettlementData('2026');return{ids:annual.lessons.map(row=>row.id).sort(),september:annual.months.find(row=>row.month==='2026-09').tr.reduce((sum,row)=>sum+row.amount,0)}});
  expect(data.ids).toEqual(ids);
  const pending=page.waitForEvent('download');await page.evaluate(()=>downloadAnnualSettlementExcel());const download=await pending;
  const content=await fs.readFile(await download.path(),'utf8');expect(content).toContain('年度資料｜'+name);expect(download.suggestedFilename()).toContain(name);
  await expect(page.locator('#settleMonth')).toHaveValue('2026-09');
 }
});

test('release gate: branch fixed-pay cost includes hidden ownership denominator and approved leave',async({page})=>{
 await page.evaluate(()=>{
  Object.assign(db.teachers.find(t=>t.id==='fixed'),{minWeeklyHours:40,baseSalary:44000});
  db.lessons.find(l=>l.id==='l3').branchId='unassigned';
  window.__danbridgeSetTeacherLeaves([{id:'leave',teacherId:'fixed',leaveType:'personal',date:'2026-09-07',start:'09:00',end:'17:00',status:'approved'}]);
 });
 await installAuthoritativePayrollFixture(page);
 const expected=await page.evaluate(async()=>{
  const expected=financeData('2026-09','art_museum');
  const {projectProductionBranchAccessDb}=await import('/js/core/production-role-view-projection.js');
  const access={role:'branch_manager',email:'aa@example.test',teacherId:'fixed',companyId:'danbridge',active:true,readOnly:true,hideFinancials:true,canViewBranchFinance:true,branchIds:['art_museum'],scheduleBranchIds:['hexi','art_museum']};
  db=projectProductionBranchAccessDb(db,access);window.DanbridgeAccess.setContext(access);
  // The real branch subscription does not have access to the Owner leave feed.
  window.__danbridgeSetTeacherLeaves([]);
  window.DanbridgeScopedPayroll.ensure('2026-09','art_museum');
  return [expected.payroll,expected.profit];
 });
 expect(expected).toEqual([21750,-20100]);
 await page.waitForFunction(()=>window.DanbridgeScopedPayroll.ensure('2026-09','art_museum'));
 const actual=await page.evaluate(()=>{const f=financeData('2026-09','art_museum');return[f.payroll,f.profit]});
 expect(actual).toEqual(expected);
});

test('branch never displays guessed salary after a rejected response',async({page})=>{
 await page.evaluate(()=>{
  window.__danbridgeReadScopedPayroll=async()=>{throw Error('permission-denied')};
  window.DanbridgeAccess.setContext({role:'branch_manager',email:'aa@example.test',branchIds:['art_museum'],canViewBranchFinance:true});
  window.renderFinance();
 });
 await expect(page.locator('#financePayrollRows')).toContainText('尚未核對成功');
 await expect(page.locator('#financePayrollTotal')).toHaveText('—');
 await expect(page.locator('#financeProfit')).toHaveText('—');
 await expect(page.locator('#financeUnassignedRevenue')).toBeHidden();
 await expect(page.locator('#financeUnassignedRevenue')).toHaveText('');
 const failed=await page.evaluate(()=>{try{financeData('2026-09','art_museum');return false}catch{return true}});expect(failed).toBe(true);
});

test('account change discards an in-flight salary response and retry uses fresh scope',async({page})=>{
 await page.evaluate(()=>{
  window.__payrollPending=[];
  window.__danbridgeReadScopedPayroll=input=>new Promise(resolve=>window.__payrollPending.push({input,resolve}));
  window.DanbridgeAccess.setContext({role:'branch_manager',email:'aa@example.test',branchIds:['art_museum'],canViewBranchFinance:true});
  window.DanbridgeScopedPayroll.ensure('2026-09','art_museum');
 });
 await page.waitForFunction(()=>window.__payrollPending.length===1);
 await page.evaluate(()=>{
  window.DanbridgeAccess.setContext({role:'branch_manager',email:'lucas@example.test',branchIds:['art_museum'],canViewBranchFinance:true});
  window.DanbridgeScopedPayroll.ensure('2026-09','art_museum');
  const stale=window.__payrollPending[0];stale.resolve({schema:'danbridge-scoped-payroll-v1',...stale.input,rows:[{teacherId:'fixed',lessonIds:[],payroll:{authoritativeScope:'art_museum',amount:999999}}]});
 });
 await page.waitForFunction(()=>window.__payrollPending.length===2);
 expect(await page.evaluate(()=>window.DanbridgeScopedPayroll.ensure('2026-09','art_museum'))).toBe(false);
 await page.evaluate(()=>{const fresh=window.__payrollPending[1];fresh.resolve({schema:'danbridge-scoped-payroll-v1',...fresh.input,rows:[{teacherId:'fixed',lessonIds:[],payroll:{authoritativeScope:'art_museum',amount:123}}]})});
 await page.waitForFunction(()=>window.DanbridgeScopedPayroll.ensure('2026-09','art_museum'));
 expect(await page.evaluate(()=>window.DanbridgeScopedPayroll.get(db.teachers[0],'2026-09','art_museum').payroll.amount)).toBe(123);
});
