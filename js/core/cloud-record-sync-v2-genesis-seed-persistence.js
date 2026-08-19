import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {consumeRecordSyncV2GenesisSeedExecution} from './cloud-record-sync-v2-genesis-seed.js';

export const RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_RECEIPT_SCHEMA='danbridge-record-sync-v2-genesis-batch-persistence-receipt-v1';
export const RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_PLAN_SCHEMA='danbridge-record-sync-v2-genesis-batch-persistence-plan-v1';
export const RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_SCOPE='persisted-observation-not-readback-activation-or-write-takeover-authority';
export const RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_PLAN_SCOPE='ephemeral-create-or-replay-plan-not-persistence-readback-or-activation-authority';
export const RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_AUDIT_POLICY='adapter-normalized-rfc3339-nanosecond-string-from-server-timestamp';
export const RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_POLICY='independent-batches-final-manifest-required';

const inputFields=['genesisExecution','expectedExecutionIdentity','batchIndex','existingRecords','existingBatchReceipt'];
const executionExpectedFields=['expectedManifestHash','expectedSeedId','expectedParentFrozenSourceProofHash','expectedTargetV2Epoch'];
const consumeExpectedFields=[...executionExpectedFields,'expectedBatchIndex','expectedPlanHash'];
const receiptFields=['schema','state','scope','completionPolicy','environment','companyId','targetV2Epoch','seedId','parentFrozenSourceProofHash','seedManifestHash','batchIndex','recordCount','firstGenesisRecordHash','lastGenesisRecordHash','orderedGenesisRecordHashesHash','executionBatchHash','planReceiptHash','canonicalBytes','receiptHash'];
const auditFields=['persistedAt','persistedBy','persistedByEmail'];
const payloads=new WeakMap();
const ZERO_HASH='0'.repeat(64);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const count=value=>Number.isSafeInteger(value)&&value>=0;
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length>0&&value.length<=320&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}return result;
}
function denseArray(value,label){if(!Array.isArray(value))throw new Error(label+' 必須是 array');const keys=Reflect.ownKeys(value);for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)throw new Error(label+' 含 extra/symbol 欄位')}const result=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+' 含 sparse/accessor 欄位');result.push(descriptor.value)}return result}
function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function assertDeepExact(actual,expected,label){
 if(expected===null||typeof expected!=='object'){if(!Object.is(actual,expected))throw new Error(label+' mismatch blocked');return}
 if(Array.isArray(expected)){
  if(!Array.isArray(actual)||actual.length!==expected.length)throw new Error(label+' mismatch blocked');const keys=Reflect.ownKeys(actual);if(keys.length!==expected.length+1||keys.some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=actual.length)))throw new Error(label+' array extra/sparse blocked');for(let index=0;index<expected.length;index++){const descriptor=Object.getOwnPropertyDescriptor(actual,String(index));if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+' accessor blocked');assertDeepExact(descriptor.value,expected[index],label+'['+index+']')}return;
 }
 if(!actual||typeof actual!=='object'||Array.isArray(actual)||(Object.getPrototypeOf(actual)!==Object.prototype&&Object.getPrototypeOf(actual)!==null))throw new Error(label+' custom prototype blocked');const fields=Object.keys(expected),keys=Reflect.ownKeys(actual);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' extra/mismatch blocked');for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(actual,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+' accessor blocked');assertDeepExact(descriptor.value,expected[key],label+'.'+key)}
}
function sameAudit(left,right){return left.persistedAt===right.persistedAt&&left.persistedBy===right.persistedBy&&left.persistedByEmail===right.persistedByEmail}

function stripRequiredAudit(value,coreFields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==coreFields.length+auditFields.length||keys.some(key=>typeof key!=='string'||![...coreFields,...auditFields].includes(key)))throw new Error(label+' 必須是 exact core + full server audit');
 const core={};for(const key of coreFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+'.'+key+' 必須是 data field');core[key]=descriptor.value}
 const audit={};for(const key of auditFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(label+'.'+key+' 必須是 data field');audit[key]=descriptor.value}
 if(!isStrictActiveRecordSaveTimestamp(audit.persistedAt)||!actor(audit.persistedBy)||!email(audit.persistedByEmail))throw new Error(label+' server audit 無效');return{core,audit};
}

function durableReceipt(execution,batch,planReceipt){
 const core={schema:RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_RECEIPT_SCHEMA,state:'persisted-observation',scope:RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_SCOPE,completionPolicy:RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_POLICY,environment:'staging',companyId:'danbridge',targetV2Epoch:execution.targetV2Epoch,seedId:execution.seedId,parentFrozenSourceProofHash:execution.parentFrozenSourceProofHash,seedManifestHash:execution.manifestHash,batchIndex:batch.index,recordCount:batch.recordCount,firstGenesisRecordHash:batch.firstGenesisRecordHash,lastGenesisRecordHash:batch.lastGenesisRecordHash,orderedGenesisRecordHashesHash:batch.orderedGenesisRecordHashesHash,executionBatchHash:batch.batchHash,planReceiptHash:planReceipt.receiptHash,canonicalBytes:planReceipt.canonicalBytes};return deepFreeze({...core,receiptHash:sha256Canonical(core)});
}
function assertReceiptShape(value){const receipt=exact(value,receiptFields,'V2 genesis durable batch receipt'),core={...receipt};delete core.receiptHash;if(receipt.schema!==RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_RECEIPT_SCHEMA||receipt.state!=='persisted-observation'||receipt.scope!==RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_SCOPE||receipt.completionPolicy!==RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_POLICY||receipt.environment!=='staging'||receipt.companyId!=='danbridge'||!['batchIndex','recordCount','canonicalBytes'].every(key=>count(receipt[key]))||![receipt.parentFrozenSourceProofHash,receipt.seedManifestHash,receipt.firstGenesisRecordHash,receipt.lastGenesisRecordHash,receipt.orderedGenesisRecordHashesHash,receipt.executionBatchHash,receipt.planReceiptHash,receipt.receiptHash].every(digest)||sha256Canonical(core)!==receipt.receiptHash)throw new Error('V2 genesis durable batch receipt 格式或hash無效');return receipt}

