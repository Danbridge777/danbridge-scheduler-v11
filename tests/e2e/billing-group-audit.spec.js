// Audit-only regression expectations for the deployed 20.26.261 behavior.
// All data and clipboard failures are isolated fixtures; no cloud writes.
const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test.beforeEach(async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.waitForFunction(()=>typeof window.monthEndAudit==='function'&&!!document.querySelector('#v181CollectionActions'));
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','scheduler-cloud-role','branch-manager-cloud-role');window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'a',name:'同名孩子',parent:'王家長',courseType:'1對1',rate:600,billingBranchId:'hexi'},{id:'b',name:'同名孩子',parent:'李家長',courseType:'團班',rate:800,billingBranchId:'art_museum'},{id:'g',name:'正式模式團班',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b'],rate:0,partTimeTeacherRate:500,billingBranchId:'hexi'}],teachers:[{id:'t',name:'兼職老師',type:'兼職',payrollMode:'hourly',rate:500}],lessons:[{id:'g1',studentId:'g',groupStudentIds:['a','b'],date:'2026-09-08',start:'16:00',end:'17:30',teacherId:'t',teacherIds:['t'],status:'未上課',billingBranchId:'hexi',branchId:'art_museum',location:'美術東四路',room:'教室 1'}],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],fixedExpenses:[],oneTimeExpenses:[],teacherLeaveRecords:[]};
  saveDB=()=>{};renderSelects();switchTab('finance');setFinanceWorkspaceMonth('2026-09',true);activateFinancePane('overview');
 });
});
test('新團班的月底一次檢查不應誤報有效名單與收費',async({page})=>{
 expect(await page.evaluate(()=>({income:studentTuitionRevenue('2026-09'),pay:calculateTeacherPayroll(teacher('t'),'2026-09').amount}))).toEqual({income:2100,pay:750});
 await page.getByRole('button',{name:'月底一次檢查',exact:true}).click();
 await test.info().attach('month-end-audit',{body:await page.locator('#v181MonthEndAudit').innerText(),contentType:'text/plain'});
 await expect(page.locator('#v181MonthEndAudit')).toContainText('主要計算通過');
});
test('不同家庭的已繳課程與已收月費合併後，未收餘額應為 1200',async({page})=>{
 await page.evaluate(()=>{
  db.students=[{id:'care',name:'安親生',parent:'陳家長',courseType:'安親',rate:9000},{id:'private',name:'家教生',parent:'林家長',courseType:'1對1',rate:800},{id:'group',name:'團班生',parent:'黃家長',courseType:'團班',rate:600}];
  const l=(id,studentId,start,end,extra={})=>({id,studentId,date:'2026-09-08',start,end,teacherId:'t',teacherIds:['t'],status:'未上課',...extra});
  db.lessons=[l('private-paid','private','16:00','17:30',{paymentStatus:'paid'}),l('group-unpaid','group','18:00','20:00')];
  db.collectionRecords=[{id:'care-paid',month:'2026-09',branchId:'all',studentIds:['care'],status:'collected',amount:9000}];renderFinance();
 });
 expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(11400);
 const remaining=await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'));
 await test.info().attach('receivable',{body:JSON.stringify({due:11400,paidPrivate:1200,paidCare:9000,expectedRemaining:1200,actualRemaining:remaining}),contentType:'application/json'});
 expect(remaining).toBe(1200);
});
test('LINE 兩條複製路徑皆失敗時不得宣告成功或記錄已通知',async({page})=>{
 await page.evaluate(()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('clipboard denied by fixture')}}});document.execCommand=()=>false;
  copyStudentLineBilling('a','2026-09','all','','summer');
 });
 const modal=page.locator('#v181LineBillingPreview');await expect(modal).toHaveClass(/show/);
 await modal.getByRole('button',{name:'確認複製',exact:true}).click();
 const records=await page.evaluate(()=>db.collectionRecords);await test.info().attach('clipboard-failed-records',{body:JSON.stringify(records),contentType:'application/json'});
 expect(records.some(r=>r.notifiedAt)).toBe(false);await expect(modal).toHaveClass(/show/);
});
test('同家庭另一校區已收款，不得讓本校區月底待辦消失',async({page})=>{
 await page.evaluate(()=>{
  db.students=[{id:'a',name:'同名孩子',parent:'王家長',courseType:'1對1',rate:600,billingBranchId:'hexi'}];
  db.lessons=[...['hexi','art_museum'].map((branchId,i)=>({id:'l'+i,studentId:'a',date:'2026-09-0'+(i+1),start:'16:00',end:'17:00',status:'未上課',teacherId:'t',teacherIds:['t'],billingBranchId:branchId,branchId,room:'教室 1'}))];
  db.collectionRecords=[{id:'2026-09|hexi|a',familyKey:'a',studentIds:['a'],month:'2026-09',branchId:'hexi',status:'collected',amount:600,notifiedAt:'2026-09-03T01:00:00Z',collectedAt:'2026-09-03T02:00:00Z'}];
  document.getElementById('financeBranchScope').value='art_museum';document.getElementById('settlementBranchScope').value='art_museum';renderSettlement();
 });
 const task=page.locator('#v181MonthTasks article').filter({hasText:'家庭尚未收款'});
 await test.info().attach('campus-task',{body:await page.locator('#v181MonthTasks').innerText(),contentType:'text/plain'});
 await expect(task.locator('b')).toHaveText('1');
});
