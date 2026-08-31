import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {prepareImmutableMigrationBackup,sealImmutableMigrationBackup,sha256Canonical,verifyImmutableMigrationBackupReadback} from '../js/core/cloud-immutable-migration-backup.js';
import {buildOpenRecordSyncCandidateControl,sealRecordSyncCandidateControl} from '../js/core/cloud-record-sync-candidate-control.js';
import {buildRecordSyncActivationManifest,buildActiveRecordSyncControl} from '../js/core/cloud-record-sync-control.js';
import {buildRecordSyncRoleEvidence,RECORD_SYNC_ROLE_SCENARIOS} from '../js/core/cloud-record-sync-role-evidence.js';
import {buildDurableOpenRecordSyncV1WriterCurrent} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {buildRecordSyncV1RawDocumentRoot} from '../js/core/cloud-record-sync-v1-raw-document-root.js';
import {
  STAGING_V2_ACTIVATION_MANIFEST_PATH,
  STAGING_V2_BACKUP_PATH,
  STAGING_V2_MAIN_PATH,
  STAGING_V2_READINESS_BLOCKER,
  createStagingV2ReadinessAdapter,
} from '../js/core/firebase-staging-v2-readiness-adapter.js';
import {
  createFirebaseRecordSyncV1WriterCurrentAdapter,
  RECORD_SYNC_V1_WRITER_CURRENT_PATH,
  RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,
  RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,
} from '../js/core/firebase-record-sync-v1-writer-current-adapter.js';
import {RECORD_SYNC_V1_FULL_RECORD_COLLECTION_PATH} from '../js/core/firebase-record-sync-v1-post-pause-scan-adapter.js';
import {RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_PATH} from '../js/core/firebase-record-sync-v1-v2-hard-pause-adapter.js';
import {createStagingV2WriterCurrentPrerequisite} from '../js/core/staging-v2-writer-current-prerequisite.js';

const at='2026-08-16T12:05:00+08:00';
const stamp={seconds:1786853100,nanoseconds:123456789};
const owner={uid:'owner-12345678',email:'owner@example.com'};
const db=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(name=>[name,name==='students'?[{id:'student-1',name:'A'}]:[]]));
const audit=(value,type='persisted')=>({...value,persistedAt:stamp,...(type==='control'?{activatedBy:owner.uid,activatedByEmail:owner.email}:type==='safety'?{updatedBy:owner.uid,updatedByEmail:owner.email}:{persistedBy:owner.uid,persistedByEmail:owner.email})});
const adminSnapshot=value=>({exists:value!==null&&value!==undefined,data:()=>value??undefined});

