import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 createFirebaseRecordSyncV2ActivationCutoverIntentV2Adapter,
 createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder,
 RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_ADAPTER_SCOPE,
 RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_PATH,
 RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_PRODUCTION_BLOCKER
} from '../js/core/firebase-record-sync-v2-activation-cutover-intent-v2-adapter.js';
import {RECORD_SYNC_V2_TAKEOVER_CANDIDATE_V2_COMPLETION_SCOPE} from '../js/core/firebase-record-sync-v2-takeover-candidate-v2-adapter.js';

const base=()=>({expectedProjectId:'danbridge-rules-test',getDocumentFromServer:async()=>null,runTransaction:async()=>{},serverTimestamp:()=>null});

test('I2 fixed singleton與Candidate capability scope只指向native I2',()=>{
 assert.equal(RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_PATH('v2-epoch-12345678'),'stagingRecordSyncV2ActivationCutoverIntents/danbridge/epochs/v2-epoch-12345678');
 assert.match(RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_ADAPTER_SCOPE,/fixed-eight-document/);
 assert.match(RECORD_SYNC_V2_TAKEOVER_CANDIDATE_V2_COMPLETION_SCOPE,/native-i2-only$/);
 assert.doesNotMatch(RECORD_SYNC_V2_TAKEOVER_CANDIDATE_V2_COMPLETION_SCOPE,/future-d1/);
});

test('I2 generic config descriptor-safe、無cache alias且local adapter不公開global consumer',()=>{
 assert.doesNotThrow(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2Adapter(base()));
 assert.throws(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2Adapter({...base(),getDocument:async()=>null}),/config fields invalid/);
 let calls=0;const hostile=base();Object.defineProperty(hostile,'getDocumentFromServer',{enumerable:true,get(){calls++;return async()=>null}});
 assert.throws(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2Adapter(hostile),/own enumerable data field/);assert.equal(calls,0);
 assert.throws(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2Adapter({...base(),beforePersistence:null}),/fixed Admin I\/O/);
});

test('I2 Admin binder固定rules-test Emulator，production allowlist仍fail closed',()=>{
 assert.match(RECORD_SYNC_V2_ACTIVATION_CUTOVER_INTENT_V2_PRODUCTION_BLOCKER,/production-forbidden/);
 const app={options:{projectId:'danbridge-rules-test'}},firestore={};
 assert.throws(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder({app,firestore,expectedProjectId:'danbridge-rules-test'}),/Admin App\/Firestore identity/);
 let calls=0,hostile={app,firestore,expectedProjectId:'danbridge-rules-test'};Object.defineProperty(hostile,'firestore',{enumerable:true,get(){calls++;return firestore}});
 assert.throws(()=>createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder(hostile),/data field/);assert.equal(calls,0);
});

test('I2 dependency graph只接Candidate-v2 pure/native，不接D0/D1/active/runtime',async()=>{
 const source=await readFile(new URL('../js/core/firebase-record-sync-v2-activation-cutover-intent-v2-adapter.js',import.meta.url),'utf8');
 for(const forbidden of ['cloud-record-sync-v2-deployment-gate-source-attestation','cloud-record-sync-v2-trusted-deployment-evidence-v2','cloud-active-record-save-plan','cloud-record-sync-control','onAuthStateChanged'])assert.equal(source.includes(forbidden),false,forbidden);
 assert.match(source,/consumeFirebaseRecordSyncV2TakeoverCandidateV2Completion/);
 assert.match(source,/firebase-admin\/firestore/);
});
