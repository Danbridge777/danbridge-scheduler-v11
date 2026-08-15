import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {IMMUTABLE_MIGRATION_BACKUP_SCHEMA,sha256Canonical,verifyImmutableMigrationBackupManifest} from './cloud-immutable-migration-backup.js';
import {verifyLiveOperationPlan} from './cloud-live-operation-plan.js';

const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const count=(value,label)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error(`${label} 無效`);return value};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const copy=value=>JSON.parse(JSON.stringify(value));
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const nonEmpty=(value,label)=>{if(typeof value!=='string'||!value.trim()||value!==value.trim())throw new Error(`${label} 無效`);return value};
const timestamp=(value,label)=>{const text=nonEmpty(value,label);if(!Number.isFinite(Date.parse(text)))throw new Error(`${label} 無效`);return text};
const requiredScenarios=Object.freeze(['create','modify','tombstone','revive','refresh-readback','failure-resume','two-tab-race','role-matrix']);

function verifyCounts(values,label){
 if(!values||!same(Object.keys(values),FULL_RECORD_COLLECTIONS))throw new Error(`${label} 16 集合清單不完整`);
 for(const collection of FULL_RECORD_COLLECTIONS)count(values[collection],`${label} ${collection} 筆數`);
 return Object.values(values).reduce((sum,value)=>sum+value,0);
}

export function buildStagingExecutionManifest({plan,sourceDb,sourceRevisions,targetDb,backup,restoreReceipt,legacyVersionHash,readBudget,writeBudget,createdAt}={}){
 if(plan?.schema!=='danbridge-live-operation-plan-v1'||plan.environment!=='staging'||plan.companyId!=='danbridge'||plan.collectionCount!==FULL_RECORD_COLLECTIONS.length||!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length)throw new Error('staging 執行計畫格式無效');
 const operationCount=count(plan.operationCount,'staging 操作筆數'),planReads=count(plan.estimatedFirestoreReads,'staging 計畫讀取數'),planWrites=count(plan.estimatedFirestoreWrites,'staging 計畫寫入數');
 if(planReads!==operationCount*2||planWrites!==operationCount*2||!recordHash(plan.baseHash)||!recordHash(plan.finalHash))throw new Error('staging 執行計畫配額或 hash 無效');
 const sourceRecordCount=verifyCounts(plan.sourceCounts,'來源'),targetRecordCount=verifyCounts(plan.targetCounts,'目標');
 if(sourceRecordCount!==plan.sourceRecordCount||targetRecordCount!==plan.targetRecordCount)throw new Error('staging 執行計畫總筆數不符');
 const sourceMaterialized=materializeFullRecordDb(sourceDb),targetMaterialized=materializeFullRecordDb(targetDb),actualSourceCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,sourceMaterialized[collection].length])),actualTargetCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,targetMaterialized[collection].length]));
 const sourceRecordHash=recordDataHash(sourceDb),targetRecordHash=recordDataHash(targetDb),backupSha256=sha256Canonical(targetDb);
 if(plan.baseHash!==sourceRecordHash||plan.finalHash!==targetRecordHash||!same(plan.sourceCounts,actualSourceCounts)||!same(plan.targetCounts,actualTargetCounts))throw new Error('staging 執行計畫與來源或目標逐筆資料不符');
 try{verifyLiveOperationPlan(plan,sourceDb,targetDb,{revisions:sourceRevisions})}catch{throw new Error('staging 執行計畫完整 revision/hash 鏈驗證失敗')}
 try{verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:backupSha256})}catch{throw new Error('staging 執行前 verified 備份不符')}
 if(backup.schema!==IMMUTABLE_MIGRATION_BACKUP_SCHEMA||!id(backup.backupId)||backup.recordCount!==targetRecordCount||!same(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,backup.collections?.[collection]?.count])),plan.targetCounts))throw new Error('staging 執行前 verified 備份不符');
 if(!restoreReceipt?.persisted||!id(restoreReceipt.drillId)||restoreReceipt.sourceBackupId!==backup.backupId||restoreReceipt.sourceHash!==backupSha256||restoreReceipt.restoredHash!==backupSha256||restoreReceipt.recordCount!==targetRecordCount||restoreReceipt.mainUnchanged!==true)throw new Error('staging 執行前復原演練 receipt 不符');
 nonEmpty(legacyVersionHash,'staging legacy 版本');if(backup.sourceVersionHash!==legacyVersionHash||restoreReceipt.mainVersionHash!==legacyVersionHash)throw new Error('staging legacy 版本已改變');
 count(readBudget,'staging 讀取預算');count(writeBudget,'staging 寫入預算');
 const estimatedReads=planReads+targetRecordCount+FULL_RECORD_COLLECTIONS.length,estimatedWrites=planWrites;
 if(estimatedReads>readBudget||estimatedWrites>writeBudget)throw new Error('staging 執行預估超過本次配額預算');
 const body={schema:'danbridge-staging-execution-manifest-v1',environment:'staging',companyId:'danbridge',state:'ready',createdAt:timestamp(createdAt,'staging manifest 建立時間'),backupId:backup.backupId,backupSha256,restoreDrillId:restoreReceipt.drillId,legacyVersionHash,operationPlanHash:sha256Canonical(plan),sourceRecordHash,targetRecordHash,sourceRecordCount,targetRecordCount,sourceCounts:copy(plan.sourceCounts),targetCounts:copy(plan.targetCounts),operationCount,estimatedReads,estimatedWrites,readBudget,writeBudget,requiredScenarios:[...requiredScenarios],featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false};
 return{...body,manifestHash:sha256Canonical(body)};
}

