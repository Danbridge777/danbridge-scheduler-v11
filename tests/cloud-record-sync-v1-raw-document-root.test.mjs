import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildChangeRecordId} from '../js/core/cloud-change-record-identity.js';
import {RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA} from '../js/core/cloud-record-sync-v1-raw-document-leaf.js';
import {
 RECORD_SYNC_V1_RAW_DOCUMENT_BATCH_RECEIPT_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_COLLECTION_SUMMARY_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_BATCH_SCHEMA,
 RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_INTEGRITY_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SNAPSHOT_SCHEMA,
 assertRecordSyncV1RawDocumentRoot,
 assertRecordSyncV1RawDocumentRootIntegrity,
 buildRecordSyncV1RawDocumentExecution,
 buildRecordSyncV1RawDocumentRoot,
 consumeRecordSyncV1RawDocumentExecution,
 verifyRecordSyncV1RawDocumentRootReadback
} from '../js/core/cloud-record-sync-v1-raw-document-root.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const CAPACITY_COUNT=Number(process.env.DANBRIDGE_V2_CAPACITY_COUNT??15_000);
if(![15_000,22_000,30_000].includes(CAPACITY_COUNT))throw new Error('DANBRIDGE_V2_CAPACITY_COUNT must be 15000, 22000, or 30000');

