import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {buildLiveRecordOperation} from './cloud-live-record-operation.js';

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

function assertAppendOnlyChanges(beforeItems,afterItems){
 if(afterItems.length<beforeItems.length)throw new Error('changes 是永久操作日誌，禁止刪除歷史');
 for(let index=0;index<beforeItems.length;index++)if(beforeItems[index].recordId!==afterItems[index].recordId||!same(beforeItems[index].record,afterItems[index].record))throw new Error(`changes 是永久操作日誌，禁止修改或重排第 ${index+1} 筆`);
}

function applyToDb(db,operation){
 const rows=db[operation.collection];
 if(operation.collection==='changes'){
  if(operation.deleted||operation.recordIndex!==rows.length)throw new Error('changes 逐筆計畫只能依序追加');
  rows.push(clone(operation.record));return;
 }
 const index=rows.findIndex(row=>String(row.id)===operation.recordId);
 if(operation.deleted){if(index<0)throw new Error(`${operation.collection}/${operation.recordId} 墓碑目標不存在`);rows.splice(index,1);return}
 if(index<0)rows.push(clone(operation.record));else rows[index]=clone(operation.record);
}

export function verifyLiveOperationPlan(plan,currentDb,targetDb,{revisions={}}={}){
 if(plan?.schema!=='danbridge-live-operation-plan-v1'||!Array.isArray(plan.operations))throw new Error('逐筆操作計畫格式無效');
 const working=clone(currentDb),nextRevisions=clone(revisions),initialHash=recordDataHash(working);
 if(plan.baseHash!==initialHash)throw new Error('逐筆操作計畫起始 hash 不符');
 let runningHash=initialHash;
 for(const operation of plan.operations){
  const rebuilt=buildLiveRecordOperation({collection:operation.collection,recordId:operation.recordId,record:operation.record,recordIndex:operation.recordIndex,deleted:operation.deleted,operationId:operation.operationId,baseRevision:operation.baseRevision,baseHash:operation.baseHash,nextHash:operation.nextHash,environment:operation.environment});
  if(!same(rebuilt,operation))throw new Error(`逐筆操作 ${operation.operationId||'—'} 格式遭到改動`);
  if(operation.baseHash!==runningHash)throw new Error(`逐筆操作 ${operation.operationId} hash 鏈中斷`);
  const expectedRevision=revisionFor(nextRevisions,operation.collection,operation.recordId);
  if(operation.baseRevision!==expectedRevision||operation.nextRevision!==expectedRevision+1)throw new Error(`逐筆操作 ${operation.operationId} revision 鏈中斷`);
  applyToDb(working,operation);const nextHash=recordDataHash(working);
  if(operation.nextHash!==nextHash)throw new Error(`逐筆操作 ${operation.operationId} nextHash 不符`);
  nextRevisions[operation.collection][operation.recordId]=operation.nextRevision;runningHash=nextHash;
 }
 const targetHash=recordDataHash(targetDb);
 if(runningHash!==targetHash||plan.finalHash!==targetHash)throw new Error('逐筆操作計畫最終 hash 不符');
 return{verified:true,finalHash:targetHash,operationCount:plan.operations.length,db:working,revisions:nextRevisions};
}

export function buildLiveOperationPlan(currentState,targetDb,{deviceId,startSequence=1,expectedBaseHash}={}){
 if(!validDeviceId(deviceId))throw new Error('逐筆操作計畫 deviceId 無效');
 if(!Number.isSafeInteger(startSequence)||startSequence<1)throw new Error('逐筆操作計畫起始序號無效');
 const currentDb=clone(currentState?.db),revisions=clone(currentState?.revisions),before=materializeFullRecordDb(currentDb),after=materializeFullRecordDb(targetDb);
 assertCurrentRevisions(before,revisions);assertAppendOnlyChanges(before.changes,after.changes);
 const baseHash=recordDataHash(currentDb);if(expectedBaseHash!==undefined&&expectedBaseHash!==baseHash)throw new Error('逐筆操作計畫來源 hash 已改變');
 const working=clone(currentDb),operations=[],counts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,{creates:0,updates:0,tombstones:0,revives:0,writes:0}]));
 let sequence=startSequence,runningHash=baseHash;
 const appendOperation=(collection,item,{deleted=false,kind})=>{
  const baseRevision=revisionFor(revisions,collection,item.recordId,{required:deleted}),operationId=`${deviceId}:${sequence++}`;
  const draft={collection,recordId:item.recordId,record:clone(item.record),recordIndex:item.recordIndex,deleted,operationId,baseRevision,baseHash:runningHash,nextHash:'pending'};
  applyToDb(working,draft);const nextHash=recordDataHash(working),operation=buildLiveRecordOperation({...draft,nextHash});
  operations.push(operation);revisions[collection][item.recordId]=operation.nextRevision;runningHash=nextHash;counts[collection][kind]++;counts[collection].writes++;
 };
 for(const collection of FULL_RECORD_COLLECTIONS){
  if(collection==='changes'){for(const item of after.changes.slice(before.changes.length))appendOperation(collection,item,{kind:'creates'});continue}
  const oldById=new Map(before[collection].map(item=>[item.recordId,item])),newById=new Map(after[collection].map(item=>[item.recordId,item]));
  for(const id of [...oldById.keys()].filter(id=>!newById.has(id)).sort())appendOperation(collection,oldById.get(id),{deleted:true,kind:'tombstones'});
  for(const id of [...newById.keys()].filter(id=>oldById.has(id)&&!same(oldById.get(id).record,newById.get(id).record)).sort())appendOperation(collection,newById.get(id),{kind:'updates'});
  for(const id of [...newById.keys()].filter(id=>!oldById.has(id)).sort()){const kind=revisionFor(revisions,collection,id)>0?'revives':'creates';appendOperation(collection,newById.get(id),{kind})}
 }
 const finalHash=recordDataHash(targetDb);if(runningHash!==finalHash)throw new Error('逐筆操作規劃後最終 hash 不符');
 const sourceCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,before[collection].length])),targetCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,after[collection].length]));
 const plan={schema:'danbridge-live-operation-plan-v1',environment:'staging',companyId:'danbridge',deviceId,startSequence,nextSequence:sequence,baseHash,finalHash,collectionCount:FULL_RECORD_COLLECTIONS.length,sourceCounts,targetCounts,sourceRecordCount:Object.values(sourceCounts).reduce((sum,count)=>sum+count,0),targetRecordCount:Object.values(targetCounts).reduce((sum,count)=>sum+count,0),operations,operationCount:operations.length,counts,estimatedFirestoreReads:operations.length*3,estimatedFirestoreWrites:operations.length*3};
 verifyLiveOperationPlan(plan,currentDb,targetDb,{revisions:currentState.revisions});return plan;
}
