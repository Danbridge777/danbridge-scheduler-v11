import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {
 assertOpenRecordSyncV1WriterCurrent,
 assertHardPausedRecordSyncV1WriterCurrent,
 buildHardPausedRecordSyncV1WriterCurrent
} from './cloud-record-sync-v1-writer-current.js';
import {
 RECORD_SYNC_V2_FREEZE_CONTROL_SCOPE,
 RECORD_SYNC_V2_FREEZE_OPERATION_POLICY,
 assertRecordSyncV2FreezeRequest,
 assertRequestedRecordSyncV2FreezeControl
} from './cloud-record-sync-v2-freeze-control.js';
import {
 assertRecordSyncSafetyControl,
 assertRecordSyncSafetyEvent,
 buildRecordSyncSafetyPause
} from './cloud-record-sync-safety-control.js';

export const RECORD_SYNC_V1_V2_HARD_PAUSE_TRANSITION_SCHEMA='danbridge-record-sync-v1-v2-hard-pause-transition-plan-v1';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_SCHEMA='danbridge-record-sync-v1-v2-hard-pause-transition-receipt-v1';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_SCOPE='hard-pause-transition-not-data-root';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_LEGACY_SAFETY_HINT_SCOPE='rollback-hint-only';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_REASON='V1 to V2 hard-pause-all freeze requested';

const inputFields=['writerCurrent','safetyControl','request','requestedControl','pausedAt'];
const expectedFields=['writerCurrent','safetyControl'];
const safetyFields=['schema','environment','companyId','activationEpoch','state','revision','lastEventId','lastEventHash','readAllowed','writeAllowed','updatedAt'];
const safetyAuditFields=['persistedAt','updatedBy','updatedByEmail'];
const pauseEventFields=['schema','environment','companyId','activationEpoch','type','eventId','beforeRevision','afterRevision','reason','safeRecordDataHash','cloudBackupId','createdAt','eventHash'];
const pauseEventAuditFields=['persistedAt','createdBy','createdByEmail'];
const receiptFields=['schema','environment','companyId','activationEpoch','state','scope','legacySafetyEventAuthority','freezeId','targetV2Epoch','sourceWriterControlHash','sourceWriterRevision','sourceSafetyRevision','sourceSafetyLastEventId','sourceSafetyLastEventHash','freezeRequestHash','requestedFreezeControlHash','legacySafetyPauseEventId','legacySafetyPauseEventHash','pausedSafetyRevision','operationPolicy','createdAt','receiptHash'];
const receiptAuditFields=['persistedAt','persistedBy','persistedByEmail'];
const receiptExpectedFields=['request','requestedControl','legacySafetyPauseEvent','writerCurrent','safetyControl'];
const planFields=['schema','environment','companyId','activationEpoch','request','requestedControl','pauseEvent','nextSafetyControl','transitionReceipt','nextWriterCurrent','planHash'];
const ZERO_HASH='0'.repeat(64);

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO_HASH;
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!hasUnpairedSurrogate(value)&&!/[\u0000-\u001f\u007f/]/.test(value)&&/^[^@\s]+@[^@\s]+$/.test(value);
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=128&&!/[\u0000-\u001f\u007f/]/.test(value);

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' 欄位無效');
 const result={};
 for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}
 return result;
}

function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}

function snapshotExpected(value,fields,label){
 if(value===undefined)return{};
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' 必須是 plain object');
 const result={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string'||!fields.includes(key))throw new Error(label+' 欄位無效');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error(label+'.'+key+' 必須是 enumerable data field');result[key]=descriptor.value}return result;
}

