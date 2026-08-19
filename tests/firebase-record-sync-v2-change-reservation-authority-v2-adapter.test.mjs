import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
 RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_V2_ADAPTER_SCOPE,
 RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_V2_PATH,
 createFirebaseRecordSyncV2ChangeReservationAuthorityV2Adapter,
 createFirebaseRecordSyncV2ChangeReservationAuthorityV2Binder
} from '../js/core/firebase-record-sync-v2-change-reservation-authority-v2-adapter.js';

const manualQ=()=>({state:'complete-confirmed',transactionState:'replayed',scope:'native-fixed-qv2-complete-capability-for-future-r-only',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:'v1-epoch-2026-0001',sourceFreezeId:'freeze-2026-00000001',targetV2Epoch:'v2-epoch-2027-0001',seedId:'v2-genesis:'+'a'.repeat(64),registrationHash:'b'.repeat(64),registrationAuditHash:'c'.repeat(64),batchSetSealHash:'d'.repeat(64),finalizationManifestHash:'e'.repeat(64),finalizationCursorHash:'f'.repeat(64),readbackReceiptHash:'1'.repeat(64),readbackReceiptAuditHash:'2'.repeat(64),batchCount:0,persistedAt:'2026-08-17T03:27:00.123456789Z',writeCount:0});
const adapter=counter=>createFirebaseRecordSyncV2ChangeReservationAuthorityV2Adapter({environment:'staging',role:'owner',actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}},serverTimestamp:()=>{counter.calls++;return null},getDocumentFromServer:async()=>{counter.calls++;return null},runTransaction:async()=>{counter.calls++}});

test('authority-v2 fixed path與scope僅供future intent，沒有runtime/active別名',()=>{const path=RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_V2_PATH('v2-epoch-2027-0001','v2-genesis:'+'a'.repeat(64));assert.equal(path,'stagingRecordSyncV2ReservationAuthorities/danbridge/epochs/v2-epoch-2027-0001/seeds/v2-genesis:'+'a'.repeat(64));assert.match(RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_V2_ADAPTER_SCOPE,/six-fixed-document/);assert.doesNotMatch(RECORD_SYNC_V2_CHANGE_RESERVATION_AUTHORITY_V2_ADAPTER_SCOPE,/runtime|active-control/)});

test('generic adapter只接受global native Qv2；manual/clone在任何I/O前拒且不能mint global authority',async()=>{for(const completion of [manualQ(),structuredClone(manualQ())]){const counter={calls:0};await assert.rejects(()=>adapter(counter).execute(completion),/native Qv2 completion/);assert.equal(counter.calls,0)}});

test('authority-v2 public Q descriptor accessor與custom proto getter0/0I/O fail closed',async()=>{let getterCalls=0;const hostile=manualQ();Object.defineProperty(hostile,'state',{enumerable:true,get(){getterCalls++;return'complete-confirmed'}});const counter={calls:0};await assert.rejects(()=>adapter(counter).execute(hostile),/data field/);assert.equal(getterCalls,0);assert.equal(counter.calls,0);await assert.rejects(()=>adapter(counter).execute(Object.assign(Object.create({}),manualQ())),/plain object/);assert.equal(counter.calls,0)});

test('binder固定same app/project且dual emulator外不接受任意project',()=>{const app={options:{projectId:'foreign-project-12345'}},firestore={app},auth={app,currentUser:null};assert.throws(()=>createFirebaseRecordSyncV2ChangeReservationAuthorityV2Binder({firestore,auth,expectedProjectId:'danbridge-d8877-staging'}),/same app\/project/);assert.throws(()=>createFirebaseRecordSyncV2ChangeReservationAuthorityV2Binder({firestore,auth,expectedProjectId:'foreign-project-12345'}),/dual emulators/)});

test('authority-v2 modules不import舊raw Q/R、candidate、intent或runtime',()=>{const pure=readFileSync(new URL('../js/core/cloud-record-sync-v2-change-reservation-authority-v2.js',import.meta.url),'utf8'),firebase=readFileSync(new URL('../js/core/firebase-record-sync-v2-change-reservation-authority-v2-adapter.js',import.meta.url),'utf8');for(const source of [pure,firebase]){assert.doesNotMatch(source,/from ['"].*cloud-record-sync-v2-change-reservation-(?:authority|readback)\.js['"]/);assert.doesNotMatch(source,/takeover-candidate\.js|activation-cutover-intent|cloud-active-record-runtime/)}assert.match(firebase,/change-reservation-readback-v2-adapter\.js/);for(const field of ['identityIndexRootHash','identityIndexRootAuditHash','identityIndexRootPersistedAt'])assert.match(firebase,new RegExp(field+':verification\\.authority\\.'+field))});
