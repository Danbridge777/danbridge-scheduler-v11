import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=500;
const timestamp=value=>typeof value==='string'&&value.trim()===value&&Number.isFinite(Date.parse(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;

export const PRODUCTION_RECORD_CONTROL_PATH='companies/danbridge/productionRecordRuntime/control';
export const PRODUCTION_RECORD_SAFETY_PATH='companies/danbridge/productionRecordRuntime/safety';
export const productionRecordPath=(collection,recordId)=>`productionFullRecordShadows/danbridge/collections/${collection}/records/${recordId}`;
export const productionRecordCollectionPath=collection=>`productionFullRecordShadows/danbridge/collections/${collection}/records`;
export const productionRecordReceiptPath=(activationEpoch,operationId)=>`companies/danbridge/productionRecordOperationReceipts/${activationEpoch}/operations/${operationId}`;
export const productionConflictBackupPath=backupId=>`companies/danbridge/productionRecordConflictBackups/${backupId}`;

export function buildProductionRecordRuntimeControl({activationEpoch,legacyVersionHash,recordDataHash,sourceSha256,documentCount,activeCount,tombstoneCount,roleViewDigest,rollbackChannel,activatedAt}={}){
 if(!token(activationEpoch)||!text(legacyVersionHash)||!recordHash(recordDataHash)||!digest(sourceSha256)||!integer(documentCount)||!integer(activeCount)||!integer(tombstoneCount)||documentCount!==activeCount+tombstoneCount||!digest(roleViewDigest)||!text(rollbackChannel)||!timestamp(activatedAt))throw new Error('production 逐筆 runtime 啟用證據無效');
 const body={schema:'danbridge-production-record-runtime-control-v1',environment:'production',companyId:'danbridge',state:'active',activationEpoch,legacyVersionHash,recordDataHash,sourceSha256,collectionCount:16,documentCount,activeCount,tombstoneCount,roleViewDigest,rollbackChannel,readTakeover:true,writeTakeover:true,activatedAt};
 return{...body,activationHash:sha256Canonical(body)};
}

export function assertProductionRecordRuntimeControl(control){
 if(!control||control.schema!=='danbridge-production-record-runtime-control-v1'||control.environment!=='production'||control.companyId!=='danbridge'||control.state!=='active'||!token(control.activationEpoch)||!text(control.legacyVersionHash)||!recordHash(control.recordDataHash)||!digest(control.sourceSha256)||control.collectionCount!==16||!integer(control.documentCount)||!integer(control.activeCount)||!integer(control.tombstoneCount)||control.documentCount!==control.activeCount+control.tombstoneCount||!digest(control.roleViewDigest)||!text(control.rollbackChannel)||control.readTakeover!==true||control.writeTakeover!==true||!timestamp(control.activatedAt)||!digest(control.activationHash))throw new Error('production 逐筆 runtime 控制格式無效');
 const body=clone(control);delete body.activationHash;delete body.persistedAt;delete body.activatedBy;delete body.activatedByEmail;if(sha256Canonical(body)!==control.activationHash)throw new Error('production 逐筆 runtime activation hash 不符');return control;
}

export function buildProductionRecordRuntimeSafety({control,updatedAt}={}){
 assertProductionRecordRuntimeControl(control);if(!timestamp(updatedAt))throw new Error('production 逐筆 runtime 安全控制時間無效');
 return{schema:'danbridge-production-record-runtime-safety-v1',environment:'production',companyId:'danbridge',activationEpoch:control.activationEpoch,state:'active',revision:1,lastEventHash:control.activationHash,readAllowed:true,writeAllowed:true,updatedAt};
}

export function assertProductionRecordRuntimeSafety(safety,{activationEpoch}={}){
 if(!safety||safety.schema!=='danbridge-production-record-runtime-safety-v1'||safety.environment!=='production'||safety.companyId!=='danbridge'||safety.activationEpoch!==activationEpoch||!token(safety.activationEpoch)||!['active','paused'].includes(safety.state)||!integer(safety.revision)||safety.revision<1||!digest(safety.lastEventHash)||safety.readAllowed!==true||safety.writeAllowed!==(safety.state==='active')||!timestamp(safety.updatedAt))throw new Error('production 逐筆 runtime 安全控制格式無效');return safety;
}
