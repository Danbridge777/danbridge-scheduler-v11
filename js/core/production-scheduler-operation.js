import {PRODUCTION_SCHEDULER_EMAILS,projectProductionSchedulerDb} from './production-role-view-projection.js?v=20.26.229';

export const SCHEDULER_OPERATION_SCHEMA='danbridge-production-scheduler-operation-v1';
export const SCHEDULER_OPERATION_RESPONSE_SCHEMA='danbridge-production-scheduler-operation-response-v1';
export const SCHEDULER_LESSON_FIELDS=Object.freeze(['id','date','start','end','studentId','teacherId','teacherIds','title','campId','room','location','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','note','seriesId','lessonState','isDraft']);
export const SCHEDULER_STUDENT_FIELDS=Object.freeze(['id','name','status','school','grade','level','preferredTeacherId','courseType','branchIds']);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value)&&value!=='.'&&value!=='..';
const exact=(value,keys,label)=>{if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error(`${label} 包含未允許欄位或格式無效`)};
const teacherIds=lesson=>[...new Set((lesson?.teacherIds?.length?lesson.teacherIds:[lesson?.teacherId]).filter(Boolean))];
const mutableAt=(rows,index)=>{const next=clone(rows[index]);rows[index]=next;return next};
export const schedulerLesson=value=>Object.fromEntries(SCHEDULER_LESSON_FIELDS.filter(key=>value?.[key]!==undefined).map(key=>[key,clone(value[key])]));
export const schedulerStudent=value=>Object.fromEntries(SCHEDULER_STUDENT_FIELDS.filter(key=>value?.[key]!==undefined).map(key=>[key,clone(value[key])]));

export function assertProductionSchedulerActor(actor){
 if(!object(actor)||!token(actor.uid)||!PRODUCTION_SCHEDULER_EMAILS.includes(actor.email)||actor.role!=='teacher'||actor.active!==true||actor.companyId!=='danbridge'||actor.canManageSchedule!==true||actor.readOnly===true||!token(actor.teacherId))throw new Error('排課專員身分或權限無效');
 return Object.freeze({uid:actor.uid,email:actor.email,role:'teacher',active:true,companyId:'danbridge',canManageSchedule:true,teacherId:actor.teacherId,displayName:typeof actor.displayName==='string'?actor.displayName.slice(0,120):'AA'});
}

function assertSafeLesson(value,id,{complete=false}={}){
 exact(value,SCHEDULER_LESSON_FIELDS,'課程');if(value.id!==id)throw new Error('課程 ID 不一致');
 for(const [key,item] of Object.entries(value)){
  if(key==='teacherIds'){if(!Array.isArray(item)||item.length>8||item.some(row=>!token(row))||new Set(item).size!==item.length)throw new Error('授課老師格式無效')}
  else if(key==='isDraft'){if(typeof item!=='boolean')throw new Error('草稿格式無效')}
  else if(typeof item!=='string'||item.length>(key==='note'?4000:1000))throw new Error(`課程 ${key} 格式無效`);
 }
 if(!complete)return;
 const date=value.date,time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||!time.test(value.start||'')||!time.test(value.end||'')||value.start>=value.end)throw new Error('課程日期或時間無效');
 if(!token(value.studentId)||!teacherIds(value).length||value.isDraft===true)throw new Error('課程學生、老師或草稿範圍無效');
 if(value.teacherId&&(!token(value.teacherId)||!teacherIds(value).includes(value.teacherId)))throw new Error('主要老師與授課老師不一致');
}

export function normalizeProductionSchedulerRequest(input){
 exact(input,['schema','requestId','release','changes'],'排課請求');
 if(input.schema!==SCHEDULER_OPERATION_SCHEMA||!token(input.requestId)||input.requestId.length<12||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.release||'')||!Array.isArray(input.changes)||!input.changes.length||input.changes.length>30||JSON.stringify(input).length>250000)throw new Error('排課請求識別碼或筆數無效');
 const seen=new Set(),changes=input.changes.map(change=>{
  exact(change,['lessonId','before','after','student'],'排課異動');const id=change.lessonId;
  if(!token(id)||seen.has(id)||change.before===null&&change.after===null)throw new Error('排課異動 ID 重複或無效');seen.add(id);
  if(change.before!==null)assertSafeLesson(change.before,id);
  if(change.after!==null)assertSafeLesson(change.after,id,{complete:true});
  if(change.student!==undefined&&change.student!==null){exact(change.student,SCHEDULER_STUDENT_FIELDS,'學生');if(change.student.id!==change.after?.studentId||!token(change.student.id)||typeof change.student.name!=='string'||!change.student.name.trim()||change.student.name.length>120)throw new Error('新增學生身分無效');for(const [key,value] of Object.entries(change.student)){if(key==='branchIds'){if(!Array.isArray(value)||value.length>20||value.some(item=>!token(item)))throw new Error('學生校區無效')}else if(typeof value!=='string'||value.length>300)throw new Error('學生欄位格式無效')}}
  return{lessonId:id,before:clone(change.before),after:clone(change.after),...(change.student?{student:clone(change.student)}:{})};
 });
 return Object.freeze({schema:input.schema,requestId:input.requestId,release:input.release,changes});
}

