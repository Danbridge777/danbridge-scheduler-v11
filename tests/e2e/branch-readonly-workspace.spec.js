const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
const roleCode=source.slice(source.indexOf('function roleAccessSignature('),source.indexOf('function lessonMetaSignature('));

test('AA Lucas policy: both-campus schedule, no finances, no moves and no foreign CRM details',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(async code=>{
  const {projectProductionBranchAccessDb}=await import('/js/core/production-role-view-projection.js');
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.__danbridgeGetDB=()=>db;window.__danbridgeSetDB=value=>{db=value};
  new Function(`let cloudRole='',cloudTeacherId='',cloudBranchIds=[],cloudCanManageSchedule=false,cloudUid='',cloudEmailKey='',cloudRoleAccessSignature='',applyingCloud=false;
   const OWNER_EMAIL='owner@example.test',OWNER_DISPLAY_NAME='Owner',DANBRIDGE_ENVIRONMENT='production';
   const flushOperationalErrors=()=>{},restoreOwnerSyncRecovery=()=>{},installOperationalResilienceUI=()=>{},deepCopy=structuredClone,cloudStatus=()=>{};
   const emptyDB=()=>Object.fromEntries(Object.keys(window.__danbridgeGetDB()).map(k=>[k,[]]));
   ${code}
   window.currentCloudRole=()=>cloudRole;window.__testApplyRole=applyRoleUI;installRoleInteractionGuards();`)();
  const access={role:'branch_manager',teacherId:'t1',branchIds:['art_museum'],hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],readOnly:true,canMoveSchedule:false};
  window.__testApplyRole(access,{uid:'aa',email:'aa@example.test'});
  const input={...db,branches:[{id:'art_museum',name:'美術東四路',rooms:['1']},{id:'hexi',name:'河西一路',rooms:['2']}],students:[{id:'s1',name:'東四學生',parent:'東四家長',rate:700,courseType:'1對1',branchIds:['art_museum']},{id:'s2',name:'河西學生',parent:'FOREIGN_PARENT',rate:800,courseType:'1對1',branchIds:['hexi']}],teachers:[{id:'t1',name:'東四老師',type:'兼職',rate:300,assignedBranchIds:['art_museum']},{id:'t2',name:'河西老師',type:'兼職',rate:400,assignedBranchIds:['hexi']}],lessons:[{id:'l1',studentId:'s1',teacherId:'t1',branchId:'art_museum',location:'美術東四路',date:'2026-10-01',start:'10:00',end:'11:00',status:'未上課',billingBranchId:'art_museum'},{id:'l2',studentId:'s2',teacherId:'t2',branchId:'hexi',location:'河西一路',date:'2026-10-01',start:'11:00',end:'12:00',status:'未上課',billingBranchId:'hexi'}]};
  db=projectProductionBranchAccessDb(input,access);window.__safeSnapshot=JSON.stringify(db);window.__writes=0;window.saveDB=()=>window.__writes++;
  renderAll();switchTab('calendar');document.getElementById('calendarDate').value='2026-10-01';renderAll();window.DanbridgeRoleResponsive.apply();
 },roleCode);
 for(const tab of ['finance','settlement','security','data'])await expect(page.locator(`nav button[data-tab="${tab}"]`)).toBeHidden();
 await page.locator('#calendarFilterPanel > summary').click();
 await page.locator('#calendarDate').fill('2026-10-01');await page.locator('#calendarDate').press('Tab');
 const teacher=page.locator('#calendarTeacherFilter');await expect(teacher).toBeVisible();
 await expect(teacher.locator('option')).toContainText(['東四老師','河西老師']);
 await teacher.selectOption('t2');await page.locator('#calendarDate').fill('2026-10-01');await page.locator('#calendarDate').press('Tab');await expect(page.locator('#calendarCanvas [data-id="l2"]').first()).toBeVisible();
 await page.locator('#calendarCanvas [data-id="l2"]').first().click();
 await expect(page.locator('#courseDrawer')).toHaveClass(/show/);
 await expect(page.locator('#courseDrawerBody')).toContainText('河西老師');
 await expect(page.locator('#courseDrawerBody')).not.toContainText('課表營收');
 await expect(page.locator('#courseDrawerBody')).not.toContainText('老師薪資');
 await expect(page.locator('#courseDrawerEditBtn')).toBeHidden();
 await page.keyboard.press('Escape');
 await teacher.selectOption('t1');await page.locator('#calendarDate').fill('2026-10-01');await page.locator('#calendarDate').press('Tab');await expect(page.locator('#calendarCanvas [data-id="l1"]').first()).toBeVisible();
 await expect(page.locator('#calendar .calendar-quick-add')).toBeHidden();
 await page.evaluate(()=>moveLessonTo('l1','2026-10-02'));
 expect(await page.evaluate(()=>db.lessons.find(l=>l.id==='l1').date)).toBe('2026-10-01');
 expect(await page.evaluate(()=>window.__writes)).toBe(0);
 await page.locator('nav button[data-tab="students"]').click();
 await expect(page.locator('#studentRows')).toContainText('東四學生');
 await expect(page.locator('#studentRows')).not.toContainText('河西學生');
 await expect(page.locator('#studentRows')).not.toContainText('FOREIGN_PARENT');
 await expect(page.locator('#students table thead')).not.toContainText('收費');
 let historyText='';page.once('dialog',async dialog=>{historyText=dialog.message();await dialog.dismiss()});
 await page.locator('#students').getByRole('button',{name:'歷程',exact:true}).click();
 expect(historyText).toContain('東四學生');expect(historyText).not.toMatch(/已繳|未繳|鐘點費|薪資/);
 await page.locator('nav button[data-tab="teachers"]').click();
 await expect(page.locator('#teacherRows')).toContainText('東四老師');
 await expect(page.locator('#teacherRows')).not.toContainText('河西老師');
 await expect(page.locator('#teacherRows tr td:nth-child(2)').first()).toBeHidden();
 await page.evaluate(()=>switchTab('finance'));await expect(page.locator('#finance')).toBeHidden();
 expect(await page.evaluate(()=>JSON.stringify(db))).not.toMatch(/"rate"|baseSalary|FOREIGN_PARENT/);
 expect(await page.evaluate(()=>DanbridgeNotifications.buildNotifications().filter(n=>n.category==='payment'||n.action?.type==='settlement'||n.action?.type==='collections'))).toEqual([]);
 await expect(page.locator('.notification-tab[data-filter="payment"]')).toBeHidden();
 await expect(page.locator('.notification-tab[data-filter="hours"]')).toBeHidden();
 expect(errors).toEqual([]);
});

