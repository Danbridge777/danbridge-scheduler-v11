import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_SCHEMA,
 RECORD_SYNC_V1_V2_HARD_PAUSE_LEGACY_SAFETY_HINT_SCOPE,
 RECORD_SYNC_V1_V2_HARD_PAUSE_SCOPE,
 RECORD_SYNC_V1_V2_HARD_PAUSE_TRANSITION_SCHEMA,
 assertRecordSyncV1V2HardPauseTransitionReceipt,
 assertRecordSyncV1V2HardPauseTransitionPlan,
 buildRecordSyncV1V2HardPauseTransition,
 rebuildRecordSyncV1V2HardPauseTransition,
 stripRecordSyncV1V2HardPauseSafetyEventAudit,
 stripRecordSyncV1V2HardPauseTransitionReceiptAudit
} from '../js/core/cloud-record-sync-v1-v2-hard-pause-transition.js';
import {buildOpenRecordSyncV1WriterCurrent,buildRecordSyncV1WriterAdmissionPolicyToken} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {buildRecordSyncV2FreezeRequest,buildRequestedRecordSyncV2FreezeControl} from '../js/core/cloud-record-sync-v2-freeze-control.js';
import {assertRecordSyncSafetyControl,assertRecordSyncSafetyEvent} from '../js/core/cloud-record-sync-safety-control.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const ZERO_HASH='0'.repeat(64);
const sourceControl=(extra={})=>({
 schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:'danbridge',state:'active',activationEpoch:'active-epoch-12345',manifestHash:'a'.repeat(64),candidateEpoch:'candidate-epoch-123',candidateRevision:2,candidateSealHash:'b'.repeat(64),legacyVersionHash:'legacy-version-123',recordDataHash:'record-v1:'+'c'.repeat(64),roleEvidenceHash:'d'.repeat(64),backupId:'backup-source-123',restoreReceiptId:'restore-1234567',collectionCount:16,documentCount:1739,activeCount:19,tombstoneCount:1720,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-16T12:00:00+08:00',...extra
});
const safetyControl=(extra={})=>({
 schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch:'active-epoch-12345',state:'active',revision:3,lastEventId:'resume-event-12345',lastEventHash:'e'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-08-16T12:05:00+08:00',...extra
});
const openWriter=()=>buildOpenRecordSyncV1WriterCurrent({recordSyncControl:sourceControl(),safetyControl:safetyControl(),writerGeneration:1,minClientProtocolVersion:3,minClientReleaseId:'20.26.113',createdAt:'2026-08-17T11:00:00.123456789+08:00'});
const requestFor=writer=>buildRecordSyncV2FreezeRequest({environment:'staging',companyId:'danbridge',freezeId:'freeze-12345678',activationEpoch:writer.activationEpoch,sourceWriterGeneration:writer.writerGeneration,targetWriterGeneration:writer.writerGeneration+1,targetV2Epoch:'v2-epoch-12345678',sourceWriterControlHash:writer.controlHash,minClientProtocolVersion:writer.minClientProtocolVersion,minClientReleaseId:writer.minClientReleaseId,rulesetHash:'1'.repeat(64),preflightRecordDataHash:'record-v1:'+'2'.repeat(64),preflightRawDocumentRoot:'3'.repeat(64),preflightBackupId:'backup-freeze-123',preflightBackupManifestHash:'4'.repeat(64),createdAt:'2026-08-17T11:05:00.123456789+08:00'});
const fixture=(extra={})=>{const writerCurrent=openWriter(),request=requestFor(writerCurrent),requestedControl=buildRequestedRecordSyncV2FreezeControl({request});return{writerCurrent,safetyControl:safetyControl(),request,requestedControl,pausedAt:'2026-08-17T11:06:00.123456789+08:00',...extra}};
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const rehash=(value,field)=>{const body={...value};delete body[field];return{...body,[field]:sha256Canonical(body)}};
const rehashPlan=plan=>rehash(plan,'planHash');
const rehashCurrent=current=>rehash(current,'controlHash');
const policyFields=['writerProtocol','writerGeneration','revision','state','admissionOpen','acceptNewSessions','acceptNewMutations','operationPolicy','currentFreezeId','currentFreezeRequestHash','currentFreezeControlHash','minClientProtocolVersion','minClientReleaseId'];
const rehashCurrentPolicy=current=>{const body={...current};delete body.controlHash;body.admissionPolicyToken=buildRecordSyncV1WriterAdmissionPolicyToken(Object.fromEntries(policyFields.map(key=>[key,body[key]])));return{...body,controlHash:sha256Canonical(body)}};
const requestInputFrom=request=>Object.fromEntries(Object.entries(request).filter(([key])=>key!=='schema'&&key!=='requestHash'));