function fixture({withWriter=true,adminSnapshots=false}={}){
  const mainDb=db(),sourceHash=recordDataHash(mainDb),legacyVersionHash='legacy-version-123';
  const roleEvidence=buildRecordSyncRoleEvidence({environment:'staging',primaryOwnerEmail:'owner@example.com',backupOwnerEmail:'backup@example.com',schedulerEmail:'scheduler@example.com',teacherAccounts:['teacher@example.com'],roleViewCount:4,candidateRunId:'role-run-123',candidateSourceHash:'b'.repeat(64),candidateManifestHash:'c'.repeat(64),receiptCount:6,receiptSetHash:'d'.repeat(64),results:Object.fromEntries(RECORD_SYNC_ROLE_SCENARIOS.map(key=>[key,true])),testedAt:'2026-08-16T11:55:00+08:00'});
  const open=buildOpenRecordSyncCandidateControl({candidateEpoch:'candidate-12345678',legacyVersionHash,createdAt:'2026-08-16T11:50:00+08:00'}),candidateControl=sealRecordSyncCandidateControl({control:open,currentLegacyVersionHash:legacyVersionHash,recordDataHash:sourceHash,documentCount:1,activeCount:1,tombstoneCount:0,sealedAt:'2026-08-16T11:58:00+08:00'});
  const backupId='backup-source-123',restoreReceiptId='restore-source-123';
  const activationManifest=buildRecordSyncActivationManifest({environment:'staging',activationEpoch:'active-epoch-12345',candidateControl,legacyVersionHash,recordDataHash:sourceHash,roleEvidence,backupId,restoreReceiptId,documentCount:1,activeCount:1,tombstoneCount:0,createdAt:'2026-08-16T12:00:00+08:00'}),control=buildActiveRecordSyncControl({manifest:activationManifest,currentLegacyVersionHash:legacyVersionHash,currentRecordDataHash:sourceHash,currentRoleEvidenceHash:activationManifest.roleEvidenceHash,activatedAt:at}),safety={schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch:control.activationEpoch,state:'active',revision:1,lastEventId:'active-event-12345',lastEventHash:'e'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:at};
  const writer=buildDurableOpenRecordSyncV1WriterCurrent({recordSyncControl:control,safetyControl:safety,writerGeneration:1,minClientProtocolVersion:4,minClientReleaseId:'20.26.114',createdAt:safety.updatedAt});
  const prepared=prepareImmutableMigrationBackup(mainDb,{backupId,sourceVersionHash:legacyVersionHash,maxChunkBytes:4096}),backup=sealImmutableMigrationBackup(prepared.plan,verifyImmutableMigrationBackupReadback(prepared.plan,prepared.chunks),{verifiedBy:owner.uid,verifiedByEmail:owner.email});
  const rows=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(name=>[name,[]]));
  rows.students=[{documentId:'student-1',data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection:'students',recordId:'student-1',record:{id:'student-1',name:'A'},recordIndex:null,sourceHash,revision:1,deleted:false,environment:'staging',updatedAt:stamp,updatedBy:owner.uid,updatedByEmail:owner.email}}];
  const root=buildRecordSyncV1RawDocumentRoot({documentsByCollection:Object.fromEntries(FULL_RECORD_COLLECTIONS.map(name=>[name,rows[name].map(row=>({documentId:row.documentId,data:{...row.data,updatedAt:{schema:'danbridge-firestore-semantic-value-v1',type:'timestamp',seconds:String(stamp.seconds),nanoseconds:stamp.nanoseconds}}}))]))});
  assert.equal(root.manifest.documentCount,control.documentCount);
  const docs=new Map([
    [RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,audit(control,'control')],
    [RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,audit(safety,'safety')],
    [RECORD_SYNC_V1_WRITER_CURRENT_PATH,withWriter?audit(writer):null],
    [STAGING_V2_ACTIVATION_MANIFEST_PATH(control.manifestHash),audit(activationManifest)],
    [STAGING_V2_MAIN_PATH,{db:mainDb,clientHash:legacyVersionHash}],
    [STAGING_V2_BACKUP_PATH(backupId),audit(backup)],
  ]);
  const reads=[],pages=[];
  const adapter=createStagingV2ReadinessAdapter({
    expectedProjectId:'danbridge-d8877-staging',
    getDocumentFromServer:async path=>{reads.push(path);const value=docs.get(path)??null;return adminSnapshots?adminSnapshot(value):value},
    getCollectionPageFromServer:async(path,options)=>{pages.push([path,options]);const name=FULL_RECORD_COLLECTIONS.find(value=>RECORD_SYNC_V1_FULL_RECORD_COLLECTION_PATH(value)===path);return{name:undefined,docs:(rows[name]??[]).map(row=>({id:row.documentId,data:()=>row.data}))}},
  });
  const supervisorManifest={projectId:'danbridge-d8877-staging',requestHash:'1'.repeat(64),rulesetHash:'2'.repeat(64)};
  const context={manifest:supervisorManifest,phase:'READINESS',step:'READINESS_CHECK',priorStepCapabilities:{},phaseStepCapabilities:{}};
  return{adapter,backup,context,control,docs,legacyVersionHash,mainDb,pages,reads,root,rows,safety,writer};
}

