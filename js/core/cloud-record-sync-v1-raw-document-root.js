import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {
 RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,
 normalizeAndBuildRecordSyncV1RawDocumentLeaf
} from './cloud-record-sync-v1-raw-document-leaf.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA='danbridge-record-sync-v1-raw-document-root-v2';
export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SNAPSHOT_SCHEMA='danbridge-record-sync-v1-raw-document-root-snapshot-v2';
export const RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA='danbridge-record-sync-v1-raw-active-logical-hash-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_COLLECTION_SUMMARY_SCHEMA='danbridge-record-sync-v1-raw-document-collection-summary-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_BATCH_SCHEMA='danbridge-record-sync-v1-raw-document-leaf-summary-batch-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_BATCH_RECEIPT_SCHEMA='danbridge-record-sync-v1-raw-document-batch-receipt-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE='web-sdk-semantic-full-document-root-not-cross-query-freeze-authority';
export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_INTEGRITY_SCOPE='self-hash-only-not-document-authority';
export const RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCHEMA='danbridge-record-sync-v1-raw-document-execution-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE='ephemeral-in-memory-normalized-documents-not-document-or-persistence-authority';
export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT=400;
export const RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES=256*1024;

const ZERO_HASH='0'.repeat(64);
const inputFields=['documentsByCollection'];
const readbackFields=['manifest','collectionSummaries','batchReceipts'];
const expectedFields=['documentsByCollection'];
const auditFields=['persistedAt','persistedBy','persistedByEmail'];
const collectionFields=['schema','environment','companyId','collection','collectionIndex','documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','distinctSourceHashCount','sourceHistoryHash','firstLeafIdentityHash','lastLeafIdentityHash','orderedLeafSetHash','collectionSummaryHash'];
const batchFields=['schema','artifactKind','environment','companyId','index','leafCount','leaves','batchHash'];
const receiptFields=['schema','environment','companyId','index','leafCount','firstLeafIdentityHash','lastLeafIdentityHash','batchHash','canonicalBytes','receiptHash'];
const manifestFields=['schema','artifactKind','environment','companyId','rootScope','auditScope','collectionOrder','collectionCount','documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','distinctSourceHashCount','sourceHistoryHash','activeLogicalHashSchema','activeLogicalDataHash','collectionSummariesHash','batchCount','maxBatchLeafCount','maxBatchCanonicalBytes','batchReceiptSummariesHash','rawDocumentRootHash'];
const encoder=new TextEncoder();
const executionPayloads=new WeakMap();
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const count=value=>Number.isSafeInteger(value)&&value>=0;
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length>0&&value.length<=320&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}return result;
}

function stripAudit(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value),auditCount=auditFields.filter(key=>keys.includes(key)).length;
 if(auditCount!==0&&auditCount!==auditFields.length)throw new Error(label+' audit 欄位必須 all-or-none');
 if(keys.length!==fields.length+auditCount||keys.some(key=>typeof key!=='string'||![...fields,...auditFields].includes(key)))throw new Error(label+' 欄位無效');
 const core={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(auditCount){const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,'persistedBy'),mail=Object.getOwnPropertyDescriptor(value,'persistedByEmail');if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error(label+' audit 格式無效')}
 return core;
}

function exactArray(value,label){
 if(!Array.isArray(value))throw new Error(label+' 必須是 array');
 const keys=Reflect.ownKeys(value);for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)throw new Error(label+' 包含 extra 或 symbol 欄位')}
 const result=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor)throw new Error(label+' 包含 sparse array hole');if(!descriptor.enumerable||!('value' in descriptor))throw new Error(label+'['+index+'] 必須是 enumerable data field');result.push(descriptor.value)}return result;
}

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function compareUtf8(left,right){const a=encoder.encode(left),b=encoder.encode(right),length=Math.min(a.length,b.length);for(let index=0;index<length;index++)if(a[index]!==b[index])return a[index]-b[index];return a.length-b.length}
function stable(value){return Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort(compareUtf8).map(key=>[key,stable(value[key])])):value)}
function canonicalJson(value){return JSON.stringify(stable(value))}
function canonicalBytes(value){return encoder.encode(canonicalJson(value)).length}
function canonicalEqual(left,right){return canonicalJson(left)===canonicalJson(right)}
function identityHash(leaf){return sha256Canonical({collection:leaf.collection,recordId:leaf.recordId,recordIndex:leaf.recordIndex})}

