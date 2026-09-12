'use strict';

// Shared by production and the path-fenced staging workspace. All authorization,
// receipt checks, records, audit and notifications belong to one transaction.
async function executeTeacherLeave({firestore,identity,request,serverTimestamp,primaryOwnerEmail='a0965487920@gmail.com',nowIso=new Date().toISOString()}){
 const policy=await import('../js/core/teacher-leave-policy.js');
 const normalized=policy.normalizeTeacherLeaveRequest(request),fingerprint=policy.teacherLeaveRequestFingerprint(request);
 const email=String(identity?.email||'').trim().toLowerCase(),uid=String(identity?.uid||'');
 const leaveRef=firestore.doc(`productionTeacherLeaveRecords/${normalized.leaveId}`),receiptRef=firestore.doc(`productionTeacherLeaveOperationReceipts/${normalized.operationId}`);
 return firestore.runTransaction(async tx=>{
  const accessSnapshot=await tx.get(firestore.collection('companyAccess'));
  const accessRows=accessSnapshot.docs.map(row=>({...row.data(),email:row.id.toLowerCase()}));
  const saved=accessRows.find(row=>row.email===email);
  const actor=policy.normalizeTeacherLeaveActor({...(!saved&&email===primaryOwnerEmail?{role:'owner',companyId:'danbridge',active:true}:saved),uid,email});
  const [currentSnapshot,receiptSnapshot]=await Promise.all([tx.get(leaveRef),tx.get(receiptRef)]);
  const current=currentSnapshot.exists?currentSnapshot.data():null,receipt=receiptSnapshot.exists?receiptSnapshot.data():null;
  if(current&&(current.companyId!=='danbridge'||current.leaveId!==normalized.leaveId))throw Error('請假紀錄識別不一致');
  if(current)policy.assertTeacherLeaveScope(actor,current);
  if(normalized.action!=='cancel')policy.assertTeacherLeaveScope(actor,normalized.input);
  if(receipt){
   if(receipt.requestFingerprint!==fingerprint||receipt.leaveId!==normalized.leaveId||receipt.committedByUid!==uid||receipt.committedByEmail!==email)throw Error('請假操作 receipt identity 衝突');
   if(!current)throw Error('請假紀錄遺失');
   return{duplicate:true,record:current,revision:receipt.revision};
  }
  const teacherId=String(normalized.action==='cancel'?current?.teacherId||'':normalized.input?.teacherId||'');
  const teacherSnapshot=await tx.get(firestore.doc(`productionFullRecordShadows/danbridge/collections/teachers/records/${teacherId}`));
  const teacher=policy.teacherRecordFromAuthorityEnvelope(teacherSnapshot.exists?teacherSnapshot.data():null,teacherId);
  const record=policy.buildTeacherLeaveRecord({request,actor,current,teacherName:String(teacher.name||teacher.displayName||teacherId),nowIso});
  const active=accessRows.filter(row=>row.active===true&&row.companyId==='danbridge');
  const recipients=new Map();
  if(!accessRows.some(row=>row.email===primaryOwnerEmail))recipients.set(primaryOwnerEmail,{email:primaryOwnerEmail,role:'owner',teacherId:''});
  for(const row of active){
   const scheduler=row.role==='teacher'&&row.canManageSchedule===true&&row.email==='aa0966626336@gmail.com';
   const ownTeacher=row.role==='teacher'&&String(row.teacherId||'')===record.teacherId;
   if(row.role==='owner'||scheduler||ownTeacher)recipients.set(row.email,{email:row.email,role:row.role==='owner'?'owner':scheduler?'scheduler':'teacher',teacherId:row.role==='owner'?'':String(row.teacherId||'')});
  }
  tx.set(leaveRef,{...record,updatedAt:serverTimestamp(),updatedByUid:uid,updatedByEmail:email},{merge:false});
  tx.set(receiptRef,{schema:'danbridge-teacher-leave-operation-receipt-v1',environment:'production',companyId:'danbridge',operationId:normalized.operationId,leaveId:normalized.leaveId,action:normalized.action,requestFingerprint:fingerprint,revision:record.revision,committedAt:serverTimestamp(),committedByUid:uid,committedByEmail:email},{merge:false});
  tx.set(firestore.doc(`companyAudit/teacher-leave-${normalized.operationId}`),{schema:'danbridge-company-audit-v2',environment:'production',companyId:'danbridge',category:'teacher-leave',action:`teacher-leave-${normalized.action}`,actorUid:uid,actorEmail:email,targetType:'teacherLeave',targetId:normalized.leaveId,teacherId:record.teacherId,leaveType:record.leaveType,date:record.date,durationMinutes:record.durationMinutes,status:record.status,revision:record.revision,createdAt:serverTimestamp()},{merge:false});
  for(const recipient of recipients.values()){
   const suffix=recipient.email.replace(/[^A-Za-z0-9_-]/g,'_'),verb=normalized.action==='create'?'新增':normalized.action==='update'?'更新':'取消',label=policy.teacherLeaveTypeLabel(record.leaveType);
   tx.set(firestore.doc(`companies/danbridge/scheduleNotifications/leave_${normalized.operationId}_${suffix}`),{companyId:'danbridge',notificationType:'teacher-leave',recipientEmail:recipient.email,recipientRole:recipient.role,teacherId:recipient.teacherId,teacherName:record.teacherName,title:'老師請假異動',message:`${record.teacherName} ${record.date} ${record.start}–${record.end} ${label}已${verb}`,changeCount:1,details:[{leaveId:record.leaveId,teacherId:record.teacherId,teacherName:record.teacherName,leaveType:record.leaveType,leaveTypeLabel:label,date:record.date,start:record.start,end:record.end,hours:record.hours,status:record.status,action:normalized.action,summary:`${label} ${record.hours} 小時`}],read:false,createdAt:serverTimestamp(),createdBy:uid,createdByName:String(saved?.teacherName||saved?.displayName||email)},{merge:false});
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
