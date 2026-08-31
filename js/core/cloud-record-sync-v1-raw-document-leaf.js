import {FULL_RECORD_COLLECTIONS,FULL_RECORD_SHADOW_SCHEMA} from './cloud-full-record-shadow.js';
import {assertChangeRecordIdentity,isSafeCloudRecordId} from './cloud-change-record-identity.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const RECORD_SYNC_V1_RAW_DOCUMENT_FIRESTORE_POLICY='timestamp-audit-only-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_VALUE_SCOPE='web-sdk-semantic-values-not-firestore-wire-type';
export const RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE='audit-presence-observation-not-cutover-authorization';
export const RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_INTEGRITY_SCOPE='self-hash-only-not-document-authority';
export const RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA='danbridge-record-sync-v1-raw-normalized-document-v1';
export const RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA='danbridge-record-sync-v1-raw-document-leaf-v1';
export const RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA='danbridge-firestore-semantic-value-v1';

const ZERO_HASH='0'.repeat(64);
const rawCoreFields=['schema','companyId','collection','recordId','record','recordIndex','sourceHash','revision','deleted','environment'];
const rawAuditFields=['updatedAt','updatedBy','updatedByEmail'];
const rawOperationAuditFields=['activationEpoch','deviceId','lastOperationId'];
const timestampFields=['schema','type','seconds','nanoseconds'];
const normalizedFields=['schema','documentId','environment','companyId','collection','recordId','record','recordIndex','sourceHash','revision','deleted','auditState','audit'];
const normalizedAuditFields=['updatedAt','updatedBy','updatedByEmail'];
const leafFields=['schema','environment','companyId','collection','recordId','recordIndex','revision','deleted','sourceHash','recordValueHash','documentCoreHash','auditState','auditHash','leafHash'];
const expectedFields=['normalizedDocument'];
const encoder=new TextEncoder();
const MIN_FIRESTORE_SECONDS=-62135596800n;
const MAX_FIRESTORE_SECONDS=253402300799n;

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}
 return result;
}

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
function validString(value){return typeof value==='string'&&!hasUnpairedSurrogate(value)}
function compareUtf8(left,right){const a=encoder.encode(left),b=encoder.encode(right),length=Math.min(a.length,b.length);for(let index=0;index<length;index++)if(a[index]!==b[index])return a[index]-b[index];return a.length-b.length}
function validDocumentId(value){return isSafeCloudRecordId(value)&&!value.includes('/')}
function validSourceHash(value){return validString(value)&&value===value.trim()&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value)}
function validActor(value){return validString(value)&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value)}
function validEmail(value){return validString(value)&&value===value.trim().toLowerCase()&&value.length>0&&value.length<=320&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value)}
function validOperationToken(value){return validString(value)&&value===value.trim()&&value.length>0&&value.length<=1500&&!/[\u0000-\u001f\u007f/]/.test(value)}
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;

function scalarAst(type,value){return value===undefined?{t:type}:{t:type,v:value}}
function mapAst(entries){return{t:'map',v:entries.sort(([left],[right])=>compareUtf8(left,right)).map(([key,value])=>({k:key,v:value}))}}

