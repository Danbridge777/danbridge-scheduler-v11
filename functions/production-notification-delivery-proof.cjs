'use strict';
const {nativeCanonicalSha256:hash}=require('./native-canonical-sha256.cjs');
const SCHEMA='danbridge-atomic-notification-proof-v1';
const proofPath=lessonId=>`companies/danbridge/productionNotificationDeliveryProofs/${hash(lessonId)}`;
const recordHash=record=>hash({revision:record.revision,sourceHash:record.sourceHash,deleted:record.deleted,record:record.record});
// Text, display names and ordering of teacher IDs may differ between old and
// new renderers. Match the recipient's actual resulting lesson, never its UI
// summary. A proof is valid only for this exact authority record revision.
function recipientState(payload,detail){
 const after=detail.after===null?null:{...detail.after,teacherIds:[...new Set(detail.after.teacherIds||[])].sort()};
 return hash({recipientEmail:payload.recipientEmail,recipientRole:payload.recipientRole,teacherId:payload.teacherId||'',branchIds:[...(payload.branchIds||[])].sort(),lessonId:detail.lessonId,after});
}
function buildNotificationDeliveryProofs(notices,records,actor,sourceHash){
 const proofs=new Map();
 for(const item of notices)for(const detail of item.payload.details){
  const record=records.get(detail.lessonId);
  if(!record||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.sourceHash!=='string')throw Error('Atomic notification record proof missing');
  let proof=proofs.get(detail.lessonId);
  if(!proof){proof={schema:SCHEMA,lessonId:detail.lessonId,recordRevision:record.revision,recordHash:recordHash(record),sourceHash,actorUid:actor.uid,actorEmail:actor.email,recipients:{}};proofs.set(detail.lessonId,proof)}
  proof.recipients[hash(item.payload.recipientEmail)]={notificationId:item.id,stateHash:recipientState(item.payload,detail)};
 }
 return [...proofs.values()].map(value=>({path:proofPath(value.lessonId),value}));
}
function coveredNotificationId(item,detail,proof,record,actor){
 if(!proof||proof.schema!==SCHEMA||proof.lessonId!==detail.lessonId||proof.actorUid!==actor.uid||proof.actorEmail!==actor.email||!record||record.revision!==proof.recordRevision||recordHash(record)!==proof.recordHash)return null;
 const recipient=proof.recipients?.[hash(item.payload.recipientEmail)];
 if(!recipient||recipient.stateHash!==recipientState(item.payload,detail)||!/^[A-Za-z0-9_-]{8,200}$/.test(recipient.notificationId||''))return null;
 return recipient.notificationId;
}
module.exports={proofPath,recipientState,buildNotificationDeliveryProofs,coveredNotificationId};
