import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {projectProductionSchedulerDb,projectProductionTeacherDb} from '../js/core/production-role-view-projection.js';
import {assertPricingHistoryTransition, validatePricingHistory, pricingServerDate} from '../js/core/pricing-history-policy.js';

test('new historical imports preserve valid dates; reviving a deleted identity cannot erase its retained history',()=>{
 const values={rate:600,partTimeTeacherRate:null,courseType:'1對1'};
 const imported={id:'imported',...values,rate:800,pricingHistoryVersion:1,pricingHistory:[{effectiveFrom:'0001-01-01',values},{effectiveFrom:'2026-08-01',values:{...values,rate:800}}]};
 assertPricingHistoryTransition({collection:'students',before:null,after:imported,now:Date.parse('2026-09-10T04:00:00Z')});
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:imported,after:{id:'imported',...values},now:Date.parse('2026-09-10T04:00:00Z')}),/不可移除/);
 const malformed=structuredClone(imported);malformed.pricingHistory[1].effectiveFrom='2026-02-30';
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:null,after:malformed}),/日期/);
});
function runtime(){
 const db={students:[],teachers:[],lessons:[],summerCampRegistrations:[],winterCampRegistrations:[],collectionRecords:[],teacherLeaveRecords:[]};
 const a={db,window:{},document:{getElementById:()=>null},localStorage:{getItem:()=>null},student:id=>db.students.find(s=>s.id===id)||{},teacher:id=>db.teachers.find(t=>t.id===id)||{},lessonTeacherIds:l=>l.teacherIds||[l.teacherId].filter(Boolean),effectiveCampId:()=>'',sameCampSlot:()=>false,summerRegistrationTotal:()=>0,hours:(s,e)=>{const m=t=>Number(t.slice(0,2))*60+Number(t.slice(3));return(m(e)-m(s))/60},money:n=>'NT$'+n,localDate:d=>d.toISOString().slice(0,10),TextEncoder,structuredClone,console};
 vm.createContext(a);vm.runInContext(fs.readFileSync(new URL('../js/modules/business/business-logic.js',import.meta.url),'utf8'),a);return a;
}
const student={id:'s',name:'孩子',parent:'家長',courseType:'1對1',rate:600,partTimeTeacherRate:300};
const lesson=(id,date)=>({id,date,studentId:'s',teacherId:'t',start:'10:00',end:'11:00',status:'未上課'});
const serverNow=Date.parse('2026-09-10T08:00:00Z');
test('server guard accepts frontend history, rename and intermediate future pricing without losing later agreements',()=>{
 const a=runtime(),first=a.withPricingChange(student,{...student,rate:1000},{effectiveFrom:'2026-10-01',today:'2026-09-10'});
 const intermediate=a.withPricingChange(first,{...first,rate:800},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 assertPricingHistoryTransition({collection:'students',before:student,after:first,now:serverNow});
 assertPricingHistoryTransition({collection:'students',before:first,after:intermediate,now:serverNow});
 assert.equal(intermediate.rate,1000);assert.equal(a.studentPricingAt(intermediate,'2026-09-16').rate,800);assert.equal(a.studentPricingAt(intermediate,'2026-10-02').rate,1000);
 assertPricingHistoryTransition({collection:'students',before:intermediate,after:{...intermediate,name:'更名'},now:serverNow});
});
test('server rejects old-client history removal, inconsistent raw prices and fabricated baseline',()=>{
 const a=runtime(),next=a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:next,after:{...student,name:'舊頁面'},now:serverNow}),/不可移除/);
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:next,after:{...next,rate:999},now:serverNow}),/不一致/);
 const fabricated=structuredClone(next);fabricated.pricingHistory[0].values.rate=1;
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:student,after:fabricated,now:serverNow}),/原始費率/);
});
test('server clock rejects backdated changes even when the client claims an earlier date',()=>{
 const a=runtime(),backdated=a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-09',today:'2026-09-01'});
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:student,after:backdated,now:serverNow}),/伺服器今天/);
 assert.equal(pricingServerDate(Date.parse('2026-09-09T16:00:00Z')),'2026-09-10');
 assert.equal(pricingServerDate(Date.parse('2026-09-09T15:59:59Z')),'2026-09-09');
});
test('history validation rejects duplicate dates, arrays, missing fields, negative and non-finite money',()=>{
 const a=runtime(),valid=a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 for(const mutate of [r=>r.pricingHistory.push(structuredClone(r.pricingHistory[1])),r=>r.pricingHistory[0].values=[],r=>delete r.pricingHistory[0].values.rate,r=>r.pricingHistory[0].values.rate=-1,r=>r.pricingHistory[0].values.rate='Infinity',r=>r.pricingHistoryVersion=2]){
  const broken=structuredClone(valid);mutate(broken);assert.throws(()=>validatePricingHistory(broken,'students'),/費率歷程保護/);
 }
 const duplicate=structuredClone(valid);duplicate.pricingHistory.push(structuredClone(duplicate.pricingHistory[1]));assert.throws(()=>a.studentPricingAt(duplicate,'2026-09-16'),/歷程/);
});
test('financial readers reject invalid historical amounts instead of producing a zero or non-finite bill',()=>{
 const a=runtime(),valid=a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 for(const invalid of [-1,'Infinity','NaN',{},[],true]){
  const broken=structuredClone(valid);broken.pricingHistory[0].values.rate=invalid;
  a.db.students=[broken];a.db.lessons=[lesson('bad','2026-09-14')];
  assert.throws(()=>a.studentMonthlyBillingData('s','2026-09'),/費率歷程/);
  assert.throws(()=>a.studentLineBillingText('s','2026-09'),/費率歷程/);
 }
 const teacher={id:'t',type:'正職',payrollMode:'fixed',baseSalary:44000,workDays:[1,2,3,4,5]};
 const updated=a.withPricingChange(teacher,{...teacher,baseSalary:50000},{kind:'teacher',effectiveFrom:'2026-10-01',today:'2026-09-10'});
 for(const days of [[1,1],[7],['1'],'weekdays']){
  const broken=structuredClone(updated);broken.pricingHistory[0].values.workDays=days;
  assert.throws(()=>a.teacherPricingAt(broken,'2026-09-01'),/費率歷程/);
 }
});
test('existing history cannot lose an old row, but explicit restore can restore a prior complete record',()=>{
 const a=runtime(),first=a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-01',today:'2026-08-01'}),tampered=structuredClone(first);
 tampered.pricingHistory[1].values.rate=900;tampered.rate=900;
 assert.throws(()=>assertPricingHistoryTransition({collection:'students',before:first,after:tampered,now:serverNow}),/歷史/);
 assertPricingHistoryTransition({collection:'students',before:first,after:student,now:serverNow,restore:true});
 assertPricingHistoryTransition({collection:'lessons',before:{id:'l'},after:{id:'l',start:'11:00'},now:serverNow});
});
test('dated tuition and part-time changes preserve old lessons and sum a mixed-rate month correctly',()=>{
 const a=runtime(),updated=a.withPricingChange(student,{...student,rate:800,partTimeTeacherRate:400},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 a.db.students=[updated];a.db.teachers=[{id:'t',type:'兼職',payrollMode:'hourly',rate:900}];a.db.lessons=[lesson('aug','2026-08-01'),lesson('old','2026-09-14'),lesson('new','2026-09-15')];
 assert.equal(a.lessonStudentCharge(a.db.lessons[0],'s'),600);assert.equal(a.studentMonthlyBillingData('s','2026-09').total,1400);
 assert.equal(a.lessonTeacherPay(a.db.lessons[1],'t'),300);assert.equal(a.lessonTeacherPay(a.db.lessons[2],'t'),400);
 const text=a.studentLineBillingText('s','2026-09');assert.match(text,/1 小時 × NT\$600 ＋ 1 小時 × NT\$800 = NT\$1400/);
 assert.equal(student.rate,600);
});
test('repeated future changes retain the baseline; explicit zero and blank teacher override differ',()=>{
 const a=runtime(),v1=a.withPricingChange(student,{...student,rate:800,partTimeTeacherRate:0},{effectiveFrom:'2026-09-15',today:'2026-09-10'});
 const v2=a.withPricingChange(v1,{...v1,rate:1000,partTimeTeacherRate:undefined},{effectiveFrom:'2026-10-01',today:'2026-09-10'});
 a.db.students=[v2];a.db.teachers=[{id:'t',type:'兼職',payrollMode:'hourly',rate:900}];
 assert.equal(a.studentPricingAt('s','2026-08-01').rate,600);assert.equal(a.studentPricingAt('s','2026-09-16').rate,800);
 assert.equal(a.lessonTeacherPay(lesson('zero','2026-09-16'),'t'),0);assert.equal(a.lessonTeacherPay(lesson('inherit','2026-10-01'),'t'),900);
});
test('historical edits and invalid dates are rejected rather than silently rewriting prices',()=>{
 const a=runtime(),next={...student,rate:900};
 for(const date of ['2026-08-01','2026-02-30','bad'])assert.throws(()=>a.withPricingChange(student,next,{effectiveFrom:date,today:'2026-09-10'}),/生效日/);
 assert.throws(()=>a.withPricingChange(student,{...student,courseType:'安親'},{effectiveFrom:'2026-09-15',today:'2026-09-10'}),/第一天/);
 const monthly={...student,courseType:'安親'};
 assert.throws(()=>a.withPricingChange(monthly,{...monthly,rate:9000},{effectiveFrom:'2026-09-15',today:'2026-09-10'}),/第一天/);
});
test('teacher salary, workdays and minimum hours follow the selected month',()=>{
 const a=runtime(),t={id:'t',type:'正職',payrollMode:'fixed',baseSalary:44000,overtimeRate:500,deductionRate:300,minWeeklyHours:40,workDays:[1,2,3,4,5]};
 const future=a.withPricingChange(t,{...t,baseSalary:50000,minWeeklyHours:30},{kind:'teacher',effectiveFrom:'2026-10-01',today:'2026-09-10'});
 a.db.teachers=[future];
 const sep=a.calculateTeacherPayroll(future,'2026-09',[]),oct=a.calculateTeacherPayroll(future,'2026-10',[]);
 assert.equal(sep.baseSalary,44000);assert.equal(sep.expectedHours,176);assert.equal(oct.baseSalary,50000);assert.equal(oct.expectedHours,132);
});
test('changing from monthly to hourly next month does not change this month or older monthly bills',()=>{
 const a=runtime(),before={...student,courseType:'安親',rate:8000};
 a.db.students=[a.withPricingChange(before,{...before,courseType:'1對1',rate:800},{effectiveFrom:'2026-10-01',today:'2026-09-10'})];
 a.db.lessons=[lesson('sep','2026-09-15'),lesson('oct','2026-10-01')];
 assert.equal(a.studentMonthlyBillingData('s','2026-09').total,8000);assert.equal(a.studentMonthlyBillingData('s','2026-10').total,800);
});
test('pricing histories never leak into scheduler or teacher projections',()=>{
 const a=runtime();a.db.students=[a.withPricingChange(student,{...student,rate:800},{effectiveFrom:'2026-09-15',today:'2026-09-10'})];a.db.lessons=[lesson('l','2026-09-15')];a.db.teachers=[{id:'t',pricingHistory:[{secret:123}]}];
 for(const projected of [projectProductionSchedulerDb(a.db),projectProductionTeacherDb(a.db,'t')])assert.doesNotMatch(JSON.stringify(projected),/pricingHistory|partTimeTeacherRate|preserved-before/);
});
