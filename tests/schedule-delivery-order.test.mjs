import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
test('health center never labels a verified baseline as completed pending writes',()=>{
 const code=source.slice(source.indexOf('function ownerSyncHealthLabel('),source.indexOf('async function renderSyncRecoveryCenter('));
 const context=vm.createContext({DANBRIDGE_ENVIRONMENT:'production'});vm.runInContext(code,context);
 const report={authority:{recordAuthority:true},flags:{}};
 assert.equal(context.ownerSyncHealthLabel(report),'逐筆權威已驗證，目前無待送變更');
 for(const field of ['localDirty','ownerUploading','ownerQueued'])assert.equal(context.ownerSyncHealthLabel({...report,flags:{[field]:true}}),'本機變更待雲端確認');
 for(const field of ['dirty','queued','inFlight'])assert.equal(context.ownerSyncHealthLabel(report,{[field]:true}),'本機變更待雲端確認');
 for(const field of ['pending','sending','failed'])assert.equal(context.ownerSyncHealthLabel(report,{counts:{[field]:1}}),'本機變更待雲端確認');
 assert.equal(context.ownerSyncHealthLabel(report,{state:'blocked'}),'同步待修復，未確認完成');
 assert.equal(context.ownerSyncHealthLabel(report,{retryPending:true}),'同步待修復，未確認完成');
 assert.equal(context.ownerSyncHealthLabel(report,{counts:{quarantined:1}}),'同步待修復，未確認完成');
});
const piece=(start,end)=>source.includes(start)?source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))):'';
const deliveryCode=[piece('function announceScheduleDeliveryCompletion','async function publishRoleViewsWithRetry'),piece('async function publishRoleViewsWithRetry','async function migrateLegacyLessonCloudDocuments'),piece('function queueScheduleChangeNotifications','function installScheduleNotificationUI')].join('\n');
const clone=value=>JSON.parse(JSON.stringify(value)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const statuses=[],published=[],timers=[];
 const context=vm.createContext({DANBRIDGE_ENVIRONMENT:'production',cloudRole:'owner',lastPublishedOwnerDB:null,productionTrustedOperationClient:null,deepCopy:clone,recordDataHash:value=>JSON.stringify(value),
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

test('已驗證原子回條不另發重複通知，也不清除其他版本未完成的工作',async()=>{
 const app=harness(),confirmed={version:2};app.context.productionTrustedOperationClient={hasAtomicPublication:hash=>hash===JSON.stringify(confirmed)};
 app.context.scheduleNotificationDeliveryJobs.set('old-pending',{version:1});
 app.context.queueScheduleChangeNotifications({version:1},confirmed,'atomic');await app.context.publishRoleViewsWithRetry(confirmed);
 assert.equal(app.published.length,0);assert.equal(app.timers.length,0);assert.equal(app.context.scheduleNotificationDeliveryJobs.size,1);
 assert.equal(app.statuses.some(row=>row.kind==='ok'),false);
});

test('原子提交抵達仍有舊通知待送時，保留舊起點並以最新已確認來源補送',async()=>{
 const app=harness(),deliveries=[];
 app.context.publishScheduleChangeNotifications=async(before,after)=>deliveries.push([clone(before),clone(after)]);
 app.context.queueScheduleChangeNotifications({version:0},{version:1},'legacy');
 app.context.productionTrustedOperationClient={hasAtomicPublication:hash=>hash===JSON.stringify({version:2})};
 app.context.queueScheduleChangeNotifications({version:1},{version:2},'atomic');
 const job=app.context.scheduleNotificationDeliveryJobs.get('latest');
 assert.deepEqual(clone(job.previousDb),{version:0});assert.deepEqual(clone(job.currentDb),{version:2});
 app.timers.at(-1)();await tick();
 assert.deepEqual(deliveries,[[{version:0},{version:2}]]);assert.equal(app.context.scheduleNotificationDeliveryJobs.size,0);
});

test('原子提交抵達時，舊角色發布失敗不能讓新來源永遠等候舊 head',async()=>{
 const app=harness();let release;
 app.context.publishScopedViews=async value=>{app.published.push(clone(value));if(value.version===1){await new Promise(resolve=>{release=resolve});throw Error('old authority head')}};
 const old=app.context.publishRoleViewsWithRetry({version:1});await tick();
 app.context.productionTrustedOperationClient={hasAtomicPublication:hash=>hash===JSON.stringify({version:2})};
 await app.context.publishRoleViewsWithRetry({version:2});release();await old;
 await app.context.publishRoleViewsWithRetry();
 assert.deepEqual(app.published,[{version:1},{version:2}]);assert.equal(app.context.roleViewPublishQueued,false);assert.equal(app.context.roleViewRetryCount,0);
});

test('角色發布重試保持已確認來源，不取用新的未提交畫面',async()=>{
 const app=harness();let first=true;
 app.context.publishScopedViews=async value=>{app.published.push(clone(value));if(first){first=false;throw Error('temporary failure')}};
 await app.context.publishRoleViewsWithRetry({version:'confirmed'});
 await app.context.publishRoleViewsWithRetry();
 assert.deepEqual(app.published,[{version:'confirmed'},{version:'confirmed'}]);
});

test('沒有已確認來源時，角色重試不讀取未提交的畫面資料',async()=>{
 const app=harness();
 assert.equal((await app.context.publishRoleViewsWithRetry()).state,'waiting-for-confirmed-source');
 assert.equal(app.published.length,0);assert.equal(app.statuses.length,0);
 app.context.lastPublishedOwnerDB={version:'cloud-confirmed'};
 await app.context.publishRoleViewsWithRetry();
 assert.deepEqual(app.published,[{version:'cloud-confirmed'}]);
});

test('角色補送失敗不宣稱主資料成功，也不覆蓋核心寫入失敗原因',async()=>{
 const app=harness();app.context.publishScopedViews=async()=>{throw Error('Role publication authority changed')};
 await app.context.publishRoleViewsWithRetry({version:'confirmed'});
 assert.equal(app.statuses.some(row=>row.text.includes('主資料已同步')),false);
 app.statuses.length=0;
 app.context.activeRecordPageController.diagnostics=()=>({state:'blocked',dirty:true,retryPending:true,error:'original-owner-failure'});
 await app.context.publishRoleViewsWithRetry();
 assert.equal(app.statuses.length,0);
});

test('立即重試全部只在逐筆核心完全確認後發布已確認版本',async()=>{
 const retryCode=piece('async function retryAllOperationalSync','function emergencyOwnerStatus');
 for(const state of ['blocked','busy','pending','waiting-for-stream','paused','stopped']){
  const app=harness();Object.assign(app.context,{activeRecordMode:'active',ownerUploadQueued:false,uploadOwnerState:async()=>({state}),scheduleDailyCloudBackup:()=>{throw Error('must not run')},renderSyncRecoveryCenter:()=>{}});
  vm.runInContext(retryCode,app.context);
  assert.equal((await app.context.retryAllOperationalSync()).state,state);
  assert.equal(app.published.length,0,state);assert.equal(app.context.roleViewPublishQueued,false,state);
 }
 for(const patch of [{dirty:true},{queued:true},{inFlight:true},{retryPending:true},{writeAllowed:false},{counts:{quarantined:1}},{counts:{pending:1}},{counts:{sending:1}},{counts:{failed:1}}]){
  const app=harness();Object.assign(app.context,{activeRecordMode:'active',ownerUploadQueued:false,uploadOwnerState:async()=>({state:'complete',readbackDb:{version:'confirmed'}}),scheduleDailyCloudBackup:()=>{throw Error('must not run')},renderSyncRecoveryCenter:()=>{}});
  app.context.activeRecordPageController.diagnostics=()=>({state:'complete',writeAllowed:true,...patch});
  vm.runInContext(retryCode,app.context);await app.context.retryAllOperationalSync();assert.equal(app.published.length,0,JSON.stringify(patch));
 }
 const app=harness();let backedUp=0;Object.assign(app.context,{activeRecordMode:'active',ownerUploadQueued:false,uploadOwnerState:async()=>({state:'complete',readbackDb:{version:'confirmed'}}),scheduleDailyCloudBackup:()=>{backedUp++},renderSyncRecoveryCenter:()=>{}});
 vm.runInContext(retryCode,app.context);await app.context.retryAllOperationalSync();
 assert.deepEqual(app.published,[{version:'confirmed'}]);assert.equal(backedUp,1);
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
