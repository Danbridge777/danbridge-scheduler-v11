import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assertChangeRecordIdentity} from './cloud-change-record-identity.js';

export const ROLE_RECORD_VIEW_SCHEMA='danbridge-role-record-view-v1';
export const ROLE_RECORD_VIEW_CONTROL_SCHEMA='danbridge-role-record-view-control-v1';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const hash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!value.includes('/')&&/^[^@\s]+@[^@\s]+$/.test(value);
const timestamp=value=>typeof value==='string'&&value===value.trim()&&Number.isFinite(Date.parse(value));
const kinds=new Set(['scheduler','teacher','branch_manager']);
const recordCoreFields=['schema','environment','companyId','viewKey','email','kind','teacherId','branchIds','activationEpoch','collection','recordId','record','recordIndex','revision','deleted','lastPublishId','sourceRecordHash'];
const recordAuditFields=['updatedAt','updatedBy','updatedByEmail'];
const controlCoreFields=['schema','environment','companyId','viewKey','email','kind','teacherId','branchIds','activationEpoch','state','revision','publishId','sourceRecordHash','viewHash','collectionCount','collectionActiveCounts','collectionDocumentCounts','collectionTombstoneCounts','documentCount','activeCount','tombstoneCount','publishedAt','readTakeover'];
const controlAuditFields=['persistedAt','persistedBy','persistedByEmail'];

function assertExactFields(value,core,audit,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||core.some(key=>!(key in value))||Object.keys(value).some(key=>![...core,...audit].includes(key)))throw new Error(`${label}欄位無效`);
 const auditCount=audit.filter(key=>key in value).length;if(auditCount!==0&&auditCount!==audit.length)throw new Error(`${label}稽核欄位不完整`);
}
function normalizeBranchIds(value){
 if(!Array.isArray(value))throw new Error('角色逐筆檢視 branchIds 無效');const normalized=[...new Set(value.map(String))].sort();if(normalized.some(id=>!id||id.trim()!==id||id.includes('/')))throw new Error('角色逐筆檢視 branchIds 無效');return normalized;
}
export function normalizeRoleRecordViewIdentity(value){
 const normalized={email:String(value?.email??'').trim().toLowerCase(),kind:String(value?.kind??''),teacherId:String(value?.teacherId??''),branchIds:normalizeBranchIds(value?.branchIds??[])};
 if(!email(normalized.email)||!kinds.has(normalized.kind))throw new Error('角色逐筆檢視 identity 無效');
 if(normalized.kind==='branch_manager'){
  if(!normalized.teacherId||!normalized.branchIds.length)throw new Error('校區管理者逐筆檢視缺少老師或校區綁定');
 }else if(!normalized.teacherId||normalized.branchIds.length)throw new Error('老師／排課專員逐筆檢視 scope 無效');
 return normalized;
}
export function roleRecordViewKey(identity,activationEpoch){if(!token(activationEpoch))throw new Error('角色逐筆檢視 activationEpoch 無效');return sha256Canonical({companyId:'danbridge',activationEpoch,...normalizeRoleRecordViewIdentity(identity)})}

function validRecordId(collection,id,data){
 if(typeof id!=='string'||!id||id.trim()!==id||id.includes('/')||id==='.'||id==='..'||/^__.*__$/.test(id)||new TextEncoder().encode(id).length>1500)return false;
 if(collection==='changes'){try{return assertChangeRecordIdentity({recordIndex:data.recordIndex,recordId:id,record:data.record})}catch{return false}}
 return data.recordIndex===null&&String(data.record?.id??'')===id;
}
function recordCore(value){return Object.fromEntries(recordCoreFields.map(key=>[key,clone(value[key])]))}
function controlCore(value){return Object.fromEntries(controlCoreFields.map(key=>[key,clone(value[key])]))}

