import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {assertRoleRecordViewControl,buildRoleRecordViewPlan,rebuildRoleRecordViewDb,roleRecordViewKey,verifyRoleRecordViewReadback} from '../js/core/cloud-role-record-view.js';
import {assertChangeRecordIdentity} from '../js/core/cloud-change-record-identity.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const documents=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const identity={email:'teacher@example.com',kind:'teacher',teacherId:'teacher-1',branchIds:[]};
const epoch='epoch-role-12345';
const sourceHash=value=>recordDataHash(value);
function apply(plan,current){for(const operation of plan.operations){const rows=current[operation.collection],index=rows.findIndex(row=>row.id===operation.recordId),row={id:operation.recordId,data:{...operation.payload,updatedAt:{seconds:1},updatedBy:'owner-1',updatedByEmail:'owner@example.com'}};if(index<0)rows.push(row);else rows[index]=row}return current}
function options(db,extra={}){return{environment:'staging',identity,activationEpoch:epoch,sourceRecordHash:sourceHash(db),publishId:'publish-role-12345',publishedAt:'2026-08-15T01:00:00+08:00',...extra}}

test('角色逐筆檢視建立後，16 集合完整讀回、hash 與逐集合筆數完全一致',()=>{
 const db=empty();db.students=[{id:'student-1',name:'S'}];db.lessons=[{id:'lesson-1',teacherId:'teacher-1'}];db.changes=[{type:'modify',lessonId:'lesson-1'}];const current=documents(),plan=buildRoleRecordViewPlan(current,db,options(db));
 assert.equal(plan.writes,3);assert.equal(plan.control.activeCount,3);assert.equal(plan.control.documentCount,3);assert.equal(plan.control.tombstoneCount,0);assert.equal(plan.control.collectionCount,16);assert.equal(plan.viewKey,roleRecordViewKey(identity,epoch));
 const changeOperation=plan.operations.find(operation=>operation.collection==='changes');assert.equal(assertChangeRecordIdentity({recordIndex:changeOperation.payload.recordIndex,recordId:changeOperation.payload.recordId,record:changeOperation.payload.record}),true);
 apply(plan,current);const verified=verifyRoleRecordViewReadback(current,db,{environment:'staging',identity,activationEpoch:epoch,control:plan.control});assert.equal(verified.verified,true);assert.equal(verified.viewHash,sourceHash(db));assert.deepEqual(verified.db,db);
});

test('只修改一堂課只產生一筆操作；未受影響文件不因整體 source hash 改變而重寫',()=>{
 const first=empty();first.students=[{id:'student-1',name:'S'}];first.lessons=[{id:'lesson-1',room:'A'},{id:'lesson-2',room:'B'}];const current=documents(),seed=buildRoleRecordViewPlan(current,first,options(first));apply(seed,current);
 const next=structuredClone(first);next.lessons[0].room='C';const plan=buildRoleRecordViewPlan(current,next,options(next,{publishId:'publish-role-12346',publishedAt:'2026-08-15T01:01:00+08:00',currentControl:seed.control}));assert.equal(plan.writes,1);assert.equal(plan.operations[0].recordId,'lesson-1');assert.equal(plan.operations[0].payload.revision,2);assert.equal(plan.control.revision,2);
 apply(plan,current);verifyRoleRecordViewReadback(current,next,{environment:'staging',identity,activationEpoch:epoch,control:plan.control});
});

test('刪除保留墓碑；同 ID 重建會 revive 並遞增 revision，不會新增第二筆',()=>{
 let db=empty();db.lessons=[{id:'lesson-1',room:'A'}];const current=documents(),first=buildRoleRecordViewPlan(current,db,options(db));apply(first,current);
 db=empty();const removed=buildRoleRecordViewPlan(current,db,options(db,{publishId:'publish-role-12346',publishedAt:'2026-08-15T01:01:00+08:00',currentControl:first.control}));assert.equal(removed.operations[0].type,'delete');assert.equal(removed.operations[0].payload.revision,2);apply(removed,current);let rebuilt=rebuildRoleRecordViewDb(current,{environment:'staging',identity,activationEpoch:epoch});assert.equal(rebuilt.activeCount,0);assert.equal(rebuilt.tombstoneCount,1);
 db.lessons=[{id:'lesson-1',room:'revived'}];const revived=buildRoleRecordViewPlan(current,db,options(db,{publishId:'publish-role-12347',publishedAt:'2026-08-15T01:02:00+08:00',currentControl:removed.control}));assert.equal(revived.operations[0].type,'revive');assert.equal(revived.operations[0].payload.revision,3);apply(revived,current);rebuilt=verifyRoleRecordViewReadback(current,db,{environment:'staging',identity,activationEpoch:epoch,control:revived.control});assert.equal(rebuilt.activeCount,1);assert.equal(rebuilt.tombstoneCount,0);assert.equal(current.lessons.length,1);
});