function stripSafetyAudit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('V1 safety control 必須是 plain object');
 const keys=Reflect.ownKeys(value),count=safetyAuditFields.filter(key=>keys.includes(key)).length;
 if(count!==0&&count!==safetyAuditFields.length)throw new Error('V1 safety control audit 欄位必須 all-or-none');
 if(keys.length!==safetyFields.length+count||keys.some(key=>typeof key!=='string'||![...safetyFields,...safetyAuditFields].includes(key)))throw new Error('V1 safety control 欄位無效');
 const core={};for(const key of safetyFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('V1 safety control.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(count){const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,'updatedBy'),mail=Object.getOwnPropertyDescriptor(value,'updatedByEmail');if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error('V1 safety control audit 格式無效')}
 return core;
}

function stripPauseEventAudit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('hard pause safety event 必須是 plain object');
 const keys=Reflect.ownKeys(value),count=pauseEventAuditFields.filter(key=>keys.includes(key)).length;
 if(count!==0&&count!==pauseEventAuditFields.length)throw new Error('hard pause safety event audit 欄位必須 all-or-none');
 if(keys.length!==pauseEventFields.length+count||keys.some(key=>typeof key!=='string'||![...pauseEventFields,...pauseEventAuditFields].includes(key)))throw new Error('hard pause safety event 欄位無效');
 const core={};for(const key of pauseEventFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('hard pause safety event.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(count){const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,'createdBy'),mail=Object.getOwnPropertyDescriptor(value,'createdByEmail');if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error('hard pause safety event audit 格式無效')}
 return core;
}

export function stripRecordSyncV1V2HardPauseSafetyEventAudit(value){return deepFreeze(stripPauseEventAudit(value))}

function timestampNanos(value){
 if(!isStrictActiveRecordSaveTimestamp(value))throw new Error('hard pause timestamp 無效');
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]),fraction=BigInt((match[7]??'').padEnd(9,'0')||'0'),zone=match[8],leap=year%4===0&&(year%100!==0||year%400===0),monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31],priorYear=BigInt(year-1),daysBeforeYear=365n*priorYear+priorYear/4n-priorYear/100n+priorYear/400n,daysBeforeMonth=BigInt(monthDays.slice(0,month-1).reduce((sum,value)=>sum+value,0));
 let offsetMinutes=0;if(zone!=='Z'){const amount=Number(zone.slice(1,3))*60+Number(zone.slice(4,6));offsetMinutes=(zone[0]==='+'?1:-1)*amount}
 return((daysBeforeYear+daysBeforeMonth+BigInt(day-1))*86400n+BigInt(hour*3600+minute*60+second-offsetMinutes*60))*1_000_000_000n+fraction;
}

function assertSafety(value,activationEpoch,state){
 const core=stripSafetyAudit(value);
 if(!isStrictActiveRecordSaveTimestamp(core.updatedAt))throw new Error('V1 safety control timestamp 無效');
 assertRecordSyncSafetyControl(core,{environment:'staging',activationEpoch});
 if(core.state!==state)throw new Error('V1 safety control state 無效');
 return core;
}

function assertPauseEvent(value,request,receipt){
 const event=stripPauseEventAudit(value);
 assertRecordSyncSafetyEvent(event,{environment:'staging',activationEpoch:request.activationEpoch,type:'pause'});
 if(event.eventId!=='freeze-pause:'+request.requestHash||event.beforeRevision!==receipt.sourceSafetyRevision||event.afterRevision!==receipt.pausedSafetyRevision||event.reason!==RECORD_SYNC_V1_V2_HARD_PAUSE_REASON||event.safeRecordDataHash!==request.preflightRecordDataHash||event.cloudBackupId!==request.preflightBackupId||event.createdAt!==receipt.createdAt||event.eventId!==receipt.legacySafetyPauseEventId||event.eventHash!==receipt.legacySafetyPauseEventHash)throw new Error('hard pause safety event linkage 無效');
 return event;
}

