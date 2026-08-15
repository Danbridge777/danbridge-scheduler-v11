import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const requiredScenarios=['create','modify','tombstone','revive','refresh-readback','failure-resume','two-tab-race','role-matrix'];
const runId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const nonEmpty=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
const countMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===FULL_RECORD_COLLECTIONS.length&&FULL_RECORD_COLLECTIONS.every(collection=>Object.prototype.hasOwnProperty.call(value,collection)&&integer(value[collection]));
const countTotal=value=>FULL_RECORD_COLLECTIONS.reduce((sum,collection)=>sum+value[collection],0);

export function stripStagingExecutionManifestAudit(value){
 const clean=copy(value);delete clean.persistedAt;delete clean.persistedBy;delete clean.persistedByEmail;return clean;
}

export function verifyStagingLiveJournalRows(manifest,rows){
 assertStagingExecutionManifestEnvelope(manifest);
 if(!Array.isArray(rows)||rows.length!==manifest.operationCount)throw new Error('永久操作日誌與 manifest 不一致，已阻止執行');
 const operations=rows.map(row=>{
  const operation=row?.operation;if(!operation||operation.schema!=='danbridge-live-record-operation-v1'||operation.environment!=='staging'||operation.companyId!=='danbridge'||operation.executionManifestHash!==manifest.manifestHash||operation.operationPlanHash!==manifest.operationPlanHash||operation.operationListHash!==manifest.operationListHash)throw new Error('永久操作日誌與 manifest 不一致，已阻止執行');
  const clean=copy(operation);delete clean.executionManifestHash;delete clean.operationPlanHash;delete clean.operationListHash;return clean;
 });
 if(operations.length){if(operations[0].baseHash!==manifest.sourceRecordHash||operations.at(-1).nextHash!==manifest.targetRecordHash||operations.some((operation,index)=>index&&operation.baseHash!==operations[index-1].nextHash))throw new Error('永久操作日誌 hash 鏈不完整')}
 else if(manifest.sourceRecordHash!==manifest.targetRecordHash)throw new Error('永久操作日誌 hash 鏈不完整');
 if(sha256Canonical(operations)!==manifest.operationListHash)throw new Error('永久操作日誌內容 hash 不符，已阻止執行');
 return{verified:true,operations};
}

export function assertStagingExecutionManifestEnvelope(manifest){
 const fullReadbackReads=manifest?.targetDocumentCount+FULL_RECORD_COLLECTIONS.length+1;
 if(manifest?.schema!=='danbridge-staging-execution-manifest-v1'||manifest.environment!=='staging'||manifest.companyId!=='danbridge'||manifest.state!=='ready'||manifest.featureFlagOnly!==true||manifest.uploadOwnerStateAttached!==false||manifest.readTakeover!==false||manifest.productionAllowed!==false||JSON.stringify(manifest.requiredScenarios)!==JSON.stringify(requiredScenarios)||!hash(manifest.manifestHash)||!hash(manifest.backupSha256)||!hash(manifest.operationPlanHash)||!hash(manifest.operationListHash)||!recordHash(manifest.sourceRecordHash)||!recordHash(manifest.targetRecordHash)||!runId(manifest.backupId)||!runId(manifest.restoreDrillId)||!nonEmpty(manifest.legacyVersionHash)||!nonEmpty(manifest.createdAt)||!Number.isFinite(Date.parse(manifest.createdAt))||!countMap(manifest.sourceCounts)||!countMap(manifest.targetCounts)||!countMap(manifest.targetDocumentCounts)||!integer(manifest.sourceRecordCount)||manifest.sourceRecordCount!==countTotal(manifest.sourceCounts)||!integer(manifest.targetRecordCount)||manifest.targetRecordCount!==countTotal(manifest.targetCounts)||!integer(manifest.operationCount)||!integer(manifest.targetDocumentCount)||manifest.targetDocumentCount!==countTotal(manifest.targetDocumentCounts)||!integer(manifest.targetActiveCount)||manifest.targetActiveCount!==manifest.targetRecordCount||!integer(manifest.targetTombstoneCount)||manifest.targetDocumentCount!==manifest.targetActiveCount+manifest.targetTombstoneCount||!integer(manifest.maxOperationsPerRun)||manifest.maxOperationsPerRun<1||manifest.maxOperationsPerRun>100||!integer(manifest.plannedExecutionPasses)||manifest.plannedExecutionPasses!==Math.max(1,Math.ceil(manifest.operationCount/manifest.maxOperationsPerRun))||!integer(manifest.activationAttemptAllowance)||manifest.activationAttemptAllowance!==manifest.plannedExecutionPasses+3||manifest.transactionRetryAllowance!==3||!integer(manifest.estimatedReads)||manifest.estimatedReads!==manifest.operationCount*9+fullReadbackReads*2+manifest.activationAttemptAllowance*15+6||!integer(manifest.estimatedWrites)||manifest.estimatedWrites!==manifest.operationCount*3+3||!integer(manifest.readBudget)||manifest.readBudget<manifest.estimatedReads||!integer(manifest.writeBudget)||manifest.writeBudget<manifest.estimatedWrites)throw new Error('staging 執行 manifest 啟用格式無效');
 const body=copy(manifest);delete body.manifestHash;if(sha256Canonical(body)!==manifest.manifestHash)throw new Error('staging 執行 manifest 啟用 hash 不符');return manifest;
}

