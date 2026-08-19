import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {isSafeCloudRecordId} from './cloud-change-record-identity.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCHEMA='danbridge-record-sync-v1-writer-session-registration-v1';
// This immutable document identifies a browser writer only. Journal, dirty,
// lease, heartbeat, drain and data-hash state belong to a later live-state contract.
export const RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCOPE='identity-only-no-live-state';
// Building or verifying this document never authorizes writes. A future adapter
// must use authoritative control and writer-generation state.
export const RECORD_SYNC_V1_WRITER_SESSION_AUTHORIZATION='authorization-neutral-future-adapter-control-and-generation-only';
export const RECORD_SYNC_V1_WRITER_SESSION_AUDIT_AUTHORITY='format-only-not-server-authority';
// This is a terminal generation. A future transition must stop here; it may
// never wrap to zero or another imprecise JavaScript number.
export const RECORD_SYNC_V1_WRITER_SESSION_MAX_WRITER_GENERATION=Number.MAX_SAFE_INTEGER;

const inputFields=['environment','companyId','activationEpoch','writerGeneration','sessionId','deviceId','tabId','actorUid','actorEmail','clientProtocolVersion','clientReleaseId','openedAt'];
const coreFields=['schema',...inputFields,'sessionIdentityHash'];
const auditFields=['persistedAt','persistedBy','persistedByEmail'];

function hasUnpairedSurrogate(value){
 for(let index=0;index<value.length;index++){
  const code=value.charCodeAt(index);
  if(code>=0xd800&&code<=0xdbff){
   const next=value.charCodeAt(index+1);
   if(!(next>=0xdc00&&next<=0xdfff))return true;
   index++;
  }else if(code>=0xdc00&&code<=0xdfff)return true;
 }
 return false;
}

const token=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const identityId=value=>token(value)&&isSafeCloudRecordId(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);
const display=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=200&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f]/.test(value);

function deepFreeze(value,seen=new Set()){
 if(value===null||typeof value!=='object'||seen.has(value))return value;
 seen.add(value);
 for(const child of Object.values(value))deepFreeze(child,seen);
 return Object.freeze(value);
}

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};
 for(const key of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');
  result[key]=descriptor.value;
 }
 return result;
}

function snapshotExpected(expected){
 if(expected===undefined)return null;
 return exact(expected,coreFields,'V1 writer session expected full immutable core');
}

function stripAudit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('V1 writer session registration 必須是 plain object');
 const keys=Reflect.ownKeys(value);
 const auditCount=auditFields.filter(key=>keys.includes(key)).length;
 if(auditCount!==0&&auditCount!==auditFields.length)throw new Error('V1 writer session registration audit 欄位必須 all-or-none');
 if(keys.length!==coreFields.length+auditCount||keys.some(key=>typeof key!=='string'||![...coreFields,...auditFields].includes(key)))throw new Error('V1 writer session registration 欄位無效');
 const core={};
 for(const key of coreFields){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('V1 writer session registration.'+key+' 必須是 enumerable data field');
  core[key]=descriptor.value;
 }
 if(auditCount){
  const persistedAt=Object.getOwnPropertyDescriptor(value,'persistedAt');
  const persistedBy=Object.getOwnPropertyDescriptor(value,'persistedBy');
  const persistedByEmail=Object.getOwnPropertyDescriptor(value,'persistedByEmail');
  if(!persistedAt?.enumerable||!('value' in persistedAt)||persistedAt.value==null||!persistedBy?.enumerable||!('value' in persistedBy)||!token(persistedBy.value)||!persistedByEmail?.enumerable||!('value' in persistedByEmail)||!email(persistedByEmail.value))throw new Error('V1 writer session registration audit 格式無效');
 }
 return core;
}

function assertIdentityFields(core){
 if(core.schema!==RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCHEMA||core.environment!=='staging'||core.companyId!=='danbridge'||!token(core.activationEpoch)||!Number.isSafeInteger(core.writerGeneration)||core.writerGeneration<1||!identityId(core.sessionId)||!identityId(core.deviceId)||!identityId(core.tabId)||core.sessionId===core.deviceId||core.sessionId===core.tabId||core.deviceId===core.tabId||!token(core.actorUid)||!email(core.actorEmail)||!Number.isSafeInteger(core.clientProtocolVersion)||core.clientProtocolVersion<1||!display(core.clientReleaseId)||!isStrictActiveRecordSaveTimestamp(core.openedAt))throw new Error('V1 writer session immutable identity 或 protocol 無效');
 return core;
}

function assertCanonicalCore(core){
 assertIdentityFields(core);
 if(typeof core.sessionIdentityHash!=='string'||!/^[a-f0-9]{64}$/.test(core.sessionIdentityHash))throw new Error('V1 writer session canonical identity hash 格式無效');
 const body={};
 for(const key of coreFields)if(key!=='sessionIdentityHash')body[key]=core[key];
 if(sha256Canonical(body)!==core.sessionIdentityHash)throw new Error('V1 writer session canonical identity hash 不符');
 return core;
}

function assertCore(core,expected){
 assertCanonicalCore(core);
 const replay=snapshotExpected(expected);
 if(replay!==null){
  assertCanonicalCore(replay);
  for(const key of coreFields)if(core[key]!==replay[key])throw new Error('V1 writer session expected immutable registration 不符');
 }
 return core;
}

export function buildRecordSyncV1WriterSessionRegistration(input){
 const value=exact(input,inputFields,'V1 writer session registration input');
 const body={schema:RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCHEMA};
 for(const key of inputFields)body[key]=value[key];
 assertIdentityFields(body);
 const registration={...body,sessionIdentityHash:sha256Canonical(body)};
 return deepFreeze(assertCore(registration));
}

export function stripRecordSyncV1WriterSessionRegistrationAudit(value){
 return deepFreeze(stripAudit(value));
}

export function assertRecordSyncV1WriterSessionRegistration(value,expected){
 return deepFreeze(assertCore(stripAudit(value),expected));
}
