import {activeRecordSaveEnvelopeHash} from './cloud-active-record-save-plan.js';
import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {assertRecordSyncV1FrozenSourceProof} from './cloud-record-sync-v1-frozen-source-proof.js';
import {
 assertRecordSyncV1PostPauseScanReceiptIntegrity,
 consumeRecordSyncV1PostPauseScanExecution
} from './cloud-record-sync-v1-post-pause-scan-receipt.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA='danbridge-active-record-v2-genesis-record-v1';
export const RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA='danbridge-active-record-v2-genesis-record-hash-v1';
export const RECORD_SYNC_V2_GENESIS_BATCH_SCHEMA='danbridge-record-sync-v2-genesis-execution-batch-v1';
export const RECORD_SYNC_V2_GENESIS_BATCH_HASH_SCHEMA='danbridge-record-sync-v2-genesis-execution-batch-hash-v1';
export const RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_SCHEMA='danbridge-record-sync-v2-genesis-batch-receipt-plan-v1';
export const RECORD_SYNC_V2_GENESIS_MANIFEST_SCHEMA='danbridge-record-sync-v2-genesis-seed-manifest-v1';
export const RECORD_SYNC_V2_GENESIS_EXECUTION_SCHEMA='danbridge-record-sync-v2-genesis-seed-execution-v1';
export const RECORD_SYNC_V2_GENESIS_EXECUTION_SCOPE='create-only-execution-plan-not-persistence-activation-or-write-takeover-authority';
export const RECORD_SYNC_V2_GENESIS_TRUST_BOUNDARY='strict-frozen-source-proof-and-branded-v-scan-required';
// Firestore Rules evaluates every record in an atomic request. Full authority
// validation is proven through 16 records in Emulator; 8 keeps 50% headroom.
export const RECORD_SYNC_V2_GENESIS_MAX_BATCH_RECORDS=8;
// Keep one KiB below the hard 224KiB ceiling so a future persistence envelope
// cannot accidentally turn this pure core limit into an equality boundary.
export const RECORD_SYNC_V2_GENESIS_MAX_RECORD_CANONICAL_BYTES=223*1024;
export const RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES=6*1024*1024;
export const RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_MARGIN_BYTES=16*1024;

const inputFields=['frozenSourceProof','frozenSourceExpected','vScanExecution'];
const expectedFields=['expectedManifestHash','expectedSeedId','expectedParentFrozenSourceProofHash','expectedTargetV2Epoch'];
const executionPayloads=new WeakMap();
const ZERO_HASH='0'.repeat(64),encoder=new TextEncoder();
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const count=value=>Number.isSafeInteger(value)&&value>=0;

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}return result;
}
function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function compareUtf8(left,right){const a=encoder.encode(left),b=encoder.encode(right),length=Math.min(a.length,b.length);for(let index=0;index<length;index++)if(a[index]!==b[index])return a[index]-b[index];return a.length-b.length}
function stable(value){return Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort(compareUtf8).map(key=>[key,stable(value[key])])):value)}
function canonicalBytes(value){return encoder.encode(JSON.stringify(stable(value))).length}
function identity(collection,recordId){return collection+'\u0000'+recordId}

function safeExecutionIdentity(execution){
 if(!execution||typeof execution!=='object')throw new Error('V2 genesis V scan execution 無效');
 const scan=Object.getOwnPropertyDescriptor(execution,'scanHash'),root=Object.getOwnPropertyDescriptor(execution,'rawDocumentRootHash');
 if(!scan?.enumerable||!('value'in scan)||!root?.enumerable||!('value'in root)||!digest(scan.value)||!digest(root.value))throw new Error('V2 genesis V scan execution identity 無效');
 return{scanHash:scan.value,rawDocumentRootHash:root.value};
}

