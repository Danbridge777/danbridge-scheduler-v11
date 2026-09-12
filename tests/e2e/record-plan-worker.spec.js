const {test,expect}=require('@playwright/test');

test('native module worker preserves all 40 changes and audit order while input stays usable',async({page})=>{
 let workers=0;const workerUrls=[];page.on('worker',worker=>{workers++;workerUrls.push(worker.url())});
 await page.route('**/record-plan-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><label>下一步備註<input aria-label="下一步備註"></label><button id="edit">下一步修改</button><output id="result"></output>'}));
 await page.goto('/record-plan-fixture');
 await page.evaluate(async()=>{
  const {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb}=await import('/js/core/cloud-full-record-shadow.js');
  const {recordDataHash}=await import('/js/core/cloud-record-data-hash.js');
  // Use the exact module URL imported by the application runtime; an
  // unversioned URL creates a separate JS module and therefore a different
  // idle pool even when its source bytes are identical.
  const executor=await import('/js/core/cloud-record-plan-executor.js?v=20.26.310');
  const NativeWorker=window.Worker;window.__workerSuccess=0;window.__workerErrors=0;
  window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.ok===true)window.__workerSuccess++});this.addEventListener('error',()=>window.__workerErrors++)}};
  const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),db=empty(),documents=empty();
  db.students=Array.from({length:400},(_,i)=>({id:'student-'+i,name:'學生'+i}));
  db.lessons=Array.from({length:40},(_,i)=>({id:'lesson-'+i,studentId:'student-'+i,date:'2026-09-11',start:'09:00',end:'10:00',room:'A'}));
  db.changes=Array.from({length:800},(_,i)=>({at:'2026-09-10T00:00:00.000Z',message:'歷史 '+i}));
  for(const row of buildFullRecordShadowPlan(documents,db,{sourceHash:'seed',environment:'production'}).operations){const m=row.path.match(/collections\/([^/]+)\/records\/(.+)$/);documents[m[1]].push({id:m[2],data:row.payload})}
  const remote=rebuildFullRecordShadowDb(documents,{environment:'production'}),base=remote.db,hash=recordDataHash(base),local={...base,lessons:base.lessons.map(l=>({...l,room:'B'})),changes:[...Array.from({length:40},(_,i)=>({at:'2026-09-11T00:00:00.000Z',message:'移動 '+i})),...base.changes]};
  const options={documentsByCollection:documents,baselineDb:base,localDb:local,environment:'production',deviceId:'native-worker',activationEpoch:'epoch-worker-293',createdAt:'2026-09-11T00:00:00.000Z',authoritativeSourceHash:hash,verifiedRemote:{...remote,db:base,hash},changedCollections:['lessons','changes'],appendOnlyChangesCount:40};
  window.__workerInput=options;window.__workerExecutor=executor;window.__expectedPlan=await executor.prepareCanonicalRecordPlan(options);
  document.getElementById('edit').onclick=()=>{local.lessons[0].room='C';document.getElementById('result').textContent='下一步已輸入'};
 });
 await page.evaluate(()=>{
  window.__frames=0;window.__planning=true;const frame=()=>{if(window.__planning){window.__frames++;requestAnimationFrame(frame)}};requestAnimationFrame(frame);
  window.__workerResult=window.__workerExecutor.prepareRecordPlanOffThread(window.__workerInput).finally(()=>{window.__planning=false});
 });
 await page.getByLabel('下一步備註').fill('後續操作保留');await page.getByRole('button',{name:'下一步修改'}).click();
 const result=await page.evaluate(async()=>{const plan=await window.__workerResult;return{same:JSON.stringify(plan)===JSON.stringify(window.__expectedPlan),operations:plan.operationCount,room:plan.db.lessons[0].room,nextRoom:window.__workerInput.localDb.lessons[0].room,frames:window.__frames,chained:plan.operations.every((op,i)=>!i||op.baseHash===plan.operations[i-1].targetHash)}});
 expect(workers).toBe(1);expect(workerUrls[0]).toMatch(/\/js\/generated\/record-plan\.worker\.js\?v=20\.26\.310$/);expect(result.same).toBe(true);expect(result.operations).toBe(80);expect(result.room).toBe('B');expect(result.nextRoom).toBe('C');expect(result.frames).toBeGreaterThan(0);expect(result.chained).toBe(true);await expect(page.getByLabel('下一步備註')).toHaveValue('後續操作保留');
 const committed=await page.evaluate(async()=>{
  const {runActiveRecordSync}=await import('/js/core/cloud-active-record-runtime.js');
  const {createOperationJournal}=await import('/js/core/cloud-operation-journal.js');
  const {applyActiveRecordOperation}=await import('/js/core/cloud-active-record-sync.js');
  const {rebuildFullRecordShadowDb}=await import('/js/core/cloud-full-record-shadow.js');
  const {recordDataHash}=await import('/js/core/cloud-record-data-hash.js');
  const input=window.__workerInput,documents=structuredClone(input.documentsByCollection),batches=[];let rows=null;
  const journal=createOperationJournal({storage:{load:async()=>structuredClone(rows),save:async value=>{rows=structuredClone(value)}}});
  const send=async op=>{const list=documents[op.collection],index=list.findIndex(row=>row.id===op.recordId),receipt=applyActiveRecordOperation(index<0?null:list[index].data,op);if(receipt.write){const row={id:op.recordId,data:receipt.payload};if(index<0)list.push(row);else list[index]=row}return receipt};
  send.batch=async operations=>{batches.push(operations.length);for(const op of operations)await send(op);const targetHash=recordDataHash(rebuildFullRecordShadowDb(documents,{environment:'production'}).db);if(targetHash!==operations.at(-1).targetHash)throw Error('batch target mismatch');return{kind:'batch',write:true,operationCount:operations.length,targetHash}};
  const result=await runActiveRecordSync({...input,journal,readDocuments:async()=>structuredClone(documents),send,trustedDocuments:input.documentsByCollection,publishedOwnerBatch:true});
  const confirmed=rebuildFullRecordShadowDb(documents,{environment:'production'}).db;
  const normal=await runActiveRecordSync({environment:'production',deviceId:'normal-mode',activationEpoch:input.activationEpoch,journal,readDocuments:async()=>structuredClone(documents),send,baselineDb:confirmed,localDb:confirmed});
  return{state:result.state,normalState:normal.state,batches,room:confirmed.lessons[0].room,counts:await journal.counts(),workerSuccess:window.__workerSuccess,workerErrors:window.__workerErrors};
 });
 expect(workers).toBe(2);expect(committed.workerSuccess).toBe(2);expect(committed.workerErrors).toBe(0);expect(committed.state).toBe('complete');expect(committed.normalState).toBe('complete');expect(committed.batches).toEqual([80]);expect(committed.room).toBe('C');expect(committed.counts.pending+committed.counts.failed+committed.counts.quarantined+committed.counts.sending).toBe(0);
 const reused=await page.evaluate(async()=>{
  const input=window.__workerInput,next={...input,deviceId:'next-authorized-device',activationEpoch:'next-epoch-worker-296',localDb:{...input.localDb,lessons:input.localDb.lessons.map(l=>({...l,room:'D'}))}};
  const expected=await window.__workerExecutor.prepareCanonicalRecordPlan(next);
  const pending=window.__workerExecutor.prepareRecordPlanOffThread(next,{reuseWorker:true});next.localDb.lessons[0].room='E';
  const plan=await pending;return{same:JSON.stringify(plan)===JSON.stringify(expected),device:plan.deviceId,epoch:plan.activationEpoch,room:plan.db.lessons[0].room,nextRoom:next.localDb.lessons[0].room,success:window.__workerSuccess,errors:window.__workerErrors};
 });
 expect(workers).toBe(2);expect(reused).toEqual({same:true,device:'next-authorized-device',epoch:'next-epoch-worker-296',room:'D',nextRoom:'E',success:3,errors:0});
});
