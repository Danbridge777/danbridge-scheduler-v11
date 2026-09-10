// Audit-only: preserve correct expectations even when published code fails.
const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>{
  page.on('dialog',async dialog=>{if(dialog.type()==='confirm'&&dialog.message().includes('同名家長'))await dialog.accept();else await dialog.dismiss()});
  await isolateApplicationAuth(page);
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
  await page.waitForFunction(()=>!!document.querySelector('#v181CollectionActions'));
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','scheduler-cloud-role','branch-manager-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});
    window.currentCloudRole=()=> 'owner';
    db={...db,students:[
      {id:'a',name:'同名孩子',parent:'王家長',courseType:'1對1',rate:600,billingBranchId:'hexi'},
      {id:'b',name:'同名孩子',parent:'李家長',courseType:'團班',rate:800,billingBranchId:'hexi'},
      {id:'c',name:'妹妹',parent:'王家長',courseType:'團班',rate:400,billingBranchId:'hexi'},
      {id:'g',name:'團班容器',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b','c'],partTimeTeacherRate:500,billingBranchId:'hexi'}
    ],teachers:[{id:'t',name:'兼職老師',type:'兼職',payrollMode:'hourly',rate:300}],
    lessons:[{id:'g1',studentId:'g',groupStudentIds:['a','b','c'],date:'2026-09-08',start:'16:00',end:'17:30',teacherId:'t',teacherIds:['t'],status:'未上課',billingBranchId:'hexi',branchId:'art_museum'}],
    summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],fixedExpenses:[],oneTimeExpenses:[]};
    saveDB=()=>{window.__auditSaveCalls=(window.__auditSaveCalls||0)+1};snapshot=()=>{};
    renderSelects();switchTab('finance');setFinanceWorkspaceMonth('2026-09',true);
  });
});

async function showCollections(page){
  await page.getByRole('button',{name:'學生收款 應收與請假',exact:true}).click();
  await page.locator('.v181-student-details > summary').filter({hasText:'查看全部學生'}).click();
}

test('收款後總覽不再依課程未繳旗標顯示錯誤欠款',async({page})=>{
  await page.evaluate(()=>{monthNow=()=> '2026-09';renderDashboard()});
  await showCollections(page);
  await page.locator('#v181SelectAllFamilies').check();
  await page.getByRole('button',{name:'標記已收款',exact:true}).click();
  await page.getByRole('button',{name:'總覽',exact:true}).click();
  await expect(page.locator('#v32Insights')).not.toContainText('未收款');
  await expect(page.locator('#v32Insights')).not.toContainText('未繳');
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(0);
});

test('安親多堂提醒只收一次月費，月費收款後不再提醒',async({page})=>{
  const result=await page.evaluate(()=>{
    student('a').courseType='安親';student('a').rate=9000;
    db.lessons=[{...db.lessons[0],studentId:'a',groupStudentIds:[],id:'care1'},{...db.lessons[0],studentId:'a',groupStudentIds:[],id:'care2',date:'2026-09-09'}];
    return DanbridgeNotifications.outstandingPaymentGroups(db.lessons,'2026-09-10').map(x=>({id:x.studentId,amount:x.amount,count:x.lessons.length}));
  });
  expect(result).toEqual([{id:'a',amount:9000,count:2}]);
  await page.evaluate(()=>{db.collectionRecords=[{id:'care',month:'2026-09',studentIds:['a'],branchId:'all',amount:9000,status:'collected'}]});
  expect(await page.evaluate(()=>DanbridgeNotifications.outstandingPaymentGroups(db.lessons,'2026-09-10'))).toEqual([]);
});

