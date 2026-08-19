import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {
 createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder,
 createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Adapter,
 consumeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Completion,
 normalizeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Snapshot,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_ADAPTER_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_COMPLETION_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_LOCAL_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_PATH
} from '../js/core/firebase-record-sync-v2-trusted-deployment-evidence-v2-adapter.js';

const hex=n=>n.toString(16).repeat(64);
function fakeI2(){return{state:'complete-confirmed',transactionState:'replayed',scope:'native-admin-ci-fixed-i2-complete-capability-for-native-d1-only',environment:'staging',companyId:'danbridge',projectId:'danbridge-rules-test',sourceV1ActivationEpoch:'epoch-source-v1',sourceFreezeId:'freeze-source-v1',targetV2Epoch:'epoch-target-v2',seedId:'v2-genesis:'+hex(1),identityIndexRootHash:hex(15),identityIndexRootAuditHash:hex(16),identityIndexRootPersistedAt:'2026-08-17T23:59:59.000000001Z',authorityRootHash:hex(2),candidateControlHash:hex(3),authorityBoundHeadHash:hex(4),candidatePairAuditHash:hex(5),parentFrozenSourceProofHash:hex(6),sourceHardPauseReceiptHash:hex(7),sourceRawDocumentRootHash:hex(8),genesisAuthorityHash:hex(9),genesisAuthorityAuditHash:hex(10),reservationAuthorityHash:hex(11),reservationAuthorityAuditHash:hex(12),intentHash:hex(13),intentAuditHash:hex(14),persistedAt:'2026-08-18T00:00:00.000000001Z',writeCount:0}}

test('D1 adapter固定singleton path、scope與import graph不接Candidate/舊evidence/active runtime',async()=>{
 assert.equal(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_PATH('epoch-target-v2'),'stagingRecordSyncV2DeploymentReceipts/danbridge/epochs/epoch-target-v2/receipts/trusted-deployment-evidence-v2');
 assert.match(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_ADAPTER_SCOPE,/fixed-ten-document/);
 assert.match(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_COMPLETION_SCOPE,/native-admin-ci-fixed-d1/);
 assert.match(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_LOCAL_SCOPE,/injectable-local/);
 const source=await readFile(new URL('../js/core/firebase-record-sync-v2-trusted-deployment-evidence-v2-adapter.js',import.meta.url),'utf8');
 for(const forbidden of ['takeover-candidate-v2-adapter','cloud-record-sync-v2-trusted-deployment-evidence.js','cloud-record-sync-v2-activation-cutover-intent.js','cloud-active-record','cloud-record-sync-control'])assert.equal(source.includes(forbidden),false,forbidden);
 for(const field of ['rulesetHash','runtimePolicyHash','sourceOrderedGateSetHash','activationIntentPersistedAt','deploymentAttestationPersistedAt']){assert.ok(source.includes(`expected${field[0].toUpperCase()+field.slice(1)}`));assert.ok(source.includes(`hidden.evidence.${field}`))}
});

test('D1 snapshot只讀descriptor-safe data method並精確正規化Firestore nanos',()=>{
 const semantic={seconds:1787011200,nanoseconds:123456789},row=normalizeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Snapshot({persistedAt:semantic,persistedBy:'record-sync-v2-deploy-ci-emulator',persistedByEmail:'record-sync-v2-deploy-ci-emulator@danbridge.invalid'});
 assert.equal(row.persistedAt,'2026-08-18T00:00:00.123456789Z');
 assert.equal(Object.isFrozen(semantic),false);
 let dataGetter=0,persistedGetter=0;const hostile=Object.create({});Object.defineProperty(hostile,'data',{get(){dataGetter++;return()=>({})}});assert.throws(()=>normalizeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Snapshot(hostile),/data method unsafe/);assert.equal(dataGetter,0);
 const body={persistedBy:'record-sync-v2-deploy-ci-emulator',persistedByEmail:'record-sync-v2-deploy-ci-emulator@danbridge.invalid'};Object.defineProperty(body,'persistedAt',{enumerable:true,get(){persistedGetter++;return semantic}});assert.throws(()=>normalizeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Snapshot(body),/accessor invalid/);assert.equal(persistedGetter,0);
 for(const value of [{seconds:1787011200,nanoseconds:1000000000},{_seconds:1787011200,_nanoseconds:-1},{seconds:1787011200,nanoseconds:1,extra:true}])assert.throws(()=>normalizeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Snapshot({persistedAt:value}),/Timestamp/);
});

test('D1 Admin binder固定App/Firestore/project與Emulator host，production fail closed',async()=>{
 const name='d1-focused-'+Date.now(),app=initializeApp({projectId:'danbridge-rules-test'},name),other=initializeApp({projectId:'wrong-project-12345'},name+'-other'),firestore=getFirestore(app),otherFirestore=getFirestore(other),saved=process.env.FIRESTORE_EMULATOR_HOST;
 try{
  delete process.env.FIRESTORE_EMULATOR_HOST;
  assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'}),/service-account-email-and-project-allowlist/);
  process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:1';
  assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder({app,firestore,expectedProjectId:'wrong-project-12345'}),/service-account-email-and-project-allowlist/);
  assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder({app,firestore:otherFirestore,expectedProjectId:'danbridge-rules-test'}),/App\/Firestore identity/);
  assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder({app:other,firestore:otherFirestore,expectedProjectId:'wrong-project-12345'}),/service-account-email-and-project-allowlist/);
  let getter=0;const hostile={app,firestore,expectedProjectId:'danbridge-rules-test'};Object.defineProperty(hostile,'extra',{enumerable:true,get(){getter++;return true}});assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder(hostile),/fields invalid/);assert.equal(getter,0);
 }finally{if(saved===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=saved;await Promise.all([deleteApp(app),deleteApp(other)])}
});

test('D1 adapter config descriptor-safe且plain/local/clone在任何I/O前拒',async()=>{
 let getters=0,reads=0,transactions=0;
 const bad={expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null};Object.defineProperty(bad,'beforePersistence',{enumerable:true,get(){getters++;return async()=>{}}});
 assert.throws(()=>createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Adapter(bad),/own enumerable data field/);assert.equal(getters,0);
 const adapter=createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Adapter({expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null});
 assert.equal(adapter.scope,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_V2_ADAPTER_SCOPE);
 await assert.rejects(adapter.execute(fakeI2(),{}),/native I2 completion invalid/);assert.equal(reads,0);assert.equal(transactions,0);
 assert.throws(()=>consumeFirebaseRecordSyncV2TrustedDeploymentEvidenceV2Completion(Object.freeze({}),{}),/native D1 completion invalid/);
});
