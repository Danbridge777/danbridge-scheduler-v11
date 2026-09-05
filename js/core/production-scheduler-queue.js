import {projectProductionSchedulerDb} from './production-role-view-projection.js?v=20.26.230';
import {mergeConcurrentRecordDb} from './cloud-record-three-way-merge.js';
import {SCHEDULER_OPERATION_SCHEMA,SCHEDULER_OPERATION_RESPONSE_SCHEMA,normalizeProductionSchedulerRequest} from './production-scheduler-operation.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assertScheduleCommand,buildScheduleCommand} from './schedule-collaboration-command.js';

const SCHEMA='danbridge-production-scheduler-queue-v1';
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const same=(a,b)=>sha256Canonical(a??null)===sha256Canonical(b??null);
const map=rows=>new Map(rows.map(row=>[row.id,row]));
const normalizedSavedDb=(raw,label)=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`${label}格式無效`);
 const normalized=projectProductionSchedulerDb(raw),keys=Object.keys(normalized).sort();
 if(JSON.stringify(Object.keys(raw).sort())!==JSON.stringify(keys)||keys.some(key=>!Array.isArray(raw[key])))throw new Error(`${label}集合無效`);
 const ordered=Object.fromEntries(keys.map(key=>[key,[...raw[key]].sort((left,right)=>String(left?.id||'').localeCompare(String(right?.id||'')))]));
 if(!same(ordered,normalized))throw new Error(`${label}含非排課欄位`);
 return normalized;
};

// Duplicating a tab also duplicates sessionStorage. Hold one lease for the
// entire journal lifetime, not just individual reads, so two tabs cannot replay
// or overwrite the same pending request independently.
export async function acquireProductionSchedulerLease(locks,key){
 if(!locks?.request||!key)throw new Error('此瀏覽器無法安全鎖定排課日誌');
 let grant,deny,release;const ready=new Promise((resolve,reject)=>{grant=resolve;deny=reject});
 const held=new Promise(resolve=>{release=resolve});
 const finished=locks.request(`danbridge-scheduler-session:${key}`,{ifAvailable:true},async lock=>{
  if(!lock)throw new Error('同一排課工作階段已在另一分頁開啟，未覆寫待同步資料');
  grant();await held;
 }).catch(error=>{deny(error)});
 await ready;return async()=>{release();await finished};
}

