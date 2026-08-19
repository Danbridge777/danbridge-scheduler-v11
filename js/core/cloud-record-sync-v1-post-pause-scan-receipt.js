import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assertRecordSyncV1V2HardPauseTransitionReceipt} from './cloud-record-sync-v1-v2-hard-pause-transition.js';
import {assertHardPausedRecordSyncV1WriterCurrent} from './cloud-record-sync-v1-writer-current.js';
import {assertRecordSyncSafetyControl} from './cloud-record-sync-safety-control.js';
import {RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE} from './cloud-record-sync-v1-raw-document-leaf.js';
import {
 RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE,
 buildRecordSyncV1RawDocumentExecution,
 consumeRecordSyncV1RawDocumentExecution
} from './cloud-record-sync-v1-raw-document-root.js';

export const RECORD_SYNC_V1_POST_PAUSE_SCAN_RECEIPT_SCHEMA='danbridge-record-sync-v1-post-pause-scan-receipt-v1';
export const RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE='single-scan-observation-not-cross-query-freeze-authority';
export const RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE='hard-pause-receipt-self-hash-integration-trust-boundary';
export const RECORD_SYNC_V1_POST_PAUSE_SCAN_INTEGRITY_SCOPE='self-hash-only-not-scan-or-document-authority';
export const RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCHEMA='danbridge-record-sync-v1-post-pause-scan-execution-v1';
export const RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCOPE=RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE;
export {RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA,RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA,RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE};

const inputFields=['hardPauseReceipt','hardPausedWriterCurrent','pausedSafetyControl','ordinal','startedAt','completedAt','documentsByCollection'];
const anchorInputFields=['hardPauseReceipt','hardPausedWriterCurrent','pausedSafetyControl'];
const expectedFields=[...inputFields];
const safetyFields=['schema','environment','companyId','activationEpoch','state','revision','lastEventId','lastEventHash','readAllowed','writeAllowed','updatedAt'];
const safetyAuditFields=['persistedAt','updatedBy','updatedByEmail'];
const receiptFields=['schema','environment','companyId','activationEpoch','state','scope','ordinal','scanId','hardPauseReceiptHash','hardPauseAnchorScope','freezeId','targetV2Epoch','hardPausedWriterControlHash','hardPausedWriterRevision','pausedSafetyControlHash','pausedSafetyRevision','pausedSafetyLastEventId','pausedSafetyLastEventHash','startedAt','completedAt','rawDocumentRootSchema','rawDocumentRootScope','rootAuditScope','rawDocumentRootHash','activeLogicalHashSchema','activeLogicalDataHash','documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','collectionSummariesHash','batchCount','batchReceiptSummariesHash','scanHash'];
const receiptAuditFields=['persistedAt','persistedBy','persistedByEmail'];
const scanExecutionPayloads=new WeakMap();
const ZERO_HASH='0'.repeat(64);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const count=value=>Number.isSafeInteger(value)&&value>=0;
const token=value=>typeof value==='string'&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length>0&&value.length<=320&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}return result;
}

function stripAudit(value,fields,audits,label,actorField,emailField){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value),auditCount=audits.filter(key=>keys.includes(key)).length;
 if(auditCount!==0&&auditCount!==audits.length)throw new Error(label+' audit 欄位必須 all-or-none');
 if(keys.length!==fields.length+auditCount||keys.some(key=>typeof key!=='string'||![...fields,...audits].includes(key)))throw new Error(label+' 欄位無效');
 const core={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(auditCount){const at=Object.getOwnPropertyDescriptor(value,audits[0]),uid=Object.getOwnPropertyDescriptor(value,actorField),mail=Object.getOwnPropertyDescriptor(value,emailField);if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error(label+' audit 格式無效')}
 return core;
}

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}

function timestampNanos(value){
 if(!isStrictActiveRecordSaveTimestamp(value))throw new Error('post-pause scan timestamp 無效');
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value),year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]),fraction=BigInt((match[7]??'').padEnd(9,'0')||'0'),zone=match[8],leap=year%4===0&&(year%100!==0||year%400===0),monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],priorYear=BigInt(year-1),daysBeforeYear=365n*priorYear+priorYear/4n-priorYear/100n+priorYear/400n,daysBeforeMonth=BigInt(monthDays.slice(0,month-1).reduce((sum,value)=>sum+value,0));
 let offsetMinutes=0;if(zone!=='Z'){const amount=Number(zone.slice(1,3))*60+Number(zone.slice(4,6));offsetMinutes=(zone[0]==='+'?1:-1)*amount}
 return((daysBeforeYear+daysBeforeMonth+BigInt(day-1))*86400n+BigInt(hour*3600+minute*60+second-offsetMinutes*60))*1_000_000_000n+fraction;
}

function assertPausedSafety(value,activationEpoch){
 const core=stripAudit(value,safetyFields,safetyAuditFields,'post-pause paused safety control','updatedBy','updatedByEmail');
 if(!isStrictActiveRecordSaveTimestamp(core.updatedAt))throw new Error('post-pause paused safety timestamp 無效');
 assertRecordSyncSafetyControl(core,{environment:'staging',activationEpoch});
 if(core.state!=='paused'||core.readAllowed!==true||core.writeAllowed!==false)throw new Error('post-pause safety 必須保持 paused');
 return core;
}