function assertEquivalentVScan(receipt,proof){
 const scan=assertRecordSyncV1PostPauseScanReceiptIntegrity(receipt);
 if(scan.ordinal!=='V'||scan.activationEpoch!==proof.activationEpoch||scan.targetV2Epoch!==proof.targetV2Epoch||scan.freezeId!==proof.freezeId||scan.hardPauseReceiptHash!==proof.hardPauseReceiptHash||scan.hardPausedWriterControlHash!==proof.hardPausedWriterControlHash||scan.hardPausedWriterRevision!==proof.hardPausedWriterRevision||scan.pausedSafetyControlHash!==proof.pausedSafetyControlHash||scan.pausedSafetyRevision!==proof.pausedSafetyRevision||scan.pausedSafetyLastEventId!==proof.pausedSafetyLastEventId||scan.pausedSafetyLastEventHash!==proof.pausedSafetyLastEventHash||scan.rawDocumentRootHash!==proof.rawDocumentRootHash||scan.activeLogicalHashSchema!==proof.activeLogicalHashSchema||scan.activeLogicalDataHash!==proof.activeLogicalDataHash||scan.documentCount!==proof.frozenDocumentCount||scan.activeCount!==proof.frozenActiveCount||scan.tombstoneCount!==proof.frozenTombstoneCount||scan.auditedCount!==proof.frozenAuditedCount||scan.unauditedCount!==proof.frozenUnauditedCount)throw new Error('V2 genesis V scan 與 frozen source proof 不符');
 return scan;
}

function leafMap(rootSnapshot){
 const result=new Map();for(const batch of rootSnapshot.batches)for(const leaf of batch.leaves){const key=identity(leaf.collection,leaf.recordId);if(result.has(key))throw new Error('V2 genesis source leaf 重複');result.set(key,leaf)}return result;
}

function genesisRecord({document,leaf,proof,seedId}){
 if(document.auditState!=='present'||!document.audit||leaf.auditState!=='present'||document.collection!==leaf.collection||document.recordId!==leaf.recordId||document.recordIndex!==leaf.recordIndex||document.revision!==leaf.revision||document.deleted!==leaf.deleted||document.sourceHash!==leaf.sourceHash)throw new Error('V2 genesis normalized document 與 source leaf 不符');
 const recordHash=activeRecordSaveEnvelopeHash({collection:document.collection,recordId:document.recordId,exists:true,revision:1,deleted:document.deleted,record:document.record});
 const core={schema:RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA,artifactKind:'create-only-genesis-record',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:proof.activationEpoch,targetV2Epoch:proof.targetV2Epoch,seedId,parentFrozenSourceProofHash:proof.proofHash,sourceHardPauseReceiptHash:proof.hardPauseReceiptHash,sourceRawDocumentRootHash:proof.rawDocumentRootHash,collection:document.collection,recordId:document.recordId,recordIndex:document.recordIndex,record:document.record,deleted:document.deleted,revision:1,sourceRevision:document.revision,sourceHash:document.sourceHash,sourceRecordValueHash:leaf.recordValueHash,sourceDocumentCoreHash:leaf.documentCoreHash,sourceAuditState:document.auditState,sourceAudit:document.audit,sourceAuditHash:leaf.auditHash,sourceLeafHash:leaf.leafHash,recordHash},commitment={schema:RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,genesisRecordSchema:core.schema,environment:core.environment,companyId:core.companyId,sourceV1ActivationEpoch:core.sourceV1ActivationEpoch,targetV2Epoch:core.targetV2Epoch,seedId:core.seedId,parentFrozenSourceProofHash:core.parentFrozenSourceProofHash,sourceHardPauseReceiptHash:core.sourceHardPauseReceiptHash,sourceRawDocumentRootHash:core.sourceRawDocumentRootHash,collection:core.collection,recordId:core.recordId,recordIndex:core.recordIndex,deleted:core.deleted,revision:core.revision,sourceRevision:core.sourceRevision,sourceHash:core.sourceHash,sourceRecordValueHash:core.sourceRecordValueHash,sourceDocumentCoreHash:core.sourceDocumentCoreHash,sourceAuditState:core.sourceAuditState,sourceAuditHash:core.sourceAuditHash,sourceLeafHash:core.sourceLeafHash,recordHash:core.recordHash},value=deepFreeze({...core,genesisRecordHash:sha256Canonical(commitment)}),bytes=canonicalBytes(value);if(bytes>=RECORD_SYNC_V2_GENESIS_MAX_RECORD_CANONICAL_BYTES)throw new Error('V2 genesis record 超過固定 224KiB core 上限');return{value,canonicalBytes:bytes};
}