function cloneJsonAndAst(value,stack,path){
 if(value===null)return{value:null,ast:scalarAst('null')};
 if(typeof value==='string'){if(hasUnpairedSurrogate(value))throw new Error(path+' 包含 unpaired surrogate');return{value,ast:scalarAst('string',value)}}
 if(typeof value==='boolean')return{value,ast:scalarAst('boolean',value)};
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0)||Number.isInteger(value)&&!Number.isSafeInteger(value))throw new Error(path+' 不是 lossless Web SDK semantic number');return{value,ast:scalarAst('number',value)}}
 if(['undefined','bigint','function','symbol'].includes(typeof value))throw new Error(path+' 不是 lossless JSON value');
 if(typeof value!=='object')throw new Error(path+' 不是 lossless JSON value');
 if(stack.has(value))throw new Error(path+' 包含 cycle');
 stack.add(value);
 try{
  if(Array.isArray(value)){
   const keys=Reflect.ownKeys(value);
   for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key))throw new Error(path+' array 包含 extra 或 symbol 欄位');const index=Number(key);if(!Number.isSafeInteger(index)||index<0||index>=value.length||String(index)!==key)throw new Error(path+' array index 無效')}
   const clone=[],items=[];
   for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor)throw new Error(path+' 包含 sparse array hole');if(!descriptor.enumerable||!('value' in descriptor))throw new Error(path+' array 包含 accessor 或 non-enumerable');const child=cloneJsonAndAst(descriptor.value,stack,path+'['+index+']');clone.push(child.value);items.push(child.ast)}
   return{value:clone,ast:{t:'array',v:items}};
  }
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new Error(path+' 不是 plain JSON object');
  const clone={},entries=[];
  for(const key of Reflect.ownKeys(value)){
   if(typeof key!=='string')throw new Error(path+' 包含 symbol key');
   if(hasUnpairedSurrogate(key))throw new Error(path+' map key 包含 unpaired surrogate');
   const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(path+'.'+key+' 是 accessor 或 non-enumerable');
   const child=cloneJsonAndAst(descriptor.value,stack,path+'.'+key);Object.defineProperty(clone,key,{value:child.value,enumerable:true,writable:true,configurable:true});entries.push([key,child.ast]);
  }
  return{value:clone,ast:mapAst(entries)};
 }finally{stack.delete(value)}
}

function normalizeTimestamp(value){
 const tag=exact(value,timestampFields,'V1 raw updatedAt timestamp');
 if(tag.schema!==RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA||tag.type!=='timestamp'||typeof tag.seconds!=='string'||tag.seconds.length>12||!/^(?:0|-[1-9]\d*|[1-9]\d*)$/.test(tag.seconds)||!Number.isSafeInteger(tag.nanoseconds)||tag.nanoseconds<0||tag.nanoseconds>999999999)throw new Error('V1 raw updatedAt timestamp 格式無效');
 let seconds;try{seconds=BigInt(tag.seconds)}catch{throw new Error('V1 raw updatedAt timestamp seconds 無效')}
 if(seconds<MIN_FIRESTORE_SECONDS||seconds>MAX_FIRESTORE_SECONDS)throw new Error('V1 raw updatedAt timestamp 超出 Firestore UTC 範圍');
 return{value:{schema:tag.schema,type:tag.type,seconds:tag.seconds,nanoseconds:tag.nanoseconds},ast:{t:'timestamp',seconds:tag.seconds,nanoseconds:tag.nanoseconds}};
}

function auditShape(value,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value),operationCount=rawOperationAuditFields.filter(key=>keys.includes(key)).length,allowed=[...normalizedAuditFields,...rawOperationAuditFields];
 if(operationCount!==0&&operationCount!==rawOperationAuditFields.length)throw new Error(label+' operation 欄位必須 all-or-none');
 if(keys.length!==normalizedAuditFields.length+operationCount||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))throw new Error(label+' 欄位無效');
 const result={};for(const key of operationCount?allowed:normalizedAuditFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}
 return result;
}

export function assertRecordSyncV1RawNormalizedAudit(value){
 const audit=auditShape(value,'V1 raw normalized audit'),timestamp=normalizeTimestamp(audit.updatedAt),result={updatedAt:timestamp.value,updatedBy:audit.updatedBy,updatedByEmail:audit.updatedByEmail};
 if(!validActor(result.updatedBy)||!validEmail(result.updatedByEmail))throw new Error('V1 raw audit actor 或 email 無效');
 if('activationEpoch' in audit){const {activationEpoch,deviceId,lastOperationId}=audit,prefix=deviceId+':',sequence=lastOperationId.startsWith(prefix)?lastOperationId.slice(prefix.length):'';if(!validOperationToken(activationEpoch)||!validOperationToken(deviceId)||!validOperationToken(lastOperationId)||!/^[1-9]\d*$/.test(sequence)||!Number.isSafeInteger(Number(sequence)))throw new Error('V1 raw operation audit identity 無效');Object.assign(result,{activationEpoch,deviceId,lastOperationId})}
 return deepFreeze(result);
}

