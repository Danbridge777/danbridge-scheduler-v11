import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
// Execute the actual signed-in initialization body, with I/O controlled by
// promises. No duplicated implementation and no production connection.
const start=source.indexOf('   beginCloudBootstrap();',source.indexOf('onAuthStateChanged(auth,async user=>'));
const end=source.indexOf('\n }catch(e){console.error(e);failCloudBootstrap',start);
assert.ok(start>0&&end>start);
function harness({profileRead,loginWrite,currentUid='current'}={}){
 const calls=[],user={uid:'current'},context={user,auth:{currentUser:{uid:currentUid}},DANBRIDGE_ENVIRONMENT:'production',console:{warn:()=>calls.push('audit-error')},setTimeout:()=>0};
 for(const name of ['beginCloudBootstrap','cloudStatus','advanceCloudBootstrap','applyRoleUI','showCloudApp','subscribeOwner','subscribeSchedulerRequests','subscribeSchedulerTeacher','subscribeTeacher','subscribeBranchManager','subscribeRoleAccessGuard','subscribeLessonReports','subscribeScheduleNotifications','subscribeTeacherLeaves','reportOperationalError'])context[name]=()=>calls.push(name);
 context.loadSignedInProfile=()=>profileRead??Promise.resolve({role:'owner'});
 context.recordSuccessfulLogin=()=>{calls.push('recordSuccessfulLogin');return loginWrite??Promise.resolve()};
 return{calls,run:()=>vm.runInNewContext(`(async()=>{${source.slice(start,end)}\n})()`,context)};
}
test('登入時間寫回永久 pending 也不阻擋授權後的資料訂閱',async()=>{
 const app=harness({loginWrite:new Promise(()=>{})});
 await app.run();
 assert.ok(app.calls.includes('subscribeOwner'));
 assert.ok(app.calls.indexOf('subscribeScheduleNotifications')<app.calls.indexOf('recordSuccessfulLogin'));
 assert.ok(!app.calls.includes('audit-error'));
});
test('未完成權限讀取前絕不啟動資料訂閱',async()=>{
 let resolve;const profileRead=new Promise(done=>{resolve=done}),app=harness({profileRead});
 const done=app.run();await Promise.resolve();
 assert.ok(!app.calls.includes('subscribeOwner'));
 resolve({role:'owner'});await done;assert.ok(app.calls.includes('subscribeOwner'));
});
test('登入途中換帳號，舊身分不得訂閱或寫登入時間',async()=>{
 const app=harness({currentUid:'different'});await app.run();
 assert.ok(!app.calls.includes('subscribeOwner'));assert.ok(!app.calls.includes('recordSuccessfulLogin'));
});
test('登入時間寫回失敗會記錄，但不撤銷已確認的資料訂閱',async()=>{
 const app=harness({loginWrite:Promise.reject(new Error('unavailable'))});await app.run();await Promise.resolve();
 assert.ok(app.calls.includes('subscribeOwner'));assert.ok(app.calls.includes('reportOperationalError'));
});