test('hard-pause plan deterministic、單向綁定、deep-freeze且不 mutate',()=>{
 const input=fixture(),before=structuredClone(input),first=buildRecordSyncV1V2HardPauseTransition(input),second=buildRecordSyncV1V2HardPauseTransition(fixture());
 assert.deepEqual(input,before);
 assert.deepEqual(first,second);
 assert.equal(first.schema,RECORD_SYNC_V1_V2_HARD_PAUSE_TRANSITION_SCHEMA);
 assert.equal(first.transitionReceipt.schema,RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_SCHEMA);
 assert.equal(first.transitionReceipt.state,'hard-paused');
 assert.equal(first.transitionReceipt.scope,'hard-pause-transition-not-data-root');
 assert.equal(first.transitionReceipt.legacySafetyEventAuthority,'rollback-hint-only');
 assert.equal(RECORD_SYNC_V1_V2_HARD_PAUSE_SCOPE,'hard-pause-transition-not-data-root');
 assert.equal(RECORD_SYNC_V1_V2_HARD_PAUSE_LEGACY_SAFETY_HINT_SCOPE,'rollback-hint-only');
 assert.equal(first.requestedControl.phase,'requested');
 assert.equal(first.requestedControl.hardPauseEventHash,ZERO_HASH);
 assert.equal(first.pauseEvent.eventId,'freeze-pause:'+first.request.requestHash);
 assert.equal(first.nextSafetyControl.state,'paused');
 assert.equal(first.nextWriterCurrent.state,'hard-paused');
 assert.equal(first.nextWriterCurrent.lastTransitionHash,first.transitionReceipt.receiptHash);
 assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.pauseEvent)&&Object.isFrozen(first.nextWriterCurrent));
 assert.throws(()=>{first.nextWriterCurrent.state='open'},TypeError);
});

test('legacy safety event/control verifier接受 E0 與 exact paused S1',()=>{
 const plan=buildRecordSyncV1V2HardPauseTransition(fixture());
 assert.equal(assertRecordSyncSafetyEvent(plan.pauseEvent,{environment:'staging',activationEpoch:plan.activationEpoch,type:'pause'}),plan.pauseEvent);
 assert.equal(assertRecordSyncSafetyControl(plan.nextSafetyControl,{environment:'staging',activationEpoch:plan.activationEpoch}),plan.nextSafetyControl);
 assert.equal(plan.pauseEvent.beforeRevision,3);
 assert.equal(plan.nextSafetyControl.revision,4);
 assert.equal(plan.nextSafetyControl.lastEventHash,plan.pauseEvent.eventHash);
});

test('receipt只綁authoritative pointers；legacy preflight僅在E0作rollback hint',()=>{
 const plan=buildRecordSyncV1V2HardPauseTransition(fixture()),receipt=plan.transitionReceipt;
 assert.equal(receipt.sourceWriterControlHash,fixture().writerCurrent.controlHash);
 assert.equal(receipt.sourceSafetyRevision,fixture().safetyControl.revision);
 assert.equal(receipt.freezeRequestHash,plan.request.requestHash);
 assert.equal(receipt.requestedFreezeControlHash,plan.requestedControl.controlHash);
 assert.equal(receipt.legacySafetyPauseEventId,plan.pauseEvent.eventId);
 assert.equal(receipt.legacySafetyPauseEventHash,plan.pauseEvent.eventHash);
 for(const forbidden of ['preflightRecordDataHash','preflightRawDocumentRoot','preflightBackupId','preflightBackupManifestHash','rulesetHash','nextWriterCurrentHash','pausedSafetyControlHash'])assert.equal(forbidden in receipt,false);
 assert.equal(plan.pauseEvent.safeRecordDataHash,plan.request.preflightRecordDataHash);
 assert.equal(plan.pauseEvent.cloudBackupId,plan.request.preflightBackupId);
});

test('full verifier支援Firestore map reorder與response-loss exact replay',()=>{
 const input=fixture(),plan=buildRecordSyncV1V2HardPauseTransition(input),readback=reorder({...plan,request:reorder(plan.request),requestedControl:reorder(plan.requestedControl),pauseEvent:reorder(plan.pauseEvent),nextSafetyControl:reorder(plan.nextSafetyControl),transitionReceipt:reorder(plan.transitionReceipt),nextWriterCurrent:reorder(plan.nextWriterCurrent)});
 assert.deepEqual(assertRecordSyncV1V2HardPauseTransitionPlan(readback,{writerCurrent:reorder(input.writerCurrent),safetyControl:reorder(input.safetyControl)}),plan);
 assert.deepEqual(rebuildRecordSyncV1V2HardPauseTransition(input),plan);
});

