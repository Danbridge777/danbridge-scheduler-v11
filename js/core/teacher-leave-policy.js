const LEAVE_TYPES=Object.freeze({annual:'特別休假',personal:'事假',sick:'普通傷病假',hospitalSick:'住院傷病假',bereavement:'喪假',marriage:'婚假',familyCare:'家庭照顧假',menstrual:'生理假',occupational:'公傷病假',official:'公假'});
const BEREAVEMENT_RELATIONSHIPS=new Set(['close8','middle6','other3']);
const TOKEN=/^[A-Za-z0-9_.:-]{8,128}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const minutes=value=>{if(!TIME.test(value))throw new Error('請假時間格式不正確');const [hour,minute]=value.split(':').map(Number);return hour*60+minute};
const approvedStatus=status=>['approved','active'].includes(String(status||''));
const teacherDailyHours=teacher=>{const value=Number(teacher?.standardDailyHours);return Number.isFinite(value)&&value>=1&&value<=12?value:8};
const annualDays=(startDate,asOfDate)=>{if(!DATE.test(String(startDate||''))||!DATE.test(String(asOfDate||''))||startDate>asOfDate)return 0;const start=new Date(`${startDate}T12:00:00Z`),end=new Date(`${asOfDate}T12:00:00Z`);let months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth();if(end.getUTCDate()<start.getUTCDate())months--;let years=end.getUTCFullYear()-start.getUTCFullYear();if(end.getUTCMonth()<start.getUTCMonth()||(end.getUTCMonth()===start.getUTCMonth()&&end.getUTCDate()<start.getUTCDate()))years--;if(months<6)return 0;if(years<1)return 3;if(years<2)return 7;if(years<3)return 10;if(years<5)return 14;if(years<10)return 15;return Math.min(30,15+(years-9))};

