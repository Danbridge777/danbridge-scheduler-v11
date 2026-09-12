'use strict';
const {createHash}=require('node:crypto');
const {proofPath,coveredNotificationId,recipientState}=require('./production-notification-delivery-proof.cjs');
// Keep the legacy callable contract: older open pages and durable retry jobs
// can finish safely after atomic publication is enabled. A server-side proof
// can suppress only a notice that was already committed for the SAME current
// lesson revision, actor, recipient and resulting scoped state.
async function createProductionNotificationPublisher({firestore,serverTimestamp,primaryOwnerEmail}){
 const {normalizeProductionScheduleNotificationPublishRequest:normalize,assertProductionScheduleNotificationAccess:assertAccess}=await import('../js/core/production-notification-policy.js');
 return {async execute(raw,caller){
  const input=normalize(raw),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  if(!caller?.uid||!caller?.email)throw Error('通知操作身分不一致');
  const root='companies/danbridge/',receiptRef=firestore.doc(`${root}productionScheduleNotificationReceipts/${input.requestId}`);
  const result=await firestore.runTransaction(async transaction=>{
   const notificationRefs=input.notifications.map(item=>firestore.doc(`${root}scheduleNotifications/${item.id}`));
   const accessRefs=input.notifications.map(item=>item.payload.recipientEmail===primaryOwnerEmail?null:firestore.doc(`companyAccess/${item.payload.recipientEmail}`));
   const [safetyRow,receiptRow,accessRows,currentRows,callerRow]=await Promise.all([
    transaction.get(firestore.doc(root+'productionRecordRuntime/safety')),transaction.get(receiptRef),
    Promise.all(accessRefs.map(ref=>ref?transaction.get(ref):null)),Promise.all(notificationRefs.map(ref=>transaction.get(ref))),
    caller.email===primaryOwnerEmail?null:transaction.get(firestore.doc('companyAccess/'+caller.email))
   ]);
   if(caller.email!==primaryOwnerEmail&&!(callerRow?.data()?.active===true&&callerRow.data().role==='owner'&&callerRow.data().companyId==='danbridge'))throw Error('通知 Owner 成員權限已撤銷');
   input.notifications.forEach((item,i)=>assertAccess(item,accessRows[i]?.exists?{id:accessRows[i].id,...accessRows[i].data()}:null,primaryOwnerEmail));
   // A completed retry is not a new publication. It remains valid after a
   // later authority head, but must freshly pass identity and recipient scope.
   if(receiptRow.exists){const receipt=receiptRow.data();if(receipt.fingerprint!==fingerprint||receipt.sourceHash!==input.sourceHash||receipt.committedByUid!==caller.uid||receipt.committedByEmail!==caller.email)throw Error('通知發布 receipt identity 衝突');return{kind:'duplicate',writeCount:0,notificationCount:input.notifications.length,duplicateCount:input.notifications.length}}
   const safety=safetyRow.data();
   if(!safety||safety.state!=='active'||safety.writeAllowed!==true||safety.recordDataHash!==input.sourceHash)throw Error('通知來源不是目前正式權威 head');
   const ids=[...new Set(input.notifications.flatMap(item=>item.payload.details.map(detail=>detail.lessonId)))];
   if(ids.some(id=>!id||id.includes('/')))throw Error('通知課程識別碼無效');
   const [proofRows,recordRows]=await Promise.all([
    Promise.all(ids.map(id=>transaction.get(firestore.doc(proofPath(id))))),
    Promise.all(ids.map(id=>transaction.get(firestore.doc(`productionFullRecordShadows/danbridge/collections/lessons/records/${id}`))))
   ]);
   const proofs=new Map(ids.map((id,i)=>[id,proofRows[i].data()])),records=new Map(ids.map((id,i)=>[id,recordRows[i].data()]));
   // Older Owner pages also relay AA events. The caller remains a freshly
   // authorized Owner; the event actor is matched to server-written proof.
   const candidates=input.notifications.map(item=>item.payload.details.map(detail=>coveredNotificationId(item,detail,proofs.get(detail.lessonId),records.get(detail.lessonId),{uid:item.payload.createdBy,email:proofs.get(detail.lessonId)?.actorEmail})));
   const candidateIds=[...new Set(candidates.flat().filter(Boolean))];
   const deliveredRows=await Promise.all(candidateIds.map(id=>transaction.get(firestore.doc(root+'scheduleNotifications/'+id))));
   const delivered=new Map(candidateIds.map((id,i)=>[id,deliveredRows[i].data()]));
   let writeCount=0,duplicateCount=0,coveredDetailCount=0;
   input.notifications.forEach((item,i)=>{
    const current=currentRows[i].data();
    if(current){if(current.publishFingerprint!==fingerprint||current.publishRequestId!==input.requestId||current.recipientEmail!==item.payload.recipientEmail)throw Error('既有通知 identity 衝突');duplicateCount++;return}
    const details=item.payload.details.filter((detail,j)=>{
     const proofId=candidates[i][j],notice=proofId?delivered.get(proofId):null;
     const covered=notice?.recipientEmail===item.payload.recipientEmail&&notice?.createdBy===item.payload.createdBy&&notice?.details?.some(row=>row.lessonId===detail.lessonId&&recipientState(notice,row)===recipientState(item.payload,detail));
     if(covered)coveredDetailCount++;return !covered;
    });
    if(!details.length){duplicateCount++;return}
    const payload=details.length===item.payload.details.length?item.payload:{...item.payload,details,changeCount:details.length,message:`課表有 ${details.length} 個變更`};
    transaction.set(notificationRefs[i],{...payload,sourceHash:input.sourceHash,release:input.release,publishRequestId:input.requestId,publishFingerprint:fingerprint,createdAt:serverTimestamp(),createdBy:caller.uid,createdByEmail:caller.email},{merge:false});writeCount++;
   });
   transaction.set(receiptRef,{schema:'danbridge-production-schedule-notification-publish-receipt-v1',environment:'production',companyId:'danbridge',requestId:input.requestId,sourceHash:input.sourceHash,release:input.release,fingerprint,notificationCount:input.notifications.length,writeCount,duplicateCount,coveredDetailCount,committedAt:serverTimestamp(),committedByUid:caller.uid,committedByEmail:caller.email},{merge:false});
   return{kind:'published',writeCount,notificationCount:input.notifications.length,duplicateCount};
  });
  return{schema:'danbridge-production-schedule-notification-publish-response-v1',ok:true,requestId:input.requestId,sourceHash:input.sourceHash,...result};
 }};
}
module.exports={createProductionNotificationPublisher};
