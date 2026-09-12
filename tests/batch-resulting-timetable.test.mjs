import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const course=readFileSync(new URL('../js/modules/calendar/course-operations.js',import.meta.url),'utf8');
const conflicts=course.slice(course.indexOf('function lessonBlocksScheduling('),course.indexOf('function deleteCurrentLesson('));
const batch=readFileSync(new URL('../js/modules/calendar/batch-lesson-operations.js',import.meta.url),'utf8');
const lesson=(id,start,end,extra={})=>({id,start,end,date:'2026-10-26',studentId:'s1',teacherId:'t1',teacherIds:['t1'],status:'未上課',branchId:'art',deliveryMode:'onsite',room:'',...extra});
function harness(lessons,ids=lessons.map(l=>l.id)){
 const fields=Object.fromEntries(['batchDateShift','batchTimeShift','batchTeacher','batchBranch','batchRoom','batchStatus','batchPayment'].map(id=>[id,{value:id==='batchTimeShift'?'30':''}]));
 const commits=[],logs=[];
 const c=vm.createContext({db:{lessons,branches:[]},selectedLessonIds:new Set(ids),batchPreviewCache:null,$:id=>fields[id]||{classList:{remove(){}}},window:{},lessonTeacherIds:l=>l.teacherIds||[l.teacherId],teacher:id=>({name:id}),student:id=>({name:id}),isGroupStudentId:()=>false,locationLabel:l=>l.branchId,
 shiftDate:(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),shiftTime:(t,n)=>{const [h,m]=t.split(':').map(Number),v=h*60+m+n;return v<0||v>=1440?'':`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`},confirm:()=>true,beginScheduleHistory:()=>({}),finishScheduleHistory(){},clearCalendarSelectionState(){},cancelPasteClickMode(){},logChange:(...args)=>logs.push(args),commitScheduleMutation:a=>commits.push(a),toast(){}});
 vm.runInContext(conflicts+'\n'+batch,c);return{c,fields,commits,logs};
}
test('ten same-student sequential lessons move together without colliding with their old positions',()=>{
 const lessons=Array.from({length:10},(_,i)=>lesson('l'+i,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'45':'15'}`));
 const before=structuredClone(lessons),{c}=harness(lessons);const rows=c.buildBatchCandidates();
 assert.equal(rows.length,10);assert.ok(rows.every(r=>!r.error&&!r.warning));assert.deepEqual(lessons,before);
 c.applyBatch();assert.equal(lessons[0].start,'08:30');assert.equal(lessons[9].start,'13:00');
});
test('skipped external collision leaves its original slot occupied and rejects dependent moves',()=>{
 const lessons=[lesson('a','08:00','08:15'),lesson('b','08:30','08:45'),lesson('c','09:00','09:15'),lesson('external','09:30','09:45')];
 const {c}=harness(lessons,['a','b','c']);const rows=c.buildBatchCandidates();assert.ok(rows.every(r=>r.error==='學生撞課'));c.applyBatch();assert.equal(lessons[0].start,'08:00');assert.equal(lessons[2].start,'09:00');
});
test('resulting room and group-member collisions still block; teacher overlaps only warn',()=>{
 for(const mode of ['room','group','teacher']){
  const a=lesson('a','08:00','08:15',{studentId:'s1',room:mode==='room'?'101':''});
  const b=lesson('b','08:30','08:45',{studentId:'s2',room:mode==='room'?'101':'',groupStudentIds:mode==='group'?['s1','s2']:[]});
  const {c}=harness([a,b],['a']);const [row]=c.buildBatchCandidates();
  if(mode==='teacher'){assert.equal(row.error,'');assert.match(row.warning,/老師時間重複/)}else assert.equal(row.error,mode==='room'?'教室撞課':'學生撞課');
 }
});
test('newly converging selected rooms conflict against each other',()=>{
 const {c,fields}=harness([lesson('a','08:00','08:15',{studentId:'s1',room:'1'}),lesson('b','08:00','08:15',{studentId:'s2',room:'2'})]);fields.batchRoom.value='3';assert.ok(c.buildBatchCandidates().every(r=>r.error==='教室撞課'));
});
test('apply rebuilds from latest data and inputs instead of stale preview objects',()=>{
 const {c,fields}=harness([lesson('a','08:00','08:15')]);c.batchPreviewCache=c.buildBatchCandidates();
 c.db.lessons=[{...c.db.lessons[0],notes:'remote update',paymentStatus:'paid'}];fields.batchTimeShift.value='60';c.applyBatch();
 assert.equal(c.db.lessons[0].start,'09:00');assert.equal(c.db.lessons[0].notes,'remote update');assert.equal(c.db.lessons[0].paymentStatus,'paid');
});
test('new external lesson after preview is not overwritten or ignored',()=>{
 const {c}=harness([lesson('a','08:00','08:15')]);c.batchPreviewCache=c.buildBatchCandidates();c.db.lessons.push(lesson('b','08:30','08:45'));c.applyBatch();assert.equal(c.db.lessons[0].start,'08:00');assert.equal(c.db.lessons[1].start,'08:30');
});
