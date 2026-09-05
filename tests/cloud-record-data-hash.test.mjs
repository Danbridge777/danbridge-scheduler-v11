import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {normalizeRecordDb,recordDataDigest,recordDataHash} from '../js/core/cloud-record-data-hash.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));

test('16 集合完整納入逐筆 SHA-256 且不修改來源',()=>{const db=empty(),before=structuredClone(db),normalized=normalizeRecordDb(db),digest=recordDataDigest(db);assert.deepEqual(Object.keys(normalized),FULL_RECORD_COLLECTIONS);assert.deepEqual(db,before);assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(recordDataHash(db),`record-v1:${digest}`)});
test('受信後端可零複製正規化且內容與預設安全副本完全一致',()=>{const db=empty();db.lessons=[{id:'lesson-1',nested:{value:'A'}}];const safe=normalizeRecordDb(db),trusted=normalizeRecordDb(db,{cloneRecords:false});assert.deepEqual(trusted,safe);assert.notEqual(safe.lessons[0],db.lessons[0]);assert.equal(trusted.lessons[0],db.lessons[0])});
test('非 changes 集合排列不同仍得到相同雜湊',()=>{const first=empty(),second=empty();first.lessons=[{id:'b',name:'B'},{id:'a',name:'A'}];second.lessons=[...first.lessons].reverse();assert.equal(recordDataHash(first),recordDataHash(second))});
test('changes 的順序與重複內容都會影響雜湊',()=>{const first=empty(),second=empty();first.changes=[{type:'A'},{type:'B'},{type:'A'}];second.changes=[{type:'A'},{type:'A'},{type:'B'}];assert.notEqual(recordDataHash(first),recordDataHash(second))});
test('內容改變一定改變雜湊',()=>{const first=empty(),second=empty();first.students=[{id:'s1',name:'A'}];second.students=[{id:'s1',name:'B'}];assert.notEqual(recordDataHash(first),recordDataHash(second))});
test('缺集合、未知集合、重複或無效 ID 全部拒絕',()=>{const missing=empty();delete missing.lessons;assert.throws(()=>recordDataHash(missing),/必須是陣列/);assert.throws(()=>recordDataHash({...empty(),unknown:[]}),/未知集合/);assert.throws(()=>recordDataHash({...empty(),teachers:[{id:'t1'},{id:'t1'}]}),/重複 ID/);assert.throws(()=>recordDataHash({...empty(),students:[{id:'bad\/id'}]}),/無效或重複 ID/)});
