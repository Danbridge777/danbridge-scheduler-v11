import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';

export const PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA='danbridge-production-role-view-publish-v1';
export const PRODUCTION_ROLE_VIEW_PUBLISH_RESPONSE_SCHEMA='danbridge-production-role-view-publish-response-v1';
export const PRODUCTION_SCHEDULER_EMAILS=Object.freeze(['aa0966626336@gmail.com']);

const EMPTY_DB=Object.freeze(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,Object.freeze([])])));
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const canonical=value=>{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){
  if(typeof value.toMillis==='function')return{__timestampMillis:value.toMillis()};
  if(value instanceof Date)return{__timestampMillis:value.getTime()};
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 }
 return value;
};
const emptyDb=()=>Object.fromEntries(Object.entries(EMPTY_DB).map(([key])=>[key,[]]));
const lessonTeacherIds=lesson=>[...new Set((Array.isArray(lesson?.teacherIds)&&lesson.teacherIds.length?lesson.teacherIds:[lesson?.teacherId]).filter(Boolean).map(String))];
const reportTimestamp=lesson=>Number.isFinite(Date.parse(lesson?.teacherReportUpdatedAt||''))?Date.parse(lesson.teacherReportUpdatedAt):Number.NaN;
// The formatter is immutable. Reuse it, but always format the supplied instant;
// never cache today's date across midnight or reuse another request's clock.
const taipeiDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
const taipeiDate=now=>taipeiDateFormatter.format(new Date(now));
const stripPrematureReport=(lesson,now)=>{
 const copy={...(lesson||{})},date=String(copy.date||''),reportedAt=reportTimestamp(copy),today=taipeiDate(now);
 let allowed=false;
 if(date&&date<today)allowed=true;
 else if(date===today&&Number.isFinite(reportedAt))allowed=taipeiDate(reportedAt)===today;
 if(allowed)return copy;
 const reportKeys=Object.keys(copy).filter(key=>key.startsWith('teacherReport'));
 reportKeys.forEach(key=>delete copy[key]);
 if(reportKeys.length&&date>=today&&['已上課','學生請假','老師請假','缺席','補課完成'].includes(copy.status))copy.status='未上課';
 return copy;
};
const branchIdFromLocation=location=>location==='河西一路'?'hexi':location==='到府'||location==='線上課'?'unassigned':'art_museum';
const lessonBranchId=lesson=>String(lesson?.branchId||branchIdFromLocation(lesson?.location||''));

export function productionClientDataHash(value){
 const text=JSON.stringify(canonical(value||{}));let hash=2166136261;
 for(let index=0;index<text.length;index++){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619)}
 return`${(hash>>>0).toString(36)}:${text.length}`;
}

export function assertProductionRoleViewPublishRequest(input){
 const allowed=['schema','requestId','sourceHash','release'],unknown=input&&typeof input==='object'&&!Array.isArray(input)?Object.keys(input).filter(key=>!allowed.includes(key)):['request'];
 if(unknown.length||input?.schema!==PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA||!/^[A-Za-z0-9_.:-]{12,180}$/.test(String(input?.requestId||''))||!/^record-v1:[a-f0-9]{64}$/.test(String(input?.sourceHash||''))||!/^[0-9]{1,3}(?:\.[0-9]{1,3}){2}$/.test(String(input?.release||'')))throw new Error('production 角色檢視發布請求無效');
 return Object.freeze({schema:input.schema,requestId:input.requestId,sourceHash:input.sourceHash,release:input.release});
}

export function projectProductionTeacherDb(source,teacherId,{now=Date.now()}={}){
 const id=String(teacherId||''),lessons=(source?.lessons||[]).filter(lesson=>!lesson.isDraft&&lessonTeacherIds(lesson).includes(id)),safeLessons=lessons.map(lesson=>stripPrematureReport(lesson,now)).map(lesson=>{const{paymentStatus,chargeStudent,payTeacher,draftOriginal,...safe}=lesson;return safe}),studentIds=new Set(lessons.map(lesson=>lesson.studentId)),lessonIds=new Set(lessons.map(lesson=>String(lesson.id)));
 const students=(source?.students||[]).filter(student=>studentIds.has(student.id)).map(student=>({id:student.id,name:student.name||'',courseType:student.courseType||'',preferredTeacherId:String(student.preferredTeacherId||'')===id?id:''}));
 const teachers=(source?.teachers||[]).filter(teacher=>String(teacher.id)===id).map(teacher=>({id:teacher.id,name:teacher.name||'',displayName:teacher.displayName||'',color:teacher.color||'',type:teacher.type||'',subjects:teacher.subjects||''}));
 const makeups=(source?.makeups||[]).filter(makeup=>String(makeup.teacherId)===id||lessonIds.has(String(makeup.sourceLessonId||makeup.lessonId||''))||lessonIds.has(String(makeup.scheduledLessonId||''))).map(makeup=>{const{amount,rate,paymentStatus,...safe}=makeup;return safe});
 return{...emptyDb(),students,teachers,lessons:safeLessons,makeups};
}

