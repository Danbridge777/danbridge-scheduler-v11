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

function workerRuntime({fetcher=async()=>new Response('current'),cached,put=async()=>{},openFails=false}={}){
 const listeners={},writes=[],cache={match:async()=>cached,put:async(key,response)=>{writes.push(key);return put(key,response)},addAll:async()=>{}};
 const context=vm.createContext({URL,Response,fetch:fetcher,caches:{open:async()=>{if(openFails)throw Error('storage unavailable');return cache},keys:async()=>[],delete:async()=>true},self:{location:{origin:'https://app.example'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()}}});
 vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 return{writes,send(request){let response;const lifetime=[];listeners.fetch({request,respondWith:p=>response=Promise.resolve(p),waitUntil:p=>lifetime.push(p)});return{response,lifetime}},listeners};
}
const workerRequest=(path,overrides={})=>({url:'https://app.example'+path,method:'GET',mode:'cors',destination:'script',...overrides});
test('worker URL is stable, updates ignore HTTP cache, and accepted updates retain draft guards',()=>{
 const pwa=readFileSync(new URL('../js/core/pwa-installation.js',import.meta.url),'utf8');
 assert.match(pwa,/register\('\.\/sw\.js',\{scope:'\.\/',updateViaCache:'none'\}\)/);
 assert.doesNotMatch(pwa,/register\(['"][^'"]*sw\.js\?/);
 assert.match(pwa,/if\(!allowUpdateNow\(\)\)return/);assert.match(pwa,/navigator\.serviceWorker\.controller!==acceptedWorker/);
});
for(const [path,overrides] of [['/',{mode:'navigate',destination:'document'}],['/app.js',{}],['/app.css',{destination:'style'}],['/icon.png',{destination:'image'}]])test('worker tracks cache writes without delaying network response '+path,async()=>{
 let release,finished=false;const w=workerRuntime({put:()=>new Promise(resolve=>{release=()=>{finished=true;resolve()}})}),e=w.send(workerRequest(path,overrides));
 assert.equal(e.lifetime.length,1);assert.equal(await (await e.response).text(),'current');assert.equal(finished,false);
 release();await Promise.all(e.lifetime);assert.equal(finished,true);assert.equal(w.writes.length,1);
});
test('worker cache quota errors do not turn successful network loads into failures',async()=>{
 const w=workerRuntime({put:async()=>{throw Error('quota')}}),e=w.send(workerRequest('/app.js'));
 assert.equal((await e.response).status,200);await Promise.all(e.lifetime);
});
test('worker never replaces cached HTML with a network error document',async()=>{
 const w=workerRuntime({fetcher:async()=>new Response('server error',{status:503})}),e=w.send(workerRequest('/',{mode:'navigate'}));
 assert.equal((await e.response).status,503);await Promise.all(e.lifetime);assert.equal(w.writes.length,0);
});
test('worker offline paths return the exact cached response or a network-error response',async()=>{
 for(const cached of [new Response('offline'),undefined]){
  const w=workerRuntime({fetcher:async()=>{throw Error('offline')},cached}),e=w.send(workerRequest('/app.js'));
  const response=await e.response;if(cached)assert.equal(await response.text(),'offline');else assert.equal(response.type,'error');await Promise.all(e.lifetime);
 }
});
test('worker storage unavailable does not block a valid network response',async()=>{
 const w=workerRuntime({openFails:true}),e=w.send(workerRequest('/icon.png',{destination:'image'}));
 assert.equal(await (await e.response).text(),'current');await Promise.all(e.lifetime);
});
test('cached icons absorb failed background refresh without unhandled rejection',async()=>{
 const w=workerRuntime({fetcher:async()=>{throw Error('offline')},cached:new Response('cached icon')}),e=w.send(workerRequest('/icon.png',{destination:'image'}));
 assert.equal(await (await e.response).text(),'cached icon');await Promise.all(e.lifetime);
});
test('worker leaves Firebase auth, cross-origin requests and non-GET traffic untouched',()=>{
 const w=workerRuntime({fetcher:()=>assert.fail('must not intercept')});
 for(const request of [workerRequest('/__/auth/handler'),workerRequest('/__'),workerRequest('/app.js',{method:'POST'}),workerRequest('/app.js',{url:'https://accounts.google.com/auth'})]){
  const event=w.send(request);assert.equal(event.response,undefined);assert.equal(event.lifetime.length,0);
 }
});