const SOURCE_A='record-v1:'+'a'.repeat(64),SOURCE_B='record-v1:'+'b'.repeat(64);
const timestamp={schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds:'1786896000',nanoseconds:123456789};
const emptyDocuments=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
const document=(collection,record,{recordId=record.id,recordIndex=null,revision=1,deleted=false,sourceHash=SOURCE_A,audit=false}={})=>({documentId:recordId,data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection,recordId,record,recordIndex,sourceHash,revision,deleted,environment:'staging',...(audit?{updatedAt:{...timestamp},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'}:{})}});
const changeDocument=(recordIndex,record,options={})=>{const recordId=buildChangeRecordId(recordIndex,record);return document('changes',record,{...options,recordId,recordIndex})};
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const readback=snapshot=>({manifest:reorder(snapshot.manifest),collectionSummaries:[...snapshot.collectionSummaries].reverse().map(reorder),batchReceipts:[...snapshot.batchReceipts].reverse().map(reorder)});
const rehash=(value,hashKey)=>{const core={...value};delete core[hashKey];return{...core,[hashKey]:sha256Canonical(core)}};
const serverAudit=value=>reorder({...value,persistedAt:reorder({seconds:1786896000,nanoseconds:123456789}),persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'});

test('空16集合產生固定durable root、execution snapshot與scope，沒有record payload batches',()=>{
 const documents=emptyDocuments(),before=structuredClone(documents),snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),expectedDb=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
 assert.deepEqual(documents,before);
 assert.equal(snapshot.schema,RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SNAPSHOT_SCHEMA);
 assert.equal(snapshot.artifactKind,'execution-plan-only');
 assert.equal(snapshot.manifest.schema,RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCHEMA);
 assert.equal(snapshot.manifest.artifactKind,'durable-proof-manifest-no-record-payload');
 assert.equal(snapshot.manifest.rootScope,RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE);
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_SCOPE,'web-sdk-semantic-full-document-root-not-cross-query-freeze-authority');
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_INTEGRITY_SCOPE,'self-hash-only-not-document-authority');
 assert.equal(snapshot.manifest.auditScope,RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE);
 assert.equal(snapshot.manifest.collectionCount,16);
 assert.equal(snapshot.collectionSummaries.length,16);
 assert.ok(snapshot.collectionSummaries.every((row,index)=>row.schema===RECORD_SYNC_V1_RAW_DOCUMENT_COLLECTION_SUMMARY_SCHEMA&&row.collection===FULL_RECORD_COLLECTIONS[index]&&row.documentCount===0));
 assert.deepEqual(snapshot.logicalDb,expectedDb);
 assert.equal(snapshot.manifest.activeLogicalHashSchema,RECORD_SYNC_V1_RAW_ACTIVE_LOGICAL_HASH_SCHEMA);
 assert.match(snapshot.manifest.activeLogicalDataHash,/^raw-active-v1:[a-f0-9]{64}$/);
 assert.equal('sourceRecordDataHash'in snapshot.manifest,false);
 assert.equal(snapshot.manifest.documentCount,0);
 assert.deepEqual(snapshot.batches,[]);
 assert.deepEqual(snapshot.batchReceipts,[]);
 assert.equal('logicalDb'in snapshot.manifest,false);
 assert.ok(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.logicalDb)&&Object.isFrozen(snapshot.manifest)&&Object.isFrozen(snapshot.collectionSummaries));
});

test('active/tombstone/audit/source history counts涵蓋所有raw documents，但logical DB只含active',()=>{
 const documents=emptyDocuments();
 documents.students=[document('students',{id:'student-active-a',name:'A'},{audit:true}),document('students',{id:'student-deleted-b',name:'B'},{deleted:true,revision:2,sourceHash:SOURCE_B})];
 documents.teachers=[document('teachers',{id:'teacher-active-a',name:'T'})];
 const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),students=snapshot.collectionSummaries[FULL_RECORD_COLLECTIONS.indexOf('students')];
 assert.deepEqual(snapshot.logicalDb.students,[{id:'student-active-a',name:'A'}]);
 assert.equal(snapshot.logicalDb.students.some(row=>row.id==='student-deleted-b'),false);
 assert.deepEqual({documents:snapshot.manifest.documentCount,active:snapshot.manifest.activeCount,tombstones:snapshot.manifest.tombstoneCount,audited:snapshot.manifest.auditedCount,unaudited:snapshot.manifest.unauditedCount,sources:snapshot.manifest.distinctSourceHashCount},{documents:3,active:2,tombstones:1,audited:1,unaudited:2,sources:2});
 assert.deepEqual({documents:students.documentCount,active:students.activeCount,tombstones:students.tombstoneCount,audited:students.auditedCount,unaudited:students.unauditedCount,sources:students.distinctSourceHashCount},{documents:2,active:1,tombstones:1,audited:1,unaudited:1,sources:2});
 assert.match(snapshot.manifest.activeLogicalDataHash,/^raw-active-v1:[a-f0-9]{64}$/);
 assert.notEqual(snapshot.manifest.sourceHistoryHash,'0'.repeat(64));
 assert.equal(snapshot.manifest.auditScope,'audit-presence-observation-not-cutover-authorization');
});

test('changes允許tombstone gap與同index歷史，raw identity不重編；active oldest轉UI newest-first',()=>{
 const documents=emptyDocuments(),oldest={type:'oldest'},deleted={type:'deleted'},deletedHistory={type:'deleted-history'},newest={type:'newest'};
 documents.changes=[changeDocument(3,newest),changeDocument(1,deleted,{deleted:true,revision:2}),changeDocument(0,deletedHistory,{deleted:true,revision:3,sourceHash:SOURCE_B}),changeDocument(0,oldest)];
 const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),summary=snapshot.collectionSummaries[FULL_RECORD_COLLECTIONS.indexOf('changes')];
 assert.deepEqual(snapshot.logicalDb.changes,[newest,oldest]);
 assert.equal(summary.documentCount,4);
 assert.equal(summary.activeCount,2);
 assert.equal(summary.tombstoneCount,2);
 assert.match(snapshot.manifest.activeLogicalDataHash,/^raw-active-v1:[a-f0-9]{64}$/);
 const indexes=snapshot.batches.flatMap(batch=>batch.leaves).filter(leaf=>leaf.collection==='changes').map(leaf=>leaf.recordIndex);
 assert.deepEqual(indexes,[0,0,1,3]);
 const duplicateIndex=emptyDocuments();duplicateIndex.changes=[changeDocument(2,{type:'a'}),changeDocument(2,{type:'b'})];assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:duplicateIndex}),/recordIndex 重複/);
 const duplicateId=emptyDocuments(),same=changeDocument(2,{type:'same'});duplicateId.changes=[same,structuredClone(same)];assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:duplicateId}),/recordId 重複/);
});

