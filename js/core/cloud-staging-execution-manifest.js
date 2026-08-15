import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {IMMUTABLE_MIGRATION_BACKUP_SCHEMA,sha256Canonical,verifyImmutableMigrationBackupManifest} from './cloud-immutable-migration-backup.js';
import {verifyLiveOperationPlan} from './cloud-live-operation-plan.js?v=20.26.92';

const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const count=(value,label)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error(`${label} 無效`);return value};
const same=(left,right)=>sha256Canonical(left)===sha256Canonical(right);
const copy=value=>JSON.parse(JSON.stringify(value));
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const nonEmpty=(value,label)=>{if(typeof value!=='string'||!value.trim()||value!==value.trim())throw new Error(`${label} 無效`);return value};
const timestamp=(value,label)=>{const text=nonEmpty(value,label);if(!Number.isFinite(Date.parse(text)))throw new Error(`${label} 無效`);return text};
const requiredScenarios=Object.freeze(['create','modify','tombstone','revive','refresh-readback','failure-resume','two-tab-race','role-matrix']);

function verifyCounts(values,label){
 const keys=values&&typeof values==='object'&&!Array.isArray(values)?Object.keys(values):[];
 if(keys.length!==FULL_RECORD_COLLECTIONS.length||!FULL_RECORD_COLLECTIONS.every(collection=>Object.prototype.hasOwnProperty.call(values,collection)))throw new Error(`${label} 16 集合清單不完整`);
 for(const collection of FULL_RECORD_COLLECTIONS)count(values[collection],`${label} ${collection} 筆數`);
 return Object.values(values).reduce((sum,value)=>sum+value,0);
}

function finalDocumentCounts(sourceRevisions,targetMaterialized){
 const counts={};
 for(const collection of FULL_RECORD_COLLECTIONS){
  const revisions=sourceRevisions?.[collection];
  if(!revisions||typeof revisions!=='object'||Array.isArray(revisions))throw new Error(`來源 ${collection} revision 清單缺失`);
  const ids=new Set(Object.keys(revisions));
  for(const [recordId,revision] of Object.entries(revisions))if(!recordId||!Number.isSafeInteger(revision)||revision<1)throw new Error(`來源 ${collection}/${recordId||'—'} revision 無效`);
  for(const item of targetMaterialized[collection])ids.add(item.recordId);
  counts[collection]=ids.size;
 }
 return counts;
}

