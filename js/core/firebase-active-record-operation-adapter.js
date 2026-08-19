import {applyActiveRecordOperation} from './cloud-active-record-sync.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const validSegment=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=1500&&!/[\u0000-\u001f/]/.test(value);
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot?.exists?snapshot.data:null);
const namespaces=environment=>environment==='production'?{records:'productionFullRecordShadows',controls:'productionRecordSyncControls',safety:'productionRecordSyncSafetyControls',receipts:'productionRecordSyncOperationReceipts'}:environment==='staging'?{records:'stagingFullRecordShadows',controls:'stagingRecordSyncControls',safety:'stagingRecordSyncSafetyControls',receipts:'stagingRecordSyncOperationReceipts'}:null;

function operationBody(operation){
 const {path,...body}=operation;return body;
}

export function createFirebaseActiveRecordOperationAdapter({runTransaction,serverTimestamp,actor,environment,role}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('日常逐筆 Firebase adapter 注入介面不完整');
 const space=namespaces(environment);
 const guard=()=>{if(!space||role!=='owner'||!validSegment(actor?.uid)||!validSegment(String(actor?.email||'').trim().toLowerCase()))throw new Error('日常逐筆 Firebase adapter 只允許指定環境 Owner')};
 return{enabled:Boolean(space&&role==='owner'),async apply(operation){
  guard();if(!operation||operation.environment!==environment||!validSegment(operation.activationEpoch)||!validSegment(operation.operationId)||!validSegment(operation.collection)||!validSegment(operation.recordId))throw new Error('日常逐筆 Firebase 操作 identity 無效');
  const recordPath=`${space.records}/danbridge/collections/${operation.collection}/records/${operation.recordId}`,controlPath=`${space.controls}/danbridge`,safetyPath=`${space.safety}/danbridge`,receiptPath=`${space.receipts}/danbridge/epochs/${operation.activationEpoch}/operations/${operation.operationId}`;
  if(operation.path!==recordPath)throw new Error('日常逐筆 Firebase 路徑不符');
  const operationHash=sha256Canonical(operationBody(operation)),email=String(actor.email).trim().toLowerCase();
  return runTransaction(async transaction=>{
   const [controlSnapshot,safetySnapshot,recordSnapshot,receiptSnapshot]=await Promise.all([transaction.get(controlPath),transaction.get(safetyPath),transaction.get(recordPath),transaction.get(receiptPath)]),control=valueOf(controlSnapshot),safety=valueOf(safetySnapshot),current=valueOf(recordSnapshot),receipt=valueOf(receiptSnapshot);
   if(!control||control.schema!=='danbridge-record-sync-control-v1'||control.environment!==environment||control.companyId!=='danbridge'||control.state!=='active'||control.activationEpoch!==operation.activationEpoch||control.writeTakeover!==true)throw new Error('日常逐筆同步尚未原子啟用');
   if(!safety||safety.schema!=='danbridge-record-sync-safety-control-v1'||safety.environment!==environment||safety.companyId!=='danbridge'||safety.activationEpoch!==operation.activationEpoch||safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true)throw new Error('日常逐筆同步已安全暫停');
   if(receipt){
    if(receipt.schema!=='danbridge-active-record-operation-receipt-v1'||receipt.environment!==environment||receipt.companyId!=='danbridge'||receipt.activationEpoch!==operation.activationEpoch||receipt.operationId!==operation.operationId||receipt.operationHash!==operationHash||receipt.collection!==operation.collection||receipt.recordId!==operation.recordId||receipt.revision!==operation.nextRevision||receipt.deleted!==operation.payload.deleted)throw new Error('日常逐筆完成憑證 identity 衝突');
    return{kind:'duplicate',write:false,revision:receipt.revision,path:recordPath,receiptPath};
   }
   const result=applyActiveRecordOperation(current,operation),audit={updatedAt:serverTimestamp(),updatedBy:actor.uid,updatedByEmail:email};
   if(result.write){
    transaction.set(recordPath,{...result.payload,...audit});
    transaction.set(receiptPath,{schema:'danbridge-active-record-operation-receipt-v1',environment,companyId:'danbridge',activationEpoch:operation.activationEpoch,operationId:operation.operationId,operationHash,collection:operation.collection,recordId:operation.recordId,revision:operation.nextRevision,deleted:operation.payload.deleted,deviceId:operation.deviceId,...audit});
   }
   return{...result,path:recordPath,receiptPath};
  });
 }};
}
