import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file=readFileSync(new URL('../js/modules/calendar/course-operations.js',import.meta.url),'utf8');
const code=file.slice(file.indexOf('function lessonBlocksScheduling('),file.indexOf('function deleteCurrentLesson('));
const reference=code.replaceAll('ignored.has(l.id)||l.date!==o.date||!(o.start<l.end&&o.end>l.start)||!lessonBlocksScheduling(l)','ignored.has(l.id)||!lessonBlocksScheduling(l)||l.date!==o.date||!(o.start<l.end&&o.end>l.start)').replace('x.id===l.id||x.date!==l.date||!(l.start<x.end&&l.end>x.start)||!lessonBlocksScheduling(x)','x.id===l.id||!lessonBlocksScheduling(x)||x.date!==l.date||!(l.start<x.end&&l.end>x.start)');
test('衝突快速篩選與原判斷逐項等價：日期、狀態、團班學生、教室、老師與忽略清單',()=>{
 const statuses=['未上課','取消','學生請假','draft',' stopped ','已上課'];
 const rows=Array.from({length:300},(_,i)=>({id:`l${i}`,studentId:`s${i%4}`,groupStudentIds:i%7===0?['s1','s2']:[],teacherId:`t${i%3}`,date:`2026-09-${String(9+i%3).padStart(2,'0')}`,start:i%2?'09:00':'10:00',end:'11:00',status:statuses[i%6],lessonState:i%17===0?'draft':'',isDraft:i%19===0,room:`r${i%2}`,branchId:i%2?'art':'hexi',deliveryMode:i%5===0?'online':'onsite'}));
 const context=()=>({db:{lessons:rows},lessonTeacherIds:l=>l.teacherIds||[l.teacherId],teacher:id=>({name:id}),student:id=>({name:id}),isGroupStudentId:id=>id==='s3',locationLabel:l=>l.branchId});
 const old=vm.createContext(context()),next=vm.createContext(context());vm.runInContext(reference,old);vm.runInContext(code,next);
 for(const row of rows)for(const ignored of ['',row.id,[row.id,'l2','l3']])for(const name of ['conflictDetail','teacherConflictDetail','hasConflict','lessonTeacherConflictNames']){
  assert.equal(JSON.stringify(next[name](row,ignored)),JSON.stringify(old[name](row,ignored)),`${name} ${row.id}`);
 }
});
