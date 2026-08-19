import {
 assertRecordSyncRecoveryReceipt,
 assertRecordSyncSafetyControl,
 assertRecordSyncSafetyEvent,
 buildRecordSyncSafetyPause,
 buildRecordSyncSafetyResume
} from './cloud-record-sync-safety-control.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot?.exists?snapshot.data:null);
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const strip=(value,fields)=>clone(Object.fromEntries(Object.entries(value||{}).filter(([key])=>!fields.includes(key))));
const eventCore=value=>strip(value,['persistedAt','createdBy','createdByEmail']);
const controlCore=value=>strip(value,['persistedAt','updatedBy','updatedByEmail']);
const receiptCore=value=>strip(value,['persistedAt','persistedBy','persistedByEmail']);

export function createFirebaseRecordSyncSafetyAdapter({runTransaction,serverTimestamp,actor,environment='staging',role}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('逐筆同步安全 adapter 注入介面不完整');
 const guard=()=>{const email=String(actor?.email||'').trim().toLowerCase();if(environment!=='staging'||role!=='owner'||!token(actor?.uid)||!email)throw new Error('逐筆同步安全控制只允許 staging Owner');return email};
 const paths=activationEpoch=>({controlPath:'stagingRecordSyncSafetyControls/danbridge',eventPath:eventId=>`stagingRecordSyncSafetyEvents/danbridge/epochs/${activationEpoch}/events/${eventId}`,receiptPath:receiptHash=>`stagingRecordSyncRecoveryReceipts/danbridge/epochs/${activationEpoch}/receipts/${receiptHash}`});
 const persistTransition=async({event,nextControl,type,recoveryReceipt,readbackRecordDataHash}={})=>{
  const email=guard(),eventValue=eventCore(event),controlValue=controlCore(nextControl),activationEpoch=eventValue.activationEpoch;
  assertRecordSyncSafetyEvent(eventValue,{environment:'staging',activationEpoch,type});assertRecordSyncSafetyControl(controlValue,{environment:'staging',activationEpoch});
  if(controlValue.lastEventId!==eventValue.eventId||controlValue.lastEventHash!==eventValue.eventHash||controlValue.revision!==eventValue.afterRevision||controlValue.updatedAt!==eventValue.createdAt)throw new Error('逐筆同步安全事件與控制不一致');
  let receiptValue=null;if(type==='resume'){receiptValue=receiptCore(recoveryReceipt);assertRecordSyncRecoveryReceipt(receiptValue,{environment:'staging',activationEpoch,pauseEventId:recoveryReceipt?.pauseEventId});if(eventValue.recoveryReceiptHash!==receiptValue.receiptHash||eventValue.restoredRecordDataHash!==readbackRecordDataHash)throw new Error('逐筆同步恢復事件與讀回證據不一致')}
  const path=paths(activationEpoch),eventPath=path.eventPath(eventValue.eventId),receiptPath=type==='resume'?path.receiptPath(receiptValue.receiptHash):'';
  return runTransaction(async transaction=>{const snapshots=await Promise.all([transaction.get(path.controlPath),transaction.get(eventPath),...(receiptPath?[transaction.get(receiptPath)]:[])]),current=controlCore(valueOf(snapshots[0])),existingEvent=valueOf(snapshots[1]),savedReceipt=receiptPath?valueOf(snapshots[2]):null;
   if(current&&same(current,controlValue)){if(!existingEvent||!same(eventCore(existingEvent),eventValue))throw new Error('逐筆同步安全轉換留下半套狀態');return{kind:'duplicate',write:false,state:controlValue.state,revision:controlValue.revision,controlPath:path.controlPath,eventPath,receiptPath}}
   assertRecordSyncSafetyControl(current,{environment:'staging',activationEpoch});if(existingEvent)throw new Error('逐筆同步安全事件 immutable 衝突');let expected;
   if(type==='pause')expected=buildRecordSyncSafetyPause({control:current,eventId:eventValue.eventId,reason:eventValue.reason,safeRecordDataHash:eventValue.safeRecordDataHash,cloudBackupId:eventValue.cloudBackupId,createdAt:eventValue.createdAt});
   else{if(!savedReceipt||!same(receiptCore(savedReceipt),receiptValue))throw new Error('逐筆同步恢復 receipt 尚未完整落地或 identity 不符');expected=buildRecordSyncSafetyResume({control:current,eventId:eventValue.eventId,recoveryReceipt:receiptValue,readbackRecordDataHash,createdAt:eventValue.createdAt})}
   if(!same(expected.event,eventValue)||!same(expected.nextControl,controlValue))throw new Error('逐筆同步安全轉換基準版本已改變');
   const persistedAt=serverTimestamp();transaction.set(eventPath,{...eventValue,persistedAt,createdBy:actor.uid,createdByEmail:email});transaction.set(path.controlPath,{...controlValue,persistedAt,updatedBy:actor.uid,updatedByEmail:email});return{kind:type==='pause'?'paused':'resumed',write:true,state:controlValue.state,revision:controlValue.revision,controlPath:path.controlPath,eventPath,receiptPath};
  });
 };
 return{
  enabled:environment==='staging'&&role==='owner',
  pause(input){return persistTransition({...input,type:'pause'})},
  async persistRecovery(recoveryReceipt){const email=guard(),receipt=receiptCore(recoveryReceipt);assertRecordSyncRecoveryReceipt(receipt,{environment:'staging',activationEpoch:receipt.activationEpoch,pauseEventId:receipt.pauseEventId});const path=paths(receipt.activationEpoch),receiptPath=path.receiptPath(receipt.receiptHash),backupPath=`stagingMigrationBackups/danbridge/runs/${receipt.sourceBackupId}`;return runTransaction(async transaction=>{const [controlSnapshot,receiptSnapshot,backupSnapshot]=await Promise.all([transaction.get(path.controlPath),transaction.get(receiptPath),transaction.get(backupPath)]),control=controlCore(valueOf(controlSnapshot)),existing=valueOf(receiptSnapshot),backup=valueOf(backupSnapshot);if(existing){if(!same(receiptCore(existing),receipt))throw new Error('逐筆同步復原 receipt immutable 衝突');return{kind:'duplicate',write:false,receiptPath}}
    assertRecordSyncSafetyControl(control,{environment:'staging',activationEpoch:receipt.activationEpoch});if(control.state!=='paused'||control.lastEventId!==receipt.pauseEventId)throw new Error('逐筆同步復原 receipt 不屬於目前暫停事件');if(!backup||backup.state!=='verified'||backup.backupId!==receipt.sourceBackupId||typeof backup.sourceHash!=='string'||backup.sourceHash!==backup.verifiedHash)throw new Error('逐筆同步復原 receipt 來源備份無效');transaction.set(receiptPath,{...receipt,persistedAt:serverTimestamp(),persistedBy:actor.uid,persistedByEmail:email});return{kind:'persisted',write:true,receiptPath};
   })},
  resume(input){return persistTransition({...input,type:'resume'})}
 };
}
