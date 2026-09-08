import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {nativeCanonicalSha256,nativeCanonicalRecordDbSha256} from '../functions/native-canonical-sha256.cjs';
import {productionSchedulerErrorCode,createSchedulerExecutionLane} from '../functions/production-scheduler-runtime.cjs';
import {withProductionCommitLease,COMMIT_LEASE_PATH} from '../functions/production-commit-lease.cjs';
import {createProductionTransactionReader} from '../functions/production-transaction-reads.cjs';
import {SCHEDULER_OPERATION_SCHEMA,normalizeProductionSchedulerRequest,assertProductionSchedulerActor,buildProductionSchedulerTarget,schedulerLesson} from '../js/core/production-scheduler-operation.js';
const actor={uid:'scheduler-test-uid',email:'aa0966626336@gmail.com',role:'teacher',active:true,companyId:'danbridge',teacherId:'teacher-aa',canManageSchedule:true,displayName:'AA'};
const lesson={id:'test-lesson-1',date:'2026-10-01',start:'20:00',end:'20:30',studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],branchId:'art_museum',status:'未上課'};
const seed=()=>({...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),branches:[{id:'art_museum'}],students:[{id:'student-1',name:'Isolated',rate:123,parentContact:'private'}],teachers:[{id:'teacher-1'}],lessons:[{...structuredClone(lesson),paymentStatus:'paid',chargeStudent:'yes',payTeacher:'yes',teacherReportText:'preserve report'}],fixedExpenses:[{id:'expense-1',amount:999}]});
const request=changes=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:'scheduler-test-request-1',release:'20.26.164',changes});
const run=(db,changes)=>buildProductionSchedulerTarget(db,request(changes),actor,{nowIso:'2026-09-03T13:00:00.000Z'});

test('交易讀取合併 RPC、保留不存在文件、只共用同次交易快照',async()=>{
 const snapshot=(path,exists=true)=>({ref:{path},exists,data:()=>exists?{path}:undefined}),calls=[],firestore={doc:path=>({path})};
 const transaction={getAll:async(...refs)=>{calls.push(refs.map(row=>row.path));return refs.map(row=>snapshot(row.path,row.path!=='missing')).reverse();}};
 const cached=snapshot('cached'),read=createProductionTransactionReader(firestore,transaction,[cached]);
 const a=read('a');assert.equal(read('a'),a);
 const values=await Promise.all([a,read('b'),read('missing'),read('cached')]);
 assert.deepEqual(calls,[['a','b','missing']]);assert.equal(values[0].ref.path,'a');assert.equal(values[2].exists,false);assert.equal(values[3],cached);
 await createProductionTransactionReader(firestore,transaction)('a');assert.equal(calls.length,2,'new attempt must read again');
 for(const getAll of [async()=>[],async()=>{throw Error('network failure')}]){
  const read=createProductionTransactionReader(firestore,{getAll});
  const outcomes=await Promise.allSettled([read('a'),read('b')]);assert.ok(outcomes.every(row=>row.status==='rejected'));
 }
});

