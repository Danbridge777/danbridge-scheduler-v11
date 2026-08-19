import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANGE_RECORD_SHORT_HASH_PURPOSE,assertChangeRecordIdentity,buildChangeRecordId,changeRecordCanonicalFingerprint,changeRecordShortHash} from '../js/core/cloud-change-record-identity.js';
import {FULL_RECORD_COLLECTIONS,materializeFullRecordDb} from '../js/core/cloud-full-record-shadow.js';
import {buildRoleRecordViewPlan,rebuildRoleRecordViewDb} from '../js/core/cloud-role-record-view.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const documents=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const legacyStable=value=>Array.isArray(value)?value.map(legacyStable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,legacyStable(value[key])])):value);
function legacyShortHash(record){let hash=2166136261;for(const byte of new TextEncoder().encode(JSON.stringify(legacyStable(record)))){hash^=byte;hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16).padStart(8,'0')}

test('changes canonical fingerprint/FNV/seq identity 與現行演算法逐 byte 一致',()=>{
 const records=[
  {type:'legacy',n:0},
  {id:'evt-最新',type:'課程更新',nested:{z:2,a:[null,'中文',3.5]},flag:true},
  {z:{β:2,a:1},a:[0,-1,1.25,false,null]},
 ];
 for(const [index,record] of records.entries()){
  const before=structuredClone(record),expectedHash=legacyShortHash(record),expectedId=`seq_${String(index).padStart(8,'0')}_${expectedHash}`;
  assert.equal(changeRecordCanonicalFingerprint(record),JSON.stringify(legacyStable(record)));
  assert.equal(changeRecordShortHash(record),expectedHash);
  assert.equal(buildChangeRecordId(index,record),expectedId);
  assert.equal(assertChangeRecordIdentity({recordIndex:index,recordId:expectedId,record}),true);
  assert.deepEqual(record,before);
 }
});

test('Firestore map key順序不影響 fingerprint、shortHash 與 ID，array 順序仍會影響',()=>{
 const first={z:3,nested:{z:'後',a:'前'},array:[{z:2,a:1},null]},second={array:[{a:1,z:2},null],nested:{a:'前',z:'後'},z:3};
 assert.equal(changeRecordCanonicalFingerprint(first),changeRecordCanonicalFingerprint(second));
 assert.equal(changeRecordShortHash(first),changeRecordShortHash(second));
 assert.equal(buildChangeRecordId(7,first),buildChangeRecordId(7,second));
 assert.notEqual(buildChangeRecordId(7,{...first,array:[null,{z:2,a:1}]}),buildChangeRecordId(7,first));
});

