import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SHARDED_DB_COLLECTION_KEYS,createShardedSnapshot,assembleShardedSnapshot,createShardedActivation,chooseCloudReadSource,resolveCloudReadSnapshot} from '../js/core/cloud-sharded-store.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db=()=>Object.fromEntries(SHARDED_DB_COLLECTION_KEYS.map(key=>[key,[]]));
const lesson=(owner,index)=>({id:`${owner}-${index}`,date:'2026-09-01',start:'10:00',end:'11:00',studentId:`student-${owner}-${index}`,teacherId:'teacher-1',teacherIds:['teacher-1']});
const verify=value=>{const snapshot=createShardedSnapshot(value,{hash,maxChunkBytes:4096,generationId:`generation-${hash(value).slice(0,8)}`});snapshot.manifest.status='verified';snapshot.manifest.verifiedHash=snapshot.manifest.sourceHash;return{snapshot,rebuilt:assembleShardedSnapshot(snapshot.manifest,snapshot.chunks,{hash})}};

test('Daniel、Catherine、aa 各 100 堂進入分片後保留 300 個唯一 ID',()=>{
 const source=db();source.teachers=[{id:'teacher-1'}];
 for(const owner of ['daniel','catherine','aa'])for(let index=0;index<100;index++){source.lessons.push(lesson(owner,index));source.students.push({id:`student-${owner}-${index}`,name:`Student ${owner} ${index}`})}
 const {snapshot,rebuilt}=verify(source);
 assert.equal(rebuilt.lessons.length,300);assert.equal(rebuilt.students.length,300);assert.equal(new Set(rebuilt.lessons.map(row=>row.id)).size,300);
 assert.ok(snapshot.manifest.collections.lessons.chunks>1);assert.ok(snapshot.manifest.collections.students.chunks>1);
});

test('上傳期間的新修改不會被舊世代誤標完成',()=>{
 const first=db();first.lessons=[lesson('daniel',0)];const firstResult=verify(first);
 const newer=structuredClone(first);newer.lessons.push(lesson('daniel',1));const newerHash=hash(newer);
 const activation=createShardedActivation(firstResult.snapshot.manifest,{expectedLegacyHash:firstResult.snapshot.manifest.sourceHash});
 assert.equal(chooseCloudReadSource({activation,legacyHash:newerHash,verifiedGenerationId:firstResult.snapshot.manifest.generationId,verifiedGenerationHash:firstResult.snapshot.manifest.sourceHash}),'blocked');
 const secondResult=verify(newer),secondActivation=createShardedActivation(secondResult.snapshot.manifest,{expectedLegacyHash:newerHash});
 assert.equal(chooseCloudReadSource({activation:secondActivation,legacyHash:newerHash,verifiedGenerationId:secondResult.snapshot.manifest.generationId,verifiedGenerationHash:newerHash}),'sharded');
 assert.equal(secondResult.rebuilt.lessons.length,2);
});

test('中斷寫入缺少最後一片時維持 legacy，不得組出部分資料',()=>{
 const source=db();source.lessons=Array.from({length:120},(_,index)=>lesson('bulk',index));const {snapshot}=verify(source),partial=snapshot.chunks.slice(0,-1);
 assert.throws(()=>assembleShardedSnapshot(snapshot.manifest,partial,{hash}),/分片遺失|總分片數/);
 assert.equal(chooseCloudReadSource({activation:null,legacyHash:hash(source),verifiedGenerationHash:''}),'legacy');
});

test('大量資料的啟用世代中斷時完整保留 legacy 300 堂',()=>{
 const legacy=db();legacy.teachers=[{id:'teacher-1'}];
 for(const owner of ['daniel','catherine','aa'])for(let index=0;index<100;index++)legacy.lessons.push(lesson(owner,index));
 const next=structuredClone(legacy);next.lessons.push(lesson('aa',100));
 const {snapshot}=verify(next),activation=createShardedActivation(snapshot.manifest,{expectedLegacyHash:snapshot.manifest.sourceHash});
 const resolved=resolveCloudReadSnapshot({legacyDb:legacy,activation,manifest:snapshot.manifest,chunks:snapshot.chunks.slice(0,-1),hash,legacyHash:snapshot.manifest.sourceHash});
 assert.equal(resolved.source,'legacy');assert.equal(resolved.db.lessons.length,300);assert.equal(new Set(resolved.db.lessons.map(row=>row.id)).size,300);
});

test('無 ID changes 大量重複仍逐筆保留',()=>{
 const source=db();source.changes=Array.from({length:250},(_,index)=>({at:'same-time',type:'修改',sequence:index%5,payload:{lesson:'shared'}}));
 const {rebuilt}=verify(source);assert.equal(rebuilt.changes.length,250);assert.deepEqual(rebuilt.changes,source.changes);
});