export function assertRoleRecordViewDocument(value,{environment,viewKey,identity,activationEpoch,collection,recordId}={} ){
 assertExactFields(value,recordCoreFields,recordAuditFields,'角色逐筆文件');const scope=normalizeRoleRecordViewIdentity(value);
 if(value.schema!==ROLE_RECORD_VIEW_SCHEMA||value.environment!==environment||value.companyId!=='danbridge'||value.viewKey!==viewKey||viewKey!==roleRecordViewKey(scope,value.activationEpoch)||!same(scope,normalizeRoleRecordViewIdentity(identity))||value.activationEpoch!==activationEpoch||value.collection!==collection||value.recordId!==recordId||!FULL_RECORD_COLLECTIONS.includes(collection)||!value.record||typeof value.record!=='object'||Array.isArray(value.record)||!validRecordId(collection,recordId,value)||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.deleted!=='boolean'||!token(value.lastPublishId)||!hash(value.sourceRecordHash))throw new Error(`${collection}/${recordId} 角色逐筆文件 identity 無效`);return value;
}

function readCurrent(documentsByCollection,{environment,viewKey,identity,activationEpoch}){
 const active={},tombstones={},revisions={};
 for(const collection of FULL_RECORD_COLLECTIONS){active[collection]=new Map();tombstones[collection]=new Map();revisions[collection]={};const seen=new Set();for(const row of documentsByCollection?.[collection]??[]){const id=String(row?.id??'');if(seen.has(id))throw new Error(`${collection}/${id} 角色逐筆文件重複`);seen.add(id);assertRoleRecordViewDocument(row?.data,{environment,viewKey,identity,activationEpoch,collection,recordId:id});revisions[collection][id]=row.data.revision;(row.data.deleted?tombstones[collection]:active[collection]).set(id,row.data)}}return{active,tombstones,revisions};
}
function makePayload({type,environment,viewKey,identity,activationEpoch,collection,item,revision,publishId,sourceRecordHash}){return{schema:ROLE_RECORD_VIEW_SCHEMA,environment,companyId:'danbridge',viewKey,...identity,activationEpoch,collection,recordId:item.recordId,record:clone(item.record),recordIndex:item.recordIndex,revision,deleted:type==='delete',lastPublishId:publishId,sourceRecordHash}}
function countsAfter(current,target){
 const collectionActiveCounts={},collectionDocumentCounts={},collectionTombstoneCounts={};let documentCount=0,activeCount=0,tombstoneCount=0;
 for(const collection of FULL_RECORD_COLLECTIONS){const targetIds=new Set(target[collection].map(row=>row.recordId)),allIds=new Set([...current.active[collection].keys(),...current.tombstones[collection].keys(),...targetIds]);collectionActiveCounts[collection]=targetIds.size;collectionDocumentCounts[collection]=allIds.size;collectionTombstoneCounts[collection]=allIds.size-targetIds.size;documentCount+=allIds.size;activeCount+=targetIds.size;tombstoneCount+=allIds.size-targetIds.size}
 return{collectionActiveCounts,collectionDocumentCounts,collectionTombstoneCounts,documentCount,activeCount,tombstoneCount};
}
export function assertRoleRecordViewControl(value,{environment,identity,activationEpoch}={}){
 assertExactFields(value,controlCoreFields,controlAuditFields,'角色逐筆控制');const scope=normalizeRoleRecordViewIdentity(value),expected=normalizeRoleRecordViewIdentity(identity??value),expectedEpoch=activationEpoch??value.activationEpoch;
 if(value.schema!==ROLE_RECORD_VIEW_CONTROL_SCHEMA||value.environment!==environment||value.companyId!=='danbridge'||value.viewKey!==roleRecordViewKey(scope,value.activationEpoch)||!same(scope,expected)||value.activationEpoch!==expectedEpoch||value.state!=='active'||!Number.isSafeInteger(value.revision)||value.revision<1||!token(value.publishId)||!hash(value.sourceRecordHash)||!hash(value.viewHash)||value.collectionCount!==FULL_RECORD_COLLECTIONS.length||!value.collectionActiveCounts||!value.collectionDocumentCounts||!value.collectionTombstoneCounts||!Number.isSafeInteger(value.documentCount)||!Number.isSafeInteger(value.activeCount)||!Number.isSafeInteger(value.tombstoneCount)||value.documentCount!==value.activeCount+value.tombstoneCount||!timestamp(value.publishedAt)||value.readTakeover!==true)throw new Error('角色逐筆控制 identity 無效');
 let documents=0,active=0,tombstones=0;for(const map of [value.collectionActiveCounts,value.collectionDocumentCounts,value.collectionTombstoneCounts])if(!same(Object.keys(map).sort(),[...FULL_RECORD_COLLECTIONS].sort()))throw new Error('角色逐筆控制集合筆數欄位不完整');for(const collection of FULL_RECORD_COLLECTIONS){for(const [map,label] of [[value.collectionActiveCounts,'active'],[value.collectionDocumentCounts,'document'],[value.collectionTombstoneCounts,'tombstone']])if(!Number.isSafeInteger(map[collection])||map[collection]<0)throw new Error(`角色逐筆控制 ${label} count 無效`);if(value.collectionDocumentCounts[collection]!==value.collectionActiveCounts[collection]+value.collectionTombstoneCounts[collection])throw new Error('角色逐筆控制集合筆數不守恆');documents+=value.collectionDocumentCounts[collection];active+=value.collectionActiveCounts[collection];tombstones+=value.collectionTombstoneCounts[collection]}
 if(documents!==value.documentCount||active!==value.activeCount||tombstones!==value.tombstoneCount)throw new Error('角色逐筆控制總筆數不符');return value;
}

