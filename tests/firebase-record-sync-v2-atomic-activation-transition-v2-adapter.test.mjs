import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {
 createFirebaseRecordSyncV2AtomicActivationV2Adapter,
 createFirebaseRecordSyncV2AtomicActivationV2AdminBinder,
 consumeFirebaseRecordSyncV2AtomicActivationV2Completion,
 consumeFirebaseRecordSyncV2PostCutoverRecoveryV2Completion,
 normalizeFirebaseRecordSyncV2AtomicActivationV2Snapshot,
 RECORD_SYNC_V1_PERMANENT_FENCE_V2_PATH,
 RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_ADAPTER_SCOPE,
 RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_COMPLETION_SCOPE,
 RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_LOCAL_SCOPE,
 RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_PRODUCTION_BLOCKER,
 RECORD_SYNC_V2_POST_CUTOVER_RECOVERY_V2_COMPLETION_SCOPE,
 RECORD_SYNC_V2_STRUCTURAL_ACTIVE_CONTROL_PATH,
 RECORD_SYNC_V2_STRUCTURAL_ACTIVATION_RECEIPT_PATH
} from '../js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js';

const hex=n=>n.toString(16).repeat(64);
function fakeD1(){return{state:'complete-confirmed',transactionState:'replayed',scope:'native-admin-ci-fixed-d1-complete-capability-for-future-atomic-cutover-only',environment:'staging',companyId:'danbridge',projectId:'danbridge-rules-test',sourceV1ActivationEpoch:'source-epoch-v1',sourceFreezeId:'source-freeze-v1',targetV2Epoch:'target-epoch-v2',seedId:'v2-genesis:'+hex(1),identityIndexRootHash:hex(21),identityIndexRootAuditHash:hex(22),identityIndexRootPersistedAt:'2026-08-17T23:59:59.000000001Z',authorityRootHash:hex(2),candidateControlHash:hex(3),authorityBoundHeadHash:hex(4),candidatePairAuditHash:hex(5),activationIntentHash:hex(6),activationIntentAuditHash:hex(7),activationIntentPersistedAt:'2026-08-18T00:00:00.000000001Z',deploymentAttestationHash:hex(8),deploymentAttestationAuditHash:hex(9),deploymentAttestationPersistedAt:'2026-08-18T00:00:01.000000001Z',rulesetHash:hex(10),runtimePolicyHash:hex(11),sourceOrderedGateSetHash:hex(12),orderedGateSetHash:hex(13),evidenceHash:hex(14),evidenceAuditHash:hex(15),persistedAt:'2026-08-18T00:00:02.000000001Z',writeCount:0}}

