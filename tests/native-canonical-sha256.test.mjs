import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {canonicalJson,nativeCanonicalSha256,nativeCanonicalRecordDbSha256}=require('../functions/native-canonical-sha256.cjs');
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
const reference=value=>JSON.stringify(canonical(value));

test('native canonical stream is byte-identical to the established canonical JSON contract',()=>{
 const cases=[null,true,false,0,-0,1.25,Number.NaN,Number.POSITIVE_INFINITY,'中文\n"quoted"',[1,undefined,{z:2,a:1}],{z:undefined,b:[undefined,3],a:{y:'二',x:'一'}}];
 for(const value of cases){const expected=reference(value);assert.equal(canonicalJson(value),expected);assert.equal(nativeCanonicalSha256(value),createHash('sha256').update(expected,'utf8').digest('hex'))}
});

test('caller-owned memo reuses immutable rows without changing canonical identity',()=>{
 const shared={id:'lesson-shared',date:'2032-01-07',teacherIds:['teacher-1'],note:'保留'};
 const first={lessons:[shared],changes:[{id:'change-1',before:null,after:shared}]};
 const second={lessons:[shared,{id:'lesson-new',date:'2032-01-08'}],changes:[{id:'change-2'},...first.changes]};
 const memo=new WeakMap();
 assert.equal(nativeCanonicalSha256(first,{memo}),createHash('sha256').update(reference(first),'utf8').digest('hex'));
 assert.equal(nativeCanonicalSha256(second,{memo}),createHash('sha256').update(reference(second),'utf8').digest('hex'));
 assert.equal(nativeCanonicalSha256({b:2,a:1}),nativeCanonicalSha256({a:1,b:2}));
 assert.throws(()=>nativeCanonicalSha256({}, {memo:new Map()}),/WeakMap/);
});

test('numeric map keys, sparse arrays and prototype names preserve the established bytes',()=>{
 const sparse=[];sparse.length=4;sparse[2]={10:'ten',2:'two',a:undefined};
 const cases=[{10:'ten',2:'two',1:'one',a:1},sparse,JSON.parse('{"__proto__":{"10":10,"2":2},"4294967295":3,"4294967294":4,"01":5,"0":6}')];
 for(const value of cases){assert.equal(canonicalJson(value),reference(value));assert.equal(nativeCanonicalSha256(value),createHash('sha256').update(reference(value)).digest('hex'))}
});

test('canonical byte equivalence across deterministic nested JSON fixtures',()=>{
 let seed=912673;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const make=depth=>{if(!depth||rand()<.4)return [null,undefined,true,false,-0,Number.NaN,rand()*100,'中文\n\\"'][Math.floor(rand()*8)];if(rand()<.3){const a=[];for(let i=0;i<5;i++)if(rand()<.8)a[i]=make(depth-1);return a}const o={};for(const key of ['z','2','10','a','00','4294967294','4294967295'])if(rand()<.7)o[key]=make(depth-1);return o};
 for(let i=0;i<1000;i++){const value=make(4),expected=reference(value);assert.equal(canonicalJson(value),expected);if(expected!==undefined)assert.equal(nativeCanonicalSha256(value),createHash('sha256').update(expected).digest('hex'))}
});

test('streamed record DB digest is byte-identical to normalized canonical JSON',async()=>{
 const {SHARDED_DB_COLLECTION_KEYS}=await import('../js/core/cloud-sharded-store.js');
 const {normalizeRecordDb}=await import('../js/core/cloud-record-data-hash.js');
 const db=Object.fromEntries(SHARDED_DB_COLLECTION_KEYS.map(key=>[key,[]]));
 db.lessons=[
  {id:'z-lesson',date:'2032-01-09',nested:{b:2,a:'甲'}},
  {id:'a-lesson',date:'2032-01-07',teacherIds:['teacher-2','teacher-1']}
 ];
 db.changes=[
  {at:'2032-01-09T00:00:00.000Z',type:'newest',payload:{z:true,a:false}},
  {at:'2032-01-07T00:00:00.000Z',type:'oldest'}
 ];
 const expected=nativeCanonicalSha256(normalizeRecordDb(db,{cloneRecords:false}));
 assert.equal(nativeCanonicalRecordDbSha256(db,SHARDED_DB_COLLECTION_KEYS),expected);
 const memo=new WeakMap(),orderMemo=new WeakMap();
 assert.equal(nativeCanonicalRecordDbSha256(db,SHARDED_DB_COLLECTION_KEYS,{memo,orderMemo}),expected);
 const next={...db,lessons:[...db.lessons,{id:'m-lesson',date:'2032-01-08'}]};
 assert.equal(nativeCanonicalRecordDbSha256(next,SHARDED_DB_COLLECTION_KEYS,{memo,orderMemo}),nativeCanonicalSha256(normalizeRecordDb(next,{cloneRecords:false})));
 assert.throws(()=>nativeCanonicalRecordDbSha256({...db,unknown:[]},SHARDED_DB_COLLECTION_KEYS),/unknown collections/);
});

test('buffered SHA keeps exact bytes across block boundaries, Unicode, long rows and 30000 records',async()=>{
 const {SHARDED_DB_COLLECTION_KEYS:collections}=await import('../js/core/cloud-sharded-store.js');
 const {normalizeRecordDb}=await import('../js/core/cloud-record-data-hash.js');
 const db=Object.fromEntries(collections.map(key=>[key,[]]));
 db.lessons=Array.from({length:30000},(_,i)=>({id:'row-'+i,nested:{10:'十',2:'二'},text:i===0?'😀中\\\n'.repeat(20000):'𐀀中文'+i}));
 db.changes=[{at:'2026-09-09',text:'最新'},{at:'2026-09-08',text:'舊'}];
 const expected=createHash('sha256').update(reference(normalizeRecordDb(db,{cloneRecords:false})),'utf8').digest('hex');
 assert.equal(nativeCanonicalRecordDbSha256(db,collections),expected);
 const memo=new WeakMap(),orderMemo=new WeakMap();assert.equal(nativeCanonicalRecordDbSha256(db,collections,{memo,orderMemo}),expected);assert.equal(nativeCanonicalRecordDbSha256(db,collections,{memo,orderMemo}),expected);
});

test('key-layout reuse never reuses values and NULs, quotes, integer keys or eviction cannot alias',()=>{
 const fixtures=[{'a\u0000b':1,c:2},{a:3,'b\u0000c':4},{'"':5,'\\':6,'中':7},{10:8,2:9,'01':10,'4294967295':11},JSON.parse('{"__proto__":12,"constructor":13,"toJSON":14}')];
 for(let round=0;round<3;round++){
  for(const value of fixtures){const changed=Object.fromEntries(Object.entries(value).map(([key,n])=>[key,n+round]));assert.equal(canonicalJson(changed),reference(changed));assert.equal(nativeCanonicalSha256(changed),createHash('sha256').update(reference(changed)).digest('hex'))}
  for(let i=0;i<100;i++){const value={[`unique-layout-${i}`]:round,other:{value:i}};assert.equal(canonicalJson(value),reference(value))}
 }
 for(const count of [64,65,1000]){const value=Object.fromEntries(Array.from({length:count},(_,i)=>['field-'+i,i]));assert.equal(canonicalJson(value),reference(value))}
 const longKey='中文"\u0000'.repeat(2000);assert.equal(canonicalJson({[longKey]:1}),reference({[longKey]:1}));
 const value={z:1,a:2};const first=nativeCanonicalSha256(value);value.z=3;assert.notEqual(nativeCanonicalSha256(value),first);assert.equal(canonicalJson(value),reference(value));
});