export function buildRoleRecordViewPlan(documentsByCollection,targetDb,{environment='staging',identity,activationEpoch,sourceRecordHash,publishId,publishedAt,batchSize=400,currentControl=null}={}){
 if(environment!=='staging'||!token(activationEpoch)||!hash(sourceRecordHash)||!token(publishId)||!timestamp(publishedAt)||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>400)throw new Error('角色逐筆檢視計畫輸入無效');const scope=normalizeRoleRecordViewIdentity(identity),viewKey=roleRecordViewKey(scope,activationEpoch),current=readCurrent(documentsByCollection,{environment,viewKey,identity:scope,activationEpoch}),target=materializeFullRecordDb(targetDb),operations=[];
 for(const collection of FULL_RECORD_COLLECTIONS){const next=new Map(target[collection].map(item=>[item.recordId,item]));for(const item of target[collection]){const old=current.active[collection].get(item.recordId),tombstone=current.tombstones[collection].get(item.recordId);if(old&&same(old.record,item.record)&&old.recordIndex===item.recordIndex)continue;const before=old||tombstone,revision=(before?.revision??0)+1,type=old?'update':(tombstone?'revive':'create');operations.push({type,path:`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${collection}/records/${item.recordId}`,collection,recordId:item.recordId,beforeRevision:before?.revision??0,payload:makePayload({type,environment,viewKey,identity:scope,activationEpoch,collection,item,revision,publishId,sourceRecordHash})})}for(const [id,old] of current.active[collection])if(!next.has(id)){const item={recordId:id,record:clone(old.record),recordIndex:old.recordIndex};operations.push({type:'delete',path:`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${collection}/records/${id}`,collection,recordId:id,beforeRevision:old.revision,payload:makePayload({type:'delete',environment,viewKey,identity:scope,activationEpoch,collection,item,revision:old.revision+1,publishId,sourceRecordHash})})}}
 const counts=countsAfter(current,target),viewHash=recordDataHash(targetDb);let baseControl=null;if(currentControl){assertRoleRecordViewControl(currentControl,{environment});if(currentControl.email!==scope.email)throw new Error('角色逐筆控制帳號不一致');baseControl=controlCore(currentControl)}const controlUnchanged=baseControl&&baseControl.viewKey===viewKey&&same(normalizeRoleRecordViewIdentity(baseControl),scope)&&baseControl.activationEpoch===activationEpoch&&baseControl.sourceRecordHash===sourceRecordHash&&baseControl.viewHash===viewHash&&same(baseControl.collectionActiveCounts,counts.collectionActiveCounts)&&same(baseControl.collectionDocumentCounts,counts.collectionDocumentCounts)&&same(baseControl.collectionTombstoneCounts,counts.collectionTombstoneCounts),control=controlUnchanged?baseControl:{schema:ROLE_RECORD_VIEW_CONTROL_SCHEMA,environment,companyId:'danbridge',viewKey,...scope,activationEpoch,state:'active',revision:(baseControl?.revision??0)+1,publishId,sourceRecordHash,viewHash,collectionCount:FULL_RECORD_COLLECTIONS.length,...counts,publishedAt,readTakeover:true},batches=[];for(let offset=0;offset<operations.length;offset+=batchSize)batches.push({index:batches.length,operations:operations.slice(offset,offset+batchSize)});return{schema:'danbridge-role-record-view-plan-v1',environment,companyId:'danbridge',viewKey,identity:scope,activationEpoch,sourceRecordHash,publishId,viewHash,operations,batches,writes:operations.length,baseControlRevision:baseControl?.revision??0,controlChanged:!controlUnchanged,control};
}

