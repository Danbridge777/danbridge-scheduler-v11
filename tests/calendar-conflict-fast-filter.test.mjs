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
  if(name!=='lessonTeacherConflictNames')assert.equal(JSON.stringify(next[name](row,ignored,rows.filter(candidate=>candidate.date===row.date))),JSON.stringify(old[name](row,ignored)),`${name} scoped date ${row.id}`);
 }
});

test('40 selected drag candidates match the original remaining-calendar conflict scan without replacing the DB',()=>{
 const rows=Array.from({length:30000},(_,i)=>({id:`drag-${i}`,studentId:`s${i%7}`,teacherId:`t${i%4}`,date:i<40?'2026-10-05':i<80?'2026-10-06':'2020-01-01',start:`${String(8+i%6).padStart(2,'0')}:00`,end:`${String(9+i%6).padStart(2,'0')}:00`,status:i%13?'未上課':'取消',groupStudentIds:i%9===0?['s1','s2']:[],room:`r${i%3}`,branchId:i%2?'art':'hexi',deliveryMode:i%5?'onsite':'online'}));
 const ids=new Set(rows.slice(0,40).map(row=>row.id)),remaining=rows.filter(row=>!ids.has(row.id)),candidates=rows.slice(0,40).map(row=>({...row,date:'2026-10-06'}));
 const next=vm.createContext({db:{lessons:rows},lessonTeacherIds:l=>l.teacherIds||[l.teacherId],teacher:id=>({name:id}),student:id=>({name:id}),isGroupStudentId:id=>id==='s3',locationLabel:l=>l.branchId});vm.runInContext(code,next);
 const dates=new Set(candidates.map(row=>row.date)),filtered=rows.filter(row=>!ids.has(row.id)&&dates.has(row.date));assert.equal(filtered.length,40);
 for(const candidate of candidates)for(const name of ['conflictDetail','teacherConflictDetail'])assert.equal(JSON.stringify(next[name](candidate,'',filtered)),JSON.stringify(next[name](candidate,'',remaining)));
 assert.equal(next.db.lessons,rows);
});

test('actual multi-drag function uses scoped rows and preserves cancel/error atomicity',()=>{
 const moveCode=file.slice(file.indexOf('function moveLessonsTo('));
 for(const outcome of ['allow','student-block','teacher-cancel','throw']){
  const lessons=Array.from({length:100},(_,i)=>({id:`m-${i}`,date:i<40?'2026-10-05':i<60?'2026-10-06':'2020-01-01',start:'08:00',end:'08:30'})),original=structuredClone(lessons),ids=lessons.slice(0,40).map(row=>row.id),checks=[],commits=[],logs=[];
  const context=vm.createContext({db:{lessons},shiftDate:(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),shiftTime:(time,n)=>{const[h,m]=time.split(':').map(Number),v=h*60+m+n;return v<0||v>=1440?'':`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`},
   conflictDetail:(candidate,ignore,rows)=>{assert.equal(context.db.lessons,lessons,'never temporarily replace shared DB');assert.equal(rows.length,20);assert.ok(rows.every(row=>row.date===candidate.date&&!ids.includes(row.id)));checks.push(candidate.id);if(outcome==='throw')throw Error('injected conflict failure');return outcome==='student-block'?{type:'學生',name:'Test',lesson:rows[0]}:null},
   teacherConflictDetail:()=>outcome==='teacher-cancel'?{}:null,confirm:()=>false,alert:()=>{},finishCalendarMoveInteraction:()=>{},beginScheduleHistory:()=>({}),finishScheduleHistory:()=>{},logChange:(kind,row,before)=>logs.push({kind,row:structuredClone(row),before}),commitScheduleMutation:action=>commits.push(action),toast:()=>{},moveLessonTo:()=>assert.fail('forty-row drag must not become one row')});
  vm.runInContext(moveCode,context);
  if(outcome==='throw')assert.throws(()=>context.moveLessonsTo(ids,ids[0],'2026-10-06','09:00'),/injected/);else context.moveLessonsTo(ids,ids[0],'2026-10-06','09:00');
  assert.equal(context.db.lessons,lessons);
  if(outcome==='allow'){assert.equal(checks.length,40);assert.equal(logs.length,40);assert.deepEqual(commits,['lesson.move']);assert.ok(lessons.slice(0,40).every(row=>row.date==='2026-10-06'&&row.start==='09:00'&&row.end==='09:30'));assert.deepEqual(lessons.slice(40),original.slice(40))}
  else{assert.deepEqual(lessons,original);assert.deepEqual(logs,[]);assert.deepEqual(commits,[])}
 }
});

