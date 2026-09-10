import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const start=source.indexOf('window.__danbridgeCanReloadForUpdate=()=>{'),end=source.indexOf("window.addEventListener('offline'",start);
function runtime(overrides={}){
 const context=vm.createContext({window:{},activeRecordPageController:null,productionSchedulerQueue:null,localDirtyHash:'',ownerUploadInFlight:false,ownerUploadQueued:false,roleViewPublishInFlight:false,roleViewPublishQueued:false,scheduleNotificationDeliveryJobs:new Map(),schedulerRequestQueue:[],schedulerRequestWorkerActive:false,schedulerQuarantinedRequestIds:new Set(),productionSchedulerQueueInit:null,...overrides});
 vm.runInContext(source.slice(start,end),context);return context;
}
test('更新只依當下佇列判斷；已初始化的 AA 佇列不被誤認為仍在初始化',()=>{
 const c=runtime({productionSchedulerQueueInit:Promise.resolve(),productionSchedulerQueue:{diagnostics:()=>({pending:false,dirty:false,inFlight:false,error:''})}});
 assert.equal(c.window.__danbridgeCanReloadForUpdate(),true);c.localDirtyHash='new-change';assert.equal(c.window.__danbridgeCanReloadForUpdate(),false);c.localDirtyHash='';assert.equal(c.window.__danbridgeCanReloadForUpdate(),true);
});
for(const [key,value] of Object.entries({localDirtyHash:'pending',ownerUploadInFlight:true,ownerUploadQueued:true,roleViewPublishInFlight:true,roleViewPublishQueued:true,scheduleNotificationDeliveryJobs:new Map([['n',{}]]),schedulerRequestQueue:[{}],schedulerRequestWorkerActive:true,schedulerQuarantinedRequestIds:new Set(['failed']),productionSchedulerQueueInit:Promise.resolve()}))test(`更新保留尚未完成的 ${key}`,()=>assert.equal(runtime({[key]:value}).window.__danbridgeCanReloadForUpdate(),false));
for(const flag of ['dirty','queued','inFlight','retryPending'])test(`Owner ${flag} 時不得卸載頁面`,()=>assert.equal(runtime({activeRecordPageController:{diagnostics:()=>({[flag]:true})}}).window.__danbridgeCanReloadForUpdate(),false));
for(const flag of ['pending','sending','failed','quarantined'])test(`日誌 ${flag} 時不得卸載頁面`,()=>assert.equal(runtime({activeRecordPageController:{diagnostics:()=>({counts:{[flag]:1}})}}).window.__danbridgeCanReloadForUpdate(),false));
for(const flag of ['pending','dirty','inFlight','error'])test(`AA ${flag} 時不得卸載頁面`,()=>assert.equal(runtime({productionSchedulerQueue:{diagnostics:()=>({[flag]:true})}}).window.__danbridgeCanReloadForUpdate(),false));
test('IndexedDB 保存未完成時不更新',()=>assert.equal(runtime({window:{__danbridgeLocalSnapshotState:{state:'saving'}}}).window.__danbridgeCanReloadForUpdate(),false));
