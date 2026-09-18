import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('js/core/firebase-auth-and-cloud-sync.module.js','utf8');
const handler=source.slice(source.indexOf('async function acknowledgeCurrentScheduleNotification(){'),source.indexOf('\nfunction subscribeScheduleNotifications(){'));
test('notification modal from a previous account cannot be acknowledged after switching accounts',async()=>{
 for(const mismatch of ['recipient','uid','auth']){
  const modal={hidden:false,dataset:{notificationIds:'["test_notice"]',notificationRecipientEmail:mismatch==='recipient'?'old':'e',notificationUid:mismatch==='uid'?'old':'uid'}};
  let sent=0,cleared=0;
  const context={cloudUid:'uid',cloudEmailKey:'e',auth:{currentUser:{uid:mismatch==='auth'?'old':'uid',email:'e'}},document:{getElementById:()=>modal},resetScheduleNotificationContext(){cleared++;modal.hidden=true},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{sent++;return{data:{ok:true}}}};
  vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
  assert.equal(sent,0);assert.equal(cleared,1);assert.equal(modal.hidden,true);
 }
});
test('auth change and notification resubscription synchronously discard old modal context',()=>{
 const code=source.slice(source.indexOf('function resetScheduleNotificationContext(){'),source.indexOf('function renderScheduleNotification('));
 const modal={hidden:false,dataset:{notificationId:'old',notificationIds:'["old"]',notificationRecipientEmail:'old',notificationUid:'old'},querySelector:()=>null},body={textContent:'private old content'},context={currentScheduleNotification:{id:'old'},document:{getElementById:id=>id==='scheduleNotificationModal'?modal:body}};
 vm.createContext(context);vm.runInContext(code+';resetScheduleNotificationContext();',context);
 assert.equal(context.currentScheduleNotification,null);assert.equal(modal.hidden,true);assert.deepEqual(modal.dataset,{});assert.equal(body.textContent,'');
 assert.match(source,/onAuthStateChanged\(auth,async user=>\{\s*resetScheduleNotificationContext\(\)/);
 assert.match(source,/function subscribeScheduleNotifications\(\)\{\s*resetScheduleNotificationContext\(\)/);
});
for(const code of ['appCheck/throttled','functions/unavailable'])test('failed ack retains unread dialog and enables retry: '+code,async()=>{
 const modal={hidden:false,dataset:{notificationRecipientEmail:'e',notificationUid:'uid',notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={},statuses=[];
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus:m=>statuses.push(m),scheduleNotificationAcknowledgeCall:async()=>{throw Object.assign(Error('rejected'),{code})}};
 context.auth={currentUser:{uid:'uid',email:'e'}};vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.equal(modal.hidden,false);assert.equal(button.disabled,false);assert.equal(button.textContent,'知道了');assert.ok(modal.error.textContent);assert.equal(modal.dataset.notificationIds,'["test_notice"]');
 if(code.startsWith('appCheck/'))assert.match(statuses[0],/仍保留未讀/);
 context.scheduleNotificationAcknowledgeCall=async()=>({data:{ok:true}});await context.acknowledgeCurrentScheduleNotification();assert.equal(modal.hidden,true);
});
test('late failure cannot reopen another account notification dialog',async()=>{
 const modal={hidden:false,dataset:{notificationRecipientEmail:'e',notificationUid:'uid',notificationIds:'["test_notice"]'}},button={};let context;
 context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{context.cloudUid='other';throw Error('late')}};
 context.auth={currentUser:{uid:'uid',email:'e'}};vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();assert.equal(modal.hidden,true);
});
for(const [time,expected] of [['42m:54s','42 分 54 秒'],['01d:00m:00s','1 天'],['00m:00s','1 秒']])test('App Check retry guidance follows SDK cooldown without resetting or retrying: '+time,async()=>{
 const modal={hidden:false,dataset:{notificationRecipientEmail:'e',notificationUid:'uid',notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={};let calls=0;
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{calls++;throw Object.assign(Error('PRIVATE_DIAGNOSTIC'),{code:'appCheck/throttled',customData:{time,httpStatus:401}})}};
 context.auth={currentUser:{uid:'uid',email:'e'}};vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.equal(calls,1);assert.equal(modal.hidden,false);assert.ok(modal.error.textContent.includes(expected));assert.doesNotMatch(modal.error.textContent,/PRIVATE|重新開啟此頁/);
});
for(const time of ['PRIVATE_TOKEN','<script>alert(1)</script>','99d:00m:00s','24h:00m:00s','00m:99s'])test('malformed retry diagnostics are not copied into the user message: '+time,async()=>{
 const modal={hidden:false,dataset:{notificationRecipientEmail:'e',notificationUid:'uid',notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={};
 const context={cloudUid:'uid',cloudEmailKey:'e',document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:()=>({dataset:{},setAttribute(){}})},console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{throw Object.assign(Error('PRIVATE_DIAGNOSTIC'),{code:'appCheck/throttled',customData:{time}})}};
 context.auth={currentUser:{uid:'uid',email:'e'}};vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 assert.match(modal.error.textContent,/通知仍保留未讀/);assert.ok(!modal.error.textContent.includes(time));assert.doesNotMatch(modal.error.textContent,/PRIVATE/);
});
test('App Check recovery link opens only the same-origin root and preserves the failed page without replay',async()=>{
 let calls=0;const created=[];
 const modal={hidden:false,dataset:{notificationRecipientEmail:'e',notificationUid:'uid',notificationIds:'["test_notice"]'},querySelector:s=>s==='[data-ack-error]'?null:{before:n=>modal.error=n}},button={};
 const context={cloudUid:'uid',cloudEmailKey:'e',location:{protocol:'https:',origin:'https://example.test',href:'https://example.test/?private=DO_NOT_COPY#SECRET'},
  document:{getElementById:id=>id==='scheduleNotificationModal'?modal:button,createElement:tag=>{const element={tag,dataset:{},setAttribute(){},append(...children){this.children=children}};created.push(element);return element}},
  console:{error(){}},cloudStatus(){},scheduleNotificationAcknowledgeCall:async()=>{calls++;throw Object.assign(Error('rejected'),{code:'appCheck/throttled'})}};
 context.auth={currentUser:{uid:'uid',email:'e'}};vm.createContext(context);vm.runInContext(handler,context);await context.acknowledgeCurrentScheduleNotification();
 const link=created.find(e=>e.tag==='a');
 assert.equal(link.href,'https://example.test/');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
 assert.equal(link.onclick,undefined);assert.equal(calls,1);assert.equal(modal.hidden,false);assert.equal(modal.dataset.notificationIds,'["test_notice"]');
 assert.doesNotMatch(JSON.stringify(created),/DO_NOT_COPY|SECRET/);
 context.scheduleNotificationAcknowledgeCall=async()=>({data:{ok:true}});await context.acknowledgeCurrentScheduleNotification();assert.equal(modal.hidden,true);
});