test('六artifact合法audit與nested map reorder會normalize回core，E0 audit不入event/plan hash',()=>{
 const input=fixture(),plan=buildRecordSyncV1V2HardPauseTransition(input),ownerAudit={persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'},eventAudit={persistedAt:{server:true},createdBy:'owner-12345678',createdByEmail:'owner@example.com'},safetyAudit={persistedAt:{server:true},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'},readback=reorder({...plan,request:reorder({...plan.request,...ownerAudit}),requestedControl:reorder({...plan.requestedControl,...ownerAudit}),pauseEvent:reorder({...plan.pauseEvent,...eventAudit}),nextSafetyControl:reorder({...plan.nextSafetyControl,...safetyAudit}),transitionReceipt:reorder({...plan.transitionReceipt,...ownerAudit}),nextWriterCurrent:reorder({...plan.nextWriterCurrent,...ownerAudit})});
 assert.deepEqual(assertRecordSyncV1V2HardPauseTransitionPlan(readback,{writerCurrent:input.writerCurrent,safetyControl:input.safetyControl}),plan);
 assert.deepEqual(stripRecordSyncV1V2HardPauseSafetyEventAudit(readback.pauseEvent),plan.pauseEvent);
 assert.equal(readback.pauseEvent.eventHash,plan.pauseEvent.eventHash);
 assert.equal(readback.planHash,plan.planHash);
});

test('E0 partial audit、extra與audit accessor fail closed且getter0',()=>{
 const event=buildRecordSyncV1V2HardPauseTransition(fixture()).pauseEvent;
 assert.throws(()=>stripRecordSyncV1V2HardPauseSafetyEventAudit({...event,persistedAt:{server:true}}),/audit/);
 assert.throws(()=>stripRecordSyncV1V2HardPauseSafetyEventAudit({...event,extra:true}),/欄位/);
 let calls=0;const getter={...event,persistedAt:{server:true},createdByEmail:'owner@example.com'};Object.defineProperty(getter,'createdBy',{enumerable:true,get(){calls++;return'owner-12345678'}});assert.throws(()=>stripRecordSyncV1V2HardPauseSafetyEventAudit(getter),/audit|data field/);assert.equal(calls,0);
});

test('pausedAt以BigInt instant比較，equal/offset等價接受，早1ns或非法時間拒絕',()=>{
 const base=fixture(),atRequest=base.request.createdAt;
 assert.doesNotThrow(()=>buildRecordSyncV1V2HardPauseTransition({...base,pausedAt:atRequest}));
 assert.doesNotThrow(()=>buildRecordSyncV1V2HardPauseTransition({...base,pausedAt:'2026-08-17T03:05:00.123456789Z'}));
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,pausedAt:'2026-08-17T03:05:00.123456788Z'}),/早於 source/);
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,pausedAt:'2026-08-17 11:06:00'}),/pausedAt/);
});

test('request.createdAt必須以BigInt instant不早於W0/S0，full verifier也重驗',()=>{
 const base=fixture(),equalRequest=buildRecordSyncV2FreezeRequest({...requestInputFrom(base.request),createdAt:'2026-08-17T03:00:00.123456789Z'}),equalControl=buildRequestedRecordSyncV2FreezeControl({request:equalRequest});
 assert.doesNotThrow(()=>buildRecordSyncV1V2HardPauseTransition({...base,request:equalRequest,requestedControl:equalControl}));
 const earlyRequest=buildRecordSyncV2FreezeRequest({...requestInputFrom(base.request),createdAt:'2026-08-17T03:00:00.123456788Z'}),earlyControl=buildRequestedRecordSyncV2FreezeControl({request:earlyRequest});
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,request:earlyRequest,requestedControl:earlyControl}),/request.createdAt 早於 source/);
 const plan=buildRecordSyncV1V2HardPauseTransition(base),laterSafety={...base.safetyControl,updatedAt:'2026-08-17T03:05:00.123456790Z'};
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(plan,{writerCurrent:base.writerCurrent,safetyControl:laterSafety}),/chronology|source linkage/);
});

