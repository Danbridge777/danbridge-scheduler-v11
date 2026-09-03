import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProductionRoleViewPublishRequest,buildProductionLessonMeta,buildProductionRoleViews,productionClientDataHash,productionLessonMetaSignature,projectProductionBranchDb,projectProductionSchedulerDb,projectProductionTeacherDb,PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA} from '../js/core/production-role-view-projection.js';

const empty=()=>({students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],branches:[]});
const source={...empty(),branches:[{id:'art_museum',name:'美術東四路',rooms:['1']},{id:'hexi',name:'河西一路',rooms:['2']}],students:[{id:'s1',name:'甲',parentName:'不得外洩',phone:'0911',branchIds:['art_museum']},{id:'s2',name:'乙',parentName:'不得外洩',branchIds:['hexi']}],teachers:[{id:'t1',name:'張毅',rate:999,assignedBranchIds:['art_museum']},{id:'t2',name:'王師',rate:888,assignedBranchIds:['hexi']}],lessons:[{id:'l1',date:'2026-09-02',start:'10:00',end:'11:00',studentId:'s1',teacherId:'t1',branchId:'art_museum',paymentStatus:'paid',teacherReportContent:'未到日期不得發布',teacherReportUpdatedAt:'2026-09-01T10:00:00Z',status:'已上課'},{id:'l2',date:'2026-09-01',start:'12:00',end:'13:00',studentId:'s2',teacherIds:['t2'],branchId:'hexi',paymentStatus:'paid',teacherReportContent:'已完成',teacherReportUpdatedAt:'2026-09-01T10:00:00Z',status:'已上課'}]};

test('發布請求精確綁定正式逐筆 hash、版本與未知欄位拒絕',()=>{
 const request=assertProductionRoleViewPublishRequest({schema:PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA,requestId:'roleview-1234567890',sourceHash:`record-v1:${'a'.repeat(64)}`,release:'20.26.153'});assert.equal(request.release,'20.26.153');
 assert.throws(()=>assertProductionRoleViewPublishRequest({...request,sourceHash:'legacy'}));assert.throws(()=>assertProductionRoleViewPublishRequest({...request,extra:true}));
});

test('老師投影只含本人課程並排除費用、家長與未到期回報',()=>{
 const db=projectProductionTeacherDb(source,'t1',{now:Date.parse('2026-09-01T12:00:00Z')});assert.deepEqual(db.lessons.map(row=>row.id),['l1']);assert.equal(db.lessons[0].paymentStatus,undefined);assert.equal(db.lessons[0].teacherReportContent,undefined);assert.equal(db.students[0].parentName,undefined);assert.equal(db.teachers[0].rate,undefined);
});

test('AA 投影保留全老師排課欄位但不包含家長或費用資料',()=>{
 const db=projectProductionSchedulerDb(source);assert.deepEqual(db.lessons.map(row=>row.id),['l1','l2']);assert.equal(db.students[0].parentName,undefined);assert.equal(db.lessons[0].paymentStatus,undefined);assert.equal(db.teachers[0].rate,undefined);
});

test('校區投影嚴格隔離另一校區，雜湊可重現',()=>{
 const db=projectProductionBranchDb(source,['art_museum'],{now:Date.parse('2026-09-01T12:00:00Z')});assert.deepEqual(db.students.map(row=>row.id),['s1']);assert.deepEqual(db.teachers.map(row=>row.id),['t1']);assert.deepEqual(db.lessons.map(row=>row.id),['l1']);assert.equal(productionClientDataHash(db),productionClientDataHash(JSON.parse(JSON.stringify(db))));
});

test('三角色發布清單由有效權限唯一產生，AA 不會誤成一般老師',()=>{
 const views=buildProductionRoleViews(source,[{email:'aa0966626336@gmail.com',role:'teacher',teacherId:'t1',canManageSchedule:true,active:true,companyId:'danbridge'},{email:'teacher@gmail.com',role:'teacher',teacherId:'t1',active:true,companyId:'danbridge'},{email:'manager@gmail.com',role:'branch_manager',teacherId:'t1',branchIds:['art_museum'],active:true,companyId:'danbridge'},{email:'disabled@gmail.com',role:'teacher',teacherId:'t2',active:false,companyId:'danbridge'}],{now:Date.parse('2026-09-01T12:00:00Z')});assert.deepEqual(views.map(row=>row.kind),['branch_manager','scheduler','teacher']);assert.equal(views.find(row=>row.kind==='scheduler').db.lessons.length,2);
});

test('lessonMeta 使用台北日界線且簽章忽略更新時間',()=>{
 const meta=buildProductionLessonMeta(source);assert.equal(meta.length,2);const first=meta.find(row=>row.lessonId==='l1');assert.equal(first.payload.editableFrom.toISOString(),'2026-09-01T16:00:00.000Z');assert.equal(first.payload.editableUntil.toISOString(),'2026-09-02T15:59:59.999Z');assert.equal(productionLessonMetaSignature(first.payload),productionLessonMetaSignature({...first.payload,updatedAt:new Date()}));
});

test('重用時區格式器不快取日期：跨午夜與不同請求仍精確隔離未來回報',()=>{
 const db=structuredClone(source);db.lessons[0].teacherReportUpdatedAt='2026-09-01T16:00:00Z';
 for(const project of [()=>projectProductionTeacherDb,()=>((value,id,options)=>projectProductionBranchDb(value,['art_museum'],options))]){
  const run=now=>project()(db,'t1',{now:Date.parse(now)}).lessons[0].teacherReportContent;
  assert.equal(run('2026-09-01T15:59:59.999Z'),undefined);
  assert.equal(run('2026-09-01T16:00:00.000Z'),'未到日期不得發布');
  assert.equal(run('2026-09-01T15:59:59.999Z'),undefined);
  assert.equal(run('2026-09-02T16:00:00.000Z'),'未到日期不得發布');
 }
});
