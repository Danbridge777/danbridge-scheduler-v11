import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const require=createRequire(import.meta.url);
const {createStagingDerivedDeliveryRuntime,restorePreviousLessons,lessonChanges,buildNotifications,applyPayloadToCachedDb,applyAuditPayloadToCachedDb,applyAuthorityPayloadToCachedDb,applyPayloadToCachedDocuments}=require('../functions/staging-derived-delivery-runtime.cjs');
const {buildChangeRecordId}=await import('../js/core/cloud-change-record-identity.js');

const before={id:'lesson-1',date:'2026-09-05',start:'17:20',end:'17:50',studentId:'student-1',teacherIds:['teacher-1'],title:'測試課程',branchId:'art_museum'};
const after={...before,start:'17:25',end:'17:55'};
const current={lessons:[after],students:[{id:'student-1',name:'測試學生'}]};
const payload={save:{saveId:'save-staging-derived-12345',actorUid:'owner-uid',actorEmail:'owner@example.com'},changedKeys:[{collection:'lessons',recordId:'lesson-1'}],baselineRecords:[{collection:'lessons',recordId:'lesson-1',exists:true,deleted:false,record:before}],localRecords:[{collection:'lessons',recordId:'lesson-1',exists:true,deleted:false,record:after}]};

test('衍生交付從同一個 authority request 的 baseline 精確重建課表異動',()=>{
 const previous=restorePreviousLessons(current,payload),changes=lessonChanges(previous,current);
 assert.deepEqual(previous.lessons,[before]);
 assert.equal(changes.length,1);
 assert.equal(changes[0].type,'modified');
 assert.equal(changes[0].before.start,'17:20');
 assert.equal(changes[0].after.start,'17:25');
});

test('常駐衍生快取只接受精確 baseline，更新、建立與刪除均保持逐筆資料順序',()=>{
 const start={...current,lessons:[before,{...before,id:'lesson-2',start:'19:00',end:'19:30'}]},updated=applyPayloadToCachedDb(start,payload);
 assert.deepEqual(updated.lessons,[after,start.lessons[1]]);
 const reorderedBaseline={teacherIds:['teacher-1'],branchId:'art_museum',title:'測試課程',teacherId:undefined,studentId:'student-1',end:'17:50',start:'17:20',date:'2026-09-05',id:'lesson-1'};
 const reordered=applyPayloadToCachedDb(start,{...payload,baselineRecords:[{...payload.baselineRecords[0],record:reorderedBaseline}]});
 assert.deepEqual(reordered.lessons,[after,start.lessons[1]]);
 const created={...payload,changedKeys:[{collection:'lessons',recordId:'lesson-3'}],baselineRecords:[{collection:'lessons',recordId:'lesson-3',exists:false,deleted:false,record:null}],localRecords:[{collection:'lessons',recordId:'lesson-3',exists:true,deleted:false,record:{...after,id:'lesson-3'}}]},withCreate=applyPayloadToCachedDb(updated,created);
 assert.equal(withCreate.lessons.at(-1).id,'lesson-3');
 const removed={...payload,changedKeys:[{collection:'lessons',recordId:'lesson-3'}],baselineRecords:[{collection:'lessons',recordId:'lesson-3',exists:true,deleted:false,record:withCreate.lessons.at(-1)}],localRecords:[{collection:'lessons',recordId:'lesson-3',exists:true,deleted:true,record:withCreate.lessons.at(-1)}]};
 assert.deepEqual(applyPayloadToCachedDb(withCreate,removed).lessons,updated.lessons);
 assert.throws(()=>applyPayloadToCachedDb(start,{...payload,baselineRecords:[{...payload.baselineRecords[0],record:{...before,start:'00:00'}}]}),/baseline mismatch/);
});

test('稽核 append 保持 changes 新到舊順序，同筆回條可重送但不同內容必須拒絕',()=>{
 const oldest={id:'audit-0',kind:'create'},newest={id:'audit-1',kind:'edit'},next={id:'audit-2',kind:'move'},recordId=buildChangeRecordId(2,next),auditPayload={save:{saveId:'save-audit-derived-12345'},changedKeys:[{collection:'changes',recordId}],baselineRecords:[{collection:'changes',recordId,exists:false,deleted:false,record:null}],localRecords:[{collection:'changes',recordId,exists:true,deleted:false,record:next}]};
 const appended=applyAuditPayloadToCachedDb({changes:[newest,oldest]},auditPayload,{buildRecordId:buildChangeRecordId});
 assert.deepEqual(appended.changes,[next,newest,oldest]);
 const replayed=applyAuditPayloadToCachedDb(appended,auditPayload,{buildRecordId:buildChangeRecordId});
 assert.deepEqual(replayed,appended);
 assert.throws(()=>applyAuditPayloadToCachedDb(appended,{...auditPayload,localRecords:[{...auditPayload.localRecords[0],record:{...next,kind:'tampered'}}]},{buildRecordId:buildChangeRecordId}),/replay mismatch|append sequence invalid/);
});

