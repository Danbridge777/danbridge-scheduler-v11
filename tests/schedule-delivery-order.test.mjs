import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const piece=(start,end)=>source.includes(start)?source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))):'';
const deliveryCode=[piece('function announceScheduleDeliveryCompletion','async function publishRoleViewsWithRetry'),piece('async function publishRoleViewsWithRetry','async function migrateLegacyLessonCloudDocuments'),piece('function queueScheduleChangeNotifications','function installScheduleNotificationUI')].join('\n');
const clone=value=>JSON.parse(JSON.stringify(value)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const statuses=[],published=[],timers=[];
 const context=vm.createContext({DANBRIDGE_ENVIRONMENT:'production',cloudRole:'owner',deepCopy:clone,recordDataHash:value=>JSON.stringify(value),
  roleViewPublishSourceDB:null,roleViewPublishQueued:false,roleViewPublishInFlight:false,roleViewRetryCount:0,roleViewRetryTimer:null,lessonMetaCacheReady:true,
  activeRecordPageController:{diagnostics:()=>({state:'complete',writeAllowed:true,dirty:false,queued:false,inFlight:false,retryPending:false})},
  scheduleNotificationDeliveryJobs:new Map(),document:{body:{dataset:{}}},window:{__danbridgeGetDB:()=>({version:'uncommitted-local'})},
  publishScopedViews:async value=>{published.push(clone(value))},publishLessonMeta:async()=>{},publishScheduleChangeNotifications:async()=>{},
  cloudStatus:(text,kind)=>statuses.push({text,kind}),reportOperationalError:()=>{},console:{error:()=>{}},
  setTimeout:callback=>{timers.push(callback);return timers.length},clearTimeout:()=>{},queueMicrotask
 });
 vm.runInContext(deliveryCode,context);return{context,statuses,published,timers};
}

test('通知先成功但角色視圖仍待送，不可顯示全部同步成功',async()=>{
 const app=harness();app.context.roleViewPublishQueued=true;
 app.context.queueScheduleChangeNotifications({version:1},{version:2},'batch');app.timers.shift()();await tick();
 assert.equal(app.context.scheduleNotificationDeliveryJobs.size,0);
 assert.equal(app.statuses.some(row=>row.kind==='ok'),false);
});

test('角色發布重試保持已確認來源，不取用新的未提交畫面',async()=>{
 const app=harness();let first=true;
 app.context.publishScopedViews=async value=>{app.published.push(clone(value));if(first){first=false;throw Error('temporary failure')}};
 await app.context.publishRoleViewsWithRetry({version:'confirmed'});
 await app.context.publishRoleViewsWithRetry();
 assert.deepEqual(app.published,[{version:'confirmed'},{version:'confirmed'}]);
});

test('較新已提交來源在發布中抵達時保持單線順序，不被失敗舊來源覆蓋',async()=>{
 const app=harness();let release,active=0,maxActive=0;
 app.context.publishScopedViews=async value=>{active++;maxActive=Math.max(active,maxActive);app.published.push(clone(value));if(value.version===1){await new Promise(resolve=>{release=resolve});active--;throw Error('old publication failed')}active--};
 const first=app.context.publishRoleViewsWithRetry({version:1});await tick();
 await app.context.publishRoleViewsWithRetry({version:2});release();await first;
 await app.context.publishRoleViewsWithRetry();
 assert.deepEqual(app.published,[{version:1},{version:2}]);assert.equal(maxActive,1);
});

test('核心有較新待送操作或安全暫停時，通知成功不能蓋掉待處理狀態',async()=>{
 for(const patch of [{dirty:true},{queued:true},{inFlight:true},{retryPending:true},{writeAllowed:false},{state:'blocked'},{state:'waiting-for-stream'},{counts:{quarantined:1}}]){
  const app=harness();app.context.activeRecordPageController.diagnostics=()=>({state:'complete',writeAllowed:true,dirty:false,queued:false,inFlight:false,retryPending:false,...patch});
  app.context.queueScheduleChangeNotifications({version:1},{version:2},'batch');app.timers.shift()();await tick();
  assert.equal(app.statuses.some(row=>row.kind==='ok'),false,JSON.stringify(patch));
 }
});

test('核心、角色與通知全數完成後才允許顯示完成',async()=>{
 const app=harness();app.context.roleViewPublishQueued=true;
 app.context.queueScheduleChangeNotifications({version:1},{version:2},'batch');app.timers.shift()();await tick();
 assert.equal(app.statuses.some(row=>row.kind==='ok'),false);
 await app.context.publishRoleViewsWithRetry({version:2});
 assert.equal(app.statuses.at(-1).kind,'ok');assert.match(app.statuses.at(-1).text,/已同步/);
});

test('控制器拒絕舊快照時，外層也不能把發布基準倒退',async()=>{
 const current={version:'confirmed-new'},context=vm.createContext({deepCopy:clone,localDirtyHash:'',activeRoleBootstrapSourceDb:clone(current),lastPublishedOwnerDB:clone(current),ownerBaselineReady:true,lastCloudSnapshotHash:'new-hash',lastUploadedHash:'new-hash',activeOwnerResumedEpoch:'epoch',ensureActiveOwnerPageController:()=>({diagnostics:()=>({dirty:false,inFlight:false}),acceptCloudSnapshot:async()=>({state:'remote-buffered',accepted:false})})});
 vm.runInContext(piece('async function acceptActiveOwnerSnapshot','async function waitForActiveOwnerIdleBeforeHighRisk'),context);
 await context.acceptActiveOwnerSnapshot({activationEpoch:'epoch',db:{version:'old'},hash:'old-hash'});
 assert.deepEqual(clone(context.lastPublishedOwnerDB),current);assert.deepEqual(clone(context.activeRoleBootstrapSourceDb),current);
 assert.equal(context.lastCloudSnapshotHash,'new-hash');assert.equal(context.lastUploadedHash,'new-hash');
});
