const { test, expect } = require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('LINE 計費預覽只綁家長姓名、合併手足、列出時數公式且可修改後複製',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(450);
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:false});
    window.currentCloudRole=()=> 'owner';
    const row=(id,studentId,date,start,end)=>({id,studentId,date,start,end,status:'未上課',chargeStudent:'yes',teacherId:'teacher-1',teacherIds:['teacher-1']});
    db={
      ...db,
      students:[
        {id:'a',name:'小安',parent:'王小美',lineSalutation:'媽咪',courseType:'1對1',billing:'lesson',rate:800},
        {id:'b',name:'小晴',parent:'王小美',lineSalutation:'爸爸',courseType:'團班',billing:'month',rate:600},
        {id:'c',name:'小宇',parent:'王小美',lineSalutation:'舊稱謂',courseType:'1對1',billing:'hour',rate:500},
        {id:'x',name:'其他學生',parent:'李家長',courseType:'1對1',rate:999}
      ],
      teachers:[{id:'teacher-1',name:'測試老師',rate:0,workDays:[1,2,3,4,5],minWeeklyHours:0}],
      lessons:[
        row('a1','a','2026-08-03','16:00','17:30'),
        row('b1','b','2026-08-05','14:00','16:00'),
        row('c1','c','2026-08-05','19:00','20:00'),
        row('x1','x','2026-08-06','19:00','20:00')
      ],
      summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[]
    };
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__billingCopiedText=text}}});
    window.copyStudentLineBilling('a','2026-08','all',encodeURIComponent('a,b,c,x'),'summer');
  });

  const modal=page.locator('#v181LineBillingPreview');
  await expect(modal).toHaveClass(/show/);
  await expect(modal.locator('.v181-parent-binding')).toHaveValue('王小美');
  const preview=modal.locator('#v181LineBillingPreviewText');
  await expect(preview).toHaveValue(/王小美您好/);
  await expect(preview).toHaveValue(/學生：小安/);
  await expect(preview).toHaveValue(/學生：小晴/);
  await expect(preview).toHaveValue(/學生：小宇/);
  await expect(preview).not.toHaveValue(/其他學生/);
  await expect(preview).not.toHaveValue(/媽咪/);
  await expect(preview).toHaveValue(/上課日期與時間：/);
  await expect(preview).toHaveValue(/上課天數：1 天/);
  await expect(preview).toHaveValue(/計算：1\.5 小時 × NT\$800 = NT\$1,200/);
  await expect(preview).toHaveValue(/團班費用/);
  await expect(preview).toHaveValue(/計算：2 小時 × NT\$600 = NT\$1,200/);
  await expect(preview).toHaveValue(/8月共計：NT\$2,900/);

  const original=await preview.inputValue();
  await preview.fill(`${original}\n家長確認備註：下週轉帳`);
  await modal.locator('.v181-line-preview-actions .btn.primary').click();
  await expect.poll(()=>page.evaluate(()=>window.__billingCopiedText)).toContain('家長確認備註：下週轉帳');
  await expect(modal).not.toHaveClass(/show/);
});

test('瀏覽器實際計算安親月費與同時段團班孩子，家長與金額互不混用',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(450);
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  const result=await page.evaluate(()=>{
    const row=(id,studentId)=>({id,studentId,date:'2026-09-08',start:'18:00',end:'20:00',status:'未上課',chargeStudent:'yes',teacherId:'t',teacherIds:['t']});
    db={...db,students:[
      {id:'care',name:'安親生',parent:'陳家長',courseType:'安親',rate:9000},
      {id:'kid-a',name:'團班甲',parent:'王家長',courseType:'團班',rate:600},
      {id:'kid-b',name:'團班乙',parent:'李家長',courseType:'團班',rate:750}
    ],teachers:[{id:'t',name:'老師',rate:0}],lessons:[row('care-row','care'),row('group-a','kid-a'),row('group-b','kid-b')],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[]};
    return{
      total:studentTuitionRevenue('2026-09'),
      care:studentLineBillingText('care','2026-09'),
      wang:studentLineBillingText('kid-a','2026-09'),
      lee:studentLineBillingText('kid-b','2026-09')
    };
  });
  expect(result.total).toBe(11700);
  expect(result.care).toContain('每月固定 NT$9,000');
  expect(result.care).not.toContain('小時 ×');
  expect(result.wang).toContain('王家長您好');expect(result.wang).toContain('學生：團班甲');expect(result.wang).toContain('NT$1,200');expect(result.wang).not.toContain('李家長');
  expect(result.lee).toContain('李家長您好');expect(result.lee).toContain('學生：團班乙');expect(result.lee).toContain('NT$1,500');expect(result.lee).not.toContain('王家長');
});

test('學生與課表快速新增表單依課程類型鎖定正確收費規則',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(450);
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com',canManageSchedule:true});
    window.currentCloudRole=()=> 'owner';
    switchTab('students');
  });

  await page.selectOption('#studentCourseType',{label:'安親'});
  await expect(page.locator('#studentBilling')).toHaveValue('month');
  await expect(page.locator('#studentBilling')).toBeDisabled();
  await expect(page.locator('#studentRate').locator('xpath=preceding-sibling::label[1]')).toHaveText('每月月費');
  await expect(page.locator('#studentRate')).toHaveAttribute('aria-label','每月月費');

  await page.selectOption('#studentCourseType',{label:'團班'});
  await expect(page.locator('#studentBilling')).toHaveValue('hour');
  await expect(page.locator('#studentRate').locator('xpath=preceding-sibling::label[1]')).toHaveText('每小時鐘點費');

  await page.evaluate(()=>{openLessonModal();toggleQuickStudent(true)});
  await page.selectOption('#quickCourseType',{label:'安親'});
  await expect(page.locator('#quickBilling')).toHaveValue('month');
  await expect(page.locator('#quickBilling')).toBeDisabled();
  await expect(page.locator('#quickRate').locator('xpath=preceding-sibling::label[1]')).toHaveText('每月月費');

  await page.selectOption('#quickCourseType',{label:'1對1'});
  await expect(page.locator('#quickBilling')).toHaveValue('hour');
  await expect(page.locator('#quickRate').locator('xpath=preceding-sibling::label[1]')).toHaveText('每小時鐘點費');
});