test('native atomic-v2固定active/fence paths、四寫scope與recovery scope不混用',async()=>{
 assert.equal(RECORD_SYNC_V2_STRUCTURAL_ACTIVE_CONTROL_PATH('target-epoch-v2'),'stagingRecordSyncV2ActiveControls/danbridge/epochs/target-epoch-v2');
 assert.equal(RECORD_SYNC_V2_STRUCTURAL_ACTIVATION_RECEIPT_PATH('target-epoch-v2'),'stagingRecordSyncV2ActivationReceipts/danbridge/epochs/target-epoch-v2');
 assert.equal(RECORD_SYNC_V1_PERMANENT_FENCE_V2_PATH,'stagingRecordSyncV1PermanentFences/danbridge');
 assert.match(RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_ADAPTER_SCOPE,/fixed-twelve-document-four-write/);
 assert.match(RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_COMPLETION_SCOPE,/atomic-v2-poststate.*first-daily-only/);assert.doesNotMatch(RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_COMPLETION_SCOPE,/recovery/);
 assert.match(RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_LOCAL_SCOPE,/injectable-local/);
 assert.match(RECORD_SYNC_V2_POST_CUTOVER_RECOVERY_V2_COMPLETION_SCOPE,/read-only-post-cutover-recovery/);
 assert.match(RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_PRODUCTION_BLOCKER,/service-account.*iam-allowlist/);
 const source=await readFile(new URL('../js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js',import.meta.url),'utf8');
 for(const forbidden of ['cloud-record-sync-v2-activation-cutover-intent.js','cloud-record-sync-v2-trusted-deployment-evidence.js','cloud-record-sync-v2-takeover-candidate.js','firebase-auth-and-cloud-sync','cloud-active-record-save-plan'])assert.equal(source.includes(forbidden),false,forbidden);
 for(const field of ['activationIntentAuditHash','deploymentAttestationAuditHash','deploymentEvidenceAuditHash','rulesetHash','runtimePolicyHash','orderedGateSetHash','candidatePolicyHash']){assert.ok(source.includes(`'${field}'`));assert.ok(source.includes(`expected${field[0].toUpperCase()+field.slice(1)}`))}
 assert.match(source,/rebuilt=result\(RECORD_SYNC_V2_POST_CUTOVER_RECOVERY_V2_COMPLETION_SCOPE/);
 assert.equal((source.match(/tx\.set\(/g)??[]).length,4);
});

test('atomic-v2 snapshot descriptor-safe且保留nanos，getter與hostile Timestamp零執行',()=>{
 const timestamp={seconds:1787011200,nanoseconds:123456789},row=normalizeFirebaseRecordSyncV2AtomicActivationV2Snapshot({persistedAt:timestamp,persistedBy:'record-sync-v2-deploy-ci-emulator',persistedByEmail:'record-sync-v2-deploy-ci-emulator@danbridge.invalid'});
 assert.equal(row.persistedAt,'2026-08-18T00:00:00.123456789Z');assert.equal(Object.isFrozen(timestamp),false);
 let dataGetter=0,timeGetter=0;const hostile=Object.create({});Object.defineProperty(hostile,'data',{get(){dataGetter++;return()=>({})}});assert.throws(()=>normalizeFirebaseRecordSyncV2AtomicActivationV2Snapshot(hostile),/data method unsafe/);assert.equal(dataGetter,0);
 const body={persistedBy:'record-sync-v2-deploy-ci-emulator',persistedByEmail:'record-sync-v2-deploy-ci-emulator@danbridge.invalid'};Object.defineProperty(body,'persistedAt',{enumerable:true,get(){timeGetter++;return timestamp}});assert.throws(()=>normalizeFirebaseRecordSyncV2AtomicActivationV2Snapshot(body),/accessor invalid/);assert.equal(timeGetter,0);
 for(const value of [{seconds:1787011200,nanoseconds:1000000000},{_seconds:1787011200,_nanoseconds:-1},{seconds:1787011200,nanoseconds:1,extra:true}])assert.throws(()=>normalizeFirebaseRecordSyncV2AtomicActivationV2Snapshot({persistedAt:value}),/Timestamp/);
});

test('generic atomic-v2 config exact，plain/local/clone在任何I/O前拒且不mint global',async()=>{
 let getters=0,reads=0,transactions=0;
 const hostile={expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null};Object.defineProperty(hostile,'beforePersistence',{enumerable:true,get(){getters++;return async()=>{}}});
 assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2Adapter(hostile),/own enumerable data field/);assert.equal(getters,0);
 const adapter=createFirebaseRecordSyncV2AtomicActivationV2Adapter({expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null});
 assert.equal(adapter.scope,RECORD_SYNC_V2_ATOMIC_ACTIVATION_V2_ADAPTER_SCOPE);
 await assert.rejects(adapter.execute(fakeD1()),/native D1 completion invalid/);assert.equal(reads,0);assert.equal(transactions,0);
 assert.throws(()=>consumeFirebaseRecordSyncV2AtomicActivationV2Completion(Object.freeze({}),{}),/native atomic-v2 completion invalid/);
 assert.throws(()=>consumeFirebaseRecordSyncV2PostCutoverRecoveryV2Completion(Object.freeze({}),{}),/native post-cutover recovery completion invalid/);
});

test('Admin binder config固定App/Firestore/project且production fail closed；recovery不收selector或expected',async()=>{
 const name='atomic-v2-focused-'+Date.now(),app=initializeApp({projectId:'danbridge-rules-test'},name),other=initializeApp({projectId:'wrong-project-12345'},name+'-other'),firestore=getFirestore(app),otherFirestore=getFirestore(other),saved=process.env.FIRESTORE_EMULATOR_HOST;
 try{
  delete process.env.FIRESTORE_EMULATOR_HOST;
  assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'}),/service-account.*iam-allowlist/);
  process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:1';
  assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app,firestore,expectedProjectId:'wrong-project-12345'}),/service-account.*iam-allowlist/);
  assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app,firestore:otherFirestore,expectedProjectId:'danbridge-rules-test'}),/App\/Firestore identity/);
  assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app:other,firestore:otherFirestore,expectedProjectId:'wrong-project-12345'}),/service-account.*iam-allowlist/);
  let getter=0;const extra={app,firestore,expectedProjectId:'danbridge-rules-test'};Object.defineProperty(extra,'targetV2Epoch',{enumerable:true,get(){getter++;return'target-epoch-v2'}});assert.throws(()=>createFirebaseRecordSyncV2AtomicActivationV2AdminBinder(extra),/fields invalid/);assert.equal(getter,0);
  const binder=createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'});assert.equal(binder.recover.length,0);assert.equal(binder.execute.length,1);
 }finally{if(saved===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=saved;await Promise.all([deleteApp(app),deleteApp(other)])}
});