test('seed input從固定C/S/activation manifest建立exact W0，無寫入且existing replay一致',async()=>{
  const missing=fixture({withWriter:false}),seed=await missing.adapter.seedInput();
  assert.equal(seed.state,'open-required');assert.equal(seed.readCount,4);assert.equal(seed.writeCount,0);assert.deepEqual(seed.input.writerCurrent,missing.writer);assert.equal(missing.reads.length,4);
  const replay=fixture(),again=await replay.adapter.seedInput();assert.equal(again.state,'open-replay');assert.deepEqual(again.input.writerCurrent,replay.writer);
});

test('W0 prerequisite以exact service account單次create，response readback後可由新runner零寫replay',async()=>{
  const value=fixture({withWriter:false}),actor={uid:'service-account:danbridge-staging-v2',email:'danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com',claims:{recordSyncV2CutoverOperator:true}};
  const binder=createFirebaseRecordSyncV1WriterCurrentAdapter({environment:'staging',role:'staging-service-account',actor,serverTimestamp:()=>stamp,getDocumentFromServer:async path=>value.docs.get(path)??null,runTransaction:async callback=>{const pending=[];const result=await callback({get:async path=>value.docs.get(path)??null,set:(path,payload)=>pending.push([path,payload])});for(const row of pending)value.docs.set(...row);return result}});
  const first=createStagingV2WriterCurrentPrerequisite({readiness:value.adapter,writerCurrent:binder}),receipt=await first.run();assert.equal(receipt.state,'complete-confirmed');assert.equal(receipt.transactionState,'created');assert.equal(receipt.readCount,8);assert.equal(receipt.writeCount,1);assert.match(receipt.receiptHash,/^[a-f0-9]{64}$/);await assert.rejects(()=>first.run(),/one-shot/);
  const replay=await createStagingV2WriterCurrentPrerequisite({readiness:value.adapter,writerCurrent:binder}).run();assert.equal(replay.transactionState,'replayed');assert.equal(replay.writeCount,0);
  const denied=createFirebaseRecordSyncV1WriterCurrentAdapter({environment:'staging',role:'staging-service-account',actor:{...actor,email:'wrong@example.com'},serverTimestamp:()=>stamp,getDocumentFromServer:async()=>null,runTransaction:async()=>{throw new Error('must not transact')}}),deniedInput=(await value.adapter.seedInput()).input;await assert.rejects(()=>denied.execute(deniedInput),/exact WIF service account/);
});

test('Admin SDK boolean exists 與 data() 快照可完成 readiness 與 W0 單次建立',async()=>{
  const ready=fixture({adminSnapshots:true}),result=await ready.adapter.readinessCheck(ready.context);
  assert.equal(result.writeCount,0);assert.equal(result.capability.expected.recordSyncControl.activationEpoch,ready.control.activationEpoch);
  const missing=fixture({withWriter:false,adminSnapshots:true}),actor={uid:'service-account:danbridge-staging-v2',email:'danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com',claims:{recordSyncV2CutoverOperator:true}};
  const binder=createFirebaseRecordSyncV1WriterCurrentAdapter({environment:'staging',role:'staging-service-account',actor,serverTimestamp:()=>stamp,getDocumentFromServer:async path=>adminSnapshot(missing.docs.get(path)??null),runTransaction:async callback=>{const pending=[];const receipt=await callback({get:async path=>adminSnapshot(missing.docs.get(path)??null),set:(path,payload)=>pending.push([path,payload])});for(const row of pending)missing.docs.set(...row);return receipt}});
  const receipt=await createStagingV2WriterCurrentPrerequisite({readiness:missing.adapter,writerCurrent:binder}).run();
  assert.equal(receipt.transactionState,'created');assert.equal(receipt.writeCount,1);
});

