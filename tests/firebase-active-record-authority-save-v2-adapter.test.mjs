import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_ADAPTER_SCOPE,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_COMPLETION_SCOPE,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_LEDGER_PATH,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_LOCAL_SCOPE,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_PRODUCTION_BLOCKER,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECEIPT_PATH,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECORD_PATH,
 ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECOVERY_COMPLETION_SCOPE,
 consumeFirebaseActiveRecordAuthoritySaveRecoveryV2Completion,
 consumeFirebaseActiveRecordAuthoritySaveV2Completion,
 createFirebaseActiveRecordAuthoritySaveV2Adapter,
 createFirebaseActiveRecordAuthoritySaveV2AdminBinder,
 readFirebaseActiveRecordAuthoritySaveV2SealedGenesisBaselines
} from '../js/core/firebase-active-record-authority-save-v2-adapter.js';

const hex=n=>n.toString(16).repeat(64);
function fakeRecovery(){return{state:'complete-confirmed',transactionState:'recovered',scope:'native-admin-ci-fixed-twelve-document-read-only-post-cutover-recovery-capability-for-first-daily-only',environment:'staging',companyId:'danbridge',projectId:'danbridge-rules-test',sourceV1ActivationEpoch:'source-epoch-v1',sourceFreezeId:'source-freeze-v1',targetV2Epoch:'target-epoch-v2',seedId:'v2-genesis:'+hex(1),identityIndexRootHash:hex(21),identityIndexRootAuditHash:hex(22),identityIndexRootPersistedAt:'2026-08-17T23:59:59.000000001Z',authorityRootHash:hex(2),candidateControlHash:hex(3),candidateHeadHash:hex(4),candidatePairAuditHash:hex(5),activationIntentHash:hex(6),activationIntentAuditHash:hex(7),deploymentAttestationHash:hex(8),deploymentAttestationAuditHash:hex(9),deploymentEvidenceHash:hex(10),deploymentEvidenceAuditHash:hex(11),rulesetHash:hex(12),runtimePolicyHash:hex(13),orderedGateSetHash:hex(14),candidatePolicyHash:hex(15),activeHeadHash:hex(16),activeControlHash:hex(17),activationReceiptHash:hex(18),atomicAuditHash:hex(19),fenceHash:hex(20),persistedAt:'2026-08-18T00:00:00.000000001Z',writeCount:0}}
const request={save:{saveId:'save-native-h1-12345',deviceId:'device-native-h1-12345',actorUid:'owner-native-h1-12345',actorEmail:'owner-native-h1@example.com',createdAt:'2026-08-18T00:00:00.000000001Z'},changedKeys:[{collection:'lessons',recordId:'lesson-native-h1-12345'}],baselineRecords:[],localRecords:[]};