test('normalize-once execution handoff保留active/tombstone/changes gap與tagged audit，且不clone第二份record',()=>{
 const documents=emptyDocuments(),active=document('students',{id:'student-execution-active',nested:{value:1}},{revision:3,audit:true}),tombstone=document('students',{id:'student-execution-deleted',nested:{value:2}},{revision:4,deleted:true,sourceHash:SOURCE_B,audit:true});
 documents.students=[tombstone,active];documents.changes=[changeDocument(7,{type:'newest'},{revision:5,audit:true}),changeDocument(2,{type:'deleted'},{revision:6,deleted:true,sourceHash:SOURCE_B,audit:true})];
 const legacy=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),execution=buildRecordSyncV1RawDocumentExecution({documentsByCollection:documents}),payload=consumeRecordSyncV1RawDocumentExecution(execution,{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),normalized=payload.normalizedDocumentsByCollection;
 assert.equal(execution.schema,RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCHEMA);assert.equal(execution.scope,RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE);assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_EXECUTION_SCOPE,'ephemeral-in-memory-normalized-documents-not-document-or-persistence-authority');assert.equal(execution.artifactKind,'ephemeral-capability');
 assert.deepEqual(payload.rootSnapshot,legacy);assert.deepEqual(Object.keys(normalized),FULL_RECORD_COLLECTIONS);assert.deepEqual(normalized.changes.map(row=>row.recordIndex),[2,7]);assert.deepEqual(normalized.students.map(row=>[row.recordId,row.revision,row.deleted,row.sourceHash]),[['student-execution-active',3,false,SOURCE_A],['student-execution-deleted',4,true,SOURCE_B]]);
 assert.equal(normalized.students[0].auditState,'present');assert.deepEqual(normalized.students[0].audit.updatedAt,timestamp);assert.equal(normalized.students[1].deleted,true);
 assert.strictEqual(normalized.students[0].record,payload.rootSnapshot.logicalDb.students[0]);assert.ok(Object.isFrozen(execution)&&Object.isFrozen(payload)&&Object.isFrozen(normalized)&&Object.isFrozen(normalized.students)&&Object.isFrozen(normalized.students[0]));assert.throws(()=>{normalized.students[0].revision=99},TypeError);
 for(const forbidden of ['normalizedDocumentsByCollection','rootSnapshot','logicalDb','batches','batchReceipts'])assert.equal(forbidden in execution,false);assert.ok(JSON.stringify(execution).length<2048);
});

