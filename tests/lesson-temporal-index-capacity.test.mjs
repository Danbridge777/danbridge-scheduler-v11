import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';

const require=createRequire(import.meta.url);
const index=require('../js/core/lesson-temporal-index.js');

function lessons(count=300_000){
  return Array.from({length:count},(_,number)=>({
    id:`lesson-${number}`,
    date:`${2026+Math.floor(number/(12*28*1000))}-${String(number%12+1).padStart(2,'0')}-${String(number%28+1).padStart(2,'0')}`,
    start:`${String(number%12+8).padStart(2,'0')}:00`,
    end:`${String(number%12+9).padStart(2,'0')}:00`,
    studentId:`student-${number%1200}`,
    teacherId:`teacher-${number%40}`,
    teacherIds:[`teacher-${number%40}`]
  }));
}

test('300,000 lessons stay queryable by visible date, month, student and teacher',()=>{
  const rows=lessons(),buildStarted=performance.now(),stats=index.rebuild(rows),buildMs=performance.now()-buildStarted;
  assert.equal(stats.lessonCount,300_000);
  assert.equal(stats.studentCount,1200);
  assert.equal(stats.teacherCount,40);

  const queryStarted=performance.now();
  const day=index.byDate(rows,'2026-01-01');
  const month=index.byMonth(rows,'2026-01');
  const week=index.between(rows,'2026-01-01','2026-01-07');
  const student=index.byStudent(rows,'student-0');
  const teacher=index.byTeacher(rows,'teacher-0');
  const queryMs=performance.now()-queryStarted;

  assert.equal(day.length,rows.filter(row=>row.date==='2026-01-01').length);
  assert.equal(month.length,rows.filter(row=>row.date.startsWith('2026-01')).length);
  assert.equal(week.length,rows.filter(row=>row.date>='2026-01-01'&&row.date<='2026-01-07').length);
  assert.equal(student.length,rows.filter(row=>row.studentId==='student-0').length);
  assert.equal(teacher.length,rows.filter(row=>row.teacherId==='teacher-0').length);
  assert.ok(buildMs<4000,`index build took ${buildMs.toFixed(1)} ms`);
  assert.ok(queryMs<100,`visible queries took ${queryMs.toFixed(1)} ms`);
});

test('incremental create, move and delete update only affected index rows',()=>{
  const rows=lessons(300_000);index.rebuild(rows);
  const moved=rows[0],before={...moved};moved.date='2027-12-31';
  const created={id:'lesson-created',date:'2027-12-31',start:'10:00',end:'11:00',studentId:'student-new',teacherId:'teacher-new',teacherIds:['teacher-new']};
  rows.push(created);
  const deleted=rows[1];rows.splice(1,1);
  const started=performance.now();
  index.applyPatches([{id:moved.id,before,after:moved},{id:created.id,before:null,after:created},{id:deleted.id,before:deleted,after:null}],rows);
  const patchMs=performance.now()-started;

  assert.equal(index.byDate(rows,'2027-12-31').length,2);
  assert.equal(index.byStudent(rows,'student-new').length,1);
  assert.equal(index.byDate(rows,deleted.date).some(row=>row.id===deleted.id),false);
  assert.ok(patchMs<100,`incremental index patch took ${patchMs.toFixed(1)} ms`);
});