test('30 堂課與 30 筆稽核同一 authority payload 只前進一份快取，順序與資料均不分叉',()=>{
 const count=30,lessons=Array.from({length:count},(_,index)=>({...before,id:`lesson-${index}`,start:`${String(8+Math.floor(index/2)).padStart(2,'0')}:${index%2?'30':'00'}`})),start={lessons:[],changes:[]},audits=Array.from({length:count},(_,index)=>({id:`audit-${index}`,kind:'create',lessonId:lessons[index].id})),changedKeys=[],baselineRecords=[],localRecords=[];
 for(const lesson of lessons){changedKeys.push({collection:'lessons',recordId:lesson.id});baselineRecords.push({collection:'lessons',recordId:lesson.id,exists:false,deleted:false,record:null});localRecords.push({collection:'lessons',recordId:lesson.id,exists:true,deleted:false,record:lesson})}
 for(const audit of audits){const recordId=buildChangeRecordId(changedKeys.length-count,audit);changedKeys.push({collection:'changes',recordId});baselineRecords.push({collection:'changes',recordId,exists:false,deleted:false,record:null});localRecords.push({collection:'changes',recordId,exists:true,deleted:false,record:audit})}
 const result=applyAuthorityPayloadToCachedDb(start,{save:payload.save,changedKeys,baselineRecords,localRecords},{buildRecordId:buildChangeRecordId});
 assert.equal(result.lessons.length,30);
 assert.deepEqual(result.lessons.map(row=>row.id),lessons.map(row=>row.id));
 assert.equal(result.changes.length,30);
 assert.deepEqual(result.changes.map(row=>row.id),audits.toReversed().map(row=>row.id));
 assert.deepEqual(start,{lessons:[],changes:[]});
});

test('常駐文件快照只依同一筆已提交 payload 前進，並保留 revision、tombstone 與 sourceHash',()=>{
 const oldHash='record-v1:'+'1'.repeat(64),nextHash='record-v1:'+'2'.repeat(64),documents={lessons:[{id:'lesson-1',data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection:'lessons',recordId:'lesson-1',record:before,recordIndex:null,sourceHash:oldHash,revision:7,deleted:false,environment:'staging'}}]},versioned={...payload,baselineRecords:[{...payload.baselineRecords[0],revision:7}],localRecords:[{...payload.localRecords[0],revision:7}]},updated=applyPayloadToCachedDocuments(documents,versioned,nextHash);
 assert.equal(updated.lessons[0].data.revision,8);
 assert.equal(updated.lessons[0].data.sourceHash,nextHash);
 assert.deepEqual(updated.lessons[0].data.record,after);
 assert.deepEqual(documents.lessons[0].data.record,before);
 const deletedHash='record-v1:'+'3'.repeat(64),removed=applyPayloadToCachedDocuments(updated,{...versioned,baselineRecords:[{...versioned.baselineRecords[0],revision:8,record:after}],localRecords:[{...versioned.localRecords[0],revision:8,record:after,deleted:true}]},deletedHash);
 assert.equal(removed.lessons.length,1);
 assert.equal(removed.lessons[0].data.deleted,true);
 assert.equal(removed.lessons[0].data.revision,9);
 assert.equal(removed.lessons[0].data.sourceHash,deletedHash);
 assert.throws(()=>applyPayloadToCachedDocuments(documents,versioned,'record-v1:invalid'),/document cache payload invalid/);
 assert.throws(()=>applyPayloadToCachedDocuments(documents,{...versioned,localRecords:[{...versioned.localRecords[0],revision:6}]},nextHash),/document cache identity invalid/);
});

test('同一筆課表異動為 Daniel、AA 與指定老師建立穩定且可讀回核對的通知',()=>{
 const rows=buildNotifications({payload,currentDb:current,accessRows:[
  {id:'aa@example.com',email:'aa@example.com',active:true,companyId:'danbridge',role:'teacher',teacherId:'scheduler-1',canManageSchedule:true,displayName:'AA'},
  {id:'teacher@example.com',email:'teacher@example.com',active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-1',teacherName:'張毅'},
 ],sourceHash:'record-v1:'+'a'.repeat(64),hash:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')});
 assert.deepEqual(rows.map(row=>row.payload.recipientEmail).sort(),['a0965487920@gmail.com','aa@example.com','teacher@example.com']);
 assert.equal(new Set(rows.map(row=>row.id)).size,3);
 for(const row of rows){assert.equal(row.payload.changeCount,1);assert.equal(row.payload.details[0].beforeTime,'2026-09-05 17:20–17:50');assert.equal(row.payload.details[0].afterTime,'2026-09-05 17:25–17:55');assert.equal(row.payload.sourceSaveId,payload.save.saveId)}
 const teacher=rows.find(row=>row.payload.recipientEmail==='teacher@example.com');
 assert.equal(teacher.payload.details[0].after.address,'');
});

test('後端衍生交付只接受固定 staging Admin Firestore 邊界',async()=>{
 await assert.rejects(()=>createStagingDerivedDeliveryRuntime({firestore:{doc(){},collection(){},runTransaction(){}},serverTimestamp(){},expectedProjectId:'danbridge-d8877-staging'}),/boundary invalid/);
 await assert.rejects(()=>createStagingDerivedDeliveryRuntime({firestore:{doc(){},collection(){},batch(){},runTransaction(){}},serverTimestamp(){},expectedProjectId:'danbridge-d8877'}),/boundary invalid/);
});
