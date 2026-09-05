import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js?v=20.26.230';
import {recordDataHash} from './cloud-record-data-hash.js?v=20.26.230';
import {buildLiveRecordOperation} from './cloud-live-record-operation.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const validDeviceId=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=128&&!/[\u0000-\u001f/]/.test(value);
const validRecordId=value=>{const id=String(value??'');return id&&id.trim()===id&&!id.includes('/')&&id!=='.'&&id!=='..'&&!/^__.*__$/.test(id)&&new TextEncoder().encode(id).length<=1500};

function revisionFor(revisions,collection,recordId,{required=false}={}){
 const value=revisions?.[collection]?.[recordId];
 if(value===undefined){if(required)throw new Error(`${collection}/${recordId} 缺少目前 revision`);return 0}
 if(!Number.isSafeInteger(value)||value<1)throw new Error(`${collection}/${recordId} revision 無效`);
 return value;
}

function assertCurrentRevisions(materialized,revisions){
 for(const collection of FULL_RECORD_COLLECTIONS){
  const collectionRevisions=revisions?.[collection];
  if(!collectionRevisions||typeof collectionRevisions!=='object'||Array.isArray(collectionRevisions))throw new Error(`${collection} revision 清單缺失`);
  for(const item of materialized[collection])revisionFor(revisions,collection,item.recordId,{required:true});
  for(const [recordId,revision] of Object.entries(collectionRevisions))if(!validRecordId(recordId)||!Number.isSafeInteger(revision)||revision<1)throw new Error(`${collection}/${recordId} revision 無效`);
 }
}

function incompatibleChanges(beforeItems,afterItems){
 let prefix=0,suffix=0;while(prefix<beforeItems.length&&prefix<afterItems.length&&same(beforeItems[prefix].record,afterItems[prefix].record))prefix++;while(suffix<beforeItems.length&&suffix<afterItems.length&&same(beforeItems[beforeItems.length-1-suffix].record,afterItems[afterItems.length-1-suffix].record))suffix++;
 const remaining=afterItems.map(item=>item.record),overlap=beforeItems.reduce((count,item)=>{const match=remaining.findIndex(record=>same(item.record,record));if(match<0)return count;remaining.splice(match,1);return count+1},0);
 return new Error(`changes 永久操作日誌不相容：來源 ${beforeItems.length}、目標 ${afterItems.length}、前綴 ${prefix}、後綴 ${suffix}、相同內容 ${overlap}，已阻止寫入`);
}

export function canonicalizeLiveTargetDb(currentDb,targetDb){
 const current=clone(currentDb),target=clone(targetDb),before=materializeFullRecordDb(current).changes,candidate=materializeFullRecordDb(target).changes;
 if(candidate.length<before.length)throw new Error('changes 是永久操作日誌，禁止刪除歷史');
 const remaining=candidate.map(item=>clone(item.record));
 for(const item of before){const match=remaining.findIndex(record=>same(item.record,record));if(match<0)throw incompatibleChanges(before,candidate);remaining.splice(match,1)}
 // Legacy 合併可能重排整個顯示陣列。逐筆層保留既有永久順序，
 // 只把尚未出現的紀錄依 legacy 的舊到新方向接在尾端。
 target.changes=[...before.map(item=>clone(item.record)),...remaining].reverse();
 return target;
}

function operationChainHash(previousHash,operation){
 const identity={schema:'danbridge-live-record-operation-v1',environment:operation.environment??'staging',companyId:'danbridge',collection:operation.collection,recordId:operation.recordId,record:clone(operation.record),recordIndex:operation.recordIndex,deleted:operation.deleted,operationId:operation.operationId,baseRevision:operation.baseRevision,nextRevision:operation.nextRevision??operation.baseRevision+1};
 return`record-v1:${sha256Canonical({schema:'danbridge-live-operation-chain-v1',previousHash,operation:identity})}`;
}

function createWorkingState(db){
 const materialized=materializeFullRecordDb(db),state={};
 for(const collection of FULL_RECORD_COLLECTIONS)state[collection]=collection==='changes'?materialized[collection].map(item=>clone(item.record)):new Map(materialized[collection].map(item=>[item.recordId,clone(item.record)]));
 return state;
}

function applyToWorkingState(state,operation){
 const rows=state[operation.collection];
 if(operation.collection==='changes'){
  if(operation.deleted||operation.recordIndex!==rows.length)throw new Error('changes 逐筆計畫只能依序追加');
  rows.push(clone(operation.record));return;
 }
 if(operation.deleted){if(!rows.has(operation.recordId))throw new Error(`${operation.collection}/${operation.recordId} 墓碑目標不存在`);rows.delete(operation.recordId);return}
 rows.set(operation.recordId,clone(operation.record));
}

function workingStateDb(state){
 return Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,collection==='changes'?clone(state[collection]).reverse():[...state[collection].values()].map(clone)]));
}

