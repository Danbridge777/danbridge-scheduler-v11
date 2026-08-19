import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {RECORD_SYNC_V2_FREEZE_OPERATION_POLICY} from './cloud-record-sync-v2-freeze-control.js';

export const RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA='danbridge-record-sync-v1-writer-current-v1';
export const RECORD_SYNC_V1_WRITER_CURRENT_AUTHORITY='pure-genesis-not-rules-authority';
export const RECORD_SYNC_V1_WRITER_CURRENT_SOURCE_SCOPE='activation-manifest-safety-pointer-not-current-data-root';
export const RECORD_SYNC_V1_WRITER_GENESIS_GENERATION=1;
export const RECORD_SYNC_V1_WRITER_HARD_PAUSE_SCOPE='immutable-admission-close-not-rules-authority';
export const RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION=4;
export const RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID='20.26.114';
export const RECORD_SYNC_V1_WRITER_DURABLE_POLICY='authoritative-safety-timestamp-and-fixed-client-floor';
export const RECORD_SYNC_V1_WRITER_ADMISSION_POLICY_SCHEMA='danbridge-record-sync-v1-writer-admission-policy-v1';
export const RECORD_SYNC_V1_WRITER_DURABLE_OPEN_ADMISSION_POLICY_TOKEN='v1-admission:0cd544f29a457c5cb0a8ff0f80d82897896a814cf9811c8ab4d933331602ad90';

const ZERO_HASH='0'.repeat(64);
const inputFields=['recordSyncControl','safetyControl','writerGeneration','minClientProtocolVersion','minClientReleaseId','createdAt'];
const hardPauseInputFields=['current','freezeId','freezeRequestHash','freezeControlHash','safetyRevision','safetyLastEventHash','transitionReceiptHash'];
const sourceControlFields=['schema','environment','companyId','state','activationEpoch','manifestHash','candidateEpoch','candidateRevision','candidateSealHash','legacyVersionHash','recordDataHash','roleEvidenceHash','backupId','restoreReceiptId','collectionCount','documentCount','activeCount','tombstoneCount','roleViewCount','readTakeover','writeTakeover','activatedAt'];
const sourceControlAuditFields=['persistedAt','activatedBy','activatedByEmail'];
const safetyFields=['schema','environment','companyId','activationEpoch','state','revision','lastEventId','lastEventHash','readAllowed','writeAllowed','updatedAt'];
const safetyAuditFields=['persistedAt','updatedBy','updatedByEmail'];
const coreFields=['schema','environment','companyId','activationEpoch','state','writerProtocol','writerGeneration','revision','admissionOpen','acceptNewSessions','acceptNewMutations','operationPolicy','admissionPolicyToken','currentFreezeId','currentFreezeRequestHash','currentFreezeControlHash','sourceRecordSyncManifestHash','safetyRevision','safetyLastEventHash','lastTransitionHash','minClientProtocolVersion','minClientReleaseId','createdAt','controlHash'];
const auditFields=['persistedAt','persistedBy','persistedByEmail'];
const admissionPolicyFields=['writerProtocol','writerGeneration','revision','state','admissionOpen','acceptNewSessions','acceptNewMutations','operationPolicy','currentFreezeId','currentFreezeRequestHash','currentFreezeControlHash','minClientProtocolVersion','minClientReleaseId'];

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value)&&value!=='record-v1:'+ZERO_HASH;
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const text=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=500&&!/[\u0000-\u001f\u007f]/.test(value);
function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);
const release=value=>text(value)&&!hasUnpairedSurrogate(value)&&value.length<=200;
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);

function timestampNanos(value){
 if(!isStrictActiveRecordSaveTimestamp(value))throw new Error('V1 writer current timestamp 無效');
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]),fraction=BigInt((match[7]??'').padEnd(9,'0')||'0'),zone=match[8],leap=year%4===0&&(year%100!==0||year%400===0),monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],priorYear=BigInt(year-1),daysBeforeYear=365n*priorYear+priorYear/4n-priorYear/100n+priorYear/400n,daysBeforeMonth=BigInt(monthDays.slice(0,month-1).reduce((sum,value)=>sum+value,0));
 let offsetMinutes=0;if(zone!=='Z'){const amount=Number(zone.slice(1,3))*60+Number(zone.slice(4,6));offsetMinutes=(zone[0]==='+'?1:-1)*amount}
 const utcSeconds=(daysBeforeYear+daysBeforeMonth+BigInt(day-1))*86400n+BigInt(hour*3600+minute*60+second-offsetMinutes*60);
 return utcSeconds*1_000_000_000n+fraction;
}

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}
 return result;
}