function stripReceiptAudit(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('hard pause transition receipt 必須是 plain object');
 const keys=Reflect.ownKeys(value),count=receiptAuditFields.filter(key=>keys.includes(key)).length;
 if(count!==0&&count!==receiptAuditFields.length)throw new Error('hard pause transition receipt audit 欄位必須 all-or-none');
 if(keys.length!==receiptFields.length+count||keys.some(key=>typeof key!=='string'||![...receiptFields,...receiptAuditFields].includes(key)))throw new Error('hard pause transition receipt 欄位無效');
 const core={};for(const key of receiptFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value' in descriptor))throw new Error('hard pause transition receipt.'+key+' 必須是 enumerable data field');core[key]=descriptor.value}
 if(count){const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,'persistedBy'),mail=Object.getOwnPropertyDescriptor(value,'persistedByEmail');if(!at?.enumerable||!('value' in at)||at.value==null||!uid?.enumerable||!('value' in uid)||!actor(uid.value)||!mail?.enumerable||!('value' in mail)||!email(mail.value))throw new Error('hard pause transition receipt audit 格式無效')}
 return core;
}

function assertReceiptFields(receipt){
 if(receipt.schema!==RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_SCHEMA||receipt.environment!=='staging'||receipt.companyId!=='danbridge'||!token(receipt.activationEpoch)||receipt.state!=='hard-paused'||receipt.scope!==RECORD_SYNC_V1_V2_HARD_PAUSE_SCOPE||receipt.legacySafetyEventAuthority!==RECORD_SYNC_V1_V2_HARD_PAUSE_LEGACY_SAFETY_HINT_SCOPE||!token(receipt.freezeId)||!token(receipt.targetV2Epoch)||!digest(receipt.sourceWriterControlHash)||!Number.isSafeInteger(receipt.sourceWriterRevision)||receipt.sourceWriterRevision<1||!Number.isSafeInteger(receipt.sourceSafetyRevision)||receipt.sourceSafetyRevision<1||!token(receipt.sourceSafetyLastEventId)||!digest(receipt.sourceSafetyLastEventHash)||!digest(receipt.freezeRequestHash)||!digest(receipt.requestedFreezeControlHash)||!token(receipt.legacySafetyPauseEventId)||!digest(receipt.legacySafetyPauseEventHash)||receipt.pausedSafetyRevision!==receipt.sourceSafetyRevision+1||receipt.operationPolicy!==RECORD_SYNC_V2_FREEZE_OPERATION_POLICY||!isStrictActiveRecordSaveTimestamp(receipt.createdAt)||!digest(receipt.receiptHash))throw new Error('hard pause transition receipt 無效');
 const body={...receipt};delete body.receiptHash;if(sha256Canonical(body)!==receipt.receiptHash)throw new Error('hard pause transition receipt canonical hash 不符');
 return receipt;
}