export function buildStagingLiveActivationControl(manifest,{rootRevision=0}={}){
 assertStagingExecutionManifestEnvelope(manifest);
 if(!integer(rootRevision))throw new Error('staging live rootRevision 無效');
 return{schema:'danbridge-live-record-control-v2',environment:'staging',companyId:'danbridge',state:manifest.operationCount?'migrating':'verifying',executionManifestHash:manifest.manifestHash,backupId:manifest.backupId,restoreDrillId:manifest.restoreDrillId,legacyVersionHash:manifest.legacyVersionHash,dataHash:manifest.sourceRecordHash,targetDataHash:manifest.targetRecordHash,rootRevision,executionBaseRootRevision:rootRevision,operationCount:manifest.operationCount,confirmedOperationCount:0,expectedDocumentCount:manifest.targetDocumentCount,expectedActiveCount:manifest.targetActiveCount,expectedTombstoneCount:manifest.targetTombstoneCount,lastOperationId:'',lastCollection:'',lastRecordId:'',verifiedHash:'',verifiedDocumentCount:0,verifiedActiveCount:0,verifiedTombstoneCount:0};
}

export function sameStagingLiveExecution(left,right){
 if(!left||!right)return false;
 const keys=['schema','environment','companyId','state','executionManifestHash','backupId','restoreDrillId','legacyVersionHash','dataHash','targetDataHash','rootRevision','executionBaseRootRevision','operationCount','confirmedOperationCount','expectedDocumentCount','expectedActiveCount','expectedTombstoneCount','lastOperationId','lastCollection','lastRecordId','verifiedHash','verifiedDocumentCount','verifiedActiveCount','verifiedTombstoneCount'];
 return keys.every(key=>left[key]===right[key]);
}

export function isStagingLiveControlBoundToManifest(control,manifest){
 try{assertStagingExecutionManifestEnvelope(manifest)}catch{return false}
 if(!control||control.schema!=='danbridge-live-record-control-v2'||control.environment!=='staging'||control.companyId!=='danbridge'||control.executionManifestHash!==manifest.manifestHash||control.backupId!==manifest.backupId||control.restoreDrillId!==manifest.restoreDrillId||control.legacyVersionHash!==manifest.legacyVersionHash||control.targetDataHash!==manifest.targetRecordHash||control.operationCount!==manifest.operationCount||control.expectedDocumentCount!==manifest.targetDocumentCount||control.expectedActiveCount!==manifest.targetActiveCount||control.expectedTombstoneCount!==manifest.targetTombstoneCount||!integer(control.rootRevision)||!integer(control.executionBaseRootRevision)||control.rootRevision!==control.executionBaseRootRevision+control.confirmedOperationCount||control.confirmedOperationCount>control.operationCount||!['migrating','verifying','active'].includes(control.state))return false;
 if(control.state==='migrating')return control.confirmedOperationCount<control.operationCount&&recordHash(control.dataHash)&&control.verifiedHash===''&&control.verifiedDocumentCount===0&&control.verifiedActiveCount===0&&control.verifiedTombstoneCount===0&&(control.confirmedOperationCount===0?(control.dataHash===manifest.sourceRecordHash&&control.lastOperationId===''&&control.lastCollection===''&&control.lastRecordId===''):(typeof control.lastOperationId==='string'&&control.lastOperationId.length>0&&typeof control.lastCollection==='string'&&control.lastCollection.length>0&&typeof control.lastRecordId==='string'&&control.lastRecordId.length>0));
 if(control.confirmedOperationCount!==control.operationCount||control.dataHash!==manifest.targetRecordHash)return false;
 if(control.state==='verifying')return control.verifiedHash===''&&control.verifiedDocumentCount===0&&control.verifiedActiveCount===0&&control.verifiedTombstoneCount===0;
 return control.verifiedHash===manifest.targetRecordHash&&control.verifiedDocumentCount===manifest.targetDocumentCount&&control.verifiedActiveCount===manifest.targetActiveCount&&control.verifiedTombstoneCount===manifest.targetTombstoneCount;
}

export function buildStagingLiveFinalControl({manifest,control,readback}={}){
 assertStagingExecutionManifestEnvelope(manifest);
 if(!control||control.schema!=='danbridge-live-record-control-v2'||control.environment!=='staging'||control.companyId!=='danbridge'||control.executionManifestHash!==manifest.manifestHash||!['verifying','active'].includes(control.state)||control.dataHash!==manifest.targetRecordHash||control.targetDataHash!==manifest.targetRecordHash||control.operationCount!==manifest.operationCount||control.confirmedOperationCount!==manifest.operationCount||control.expectedDocumentCount!==manifest.targetDocumentCount||control.expectedActiveCount!==manifest.targetActiveCount||control.expectedTombstoneCount!==manifest.targetTombstoneCount)throw new Error('staging live 完成控制不一致');
 const actualHash=recordDataHash(readback?.db),documentCount=readback?.documentCount,activeCount=readback?.activeCount,tombstoneCount=readback?.tombstoneCount;
 if(actualHash!==manifest.targetRecordHash||documentCount!==manifest.targetDocumentCount||activeCount!==manifest.targetActiveCount||tombstoneCount!==manifest.targetTombstoneCount||documentCount!==activeCount+tombstoneCount)throw new Error('staging live 完成讀回不一致');
 return{...copy(control),state:'active',verifiedHash:actualHash,verifiedDocumentCount:documentCount,verifiedActiveCount:activeCount,verifiedTombstoneCount:tombstoneCount};
}