function stripAudit(value,fields,audits,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value),auditCount=audits.filter(key=>keys.includes(key)).length;
 if(auditCount!==0&&auditCount!==audits.length)throw new Error(label+' audit 欄位必須 all-or-none');
 if(keys.length!==fields.length+auditCount||keys.some(key=>typeof key!=='string'||![...fields,...audits].includes(key)))throw new Error(label+' 欄位無效');
 const core={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(auditCount){
  const at=Object.getOwnPropertyDescriptor(value,audits[0]),uid=Object.getOwnPropertyDescriptor(value,audits[1]),mail=Object.getOwnPropertyDescriptor(value,audits[2]);
  if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error(label+' audit 格式無效');
 }
 return core;
}

function assertSourceControl(core){
 if(core.schema!=='danbridge-record-sync-control-v1'||core.environment!=='staging'||core.companyId!=='danbridge'||core.state!=='active'||!token(core.activationEpoch)||!digest(core.manifestHash)||!token(core.candidateEpoch)||!Number.isSafeInteger(core.candidateRevision)||core.candidateRevision<2||!digest(core.candidateSealHash)||!text(core.legacyVersionHash)||!recordHash(core.recordDataHash)||!digest(core.roleEvidenceHash)||!token(core.backupId)||!token(core.restoreReceiptId)||core.collectionCount!==16||!Number.isSafeInteger(core.documentCount)||core.documentCount<0||!Number.isSafeInteger(core.activeCount)||core.activeCount<0||!Number.isSafeInteger(core.tombstoneCount)||core.tombstoneCount<0||core.documentCount!==core.activeCount+core.tombstoneCount||!Number.isSafeInteger(core.roleViewCount)||core.roleViewCount<1||core.readTakeover!==true||core.writeTakeover!==true||!isStrictActiveRecordSaveTimestamp(core.activatedAt))throw new Error('V1 source record sync control 無效');
 return core;
}

function assertSafety(core,activationEpoch){
 if(core.schema!=='danbridge-record-sync-safety-control-v1'||core.environment!=='staging'||core.companyId!=='danbridge'||core.activationEpoch!==activationEpoch||core.state!=='active'||!Number.isSafeInteger(core.revision)||core.revision<1||!token(core.lastEventId)||!digest(core.lastEventHash)||core.readAllowed!==true||core.writeAllowed!==true||!isStrictActiveRecordSaveTimestamp(core.updatedAt))throw new Error('V1 source safety control 無效');
 return core;
}

function assertCommonCurrentFields(core){
 if(core.schema!==RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA||core.environment!=='staging'||core.companyId!=='danbridge'||!token(core.activationEpoch)||core.writerProtocol!=='v1'||core.writerGeneration!==RECORD_SYNC_V1_WRITER_GENESIS_GENERATION||!Number.isSafeInteger(core.revision)||core.revision<1||!token(core.admissionPolicyToken)||!digest(core.sourceRecordSyncManifestHash)||!Number.isSafeInteger(core.safetyRevision)||core.safetyRevision<1||!digest(core.safetyLastEventHash)||!Number.isSafeInteger(core.minClientProtocolVersion)||core.minClientProtocolVersion<1||!release(core.minClientReleaseId)||!isStrictActiveRecordSaveTimestamp(core.createdAt))throw new Error('V1 writer current identity 無效');
 return core;
}

function admissionPolicyFromCurrent(core){const value={};for(const key of admissionPolicyFields)value[key]=core[key];return value}

export function buildRecordSyncV1WriterAdmissionPolicyToken(input){
 const value=exact(input,admissionPolicyFields,'V1 writer admission policy');
 if(value.writerProtocol!=='v1'||value.writerGeneration!==RECORD_SYNC_V1_WRITER_GENESIS_GENERATION||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.admissionOpen!=='boolean'||typeof value.acceptNewSessions!=='boolean'||typeof value.acceptNewMutations!=='boolean'||!text(value.operationPolicy)||typeof value.currentFreezeId!=='string'||typeof value.currentFreezeRequestHash!=='string'||!/^[a-f0-9]{64}$/.test(value.currentFreezeRequestHash)||typeof value.currentFreezeControlHash!=='string'||!/^[a-f0-9]{64}$/.test(value.currentFreezeControlHash)||!Number.isSafeInteger(value.minClientProtocolVersion)||value.minClientProtocolVersion<1||!release(value.minClientReleaseId))throw new Error('V1 writer admission policy identity 無效');
 const open=value.state==='open'&&(value.revision===1||(value.revision>=3&&value.revision%2===1))&&value.admissionOpen===true&&value.acceptNewSessions===true&&value.acceptNewMutations===true&&value.operationPolicy==='v1-open'&&value.currentFreezeId===''&&value.currentFreezeRequestHash===ZERO_HASH&&value.currentFreezeControlHash===ZERO_HASH;
 const paused=value.state==='hard-paused'&&value.revision>=2&&value.revision%2===0&&value.admissionOpen===false&&value.acceptNewSessions===false&&value.acceptNewMutations===false&&value.operationPolicy===RECORD_SYNC_V2_FREEZE_OPERATION_POLICY&&token(value.currentFreezeId)&&digest(value.currentFreezeRequestHash)&&digest(value.currentFreezeControlHash);
 if(!open&&!paused)throw new Error('V1 writer admission policy state 無效');
 return 'v1-admission:'+sha256Canonical({schema:RECORD_SYNC_V1_WRITER_ADMISSION_POLICY_SCHEMA,...value});
}

