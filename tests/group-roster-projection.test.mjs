import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProductionTeacherDb,projectProductionSchedulerDb,projectProductionBranchDb} from '../js/core/production-role-view-projection.js';
test('assigned teacher sees class members without parents, rates or unrelated students; scheduler keeps roster',()=>{
 const source={students:[{id:'group',name:'團班',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b']},...['a','b','secret'].map(id=>({id,name:id,parent:'PRIVATE',rate:999,contact:'SECRET'}))],teachers:[{id:'t',rate:200}],lessons:[{id:'l',studentId:'group',groupStudentIds:['a','b'],teacherId:'t',date:'2026-09-08',branchId:'art_museum',start:'16:00',end:'18:00'}]};
 const view=projectProductionTeacherDb(source,'t');
 assert.deepEqual(view.students.map(s=>s.id),['group','a','b']);assert.equal(view.lessons.length,1);
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE|SECRET|999|200/);
 assert.equal(projectProductionTeacherDb(source,'other').students.length,0);
 assert.deepEqual(projectProductionSchedulerDb(source).lessons[0].groupStudentIds,['a','b']);
 assert.deepEqual(projectProductionBranchDb(source,['art_museum']).students.map(s=>s.id),['group','a','b']);
});
test('student-specific part-time costs are never exposed to teacher or scheduler views',()=>{
 const source={students:[{id:'s',name:'孩子',rate:800,partTimeTeacherRate:300,parent:'家長'}],teachers:[{id:'t',type:'兼職',rate:500}],lessons:[{id:'l',studentId:'s',teacherId:'t',date:'2026-09-08',start:'16:00',end:'17:30'}]};
 for(const view of [projectProductionTeacherDb(source,'t'),projectProductionSchedulerDb(source)]){
  assert.equal(view.students[0].name,'孩子');
  assert.equal(Object.hasOwn(view.students[0],'rate'),false);
  assert.equal(Object.hasOwn(view.students[0],'partTimeTeacherRate'),false);
  assert.equal(Object.hasOwn(view.students[0],'parent'),false);
 }
});