test('branch read-only navigation, full-width lists and role transitions preserve write restrictions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(code=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.__danbridgeGetDB=()=>db;window.__danbridgeSetDB=value=>{db=value};
  new Function(`let cloudRole='',cloudTeacherId='',cloudBranchIds=[],cloudCanManageSchedule=false,cloudUid='',cloudEmailKey='',cloudRoleAccessSignature='',applyingCloud=false;
   const OWNER_EMAIL='owner@example.test',OWNER_DISPLAY_NAME='Owner',DANBRIDGE_ENVIRONMENT='production';
   const flushOperationalErrors=()=>{},restoreOwnerSyncRecovery=()=>{},installOperationalResilienceUI=()=>{},deepCopy=structuredClone,cloudStatus=()=>{};
   const emptyDB=()=>Object.fromEntries(Object.keys(window.__danbridgeGetDB()).map(k=>[k,[]]));
   ${code}
   window.currentCloudRole=()=>cloudRole;window.__testApplyRole=applyRoleUI;installRoleInteractionGuards();`)();
  window.__testBranch={role:'branch_manager',teacherId:'t1',branchIds:['art_museum'],readOnly:true,canMoveSchedule:true};
  window.__testApplyRole(window.__testBranch,{uid:'branch',email:'branch@example.test'});
  Object.assign(db,{branches:[{id:'art_museum',name:'美術東四路',rooms:['1']}],students:[{id:'s1',name:'學生甲',parent:'家長甲',rate:700,courseType:'1對1',branchIds:['art_museum']},{id:'g1',name:'團課甲',isGroupRoster:true,groupMemberIds:['s1'],courseType:'團班',branchIds:['art_museum']}],teachers:[{id:'t1',name:'本校區老師',type:'兼職',rate:300,assignedBranchIds:['art_museum']}],lessons:[{id:'l1',studentId:'s1',teacherId:'t1',branchId:'art_museum',location:'美術東四路',date:monthNow()+'-15',start:'10:00',end:'11:00',status:'未上課',billingBranchId:'art_museum'}]});
  window.__testDb=structuredClone(db);renderAll();switchTab('students');window.DanbridgeRoleResponsive.apply();
 },roleCode);
 const students=page.locator('#students');
 await expect(students.getByRole('tab',{name:'家教',exact:true})).toBeVisible();
 await expect(students.getByRole('tab',{name:'團課',exact:true})).toBeVisible();
 await expect(students.locator('.col-4')).toBeHidden();
 await expect(students.getByRole('button',{name:'封存',exact:true})).toBeHidden();
 await expect(students.getByRole('button',{name:'歷程',exact:true})).toBeVisible();
 const width=await students.evaluate(el=>({list:el.querySelector('.card.col-8').getBoundingClientRect().width,grid:el.querySelector(':scope>.grid').getBoundingClientRect().width}));
 expect(width.list/width.grid).toBeGreaterThan(.95);
 await students.getByRole('tab',{name:'團課',exact:true}).click();
 await expect(page.locator('#studentRows')).toContainText('團課甲');
 await expect(students.getByRole('button',{name:'歷程',exact:true})).toBeVisible();
 await expect(students.getByRole('button',{name:'封存',exact:true})).toBeHidden();
 await expect(students.getByRole('button',{name:'檢視／編輯',exact:true})).toBeHidden();
 let dialogText='';page.once('dialog',async d=>{dialogText=d.message();await d.dismiss()});
 await students.getByRole('button',{name:'歷程',exact:true}).click();expect(dialogText).toContain('團課甲');
 await page.getByRole('navigation').filter({has:page.locator('button[data-tab="teachers"]')}).getByRole('button',{name:'老師',exact:true}).click();
 await expect(page.locator('#teacherPricingEffectiveMonth')).toBeHidden();
 await page.locator('nav button[data-tab="finance"]').click();
 for(const pane of ['kpi','collections','expenses','overview']){
  const button=page.locator(`#finance .v181-finance-nav button[data-pane="${pane}"]`);await expect(button).toBeVisible();await button.click();
  await expect(page.locator(`#finance .v181-finance-pane[data-pane="${pane}"]`)).toBeVisible();
 }
 await expect(page.locator('#financeBranchScope')).toBeDisabled();
 await expect(page.locator('#finance button[onclick="saveFixedExpense()"]')).toBeHidden();
 await page.evaluate(()=>{
  window.__testApplyRole({role:'teacher',teacherId:'t1'},{uid:'teacher',email:'teacher@example.test'});
  window.__testApplyRole(window.__testBranch,{uid:'branch',email:'branch@example.test'});
  db=structuredClone(window.__testDb);renderAll();window.DanbridgeRoleResponsive.apply();
 });
 for(const tab of ['students','teachers','makeups','finance','calendar']){
  const nav=page.locator(`nav button[data-tab="${tab}"]`);await expect(nav).toBeVisible();await nav.click();
  await expect(page.locator('#'+tab)).toBeVisible();expect(await page.locator('#'+tab).evaluate(e=>e.inert)).toBe(false);
 }
 await page.evaluate(()=>{window.__testApplyRole({role:'owner'},{uid:'owner',email:'owner@example.test'});db=structuredClone(window.__testDb);renderAll();switchTab('teachers')});
 await expect(page.locator('#teacherPricingEffectiveMonth')).toBeVisible();
 await expect(page.locator('#teacherPricingEffectiveMonth')).toHaveValue(/\d{4}-\d{2}/);
 expect(errors).toEqual([]);
});
