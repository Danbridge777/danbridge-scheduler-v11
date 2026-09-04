import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {SCHEDULER_OPERATION_SCHEMA,schedulerLesson} from '../js/core/production-scheduler-operation.js';
const {createProductionSchedulerRuntime}=createRequire(import.meta.url)('../functions/production-scheduler-runtime.cjs');

test('真實本機 Firestore：AA 原子新增、即時移動、刪除、重送、併發、角色通知及中途失敗不留半套', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:180000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const firestore=new Firestore({projectId:'demo-danbridge-scheduler-atomic'}),empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),db={...empty(),branches:[{id:'art_museum',name:'Test'}],students:[1,2,3].map(n=>({id:`student-${n}`,name:`Test ${n}`,rate:123,parentContact:'private'})),teachers:[1,2,3].map(n=>({id:`teacher-${n}`,name:`Teacher ${n}`}))},email='aa0966626336@gmail.com',identity={uid:'scheduler-test-uid',email,emailVerified:true,appVerified:true},access={companyId:'danbridge',active:true,role:'teacher',teacherId:'teacher-aa',canManageSchedule:true},epoch='scheduler-atomic-test-epoch',control=buildProductionRecordRuntimeControl({activationEpoch:epoch,legacyVersionHash:'seed:1',recordDataHash:recordDataHash(db),sourceSha256:'a'.repeat(64),documentCount:7,activeCount:7,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'emulator-only',activatedAt:'2026-09-03T00:00:00.000Z'});
 let requestNumber=0;const req=changes=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:`scheduler-atomic-${++requestNumber}`,release:'20.26.164',changes}),lesson=n=>({id:`atomic-lesson-${n}`,studentId:`student-${n}`,teacherId:`teacher-${n}`,teacherIds:[`teacher-${n}`],date:'2026-10-01',start:'20:00',end:'20:30',branchId:'art_museum',status:'未上課'}),read=async()=>{const snapshots=await Promise.all(FULL_RECORD_COLLECTIONS.map(name=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${name}/records`).get()));return rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((name,index)=>[name,snapshots[index].docs.map(row=>({id:row.id,data:row.data()}))])),{environment:'production'})};
 const dependencies={firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),primaryOwnerEmail:'owner@example.com',now:()=>Date.parse('2026-09-03T15:00:00Z')},runtime=await createProductionSchedulerRuntime(dependencies),timings=[];
 const execute=async(input,actor=identity)=>{const start=performance.now(),response=await runtime.execute(input,actor);timings.push({id:input.requestId,ms:Math.round(performance.now()-start)});return response};
 try{
  const batch=firestore.batch();batch.set(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH),control);batch.set(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:control.activatedAt}));batch.set(firestore.doc(`companyAccess/${email}`),access);
  for(const n of [1,2,3])batch.set(firestore.doc(`companyAccess/teacher${n}@example.com`),{companyId:'danbridge',active:true,role:'teacher',teacherId:`teacher-${n}`});
  batch.set(firestore.doc('companyAccess/revoked@example.com'),{companyId:'danbridge',active:false,role:'teacher',teacherId:'teacher-1'});
  for(const op of buildFullRecordShadowPlan(empty(),db,{environment:'production',sourceHash:'seed'}).operations)batch.set(firestore.doc(op.path),op.payload);await batch.commit();
  await assert.rejects(execute(req([{lessonId:lesson(1).id,before:null,after:lesson(1)}]),{...identity,email:'teacher1@example.com'}),/登入驗證/);
  const initial=req([{lessonId:lesson(1).id,before:null,after:lesson(1)}]),added=await execute(initial),duplicate=await execute(initial);
  assert.deepEqual(duplicate,added);assert.equal(added.notificationCount,3);assert.equal(added.schedulerDb.lessons.length,1);assert.equal(added.schedulerDb.students[0].parentContact,undefined);
  await assert.rejects(execute({...initial,changes:[{...initial.changes[0],after:{...lesson(1),date:'2026-10-04'}}]}),/回條識別衝突/);
  const moved=await execute(req([{lessonId:lesson(1).id,before:lesson(1),after:{...lesson(1),date:'2026-10-02'}}]));
  const removed=await execute(req([{lessonId:lesson(1).id,before:schedulerLesson(moved.schedulerDb.lessons[0]),after:null}]));
  assert.equal(removed.schedulerDb.lessons.length,0);assert.ok(removed.sourceRecordRevision>moved.sourceRecordRevision);
  await assert.rejects(execute(req([{lessonId:lesson(1).id,before:null,after:lesson(1)}])),/曾使用/);
  const concurrent=await Promise.all([1,2,3].map(n=>execute(req([{lessonId:`parallel-${n}`,before:null,after:{...lesson(n),id:`parallel-${n}`}}]))));
  const current=await read(),safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(current.db.lessons.length,3);assert.equal(recordDataHash(current.db),safety.recordDataHash);assert.equal(current.activeCount,safety.activeCount);assert.deepEqual(current.db.students,db.students);
  for(const n of [1,2,3]){const view=(await firestore.doc(`companies/danbridge/teacherViews/teacher${n}@example.com`).get()).data();assert.equal(view.db.lessons.length,1);assert.equal(view.db.lessons[0].teacherId,`teacher-${n}`);assert.equal(view.sourceRecordRevision,safety.recordRevision)}
  const notices=await firestore.collection('companies/danbridge/scheduleNotifications').get();assert.equal(notices.size,18);assert.ok(notices.docs.every(row=>row.data().recipientEmail!=='revoked@example.com'));
  const teacherNotices=notices.docs.map(row=>row.data()).filter(row=>row.recipientRole==='teacher');assert.ok(teacherNotices.every(row=>row.details.every(detail=>[detail.before,detail.after].filter(Boolean).every(item=>item.teacherIds.includes(row.teacherId)&&item.note===''&&item.address===''&&item.meetingUrl===''))));
  // Force an exception after some transaction.set calls. Firestore must not
  // commit any record, derived view, notification or receipt from that attempt.
  const failStore=Object.create(firestore);failStore.runTransaction=callback=>firestore.runTransaction(native=>{let writes=0;const proxy=new Proxy(native,{get(target,key){if(key==='set')return(...args)=>{if(++writes===4)throw new Error('INJECTED_ATOMIC_FAILURE');return target.set(...args)};const value=target[key];return typeof value==='function'?value.bind(target):value}});return callback(proxy)});
  const failing=await createProductionSchedulerRuntime({...dependencies,firestore:failStore}),beforeFailure=await read(),input=req([{lessonId:'failure-lesson',before:null,after:{...lesson(1),id:'failure-lesson',date:'2026-10-03'}}]);
  await assert.rejects(failing.execute(input,identity),/INJECTED_ATOMIC_FAILURE/);assert.deepEqual((await read()).db,beforeFailure.db);assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,18);assert.equal((await firestore.doc(`companies/danbridge/productionSchedulerReceipts/${input.requestId}`).get()).exists,false);
  // Same student/time competes across two requests: exactly one atomic winner.
  const conflictInputs=[1,2].map(n=>req([{lessonId:`race-${n}`,before:null,after:{...lesson(1),id:`race-${n}`,date:'2026-10-05'}}])),outcomes=await Promise.allSettled(conflictInputs.map(input=>execute(input)));
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.match(outcomes.find(row=>row.status==='rejected').reason.message,/學生時間衝突/);
  // Separate runtimes have separate in-memory lanes. They must still be correct
  // under database contention; do not mistake a warm-instance improvement for
  // a distributed two-second guarantee.
  const independent=await Promise.all([1,2,3].map(()=>createProductionSchedulerRuntime(dependencies))),distributedTimings=[];
  await Promise.all(independent.map(async(worker,index)=>{const n=index+1,input=req([{lessonId:`distributed-${n}`,before:null,after:{...lesson(n),id:`distributed-${n}`,date:'2026-10-06'}}]),start=performance.now();await worker.execute(input,identity);distributedTimings.push({id:input.requestId,ms:Math.round(performance.now()-start)})}));
  const distributedDb=await read(),distributedSafety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(distributedDb.db.lessons.filter(row=>row.id.startsWith('distributed-')).length,3);assert.equal(recordDataHash(distributedDb.db),distributedSafety.recordDataHash);
  for(const n of [1,2,3]){const view=(await firestore.doc(`companies/danbridge/teacherViews/teacher${n}@example.com`).get()).data();assert.ok(view.db.lessons.every(row=>row.teacherId===`teacher-${n}`));assert.equal(view.sourceRecordRevision,distributedSafety.recordRevision)}
  await firestore.doc(`companyAccess/${email}`).update({canManageSchedule:false});await assert.rejects(execute(initial),/權限無效/);
  console.log('ISOLATED_SCHEDULER_ATOMIC_TIMINGS '+JSON.stringify(timings));console.log('ISOLATED_DISTRIBUTED_SCHEDULER_TIMINGS '+JSON.stringify(distributedTimings));assert.equal(concurrent.length,3);
 }finally{await firestore.terminate()}
});
