import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V2_GENESIS_SEED_PLAN_ADAPTER_SCOPE,
 RECORD_SYNC_V2_GENESIS_SEED_PLAN_COMPLETION_SCOPE,
 RECORD_SYNC_V2_GENESIS_SEED_PLAN_LOCAL_COMPLETION_SCOPE,
 createFirebaseRecordSyncV2GenesisSeedPlanAdapter,
 consumeFirebaseRecordSyncV2GenesisSeedPlanCompletion
} from '../js/core/firebase-record-sync-v2-genesis-seed-plan-adapter.js';

test('G0 injectable adapter不能用plain/local/clone completion冒充native proof，且在任何I/O前拒',async()=>{
 let io=0;
 const adapter=createFirebaseRecordSyncV2GenesisSeedPlanAdapter({
  environment:'staging',role:'owner',
  actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}},
  serverTimestamp:()=>({seconds:1,nanoseconds:0}),
  getDocumentFromServer:async()=>{io++;return null},
  runTransaction:async()=>{io++}
 });
 for(const completion of [{activationEpoch:'active-epoch-12345',freezeId:'freeze-12345678'},structuredClone({activationEpoch:'active-epoch-12345',freezeId:'freeze-12345678'})])await assert.rejects(()=>adapter.execute(completion),/native frozen source proof completion|capability/);
 assert.equal(io,0);
 assert.match(adapter.scope,/fixed-g0/);
 assert.match(RECORD_SYNC_V2_GENESIS_SEED_PLAN_ADAPTER_SCOPE,/not-genesis-persistence-readback-authority/);
 assert.match(RECORD_SYNC_V2_GENESIS_SEED_PLAN_LOCAL_COMPLETION_SCOPE,/local-g0-capability/);
 assert.match(RECORD_SYNC_V2_GENESIS_SEED_PLAN_COMPLETION_SCOPE,/future-genesis-batches-only/);
 assert.throws(()=>consumeFirebaseRecordSyncV2GenesisSeedPlanCompletion(Object.freeze({}),{expectedTargetV2Epoch:'v2-epoch-12345678',expectedSeedId:'v2-genesis:'+'a'.repeat(64),expectedSourceFreezeId:'freeze-12345678',expectedParentFrozenSourceProofHash:'b'.repeat(64),expectedManifestHash:'c'.repeat(64)}),/native G0 completion/);
});