function splitRawData(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('V1 raw data 必須是 plain object');
 const keys=Reflect.ownKeys(value),auditCount=rawAuditFields.filter(key=>keys.includes(key)).length,operationCount=rawOperationAuditFields.filter(key=>keys.includes(key)).length;
 if(auditCount!==0&&auditCount!==rawAuditFields.length)throw new Error('V1 raw data audit 欄位必須 all-or-none');
 if(operationCount!==0&&operationCount!==rawOperationAuditFields.length)throw new Error('V1 raw data operation audit 欄位必須 all-or-none');
 if(operationCount&&auditCount!==rawAuditFields.length)throw new Error('V1 raw data operation audit 必須綁定完整 server audit');
 if(keys.length!==rawCoreFields.length+auditCount+operationCount||keys.some(key=>typeof key!=='string'||![...rawCoreFields,...rawAuditFields,...rawOperationAuditFields].includes(key)))throw new Error('V1 raw data 欄位無效');
 const core={};for(const key of rawCoreFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('V1 raw data.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(!auditCount)return{core,audit:null};
 const audit={};for(const key of [...rawAuditFields,...(operationCount?rawOperationAuditFields:[])]){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('V1 raw data.'+key+' 必須是 enumerable data field');audit[key]=descriptor.value}
 return{core,audit};
}

function validateIdentity(documentId,core,record){
 if(core.schema!==FULL_RECORD_SHADOW_SCHEMA||core.environment!=='staging'||core.companyId!=='danbridge'||!FULL_RECORD_COLLECTIONS.includes(core.collection)||!validDocumentId(documentId)||core.recordId!==documentId||!validSourceHash(core.sourceHash)||!Number.isSafeInteger(core.revision)||core.revision<1||typeof core.deleted!=='boolean')throw new Error('V1 raw document identity、revision、sourceHash 或 deleted 無效');
 if(core.collection==='changes'){
  if(!Number.isSafeInteger(core.recordIndex)||core.recordIndex<0)throw new Error('V1 raw changes recordIndex 無效');
  assertChangeRecordIdentity({recordIndex:core.recordIndex,recordId:documentId,record});
 }else if(core.recordIndex!==null||typeof record.id!=='string'||record.id!==documentId)throw new Error('V1 raw nonchanges record identity 無效');
}

function normalizedToInput(normalized){
 const value=exact(normalized,normalizedFields,'V1 raw normalized document'),data={schema:FULL_RECORD_SHADOW_SCHEMA,companyId:value.companyId,collection:value.collection,recordId:value.recordId,record:value.record,recordIndex:value.recordIndex,sourceHash:value.sourceHash,revision:value.revision,deleted:value.deleted,environment:value.environment};
 if(value.schema!==RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA||value.documentId!==value.recordId||!['absent','present'].includes(value.auditState)||(value.auditState==='absent')!==(value.audit===null))throw new Error('V1 raw normalized document 格式無效');
 if(value.auditState==='present')Object.assign(data,assertRecordSyncV1RawNormalizedAudit(value.audit));
 return{documentId:value.documentId,data};
}

function prepareRecordSyncV1RawDocument(input){
 const raw=exact(input,['documentId','data'],'V1 raw document input');
 if(typeof raw.documentId!=='string')throw new Error('V1 raw documentId 必須是 string');
 const {core,audit}=splitRawData(raw.data),recordResult=cloneJsonAndAst(core.record,new Set(),'V1 raw record');
 if(recordResult.value===null||Array.isArray(recordResult.value)||typeof recordResult.value!=='object')throw new Error('V1 raw record 必須是 non-null plain object');
 validateIdentity(raw.documentId,core,recordResult.value);
 let normalizedAudit=null,auditAst=null;
 // A future adapter must convert the Firebase SDK Timestamp to this tagged,
 // nanosecond-preserving value first. SDK class instances fail closed here.
 if(audit){normalizedAudit=assertRecordSyncV1RawNormalizedAudit(audit);const timestamp=normalizeTimestamp(normalizedAudit.updatedAt),entries=[['updatedAt',timestamp.ast],['updatedBy',scalarAst('string',normalizedAudit.updatedBy)],['updatedByEmail',scalarAst('string',normalizedAudit.updatedByEmail)]];if('activationEpoch' in normalizedAudit)entries.push(['activationEpoch',scalarAst('string',normalizedAudit.activationEpoch)],['deviceId',scalarAst('string',normalizedAudit.deviceId)],['lastOperationId',scalarAst('string',normalizedAudit.lastOperationId)]);auditAst=mapAst(entries)}
 const normalizedDocument=deepFreeze({schema:RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA,documentId:raw.documentId,environment:core.environment,companyId:core.companyId,collection:core.collection,recordId:core.recordId,record:recordResult.value,recordIndex:core.recordIndex,sourceHash:core.sourceHash,revision:core.revision,deleted:core.deleted,auditState:normalizedAudit?'present':'absent',audit:normalizedAudit});
 return{normalizedDocument,recordAst:recordResult.ast,auditAst};
}

export function normalizeRecordSyncV1RawDocument(input){return prepareRecordSyncV1RawDocument(input).normalizedDocument}

function buildFromPrepared({normalizedDocument:value,recordAst,auditAst}){
 const coreAst=mapAst([
  ['schema',scalarAst('string',FULL_RECORD_SHADOW_SCHEMA)],['companyId',scalarAst('string',value.companyId)],['collection',scalarAst('string',value.collection)],['recordId',scalarAst('string',value.recordId)],['record',recordAst],['recordIndex',value.recordIndex===null?scalarAst('null'):scalarAst('number',value.recordIndex)],['sourceHash',scalarAst('string',value.sourceHash)],['revision',scalarAst('number',value.revision)],['deleted',scalarAst('boolean',value.deleted)],['environment',scalarAst('string',value.environment)]
 ]);
 const recordValueHash=sha256Canonical(recordAst),documentCoreHash=sha256Canonical(coreAst),auditHash=value.auditState==='present'?sha256Canonical(auditAst):ZERO_HASH;
 const body={schema:RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA,environment:value.environment,companyId:value.companyId,collection:value.collection,recordId:value.recordId,recordIndex:value.recordIndex,revision:value.revision,deleted:value.deleted,sourceHash:value.sourceHash,recordValueHash,documentCoreHash,auditState:value.auditState,auditHash};
 return deepFreeze({...body,leafHash:sha256Canonical(body)});
}

function buildFromNormalized(normalized){return buildFromPrepared(prepareRecordSyncV1RawDocument(normalizedToInput(normalized)))}

export function normalizeAndBuildRecordSyncV1RawDocumentLeaf(input){const prepared=prepareRecordSyncV1RawDocument(input),leaf=buildFromPrepared(prepared);return deepFreeze({normalizedDocument:prepared.normalizedDocument,leaf})}

export function buildRecordSyncV1RawDocumentLeaf(input){return normalizeAndBuildRecordSyncV1RawDocumentLeaf(input).leaf}

function assertLeafFields(leaf){
 const validAudit=leaf.auditState==='absent'?leaf.auditHash===ZERO_HASH:leaf.auditState==='present'&&digest(leaf.auditHash);
 if(leaf.schema!==RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA||leaf.environment!=='staging'||leaf.companyId!=='danbridge'||!FULL_RECORD_COLLECTIONS.includes(leaf.collection)||!validDocumentId(leaf.recordId)||!Number.isSafeInteger(leaf.revision)||leaf.revision<1||typeof leaf.deleted!=='boolean'||!validSourceHash(leaf.sourceHash)||!digest(leaf.recordValueHash)||!digest(leaf.documentCoreHash)||!validAudit||!digest(leaf.leafHash))throw new Error('V1 raw leaf 格式無效');
 if((leaf.collection==='changes')!==Number.isSafeInteger(leaf.recordIndex)||(leaf.collection==='changes'&&leaf.recordIndex<0)||(leaf.collection!=='changes'&&leaf.recordIndex!==null))throw new Error('V1 raw leaf recordIndex 無效');
 const body={...leaf};delete body.leafHash;if(sha256Canonical(body)!==leaf.leafHash)throw new Error('V1 raw leaf canonical hash 不符');
 return leaf;
}

export function assertRecordSyncV1RawDocumentLeafIntegrity(value){
 return deepFreeze(assertLeafFields(exact(value,leafFields,'V1 raw leaf')));
}

export function assertRecordSyncV1RawDocumentLeaf(value,expected){
 const leaf=assertRecordSyncV1RawDocumentLeafIntegrity(value),links=exact(expected,expectedFields,'V1 raw leaf expected'),rebuilt=buildFromNormalized(links.normalizedDocument);
 for(const key of leafFields)if(leaf[key]!==rebuilt[key])throw new Error('V1 raw leaf expected normalized document 不符');
 return deepFreeze(leaf);
}
