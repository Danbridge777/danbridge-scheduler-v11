const NOTIFICATION_ID=/^[A-Za-z0-9_-]{8,200}$/;
const EMAIL=/^[^\s@]+@[^\s@]+$/;
const SHA256=/^[a-f0-9]{64}$/;
const RELEASE=/^\d+\.\d+\.\d+$/;
const PUBLISH_SCHEMA='danbridge-production-schedule-notification-publish-v1';
const RECIPIENT_ROLES=new Set(['owner','scheduler','teacher','branch_manager']);

const text=(value,max)=>String(value??'').trim().slice(0,max);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys,label)=>{if(!object(value))throw new Error(`${label} 格式無效`);const extra=Object.keys(value).filter(key=>!keys.includes(key));if(extra.length)throw new Error(`${label} 包含未允許欄位：${extra.join(',')}`);return value};
const normalizedEmail=value=>text(value,320).toLowerCase();

function normalizeLessonSnapshot(value,label){
 if(value===null)return null;
 const row=exact(value,['date','start','end','studentId','title','location','branchId','deliveryMode','room','address','onlinePlatform','meetingUrl','status','note','teacherIds'],label),teacherIds=Array.isArray(row.teacherIds)?[...new Set(row.teacherIds.map(value=>text(value,160)).filter(Boolean))]:[];
 if(teacherIds.length>20)throw new Error(`${label}.teacherIds 超過安全上限`);
 return Object.freeze({date:text(row.date,10),start:text(row.start,5),end:text(row.end,5),studentId:text(row.studentId,200),title:text(row.title,240),location:text(row.location,120),branchId:text(row.branchId,160),deliveryMode:text(row.deliveryMode,120),room:text(row.room,120),address:text(row.address,500),onlinePlatform:text(row.onlinePlatform,120),meetingUrl:text(row.meetingUrl,1000),status:text(row.status,120),note:text(row.note,1000),teacherIds:Object.freeze(teacherIds)});
}

function normalizeScheduleDetail(value,index){
 const row=exact(value,['type','lessonId','summary','studentName','beforeTime','afterTime','before','after'],`通知明細 ${index+1}`),type=text(row.type,16),lessonId=text(row.lessonId,240);
 if(!['added','modified','removed'].includes(type)||!lessonId)throw new Error(`通知明細 ${index+1} identity 無效`);
 return Object.freeze({type,lessonId,summary:text(row.summary,800),studentName:text(row.studentName,240),beforeTime:text(row.beforeTime,80),afterTime:text(row.afterTime,80),before:normalizeLessonSnapshot(row.before,`通知明細 ${index+1}.before`),after:normalizeLessonSnapshot(row.after,`通知明細 ${index+1}.after`)});
}

function normalizePublishNotification(value,index){
 const row=exact(value,['id','payload'],`通知 ${index+1}`),id=text(row.id,200),payload=exact(row.payload,['companyId','recipientEmail','recipientRole','teacherId','branchIds','teacherName','title','message','changeCount','details','read','createdBy','createdByName'],`通知 ${index+1}.payload`),recipientEmail=normalizedEmail(payload.recipientEmail),recipientRole=text(payload.recipientRole,32),teacherId=text(payload.teacherId,160),branchIds=Array.isArray(payload.branchIds)?[...new Set(payload.branchIds.map(value=>text(value,160)).filter(Boolean))]:[],details=Array.isArray(payload.details)?payload.details.map(normalizeScheduleDetail):[];
 if(!NOTIFICATION_ID.test(id)||payload.companyId!=='danbridge'||!EMAIL.test(recipientEmail)||!RECIPIENT_ROLES.has(recipientRole)||branchIds.length>50||details.length<1||details.length>500||payload.read!==false||!NOTIFICATION_ID.test(text(payload.createdBy,128)))throw new Error(`通知 ${index+1} 內容無效`);
 if(Number(payload.changeCount)!==details.length)throw new Error(`通知 ${index+1} 變更數不一致`);
 if(recipientRole==='teacher'&&!teacherId)throw new Error(`通知 ${index+1} 缺少老師識別碼`);
 return Object.freeze({id,payload:Object.freeze({companyId:'danbridge',recipientEmail,recipientRole,teacherId,branchIds:Object.freeze(branchIds),teacherName:text(payload.teacherName,160),title:text(payload.title,120),message:text(payload.message,500),changeCount:details.length,details:Object.freeze(details),read:false,createdBy:text(payload.createdBy,128),createdByName:text(payload.createdByName,160)})});
}

