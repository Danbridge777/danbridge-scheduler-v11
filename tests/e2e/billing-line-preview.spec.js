const { test, expect } = require('@playwright/test');

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
