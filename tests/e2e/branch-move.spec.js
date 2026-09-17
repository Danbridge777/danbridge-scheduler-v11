const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test('Lucas scoped teacher filter and repeated real pointer moves retain duration and finance',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(async()=>{
  const [{createBranchScheduleMoveController},{FULL_RECORD_COLLECTIONS},{buildProductionSchedulerTarget},{recordDataHash},{projectProductionBranchDb}]=await Promise.all([import('/js/core/branch-schedule-move.js'),import('/js/core/cloud-full-record-shadow.js'),import('/js/core/production-scheduler-operation.js'),import('/js/core/cloud-record-data-hash.js'),import('/js/core/production-role-view-projection.js')]);
  const actor={uid:'lucas-fixture',email:'lucas@example.test',companyId:'danbridge',role:'branch_manager',active:true,canMoveSchedule:true,readOnly:true,teacherId:'t1',branchIds:['art_museum']};
  let server={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),branches:[{id:'art_museum',name:'美術東四路',rooms:['1']},{id:'hexi',name:'河西一路',rooms:['2']}],students:[{id:'s1',name:'甲',rate:700},{id:'s2',name:'乙',rate:800}],teachers:[{id:'t1',name:'Lucas'},{id:'t2',name:'Wendy'},{id:'outside',name:'其他校區老師'}],lessons:[{id:'l1',studentId:'s1',teacherId:'t1',date:'2026-10-01',start:'10:00',end:'11:30',branchId:'art_museum',location:'美術東四路',room:'1',status:'未上課',billingBranchId:'hexi',paymentStatus:'paid'},{id:'l2',studentId:'s2',teacherId:'t2',date:'2026-10-01',start:'13:00',end:'14:00',branchId:'art_museum',location:'美術東四路',room:'1',status:'未上課'},{id:'other',studentId:'s1',teacherId:'outside',date:'2026-10-01',start:'15:00',end:'16:00',branchId:'hexi',location:'河西一路',room:'2',status:'未上課'}]};
  window.__branchOriginal=structuredClone(server);let stored=null,sequence=0,revision=1;
  document.body.classList.remove('auth-locked','teacher-cloud-role','scheduler-cloud-role');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext(actor);window.currentCloudRole=()=> 'branch_manager';window.__branchErrors=[];
  const controller=await createBranchScheduleMoveController({storage:{load:async()=>stored,save:async value=>{stored=structuredClone(value)}},locks:navigator.locks,key:'lucas-ui-fixture',release:'20.26.332',branchIds:actor.branchIds,initialDb:projectProductionBranchDb(server,actor.branchIds),revision,createRequestId:()=>`lucas-pointer-${++sequence}`,onApply:value=>{db=structuredClone(value);renderAll()},onState:value=>{window.__branchState=value},send:async request=>{
   await new Promise(r=>setTimeout(r,300));const result=buildProductionSchedulerTarget(server,request,actor,{nowIso:'2026-09-17T01:00:00Z'});server=result.db;window.__branchServer=structuredClone(server);
   return{schema:'danbridge-production-scheduler-operation-response-v1',state:'committed',requestId:request.requestId,sourceHash:recordDataHash(server),sourceRecordRevision:++revision,operationCount:result.events.length*2,notificationCount:4,schedulerDb:result.schedulerDb};
  }});
  window.__danbridgeBranchMoveReady=()=>window.DanbridgeAccess.getContext().canMoveSchedule===true;
  window.saveDB=options=>{if(options?.scheduleAction!=='lesson.move')throw Error('Unexpected mutation');controller.move(db).catch(e=>window.__branchErrors.push(e.message))};
  document.getElementById('calendarDate').value='2026-10-01';document.getElementById('calendarMode').value='month';switchTab('calendar');renderAll();window.DanbridgeRoleResponsive.apply();
 });
 await page.locator('#calendarFilterPanel > summary').click();
 const teachers=page.locator('#calendarTeacherFilter');await expect(teachers).toBeVisible();
 await expect(teachers.locator('option')).not.toContainText(['其他校區老師']);
 await teachers.selectOption('t2');await expect(page.locator('#calendarCanvas [data-id="l2"]:visible').first()).toBeVisible();await expect(page.locator('#calendarCanvas [data-id="l1"]:visible')).toHaveCount(0);
 await teachers.selectOption('t1');await expect(page.locator('#calendarCanvas [data-id="l1"]:visible').first()).toBeVisible();await expect(page.locator('#calendarCanvas [data-id="l2"]:visible')).toHaveCount(0);
 await expect(page.locator('#calendar .calendar-quick-add')).toBeHidden();
 for(const date of ['2026-10-02','2026-10-03','2026-10-04']){
  const source=page.locator('#calendarCanvas [data-id="l1"]:visible').first(),target=page.locator(`#calendarCanvas [data-date="${date}"]`).first();
  await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+50,{steps:12});await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__branchServer?.lessons.find(l=>l.id==='l1').date)).toBe(date);
 }
 expect(await page.evaluate(()=>window.__branchErrors)).toEqual([]);
 expect(await page.evaluate(()=>{const l=window.__branchServer.lessons.find(l=>l.id==='l1');return[l.start,l.end,l.billingBranchId,l.paymentStatus,l.teacherIds]})).toEqual(['10:00','11:30','hexi','paid',undefined]);
 expect(await page.evaluate(()=>JSON.stringify(window.__branchOriginal.lessons[2])===JSON.stringify(window.__branchServer.lessons[2]))).toBe(true);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({canMoveSchedule:false});moveLessonTo('l1','2026-10-05')});
 expect(await page.evaluate(()=>db.lessons.find(l=>l.id==='l1').date)).toBe('2026-10-04');
});
