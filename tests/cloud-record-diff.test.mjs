import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordCollectionDiff,buildCoreRecordDiffs,buildRecordShadowWritePlan,rebuildRecordShadowState,buildRecordShadowWriteBatches} from '../js/core/cloud-record-diff.js';

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

test('影子寫入計畫產生固定路徑、建立版號與逐次更新版號',()=>{
 const diffs=buildCoreRecordDiffs(
  {lessons:[row('update',1)],students:[],teachers:[]},
  {lessons:[row('update',2),row('create',1)],students:[],teachers:[]}
 );
 const plan=buildRecordShadowWritePlan(diffs,{sourceHash:'hash-v2',revisions:{lessons:{update:4}}});
 assert.equal(plan.operations.length,2);
 assert.deepEqual(plan.operations.map(operation=>({type:operation.type,path:operation.path,revision:operation.payload.revision,deleted:operation.payload.deleted})),[
  {type:'create',path:'stagingRecordShadows/danbridge/collections/lessons/records/create',revision:1,deleted:false},
  {type:'update',path:'stagingRecordShadows/danbridge/collections/lessons/records/update',revision:5,deleted:false}
 ]);
 assert.deepEqual(plan.operations[1].payload.record,row('update',2));
 assert.equal(plan.operations[1].payload.sourceHash,'hash-v2');
 assert.equal(plan.operations[1].payload.environment,'staging');
});

test('刪除墓碑後重新建立沿用既有版號，不會重設為第一版',()=>{
 const diffs=buildCoreRecordDiffs({lessons:[],students:[],teachers:[]},{lessons:[row('revived',9)],students:[],teachers:[]});
 const plan=buildRecordShadowWritePlan(diffs,{sourceHash:'hash-revive',revisions:{lessons:{revived:6}}});
 assert.equal(plan.operations[0].type,'create');
 assert.equal(plan.operations[0].payload.revision,7);
 assert.equal(plan.operations[0].payload.deleted,false);
});

test('刪除只建立保留原始資料的墓碑，不產生實體刪除',()=>{
 const diffs=buildCoreRecordDiffs(
  {lessons:[],students:[row('student-delete',7)],teachers:[]},
  {lessons:[],students:[],teachers:[]}
 );
 const plan=buildRecordShadowWritePlan(diffs,{sourceHash:'hash-delete',revisions:{students:{'student-delete':2}}});
 assert.equal(plan.operations.length,1);
 assert.equal(plan.operations[0].type,'delete');
 assert.equal(plan.operations[0].payload.deleted,true);
 assert.equal(plan.operations[0].payload.revision,3);
 assert.deepEqual(plan.operations[0].payload.record,row('student-delete',7));
});

test('更新或刪除缺少目前版號時拒絕產生計畫',()=>{
 const updateDiff=buildCoreRecordDiffs({lessons:[row('x',1)],students:[],teachers:[]},{lessons:[row('x',2)],students:[],teachers:[]});
 assert.throws(()=>buildRecordShadowWritePlan(updateDiff,{sourceHash:'hash',revisions:{}}),/缺少目前 revision/);
 const deleteDiff=buildCoreRecordDiffs({lessons:[row('x',1)],students:[],teachers:[]},{lessons:[],students:[],teachers:[]});
 assert.throws(()=>buildRecordShadowWritePlan(deleteDiff,{sourceHash:'hash',revisions:{lessons:{x:0}}}),/無效 revision/);
});

test('沒有差異時影子寫入計畫為空且不需要版號',()=>{
 const value={lessons:[row('same',1)],students:[],teachers:[]};
 const plan=buildRecordShadowWritePlan(buildCoreRecordDiffs(value,structuredClone(value)),{sourceHash:'same-hash'});
 assert.deepEqual(plan,{companyId:'danbridge',sourceHash:'same-hash',operations:[],writes:0});
});