test('recordIndex 保留 legacy 任意 nonnegative safe integer 與 padStart(8) 語意',()=>{
 const record={type:'safe'};
 assert.match(buildChangeRecordId(99_999_999,record),/^seq_99999999_[0-9a-f]{8}$/);
 const legacyLarge=buildChangeRecordId(100_000_000,record);assert.match(legacyLarge,/^seq_100000000_[0-9a-f]{8}$/);assert.equal(assertChangeRecordIdentity({recordIndex:100_000_000,recordId:legacyLarge,record}),true);
 const safeMax=buildChangeRecordId(Number.MAX_SAFE_INTEGER,record);assert.match(safeMax,/^seq_9007199254740991_[0-9a-f]{8}$/);
 for(const index of [-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>buildChangeRecordId(index,record),/recordIndex/);
 assert.throws(()=>assertChangeRecordIdentity({recordIndex:0,recordId:'seq_00000000_deadbeef',record}),/identity/);
 assert.throws(()=>assertChangeRecordIdentity({recordIndex:1,recordId:buildChangeRecordId(0,record),record}),/identity/);
 for(const control of ['\n','\r','\0','\u001f','\u007f'])assert.throws(()=>assertChangeRecordIdentity({recordIndex:0,recordId:`seq_00000000_${changeRecordShortHash(record)}${control}`,record}),/identity/);
});

test('changes record 只接受 strict lossless plain JSON，accessor 在拒絕前絕不執行',()=>{
 const cycle={type:'cycle'};cycle.self=cycle;const sparse=[];sparse[1]='value';const extra=['value'];extra.extra=true;const symbolKey={type:'symbol'};symbolKey[Symbol('hidden')]=true;const nonEnumerable={type:'hidden'};Object.defineProperty(nonEnumerable,'hidden',{value:true,enumerable:false});let getterReads=0;const accessor={type:'getter'};Object.defineProperty(accessor,'danger',{enumerable:true,get(){getterReads++;return'never'}});const custom=Object.assign(Object.create({inherited:true}),{type:'custom'});
 const invalid=[null,[],{value:undefined},{value:BigInt(1)},{value:()=>true},{value:Symbol('x')},{value:NaN},{value:Infinity},{value:-0},{value:new Date('2026-08-17T00:00:00Z')},{value:new Map([['a',1]])},{value:new Set([1])},custom,cycle,{value:sparse},{value:extra},symbolKey,nonEnumerable,accessor];
 for(const record of invalid){assert.throws(()=>changeRecordCanonicalFingerprint(record),/plain|lossless|cycle|sparse|array|symbol|accessor|non-enumerable/);assert.throws(()=>changeRecordShortHash(record),/plain|lossless|cycle|sparse|array|symbol|accessor|non-enumerable/);assert.throws(()=>buildChangeRecordId(0,record),/plain|lossless|cycle|sparse|array|symbol|accessor|non-enumerable/)}
 assert.equal(getterReads,0);
});

test('FNV 已知 collision 明示 short hash 只作 identity、不作 integrity',()=>{
 const left={id:'x1dxaqa8',n:66},right={id:'x1ocuaf',n:47};
 assert.equal(CHANGE_RECORD_SHORT_HASH_PURPOSE,'identity-only-not-integrity');
 assert.notEqual(changeRecordCanonicalFingerprint(left),changeRecordCanonicalFingerprint(right));
 assert.equal(changeRecordShortHash(left),'62cff08e');assert.equal(changeRecordShortHash(right),'62cff08e');
 assert.equal(buildChangeRecordId(7,left),buildChangeRecordId(7,right));
});

test('full shadow materialize golden ID 保持不變，legacy newest-first 仍反轉成 oldest-first',()=>{
 const db=empty();db.changes=[{id:'evt-最新',type:'課程更新',nested:{z:2,a:[null,'中文',3.5]},flag:true},{type:'legacy',n:0}];
 const before=structuredClone(db),rows=materializeFullRecordDb(db).changes;
 assert.deepEqual(rows.map(({recordId,recordIndex})=>({recordId,recordIndex})),[
  {recordId:'seq_00000000_fc08e53c',recordIndex:0},
  {recordId:'seq_00000001_ac8121f4',recordIndex:1},
 ]);
 assert.deepEqual(db,before);
});

test('role view 建立與讀回使用同一 golden changes identity，輸出不變',()=>{
 const db=empty();db.changes=[{id:'evt-最新',type:'課程更新',nested:{z:2,a:[null,'中文',3.5]},flag:true},{type:'legacy',n:0}];
 const identity={email:'teacher@example.com',kind:'teacher',teacherId:'teacher-1',branchIds:[]},activationEpoch='epoch-role-12345',current=documents(),plan=buildRoleRecordViewPlan(current,db,{environment:'staging',identity,activationEpoch,sourceRecordHash:recordDataHash(db),publishId:'publish-role-12345',publishedAt:'2026-08-15T01:00:00+08:00'});
 assert.deepEqual(plan.operations.map(operation=>operation.recordId),['seq_00000000_fc08e53c','seq_00000001_ac8121f4']);
 for(const operation of plan.operations)current.changes.push({id:operation.recordId,data:{...structuredClone(operation.payload),updatedAt:{seconds:1},updatedBy:'owner-1',updatedByEmail:'owner@example.com'}});
 assert.deepEqual(rebuildRoleRecordViewDb(current,{environment:'staging',identity,activationEpoch}).db.changes,db.changes);
});
