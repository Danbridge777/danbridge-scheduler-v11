'use strict';
const leaveEntitlement=require('../js/core/teacher-leave-entitlement.cjs');

function assertApprovedLeaveWithinAllowance(record,rows,teacher){
 if(!leaveEntitlement.isApproved(record))return;
 const next=[...(rows||[]).filter(row=>String(row.leaveId||row.id)!==String(record.leaveId)),record],year=Number(String(record.date).slice(0,4));
 if(record.leaveType==='menstrual'){const month=String(record.date).slice(0,7),monthDays=next.filter(row=>String(row.teacherId)===String(record.teacherId)&&row.leaveType==='menstrual'&&leaveEntitlement.isApproved(row)&&String(row.date).startsWith(month)).reduce((sum,row)=>sum+leaveEntitlement.recordDays(row,teacher),0);if(monthDays>1.0001)throw Error('生理假每月以一日為限')}
 if(['annual','personal','sick','familyCare','menstrual','hospitalSick'].includes(record.leaveType)){const balance=leaveEntitlement.leaveBalance({records:next,teacher,type:record.leaveType,year,asOfDate:record.date});if(balance.total!==null&&balance.used>balance.total+.0001)throw Error(`${leaveEntitlement.STATUTORY_LEAVE_RULES[record.leaveType].label}核准後將超過法定額度`)}
 if(['marriage','bereavement'].includes(record.leaveType)){const total=leaveEntitlement.quotaDays(record.leaveType,{teacher,record,asOfDate:record.date});if(total!==null&&leaveEntitlement.recordDays(record,teacher)>total+.0001)throw Error(`${leaveEntitlement.STATUTORY_LEAVE_RULES[record.leaveType].label}單次申請超過法定額度`)}
}