function assertReceiptExpected(receipt,expected){
 const links=snapshotExpected(expected,receiptExpectedFields,'hard pause transition receipt expected');
 let request,control,event,writer,safety;
 if(links.request!==undefined){request=assertRecordSyncV2FreezeRequest(links.request);if(receipt.environment!==request.environment||receipt.activationEpoch!==request.activationEpoch||receipt.freezeId!==request.freezeId||receipt.targetV2Epoch!==request.targetV2Epoch||receipt.sourceWriterControlHash!==request.sourceWriterControlHash||receipt.freezeRequestHash!==request.requestHash||receipt.legacySafetyPauseEventId!=='freeze-pause:'+request.requestHash||timestampNanos(receipt.createdAt)<timestampNanos(request.createdAt))throw new Error('hard pause receipt request linkage 無效')}
 if(links.requestedControl!==undefined){control=assertRequestedRecordSyncV2FreezeControl(links.requestedControl,request?{request}:undefined);if(receipt.activationEpoch!==control.activationEpoch||receipt.freezeId!==control.freezeId||receipt.targetV2Epoch!==control.targetV2Epoch||receipt.freezeRequestHash!==control.requestHash||receipt.requestedFreezeControlHash!==control.controlHash)throw new Error('hard pause receipt control linkage 無效')}
 if(links.legacySafetyPauseEvent!==undefined){event=stripPauseEventAudit(links.legacySafetyPauseEvent);assertRecordSyncSafetyEvent(event,{environment:'staging',activationEpoch:receipt.activationEpoch,type:'pause'});if(receipt.legacySafetyPauseEventId!==event.eventId||receipt.legacySafetyPauseEventHash!==event.eventHash||receipt.sourceSafetyRevision!==event.beforeRevision||receipt.pausedSafetyRevision!==event.afterRevision||receipt.createdAt!==event.createdAt)throw new Error('hard pause receipt legacy event linkage 無效')}
 if(links.writerCurrent!==undefined){writer=assertOpenRecordSyncV1WriterCurrent(links.writerCurrent);if(receipt.activationEpoch!==writer.activationEpoch||receipt.sourceWriterControlHash!==writer.controlHash||receipt.sourceWriterRevision!==writer.revision||timestampNanos(receipt.createdAt)<timestampNanos(writer.createdAt))throw new Error('hard pause receipt writer linkage 無效')}
 if(links.safetyControl!==undefined){safety=assertSafety(links.safetyControl,receipt.activationEpoch,'active');if(receipt.sourceSafetyRevision!==safety.revision||receipt.sourceSafetyLastEventId!==safety.lastEventId||receipt.sourceSafetyLastEventHash!==safety.lastEventHash||timestampNanos(receipt.createdAt)<timestampNanos(safety.updatedAt))throw new Error('hard pause receipt safety linkage 無效')}
 if(request&&writer&&timestampNanos(request.createdAt)<timestampNanos(writer.createdAt))throw new Error('hard pause receipt request chronology 無效');
 if(request&&safety&&timestampNanos(request.createdAt)<timestampNanos(safety.updatedAt))throw new Error('hard pause receipt request chronology 無效');
 if(request&&writer&&(request.minClientProtocolVersion!==writer.minClientProtocolVersion||request.minClientReleaseId!==writer.minClientReleaseId))throw new Error('hard pause receipt client identity linkage 無效');
 if(request&&event&&(event.eventId!=='freeze-pause:'+request.requestHash||event.safeRecordDataHash!==request.preflightRecordDataHash||event.cloudBackupId!==request.preflightBackupId))throw new Error('hard pause receipt rollback hint linkage 無效');
 if(writer&&safety&&(writer.safetyRevision!==safety.revision||writer.safetyLastEventHash!==safety.lastEventHash))throw new Error('hard pause receipt source pointer 無效');
 return receipt;
}

export function stripRecordSyncV1V2HardPauseTransitionReceiptAudit(value){return deepFreeze(stripReceiptAudit(value))}

export function assertRecordSyncV1V2HardPauseTransitionReceipt(value,expected){
 const receipt=assertReceiptFields(stripReceiptAudit(value));assertReceiptExpected(receipt,expected);return deepFreeze(receipt);
}

function assertSourceExpected(source,request,receipt,nextWriter){
 const writer=assertOpenRecordSyncV1WriterCurrent(source.writerCurrent);
 const safety=assertSafety(source.safetyControl,writer.activationEpoch,'active');
 if(writer.safetyRevision!==safety.revision||writer.safetyLastEventHash!==safety.lastEventHash||request.minClientProtocolVersion!==writer.minClientProtocolVersion||request.minClientReleaseId!==writer.minClientReleaseId||receipt.sourceWriterControlHash!==writer.controlHash||receipt.sourceWriterRevision!==writer.revision||receipt.sourceSafetyRevision!==safety.revision||receipt.sourceSafetyLastEventId!==safety.lastEventId||receipt.sourceSafetyLastEventHash!==safety.lastEventHash||nextWriter.sourceRecordSyncManifestHash!==writer.sourceRecordSyncManifestHash||nextWriter.writerGeneration!==writer.writerGeneration||nextWriter.minClientProtocolVersion!==writer.minClientProtocolVersion||nextWriter.minClientReleaseId!==writer.minClientReleaseId||nextWriter.createdAt!==writer.createdAt||timestampNanos(request.createdAt)<timestampNanos(writer.createdAt)||timestampNanos(request.createdAt)<timestampNanos(safety.updatedAt)||timestampNanos(receipt.createdAt)<timestampNanos(writer.createdAt)||timestampNanos(receipt.createdAt)<timestampNanos(safety.updatedAt))throw new Error('hard pause transition source linkage 無效');
}

