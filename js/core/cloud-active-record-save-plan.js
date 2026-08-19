import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const ACTIVE_RECORD_SAVE_PLAN_SCHEMA='danbridge-active-record-save-plan-v1';
export const ACTIVE_RECORD_SAVE_OPERATION_SCHEMA='danbridge-active-record-save-operation-v1';
export const ACTIVE_RECORD_SAVE_COMMIT_SCHEMA='danbridge-active-record-save-commit-v1';
export const ACTIVE_RECORD_SYNC_HEAD_SCHEMA='danbridge-active-record-sync-head-v1';
export const ACTIVE_RECORD_SAVE_RECORD_HASH_SCHEMA='danbridge-active-record-save-record-hash-v1';
export const ACTIVE_RECORD_SAVE_MAX_CHANGES=8;
export const ACTIVE_RECORD_SAVE_ZERO_HASH='0'.repeat(64);

const collections=new Set(FULL_RECORD_COLLECTIONS);
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-item-v1:[a-f0-9]{64}$/.test(value);
const token=(value,max=128)=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=max&&/^[A-Za-z0-9_.:-]+$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!value.includes('/')&&/^[^@\s]+@[^@\s]+$/.test(value);
export function isStrictActiveRecordSaveTimestamp(value){
 if(typeof value!=='string'||value.trim()!==value)return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]),zone=match[7],leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year===0||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)return false;
 let offsetMinutes=0;if(zone!=='Z'){const offsetHour=Number(zone.slice(1,3)),offsetMinute=Number(zone.slice(4,6));if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return false;offsetMinutes=(zone[0]==='+'?1:-1)*(offsetHour*60+offsetMinute)}
 const daysBeforeYear=value=>365*(value-1)+Math.floor((value-1)/4)-Math.floor((value-1)/100)+Math.floor((value-1)/400),dayIndex=daysBeforeYear(year)+days.slice(0,month-1).reduce((sum,value)=>sum+value,0)+day-1,utcSecond=dayIndex*86400+hour*3600+minute*60+second-offsetMinutes*60,maxUtcSecond=daysBeforeYear(10000)*86400-1;
 return utcSecond>=0&&utcSecond<=maxUtcSecond;
}
const rawCompare=(left,right)=>left<right?-1:(left>right?1:0);
function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
export const isActiveRecordSaveRecordId=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&!hasUnpairedSurrogate(value)&&new TextEncoder().encode(value).length<=1500&&!/[\u0000-\u001f\u007f/]/.test(value)&&value!=='.'&&value!=='..'&&!/^__.*__$/.test(value);
const recordId=isActiveRecordSaveRecordId;

function clone(value,stack=new Set(),path='value'){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new Error(`${path} 不是無損 finite number`);return value}
 if(['undefined','bigint','function','symbol'].includes(typeof value))throw new Error(`${path} 不是可無損保存的 JSON 值`);
 if(typeof value!=='object')throw new Error(`${path} 不是可無損保存的 JSON 值`);
 if(stack.has(value))throw new Error(`${path} 包含 cycle`);
 stack.add(value);
 try{
  if(Array.isArray(value)){
   const keys=Reflect.ownKeys(value);if(keys.some(key=>{if(key==='length')return false;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key))return true;const index=Number(key);return!Number.isSafeInteger(index)||index<0||index>=value.length||String(index)!==key}))throw new Error(`${path} array 包含 JSON 不會保存的欄位`);
   const result=[];for(let index=0;index<value.length;index++){if(!(index in value))throw new Error(`${path}[${index}] 是 sparse array hole`);const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${path}[${index}] 不是 plain JSON value`);result.push(clone(descriptor.value,stack,`${path}[${index}]`))}return result;
  }
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new Error(`${path} 不是 plain object`);
  const result={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw new Error(`${path} 包含 symbol key`);const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${path}.${key} 不是 enumerable plain JSON value`);Object.defineProperty(result,key,{value:clone(descriptor.value,stack,`${path}.${key}`),enumerable:true,writable:true,configurable:true})}return result;
 }finally{stack.delete(value)}
}
export const strictCloneActiveRecordSaveValue=value=>clone(value);

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||!same(Object.keys(value).sort(),[...fields].sort()))throw new Error(`${label}欄位無效`);
 return value;
}
function identity(value){return`${value.collection}/${value.recordId}`}
function assertKey(value,label='changed key'){
 exact(value,['collection','recordId'],label);
 if(!collections.has(value.collection)||!recordId(value.recordId))throw new Error(`${label} identity 無效`);
 return identity(value);
}

