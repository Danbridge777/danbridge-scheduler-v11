import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V2_GENESIS_BATCH_ADAPTER_SCOPE,
 RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_SCOPE,
 RECORD_SYNC_V2_GENESIS_BATCH_MAX_OPERATIONAL_UTF8_BYTES,
 RECORD_SYNC_V2_GENESIS_BATCH_MAX_RECORDS,
 RECORD_SYNC_V2_GENESIS_BATCH_MAX_WRITES,
 RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_PATH,
 RECORD_SYNC_V2_GENESIS_BATCH_RECORD_PATH,
 consumeFirebaseRecordSyncV2GenesisSeedBatchCompletion,
 createFirebaseRecordSyncV2GenesisSeedBatchAdapter
} from '../js/core/firebase-record-sync-v2-genesis-seed-batch-adapter.js';

const actor={uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:true}};
const adapter=counters=>createFirebaseRecordSyncV2GenesisSeedBatchAdapter({
 environment:'staging',role:'owner',actor,serverTimestamp:()=>({seconds:1,nanoseconds:2}),
 getDocumentFromServer:async()=>{counters.io++;return null},
 runTransaction:async()=>{counters.io++}
});

test('G1只接受global native G0 completion；plain/clone/accessor在任何I/O前拒',async()=>{
 const counters={io:0},value=adapter(counters),plain=Object.freeze({});
 await assert.rejects(()=>value.execute(plain,0),/identity|G0 completion/);assert.equal(counters.io,0);
 let calls=0;const hostile={};for(const key of ['state','transactionState','scope','environment','companyId','sourceV1ActivationEpoch','sourceFreezeId','targetV2Epoch','seedId','parentFrozenSourceProofHash','manifestHash','recordCount','batchCount','persistedAt','operationalUtf8Bytes','transactionReadCount','verificationReadCount','totalReadCount','writeCount'])Object.defineProperty(hostile,key,key==='seedId'?{enumerable:true,get(){calls++;return 'v2-genesis:'+'a'.repeat(64)}}:{enumerable:true,value:''});
 await assert.rejects(()=>value.execute(hostile,0),/data field/);assert.equal(calls,0);assert.equal(counters.io,0);
 assert.throws(()=>consumeFirebaseRecordSyncV2GenesisSeedBatchCompletion(Object.freeze({}),{expectedTargetV2Epoch:'v2-epoch-12345678',expectedSeedId:'v2-genesis:'+'a'.repeat(64),expectedParentFrozenSourceProofHash:'b'.repeat(64),expectedSeedManifestHash:'c'.repeat(64),expectedBatchIndex:0,expectedReceiptHash:'d'.repeat(64)}),/native G1 completion/);
});

test('G1 fixed paths與bounded atomic/operational policies不可caller放寬',()=>{
 const epoch='v2-epoch-12345678',seed='v2-genesis:'+'a'.repeat(64),receipt='b'.repeat(64),base=`stagingRecordSyncV2Genesis/danbridge/epochs/${epoch}/seeds/${seed}/batchReceipts/${receipt}`;
 assert.equal(RECORD_SYNC_V2_GENESIS_BATCH_RECEIPT_PATH(epoch,seed,receipt),base);
 assert.equal(RECORD_SYNC_V2_GENESIS_BATCH_RECORD_PATH(epoch,seed,receipt,'c'.repeat(64)),base+'/genesisRecords/'+'c'.repeat(64));
 assert.equal(RECORD_SYNC_V2_GENESIS_BATCH_MAX_RECORDS,8);assert.equal(RECORD_SYNC_V2_GENESIS_BATCH_MAX_WRITES,9);assert.equal(RECORD_SYNC_V2_GENESIS_BATCH_MAX_OPERATIONAL_UTF8_BYTES,8*1024*1024);
 assert.match(RECORD_SYNC_V2_GENESIS_BATCH_ADAPTER_SCOPE,/not-genesis-readback/);assert.match(RECORD_SYNC_V2_GENESIS_BATCH_COMPLETION_SCOPE,/future-dense-genesis-readback-only/);
});