test('durable H public verifier支援audit readback、strict expected與Firestore map reorder',()=>{
 const input=fixture(),plan=buildRecordSyncV1V2HardPauseTransition(input),receipt=plan.transitionReceipt,audit={persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'},document=reorder({...receipt,...audit}),expected={request:reorder(plan.request),requestedControl:reorder(plan.requestedControl),legacySafetyPauseEvent:reorder(plan.pauseEvent),writerCurrent:reorder(input.writerCurrent),safetyControl:reorder(input.safetyControl)};
 assert.deepEqual(stripRecordSyncV1V2HardPauseTransitionReceiptAudit(document),receipt);
 assert.deepEqual(assertRecordSyncV1V2HardPauseTransitionReceipt(document,reorder(expected)),receipt);
 assert.deepEqual(assertRecordSyncV1V2HardPauseTransitionReceipt(reorder(receipt),{request:plan.request}),receipt);
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt({...receipt,persistedAt:{server:true}}),/audit/);
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt(receipt,{requestTypo:plan.request}),/expected/);
 let calls=0;const hostile={};Object.defineProperty(hostile,'request',{enumerable:true,get(){calls++;return plan.request}});assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt(receipt,hostile),/data field/);assert.equal(calls,0);
 const forgedEvent=rehash({...plan.pauseEvent,safeRecordDataHash:'record-v1:'+'7'.repeat(64)},'eventHash'),forgedReceipt=rehash({...receipt,legacySafetyPauseEventHash:forgedEvent.eventHash},'receiptHash');
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt(forgedReceipt,{request:plan.request,legacySafetyPauseEvent:forgedEvent}),/rollback hint/);
});

test('durable H scope/authority/extra/accessor tamper即使重算hash仍拒絕',()=>{
 const receipt=buildRecordSyncV1V2HardPauseTransition(fixture()).transitionReceipt;
 for(const [field,value] of [['scope','data-root-authority'],['legacySafetyEventAuthority','authoritative'],['state','requested']]){const changed=rehash({...receipt,[field]:value},'receiptHash');assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt(changed),/receipt 無效/)}
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt({...receipt,extra:true}),/欄位/);
 let calls=0;const getter={...receipt};Object.defineProperty(getter,'scope',{enumerable:true,get(){calls++;return receipt.scope}});assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionReceipt(getter),/data field/);assert.equal(calls,0);
});

test('partial、canonical tamper、epoch/revision/id/linkage全部fail closed',()=>{
 const input=fixture(),plan=buildRecordSyncV1V2HardPauseTransition(input),expected={writerCurrent:input.writerCurrent,safetyControl:input.safetyControl};
 const partial=structuredClone(plan);delete partial.nextWriterCurrent;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(partial,expected),/欄位/);
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan({...plan,planHash:'f'.repeat(64)},expected),/canonical/);
 const wrongEpoch=structuredClone(plan);wrongEpoch.activationEpoch='other-epoch-123';wrongEpoch.planHash=rehashPlan(wrongEpoch).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(wrongEpoch,expected),/linkage/);
 const wrongRevision=structuredClone(plan);wrongRevision.transitionReceipt.sourceSafetyRevision=2;wrongRevision.transitionReceipt=rehash(wrongRevision.transitionReceipt,'receiptHash');wrongRevision.planHash=rehashPlan(wrongRevision).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(wrongRevision,{writerCurrent:input.writerCurrent,safetyControl:input.safetyControl}),/receipt|linkage/);
 const wrongId=structuredClone(plan);wrongId.pauseEvent.eventId='freeze-pause:wrong123';wrongId.planHash=rehashPlan(wrongId).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(wrongId,expected),/hash|linkage/);
 const forgedControl=structuredClone(plan);forgedControl.requestedControl.hardPauseEventHash='9'.repeat(64);forgedControl.requestedControl=rehash(forgedControl.requestedControl,'controlHash');forgedControl.planHash=rehashPlan(forgedControl).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(forgedControl,expected),/格式|paused authority/);
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(plan),/expected source/);
});

test('source pointer mismatch與non-active safety一律拒絕',()=>{
 const base=fixture();
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,safetyControl:{...base.safetyControl,lastEventHash:'f'.repeat(64)}}),/source pointer/);
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,safetyControl:{...base.safetyControl,revision:4}}),/source pointer/);
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,safetyControl:{...base.safetyControl,state:'paused',writeAllowed:false}}),/state/);
 const otherWriter=openWriter(),otherRequest=requestFor(otherWriter),forgedRequest=rehash({...otherRequest,sourceWriterControlHash:'f'.repeat(64)},'requestHash'),forgedControl=buildRequestedRecordSyncV2FreezeControl({request:forgedRequest});
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,request:forgedRequest,requestedControl:forgedControl}),/source pointer/);
});