test('最佳化規劃與完整規劃的 DB、每筆操作、雜湊及計數完全一致',()=>{
 const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(name=>[name,[]]));
 const documents=empty();for(const op of buildFullRecordShadowPlan(empty(),seed(),{environment:'production',sourceHash:'fixture'}).operations)documents[op.payload.collection].push({id:op.payload.recordId,data:op.payload});
 for(const action of ['add','move','leave','unleave','note','delete']){
  const source=rebuildFullRecordShadowDb(documents,{environment:'production'}),current=source.db.lessons.find(row=>row.id==='parity-lesson'),before=current?schedulerLesson(current):null;
  const after=action==='add'?{...lesson,id:'parity-lesson',date:'2026-10-03'}:action==='delete'?null:{...before,...({move:{date:'2026-10-04'},leave:{status:'學生請假'},unleave:{status:'未上課'},note:{note:'Unicode 臺灣 😀'}}[action])};
  const target=run(source.db,[{lessonId:'parity-lesson',before,after}]),options={documentsByCollection:documents,baselineDb:source.db,localDb:target.db,environment:'production',deviceId:'parity-device',activationEpoch:'parity-epoch',createdAt:'2026-09-03T13:00:00.000Z'},reference=prepareActiveRecordSync(options),hash=recordDataHash(source.db);
  const optimized=prepareActiveRecordSync({...options,authoritativeSourceHash:hash,verifiedRemote:{...source,hash},compactResult:true,hashRecordDb:db=>`record-v1:${nativeCanonicalRecordDbSha256(db,FULL_RECORD_COLLECTIONS)}`,hashCanonical:nativeCanonicalSha256,changedCollections:FULL_RECORD_COLLECTIONS.filter(name=>['lessons','students','makeups','changes'].includes(name)),appendOnlyChangesCount:target.db.changes.length-source.db.changes.length});
  for(const key of ['db','targetHash','baseHash','operations','operationCount','nextSequence'])assert.deepEqual(optimized[key],reference[key],`${action}: ${key}`);
  for(const op of optimized.operations){const rows=documents[op.collection],index=rows.findIndex(row=>row.id===op.recordId),row={id:op.recordId,data:op.payload};if(index<0)rows.push(row);else rows[index]=row;}
 }
});

function leaseStore(){
 let value=null,revision=0,lostCreate=false;const error=code=>Object.assign(Error('fixture'),{code});
 const ref={
  create:async data=>{if(value)throw error(6);value={...data};revision++;if(lostCreate){lostCreate=false;throw error(14);}return{writeTime:revision}},
  get:async()=>({exists:!!value,data:()=>value&&({...value}),updateTime:revision}),
  update:async(data,pre)=>{if(!value||pre.lastUpdateTime!==revision)throw error(9);value={...data};return{writeTime:++revision}},
  delete:async pre=>{if(!value)throw error(5);if(pre.lastUpdateTime!==revision)throw error(9);value=null;revision++}
 };
 return{firestore:{doc:path=>{assert.equal(path,COMMIT_LEASE_PATH);return ref}},transaction:{get:()=>ref.get()},get:()=>value,replace:data=>{value=data;revision++},loseCreate:()=>lostCreate=true};
}
test('跨實例租約正常提交與例外皆釋放，建立回條遺失只恢復同一 token',async()=>{
 const store=leaseStore();store.loseCreate();
 assert.equal(await withProductionCommitLease(store.firestore,async lease=>{await lease.assertHeld(store.transaction);return'committed'}),'committed');assert.equal(store.get(),null);
 await assert.rejects(withProductionCommitLease(store.firestore,async()=>{throw Error('business failure')}),/business failure/);assert.equal(store.get(),null);
});
test('過期租約可條件接管；舊持有者不可提交或刪掉新持有者',async()=>{
 const store=leaseStore();store.replace({schema:'danbridge-production-commit-lease-v1',token:'expired',expiresAtMs:0});
 await withProductionCommitLease(store.firestore,async lease=>{
  await lease.assertHeld(store.transaction);store.replace({schema:'danbridge-production-commit-lease-v1',token:'successor',expiresAtMs:999999});
  await assert.rejects(lease.assertHeld(store.transaction),e=>e.code===14);
 },{clock:()=>100});assert.equal(store.get().token,'successor');
});
test('未過期或格式不明租約不搶占；等候逾時不執行工作',async()=>{
 for(const value of [{schema:'danbridge-production-commit-lease-v1',token:'other',expiresAtMs:999999},{malformed:true}]){
  const store=leaseStore();store.replace(value);let clock=0;
  await assert.rejects(withProductionCommitLease(store.firestore,()=>assert.fail('must not execute'),{clock:()=>clock,maxWaitMs:30,sleep:async ms=>{clock+=ms},random:()=>0}),e=>e.code===14);
  assert.deepEqual(store.get(),value);
 }
});
test('工作已超出租約有效時間時必須拒絕提交',async()=>{
 const store=leaseStore();let clock=0;
 await withProductionCommitLease(store.firestore,async lease=>{clock=11;await assert.rejects(lease.assertHeld(store.transaction),e=>e.code===14)},{clock:()=>clock,leaseMs:10});assert.equal(store.get(),null);
});

