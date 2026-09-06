import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {mergeConcurrentRecordDb} from './cloud-record-three-way-merge.js';
import {runActiveRecordSync} from './cloud-active-record-runtime.js?v=20.26.250';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=128&&!value.includes('/');

export function createActiveRecordPageController({
 environment='staging',role,deviceId,journal,readDocuments,send,sendBatch=null,persistConflicts,getLocalDb,applyCloudDb,ensureCloudBackup=async()=>true,publishRoleViews=async()=>{},onStatus=()=>{},
 setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=timer=>clearTimeout(timer),sleep=delay=>new Promise(resolve=>setTimeout(resolve,delay)),saveDelay=120,maxOperations=1000,maxRebases=5,convergenceTimeoutMs=20000,strictConvergence=false,trustCommittedPlan=false
}={}){
 if(!['staging','production'].includes(environment)||role!=='owner'||!token(deviceId)||!journal||typeof journal.list!=='function'||typeof journal.counts!=='function'||typeof readDocuments!=='function'||typeof send!=='function'||(sendBatch!==null&&typeof sendBatch!=='function')||typeof persistConflicts!=='function'||typeof getLocalDb!=='function'||typeof applyCloudDb!=='function'||typeof ensureCloudBackup!=='function'||typeof publishRoleViews!=='function'||typeof onStatus!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||typeof sleep!=='function'||!Number.isSafeInteger(saveDelay)||saveDelay<0||!Number.isSafeInteger(maxOperations)||maxOperations<1||!Number.isSafeInteger(maxRebases)||maxRebases<0||!Number.isSafeInteger(convergenceTimeoutMs)||convergenceTimeoutMs<1000||typeof strictConvergence!=='boolean'||typeof trustCommittedPlan!=='boolean')throw new Error('日常逐筆頁面控制器設定無效');
 let activationEpoch='',writeAllowed=false,baselineDb=null,baselineHash='',latestCloudDb=null,trustedDocuments=null,trustedRemote=null,acceptedSnapshotVersion=0,dirty=false,queued=false,inFlight=false,retryPending=false,stopped=false,timer=null,mutationVersion=0,nextSequence=0,lastState='idle',lastError='',lastCounts=null,pendingCollections=null;
 const committedRecords=new Map();
 const remember=operations=>{for(const operation of operations){const key=`${operation.collection}/${operation.recordId}`,old=committedRecords.get(key);if(!old||old.revision<operation.nextRevision){const saved={collection:operation.collection,id:operation.recordId,revision:operation.nextRevision,data:clone(operation.payload)};committedRecords.set(key,saved);if(trustedDocuments){const rows=trustedDocuments[saved.collection]??(trustedDocuments[saved.collection]=[]),index=rows.findIndex(row=>row.id===saved.id),row={id:saved.id,data:clone(saved.data)};if(index<0)rows.push(row);else rows[index]=row}}}};
 async function readConfirmedDocuments({force=false,preferCache=false}={}){
  const documents=trustCommittedPlan&&trustedDocuments&&preferCache&&!force?clone(trustedDocuments):await readDocuments();if(trustCommittedPlan)trustedDocuments=clone(documents);if(!trustCommittedPlan||!committedRecords.size)return documents;
  const result=clone(documents);
  // A verified transaction receipt is newer than a lagging listener. Overlay
  // only that exact committed revision; a newer server revision always wins.
  for(const saved of committedRecords.values()){
   const rows=result[saved.collection]??(result[saved.collection]=[]),index=rows.findIndex(row=>row.id===saved.id),current=index<0?null:rows[index].data;
   if(!current||current.revision<saved.revision){const row={id:saved.id,data:clone(saved.data)};if(index<0)rows.push(row);else rows[index]=row}
  }
  trustedDocuments=clone(result);return result;
 }
 const sendWithReceipt=async operation=>{
  const receipt=await send(operation);
  if(trustCommittedPlan&&receipt?.revision===operation.nextRevision&&((receipt.kind==='duplicate'&&receipt.write===false)||(['create','update','tombstone','revive'].includes(receipt.kind)&&receipt.write===true)))remember([operation]);
  return receipt;
 };
 if(sendBatch)sendWithReceipt.batch=async operations=>{const receipt=await sendBatch(operations);if(trustCommittedPlan&&receipt?.operationCount===operations.length&&receipt?.targetHash===operations.at(-1)?.targetHash&&((receipt.kind==='batch'&&receipt.write===true)||(receipt.kind==='duplicate-batch'&&receipt.write===false)))remember(operations);return receipt};
 function acceptCommittedBatch(batch,receipt){
  if(!trustCommittedPlan||!batch||batch.activationEpoch!==activationEpoch||!Array.isArray(batch.operations)||!batch.operations.length||!((receipt?.kind==='batch'&&receipt.write===true)||(receipt?.kind==='duplicate-batch'&&receipt.write===false))||receipt.operationCount!==batch.operations.length||receipt.targetHash!==batch.operations.at(-1).targetHash||batch.operations.some(operation=>operation.environment!==environment||operation.activationEpoch!==activationEpoch||!FULL_RECORD_COLLECTIONS.includes(operation.collection)||operation.payload?.recordId!==operation.recordId||operation.payload?.revision!==operation.nextRevision))throw new Error('批次已提交回條格式無效');
  remember(batch.operations);
 }
 const status=payload=>{lastState=payload.state||lastState;lastError=payload.error||'';lastCounts=payload.counts||lastCounts;try{onStatus({...payload,dirty,queued,inFlight,writeAllowed,activationEpoch})}catch{}}
 const schedule=delay=>{if(stopped||timer!==null)return;timer=setTimer(()=>{timer=null;flush().catch(error=>status({state:'blocked',error:String(error?.message||error)}))},delay)};
 const loadSequence=async()=>{if(nextSequence>0)return nextSequence;let highest=0;for(const row of await journal.list()){const id=String(row?.operationId||''),prefix=`${deviceId}:`;if(!id.startsWith(prefix))continue;const sequence=Number(id.slice(prefix.length));if(Number.isSafeInteger(sequence)&&sequence>highest)highest=sequence}nextSequence=highest+1;return nextSequence};
 const savePostSyncConflicts=async(conflicts,base,target)=>{if(!conflicts.length)return null;const backup=await persistConflicts(clone(conflicts),{environment,activationEpoch,deviceId,baseHash:recordDataHash(base),targetHash:recordDataHash(target)});if(!backup)throw new Error('同步完成後的同筆衝突備份未完成');return backup};
 const apply=async db=>{await applyCloudDb(clone(db))};
 async function acceptCloudSnapshot(snapshot){
  if(stopped)return{state:'stopped'};if(!snapshot||(activationEpoch&&snapshot.activationEpoch!==activationEpoch)||!token(snapshot.activationEpoch)||!snapshot.db)throw new Error('逐筆串流快照 identity 無效');activationEpoch=snapshot.activationEpoch;writeAllowed=snapshot.writeAllowed===true;
  if(trustCommittedPlan&&snapshot.revisions&&[...committedRecords.values()].some(saved=>(snapshot.revisions[saved.collection]?.[saved.id]||0)<saved.revision)){status({state:writeAllowed?'remote-buffered':'paused'});return{state:lastState,writeAllowed,dirty,accepted:false}}
  latestCloudDb=clone(snapshot.db);let trustedSnapshot=null;const adoptTrustedSnapshot=!baselineDb||!dirty&&!inFlight;if(trustCommittedPlan&&snapshot.documents&&adoptTrustedSnapshot){trustedDocuments=clone(snapshot.documents);const materialized=Number.isSafeInteger(snapshot.documentCount)&&Number.isSafeInteger(snapshot.activeCount)&&Number.isSafeInteger(snapshot.tombstoneCount)&&snapshot.revisions?snapshot:rebuildFullRecordShadowDb(trustedDocuments,{environment});trustedSnapshot={documentCount:materialized.documentCount,activeCount:materialized.activeCount,tombstoneCount:materialized.tombstoneCount,revisions:clone(materialized.revisions)}}acceptedSnapshotVersion++;if(!baselineDb){baselineDb=clone(latestCloudDb);baselineHash=snapshot.hash||recordDataHash(baselineDb);if(trustedSnapshot)trustedRemote={...trustedSnapshot,db:baselineDb,hash:baselineHash}}
  if(!dirty&&!inFlight){baselineDb=clone(latestCloudDb);baselineHash=snapshot.hash||recordDataHash(baselineDb);if(trustedSnapshot)trustedRemote={...trustedSnapshot,db:baselineDb,hash:baselineHash};await apply(latestCloudDb);status({state:writeAllowed?'ready':'paused',hash:baselineHash})}else status({state:writeAllowed?'remote-buffered':'paused',hash:snapshot.hash||recordDataHash(latestCloudDb)});
  if(writeAllowed&&queued)schedule(0);return{state:lastState,writeAllowed,dirty};
 }
 function setWriteAllowed(value){writeAllowed=value===true;if(!writeAllowed){if(timer!==null){clearTimer(timer);timer=null}status({state:'paused'})}else{status({state:'ready'});if(queued)schedule(0)}return writeAllowed}
 function queueLocalSave({changedCollections=null}={}){if(stopped)return{state:'stopped'};if(changedCollections!==null){if(!Array.isArray(changedCollections)||!changedCollections.length||changedCollections.some(collection=>!FULL_RECORD_COLLECTIONS.includes(collection)))throw new Error('逐筆頁面異動集合範圍無效');pendingCollections=new Set([...(pendingCollections||[]),...changedCollections])}else pendingCollections=null;mutationVersion++;dirty=true;queued=true;status({state:writeAllowed?'queued':'paused'});if(writeAllowed){if(timer!==null&&!inFlight){clearTimer(timer);timer=null}schedule(saveDelay)}return{state:lastState,mutationVersion}}
 async function readConvergedAuthority(expectedHash,startedSnapshotVersion){
  const startedAt=Date.now();let latestVerified=null;
  while(true){
   const documents=await readDocuments(),rebuilt=rebuildFullRecordShadowDb(documents,{environment}),hash=recordDataHash(rebuilt.db);
   if(!expectedHash||hash===expectedHash)return rebuilt;
   if(!strictConvergence)return rebuilt;
   if(acceptedSnapshotVersion>startedSnapshotVersion&&latestCloudDb){const candidateHash=recordDataHash(latestCloudDb);latestVerified={...rebuilt,db:clone(latestCloudDb),hash:candidateHash}}
   if(Date.now()-startedAt>=convergenceTimeoutMs){if(latestVerified)return latestVerified;throw new Error('逐筆核心已確認，但權威串流在期限內尚未收斂')}
   status({state:'waiting-for-stream',hash,expectedHash});await sleep(50);
  }
 }
 async function resume(){if(stopped)return{state:'stopped'};if(environment==='staging'&&typeof journal.retryIdentityBlockedOnce==='function')await journal.retryIdentityBlockedOnce();if(environment==='production'&&typeof journal.retryProductionTrustedBatchFormatOnce==='function')await journal.retryProductionTrustedBatchFormatOnce();const counts=await journal.counts(),outstanding=counts.pending+counts.sending+counts.failed+counts.quarantined;if(outstanding||dirty||retryPending){queued=counts.quarantined===0;dirty=true;if(writeAllowed&&queued)schedule(0)}status({state:counts.quarantined?'blocked':queued?'queued':writeAllowed?'ready':'paused',counts});return{state:lastState,counts}}
 async function flush(){
  if(stopped)return{state:'stopped'};if(inFlight)return{state:'busy'};if(!queued){const counts=await journal.counts();if(!(counts.pending+counts.sending+counts.failed)&&!retryPending)return{state:lastState,counts};queued=true;dirty=true}if(!activationEpoch||!baselineDb||!latestCloudDb){status({state:'waiting-for-stream'});return{state:lastState}}if(!writeAllowed){status({state:'paused'});return{state:'paused'}}
  inFlight=true;queued=false;retryPending=false;const startedVersion=mutationVersion,startedSnapshotVersion=acceptedSnapshotVersion,scope=pendingCollections?[...pendingCollections]:null;pendingCollections=null;const base=scope?baselineDb:clone(baselineDb),currentLocal=getLocalDb();
  // Calendar commands prepend at most 30 immutable change rows. Once the
  // existing tail is byte-for-byte equal to the already verified baseline,
  // retain those authority references and plan only the new prefix. This keeps
  // the append-only proof while avoiding thousands of historical record-ID
  // hashes on every batch gesture.
  let appendOnlyChangesCount=0;
  if(trustCommittedPlan&&scope?.includes('changes')){
   const before=base?.changes,after=currentLocal?.changes,added=Array.isArray(before)&&Array.isArray(after)?after.length-before.length:0;
   if(Number.isSafeInteger(added)&&added>0&&added<=30&&JSON.stringify(after.slice(added))===JSON.stringify(before))appendOnlyChangesCount=added;
  }
  const local=scope?Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>{
   if(!scope.includes(collection))return[collection,base?.[collection]||[]];
   if(collection==='changes'&&appendOnlyChangesCount)return[collection,[...clone(currentLocal.changes.slice(0,appendOnlyChangesCount)),...base.changes]];
   return[collection,clone(currentLocal?.[collection]||[])];
  })):clone(currentLocal);status({state:'backing-up'});
  try{
   // `base` is already detached by the clone above; avoid copying the full database twice.
   if(await ensureCloudBackup(base)!==true)throw new Error('逐筆寫入前的雲端分片備份尚未完成');status({state:'syncing'});
   const verified=trustCommittedPlan&&trustedRemote&&trustedRemote.db===base&&trustedRemote.hash===baselineHash?trustedRemote:null;
   const result=await runActiveRecordSync({journal,readDocuments:readConfirmedDocuments,send:sendWithReceipt,persistConflicts,baselineDb:base,localDb:local,environment,deviceId,activationEpoch,startSequence:await loadSequence(),maxOperations,maxRebases,changedCollections:scope,appendOnlyChangesCount,trustedDocuments:verified?trustedDocuments:null,verifiedRemote:verified,onProgress:progress=>status({state:progress.kind,counts:progress.counts})});nextSequence=Math.max(nextSequence,result.nextSequence||nextSequence);
   if(result.state!=='complete'){
    dirty=true;const counts=result.worker?.counts||await journal.counts();lastCounts=counts;
    if(result.state==='waiting'){queued=true;const retryAt=Number(result.worker?.head?.nextRetryAt)||Date.now()+1000;schedule(Math.max(0,retryAt-Date.now()))}
    else if(result.state==='paused'&&counts.pending>0){queued=true;schedule(0)}
    status({state:result.state,error:result.reason||result.worker?.head?.lastError||'',counts});return{...result,dirty:true};
   }
   // production trusted operation 已在同一交易中核對 base/target head、revision 與不可重送 receipt。
   // 直接採用已提交計畫可解除 UI 操作鎖；背景串流仍會獨立驗證正式資料，若不一致照常封鎖。
   // A resumed journal has no in-memory plan. Rebuild that exact committed batch
   // from verified receipts instead of treating newer, unsent local UI state as
   // if it had already reached the cloud.
   const readback=trustCommittedPlan
    ?(result.plan?{db:result.db}:rebuildFullRecordShadowDb(await readConfirmedDocuments({preferCache:true}),{environment}))
    :await readConvergedAuthority(result.plan?.targetHash||'',startedSnapshotVersion);
   let merged,capturedVersion;
   capturedVersion=mutationVersion;
   if(trustCommittedPlan&&capturedVersion===startedVersion)merged={db:readback.db,conflicts:[]};
   else do{
    capturedVersion=mutationVersion;const currentLocal=clone(getLocalDb());
    // New edits are relative to the state submitted by this flush, not the old
    // cloud baseline. Otherwise A→B→A (or create→delete) looks unchanged and the
    // B/create receipt incorrectly resurrects the previous local action.
    merged=mergeConcurrentRecordDb(capturedVersion===startedVersion?base:local,currentLocal,readback.db);
    await savePostSyncConflicts(merged.conflicts,readback.db,merged.db);
   }while(capturedVersion!==mutationVersion);
   const cloudHash=trustCommittedPlan&&result.plan?.targetHash?result.plan.targetHash:recordDataHash(readback.db),newerMutation=mutationVersion!==startedVersion,remoteUnchanged=Boolean(trustCommittedPlan&&result.plan&&baselineHash&&result.plan.baseHash===baselineHash),priorTrusted=verified;baselineDb=clone(readback.db);baselineHash=cloudHash;latestCloudDb=baselineDb;
   if(trustCommittedPlan&&priorTrusted&&result.plan?.operations?.length){const revisions=clone(priorTrusted.revisions);for(const operation of result.plan.operations)(revisions[operation.collection]??(revisions[operation.collection]={}))[operation.recordId]=operation.nextRevision;const tail=result.plan.operations.at(-1);trustedRemote={db:baselineDb,hash:cloudHash,documentCount:tail.targetDocumentCount,activeCount:tail.targetActiveCount,tombstoneCount:tail.targetTombstoneCount,revisions}}
   // When the exact optimistic schedule target was committed against the same
   // remote hash, rendering and hashing it again only blocks the next gesture.
   if(newerMutation||!scope||!remoteUnchanged)await apply(merged.db);
   const desiredHash=trustCommittedPlan&&!newerMutation?cloudHash:recordDataHash(merged.db);dirty=newerMutation||desiredHash!==cloudHash;queued=dirty;await publishRoleViews(readback.db);const counts=await journal.counts();status({state:dirty?'queued':'complete',hash:cloudHash,counts,rebases:result.rebases});return{...result,state:dirty?'pending':'complete',readbackHash:cloudHash,readbackDb:readback.db,desiredHash,dirty,counts};
  }catch(error){dirty=true;queued=false;retryPending=true;status({state:'blocked',error:String(error?.message||error)});return{state:'blocked',error,dirty:true,retryPending:true}}
  finally{inFlight=false;status({state:lastState,error:lastError,counts:lastCounts});if(queued&&writeAllowed)schedule(saveDelay)}
 }
 function stop(){stopped=true;if(timer!==null){clearTimer(timer);timer=null}queued=false;status({state:'stopped'})}
 return{enabled:true,acceptCloudSnapshot,readConfirmedDocuments,acceptCommittedBatch,setWriteAllowed,queueLocalSave,resume,flush,stop,diagnostics:()=>({environment,role,deviceId,activationEpoch,writeAllowed,dirty,queued,inFlight,retryPending,state:lastState,error:lastError,nextSequence,counts:lastCounts,hasBaseline:Boolean(baselineDb),hasCloud:Boolean(latestCloudDb),hasTrustedDocuments:Boolean(trustedDocuments),pendingCollections:pendingCollections?[...pendingCollections]:null})};
}
