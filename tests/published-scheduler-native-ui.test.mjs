import test from 'node:test';
import {expect,chromium,webkit} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {createRequire} from 'node:module';
import {startNativeBrowserServer} from './helpers/native-browser-server.mjs';
import {scopedFirestore} from './helpers/scoped-firestore.mjs';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import * as controlTools from '../js/core/cloud-production-record-runtime.js';
const require=createRequire(import.meta.url);
const {isolateApplicationAuth}=require('./e2e/helpers/isolate-application-auth.js');
const {createProductionSchedulerRuntime}=require('../functions/production-scheduler-runtime.cjs');

// Real application controls -> real queue/receipt reader -> native Firestore
// transactions -> native snapshot listener -> real teacher calendar renderer.
// Identity is synthetic. This is NOT a Google login, deployed callable, Rules,
// production latency, or physical 120 Hz acceptance test.
for(const [browserName,browserType] of Object.entries({chromium,webkit}))test(`native published transport ${browserName}: 40 selected lessons, three immediate edits, deletion and reuse`,{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:180000},async()=>{
 expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):\d+$/);
 const assets=await startNativeBrowserServer(),browser=await browserType.launch({headless:true}),context=await browser.newContext({baseURL:assets.url,serviceWorkers:'block',viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>route.request().url().startsWith(assets.url+'/')?route.continue():route.abort());
 const page=await context.newPage();
 const native=new Firestore({projectId:'demo-danbridge-published-ui'}),prefix='acceptancePublishedTransport/run-277-'+randomUUID(),firestore=scopedFirestore(native,prefix);
 const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const baseLesson={studentId:'native-student',teacherId:'native-teacher',teacherIds:['native-teacher'],branchId:'art_museum',location:'美術東四路',room:'A',status:'未上課',paymentStatus:'unpaid'};
 // Half-hour spacing makes every +30 minute batch land on another selected
 // lesson's OLD slot: a real UI regression for self-collision during a move.
 const source={...empty(),branches:[{id:'art_museum',name:'美術東四路',rooms:['A']}],students:[{id:'native-student',name:'隔離學生',courseType:'1對1',rate:600,parent:'隔離家長'}],teachers:[{id:'native-teacher',name:'隔離老師',rate:300}],lessons:Array.from({length:40},(_,i)=>({...baseLesson,id:'native-'+i,date:`2026-10-${String(5+Math.floor(i/8)).padStart(2,'0')}`,start:`${String(8+Math.floor(i%8/2)).padStart(2,'0')}:${i%2?'30':'00'}`,end:`${String(8+Math.floor(i%8/2)).padStart(2,'0')}:${i%2?'45':'15'}`}))};
 const aa='aa0966626336@gmail.com',teacher='native-teacher@example.test',actor={uid:'native-ui-aa',email:aa,emailVerified:true,appVerified:true};
 const schedulerHead='companies/danbridge/schedulerViews/'+aa,teacherHead='companies/danbridge/teacherViews/'+teacher;
 const marker={purpose:'published-native-ui-synthetic-only'};
 let unsubscribe=()=>{},unsubscribeScheduler=()=>{},receiverWork=Promise.resolve(),schedulerWork=Promise.resolve(),releaseReceipt=null,firstCommitted=false;
 const observations=[],receiverErrors=[],unexpectedDialogs=[],requests=[],sends=new Set();
 const receiver=await context.newPage();
 const allowPage=async(p,role)=>{
  await isolateApplicationAuth(p);await p.goto('/index.html',{waitUntil:'load'});
  await p.evaluate(({source,role,aa,teacher})=>{
   document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
   document.body.classList.add('teacher-cloud-role');if(role==='scheduler')document.body.classList.add('scheduler-cloud-role');
   window.DanbridgeAccess.setContext({role:'teacher',email:role==='scheduler'?aa:teacher,teacherId:role==='scheduler'?'aa':'native-teacher',canManageSchedule:role==='scheduler'});window.currentCloudRole=()=> 'teacher';
   db=structuredClone(source);window.saveDB=()=>{throw Error('Queue not attached')};renderAll();window.DanbridgeRoleResponsive?.apply();switchTab('calendar');
   document.getElementById('calendarDate').value='2026-10-05';document.getElementById('calendarMode').value='week';renderCalendar();
  },{source,role,aa,teacher});
 };
 try{
  await native.doc(prefix).create(marker);
  const control=controlTools.buildProductionRecordRuntimeControl({activationEpoch:'native-ui-279',legacyVersionHash:'seed:1',recordDataHash:recordDataHash(source),sourceSha256:'a'.repeat(64),documentCount:43,activeCount:43,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'emulator-only',activatedAt:'2026-09-11T00:00:00.000Z'});
  const seed=firestore.batch();seed.set(firestore.doc(controlTools.PRODUCTION_RECORD_CONTROL_PATH),control);seed.set(firestore.doc(controlTools.PRODUCTION_RECORD_SAFETY_PATH),controlTools.buildProductionRecordRuntimeSafety({control,updatedAt:control.activatedAt}));
  for(const member of [{email:aa,role:'teacher',teacherId:'aa',canManageSchedule:true},{email:teacher,role:'teacher',teacherId:'native-teacher'},{email:'owner@example.test',role:'owner'},{email:'branch@example.test',role:'branch_manager',branchIds:['art_museum']}])seed.set(firestore.doc('companyAccess/'+member.email),{active:true,companyId:'danbridge',...member});
  for(const op of buildFullRecordShadowPlan(empty(),source,{environment:'production',sourceHash:'seed'}).operations)seed.set(firestore.doc(op.path),op.payload);await seed.commit();
  const runtime=await createProductionSchedulerRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:'owner@example.test',publishedRoleChunks:true});
  await allowPage(page,'scheduler');await allowPage(receiver,'teacher');
  const readPart=async({id,scope})=>{expect(id).toMatch(/^[A-Za-z0-9_-]+$/);expect(scope).toMatch(/^[A-Za-z0-9_-]+$/);return(await firestore.doc(`productionRoleChunkViews/${scope}/parts/${id}`).get()).data()};
  await receiver.exposeFunction('nativeReadTeacherHead',async()=>(await firestore.doc(teacherHead).get()).data());await receiver.exposeFunction('nativeReadTeacherPart',readPart);
  await receiver.evaluate(async teacher=>{
   const {createRoleViewTransportSession}=await import('/js/core/role-view-transport-session.js');window.__nativeReceived=[];
   window.__nativeReceiver=createRoleViewTransportSession({identity:{kind:'teacher',email:teacher,teacherId:'native-teacher',branchIds:[]},isActive:()=>true,readCurrentHead:()=>nativeReadTeacherHead(),readPart:(id,scope)=>nativeReadTeacherPart({id,scope}),apply:(next,meta)=>{db=next;renderCalendar();window.__nativeReceived.push({revision:meta.sourceRecordRevision,count:next.lessons.length})}});
  },teacher);
  unsubscribe=native.doc(prefix+'/'+teacherHead).onSnapshot(snapshot=>{
   if(!snapshot.exists)return;const head=snapshot.data();receiverWork=receiverWork.then(()=>receiver.evaluate(head=>window.__nativeReceiver.receive(head),head)).catch(error=>receiverErrors.push(error.message));
  },error=>receiverErrors.push(error.message));
  await page.exposeFunction('nativeReadSchedulerHead',async()=>(await firestore.doc(schedulerHead).get()).data());await page.exposeFunction('nativeReadSchedulerPart',readPart);
  const heldReceipt=new Promise(resolve=>{releaseReceipt=resolve});
  await page.exposeFunction('nativeSendScheduler',request=>{
   const work=(async()=>{
   requests.push(request);const started=performance.now(),result=await runtime.execute(request,actor);
   const receipt=await firestore.doc('companies/danbridge/productionSchedulerReceipts/'+request.requestId).get();
   const notices=await firestore.collection('companies/danbridge/scheduleNotifications').where('sourceRecordRevision','==',result.sourceRecordRevision).get();
   expect(notices.size).toBe(4);expect(notices.docs.every(n=>n.updateTime.isEqual(receipt.updateTime))).toBe(true);
   observations.push({changes:request.changes.length,revision:result.sourceRecordRevision,emulatorCommitAndReadbackMs:performance.now()-started});
   if(requests.length===1){firstCommitted=true;await heldReceipt}return result;
   })();sends.add(work);return work.finally(()=>sends.delete(work));
  });
  await page.evaluate(async aa=>{
   const [{createProductionSchedulerQueue},{createPublishedSchedulerReceiptReader},{createRoleViewTransportSession}]=await Promise.all([import('/js/core/production-scheduler-queue.js'),import('/js/core/published-scheduler-receipt.js'),import('/js/core/role-view-transport-session.js')]);
   let saved=null;window.__nativeQueueEvents=[];window.__nativeQueueErrors=[];
   const reader=createPublishedSchedulerReceiptReader({identity:{kind:'scheduler',email:aa,teacherId:'aa',branchIds:[]},isActive:()=>true,readCurrentHead:()=>nativeReadSchedulerHead(),readPart:(id,scope)=>nativeReadSchedulerPart({id,scope})});
   const queue=createProductionSchedulerQueue({storage:{load:async()=>saved,save:async value=>{saved=structuredClone(value)}},send:async request=>reader.resolve(await nativeSendScheduler(request)),createRequestId:()=> 'native-ui-'+crypto.randomUUID(),release:'20.26.279',maxChangesPerRequest:40,onState:event=>window.__nativeQueueEvents.push(event),onApply:next=>{db=next;renderCalendar()}});
   window.__nativeQueue=queue;await queue.start({baselineDb:db});window.saveDB=options=>queue.queue(db,options).then(()=>queue.flush()).catch(error=>window.__nativeQueueErrors.push(error.message));
   window.__nativeSchedulerReceiver=createRoleViewTransportSession({identity:{kind:'scheduler',email:aa,teacherId:'aa',branchIds:[]},isActive:()=>true,readCurrentHead:()=>nativeReadSchedulerHead(),readPart:(id,scope)=>nativeReadSchedulerPart({id,scope}),apply:(next,meta)=>queue.acceptSnapshot(next,meta.sourceRecordRevision)});
  },aa);
  unsubscribeScheduler=native.doc(prefix+'/'+schedulerHead).onSnapshot(snapshot=>{
   if(!snapshot.exists)return;const head=snapshot.data();schedulerWork=schedulerWork.then(()=>page.evaluate(head=>window.__nativeSchedulerReceiver.receive(head),head)).catch(error=>receiverErrors.push(error.message));
  },error=>receiverErrors.push(error.message));
  for(const p of [page,receiver])p.on('dialog',async d=>{unexpectedDialogs.push(d.message());await d.dismiss()});
  const select40=async()=>{
   await page.locator('#selectionModeBtn').click();await page.locator('#selectionBar').getByRole('button',{name:'全選目前畫面',exact:true}).click();await expect(page.locator('#selectionCount')).toHaveText('已選 40 堂');
  };
  for(let round=0;round<3;round++){
   await select40();await page.locator('#selectionBar').getByRole('button',{name:'批次調整',exact:true}).click();await page.locator('#batchTimeShift').selectOption('30');
   await page.locator('#batchModal').getByRole('button',{name:'預覽',exact:true}).click();await expect(page.locator('#batchPreview')).toContainText('可套用 40 堂');
   await page.locator('#batchModal').getByRole('button',{name:'確認套用',exact:true}).click();await expect(page.locator('#batchModal')).not.toHaveClass(/show/);
   await expect.poll(()=>page.evaluate(()=>db.lessons.find(l=>l.id==='native-0').start)).toBe(['08:30','09:00','09:30'][round]);
   if(round===0)await expect.poll(()=>firstCommitted).toBe(true);
  }
  // First receipt is deliberately withheld. The second and third UI actions
  // and delete must remain usable without allowing that old receipt to revive
  // records or move the calendar back to the first edit.
  await select40();await page.locator('#selectionBar').getByRole('button',{name:'刪除選取',exact:true}).click();await page.locator('#calendarDeleteConfirmation').getByRole('button',{name:'刪除 40 堂課',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>db.lessons.length)).toBe(0);releaseReceipt();
  await expect.poll(()=>page.evaluate(()=>window.__nativeQueueEvents.at(-1)?.state),{timeout:30000}).toBe('complete');
  await expect.poll(()=>receiver.evaluate(()=>window.__nativeReceived.at(-1)?.count),{timeout:30000}).toBe(0);
  // After the pending chain drains, the actual create modal is still usable.
  await page.locator('#calendar').getByRole('button',{name:'＋ 新增課程',exact:true}).first().click();await page.locator('#lessonDate').fill('2026-10-05');await page.locator('#startTime').selectOption('20:00');await page.locator('#endTime').selectOption('20:30');await page.locator('#lessonStudent').selectOption('native-student');await page.locator('#lessonTeacher').selectOption('native-teacher');await page.locator('#lessonBranch').selectOption('art_museum');await page.locator('#lessonTitle').fill('佇列清空後再新增');await page.getByRole('button',{name:'儲存課程',exact:true}).click();
  await expect.poll(()=>receiver.evaluate(()=>window.__nativeReceived.at(-1)?.count),{timeout:30000}).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.__nativeQueueEvents.at(-1)?.state)).toMatch(/^(complete|ready)$/);await receiverWork;await schedulerWork;
  const collections=await Promise.all(FULL_RECORD_COLLECTIONS.map(k=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get()));
  const rebuilt=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,collections[i].docs.map(d=>({id:d.id,data:d.data()}))])),{environment:'production'}).db;
  expect(rebuilt.lessons).toHaveLength(1);expect(rebuilt.lessons[0].title).toBe('佇列清空後再新增');expect(rebuilt.students).toEqual(source.students);expect(rebuilt.teachers).toEqual(source.teachers);
  expect(requests.every(r=>r.changes.length<=40)).toBe(true);expect(requests[0].changes).toHaveLength(40);expect(requests.some(r=>r.changes.length===40&&r.changes.every(c=>c.after===null))).toBe(true);
  expect(await page.evaluate(()=>window.__nativeQueueErrors)).toEqual([]);expect(receiverErrors).toEqual([]);expect(unexpectedDialogs).toEqual([]);
  expect(await receiver.evaluate(()=>db.students.every(s=>s.rate===undefined))).toBe(true);
  console.log('NATIVE_UI_EVIDENCE '+JSON.stringify({browserName,syntheticIdentity:true,emulator:true,productionWrites:0,observations,received:await receiver.evaluate(()=>window.__nativeReceived)}));
 }finally{
  releaseReceipt?.();unsubscribe();unsubscribeScheduler();await Promise.allSettled([...sends]);await receiverWork;await schedulerWork;await receiver.close();
  if((await native.doc(prefix).get()).data()?.purpose===marker.purpose)await native.recursiveDelete(native.doc(prefix));
  await native.terminate();await browser.close();await assets.close();
 }
});