test('execution API只接受raw documents且每筆來源只normalize一次，caller leaf/accessor fail closed getter0',()=>{
 const documents=emptyDocuments(),raw=document('students',{id:'student-normalize-once',name:'A',nested:{value:1}},{audit:true}),record=raw.data.record;let idDescriptorReads=0,nestedOwnKeys=0,timestampOwnKeys=0,calls=0;
 record.nested=new Proxy(record.nested,{ownKeys(target){nestedOwnKeys++;return Reflect.ownKeys(target)}});raw.data.updatedAt=new Proxy(raw.data.updatedAt,{ownKeys(target){timestampOwnKeys++;return Reflect.ownKeys(target)}});raw.data.record=new Proxy(record,{getOwnPropertyDescriptor(target,key){if(key==='id')idDescriptorReads++;return Reflect.getOwnPropertyDescriptor(target,key)}});documents.students=[raw];
 const execution=buildRecordSyncV1RawDocumentExecution({documentsByCollection:documents}),payload=consumeRecordSyncV1RawDocumentExecution(execution,{expectedRawDocumentRootHash:execution.rawDocumentRootHash});assert.equal(idDescriptorReads,1);assert.equal(nestedOwnKeys,1);assert.equal(timestampOwnKeys,1);assert.equal(payload.rootSnapshot.manifest.documentCount,1);assert.equal(payload.normalizedDocumentsByCollection.students.length,1);
 assert.throws(()=>buildRecordSyncV1RawDocumentExecution({documentsByCollection:documents,leaves:[]}),/欄位/);const hostile=emptyDocuments();Object.defineProperty(hostile,'students',{enumerable:true,get(){calls++;return[]}});assert.throws(()=>buildRecordSyncV1RawDocumentExecution({documentsByCollection:hostile}),/data field/);assert.equal(calls,0);
 assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(structuredClone(execution),{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(JSON.parse(JSON.stringify(execution)),{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(new Proxy(execution,{}),{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1RawDocumentExecution({...execution},{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(execution,{expectedRawDocumentRootHash:'f'.repeat(64)}),/expected root/);
 let expectedCalls=0;const hostileExpected={};Object.defineProperty(hostileExpected,'expectedRawDocumentRootHash',{enumerable:true,get(){expectedCalls++;return execution.rawDocumentRootHash}});assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(execution,hostileExpected),/data field/);assert.equal(expectedCalls,0);
});

test('nonchanges UTF-8排序、nested map reorder與caller array反序完全deterministic',()=>{
 const first=emptyDocuments(),second=emptyDocuments(),composed={id:'student-é',nested:{z:1,a:[null,'甲']}},decomposed={id:'student-e\u0301',nested:{a:[null,'甲'],z:1}};
 first.students=[document('students',composed),document('students',decomposed)];
 second.students=[document('students',reorder(decomposed)),document('students',reorder(composed))];
 const a=buildRecordSyncV1RawDocumentRoot({documentsByCollection:first}),b=buildRecordSyncV1RawDocumentRoot({documentsByCollection:reorder(second)});
 assert.deepEqual(a.manifest,b.manifest);
 assert.deepEqual(a.collectionSummaries,b.collectionSummaries);
 assert.deepEqual(a.batchReceipts,b.batchReceipts);
 assert.deepEqual(a.logicalDb,b.logicalDb);
});

test('active logical hash不依localeCompare，en/sv相反排序仍得相同root',()=>{
 const ids=['student-z','student-ä'],en=new Intl.Collator('en').compare,sv=new Intl.Collator('sv').compare,enOrder=[...ids].sort(en),svOrder=[...ids].sort(sv);assert.notDeepEqual(enOrder,svOrder);
 const first=emptyDocuments(),second=emptyDocuments();first.students=enOrder.map(id=>document('students',{id}));second.students=svOrder.map(id=>document('students',{id}));const a=buildRecordSyncV1RawDocumentRoot({documentsByCollection:first}),b=buildRecordSyncV1RawDocumentRoot({documentsByCollection:second});
 assert.equal(a.manifest.activeLogicalDataHash,b.manifest.activeLogicalDataHash);
 assert.equal(a.manifest.rawDocumentRootHash,b.manifest.rawDocumentRootHash);
});

test('documentsByCollection exact/dense/duplicates與accessor全fail closed，getter0',()=>{
 const missing=emptyDocuments();delete missing.lessons;assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:missing}),/欄位/);
 assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:{...emptyDocuments(),unknown:[]}}),/欄位/);
 const duplicate=emptyDocuments(),row=document('students',{id:'student-duplicate'});duplicate.students=[row,structuredClone(row)];assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:duplicate}),/recordId 重複/);
 const sparse=emptyDocuments();sparse.students.length=1;assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:sparse}),/sparse/);
 let calls=0;const hostile=emptyDocuments();Object.defineProperty(hostile,'students',{enumerable:true,get(){calls++;return[]}});assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:hostile}),/data field/);assert.equal(calls,0);
});