function batchCore(index,records,seedId,targetV2Epoch){return{schema:RECORD_SYNC_V2_GENESIS_BATCH_SCHEMA,artifactKind:'execution-plan-only',environment:'staging',companyId:'danbridge',targetV2Epoch,seedId,index,recordCount:records.length,firstGenesisRecordHash:records[0]?.genesisRecordHash??ZERO_HASH,lastGenesisRecordHash:records.at(-1)?.genesisRecordHash??ZERO_HASH,orderedGenesisRecordHashesHash:sha256Canonical(records.map(row=>row.genesisRecordHash)),records}}
function predictedBatchBytes(index,recordsBytes,recordCount,seedId,targetV2Epoch,firstHash,lastHash){const shell={...batchCore(index,[],seedId,targetV2Epoch),recordCount,firstGenesisRecordHash:firstHash,lastGenesisRecordHash:lastHash,batchHash:ZERO_HASH};return canonicalBytes(shell)+recordsBytes+Math.max(0,recordCount-1)}
function sealBatch(index,rows,seedId,targetV2Epoch,recordsBytes){const records=rows.map(row=>row.value),core=batchCore(index,records,seedId,targetV2Epoch),commitment={schema:RECORD_SYNC_V2_GENESIS_BATCH_HASH_SCHEMA,batchSchema:core.schema,environment:core.environment,companyId:core.companyId,targetV2Epoch:core.targetV2Epoch,seedId:core.seedId,index:core.index,recordCount:core.recordCount,firstGenesisRecordHash:core.firstGenesisRecordHash,lastGenesisRecordHash:core.lastGenesisRecordHash,orderedGenesisRecordHashesHash:core.orderedGenesisRecordHashesHash},batch=deepFreeze({...core,batchHash:sha256Canonical(commitment)}),bytes=predictedBatchBytes(index,recordsBytes,records.length,seedId,targetV2Epoch,core.firstGenesisRecordHash,core.lastGenesisRecordHash);if(records.length<1||records.length>RECORD_SYNC_V2_GENESIS_MAX_BATCH_RECORDS||bytes>=RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES-RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_MARGIN_BYTES)throw new Error('V2 genesis batch 超過固定 write 或 canonical 上限');return{batch,bytes}}
function receipt(batch,bytes){const core={schema:RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_SCHEMA,state:'planned',scope:RECORD_SYNC_V2_GENESIS_EXECUTION_SCOPE,environment:'staging',companyId:'danbridge',targetV2Epoch:batch.targetV2Epoch,seedId:batch.seedId,index:batch.index,recordCount:batch.recordCount,firstGenesisRecordHash:batch.firstGenesisRecordHash,lastGenesisRecordHash:batch.lastGenesisRecordHash,orderedGenesisRecordHashesHash:batch.orderedGenesisRecordHashesHash,batchHash:batch.batchHash,canonicalBytes:bytes};return deepFreeze({...core,receiptHash:sha256Canonical(core)})}