export function assertRecordSyncV1V2HardPauseTransitionPlan(value,expected){
 const plan=exact(value,planFields,'hard pause transition plan');
 if(plan.schema!==RECORD_SYNC_V1_V2_HARD_PAUSE_TRANSITION_SCHEMA||plan.environment!=='staging'||plan.companyId!=='danbridge'||!token(plan.activationEpoch)||!digest(plan.planHash))throw new Error('hard pause transition plan identity 無效');
 const source=exact(expected,expectedFields,'hard pause transition expected source'),request=assertRecordSyncV2FreezeRequest(plan.request),control=assertRequestedRecordSyncV2FreezeControl(plan.requestedControl,{request}),receipt=assertRecordSyncV1V2HardPauseTransitionReceipt(plan.transitionReceipt,{request,requestedControl:control,legacySafetyPauseEvent:plan.pauseEvent,writerCurrent:source.writerCurrent,safetyControl:source.safetyControl}),event=assertPauseEvent(plan.pauseEvent,request,receipt),nextSafety=assertSafety(plan.nextSafetyControl,request.activationEpoch,'paused'),nextWriter=assertHardPausedRecordSyncV1WriterCurrent(plan.nextWriterCurrent);
 if(RECORD_SYNC_V2_FREEZE_CONTROL_SCOPE!=='requested-intent-only-not-current-phase'||control.phase!=='requested'||control.hardPauseEventHash!==ZERO_HASH)throw new Error('requested freeze control 不得冒充 paused authority');
 if(plan.activationEpoch!==request.activationEpoch||nextSafety.revision!==receipt.pausedSafetyRevision||nextSafety.lastEventId!==event.eventId||nextSafety.lastEventHash!==event.eventHash||nextSafety.updatedAt!==event.createdAt||nextWriter.activationEpoch!==request.activationEpoch||nextWriter.writerGeneration!==request.sourceWriterGeneration||nextWriter.revision!==receipt.sourceWriterRevision+1||nextWriter.currentFreezeId!==request.freezeId||nextWriter.currentFreezeRequestHash!==request.requestHash||nextWriter.currentFreezeControlHash!==control.controlHash||nextWriter.safetyRevision!==nextSafety.revision||nextWriter.safetyLastEventHash!==event.eventHash||nextWriter.lastTransitionHash!==receipt.receiptHash||timestampNanos(receipt.createdAt)<timestampNanos(request.createdAt)||timestampNanos(receipt.createdAt)<timestampNanos(nextWriter.createdAt))throw new Error('hard pause transition artifact linkage 無效');
 assertSourceExpected(source,request,receipt,nextWriter);
 const normalized={...plan,request,requestedControl:control,pauseEvent:event,nextSafetyControl:nextSafety,transitionReceipt:receipt,nextWriterCurrent:nextWriter},body={...normalized};delete body.planHash;if(sha256Canonical(body)!==plan.planHash)throw new Error('hard pause transition plan canonical hash 不符');
 return deepFreeze(normalized);
}

