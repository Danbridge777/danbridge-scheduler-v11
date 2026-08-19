import {rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {mergeConcurrentRecordDb} from './cloud-record-three-way-merge.js';
import {runActiveRecordSync} from './cloud-active-record-runtime.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=128&&!value.includes('/');

export function createActiveRecordPageController({
 environment='staging',role,deviceId,journal,readDocuments,send,persistConflicts,getLocalDb,applyCloudDb,ensureCloudBackup=async()=>true,publishRoleViews=async()=>{},onStatus=()=>{},
 setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=timer=>clearTimeout(timer),saveDelay=120,maxOperations=1000,maxRebases=5
}={}){
 if(environment!=='staging'||role!=='owner'||!token(deviceId)||!journal||typeof journal.list!=='function'||typeof journal.counts!=='function'||typeof readDocuments!=='function'||typeof send!=='function'||typeof persistConflicts!=='function'||typeof getLocalDb!=='function'||typeof applyCloudDb!=='function'||typeof ensureCloudBackup!=='function'||typeof publishRoleViews!=='function'||typeof onStatus!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||!Number.isSafeInteger(saveDelay)||saveDelay<0||!Number.isSafeInteger(maxOperations)||maxOperations<1||!Number.isSafeInteger(maxRebases)||maxRebases<0)throw new Error('日常逐筆頁面控制器設定無效');
 let activationEpoch='',writeAllowed=false,baselineDb=null,latestCloudDb=null,dirty=false,queued=false,inFlight=false,retryPending=false,stopped=false,timer=null,mutationVersion=0,nextSequence=0,lastState='idle',lastError='',lastCounts=null;
 const status=payload=>{lastState=payload.state||lastState;lastError=payload.error||'';lastCounts=payload.counts||lastCounts;try{onStatus({...payload,dirty,queued,inFlight,writeAllowed,activationEpoch})}catch{}}
 const schedule=delay=>{if(stopped||timer!==null)return;timer=setTimer(()=>{timer=null;flush().catch(error=>status({state:'blocked',error:String(error?.message||error)}))},delay)};
 const loadSequence=async()=>{if(nextSequence>0)return nextSequence;let highest=0;for(const row of await journal.list()){const id=String(row?.operationId||''),prefix=`${deviceId}:`;if(!id.startsWith(prefix))continue;const sequence=Number(id.slice(prefix.length));if(Number.isSafeInteger(sequence)&&sequence>highest)highest=sequence}nextSequence=highest+1;return nextSequence};
 const savePostSyncConflicts=async(conflicts,base,target)=>{if(!conflicts.length)return null;const backup=await persistConflicts(clone(conflicts),{environment,activationEpoch,deviceId,baseHash:recordDataHash(base),targetHash:recordDataHash(target)});if(!backup)throw new Error('同步完成後的同筆衝突備份未完成');return backup};
 const apply=async db=>{await applyCloudDb(clone(db))};
 async function acceptCloudSnapshot(snapshot){
  if(stopped)return{state:'stopped'};if(!snapshot||(activationEpoch&&snapshot.activationEpoch!==activationEpoch)||!token(snapshot.activationEpoch)||!snapshot.db)throw new Error('逐筆串流快照 identity 無效');activationEpoch=snapshot.activationEpoch;writeAllowed=snapshot.writeAllowed===true;latestCloudDb=clone(snapshot.db);if(!baselineDb)baselineDb=clone(latestCloudDb);
  if(!dirty&&!inFlight){baselineDb=clone(latestCloudDb);await apply(latestCloudDb);status({state:writeAllowed?'ready':'paused',hash:snapshot.hash||recordDataHash(latestCloudDb)})}else status({state:writeAllowed?'remote-buffered':'paused',hash:snapshot.hash||recordDataHash(latestCloudDb)});
  if(writeAllowed&&queued)schedule(0);return{state:lastState,writeAllowed,dirty};
 }
 function setWriteAllowed(value){writeAllowed=value===true;if(!writeAllowed){if(timer!==null){clearTimer(timer);timer=null}status({state:'paused'})}else{status({state:'ready'});if(queued)schedule(0)}return writeAllowed}
 function queueLocalSave(){if(stopped)return{state:'stopped'};mutationVersion++;dirty=true;queued=true;status({state:writeAllowed?'queued':'paused'});if(writeAllowed)schedule(saveDelay);return{state:lastState,mutationVersion}}
 async function resume(){if(stopped)return{state:'stopped'};const counts=await journal.counts(),outstanding=counts.pending+counts.sending+counts.failed+counts.quarantined;if(outstanding||dirty||retryPending){queued=counts.quarantined===0;dirty=true;if(writeAllowed&&queued)schedule(0)}status({state:counts.quarantined?'blocked':queued?'queued':writeAllowed?'ready':'paused',counts});return{state:lastState,counts}}
 async function flush(){
  if(stopped)return{state:'stopped'};if(inFlight)return{state:'busy'};if(!queued){const counts=await journal.counts();if(!(counts.pending+counts.sending+counts.failed)&&!retryPending)return{state:lastState,counts};queued=true;dirty=true}if(!activationEpoch||!baselineDb||!latestCloudDb){status({state:'waiting-for-stream'});return{state:lastState}}if(!writeAllowed){status({state:'paused'});return{state:'paused'}}
  inFlight=true;queued=false;retryPending=false;const startedVersion=mutationVersion,base=clone(baselineDb),local=clone(getLocalDb());status({state:'backing-up'});
  try{
   if(await ensureCloudBackup(clone(base))!==true)throw new Error('逐筆寫入前的雲端分片備份尚未完成');status({state:'syncing'});
   const result=await runActiveRecordSync({journal,readDocuments,send,persistConflicts,baselineDb:base,localDb:local,environment,deviceId,activationEpoch,startSequence:await loadSequence(),maxOperations,maxRebases,onProgress:progress=>status({state:progress.kind,counts:progress.counts})});nextSequence=Math.max(nextSequence,result.nextSequence||nextSequence);
   if(result.state!=='complete'){
    dirty=true;const counts=result.worker?.counts||await journal.counts();lastCounts=counts;if(result.state==='waiting'){queued=true;const retryAt=Number(result.worker?.head?.nextRetryAt)||Date.now()+1000;schedule(Math.max(0,retryAt-Date.now()))}status({state:result.state,error:result.reason||result.worker?.head?.lastError||'',counts});return{...result,dirty:true};
   }
   const documents=await readDocuments(),readback=rebuildFullRecordShadowDb(documents,{environment}),currentLocal=clone(getLocalDb()),merged=mergeConcurrentRecordDb(base,currentLocal,readback.db);await savePostSyncConflicts(merged.conflicts,readback.db,merged.db);baselineDb=clone(readback.db);latestCloudDb=clone(readback.db);await apply(merged.db);
   const cloudHash=recordDataHash(readback.db),desiredHash=recordDataHash(merged.db),newerMutation=mutationVersion!==startedVersion;dirty=newerMutation||desiredHash!==cloudHash;queued=dirty;await publishRoleViews(clone(readback.db));const counts=await journal.counts();status({state:dirty?'queued':'complete',hash:cloudHash,counts,rebases:result.rebases});return{...result,state:dirty?'pending':'complete',readbackHash:cloudHash,readbackDb:clone(readback.db),desiredHash,dirty,counts};
  }catch(error){dirty=true;queued=false;retryPending=true;status({state:'blocked',error:String(error?.message||error)});return{state:'blocked',error,dirty:true,retryPending:true}}
  finally{inFlight=false;if(queued&&writeAllowed)schedule(0)}
 }
 function stop(){stopped=true;if(timer!==null){clearTimer(timer);timer=null}queued=false;status({state:'stopped'})}
 return{enabled:true,acceptCloudSnapshot,setWriteAllowed,queueLocalSave,resume,flush,stop,diagnostics:()=>({environment,role,deviceId,activationEpoch,writeAllowed,dirty,queued,inFlight,retryPending,state:lastState,error:lastError,nextSequence,counts:lastCounts,hasBaseline:Boolean(baselineDb),hasCloud:Boolean(latestCloudDb)})};
}