export function verifyStagingExecutionManifest(manifest,{currentLegacyVersionHash,currentRecordHash,currentOperationPlan}={}){
 if(manifest?.schema!=='danbridge-staging-execution-manifest-v1'||manifest.environment!=='staging'||manifest.companyId!=='danbridge'||manifest.state!=='ready'||manifest.featureFlagOnly!==true||manifest.uploadOwnerStateAttached!==false||manifest.readTakeover!==false||manifest.productionAllowed!==false)throw new Error('staging 執行 manifest 安全旗標無效');
 const {manifestHash,...body}=manifest;if(!/^[a-f0-9]{64}$/.test(manifestHash)||sha256Canonical(body)!==manifestHash)throw new Error('staging 執行 manifest hash 不符');
 timestamp(manifest.createdAt,'staging manifest 建立時間');if(!id(manifest.backupId)||!id(manifest.restoreDrillId)||!sha256(manifest.backupSha256)||!sha256(manifest.operationPlanHash)||!recordHash(manifest.sourceRecordHash)||!recordHash(manifest.targetRecordHash)||nonEmpty(manifest.legacyVersionHash,'staging legacy 版本')!==manifest.legacyVersionHash)throw new Error('staging 執行 manifest identity 無效');
 const sourceRecordCount=verifyCounts(manifest.sourceCounts,'來源'),targetRecordCount=verifyCounts(manifest.targetCounts,'目標');
 if(sourceRecordCount!==count(manifest.sourceRecordCount,'來源總筆數')||targetRecordCount!==count(manifest.targetRecordCount,'目標總筆數'))throw new Error('staging 執行 manifest 總筆數不符');
 const operationCount=count(manifest.operationCount,'staging 操作筆數'),estimatedReads=count(manifest.estimatedReads,'staging 預估讀取數'),estimatedWrites=count(manifest.estimatedWrites,'staging 預估寫入數'),readBudget=count(manifest.readBudget,'staging 讀取預算'),writeBudget=count(manifest.writeBudget,'staging 寫入預算');
 if(estimatedReads!==operationCount*2+targetRecordCount+FULL_RECORD_COLLECTIONS.length||estimatedWrites!==operationCount*2)throw new Error('staging 執行 manifest 配額估算不符');
 if(currentLegacyVersionHash!==manifest.legacyVersionHash||currentRecordHash!==manifest.sourceRecordHash||sha256Canonical(currentOperationPlan)!==manifest.operationPlanHash)throw new Error('staging 執行前來源版本或操作計畫已改變');
 if(!same(manifest.requiredScenarios,requiredScenarios))throw new Error('staging 實測情境清單不完整');
 if(estimatedReads>readBudget||estimatedWrites>writeBudget)throw new Error('staging 執行配額不足');
 return true;
}
