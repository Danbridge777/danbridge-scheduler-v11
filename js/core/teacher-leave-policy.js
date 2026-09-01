const LEAVE_TYPES=Object.freeze({personal:'事假',sick:'病假',bereavement:'喪假'});
const TOKEN=/^[A-Za-z0-9_.:-]{8,128}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

const text=(value,max=500)=>String(value??'').trim().slice(0,max);
const minutes=value=>{if(!TIME.test(value))throw new Error('請假時間格式不正確');const [hour,minute]=value.split(':').map(Number);return hour*60+minute};

export function teacherLeaveTypeLabel(type){return LEAVE_TYPES[type]||''}

export function normalizeTeacherLeaveInput(input={}){
 const teacherId=text(input.teacherId,128),leaveType=text(input.leaveType,32),date=text(input.date,10),start=text(input.start,5),end=text(input.end,5),note=text(input.note,500),startMinutes=minutes(start),endMinutes=minutes(end),durationMinutes=endMinutes-startMinutes;
 if(!TOKEN.test(teacherId))throw new Error('請選擇有效老師');
 if(!Object.hasOwn(LEAVE_TYPES,leaveType))throw new Error('請假類別只允許事假、病假或喪假');
 const parsedDate=new Date(`${date}T00:00:00Z`);
 if(!DATE.test(date)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('請假日期不正確');
 if(durationMinutes<=0||durationMinutes>24*60)throw new Error('結束時間必須晚於開始時間');
 return Object.freeze({teacherId,leaveType,date,start,end,durationMinutes,hours:Number((durationMinutes/60).toFixed(2)),note});
}

export function normalizeTeacherLeaveActor(access={}){
 const uid=text(access.uid,128),email=text(access.email,320).toLowerCase(),companyId=text(access.companyId,64),role=text(access.role,32),teacherId=text(access.teacherId,128),canManageSchedule=access.canManageSchedule===true;
 if(!TOKEN.test(uid)||!/^[^\s@]+@[^\s@]+$/.test(email)||companyId!=='danbridge'||access.active!==true)throw new Error('請假操作帳號未授權');
 const kind=role==='owner'?'owner':(role==='teacher'&&canManageSchedule?'scheduler':(role==='teacher'&&TOKEN.test(teacherId)?'teacher':''));
 if(!kind)throw new Error('此角色不能操作請假紀錄');
 return Object.freeze({uid,email,companyId,role,teacherId,canManageSchedule,kind});
}

export function assertTeacherLeaveScope(actor,input){
 const normalized=normalizeTeacherLeaveInput(input);
 if(actor.kind==='teacher'&&normalized.teacherId!==actor.teacherId)throw new Error('老師只能操作自己的請假紀錄');
 return normalized;
}

export function normalizeTeacherLeaveRequest(request={}){
 const action=text(request.action,16),operationId=text(request.operationId,128),leaveId=text(request.leaveId,128),expectedRevision=Number(request.expectedRevision);
 if(!['create','update','cancel'].includes(action))throw new Error('請假操作類型無效');
 if(!TOKEN.test(operationId)||!TOKEN.test(leaveId))throw new Error('請假操作識別碼無效');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('請假版本無效');
 if(action==='create'&&expectedRevision!==0)throw new Error('新增請假版本必須為 0');
 return Object.freeze({action,operationId,leaveId,expectedRevision,input:request.input||{}});
}

export function buildTeacherLeaveRecord({request,actor,current=null,teacherName='',nowIso=''}){
 const normalizedRequest=normalizeTeacherLeaveRequest(request),existing=current&&typeof current==='object'?current:null;
 if(normalizedRequest.action==='create'&&existing)throw new Error('請假紀錄已存在');
 if(normalizedRequest.action!=='create'&&!existing)throw new Error('找不到請假紀錄');
 const revision=Number(existing?.revision)||0;
 if(revision!==normalizedRequest.expectedRevision)throw new Error('請假紀錄已由其他人更新，請重新整理');
 const base=normalizedRequest.action==='cancel'?normalizeTeacherLeaveInput(existing):assertTeacherLeaveScope(actor,normalizedRequest.input);
 if(existing&&actor.kind==='teacher'&&String(existing.teacherId)!==actor.teacherId)throw new Error('老師只能操作自己的請假紀錄');
 const nextRevision=revision+1,status=normalizedRequest.action==='cancel'?'cancelled':'active';
 return Object.freeze({schema:'danbridge-teacher-leave-record-v1',environment:'production',companyId:'danbridge',leaveId:normalizedRequest.leaveId,...base,teacherName:text(teacherName||existing?.teacherName,120),status,revision:nextRevision,createdAtIso:text(existing?.createdAtIso||nowIso,40),createdByUid:text(existing?.createdByUid||actor.uid,128),createdByEmail:text(existing?.createdByEmail||actor.email,320),updatedAtIso:text(nowIso,40),updatedByUid:actor.uid,updatedByEmail:actor.email});
}

export function teacherLeaveRequestFingerprint(request={}){
 const normalized=normalizeTeacherLeaveRequest(request),input=normalized.action==='cancel'?{}:normalizeTeacherLeaveInput(normalized.input);
 return JSON.stringify({action:normalized.action,operationId:normalized.operationId,leaveId:normalized.leaveId,expectedRevision:normalized.expectedRevision,input});
}