export function preflightActiveRecordSaveChangedKeys(changedKeys){
 if(!Array.isArray(changedKeys)||changedKeys.length<1)throw new Error('changedKeys 不可為空');
 if(changedKeys.length>ACTIVE_RECORD_SAVE_MAX_CHANGES)throw new Error(`日常逐筆 save 最多 ${ACTIVE_RECORD_SAVE_MAX_CHANGES} 筆，必須改走 bulk 流程`);
 const keys=[],seen=new Set();for(const value of changedKeys){const id=assertKey(value);if(value.collection==='changes')throw new Error('generic save planner 禁止 changes；必須走 dedicated immutable audit/append planner');if(seen.has(id))throw new Error('changedKeys 包含 duplicate key');seen.add(id);keys.push({collection:value.collection,recordId:value.recordId})}return keys.sort((left,right)=>rawCompare(identity(left),identity(right)));
}

export function activeRecordSaveEnvelopeHash(value){
 const core=exact(value,['collection','recordId','exists','revision','deleted','record'], '逐筆 save envelope hash 輸入');
 if(!collections.has(core.collection)||!recordId(core.recordId)||typeof core.exists!=='boolean'||!Number.isSafeInteger(core.revision)||core.revision<0||typeof core.deleted!=='boolean')throw new Error('逐筆 save envelope hash identity 無效');
 if((core.exists&&(!core.record||typeof core.record!=='object'||Array.isArray(core.record)))||(!core.exists&&(core.record!==null||core.deleted||core.revision!==0)))throw new Error('逐筆 save envelope hash 狀態無效');
 if(core.exists&&core.collection!=='changes'&&(typeof core.record.id!=='string'||core.record.id!==core.recordId))throw new Error('逐筆 save envelope record.id 與 recordId 不符');
 return`record-item-v1:${sha256Canonical({schema:ACTIVE_RECORD_SAVE_RECORD_HASH_SCHEMA,collection:core.collection,recordId:core.recordId,exists:core.exists,deleted:core.deleted,record:clone(core.record)})}`;
}

function assertEnvelope(value,{activationEpoch,label}){
 exact(value,['environment','companyId','activationEpoch','collection','recordId','exists','revision','deleted','record','recordHash'],label);
 if(value.environment!=='staging'||value.companyId!=='danbridge'||value.activationEpoch!==activationEpoch||!token(value.activationEpoch)||!collections.has(value.collection)||!recordId(value.recordId)||typeof value.exists!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.deleted!=='boolean'||!recordHash(value.recordHash))throw new Error(`${label} identity、revision 或 epoch 無效`);
 const expected=activeRecordSaveEnvelopeHash({collection:value.collection,recordId:value.recordId,exists:value.exists,revision:value.revision,deleted:value.deleted,record:value.record});
 if(value.recordHash!==expected)throw new Error(`${label} hash 不符`);
 return value;
}

function envelopeMap(rows,keys,{activationEpoch,label}){
 if(!Array.isArray(rows)||rows.length!==keys.length)throw new Error(`${label} 必須只包含 changedKeys`);
 const result=new Map();
 for(const value of rows){
  assertEnvelope(value,{activationEpoch,label});const key=identity(value);
  if(result.has(key)||!keys.includes(key))throw new Error(`${label} 包含重複或非 changed key`);
  result.set(key,value);
 }
 if(result.size!==keys.length)throw new Error(`${label} 缺少 changed key`);
 return result;
}

export function preflightActiveRecordSaveLocalEnvelopes(input){
 exact(input,['activationEpoch','changedKeys','baselineRecords','localRecords'],'逐筆 save local envelope preflight');
 if(!token(input.activationEpoch))throw new Error('逐筆 save local envelope activationEpoch 無效');
 const changedKeys=preflightActiveRecordSaveChangedKeys(input.changedKeys),keys=changedKeys.map(identity),baselines=envelopeMap(input.baselineRecords,keys,{activationEpoch:input.activationEpoch,label:'baseline envelope'}),locals=envelopeMap(input.localRecords,keys,{activationEpoch:input.activationEpoch,label:'local envelope'});
 return{changedKeys,baselineRecords:changedKeys.map(key=>baselines.get(identity(key))),localRecords:changedKeys.map(key=>locals.get(identity(key)))};
}

