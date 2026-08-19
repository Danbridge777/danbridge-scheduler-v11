import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const rules=await readFile(new URL('../firebase/firestore.rules',import.meta.url),'utf8');
const functionBody=(name,next)=>rules.slice(rules.indexOf(`function ${name}(`),rules.indexOf(`function ${next}(`));

test('frozen-source proof stays at the exact ten-call backup-Owner budget without a direct H read',()=>{
 const body=functionBody('validFrozenSourceProof','legacyV1CandidateWriteOpen');
 assert.equal((body.match(/\bget\(/g)??[]).length,7);
 assert.doesNotMatch(body,/get\([^\n]*stagingRecordSyncV1V2HardPauseReceipts/);
 for(const clause of [
  'data.targetV2Epoch == pair.targetV2Epoch',
  "data.proofId == 'v1-frozen-source:' + pair.hardPauseReceiptHash",
  'data.hardPauseReceiptHash == pair.hardPauseReceiptHash',
  "data.rawBackupId == 'v1-cutover-raw:' + pair.hardPauseReceiptHash",
  'writer.lastTransitionHash == data.hardPauseReceiptHash',
  'pair.pairHash == data.scanPairHash',
  'backup.scanPairHash == data.scanPairHash',
  'readback.backupId == data.rawBackupId',
  'request.time >= readback.persistedAt'
 ])assert.ok(body.includes(clause),clause);
});

test('hard-pause and U/V/Pair lineage artifacts remain create-only immutable',()=>{
 for(const collection of [
  'stagingRecordSyncV1V2HardPauseReceipts',
  'stagingRecordSyncV1PostPauseScans',
  'stagingRecordSyncV1PostPauseScanPairs'
 ]){
  const start=rules.indexOf(`match /${collection}/`);
  assert.notEqual(start,-1,collection);
  const block=rules.slice(start,rules.indexOf('\n    match /',start+1));
  assert.match(block,/allow update, delete: if false;/,collection);
 }
});