test('未收款通知逐孩分家長；收款後移除提醒，次月不串帳',async({page})=>{
  const before=await page.evaluate(()=>DanbridgeNotifications.outstandingPaymentGroups(db.lessons,'2026-09-10').map(x=>({id:x.studentId,amount:x.amount,month:x.month})));
  expect(before).toEqual(expect.arrayContaining([{id:'a',amount:900,month:'2026-09'},{id:'b',amount:1200,month:'2026-09'},{id:'c',amount:600,month:'2026-09'}]));
  expect(before).toHaveLength(3);
  await showCollections(page);
  await page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'}).getByRole('checkbox').check();
  await page.getByRole('button',{name:'標記已收款',exact:true}).click();
  expect(await page.evaluate(()=>DanbridgeNotifications.outstandingPaymentGroups(db.lessons,'2026-09-10').map(x=>({id:x.studentId,amount:x.amount})))).toEqual([{id:'b',amount:1200}]);
  await page.evaluate(()=>db.lessons.push({...db.lessons[0],id:'october-group',date:'2026-10-01'}));
  const after=await page.evaluate(()=>DanbridgeNotifications.outstandingPaymentGroups(db.lessons,'2026-10-02').map(x=>({id:x.studentId,amount:x.amount,month:x.month})));
  expect(after.filter(x=>x.month==='2026-09')).toEqual([{id:'b',amount:1200,month:'2026-09'}]);
  expect(after.filter(x=>x.month==='2026-10')).toHaveLength(3);
});

test('全校區收款後切單校區，家庭列與摘要一致；新增課程顯示部分已收款',async({page})=>{
  await showCollections(page);
  await page.getByRole('checkbox',{name:'選取 同名孩子',exact:true}).first().check();
  await page.getByRole('button',{name:'標記已收款',exact:true}).click();
  await page.getByLabel('收款校區',{exact:true}).selectOption('hexi');
  const row=page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'});
  await expect(row.locator('.v181-collection-status')).toHaveText('已收款');
  await page.evaluate(()=>{db.lessons.push({...db.lessons[0],id:'after-payment',date:'2026-09-09'});renderSettlement()});
  await expect(row.locator('.v181-collection-status')).toHaveText('部分已收款');
  await page.getByLabel('收款校區',{exact:true}).selectOption('art_museum');
  await expect(page.locator('#studentSettleRows')).toContainText('此校區本月沒有學生收入資料');
});

test('實際勾選手足家庭並標記已收款，應儲存一次正確家庭金額',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await showCollections(page);
  await page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'}).getByRole('checkbox').check();
  await page.locator('#v181PaymentMethod').selectOption({label:'轉帳'});
  await page.getByRole('button',{name:'標記已收款',exact:true}).click();
  const result=await page.evaluate(()=>({records:db.collectionRecords,saves:window.__auditSaveCalls||0}));
  await test.info().attach('actual-collection-click',{body:JSON.stringify({errors,...result}),contentType:'application/json'});
  expect.soft(errors).toEqual([]);
  expect.soft(result.records).toHaveLength(1);
  expect.soft(result.records[0]).toMatchObject({studentIds:['a','c'],amount:1500,status:'collected',paymentMethod:'轉帳',month:'2026-09'});
  expect(result.saves).toBe(1);
});

test('LINE 複製記錄家庭與月份，但不冒充已發送或已收款',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__auditCopied=text}}}));
  await showCollections(page);
  await page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'}).locator('.line-billing-btn').click();
  await page.locator('#lineFamilyReviewConfirmed').check();
  await page.locator('#v181LineBillingPreview').getByRole('button',{name:'確認複製',exact:true}).click();
  const result=await page.evaluate(()=>({records:db.collectionRecords,saves:window.__auditSaveCalls||0,copied:window.__auditCopied}));
  await test.info().attach('copy-followup-record',{body:JSON.stringify({errors,...result}),contentType:'application/json'});
  expect(result.copied).toContain('9月共計：NT$1,500');
  expect.soft(errors).toEqual([]);
  expect.soft(result.records[0]).toMatchObject({studentIds:['a','c'],month:'2026-09',amount:0,status:'pending',notifiedAt:''});
  expect(result.records[0].copiedAt).toBeTruthy();
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(2700);
  expect(result.saves).toBe(1);
});

test('重複收款、增加課程後通知、恢復待通知，金額與紀錄不能被誤覆蓋',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await showCollections(page);
  const checkbox=page.locator('#studentSettleRows tr').filter({hasText:'王家長'}).filter({hasText:'同名孩子'}).getByRole('checkbox');
  for(let i=0;i<2;i++){
    await checkbox.check();await page.getByRole('button',{name:'標記已收款',exact:true}).click();
  }
  expect(await page.evaluate(()=>db.collectionRecords.length)).toBe(1);
  const original=await page.evaluate(()=>JSON.stringify(db.collectionRecords[0].billingItems));
  await page.evaluate(()=>{db.lessons.push({...db.lessons[0],id:'new-lesson',date:'2026-09-09'});renderSettlement()});
  await checkbox.check();await page.getByRole('button',{name:'標記已通知',exact:true}).click();
  expect(await page.evaluate(()=>db.collectionRecords[0].amount)).toBe(1500);
  expect(await page.evaluate(()=>JSON.stringify(db.collectionRecords[0].billingItems))).toBe(original);
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(3900);
  await checkbox.check();await page.getByRole('button',{name:'恢復待通知',exact:true}).click();
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(5400);
  expect(await page.evaluate(()=>db.collectionRecords[0].status)).toBe('pending');
  expect(errors).toEqual([]);
});