const schedulerSafeLesson=(lesson={})=>Object.fromEntries(['id','date','start','end','studentId','teacherId','teacherIds','title','campId','room','location','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','note','seriesId','lessonState','isDraft'].filter(key=>lesson[key]!==undefined).map(key=>[key,clone(lesson[key])]));
const schedulerSafeStudent=(student={})=>Object.fromEntries(['id','name','status','school','grade','level','preferredTeacherId','courseType','branchIds'].filter(key=>student[key]!==undefined).map(key=>[key,clone(student[key])]));
const schedulerCanonicalRows=rows=>rows.sort((left,right)=>String(left?.id||'').localeCompare(String(right?.id||'')));

export function projectProductionSchedulerDb(source){
 const branches=schedulerCanonicalRows((source?.branches||[]).map(branch=>({id:branch.id,name:branch.name||'',rooms:Array.isArray(branch.rooms)?branch.rooms.map(String):[]})));
 return{...emptyDb(),branches,students:schedulerCanonicalRows((source?.students||[]).filter(student=>!student.archivedAt).map(schedulerSafeStudent)),teachers:schedulerCanonicalRows((source?.teachers||[]).filter(teacher=>!teacher.archivedAt).map(teacher=>({id:teacher.id,name:teacher.name||'',displayName:teacher.displayName||'',color:teacher.color||'',subjects:teacher.subjects||''}))),lessons:schedulerCanonicalRows((source?.lessons||[]).filter(lesson=>!lesson.isDraft).map(schedulerSafeLesson))};
}

export function projectProductionBranchDb(source,branchIds,{now=Date.now()}={}){
 const allowed=new Set(Array.isArray(branchIds)?branchIds.map(String):[]),lessons=(source?.lessons||[]).filter(lesson=>!lesson.isDraft&&allowed.has(lessonBranchId(lesson))).map(lesson=>stripPrematureReport(lesson,now)),studentIds=new Set(lessons.map(lesson=>lesson.studentId)),teacherIds=new Set(lessons.flatMap(lessonTeacherIds)),lessonById=new Map((source?.lessons||[]).map(lesson=>[String(lesson.id),lesson])),students=(source?.students||[]).filter(student=>studentIds.has(student.id)||(student.branchIds||[]).some(id=>allowed.has(String(id)))),visibleStudentIds=new Set(students.map(student=>String(student.id)));
 return{...emptyDb(),branches:(source?.branches||[]).filter(branch=>allowed.has(String(branch.id))),students,teachers:(source?.teachers||[]).filter(teacher=>teacherIds.has(String(teacher.id))||(teacher.assignedBranchIds||[]).some(id=>allowed.has(String(id)))),lessons,makeups:(source?.makeups||[]).filter(makeup=>{const sourceLesson=lessonById.get(String(makeup.sourceLessonId||makeup.lessonId||''));return allowed.has(String(makeup.branchId||lessonBranchId(sourceLesson||makeup)))}),changes:(source?.changes||[]).filter(change=>{const lesson=lessonById.get(String(change.lessonId))||change.after||change.before;return lesson&&allowed.has(lessonBranchId(lesson))}),summerCampClasses:(source?.summerCampClasses||[]).filter(row=>allowed.has(String(row.branchId||lessonBranchId(row)))),summerCampRegistrations:(source?.summerCampRegistrations||[]).filter(row=>allowed.has(String(row.branchId))),winterCampRegistrations:(source?.winterCampRegistrations||[]).filter(row=>allowed.has(String(row.branchId))),winterCampClasses:(source?.winterCampClasses||[]).filter(row=>allowed.has(String(row.branchId||lessonBranchId(row)))),settlementRecords:(source?.settlementRecords||[]).filter(row=>allowed.has(String(row.branchId))),fixedExpenses:(source?.fixedExpenses||[]).filter(row=>allowed.has(String(row.branchId))),oneTimeExpenses:(source?.oneTimeExpenses||[]).filter(row=>allowed.has(String(row.branchId))),collectionRecords:(source?.collectionRecords||[]).filter(row=>allowed.has(String(row.branchId))).map(row=>({...row,studentIds:(row.studentIds||[]).filter(id=>visibleStudentIds.has(String(id))) }))};
}