test('影子寫入計畫拒絕空白雜湊、非核心集合與超過單批安全上限',()=>{
 const one=buildCoreRecordDiffs({lessons:[],students:[],teachers:[]},{lessons:[row('one',1)],students:[],teachers:[]});
 assert.throws(()=>buildRecordShadowWritePlan(one,{sourceHash:'  '}),/sourceHash/);
 assert.throws(()=>buildRecordShadowWritePlan(one,{companyId:'other-company',sourceHash:'hash'}),/companyId/);
 const invalid={collections:{changes:{collection:'changes',creates:[row('one',1)],updates:[],deletes:[]}},counts:{writes:1}};
 assert.throws(()=>buildRecordShadowWritePlan(invalid,{sourceHash:'hash'}),/非核心集合/);
 const many=buildCoreRecordDiffs({lessons:[],students:[],teachers:[]},{lessons:Array.from({length:401},(_,index)=>row(`lesson-${index}`,index)),students:[],teachers:[]});
 assert.throws(()=>buildRecordShadowWritePlan(many,{sourceHash:'hash'}),/超過單批安全上限 400/);
});

test('影子文件可重建目前核心資料，墓碑不回到有效資料但保留 revision',()=>{
 const state=rebuildRecordShadowState({
  lessons:[
   {id:'active',data:{companyId:'danbridge',collection:'lessons',recordId:'active',record:row('active',2),revision:3,deleted:false,environment:'staging'}},
   {id:'deleted',data:{companyId:'danbridge',collection:'lessons',recordId:'deleted',record:row('deleted',1),revision:7,deleted:true,environment:'staging'}}
  ],students:[],teachers:[]
 });
 assert.deepEqual(state.db.lessons,[row('active',2)]);
 assert.deepEqual(state.revisions.lessons,{active:3,deleted:7});
 assert.equal(state.documentCount,2);
 assert.equal(state.activeCount,1);
 assert.equal(state.tombstoneCount,1);
});

test('影子文件 identity、環境、版號或重複 ID 異常時整批拒絕',()=>{
 const valid={id:'one',data:{companyId:'danbridge',collection:'students',recordId:'one',record:row('one',1),revision:1,deleted:false,environment:'staging'}};
 assert.throws(()=>rebuildRecordShadowState({lessons:[],students:[{...valid,data:{...valid.data,recordId:'other'}}],teachers:[]}),/identity/);
 assert.throws(()=>rebuildRecordShadowState({lessons:[],students:[{...valid,data:{...valid.data,environment:'production'}}],teachers:[]}),/environment/);
 assert.throws(()=>rebuildRecordShadowState({lessons:[],students:[{...valid,data:{...valid.data,revision:0}}],teachers:[]}),/revision/);
 assert.throws(()=>rebuildRecordShadowState({lessons:[],students:[valid,structuredClone(valid)],teachers:[]}),/重複/);
});

test('大量逐筆差異拆成每批最多 400 筆且總操作不遺失',()=>{
 const current={lessons:[],students:[],teachers:[]};
 const target={lessons:Array.from({length:801},(_,index)=>row(`lesson-${index}`,index)),students:[],teachers:[]};
 const result=buildRecordShadowWriteBatches(current,target,{sourceHash:'hash-801'});
 assert.deepEqual(result.batches.map(batch=>batch.writes),[400,400,1]);
 assert.equal(result.writes,801);
 assert.equal(result.diff.counts.creates,801);
 assert.equal(new Set(result.batches.flatMap(batch=>batch.operations.map(operation=>operation.path))).size,801);
});

test('分批規劃延續現有 revision、重建墓碑並對完全相同資料零寫入',()=>{
 const current=rebuildRecordShadowState({
  lessons:[{id:'revived',data:{companyId:'danbridge',collection:'lessons',recordId:'revived',record:row('revived',1),revision:9,deleted:true,environment:'staging'}}],students:[],teachers:[]
 });
 const target={lessons:[row('revived',2)],students:[],teachers:[]};
 const revived=buildRecordShadowWriteBatches(current,target,{sourceHash:'hash-revived'});
 assert.equal(revived.batches[0].operations[0].payload.revision,10);
 assert.equal(revived.batches[0].operations[0].payload.deleted,false);
 const identicalState=rebuildRecordShadowState({lessons:[{id:'same',data:{companyId:'danbridge',collection:'lessons',recordId:'same',record:row('same',1),revision:2,deleted:false,environment:'staging'}}],students:[],teachers:[]});
 const identical=buildRecordShadowWriteBatches(identicalState,identicalState.db,{sourceHash:'same'});
 assert.equal(identical.writes,0);
 assert.deepEqual(identical.batches,[]);
});
