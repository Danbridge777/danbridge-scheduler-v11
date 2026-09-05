import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionSchedulerQueue,acquireProductionSchedulerLease} from '../js/core/production-scheduler-queue.js';
import {buildProductionSchedulerTarget,SCHEDULER_OPERATION_RESPONSE_SCHEMA} from '../js/core/production-scheduler-operation.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {projectProductionSchedulerDb} from '../js/core/production-role-view-projection.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
const clone=structuredClone;
const base=()=>({...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),branches:[{id:'art_museum',name:'Test'}],students:[{id:'student-1',name:'Test'}],teachers:[{id:'teacher-1',name:'Test'}]});
const lesson={id:'queue-test-lesson',studentId:'student-1',teacherId:'teacher-1',teacherIds:['teacher-1'],date:'2026-10-01',start:'20:00',end:'20:30',branchId:'art_museum',status:'未上課'};
const actor={uid:'scheduler-test-uid',email:'aa0966626336@gmail.com',role:'teacher',active:true,companyId:'danbridge',teacherId:'teacher-aa',canManageSchedule:true};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function fixture(db=base()){
 let server=clone(db),stored=null,ui=null,sequence=0,revision=0,lostOnce=false,gate=null;const calls=[],receipts=new Map(),states=[];
 const storage={load:async()=>clone(stored),save:async value=>{stored=clone(value)}};
 const send=async request=>{calls.push(clone(request));const pause=gate;gate=null;if(pause)await pause.promise;let response=receipts.get(request.requestId);if(!response){const result=buildProductionSchedulerTarget(server,request,actor,{nowIso:'2026-09-03T15:00:00Z'});server=result.db;response={schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash:recordDataHash(server),sourceRecordRevision:++revision,operationCount:result.events.length*2,schedulerDb:projectProductionSchedulerDb(server)};receipts.set(request.requestId,clone(response))}if(lostOnce){lostOnce=false;throw Error('lost reply')}return clone(response)};
 const create=()=>createProductionSchedulerQueue({storage,send,release:'20.26.164',createRequestId:()=>`queue-request-${++sequence}`,onApply:db=>{ui=db},onState:value=>states.push(value)});
 return{create,calls,states,get server(){return clone(server)},get stored(){return clone(stored)},get ui(){return clone(ui)},pause(){gate=defer();return gate},lose(){lostOnce=true}};
}
test('新增送出時馬上刪除：保留刪除意圖，先確認新增再刪，不復活',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});await q.queue({...base(),lessons:[lesson]});const gate=f.pause(),flight=q.flush();await new Promise(r=>setTimeout(r,0));await q.queue(base());gate.resolve();await flight;
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].changes[0].before,null);assert.equal(f.calls[1].changes[0].after,null);assert.equal(f.server.lessons.length,0);assert.equal(f.ui.lessons.length,0);assert.equal(q.diagnostics().dirty,false);
});
test('新增後在送出前立刻刪除：永久佇列合併成零次雲端請求',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});await q.queue({...base(),lessons:[lesson]},{scheduleAction:'lesson.create'});await q.queue(base(),{scheduleAction:'lesson.delete'});await q.flush();
 assert.equal(f.calls.length,0);assert.equal(f.server.lessons.length,0);assert.equal(q.diagnostics().dirty,false);
});
test('永久待送項目保存明確操作命令，但後端線路仍只收到白名單 before/after',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});const moved={...lesson,date:'2026-10-02'};await q.queue({...base(),lessons:[lesson]},{scheduleAction:'lesson.create'});const gate=f.pause(),flight=q.flush();await new Promise(r=>setTimeout(r,0));
 assert.equal(f.stored.pending.commands.length,1);assert.equal(f.stored.pending.commands[0].kind,'lesson.create');assert.equal(Object.hasOwn(f.calls[0],'commands'),false);
 await q.queue({...base(),lessons:[moved]},{scheduleAction:'lesson.move'});gate.resolve();await flight;assert.equal(f.calls.length,2);assert.equal(f.server.lessons[0].date,'2026-10-02');
});
test('拖移 A→B→馬上 A 不被舊快照或先前回條吞掉',async()=>{
 const db={...base(),lessons:[lesson]},f=fixture(db),q=f.create();await q.start({baselineDb:db});await q.queue({...db,lessons:[{...lesson,date:'2026-10-02'}]});const gate=f.pause(),flight=q.flush();await new Promise(r=>setTimeout(r,0));await q.queue(db);assert.equal(await q.acceptSnapshot(db,0),false);gate.resolve();await flight;
 assert.equal(f.calls.length,2);assert.equal(f.server.lessons[0].date,lesson.date);assert.equal(f.ui.lessons[0].date,lesson.date);assert.equal(f.calls[1].changes[0].before.date,'2026-10-02');
});
test('新增→馬上移動→馬上刪除，最後意圖可合併但不倒序',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});await q.queue({...base(),lessons:[lesson]});const gate=f.pause(),flight=q.flush();await new Promise(r=>setTimeout(r,0));await q.queue({...base(),lessons:[{...lesson,date:'2026-10-02'}]});await q.queue(base());gate.resolve();await flight;assert.equal(f.server.lessons.length,0);assert.equal(f.calls.length,2);
});
test('後端成功但回條斷線，重開後沿用同一 requestId，不重複新增',async()=>{
 const f=fixture(),first=f.create();await first.start({baselineDb:base()});await first.queue({...base(),lessons:[lesson]});f.lose();await assert.rejects(first.flush(),/lost reply/);assert.ok(f.stored.pending);first.stop();
 const resumed=f.create();assert.equal((await resumed.start({baselineDb:base()})).restored,true);await resumed.flush();assert.equal(f.calls.length,2);assert.equal(f.calls[0].requestId,f.calls[1].requestId);assert.equal(f.server.lessons.length,1);assert.equal(f.server.changes.length,1);assert.equal(resumed.diagnostics().pending,false);
});