function pack(rows,seedId,targetV2Epoch){
 const sealed=[];let pending=[],pendingBytes=0;
 for(const row of rows){const nextCount=pending.length+1,nextBytes=pendingBytes+row.canonicalBytes,first=pending[0]?.value.genesisRecordHash??row.value.genesisRecordHash;
  if(pending.length&&(nextCount>RECORD_SYNC_V2_GENESIS_MAX_BATCH_RECORDS||predictedBatchBytes(sealed.length,nextBytes,nextCount,seedId,targetV2Epoch,first,row.value.genesisRecordHash)>=RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES-RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_MARGIN_BYTES)){sealed.push(sealBatch(sealed.length,pending,seedId,targetV2Epoch,pendingBytes));pending=[];pendingBytes=0}
  pending.push(row);pendingBytes+=row.canonicalBytes;if(predictedBatchBytes(sealed.length,pendingBytes,pending.length,seedId,targetV2Epoch,pending[0].value.genesisRecordHash,row.value.genesisRecordHash)>=RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES-RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_MARGIN_BYTES)throw new Error('V2 genesis 單筆 record 無法放入安全 batch');
 }
 if(pending.length)sealed.push(sealBatch(sealed.length,pending,seedId,targetV2Epoch,pendingBytes));const batchReceipts=sealed.map(row=>receipt(row.batch,row.bytes));for(let index=0;index<sealed.length;index++)if(sealed[index].bytes+canonicalBytes(batchReceipts[index])>=RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES)throw new Error('V2 genesis records + receipt aggregate 超過固定 canonical 上限');return{batches:sealed.map(row=>row.batch),batchReceipts};
}

