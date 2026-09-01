import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProductionNotificationAcknowledgeRequest,normalizeProductionNotificationActor,assertProductionNotificationRecipient} from '../js/core/production-notification-policy.js';

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