export function buildProductionRoleViews(source,accessRows,{now=Date.now()}={}){
 const views=[];
 for(const access of accessRows||[]){
  const email=String(access?.email||access?.id||'').trim().toLowerCase();
  if(access?.active!==true||access?.companyId!=='danbridge'||!email||access.role==='owner')continue;
  if(access.role==='teacher'&&access.teacherId){
   const scheduler=PRODUCTION_SCHEDULER_EMAILS.includes(email)&&access.canManageSchedule===true,db=scheduler?projectProductionSchedulerDb(source):projectProductionTeacherDb(source,access.teacherId,{now});
   views.push({kind:scheduler?'scheduler':'teacher',email,teacherId:String(access.teacherId),db,clientHash:productionClientDataHash(db)});
  }else if(access.role==='branch_manager'&&access.teacherId&&Array.isArray(access.branchIds)&&access.branchIds.length){
   const branchIds=[...new Set(access.branchIds.map(String))].sort(),db=projectProductionBranchDb(source,branchIds,{now});
   views.push({kind:'branch_manager',email,teacherId:String(access.teacherId),branchIds,db,clientHash:productionClientDataHash(db)});
  }
 }
 return views.sort((left,right)=>`${left.kind}:${left.email}`.localeCompare(`${right.kind}:${right.email}`));
}

function taipeiBoundary(date,end){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));if(!match)return null;
 const [year,month,day]=match.slice(1).map(Number),utc=Date.UTC(year,month-1,day,end?15:16,end?59:0,end?59:0,end?999:0)-(end?0:86400000);
 return new Date(utc);
}

export function buildProductionLessonMeta(source){
 return(source?.lessons||[]).filter(lesson=>lesson?.id&&!lesson.isDraft).flatMap(lesson=>{const teacherIds=lessonTeacherIds(lesson).sort(),editableFrom=taipeiBoundary(lesson.date,false),editableUntil=taipeiBoundary(lesson.date,true);if(!teacherIds.length||!editableFrom||!editableUntil)return[];return[{lessonId:String(lesson.id),payload:{companyId:'danbridge',lessonId:String(lesson.id),branchId:lessonBranchId(lesson),lessonDate:String(lesson.date||''),lessonStart:String(lesson.start||''),lessonEnd:String(lesson.end||''),studentId:String(lesson.studentId||''),teacherIds,editableFrom,editableUntil,active:true}}]}).sort((left,right)=>left.lessonId.localeCompare(right.lessonId));
}

export function productionLessonMetaSignature(value){
 return productionClientDataHash({companyId:String(value?.companyId||'danbridge'),lessonId:String(value?.lessonId||''),branchId:String(value?.branchId||''),lessonDate:String(value?.lessonDate||''),lessonStart:String(value?.lessonStart||''),lessonEnd:String(value?.lessonEnd||''),studentId:String(value?.studentId||''),teacherIds:(value?.teacherIds||[]).map(String).sort(),editableFrom:value?.editableFrom,editableUntil:value?.editableUntil,active:value?.active!==false});
}

export function productionRoleViewNeedsWrite(current,view){
 if(!current||!view)return true;
 const expectedEmail=String(view.email||'').trim().toLowerCase();
 if(String(current.email||'').trim().toLowerCase()!==expectedEmail)return true;
 if(view.kind==='teacher'&&String(current.teacherId||'')!==String(view.teacherId||''))return true;
 return current.clientHash!==view.clientHash||JSON.stringify(canonical(current.db))!==JSON.stringify(canonical(view.db));
}

export function productionLessonMetaNeedsWrite(current,payload){
 return !current||productionLessonMetaSignature(current)!==productionLessonMetaSignature(payload);
}
