import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {ACTIVE_RECORD_SAVE_MAX_CHANGES} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const LOCAL_MUTATION_PROOF_SCHEMA='danbridge-local-mutation-proof-v1';
export const LOCAL_MUTATION_PROOF_HASH_SCOPE='transport-storage-integrity-only-not-authorization';

export const LOCAL_MUTATION_BULK_REASONS=Object.freeze([
 'series-edit','batch-edit','batch-delete','week-copy','month-copy','teacher-replacement','month-complete',
 'camp-series','undo-redo','restore','import','reset','integrity-repair','normalization-migration'
]);

const collectionSet=new Set(FULL_RECORD_COLLECTIONS);
const bulkReasonSet=new Set(LOCAL_MUTATION_BULK_REASONS);
const identity=key=>`${key.collection}/${key.recordId}`;
const rawCompare=(left,right)=>left<right?-1:left>right?1:0;
const compareKeys=(left,right)=>rawCompare(identity(left),identity(right));

function hasUnpairedSurrogate(value){
 for(let index=0;index<value.length;index++){
  const code=value.charCodeAt(index);
  if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}
  else if(code>=0xdc00&&code<=0xdfff)return true;
 }
 return false;
}
function validId(value){return typeof value==='string'&&value.trim()===value&&value.length>0&&!hasUnpairedSurrogate(value)&&new TextEncoder().encode(value).length<=1500&&!/[\u0000-\u001f\u007f/]/.test(value)&&value!=='.'&&value!=='..'&&!/^__.*__$/.test(value)}

function cloneLossless(value,stack=new Set(),path='value'){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new Error(`${path} 不是無損 finite number`);return value}
 if(['undefined','bigint','function','symbol'].includes(typeof value))throw new Error(`${path} 不是可無損保存的 JSON 值`);
 if(typeof value!=='object')throw new Error(`${path} 不是可無損保存的 JSON 值`);
 if(stack.has(value))throw new Error(`${path} 包含 cycle`);
 stack.add(value);
 try{
  if(Array.isArray(value)){
   const keys=Reflect.ownKeys(value);
   if(keys.some(key=>{if(key==='length')return false;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key))return true;const index=Number(key);return!Number.isSafeInteger(index)||index<0||index>=value.length||String(index)!==key}))throw new Error(`${path} array 包含 JSON 不會保存的欄位`);
   const result=[];
   for(let index=0;index<value.length;index++){
    if(!(index in value))throw new Error(`${path}[${index}] 是 sparse array hole`);
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${path}[${index}] 不是 plain JSON value`);
    result.push(cloneLossless(descriptor.value,stack,`${path}[${index}]`));
   }
   return result;
  }
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw new Error(`${path} 不是 plain object`);
  const result={};
  for(const key of Reflect.ownKeys(value)){
   if(typeof key!=='string')throw new Error(`${path} 包含 symbol key`);
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${path}.${key} 不是 enumerable plain JSON value`);
   Object.defineProperty(result,key,{value:cloneLossless(descriptor.value,stack,`${path}.${key}`),enumerable:true,writable:true,configurable:true});
  }
  return result;
 }finally{stack.delete(value)}
}

function stable(value){return Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value)}
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));

