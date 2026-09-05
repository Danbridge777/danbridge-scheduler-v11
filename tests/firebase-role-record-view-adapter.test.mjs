import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {createFirebaseRoleRecordViewAdapter} from '../js/core/firebase-role-record-view-adapter.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const clone=value=>value===undefined?undefined:structuredClone(value);
const identity={email:'teacher@example.com',kind:'teacher',teacherId:'teacher-1',branchIds:[]};
function memory({failBatch=0}={}){const store=new Map();let batchNumber=0;const snapshot=path=>store.has(path)?{exists:true,data:clone(store.get(path))}:{exists:false,data:null},transaction=async(callback,{batch=false}={})=>{if(batch&&++batchNumber===failBatch)throw new Error('injected interruption');const writes=[];const result=await callback({get:async path=>snapshot(path),set:(path,data)=>writes.push([path,clone(data)])});for(const [path,data] of writes)store.set(path,data);return result};return{store,getDocument:async path=>snapshot(path),getCollectionDocuments:async path=>[...store].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(([key,data])=>({id:key.slice(path.length+1),data:clone(data)})),runBatchTransaction:callback=>transaction(callback,{batch:true}),runTransaction:callback=>transaction(callback),serverTimestamp:()=>({server:true})}}
function adapter(network){return createFirebaseRoleRecordViewAdapter({environment:'staging',role:'owner',actor:{uid:'owner-1',email:'owner@example.com'},...network})}
function options(db,extra={}){return{identity,activationEpoch:'epoch-role-12345',sourceRecordHash:recordDataHash(db),publishId:'publish-role-12345',publishedAt:'2026-08-15T02:00:00+08:00',batchSize:2,...extra}}

test('實際 adapter 先逐筆寫完、完整讀回，再發布小型控制；相同來源重跑零寫入',async()=>{
 const network=memory(),db=empty();db.students=[{id:'student-1'}];db.lessons=[{id:'lesson-1'},{id:'lesson-2'}];const first=await adapter(network).synchronize(db,options(db));assert.equal(first.verified,true);assert.equal(first.writes,3);assert.equal(first.controlWrite,'published');assert.equal(first.control.persistedByEmail,'owner@example.com');
 const records=[...network.store.keys()].filter(path=>path.includes('/records/'));assert.equal(records.length,3);assert.ok(records.every(path=>path.startsWith(`stagingRoleRecordViews/danbridge/views/${first.viewKey}/`)));const controls=[...network.store.keys()].filter(path=>path.startsWith('stagingRoleRecordViewControls/'));assert.deepEqual(controls,['stagingRoleRecordViewControls/danbridge/views/teacher@example.com']);
 const rerun=await adapter(network).synchronize(db,options(db,{publishId:'publish-role-99999',publishedAt:'2026-08-15T02:01:00+08:00'}));assert.equal(rerun.writes,0);assert.equal(rerun.controlWrite,'unchanged');assert.equal(rerun.control.revision,1);
});

test('第二批中斷時不發布控制；重新建立 adapter 後只續傳缺少的資料',async()=>{
 const network=memory({failBatch:2}),db=empty();db.lessons=Array.from({length:5},(_,index)=>({id:`lesson-${index}`}));let error;try{await adapter(network).synchronize(db,options(db))}catch(cause){error=cause}assert.match(error.message,/第 2 批失敗/);assert.equal(error.completedBatches,1);assert.equal([...network.store.keys()].filter(path=>path.includes('/records/')).length,2);assert.equal([...network.store.keys()].filter(path=>path.startsWith('stagingRoleRecordViewControls/')).length,0);
 network.runBatchTransaction=callback=>{const writes=[];return Promise.resolve(callback({get:async path=>network.store.has(path)?{exists:true,data:clone(network.store.get(path))}:{exists:false,data:null},set:(path,data)=>writes.push([path,clone(data)])})).then(result=>{for(const [path,data] of writes)network.store.set(path,data);return result})};const resumed=await adapter(network).synchronize(db,options(db,{publishId:'publish-role-12346',publishedAt:'2026-08-15T02:02:00+08:00'}));assert.equal(resumed.writes,3);assert.equal(resumed.verified,true);assert.equal(resumed.activeCount,5);assert.equal(resumed.controlWrite,'published');
});

