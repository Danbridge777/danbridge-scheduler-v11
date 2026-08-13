import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SHARDED_DB_COLLECTION_KEYS,createShardedSnapshot,assembleShardedSnapshot,createShardedActivation,chooseCloudReadSource,canRunStagingShadow} from '../js/core/cloud-sharded-store.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const completeDb=()=>Object.fromEntries(SHARDED_DB_COLLECTION_KEYS.map(key=>[key,[]]));

test('所有 16 個集合經多分片後完整重組且雜湊一致',()=>{
 const db=completeDb();
 for(const key of SHARDED_DB_COLLECTION_KEYS)db[key]=Array.from({length:23},(_,index)=>({id:`${key}-${index}`,name:`${key}-${index}-${'資'.repeat(80)}`}));
 const snapshot=createShardedSnapshot(db,{hash,maxChunkBytes:4096,generationId:'test-generation'});
 assert.ok(snapshot.chunks.length>SHARDED_DB_COLLECTION_KEYS.length);
 assert.deepEqual(assembleShardedSnapshot(snapshot.manifest,snapshot.chunks,{hash}),db);
});

test('沒有 id 的 changes 保留順序、重複值與完整內容',()=>{
 const db=completeDb();db.changes=[{type:'修改',at:'1'},{type:'修改',at:'1'},{type:'刪除',before:{value:3}}];
 const snapshot=createShardedSnapshot(db,{hash,maxChunkBytes:4096});
 assert.deepEqual(assembleShardedSnapshot(snapshot.manifest,snapshot.chunks,{hash}).changes,db.changes);
});

test('未知集合、缺少分片、重複分片與雜湊不符都會阻止重組',()=>{
 const db=completeDb();db.lessons=[{id:'lesson-1',note:'safe'}];
 assert.throws(()=>createShardedSnapshot({...db,newCollection:[]},{hash}),/尚未納入/);
 const snapshot=createShardedSnapshot(db,{hash,maxChunkBytes:4096});
 assert.throws(()=>assembleShardedSnapshot(snapshot.manifest,[],{hash}),/分片遺失/);
 assert.throws(()=>assembleShardedSnapshot(snapshot.manifest,[...snapshot.chunks,snapshot.chunks[0]],{hash}),/重複分片/);
 const changed=structuredClone(snapshot);changed.chunks.find(chunk=>chunk.key==='lessons').items[0].note='tampered';
 assert.throws(()=>assembleShardedSnapshot(changed.manifest,changed.chunks,{hash}),/雜湊/);
});

test('只有與最新舊主資料雜湊相同的完整世代可以原子啟用',()=>{
 const db=completeDb();db.lessons=[{id:'lesson-1'}];const snapshot=createShardedSnapshot(db,{hash,generationId:'generation-1'});
 snapshot.manifest.status='verified';snapshot.manifest.verifiedHash=snapshot.manifest.sourceHash;
 assert.throws(()=>createShardedActivation(snapshot.manifest,{expectedLegacyHash:'stale'}),/版本已改變/);
 const activation=createShardedActivation(snapshot.manifest,{expectedLegacyHash:snapshot.manifest.sourceHash,activatedAt:'server-time',activatedBy:'owner'});
 assert.equal(chooseCloudReadSource({activation:null,legacyHash:snapshot.manifest.sourceHash,verifiedGenerationHash:''}),'legacy');
 assert.equal(chooseCloudReadSource({activation,legacyHash:snapshot.manifest.sourceHash,verifiedGenerationId:snapshot.manifest.generationId,verifiedGenerationHash:snapshot.manifest.sourceHash}),'sharded');
 assert.equal(chooseCloudReadSource({activation,legacyHash:snapshot.manifest.sourceHash,verifiedGenerationId:snapshot.manifest.generationId,verifiedGenerationHash:'corrupt'}),'blocked');
 assert.equal(chooseCloudReadSource({activation,legacyHash:'newer-legacy-write',verifiedGenerationId:snapshot.manifest.generationId,verifiedGenerationHash:snapshot.manifest.sourceHash}),'blocked');
});

test('未完成驗證或驗證雜湊不符的分片世代一律不得啟用',()=>{
 const db=completeDb();const snapshot=createShardedSnapshot(db,{hash,generationId:'generation-safe'}),manifest=snapshot.manifest;
 assert.throws(()=>createShardedActivation({...manifest,status:'uploading'},{expectedLegacyHash:manifest.sourceHash}),/尚未完整驗證/);
 assert.throws(()=>createShardedActivation({...manifest,status:'verified'},{expectedLegacyHash:manifest.sourceHash}),/驗證雜湊/);
 assert.throws(()=>createShardedActivation({...manifest,status:'verified',verifiedHash:'mismatch'},{expectedLegacyHash:manifest.sourceHash}),/驗證雜湊/);
});

test('啟用前拒絕無效的分片與資料筆數',()=>{
 const db=completeDb();const snapshot=createShardedSnapshot(db,{hash,generationId:'generation-counts'});
 const manifest={...snapshot.manifest,status:'verified',verifiedHash:snapshot.manifest.sourceHash};
 for(const totalChunks of [-1,1.5,NaN])assert.throws(()=>createShardedActivation({...manifest,totalChunks},{expectedLegacyHash:manifest.sourceHash}),/分片數量/);
 for(const totalRecords of [-1,1.5,NaN])assert.throws(()=>createShardedActivation({...manifest,totalRecords},{expectedLegacyHash:manifest.sourceHash}),/資料筆數/);
});

test('讀取來源必須同時符合已啟用的世代 ID 與雜湊',()=>{
 const activation={schema:'danbridge-sharded-activation-v1',activeGenerationId:'generation-a',sourceHash:'same-hash'};
 assert.equal(chooseCloudReadSource({activation,legacyHash:'same-hash',verifiedGenerationId:'generation-b',verifiedGenerationHash:'same-hash'}),'blocked');
 assert.equal(chooseCloudReadSource({activation,legacyHash:'same-hash',verifiedGenerationId:'generation-a',verifiedGenerationHash:'same-hash'}),'sharded');
});

test('影子分片硬鎖只允許 staging Owner',()=>{
 assert.equal(canRunStagingShadow({environment:'staging',role:'owner'}),true);
 for(const environment of ['production','local',''])for(const role of ['owner','teacher','branch_manager',''])assert.equal(canRunStagingShadow({environment,role}),false);
 for(const role of ['teacher','branch_manager',''])assert.equal(canRunStagingShadow({environment:'staging',role}),false);
});
