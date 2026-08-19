import {isStrictActiveRecordSaveTimestamp} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {
 assertRecordSyncV1V2HardPauseTransitionPlan,
 stripRecordSyncV1V2HardPauseSafetyEventAudit,
 stripRecordSyncV1V2HardPauseTransitionReceiptAudit
} from './cloud-record-sync-v1-v2-hard-pause-transition.js';
import {assertRecordSyncV2FreezeRequest,assertRequestedRecordSyncV2FreezeControl} from './cloud-record-sync-v2-freeze-control.js';
import {assertHardPausedRecordSyncV1WriterCurrent,assertOpenRecordSyncV1WriterCurrent} from './cloud-record-sync-v1-writer-current.js';
import {assertRecordSyncSafetyControl} from './cloud-record-sync-safety-control.js';

export const RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCHEMA='danbridge-record-sync-v1-v2-hard-pause-persistence-plan-v1';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCOPE='atomic-six-write-seven-authoritative-read-create-or-exact-replay-not-v2-active-cutover-or-runtime-authority';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_DURABLE_TIME_POLICY='immutable-core-time-equals-authoritative-w0-and-s0-time-server-audit-is-commit-time';
export const RECORD_SYNC_V1_V2_HARD_PAUSE_CHRONOLOGY_SCOPE='six-artifact-server-persistedAt-is-post-pause-minimum-not-legacy-core-createdAt';

const inputFields=['transitionPlan','expected','persisted'];
const expectedFields=['recordSyncControl','writerCurrent','safetyControl'];
const persistedFields=['recordSyncControl','freezeRequest','freezeControl','pauseEvent','transitionReceipt','writerCurrent','safetyControl'];
const controlFields=['schema','environment','companyId','state','activationEpoch','manifestHash','candidateEpoch','candidateRevision','candidateSealHash','legacyVersionHash','recordDataHash','roleEvidenceHash','backupId','restoreReceiptId','collectionCount','documentCount','activeCount','tombstoneCount','roleViewCount','readTakeover','writeTakeover','activatedAt'];
const safetyFields=['schema','environment','companyId','activationEpoch','state','revision','lastEventId','lastEventHash','readAllowed','writeAllowed','updatedAt'];
const planExpectedFields=['expectedState','expectedPlanHash','expectedFreezeId','expectedActivationEpoch','expectedTransitionPlanHash'];
const capabilities=new WeakMap();

function plain(value,label){if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be plain object');return value}
function exact(value,fields,label){plain(value,label);const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be enumerable data field');out[key]=descriptor.value}return out}
const actor=value=>typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&/^[^@\s]+@[^@\s]+$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))deepFreeze(child,seen);return Object.freeze(value)}
function audit(value,coreFields,uidField,emailField,label){plain(value,label);const keys=Reflect.ownKeys(value),allowed=[...coreFields,'persistedAt',uidField,emailField];if(keys.length!==allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))throw new Error(label+' requires exact core and full server audit');const core={};for(const key of coreFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' accessor invalid');core[key]=descriptor.value}const at=Object.getOwnPropertyDescriptor(value,'persistedAt'),uid=Object.getOwnPropertyDescriptor(value,uidField),mail=Object.getOwnPropertyDescriptor(value,emailField);if(!at?.enumerable||!Object.prototype.hasOwnProperty.call(at,'value')||!isStrictActiveRecordSaveTimestamp(at.value)||!uid?.enumerable||!Object.prototype.hasOwnProperty.call(uid,'value')||!actor(uid.value)||!mail?.enumerable||!Object.prototype.hasOwnProperty.call(mail,'value')||!email(mail.value))throw new Error(label+' server audit invalid');return{core,audit:{persistedAt:at.value,persistedBy:uid.value,persistedByEmail:mail.value}}}
const same=(left,right)=>sha256Canonical(left)===sha256Canonical(right);
function requireSameAudit(rows){const first=rows[0];for(const row of rows)if(!same(row,first))throw new Error('hard pause persisted bundle server audit split');return first}
function strictSafety(core,expected,state){assertRecordSyncSafetyControl(core,{environment:'staging',activationEpoch:expected.activationEpoch});if(core.state!==state||!same(core,expected))throw new Error('hard pause persisted safety mismatch');return core}
function strictRecordSyncControl(core,expected){
 if(!same(core,expected)||core.schema!=='danbridge-record-sync-control-v1'||core.environment!=='staging'||core.companyId!=='danbridge'||core.state!=='active'||core.readTakeover!==true||core.writeTakeover!==true||!token(core.activationEpoch)||!digest(core.manifestHash)||!isStrictActiveRecordSaveTimestamp(core.activatedAt))throw new Error('hard pause authoritative active record sync control mismatch');
 return core;
}
function policy(plan,source){const immutableTime=source.writerCurrent.createdAt;if(immutableTime!==source.safetyControl.updatedAt||plan.request.createdAt!==immutableTime||plan.pauseEvent.createdAt!==immutableTime||plan.transitionReceipt.createdAt!==immutableTime||plan.nextSafetyControl.updatedAt!==immutableTime||plan.nextWriterCurrent.createdAt!==immutableTime)throw new Error('hard pause durable immutable time policy mismatch')}