test('group roster survives scheduler create, move and delete, rejects missing members and overlapping child',()=>{
 const db=seed();db.students.push({id:'group',name:'團班',courseType:'團班',isGroupRoster:true,groupMemberIds:['student-1']});
 db.branches.push({id:'hexi'});
 const added={...lesson,id:'group-lesson',date:'2026-10-03',studentId:'group',billingBranchId:'hexi',groupStudentIds:['student-1']};
 const first=run(db,[{lessonId:added.id,before:null,after:added}]);
 assert.deepEqual(first.schedulerDb.lessons.find(l=>l.id===added.id).groupStudentIds,['student-1']);
 const moved={...added,date:'2026-10-04'};
 const second=run(first.db,[{lessonId:added.id,before:added,after:moved}]);
 assert.deepEqual(second.db.lessons.find(l=>l.id===added.id).groupStudentIds,['student-1']);
 assert.equal(second.schedulerDb.lessons.find(l=>l.id===added.id).billingBranchId,'hexi');
 assert.equal(run(db,[{lessonId:added.id,before:null,after:{...added,billingBranchId:''}}]).db.lessons.find(l=>l.id===added.id).billingBranchId,'','missing ownership is retained as unassigned, never guessed');
 assert.throws(()=>run(db,[{lessonId:added.id,before:null,after:{...added,billingBranchId:'unknown'}}]),/歸屬校區/);
 assert.throws(()=>run(db,[{lessonId:added.id,before:null,after:{...added,groupStudentIds:['missing']}}]),/名單/);
 assert.throws(()=>run(db,[{lessonId:added.id,before:null,after:{...added,date:lesson.date}}]),/學生時間衝突/);
 const third=run(second.db,[{lessonId:added.id,before:moved,after:null}]);assert.equal(third.db.lessons.length,1);
});

test('同一後端實例依序處理；失敗釋放佇列，過載或久候不偷偷丟棄操作',async()=>{
 let release,time=0;const firstGate=new Promise(resolve=>release=resolve),events=[],lane=createSchedulerExecutionLane({maxPending:2,maxWaitMs:10,clock:()=>time});
 const first=lane(async()=>{events.push('first');await firstGate;throw Error('rejected')});const firstFailure=assert.rejects(first,/rejected/);
 const second=lane(async()=>events.push('second'));await assert.rejects(lane(()=>events.push('overload')),error=>error.code===14);await Promise.resolve();assert.deepEqual(events,['first']);release();await firstFailure;await second;assert.deepEqual(events,['first','second']);
 let releaseNext;const pause=new Promise(resolve=>releaseNext=resolve),third=lane(()=>pause),expired=lane(()=>events.push('expired'));const expiredFailure=assert.rejects(expired,error=>error.code===14);await Promise.resolve();time=11;releaseNext();await third;await expiredFailure;assert.deepEqual(events,['first','second']);
 await lane(()=>events.push('recovered'));assert.equal(events.at(-1),'recovered');
});

test('暫時性交易或網路錯誤可重送同一回條，資料衝突與權限錯誤不自動重試',()=>{
 for(const [code,expected] of [[14,'unavailable'],[10,'aborted'],[4,'deadline-exceeded'],['UNAVAILABLE','unavailable'],['functions/internal','internal']])assert.equal(productionSchedulerErrorCode({code}),expected);
 for(const error of [Error('conflict'),{code:7},{code:'permission-denied'},{code:'failed-precondition'},{code:'unauthenticated'}])assert.equal(productionSchedulerErrorCode(error),'failed-precondition');
});