export function assertActiveRecordSyncHead(value){
 exact(value,['schema','environment','companyId','activationEpoch','revision','headSaveId','previousCommitHash','commitHash','operationCount','updatedAt'],'syncHead');
 if(value.schema!==ACTIVE_RECORD_SYNC_HEAD_SCHEMA||value.environment!=='staging'||value.companyId!=='danbridge'||!token(value.activationEpoch)||!Number.isSafeInteger(value.revision)||value.revision<0||!hash(value.previousCommitHash)||!hash(value.commitHash)||!Number.isSafeInteger(value.operationCount)||value.operationCount<0||value.operationCount>ACTIVE_RECORD_SAVE_MAX_CHANGES)throw new Error('syncHead identity、hash 或 revision 無效');
 if(value.revision===0){if(value.headSaveId!==''||value.previousCommitHash!==ACTIVE_RECORD_SAVE_ZERO_HASH||value.commitHash!==ACTIVE_RECORD_SAVE_ZERO_HASH||value.operationCount!==0||value.updatedAt!=='')throw new Error('初始 syncHead 無效')}
 else{
  if(!token(value.headSaveId,110)||!isStrictActiveRecordSaveTimestamp(value.updatedAt)||value.commitHash===ACTIVE_RECORD_SAVE_ZERO_HASH)throw new Error('syncHead save identity 或 commit chain 無效');
  if((value.revision===1&&value.previousCommitHash!==ACTIVE_RECORD_SAVE_ZERO_HASH)||(value.revision>1&&value.previousCommitHash===ACTIVE_RECORD_SAVE_ZERO_HASH))throw new Error('syncHead previous commit chain 無效');
 }
 return value;
}

function operationType(collection,remote,local){
 if(!local.exists)throw new Error('local envelope 必須以墓碑表示刪除，禁止實體刪除');
 if(collection==='changes')throw new Error('generic save planner 禁止 changes；必須走 dedicated immutable audit/append planner');
 if(!remote.exists){if(local.deleted)throw new Error('不存在的逐筆資料不能建立墓碑');return'create'}
 if(remote.deleted&&!local.deleted)return'revive';
 if(!remote.deleted&&local.deleted)return'delete';
 if(!remote.deleted&&!local.deleted)return'update';
 throw new Error('墓碑沒有實際 revive 變更');
}

function operationCore({save,activationEpoch,operationIndex,operationCount,key,remote,local}){
 const type=operationType(key.collection,remote,local),operationId=`${save.saveId}:${String(operationIndex+1).padStart(2,'0')}`;
 if(!token(operationId))throw new Error('逐筆 save operationId 無效');
 if(type==='delete'&&sha256Canonical(clone(remote.record))!==sha256Canonical(clone(local.record)))throw new Error('delete tombstone 必須完整保留 remote record');
 return{schema:ACTIVE_RECORD_SAVE_OPERATION_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,saveId:save.saveId,deviceId:save.deviceId,actorUid:save.actorUid,actorEmail:save.actorEmail,operationId,operationIndex,operationCount,collection:key.collection,recordId:key.recordId,type,baseRevision:remote.revision,nextRevision:remote.revision+1,beforeHash:remote.recordHash,afterHash:local.recordHash,payload:{record:clone(local.record),deleted:local.deleted,revision:remote.revision+1}};
}

function collectionCountDeltas(operations){
 const deltas=new Map();
 for(const operation of operations){
  const current=deltas.get(operation.collection)||{collection:operation.collection,documentCountDelta:0,activeCountDelta:0,tombstoneCountDelta:0};
  if(operation.type==='create'){current.documentCountDelta++;current.activeCountDelta++}
  else if(operation.type==='delete'){current.activeCountDelta--;current.tombstoneCountDelta++}
  else if(operation.type==='revive'){current.activeCountDelta++;current.tombstoneCountDelta--}
  deltas.set(operation.collection,current);
 }
 return[...deltas.values()].sort((left,right)=>rawCompare(left.collection,right.collection));
}

