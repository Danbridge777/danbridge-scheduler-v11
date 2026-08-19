import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORD_SYNC_V2_CHANGE_RESERVATION_REGISTRATION_ADAPTER_SCOPE,
  RECORD_SYNC_V2_CHANGE_RESERVATION_REGISTRATION_PATH,
  consumeFirebaseRecordSyncV2ChangeReservationRegistrationCompletion,
  createFirebaseRecordSyncV2ChangeReservationRegistrationAdapter
} from '../js/core/firebase-record-sync-v2-change-reservation-registration-adapter.js';

const fakeG35=()=>({state:'complete-confirmed',transactionState:'replayed',scope:'native-admin-ci-fixed-g3-audit-receipt-capability-for-future-r0-only',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:'active-epoch-12345',sourceFreezeId:'freeze-12345678',targetV2Epoch:'v2-epoch-12345678',seedId:'v2-genesis:'+'1'.repeat(64),parentFrozenSourceProofHash:'2'.repeat(64),genesisAuthorityHash:'6'.repeat(64),genesisAuthorityAuditHash:'7'.repeat(64),receiptHash:'8'.repeat(64),receiptAuditHash:'9'.repeat(64),persistedAt:'2026-08-17T03:24:30.123456789Z',writeCount:0});
const trusted={uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}};

test('R0 fixed path與scope不接受caller alias',()=>{assert.equal(RECORD_SYNC_V2_CHANGE_RESERVATION_REGISTRATION_PATH('v2-epoch-12345678','v2-genesis:'+'a'.repeat(64)),'stagingRecordSyncV2Reservations/danbridge/epochs/v2-epoch-12345678/seeds/v2-genesis:'+'a'.repeat(64));assert.match(RECORD_SYNC_V2_CHANGE_RESERVATION_REGISTRATION_ADAPTER_SCOPE,/fixed-r0-registration/)});

test('generic adapter對manual/clone G3.5在任何I/O前拒，且不能mint global R0 completion',async()=>{let reads=0,tx=0,stamps=0;const adapter=createFirebaseRecordSyncV2ChangeReservationRegistrationAdapter({getDocumentFromServer:async()=>{reads++;return null},runTransaction:async callback=>{tx++;return callback({get:async()=>null,set(){}})},serverTimestamp:()=>{stamps++;return{}},role:'owner',actor:trusted});for(const completion of [fakeG35(),structuredClone(fakeG35())])await assert.rejects(()=>adapter.execute(completion),/native G3.5 completion/);assert.equal(reads,0);assert.equal(tx,0);assert.equal(stamps,0);assert.throws(()=>consumeFirebaseRecordSyncV2ChangeReservationRegistrationCompletion(fakeG35(),{}),/native R0 completion/)});

test('R0 public input descriptor getter與untrusted actor fail closed getter0/0I/O',async()=>{let calls=0,reads=0;const completion=Object.defineProperty(fakeG35(),'genesisAuthorityHash',{enumerable:true,get(){calls++;return'6'.repeat(64)}}),adapter=createFirebaseRecordSyncV2ChangeReservationRegistrationAdapter({getDocumentFromServer:async()=>{reads++;return null},runTransaction:async()=>{},serverTimestamp:()=>({}),role:'owner',actor:trusted});await assert.rejects(()=>adapter.execute(completion),/data field/);assert.equal(calls,0);assert.equal(reads,0);assert.throws(()=>createFirebaseRecordSyncV2ChangeReservationRegistrationAdapter({getDocumentFromServer:async()=>null,runTransaction:async()=>{},serverTimestamp:()=>({}),role:'owner',actor:{...trusted,claims:{}}}),/trusted staging Owner/)});
