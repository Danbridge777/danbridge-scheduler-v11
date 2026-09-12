const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const source=fs.readFileSync('js/core/firebase-auth-and-cloud-sync.module.js','utf8');
const handler=source.slice(source.indexOf('async function acknowledgeCurrentScheduleNotification(){'),source.indexOf('\nfunction subscribeScheduleNotifications(){'));
test('App Check failure visibly preserves the notice; retry acknowledges without duplicate writes',async({page})=>{
 await page.setContent('<div id="scheduleNotificationModal" data-notification-ids=\'["test_notice"]\'><div class="schedule-notification-dialog"><p>隔離通知</p><div class="schedule-notification-actions"><button id="scheduleNotificationAcknowledge">知道了</button></div></div></div>');
 await page.addScriptTag({content:`let cloudUid='test_uid',cloudEmailKey='test@example.test',attempts=0,writes=0;function cloudStatus(){};async function scheduleNotificationAcknowledgeCall(){attempts++;if(attempts===1)throw Object.assign(new Error('403'),{code:'appCheck/throttled'});writes++;return{data:{ok:true}}};${handler};document.getElementById('scheduleNotificationAcknowledge').onclick=acknowledgeCurrentScheduleNotification;`});
 await page.getByRole('button',{name:'知道了'}).click();
 await expect(page.getByRole('alert')).toContainText('通知仍保留未讀');
 await expect(page.getByRole('button',{name:'知道了'})).toBeEnabled();
 expect(await page.evaluate(()=>writes)).toBe(0);
 await page.getByRole('button',{name:'知道了'}).click();
 await expect(page.locator('#scheduleNotificationModal')).toBeHidden();
 expect(await page.evaluate(()=>writes)).toBe(1);
});