export function assertActiveRecordSaveCommit(value){
 const commit=clone(value);exact(commit,['schema','environment','companyId','activationEpoch','saveId','deviceId','actorUid','actorEmail','baseHeadRevision','nextHeadRevision','previousCommitHash','operationCount','operations','collectionCountDeltas','createdAt','commitHash'],'逐筆 save commit');
 if(commit.schema!==ACTIVE_RECORD_SAVE_COMMIT_SCHEMA||commit.environment!=='staging'||commit.companyId!=='danbridge'||!token(commit.activationEpoch)||!token(commit.saveId,110)||!token(commit.deviceId)||!token(commit.actorUid)||!email(commit.actorEmail)||!Number.isSafeInteger(commit.baseHeadRevision)||commit.baseHeadRevision<0||commit.nextHeadRevision!==commit.baseHeadRevision+1||!hash(commit.previousCommitHash)||!Number.isSafeInteger(commit.operationCount)||commit.operationCount<1||commit.operationCount>ACTIVE_RECORD_SAVE_MAX_CHANGES||!Array.isArray(commit.operations)||commit.operations.length!==commit.operationCount||!Array.isArray(commit.collectionCountDeltas)||!isStrictActiveRecordSaveTimestamp(commit.createdAt)||!hash(commit.commitHash))throw new Error('逐筆 save commit identity、revision 或 actor 無效');
 if((commit.baseHeadRevision===0&&commit.previousCommitHash!==ACTIVE_RECORD_SAVE_ZERO_HASH)||(commit.baseHeadRevision>0&&commit.previousCommitHash===ACTIVE_RECORD_SAVE_ZERO_HASH))throw new Error('逐筆 save commit previous chain 無效');
 const seen=new Set();let previousIdentity='';for(let index=0;index<commit.operations.length;index++){
  const operation=exact(commit.operations[index],['operationId','operationHash','collection','recordId','type','baseRevision','nextRevision','beforeHash','afterHash'],'逐筆 save commit operation summary'),operationIdentity=identity(operation),expectedOperationId=`${commit.saveId}:${String(index+1).padStart(2,'0')}`;
  if(operation.operationId!==expectedOperationId||!hash(operation.operationHash)||!collections.has(operation.collection)||operation.collection==='changes'||!recordId(operation.recordId)||!['create','update','delete','revive'].includes(operation.type)||!Number.isSafeInteger(operation.baseRevision)||operation.baseRevision<0||operation.nextRevision!==operation.baseRevision+1||!recordHash(operation.beforeHash)||!recordHash(operation.afterHash)||operation.beforeHash===operation.afterHash||(operation.type==='create'?operation.baseRevision!==0:operation.baseRevision<1)||seen.has(operationIdentity)||(index>0&&rawCompare(previousIdentity,operationIdentity)>=0))throw new Error('逐筆 save commit operation summary 無效');
  if(operation.type==='create'){const absentHash=activeRecordSaveEnvelopeHash({collection:operation.collection,recordId:operation.recordId,exists:false,revision:0,deleted:false,record:null});if(operation.beforeHash!==absentHash)throw new Error('逐筆 save commit create beforeHash 無效')}
  seen.add(operationIdentity);previousIdentity=operationIdentity;
 }
 const expectedDeltas=collectionCountDeltas(commit.operations);for(const delta of commit.collectionCountDeltas){exact(delta,['collection','documentCountDelta','activeCountDelta','tombstoneCountDelta'],'逐筆 save commit collection delta');if(!collections.has(delta.collection)||delta.collection==='changes'||![delta.documentCountDelta,delta.activeCountDelta,delta.tombstoneCountDelta].every(Number.isSafeInteger))throw new Error('逐筆 save commit collection delta 無效')}
 if(sha256Canonical(clone(commit.collectionCountDeltas))!==sha256Canonical(clone(expectedDeltas)))throw new Error('逐筆 save commit collection deltas 不符');
 const core=clone(commit);delete core.commitHash;if(sha256Canonical(core)!==commit.commitHash)throw new Error('逐筆 save commit canonical hash 不符');return value;
}

function buildCommit({save,activationEpoch,baseHeadRevision,nextHeadRevision,previousCommitHash,operations}){
 const core={schema:ACTIVE_RECORD_SAVE_COMMIT_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,saveId:save.saveId,deviceId:save.deviceId,actorUid:save.actorUid,actorEmail:save.actorEmail,baseHeadRevision,nextHeadRevision,previousCommitHash,operationCount:operations.length,operations:operations.map(value=>({operationId:value.operationId,operationHash:value.operationHash,collection:value.collection,recordId:value.recordId,type:value.type,baseRevision:value.baseRevision,nextRevision:value.nextRevision,beforeHash:value.beforeHash,afterHash:value.afterHash})),collectionCountDeltas:collectionCountDeltas(operations),createdAt:save.createdAt};
 return{...core,commitHash:sha256Canonical(core)};
}

