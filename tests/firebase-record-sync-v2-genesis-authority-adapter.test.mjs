import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V2_GENESIS_AUTHORITY_ADAPTER_SCOPE,
 RECORD_SYNC_V2_GENESIS_AUTHORITY_COMPLETION_SCOPE,
 RECORD_SYNC_V2_GENESIS_AUTHORITY_LOCAL_COMPLETION_SCOPE,
 RECORD_SYNC_V2_GENESIS_AUTHORITY_PATH,
 consumeFirebaseRecordSyncV2GenesisAuthorityCompletion,
 createFirebaseRecordSyncV2GenesisAuthorityAdapter
} from '../js/core/firebase-record-sync-v2-genesis-authority-adapter.js';

const expected={expectedTargetV2Epoch:'v2-epoch-12345678',expectedSeedId:'v2-genesis:'+'a'.repeat(64),expectedSourceFreezeId:'freeze-12345678',expectedParentFrozenSourceProofHash:'b'.repeat(64),expectedAuthorityHash:'c'.repeat(64),expectedAuthorityAuditHash:'d'.repeat(64)};

test('G3 fixed authority path與scope只允future reservation，不冒充intent/control/activation',()=>{
 assert.equal(RECORD_SYNC_V2_GENESIS_AUTHORITY_PATH(expected.expectedTargetV2Epoch,expected.expectedSeedId),`stagingRecordSyncV2GenesisAuthorities/danbridge/epochs/${expected.expectedTargetV2Epoch}/seeds/${expected.expectedSeedId}`);
 assert.match(RECORD_SYNC_V2_GENESIS_AUTHORITY_ADAPTER_SCOPE,/not-reservation-intent-control-or-activation/);
 assert.match(RECORD_SYNC_V2_GENESIS_AUTHORITY_COMPLETION_SCOPE,/future-reservation-only/);
 assert.match(RECORD_SYNC_V2_GENESIS_AUTHORITY_LOCAL_COMPLETION_SCOPE,/local-g3-capability/);
});

test('G3 injectable adapter不能mint global completion；plain/clone/manual在任何I/O前拒',async()=>{
 let io=0;const adapter=createFirebaseRecordSyncV2GenesisAuthorityAdapter({environment:'staging',role:'owner',actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}},serverTimestamp:()=>({seconds:1,nanoseconds:2}),beforePersistence:async()=>{io++},getDocumentFromServer:async()=>{io++;return null},runTransaction:async()=>{io++}});
 await assert.rejects(()=>adapter.execute(Object.freeze({})),/G2 completion|fields/);assert.equal(io,0);
 assert.throws(()=>consumeFirebaseRecordSyncV2GenesisAuthorityCompletion(Object.freeze({}),expected),/native G3 completion/);
 assert.throws(()=>consumeFirebaseRecordSyncV2GenesisAuthorityCompletion(structuredClone(Object.freeze({})),expected),/native G3 completion/);
});

test('G3 exact descriptor-safe input拒accessor且getter0',async()=>{
 let calls=0,io=0;const hostile={};Object.defineProperty(hostile,'state',{enumerable:true,get(){calls++;return'complete-confirmed'}});const adapter=createFirebaseRecordSyncV2GenesisAuthorityAdapter({environment:'staging',role:'owner',actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}},serverTimestamp:()=>({seconds:1,nanoseconds:2}),getDocumentFromServer:async()=>{io++},runTransaction:async()=>{io++}});
 await assert.rejects(()=>adapter.execute(hostile),/fields|data field/);assert.equal(calls,0);assert.equal(io,0);
});
