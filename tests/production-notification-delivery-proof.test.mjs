import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildNotificationDeliveryProofs,coveredNotificationId,proofPath}=require('../functions/production-notification-delivery-proof.cjs');
const actor={uid:'owner-proof-278',email:'owner@example.test'};
const after={date:'2026-11-01',start:'10:00',end:'11:00',teacherIds:['t2','t1']};
const item={id:'atomic_notice_278',payload:{recipientEmail:'teacher@example.test',recipientRole:'teacher',teacherId:'t1',branchIds:[],createdBy:actor.uid,details:[{lessonId:'lesson-proof-1',before:null,after}]}};
const record={revision:3,sourceHash:'authority-proof-3',deleted:false,record:{id:'lesson-proof-1',...after}};
const [entry]=buildNotificationDeliveryProofs([item],new Map([['lesson-proof-1',record]]),actor,'record-v1:'+'a'.repeat(64));
test('atomic delivery proof binds current record, actor, scoped recipient and resulting state',()=>{
 assert.equal(entry.path,proofPath('lesson-proof-1'));
 assert.equal(coveredNotificationId(item,item.payload.details[0],entry.value,record,actor),item.id);
 const aggregate={...item.payload.details[0],before:{start:'08:00'},summary:'different renderer',after:{...after,teacherIds:['t1','t2']}};
 assert.equal(coveredNotificationId(item,aggregate,entry.value,record,actor),item.id,'coalesced before-state and teacher set ordering do not resend already committed resulting state');
});
test('a previous matching value cannot hide a subsequent unnotified operation',()=>{
 for(const different of [{...record,revision:4},{...record,sourceHash:'authority-proof-4'},{...record,deleted:true},{...record,record:{...record.record,end:'12:00'}},null])assert.equal(coveredNotificationId(item,item.payload.details[0],entry.value,different,actor),null);
});
test('proof never matches another account, role, teacher, scope, lesson or target',()=>{
 for(const payload of [{...item.payload,recipientEmail:'other@example.test'},{...item.payload,recipientRole:'owner'},{...item.payload,teacherId:'t2'},{...item.payload,branchIds:['other']}])assert.equal(coveredNotificationId({...item,payload},item.payload.details[0],entry.value,record,actor),null);
 for(const detail of [{lessonId:'other',after},{lessonId:'lesson-proof-1',after:null},{lessonId:'lesson-proof-1',after:{...after,end:'12:00'}}])assert.equal(coveredNotificationId(item,detail,entry.value,record,actor),null);
 for(const caller of [{...actor,uid:'other-uid'},{...actor,email:'other@example.test'}])assert.equal(coveredNotificationId(item,item.payload.details[0],entry.value,record,caller),null);
 for(const proof of [null,{...entry.value,schema:'old'},{...entry.value,recipients:{}}])assert.equal(coveredNotificationId(item,item.payload.details[0],proof,record,actor),null);
});
test('proof construction rejects missing record revisions and hashes hostile lesson IDs into safe paths',()=>{
 assert.throws(()=>buildNotificationDeliveryProofs([item],new Map(),actor,'hash'),/missing/);
 assert.throws(()=>buildNotificationDeliveryProofs([item],new Map([['lesson-proof-1',{revision:3}]]),actor,'hash'),/missing/);
 assert.match(proofPath('../../secret'),/^companies\/danbridge\/productionNotificationDeliveryProofs\/[a-f0-9]{64}$/);
});