test('墓碑與同 ID 重建由 adapter 保留單一文件並連續遞增 revision',async()=>{
 const network=memory();let db=empty();db.lessons=[{id:'lesson-1',room:'A'}];await adapter(network).synchronize(db,options(db));db=empty();const removed=await adapter(network).synchronize(db,options(db,{publishId:'publish-role-12346',publishedAt:'2026-08-15T02:03:00+08:00'}));assert.equal(removed.tombstoneCount,1);db.lessons=[{id:'lesson-1',room:'revived'}];const revived=await adapter(network).synchronize(db,options(db,{publishId:'publish-role-12347',publishedAt:'2026-08-15T02:04:00+08:00'}));const lesson=[...network.store.values()].find(value=>value?.collection==='lessons'&&value?.recordId==='lesson-1');assert.equal(lesson.revision,3);assert.equal(lesson.deleted,false);assert.equal(revived.activeCount,1);assert.equal(revived.tombstoneCount,0);
});

test('控制在資料讀回後發生競爭時 fail closed，不覆寫較新的控制',async()=>{
 const network=memory(),db=empty();db.lessons=[{id:'lesson-1'}];await adapter(network).synchronize(db,options(db));const originalRunTransaction=network.runTransaction;network.runTransaction=async callback=>originalRunTransaction(async transaction=>{const originalGet=transaction.get;return callback({...transaction,get:async path=>{const snapshot=await originalGet(path);if(snapshot.exists){const changed={...snapshot.data,revision:snapshot.data.revision+1,publishId:'other-owner-12345'};network.store.set(path,changed);return{exists:true,data:changed}}return snapshot}})});const next=structuredClone(db);next.lessons[0].room='B';await assert.rejects(()=>adapter(network).synchronize(next,options(next,{publishId:'publish-role-12348',publishedAt:'2026-08-15T02:05:00+08:00'})),/控制 revision 已改變/);
});

test('角色 scope 改變會寫入新 viewKey，舊資料不會被新角色查詢混用',async()=>{
 const network=memory(),db=empty();db.lessons=[{id:'lesson-1'}];const teacher=await adapter(network).synchronize(db,options(db)),manager={email:identity.email,kind:'branch_manager',teacherId:'teacher-1',branchIds:['branch-a']},changed=await adapter(network).synchronize(db,options(db,{identity:manager,publishId:'publish-scope-12345',publishedAt:'2026-08-15T02:06:00+08:00'}));assert.notEqual(changed.viewKey,teacher.viewKey);assert.equal(changed.control.revision,2);assert.equal(changed.control.kind,'branch_manager');assert.equal([...network.store.keys()].filter(path=>path.includes('/records/')).length,2);
});

test('每一輪完整角色讀回會並行取得 16 集合，避免逐集合網路往返累積延遲',async()=>{
 const network=memory(),originalRead=network.getCollectionDocuments;let active=0,maxActive=0,calls=0;
 network.getCollectionDocuments=async path=>{calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,5));try{return await originalRead(path)}finally{active--}};
 const db=empty();db.lessons=[{id:'lesson-1'}];await adapter(network).synchronize(db,options(db));
 assert.equal(calls,FULL_RECORD_COLLECTIONS.length*3);
 assert.equal(maxActive,FULL_RECORD_COLLECTIONS.length);
});

test('後端單次讀回模式仍先核對全部文件再發布控制，且不重複查詢16集合',async()=>{
 const network=memory(),originalRead=network.getCollectionDocuments;let calls=0;
 network.getCollectionDocuments=async path=>{calls++;return originalRead(path)};
 const db=empty();db.lessons=[{id:'lesson-1'}];const result=await createFirebaseRoleRecordViewAdapter({environment:'staging',role:'owner',actor:{uid:'owner-1',email:'owner@example.com'},...network,singleReadback:true}).synchronize(db,options(db));
 assert.equal(result.verified,true);
 assert.equal(result.controlWrite,'published');
 assert.equal(calls,FULL_RECORD_COLLECTIONS.length*2);
});

test('真實 Admin Firestore 交易快照的 exists 布林值與 data() 可正確讀取',async()=>{
 const network=memory(),originalBatch=network.runBatchTransaction,originalTransaction=network.runTransaction,wrap=callback=>transaction=>callback({...transaction,get:async path=>{const snapshot=await transaction.get(path);return{exists:snapshot.exists,data:()=>clone(snapshot.data)}}});network.runBatchTransaction=callback=>originalBatch(wrap(callback));network.runTransaction=callback=>originalTransaction(wrap(callback));
 const db=empty();db.lessons=[{id:'lesson-1',room:'A'}];const first=await adapter(network).synchronize(db,options(db));assert.equal(first.verified,true);
 const next=clone(db);next.lessons[0].room='B';const updated=await adapter(network).synchronize(next,options(next,{publishId:'publish-role-admin-snapshot',publishedAt:'2026-08-15T02:07:00+08:00'}));assert.equal(updated.writes,1);assert.equal(updated.verified,true);
});