function snapshotDocuments(value){
 const map=exact(value,FULL_RECORD_COLLECTIONS,'V1 raw documentsByCollection'),result={};
 for(const collection of FULL_RECORD_COLLECTIONS)result[collection]=exactArray(map[collection],'V1 raw '+collection+' documents');
 return result;
}

function sourceHistory(rows){
 const groups=new Map();
 for(const row of rows){const current=groups.get(row.leaf.sourceHash)??{sourceHash:row.leaf.sourceHash,documentCount:0,activeCount:0,tombstoneCount:0,auditedCount:0,unauditedCount:0};current.documentCount++;current[row.leaf.deleted?'tombstoneCount':'activeCount']++;current[row.leaf.auditState==='present'?'auditedCount':'unauditedCount']++;groups.set(row.leaf.sourceHash,current)}
 const entries=[...groups.values()].sort((left,right)=>compareUtf8(left.sourceHash,right.sourceHash));
 return{entries,count:entries.length,hash:sha256Canonical(entries)};
}

function addCounts(target,source){for(const key of ['documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount'])target[key]+=source[key]}
function countsFor(rows){const result={documentCount:rows.length,activeCount:0,tombstoneCount:0,auditedCount:0,unauditedCount:0};for(const row of rows){result[row.leaf.deleted?'tombstoneCount':'activeCount']++;result[row.leaf.auditState==='present'?'auditedCount':'unauditedCount']++}return result}

function normalizeCollection(collection,rawRows){
 const rows=[],recordIds=new Set(),activeRecordIndexes=new Set();
 for(const raw of rawRows){
  const {normalizedDocument,leaf}=normalizeAndBuildRecordSyncV1RawDocumentLeaf(raw);
  if(normalizedDocument.collection!==collection||recordIds.has(leaf.recordId))throw new Error('V1 raw '+collection+' document collection 或 recordId 重複');
  recordIds.add(leaf.recordId);
  if(collection==='changes'&&!leaf.deleted){if(activeRecordIndexes.has(leaf.recordIndex))throw new Error('V1 raw active changes recordIndex 重複');activeRecordIndexes.add(leaf.recordIndex)}
  rows.push({normalizedDocument,leaf});
 }
 rows.sort(collection==='changes'?((left,right)=>left.leaf.recordIndex-right.leaf.recordIndex||compareUtf8(left.leaf.recordId,right.leaf.recordId)):((left,right)=>compareUtf8(left.leaf.recordId,right.leaf.recordId)));
 return rows;
}

function collectionSummary(collection,collectionIndex,rows){
 const totals=countsFor(rows),history=sourceHistory(rows),leaves=rows.map(row=>row.leaf),first=leaves[0],last=leaves.at(-1),core={schema:RECORD_SYNC_V1_RAW_DOCUMENT_COLLECTION_SUMMARY_SCHEMA,environment:'staging',companyId:'danbridge',collection,collectionIndex,...totals,distinctSourceHashCount:history.count,sourceHistoryHash:history.hash,firstLeafIdentityHash:first?identityHash(first):ZERO_HASH,lastLeafIdentityHash:last?identityHash(last):ZERO_HASH,orderedLeafSetHash:sha256Canonical(leaves)};
 return{summary:{...core,collectionSummaryHash:sha256Canonical(core)},history};
}

function batchCore(index,leaves){return{schema:RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_BATCH_SCHEMA,artifactKind:'execution-plan-only',environment:'staging',companyId:'danbridge',index,leafCount:leaves.length,leaves}}
function predictedBatchBytes(index,leafCount,leafByteSum){const empty={...batchCore(index,[]),leafCount,batchHash:ZERO_HASH};return canonicalBytes(empty)+leafByteSum+Math.max(0,leafCount-1)}
function sealBatch(index,leaves){const core=batchCore(index,leaves),batch={...core,batchHash:sha256Canonical(core)},bytes=canonicalBytes(batch);if(leaves.length<1||leaves.length>RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT||bytes>=RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES)throw new Error('V1 raw leaf batch 超過固定安全上限');return{batch,bytes}}
function batchReceipt(batch,bytes){const first=batch.leaves[0],last=batch.leaves.at(-1),core={schema:RECORD_SYNC_V1_RAW_DOCUMENT_BATCH_RECEIPT_SCHEMA,environment:'staging',companyId:'danbridge',index:batch.index,leafCount:batch.leafCount,firstLeafIdentityHash:identityHash(first),lastLeafIdentityHash:identityHash(last),batchHash:batch.batchHash,canonicalBytes:bytes};return{...core,receiptHash:sha256Canonical(core)}}

