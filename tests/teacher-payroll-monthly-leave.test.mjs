import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/modules/business/business-logic.js',import.meta.url),'utf8');

function runtime({teacher,lessons=[],leaves=[]}){
  const db={students:[],teachers:[teacher],lessons,teacherLeaveRecords:leaves,summerCampRegistrations:[],winterCampRegistrations:[]};
  const sandbox={
    db,window:{},document:{getElementById:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}},
    student:()=>({}),teacher:id=>db.teachers.find(row=>row.id===id)||{},
    lessonTeacherIds:row=>row.teacherIds||[row.teacherId].filter(Boolean),effectiveCampId:()=>'',sameCampSlot:()=>false,
    summerRegistrationTotal:()=>0,summerRegistrationPricingMode:()=>'',summerRegistrationWeekCount:()=>0,
    hours:(start,end)=>{const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));return Math.max(0,(minutes(end)-minutes(start))/60)},
    money:value=>`NT$${Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2})}`,
    fmtHours:value=>Number(value||0).toFixed(2).replace(/\.00$/,'').replace(/0$/,''),
    localDate:date=>date.toISOString().slice(0,10),TextEncoder,structuredClone,console
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'business-logic.js'});return sandbox;
}

const fixed={id:'teacher-1',name:'Wendy',payrollMode:'fixed',baseSalary:44000,overtimeRate:500,deductionRate:300,minWeeklyHours:40,workDays:[1,2,3,4,5]};
const lesson=(id,date,start='09:00',end='17:00')=>({id,date,start,end,teacherId:'teacher-1',teacherIds:['teacher-1'],status:'未上課'});
function weekdayLessons(month){
  const[y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),rows=[];
  for(let day=1;day<=last;day++){const date=`${month}-${String(day).padStart(2,'0')}`,weekday=new Date(`${date}T12:00:00`).getDay();if(weekday>=1&&weekday<=5)rows.push(lesson(`lesson-${date}`,date))}
  return rows;
}

test('monthly minimum hours follows the exact workday count when changing months',()=>{
  const app=runtime({teacher:fixed,lessons:[...weekdayLessons('2026-08'),...weekdayLessons('2026-09')]});
  const august=app.calculateTeacherPayroll(fixed,'2026-08'),september=app.calculateTeacherPayroll(fixed,'2026-09');
  assert.equal(august.monthlyWorkDays,21);
  assert.equal(august.expectedHours,168);
  assert.equal(august.actualHours,168);
  assert.equal(september.monthlyWorkDays,22);
  assert.equal(september.expectedHours,176);
  assert.equal(september.actualHours,176);
  assert.equal(august.amount,44000);
  assert.equal(september.amount,44000);
});

test('fixed salary adds overtime and deducts shortage with the entered rates',()=>{
  const september=weekdayLessons('2026-09');
  const overtime=runtime({teacher:fixed,lessons:[...september,lesson('overtime','2026-09-30','17:00','19:00')]}).calculateTeacherPayroll(fixed,'2026-09');
  assert.equal(overtime.overtimeHours,2);
  assert.equal(overtime.addition,1000);
  assert.equal(overtime.amount,45000);
  const shortage=runtime({teacher:fixed,lessons:september.slice(0,-1)}).calculateTeacherPayroll(fixed,'2026-09');
  assert.equal(shortage.shortHours,8);
  assert.equal(shortage.shortageDeduction,2400);
  assert.equal(shortage.amount,41600);
});

test('active teacher leave is prorated from base salary and overlapping records count once',()=>{
  const leaves=[
    {id:'leave-a',teacherId:'teacher-1',date:'2026-09-07',start:'09:00',end:'12:00',status:'active'},
    {id:'leave-overlap',teacherId:'teacher-1',date:'2026-09-07',start:'11:00',end:'14:00',status:'active'},
    {id:'leave-cancelled',teacherId:'teacher-1',date:'2026-09-08',start:'09:00',end:'17:00',status:'cancelled'},
    {id:'leave-weekend',teacherId:'teacher-1',date:'2026-09-12',start:'09:00',end:'17:00',status:'active'},
    {id:'leave-other-month',teacherId:'teacher-1',date:'2026-08-07',start:'09:00',end:'17:00',status:'active'},
    {id:'leave-other-teacher',teacherId:'teacher-2',date:'2026-09-07',start:'09:00',end:'17:00',status:'active'}
  ];
  const result=runtime({teacher:fixed,lessons:weekdayLessons('2026-09'),leaves}).calculateTeacherPayroll(fixed,'2026-09');
  assert.equal(result.leaveHours,5);
  assert.equal(result.leaveHourlyRate,250);
  assert.equal(result.leaveDeduction,1250);
  assert.equal(result.amount,42750);
  assert.equal(result.formulaVersion,'teacher-payroll-v2-workday-leave');
  assert.match(runtime({teacher:fixed,lessons:weekdayLessons('2026-09'),leaves}).teacherPayrollFormulaText(result),/請假 5 hr × NT\$250/);
});

test('leave hours cover the same missing hours before shortage deduction to prevent double charge',()=>{
  const lessons=weekdayLessons('2026-09').filter(row=>row.date!=='2026-09-07');
  const leaves=[{id:'leave-day',teacherId:'teacher-1',date:'2026-09-07',start:'09:00',end:'17:00',status:'active'}];
  const result=runtime({teacher:fixed,lessons,leaves}).calculateTeacherPayroll(fixed,'2026-09');
  assert.equal(result.actualHours,168);
  assert.equal(result.leaveHours,8);
  assert.equal(result.shortHours,0);
  assert.equal(result.shortageDeduction,0);
  assert.equal(result.leaveDeduction,2000);
  assert.equal(result.amount,42000);
});

test('hourly teachers remain based only on explicitly payable lesson hours',()=>{
  const teacher={id:'teacher-1',name:'Hourly',payrollMode:'hourly',rate:600,workDays:[1,2,3,4,5],minWeeklyHours:40};
  const leaves=[{id:'leave',teacherId:'teacher-1',date:'2026-09-07',start:'09:00',end:'17:00',status:'active'}];
  const result=runtime({teacher,lessons:[lesson('paid','2026-09-01','09:00','11:00')],leaves}).calculateTeacherPayroll(teacher,'2026-09');
  assert.equal(result.paidHours,2);
  assert.equal(result.leaveHours,0);
  assert.equal(result.amount,1200);
});
