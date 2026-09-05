import {SHARDED_DB_COLLECTION_KEYS} from './cloud-sharded-store.js';
import {assertChangeRecordIdentity,buildChangeRecordId} from './cloud-change-record-identity.js';

export const FULL_RECORD_COLLECTIONS=Object.freeze([...SHARDED_DB_COLLECTION_KEYS]);
export const FULL_RECORD_SHADOW_SCHEMA='danbridge-full-record-shadow-v1';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const fingerprint=value=>JSON.stringify(stable(value));
// Rebuilt authority records and the scheduler target preserve insertion order
// for untouched maps.  The direct comparison makes that overwhelmingly common
// path allocation-free; the canonical fallback keeps Firestore map key order
// semantically irrelevant.
const sameRecord=(left,right)=>{const directLeft=JSON.stringify(left),directRight=JSON.stringify(right);return directLeft===directRight||fingerprint(left)===fingerprint(right)};
const validId=value=>{const id=String(value??'');return id&&id.trim()===id&&!id.includes('/')&&id!=='.'&&id!=='..'&&!/^__.*__$/.test(id)&&new TextEncoder().encode(id).length<=1500};
function materialize(collection,rows,{cloneRecords=true}={}){
 if(!Array.isArray(rows))throw new Error(`${collection} 必須是陣列`);
 // Legacy changes are displayed newest-first. Store them oldest-first so a new
 // legacy change becomes one immutable append instead of renumbering history.
 const orderedRows=collection==='changes'?[...rows].reverse():rows;
 const seen=new Set();return orderedRows.map((record,index)=>{
  if(!record||typeof record!=='object'||Array.isArray(record))throw new Error(`${collection} 第 ${index+1} 筆格式無效`);
  const recordId=collection==='changes'?buildChangeRecordId(index,record):String(record.id??'');
  if(!validId(recordId)||seen.has(recordId))throw new Error(`${collection} 包含無效或重複 ID：${recordId}`);seen.add(recordId);
  return{recordId,record:cloneRecords?clone(record):record,recordIndex:collection==='changes'?index:null,detached:cloneRecords};
 });
}
export function materializeFullRecordDb(db,{cloneRecords=true}={}){return Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,materialize(collection,db?.[collection],{cloneRecords})]))}

