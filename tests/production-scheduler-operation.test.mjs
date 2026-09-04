import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {productionSchedulerErrorCode,createSchedulerExecutionLane} from '../functions/production-scheduler-runtime.cjs';
import {SCHEDULER_OPERATION_SCHEMA,normalizeProductionSchedulerRequest,assertProductionSchedulerActor,buildProductionSchedulerTarget,schedulerLesson} from '../js/core/production-scheduler-operation.js';
const actor={uid:'scheduler-test-uid',email:'aa0966626336@gmail.com',role:'teacher',active:true,companyId:'danbridge',teacherId:'teacher-aa',canManageSchedule:true,displayName:'AA'};
const lesson={id:'test-lesson-1',date:'2026-10-01',start:'20:00',end:'20:30',studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],branchId:'art_museum',status:'未上課'};
const seed=()=>({...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),branches:[{id:'art_museum'}],students:[{id:'student-1',name:'Isolated',rate:123,parentContact:'private'}],teachers:[{id:'teacher-1'}],lessons:[{...structuredClone(lesson),paymentStatus:'paid',chargeStudent:'yes',payTeacher:'yes',teacherReportText:'preserve report'}],fixedExpenses:[{id:'expense-1',amount:999}]});
const request=changes=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:'scheduler-test-request-1',release:'20.26.164',changes});
const run=(db,changes)=>buildProductionSchedulerTarget(db,request(changes),actor,{nowIso:'2026-09-03T13:00:00.000Z'});

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
 const db=seed(),leave=run(db,[{lessonId:lesson.id,before:lesson,after:{...lesson,status:'學生請假'}}]);
 assert.equal(leave.db.makeups.length,1);assert.equal(leave.db.makeups[0].hours,.5);
 leave.db.makeups[0].status='scheduled';leave.db.makeups[0].scheduledLessonId='makeup-lesson';leave.db.lessons.push({...lesson,id:'makeup-lesson',date:'2026-10-03'});
 const restored=run(leave.db,[{lessonId:lesson.id,before:{...lesson,status:'學生請假'},after:lesson}]);
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
