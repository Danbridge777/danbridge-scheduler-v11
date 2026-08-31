import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V1_RAW_DOCUMENT_FIRESTORE_POLICY,
 RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_INTEGRITY_SCOPE,
 RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA,
 RECORD_SYNC_V1_RAW_DOCUMENT_VALUE_SCOPE,
 RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,
 assertRecordSyncV1RawDocumentLeaf,
 assertRecordSyncV1RawDocumentLeafIntegrity,
 buildRecordSyncV1RawDocumentLeaf,
 normalizeAndBuildRecordSyncV1RawDocumentLeaf,
 normalizeRecordSyncV1RawDocument
} from '../js/core/cloud-record-sync-v1-raw-document-leaf.js';
import {buildChangeRecordId} from '../js/core/cloud-change-record-identity.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const ZERO_HASH='0'.repeat(64);
const timestamp=(seconds='1786896000',nanoseconds=123456789)=>({schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds,nanoseconds});
const raw=(extra={},dataExtra={})=>({
 documentId:'student-12345678',
 data:{
  schema:'danbridge-full-record-shadow-v1',
  companyId:'danbridge',
  collection:'students',
  recordId:'student-12345678',
  record:{id:'student-12345678',name:'學生',nested:{z:1,a:null},items:[true,'x',3]},
  recordIndex:null,
  sourceHash:'record-v1:'+'a'.repeat(64),
  revision:3,
  deleted:false,
  environment:'staging',
  ...dataExtra
 },
 ...extra
});
const audited=(extra={},dataExtra={})=>raw(extra,{updatedAt:timestamp(),updatedBy:'owner-12345678',updatedByEmail:'owner@example.com',...dataExtra});
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const rehashLeaf=value=>{const body={...value};delete body.leafHash;return{...body,leafHash:sha256Canonical(body)}};

test('active raw document normalize/build deterministic、deepFreeze、no-mutate且policy明示timestamp audit only',()=>{
 const input=raw(),before=structuredClone(input),normalized=normalizeRecordSyncV1RawDocument(input),leaf=buildRecordSyncV1RawDocumentLeaf(input),snapshot=normalizeAndBuildRecordSyncV1RawDocumentLeaf(input);
 assert.deepEqual(input,before);
 assert.equal(normalized.schema,RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA);
 assert.equal(normalized.auditState,'absent');
 assert.equal(normalized.audit,null);
 assert.equal(leaf.schema,RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA);
 assert.equal(leaf.auditState,'absent');
 assert.equal(leaf.auditHash,ZERO_HASH);
 assert.match(leaf.recordValueHash,/^[a-f0-9]{64}$/);
 assert.match(leaf.documentCoreHash,/^[a-f0-9]{64}$/);
 assert.match(leaf.leafHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(snapshot,{normalizedDocument:normalized,leaf});
 assert.ok(Object.isFrozen(snapshot));
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_FIRESTORE_POLICY,'timestamp-audit-only-v1');
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_VALUE_SCOPE,'web-sdk-semantic-values-not-firestore-wire-type');
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_AUDIT_SCOPE,'audit-presence-observation-not-cutover-authorization');
 assert.equal(RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_INTEGRITY_SCOPE,'self-hash-only-not-document-authority');
 assert.ok(Object.isFrozen(normalized)&&Object.isFrozen(normalized.record)&&Object.isFrozen(leaf));
 assert.throws(()=>{normalized.record.name='changed'},TypeError);
});

test('tombstone保留完整record並改變document/leaf hash但不改record hash',()=>{
 const active=buildRecordSyncV1RawDocumentLeaf(raw()),tombstone=buildRecordSyncV1RawDocumentLeaf(raw({}, {deleted:true,revision:4}));
 assert.equal(active.recordValueHash,tombstone.recordValueHash);
 assert.notEqual(active.documentCoreHash,tombstone.documentCoreHash);
 assert.notEqual(active.leafHash,tombstone.leafHash);
 assert.equal(tombstone.deleted,true);
});

test('changes使用既有seq identity且允許recordIndex gap，不重新編號',()=>{
 const record={type:'legacy',value:'同一筆'},recordIndex=9,recordId=buildChangeRecordId(recordIndex,record),input=raw({documentId:recordId},{collection:'changes',recordId,record,recordIndex,revision:7});
 const normalized=normalizeRecordSyncV1RawDocument(input),leaf=buildRecordSyncV1RawDocumentLeaf(input);
 assert.equal(recordId,'seq_00000009_d9c06e76');
 assert.equal(normalized.recordIndex,9);
 assert.equal(leaf.recordIndex,9);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({documentId:buildChangeRecordId(8,record)},{collection:'changes',recordId:buildChangeRecordId(8,record),record,recordIndex:9})),/identity/);
});

