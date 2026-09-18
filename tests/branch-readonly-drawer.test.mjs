import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const auth=readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const course=readFileSync(new URL('../js/modules/calendar/course-operations.js',import.meta.url),'utf8');
test('private branch calendar opens schedule details, never unauthorized report service',()=>{
 const code=auth.slice(auth.indexOf('function installTeacherReportUI(){'),auth.indexOf('function subscribeLessonReports(){'));
 for(const role of ['branch_manager','teacher','owner'])for(const boundTeacher of [false,true]){
  const calls=[],lesson={id:'foreign-campus'};
  const window={DanbridgeAccess:{getContext:()=>({hideFinancials:true})},__danbridgeGetDB:()=>({lessons:[lesson]}),openCourseDrawer:id=>calls.push(['drawer',id])};
  const sandbox={window,cloudRole:role,cloudCanManageSchedule:false,canActAsTeacherForLesson:()=>boundTeacher,openTeacherReportModal:id=>calls.push(['report',id]),originalEditLesson:id=>calls.push(['edit',id]),document:{getElementById:()=>null},closeTeacherReportModal(){},saveTeacherReport(){}};
  vm.runInNewContext(code+';installTeacherReportUI();window.editLesson("foreign-campus");',sandbox);
  assert.deepEqual(calls,[[role==='branch_manager'?'drawer':role==='teacher'?'report':'edit','foreign-campus']]);
 }
});
test('private branch drawer does not calculate or display finance and cannot edit',()=>{
 const code=course.slice(course.indexOf('function openCourseDrawer(id){'),course.indexOf('window.__danbridgeActiveCourseDrawerId'));
 const nodes=new Map(),node=()=>({textContent:'',innerHTML:'',dataset:{},classList:{add(){}},setAttribute(){},style:{removeProperty(){}}});
 const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const forbidden=()=>{throw Error('financial helper must not execute')};
 vm.runInNewContext(code+';openCourseDrawer("lesson");',{
  db:{lessons:[{id:'lesson',studentId:'student',date:'2026-09-23',start:'10:00',end:'11:00',location:'河西一路',title:'驗收課程',paymentStatus:'paid'}]},activeCourseDrawerId:'',$,
  student:()=>({name:'測試學生'}),lessonTeacherNames:()=> '測試老師',locationLabel:l=>l.location,formatCourseDrawerDate:d=>d,courseDrawerStatusClass:()=>'',esc:x=>String(x),hours:()=>1,
  window:{currentCloudRole:()=> 'branch_manager',DanbridgeAccess:{getContext:()=>({role:'branch_manager',hideFinancials:true})},calendarOwnerCanEdit:()=>false,canCurrentUserReportLesson:()=>true},
  document:{body:{classList:{add(){}}}},lessonChargeLabel:forbidden,lessonPay:forbidden,money:forbidden,timetableBillingBranchId:forbidden,branchRecord:forbidden
 });
 assert.match($('courseDrawerBody').innerHTML,/河西一路|測試老師/);
 assert.doesNotMatch($('courseDrawerBody').innerHTML,/營收|收費|薪資|已繳|未繳/);
 assert.equal($('courseDrawerEditBtn').hidden,true);
 assert.equal($('courseDrawerEditBtn').onclick,null);
 assert.equal($('courseDrawerReportBtn').hidden,true);
});
test('notification report shortcut also uses private branch readonly details',()=>{
 const code=auth.slice(auth.indexOf('window.openLessonReport=function'),auth.indexOf('window.canCurrentUserReportLesson=function'));
 const calls=[],window={__danbridgeGetDB:()=>({lessons:[{id:'l1'}]}),DanbridgeAccess:{getContext:()=>({hideFinancials:true})},openCourseDrawer:id=>calls.push(id)};
 vm.runInNewContext(code+';window.openLessonReport("l1");',{window,cloudRole:'branch_manager',canActAsTeacherForLesson:()=>true,openTeacherReportModal:()=>{throw Error('must not request private report')}});
 assert.deepEqual(calls,['l1']);
});
