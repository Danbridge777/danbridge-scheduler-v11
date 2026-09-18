import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {projectProductionBranchDb,buildProductionLessonMeta} from '../js/core/production-role-view-projection.js';

const own={id:'lesson',studentId:'local',teacherId:'teacher',branchId:'art_museum',date:'2026-09-01',start:'10:00',end:'11:00'};
const other={...own,studentId:'foreign',branchId:'hexi',note:'FOREIGN_SECRET',address:'FOREIGN_ADDRESS'};
const now=Date.parse('2026-09-17T00:00:00Z');
test('student history never invents or exposes payment state for finance-hidden accounts',()=>{
 const source=fs.readFileSync(new URL('../js/modules/students/students-crm.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function showStudentHistory('));
 for(const hideFinancials of [true,false]){
  let output='';
  const context={window:{DanbridgeAccess:{getContext:()=>({hideFinancials})}},db:{students:[{id:'s',name:'Student'}],lessons:[{studentId:'s',date:'2026-09-18',start:'16:00',end:'16:30',status:'未上課',paymentStatus:'paid'},{studentId:'s',date:'2026-09-17',start:'16:00',end:'16:30',status:'未上課'}]},studentDefaults:x=>x,lessonIncludesStudent:()=>false,lessonTeacherNames:()=> 'Teacher',alert:value=>{output=value}};
  vm.runInNewContext(code+';showStudentHistory("s")',context);
  assert.match(output,/Student/);assert.match(output,/16:00–16:30/);
  if(hideFinancials)assert.doesNotMatch(output,/已繳|未繳/);else {assert.match(output,/已繳/);assert.match(output,/未繳/)}
 }
});
test('cross-branch history exposes only the authorized side, never preformatted foreign details',()=>{
 const source={lessons:[own],changes:[
  {id:'in',at:'2026-09-01',type:'移課',lessonId:own.id,before:other,after:own,summary:'FOREIGN_SECRET'},
  {id:'out',at:'2026-09-01',type:'移課',lessonId:own.id,before:own,after:other,studentId:'foreign'},
  {id:'foreign-only',lessonId:own.id,before:other,after:other},
  {id:'draft',lessonId:own.id,before:null,after:{...own,isDraft:true}}
 ]};
 const unchanged=JSON.stringify(source),view=projectProductionBranchDb(source,['art_museum'],{now});
 assert.deepEqual(view.changes.map(x=>x.id),['in','out']);
 assert.equal(view.changes[0].before,null);assert.equal(view.changes[1].after,null);
 assert.equal(view.changes[1].studentId,'local');
 assert.doesNotMatch(JSON.stringify(view),/FOREIGN_|foreign|hexi/);
 assert.equal(JSON.stringify(source),unchanged);
 assert.deepEqual(projectProductionBranchDb(view,['art_museum'],{now}),view);
});
test('unknown and blank locations never default into the art branch',()=>{
 const locations=['','新校區','到府','線上課','河西一路','美術東四路'];
 const lessons=locations.map((location,i)=>({...own,id:'l'+i,branchId:undefined,location}));
 assert.deepEqual(projectProductionBranchDb({lessons},['art_museum'],{now}).lessons.map(x=>x.id),['l5']);
 assert.deepEqual(buildProductionLessonMeta({lessons}).map(x=>x.payload.branchId),['unassigned','unassigned','unassigned','unassigned','hexi','art_museum']);
 const runtime={window:{},document:{body:{dataset:{},classList:{toggle(){}}}}};vm.createContext(runtime);
 vm.runInContext(fs.readFileSync(new URL('../js/core/access-control.js',import.meta.url),'utf8'),runtime);
 assert.deepEqual(locations.map(x=>runtime.window.DanbridgeAccess.branchIdFromLocation(x)),['unassigned','unassigned','unassigned','unassigned','hexi','art_museum']);
});
test('future teacher reports remain suppressed in historical lesson snapshots',()=>{
 const future={...own,date:'2026-10-01',teacherReportContent:'PREMATURE',teacherReportUpdatedAt:'2026-09-17T00:00:00Z'};
 const view=projectProductionBranchDb({lessons:[future],changes:[{id:'change',before:null,after:future}]},['art_museum'],{now});
 assert.doesNotMatch(JSON.stringify(view),/PREMATURE/);
});