function makeBatches(leaves){
 const batches=[];let pending=[],leafByteSum=0;
 for(const leaf of leaves){
  const leafBytes=canonicalBytes(leaf),nextCount=pending.length+1,nextSum=leafByteSum+leafBytes;
  if(pending.length&&(nextCount>RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT||predictedBatchBytes(batches.length,nextCount,nextSum)>=RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES)){batches.push(sealBatch(batches.length,pending));pending=[];leafByteSum=0}
  pending.push(leaf);leafByteSum+=leafBytes;
  if(predictedBatchBytes(batches.length,pending.length,leafByteSum)>=RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES)throw new Error('V1 raw 單一 leaf summary 超過固定安全上限');
 }
 if(pending.length)batches.push(sealBatch(batches.length,pending));
 return{batches:batches.map(row=>row.batch),batchReceipts:batches.map(row=>batchReceipt(row.batch,row.bytes))};
}

function activeLogicalDataHash(collections){const core={schema:RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA,environment:'staging',companyId:'danbridge',collectionOrder:[...FULL_RECORD_COLLECTIONS],collections};return'raw-active-v1:'+sha256Canonical(core)}

function buildFromDocuments(documentsByCollection,includeExecutionHandoff=false){
 const documents=snapshotDocuments(documentsByCollection),logicalDb={},normalizedDocumentsByCollection=includeExecutionHandoff?{}:null,logicalHashCollections=[],collectionSummaries=[],allRows=[],globalHistoryRows=[],totals={documentCount:0,activeCount:0,tombstoneCount:0,auditedCount:0,unauditedCount:0};
 for(let collectionIndex=0;collectionIndex<FULL_RECORD_COLLECTIONS.length;collectionIndex++){
  const collection=FULL_RECORD_COLLECTIONS[collectionIndex],rows=normalizeCollection(collection,documents[collection]),result=collectionSummary(collection,collectionIndex,rows);collectionSummaries.push(result.summary);allRows.push(...rows);globalHistoryRows.push(...rows);addCounts(totals,result.summary);
  if(includeExecutionHandoff)normalizedDocumentsByCollection[collection]=rows.map(row=>row.normalizedDocument);
  const activeRows=rows.filter(row=>!row.leaf.deleted),logicalRows=collection==='changes'?[...activeRows].reverse():activeRows;logicalDb[collection]=logicalRows.map(row=>row.normalizedDocument.record);logicalHashCollections.push({collection,recordCount:logicalRows.length,recordValueHashes:logicalRows.map(row=>row.leaf.recordValueHash)});
 }
 const history=sourceHistory(globalHistoryRows),{batches,batchReceipts}=makeBatches(allRows.map(row=>row.leaf)),manifestCore={schema:RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA,artifactKind:'durable-proof-manifest-no-record-payload',environment:'staging',companyId:'danbridge',rootScope:RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE,auditScope:RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,collectionOrder:[...FULL_RECORD_COLLECTIONS],collectionCount:FULL_RECORD_COLLECTIONS.length,...totals,distinctSourceHashCount:history.count,sourceHistoryHash:history.hash,activeLogicalHashSchema:RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA,activeLogicalDataHash:activeLogicalDataHash(logicalHashCollections),collectionSummariesHash:sha256Canonical(collectionSummaries),batchCount:batchReceipts.length,maxBatchLeafCount:RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT,maxBatchCanonicalBytes:RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES,batchReceiptSummariesHash:sha256Canonical(batchReceipts)},manifest={...manifestCore,rawDocumentRootHash:sha256Canonical(manifestCore)};
 const rootSnapshot=deepFreeze({schema:RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SNAPSHOT_SCHEMA,artifactKind:'execution-plan-only',environment:'staging',companyId:'danbridge',logicalDb,collectionSummaries,batches,batchReceipts,manifest});
 if(!includeExecutionHandoff)return rootSnapshot;
 const execution=deepFreeze({schema:RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCHEMA,artifactKind:'ephemeral-capability',environment:'staging',companyId:'danbridge',scope:RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE,rawDocumentRootHash:manifest.rawDocumentRootHash,activeLogicalDataHash:manifest.activeLogicalDataHash,documentCount:manifest.documentCount,activeCount:manifest.activeCount,tombstoneCount:manifest.tombstoneCount,auditedCount:manifest.auditedCount,unauditedCount:manifest.unauditedCount});
 executionPayloads.set(execution,deepFreeze({rootSnapshot,normalizedDocumentsByCollection}));return execution;
}