export function rebuildRoleRecordViewDb(documentsByCollection,{environment='staging',identity,activationEpoch,viewKey=roleRecordViewKey(identity,activationEpoch),allowIncompleteChanges=false}={}){
 const scope=normalizeRoleRecordViewIdentity(identity),current=readCurrent(documentsByCollection,{environment,viewKey,identity:scope,activationEpoch}),db={};let documentCount=0,activeCount=0,tombstoneCount=0;const collectionActiveCounts={},collectionDocumentCounts={},collectionTombstoneCounts={};
 for(const collection of FULL_RECORD_COLLECTIONS){const rows=[...current.active[collection].values()];collectionActiveCounts[collection]=rows.length;collectionDocumentCounts[collection]=rows.length+current.tombstones[collection].size;collectionTombstoneCounts[collection]=current.tombstones[collection].size;documentCount+=collectionDocumentCounts[collection];activeCount+=rows.length;tombstoneCount+=current.tombstones[collection].size;if(collection==='changes'){rows.sort((a,b)=>a.recordIndex-b.recordIndex||a.recordId.localeCompare(b.recordId));if(!allowIncompleteChanges)rows.forEach((row,index)=>{if(row.recordIndex!==index)throw new Error('角色逐筆 changes 序號不連續')});db[collection]=rows.map(row=>clone(row.record)).reverse()}else{rows.sort((a,b)=>a.recordId.localeCompare(b.recordId));db[collection]=rows.map(row=>clone(row.record))}}
 return{db,viewHash:recordDataHash(db),documentCount,activeCount,tombstoneCount,collectionActiveCounts,collectionDocumentCounts,collectionTombstoneCounts,revisions:current.revisions};
}
export function verifyRoleRecordViewReadback(documentsByCollection,targetDb,{environment='staging',identity,activationEpoch,control}={}){
 const rebuilt=rebuildRoleRecordViewDb(documentsByCollection,{environment,identity,activationEpoch});const expectedHash=recordDataHash(targetDb);if(rebuilt.viewHash!==expectedHash)throw new Error('角色逐筆完整讀回 hash 不符');if(control){assertRoleRecordViewControl(control,{environment,identity,activationEpoch});for(const field of ['viewHash','documentCount','activeCount','tombstoneCount'])if(control[field]!==rebuilt[field])throw new Error(`角色逐筆控制 ${field} 與讀回不符`);for(const field of ['collectionActiveCounts','collectionDocumentCounts','collectionTombstoneCounts'])if(!same(control[field],rebuilt[field]))throw new Error(`角色逐筆控制 ${field} 與讀回不符`)}return{...rebuilt,verified:true};
}

export function stripRoleRecordViewAudit(value,{control=false}={}){const core=control?controlCoreFields:recordCoreFields,audit=control?controlAuditFields:recordAuditFields;assertExactFields(value,core,audit,control?'角色逐筆控制':'角色逐筆文件');return control?controlCore(value):recordCore(value)}
