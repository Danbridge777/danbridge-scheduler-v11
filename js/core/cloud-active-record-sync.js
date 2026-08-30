import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb,FULL_RECORD_SHADOW_SCHEMA} from './cloud-full-record-shadow.js';
import {activeRecordSaveEnvelopeHash,isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {mergeConcurrentRecordDb} from './cloud-record-three-way-merge.js';
import {canonicalizeLiveTargetDb} from './cloud-live-operation-plan.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const validText=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=1500&&!/[\u0000-\u001f/]/.test(value);
const allowedEnvironment=new Set(['staging','production']);

function operationCollection(path){return path.match(/\/collections\/([^/]+)\/records\//)?.[1]||''}
function operationRecordId(path){return path.match(/\/records\/(.+)$/)?.[1]||''}
function v2Envelope({environment,activationEpoch,collection,recordId,exists,revision,deleted,record}){
 const core={collection,recordId,exists,revision,deleted,record:clone(record)};
 return{environment,companyId:'danbridge',activationEpoch,...core,recordHash:activeRecordSaveEnvelopeHash(core)};
}

export function prepareActiveRecordSync({documentsByCollection,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence=1,createdAt=new Date().toISOString()}={}){
 if(!allowedEnvironment.has(environment)||!validText(deviceId)||!validText(activationEpoch)||!Number.isSafeInteger(startSequence)||startSequence<1||!isStrictActiveRecordSaveTimestamp(createdAt))throw new Error('日常逐筆同步設定無效');
 const remote=rebuildFullRecordShadowDb(documentsByCollection,{environment}),canonicalLocalDb=canonicalizeLiveTargetDb(baselineDb,localDb),merged=mergeConcurrentRecordDb(baselineDb,canonicalLocalDb,remote.db),canonicalDb=canonicalizeLiveTargetDb(remote.db,merged.db),targetHash=recordDataHash(canonicalDb),raw=buildFullRecordShadowPlan(documentsByCollection,canonicalDb,{sourceHash:targetHash,batchSize:1,environment});
 let sequence=startSequence;
 const operations=raw.operations.map(row=>{
  const collection=operationCollection(row.path),recordId=operationRecordId(row.path),operationId=`${deviceId}:${sequence++}`;
  if(!FULL_RECORD_COLLECTIONS.includes(collection)||!validText(recordId)||!validText(operationId))throw new Error('日常逐筆操作路徑無效');
  const current=(documentsByCollection?.[collection]??[]).find(item=>String(item?.id??'')===recordId)?.data??null,baseRevision=row.payload.revision-1,baselineRecord=v2Envelope({environment,activationEpoch,collection,recordId,exists:current!==null,revision:current?.revision??0,deleted:current?.deleted??false,record:current?.record??null}),localRecord=v2Envelope({environment,activationEpoch,collection,recordId,exists:true,revision:baseRevision,deleted:row.payload.deleted,record:row.payload.record});
  if(baselineRecord.revision!==baseRevision)throw new Error('日常逐筆 V2 基準 revision 不符');
  return{schema:'danbridge-active-record-operation-v1',environment,companyId:'danbridge',activationEpoch,operationId,deviceId,createdAt,collection,recordId,type:row.type,baseRevision,nextRevision:row.payload.revision,baselineRecord,localRecord,payload:clone(row.payload),path:row.path};
 });
 return{schema:'danbridge-active-record-plan-v1',environment,companyId:'danbridge',activationEpoch,deviceId,startSequence,nextSequence:sequence,baseHash:recordDataHash(remote.db),targetHash,operationCount:operations.length,operations,conflicts:clone(merged.conflicts),db:clone(canonicalDb),remoteDb:clone(remote.db),revisions:clone(remote.revisions)};
}

export function applyActiveRecordOperation(current,operation){
 if(!operation||operation.schema!=='danbridge-active-record-operation-v1'||!allowedEnvironment.has(operation.environment)||operation.companyId!=='danbridge'||!validText(operation.activationEpoch)||!validText(operation.operationId)||!validText(operation.deviceId)||!FULL_RECORD_COLLECTIONS.includes(operation.collection)||!validText(operation.recordId)||!['create','update','delete','revive'].includes(operation.type)||!Number.isSafeInteger(operation.baseRevision)||operation.baseRevision<0||operation.nextRevision!==operation.baseRevision+1||operation.path.match(/\/collections\/([^/]+)\/records\/(.+)$/)?.[1]!==operation.collection||operation.path.match(/\/collections\/([^/]+)\/records\/(.+)$/)?.[2]!==operation.recordId)throw new Error('日常逐筆操作格式無效');
 const payload=operation.payload;
 if(!payload||payload.schema!==FULL_RECORD_SHADOW_SCHEMA||payload.environment!==operation.environment||payload.companyId!=='danbridge'||payload.collection!==operation.collection||payload.recordId!==operation.recordId||payload.revision!==operation.nextRevision||typeof payload.deleted!=='boolean')throw new Error('日常逐筆 payload identity 無效');
 if((operation.type==='delete')!==payload.deleted)throw new Error('日常逐筆操作類型與墓碑不符');
 if(current?.lastOperationId===operation.operationId){
  const expected={...clone(payload),lastOperationId:operation.operationId,deviceId:operation.deviceId,activationEpoch:operation.activationEpoch};
  if(!same(current,expected))throw new Error('重送操作 identity 衝突');
  return{kind:'duplicate',write:false,revision:current.revision,payload:clone(current)};
 }
 const revision=Number(current?.revision)||0;if(revision!==operation.baseRevision)throw new Error('日常逐筆 revision 衝突');
 if(current&&(current.schema!==FULL_RECORD_SHADOW_SCHEMA||current.environment!==operation.environment||current.companyId!=='danbridge'||current.collection!==operation.collection||current.recordId!==operation.recordId))throw new Error('日常逐筆文件 identity 衝突');
 const kind=current?(payload.deleted?'tombstone':(current.deleted?'revive':'update')):'create',expectedType=kind==='tombstone'?'delete':kind;if(expectedType!==operation.type)throw new Error('日常逐筆操作類型與目前文件不符');
 return{kind,write:true,revision:operation.nextRevision,payload:{...clone(payload),lastOperationId:operation.operationId,deviceId:operation.deviceId,activationEpoch:operation.activationEpoch}};
}