export function buildStagingExecutionManifest({plan,sourceDb,sourceRevisions,targetDb,backup,restoreReceipt,legacyVersionHash,readBudget,writeBudget,createdAt,maxOperationsPerRun=100}={}){
 if(plan?.schema!=='danbridge-live-operation-plan-v1'||plan.environment!=='staging'||plan.companyId!=='danbridge'||plan.collectionCount!==FULL_RECORD_COLLECTIONS.length||!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length)throw new Error('staging 執行計畫格式無效');
 const operationCount=count(plan.operationCount,'staging 操作筆數'),planReads=count(plan.estimatedFirestoreReads,'staging 計畫讀取數'),planWrites=count(plan.estimatedFirestoreWrites,'staging 計畫寫入數');
 if(planReads!==operationCount*3||planWrites!==operationCount*3||!recordHash(plan.baseHash)||!recordHash(plan.finalHash))throw new Error('staging 執行計畫配額或 hash 無效');
 const sourceRecordCount=verifyCounts(plan.sourceCounts,'來源'),targetRecordCount=verifyCounts(plan.targetCounts,'目標');
 if(sourceRecordCount!==plan.sourceRecordCount||targetRecordCount!==plan.targetRecordCount)throw new Error('staging 執行計畫總筆數不符');
 const sourceMaterialized=materializeFullRecordDb(sourceDb),targetMaterialized=materializeFullRecordDb(targetDb),actualSourceCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,sourceMaterialized[collection].length])),actualTargetCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,targetMaterialized[collection].length]));
 const sourceRecordHash=recordDataHash(sourceDb),targetRecordHash=recordDataHash(targetDb),backupSha256=sha256Canonical(targetDb),targetDocumentCounts=finalDocumentCounts(sourceRevisions,targetMaterialized),targetDocumentCount=verifyCounts(targetDocumentCounts,'完成文件'),targetActiveCount=targetRecordCount,targetTombstoneCount=targetDocumentCount-targetActiveCount;
 if(plan.baseHash!==sourceRecordHash||plan.finalHash!==targetRecordHash||!same(plan.sourceCounts,actualSourceCounts)||!same(plan.targetCounts,actualTargetCounts))throw new Error('staging 執行計畫與來源或目標逐筆資料不符');
 try{verifyLiveOperationPlan(plan,sourceDb,targetDb,{revisions:sourceRevisions})}catch{throw new Error('staging 執行計畫完整 revision/hash 鏈驗證失敗')}
 try{verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:backupSha256})}catch{throw new Error('staging 執行前 verified 備份不符')}
 if(backup.schema!==IMMUTABLE_MIGRATION_BACKUP_SCHEMA||!id(backup.backupId)||backup.recordCount!==targetRecordCount||!same(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,backup.collections?.[collection]?.count])),plan.targetCounts))throw new Error('staging 執行前 verified 備份不符');
 if(!restoreReceipt?.persisted||!id(restoreReceipt.drillId)||restoreReceipt.sourceBackupId!==backup.backupId||restoreReceipt.sourceHash!==backupSha256||restoreReceipt.restoredHash!==backupSha256||restoreReceipt.recordCount!==targetRecordCount||restoreReceipt.mainUnchanged!==true)throw new Error('staging 執行前復原演練 receipt 不符');
 nonEmpty(legacyVersionHash,'staging legacy 版本');if(backup.sourceVersionHash!==legacyVersionHash||restoreReceipt.mainVersionHash!==legacyVersionHash)throw new Error('staging legacy 版本已改變');
 count(readBudget,'staging 讀取預算');count(writeBudget,'staging 寫入預算');if(!Number.isSafeInteger(maxOperationsPerRun)||maxOperationsPerRun<1||maxOperationsPerRun>100)throw new Error('staging 每輪操作上限無效');
 // 每筆交易含控制、目標文件與不可覆寫完成憑證，最多預留三輪讀取；每個工作輪次都重新核對五份啟用證據，另預留三次中斷／雙分頁重進。
 const transactionRetryAllowance=3,plannedExecutionPasses=Math.max(1,Math.ceil(operationCount/maxOperationsPerRun)),activationAttemptAllowance=plannedExecutionPasses+3,fullReadbackReads=targetDocumentCount+FULL_RECORD_COLLECTIONS.length+1,estimatedReads=operationCount*3*transactionRetryAllowance+fullReadbackReads*2+(5*transactionRetryAllowance*activationAttemptAllowance)+(2*transactionRetryAllowance),estimatedWrites=operationCount*3+3;
 if(estimatedReads>readBudget||estimatedWrites>writeBudget)throw new Error('staging 執行預估超過本次配額預算');
 const body={schema:'danbridge-staging-execution-manifest-v1',environment:'staging',companyId:'danbridge',state:'ready',createdAt:timestamp(createdAt,'staging manifest 建立時間'),backupId:backup.backupId,backupSha256,restoreDrillId:restoreReceipt.drillId,legacyVersionHash,operationPlanHash:sha256Canonical(plan),operationListHash:sha256Canonical(plan.operations),sourceRecordHash,targetRecordHash,sourceRecordCount,targetRecordCount,sourceCounts:copy(plan.sourceCounts),targetCounts:copy(plan.targetCounts),targetDocumentCount,targetActiveCount,targetTombstoneCount,targetDocumentCounts,operationCount,maxOperationsPerRun,plannedExecutionPasses,activationAttemptAllowance,transactionRetryAllowance,estimatedReads,estimatedWrites,readBudget,writeBudget,requiredScenarios:[...requiredScenarios],featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false};
 return{...body,manifestHash:sha256Canonical(body)};
}

