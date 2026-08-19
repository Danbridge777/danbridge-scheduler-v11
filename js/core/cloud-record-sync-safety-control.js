import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=500;
const timestamp=value=>typeof value==='string'&&value.trim()===value&&Number.isFinite(Date.parse(value));

export function buildInitialRecordSyncSafetyControl({manifest,createdAt}={}){
 if(!manifest||manifest.schema!=='danbridge-record-sync-activation-manifest-v1'||!['staging','production'].includes(manifest.environment)||!token(manifest.activationEpoch)||!digest(manifest.manifestHash)||!timestamp(createdAt))throw new Error('逐筆同步初始安全控制證據無效');
 return{schema:'danbridge-record-sync-safety-control-v1',environment:manifest.environment,companyId:'danbridge',activationEpoch:manifest.activationEpoch,state:'active',revision:1,lastEventId:`activation:${manifest.manifestHash}`,lastEventHash:manifest.manifestHash,readAllowed:true,writeAllowed:true,updatedAt:createdAt};
}

export function assertRecordSyncSafetyControl(control,{environment,activationEpoch}={}){
 if(!control||control.schema!=='danbridge-record-sync-safety-control-v1'||control.environment!==environment||control.companyId!=='danbridge'||control.activationEpoch!==activationEpoch||!['active','paused'].includes(control.state)||!Number.isSafeInteger(control.revision)||control.revision<1||!token(control.lastEventId)||!digest(control.lastEventHash)||control.readAllowed!==true||control.writeAllowed!==(control.state==='active')||!timestamp(control.updatedAt))throw new Error('逐筆同步安全控制無效');return control;
}

export function buildRecordSyncSafetyPause({control,eventId,reason,safeRecordDataHash,cloudBackupId,createdAt}={}){
 assertRecordSyncSafetyControl(control,{environment:control?.environment,activationEpoch:control?.activationEpoch});if(control.state!=='active'||!token(eventId)||!text(reason)||!recordHash(safeRecordDataHash)||!token(cloudBackupId)||!timestamp(createdAt))throw new Error('逐筆同步暫停證據無效');
 const body={schema:'danbridge-record-sync-safety-event-v1',environment:control.environment,companyId:'danbridge',activationEpoch:control.activationEpoch,type:'pause',eventId,beforeRevision:control.revision,afterRevision:control.revision+1,reason,safeRecordDataHash,cloudBackupId,createdAt},event={...body,eventHash:sha256Canonical(body)},nextControl={...clone(control),state:'paused',revision:control.revision+1,lastEventId:eventId,lastEventHash:event.eventHash,readAllowed:true,writeAllowed:false,updatedAt:createdAt};return{event,nextControl};
}

export function assertRecordSyncSafetyEvent(event,{environment,activationEpoch,type}={}){
 if(!event||event.schema!=='danbridge-record-sync-safety-event-v1'||event.environment!==environment||event.companyId!=='danbridge'||event.activationEpoch!==activationEpoch||!['pause','resume'].includes(event.type)||(type&&event.type!==type)||!token(event.eventId)||!Number.isSafeInteger(event.beforeRevision)||event.beforeRevision<1||event.afterRevision!==event.beforeRevision+1||!timestamp(event.createdAt)||!digest(event.eventHash))throw new Error('逐筆同步安全事件無效');
 if(event.type==='pause'){if(!text(event.reason)||!recordHash(event.safeRecordDataHash)||!token(event.cloudBackupId)||'recoveryReceiptHash'in event||'restoredRecordDataHash'in event)throw new Error('逐筆同步暫停事件無效')}else if('reason'in event||'safeRecordDataHash'in event||'cloudBackupId'in event||!digest(event.recoveryReceiptHash)||!recordHash(event.restoredRecordDataHash))throw new Error('逐筆同步恢復事件無效');
 const body=clone(event);delete body.eventHash;if(sha256Canonical(body)!==event.eventHash)throw new Error('逐筆同步安全事件 hash 不符');return event;
}

