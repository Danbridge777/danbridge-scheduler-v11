import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('js/core/firebase-auth-and-cloud-sync.module.js','utf8');
const handler=source.slice(source.indexOf('async function acknowledgeCurrentScheduleNotification(){'),source.indexOf('\nfunction subscribeScheduleNotifications(){'));
for(const code of ['appCheck/throttled','functions/unavailable'])test('failed ack retains unread dialog and enables retry: '+code,async()=>{
 const modal={hidden:false,dataset:{notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={},statuses=[];
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus:m=>statuses.push(m),scheduleNotificationAcknowledgeCall:async()=>{throw Object.assign(Error('rejected'),{code})}};
 vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.equal(modal.hidden,false);assert.equal(button.disabled,false);assert.equal(button.textContent,'知道了');assert.ok(modal.error.textContent);assert.equal(modal.dataset.notificationIds,'["test_notice"]');
 if(code.startsWith('appCheck/'))assert.match(statuses[0],/仍保留未讀/);
 context.scheduleNotificationAcknowledgeCall=async()=>({data:{ok:true}});await context.acknowledgeCurrentScheduleNotification();assert.equal(modal.hidden,true);
});
test('late failure cannot reopen another account notification dialog',async()=>{
 const modal={hidden:false,dataset:{notificationIds:'["test_notice"]'}},button={};let context;
 context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{context.cloudUid='other';throw Error('late')}};
 vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();assert.equal(modal.hidden,true);
});
for(const [time,expected] of [['42m:54s','42 分 54 秒'],['01d:00m:00s','1 天'],['00m:00s','1 秒']])test('App Check retry guidance follows SDK cooldown without resetting or retrying: '+time,async()=>{
 const modal={hidden:false,dataset:{notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={};let calls=0;
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{calls++;throw Object.assign(Error('PRIVATE_DIAGNOSTIC'),{code:'appCheck/throttled',customData:{time,httpStatus:401}})}};
 vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.equal(calls,1);assert.equal(modal.hidden,false);assert.ok(modal.error.textContent.includes(expected));assert.doesNotMatch(modal.error.textContent,/PRIVATE|重新開啟此頁/);
});
for(const time of ['PRIVATE_TOKEN','<script>alert(1)</script>','99d:00m:00s','24h:00m:00s','00m:99s'])test('malformed retry diagnostics are not copied into the user message: '+time,async()=>{
 const modal={hidden:false,dataset:{notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={};
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{throw Object.assign(Error('PRIVATE_DIAGNOSTIC'),{code:'appCheck/throttled',customData:{time}})}};
 vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.match(modal.error.textContent,/通知仍保留未讀/);assert.ok(!modal.error.textContent.includes(time));assert.doesNotMatch(modal.error.textContent,/PRIVATE/);
});