export function buildActiveRecordSavePlan(input){
 exact(input,['save','changedKeys','baselineRecords','localRecords','remoteRecords','currentSyncHead','confirmedExistingSaveCommitHash'],'逐筆 save plan 輸入');
 const save=exact(input.save,['saveId','deviceId','actorUid','actorEmail','createdAt'],'逐筆 save identity');
 if(!token(save.saveId,110)||!token(save.deviceId)||!token(save.actorUid)||!email(save.actorEmail)||!isStrictActiveRecordSaveTimestamp(save.createdAt))throw new Error('逐筆 save identity 或 actor 無效');
 const head=assertActiveRecordSyncHead(input.currentSyncHead),activationEpoch=head.activationEpoch;
 if(input.confirmedExistingSaveCommitHash!==null&&!hash(input.confirmedExistingSaveCommitHash))throw new Error('confirmed existing save commit hash 無效；null 只代表 authoritative targeted lookup confirmed-absent');
 const replay=head.revision>0&&head.headSaveId===save.saveId;
 if(replay){if(input.confirmedExistingSaveCommitHash===null||input.confirmedExistingSaveCommitHash!==head.commitHash)throw new Error('current-head replay 缺少或不符合 authoritative targeted immutable ledger')}
 else if(input.confirmedExistingSaveCommitHash!==null)throw new Error('historical saveId reuse 已安全拒絕');
 const localPreflight=preflightActiveRecordSaveLocalEnvelopes({activationEpoch,changedKeys:input.changedKeys,baselineRecords:input.baselineRecords,localRecords:input.localRecords}),orderedKeys=localPreflight.changedKeys,keys=orderedKeys.map(identity),baselines=new Map(localPreflight.baselineRecords.map(value=>[identity(value),value])),locals=new Map(localPreflight.localRecords.map(value=>[identity(value),value])),remotes=envelopeMap(input.remoteRecords,keys,{activationEpoch,label:'remote envelope'}),operations=[];
 for(const key of orderedKeys){
  const id=identity(key),baseline=baselines.get(id),local=locals.get(id),remote=remotes.get(id);
  if((baseline.exists&&baseline.revision<1)||(remote.exists&&remote.revision<1))throw new Error(`${id} 已存在的 baseline/remote 缺少 revision`);
  if(local.revision!==baseline.revision)throw new Error(`${id} local revision 與 baseline 不符`);
  if(local.recordHash===baseline.recordHash)throw new Error(`${id} changed key 沒有實際變更`);
  if(replay){if(!remote.exists||remote.revision!==baseline.revision+1||remote.recordHash!==local.recordHash)throw new Error(`${id} current-head replay 雲端尚未完整等於 committed result`)}
  else if(baseline.revision!==remote.revision||baseline.recordHash!==remote.recordHash)throw new Error(`${id} remote revision race，禁止規劃`);
  const operationBefore=replay?baseline:remote,core=operationCore({save,activationEpoch,operationIndex:operations.length,operationCount:orderedKeys.length,key,remote:operationBefore,local});operations.push({...core,operationHash:sha256Canonical(core)});
 }
 const baseHeadRevision=replay?head.revision-1:head.revision,nextHeadRevision=baseHeadRevision+1,previousCommitHash=replay?head.previousCommitHash:head.commitHash,saveCommit=buildCommit({save,activationEpoch,baseHeadRevision,nextHeadRevision,previousCommitHash,operations});
 assertActiveRecordSaveCommit(saveCommit);
 if(replay&&(saveCommit.commitHash!==head.commitHash||saveCommit.nextHeadRevision!==head.revision||saveCommit.operationCount!==head.operationCount))throw new Error('相同 saveId replay 與已提交 syncHead 衝突');
 const nextHead=replay?clone(head):{schema:ACTIVE_RECORD_SYNC_HEAD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,revision:nextHeadRevision,headSaveId:save.saveId,previousCommitHash,commitHash:saveCommit.commitHash,operationCount:operations.length,updatedAt:save.createdAt};
 return{schema:ACTIVE_RECORD_SAVE_PLAN_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,saveId:save.saveId,deviceId:save.deviceId,operationCount:operations.length,operations,saveCommit,nextHead,replay,workUnits:{changedKeys:orderedKeys.length,envelopesValidated:orderedKeys.length*3,operationsBuilt:operations.length}};
}