test('權限範圍或啟用世代改變時使用全新 viewKey；舊 scope 不會混入新查詢',()=>{
 const db=empty();db.lessons=[{id:'lesson-1',teacherId:'teacher-1'}];const first=buildRoleRecordViewPlan(documents(),db,options(db)),manager={email:identity.email,kind:'branch_manager',teacherId:'teacher-1',branchIds:['branch-b','branch-a']};
 const scopePlan=buildRoleRecordViewPlan(documents(),db,options(db,{identity:manager,publishId:'publish-scope-12345',publishedAt:'2026-08-15T01:03:00+08:00',currentControl:first.control}));assert.notEqual(scopePlan.viewKey,first.viewKey);assert.equal(scopePlan.control.revision,2);assert.deepEqual(scopePlan.identity.branchIds,['branch-a','branch-b']);
 const epochPlan=buildRoleRecordViewPlan(documents(),db,options(db,{activationEpoch:'epoch-role-67890',publishId:'publish-epoch-12345',publishedAt:'2026-08-15T01:04:00+08:00',currentControl:first.control}));assert.notEqual(epochPlan.viewKey,first.viewKey);assert.equal(epochPlan.control.revision,2);
});

test('缺筆、多筆、內容變造、changes ID 錯誤與控制筆數多餘欄位全部 fail closed',()=>{
 const db=empty();db.lessons=[{id:'lesson-1',room:'A'},{id:'lesson-2',room:'B'}];db.changes=[{type:'safe'}];const current=documents(),plan=buildRoleRecordViewPlan(current,db,options(db));apply(plan,current);
 const missing=structuredClone(current);missing.lessons.pop();assert.throws(()=>verifyRoleRecordViewReadback(missing,db,{environment:'staging',identity,activationEpoch:epoch,control:plan.control}),/hash|筆數/);
 const extra=structuredClone(current);extra.lessons.push({...extra.lessons[0]});assert.throws(()=>rebuildRoleRecordViewDb(extra,{environment:'staging',identity,activationEpoch:epoch}),/重複/);
 const changed=structuredClone(current);changed.lessons[0].data.record.room='forged';assert.throws(()=>verifyRoleRecordViewReadback(changed,db,{environment:'staging',identity,activationEpoch:epoch,control:plan.control}),/hash/);
 const badChange=structuredClone(current);badChange.changes[0].id='seq_00000000_deadbeef';badChange.changes[0].data.recordId=badChange.changes[0].id;assert.throws(()=>rebuildRoleRecordViewDb(badChange,{environment:'staging',identity,activationEpoch:epoch}),/identity/);
 const badControl={...plan.control,collectionActiveCounts:{...plan.control.collectionActiveCounts,unknown:0}};assert.throws(()=>assertRoleRecordViewControl(badControl,{environment:'staging',identity,activationEpoch:epoch}),/欄位不完整/);
});

test('同一來源與同一檢視重跑不新增操作或控制版本',()=>{
 const db=empty();db.lessons=[{id:'lesson-1'}];const current=documents(),first=buildRoleRecordViewPlan(current,db,options(db));apply(first,current);const rerun=buildRoleRecordViewPlan(current,db,options(db,{publishId:'publish-role-99999',publishedAt:'2026-08-15T02:00:00+08:00',currentControl:first.control}));assert.equal(rerun.writes,0);assert.equal(rerun.controlChanged,false);assert.deepEqual(rerun.control,first.control);
});

test('role plan 與 readback 對 malformed changes 全部 fail closed，payload roundtrip identity 不可漂移',()=>{
 const sparse=[];sparse[1]='x';let getterReads=0;const accessor={type:'unsafe'};Object.defineProperty(accessor,'danger',{enumerable:true,get(){getterReads++;return'x'}});
 for(const record of [{type:'unsafe',nested:undefined},{type:'unsafe',nested:new Map()},{type:'unsafe',nested:sparse},{type:'unsafe',nested:-0},accessor]){const db=empty();db.changes=[record];assert.throws(()=>buildRoleRecordViewPlan(documents(),db,{environment:'staging',identity,activationEpoch:epoch,sourceRecordHash:`record-v1:${'0'.repeat(64)}`,publishId:'publish-role-12345',publishedAt:'2026-08-15T01:00:00+08:00'}),/plain|lossless|sparse|accessor/)}
 assert.equal(getterReads,0);const db=empty();db.changes=[{type:'safe',nested:{z:2,a:[null,'中文',3.5]}}];const current=documents(),plan=buildRoleRecordViewPlan(current,db,options(db)),operation=plan.operations[0];assert.equal(assertChangeRecordIdentity({recordIndex:operation.payload.recordIndex,recordId:operation.recordId,record:operation.payload.record}),true);apply(plan,current);current.changes[0].data.record={type:'unsafe',nested:undefined};assert.throws(()=>rebuildRoleRecordViewDb(current,{environment:'staging',identity,activationEpoch:epoch}),/identity/);assert.throws(()=>verifyRoleRecordViewReadback(current,db,{environment:'staging',identity,activationEpoch:epoch,control:plan.control}),/identity/);
});