export function teacherLeaveTypeLabel(type){return LEAVE_TYPES[type]||''}
export function normalizeTeacherLeaveInput(input={}){
 const teacherId=text(input.teacherId,128),leaveType=text(input.leaveType,32),date=text(input.date,10),start=text(input.start,5),end=text(input.end,5),note=text(input.note,500),bereavementRelationship=text(input.bereavementRelationship,16),startMinutes=minutes(start),endMinutes=minutes(end),durationMinutes=endMinutes-startMinutes;
 if(!TOKEN.test(teacherId))throw new Error('請選擇有效老師');
 if(!Object.hasOwn(LEAVE_TYPES,leaveType))throw new Error('請假類別無效');
 const parsedDate=new Date(`${date}T00:00:00Z`);
 if(!DATE.test(date)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('請假日期不正確');
 if(durationMinutes<=0||durationMinutes>24*60)throw new Error('結束時間必須晚於開始時間');
 if(leaveType==='bereavement'&&!BEREAVEMENT_RELATIONSHIPS.has(bereavementRelationship))throw new Error('請選擇喪假親屬關係');
 return Object.freeze({teacherId,leaveType,date,start,end,durationMinutes,hours:Number((durationMinutes/60).toFixed(2)),note,bereavementRelationship:leaveType==='bereavement'?bereavementRelationship:''});
}
export function normalizeTeacherLeaveActor(access={}){
 const uid=text(access.uid,128),email=text(access.email,320).toLowerCase(),companyId=text(access.companyId,64),role=text(access.role,32),teacherId=text(access.teacherId,128),canManageSchedule=access.canManageSchedule===true;
 if(!TOKEN.test(uid)||!/^[^\s@]+@[^\s@]+$/.test(email)||companyId!=='danbridge'||access.active!==true)throw new Error('請假操作帳號未授權');
 const kind=role==='owner'?'owner':(role==='teacher'&&canManageSchedule?'scheduler':(role==='teacher'&&TOKEN.test(teacherId)?'teacher':''));
 if(!kind)throw new Error('此角色不能操作請假紀錄');
 return Object.freeze({uid,email,companyId,role,teacherId,canManageSchedule,kind});
}
export function assertTeacherLeaveScope(actor,input){const normalized=normalizeTeacherLeaveInput(input);if(actor.kind==='teacher'&&normalized.teacherId!==actor.teacherId)throw new Error('老師只能操作自己的請假紀錄');return normalized}
export function teacherRecordFromAuthorityEnvelope(envelope={},teacherId=''){const expectedId=text(teacherId,128),record=envelope&&typeof envelope==='object'&&envelope.record&&typeof envelope.record==='object'?envelope.record:null;if(!TOKEN.test(expectedId)||!record||envelope.deleted===true||text(envelope.recordId,128)!==expectedId||text(record.id,128)!==expectedId)throw new Error('找不到有效老師資料');return Object.freeze({...record})}
export function normalizeTeacherLeaveRequest(request={}){
 const action=text(request.action,16),operationId=text(request.operationId,128),leaveId=text(request.leaveId,128),expectedRevision=Number(request.expectedRevision),decisionNote=text(request.decisionNote,500),approveImmediately=request.approveImmediately===true;
 if(!['create','update','cancel','approve','reject','complete'].includes(action))throw new Error('請假操作類型無效');
 if(!TOKEN.test(operationId)||!TOKEN.test(leaveId))throw new Error('請假操作識別碼無效');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('請假版本無效');
 if(action==='create'&&expectedRevision!==0)throw new Error('新增請假版本必須為 0');
 return Object.freeze({action,operationId,leaveId,expectedRevision,input:request.input||{},decisionNote,approveImmediately});
}
function assertActionAllowed(actor,action,existing){
 if(action==='complete'){
  if(actor.kind!=='owner')throw new Error('只有 Owner 可以完成請假待辦');
  if(!existing||!['approved','active','rejected','cancelled'].includes(existing.status))throw new Error('請先核准、駁回或取消，再按完成');
  if(existing.completedAtIso)throw new Error('這筆待辦已完成，請重新整理');
  return;
 }
 if(['approve','reject'].includes(action)&&actor.kind!=='owner')throw new Error('只有 Owner 可以核准或駁回請假');
 if(existing&&actor.kind==='teacher'&&String(existing.teacherId)!==actor.teacherId)throw new Error('老師只能操作自己的請假紀錄');
 if(existing&&actor.kind!=='owner'&&approvedStatus(existing.status))throw new Error('已核准請假須由 Owner 處理');
 if(existing&&existing.status==='cancelled')throw new Error('已取消請假不能再變更');
 if(action==='approve'&&String(existing?.status)!=='pending')throw new Error('只有待審核請假可以核准');
 if(action==='reject'&&String(existing?.status)!=='pending')throw new Error('只有待審核請假可以駁回');
}
export function buildTeacherLeaveRecord({request,actor,current=null,teacher={},teacherName='',nowIso='',environment='production'}){
 const normalizedRequest=normalizeTeacherLeaveRequest(request),existing=current&&typeof current==='object'?current:null;
 if(normalizedRequest.action==='create'&&existing)throw new Error('請假紀錄已存在');
 if(normalizedRequest.action!=='create'&&!existing)throw new Error('找不到請假紀錄');
 const revision=Number(existing?.revision)||0;if(revision!==normalizedRequest.expectedRevision)throw new Error('請假紀錄已由其他人更新，請重新整理');
 assertActionAllowed(actor,normalizedRequest.action,existing);
 if(normalizedRequest.action==='complete')return Object.freeze({...existing,revision:revision+1,requiresCompletion:true,completedAtIso:text(nowIso,40),completedByUid:actor.uid,completedByEmail:actor.email,updatedAtIso:text(nowIso,40),updatedByUid:actor.uid,updatedByEmail:actor.email});
 const decisionAction=['approve','reject','cancel'].includes(normalizedRequest.action),base=decisionAction?normalizeTeacherLeaveInput(existing):assertTeacherLeaveScope(actor,normalizedRequest.input),nextRevision=revision+1,approveNow=actor.kind==='owner'&&normalizedRequest.approveImmediately;
 let status='pending';if(normalizedRequest.action==='approve'||(!decisionAction&&approveNow))status='approved';else if(normalizedRequest.action==='reject')status='rejected';else if(normalizedRequest.action==='cancel')status='cancelled';
 const hoursPerDay=teacherDailyHours(teacher),days=Number((base.hours/hoursPerDay).toFixed(3));
 const record={schema:'danbridge-teacher-leave-record-v2',environment:environment==='staging'?'staging':'production',companyId:'danbridge',leaveId:normalizedRequest.leaveId,...base,teacherName:text(teacherName||teacher?.name||teacher?.displayName||existing?.teacherName,120),standardDailyHours:hoursPerDay,days,status,revision:nextRevision,createdAtIso:text(existing?.createdAtIso||nowIso,40),createdByUid:text(existing?.createdByUid||actor.uid,128),createdByEmail:text(existing?.createdByEmail||actor.email,320),updatedAtIso:text(nowIso,40),updatedByUid:actor.uid,updatedByEmail:actor.email};
 if(base.leaveType==='annual')record.statutoryAllowanceDays=annualDays(teacher?.employmentStartDate,base.date);
 record.requiresCompletion=true;
 if(status==='approved')Object.assign(record,{approvedAtIso:text(nowIso,40),approvedByUid:actor.uid,approvedByEmail:actor.email,decisionNote:normalizedRequest.decisionNote});
 else if(status==='rejected')Object.assign(record,{rejectedAtIso:text(nowIso,40),rejectedByUid:actor.uid,rejectedByEmail:actor.email,decisionNote:normalizedRequest.decisionNote});
 else if(status==='cancelled')Object.assign(record,{cancelledAtIso:text(nowIso,40),cancelledByUid:actor.uid,cancelledByEmail:actor.email});
 return Object.freeze(record);
}
export function teacherLeaveRequestFingerprint(request={}){const normalized=normalizeTeacherLeaveRequest(request),input=['cancel','approve','reject','complete'].includes(normalized.action)?{}:normalizeTeacherLeaveInput(normalized.input);return JSON.stringify({action:normalized.action,operationId:normalized.operationId,leaveId:normalized.leaveId,expectedRevision:normalized.expectedRevision,input,decisionNote:normalized.decisionNote,approveImmediately:normalized.approveImmediately})}
