const {test,expect}=require('@playwright/test');

test('隔離 AA 真實課表介面：新增後立即改日期再刪除，延遲回條不復活課程',async({page})=>{
 const unexpectedDialogs=[];page.on('dialog',async dialog=>{if(dialog.type()==='confirm'&&/確定儲存以下課程修改|確定刪除這堂課/.test(dialog.message()))await dialog.accept();else{unexpectedDialogs.push(dialog.message());await dialog.dismiss()}});
 // No real Firebase account or lesson is touched. Exercise the actual modal,
 // drawer and save/delete buttons; only authentication/backend are fixtures.
 await page.route('**/js/core/firebase-auth-and-cloud-sync.module.js*',route=>route.fulfill({contentType:'text/javascript',body:'/* isolated test identity */'}));
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(async()=>{
  const [{createProductionSchedulerQueue},{buildProductionSchedulerTarget,SCHEDULER_OPERATION_RESPONSE_SCHEMA},{FULL_RECORD_COLLECTIONS},{recordDataHash}]=await Promise.all([import('/js/core/production-scheduler-queue.js'),import('/js/core/production-scheduler-operation.js'),import('/js/core/cloud-full-record-shadow.js'),import('/js/core/cloud-record-data-hash.js')]);
  const seed={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),branches:[{id:'art_museum',name:'美術東四路',rooms:['A']}],students:[{id:'fixture-student',name:'隔離測試學生',courseType:'1對1',status:'在讀'}],teachers:[{id:'fixture-teacher',name:'張毅',color:'#345'}]};
  let server=structuredClone(seed),stored=null,revision=0,serial=0;const receipts=new Map();
  const output=document.createElement('output');output.id='fixture-queue-state';document.body.append(output);document.body.dataset.serverLessonCount='0';document.body.dataset.fixtureSends='0';
  const queue=createProductionSchedulerQueue({storage:{load:async()=>stored,save:async value=>stored=structuredClone(value)},release:'20.26.164',createRequestId:()=>`browser-scheduler-${++serial}`,onState:event=>output.textContent=event.state,onApply:next=>{db=structuredClone(next);renderAll()},send:async request=>{
   document.body.dataset.fixtureSends=String(Number(document.body.dataset.fixtureSends)+1);await new Promise(resolve=>setTimeout(resolve,1200));
   if(receipts.has(request.requestId))return receipts.get(request.requestId);
   const target=buildProductionSchedulerTarget(server,request,{uid:'scheduler-test-uid',email:'aa0966626336@gmail.com',role:'teacher',active:true,companyId:'danbridge',teacherId:'teacher-aa',canManageSchedule:true},{nowIso:'2026-09-03T15:00:00Z'});server=target.db;document.body.dataset.serverLessonCount=String(server.lessons.length);
   const response={schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,state:'committed',requestId:request.requestId,sourceHash:recordDataHash(server),sourceRecordRevision:++revision,operationCount:target.events.length*2,schedulerDb:target.schedulerDb};receipts.set(request.requestId,response);return response;
  }});
  document.body.classList.remove('auth-locked','branch-manager-cloud-role');document.body.classList.add('teacher-cloud-role','scheduler-cloud-role');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(node=>{node.inert=false;node.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'teacher',email:'aa0966626336@gmail.com',teacherId:'teacher-aa',canManageSchedule:true});window.currentCloudRole=()=> 'teacher';
  db=structuredClone(seed);await queue.start({baselineDb:seed});window.saveDB=()=>{const desired=structuredClone(db);renderAll();queue.queue(desired).then(()=>queue.flush()).catch(error=>output.textContent='error:'+error.message)};
  window.DanbridgeRoleResponsive?.apply();document.getElementById('calendarDate').value='2026-10-01';window.switchTab('calendar');renderAll();
 });
 await page.locator('#calendarDate').fill('2026-10-01');await page.locator('#calendarMode').selectOption('week');
 await page.locator('#calendar').getByRole('button',{name:'＋ 新增課程',exact:true}).first().click();
 await page.locator('#lessonDate').fill('2026-10-01');await page.locator('#startTime').selectOption('20:00');await page.locator('#endTime').selectOption('20:30');await page.locator('#lessonStudent').selectOption('fixture-student');await page.locator('#lessonTeacher').selectOption('fixture-teacher');await page.locator('#lessonBranch').selectOption('art_museum');await page.locator('#lessonTitle').fill('隔離連續操作');
 await page.getByRole('button',{name:'儲存課程',exact:true}).click();await expect(page.locator('body')).toHaveAttribute('data-fixture-sends','1');
 await page.locator('#calendarCanvas [data-id]:visible').first().click();await expect(page.locator('#lessonModal')).toHaveClass(/show/);await page.locator('#lessonDate').fill('2026-10-02');await page.getByRole('button',{name:'儲存課程',exact:true}).click();
 await expect(page.locator('#v181LessonDiffConfirm')).toHaveClass(/show/);await page.locator('#v181LessonDiffConfirm').getByRole('button',{name:'確認儲存',exact:true}).click();await expect(page.locator('#v181LessonDiffConfirm')).toHaveCount(0);
 await page.locator('#calendarCanvas [data-id]:visible').first().click();await expect(page.locator('#lessonModal')).toHaveClass(/show/);await page.locator('#modalDeleteBtn').click();
 await expect(page.locator('#fixture-queue-state')).toHaveText('complete');await expect(page.locator('body')).toHaveAttribute('data-server-lesson-count','0');await expect(page.locator('#calendarCanvas [data-id]')).toHaveCount(0);expect(unexpectedDialogs).toEqual([]);
});