export function buildRecordSyncV1RawDocumentRoot(input){const value=exact(input,inputFields,'V1 raw root input');return buildFromDocuments(value.documentsByCollection)}

export function buildRecordSyncV1RawDocumentExecution(input){const value=exact(input,inputFields,'V1 raw execution input');return buildFromDocuments(value.documentsByCollection,true)}

export function consumeRecordSyncV1RawDocumentExecution(execution,expected){
 const payload=executionPayloads.get(execution);if(!payload)throw new Error('V1 raw execution capability 無效、已複製或跨 brand');
 const links=exact(expected,['expectedRawDocumentRootHash'],'V1 raw execution expected');if(!digest(links.expectedRawDocumentRootHash)||execution.rawDocumentRootHash!==links.expectedRawDocumentRootHash||payload.rootSnapshot.manifest.rawDocumentRootHash!==links.expectedRawDocumentRootHash)throw new Error('V1 raw execution expected root 不符');
 return payload;
}

function assertManifestShape(value){
 const manifest=stripAudit(value,manifestFields,'V1 raw root manifest'),order=exactArray(manifest.collectionOrder,'V1 raw root collectionOrder');
 if(manifest.schema!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA||manifest.artifactKind!=='durable-proof-manifest-no-record-payload'||manifest.environment!=='staging'||manifest.companyId!=='danbridge'||manifest.rootScope!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE||manifest.auditScope!==RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE||!canonicalEqual(order,FULL_RECORD_COLLECTIONS)||manifest.collectionCount!==FULL_RECORD_COLLECTIONS.length||!['documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','distinctSourceHashCount','batchCount'].every(key=>count(manifest[key]))||manifest.documentCount!==manifest.activeCount+manifest.tombstoneCount||manifest.documentCount!==manifest.auditedCount+manifest.unauditedCount||!digest(manifest.sourceHistoryHash)||manifest.activeLogicalHashSchema!==RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA||!/^raw-active-v1:[a-f0-9]{64}$/.test(manifest.activeLogicalDataHash)||!digest(manifest.collectionSummariesHash)||manifest.maxBatchLeafCount!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT||manifest.maxBatchCanonicalBytes!==RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES||!digest(manifest.batchReceiptSummariesHash)||!digest(manifest.rawDocumentRootHash))throw new Error('V1 raw root manifest 格式無效');
 const normalized={...manifest,collectionOrder:order},core={...normalized};delete core.rawDocumentRootHash;if(sha256Canonical(core)!==normalized.rawDocumentRootHash)throw new Error('V1 raw root manifest canonical hash 不符');return normalized;
}

export function assertRecordSyncV1RawDocumentRootIntegrity(value){return deepFreeze(assertManifestShape(value))}

export function assertRecordSyncV1RawDocumentRoot(value,expected){
 const manifest=assertRecordSyncV1RawDocumentRootIntegrity(value),links=exact(expected,expectedFields,'V1 raw root expected'),rebuilt=buildFromDocuments(links.documentsByCollection).manifest;
 if(!canonicalEqual(manifest,rebuilt))throw new Error('V1 raw root expected documents 不符');return manifest;
}

