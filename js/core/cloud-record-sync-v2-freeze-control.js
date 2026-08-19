import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {isSafeCloudRecordId} from './cloud-change-record-identity.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const RECORD_SYNC_V2_FREEZE_REQUEST_SCHEMA='danbridge-record-sync-v2-freeze-request-v1';
export const RECORD_SYNC_V2_FREEZE_CONTROL_SCHEMA='danbridge-record-sync-v2-freeze-control-v1';
// Preflight source/backup hashes help choose rollback material only. A future
// authoritative session snapshot + drain + hard pause must establish freeze.
export const RECORD_SYNC_V2_FREEZE_PREFLIGHT_AUTHORITY='rollback-hint-only';
export const RECORD_SYNC_V2_FREEZE_OPERATION_POLICY='hard-pause-all-v1-no-drain';
export const RECORD_SYNC_V2_FREEZE_CONTROL_SCOPE='requested-intent-only-not-current-phase';
// A requested freeze authorizes no V1 operation, including previously queued
// work. If any device is dirty or pending, a future audited abort/resume must
// restore V1 first; only after it reaches zero may a fresh freeze be retried.

const ZERO_HASH='0'.repeat(64);
const requestInputFields=['environment','companyId','freezeId','activationEpoch','sourceWriterGeneration','targetWriterGeneration','targetV2Epoch','sourceWriterControlHash','minClientProtocolVersion','minClientReleaseId','rulesetHash','preflightRecordDataHash','preflightRawDocumentRoot','preflightBackupId','preflightBackupManifestHash','createdAt'];
const requestCoreFields=['schema',...requestInputFields,'requestHash'];
const controlCoreFields=['schema','environment','companyId','freezeId','activationEpoch','targetV2Epoch','phase','revision','requestHash','sourceWriterGeneration','targetWriterGeneration','acceptNewSessions','acceptNewMutations','allowDrainOperations','writerProtocol','sessionSnapshotHash','drainEvidenceHash','hardPauseEventHash','controlHash'];
const auditFields=['persistedAt','persistedBy','persistedByEmail'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);
const display=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=200&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f]/.test(value);
const generation=value=>Number.isSafeInteger(value)&&value>=1;

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function exact(value,fields,label){if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(`${label} 必須是 plain object`);const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(`${label} 欄位無效`);const result={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${label}.${key} 必須是 enumerable data field`);result[key]=descriptor.value}return result}
function snapshotExpected(value,fields,label){if(value===undefined)return{};if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(`${label} 必須是 plain object`);const result={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string'||!fields.includes(key))throw new Error(`${label} 欄位無效`);const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${label}.${key} 必須是 enumerable data field`);result[key]=descriptor.value}return result}
function stripAudit(value,coreFields,label){if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(`${label} 必須是 plain object`);const keys=Reflect.ownKeys(value),auditCount=auditFields.filter(key=>keys.includes(key)).length;if(auditCount!==0&&auditCount!==auditFields.length)throw new Error(`${label} audit 欄位必須 all-or-none`);const allowed=[...coreFields,...auditFields];if(keys.some(key=>typeof key!=='string'||!allowed.includes(key)))throw new Error(`${label} 欄位無效`);const core=exact(Object.fromEntries(coreFields.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${label}.${key} 必須是 enumerable data field`);return[key,descriptor.value]})),coreFields,label);if(auditCount){const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,'persistedBy'),mail=Object.getOwnPropertyDescriptor(value,'persistedByEmail');if(!at?.enumerable||!('value'in at)||at.value==null||!uid?.enumerable||!('value'in uid)||!token(uid.value)||!mail?.enumerable||!('value'in mail)||!email(mail.value))throw new Error(`${label} audit identity 無效`)}return core}

export function stripRecordSyncV2FreezeRequestAudit(value){return deepFreeze(stripAudit(value,requestCoreFields,'V2 freeze request'))}
export function stripRecordSyncV2FreezeControlAudit(value){return deepFreeze(stripAudit(value,controlCoreFields,'V2 freeze control'))}

function assertRequestFields(core){
 if(core.schema!==RECORD_SYNC_V2_FREEZE_REQUEST_SCHEMA||core.environment!=='staging'||core.companyId!=='danbridge'||!token(core.freezeId)||!token(core.activationEpoch)||!generation(core.sourceWriterGeneration)||!generation(core.targetWriterGeneration)||core.targetWriterGeneration!==core.sourceWriterGeneration+1||!token(core.targetV2Epoch)||new Set([core.freezeId,core.activationEpoch,core.targetV2Epoch]).size!==3||!hash(core.sourceWriterControlHash)||core.sourceWriterControlHash===ZERO_HASH||!Number.isSafeInteger(core.minClientProtocolVersion)||core.minClientProtocolVersion<1||!display(core.minClientReleaseId)||!hash(core.rulesetHash)||core.rulesetHash===ZERO_HASH||!recordHash(core.preflightRecordDataHash)||core.preflightRecordDataHash===`record-v1:${ZERO_HASH}`||!hash(core.preflightRawDocumentRoot)||core.preflightRawDocumentRoot===ZERO_HASH||!isSafeCloudRecordId(core.preflightBackupId)||!hash(core.preflightBackupManifestHash)||core.preflightBackupManifestHash===ZERO_HASH||!isStrictActiveRecordSaveTimestamp(core.createdAt))throw new Error('V2 freeze request identity、generation、hash 或 timestamp 無效');
 return core;
}
function assertRequestCore(core,expected){
 const {activationEpoch,sourceWriterGeneration,targetWriterGeneration,targetV2Epoch,sourceWriterControlHash}=snapshotExpected(expected,['activationEpoch','sourceWriterGeneration','targetWriterGeneration','targetV2Epoch','sourceWriterControlHash'],'V2 freeze request expected');
 assertRequestFields(core);if(!hash(core.requestHash))throw new Error('V2 freeze request identity、generation、hash 或 timestamp 無效');
 if((activationEpoch!==undefined&&core.activationEpoch!==activationEpoch)||(sourceWriterGeneration!==undefined&&core.sourceWriterGeneration!==sourceWriterGeneration)||(targetWriterGeneration!==undefined&&core.targetWriterGeneration!==targetWriterGeneration)||(targetV2Epoch!==undefined&&core.targetV2Epoch!==targetV2Epoch)||(sourceWriterControlHash!==undefined&&core.sourceWriterControlHash!==sourceWriterControlHash))throw new Error('V2 freeze request epoch、generation 或 writer control 不符');const body={...core};delete body.requestHash;if(sha256Canonical(body)!==core.requestHash)throw new Error('V2 freeze request canonical hash 不符');return core;
}

export function buildRecordSyncV2FreezeRequest(input){
 const value=exact(input,requestInputFields,'V2 freeze request input'),body={schema:RECORD_SYNC_V2_FREEZE_REQUEST_SCHEMA,...value};assertRequestFields(body);const request={...body,requestHash:sha256Canonical(body)};return deepFreeze(assertRequestCore(request));
}
export function assertRecordSyncV2FreezeRequest(value,expected){return deepFreeze(assertRequestCore(stripAudit(value,requestCoreFields,'V2 freeze request'),expected))}

function assertControlCore(core,expected){
 const {request,activationEpoch,sourceWriterGeneration,targetWriterGeneration,targetV2Epoch}=snapshotExpected(expected,['request','activationEpoch','sourceWriterGeneration','targetWriterGeneration','targetV2Epoch'],'V2 freeze control expected');
 if(core.schema!==RECORD_SYNC_V2_FREEZE_CONTROL_SCHEMA||core.environment!=='staging'||core.companyId!=='danbridge'||!token(core.freezeId)||!token(core.activationEpoch)||!token(core.targetV2Epoch)||new Set([core.freezeId,core.activationEpoch,core.targetV2Epoch]).size!==3||core.phase!=='requested'||core.revision!==1||!hash(core.requestHash)||!generation(core.sourceWriterGeneration)||!generation(core.targetWriterGeneration)||core.targetWriterGeneration!==core.sourceWriterGeneration+1||core.acceptNewSessions!==false||core.acceptNewMutations!==false||core.allowDrainOperations!==false||core.writerProtocol!=='v1'||core.sessionSnapshotHash!==ZERO_HASH||core.drainEvidenceHash!==ZERO_HASH||core.hardPauseEventHash!==ZERO_HASH||!hash(core.controlHash))throw new Error('V2 freeze requested control 格式無效');
 if((activationEpoch!==undefined&&core.activationEpoch!==activationEpoch)||(sourceWriterGeneration!==undefined&&core.sourceWriterGeneration!==sourceWriterGeneration)||(targetWriterGeneration!==undefined&&core.targetWriterGeneration!==targetWriterGeneration)||(targetV2Epoch!==undefined&&core.targetV2Epoch!==targetV2Epoch))throw new Error('V2 freeze control epoch 或 generation 不符');
 if(request){const frozen=assertRecordSyncV2FreezeRequest(request);if(core.environment!==frozen.environment||core.companyId!==frozen.companyId||core.freezeId!==frozen.freezeId||core.activationEpoch!==frozen.activationEpoch||core.targetV2Epoch!==frozen.targetV2Epoch||core.requestHash!==frozen.requestHash||core.sourceWriterGeneration!==frozen.sourceWriterGeneration||core.targetWriterGeneration!==frozen.targetWriterGeneration)throw new Error('V2 freeze control 與 request 不符')}
 const body={...core};delete body.controlHash;if(sha256Canonical(body)!==core.controlHash)throw new Error('V2 freeze control canonical hash 不符');return core;
}

export function buildRequestedRecordSyncV2FreezeControl({request}={}){
 const frozen=assertRecordSyncV2FreezeRequest(request),body={schema:RECORD_SYNC_V2_FREEZE_CONTROL_SCHEMA,environment:frozen.environment,companyId:frozen.companyId,freezeId:frozen.freezeId,activationEpoch:frozen.activationEpoch,targetV2Epoch:frozen.targetV2Epoch,phase:'requested',revision:1,requestHash:frozen.requestHash,sourceWriterGeneration:frozen.sourceWriterGeneration,targetWriterGeneration:frozen.targetWriterGeneration,acceptNewSessions:false,acceptNewMutations:false,allowDrainOperations:false,writerProtocol:'v1',sessionSnapshotHash:ZERO_HASH,drainEvidenceHash:ZERO_HASH,hardPauseEventHash:ZERO_HASH},control={...body,controlHash:sha256Canonical(body)};return deepFreeze(assertControlCore(control,{request:frozen}));
}
export function assertRequestedRecordSyncV2FreezeControl(value,expected){return deepFreeze(assertControlCore(stripAudit(value,controlCoreFields,'V2 freeze control'),expected))}