test('舊收款沒有足夠明細時畫面顯示需核對，不將推估數字當成確定餘額',async({page})=>{
  await page.evaluate(()=>{db.collectionRecords=[{id:'legacy',month:'2026-09',branchId:'all',studentIds:['a','c'],amount:600,status:'collected'}];renderSettlement()});
  await showCollections(page);
  await expect(page.locator('#v181CollectionSummary')).toContainText('需核對');
  expect(await page.evaluate(()=>db.collectionRecords[0].amount)).toBe(600);
});

test('重複團班名單 ID 與外家庭 ID 不得重複收費或混入 LINE',async({page})=>{
  await page.evaluate(()=>{
    db.lessons[0].groupStudentIds=['a','a','b','c','c'];
    copyStudentLineBilling('a','2026-09','all',encodeURIComponent('a,a,b,c,c'));
  });
  const preview=page.locator('#v181LineBillingPreviewText');
  await expect(preview).toHaveValue(/9月共計：NT\$1,500/);
  await expect(preview).not.toHaveValue(/李家長/);
  const text=await preview.inputValue();
  expect(text.match(/學生：同名孩子/g)).toHaveLength(1);
  expect(text.match(/學生：妹妹/g)).toHaveLength(1);
  expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(2700);
});

test('課程名單不同於現在團班名單，跨年帳單仍依各月份課程名單',async({page})=>{
  await page.evaluate(()=>{
    const original=db.lessons[0];
    db.lessons=[{...original,date:'2026-12-31',groupStudentIds:['a','c']},{...original,id:'next-year',date:'2027-01-01',groupStudentIds:['b'],start:'16:00',end:'18:00'}];
    student('g').groupMemberIds=['b'];
    copyStudentLineBilling('a','2026-12');
  });
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/12月共計：NT\$1,500/);
  await expect(page.locator('#v181LineBillingPreviewText')).not.toHaveValue(/1\/1|李家長/);
  await page.locator('#v181LineBillingPreview').getByRole('button',{name:'取消',exact:true}).click();
  await page.evaluate(()=>copyStudentLineBilling('b','2027-01'));
  await expect(page.locator('#v181LineBillingPreviewText')).toHaveValue(/1月共計：NT\$1,600/);
  await expect(page.locator('#v181LineBillingPreviewText')).not.toHaveValue(/12\/31|王家長|妹妹/);
});

test('同筆付款同時標在課程與家庭紀錄時，不得雙扣其他家庭應收',async({page})=>{
  await page.evaluate(()=>{
    db.lessons=[{...db.lessons[0],id:'private-paid',studentId:'a',groupStudentIds:[],start:'16:00',end:'17:00',paymentStatus:'paid'},{...db.lessons[0],id:'private-unpaid',studentId:'b',groupStudentIds:[],start:'18:00',end:'19:00',paymentStatus:'unpaid'}];
    db.collectionRecords=[{id:'2026-09|all|a,c',familyKey:'a,c',studentIds:['a','c'],month:'2026-09',branchId:'all',amount:600,status:'collected'}];
  });
  expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(1400);
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(800);
});

test('全校區與單校區重複標記同家庭付款，不得扣到其他家庭應收',async({page})=>{
  await page.evaluate(()=>{
    db.collectionRecords=['all','hexi'].map(branchId=>({id:`2026-09|${branchId}|a,c`,familyKey:'a,c',studentIds:['a','c'],month:'2026-09',branchId,amount:1500,status:'collected'}));
  });
  expect(await page.evaluate(()=>studentTuitionRevenue('2026-09'))).toBe(2700);
  expect(await page.evaluate(()=>studentUnpaidTuitionRevenue('2026-09'))).toBe(1200);
});