function exactObject(value,fields,label,{optional=[]}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 必須是 plain object`);
 const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new Error(`${label} 必須是 plain object`);
 const allowed=new Set([...fields,...optional]),keys=Object.keys(value);
 if(fields.some(field=>!keys.includes(field))||keys.some(key=>!allowed.has(key)))throw new Error(`${label} 欄位無效`);
 return value;
}

function assertDb(value,label){
 const copy=cloneLossless(value,new Set(),label);
 exactObject(copy,FULL_RECORD_COLLECTIONS,label);
 for(const collection of FULL_RECORD_COLLECTIONS){if(!Array.isArray(copy[collection]))throw new Error(`${label}.${collection} 必須是 array`)}
 for(const collection of FULL_RECORD_COLLECTIONS){
  const seen=new Set();
  for(const [index,record] of copy[collection].entries()){
   if(!record||typeof record!=='object'||Array.isArray(record))throw new Error(`${label}.${collection}[${index}] record 格式無效`);
   if(collection==='changes')continue;
   if(!validId(record.id))throw new Error(`${label}.${collection}[${index}] record id 無效`);
   if(seen.has(record.id))throw new Error(`${label}.${collection} 包含 duplicate id：${record.id}`);
   seen.add(record.id);
  }
 }
 return copy;
}

function recordMaps(db,label){
 return Object.fromEntries(FULL_RECORD_COLLECTIONS.filter(collection=>collection!=='changes').map(collection=>[collection,new Map(db[collection].map(record=>[record.id,record]))]));
}
function diffRecords(before,after,label){
 const left=recordMaps(before,`${label}.before`),right=recordMaps(after,`${label}.after`),keys=[],creates=[],deletes=[];
 for(const collection of FULL_RECORD_COLLECTIONS){
  if(collection==='changes')continue;
  for(const recordId of new Set([...left[collection].keys(),...right[collection].keys()])){
   const old=left[collection].get(recordId),next=right[collection].get(recordId);
   if(old!==undefined&&next!==undefined&&same(old,next))continue;
   const key={collection,recordId};keys.push(key);if(old===undefined)creates.push(key);if(next===undefined)deletes.push(key);
  }
 }
 keys.sort(compareKeys);creates.sort(compareKeys);deletes.sort(compareKeys);
 return{keys,creates,deletes};
}

function parseIntent(value,label,{allowAudit}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 無效`);
 if(value.collection==='changes'){
  if(!allowAudit)throw new Error(`${label} 禁止 changes housekeeping key`);
  exactObject(value,['collection','kind','auditId'],label);
  if(value.kind!=='audit-append'||!validId(value.auditId))throw new Error(`${label} audit append identity 無效`);
  return{kind:'audit',auditId:value.auditId};
 }
 exactObject(value,['collection','recordId'],label);
 if(!collectionSet.has(value.collection)||value.collection==='changes'||!validId(value.recordId))throw new Error(`${label} record identity 無效`);
 return{kind:'record',key:{collection:value.collection,recordId:value.recordId}};
}
function parseIntents(values,label,{allowAudit=false}={}){
 if(!Array.isArray(values))throw new Error(`${label} 必須是 array`);
 const recordKeys=[],auditIds=[],seen=new Set();
 values.forEach((value,index)=>{
  const parsed=parseIntent(value,`${label}[${index}]`,{allowAudit}),id=parsed.kind==='audit'?`audit/${parsed.auditId}`:identity(parsed.key);
  if(seen.has(id))throw new Error(`${label} 包含 duplicate identity：${id}`);seen.add(id);
  if(parsed.kind==='audit')auditIds.push(parsed.auditId);else recordKeys.push(parsed.key);
 });
 recordKeys.sort(compareKeys);auditIds.sort(rawCompare);
 return{recordKeys,auditIds};
}
const identitySet=keys=>new Set(keys.map(identity));
function assertSameKeySet(actual,expected,label){
 const left=identitySet(actual),right=identitySet(expected),missing=[...left].filter(key=>!right.has(key)),extra=[...right].filter(key=>!left.has(key));
 if(missing.length||extra.length)throw new Error(`${label} 不完整：missing ${missing.join(',')||'none'}；extra ${extra.join(',')||'none'}`);
}

function collectAuditAppends(before,preHousekeeping,after,declaredAuditIds){
 if(!same(preHousekeeping.changes,after.changes))throw new Error('housekeeping 禁止修改 changes 歷史');
 const oldRows=before.changes,nextRows=preHousekeeping.changes,appendCount=nextRows.length-oldRows.length;
 if(appendCount<0||!same(nextRows.slice(Math.max(0,appendCount)),oldRows))throw new Error('changes 只允許 newest-first prefix append；舊歷史不可修改、刪除或重排');
 const existingIds=new Set(oldRows.map(row=>row?.id).filter(validId)),
  newRows=nextRows.slice(0,appendCount),seen=new Set(),actualIds=[];
 for(const [index,row] of newRows.entries()){
  if(!row||typeof row!=='object'||Array.isArray(row)||!validId(row.id))throw new Error(`changes append[${index}] auditId 無效`);
  if(existingIds.has(row.id)||seen.has(row.id))throw new Error(`changes append auditId 重複：${row.id}`);
  seen.add(row.id);actualIds.push(row.id);
 }
 const declared=[...declaredAuditIds].sort(rawCompare),actual=[...actualIds].sort(rawCompare);
 if(!same(declared,actual))throw new Error(`audit append intent 不完整：actual ${actual.join(',')||'none'}；declared ${declared.join(',')||'none'}`);
 return newRows.slice().reverse().map(record=>({auditId:record.id,record:cloneLossless(record)}));
}

const strictTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const normalizedEmail=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const nonempty=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
function assertNewAuditRows(auditAppends,actualLessonKeys,businessLessonKeys,beforeDb,preHousekeepingDb){
 const actualLessonIds=new Set(actualLessonKeys.map(key=>key.recordId)),businessLessonIds=new Set(businessLessonKeys.map(key=>key.recordId)),businessAuditRows=new Map(),
  beforeLessons=new Map(beforeDb.lessons.map(record=>[record.id,record])),afterLessons=new Map(preHousekeepingDb.lessons.map(record=>[record.id,record]));
 for(const [index,append] of auditAppends.entries()){
  const row=append.record,label=`auditAppends[${index}].record`;
  exactObject(row,['id','at','type','lessonId','studentId','actorName','actorEmail','before','after'],label,{optional:['undoOfChangeId','historyAction']});
  if(!strictTimestamp(row.at)||!nonempty(row.type)||!validId(row.lessonId)||typeof row.studentId!=='string'||!nonempty(row.actorName)||!normalizedEmail(row.actorEmail))throw new Error(`${label} logChange schema 無效`);
  if(row.before===null&&row.after===null)throw new Error(`${label} before/after 至少一個必須存在`);
  for(const side of ['before','after'])if(row[side]!==null&&(!row[side]||typeof row[side]!=='object'||Array.isArray(row[side])||row[side].id!==row.lessonId))throw new Error(`${label}.${side}.id 必須等於 lessonId`);
  const expectedStudentId=row.after?.studentId||row.before?.studentId||'';
  if(row.studentId!==expectedStudentId)throw new Error(`${label}.studentId 與 logChange lesson 快照不一致`);
  if(row.undoOfChangeId!==undefined&&(!nonempty(row.undoOfChangeId)||row.undoOfChangeId.length>200))throw new Error(`${label}.undoOfChangeId 無效`);
  if(row.historyAction!==undefined&&(!nonempty(row.historyAction)||row.historyAction.length>80))throw new Error(`${label}.historyAction 無效`);
  if(!actualLessonIds.has(row.lessonId))throw new Error(`${label} 指向未實際變更的 lesson`);
  if(!businessLessonIds.has(row.lessonId))throw new Error(`${label} 必須指向 businessDiff lesson`);
  if(!businessAuditRows.has(row.lessonId))businessAuditRows.set(row.lessonId,[]);
  businessAuditRows.get(row.lessonId).push(row);
 }
 for(const {recordId} of businessLessonKeys){
  const rows=businessAuditRows.get(recordId)||[],expectedBefore=beforeLessons.get(recordId)??null,expectedAfter=afterLessons.get(recordId)??null;
  if(!rows.length)throw new Error(`lesson business mutation 缺少 audit chain：${recordId}`);
  if(!same(rows[0].before,expectedBefore))throw new Error(`lesson audit chain 起點不符：${recordId}`);
  for(let index=0;index<rows.length-1;index++)if(!same(rows[index].after,rows[index+1].before))throw new Error(`lesson audit chain 第 ${index+1} 段斷裂：${recordId}`);
  if(!same(rows.at(-1).after,expectedAfter))throw new Error(`lesson audit chain 終點不符：${recordId}`);
 }
}

function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item)}return value}
function hashDb(db){
 const ordered={};
 for(const collection of FULL_RECORD_COLLECTIONS)ordered[collection]=collection==='changes'?db[collection]:[...db[collection]].sort((left,right)=>rawCompare(left.id,right.id));
 return recordDataHash(ordered);
}