test('root不接受caller leaf注入或錯collection raw document',()=>{
 const injected=emptyDocuments();injected.students=[{...document('students',{id:'student-injected'}),leaf:{leafHash:'forged'}}];assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:injected}),/input 欄位/);
 const wrong=emptyDocuments();wrong.students=[document('teachers',{id:'teacher-in-students'})];assert.throws(()=>buildRecordSyncV1RawDocumentRoot({documentsByCollection:wrong}),/collection/);
});

test('fixed 400/count與256KiB sealed byte雙限，large ID依bytes切batch且receipt不含leaves',()=>{
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_LEAF_COUNT,400);
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_ROOT_MAX_BATCH_CANONICAL_BYTES,256*1024);
 const small=emptyDocuments();small.students=Array.from({length:401},(_,index)=>document('students',{id:'student-'+String(index).padStart(6,'0')}));const countSplit=buildRecordSyncV1RawDocumentRoot({documentsByCollection:small});assert.deepEqual(countSplit.batches.map(batch=>batch.leafCount),[400,1]);
 const large=emptyDocuments();large.students=Array.from({length:220},(_,index)=>{const id='學'.repeat(480)+'-'+String(index).padStart(4,'0');return document('students',{id})});const byteSplit=buildRecordSyncV1RawDocumentRoot({documentsByCollection:large});
 assert.ok(byteSplit.batches.length>1);
 assert.ok(byteSplit.batches.every(batch=>batch.schema===RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_BATCH_SCHEMA&&batch.artifactKind==='execution-plan-only'&&batch.leafCount<=400&&batch.leaves.every(leaf=>!('record'in leaf))));
 assert.ok(byteSplit.batchReceipts.every(receipt=>receipt.schema===RECORD_SYNC_V1_RAW_DOCUMENT_BATCH_RECEIPT_SCHEMA&&receipt.canonicalBytes<256*1024&&!('leaves'in receipt)));
});

test('integrity-only可接受自洽偽造manifest，但strict documents必拒且expected不可省略',()=>{
 const documents=emptyDocuments();documents.students=[document('students',{id:'student-authority'})];const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),forged=rehash({...snapshot.manifest,activeLogicalDataHash:'raw-active-v1:'+'f'.repeat(64)},'rawDocumentRootHash');
 assert.deepEqual(assertRecordSyncV1RawDocumentRootIntegrity(reorder(forged)),forged);
 assert.throws(()=>assertRecordSyncV1RawDocumentRoot(forged),/expected/);
 assert.throws(()=>assertRecordSyncV1RawDocumentRoot(forged,{documentsByCollection:documents}),/expected documents/);
 assert.deepEqual(assertRecordSyncV1RawDocumentRoot(snapshot.manifest,{documentsByCollection:documents}),snapshot.manifest);
});

test('readback接受artifact array/map reorder；missing/duplicate/index/hash/count/limit tamper拒',()=>{
 const documents=emptyDocuments();documents.students=[document('students',{id:'student-readback'},{audit:true})];const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents});
 assert.equal(verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},readback(snapshot)).verified,true);
 const missing=readback(snapshot);missing.collectionSummaries.pop();assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},missing),/count/);
 const duplicate=readback(snapshot);duplicate.collectionSummaries[0]=duplicate.collectionSummaries[1];assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},duplicate),/重複|不符/);
 const badSummary=readback(snapshot);badSummary.collectionSummaries[0]=rehash({...badSummary.collectionSummaries[0],documentCount:99,activeCount:99},'collectionSummaryHash');assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},badSummary),/格式|內容不符|root/);
 const badReceipt=readback(snapshot);badReceipt.batchReceipts[0]=rehash({...badReceipt.batchReceipts[0],canonicalBytes:256*1024},'receiptHash');assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},badReceipt),/receipt 格式/);
 const badManifest=readback(snapshot);badManifest.manifest={...badManifest.manifest,documentCount:9};assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},badManifest),/canonical|格式/);
});