// One durable queue per authenticated browser tab. A request is immutable from
// its first send until its exact receipt returns, including across reloads.
export function createProductionSchedulerQueue({storage,send,createRequestId,release,maxChangesPerRequest=30,onApply=()=>{},onState=()=>{}}){
 if(!storage?.load||!storage?.save||typeof send!=='function'||typeof createRequestId!=='function'||!Number.isSafeInteger(maxChangesPerRequest)||maxChangesPerRequest<1||maxChangesPerRequest>30)throw new Error('排課永久佇列設定無效');
 let state=null,persistence=Promise.resolve(),persistenceWorker=null,persistenceRequested=0,persistenceCompleted=0,persistenceUrgent=false,flight=null,buffered=null,stopped=false,lastError='',dirtyHint=false,desiredVersion=0;
 const yieldToInput=()=>new Promise(resolve=>setTimeout(resolve,0));
 // Rapid timetable edits only need the newest durable desired state. Coalesce
 // redundant IndexedDB snapshots and yield once before cloning so input and
 // paint are never queued behind several full scheduler-view serializations.
 const runPersistence=async()=>{
  while(persistenceCompleted<persistenceRequested){const version=persistenceRequested,urgent=persistenceUrgent;persistenceUrgent=false;if(!urgent)await yieldToInput();await storage.save(clone(state));persistenceCompleted=version}
 };
 const persist=({urgent=false}={})=>{persistenceRequested++;if(urgent)persistenceUrgent=true;if(!persistenceWorker){persistenceWorker=runPersistence().finally(()=>{persistenceWorker=null});persistence=persistenceWorker}return persistenceWorker};
 const dirty=()=>Boolean(state&&dirtyHint);
 const status=(name,error='')=>{lastError=error;onState({state:name,pending:Boolean(state?.pending),dirty:Boolean(dirty()),error,sourceRecordRevision:state?.sourceRecordRevision??0})};
 const apply=()=>onApply(clone(state.desired));
 const prepare=()=>{
  const before=map(state.baseline.lessons),after=map(state.desired.lessons),changes=[];let truncated=false;
  for(const id of new Set([...before.keys(),...after.keys()])){const a=before.get(id),b=after.get(id);if(same(a,b))continue;if(changes.length===maxChangesPerRequest){truncated=true;break}const student=b?state.desired.students.find(row=>row.id===b.studentId):null;changes.push({lessonId:id,before:a||null,after:b||null,...(student?{student}:{})})}
  if(!changes.length){dirtyHint=false;return null}
  const requestId=createRequestId(),request=normalizeProductionSchedulerRequest({schema:SCHEDULER_OPERATION_SCHEMA,requestId,release,changes}),createdAt=new Date().toISOString(),commands=changes.map((change,index)=>buildScheduleCommand({before:change.before,after:change.after,deviceId:'scheduler-queue',sequence:index+1,batchId:requestId,commandId:`${requestId}:${index+1}`,actionHint:state.actionHint||'',createdAt})),submitted=clone(state.baseline),submittedLessons=map(submitted.lessons);
  for(const change of changes){if(change.after)submittedLessons.set(change.lessonId,clone(change.after));else submittedLessons.delete(change.lessonId);if(change.student&&!submitted.students.some(row=>row.id===change.student.id))submitted.students.push(clone(change.student))}
  submitted.lessons=[...submittedLessons.values()];return{request,submitted,commands,desiredVersion,completeDesired:!truncated};
 };
 const accept=async(db,sourceRecordRevision)=>{
  if(!state||stopped)throw new Error('排課佇列尚未就緒');
  if(!Number.isSafeInteger(sourceRecordRevision)||sourceRecordRevision<0)throw new Error('排課視圖缺少有效版本');
  if(sourceRecordRevision<state.sourceRecordRevision)return false;
  const incoming=projectProductionSchedulerDb(db);
  if(state.pending||dirty()){if(!buffered||sourceRecordRevision>=buffered.sourceRecordRevision)buffered={db:incoming,sourceRecordRevision};return false}
  if(sourceRecordRevision===state.sourceRecordRevision&&!same(incoming,state.baseline))throw new Error('排課視圖同版本內容不一致');
  state.baseline=clone(incoming);state.desired=clone(incoming);state.sourceRecordRevision=sourceRecordRevision;dirtyHint=false;await persist();apply();status('ready');return true;
 };
 return{
  async start({baselineDb,sourceRecordRevision=0}){
   if(state)throw new Error('排課佇列已啟動');const saved=await storage.load();
   if(saved){if(saved.schema!==SCHEMA||!Number.isSafeInteger(saved.sourceRecordRevision)||saved.sourceRecordRevision<0)throw new Error('排課復原日誌無效，未覆蓋原資料');saved.baseline=normalizedSavedDb(saved.baseline,'排課復原基準');saved.desired=normalizedSavedDb(saved.desired,'排課復原內容');desiredVersion=Number.isSafeInteger(saved.desiredVersion)&&saved.desiredVersion>=0?saved.desiredVersion:0;saved.desiredVersion=desiredVersion;if(saved.pending){const pendingRequest=normalizeProductionSchedulerRequest(saved.pending.request);saved.pending.submitted=normalizedSavedDb(saved.pending.submitted,'排課待送快照');if(saved.pending.commands)for(const command of saved.pending.commands)assertScheduleCommand(command);if(pendingRequest.changes.length>maxChangesPerRequest){saved.rechunkedRequestIds=[...(Array.isArray(saved.rechunkedRequestIds)?saved.rechunkedRequestIds:[]),pendingRequest.requestId].slice(-30);saved.pending=null}}state=clone(saved);dirtyHint=Boolean(state.pending)||!same(state.baseline.lessons,state.desired.lessons);await persist()}
   else{const baseline=projectProductionSchedulerDb(baselineDb);state={schema:SCHEMA,sourceRecordRevision,baseline,desired:clone(baseline),pending:null,actionHint:'',desiredVersion};await persist()}
   apply();status(state.pending||dirty()?'pending':'ready');return{restored:Boolean(saved),pending:Boolean(state.pending)||Boolean(dirty())};
  },
  queue(db,{scheduleAction}={}){if(!state||stopped)throw new Error('排課佇列尚未就緒');state.desired=projectProductionSchedulerDb(db);state.actionHint=typeof scheduleAction==='string'?scheduleAction:'';state.desiredVersion=++desiredVersion;dirtyHint=true;status('pending');return persist()},
  acceptSnapshot:accept,
  flush(){
   if(flight)return flight;if(!state||stopped)return Promise.reject(new Error('排課佇列尚未就緒'));
   flight=(async()=>{
    await persistence;
    while(!stopped){
     if(!state.pending){state.pending=prepare();if(!state.pending){
      if(buffered){const incoming=buffered;buffered=null;await accept(incoming.db,incoming.sourceRecordRevision);continue}
      break;
     }await persist({urgent:true})}
     const pending=clone(state.pending);status('sending');
     const response=await send(clone(pending.request));
     if(response?.schema!==SCHEDULER_OPERATION_RESPONSE_SCHEMA||response.requestId!==pending.request.requestId||response.state!=='committed'||!/^record-v1:[a-f0-9]{64}$/.test(response.sourceHash||'')||!Number.isSafeInteger(response.sourceRecordRevision)||response.sourceRecordRevision<state.sourceRecordRevision||!Number.isSafeInteger(response.operationCount)||response.operationCount<0||!same(response.schedulerDb,projectProductionSchedulerDb(response.schedulerDb)))throw new Error('排課後端回條驗證失敗，保留待送操作');
     // The validated committed receipt is the authoritative cloud boundary.
     // Surface it before IndexedDB housekeeping only when this request covers
     // the latest complete desired state; later edits and split batches remain
     // pending, while the durable journal is still finalized below.
     if(!stopped&&pending.completeDesired===true&&pending.desiredVersion===desiredVersion&&!buffered)status('confirmed');
     const rebased=mergeConcurrentRecordDb(pending.submitted,state.desired,response.schedulerDb);
     if(rebased.conflicts.length)throw new Error('排課連續操作發現衝突，保留日誌等待核對');
     state.baseline=clone(response.schedulerDb);state.desired=projectProductionSchedulerDb(rebased.db);state.sourceRecordRevision=response.sourceRecordRevision;state.pending=null;state.actionHint='';dirtyHint=!same(state.baseline.lessons,state.desired.lessons);
     await persist();if(!stopped)apply();
    }
    if(stopped)return{state:'stopped'};
    status('complete');return{state:'complete',sourceRecordRevision:state.sourceRecordRevision};
   })().catch(error=>{status('blocked',String(error?.message||error));throw error}).finally(()=>{flight=null});
   return flight;
  },
  stop(){stopped=true;status('stopped');return (flight||persistence).catch(()=>{})},
  diagnostics:()=>({ready:Boolean(state),inFlight:Boolean(flight),pending:Boolean(state?.pending),dirty:Boolean(dirty()),sourceRecordRevision:state?.sourceRecordRevision??0,error:lastError,commandCount:state?.pending?.commands?.length||0,commandKinds:[...new Set((state?.pending?.commands||[]).map(command=>command.kind))]})
 };
}