export function verifyLiveOperationPlan(plan,currentDb,targetDb,{revisions={}}={}){
 if(plan?.schema!=='danbridge-live-operation-plan-v1'||!Array.isArray(plan.operations))throw new Error('逐筆操作計畫格式無效');
 const canonicalTargetDb=canonicalizeLiveTargetDb(currentDb,targetDb),working=createWorkingState(currentDb),nextRevisions=clone(revisions),initialHash=recordDataHash(currentDb),targetHash=recordDataHash(canonicalTargetDb);
 if(plan.baseHash!==initialHash)throw new Error('逐筆操作計畫起始 hash 不符');
 let runningHash=initialHash;
 for(let index=0;index<plan.operations.length;index++){
  const operation=plan.operations[index];
  const rebuilt=buildLiveRecordOperation({collection:operation.collection,recordId:operation.recordId,record:operation.record,recordIndex:operation.recordIndex,deleted:operation.deleted,operationId:operation.operationId,baseRevision:operation.baseRevision,baseHash:operation.baseHash,nextHash:operation.nextHash,environment:operation.environment});
  if(!same(rebuilt,operation))throw new Error(`逐筆操作 ${operation.operationId||'—'} 格式遭到改動`);
  if(operation.baseHash!==runningHash)throw new Error(`逐筆操作 ${operation.operationId} hash 鏈中斷`);
  const expectedRevision=revisionFor(nextRevisions,operation.collection,operation.recordId);
  if(operation.baseRevision!==expectedRevision||operation.nextRevision!==expectedRevision+1)throw new Error(`逐筆操作 ${operation.operationId} revision 鏈中斷`);
  applyToWorkingState(working,operation);const nextHash=index===plan.operations.length-1?targetHash:operationChainHash(runningHash,operation);
  if(operation.nextHash!==nextHash)throw new Error(`逐筆操作 ${operation.operationId} nextHash 不符`);
  nextRevisions[operation.collection][operation.recordId]=operation.nextRevision;runningHash=nextHash;
 }
 const rebuiltDb=workingStateDb(working),rebuiltHash=recordDataHash(rebuiltDb);
 if(rebuiltHash!==targetHash||runningHash!==targetHash||plan.finalHash!==targetHash)throw new Error('逐筆操作計畫最終 hash 不符');
 return{verified:true,finalHash:targetHash,operationCount:plan.operations.length,db:rebuiltDb,revisions:nextRevisions};
}

export function buildLiveOperationPlan(currentState,targetDb,{deviceId,startSequence=1,expectedBaseHash}={}){
 if(!validDeviceId(deviceId))throw new Error('逐筆操作計畫 deviceId 無效');
 if(!Number.isSafeInteger(startSequence)||startSequence<1)throw new Error('逐筆操作計畫起始序號無效');
 const currentDb=clone(currentState?.db),canonicalTargetDb=canonicalizeLiveTargetDb(currentDb,targetDb),revisions=clone(currentState?.revisions),before=materializeFullRecordDb(currentDb),after=materializeFullRecordDb(canonicalTargetDb);
 assertCurrentRevisions(before,revisions);
 const baseHash=recordDataHash(currentDb);if(expectedBaseHash!==undefined&&expectedBaseHash!==baseHash)throw new Error('逐筆操作計畫來源 hash 已改變');
 const drafts=[],counts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,{creates:0,updates:0,tombstones:0,revives:0,writes:0}]));
 let sequence=startSequence;
 const appendDraft=(collection,item,{deleted=false,kind})=>{
  const baseRevision=revisionFor(revisions,collection,item.recordId,{required:deleted}),operationId=`${deviceId}:${sequence++}`;
  drafts.push({collection,recordId:item.recordId,record:clone(item.record),recordIndex:item.recordIndex,deleted,operationId,baseRevision});
  revisions[collection][item.recordId]=baseRevision+1;counts[collection][kind]++;counts[collection].writes++;
 };
 for(const collection of FULL_RECORD_COLLECTIONS){
  if(collection==='changes'){for(const item of after.changes.slice(before.changes.length))appendDraft(collection,item,{kind:'creates'});continue}
  const oldById=new Map(before[collection].map(item=>[item.recordId,item])),newById=new Map(after[collection].map(item=>[item.recordId,item]));
  for(const id of [...oldById.keys()].filter(id=>!newById.has(id)).sort())appendDraft(collection,oldById.get(id),{deleted:true,kind:'tombstones'});
  for(const id of [...newById.keys()].filter(id=>oldById.has(id)&&!same(oldById.get(id).record,newById.get(id).record)).sort())appendDraft(collection,newById.get(id),{kind:'updates'});
  for(const id of [...newById.keys()].filter(id=>!oldById.has(id)).sort()){const kind=revisionFor(revisions,collection,id)>0?'revives':'creates';appendDraft(collection,newById.get(id),{kind})}
 }
 const finalHash=recordDataHash(canonicalTargetDb),operations=[];let runningHash=baseHash;
 for(let index=0;index<drafts.length;index++){const draft=drafts[index],nextHash=index===drafts.length-1?finalHash:operationChainHash(runningHash,draft),operation=buildLiveRecordOperation({...draft,baseHash:runningHash,nextHash});operations.push(operation);runningHash=nextHash}
 if(runningHash!==finalHash)throw new Error('逐筆操作規劃後最終 hash 不符');
 const sourceCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,before[collection].length])),targetCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,after[collection].length]));
 const plan={schema:'danbridge-live-operation-plan-v1',environment:'staging',companyId:'danbridge',deviceId,startSequence,nextSequence:sequence,baseHash,finalHash,collectionCount:FULL_RECORD_COLLECTIONS.length,sourceCounts,targetCounts,sourceRecordCount:Object.values(sourceCounts).reduce((sum,count)=>sum+count,0),targetRecordCount:Object.values(targetCounts).reduce((sum,count)=>sum+count,0),operations,operationCount:operations.length,counts,estimatedFirestoreReads:operations.length*3,estimatedFirestoreWrites:operations.length*3};
 verifyLiveOperationPlan(plan,currentDb,canonicalTargetDb,{revisions:currentState.revisions});return plan;
}
