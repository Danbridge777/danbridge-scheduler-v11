import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_ADAPTER_SCOPE,
 RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_PATH,
 RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_PRODUCTION_BLOCKER,
 consumeFirebaseRecordSyncV2GenesisAuthorityAuditReceiptCompletion,
 createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdapter,
 createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdminBinder
} from '../js/core/firebase-record-sync-v2-genesis-authority-audit-receipt-adapter.js';

const fakeG3=()=>({state:'complete-confirmed',transactionState:'replayed',scope:'native-fixed-genesis-authority-replay-capability-for-future-v2-reservation-registration-only',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:'active-epoch-12345',sourceFreezeId:'freeze-12345678',targetV2Epoch:'v2-epoch-12345678',seedId:'v2-genesis:'+'1'.repeat(64),parentFrozenSourceProofHash:'2'.repeat(64),seedManifestHash:'3'.repeat(64),durableManifestHash:'4'.repeat(64),readbackReceiptHash:'5'.repeat(64),authorityHash:'6'.repeat(64),authorityAuditHash:'7'.repeat(64),persistedAt:'2026-08-17T03:24:00.123456789Z',writeCount:0});

test('G3.5 fixed path、Admin-only scope與production allowlist blocker不可caller放寬',()=>{assert.equal(RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_PATH('v2-epoch-12345678','v2-genesis:'+'a'.repeat(64)),'stagingRecordSyncV2GenesisAuthorityAuditReceipts/danbridge/epochs/v2-epoch-12345678/seeds/v2-genesis:'+'a'.repeat(64));assert.match(RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_ADAPTER_SCOPE,/admin-ci-emulator-fixed/);assert.match(RECORD_SYNC_V2_GENESIS_AUTHORITY_AUDIT_RECEIPT_PRODUCTION_BLOCKER,/service-account.*allowlist/);assert.throws(()=>createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdminBinder({app:{options:{projectId:'production-project'}},firestore:{},expectedProjectId:'production-project'}),/Admin App\/Firestore identity|service-account.*allowlist/)});

test('generic local adapter拒manual/clone G3於任何I/O前且不能mint global G3.5',async()=>{let reads=0,tx=0,stamps=0;const adapter=createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdapter({getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{tx++},serverTimestamp:()=>{stamps++;return{}}});for(const completion of [fakeG3(),structuredClone(fakeG3())])await assert.rejects(()=>adapter.execute(completion),/native G3 completion/);assert.deepEqual([reads,tx,stamps],[0,0,0]);assert.throws(()=>consumeFirebaseRecordSyncV2GenesisAuthorityAuditReceiptCompletion(fakeG3(),{}),/native G3.5 completion/)});

test('G3.5 completion input descriptor getter拒且getter0',async()=>{let calls=0,reads=0;const completion=Object.defineProperty(fakeG3(),'authorityHash',{enumerable:true,get(){calls++;return'6'.repeat(64)}}),adapter=createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdapter({getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{},serverTimestamp:()=>({})});await assert.rejects(()=>adapter.execute(completion),/data field/);assert.equal(calls,0);assert.equal(reads,0)});