export function buildRecordSyncV1V2HardPauseTransition(input){
 const value=exact(input,inputFields,'hard pause transition input');
 if(!isStrictActiveRecordSaveTimestamp(value.pausedAt))throw new Error('hard pause pausedAt 無效');
 const writer=assertOpenRecordSyncV1WriterCurrent(value.writerCurrent),safety=assertSafety(value.safetyControl,writer.activationEpoch,'active'),request=assertRecordSyncV2FreezeRequest(value.request),control=assertRequestedRecordSyncV2FreezeControl(value.requestedControl,{request});
 if(request.activationEpoch!==writer.activationEpoch||request.sourceWriterGeneration!==writer.writerGeneration||request.sourceWriterControlHash!==writer.controlHash||request.minClientProtocolVersion!==writer.minClientProtocolVersion||request.minClientReleaseId!==writer.minClientReleaseId||safety.revision!==writer.safetyRevision||safety.lastEventHash!==writer.safetyLastEventHash)throw new Error('hard pause source pointer 或 client identity 不符');
 const requestInstant=timestampNanos(request.createdAt);if(requestInstant<timestampNanos(writer.createdAt)||requestInstant<timestampNanos(safety.updatedAt))throw new Error('hard pause request.createdAt 早於 source');
 const pausedInstant=timestampNanos(value.pausedAt);if(pausedInstant<requestInstant||pausedInstant<timestampNanos(writer.createdAt)||pausedInstant<timestampNanos(safety.updatedAt))throw new Error('hard pause pausedAt 早於 source');
 // These two preflight values satisfy the legacy safety-event schema only;
 // they remain rollback hints and never enter the authoritative H source set.
 const pause=buildRecordSyncSafetyPause({control:safety,eventId:'freeze-pause:'+request.requestHash,reason:RECORD_SYNC_V1_V2_HARD_PAUSE_REASON,safeRecordDataHash:request.preflightRecordDataHash,cloudBackupId:request.preflightBackupId,createdAt:value.pausedAt});
 const pauseEvent=exact(pause.event,pauseEventFields,'hard pause safety event'),nextSafetyControl=exact(pause.nextControl,safetyFields,'hard pause next safety control');
 assertRecordSyncSafetyEvent(pauseEvent,{environment:'staging',activationEpoch:request.activationEpoch,type:'pause'});assertRecordSyncSafetyControl(nextSafetyControl,{environment:'staging',activationEpoch:request.activationEpoch});
 const receiptBody={schema:RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:request.activationEpoch,state:'hard-paused',scope:RECORD_SYNC_V1_V2_HARD_PAUSE_SCOPE,legacySafetyEventAuthority:RECORD_SYNC_V1_V2_HARD_PAUSE_LEGACY_SAFETY_HINT_SCOPE,freezeId:request.freezeId,targetV2Epoch:request.targetV2Epoch,sourceWriterControlHash:writer.controlHash,sourceWriterRevision:writer.revision,sourceSafetyRevision:safety.revision,sourceSafetyLastEventId:safety.lastEventId,sourceSafetyLastEventHash:safety.lastEventHash,freezeRequestHash:request.requestHash,requestedFreezeControlHash:control.controlHash,legacySafetyPauseEventId:pauseEvent.eventId,legacySafetyPauseEventHash:pauseEvent.eventHash,pausedSafetyRevision:nextSafetyControl.revision,operationPolicy:RECORD_SYNC_V2_FREEZE_OPERATION_POLICY,createdAt:value.pausedAt},transitionReceipt={...receiptBody,receiptHash:sha256Canonical(receiptBody)};
 const nextWriterCurrent=buildHardPausedRecordSyncV1WriterCurrent({current:writer,freezeId:request.freezeId,freezeRequestHash:request.requestHash,freezeControlHash:control.controlHash,safetyRevision:nextSafetyControl.revision,safetyLastEventHash:pauseEvent.eventHash,transitionReceiptHash:transitionReceipt.receiptHash});
 const body={schema:RECORD_SYNC_V1_V2_HARD_PAUSE_TRANSITION_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:request.activationEpoch,request,requestedControl:control,pauseEvent,nextSafetyControl,transitionReceipt,nextWriterCurrent},plan={...body,planHash:sha256Canonical(body)};
 return assertRecordSyncV1V2HardPauseTransitionPlan(plan,{writerCurrent:writer,safetyControl:safety});
}

// Rebuild is intentionally the same deterministic pure operation. A future
// transaction adapter can compare its result with every already-persisted
// artifact to classify exact response-loss replay versus partial conflict.
export const rebuildRecordSyncV1V2HardPauseTransition=buildRecordSyncV1V2HardPauseTransition;
