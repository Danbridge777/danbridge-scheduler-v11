import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildRoleViewChunks} from '../js/core/role-view-chunks.js';
import {projectProductionSchedulerDb} from '../js/core/production-role-view-projection.js';

const LESSON_COUNT=300_000;
const FIRESTORE_DOCUMENT_SAFETY_BYTES=200*1024;
const ROLE_PAYLOAD_SAFETY_BYTES=160*1024;
const ROLE_MANIFEST_SAFETY_BYTES=256*1024;
const API_BATCH_SAFETY_BYTES=8*1024*1024;
const CLIENT_SNAPSHOT_BUDGET_BYTES=64*1024*1024;
const encoder=new TextEncoder();
const byteLength=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value)).length;

const db=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
db.lessons=Array.from({length:LESSON_COUNT},(_,index)=>({
 id:`lesson-${String(index).padStart(6,'0')}`,
 studentId:`student-${index%1200}`,
 teacherId:`teacher-${index%40}`,
 teacherIds:[`teacher-${index%40}`],
 date:`2026-${String(1+(index%12)).padStart(2,'0')}-${String(1+(index%28)).padStart(2,'0')}`,
 start:`${String(8+(index%10)).padStart(2,'0')}:00`,
 end:`${String(9+(index%10)).padStart(2,'0')}:00`,
 branchId:index%2?'art_museum':'hexi',
 room:`R${index%8}`,
 status:'未上課',
 isDraft:false
}));

const started=performance.now();
// Production/staging scheduler views publish the least-privilege projection,
// not the Owner database. Verify the exact client payload that AA receives.
const schedulerDb=projectProductionSchedulerDb(db);
const built=buildRoleViewChunks(schedulerDb,{
 identity:{kind:'scheduler',email:'capacity@example.test',teacherId:'scheduler-capacity',branchIds:[]},
 sourceRevision:1,
 sourceHash:`record-v1:${'1'.repeat(64)}`,
 stableRecords:true
});
const chunkBytes=built.chunks.map(byteLength);
const payloadBytes=built.chunks.map(chunk=>byteLength(chunk.payload));
const manifestBytes=byteLength(built.manifest);
const worst25PartBatchBytes=[...chunkBytes].sort((left,right)=>right-left).slice(0,25).reduce((sum,bytes)=>sum+bytes+256,0);
const decodedBytes=payloadBytes.reduce((sum,bytes)=>sum+bytes,0);

assert.equal(built.manifest.counts.lessons,LESSON_COUNT);
assert.ok(built.chunks.length<=4096);
assert.ok(chunkBytes.every(bytes=>bytes<FIRESTORE_DOCUMENT_SAFETY_BYTES));
assert.ok(payloadBytes.every(bytes=>bytes<=ROLE_PAYLOAD_SAFETY_BYTES));
assert.ok(manifestBytes<ROLE_MANIFEST_SAFETY_BYTES);
assert.ok(worst25PartBatchBytes<API_BATCH_SAFETY_BYTES);

console.log(JSON.stringify({
 lessonCount:LESSON_COUNT,
 chunkCount:built.chunks.length,
 maxChunkBytes:Math.max(...chunkBytes),
 maxPayloadBytes:Math.max(...payloadBytes),
 manifestBytes,
 worst25PartBatchBytes,
 decodedBytes,
 decodedMiB:Number((decodedBytes/1024/1024).toFixed(2)),
 firestoreDocumentSafe:true,
 firestoreApiBatchSafe:true,
 sameSmoothClientSnapshot:decodedBytes<=CLIENT_SNAPSHOT_BUDGET_BYTES,
 elapsedMs:Math.round(performance.now()-started)
},null,2));
