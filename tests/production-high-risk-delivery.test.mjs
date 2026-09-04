import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const functionSource=source.slice(source.indexOf('async function runProductionHighRiskMutation'),source.indexOf('window.__danbridgeRunProductionHighRiskMutation='));
const clone=value=>JSON.parse(JSON.stringify(value));
function harness({commitError=false}={}){
 const before=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));before.lessons=[{id:'fixture-lesson',date:'2026-10-01',room:'A'}];
 const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 for(const operation of buildFullRecordShadowPlan(documents,before,{environment:'production',sourceHash:'fixture'}).operations){const match=operation.path.match(/collections\/([^/]+)\/records\/(.+)$/);documents[match[1]].push({id:match[2],data:operation.payload})}
 const events=[],notifications=[];
 const context=vm.createContext({DANBRIDGE_ENVIRONMENT:'production',cloudRole:'owner',activeRecordMode:'active',crypto:{randomUUID},deepCopy:clone,rebuildFullRecordShadowDb,prepareActiveRecordSync,
  activeOwnerControllerEpoch:'production-fixture-epoch',activeRecordPageController:{diagnostics:()=>({activationEpoch:'production-fixture-epoch'}),readConfirmedDocuments:async()=>clone(documents),acceptCommittedBatch:()=>{events.push('remember-commit')}},
  activeOwnerProductionReadDocuments:async()=>clone(documents),waitForActiveOwnerIdleBeforeHighRisk:async()=>({waitedMs:0}),
  productionTrustedOperationClient:{applyBatch:async()=>{events.push('commit');if(commitError)throw Error('fixture commit rejected');return{state:'committed'}}},
  lastPublishedOwnerDB:clone(before),ownerBaselineReady:true,
  acceptActiveOwnerSnapshot:async snapshot=>{events.push('apply');context.lastPublishedOwnerDB=clone(snapshot.db)},
  publishScopedViews:async()=>{events.push('slow-legacy-publisher');await new Promise(()=>{})},publishLessonMeta:async()=>{},
  publishRoleViewsWithRetry:()=>{events.push('queue-role-publication')},
  queueScheduleChangeNotifications:(old,next)=>{events.push('queue-notification');notifications.push({old:clone(old),next:clone(next)})}
 });
 vm.runInContext(functionSource,context);
 return{context,events,notifications,run:()=>context.runProductionHighRiskMutation({reason:'batch-delete-lessons',mutate:db=>{db.lessons=[];return{removed:1}}})};
}

test('批次刪除回條後立即可操作，通知使用刪除前權威資料，不被更新基準吃掉',async()=>{
 const app=harness();let timeout;
 try{
  const result=await Promise.race([app.run(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('批次刪除仍等待整批角色發布')),100)})]);
  assert.equal(result.state,'complete');assert.equal(result.mutationResult.removed,1);
  assert.equal(app.notifications.length,1);assert.equal(app.notifications[0].old.lessons.length,1);assert.equal(app.notifications[0].next.lessons.length,0);
  assert.ok(app.events.indexOf('commit')<app.events.indexOf('queue-notification'));
  assert.ok(app.events.includes('queue-role-publication'));assert.ok(!app.events.includes('slow-legacy-publisher'));
 }finally{clearTimeout(timeout)}
});
test('後端未提交時，不套用畫面、不發送刪除通知、不假報完成',async()=>{
 const app=harness({commitError:true});await assert.rejects(app.run,/fixture commit rejected/);
 assert.deepEqual(app.events,['commit']);assert.equal(app.notifications.length,0);
});
