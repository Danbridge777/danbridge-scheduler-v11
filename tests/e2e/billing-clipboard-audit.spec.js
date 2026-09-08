const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test('30 堂團班加家教安親，家庭帳單及真實剪貼簿內容一致',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','此測試使用 Chromium 的真實 clipboard-read/write 權限');
 await isolateApplicationAuth(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.waitForFunction(()=>!!document.getElementById('v181CollectionActions'));
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  const l=(id,date,start,end,studentId='g',extra={})=>({id,studentId,date,start,end,teacherId:'t',teacherIds:['t'],status:'未上課',billingBranchId:'hexi',branchId:'art_museum',...(studentId==='g'?{groupStudentIds:['a','b','c']}:{}),...extra});
  db={...db,students:[{id:'a',name:'同名孩子',parent:'王家長',rate:600,courseType:'1對1'},{id:'b',name:'同名孩子',parent:'李家長',rate:800,courseType:'團班'},{id:'c',name:'妹妹',parent:'王家長',rate:400,courseType:'團班'},{id:'care',name:'安親妹妹',parent:'王家長',rate:9000,courseType:'安親',billingBranchId:'hexi'},{id:'g',name:'團班不是孩子',isGroupRoster:true,courseType:'團班',groupMemberIds:['b'],rate:999999,partTimeTeacherRate:500}],teachers:[{id:'t',name:'兼職老師',type:'兼職',payrollMode:'hourly',rate:500}],lessons:[...Array.from({length:30},(_,i)=>l('g'+i,'2026-09-'+String(i+1).padStart(2,'0'),'16:00','17:30')),l('p','2026-09-01','18:00','18:30','a'),l('oct','2026-10-01','16:00','18:00')],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],fixedExpenses:[],oneTimeExpenses:[]};saveDB=()=>{};renderSelects();switchTab('finance');setFinanceWorkspaceMonth('2026-09',true);activateFinancePane('collections');
 });
 expect(await page.evaluate(()=>({sep:studentTuitionRevenue('2026-09'),oct:studentTuitionRevenue('2026-10'),owner:studentTuitionRevenue('2026-09','hexi'),attendance:studentTuitionRevenue('2026-09','art_museum'),teacher:calculateTeacherPayroll(teacher('t'),'2026-09').amount}))).toEqual({sep:90300,oct:12600,owner:90300,attendance:0,teacher:22750});
 await page.getByRole('button',{name:'學生收款 應收與請假',exact:true}).click();
 await page.locator('.v181-student-details > summary').click();
 const row=page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'});await row.locator('.line-billing-btn').click();
 const modal=page.locator('#v181LineBillingPreview'),preview=modal.locator('textarea');await expect(preview).toHaveValue(/9月共計：NT\$54,300/);await expect(preview).not.toHaveValue(/李家長|團班不是孩子|10\/1/);await expect(preview).toHaveValue(/課程堂數：30 堂/);await expect(preview).toHaveValue(/45 小時 × NT\$600 = NT\$27,000/);await expect(preview).toHaveValue(/安親小計：NT\$9,000/);
 const original=await preview.inputValue(),edited=original+'\n僅修改本次訊息的備註';await preview.fill(edited);await modal.getByRole('button',{name:'確認複製',exact:true}).click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(edited);expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(90300);
 await page.evaluate(()=>{setFinanceWorkspaceMonth('2026-10',true)});await page.getByRole('button',{name:'學生收款 應收與請假',exact:true}).click();await row.locator('.line-billing-btn').click();await expect(preview).toHaveValue(/10月共計：NT\$11,000/);await expect(preview).not.toHaveValue(/9月|9\/30|僅修改本次/);
 await modal.getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('#studentSettleRows tr').filter({hasText:'李家長'}).locator('.line-billing-btn').click();await expect(preview).toHaveValue(/10月共計：NT\$1,600/);await expect(preview).not.toHaveValue(/王家長|妹妹/);
});