test('排課專員必須同時符合固定帳號、既有授權與公司，不能藉新入口取得 Owner 權限',()=>{
 assert.equal(assertProductionSchedulerActor(actor).role,'teacher');
 for(const patch of [{uid:''},{email:'teacher@example.com'},{role:'owner'},{active:false},{companyId:'other'},{canManageSchedule:false},{readOnly:true},{teacherId:''}])assert.throws(()=>assertProductionSchedulerActor({...actor,...patch}),/權限|身分/);
});
test('拒絕注入財務、帳號、任意路徑、重複課程與無效日期時間',()=>{
 const change={lessonId:lesson.id,before:lesson,after:{...lesson,date:'2026-10-02'}};
 for(const key of ['rate','paymentStatus','payTeacher','teacherReportText','__proto__'])assert.throws(()=>normalizeProductionSchedulerRequest(request([{...change,after:JSON.parse(JSON.stringify(change.after).slice(0,-1)+`,"${key}":"bad"}`)}])),/未允許/);
 assert.throws(()=>normalizeProductionSchedulerRequest({...request([change]),path:'companyAccess/owner'}),/未允許/);
 assert.throws(()=>normalizeProductionSchedulerRequest(request([change,change])),/重複/);
 for(const patch of [{date:'2026-02-30'},{start:'20:45'},{isDraft:true},{teacherIds:['teacher-1','teacher-1']}])assert.throws(()=>normalizeProductionSchedulerRequest(request([{...change,after:{...change.after,...patch}}])));
});
test('修改課程只改允許且實際變更的欄位，保留財務、回報及其他人的不同欄位修改',()=>{
 const db=seed(),before=structuredClone(db);db.lessons[0].room='remote-room';
 const result=run(db,[{lessonId:lesson.id,before:lesson,after:{...lesson,date:'2026-10-02'}}]);
 assert.equal(result.db.lessons[0].date,'2026-10-02');assert.equal(result.db.lessons[0].room,'remote-room');
 assert.equal(result.db.lessons[0].paymentStatus,'paid');assert.equal(result.db.lessons[0].teacherReportText,'preserve report');
 assert.deepEqual(result.db.students,before.students);assert.deepEqual(result.db.fixedExpenses,before.fixedExpenses);assert.equal(result.events.length,1);
 assert.equal(result.schedulerDb.lessons[0].paymentStatus,undefined);assert.equal(result.schedulerDb.students[0].parentContact,undefined);
});
test('排課目標只複製四個可變集合，其餘十二集合沿用權威參照且來源不被改寫',()=>{
 const source=seed();source.changes.push({id:'old-change',type:'old'});const before=structuredClone(source),result=run(source,[{lessonId:lesson.id,before:lesson,after:{...lesson,date:'2026-10-02'}}]),mutable=new Set(['lessons','students','makeups','changes']);
 for(const collection of FULL_RECORD_COLLECTIONS)assert.equal(result.db[collection]===source[collection],!mutable.has(collection),collection);
 assert.notEqual(result.db.lessons[0],source.lessons[0]);assert.equal(result.db.students[0],source.students[0]);assert.equal(result.db.changes[1],source.changes[0]);
 assert.deepEqual(source,before);
});
test('同一欄位衝突、已刪除與 ID 碰撞都拒絕，不覆蓋或復活',()=>{
 const db=seed();db.lessons[0].date='2026-10-03';
 assert.throws(()=>run(db,[{lessonId:lesson.id,before:lesson,after:{...lesson,date:'2026-10-02'}}]),/其他人更新/);
 assert.throws(()=>run(db,[{lessonId:lesson.id,before:lesson,after:null}]),/刪除前/);
 assert.throws(()=>run({...db,lessons:[]},[{lessonId:lesson.id,before:lesson,after:{...lesson,date:'2026-10-02'}}]),/已由其他人刪除/);
 assert.throws(()=>run(db,[{lessonId:lesson.id,before:null,after:lesson}]),/已存在/);
});
test('新增→移動→刪除依序使用已確認內容，最後不留活動課，原始資料未被改寫',()=>{
 const db=seed(),original=structuredClone(db),added={...lesson,id:'rapid-test-2',date:'2026-10-03'};
 const a=run(db,[{lessonId:added.id,before:null,after:added}]);
 const b=run(a.db,[{lessonId:added.id,before:added,after:{...added,date:'2026-10-02'}}]);
 const c=run(b.db,[{lessonId:added.id,before:schedulerLesson(b.db.lessons.find(row=>row.id===added.id)),after:null}]);
 assert.equal(c.db.lessons.length,1);assert.equal(c.db.lessons[0].id,lesson.id);assert.deepEqual(db,original);assert.equal(c.db.changes.length,3);
});
test('多人同時撞到同一學生或教室時拒絕整批；既有無關碰撞不阻止備註修改',()=>{
 const db=seed(),other={...lesson,id:'collision-test'};
 assert.throws(()=>run(db,[{lessonId:other.id,before:null,after:other}]),/學生時間衝突/);
 db.students.push({id:'student-2'});db.lessons[0].room='A';db.lessons[0].deliveryMode='onsite';
 assert.throws(()=>run(db,[{lessonId:other.id,before:null,after:{...other,studentId:'student-2',room:'A',deliveryMode:'onsite'}}]),/教室時間衝突/);
 db.lessons.push({...other,studentId:'student-2',room:'A',deliveryMode:'onsite'});
 const before=schedulerLesson(db.lessons[0]);assert.equal(run(db,[{lessonId:lesson.id,before,after:{...before,note:'only note'}}]).db.lessons[0].note,'only note');
});
test('學生請假建立補課；取消請假同步取消已安排補課，保留其他補課',()=>{
 const db=seed(),sourceBefore=structuredClone(db),leave=run(db,[{lessonId:lesson.id,before:lesson,after:{...lesson,status:'學生請假'}}]);assert.deepEqual(db,sourceBefore);
 assert.equal(leave.db.makeups.length,1);assert.equal(leave.db.makeups[0].hours,.5);
 leave.db.makeups[0].status='scheduled';leave.db.makeups[0].scheduledLessonId='makeup-lesson';leave.db.lessons.push({...lesson,id:'makeup-lesson',date:'2026-10-03'});
 const leaveBefore=structuredClone(leave.db),restored=run(leave.db,[{lessonId:lesson.id,before:{...lesson,status:'學生請假'},after:lesson}]);assert.deepEqual(leave.db,leaveBefore);
 assert.equal(restored.db.makeups[0].status,'cancelled');assert.equal(restored.db.lessons.find(row=>row.id==='makeup-lesson').payTeacher,'no');
 assert.equal(restored.db.lessons.find(row=>row.id==='makeup-lesson').status,'取消');
});
test('新增學生只允許排課欄位，不改既有學生；不存在的老師及校區拒絕',()=>{
 const added={...lesson,id:'rapid-test-2',studentId:'new-student'};
 const result=run(seed(),[{lessonId:added.id,before:null,after:added,student:{id:'new-student',name:'Test'}}]);
 assert.equal(result.db.students.at(-1).rate,0);
 assert.throws(()=>run(seed(),[{lessonId:added.id,before:null,after:added}]),/學生不存在/);
 assert.throws(()=>run(seed(),[{lessonId:added.id,before:null,after:{...added,studentId:'student-1',teacherId:'unknown',teacherIds:['unknown']}}]),/老師不存在/);
 assert.throws(()=>run(seed(),[{lessonId:added.id,before:null,after:{...added,studentId:'student-1',branchId:'unknown'}}]),/校區不存在/);
});
test('偽造備註中的補課 ID 不能修改其他課程的補課紀錄',()=>{
 const db=seed();db.lessons[0].note='MAKEUP:other-makeup';db.makeups.push({id:'other-makeup',scheduledLessonId:'other-lesson',status:'done'});
 const result=run(db,[{lessonId:lesson.id,before:schedulerLesson(db.lessons[0]),after:null}]);assert.deepEqual(result.db.makeups,db.makeups);
});