export function verifyStagingExecutionManifest(manifest,{currentLegacyVersionHash,currentRecordHash,currentOperationPlan}={}){
 if(manifest?.schema!=='danbridge-staging-execution-manifest-v1'||manifest.environment!=='staging'||manifest.companyId!=='danbridge'||manifest.state!=='ready'||manifest.featureFlagOnly!==true||manifest.uploadOwnerStateAttached!==false||manifest.readTakeover!==false||manifest.productionAllowed!==false)throw new Error('staging 執行 manifest 安全旗標無效');
 const {manifestHash,...body}=manifest;if(!/^[a-f0-9]{64}$/.test(manifestHash)||sha256Canonical(body)!==manifestHash)throw new Error('staging 執行 manifest hash 不符');
 timestamp(manifest.createdAt,'staging manifest 建立時間');if(!id(manifest.backupId)||!id(manifest.restoreDrillId)||!sha256(manifest.backupSha256)||!sha256(manifest.operationPlanHash)||!sha256(manifest.operationListHash)||!recordHash(manifest.sourceRecordHash)||!recordHash(manifest.targetRecordHash)||nonEmpty(manifest.legacyVersionHash,'staging legacy 版本')!==manifest.legacyVersionHash)throw new Error('staging 執行 manifest identity 無效');
 const sourceRecordCount=verifyCounts(manifest.sourceCounts,'來源'),targetRecordCount=verifyCounts(manifest.targetCounts,'目標');
 if(sourceRecordCount!==count(manifest.sourceRecordCount,'來源總筆數')||targetRecordCount!==count(manifest.targetRecordCount,'目標總筆數'))throw new Error('staging 執行 manifest 總筆數不符');
 const targetDocumentCount=verifyCounts(manifest.targetDocumentCounts,'完成文件'),targetActiveCount=count(manifest.targetActiveCount,'完成有效數'),targetTombstoneCount=count(manifest.targetTombstoneCount,'完成墓碑數');
 if(targetDocumentCount!==count(manifest.targetDocumentCount,'完成文件總數')||targetActiveCount!==targetRecordCount||targetDocumentCount!==targetActiveCount+targetTombstoneCount)throw new Error('staging 執行 manifest 完成文件筆數不符');
 const operationCount=count(manifest.operationCount,'staging 操作筆數'),maxOperationsPerRun=count(manifest.maxOperationsPerRun,'每輪操作上限'),plannedExecutionPasses=count(manifest.plannedExecutionPasses,'預計執行輪數'),activationAttemptAllowance=count(manifest.activationAttemptAllowance,'啟用核對預留'),retryAllowance=count(manifest.transactionRetryAllowance,'交易重試預留'),estimatedReads=count(manifest.estimatedReads,'staging 預估讀取數'),estimatedWrites=count(manifest.estimatedWrites,'staging 預估寫入數'),readBudget=count(manifest.readBudget,'staging 讀取預算'),writeBudget=count(manifest.writeBudget,'staging 寫入預算');
 const fullReadbackReads=targetDocumentCount+FULL_RECORD_COLLECTIONS.length+1;
 if(maxOperationsPerRun<1||maxOperationsPerRun>100||plannedExecutionPasses!==Math.max(1,Math.ceil(operationCount/maxOperationsPerRun))||activationAttemptAllowance!==plannedExecutionPasses+3||retryAllowance!==3||estimatedReads!==operationCount*3*retryAllowance+fullReadbackReads*2+5*retryAllowance*activationAttemptAllowance+2*retryAllowance||estimatedWrites!==operationCount*3+3)throw new Error('staging 執行 manifest 配額估算不符');
 if(currentLegacyVersionHash!==manifest.legacyVersionHash||currentRecordHash!==manifest.sourceRecordHash||sha256Canonical(currentOperationPlan)!==manifest.operationPlanHash||sha256Canonical(currentOperationPlan?.operations)!==manifest.operationListHash)throw new Error('staging 執行前來源版本或操作計畫已改變');
 if(!same(manifest.requiredScenarios,requiredScenarios))throw new Error('staging 實測情境清單不完整');
 if(estimatedReads>readBudget||estimatedWrites>writeBudget)throw new Error('staging 執行配額不足');
 return true;
}