function selectedCollections(raw){
 if(!Array.isArray(raw)||raw.length<1)throw new Error('全資料影子集合範圍無效');
 const result=raw.map(value=>String(value)),seen=new Set(result);
 if(seen.size!==result.length||result.some(collection=>!FULL_RECORD_COLLECTIONS.includes(collection)))throw new Error('全資料影子集合範圍無效');
 return result;
}
function readCurrent(documentsByCollection,environment='staging',collections=FULL_RECORD_COLLECTIONS){
 if(!['staging','production'].includes(environment))throw new Error('全資料影子環境無效');
 const active={},revisions={},tombstones={};
 for(const collection of collections){active[collection]=new Map();revisions[collection]={};tombstones[collection]=new Map();const seen=new Set();
  for(const row of documentsByCollection?.[collection]??[]){const id=String(row?.id??''),data=row?.data;let changeValid=true;if(collection==='changes'){try{assertChangeRecordIdentity({recordIndex:data?.recordIndex,recordId:id,record:data?.record})}catch{changeValid=false}}const identified=collection==='changes'||String(data?.record?.id??'')===id;if(!(validId(id)&&!seen.has(id)&&data&&data.schema===FULL_RECORD_SHADOW_SCHEMA&&data.companyId==='danbridge'&&data.collection===collection&&data.recordId===id&&data.environment===environment&&Number.isSafeInteger(data.revision)&&data.revision>=1&&typeof data.deleted==='boolean'&&changeValid&&identified))throw new Error(`${collection}/${id} 全資料影子格式無效`);seen.add(id);revisions[collection][id]=data.revision;(data.deleted?tombstones[collection]:active[collection]).set(id,data)}
 }
 return{active,revisions,tombstones};
}
function payload(type,collection,item,revision,sourceHash,environment){return{schema:FULL_RECORD_SHADOW_SCHEMA,companyId:'danbridge',collection,recordId:item.recordId,record:item.detached===true?item.record:clone(item.record),recordIndex:item.recordIndex,sourceHash,revision,deleted:type==='delete',environment}}
function trustedReferences(collection,targetRows,baselineRows){
 if(collection==='changes'||!Array.isArray(targetRows)||!Array.isArray(baselineRows))return null;
 const baseline=new Map(),unchanged=new Set();
 for(const record of baselineRows){const id=String(record?.id??'');if(!validId(id)||baseline.has(id))throw new Error(`${collection} 權威結構參照無效`);baseline.set(id,record)}
 for(const record of targetRows){const id=String(record?.id??'');if(baseline.get(id)===record)unchanged.add(id)}
 return unchanged;
}
export function buildFullRecordShadowPlan(documentsByCollection,targetDb,{sourceHash,batchSize=400,environment='staging',collections=FULL_RECORD_COLLECTIONS,appendOnlyChangesCount=0,trustedBaselineDb=null}={}){
 if(typeof sourceHash!=='string'||!sourceHash.trim())throw new Error('全資料影子缺少 sourceHash');if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>400)throw new Error('全資料影子 batchSize 無效');
 if(!Number.isSafeInteger(appendOnlyChangesCount)||appendOnlyChangesCount<0||appendOnlyChangesCount>30)throw new Error('changes 追加提示無效');
 const scope=selectedCollections(collections),current=readCurrent(documentsByCollection,environment,scope);if(appendOnlyChangesCount){if(!scope.includes('changes'))throw new Error('changes 追加提示與權威資料不符');const active=[...current.active.changes.values()].sort((a,b)=>a.recordIndex-b.recordIndex);active.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error('changes 追加提示與權威序號不符')})}
 if(trustedBaselineDb!==null&&(!trustedBaselineDb||typeof trustedBaselineDb!=='object'||Array.isArray(trustedBaselineDb)))throw new Error('全資料影子權威結構參照無效');
 const unchangedByCollection=Object.fromEntries(scope.map(collection=>[collection,trustedReferences(collection,targetDb?.[collection],trustedBaselineDb?.[collection])]));
 const target=Object.fromEntries(scope.map(collection=>{if(collection!=='changes'||!appendOnlyChangesCount)return[collection,materialize(collection,targetDb?.[collection],{cloneRecords:unchangedByCollection[collection]===null})];const rows=targetDb?.changes,base=current.active.changes.size;if(!Array.isArray(rows)||rows.length!==base+appendOnlyChangesCount)throw new Error('changes 追加數量與權威資料不符');const appended=[...rows.slice(0,appendOnlyChangesCount)].reverse().map((record,index)=>{const recordIndex=base+index,recordId=buildChangeRecordId(recordIndex,record);if(!validId(recordId))throw new Error(`changes 包含無效 ID：${recordId}`);return{recordId,record:clone(record),recordIndex,detached:true}});return[collection,appended]})),operations=[];
 for(const collection of scope){const next=new Map(target[collection].map(item=>[item.recordId,item]));
  const namespace=environment==='production'?'productionFullRecordShadows':'stagingFullRecordShadows';
  for(const item of target[collection]){const old=current.active[collection].get(item.recordId),tombstone=current.tombstones[collection].get(item.recordId);if(old&&unchangedByCollection[collection]?.has(item.recordId)&&old.recordIndex===item.recordIndex)continue;if(old&&sameRecord(old.record,item.record)&&old.recordIndex===item.recordIndex)continue;const revision=(old||tombstone)?.revision+1||1;operations.push({type:old?'update':(tombstone?'revive':'create'),path:`${namespace}/danbridge/collections/${collection}/records/${item.recordId}`,payload:payload(old?'update':'create',collection,item,revision,sourceHash,environment)})}
  if(collection!=='changes'||!appendOnlyChangesCount)for(const [id,old] of current.active[collection])if(!next.has(id)){const item={recordId:id,record:clone(old.record),recordIndex:old.recordIndex??null,detached:true};operations.push({type:'delete',path:`${namespace}/danbridge/collections/${collection}/records/${id}`,payload:payload('delete',collection,item,old.revision+1,sourceHash,environment)})}
 }
 const batches=[];for(let offset=0;offset<operations.length;offset+=batchSize)batches.push({index:batches.length,operations:operations.slice(offset,offset+batchSize)});
 return{schema:'danbridge-full-record-shadow-plan-v1',sourceHash,collectionCount:scope.length,operations,batches,writes:operations.length};
}
export function rebuildFullRecordShadowDb(documentsByCollection,{environment='staging'}={}){
 const current=readCurrent(documentsByCollection,environment),db={};let documentCount=0,activeCount=0,tombstoneCount=0;
 for(const collection of FULL_RECORD_COLLECTIONS){const rows=[...current.active[collection].values()];documentCount+=rows.length+current.tombstones[collection].size;activeCount+=rows.length;tombstoneCount+=current.tombstones[collection].size;if(collection==='changes'){rows.sort((a,b)=>a.recordIndex-b.recordIndex);rows.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error('changes 影子序號不連續')});db[collection]=rows.map(row=>clone(row.record)).reverse()}else{rows.sort((a,b)=>String(a.recordId).localeCompare(String(b.recordId)));db[collection]=rows.map(row=>clone(row.record))}}
 return{db,documentCount,activeCount,tombstoneCount,revisions:current.revisions};
}
export function verifyFullRecordShadowReadback(documentsByCollection,targetDb,{environment='staging'}={}){
 const rebuilt=rebuildFullRecordShadowDb(documentsByCollection,{environment}),expected=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,collection==='changes'?clone(targetDb[collection]):[...targetDb[collection]].sort((a,b)=>String(a.id).localeCompare(String(b.id)))]));
 if(fingerprint(rebuilt.db)!==fingerprint(expected))throw new Error('全 16 集合逐筆讀回與主資料不一致');return{...rebuilt,verified:true};
}
export function verifyFullRecordShadowCandidate(documentsByCollection,targetDb,{environment='staging',expectedSourceHash}={}){
 if(typeof expectedSourceHash!=='string'||!expectedSourceHash.trim())throw new Error('逐筆候選缺少預期 sourceHash');
 const verified=verifyFullRecordShadowReadback(documentsByCollection,targetDb,{environment}),sourceHashes=new Set();let matchingSourceHashCount=0,activeSourceHashCount=0;
 for(const collection of FULL_RECORD_COLLECTIONS)for(const row of documentsByCollection?.[collection]??[]){
  if(row?.data?.deleted===true)continue;const sourceHash=String(row?.data?.sourceHash||'');if(!sourceHash)throw new Error(`${collection}/${String(row?.id??'')} 缺少 sourceHash`);activeSourceHashCount++;sourceHashes.add(sourceHash);if(sourceHash===expectedSourceHash)matchingSourceHashCount++;
 }
 if(activeSourceHashCount!==verified.activeCount)throw new Error('逐筆候選有效文件 sourceHash 計數不一致');
 return{...verified,sourceHash:expectedSourceHash,collectionCount:FULL_RECORD_COLLECTIONS.length,activeSourceHashCount,matchingSourceHashCount,historicalSourceHashCount:activeSourceHashCount-matchingSourceHashCount,distinctSourceHashCount:sourceHashes.size,candidateVerified:true};
}
