import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb,FULL_RECORD_SHADOW_SCHEMA} from './cloud-full-record-shadow.js';
import {activeRecordSaveEnvelopeHash,isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {mergeConcurrentRecordDb} from './cloud-record-three-way-merge.js';
import {canonicalizeLiveTargetDb} from './cloud-live-operation-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const validText=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=1500&&!/[\u0000-\u001f/]/.test(value);
const validRecordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const allowedEnvironment=new Set(['staging','production']);

function operationCollection(path){return path.match(/\/collections\/([^/]+)\/records\//)?.[1]||''}
function operationRecordId(path){return path.match(/\/records\/(.+)$/)?.[1]||''}
function operationChainHash(previousHash,operation){
 const identity={schema:'danbridge-active-record-operation-v1',environment:operation.environment,companyId:'danbridge',collection:operation.collection,recordId:operation.recordId,type:operation.type,operationId:operation.operationId,baseRevision:operation.baseRevision,nextRevision:operation.nextRevision};
 return`record-v1:${sha256Canonical({schema:'danbridge-active-record-operation-chain-v1',previousHash,operation:identity})}`;
}
function advanceCounts(counts,type){
 const next={...counts};
 if(type==='create'){next.documentCount++;next.activeCount++}
 else if(type==='revive'){next.activeCount++;next.tombstoneCount--}
 else if(type==='delete'){next.activeCount--;next.tombstoneCount++}
 if(next.documentCount<0||next.activeCount<0||next.tombstoneCount<0||next.documentCount!==next.activeCount+next.tombstoneCount)throw new Error('日常逐筆文件計數鏈無效');
 return next;
}
function authoritativeTarget(remoteDb,localDb){
 const current=remoteDb?.changes,target=localDb?.changes;
 if(!Array.isArray(current)||!Array.isArray(target)||target.length<current.length)throw new Error('日常逐筆權威 changes 歷史缺漏');
 const offset=target.length-current.length;
 for(let index=0;index<current.length;index++)if(!same(current[index],target[index+offset]))throw new Error('日常逐筆權威 changes 舊歷史遭到改寫');
 return clone(localDb);
}
function v2Envelope({environment,activationEpoch,collection,recordId,exists,revision,deleted,record}){
 const core={collection,recordId,exists,revision,deleted,record:clone(record)};
 return{environment,companyId:'danbridge',activationEpoch,...core,recordHash:activeRecordSaveEnvelopeHash(core)};
}

export function prepareActiveRecordSync({documentsByCollection,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence=1,createdAt=new Date().toISOString(),authoritativeSourceHash,hashRecordDb=recordDataHash,verifiedRemote=null,compactResult=false,changedCollections=null}={}){
 if(!allowedEnvironment.has(environment)||!validText(deviceId)||!validText(activationEpoch)||!Number.isSafeInteger(startSequence)||startSequence<1||!isStrictActiveRecordSaveTimestamp(createdAt)||typeof hashRecordDb!=='function')throw new Error('日常逐筆同步設定無效');
 if(typeof compactResult!=='boolean')throw new Error('日常逐筆同步精簡結果設定無效');
 const trusted=verifiedRemote!==null;
 if(trusted&&(!verifiedRemote||typeof verifiedRemote!=='object'||Array.isArray(verifiedRemote)||verifiedRemote.db!==baselineDb||verifiedRemote.hash!==authoritativeSourceHash||!validRecordHash(verifiedRemote.hash)||!Number.isSafeInteger(verifiedRemote.documentCount)||verifiedRemote.documentCount<0||!Number.isSafeInteger(verifiedRemote.activeCount)||verifiedRemote.activeCount<0||!Number.isSafeInteger(verifiedRemote.tombstoneCount)||verifiedRemote.tombstoneCount<0||verifiedRemote.documentCount!==verifiedRemote.activeCount+verifiedRemote.tombstoneCount||!verifiedRemote.revisions||typeof verifiedRemote.revisions!=='object'))throw new Error('日常逐筆已驗證遠端快照無效');
 const remote=trusted?verifiedRemote:rebuildFullRecordShadowDb(documentsByCollection,{environment}),baseHash=trusted?verifiedRemote.hash:hashRecordDb(remote.db);
 if(!validRecordHash(baseHash))throw new Error('日常逐筆基準雜湊無效');
 if(authoritativeSourceHash!==undefined&&(!validRecordHash(authoritativeSourceHash)||authoritativeSourceHash!==baseHash))throw new Error('日常逐筆權威來源雜湊不符');
 const scoped=changedCollections!==null;
 if(scoped&&(!trusted||authoritativeSourceHash===undefined||!Array.isArray(changedCollections)||changedCollections.length<1))throw new Error('日常逐筆受信集合範圍無效');
 const scope=scoped?[...changedCollections]:FULL_RECORD_COLLECTIONS,scopeSet=new Set(scope);
 if(scoped&&(scopeSet.size!==scope.length||scope.some(collection=>!FULL_RECORD_COLLECTIONS.includes(collection))))throw new Error('日常逐筆受信集合範圍無效');
 if(scoped)for(const collection of FULL_RECORD_COLLECTIONS)if(!scopeSet.has(collection)&&!same(baselineDb?.[collection],localDb?.[collection]))throw new Error(`日常逐筆未授權集合遭修改：${collection}`);
 const canonicalLocalDb=authoritativeSourceHash===undefined?canonicalizeLiveTargetDb(baselineDb,localDb):(trusted?localDb:authoritativeTarget(remote.db,localDb)),merged=authoritativeSourceHash===undefined?mergeConcurrentRecordDb(baselineDb,canonicalLocalDb,remote.db):{db:canonicalLocalDb,conflicts:[]},canonicalDb=authoritativeSourceHash===undefined?canonicalizeLiveTargetDb(remote.db,merged.db):canonicalLocalDb,targetHash=hashRecordDb(canonicalDb),raw=buildFullRecordShadowPlan(documentsByCollection,canonicalDb,{sourceHash:targetHash,batchSize:1,environment,collections:scope});
 if(!validRecordHash(targetHash))throw new Error('日常逐筆目標雜湊無效');
 let incrementalHash=baseHash;
 let counts={documentCount:remote.documentCount,activeCount:remote.activeCount,tombstoneCount:remote.tombstoneCount};
 let sequence=startSequence;
 const operations=raw.operations.map((row,index)=>{
  const collection=operationCollection(row.path),recordId=operationRecordId(row.path),operationId=`${deviceId}:${sequence++}`;
  if(!FULL_RECORD_COLLECTIONS.includes(collection)||!validText(recordId)||!validText(operationId))throw new Error('日常逐筆操作路徑無效');
  const current=(documentsByCollection?.[collection]??[]).find(item=>String(item?.id??'')===recordId)?.data??null,baseRevision=row.payload.revision-1,baselineRecord=v2Envelope({environment,activationEpoch,collection,recordId,exists:current!==null,revision:current?.revision??0,deleted:current?.deleted??false,record:current?.record??null}),localRecord=v2Envelope({environment,activationEpoch,collection,recordId,exists:true,revision:baseRevision,deleted:row.payload.deleted,record:row.payload.record});
  if(baselineRecord.revision!==baseRevision)throw new Error('日常逐筆 V2 基準 revision 不符');
  const operation={schema:'danbridge-active-record-operation-v1',environment,companyId:'danbridge',activationEpoch,operationId,deviceId,createdAt,collection,recordId,type:row.type,baseRevision,nextRevision:row.payload.revision};
  const baseHash=incrementalHash;counts=advanceCounts(counts,row.type);incrementalHash=index===raw.operations.length-1?targetHash:operationChainHash(baseHash,operation);
  return{...operation,baseHash,targetHash:incrementalHash,targetDocumentCount:counts.documentCount,targetActiveCount:counts.activeCount,targetTombstoneCount:counts.tombstoneCount,baselineRecord,localRecord,payload:clone(row.payload),path:row.path};
 });
 if(incrementalHash!==targetHash)throw new Error('日常逐筆逐操作 head 與目標雜湊不一致');
 return{schema:'danbridge-active-record-plan-v1',environment,companyId:'danbridge',activationEpoch,deviceId,startSequence,nextSequence:sequence,baseHash,targetHash,operationCount:operations.length,operations,conflicts:clone(merged.conflicts),db:compactResult?canonicalDb:clone(canonicalDb),remoteDb:compactResult?remote.db:clone(remote.db),revisions:compactResult?remote.revisions:clone(remote.revisions)};
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
