import test from 'node:test';
import assert from 'node:assert/strict';
import {applyScheduleCommand,buildScheduleCommand,coalesceScheduleCommands,SCHEDULE_COMMAND_KINDS} from '../js/core/schedule-collaboration-command.js';

const lesson={id:'lesson-1',studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],date:'2026-11-01',start:'20:00',end:'20:30',branchId:'art_museum',room:'教室 3',location:'美術東四路',deliveryMode:'onsite',title:'數學',status:'未上課',note:''};
const command=(before,after,sequence,hint='')=>buildScheduleCommand({before,after,sequence,actionHint:hint,deviceId:'device-a',batchId:'batch-1',commandId:`device-a:${sequence}`,createdAt:`2026-09-05T00:00:${String(sequence).padStart(2,'0')}.000Z`});

test('每一種允許的課表操作都是明確語意，不接受任意路徑',()=>{
 assert.deepEqual(SCHEDULE_COMMAND_KINDS,[
  'lesson.create','lesson.delete','lesson.copy','lesson.move','lesson.update.time','lesson.update.teacher','lesson.update.room','lesson.update.location','lesson.update.student','lesson.update.title','lesson.update.status','lesson.update.note','lesson.update.fields'
 ]);
 assert.throws(()=>command(lesson,{...lesson,title:'新標題'},1,'lesson.update.unknown'),/允許清單/);
});

test('新增後立刻移動再刪除，在尚未送出前抵銷成零筆',()=>{
 const created={...lesson},moved={...lesson,date:'2026-11-02'};
 const commands=[command(null,created,1,'lesson.create'),command(created,moved,2,'lesson.move'),command(moved,null,3,'lesson.delete')];
 assert.deepEqual(coalesceScheduleCommands(commands),[]);
});

test('新增後連續改時間與老師，只送最後完整 create',()=>{
 const moved={...lesson,date:'2026-11-02',start:'19:30',end:'20:00'},assigned={...moved,teacherId:'teacher-2',teacherIds:['teacher-2']};
 const [result]=coalesceScheduleCommands([command(null,lesson,1,'lesson.create'),command(lesson,moved,2,'lesson.move'),command(moved,assigned,3,'lesson.update.teacher')]);
 assert.equal(result.kind,'lesson.create');assert.equal(result.after.date,'2026-11-02');assert.equal(result.after.teacherId,'teacher-2');
});

test('不同欄位的兩台裝置更新可以合併，同欄位不同值必須衝突',()=>{
 const time=command(lesson,{...lesson,start:'19:30',end:'20:00'},1,'lesson.update.time');
 const teacher=buildScheduleCommand({before:lesson,after:{...lesson,teacherId:'teacher-2',teacherIds:['teacher-2']},sequence:1,actionHint:'lesson.update.teacher',deviceId:'device-b',batchId:'batch-2',commandId:'device-b:1',createdAt:'2026-09-05T00:01:00.000Z'});
 const afterTime=applyScheduleCommand(lesson,time).value,result=applyScheduleCommand(afterTime,teacher);
 assert.equal(result.state,'merged');assert.equal(result.value.start,'19:30');assert.equal(result.value.teacherId,'teacher-2');
 const conflicting=buildScheduleCommand({before:lesson,after:{...lesson,start:'18:00',end:'18:30'},sequence:2,actionHint:'lesson.update.time',deviceId:'device-b',batchId:'batch-2',commandId:'device-b:2',createdAt:'2026-09-05T00:01:01.000Z'});
 const rejected=applyScheduleCommand(afterTime,conflicting);assert.equal(rejected.state,'conflict');assert.deepEqual(rejected.conflicts,['start','end']);assert.deepEqual(rejected.value,afterTime);
});

test('同一 commandId 重送只套用一次',()=>{
 const seen=new Set(),move=command(lesson,{...lesson,date:'2026-11-02'},1,'lesson.move');
 const first=applyScheduleCommand(lesson,move,{seenCommandIds:seen}),second=applyScheduleCommand(first.value,move,{seenCommandIds:seen});
 assert.equal(first.state,'applied');assert.equal(second.state,'duplicate');assert.equal(second.value.date,'2026-11-02');
});

test('8 堂課交錯多選操作仍依 lessonId 各自排序，不互相覆蓋',()=>{
 const commands=[];
 for(let i=0;i<8;i++){
  const before={...lesson,id:`lesson-${i}`,date:`2026-11-${String(i+1).padStart(2,'0')}`},after={...lesson,id:`lesson-${i}`,date:`2026-11-${String(i+2).padStart(2,'0')}`};
  commands.push(buildScheduleCommand({before,after,sequence:i+1,actionHint:'lesson.move',deviceId:'device-a',batchId:'batch-8',commandId:`device-a:batch:${i}`,createdAt:`2026-09-05T00:02:${String(i).padStart(2,'0')}.000Z`}));
 }
 const result=coalesceScheduleCommands(commands.reverse());assert.equal(result.length,8);
 assert.deepEqual(new Set(result.map(row=>row.lessonId)).size,8);assert.ok(result.every(row=>row.kind==='lesson.move'));
});
