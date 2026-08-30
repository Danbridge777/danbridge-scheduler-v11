import {FULL_RECORD_COLLECTIONS,FULL_RECORD_SHADOW_SCHEMA} from './cloud-full-record-shadow.js';
import {assertChangeRecordIdentity} from './cloud-change-record-identity.js';
import {isStrictActiveRecordSaveTimestamp,preflightActiveRecordSaveLocalEnvelopes,strictCloneActiveRecordSaveValue} from './cloud-active-record-save-plan.js';
import {activeRecordAuthoritySaveV2DailyRecordEnvelope,assertActiveRecordAuthoritySaveCurrentV2Integrity} from './cloud-active-record-authority-save-chain-v2.js';

export const STAGING_V2_ACTIVE_RECORD_BROWSER_BRIDGE_SCOPE='staging-only-verified-current-authority-bundle-to-owner-read-model-and-persisted-one-operation-save-replay';
const collectionSet=new Set(FULL_RECORD_COLLECTIONS);

function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=descriptor.value}return out}
function token(value,max=128){return typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=max&&/^[A-Za-z0-9_.:-]+$/.test(value)}
function email(value){return typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function freeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('staging V2 bridge unsafe descriptor');freeze(descriptor.value,seen)}return Object.freeze(value)}

export function normalizeStagingV2FirestoreValue(value,seen=new Set(),path='value'){
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new Error(path+' invalid number');return value}
 if(typeof value!=='object'||seen.has(value))throw new Error(path+' invalid Firestore value');
 if(typeof value.toDate==='function'){
  const date=value.toDate();if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new Error(path+' invalid Firestore timestamp');return date.toISOString();
 }
 seen.add(value);
 try{
  if(Array.isArray(value)){if(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw new Error(path+' invalid array');return value.map((_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(path+' invalid array item');return normalizeStagingV2FirestoreValue(descriptor.value,seen,`${path}[${index}]`)})}
  if(!plain(value))throw new Error(path+' invalid object');const out={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw new Error(path+' invalid key');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(path+'.'+key+' invalid field');out[key]=normalizeStagingV2FirestoreValue(descriptor.value,seen,path+'.'+key)}return out;
 }finally{seen.delete(value)}
}

function changeIndex(recordId,record){const match=/^seq_(\d{8,})_[0-9a-f]{8}$/.exec(recordId);if(!match)throw new Error('staging V2 changes recordId invalid');const index=Number(match[1]);assertChangeRecordIdentity({recordIndex:index,recordId,record});return index}
function shadowFromEnvelope(envelope){const recordIndex=envelope.collection==='changes'?changeIndex(envelope.recordId,envelope.record):null;return{schema:FULL_RECORD_SHADOW_SCHEMA,companyId:'danbridge',collection:envelope.collection,recordId:envelope.recordId,record:strictCloneActiveRecordSaveValue(envelope.record),recordIndex,sourceHash:envelope.recordHash,revision:envelope.revision,deleted:envelope.deleted,environment:'staging'}}

export function stagingV2AuthoritySnapshotToFullRecordDocuments(raw){
 const input=exact(raw,['currentBundle','recordsByCollection'],'staging V2 authority snapshot'),normalizedBundle=normalizeStagingV2FirestoreValue(input.currentBundle),verified=assertActiveRecordAuthoritySaveCurrentV2Integrity(normalizedBundle),head=verified.resultHead,records=exact(input.recordsByCollection,FULL_RECORD_COLLECTIONS,'staging V2 record collections'),documents={};
 for(const collection of FULL_RECORD_COLLECTIONS){const rows=records[collection];if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)throw new Error('staging V2 '+collection+' records invalid');const seen=new Set();documents[collection]=rows.map((rawRow,index)=>{const row=exact(rawRow,['id','data'],'staging V2 '+collection+' row '+index),id=String(row.id);if(seen.has(id))throw new Error('staging V2 duplicate record');seen.add(id);const envelope=activeRecordAuthoritySaveV2DailyRecordEnvelope(normalizeStagingV2FirestoreValue(row.data),head);if(envelope.collection!==collection||envelope.recordId!==id)throw new Error('staging V2 record path identity mismatch');return{id,data:shadowFromEnvelope(envelope)}})}
 return freeze({scope:STAGING_V2_ACTIVE_RECORD_BROWSER_BRIDGE_SCOPE,activationEpoch:head.activationEpoch,headRevision:head.revision,headHash:head.headHash,documentsByCollection:documents});
}

function operation(raw){
 if(!plain(raw)||raw.schema!=='danbridge-active-record-operation-v1'||raw.environment!=='staging'||raw.companyId!=='danbridge'||!token(raw.activationEpoch)||!token(raw.operationId,110)||!token(raw.deviceId)||!isStrictActiveRecordSaveTimestamp(raw.createdAt)||!collectionSet.has(raw.collection)||raw.collection==='changes'||typeof raw.recordId!=='string'||raw.recordId.length<1||raw.operationId!==raw.operationId.trim()||!Number.isSafeInteger(raw.baseRevision)||raw.baseRevision<0||raw.nextRevision!==raw.baseRevision+1||!plain(raw.payload)||raw.payload.recordId!==raw.recordId||raw.payload.collection!==raw.collection||raw.payload.revision!==raw.nextRevision||typeof raw.payload.deleted!=='boolean')throw new Error('staging V2 journal operation invalid');
 const prepared=preflightActiveRecordSaveLocalEnvelopes({activationEpoch:raw.activationEpoch,changedKeys:[{collection:raw.collection,recordId:raw.recordId}],baselineRecords:[raw.baselineRecord],localRecords:[raw.localRecord]});
 if(prepared.baselineRecords[0].revision!==raw.baseRevision||prepared.localRecords[0].revision!==raw.baseRevision||prepared.localRecords[0].deleted!==raw.payload.deleted)throw new Error('staging V2 journal envelope mismatch');
 return{row:raw,prepared};
}

export function createStagingV2ActiveRecordOperationSender(raw){
 const input=exact(raw,['browserClient','getActor'],'staging V2 operation sender config');if(typeof input.browserClient?.save!=='function'||typeof input.getActor!=='function')throw new Error('staging V2 operation sender config invalid');
 return Object.freeze({scope:STAGING_V2_ACTIVE_RECORD_BROWSER_BRIDGE_SCOPE,async apply(rawOperation){
  const {row,prepared}=operation(rawOperation),actor=input.getActor(),uid=actor?.uid,emailValue=String(actor?.email??'').trim().toLowerCase();if(!token(uid)||!email(emailValue))throw new Error('staging V2 operation actor invalid');
  const response=await input.browserClient.save({save:{saveId:row.operationId,deviceId:row.deviceId,actorUid:uid,actorEmail:emailValue,createdAt:row.createdAt},changedKeys:prepared.changedKeys,baselineRecords:prepared.baselineRecords,localRecords:prepared.localRecords});
  if(!response||response.saveId!==row.operationId||response.activationEpoch!==row.activationEpoch||response.operationCount!==1||!['created','replayed'].includes(response.transactionState))throw new Error('staging V2 operation completion mismatch');
  return Object.freeze({kind:response.transactionState==='replayed'?'duplicate':(row.type==='delete'?'tombstone':row.type),write:response.transactionState==='created',revision:row.nextRevision,activationEpoch:response.activationEpoch,resultHeadHash:response.resultHeadHash,commitHash:response.commitHash,saveId:response.saveId,persistedAt:response.persistedAt});
 }})
}
