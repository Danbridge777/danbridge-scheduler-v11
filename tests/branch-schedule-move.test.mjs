import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildProductionSchedulerTarget,assertProductionSchedulerActor,schedulerLesson,SCHEDULER_OPERATION_SCHEMA} from '../js/core/production-scheduler-operation.js';
import {createBranchScheduleMoveController,mergeBranchMoveView} from '../js/core/branch-schedule-move.js';
import {projectProductionBranchDb,projectProductionBranchAccessDb} from '../js/core/production-role-view-projection.js';
const clone=x=>structuredClone(x);
const actor={uid:'lucas-fixture',email:'lucas@example.test',role:'branch_manager',teacherId:'teacher1',companyId:'danbridge',active:true,readOnly:true,canMoveSchedule:true,branchIds:['art_museum'],managerName:'Lucas'};
const lesson={id:'lesson1',date:'2026-10-01',start:'16:00',end:'17:30',teacherId:'teacher1',teacherIds:['teacher1'],studentId:'student1',branchId:'art_museum',location:'美術東四路',room:'教室 1',deliveryMode:'onsite',billingBranchId:'hexi',status:'未上課',paymentStatus:'paid',teacherReportText:'keep',chargeStudent:'yes',payTeacher:'yes'};
const seed=()=>({...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),branches:[{id:'art_museum',rooms:['教室 1','教室 2']},{id:'hexi',rooms:['教室 1']}],teachers:[{id:'teacher1',name:'Lucas'},{id:'teacher2',name:'Wendy'}],students:[{id:'student1',name:'A',rate:700},{id:'student2',name:'B',rate:800}],lessons:[clone(lesson),{...lesson,id:'other-campus',teacherId:'teacher2',teacherIds:['teacher2'],studentId:'student2',branchId:'hexi',location:'河西一路'}],fixedExpenses:[{id:'expense',branchId:'art_museum',amount:300}]});
const request=changes=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:'branch-move-test-123',release:'20.26.332',changes});
const change=(db,patch)=>({lessonId:'lesson1',before:schedulerLesson(db.lessons[0]),after:{...schedulerLesson(db.lessons[0]),...patch}});
const run=(db,changes,a=actor)=>buildProductionSchedulerTarget(db,request(changes),a,{nowIso:'2026-09-17T01:00:00Z'});
test('future explicit unlock retains both-campus redacted view while only art-campus moves succeed',async()=>{
 const access={...actor,hideFinancials:true,scheduleBranchIds:['art_museum','hexi']};
 let server=seed(),stored=null,applied,revision=1,id=0;server.lessons[0].note='PRIVATE_FEE_NOTE';
 const controller=await createBranchScheduleMoveController({storage:{load:async()=>stored,save:async x=>stored=clone(x)},locks:{request:async(n,o,work)=>work({name:n})},key:'private-move-fixture',branchIds:access.branchIds,access,release:'20.26.332',initialDb:projectProductionBranchAccessDb(server,access),revision,onApply:x=>applied=x,onState:()=>{},createRequestId:()=>`private-move-${++id}`,send:async req=>{const result=buildProductionSchedulerTarget(server,req,access,{nowIso:'2026-09-17T01:00:00Z'});server=result.db;return{schema:'danbridge-production-scheduler-operation-response-v1',state:'committed',requestId:req.requestId,sourceHash:'record-v1:'+'a'.repeat(64),sourceRecordRevision:++revision,operationCount:2,notificationCount:1,schedulerDb:result.schedulerDb}}});
 for(const date of ['2026-10-02','2026-10-03','2026-10-04']){const next=clone(applied);next.lessons.find(l=>l.id==='lesson1').date=date;await controller.move(next);assert.equal(applied.lessons.length,2);assert.doesNotMatch(JSON.stringify(applied),/PRIVATE_FEE_NOTE|"rate":|"amount":/)}
 assert.equal(server.lessons[0].note,'PRIVATE_FEE_NOTE');assert.equal(server.lessons[0].billingBranchId,'hexi');assert.equal(server.lessons[0].paymentStatus,'paid');assert.equal(server.students[0].rate,700);
 const foreign=clone(applied);foreign.lessons.find(l=>l.id==='other-campus').date='2026-10-05';await assert.rejects(()=>controller.move(foreign),/授權校區/);await controller.stop();
});
test('branch move keeps duration, financial values, parent identity and other campus unchanged',()=>{
 const db=seed(),original=clone(db),result=run(db,[change(db,{date:'2026-10-02',start:'17:00',end:'18:30'})]);
 assert.equal(result.db.lessons[0].date,'2026-10-02');
 for(const key of Object.keys(lesson).filter(k=>!['date','start','end'].includes(k)))assert.deepEqual(result.db.lessons[0][key],lesson[key]);
 assert.deepEqual(result.db.lessons[1],db.lessons[1]);assert.deepEqual(db,original);assert.deepEqual(result.db.students,db.students);assert.deepEqual(result.db.makeups,db.makeups);
 assert.deepEqual(result.schedulerDb.lessons.map(l=>l.id),['lesson1']);assert.equal(result.schedulerDb.students[0].rate,undefined);
});
test('move capability must be explicitly granted and cannot change other roles',()=>{
 for(const patch of [{canMoveSchedule:false},{canMoveSchedule:undefined},{active:false},{role:'teacher'},{role:'owner'},{branchIds:[]},{teacherId:''},{uid:''},{companyId:'other'}])assert.throws(()=>assertProductionSchedulerActor({...actor,...patch}));
});
test('reject add/delete, forged campus, reassignment, fee fields and duration change',()=>{
 const db=seed();
 for(const patch of [{branchId:'hexi'},{location:'河西一路'},{billingBranchId:'art_museum'},{studentId:'student2'},{teacherId:'teacher2'},{status:'取消'},{note:'changed'},{end:'18:00'},{rate:'1'}])assert.throws(()=>run(db,[change(db,patch)]));
 assert.throws(()=>run(db,[{...change(db,{}),after:null}]));assert.throws(()=>run(db,[{lessonId:'new',before:null,after:{...schedulerLesson(lesson),id:'new'}}]));
 const outside=schedulerLesson(db.lessons[1]);assert.throws(()=>run(db,[{lessonId:outside.id,before:{...outside,branchId:'art_museum'},after:{...outside,branchId:'art_museum',date:'2026-10-02'}}]),/授權校區/);
});
test('room/student collisions reject all moves; concurrent date edits never overwrite',()=>{
 const db=seed();db.lessons.push({...lesson,id:'collision',date:'2026-10-02',studentId:'student2'});
 assert.throws(()=>run(db,[change(db,{date:'2026-10-02'})]),/教室時間衝突/);
 const stale=change(db,{date:'2026-10-03'});db.lessons[0].date='2026-10-04';assert.throws(()=>run(db,[stale]),/其他人更新/);
});
test('moving a leave lesson does not create/cancel makeup records',()=>{
 const db=seed();db.lessons[0].status='學生請假';db.makeups=[{id:'existing',sourceLessonId:'lesson1',branchId:'art_museum',status:'cancelled'}];assert.deepEqual(run(db,[change(db,{date:'2026-10-03'})]).db.makeups,db.makeups);
});
test('durable branch queue retries same request and overlays only its campus, retaining financial view',async()=>{
 let db=seed(),stored=null,id=0,fail=true,applied,attempts=[];
 const locks={request:async(name,options,work)=>work({name})};
 const controller=await createBranchScheduleMoveController({storage:{load:async()=>clone(stored),save:async x=>{stored=clone(x)}},locks,key:'branch-test',branchIds:actor.branchIds,release:'20.26.332',initialDb:projectProductionBranchDb(db,actor.branchIds),revision:1,createRequestId:()=>`branch-move-fixture-${++id}`,onApply:x=>applied=x,onState:()=>{},send:async req=>{attempts.push(req.requestId);if(fail)throw Object.assign(Error('offline'),{code:'unavailable'});const result=buildProductionSchedulerTarget(db,req,actor,{nowIso:'2026-09-17T01:00:00Z'});db=result.db;return{schema:'danbridge-production-scheduler-operation-response-v1',state:'committed',requestId:req.requestId,sourceHash:'record-v1:'+'a'.repeat(64),sourceRecordRevision:2,operationCount:2,notificationCount:4,schedulerDb:result.schedulerDb}}});
 const local=clone(applied);local.lessons[0].date='2026-10-02';await assert.rejects(controller.move(local),/offline/);assert.ok(stored);assert.equal(applied.lessons[0].date,'2026-10-02');assert.equal(applied.students[0].rate,700);
 fail=false;await controller.flush();assert.equal(attempts[0],attempts[1]);assert.equal(db.lessons[0].date,'2026-10-02');assert.equal(applied.lessons.length,1);assert.equal(db.lessons[0].teacherReportText,'keep');assert.equal(applied.lessons[0].teacherReportText,undefined,'future reports remain hidden by the existing projection');assert.equal(applied.fixedExpenses[0].amount,300);
 await controller.stop();
});
test('branch merge cannot inject an out-of-campus lesson',()=>{const db=seed(),result=mergeBranchMoveView(db,db,['art_museum']);assert.deepEqual(result.lessons.map(l=>l.id),['lesson1'])});
test('receipt carries concurrent additions/deletions and financial updates; stale snapshots cannot restore them',async()=>{
 let server=seed(),applied,stored=null,serial=0,revision=1;
 server.lessons.push({...lesson,id:'remove-me',studentId:'student2',teacherId:'teacher2',date:'2026-10-05'});const initial=clone(server);
 const controller=await createBranchScheduleMoveController({storage:{load:async()=>stored,save:async v=>{stored=clone(v)}},locks:{request:async(n,o,f)=>f({name:n})},key:'concurrent-branch',branchIds:actor.branchIds,release:'20.26.332',initialDb:server,revision,createRequestId:()=>`branch-concurrent-${++serial}`,onApply:v=>{applied=v},onState:()=>{},send:async request=>{
  if(serial===1){server.lessons=server.lessons.filter(l=>l.id!=='remove-me');server.lessons.push({...lesson,id:'new-remote',studentId:'student2',teacherId:'teacher2',date:'2026-10-06'});server.fixedExpenses[0].amount=420}
  const result=buildProductionSchedulerTarget(server,request,actor,{nowIso:'2026-09-17T01:00:00Z'});server=result.db;
  return{schema:'danbridge-production-scheduler-operation-response-v1',state:'committed',requestId:request.requestId,sourceHash:'record-v1:'+'a'.repeat(64),sourceRecordRevision:++revision,operationCount:2,notificationCount:5,schedulerDb:result.schedulerDb,branchDb:projectProductionBranchDb(server,actor.branchIds)};
 }});
 let next=clone(applied);next.lessons.find(l=>l.id==='lesson1').date='2026-10-02';await controller.move(next);
 assert.deepEqual(applied.lessons.map(l=>l.id).sort(),['lesson1','new-remote']);assert.equal(applied.fixedExpenses[0].amount,420);
 await controller.acceptSnapshot(initial,1);assert.deepEqual(applied.lessons.map(l=>l.id).sort(),['lesson1','new-remote']);assert.equal(applied.fixedExpenses[0].amount,420);
 next=clone(applied);next.lessons.find(l=>l.id==='lesson1').date='2026-10-03';await controller.move(next);assert.equal(server.lessons.find(l=>l.id==='lesson1').date,'2026-10-03');await controller.stop();
});