export function buildRecordSyncV2GenesisSeedExecution(input){
 const value=exact(input,inputFields,'V2 genesis seed input'),proof=assertRecordSyncV1FrozenSourceProof(value.frozenSourceProof,value.frozenSourceExpected);
 if(proof.activationEpoch===proof.targetV2Epoch)throw new Error('V2 genesis target epoch 必須與 V1 activation epoch 不同');
 const cap=safeExecutionIdentity(value.vScanExecution),source=consumeRecordSyncV1PostPauseScanExecution(value.vScanExecution,{expectedScanHash:cap.scanHash,expectedRawDocumentRootHash:cap.rawDocumentRootHash}),scan=assertEquivalentVScan(source.receipt,proof),manifest=source.rootSnapshot.manifest;
 if(manifest.rawDocumentRootHash!==proof.rawDocumentRootHash||manifest.activeLogicalDataHash!==proof.activeLogicalDataHash||manifest.documentCount!==proof.frozenDocumentCount||manifest.activeCount!==proof.frozenActiveCount||manifest.tombstoneCount!==proof.frozenTombstoneCount||manifest.auditedCount!==proof.frozenAuditedCount||manifest.unauditedCount!==0)throw new Error('V2 genesis raw root 與 frozen source proof 不符');
 const identityCore={schema:'danbridge-record-sync-v2-genesis-seed-identity-v1',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:proof.activationEpoch,sourceFreezeId:proof.freezeId,targetV2Epoch:proof.targetV2Epoch,parentFrozenSourceProofHash:proof.proofHash,sourceHardPauseReceiptHash:proof.hardPauseReceiptHash,sourceRawDocumentRootHash:proof.rawDocumentRootHash,activeLogicalHashSchema:proof.activeLogicalHashSchema,activeLogicalDataHash:proof.activeLogicalDataHash,documentCount:proof.frozenDocumentCount,activeCount:proof.frozenActiveCount,tombstoneCount:proof.frozenTombstoneCount},seedIdentityHash=sha256Canonical(identityCore),seedId='v2-genesis:'+seedIdentityHash,leaves=leafMap(source.rootSnapshot),recordRows=[],recordsByCollection={};
 for(const collection of FULL_RECORD_COLLECTIONS){recordsByCollection[collection]=[];for(const document of source.normalizedDocumentsByCollection[collection]){const leaf=leaves.get(identity(collection,document.recordId));if(!leaf)throw new Error('V2 genesis 缺 source leaf');const row=genesisRecord({document,leaf,proof,seedId});recordRows.push(row);recordsByCollection[collection].push(row.value)}}
 const records=recordRows.map(row=>row.value);if(records.length!==proof.frozenDocumentCount||leaves.size!==records.length)throw new Error('V2 genesis source document count 不符');
 const {batches,batchReceipts}=pack(recordRows,seedId,proof.targetV2Epoch),manifestCore={schema:RECORD_SYNC_V2_GENESIS_MANIFEST_SCHEMA,state:'execution-plan',scope:RECORD_SYNC_V2_GENESIS_EXECUTION_SCOPE,trustBoundary:RECORD_SYNC_V2_GENESIS_TRUST_BOUNDARY,environment:'staging',companyId:'danbridge',seedId,seedIdentityHash,sourceV1ActivationEpoch:proof.activationEpoch,sourceFreezeId:proof.freezeId,targetV2Epoch:proof.targetV2Epoch,parentFrozenSourceProofHash:proof.proofHash,sourceHardPauseReceiptHash:proof.hardPauseReceiptHash,sourceRawDocumentRootHash:proof.rawDocumentRootHash,activeLogicalHashSchema:proof.activeLogicalHashSchema,activeLogicalDataHash:proof.activeLogicalDataHash,documentCount:proof.frozenDocumentCount,activeCount:proof.frozenActiveCount,tombstoneCount:proof.frozenTombstoneCount,auditedCount:proof.frozenAuditedCount,unauditedCount:proof.frozenUnauditedCount,collectionCount:FULL_RECORD_COLLECTIONS.length,genesisRecordSchema:RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA,genesisRecordHashSchema:RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,targetRevision:1,maxBatchRecords:RECORD_SYNC_V2_GENESIS_MAX_BATCH_RECORDS,maxRecordCanonicalBytes:RECORD_SYNC_V2_GENESIS_MAX_RECORD_CANONICAL_BYTES,maxBatchCanonicalBytes:RECORD_SYNC_V2_GENESIS_MAX_BATCH_CANONICAL_BYTES,batchReceiptMarginBytes:RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_MARGIN_BYTES,batchCount:batchReceipts.length,orderedGenesisRecordSetHash:sha256Canonical(records.map(row=>row.genesisRecordHash)),batchReceiptSummariesHash:sha256Canonical(batchReceipts)},seedManifest=deepFreeze({...manifestCore,manifestHash:sha256Canonical(manifestCore)}),execution=deepFreeze({schema:RECORD_SYNC_V2_GENESIS_EXECUTION_SCHEMA,artifactKind:'ephemeral-capability',state:'planned',scope:RECORD_SYNC_V2_GENESIS_EXECUTION_SCOPE,environment:'staging',companyId:'danbridge',seedId,sourceFreezeId:proof.freezeId,targetV2Epoch:proof.targetV2Epoch,parentFrozenSourceProofHash:proof.proofHash,manifestHash:seedManifest.manifestHash,recordCount:records.length,batchCount:batches.length,manifest:seedManifest,batchReceipts});
 executionPayloads.set(execution,deepFreeze({recordsByCollection,batches}));return execution;
}

export function consumeRecordSyncV2GenesisSeedExecution(execution,expected){
 const payload=executionPayloads.get(execution);if(!payload)throw new Error('V2 genesis execution capability 無效、已複製或跨 brand');const links=exact(expected,expectedFields,'V2 genesis execution expected');if(!digest(links.expectedManifestHash)||!digest(links.expectedParentFrozenSourceProofHash)||typeof links.expectedSeedId!=='string'||typeof links.expectedTargetV2Epoch!=='string'||typeof execution.sourceFreezeId!=='string'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(execution.sourceFreezeId)||execution.sourceFreezeId!==execution.manifest.sourceFreezeId||execution.manifestHash!==links.expectedManifestHash||execution.seedId!==links.expectedSeedId||execution.parentFrozenSourceProofHash!==links.expectedParentFrozenSourceProofHash||execution.targetV2Epoch!==links.expectedTargetV2Epoch)throw new Error('V2 genesis execution expected identity 不符');return payload;
}
