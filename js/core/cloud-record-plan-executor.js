import {prepareActiveRecordSync,canonicalizeActiveRecordPlanHeads} from './cloud-active-record-sync.js';

export const RECORD_PLAN_WORKER_PROTOCOL='danbridge-record-plan-worker-v1';
let sequence=0;
let idlePlanner=null;
export async function prepareCanonicalRecordPlan(options){
 const plan=prepareActiveRecordSync(options);
 return options.environment==='production'?canonicalizeActiveRecordPlanHeads(plan,options.documentsByCollection):plan;
}

// Pure planning only: this worker never receives Auth, Firestore or journal
// capabilities. The caller still durably enqueues and verifies every receipt.
export async function prepareRecordPlanOffThread(options,{WorkerClass=globalThis.Worker,timeoutMs=10000,reuseWorker=false,idleTimeoutMs=30000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Invalid record planner timeout');
 if(typeof reuseWorker!=='boolean'||!Number.isSafeInteger(idleTimeoutMs)||idleTimeoutMs<1||idleTimeoutMs>60000)throw Error('Invalid idle record planner configuration');
 // Capture the entire graph once: shared verified-baseline references must
 // survive together, and later UI edits must not enter this command.
 const input=structuredClone({...options,createdAt:options.createdAt||new Date().toISOString()});
 if(typeof WorkerClass!=='function')return prepareCanonicalRecordPlan(input);
 let worker;
 // Reuse at most ONE idle pure planner. Busy calls get their own worker and
 // capture their own immutable input; no command waits behind another here.
 // No Auth, business data, plan or request identity is retained in this slot.
 if(reuseWorker&&idlePlanner?.WorkerClass===WorkerClass){const slot=idlePlanner;idlePlanner=null;clearTimeout(slot.timer);worker=slot.worker}
 try{worker??=new WorkerClass(new URL('../generated/record-plan.worker.js?v=20.26.312',import.meta.url),{type:'module',name:'danbridge-record-plan'})}
 catch{return prepareCanonicalRecordPlan(input)}
 const requestId=++sequence;
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,value,retire=false)=>{
   if(settled)return;settled=true;clearTimeout(timer);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
   if(reuseWorker&&!error&&!retire&&!idlePlanner){
    const slot={worker,WorkerClass,timer:null};
    const dispose=()=>{if(idlePlanner!==slot)return;idlePlanner=null;clearTimeout(slot.timer);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate()};
    slot.timer=setTimeout(dispose,idleTimeoutMs);slot.timer?.unref?.();
    worker.onerror=event=>{event?.preventDefault?.();dispose()};worker.onmessageerror=dispose;idlePlanner=slot;
   }else worker.terminate();
   if(error)reject(error);else resolve(value);
  };
  // Worker availability must not remove existing browser functionality. A
  // terminated pure planner has no writes to duplicate when falling back.
  const unavailable=()=>{if(settled)return;finish(null,Promise.resolve().then(()=>prepareCanonicalRecordPlan(input)),true)};
  const timer=setTimeout(unavailable,timeoutMs);
  worker.onerror=event=>{event?.preventDefault?.();unavailable()};
  worker.onmessageerror=()=>finish(Error('背景規劃回應無法讀取，操作未送出'));
  worker.onmessage=({data})=>{
   if(data?.protocol!==RECORD_PLAN_WORKER_PROTOCOL||data.requestId!==requestId||typeof data.ok!=='boolean')return finish(Error('背景規劃回應識別不符，操作未送出'));
   if(!data.ok)return finish(Error(String(data.error||'背景規劃失敗，操作未送出')));
   const plan=data.plan;
   if(plan?.schema!=='danbridge-active-record-plan-v1'||plan.environment!==input.environment||plan.deviceId!==input.deviceId||plan.activationEpoch!==input.activationEpoch||plan.startSequence!==(input.startSequence??1)||!Array.isArray(plan.operations)||plan.operationCount!==plan.operations.length)return finish(Error('背景規劃結果識別不符，操作未送出'));
   finish(null,plan);
  };
  try{worker.postMessage({protocol:RECORD_PLAN_WORKER_PROTOCOL,requestId,options:input})}catch{unavailable()}
 });
}
