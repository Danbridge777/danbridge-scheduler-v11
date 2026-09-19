import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const leave=createRequire(import.meta.url)('../js/core/teacher-leave-entitlement.cjs');

test('10,000 todos survive decisions and only explicit completion clears; repeats do not change balances',()=>{
 const records=Array.from({length:10000},(_,i)=>({id:`stress-${i}`,status:'pending',requiresCompletion:true,teacherId:'teacher-1',date:'2026-09-21',hours:1,leaveType:'personal'}));
 for(let round=0;round<3;round++){
  for(const row of records){row.status='pending';delete row.completedAtIso}
  assert.equal(leave.leaveDashboardStats({records}).outstanding,10000);
  records.forEach((row,i)=>row.status=['approved','rejected','cancelled'][i%3]);
  assert.equal(leave.leaveDashboardStats({records}).pending,0);assert.equal(leave.leaveDashboardStats({records}).outstanding,10000);
  const balance=leave.leaveBalance({records,teacher:{id:'teacher-1'},type:'personal',year:2026});
  for(let i=0;i<10000;i+=1000){records.slice(i,i+1000).forEach(row=>row.completedAtIso='2026-09-19T00:00:00Z');assert.equal(leave.leaveDashboardStats({records}).outstanding,9000-i)}
  assert.deepEqual(leave.leaveBalance({records,teacher:{id:'teacher-1'},type:'personal',year:2026}),balance);
 }
 assert.equal(leave.isOutstandingTodo({status:'approved'}),false,'legacy approved history is not reopened');
 assert.equal(leave.isOutstandingTodo({status:'pending'}),true,'legacy pending requests remain visible');
});

test('特休依法定年資階梯計算',()=>{const start='2020-01-01';assert.equal(leave.statutoryAnnualLeaveDays('2026-04-01','2026-09-19'),0);assert.equal(leave.statutoryAnnualLeaveDays('2026-01-01','2026-07-01'),3);assert.equal(leave.statutoryAnnualLeaveDays(start,'2021-01-01'),7);assert.equal(leave.statutoryAnnualLeaveDays(start,'2022-01-01'),10);assert.equal(leave.statutoryAnnualLeaveDays(start,'2024-01-01'),14);assert.equal(leave.statutoryAnnualLeaveDays(start,'2026-01-01'),15);assert.equal(leave.statutoryAnnualLeaveDays(start,'2040-01-01'),26)});
test('顯示剩餘／法定總額，只有核准及舊 active 紀錄扣除',()=>{const teacher={id:'teacher-1',employmentStartDate:'2020-01-01',standardDailyHours:8},records=[{teacherId:'teacher-1',leaveType:'personal',date:'2026-01-02',hours:8,status:'approved'},{teacherId:'teacher-1',leaveType:'personal',date:'2026-01-03',hours:8,status:'pending'},{teacherId:'teacher-1',leaveType:'familyCare',date:'2026-01-04',hours:4,status:'active'}];assert.deepEqual(leave.leaveBalance({records,teacher,type:'personal',year:2026}),{type:'personal',total:14,used:1.5,remaining:12.5,rows:[records[0]]});assert.equal(leave.leaveBalance({records,teacher,type:'familyCare',year:2026}).remaining,6.5)});
test('請假自動比對主授與共同授課，列出重疊學生及時數',()=>{const record={teacherId:'teacher-1',date:'2026-09-19',start:'09:30',end:'11:30'},db={students:[{id:'s1',name:'Amy'},{id:'s2',name:'Ben'}],lessons:[{id:'l1',date:'2026-09-19',start:'09:00',end:'10:00',teacherId:'teacher-1',studentId:'s1'},{id:'l2',date:'2026-09-19',start:'10:00',end:'12:00',teacherId:'other',coTeacherIds:['teacher-1'],studentId:'s2'},{id:'l3',date:'2026-09-20',start:'10:00',end:'11:00',teacherId:'teacher-1',studentId:'s1'}]};const rows=leave.impactedLessonsForLeave(record,db);assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.overlapHours),[0.5,1.5]);assert.deepEqual(rows.map(row=>row.studentNames[0]),['Amy','Ben'])});