test('已驗證基準可只用單筆交易完成新增、更新、刪除與復原，不重讀 16 集合',async()=>{
 const network=memory(),originalRead=network.getCollectionDocuments;let collectionReads=0;network.getCollectionDocuments=async path=>{collectionReads++;return originalRead(path)};let previous=empty();previous.lessons=[{id:'lesson-1',room:'A'}];await adapter(network).synchronize(previous,options(previous));collectionReads=0;
 const updated=clone(previous);updated.lessons[0].room='B';updated.lessons.push({id:'lesson-2',room:'C'});const first=await adapter(network).synchronizeIncremental(previous,updated,options(updated,{previousSourceRecordHash:recordDataHash(previous),publishId:'publish-incremental-12345',publishedAt:'2026-08-15T02:08:00+08:00'}));assert.equal(first.verified,true);assert.equal(first.incremental,true);assert.equal(first.writes,2);assert.equal(collectionReads,0);assert.equal(first.control.activeCount,2);
 const removed=clone(updated);removed.lessons=removed.lessons.filter(row=>row.id!=='lesson-1');const second=await adapter(network).synchronizeIncremental(updated,removed,options(removed,{previousSourceRecordHash:recordDataHash(updated),publishId:'publish-incremental-12346',publishedAt:'2026-08-15T02:09:00+08:00'}));assert.equal(second.writes,1);assert.equal(second.control.activeCount,1);assert.equal(second.control.tombstoneCount,1);
 const revived=clone(removed);revived.lessons.push({id:'lesson-1',room:'D'});const third=await adapter(network).synchronizeIncremental(removed,revived,options(revived,{previousSourceRecordHash:recordDataHash(removed),publishId:'publish-incremental-12347',publishedAt:'2026-08-15T02:10:00+08:00'}));assert.equal(third.writes,1);assert.equal(third.control.activeCount,2);assert.equal(third.control.tombstoneCount,0);const lesson=[...network.store.values()].find(value=>value?.collection==='lessons'&&value?.recordId==='lesson-1');assert.equal(lesson.revision,4);assert.equal(lesson.deleted,false);assert.equal(lesson.record.room,'D');
});

test('後端增量讀回可以單次批量取得文件與控制',async()=>{const network=memory(),previous=empty();previous.lessons=[{id:'lesson-1',room:'A'}];await adapter(network).synchronize(previous,options(previous));const next=clone(previous);next.lessons[0].room='B';let calls=0;const readDocuments=async paths=>{calls++;return Promise.all(paths.map(path=>network.getDocument(path)))};const result=await adapter(network).synchronizeIncremental(previous,next,options(next,{previousSourceRecordHash:recordDataHash(previous),publishId:'publish-incremental-batch-readback',publishedAt:'2026-08-15T02:10:30+08:00',readDocuments}));assert.equal(result.verified,true);assert.equal(result.writes,1);assert.equal(calls,1)});

test('增量角色檢視允許已驗證但未投影的 audit append 推進來源 hash，仍須精確銜接投影內容',async()=>{
 const network=memory(),previous=empty();previous.lessons=[{id:'lesson-1',room:'A'}];await adapter(network).synchronize(previous,options(previous));const next=clone(previous);next.lessons[0].room='B';const result=await adapter(network).synchronizeIncremental(previous,next,options(next,{previousSourceRecordHash:'record-v1:'+'f'.repeat(64),publishId:'publish-incremental-99999',publishedAt:'2026-08-15T02:11:00+08:00'}));assert.equal(result.incremental,true);assert.equal(result.control.viewHash,recordDataHash(next));
 const stale=clone(previous);stale.lessons[0].room='stale';const latest=clone(next);latest.lessons[0].room='C';await assert.rejects(()=>adapter(network).synchronizeIncremental(stale,latest,options(latest,{previousSourceRecordHash:recordDataHash(stale),publishId:'publish-incremental-stale',publishedAt:'2026-08-15T02:12:00+08:00'})),/投影基準已改變/);const control=[...network.store.values()].find(value=>value?.schema==='danbridge-role-record-view-control-v1');assert.equal(control.viewHash,recordDataHash(next));
});

test('production、非 Owner 與不完整注入一律拒絕',async()=>{const network=memory(),db=empty();await assert.rejects(()=>createFirebaseRoleRecordViewAdapter({environment:'production',role:'owner',actor:{uid:'x',email:'x@example.com'},...network}).synchronize(db,options(db)),/staging Owner/);await assert.rejects(()=>createFirebaseRoleRecordViewAdapter({environment:'staging',role:'teacher',actor:{uid:'x',email:'x@example.com'},...network}).synchronize(db,options(db)),/staging Owner/);assert.throws(()=>createFirebaseRoleRecordViewAdapter({}),/注入介面/)});