function assertAnchors(hardPauseReceipt,hardPausedWriterCurrent,pausedSafetyControl){
 const receipt=assertRecordSyncV1V2HardPauseTransitionReceipt(hardPauseReceipt),writer=assertHardPausedRecordSyncV1WriterCurrent(hardPausedWriterCurrent),safety=assertPausedSafety(pausedSafetyControl,receipt.activationEpoch);
 if(writer.activationEpoch!==receipt.activationEpoch||writer.revision!==receipt.sourceWriterRevision+1||writer.currentFreezeId!==receipt.freezeId||writer.currentFreezeRequestHash!==receipt.freezeRequestHash||writer.currentFreezeControlHash!==receipt.requestedFreezeControlHash||writer.safetyRevision!==receipt.pausedSafetyRevision||writer.safetyLastEventHash!==receipt.legacySafetyPauseEventHash||writer.lastTransitionHash!==receipt.receiptHash||writer.operationPolicy!==receipt.operationPolicy||safety.revision!==receipt.pausedSafetyRevision||safety.lastEventId!==receipt.legacySafetyPauseEventId||safety.lastEventHash!==receipt.legacySafetyPauseEventHash||safety.updatedAt!==receipt.createdAt||writer.safetyRevision!==safety.revision||writer.safetyLastEventHash!==safety.lastEventHash||timestampNanos(receipt.createdAt)<timestampNanos(writer.createdAt))throw new Error('post-pause H/W1/S1 linkage 或 chronology 無效');
 return{receipt,writer,safety};
}

function buildExecutionFromInput(input){
 const value=exact(input,inputFields,'post-pause scan input');
 if(!['U','V'].includes(value.ordinal)||!isStrictActiveRecordSaveTimestamp(value.startedAt)||!isStrictActiveRecordSaveTimestamp(value.completedAt))throw new Error('post-pause scan ordinal 或 timestamp 無效');
 const anchors=assertAnchors(value.hardPauseReceipt,value.hardPausedWriterCurrent,value.pausedSafetyControl),started=timestampNanos(value.startedAt),completed=timestampNanos(value.completedAt);
 if(started<timestampNanos(anchors.receipt.createdAt)||completed<started)throw new Error('post-pause scan chronology 無效');
 const rawRootExecution=buildRecordSyncV1RawDocumentExecution({documentsByCollection:value.documentsByCollection}),rawPayload=consumeRecordSyncV1RawDocumentExecution(rawRootExecution,{expectedRawDocumentRootHash:rawRootExecution.rawDocumentRootHash}),manifest=rawPayload.rootSnapshot.manifest;
 if(manifest.rootScope!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE||manifest.auditScope!==RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE||manifest.unauditedCount!==0||manifest.auditedCount!==manifest.documentCount)throw new Error('post-pause scan root 尚未具備完整 audit observation');
 const core={schema:RECORD_SYNC_V1_POST_PAUSE_SCAN_RECEIPT_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:anchors.receipt.activationEpoch,state:'observed',scope:RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE,ordinal:value.ordinal,scanId:'freeze-scan-'+value.ordinal.toLowerCase()+':'+anchors.receipt.receiptHash,hardPauseReceiptHash:anchors.receipt.receiptHash,hardPauseAnchorScope:RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE,freezeId:anchors.receipt.freezeId,targetV2Epoch:anchors.receipt.targetV2Epoch,hardPausedWriterControlHash:anchors.writer.controlHash,hardPausedWriterRevision:anchors.writer.revision,pausedSafetyControlHash:sha256Canonical(anchors.safety),pausedSafetyRevision:anchors.safety.revision,pausedSafetyLastEventId:anchors.safety.lastEventId,pausedSafetyLastEventHash:anchors.safety.lastEventHash,startedAt:value.startedAt,completedAt:value.completedAt,rawDocumentRootSchema:manifest.schema,rawDocumentRootScope:manifest.rootScope,rootAuditScope:manifest.auditScope,rawDocumentRootHash:manifest.rawDocumentRootHash,activeLogicalHashSchema:manifest.activeLogicalHashSchema,activeLogicalDataHash:manifest.activeLogicalDataHash,documentCount:manifest.documentCount,activeCount:manifest.activeCount,tombstoneCount:manifest.tombstoneCount,auditedCount:manifest.auditedCount,unauditedCount:manifest.unauditedCount,collectionSummariesHash:manifest.collectionSummariesHash,batchCount:manifest.batchCount,batchReceiptSummariesHash:manifest.batchReceiptSummariesHash};
 const receipt=deepFreeze({...core,scanHash:sha256Canonical(core)});
 const execution=deepFreeze({schema:RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCHEMA,artifactKind:'ephemeral-capability',environment:'staging',companyId:'danbridge',scope:RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCOPE,scanHash:receipt.scanHash,rawDocumentRootHash:receipt.rawDocumentRootHash,documentCount:receipt.documentCount,receipt});scanExecutionPayloads.set(execution,rawRootExecution);return execution;
}