function assertOpenFields(core){
 assertCommonCurrentFields(core);
 const validRevision=core.revision===1||(core.revision>=3&&core.revision%2===1),validTransition=core.revision===1?core.lastTransitionHash===core.sourceRecordSyncManifestHash:digest(core.lastTransitionHash);
 if(core.state!=='open'||!validRevision||!validTransition||core.admissionOpen!==true||core.acceptNewSessions!==true||core.acceptNewMutations!==true||core.operationPolicy!=='v1-open'||core.currentFreezeId!==''||core.currentFreezeRequestHash!==ZERO_HASH||core.currentFreezeControlHash!==ZERO_HASH||core.admissionPolicyToken!==buildRecordSyncV1WriterAdmissionPolicyToken(admissionPolicyFromCurrent(core)))throw new Error('V1 writer current open 無效');
 return core;
}

function assertHardPausedFields(core){
 assertCommonCurrentFields(core);
 if(core.state!=='hard-paused'||core.revision<2||core.revision%2!==0||core.admissionOpen!==false||core.acceptNewSessions!==false||core.acceptNewMutations!==false||core.operationPolicy!==RECORD_SYNC_V2_FREEZE_OPERATION_POLICY||!token(core.currentFreezeId)||!digest(core.currentFreezeRequestHash)||!digest(core.currentFreezeControlHash)||!digest(core.lastTransitionHash)||core.admissionPolicyToken!==buildRecordSyncV1WriterAdmissionPolicyToken(admissionPolicyFromCurrent(core)))throw new Error('V1 writer current hard pause 無效');
 return core;
}

function assertCanonicalCurrent(core,assertFields){
 assertFields(core);
 if(typeof core.controlHash!=='string'||!/^[a-f0-9]{64}$/.test(core.controlHash)||core.controlHash===ZERO_HASH)throw new Error('V1 writer current controlHash 無效');
 const body={};for(const key of coreFields)if(key!=='controlHash')body[key]=core[key];
 if(sha256Canonical(body)!==core.controlHash)throw new Error('V1 writer current canonical hash 不符');
 return core;
}

function assertExpected(core,expected,assertFields,label){
 if(expected===undefined)return;
 const replay=exact(expected,coreFields,'V1 writer current expected full core');
 assertCanonicalCurrent(replay,assertFields);
 for(const key of coreFields)if(core[key]!==replay[key])throw new Error('V1 writer current expected '+label+' 不符');
}

export function buildOpenRecordSyncV1WriterCurrent(input){
 const value=exact(input,inputFields,'V1 writer current input');
 const source=assertSourceControl(stripAudit(value.recordSyncControl,sourceControlFields,sourceControlAuditFields,'V1 source record sync control'));
 const safety=assertSafety(stripAudit(value.safetyControl,safetyFields,safetyAuditFields,'V1 source safety control'),source.activationEpoch);
 if(value.writerGeneration!==RECORD_SYNC_V1_WRITER_GENESIS_GENERATION||!Number.isSafeInteger(value.minClientProtocolVersion)||value.minClientProtocolVersion<1||!release(value.minClientReleaseId)||!isStrictActiveRecordSaveTimestamp(value.createdAt))throw new Error('V1 writer current genesis input 無效');
 const createdInstant=timestampNanos(value.createdAt);if(createdInstant<timestampNanos(source.activatedAt)||createdInstant<timestampNanos(safety.updatedAt))throw new Error('V1 writer current genesis 時間早於 source control');
 const body={schema:RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:source.activationEpoch,state:'open',writerProtocol:'v1',writerGeneration:value.writerGeneration,revision:1,admissionOpen:true,acceptNewSessions:true,acceptNewMutations:true,operationPolicy:'v1-open',currentFreezeId:'',currentFreezeRequestHash:ZERO_HASH,currentFreezeControlHash:ZERO_HASH,sourceRecordSyncManifestHash:source.manifestHash,safetyRevision:safety.revision,safetyLastEventHash:safety.lastEventHash,lastTransitionHash:source.manifestHash,minClientProtocolVersion:value.minClientProtocolVersion,minClientReleaseId:value.minClientReleaseId,createdAt:value.createdAt};body.admissionPolicyToken=buildRecordSyncV1WriterAdmissionPolicyToken(admissionPolicyFromCurrent(body));
 assertOpenFields(body);
 const control={...body,controlHash:sha256Canonical(body)};
 return deepFreeze(assertCanonicalCurrent(control,assertOpenFields));
}

