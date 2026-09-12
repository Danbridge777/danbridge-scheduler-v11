import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionSafety} from '../tools/compatible-production-cutover.mjs';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
test('cutover only changes verified safety controls and preserves complete authority identity',()=>{
 const body={schema:'danbridge-production-record-runtime-safety-v2',environment:'production',companyId:'danbridge',activationEpoch:'synthetic-epoch',state:'active',revision:41,recordRevision:40,recordDataHash:'record-v1:'+'a'.repeat(64),documentCount:52,activeCount:50,tombstoneCount:2,lastOperationId:'operation-40',previousEventHash:'b'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-09-12T00:00:00.000Z'};
 const original={...body,lastEventHash:sha256Canonical(body),updatedBy:'synthetic-actor',persistedAt:{seconds:1}},paused=transitionSafety(original,'pause','2026-09-12T01:00:00.000Z'),resumed=transitionSafety(paused,'resume','2026-09-12T02:00:00.000Z');
 assert.equal(resumed.updatedBy,original.updatedBy);assert.deepEqual(resumed.persistedAt,original.persistedAt);
 for(const row of [paused,resumed])for(const key of ['activationEpoch','recordRevision','recordDataHash','documentCount','activeCount','tombstoneCount','lastOperationId','readAllowed'])assert.equal(row[key],original[key]);
 assert.equal(paused.state,'paused');assert.equal(paused.writeAllowed,false);assert.equal(resumed.state,'active');assert.equal(resumed.writeAllowed,true);assert.equal(resumed.revision,43);assert.equal(resumed.previousEventHash,paused.lastEventHash);
 assert.throws(()=>transitionSafety(original,'resume','2026-09-12T02:00:00Z'));
 assert.throws(()=>transitionSafety({...original,recordRevision:39},'pause','2026-09-12T02:00:00Z'));
 assert.throws(()=>transitionSafety(original,'pause','invalid'));
});