function buildFromInput(input){return buildExecutionFromInput(input).receipt}

function assertReceiptCore(value){
 const receipt=stripAudit(value,receiptFields,receiptAuditFields,'post-pause scan receipt','persistedBy','persistedByEmail');
 if(receipt.schema!==RECORD_SYNC_V1_POST_PAUSE_SCAN_RECEIPT_SCHEMA||receipt.environment!=='staging'||receipt.companyId!=='danbridge'||receipt.state!=='observed'||receipt.scope!==RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE||!['U','V'].includes(receipt.ordinal)||receipt.scanId!=='freeze-scan-'+receipt.ordinal.toLowerCase()+':'+receipt.hardPauseReceiptHash||!token(receipt.scanId)||!digest(receipt.hardPauseReceiptHash)||receipt.hardPauseAnchorScope!==RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE||!token(receipt.freezeId)||!token(receipt.targetV2Epoch)||!digest(receipt.hardPausedWriterControlHash)||!count(receipt.hardPausedWriterRevision)||receipt.hardPausedWriterRevision<2||!digest(receipt.pausedSafetyControlHash)||!count(receipt.pausedSafetyRevision)||receipt.pausedSafetyRevision<2||!token(receipt.pausedSafetyLastEventId)||!digest(receipt.pausedSafetyLastEventHash)||!isStrictActiveRecordSaveTimestamp(receipt.startedAt)||!isStrictActiveRecordSaveTimestamp(receipt.completedAt)||receipt.rawDocumentRootSchema!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA||receipt.rawDocumentRootScope!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE||receipt.rootAuditScope!==RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE||!digest(receipt.rawDocumentRootHash)||receipt.activeLogicalHashSchema!==RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA||!/^raw-active-v1:[a-f0-9]{64}$/.test(receipt.activeLogicalDataHash)||!['documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','batchCount'].every(key=>count(receipt[key]))||receipt.documentCount!==receipt.activeCount+receipt.tombstoneCount||receipt.documentCount!==receipt.auditedCount||receipt.unauditedCount!==0||!digest(receipt.collectionSummariesHash)||!digest(receipt.batchReceiptSummariesHash)||!digest(receipt.scanHash)||timestampNanos(receipt.completedAt)<timestampNanos(receipt.startedAt))throw new Error('post-pause scan receipt 格式無效');
 const core={...receipt};delete core.scanHash;if(sha256Canonical(core)!==receipt.scanHash)throw new Error('post-pause scan receipt canonical hash 不符');return receipt;
}

export function buildRecordSyncV1PostPauseScanReceipt(input){return buildFromInput(input)}

export function buildRecordSyncV1PostPauseScanExecution(input){return buildExecutionFromInput(input)}

export function consumeRecordSyncV1PostPauseScanExecution(execution,expected){
 const rawRootExecution=scanExecutionPayloads.get(execution);if(!rawRootExecution)throw new Error('post-pause scan execution capability 無效、已複製或跨 brand');
 const links=exact(expected,['expectedScanHash','expectedRawDocumentRootHash'],'post-pause scan execution expected');if(!digest(links.expectedScanHash)||!digest(links.expectedRawDocumentRootHash)||execution.scanHash!==links.expectedScanHash||execution.rawDocumentRootHash!==links.expectedRawDocumentRootHash||execution.receipt.scanHash!==links.expectedScanHash||execution.receipt.rawDocumentRootHash!==links.expectedRawDocumentRootHash)throw new Error('post-pause scan execution expected hash 不符');
 const payload=consumeRecordSyncV1RawDocumentExecution(rawRootExecution,{expectedRawDocumentRootHash:links.expectedRawDocumentRootHash});return deepFreeze({receipt:execution.receipt,rootSnapshot:payload.rootSnapshot,normalizedDocumentsByCollection:payload.normalizedDocumentsByCollection});
}

export function stripRecordSyncV1PostPauseScanReceiptAudit(value){return deepFreeze(stripAudit(value,receiptFields,receiptAuditFields,'post-pause scan receipt','persistedBy','persistedByEmail'))}

export function assertRecordSyncV1PostPauseScanAnchors(value){const source=exact(value,anchorInputFields,'post-pause scan anchors');return deepFreeze(assertAnchors(source.hardPauseReceipt,source.hardPausedWriterCurrent,source.pausedSafetyControl))}

export function assertRecordSyncV1PostPauseScanReceiptIntegrity(value){return deepFreeze(assertReceiptCore(value))}

export function assertRecordSyncV1PostPauseScanReceipt(value,expected){const receipt=assertReceiptCore(value),source=exact(expected,expectedFields,'post-pause scan receipt expected'),rebuilt=buildFromInput(source);for(const key of receiptFields)if(receipt[key]!==rebuilt[key])throw new Error('post-pause scan receipt expected source 不符');return deepFreeze(receipt)}