test('audit present使用exact tagged Timestamp且audit不進document core hash',()=>{
 const absent=buildRecordSyncV1RawDocumentLeaf(raw()),present=buildRecordSyncV1RawDocumentLeaf(audited()),normalized=normalizeRecordSyncV1RawDocument(audited());
 assert.equal(normalized.auditState,'present');
 assert.deepEqual(normalized.audit.updatedAt,timestamp());
 assert.equal(present.auditState,'present');
 assert.match(present.auditHash,/^[a-f0-9]{64}$/);
 assert.notEqual(present.auditHash,ZERO_HASH);
 assert.equal(present.recordValueHash,absent.recordValueHash);
 assert.equal(present.documentCoreHash,absent.documentCoreHash);
 assert.notEqual(present.leafHash,absent.leafHash);
});

test('合法V1 operation audit三欄全有才接受、保留並納入audit hash',()=>{
 const operationAudit={activationEpoch:'active-epoch-12345',deviceId:'device-12345678',lastOperationId:'device-12345678:9'},input=audited({},operationAudit),normalized=normalizeRecordSyncV1RawDocument(input),leaf=buildRecordSyncV1RawDocumentLeaf(input),base=buildRecordSyncV1RawDocumentLeaf(audited());
 assert.deepEqual(normalized.audit,{updatedAt:timestamp(),updatedBy:'owner-12345678',updatedByEmail:'owner@example.com',...operationAudit});
 assert.notEqual(leaf.auditHash,base.auditHash);
 assert.equal(leaf.documentCoreHash,base.documentCoreHash);
 assert.deepEqual(assertRecordSyncV1RawDocumentLeaf(leaf,{normalizedDocument:normalized}),leaf);
 for(const dataExtra of [{activationEpoch:operationAudit.activationEpoch},{...operationAudit,lastOperationId:'other-device:9'},{...operationAudit,lastOperationId:'device-12345678:0'},{...operationAudit,lastOperationId:'device-12345678:not-a-sequence'}])assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({},dataExtra)),/all-or-none|operation audit/);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({},operationAudit)),/完整 server audit/);
});

test('Timestamp canonical decimal、nanosecond與Firestore UTC範圍邊界',()=>{
 for(const value of [timestamp('-62135596800',0),timestamp('253402300799',999999999),timestamp('0',0)])assert.doesNotThrow(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedAt:value})));
 for(const value of [timestamp('-62135596801',0),timestamp('253402300800',0),timestamp('9999999999999',0),timestamp('-0',0),timestamp('+1',0),timestamp('01',0),timestamp('1',-1),timestamp('1',1000000000),{...timestamp(),extra:true}])assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedAt:value})),/timestamp/);
});

test('audit只接受0或all3且actor/email必須normalized',()=>{
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {updatedAt:timestamp()})),/all-or-none/);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedByEmail:'Owner@Example.com'})),/actor|email/);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedBy:'bad/id'})),/actor|email/);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedAt:new Date()})),/timestamp/);
 class Timestamp{constructor(){this.seconds=1786896000;this.nanoseconds=123456789}}
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(audited({}, {updatedAt:new Timestamp()})),/plain object|timestamp/);
});

test('canonical AST以UTF-8 key排序，Firestore map reorder與Unicode composed/decomposed保持各自identity',()=>{
 const firstRecord={id:'student-12345678',map:{z:1,a:2,'é':3,'e\u0301':4},array:[{b:2,a:1},'尾']},secondRecord={array:[{a:1,b:2},'尾'],map:{'e\u0301':4,'é':3,a:2,z:1},id:'student-12345678'},first=buildRecordSyncV1RawDocumentLeaf(raw({}, {record:firstRecord})),second=buildRecordSyncV1RawDocumentLeaf(reorder(raw({}, {record:secondRecord})));
 assert.deepEqual(first,second);
 const changed=buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{...firstRecord,map:{...firstRecord.map,'é':4,'e\u0301':3}}}));
 assert.notEqual(first.recordValueHash,changed.recordValueHash);
});

test('record內長得像Timestamp tag仍是普通map，不會與audit semantic tag碰撞',()=>{
 const tagLike=timestamp('10',20),leaf=buildRecordSyncV1RawDocumentLeaf(audited({}, {record:{id:'student-12345678',tagLike}}));
 assert.notEqual(leaf.recordValueHash,leaf.auditHash);
 assert.deepEqual(normalizeRecordSyncV1RawDocument(audited({}, {record:{id:'student-12345678',tagLike}})).record.tagLike,tagLike);
});

test('Date/Map/Set/Bytes/GeoPoint/Reference/custom prototype與unknown special全部拒絕',()=>{
 class Bytes{constructor(){this.value='AA=='}}
 class GeoPoint{constructor(){this.latitude=1;this.longitude=2}}
 class Reference{constructor(){this.path='x/y'}}
 class Custom{constructor(){this.value=1}}
 for(const value of [new Date(),new Map(),new Set(),new Bytes(),new GeoPoint(),new Reference(),new Custom(),Object.create(null,{x:{value:1,enumerable:false}})])assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value}})),/plain JSON|non-enumerable/);
});