function assertCollectionSummary(value){const summary=stripAudit(value,collectionFields,'V1 raw collection summary');if(summary.schema!==RECORD_SYNC_V1_RAW_DOCUMENT_COLLECTION_SUMMARY_SCHEMA||summary.environment!=='staging'||summary.companyId!=='danbridge'||!FULL_RECORD_COLLECTIONS.includes(summary.collection)||!count(summary.collectionIndex)||!['documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','distinctSourceHashCount'].every(key=>count(summary[key]))||summary.documentCount!==summary.activeCount+summary.tombstoneCount||summary.documentCount!==summary.auditedCount+summary.unauditedCount||![summary.sourceHistoryHash,summary.orderedLeafSetHash,summary.collectionSummaryHash].every(digest)||![summary.firstLeafIdentityHash,summary.lastLeafIdentityHash].every(value=>value===ZERO_HASH||digest(value)))throw new Error('V1 raw collection summary 格式無效');const core={...summary};delete core.collectionSummaryHash;if(sha256Canonical(core)!==summary.collectionSummaryHash)throw new Error('V1 raw collection summary canonical hash 不符');return summary}
function assertReceipt(value){const receipt=stripAudit(value,receiptFields,'V1 raw batch receipt');if(receipt.schema!==RECORD_SYNC_V1_RAW_DOCUMENT_BATCH_RECEIPT_SCHEMA||receipt.environment!=='staging'||receipt.companyId!=='danbridge'||!count(receipt.index)||!count(receipt.leafCount)||receipt.leafCount<1||receipt.leafCount>RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT||![receipt.firstLeafIdentityHash,receipt.lastLeafIdentityHash,receipt.batchHash,receipt.receiptHash].every(digest)||!count(receipt.canonicalBytes)||receipt.canonicalBytes>=RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES)throw new Error('V1 raw batch receipt 格式無效');const core={...receipt};delete core.receiptHash;if(sha256Canonical(core)!==receipt.receiptHash)throw new Error('V1 raw batch receipt canonical hash 不符');return receipt}

export function verifyRecordSyncV1RawDocumentRootReadback(input,readback){
 const expected=buildRecordSyncV1RawDocumentRoot(input),value=exact(readback,readbackFields,'V1 raw root readback'),manifest=assertRecordSyncV1RawDocumentRootIntegrity(value.manifest),collections=exactArray(value.collectionSummaries,'V1 raw readback collection summaries').map(assertCollectionSummary),receipts=exactArray(value.batchReceipts,'V1 raw readback batch receipts').map(assertReceipt),collectionIndexes=new Set(),receiptIndexes=new Set();
 if(!canonicalEqual(manifest,expected.manifest))throw new Error('V1 raw root readback manifest 不符');
 if(collections.length!==FULL_RECORD_COLLECTIONS.length||receipts.length!==expected.batchReceipts.length)throw new Error('V1 raw root readback artifact count 不符');
 for(const row of collections){if(collectionIndexes.has(row.collectionIndex))throw new Error('V1 raw collection summary index 重複');collectionIndexes.add(row.collectionIndex)}collections.sort((left,right)=>left.collectionIndex-right.collectionIndex);for(let index=0;index<collections.length;index++)if(collections[index].collectionIndex!==index||collections[index].collection!==FULL_RECORD_COLLECTIONS[index]||!canonicalEqual(collections[index],expected.collectionSummaries[index]))throw new Error('V1 raw collection summary 缺漏、順序或內容不符');
 for(const row of receipts){if(receiptIndexes.has(row.index))throw new Error('V1 raw batch receipt index 重複');receiptIndexes.add(row.index)}receipts.sort((left,right)=>left.index-right.index);for(let index=0;index<receipts.length;index++)if(receipts[index].index!==index||!canonicalEqual(receipts[index],expected.batchReceipts[index]))throw new Error('V1 raw batch receipt 缺漏、順序或內容不符');
 if(sha256Canonical(collections)!==manifest.collectionSummariesHash||sha256Canonical(receipts)!==manifest.batchReceiptSummariesHash)throw new Error('V1 raw root readback root 不符');
 return deepFreeze({verified:true,rawDocumentRootHash:manifest.rawDocumentRootHash,activeLogicalDataHash:manifest.activeLogicalDataHash,documentCount:manifest.documentCount,batchCount:manifest.batchCount});
}