test('hard pause request不得偷降protocol或更換release，即使request/control已重hash',()=>{
 const base=fixture();
 for(const changed of [{minClientProtocolVersion:base.writerCurrent.minClientProtocolVersion-1},{minClientReleaseId:'20.26.999'}]){const request=buildRecordSyncV2FreezeRequest({...requestInputFrom(base.request),...changed}),requestedControl=buildRequestedRecordSyncV2FreezeControl({request});assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,request,requestedControl}),/client identity/)}
});

test('resumed open rev3可產生rev4 pause；transition verifier拒stale或skip revision',()=>{
 const base=fixture(),writerCurrent=rehashCurrentPolicy({...base.writerCurrent,revision:3,lastTransitionHash:'9'.repeat(64)}),request=requestFor(writerCurrent),requestedControl=buildRequestedRecordSyncV2FreezeControl({request}),input={...base,writerCurrent,request,requestedControl},plan=buildRecordSyncV1V2HardPauseTransition(input),expected={writerCurrent,safetyControl:base.safetyControl};
 assert.equal(plan.transitionReceipt.sourceWriterRevision,3);
 assert.equal(plan.nextWriterCurrent.revision,4);
 assert.equal(plan.nextWriterCurrent.writerGeneration,writerCurrent.writerGeneration);
 const skipped=structuredClone(plan);skipped.nextWriterCurrent=rehashCurrent({...skipped.nextWriterCurrent,revision:6});skipped.planHash=rehashPlan(skipped).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(skipped,expected),/hard pause|artifact linkage/);
 const stale=structuredClone(plan);stale.transitionReceipt=rehash({...stale.transitionReceipt,sourceWriterRevision:1},'receiptHash');stale.planHash=rehashPlan(stale).planHash;
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(stale,expected),/writer linkage|source linkage/);
});

test('descriptor snapshot阻擋extra/custom proto/getter/toJSON且不執行副作用',()=>{
 const base=fixture();
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,extra:true}),/欄位/);
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition(Object.assign(Object.create({unsafe:true}),base)),/plain object/);
 let getterCalls=0;const getter={...base};Object.defineProperty(getter,'pausedAt',{enumerable:true,get(){getterCalls++;return base.pausedAt}});
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition(getter),/data field/);assert.equal(getterCalls,0);
 let toJSONCalls=0;const hostile={toJSON(){toJSONCalls++;return base.pausedAt}};
 assert.throws(()=>buildRecordSyncV1V2HardPauseTransition({...base,pausedAt:hostile}),/pausedAt/);assert.equal(toJSONCalls,0);
 const plan=buildRecordSyncV1V2HardPauseTransition(base),expectedGetter={writerCurrent:base.writerCurrent};Object.defineProperty(expectedGetter,'safetyControl',{enumerable:true,get(){getterCalls++;return base.safetyControl}});
 assert.throws(()=>assertRecordSyncV1V2HardPauseTransitionPlan(plan,expectedGetter),/data field/);assert.equal(getterCalls,0);
});

test('plan不把requested control或preflight proof升格成paused/data-root authority',()=>{
 const firstInput=fixture(),first=buildRecordSyncV1V2HardPauseTransition(firstInput);
 const writerCurrent=firstInput.writerCurrent,request=buildRecordSyncV2FreezeRequest({...requestInputFrom(firstInput.request),preflightRawDocumentRoot:'8'.repeat(64)}),requestedControl=buildRequestedRecordSyncV2FreezeControl({request}),second=buildRecordSyncV1V2HardPauseTransition({...firstInput,request,requestedControl});
 assert.notEqual(first.request.requestHash,second.request.requestHash);
 assert.equal(first.requestedControl.phase,'requested');
 assert.equal(first.requestedControl.hardPauseEventHash,ZERO_HASH);
 assert.equal(first.nextSafetyControl.state,'paused');
 assert.equal(first.nextWriterCurrent.admissionOpen,false);
 assert.equal(first.transitionReceipt.sourceWriterControlHash,writerCurrent.controlHash);
 assert.notEqual(first.pauseEvent.eventHash,second.pauseEvent.eventHash);
 assert.notEqual(first.transitionReceipt.receiptHash,second.transitionReceipt.receiptHash);
 for(const forbidden of ['recordDataHash','rawDocumentRoot','backupManifestHash','rulesetHash','preflightRecordDataHash','preflightRawDocumentRoot','preflightBackupManifestHash'])assert.equal(forbidden in first.transitionReceipt,false);
});