test('undefined/NaN/Infinity/-0/BigInt/function/symbol/cycle/sparse全部fail closed',()=>{
 const invalid=[undefined,NaN,Infinity,-Infinity,-0,1n,()=>{},Symbol('x')];
 for(const value of invalid)assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value}})),/lossless/);
 const cycle={id:'student-12345678'};cycle.self=cycle;assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:cycle})),/cycle/);
 const sparse=[];sparse.length=2;sparse[1]='x';assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',sparse}})),/sparse/);
 const withSymbol={id:'student-12345678'};withSymbol[Symbol('x')]=1;assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:withSymbol})),/symbol/);
});

test('Web SDK semantic number只接受finite safe integer；unsafe rounding collision fail closed',()=>{
 for(const value of [Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER])assert.doesNotThrow(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value}})));
 for(const value of [Number.MAX_SAFE_INTEGER+1,Number.MIN_SAFE_INTEGER-1])assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value}})),/lossless Web SDK semantic number/);
 const roundedA=Number.MAX_SAFE_INTEGER+1,roundedB=Number.MAX_SAFE_INTEGER+2;
 assert.equal(roundedA,roundedB);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value:roundedA}})),/lossless Web SDK semantic number/);
 assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(raw({}, {record:{id:'student-12345678',value:roundedB}})),/lossless Web SDK semantic number/);
});

test('input/data/record/timestamp accessor全部拒且getter0',()=>{
 let calls=0;
 const top=raw();Object.defineProperty(top,'data',{enumerable:true,get(){calls++;return raw().data}});assert.throws(()=>normalizeRecordSyncV1RawDocument(top),/data field/);
 const data=raw().data;Object.defineProperty(data,'record',{enumerable:true,get(){calls++;return{id:'student-12345678'}}});assert.throws(()=>normalizeRecordSyncV1RawDocument({documentId:'student-12345678',data}),/data field/);
 const record={id:'student-12345678'};Object.defineProperty(record,'secret',{enumerable:true,get(){calls++;return'x'}});assert.throws(()=>normalizeRecordSyncV1RawDocument(raw({}, {record})),/accessor/);
 const at=timestamp();Object.defineProperty(at,'seconds',{enumerable:true,get(){calls++;return'0'}});assert.throws(()=>normalizeRecordSyncV1RawDocument(audited({}, {updatedAt:at})),/data field/);
 assert.equal(calls,0);
});

test('documentId/path、record.id、recordIndex、revision、sourceHash與exact欄位全部fail closed',()=>{
 const cases=[
  raw({documentId:'bad/id'},{recordId:'bad/id',record:{id:'bad/id'}}),
  raw({}, {record:{id:'other-12345678'}}),
  raw({}, {record:{id:123}}),
  raw({}, {recordIndex:0}),
  raw({}, {revision:0}),
  raw({}, {revision:Number.MAX_SAFE_INTEGER+1}),
  raw({}, {sourceHash:' bad'}),
  raw({}, {sourceHash:'bad\nhash'}),
  raw({}, {environment:'production'}),
  {...raw(),extra:true},
  raw({}, {extra:true})
 ];
 for(const value of cases)assert.throws(()=>buildRecordSyncV1RawDocumentLeaf(value),/欄位|identity|revision|sourceHash|record/);
});

test('public leaf assert接受map reorder並可用normalized document精確rebuild',()=>{
 const normalized=normalizeRecordSyncV1RawDocument(audited()),leaf=buildRecordSyncV1RawDocumentLeaf(audited());
 assert.deepEqual(assertRecordSyncV1RawDocumentLeaf(reorder(leaf),{normalizedDocument:reorder(normalized)}),leaf);
 assert.deepEqual(assertRecordSyncV1RawDocumentLeafIntegrity(leaf),leaf);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(leaf),/expected/);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(leaf,{normalizedDocument:normalizeRecordSyncV1RawDocument(raw({}, {record:{id:'student-12345678',name:'changed'}}))}),/expected/);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(leaf,{typo:normalized}),/expected/);
 let calls=0;const hostile={};Object.defineProperty(hostile,'normalizedDocument',{enumerable:true,get(){calls++;return normalized}});assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(leaf,hostile),/data field/);assert.equal(calls,0);
});

test('leaf/core/hash tamper拒；即使重算leafHash，expected normalized仍抓到內容hash衝突',()=>{
 const input=audited(),normalized=normalizeRecordSyncV1RawDocument(input),leaf=buildRecordSyncV1RawDocumentLeaf(input);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeafIntegrity({...leaf,deleted:true}),/canonical/);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeafIntegrity({...leaf,auditState:'absent'}),/格式|canonical/);
 const forged=rehashLeaf({...leaf,recordValueHash:'f'.repeat(64)});
 assert.doesNotThrow(()=>assertRecordSyncV1RawDocumentLeafIntegrity(forged));
 assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(forged),/expected/);
 assert.throws(()=>assertRecordSyncV1RawDocumentLeaf(forged,{normalizedDocument:normalized}),/expected/);
});