export function buildRecordSyncV2GenesisSeedBatchPersistencePlan(input){
 const value=exact(input,inputFields,'V2 genesis batch persistence input'),expected=exact(value.expectedExecutionIdentity,executionExpectedFields,'V2 genesis batch persistence execution expected');if(!count(value.batchIndex))throw new Error('V2 genesis batchIndex 無效');
 const executionPayload=consumeRecordSyncV2GenesisSeedExecution(value.genesisExecution,expected),batch=executionPayload.batches[value.batchIndex],planReceipt=value.genesisExecution.batchReceipts[value.batchIndex];if(!batch||!planReceipt||batch.index!==value.batchIndex||planReceipt.index!==value.batchIndex)throw new Error('V2 genesis batch 不存在（empty seed由manifest slice處理）');
 const existing=denseArray(value.existingRecords,'V2 genesis existingRecords');if(existing.length!==batch.recordCount)throw new Error('V2 genesis existingRecords 必須逐格對應expected batch');
 const missingCount=existing.filter(row=>row===null).length,presentCount=existing.length-missingCount,receiptMissing=value.existingBatchReceipt===null;if(!((missingCount===existing.length&&receiptMissing)||(presentCount===existing.length&&!receiptMissing)))throw new Error('V2 genesis batch partial/mixed state blocked');
 const expectedReceipt=durableReceipt(value.genesisExecution,batch,planReceipt);let mode,writeCount;
 if(missingCount===existing.length){mode='create-required';writeCount=batch.recordCount+1}
 else{
  let transactionAudit=null;for(let index=0;index<existing.length;index++){const expectedRecord=batch.records[index],verified=stripRequiredAudit(existing[index],Object.keys(expectedRecord),'V2 genesis existing record '+index);assertDeepExact(verified.core,expectedRecord,'V2 genesis existing record');if(transactionAudit&&!sameAudit(transactionAudit,verified.audit))throw new Error('V2 genesis existing batch audit mismatch blocked');transactionAudit=verified.audit}
  const receiptRead=stripRequiredAudit(value.existingBatchReceipt,receiptFields,'V2 genesis existing batch receipt');assertDeepExact(receiptRead.core,expectedReceipt,'V2 genesis existing batch receipt');const persisted=assertReceiptShape(receiptRead.core);if(!sameAudit(transactionAudit,receiptRead.audit))throw new Error('V2 genesis existing batch audit mismatch blocked');mode='duplicate-confirmed';writeCount=0;
 }
 const body={schema:RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_PLAN_SCHEMA,artifactKind:'ephemeral-capability',state:mode,scope:RECORD_SYNC_V2_GENESIS_BATCH_PERSISTENCE_PLAN_SCOPE,completionPolicy:RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_POLICY,environment:'staging',companyId:'danbridge',targetV2Epoch:value.genesisExecution.targetV2Epoch,seedId:value.genesisExecution.seedId,parentFrozenSourceProofHash:value.genesisExecution.parentFrozenSourceProofHash,seedManifestHash:value.genesisExecution.manifestHash,batchIndex:value.batchIndex,recordCount:batch.recordCount,writeCount,durableBatchReceiptHash:expectedReceipt.receiptHash,executionBatchHash:batch.batchHash,planReceiptHash:planReceipt.receiptHash},plan=deepFreeze({...body,planHash:sha256Canonical(body)});payloads.set(plan,deepFreeze({records:mode==='create-required'?batch.records:[],durableBatchReceipt:mode==='create-required'?expectedReceipt:null}));return plan;
}

export function consumeRecordSyncV2GenesisSeedBatchPersistencePlan(plan,expected){
 const payload=payloads.get(plan);if(!payload)throw new Error('V2 genesis persistence plan capability 無效、已複製或跨 brand');const links=exact(expected,consumeExpectedFields,'V2 genesis persistence plan expected');if(!digest(links.expectedManifestHash)||!digest(links.expectedParentFrozenSourceProofHash)||!digest(links.expectedPlanHash)||typeof links.expectedSeedId!=='string'||typeof links.expectedTargetV2Epoch!=='string'||!count(links.expectedBatchIndex)||plan.seedManifestHash!==links.expectedManifestHash||plan.seedId!==links.expectedSeedId||plan.parentFrozenSourceProofHash!==links.expectedParentFrozenSourceProofHash||plan.targetV2Epoch!==links.expectedTargetV2Epoch||plan.batchIndex!==links.expectedBatchIndex||plan.planHash!==links.expectedPlanHash)throw new Error('V2 genesis persistence plan expected identity 不符');return payload;
}