test('durable manifest/collection summary/batch receipt接受0或all3 server audit，audit不進hash',()=>{
 const documents=emptyDocuments();documents.students=[document('students',{id:'student-audited-artifacts'})];const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents}),audited={manifest:serverAudit(snapshot.manifest),collectionSummaries:[...snapshot.collectionSummaries].reverse().map(serverAudit),batchReceipts:[...snapshot.batchReceipts].reverse().map(serverAudit)};
 assert.deepEqual(assertRecordSyncV1RawDocumentRootIntegrity(audited.manifest),snapshot.manifest);
 assert.equal(verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},audited).verified,true);
 assert.equal(audited.manifest.rawDocumentRootHash,snapshot.manifest.rawDocumentRootHash);
 assert.equal(audited.collectionSummaries[0].collectionSummaryHash,snapshot.collectionSummaries.at(-1).collectionSummaryHash);
 assert.equal(audited.batchReceipts[0].receiptHash,snapshot.batchReceipts[0].receiptHash);
});

test('durable artifact server audit partial/extra/accessor/unnormalized email全部拒且getter0',()=>{
 const documents=emptyDocuments();documents.students=[document('students',{id:'student-audit-reject'})];const snapshot=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents});
 assert.throws(()=>assertRecordSyncV1RawDocumentRootIntegrity({...snapshot.manifest,persistedAt:{seconds:1}}),/all-or-none/);
 const extra=readback(snapshot);extra.collectionSummaries[0]={...extra.collectionSummaries[0],unexpected:true};assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},extra),/欄位/);
 const badEmail=readback(snapshot);badEmail.manifest={...badEmail.manifest,persistedAt:{seconds:1},persistedBy:'owner-12345678',persistedByEmail:'Owner@Example.com'};assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},badEmail),/audit/);
 let calls=0;const hostile=readback(snapshot),receipt={...hostile.batchReceipts[0],persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};Object.defineProperty(receipt,'persistedAt',{enumerable:true,get(){calls++;return{seconds:1}}});hostile.batchReceipts[0]=receipt;assert.throws(()=>verifyRecordSyncV1RawDocumentRootReadback({documentsByCollection:documents},hostile),/audit/);assert.equal(calls,0);
});

test(`${CAPACITY_COUNT} shuffled input deterministic，不同時保留兩份large snapshot並只記錄診斷時間`,t=>{
 const documents=emptyDocuments();documents.students=Array.from({length:CAPACITY_COUNT},(_,index)=>document('students',{id:'student-'+String(index).padStart(6,'0'),value:index,nested:{z:index%3,a:'資料'}}));
 const started=performance.now();let first=buildRecordSyncV1RawDocumentRoot({documentsByCollection:documents});const middle=performance.now(),proof={manifest:first.manifest,collectionSummaries:first.collectionSummaries,batchReceipts:first.batchReceipts};
 assert.equal(first.manifest.documentCount,CAPACITY_COUNT);assert.ok(first.batches.every(batch=>batch.leafCount<=400));assert.ok(first.batchReceipts.every(receipt=>receipt.canonicalBytes<256*1024));
 first=null;
 documents.students.reverse();for(const row of documents.students)row.data=reorder(row.data);
 const execution=buildRecordSyncV1RawDocumentExecution({documentsByCollection:documents}),payload=consumeRecordSyncV1RawDocumentExecution(execution,{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),second=payload.rootSnapshot,finished=performance.now();
 assert.equal(payload.normalizedDocumentsByCollection.students.length,CAPACITY_COUNT);assert.strictEqual(payload.normalizedDocumentsByCollection.students[0].record,second.logicalDb.students[0]);
 assert.deepEqual(proof.manifest,second.manifest);
 assert.deepEqual(proof.collectionSummaries,second.collectionSummaries);
 assert.deepEqual(proof.batchReceipts,second.batchReceipts);
 t.diagnostic(CAPACITY_COUNT+' root builds ms: first='+Math.round(middle-started)+', shuffled='+Math.round(finished-middle));
});
