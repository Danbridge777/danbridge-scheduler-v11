import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProductionNotificationAcknowledgeRequest,normalizeProductionNotificationActor,assertProductionNotificationRecipient,normalizeProductionScheduleNotificationPublishRequest,assertProductionScheduleNotificationAccess} from '../js/core/production-notification-policy.js';

test('通知確認只接受去重後 1 到 20 個安全識別碼',()=>{
 assert.deepEqual(normalizeProductionNotificationAcknowledgeRequest({notificationIds:['leave_operation_aa','leave_operation_aa']}).notificationIds,['leave_operation_aa']);
 for(const notificationIds of [[],new Array(21).fill('leave_operation_aa'),['../other'],['short']])assert.throws(()=>normalizeProductionNotificationAcknowledgeRequest({notificationIds}));
});

test('通知確認要求已驗證登入與 App Check',()=>{
 const actor=normalizeProductionNotificationActor({uid:'valid_uid_123',email:'AA0966626336@GMAIL.COM',emailVerified:true,appVerified:true});
 assert.equal(actor.email,'aa0966626336@gmail.com');
 assert.throws(()=>normalizeProductionNotificationActor({uid:'valid_uid_123',email:'aa@example.com',emailVerified:true,appVerified:false}));
});

test('任何角色都只能確認精確寄給自己的通知',()=>{
 const actor={uid:'valid_uid_123',email:'aa0966626336@gmail.com'};
 assert.equal(assertProductionNotificationRecipient({recipientEmail:'AA0966626336@GMAIL.COM'},actor),true);
 assert.throws(()=>assertProductionNotificationRecipient({recipientEmail:'a0965487920@gmail.com'},actor));
});

const publishRequest=()=>({schema:'danbridge-production-schedule-notification-publish-v1',requestId:'schedule_'+'a'.repeat(32)+'_'+'b'.repeat(32),sourceHash:'record-v1:'+'b'.repeat(64),release:'20.26.155',notifications:[{id:'batch_recipient_123',payload:{companyId:'danbridge',recipientEmail:'teacher@example.com',recipientRole:'teacher',teacherId:'teacher-1',branchIds:[],teacherName:'張毅',title:'課表更新通知',message:'您的課表有 1 個變更',changeCount:1,details:[{type:'added',lessonId:'lesson-1',summary:'新增課程',studentName:'學生',beforeTime:'',afterTime:'2026-09-03 10:00–11:00',before:null,after:{date:'2026-09-03',start:'10:00',end:'11:00',studentId:'student-1',title:'英文',location:'教室',branchId:'main',deliveryMode:'實體',room:'A',address:'',onlinePlatform:'',meetingUrl:'',status:'未上課',note:'',teacherIds:['teacher-1']}}],read:false,createdBy:'owner_uid_123',createdByName:'Daniel'}}]});

test('正式課表通知發布請求會嚴格正規化且拒絕重複收件者',()=>{
 const result=normalizeProductionScheduleNotificationPublishRequest(publishRequest());
 assert.match(result.sourceHash,/^record-v1:[a-f0-9]{64}$/);
 assert.equal(result.notifications[0].payload.recipientEmail,'teacher@example.com');
 assert.equal(result.notifications[0].payload.changeCount,1);
 const duplicate=publishRequest();duplicate.notifications.push(structuredClone(duplicate.notifications[0]));duplicate.notifications[1].id='batch_recipient_456';
 assert.throws(()=>normalizeProductionScheduleNotificationPublishRequest(duplicate),/重複/);
 const forged=publishRequest();forged.notifications[0].payload.changeCount=2;
 assert.throws(()=>normalizeProductionScheduleNotificationPublishRequest(forged),/變更數/);
 const legacyBareHash=publishRequest();legacyBareHash.sourceHash='b'.repeat(64);
 assert.throws(()=>normalizeProductionScheduleNotificationPublishRequest(legacyBareHash),/identity/);
});

test('正式課表通知收件者必須精確符合有效角色與老師識別碼',()=>{
 const notification=normalizeProductionScheduleNotificationPublishRequest(publishRequest()).notifications[0];
 assert.equal(assertProductionScheduleNotificationAccess(notification,{email:'teacher@example.com',active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-1'},'owner@example.com'),true);
 assert.throws(()=>assertProductionScheduleNotificationAccess(notification,{email:'teacher@example.com',active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-2'},'owner@example.com'),/識別碼/);
 const ownerRequest=publishRequest();ownerRequest.notifications[0].payload.recipientEmail='owner@example.com';ownerRequest.notifications[0].payload.recipientRole='owner';ownerRequest.notifications[0].payload.teacherId='';
 assert.equal(assertProductionScheduleNotificationAccess(normalizeProductionScheduleNotificationPublishRequest(ownerRequest).notifications[0],null,'owner@example.com'),true);
});
