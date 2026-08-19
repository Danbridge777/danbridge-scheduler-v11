import {buildChangeRecordId,changeRecordCanonicalFingerprint,isSafeCloudRecordId} from './cloud-change-record-identity.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const CHANGE_AUDIT_RESERVATION_SNAPSHOT_SCHEMA='danbridge-change-audit-reservation-execution-plan-v1';
export const CHANGE_AUDIT_RESERVATION_CORE_SCHEMA='danbridge-change-audit-reservation-core-v1';
export const CHANGE_AUDIT_RESERVATION_MANIFEST_SCHEMA='danbridge-change-audit-reservation-manifest-v1';
export const CHANGE_AUDIT_CURSOR_GENESIS_SCHEMA='danbridge-change-audit-cursor-genesis-v1';
export const CHANGE_AUDIT_RESERVATION_BATCH_SCHEMA='danbridge-change-audit-reservation-execution-batch-v1';
export const CHANGE_AUDIT_RESERVATION_BATCH_RECEIPT_SCHEMA='danbridge-change-audit-reservation-batch-receipt-v1';
export const CHANGE_AUDIT_RESERVATION_MAX_CANONICAL_BYTES=256*1024;

const ZERO_HASH='0'.repeat(64);
const inputFields=['environment','companyId','activationEpoch','sourceRecordDataHash','parentActivationCoreManifestHash','changes','batchSize'];
const readbackFields=['reservations','cursor','manifest','batchReceipts'];
const reservationFields=['schema','environment','companyId','activationEpoch','origin','auditId','occurrenceCount','firstIndex','lastIndex','occurrencesHash','sourceRecordDataHash','parentActivationCoreManifestHash'];
const cursorFields=['schema','environment','companyId','activationEpoch','state','nextIndex','tailRecordIndex','tailRecordId','tailRecordHash','sourceRecordDataHash','parentActivationCoreManifestHash'];
const manifestFields=['schema','environment','companyId','activationEpoch','sourceRecordDataHash','parentActivationCoreManifestHash','changesDocumentCount','validAuditIdOccurrenceCount','distinctReservedAuditIdCount','duplicateOccurrenceCount','legacyUnreservableCount','reservationSetHash','unreservableRecordSetHash','cursorHash','batchCount','batchSize','batchReceiptSummariesHash','reservationManifestHash'];
const receiptFields=['schema','environment','companyId','activationEpoch','sourceRecordDataHash','parentActivationCoreManifestHash','index','reservationCount','firstAuditId','lastAuditId','batchHash','canonicalBytes','receiptHash'];
const rawCompare=(left,right)=>left<right?-1:(left>right?1:0);
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const sourceHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const canonicalBytes=value=>new TextEncoder().encode(JSON.stringify(stable(value))).length;

function deepFreeze(value,seen=new Set()){
 if(value===null||typeof value!=='object'||seen.has(value))return value;seen.add(value);
 for(const child of Object.values(value))deepFreeze(child,seen);
 return Object.freeze(value);
}

function exactInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('audit reservation snapshot input 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==inputFields.length||keys.some(key=>typeof key!=='string'||!inputFields.includes(key)))throw new Error('audit reservation snapshot input 欄位無效');
 const result={};for(const key of inputFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`audit reservation snapshot input.${key} 必須是 enumerable data field`);result[key]=descriptor.value}return result;
}