const ownerStart=source.slice(source.indexOf('function startOwnerActiveRecordRuntime(){'),source.indexOf('\nwindow.__danbridgeCommitStagingV2H1='));
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function retryHarness(run){
 const timers=[],failures=[],calls=[],user={uid:'owner-a'};
 const context={cloudRole:'owner',cloudUid:'owner-a',cloudEmailKey:'owner@example.com',DANBRIDGE_ENVIRONMENT:'staging',auth:{currentUser:user},ownerBootstrapGeneration:0,ownerBootstrapRetryTimer:null,activeRecordPageController:null,document:{body:{dataset:{}}},startOwnerStagingV2Runtime:async current=>{calls.push(current);return run(current,calls.length)},persistOwnerSyncRecovery(){},failCloudBootstrap:(error,options)=>failures.push({message:error.message,...options}),cloudStatus(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(ownerStart,context);return{context,timers,failures,calls,start:()=>context.startOwnerActiveRecordRuntime()};
}
test('staging transient bootstrap failure retries fresh reads and clears its exact error after recovery',async()=>{
 const app=retryHarness(async(_,n)=>{if(n===1)throw Object.assign(new Error('temporary offline'),{code:'unavailable'})});app.start();await settle();
 assert.equal(app.timers.length,1);assert.equal(app.timers[0].ms,1000);assert.equal(app.failures[0].readOnly,true);assert.match(app.failures[0].message,/unavailable.*temporary offline/);
 assert.equal(JSON.parse(app.context.document.body.dataset.activeRecordError).retryable,true);
 app.timers[0].fn();await settle();assert.equal(app.calls.length,2);assert.equal(app.context.document.body.dataset.activeRecordError,undefined);
});
test('staging permission or integrity failure never automatically retries or hides the cause',async()=>{
 for(const code of ['permission-denied','validation-failed','auth/user-disabled','auth/user-token-expired','auth/invalid-user-token','auth/operation-not-allowed']){const app=retryHarness(async()=>{throw Object.assign(new Error('precise root cause'),{code})});app.start();await settle();assert.equal(app.timers.length,0);assert.match(app.failures[0].message,/precise root cause/);assert.equal(app.context.document.body.dataset.activeRecordState,'blocked');}
});
test('actual Firebase Auth network error retries with bounded backoff while preserving its exact cause',async()=>{
 const app=retryHarness(async(_,n)=>{if(n<=7)throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'),{code:'auth/network-request-failed'})});
 app.start();await settle();
 for(const [index,delay] of [1000,2000,4000,8000,16000,30000,30000].entries()){
  assert.equal(app.timers[index].ms,delay);
  const error=JSON.parse(app.context.document.body.dataset.activeRecordError);
  assert.equal(error.code,'auth/network-request-failed');assert.equal(error.retryable,true);
  assert.equal(app.failures[index].readOnly,true);
  app.timers[index].fn();await settle();
 }
 assert.equal(app.calls.length,8);assert.equal(app.context.document.body.dataset.activeRecordError,undefined);
});
test('Firebase Auth network retry cannot continue after account switch or controller initialization',async()=>{
 const app=retryHarness(async()=>{throw Object.assign(new Error('offline'),{code:'auth/network-request-failed'})});
 app.start();await settle();app.context.auth.currentUser={uid:'other'};app.timers[0].fn();await settle();assert.equal(app.calls.length,1);
 const initialized=retryHarness(async()=>{throw Object.assign(new Error('offline'),{code:'auth/network-request-failed'})});
 initialized.context.activeRecordPageController={};initialized.start();await settle();assert.equal(initialized.timers.length,0);
});
test('switching account or invalidating the runtime cancels a pending bootstrap retry',async()=>{
 for(const change of ['account','generation']){const app=retryHarness(async()=>{throw Object.assign(new Error('offline'),{code:'unavailable'})});app.start();await settle();if(change==='account')app.context.auth.currentUser={uid:'other'};else app.context.ownerBootstrapGeneration++;app.timers[0].fn();await settle();assert.equal(app.calls.length,1);}
});
test('a failure after a controller exists does not create a second authority controller',async()=>{
 const app=retryHarness(async()=>{throw Object.assign(new Error('offline'),{code:'unavailable'})});app.context.activeRecordPageController={};app.start();await settle();assert.equal(app.timers.length,0);
});
const stagingStart=source.slice(source.indexOf('async function startOwnerStagingV2Runtime('),source.indexOf('\nfunction startOwnerProductionRecordRuntime(){'));
const observerSource=source.slice(source.indexOf('function subscribeStagingOwnerHead('),source.indexOf('\nasync function startOwnerStagingV2Runtime('));
function observerHarness(readDocuments=async()=>({revision:1})){
 const applied=[],allowed=[],errors=[],timers=[],user={current:true};let receive,fail,stops=0;
 const controller={acceptCloudSnapshot:async row=>applied.push(row.db),setWriteAllowed:value=>allowed.push(value)};
 const context={activeRecordPageController:controller,document:{body:{dataset:{}}},onSnapshot:(_ref,options,next,error)=>{assert.equal(options.includeMetadataChanges,true);receive=next;fail=error;return()=>stops++},normalizeStagingV2FirestoreValue:x=>x,rebuildFullRecordShadowDb:documents=>({db:documents,revisions:{}}),recordDataHash:()=> 'hash',persistOwnerSyncRecovery(){},cloudStatus:message=>errors.push(message),setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(observerSource,context);
 const stop=context.subscribeStagingOwnerHead({reference:'head',epoch:'epoch',readDocuments,controller,isCurrent:()=>user.current});
 return{applied,allowed,errors,timers,user,context,stop,get stops(){return stops},emit:(revision,metadata={})=>receive({metadata,exists:()=>revision!==null,data:()=>({revision})}),fail:error=>fail(error)};
}
test('staging Owner observes committed heads, not cached/pending/duplicate snapshots',async()=>{
 let reads=0;const app=observerHarness(async()=>({revision:++reads}));
 app.emit(1,{fromCache:true});app.emit(1,{hasPendingWrites:true});await settle();assert.equal(reads,0);
 app.emit(1);await settle();app.emit(1);await settle();assert.equal(reads,1);
 app.emit(2);await settle();assert.equal(app.applied.length,2);assert.equal(app.applied[1].revision,2);
 app.stop();app.emit(3);await settle();assert.equal(reads,2);assert.equal(app.stops,1);
});
test('newer staging heads coalesce and invalidate a slow older read before application',async()=>{
 let done,reads=0;const app=observerHarness(()=>++reads===1?new Promise(resolve=>{done=resolve}):Promise.resolve({revision:3}));
 app.emit(1);app.emit(2);app.emit(3);done({revision:1});await settle();
 assert.equal(reads,2);assert.equal(app.applied.length,1);assert.equal(app.applied[0].revision,3);
});
test('logout, controller replacement, listener failure and missing head fence in-flight reads',async()=>{
 for(const event of ['logout','controller','permission','missing']){
  let done;const app=observerHarness(()=>new Promise(resolve=>{done=resolve}));app.emit(1);
  if(event==='logout')app.user.current=false;
  if(event==='controller')app.context.activeRecordPageController={};
  if(event==='permission')app.fail(Object.assign(new Error('revoked'),{code:'permission-denied'}));
  if(event==='missing')app.emit(null);
  done({revision:1});await settle();assert.equal(app.applied.length,0,event);
  if(['permission','missing'].includes(event)){assert.deepEqual(app.allowed,[false]);assert.equal(app.timers.length,0)}
 }
});
test('head read network failures retry but integrity errors remain read-only',async()=>{
 for(const code of ['auth/network-request-failed','validation-failed']){
  let reads=0;const app=observerHarness(async()=>{if(++reads===1)throw Object.assign(new Error(code),{code});return{revision:1}});
  app.emit(1);await settle();assert.deepEqual(app.allowed,[false]);assert.equal(app.applied.length,0);
  if(code==='validation-failed'){assert.equal(app.timers.length,0);continue}
  assert.equal(app.timers[0].ms,1000);app.timers[0].fn();await settle();assert.equal(app.applied.length,1);assert.equal(app.context.document.body.dataset.activeRecordError,undefined);
 }
});
test('staging bootstrap rechecks identity after each remote await before publishing data or enabling writes',async()=>{
 for(const stopAt of ['fence','token','head','latest-head','loader','accept']){
  let current=true,reads=0,published=0,enabled=0;const docs={};
  const context={DANBRIDGE_ENVIRONMENT:'staging',cloudRole:'owner',COMPANY_ID:'danbridge',cloud:{},document:{body:{dataset:{}}},doc:(_, ...parts)=>parts.join('/'),getDocFromServer:async()=>{const stage=['fence','head','latest-head'][reads++];if(stage===stopAt)current=false;return{exists:()=>true,data:()=>({targetV2Epoch:'epoch-test'})}},assertStagingV2PermanentFence:x=>x,normalizeStagingV2FirestoreValue:x=>x,auth:{currentUser:{getIdTokenResult:async()=>{if(stopAt==='token')current=false}}},warmStagingV2LimitedUseToken:()=>Promise.resolve(),assertStagingV2RuntimeHead:()=> 'hn',createExplicitStagingV2AuthorityReadLoader:()=>({load:async()=>{if(stopAt==='loader')current=false;return{documentsByCollection:docs}}}),rebuildFullRecordShadowDb:()=>({db:{lessons:[]}}),stagingV2BrowserOperationSender:()=>({}),ensureActiveOwnerPageController:()=>({acceptCloudSnapshot:async()=>{published++;if(stopAt==='accept')current=false},setWriteAllowed:()=>enabled++}),deepCopy:x=>x,recordDataHash:()=> 'hash',unsubscribeState:null,cloudStatus(){}};
  vm.createContext(context);vm.runInContext(stagingStart,context);
  await assert.rejects(context.startOwnerStagingV2Runtime(()=>current),/identity changed/);
  assert.equal(enabled,0,stopAt);assert.equal(published,stopAt==='accept'?1:0,stopAt);
 }
});
