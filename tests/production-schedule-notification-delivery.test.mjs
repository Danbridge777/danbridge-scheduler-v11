import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('production 課表通知只走 App Check 後端且驗證目前權威 head',async()=>{
 const [client,functions,rules]=await Promise.all([read('js/core/firebase-auth-and-cloud-sync.module.js'),read('functions/index.cjs'),read('firebase/firestore.rules')]);
 assert.match(client,/httpsCallable\(productionFunctions,'productionPublishScheduleNotifications',\{limitedUseAppCheckTokens:true\}\)/);
 assert.match(client,/DANBRIDGE_ENVIRONMENT==='production'\)notifications\.push/);
 assert.match(client,/productionScheduleNotificationPublishCall\(\{schema:'danbridge-production-schedule-notification-publish-v1'/);
 assert.match(client,/previousHash\.replace\(\/\^record-v1:\/,''\)/);
 assert.match(functions,/exports\.productionPublishScheduleNotifications=onCall/);
 assert.match(functions,/enforceAppCheck:true,consumeAppCheckToken:true/);
 assert.match(functions,/safety\.recordDataHash!==input\.sourceHash/);
 assert.match(functions,/assertProductionScheduleNotificationAccess/);
 assert.match(functions,/productionScheduleNotificationReceipts/);
 assert.match(rules,/allow create, delete: if isOwner\(\) && legacyV1WriteOpen\(companyId\)/);
});

test('連續貼上通知只保留單一最新工作並在 2 秒內快速重試',async()=>{
 const client=await read('js/core/firebase-auth-and-cloud-sync.module.js');
 const start=client.indexOf('function queueScheduleChangeNotifications');
 const end=client.indexOf('function installScheduleNotificationUI');
 const source=client.slice(start,end);
 assert.match(source,/const key='latest'/);
 assert.match(source,/job\.currentDb=deepCopy\(currentDb\)/);
 assert.match(source,/job\.version\+\+/);
 assert.match(source,/schedule\(120\)/);
 assert.match(source,/\[250,500,1000,2000\]/);
 assert.doesNotMatch(source,/30000/);
 assert.doesNotMatch(source,/持續補送中/);
});

test('批次刪課會等待上一筆自動完成，不再立即以同步中阻擋',async()=>{
 const client=await read('js/core/firebase-auth-and-cloud-sync.module.js');
 assert.match(client,/async function waitForActiveOwnerIdleBeforeHighRisk/);
 assert.match(client,/本次操作已排隊，完成後會自動繼續/);
 assert.match(client,/await waitForActiveOwnerIdleBeforeHighRisk\(\)/);
 assert.doesNotMatch(client,/仍有一筆同步尚未確認，請等候同步完成後再執行/);
});
