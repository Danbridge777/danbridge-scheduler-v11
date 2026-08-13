import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordCollectionDiff,buildCoreRecordDiffs} from '../js/core/cloud-record-diff.js';

const row=(id,value)=>({id,value,nested:{safe:true}});

test('逐筆差異精確區分新增、修改與刪除',()=>{
 const before=[row('same',1),row('update',1),row('delete',1)];
 const after=[row('same',1),row('update',2),row('create',1)];
 const diff=buildRecordCollectionDiff(before,after,{collection:'lessons'});
 assert.deepEqual(diff.creates,[row('create',1)]);
 assert.deepEqual(diff.updates,[row('update',2)]);
 assert.deepEqual(diff.deletes,[row('delete',1)]);
 assert.equal(diff.unchanged,1);
});

test('陣列順序改變不會產生任何逐筆寫入',()=>{
 const first=[row('a',1),row('b',2)],second=[row('b',2),row('a',1)];
 assert.deepEqual(buildRecordCollectionDiff(first,second,{collection:'students'}),{collection:'students',creates:[],updates:[],deletes:[],unchanged:2,totalBefore:2,totalAfter:2});
});

test('沒有 ID 或重複 ID 時拒絕建立差異，避免覆蓋錯誤文件',()=>{
 assert.throws(()=>buildRecordCollectionDiff([{name:'missing'}],[],{collection:'teachers'}),/缺少穩定 ID/);
 assert.throws(()=>buildRecordCollectionDiff([row('duplicate',1),row('duplicate',2)],[],{collection:'teachers'}),/重複 ID/);
 assert.throws(()=>buildRecordCollectionDiff([], [row('duplicate',1),row('duplicate',2)],{collection:'teachers'}),/重複 ID/);
});

test('空白、斜線、保留格式及過長 ID 一律拒絕，避免無效 Firestore 文件路徑',()=>{
 for(const id of ['', '   ', 'bad/id', '.', '..', '__reserved__', 'x'.repeat(1501)])assert.throws(()=>buildRecordCollectionDiff([], [{id}],{collection:'lessons'}),/無效 ID/);
});

test('回傳差異是獨立複本，不會被後續畫面修改污染',()=>{
 const before=[row('delete',1)],after=[row('create',2)];
 const diff=buildRecordCollectionDiff(before,after,{collection:'students'});
 before[0].nested.safe=false;after[0].nested.safe=false;
 assert.equal(diff.deletes[0].nested.safe,true);assert.equal(diff.creates[0].nested.safe,true);
});

test('課程、學生與老師三類差異分開計算且總數正確',()=>{
 const before={lessons:[row('lesson-update',1)],students:[row('student-delete',1)],teachers:[row('teacher-same',1)]};
 const after={lessons:[row('lesson-update',2)],students:[],teachers:[row('teacher-same',1),row('teacher-create',1)]};
 const result=buildCoreRecordDiffs(before,after);
 assert.deepEqual(result.counts,{creates:1,updates:1,deletes:1,unchanged:1,writes:3});
 assert.equal(result.collections.lessons.updates[0].id,'lesson-update');
 assert.equal(result.collections.students.deletes[0].id,'student-delete');
 assert.equal(result.collections.teachers.creates[0].id,'teacher-create');
});

test('三類資料完全相同時不產生任何寫入',()=>{
 const value={lessons:[row('lesson',1)],students:[row('student',1)],teachers:[row('teacher',1)]};
 const result=buildCoreRecordDiffs(value,structuredClone(value));
 assert.equal(result.counts.writes,0);assert.equal(result.counts.unchanged,3);
});

test('任一核心集合識別異常時整批差異建立失敗',()=>{
 const before={lessons:[],students:[],teachers:[]},after={lessons:[row('safe',1)],students:[{name:'missing-id'}],teachers:[]};
 assert.throws(()=>buildCoreRecordDiffs(before,after),/students.*缺少穩定 ID/);
});

test('一萬堂課只修改一堂時只產生一筆更新',()=>{
 const lessons=Array.from({length:10000},(_,index)=>({id:`lesson-${index}`,date:'2026-09-01',start:'10:00',end:'11:00',note:''}));
 const before={lessons,students:[],teachers:[]},after=structuredClone(before);
 after.lessons[6789].note='只修改這堂';
 const result=buildCoreRecordDiffs(before,after);
 assert.deepEqual(result.counts,{creates:0,updates:1,deletes:0,unchanged:9999,writes:1});
 assert.equal(result.collections.lessons.updates[0].id,'lesson-6789');
});