export function buildRecordSyncRecoveryReceipt({environment,activationEpoch,pauseEventId,sourceBackupId,restoredRecordDataHash,operationLogHash,confirmedOperationCount,createdAt}={}){
 if(!['staging','production'].includes(environment)||!token(activationEpoch)||!token(pauseEventId)||!token(sourceBackupId)||!recordHash(restoredRecordDataHash)||!digest(operationLogHash)||!Number.isSafeInteger(confirmedOperationCount)||confirmedOperationCount<0||!timestamp(createdAt))throw new Error('逐筆同步復原 receipt 證據無效');
 const body={schema:'danbridge-record-sync-recovery-receipt-v1',environment,companyId:'danbridge',state:'verified',activationEpoch,pauseEventId,sourceBackupId,restoredRecordDataHash,operationLogHash,confirmedOperationCount,createdAt};return{...body,receiptHash:sha256Canonical(body)};
}

export function assertRecordSyncRecoveryReceipt(receipt,{environment,activationEpoch,pauseEventId}={}){
 if(!receipt||receipt.schema!=='danbridge-record-sync-recovery-receipt-v1'||receipt.environment!==environment||receipt.companyId!=='danbridge'||receipt.state!=='verified'||receipt.activationEpoch!==activationEpoch||(pauseEventId&&receipt.pauseEventId!==pauseEventId)||!token(receipt.pauseEventId)||!token(receipt.sourceBackupId)||!recordHash(receipt.restoredRecordDataHash)||!digest(receipt.operationLogHash)||!Number.isSafeInteger(receipt.confirmedOperationCount)||receipt.confirmedOperationCount<0||!timestamp(receipt.createdAt)||!digest(receipt.receiptHash))throw new Error('逐筆同步復原 receipt 無效');const body=clone(receipt);delete body.receiptHash;if(sha256Canonical(body)!==receipt.receiptHash)throw new Error('逐筆同步復原 receipt hash 不符');return receipt;
}

export function buildRecordSyncSafetyResume({control,eventId,recoveryReceipt,readbackRecordDataHash,createdAt}={}){
 assertRecordSyncSafetyControl(control,{environment:control?.environment,activationEpoch:control?.activationEpoch});if(control.state!=='paused'||!token(eventId)||!recoveryReceipt||recoveryReceipt.environment!==control.environment||recoveryReceipt.activationEpoch!==control.activationEpoch||recoveryReceipt.pauseEventId!==control.lastEventId||readbackRecordDataHash!==recoveryReceipt.restoredRecordDataHash||!recordHash(readbackRecordDataHash)||!timestamp(createdAt))throw new Error('逐筆同步恢復寫入證據無效');assertRecordSyncRecoveryReceipt(recoveryReceipt,{environment:control.environment,activationEpoch:control.activationEpoch,pauseEventId:control.lastEventId});
 const body={schema:'danbridge-record-sync-safety-event-v1',environment:control.environment,companyId:'danbridge',activationEpoch:control.activationEpoch,type:'resume',eventId,beforeRevision:control.revision,afterRevision:control.revision+1,recoveryReceiptHash:recoveryReceipt.receiptHash,restoredRecordDataHash:readbackRecordDataHash,createdAt},event={...body,eventHash:sha256Canonical(body)},nextControl={...clone(control),state:'active',revision:control.revision+1,lastEventId:eventId,lastEventHash:event.eventHash,readAllowed:true,writeAllowed:true,updatedAt:createdAt};return{event,nextControl};
}

export function evaluateRecordSyncSafety({control,environment,activationEpoch}={}){
 try{assertRecordSyncSafetyControl(control,{environment,activationEpoch});return{valid:true,state:control.state,readAllowed:true,writeAllowed:control.writeAllowed,revision:control.revision,reason:control.state==='paused'?'逐筆同步已由 Owner 安全暫停':''}}catch(error){return{valid:false,state:'blocked',readAllowed:false,writeAllowed:false,revision:0,reason:String(error?.message||error)}}
}