export function normalizeProductionScheduleNotificationPublishRequest(request={}){
 const row=exact(request,['schema','requestId','sourceHash','release','notifications'],'通知發布請求'),requestId=text(row.requestId,180),sourceHash=text(row.sourceHash,64),release=text(row.release,24),notifications=Array.isArray(row.notifications)?row.notifications.map(normalizePublishNotification):[];
 if(row.schema!==PUBLISH_SCHEMA||!NOTIFICATION_ID.test(requestId)||!SHA256.test(sourceHash)||!RELEASE.test(release)||notifications.length<1||notifications.length>200)throw new Error('通知發布請求 identity 無效');
 if(new Set(notifications.map(item=>item.id)).size!==notifications.length||new Set(notifications.map(item=>item.payload.recipientEmail)).size!==notifications.length)throw new Error('通知發布請求包含重複通知或收件者');
 return Object.freeze({schema:PUBLISH_SCHEMA,requestId,sourceHash,release,notifications:Object.freeze(notifications)});
}

export function assertProductionScheduleNotificationAccess(notification={},access={},primaryOwnerEmail=''){
 const payload=notification?.payload||{},recipientEmail=normalizedEmail(payload.recipientEmail),ownerEmail=normalizedEmail(primaryOwnerEmail);
 if(payload.recipientRole==='owner'&&recipientEmail===ownerEmail)return true;
 const row=access||{},accessEmail=normalizedEmail(row.email||row.id);
 if(row.active!==true||row.companyId!=='danbridge'||accessEmail!==recipientEmail)throw new Error('通知收件者不是有效公司成員');
 if(payload.recipientRole==='owner'&&row.role!=='owner')throw new Error('通知 Owner 角色不符');
 if(payload.recipientRole==='scheduler'&&!(row.role==='teacher'&&row.canManageSchedule===true))throw new Error('通知排課專員角色不符');
 if(payload.recipientRole==='teacher'&&!(row.role==='teacher'&&String(row.teacherId||'')===payload.teacherId))throw new Error('通知老師角色或識別碼不符');
 if(payload.recipientRole==='branch_manager'){
  const allowed=new Set(Array.isArray(row.branchIds)?row.branchIds.map(String):[]);
  if(row.role!=='branch_manager'||!payload.branchIds.length||payload.branchIds.some(branchId=>!allowed.has(branchId)))throw new Error('通知校區主管範圍不符');
 }
 return true;
}

export function normalizeProductionNotificationAcknowledgeRequest(request={}){
 const source=request?.notificationIds;
 if(!Array.isArray(source)||source.length<1||source.length>20)throw new Error('通知確認筆數必須介於 1 到 20 筆');
 const ids=[...new Set(source.map(value=>text(value,200)))];
 if(ids.some(id=>!NOTIFICATION_ID.test(id)))throw new Error('通知識別碼無效');
 return Object.freeze({notificationIds:Object.freeze(ids)});
}

export function normalizeProductionNotificationActor(actor={}){
 const uid=text(actor.uid,128),email=text(actor.email,320).toLowerCase();
 if(!NOTIFICATION_ID.test(uid)||!EMAIL.test(email)||actor.emailVerified!==true||actor.appVerified!==true)throw new Error('通知確認帳號未通過驗證');
 return Object.freeze({uid,email});
}

export function assertProductionNotificationRecipient(notification={},actor={}){
 const recipientEmail=text(notification?.recipientEmail,320).toLowerCase();
 if(!EMAIL.test(recipientEmail)||recipientEmail!==actor.email)throw new Error('只能確認寄給自己的通知');
 return true;
}