test('readiness缺W0明確阻止；W0存在則16集合唯讀生成原生hard-pause capability',async()=>{
  const missing=fixture({withWriter:false});await assert.rejects(()=>missing.adapter.readinessCheck(missing.context),/STAGING_V2_W0_REQUIRED/);
  const value=fixture(),result=await value.adapter.readinessCheck(value.context);
  assert.equal(result.writeCount,0);assert.equal(result.readCount,7);assert.equal(value.pages.length,16);
  assert.equal(result.capability.expected.recordSyncControl.activationEpoch,value.control.activationEpoch);
  assert.equal(result.capability.transitionPlan.request.rulesetHash,'2'.repeat(64));
  assert.equal(result.capability.transitionPlan.request.preflightRawDocumentRoot,value.root.manifest.rawDocumentRootHash);
  assert.equal(result.capability.transitionPlan.request.freezeId,'freeze:'+'1'.repeat(32));
});

test('hard pause後新runner由固定receipt重建同一W0與transition，prerequisite零寫跳過W0 binder',async()=>{
  const value=fixture(),first=await value.adapter.readinessCheck(value.context),transition=first.capability.transitionPlan;
  value.docs.set(RECORD_SYNC_V1_WRITER_CURRENT_PATH,audit(transition.nextWriterCurrent));
  value.docs.set(RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,audit(transition.nextSafetyControl,'safety'));
  value.docs.set(RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_PATH(transition.activationEpoch,transition.request.freezeId),audit(transition.transitionReceipt));
  const seed=await value.adapter.seedInput();
  assert.equal(seed.state,'hard-paused-replay');assert.equal(seed.readCount,5);assert.deepEqual(seed.input.writerCurrent,value.writer);
  let writerCalls=0;
  const prerequisite=await createStagingV2WriterCurrentPrerequisite({readiness:value.adapter,writerCurrent:{execute:async()=>{writerCalls++;throw new Error('must not write W0 after hard pause')}}}).run();
  assert.equal(writerCalls,0);assert.equal(prerequisite.transactionState,'hard-paused-replayed');assert.equal(prerequisite.readCount,5);assert.equal(prerequisite.writeCount,0);
  const replay=await value.adapter.readinessCheck(value.context);
  assert.equal(replay.readCount,8);assert.equal(replay.writeCount,0);assert.deepEqual(replay.capability.transitionPlan,transition);
});

test('main、backup、raw count/audit或source lineage任一漂移都在hard pause前fail closed',async()=>{
  const cases=[
    value=>value.docs.set(STAGING_V2_MAIN_PATH,{db:{...value.mainDb,students:[{id:'student-1',name:'changed'}]},clientHash:value.legacyVersionHash}),
    value=>value.docs.set(STAGING_V2_BACKUP_PATH(value.control.backupId),audit({...value.backup,verifiedHash:'f'.repeat(64)})),
    value=>{value.rows.students[0].data.updatedAt=null},
    value=>{value.rows.students.push(structuredClone(value.rows.students[0]));value.rows.students[1].documentId='student-2';value.rows.students[1].data.recordId='student-2';value.rows.students[1].data.record={id:'student-2'}},
    value=>value.docs.set(RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,audit({...value.safety,lastEventHash:'f'.repeat(64)},'safety')),
  ];
  for(const mutate of cases){const value=fixture();mutate(value);await assert.rejects(()=>value.adapter.readinessCheck(value.context));}
});

test('wrong project/context與accessor config在任何I/O前拒絕',async()=>{
  let calls=0;
  assert.throws(()=>createStagingV2ReadinessAdapter({expectedProjectId:'wrong-project',getDocumentFromServer:async()=>{calls++},getCollectionPageFromServer:async()=>{calls++}}),new RegExp(STAGING_V2_READINESS_BLOCKER));
  const value=fixture(),wrong={...value.context,manifest:{...value.context.manifest,projectId:'wrong-project'}};await assert.rejects(()=>value.adapter.readinessCheck(wrong),new RegExp(STAGING_V2_READINESS_BLOCKER));assert.equal(value.reads.length,0);assert.equal(calls,0);
  let getterCalls=0;const hostile={...value.context};Object.defineProperty(hostile,'manifest',{enumerable:true,get(){getterCalls++;return value.context.manifest}});await assert.rejects(()=>value.adapter.readinessCheck(hostile),/data field/);assert.equal(getterCalls,0);
});
