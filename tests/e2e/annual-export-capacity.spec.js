const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('30,000 mixed private/group/monthly lessons retain all backup collections and independently verified monthly tuition/payroll',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop-chromium','隔離年度容量案例；不寫入雲端');test.setTimeout(120_000);
 const students=Array.from({length:20},(_,i)=>({id:'s'+i,name:'同名孩子'+(i%5),parent:'家庭'+i,billingFamilyId:'family'+i,courseType:'1對1',rate:400+i*10,partTimeTeacherRate:80+i*5,billingBranchId:i%2?'hexi':'art_museum',pricingHistoryVersion:1,pricingHistory:[{effectiveFrom:'0001-01-01',values:{rate:300+i*10,partTimeTeacherRate:80+i*5,courseType:'1對1'},source:'baseline'},{effectiveFrom:'2026-07-01',values:{rate:400+i*10,partTimeTeacherRate:80+i*5,courseType:'1對1'},source:'explicit-rate-change'}]}));
 students.push(...[0,1].map(i=>({id:'m'+i,name:'安親'+i,parent:'安親家庭'+i,courseType:'安親',rate:5000,partTimeTeacherRate:100,billingBranchId:i?'hexi':'art_museum'})),{id:'g',name:'團課',courseType:'團班',isGroupRoster:true,groupMemberIds:['s0','s1'],partTimeTeacherRate:300,rate:0,billingBranchId:'hexi'});
 const teachers=Array.from({length:10},(_,i)=>({id:'t'+i,name:'老師'+i,type:'兼職',payrollMode:'hourly',rate:200+i*10,workDays:[1,2,3,4,5],minWeeklyHours:0}));
 const expected=Array.from({length:12},()=>({tuition:10000,payroll:0,count:2500}));
 const lessons=Array.from({length:30000},(_,i)=>{
  const month=Math.floor(i/2500),n=i%20,monthly=i%100===0,group=!monthly&&i%5===0,member=(n+1)%20;
  const row={id:'lsn_00000000-0000-4000-8000-'+String(i).padStart(12,'0'),studentId:monthly?'m'+(Math.floor(i/100)%2):group?'g':'s'+n,teacherId:'t'+(i%10),teacherIds:['t'+(i%10)],date:'2026-'+String(month+1).padStart(2,'0')+'-'+String(i%25+1).padStart(2,'0'),start:'09:00',end:'10:30',status:'未上課',chargeStudent:'yes',payTeacher:'yes',paymentStatus:'unpaid',billingBranchId:i%2?'hexi':'art_museum',branchId:i%2?'art_museum':'hexi',location:i%2?'美術東四路':'河西一路',room:'3',note:'年度容量驗收：保留完整課程、名單、家庭、校區與計費欄位。'.repeat(3)};
  if(group)row.groupStudentIds=['s'+n,'s'+member];
  const rate=j=>300+j*10+(month>=6?100:0);
  expected[month].tuition+=monthly?0:1.5*(group?rate(n)+rate(member):rate(n));
  expected[month].payroll+=1.5*(monthly?100:group?300:80+n*5);return row;
 });
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof annualSettlementData==='function'&&typeof normalizeImported==='function');
 const result=await page.evaluate(({students,teachers,lessons})=>{
  const keys=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampClasses','winterCampRegistrations','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
  const source=Object.fromEntries(keys.map(key=>[key,[]]));Object.assign(source,{students,teachers,lessons,collectionRecords:[{id:'year-receipt',month:'2026-09',studentIds:['s1'],status:'partial',amount:200,billingItemsVersion:1,billingItems:[{key:'annual-item',studentId:'s1',amount:200}]}],fixedExpenses:[{id:'expense',amount:1800}],settlementRecords:[{id:'archive',month:'2026-01',locked:true,amount:12345}],branches:[{id:'hexi',name:'河西一路'},{id:'art_museum',name:'美術東四路'}]});
  const original=JSON.stringify(source),backup={...source,_meta:{checksum:backupChecksum(source),counts:backupCollectionCounts(source)}},restored=normalizeImported(JSON.parse(JSON.stringify(backup)));
  const equal=keys.map(key=>({key,equal:JSON.stringify(source[key])===JSON.stringify(restored[key])}));
  db=restored;document.body.classList.remove('auth-locked');window.DanbridgeAccess.setContext({role:'owner',email:'capacity@example.com'});window.currentCloudRole=()=> 'owner';renderSettlementMonthOptions();setFinanceWorkspaceMonth('2026-12',false);
  const annual=annualSettlementData('2026');return{equal,unchanged:JSON.stringify(source)===original,bytes:new TextEncoder().encode(JSON.stringify(backup)).length,months:annual.months.map(row=>({tuition:row.sr.reduce((n,x)=>n+x.amount,0),payroll:row.tr.reduce((n,x)=>n+x.amount,0),count:row.lessons.length})),lessons:annual.lessons.length,unique:new Set(annual.lessons.map(l=>l.id)).size,month:document.getElementById('settleMonth').value};
 },{students,teachers,lessons});
 expect(result.equal.filter(row=>!row.equal)).toEqual([]);expect(result.unchanged).toBe(true);expect(result.bytes).toBeGreaterThan(5*1024*1024);expect(result.months).toEqual(expected);expect(result.lessons).toBe(30000);expect(result.unique).toBe(30000);expect(result.month).toBe('2026-12');
 await testInfo.attach('annual-mixed-capacity-evidence.json',{body:JSON.stringify({environment:'isolated-local-browser-not-cloud',...result,expected},null,2),contentType:'application/json'});
 const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>downloadAnnualSettlementExcel());const download=await downloadPromise,html=await fs.readFile(await download.path(),'utf8');
 expect(html).toContain('lsn_00000000-0000-4000-8000-000000000000');expect(html).toContain('lsn_00000000-0000-4000-8000-000000029999');expect(html).toContain(String(expected.reduce((n,x)=>n+x.tuition,0)));expect(html).toContain(String(expected.reduce((n,x)=>n+x.payroll,0)));
});

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