test('keyboard paste matches the original conflict order, including newly pasted rows, groups and teacher filters',()=>{
 const ui=readFileSync(new URL('../js/modules/calendar/scheduler-ui.js',import.meta.url),'utf8'),paste=ui.slice(ui.indexOf('function contextPasteLessons('),ui.indexOf('function enableDesktopMarquee('));
 const previous=paste.replaceAll("conflictDetail(n,'',conflictRows)","conflictDetail(n,'')").replaceAll("teacherConflictDetail(n,'',conflictRows)","teacherConflictDetail(n,'')").replace('const keys=new Set(conflictRows.map(keyOf))','const keys=new Set(db.lessons.map(keyOf))');
 for(const mode of ['normal','group','duplicate','teacher-filter','midnight']){
  const clipboard=Array.from({length:40},(_,i)=>({id:`paste-${i}`,date:`2026-10-${String(5+Math.floor(i/8)).padStart(2,'0')}`,start:`${String(8+i%8).padStart(2,'0')}:00`,end:`${String(8+i%8).padStart(2,'0')}:30`,studentId:`s${i%3}`,teacherId:'t1',teacherIds:['t1'],branchId:'art',room:`r${i%2}`,deliveryMode:'onsite',status:'未上課',groupStudentIds:mode==='group'?['s1','s2']:[]}));
  if(mode==='duplicate')clipboard[1]={...clipboard[0],id:'different-original'};
  const rows=Array.from({length:300},(_,i)=>({id:`unrelated-${i}`,date:'2020-01-01',start:'08:00',end:'09:00',studentId:'s1',teacherId:'t1'}));
  rows.push({...clipboard[0],id:'existing-target',date:'2026-10-12'});
  const create=()=>{
   let serial=0,keyCalls=0;const logs=[],commits=[],messages=[],lessons=structuredClone(rows),context=vm.createContext({db:{lessons},calendarOwnerCanEdit:()=>true,getLessonClipboard:()=>structuredClone(clipboard),contextPasteTarget:{date:'2026-10-12',time:mode==='midnight'?'23:45':'09:00'},hideCalendarContextMenu:()=>{},alert:message=>messages.push(message),beginScheduleHistory:()=>({}),finishScheduleHistory:()=>{},exitSelectionAfterPaste:()=>{},cancelPasteClickMode:()=>{},commitScheduleMutation:value=>commits.push(value),toast:value=>messages.push(value),$:()=>({value:mode==='teacher-filter'?'t2':''}),teacher:id=>({name:id}),student:id=>({name:id}),isGroupStudentId:()=>false,locationLabel:l=>l.branchId,lessonTeacherIds:l=>l.teacherIds||[l.teacherId],
    keyOf:l=>{keyCalls++;return[l.date,l.start,l.end,l.studentId,l.room].join('|')},shiftDate:(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),shiftTime:(time,n)=>{const[h,m]=time.split(':').map(Number),v=h*60+m+n;return v<0||v>=1440?'':`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`},createFreshLessonCopy:(old,overrides)=>({...structuredClone(old),...overrides,id:`new-${++serial}`}),logChange:(kind,row,before)=>logs.push({kind,row:structuredClone(row),before:structuredClone(before)})});
   vm.runInContext(code,context);return{context,keyCalls:()=>keyCalls,result:()=>JSON.stringify({db:context.db,logs,commits,messages})};
  };
  const old=create(),next=create();vm.runInContext(previous,old.context);vm.runInContext(paste,next.context);old.context.contextPasteLessons();next.context.contextPasteLessons();assert.equal(next.result(),old.result(),mode);assert.equal(old.keyCalls()-next.keyCalls(),300,'unrelated historical rows never need a duplicate key');
 }
});