// This function receives only safe timetable fields. Raw operation envelopes,
// access changes, finance values and arbitrary document paths are not accepted.
export function buildProductionSchedulerTarget(source,input,actor,{nowIso}={}){
 // Copy the four mutable arrays, then clone only records that this request
 // actually changes. Untouched authoritative rows keep identity so append-only
 // history can be verified in O(n) without repeatedly serializing years of data.
 const caller=assertProductionSchedulerActor(actor),request=normalizeProductionSchedulerRequest(input),target={...source,lessons:[...source.lessons],students:[...source.students],makeups:[...source.makeups],changes:[...source.changes]};
 if(!/^\d{4}-\d{2}-\d{2}T/.test(nowIso||'')||!Number.isFinite(Date.parse(nowIso)))throw new Error('伺服器時間無效');
 const events=[];
 for(const change of request.changes){
  const index=target.lessons.findIndex(row=>row.id===change.lessonId),current=index<0?null:target.lessons[index],safe=current?schedulerLesson(current):null;
  if(current?.isDraft)throw new Error('排課專員不能修改草稿');
  if(change.before===null&&current)throw new Error('新增課程 ID 已存在，未覆蓋雲端資料');
  if(change.before!==null&&!current)throw new Error('課程已由其他人刪除，未復活舊資料');
  let next;
  if(change.after===null){if(!same(safe,change.before))throw new Error('刪除前課程已變更，需重新核對');next=null}
  else if(change.before===null)next={...clone(change.after),paymentStatus:'unpaid',chargeStudent:'yes',payTeacher:'yes'};
  else{
   next=clone(current);
   for(const key of SCHEDULER_LESSON_FIELDS){
    if(same(change.before[key],change.after[key]))continue;
    if(!same(safe[key],change.before[key])&&!same(safe[key],change.after[key]))throw new Error(`課程 ${key} 已由其他人更新，未覆蓋雲端資料`);
    if(change.after[key]===undefined)delete next[key];else next[key]=clone(change.after[key]);
   }
  }
  if(next){
   assertSafeLesson(schedulerLesson(next),change.lessonId,{complete:true});
   if(!teacherIds(next).every(id=>target.teachers.some(teacher=>teacher.id===id&&!teacher.archivedAt)))throw new Error('授課老師不存在或已封存');
   if(next.branchId&&!target.branches.some(branch=>branch.id===next.branchId)&&next.branchId!=='unassigned')throw new Error('課程校區不存在');
   const existingStudent=target.students.find(student=>student.id===next.studentId);
   if(existingStudent?.archivedAt)throw new Error('學生已封存');
   if(!existingStudent){if(change.student?.id!==next.studentId)throw new Error('課程學生不存在');if(change.student.branchIds?.some(id=>!target.branches.some(row=>row.id===id)))throw new Error('學生校區不存在');if(change.student.preferredTeacherId&&!target.teachers.some(row=>row.id===change.student.preferredTeacherId&&!row.archivedAt))throw new Error('學生指定老師不存在');target.students.push({...clone(change.student),billing:'hour',rate:0,note:''})}
   if(teacherIds(next).length>1&&target.students.find(row=>row.id===next.studentId)?.courseType!=='團班')throw new Error('只有團班可以安排多位老師');
  }
  if(same(current,next))continue;
  if(next){if(index<0)target.lessons.push(next);else target.lessons[index]=next}
  else{
   // Preserve the existing deletion side effects in the same atomic target.
   if(current.status==='學生請假'){
    const makeupIndex=target.makeups.findIndex(row=>row.sourceLessonId===current.id&&!['done','cancelled'].includes(row.status));
    if(makeupIndex>=0){const makeup=mutableAt(target.makeups,makeupIndex),scheduledIndex=target.lessons.findIndex(row=>row.id===makeup.scheduledLessonId);if(scheduledIndex>=0){const scheduled=mutableAt(target.lessons,scheduledIndex);scheduled.status='取消';scheduled.payTeacher='no';scheduled.chargeStudent='no';scheduled.cancelledBecauseSourceRestored=true}makeup.status='cancelled';makeup.cancelledAt=nowIso}
   }
   // Notes are scheduler-editable. Never let a forged MAKEUP: token point at
   // an unrelated record; only the authoritative reverse link may be changed.
   const makeupIndex=target.makeups.findIndex(row=>row.scheduledLessonId===current.id);
   if(makeupIndex>=0){const makeup=mutableAt(target.makeups,makeupIndex);makeup.status='pending';makeup.scheduledLessonId='';makeup.completedAt='';makeup.rescheduledAt=nowIso}
   target.lessons=target.lessons.filter(row=>row.id!==change.lessonId);
  }
  const event={id:`scheduler-${request.requestId}-${events.length}`,at:nowIso,type:next?(current?'修改課程':'新增課程'):'刪除選取課程',lessonId:change.lessonId,studentId:(next||current).studentId,actorName:caller.displayName,actorEmail:caller.email,before:clone(current),after:clone(next)};
  target.changes.unshift(event);events.push(event);
 }
 for(const event of events){const next=target.lessons.find(row=>row.id===event.lessonId);if(!next)continue;
  if(next.status==='學生請假'){
   const existingIndex=target.makeups.findIndex(row=>row.sourceLessonId===next.id),existing=existingIndex<0?null:target.makeups[existingIndex];
   if(existing?.status==='cancelled')Object.assign(mutableAt(target.makeups,existingIndex),{status:'pending',scheduledLessonId:'',teacherId:next.teacherId,branchId:next.branchId||existing.branchId,cancelledAt:'',reopenedAt:nowIso});
   else if(!existing){const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));target.makeups.push({id:`scheduler-makeup-${request.requestId}-${events.indexOf(event)}`,sourceLessonId:next.id,studentId:next.studentId,teacherId:next.teacherId,branchId:next.branchId||'',originalDate:next.date,originalStart:next.start,originalEnd:next.end,hours:(minutes(next.end)-minutes(next.start))/60,reason:'學生請假',status:'pending',scheduledLessonId:'',createdAt:nowIso})}
  }else if(event.before?.status==='學生請假'){
   const makeupIndex=target.makeups.findIndex(row=>row.sourceLessonId===next.id&&!['done','cancelled'].includes(row.status));
   if(makeupIndex>=0){const makeup=mutableAt(target.makeups,makeupIndex),scheduledIndex=target.lessons.findIndex(row=>row.id===makeup.scheduledLessonId);if(scheduledIndex>=0)Object.assign(mutableAt(target.lessons,scheduledIndex),{status:'取消',payTeacher:'no',chargeStudent:'no',cancelledBecauseSourceRestored:true});Object.assign(makeup,{status:'cancelled',cancelledAt:nowIso})}
  }
 }
 // Check the final atomic target so moving two selected lessons together does
 // not conflict with their own pre-move positions. Teacher overlap remains a
 // UI warning, matching the existing timetable; student/room overlap blocks.
 const active=row=>row&&!row.isDraft&&!['取消','已取消','停課','cancel','cancelled','canceled','stopped','inactive','deleted','draft'].includes(String(row.status||'').trim().toLowerCase())&&!['取消','已取消','停課','cancel','cancelled','canceled','stopped','inactive','deleted','draft'].includes(String(row.lessonState||'').trim().toLowerCase());
 for(const event of events){const next=event.after;if(!active(next))continue;const original=event.before;
  if(original&&['date','start','end','studentId','room','branchId','deliveryMode','status','lessonState','isDraft'].every(key=>same(original[key],next[key])))continue;
  for(const other of target.lessons){if(other.id===next.id||!active(other)||other.date!==next.date||!(next.start<other.end&&next.end>other.start))continue;
   if(other.studentId===next.studentId&&target.students.find(row=>row.id===next.studentId)?.courseType!=='團班')throw new Error('學生時間衝突，整批未執行');
   if(next.deliveryMode==='onsite'&&!['home','online'].includes(other.deliveryMode)&&next.branchId===other.branchId&&next.room&&other.room===next.room)throw new Error('教室時間衝突，整批未執行');
  }
 }
 return{db:target,events,request,actor:caller,schedulerDb:projectProductionSchedulerDb(target)};
}