export function collectLocalMutationProof(input){
 const safeInput=cloneLossless(input,new Set(),'mutation collector input');
 exactObject(safeInput,['beforeDb','preHousekeepingDb','afterDb','declaredChangedKeys','reportedHousekeepingKeys','bulkReason'], 'mutation collector input');
 if(typeof safeInput.bulkReason!=='string'||(safeInput.bulkReason&&!bulkReasonSet.has(safeInput.bulkReason)))throw new Error('bulkReason 無效');
 const before=assertDb(safeInput.beforeDb,'beforeDb'),preHousekeeping=assertDb(safeInput.preHousekeepingDb,'preHousekeepingDb'),after=assertDb(safeInput.afterDb,'afterDb'),
  declared=parseIntents(safeInput.declaredChangedKeys,'declaredChangedKeys',{allowAudit:true}),reported=parseIntents(safeInput.reportedHousekeepingKeys,'reportedHousekeepingKeys'),
  businessDiff=diffRecords(before,preHousekeeping,'business'),housekeepingDiff=diffRecords(preHousekeeping,after,'housekeeping'),actualDiff=diffRecords(before,after,'actual');
 assertSameKeySet(businessDiff.keys,declared.recordKeys,'declaredChangedKeys');
 assertSameKeySet(housekeepingDiff.keys,reported.recordKeys,'reportedHousekeepingKeys');
 const union=new Map([...declared.recordKeys,...reported.recordKeys].map(key=>[identity(key),key]));
 assertSameKeySet(actualDiff.keys,[...union.values()],'actual changed keys');
 const auditAppends=collectAuditAppends(before,preHousekeeping,after,declared.auditIds),recordKeys=actualDiff.keys.map(key=>({...key}));
 assertNewAuditRows(auditAppends,actualDiff.keys.filter(key=>key.collection==='lessons'),businessDiff.keys.filter(key=>key.collection==='lessons'),before,preHousekeeping);
 const M=recordKeys.length+auditAppends.length,
  normalizationMigration=housekeepingDiff.creates.length>0||housekeepingDiff.deletes.length>0,
  exceedsDailyLimit=M>ACTIVE_RECORD_SAVE_MAX_CHANGES,
  detectedBulkReasons=[...(exceedsDailyLimit?['daily-limit-exceeded']:[]),...(normalizationMigration?['normalization-migration']:[])],
  detectedFacts={dailyChangeLimit:ACTIVE_RECORD_SAVE_MAX_CHANGES,exceedsDailyLimit,normalizationMigration},
  route=M===0?'noop':(safeInput.bulkReason||detectedBulkReasons.length)?'bulk-required':'daily',state=route==='bulk-required'?'blocked':'ready';
 const body={schema:LOCAL_MUTATION_PROOF_SCHEMA,hashScope:LOCAL_MUTATION_PROOF_HASH_SCOPE,state,route,recordKeys,auditAppends,M,requestedBulkReason:safeInput.bulkReason,detectedBulkReasons,detectedFacts,beforeHash:hashDb(before),afterHash:hashDb(after)};
 // proofHash only detects transport/storage corruption. It never authorizes daily or bulk execution.
 return deepFreeze({...body,proofHash:sha256Canonical(body)});
}

export function assertLocalMutationProofIntegrity(proof){
 const copy=cloneLossless(proof,new Set(),'mutation proof');
 exactObject(copy,['schema','hashScope','state','route','recordKeys','auditAppends','M','requestedBulkReason','detectedBulkReasons','detectedFacts','beforeHash','afterHash','proofHash'],'mutation proof');
 if(copy.schema!==LOCAL_MUTATION_PROOF_SCHEMA||copy.hashScope!==LOCAL_MUTATION_PROOF_HASH_SCOPE||!/^[a-f0-9]{64}$/.test(copy.proofHash))throw new Error('mutation proof schema 或 hash 格式無效');
 const proofHash=copy.proofHash;delete copy.proofHash;
 if(sha256Canonical(copy)!==proofHash)throw new Error('mutation proof canonical hash 不符');
 return deepFreeze({...copy,proofHash});
}
