import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb,createImmutableFullRecordShadowRebuilder} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
const {nativeCanonicalRecordDbSha256}=createRequire(import.meta.url)('../functions/native-canonical-sha256.cjs');
function fixture(){
 const db=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 db.lessons=[{id:'lesson-a',date:'2026-10-01',teacherIds:['teacher-a'],nested:{name:'保留'}}];
 db.changes=[{at:'2026-10-02',message:'第二筆'},{at:'2026-10-01',message:'第一筆'}];
 const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 for(const op of buildFullRecordShadowPlan(documents,db,{environment:'production',sourceHash:recordDataHash(db)}).operations)documents[op.payload.collection].push({id:op.payload.recordId,data:op.payload});
 return documents;
}
test('immutable rebuild is identical to legacy, preserves frozen rows and never mutates previous views',()=>{
 const documents=fixture(),reader=createImmutableFullRecordShadowRebuilder(),expected=rebuildFullRecordShadowDb(documents,{environment:'production'});
 const first=reader.rebuild(documents,{environment:'production'}),again=reader.rebuild(documents,{environment:'production'});
 assert.deepEqual(first,expected);assert.deepEqual(again,expected);
 assert.equal(first.db.lessons[0],again.db.lessons[0]);
 assert.ok(Object.isFrozen(documents.lessons[0].data));assert.ok(Object.isFrozen(first.db.lessons[0].nested));assert.ok(Object.isFrozen(first.db.lessons[0].teacherIds));
 assert.throws(()=>first.db.lessons[0].nested.name='改寫',TypeError);
 assert.throws(()=>documents.changes[0].data.recordIndex=9,TypeError);
 const updated={...documents,lessons:[{id:'lesson-a',data:{...documents.lessons[0].data,revision:2,record:{...first.db.lessons[0],date:'2026-10-03'}}}]};
 const next=reader.rebuild(updated,{environment:'production'});
 assert.deepEqual(next,rebuildFullRecordShadowDb(updated,{environment:'production'}));
 assert.equal(first.db.lessons[0].date,'2026-10-01');assert.equal(next.db.lessons[0].date,'2026-10-03');assert.equal(first.db.changes[0],next.db.changes[0]);
 const memo=new WeakMap();for(const result of [first,next])assert.equal('record-v1:'+nativeCanonicalRecordDbSha256(result.db,FULL_RECORD_COLLECTIONS,{memo}),recordDataHash(result.db));
 const deleted={...updated,lessons:[{id:'lesson-a',data:{...updated.lessons[0].data,revision:3,deleted:true}}]};
 assert.deepEqual(reader.rebuild(deleted,{environment:'production'}),rebuildFullRecordShadowDb(deleted,{environment:'production'}));
});
test('private remembered rows do not bypass changed payload, scope, duplicate or history validation',()=>{
 const documents=fixture(),reader=createImmutableFullRecordShadowRebuilder();reader.rebuild(documents,{environment:'production'});
 const tampered={...documents,changes:documents.changes.map((row,i)=>i?row:{...row,data:{...row.data,record:{...row.data.record,message:'篡改'}}})};
 assert.throws(()=>reader.rebuild(tampered,{environment:'production'}),/全資料影子格式無效/);
 assert.throws(()=>reader.rebuild(documents,{environment:'staging'}),/全資料影子格式無效/);
 assert.throws(()=>reader.rebuild({...documents,lessons:[...documents.lessons,...documents.lessons]},{environment:'production'}),/全資料影子格式無效/);
 assert.throws(()=>reader.rebuild({...documents,changes:documents.changes.slice(1)},{environment:'production'}),/序號不連續/);
 assert.throws(()=>reader.rebuild({...documents,lessons:[{...documents.lessons[0],id:'foreign-id'}]},{environment:'production'}),/全資料影子格式無效/);
 const retry=createImmutableFullRecordShadowRebuilder();assert.throws(()=>retry.rebuild(tampered,{environment:'production'}),/全資料影子格式無效/);
});
test('ordinary rebuild still returns mutable independent copies',()=>{
 const documents=fixture(),one=rebuildFullRecordShadowDb(documents,{environment:'production'}),two=rebuildFullRecordShadowDb(documents,{environment:'production'});
 one.db.lessons[0].teacherIds.push('other');assert.deepEqual(two.db.lessons[0].teacherIds,['teacher-a']);assert.ok(!Object.isFrozen(documents.lessons[0].data));
});
