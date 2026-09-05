import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createProductionSchedulerQueue,acquireProductionSchedulerLease} from '../js/core/production-scheduler-queue.js';
import {projectProductionSchedulerDb} from '../js/core/production-role-view-projection.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function applyProductionSchedulerQueueDb('),source.indexOf('async function queueSchedulerChanges('));
const base=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const clone=value=>JSON.parse(JSON.stringify(value));
function harness(){
 let local=base(),stored=null,loadPause=null;const applied=[],held=new Set(),session=new Map(),statuses=[];
 const locks={request:async(name,options,work)=>{if(held.has(name))return work(null);held.add(name);try{return await work({name})}finally{held.delete(name)}}};
 const context=vm.createContext({productionSchedulerGeneration:0,productionSchedulerQueue:null,productionSchedulerQueueInit:null,productionSchedulerLease:null,productionSchedulerViewChain:Promise.resolve(),schedulerUploadRetryTimer:null,schedulerUploadRetryCount:0,
  DANBRIDGE_ENVIRONMENT:'production',stagingSchedulerOperationCall:null,
  cloudUid:'fixture-aa',cloudEmailKey:'aa0966626336@gmail.com',cloudRole:'teacher',cloudCanManageSchedule:true,schedulerRecoveryHold:false,schedulerStartupRecoveryChecked:false,applyingCloud:false,
  APP_RELEASE:'20.26.164',crypto:{randomUUID},navigator:{locks},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},
  window:{indexedDB:{},__danbridgeGetDB:()=>clone(local),__danbridgeSetDB:db=>{local=clone(db);applied.push(clone(db))},renderAll:()=>{}},
  createBrowserOperationJournalStorage:()=>({load:async()=>{const pause=loadPause;loadPause=null;if(pause)await pause;return clone(stored)},save:async value=>{stored=clone(value)}}),
  createProductionSchedulerQueue,acquireProductionSchedulerLease,filteredSchedulerDB:projectProductionSchedulerDb,emptyDB:base,dataHash:recordDataHash,recordDataHash,deepCopy:clone,
  persistCurrentLocalView:()=>{},showSchedulerRecoveryInspector:()=>{},cloudStatus:(...args)=>statuses.push(args),setTimeout,clearTimeout,localStorage:{setItem:()=>{}},document:{getElementById:()=>null},schedulerOptimisticLessons:new Map(),schedulerOptimisticStudents:new Map(),
  productionSchedulerOperationCall:async()=>{throw Object.assign(Error('offline'),{code:'functions/unavailable'})}
 });
 vm.runInContext(code,context);
 return{context,applied,held,statuses,setLocal:db=>local=clone(db),pauseLoad:promise=>loadPause=promise};
}
test('實際登入模組接上永久佇列，停止時釋放日誌鎖',async()=>{
 const h=harness();await h.context.initializeProductionSchedulerQueue(base(),1);assert.ok(h.context.productionSchedulerQueue);assert.equal(h.held.size,1);
 h.context.stopProductionSchedulerQueue();await new Promise(r=>setTimeout(r,0));assert.equal(h.held.size,0);assert.equal(h.context.productionSchedulerQueue,null);
});
test('舊登入初始化未結束即登出再登入同帳號，不套用舊畫面或接管新工作階段',async()=>{
 const h=harness();let release;h.pauseLoad(new Promise(resolve=>release=resolve));const initialization=h.context.initializeProductionSchedulerQueue(base(),1);await new Promise(r=>setTimeout(r,0));
 h.context.stopProductionSchedulerQueue();release();await assert.rejects(initialization,/登入狀態已改變/);assert.equal(h.applied.length,0);assert.equal(h.held.size,0);assert.equal(h.context.productionSchedulerQueue,null);
 await h.context.initializeProductionSchedulerQueue(base(),2);assert.ok(h.context.productionSchedulerQueue);h.context.stopProductionSchedulerQueue();
});
test('舊快取與雲端有未辨識差異時保留原資料，不建立新版基準覆蓋',async()=>{
 const h=harness();h.setLocal({...base(),lessons:[{id:'preserved-pending-lesson',date:'2026-10-01'}]});
 await assert.rejects(h.context.initializeProductionSchedulerQueue(base(),1),/舊版本機資料/);assert.equal(h.applied.length,0);assert.equal(h.context.schedulerRecoveryHold,true);assert.equal(h.held.size,0);
});
test('前一個帳號的遲到錯誤不能替新工作階段安排重試',async()=>{
 const h=harness();let reject;h.context.productionSchedulerQueue={flush:()=>new Promise((resolve,no)=>reject=no),stop:()=>Promise.resolve()};
 const old=h.context.flushProductionSchedulerQueue();h.context.stopProductionSchedulerQueue();reject(Object.assign(Error('old network failure'),{code:'functions/unavailable'}));
 await assert.rejects(old,/old network failure/);assert.equal(h.context.schedulerUploadRetryCount,0);assert.equal(h.context.schedulerUploadRetryTimer,null);
});