test('舊版日誌只有陣列順序不同時安全正規化，不誤判內容衝突',async()=>{
 const seed=base(),projected=projectProductionSchedulerDb(seed),reversed={...projected,students:[...projected.students].reverse(),teachers:[...projected.teachers].reverse(),lessons:[...projected.lessons].reverse()},saved={schema:'danbridge-production-scheduler-queue-v1',sourceRecordRevision:9,baseline:reversed,desired:reversed,pending:null,actionHint:''},storage={value:clone(saved),async load(){return clone(this.value)},async save(value){this.value=clone(value)}};
 const queue=createProductionSchedulerQueue({storage,send:async()=>{throw new Error('不應送出')},createRequestId:()=> 'scheduler-order-only',release:'20.26.203'}),result=await queue.start({baselineDb:seed,sourceRecordRevision:9});
 assert.equal(result.restored,true);assert.deepEqual(storage.value.baseline,projectProductionSchedulerDb(seed));assert.equal(queue.diagnostics().error,'');
});
test('分批超過 30 筆時，未送出意圖保留，全部確認前不能顯示完成',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});const lessons=Array.from({length:31},(_,i)=>({...lesson,id:`many-${i}`,date:`2026-10-${String(i+1).padStart(2,'0')}`}));await q.queue({...base(),lessons});await q.flush();assert.equal(f.calls.length,2);assert.equal(f.calls[0].changes.length,30);assert.equal(f.calls[1].changes.length,1);assert.equal(f.server.lessons.length,31);assert.equal(f.states.filter(row=>row.state==='complete').length,1);
});
test('三百筆連續意圖依 30 筆固定分批全部送達，批次之間不遺失、不倒序、不提前完成',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});
 const lessons=Array.from({length:300},(_,index)=>({...lesson,id:`capacity-${String(index).padStart(4,'0')}`,date:new Date(Date.UTC(2027,0,1+index)).toISOString().slice(0,10),note:`sequence-${index}`}));
 await q.queue({...base(),lessons},{scheduleAction:'lesson.create'});await q.flush();
 assert.equal(f.calls.length,10);assert.deepEqual(f.calls.map(call=>call.changes.length),Array(10).fill(30));
 assert.equal(f.server.lessons.length,300);assert.equal(new Set(f.server.lessons.map(row=>row.id)).size,300);
 assert.deepEqual(f.server.lessons.map(row=>row.note).sort(),lessons.map(row=>row.note).sort());
 assert.equal(f.states.filter(row=>row.state==='complete').length,1);assert.equal(q.diagnostics().dirty,false);
});
test('staging 會把既有 30 筆待送要求保留成單一批次並完整續傳',async()=>{
 const firstStorage={value:null,async load(){return clone(this.value)},async save(value){this.value=clone(value)}},desired={...base(),lessons:Array.from({length:30},(_,index)=>({...lesson,id:`staging-${index}`}))};
 const first=createProductionSchedulerQueue({storage:firstStorage,send:async()=>{throw new Error('staging 排課交易超過安全範圍')},createRequestId:()=> 'old-thirty-request',release:'20.26.205'});
 await first.start({baselineDb:base(),sourceRecordRevision:1});await first.queue(desired);await assert.rejects(first.flush(),/安全範圍/);await first.stop();
 const sizes=[],server=base();let revision=1,serial=0;
 const recovered=createProductionSchedulerQueue({
  storage:firstStorage,
  maxChangesPerRequest:30,
  createRequestId:()=>`staging-eight-request-${++serial}`,
  release:'20.26.211',
  send:async request=>{
   sizes.push(request.changes.length);
   for(const change of request.changes)server.lessons.push(clone(change.after));
   return{schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash:recordDataHash(server),sourceRecordRevision:++revision,operationCount:request.changes.length*2,schedulerDb:projectProductionSchedulerDb(server)};
  }
 });
 assert.equal((await recovered.start({baselineDb:base(),sourceRecordRevision:1})).pending,true);await recovered.flush();assert.deepEqual(sizes,[30]);assert.equal(server.lessons.length,30);assert.equal(firstStorage.value.rechunkedRequestIds,undefined);
});
test('日誌未存妥或後端回條錯誤，不能宣告成功或清除待送資料',async()=>{
 const broken=createProductionSchedulerQueue({storage:{load:async()=>null,save:async()=>{throw Error('disk full')}},send:()=>{throw Error('must not send')},createRequestId:()=>'',release:'20.26.164'});await assert.rejects(broken.start({baselineDb:base()}),/disk full/);
 let saved;const q=createProductionSchedulerQueue({storage:{load:async()=>null,save:async v=>saved=clone(v)},send:async()=>({schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:'wrong'}),createRequestId:()=>`invalid-request-123`,release:'20.26.164'});await q.start({baselineDb:base()});await q.queue({...base(),lessons:[lesson]});await assert.rejects(q.flush(),/回條驗證失敗/);assert.ok(saved.pending);assert.equal(q.diagnostics().pending,true);
});
test('同步收尾套用遠端快照時又新增操作，必須送妥才宣告完成',async()=>{
 let stored=null,serial=0,revision=1,persistGate=null;const calls=[],states=[];
 const storage={load:async()=>stored,save:async value=>{stored=clone(value);const gate=persistGate;persistGate=null;if(gate)await gate.promise}};
 const sendGate=defer();let sends=0;
 const q=createProductionSchedulerQueue({storage,release:'20.26.164',createRequestId:()=>`tail-race-request-${++serial}`,onState:event=>states.push(event.state),send:async request=>{
  calls.push(clone(request));if(++sends===1)await sendGate.promise;
  const next={...base(),lessons:[request.changes[0].after]};return{schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash:recordDataHash(next),sourceRecordRevision:++revision,operationCount:2,schedulerDb:projectProductionSchedulerDb(next)};
 }});
 await q.start({baselineDb:base(),sourceRecordRevision:1});await q.queue({...base(),lessons:[lesson]});const flight=q.flush();await new Promise(r=>setTimeout(r,0));
 const newer={...base(),lessons:[{...lesson,note:'遠端已確認'}]};await q.acceptSnapshot(newer,3);
 // Pause precisely the persisted acceptance of the buffered version.
 const tailGate=defer();const originalSave=storage.save;storage.save=async value=>{if(value.sourceRecordRevision===3&&!value.pending){persistGate=tailGate;storage.save=originalSave}await originalSave(value)};
 let flightError;flight.catch(error=>{flightError=error});sendGate.resolve();for(let poll=0;stored.sourceRecordRevision!==3&&poll<100;poll++){if(flightError)throw flightError;await new Promise(r=>setTimeout(r,1))}assert.equal(stored.sourceRecordRevision,3);
 const desired={...base(),lessons:[{...newer.lessons[0],date:'2026-10-02'}]};const queued=q.queue(desired);revision=3;tailGate.resolve();await queued;await flight;
 assert.equal(calls.length,2);assert.equal(calls[1].changes[0].after.date,'2026-10-02');assert.equal(q.diagnostics().dirty,false);assert.equal(states.filter(s=>s==='complete').length,1);
});
test('複製分頁不能同時接管同一日誌，原分頁釋放後才可恢復',async()=>{
 const held=new Set();const locks={request:async(name,options,work)=>{if(held.has(name))return work(null);held.add(name);try{return await work({name})}finally{held.delete(name)}}};
 const release=await acquireProductionSchedulerLease(locks,'account-tab');await assert.rejects(acquireProductionSchedulerLease(locks,'account-tab'),/另一分頁/);
 const other=await acquireProductionSchedulerLease(locks,'another-tab');await other();await release();const reopened=await acquireProductionSchedulerLease(locks,'account-tab');await reopened();assert.equal(held.size,0);
});
test('登出後的在途回條只完成日誌，不再覆寫畫面或宣告同步完成',async()=>{
 const f=fixture(),q=f.create();await q.start({baselineDb:base()});await q.queue({...base(),lessons:[lesson]});const gate=f.pause(),flight=q.flush();await new Promise(r=>setTimeout(r,0));let stopped=false;const stop=q.stop().then(()=>stopped=true);assert.equal(stopped,false);gate.resolve();await flight;await stop;
 assert.equal(f.ui.lessons.length,0);assert.equal(f.stored.baseline.lessons.length,1);assert.equal(f.states.filter(s=>s.state==='complete').length,0);
});
test('連續二十次操作合併耐久快照，不把二十次完整序列化排在輸入前面',async()=>{
 let stored=null,saves=0,serial=0;const storage={load:async()=>stored,save:async value=>{saves++;stored=clone(value)}};
 const q=createProductionSchedulerQueue({storage,send:async()=>{throw new Error('此測試不送雲端')},release:'20.26.205',createRequestId:()=>`coalesced-${++serial}`});await q.start({baselineDb:base()});
 const pending=[];for(let index=0;index<20;index++){const next={...base(),lessons:[{...lesson,note:String(index)}]};pending.push(q.queue(next,{scheduleAction:'lesson.update.fields'}))}await Promise.all(pending);
 assert.ok(saves<=3,`預期啟動一次加最多兩次合併保存，實際 ${saves}`);assert.equal(stored.desired.lessons[0].note,'19');assert.equal(q.diagnostics().dirty,true);
});