// Shared by production and the path-fenced staging workspace. All authorization,
// receipt checks, records, audit and notifications belong to one transaction.
async function executeTeacherLeave({firestore,identity,request,serverTimestamp,primaryOwnerEmail='a0965487920@gmail.com',nowIso=new Date().toISOString(),environment='production',readTeacherEnvelope=null}){
 if(!['production','staging'].includes(environment))throw Error('請假環境無效');
 const policy=await import('../js/core/teacher-leave-policy.js');
 const normalized=policy.normalizeTeacherLeaveRequest(request),fingerprint=policy.teacherLeaveRequestFingerprint(request);
 const email=String(identity?.email||'').trim().toLowerCase(),uid=String(identity?.uid||'');
 const leaveRef=firestore.doc(`productionTeacherLeaveRecords/${normalized.leaveId}`),receiptRef=firestore.doc(`productionTeacherLeaveOperationReceipts/${normalized.operationId}`);
 return firestore.runTransaction(async tx=>{
  const accessSnapshot=await tx.get(firestore.collection('companyAccess'));
  const accessRows=accessSnapshot.docs.map(row=>({...row.data(),email:row.id.toLowerCase()}));
  const saved=accessRows.find(row=>row.email===email);
  const actor=policy.normalizeTeacherLeaveActor({...(!saved&&email===primaryOwnerEmail?{role:'owner',companyId:'danbridge',active:true}:saved),uid,email});
  const [currentSnapshot,receiptSnapshot,leaveRowsSnapshot]=await Promise.all([tx.get(leaveRef),tx.get(receiptRef),tx.get(firestore.collection('productionTeacherLeaveRecords').where('companyId','==','danbridge'))]);
  const current=currentSnapshot.exists?currentSnapshot.data():null,receipt=receiptSnapshot.exists?receiptSnapshot.data():null;
  if(current&&(current.companyId!=='danbridge'||current.leaveId!==normalized.leaveId))throw Error('請假紀錄識別不一致');
  if(current)policy.assertTeacherLeaveScope(actor,current);
  if(['create','update'].includes(normalized.action))policy.assertTeacherLeaveScope(actor,normalized.input);
  if(receipt){
   if(receipt.requestFingerprint!==fingerprint||receipt.leaveId!==normalized.leaveId||receipt.committedByUid!==uid||receipt.committedByEmail!==email)throw Error('請假操作 receipt identity 衝突');
   if(!current)throw Error('請假紀錄遺失');
   return{duplicate:true,record:current,revision:receipt.revision};
  }
  const teacherId=String(normalized.action==='create'||normalized.action==='update'?normalized.input?.teacherId||'':current?.teacherId||'');
  const teacherEnvelope=readTeacherEnvelope?await readTeacherEnvelope(tx,teacherId):(await tx.get(firestore.doc(`productionFullRecordShadows/danbridge/collections/teachers/records/${teacherId}`))).data();
  const teacher=policy.teacherRecordFromAuthorityEnvelope(teacherEnvelope,teacherId);
  const record=policy.buildTeacherLeaveRecord({request,actor,current,teacher,teacherName:String(teacher.name||teacher.displayName||teacherId),nowIso,environment});
  assertApprovedLeaveWithinAllowance(record,leaveRowsSnapshot.docs.map(row=>({...row.data(),id:row.id})),teacher);
  const active=accessRows.filter(row=>row.active===true&&row.companyId==='danbridge');
  const recipients=new Map();
  if(!accessRows.some(row=>row.email===primaryOwnerEmail))recipients.set(primaryOwnerEmail,{email:primaryOwnerEmail,role:'owner',teacherId:''});
  for(const row of active){
   const scheduler=row.role==='teacher'&&row.active===true&&row.canManageSchedule===true&&typeof row.teacherId==='string'&&row.teacherId.trim()!=='';
   const ownTeacher=row.role==='teacher'&&String(row.teacherId||'')===record.teacherId;
   if(row.role==='owner'||scheduler||ownTeacher)recipients.set(row.email,{email:row.email,role:row.role==='owner'?'owner':scheduler?'scheduler':'teacher',teacherId:row.role==='owner'?'':String(row.teacherId||'')});
  }
  tx.set(leaveRef,{...record,updatedAt:serverTimestamp(),updatedByUid:uid,updatedByEmail:email},{merge:false});
  tx.set(receiptRef,{schema:'danbridge-teacher-leave-operation-receipt-v1',environment,companyId:'danbridge',operationId:normalized.operationId,leaveId:normalized.leaveId,action:normalized.action,requestFingerprint:fingerprint,revision:record.revision,committedAt:serverTimestamp(),committedByUid:uid,committedByEmail:email},{merge:false});
  tx.set(firestore.doc(`companyAudit/teacher-leave-${normalized.operationId}`),{schema:'danbridge-company-audit-v2',environment,companyId:'danbridge',category:'teacher-leave',action:`teacher-leave-${normalized.action}`,actorUid:uid,actorEmail:email,targetType:'teacherLeave',targetId:normalized.leaveId,teacherId:record.teacherId,leaveType:record.leaveType,date:record.date,durationMinutes:record.durationMinutes,status:record.status,revision:record.revision,createdAt:serverTimestamp()},{merge:false});
  for(const recipient of recipients.values()){
   const suffix=recipient.email.replace(/[^A-Za-z0-9_-]/g,'_'),verbs={create:'已送出申請',update:'已更新申請',approve:'已核准',reject:'已駁回',cancel:'已取消'},verb=verbs[normalized.action]||'已異動',label=policy.teacherLeaveTypeLabel(record.leaveType);
   tx.set(firestore.doc(`companies/danbridge/scheduleNotifications/leave_${normalized.operationId}_${suffix}`),{companyId:'danbridge',notificationType:'teacher-leave',recipientEmail:recipient.email,recipientRole:recipient.role,teacherId:recipient.teacherId,teacherName:record.teacherName,title:'老師請假異動',message:`${record.teacherName} ${record.date} ${record.start}–${record.end} ${label}${verb}`,changeCount:1,details:[{leaveId:record.leaveId,teacherId:record.teacherId,teacherName:record.teacherName,leaveType:record.leaveType,leaveTypeLabel:label,date:record.date,start:record.start,end:record.end,hours:record.hours,days:record.days,status:record.status,action:normalized.action,summary:`${label} ${record.hours} 小時／${record.days} 天`}],read:false,createdAt:serverTimestamp(),createdBy:uid,createdByName:String(saved?.teacherName||saved?.displayName||email)},{merge:false});
  }
  return{duplicate:false,record,revision:record.revision};
 });
}

// Querying the scoped adapter cannot reach production or another workspace.
async function readTeacherLeaves({firestore,identity,primaryOwnerEmail='a0965487920@gmail.com'}){
 const {normalizeTeacherLeaveActor}=await import('../js/core/teacher-leave-policy.js');
 return firestore.runTransaction(async tx=>{
  const email=String(identity?.email||'').trim().toLowerCase(),snapshot=await tx.get(firestore.doc('companyAccess/'+email));
  const actor=normalizeTeacherLeaveActor({...(!snapshot.exists&&email===primaryOwnerEmail?{role:'owner',active:true,companyId:'danbridge'}:snapshot.data()),email,uid:identity?.uid});
  let query=firestore.collection('productionTeacherLeaveRecords').where('companyId','==','danbridge');
  if(actor.kind==='teacher')query=query.where('teacherId','==',actor.teacherId);
  const rows=await tx.get(query);
  return rows.docs.map(row=>({...row.data(),id:row.id}));
 });
}
module.exports={executeTeacherLeave,readTeacherLeaves};
