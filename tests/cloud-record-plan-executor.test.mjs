import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCanonicalRecordPlan,prepareRecordPlanOffThread,RECORD_PLAN_WORKER_PROTOCOL} from '../js/core/cloud-record-plan-executor.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const input=()=>({documentsByCollection:empty(),baselineDb:empty(),localDb:{...empty(),lessons:[{id:'lesson-1',room:'A'}]},environment:'production',deviceId:'worker-test',activationEpoch:'epoch-test-123',createdAt:'2026-09-11T00:00:00.000Z'});
test('unavailable worker uses exactly the existing canonical plan',async()=>{
 const value=input(),expected=await prepareCanonicalRecordPlan(value);
 assert.deepEqual(await prepareRecordPlanOffThread(value,{WorkerClass:null}),expected);
 class Blocked{constructor(){throw Error('CSP')}}
 assert.deepEqual(await prepareRecordPlanOffThread(value,{WorkerClass:Blocked}),expected);
});
test('worker lifecycle is bounded and freezes the command before later edits',async()=>{
 const value=input();let worker;
 class Fake{constructor(url,options){worker=this;assert.equal(options.type,'module');assert.match(String(url),/generated\/record-plan\.worker\.js/)}postMessage(message){this.input=structuredClone(message)}terminate(){this.terminated=true}}
 const result=prepareRecordPlanOffThread(value,{WorkerClass:Fake});value.localDb.lessons[0].room='B';
 const captured=worker.input,plan=await prepareCanonicalRecordPlan(captured.options);
 worker.onmessage({data:{protocol:RECORD_PLAN_WORKER_PROTOCOL,requestId:captured.requestId,ok:true,plan}});
 assert.equal((await result).db.lessons[0].room,'A');assert.equal(worker.terminated,true);assert.equal(worker.onmessage,null);
});
test('foreign worker replies and planner validation errors never return a plan',async()=>{
 for(const response of [m=>({protocol:'old',requestId:m.requestId,ok:true}),m=>({protocol:m.protocol,requestId:m.requestId+1,ok:true}),m=>({protocol:m.protocol,requestId:m.requestId,ok:false,error:'revision invalid'}),m=>({protocol:m.protocol,requestId:m.requestId,ok:true,plan:{schema:'wrong'}})]){
  let worker;class Fake{constructor(){worker=this}postMessage(m){queueMicrotask(()=>this.onmessage({data:response(m)}))}terminate(){this.terminated=true}}
  await assert.rejects(prepareRecordPlanOffThread(input(),{WorkerClass:Fake}));assert.equal(worker.terminated,true);
 }
});
test('load failure and timeout terminate pure worker before fallback, without losing original data',async()=>{
 for(const fail of ['error','timeout','post']){
  let worker;class Fake{constructor(){worker=this}postMessage(){if(fail==='post')throw Error('clone');if(fail==='error')queueMicrotask(()=>this.onerror({preventDefault(){}}))}terminate(){this.terminated=true}}
  const plan=await prepareRecordPlanOffThread(input(),{WorkerClass:Fake,timeoutMs:5});assert.equal(plan.operationCount,1);assert.equal(worker.terminated,true);
 }
});

test('idle planner reuse preserves fresh identity and input, retires after inactivity',async()=>{
 const instances=[];
 class Fake{constructor(){instances.push(this)}postMessage(message){this.message=message;queueMicrotask(async()=>this.onmessage({data:{protocol:message.protocol,requestId:message.requestId,ok:true,plan:await prepareCanonicalRecordPlan(message.options)}}))}terminate(){this.terminated=true}}
 const settings={WorkerClass:Fake,reuseWorker:true,idleTimeoutMs:20};
 const first=input(),a=await prepareRecordPlanOffThread(first,settings),firstId=instances[0].message.requestId;
 const second=input();second.deviceId='other-account-device';second.activationEpoch='other-epoch-123';second.localDb.lessons[0].room='B';
 const pending=prepareRecordPlanOffThread(second,settings);second.localDb.lessons[0].room='C';const b=await pending;
 assert.equal(instances.length,1);assert.equal(a.db.lessons[0].room,'A');assert.equal(b.db.lessons[0].room,'B');assert.equal(b.deviceId,'other-account-device');assert.equal(b.activationEpoch,'other-epoch-123');assert.notEqual(instances[0].message.requestId,firstId);
 await new Promise(resolve=>setTimeout(resolve,35));assert.equal(instances[0].terminated,true);
});

test('busy planners stay independent and stale replies destroy a reused planner',async()=>{
 const instances=[];class Fake{constructor(){instances.push(this)}postMessage(message){this.message=message}terminate(){this.terminated=true}}
 const settings={WorkerClass:Fake,reuseWorker:true,idleTimeoutMs:20};
 const first=prepareRecordPlanOffThread(input(),settings),second=prepareRecordPlanOffThread({...input(),deviceId:'second'},settings);
 assert.equal(instances.length,2);
 const reply=async worker=>{const message=worker.message;worker.onmessage({data:{protocol:message.protocol,requestId:message.requestId,ok:true,plan:await prepareCanonicalRecordPlan(message.options)}})};
 await reply(instances[1]);assert.equal((await second).deviceId,'second');await reply(instances[0]);await first;assert.equal(instances[0].terminated,true);
 const old=instances[1].message,next=prepareRecordPlanOffThread(input(),settings);
 instances[1].onmessage({data:{protocol:old.protocol,requestId:old.requestId,ok:true,plan:await prepareCanonicalRecordPlan(old.options)}});
 await assert.rejects(next,/識別不符/);assert.equal(instances[1].terminated,true);
});
