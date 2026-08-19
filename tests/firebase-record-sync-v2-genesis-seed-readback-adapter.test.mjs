import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V2_GENESIS_ALL_BATCHES_SCOPE,
 RECORD_SYNC_V2_GENESIS_COMPLETE_SCOPE,
 RECORD_SYNC_V2_GENESIS_RECEIPT_PAGE_SIZE,
 RECORD_SYNC_V2_GENESIS_RECORD_PAGE_SIZE,
 RECORD_SYNC_V2_GENESIS_READBACK_RECEIPT_PATH,
 buildFirebaseRecordSyncV2GenesisAllBatchesCompletion,
 consumeFirebaseRecordSyncV2GenesisSeedReadbackCompletion,
 createFirebaseRecordSyncV2GenesisSeedReadbackAdapter
} from '../js/core/firebase-record-sync-v2-genesis-seed-readback-adapter.js';

const expected={expectedTargetV2Epoch:'v2-epoch-12345678',expectedSeedId:'v2-genesis:'+'a'.repeat(64),expectedParentFrozenSourceProofHash:'b'.repeat(64),expectedSeedManifestHash:'c'.repeat(64),expectedDurableManifestHash:'d'.repeat(64),expectedReadbackReceiptHash:'e'.repeat(64)};

test('G2只接受global native dense G0/G1與completion brands；manual/clone在I/O前拒',async()=>{
 let io=0;const adapter=createFirebaseRecordSyncV2GenesisSeedReadbackAdapter({environment:'staging',role:'owner',actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}},serverTimestamp:()=>({seconds:1,nanoseconds:2}),getDocumentFromServer:async()=>{io++;return null},getCollectionPageFromServer:async()=>{io++;return[]},runTransaction:async()=>{io++}});
 assert.throws(()=>buildFirebaseRecordSyncV2GenesisAllBatchesCompletion(Object.freeze({}),[]),/G0 completion|fields/);assert.equal(io,0);
 await assert.rejects(()=>adapter.executeManifest(Object.freeze({})),/fields|all-batches/);assert.equal(io,0);
 assert.throws(()=>consumeFirebaseRecordSyncV2GenesisSeedReadbackCompletion(Object.freeze({}),expected),/native G2 completion/);
});

test('G2 fixed paths/page caps與scope不冒充G3、reservation或activation authority',()=>{
 const path=RECORD_SYNC_V2_GENESIS_READBACK_RECEIPT_PATH('v2-epoch-12345678','v2-genesis:'+'a'.repeat(64));assert.equal(path,'stagingRecordSyncV2Genesis/danbridge/epochs/v2-epoch-12345678/seeds/v2-genesis:'+'a'.repeat(64)+'/artifacts/readback');
 assert.equal(RECORD_SYNC_V2_GENESIS_RECEIPT_PAGE_SIZE,400);assert.equal(RECORD_SYNC_V2_GENESIS_RECORD_PAGE_SIZE,32);assert.match(RECORD_SYNC_V2_GENESIS_ALL_BATCHES_SCOPE,/not-manifest-readback-reservation-or-activation/);assert.match(RECORD_SYNC_V2_GENESIS_COMPLETE_SCOPE,/future-g3-only/);
});
