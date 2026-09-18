import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProductionBranchAccessDb,buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {assertProductionSchedulerActor} from '../js/core/production-scheduler-operation.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
const access={email:'aa0966626336@gmail.com',uid:'aa-test',teacherId:'t1',role:'branch_manager',companyId:'danbridge',active:true,readOnly:true,branchIds:['art_museum'],hideFinancials:true,canViewBranchFinance:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false};
const source={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),branches:[{id:'art_museum',name:'美術東四路'},{id:'hexi',name:'河西一路'},{id:'other',name:'不可見校區'}],students:[{id:'s1',name:'東四學生',parent:'可見家長',billingBranchId:'art_museum',branchIds:['art_museum'],rate:700,partTimeTeacherRate:300,note:'ART_NOTE'},{id:'s2',name:'河西學生',parent:'FOREIGN_PARENT',contact:'FOREIGN_CONTACT',billingBranchId:'hexi',rate:800,partTimeTeacherRate:400,branchIds:['hexi']}],teachers:[{id:'t1',name:'東四老師',assignedBranchIds:['art_museum'],type:'兼職',rate:500},{id:'t2',name:'河西老師',assignedBranchIds:['hexi'],type:'兼職',rate:600,baseSalary:50000}],lessons:[{id:'l1',studentId:'s1',teacherId:'t1',date:'2026-09-01',start:'10:00',end:'11:00',branchId:'art_museum',billingBranchId:'art_museum',paymentStatus:'paid',chargeStudent:'yes',payTeacher:'yes',note:'ART_NOTE'},{id:'l2',studentId:'s2',teacherId:'t2',date:'2026-09-01',start:'11:00',end:'12:00',branchId:'hexi',billingBranchId:'hexi',paymentStatus:'paid',chargeStudent:'yes',payTeacher:'yes',address:'FOREIGN_ADDRESS'},{id:'l3',studentId:'s2',teacherId:'t2',date:'2026-09-01',start:'13:00',end:'14:00',branchId:'other'},{id:'draft',studentId:'s1',teacherId:'t1',branchId:'art_museum',isDraft:true}],fixedExpenses:[{id:'expense-art',branchId:'art_museum',amount:10000},{id:'expense-hexi',branchId:'hexi',amount:90000}],oneTimeExpenses:[{id:'one-art',branchId:'art_museum',month:'2026-09',amount:1000},{id:'one-hexi',branchId:'hexi',month:'2026-09',amount:9000}],collectionRecords:[{id:'receipt-art',branchId:'art_museum',studentIds:['s1'],amount:700},{id:'receipt-mixed',branchId:'art_museum',studentIds:['s1','s2'],billingItemsVersion:1,amount:1500,billingItems:[{key:'art',studentId:'s1',branchId:'art_museum',amount:700},{key:'foreign',studentId:'s2',branchId:'hexi',amount:800}]},{id:'receipt-hexi',branchId:'hexi',studentIds:['s2'],amount:800}],changes:[{id:'history',after:{id:'l1',branchId:'art_museum',rate:777}}]};
test('AA/Lucas see both-campus schedules and only managed-campus finance',()=>{
 const before=JSON.stringify(source),view=projectProductionBranchAccessDb(source,access);
 assert.deepEqual(view.lessons.map(l=>l.id),['l1','l2']);
 assert.deepEqual(view.teachers.map(t=>t.name),['東四老師','河西老師']);
 assert.equal(view.students.find(s=>s.id==='s1').parent,'可見家長');
 assert.equal(view.students.find(s=>s.id==='s2').scheduleReferenceOnly,true);
 assert.equal(view.students.find(s=>s.id==='s1').rate,700);assert.equal(view.lessons.find(l=>l.id==='l1').paymentStatus,'paid');assert.equal(view.teachers.find(t=>t.id==='t1').rate,500);
 assert.deepEqual(view.fixedExpenses.map(row=>row.id),['expense-art']);assert.deepEqual(view.oneTimeExpenses.map(row=>row.id),['one-art']);assert.deepEqual(view.collectionRecords.map(row=>row.id),['receipt-art','receipt-mixed']);assert.equal(view.collectionRecords[1].amount,700);assert.deepEqual(view.collectionRecords[1].studentIds,['s1']);assert.deepEqual(view.collectionRecords[1].billingItems.map(item=>item.key),['art']);assert.deepEqual(view.changes,[]);
 assert.doesNotMatch(JSON.stringify(view),/FOREIGN_|expense-hexi|one-hexi|receipt-hexi|"rate":800|"rate":600|baseSalary/);
 assert.equal(JSON.stringify(source),before,'authoritative values must remain untouched');
 assert.deepEqual(projectProductionBranchAccessDb(view,access),view,'client reprojection must not restore or discard authorized fields');
 assert.deepEqual(buildProductionRoleViews(source,[access])[0].db,view);
});
test('read visibility cannot enable moves; future move capability stays restricted to managed campus',()=>{
 assert.throws(()=>assertProductionSchedulerActor(access),/權限/);
 const actor=assertProductionSchedulerActor({...access,canMoveSchedule:true});
 assert.deepEqual(actor.branchIds,['art_museum']);
 assert.notDeepEqual(actor.branchIds,access.scheduleBranchIds);
});
test('new capability is not applied to other branch managers or Owner source',()=>{
 const legacy={...access,hideFinancials:false};
 const view=projectProductionBranchAccessDb(source,legacy);
 assert.equal(view.lessons.length,1);assert.equal(view.students[0].rate,700);
 assert.equal(source.students[0].rate,700);assert.equal(source.teachers[0].rate,500);
 assert.deepEqual(buildProductionRoleViews(source,[{...access,role:'owner'}]),[]);
});