function exactObject(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(`${label} 必須是 plain object`);
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(`${label} 欄位無效`);
 const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${label}.${key} 必須是 enumerable data field`);result[key]=descriptor.value}return result;
}

function exactArray(value,label){
 if(!Array.isArray(value))throw new Error(`${label} 必須是 array`);const keys=Reflect.ownKeys(value);for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)throw new Error(`${label} 包含 extra 欄位`)}const result=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor)throw new Error(`${label}[${index}] 是 sparse array hole`);if(!descriptor.enumerable||!('value'in descriptor))throw new Error(`${label}[${index}] 必須是 enumerable data field`);result.push(descriptor.value)}return result;
}
const sameFlat=(left,right,fields)=>fields.every(key=>left[key]===right[key]);

function snapshotChanges(value){
 if(!Array.isArray(value))throw new Error('changes 必須是 array');
 const keys=Reflect.ownKeys(value);for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)throw new Error('changes array 包含 extra 欄位')}
 const result=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor)throw new Error(`changes[${index}] 是 sparse array hole`);if(!descriptor.enumerable||!('value'in descriptor))throw new Error(`changes[${index}] 必須是 enumerable data field`);result.push(JSON.parse(changeRecordCanonicalFingerprint(descriptor.value)))}return result;
}

function occurrence(recordIndex,record){const recordId=buildChangeRecordId(recordIndex,record),recordHash=sha256Canonical(record);return{recordIndex,recordId,recordHash}}

function batchCore(value,index,reservations){return{schema:CHANGE_AUDIT_RESERVATION_BATCH_SCHEMA,artifactKind:'execution-plan-only',environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,index,reservationCount:reservations.length,reservations}}
function sealBatch(value,index,reservations){const core=batchCore(value,index,reservations),batch={...core,batchHash:sha256Canonical(core)};if(canonicalBytes(batch)>=CHANGE_AUDIT_RESERVATION_MAX_CANONICAL_BYTES)throw new Error('audit reservation batch canonical bytes 超過安全上限');return batch}
function emptyBatchBytes(value,index){return canonicalBytes({...batchCore(value,index,[]),batchHash:ZERO_HASH})}
function receiptFor(value,batch){const core={schema:CHANGE_AUDIT_RESERVATION_BATCH_RECEIPT_SCHEMA,environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,sourceRecordDataHash:value.sourceRecordDataHash,parentActivationCoreManifestHash:value.parentActivationCoreManifestHash,index:batch.index,reservationCount:batch.reservationCount,firstAuditId:batch.reservations[0]?.auditId??'',lastAuditId:batch.reservations.at(-1)?.auditId??'',batchHash:batch.batchHash,canonicalBytes:canonicalBytes(batch)};return{...core,receiptHash:sha256Canonical(core)}}

export function buildChangeAuditReservationSnapshot(input){
 const value=exactInput(input);
 if(value.environment!=='staging'||value.companyId!=='danbridge'||!token(value.activationEpoch)||!sourceHash(value.sourceRecordDataHash)||!hash(value.parentActivationCoreManifestHash)||!Number.isSafeInteger(value.batchSize)||value.batchSize<1||value.batchSize>400)throw new Error('audit reservation snapshot identity、hash 或 batchSize 無效');
 const newestFirst=snapshotChanges(value.changes),oldestFirst=[...newestFirst].reverse(),groups=new Map(),unreservable=[];let validAuditIdOccurrenceCount=0;
 for(let recordIndex=0;recordIndex<oldestFirst.length;recordIndex++){
  const record=oldestFirst[recordIndex],row=occurrence(recordIndex,record),auditIdPresent=Object.prototype.hasOwnProperty.call(record,'id'),auditId=auditIdPresent?record.id:null;
  if(typeof auditId==='string'&&isSafeCloudRecordId(auditId)){
   validAuditIdOccurrenceCount++;const rows=groups.get(auditId)??[];rows.push(row);groups.set(auditId,rows);
  }else unreservable.push({...row,reason:auditIdPresent?'invalid-audit-id':'missing-audit-id',auditIdValueHash:sha256Canonical({present:auditIdPresent,value:auditId})});
 }
 const reservations=[...groups.entries()].sort(([left],[right])=>rawCompare(left,right)).map(([auditId,occurrences])=>{const reservation={schema:CHANGE_AUDIT_RESERVATION_CORE_SCHEMA,environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,origin:'activation-backfill',auditId,occurrenceCount:occurrences.length,firstIndex:occurrences[0].recordIndex,lastIndex:occurrences.at(-1).recordIndex,occurrencesHash:sha256Canonical(occurrences),sourceRecordDataHash:value.sourceRecordDataHash,parentActivationCoreManifestHash:value.parentActivationCoreManifestHash};if(canonicalBytes(reservation)>=64*1024)throw new Error('audit reservation canonical bytes 超過安全上限');return reservation});
 // parentActivationCoreManifestHash is already sealed. reservationManifestHash
 // points forward from that parent and must be bound by a future final control
 // seal; it never claims that the parent already contained this child hash.
 // Durable occurrence proof remains the same-epoch immutable changes documents
 // plus the sealed backup/sourceRecordDataHash. `unreservable` and full
 // occurrence summaries are in-memory execution-plan details only; never write
 // this snapshot or a batch as one Firestore document.
 const tail=oldestFirst.length?occurrence(oldestFirst.length-1,oldestFirst.at(-1)):null,cursor={schema:CHANGE_AUDIT_CURSOR_GENESIS_SCHEMA,environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,state:tail?'ready':'empty',nextIndex:oldestFirst.length,tailRecordIndex:tail?.recordIndex??null,tailRecordId:tail?.recordId??null,tailRecordHash:tail?.recordHash??ZERO_HASH,sourceRecordDataHash:value.sourceRecordDataHash,parentActivationCoreManifestHash:value.parentActivationCoreManifestHash},cursorHash=sha256Canonical(cursor),reservationSetHash=sha256Canonical(reservations),unreservableRecordSetHash=sha256Canonical(unreservable);
 const batches=[];let pending=[],pendingBytes=0;for(const reservation of reservations){const reservationBytes=canonicalBytes(reservation),separatorBytes=pending.length?1:0,candidateBytes=emptyBatchBytes(value,batches.length)+pendingBytes+separatorBytes+reservationBytes;if(pending.length&&(pending.length>=value.batchSize||candidateBytes>=CHANGE_AUDIT_RESERVATION_MAX_CANONICAL_BYTES)){batches.push(sealBatch(value,batches.length,pending));pending=[];pendingBytes=0}pendingBytes+=pending.length?1+reservationBytes:reservationBytes;pending.push(reservation)}if(pending.length)batches.push(sealBatch(value,batches.length,pending));
 const batchReceipts=batches.map(batch=>receiptFor(value,batch)),batchReceiptSummariesHash=sha256Canonical(batchReceipts),manifestCore={schema:CHANGE_AUDIT_RESERVATION_MANIFEST_SCHEMA,environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,sourceRecordDataHash:value.sourceRecordDataHash,parentActivationCoreManifestHash:value.parentActivationCoreManifestHash,changesDocumentCount:oldestFirst.length,validAuditIdOccurrenceCount,distinctReservedAuditIdCount:reservations.length,duplicateOccurrenceCount:validAuditIdOccurrenceCount-reservations.length,legacyUnreservableCount:unreservable.length,reservationSetHash,unreservableRecordSetHash,cursorHash,batchCount:batches.length,batchSize:value.batchSize,batchReceiptSummariesHash},manifest={...manifestCore,reservationManifestHash:sha256Canonical(manifestCore)};
 return deepFreeze({schema:CHANGE_AUDIT_RESERVATION_SNAPSHOT_SCHEMA,artifactKind:'execution-plan-only',environment:value.environment,companyId:value.companyId,activationEpoch:value.activationEpoch,sourceRecordDataHash:value.sourceRecordDataHash,parentActivationCoreManifestHash:value.parentActivationCoreManifestHash,reservations,unreservable,cursor,manifest,batches,batchReceipts});
}

export function verifyChangeAuditReservationSnapshotReadback(input,readback){
 const expected=buildChangeAuditReservationSnapshot(input),value=exactObject(readback,readbackFields,'audit reservation readback'),persistedReservations=exactArray(value.reservations,'persisted reservations').map((row,index)=>exactObject(row,reservationFields,`persisted reservation[${index}]`)),persistedReceipts=exactArray(value.batchReceipts,'persisted batch receipts').map((row,index)=>exactObject(row,receiptFields,`persisted batch receipt[${index}]`));
 if(persistedReservations.length!==expected.reservations.length)throw new Error('persisted reservations count 不符');const expectedReservationById=new Map(expected.reservations.map(row=>[row.auditId,row])),reservationIds=new Set();for(const row of persistedReservations){if(typeof row.auditId!=='string'||!isSafeCloudRecordId(row.auditId))throw new Error('persisted reservation auditId 無效');if(reservationIds.has(row.auditId))throw new Error('persisted reservations duplicate auditId');reservationIds.add(row.auditId);const expectedRow=expectedReservationById.get(row.auditId);if(!expectedRow||!sameFlat(row,expectedRow,reservationFields))throw new Error('persisted reservation core 不符')}persistedReservations.sort((left,right)=>rawCompare(left.auditId,right.auditId));if(sha256Canonical(persistedReservations)!==expected.manifest.reservationSetHash)throw new Error('persisted reservations root 不符');
 const cursor=exactObject(value.cursor,cursorFields,'persisted cursor'),manifest=exactObject(value.manifest,manifestFields,'persisted manifest');if(!sameFlat(cursor,expected.cursor,cursorFields)||sha256Canonical(cursor)!==expected.manifest.cursorHash||sha256Canonical(cursor)!==manifest.cursorHash)throw new Error('persisted cursor proof 不符');
 if(persistedReceipts.length!==expected.batchReceipts.length)throw new Error('persisted batch receipts count 不符');const receiptIndexes=new Set();for(const receipt of persistedReceipts){if(!Number.isSafeInteger(receipt.index)||receipt.index<0)throw new Error('persisted batch receipt index 無效');if(receiptIndexes.has(receipt.index))throw new Error('persisted batch receipts duplicate index');receiptIndexes.add(receipt.index)}persistedReceipts.sort((left,right)=>left.index-right.index);persistedReceipts.forEach((receipt,index)=>{if(receipt.index!==index)throw new Error('persisted batch receipts index 不連續');if(!sameFlat(receipt,expected.batchReceipts[index],receiptFields))throw new Error('persisted batch receipt core 不符');const core={...receipt};delete core.receiptHash;if(sha256Canonical(core)!==receipt.receiptHash)throw new Error('persisted batch receipt hash 不符')});if(sha256Canonical(persistedReceipts)!==expected.manifest.batchReceiptSummariesHash||sha256Canonical(persistedReceipts)!==manifest.batchReceiptSummariesHash)throw new Error('persisted batch receipts root 不符');
 if(!sameFlat(manifest,expected.manifest,manifestFields))throw new Error('persisted reservation manifest 不符');const manifestCore={...manifest};delete manifestCore.reservationManifestHash;if(sha256Canonical(manifestCore)!==manifest.reservationManifestHash)throw new Error('persisted reservation manifest hash 不符');
 return deepFreeze({verified:true,reservationCount:persistedReservations.length,batchReceiptCount:persistedReceipts.length,reservationManifestHash:manifest.reservationManifestHash,cursorHash:manifest.cursorHash,reservationSetHash:manifest.reservationSetHash});
}