test('native authority-save-v2 paths/scopes固定且沒有browser/runtime wiring',async()=>{
 assert.equal(ACTIVE_RECORD_AUTHORITY_SAVE_V2_LEDGER_PATH('epoch-v2-12345','save-native-h1-12345'),'stagingActiveRecordV2SaveCommits/danbridge/epochs/epoch-v2-12345/saves/save-native-h1-12345');
 assert.equal(ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECORD_PATH('epoch-v2-12345','lessons','lesson-native-h1-12345'),'stagingActiveRecordV2Records/danbridge/epochs/epoch-v2-12345/collections/lessons/records/lesson-native-h1-12345');
 assert.equal(ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECEIPT_PATH('epoch-v2-12345','save-native-h1-12345:01'),'stagingActiveRecordV2OperationReceipts/danbridge/epochs/epoch-v2-12345/operations/save-native-h1-12345:01');
 assert.match(ACTIVE_RECORD_AUTHORITY_SAVE_V2_ADAPTER_SCOPE,/structural-transaction-or-exact-replay/);assert.match(ACTIVE_RECORD_AUTHORITY_SAVE_V2_COMPLETION_SCOPE,/full-genesis-union-verification-only/);assert.match(ACTIVE_RECORD_AUTHORITY_SAVE_V2_RECOVERY_COMPLETION_SCOPE,/read-only-post-h1-recovery/);assert.match(ACTIVE_RECORD_AUTHORITY_SAVE_V2_LOCAL_SCOPE,/not-global-runtime/);assert.match(ACTIVE_RECORD_AUTHORITY_SAVE_V2_PRODUCTION_BLOCKER,/genesis-baseline.*iam-allowlist/);
 const source=await readFile(new URL('../js/core/firebase-active-record-authority-save-v2-adapter.js',import.meta.url),'utf8');for(const forbidden of ['firebase/auth','firebase/firestore','firebase-auth-and-cloud-sync','cloud-active-record-runtime','cloud-active-record-page-controller'])assert.equal(source.includes(forbidden),false,forbidden);assert.equal((source.match(/tx\.set\(/g)??[]).length,4);assert.match(source,/return\{\.\.\.envelope,recordHash\}/);
});

test('Hn sealed Genesis reader 的 changedKeys 驗證函式已實際綁定',async()=>{
 await assert.rejects(()=>readFirebaseActiveRecordAuthoritySaveV2SealedGenesisBaselines({
  reader:async()=>null,
  authorizeDerivedReadPath:()=>{},
  indexRoot:null,
  sourceIdentity:{sourceV1ActivationEpoch:'source-epoch-v1',targetV2Epoch:'target-epoch-v2',seedId:'v2-genesis:'+hex(1),identityIndexRootHash:hex(2),identityIndexRootAuditHash:hex(3),identityIndexRootPersistedAt:'2026-08-17T23:59:59.000000001Z'},
  keys:[{collection:'lessons',recordId:'lesson-native-hn-12345'}]
 }),error=>error instanceof Error&&error.name!=='ReferenceError'&&/(?:Genesis|identity index) root/.test(error.message));
});

test('generic authority-save-v2 clone/fake recovery在任何I/O前拒且config getter0',async()=>{let reads=0,transactions=0,getters=0;const hostile={expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null};Object.defineProperty(hostile,'beforePersistence',{enumerable:true,get(){getters++;return async()=>{}}});assert.throws(()=>createFirebaseActiveRecordAuthoritySaveV2Adapter(hostile),/own enumerable data field/);assert.equal(getters,0);const adapter=createFirebaseActiveRecordAuthoritySaveV2Adapter({expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{transactions++},serverTimestamp:()=>null});assert.equal(adapter.scope,ACTIVE_RECORD_AUTHORITY_SAVE_V2_ADAPTER_SCOPE);await assert.rejects(()=>adapter.execute(fakeRecovery(),request),/native post-cutover recovery completion invalid/);assert.equal(reads,0);assert.equal(transactions,0);assert.throws(()=>consumeFirebaseActiveRecordAuthoritySaveV2Completion(Object.freeze({}),{}),/native authority-save-v2 completion invalid/);assert.throws(()=>consumeFirebaseActiveRecordAuthoritySaveRecoveryV2Completion(Object.freeze({}),{}),/native authority-save-v2 recovery completion invalid/)});

test('request外層與changedKeys getter0且M9在I/O前fail-fast',async()=>{let calls=0,reads=0;const adapter=createFirebaseActiveRecordAuthoritySaveV2Adapter({expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{},serverTimestamp:()=>null}),hostile={...request};Object.defineProperty(hostile,'save',{enumerable:true,get(){calls++;return request.save}});await assert.rejects(()=>adapter.execute(fakeRecovery(),hostile),/native post-cutover recovery completion invalid/);assert.equal(calls,0);assert.equal(reads,0)});

test('Admin binder只接受same App/Firestore rules-test emulator且recover無selector',async()=>{const name='authority-save-v2-focused-'+Date.now(),app=initializeApp({projectId:'danbridge-rules-test'},name),other=initializeApp({projectId:'wrong-project-12345'},name+'-other'),firestore=getFirestore(app),otherFirestore=getFirestore(other),saved=process.env.FIRESTORE_EMULATOR_HOST;try{delete process.env.FIRESTORE_EMULATOR_HOST;assert.throws(()=>createFirebaseActiveRecordAuthoritySaveV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'}),/staging-service-account/);process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:1';assert.throws(()=>createFirebaseActiveRecordAuthoritySaveV2AdminBinder({app,firestore,expectedProjectId:'wrong-project-12345'}),/staging-service-account/);assert.throws(()=>createFirebaseActiveRecordAuthoritySaveV2AdminBinder({app,firestore:otherFirestore,expectedProjectId:'danbridge-rules-test'}),/App\/Firestore identity/);const binder=createFirebaseActiveRecordAuthoritySaveV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'});assert.equal(binder.execute.length,2);assert.equal(binder.recover.length,0)}finally{if(saved===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=saved;await Promise.all([deleteApp(app),deleteApp(other)])}});