export function buildRecordSyncV1V2HardPausePersistencePlan(raw){
 const input=exact(raw,inputFields,'hard pause persistence input'),source=exact(input.expected,expectedFields,'hard pause persistence expected'),persisted=exact(input.persisted,persistedFields,'hard pause persisted artifacts'),transition=assertRecordSyncV1V2HardPauseTransitionPlan(input.transitionPlan,{writerCurrent:source.writerCurrent,safetyControl:source.safetyControl});policy(transition,source);
 const activeControl=audit(persisted.recordSyncControl,controlFields,'activatedBy','activatedByEmail','persisted authoritative C control'),writerSource=audit(persisted.writerCurrent,Object.keys(source.writerCurrent),'persistedBy','persistedByEmail','persisted W current'),safetySource=audit(persisted.safetyControl,safetyFields,'updatedBy','updatedByEmail','persisted S control'),missing=['freezeRequest','freezeControl','pauseEvent','transitionReceipt'].filter(key=>persisted[key]===null).length;
 strictRecordSyncControl(activeControl.core,source.recordSyncControl);
 if(activeControl.core.activationEpoch!==source.writerCurrent.activationEpoch||activeControl.core.activationEpoch!==source.safetyControl.activationEpoch||activeControl.core.manifestHash!==source.writerCurrent.sourceRecordSyncManifestHash||source.writerCurrent.revision!==1||source.writerCurrent.writerGeneration!==1)throw new Error('hard pause durable source lineage requires authoritative W0 revision 1');
 let state,serverAudit=null;
 if(missing===4){assertOpenRecordSyncV1WriterCurrent(writerSource.core,source.writerCurrent);strictSafety(safetySource.core,source.safetyControl,'active');state='create-required'}
 else if(missing===0){
  const request=audit(persisted.freezeRequest,Object.keys(transition.request),'persistedBy','persistedByEmail','persisted F request'),control=audit(persisted.freezeControl,Object.keys(transition.requestedControl),'persistedBy','persistedByEmail','persisted K control'),event=audit(persisted.pauseEvent,Object.keys(transition.pauseEvent),'createdBy','createdByEmail','persisted P event'),receipt=audit(persisted.transitionReceipt,Object.keys(transition.transitionReceipt),'persistedBy','persistedByEmail','persisted H receipt');
  assertRecordSyncV2FreezeRequest(request.core,{activationEpoch:transition.activationEpoch,sourceWriterControlHash:source.writerCurrent.controlHash});assertRequestedRecordSyncV2FreezeControl(control.core,{request:request.core});
  if(!same(request.core,transition.request)||!same(control.core,transition.requestedControl)||!same(stripRecordSyncV1V2HardPauseSafetyEventAudit(event.core),transition.pauseEvent)||!same(stripRecordSyncV1V2HardPauseTransitionReceiptAudit(receipt.core),transition.transitionReceipt))throw new Error('hard pause persisted immutable artifact mismatch');
  assertHardPausedRecordSyncV1WriterCurrent(writerSource.core,transition.nextWriterCurrent);strictSafety(safetySource.core,transition.nextSafetyControl,'paused');serverAudit=requireSameAudit([request.audit,control.audit,event.audit,receipt.audit,writerSource.audit,safetySource.audit]);state='replayed';
 }else throw new Error('hard pause persisted immutable artifacts partial');
 const body={schema:RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCHEMA,state,scope:RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCOPE,chronologyScope:RECORD_SYNC_V1_V2_HARD_PAUSE_CHRONOLOGY_SCOPE,environment:'staging',companyId:'danbridge',activationEpoch:transition.activationEpoch,freezeId:transition.request.freezeId,transitionPlanHash:transition.planHash,requestHash:transition.request.requestHash,freezeControlHash:transition.requestedControl.controlHash,pauseEventHash:transition.pauseEvent.eventHash,transitionReceiptHash:transition.transitionReceipt.receiptHash,sourceRecordSyncManifestHash:activeControl.core.manifestHash,sourceRecordSyncControlCoreHash:sha256Canonical(activeControl.core),sourceWriterControlHash:source.writerCurrent.controlHash,targetWriterControlHash:transition.nextWriterCurrent.controlHash,sourceSafetyRevision:source.safetyControl.revision,targetSafetyRevision:transition.nextSafetyControl.revision,writeCount:state==='create-required'?6:0},plan={...body,planHash:sha256Canonical(body)},writes={freezeRequest:transition.request,freezeControl:transition.requestedControl,pauseEvent:transition.pauseEvent,transitionReceipt:transition.transitionReceipt,writerCurrent:transition.nextWriterCurrent,safetyControl:transition.nextSafetyControl};
 const frozen=deepFreeze(plan);capabilities.set(frozen,{writes:deepFreeze(writes),serverAudit});return frozen;
}

export function consumeRecordSyncV1V2HardPausePersistencePlan(plan,rawExpected){
 const expected=exact(rawExpected,planExpectedFields,'hard pause persistence consume expected'),hidden=capabilities.get(plan);if(!hidden)throw new Error('hard pause persistence capability invalid');const body={...plan};delete body.planHash;if(sha256Canonical(body)!==plan.planHash||plan.schema!==RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCHEMA||plan.scope!==RECORD_SYNC_V1_V2_HARD_PAUSE_PERSISTENCE_SCOPE||plan.state!==expected.expectedState||plan.planHash!==expected.expectedPlanHash||plan.freezeId!==expected.expectedFreezeId||plan.activationEpoch!==expected.expectedActivationEpoch||plan.transitionPlanHash!==expected.expectedTransitionPlanHash)throw new Error('hard pause persistence consume expected mismatch');return hidden;
}