export function buildHardPausedRecordSyncV1WriterCurrent(input){
 const value=exact(input,hardPauseInputFields,'V1 writer current hard pause input');
 const current=assertOpenRecordSyncV1WriterCurrent(value.current);
 if(current.revision===Number.MAX_SAFE_INTEGER||!token(value.freezeId)||!digest(value.freezeRequestHash)||!digest(value.freezeControlHash)||!Number.isSafeInteger(value.safetyRevision)||value.safetyRevision!==current.safetyRevision+1||!digest(value.safetyLastEventHash)||!digest(value.transitionReceiptHash))throw new Error('V1 writer current hard pause input 無效');
 const body={schema:RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA,environment:current.environment,companyId:current.companyId,activationEpoch:current.activationEpoch,state:'hard-paused',writerProtocol:current.writerProtocol,writerGeneration:current.writerGeneration,revision:current.revision+1,admissionOpen:false,acceptNewSessions:false,acceptNewMutations:false,operationPolicy:RECORD_SYNC_V2_FREEZE_OPERATION_POLICY,currentFreezeId:value.freezeId,currentFreezeRequestHash:value.freezeRequestHash,currentFreezeControlHash:value.freezeControlHash,sourceRecordSyncManifestHash:current.sourceRecordSyncManifestHash,safetyRevision:value.safetyRevision,safetyLastEventHash:value.safetyLastEventHash,lastTransitionHash:value.transitionReceiptHash,minClientProtocolVersion:current.minClientProtocolVersion,minClientReleaseId:current.minClientReleaseId,createdAt:current.createdAt};body.admissionPolicyToken=buildRecordSyncV1WriterAdmissionPolicyToken(admissionPolicyFromCurrent(body));
 assertHardPausedFields(body);
 const control={...body,controlHash:sha256Canonical(body)};
 return deepFreeze(assertCanonicalCurrent(control,assertHardPausedFields));
}

export function stripRecordSyncV1WriterCurrentAudit(value){
 return deepFreeze(stripAudit(value,coreFields,auditFields,'V1 writer current'));
}

export function assertOpenRecordSyncV1WriterCurrent(value,expected){
 const core=stripAudit(value,coreFields,auditFields,'V1 writer current');
 assertCanonicalCurrent(core,assertOpenFields);
 assertExpected(core,expected,assertOpenFields,'genesis');
 return deepFreeze(core);
}

export function assertOpenRecordSyncV1WriterCurrentSource(value,sourceInput){
 const expected=buildOpenRecordSyncV1WriterCurrent(sourceInput),current=assertOpenRecordSyncV1WriterCurrent(value,expected);
 return current;
}

export function buildDurableOpenRecordSyncV1WriterCurrent(input){
 const value=exact(input,inputFields,'durable V1 writer current input');
 const source=assertSourceControl(stripAudit(value.recordSyncControl,sourceControlFields,sourceControlAuditFields,'durable V1 source record sync control'));
 const safety=assertSafety(stripAudit(value.safetyControl,safetyFields,safetyAuditFields,'durable V1 source safety control'),source.activationEpoch);
 if(timestampNanos(safety.updatedAt)<timestampNanos(source.activatedAt))throw new Error('durable V1 writer safety chronology 無效');
 if(value.writerGeneration!==RECORD_SYNC_V1_WRITER_GENESIS_GENERATION||value.minClientProtocolVersion!==RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION||value.minClientReleaseId!==RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID||value.createdAt!==safety.updatedAt)throw new Error('durable V1 writer policy 無效');
 return buildOpenRecordSyncV1WriterCurrent(value);
}

export function assertDurableOpenRecordSyncV1WriterCurrentSource(value,sourceInput){
 return assertOpenRecordSyncV1WriterCurrent(value,buildDurableOpenRecordSyncV1WriterCurrent(sourceInput));
}

export function assertHardPausedRecordSyncV1WriterCurrent(value,expected){
 const core=stripAudit(value,coreFields,auditFields,'V1 writer current');
 assertCanonicalCurrent(core,assertHardPausedFields);
 assertExpected(core,expected,assertHardPausedFields,'hard pause');
 return deepFreeze(core);
}
