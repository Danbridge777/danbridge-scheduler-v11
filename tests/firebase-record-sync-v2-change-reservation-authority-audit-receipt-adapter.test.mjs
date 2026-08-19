import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
 RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_ADAPTER_SCOPE,
 RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_PATH,
 RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_PRODUCTION_BLOCKER,
 consumeFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptCompletion,
 createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdapter,
 createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdminBinder
} from '../js/core/firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.js';

const manualR=()=>({state:'complete-confirmed',transactionState:'replayed',scope:'native-fixed-authority-v2-complete-capability-for-future-intent-only',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:'v1-epoch-2026-0001',sourceFreezeId:'freeze-2026-00000001',targetV2Epoch:'v2-epoch-2027-0001',seedId:'v2-genesis:'+'a'.repeat(64),registrationHash:'b'.repeat(64),batchSetSealHash:'c'.repeat(64),readbackReceiptHash:'d'.repeat(64),readbackReceiptAuditHash:'e'.repeat(64),authorityHash:'f'.repeat(64),authorityAuditHash:'1'.repeat(64),persistedAt:'2026-08-17T03:28:00.123456789Z',writeCount:0});
const adapter=counter=>createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdapter({serverTimestamp:()=>{counter.calls++;return null},getDocumentFromServer:async()=>{counter.calls++;return null},runTransaction:async()=>{counter.calls++}});

test('R3.5 path、Admin emulator-only與non-active scope固定',()=>{assert.equal(RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_PATH('v2-epoch-2027-0001','v2-genesis:'+'a'.repeat(64)),'stagingRecordSyncV2ReservationAuthorityAuditReceipts/danbridge/epochs/v2-epoch-2027-0001/seeds/v2-genesis:'+'a'.repeat(64));assert.match(RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_ADAPTER_SCOPE,/admin-ci-emulator-fixed/);assert.match(RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_AUDIT_RECEIPT_PRODUCTION_BLOCKER,/service-account.*allowlist/);assert.throws(()=>createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdminBinder({app:{options:{projectId:'production-project'}},firestore:{},expectedProjectId:'production-project'}),/Admin App\/Firestore identity|service-account.*allowlist/)});

test('generic local R3.5只接受global native Rv2；manual/clone在0 I/O拒且不能mint global',async()=>{for(const completion of [manualR(),structuredClone(manualR())]){const counter={calls:0};await assert.rejects(()=>adapter(counter).execute(completion),/native authority-v2 completion/);assert.equal(counter.calls,0)}assert.throws(()=>consumeFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptCompletion(manualR(),{}),/native R3.5 completion/)});

test('Rv2 completion accessor/custom proto getter0且0 I/O',async()=>{let getterCalls=0;const hostile=manualR();Object.defineProperty(hostile,'authorityHash',{enumerable:true,get(){getterCalls++;return'f'.repeat(64)}});const counter={calls:0};await assert.rejects(()=>adapter(counter).execute(hostile),/data field/);assert.equal(getterCalls,0);assert.equal(counter.calls,0);await assert.rejects(()=>adapter(counter).execute(Object.assign(Object.create({}),manualR())),/plain object/);assert.equal(counter.calls,0)});

test('R3.5 modules不import G3.5、old candidate/raw R、intent、active或runtime',()=>{const pure=readFileSync(new URL('../js/core/cloud-record-sync-v2-change-reservation-authority-audit-receipt.js',import.meta.url),'utf8'),firebase=readFileSync(new URL('../js/core/firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.js',import.meta.url),'utf8');for(const source of [pure,firebase])assert.doesNotMatch(source,/from ['"][^'"]*(?:genesis-authority-audit-receipt|takeover-candidate|activation-cutover-intent|cloud-active-record|cloud-record-sync-v2-change-reservation-authority\.js|runtime)[^'"]*['"]/);assert.match(firebase,/from ['"].*change-reservation-authority-v2-adapter\.js['"]/)});
