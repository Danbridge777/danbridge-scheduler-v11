import {prepareCanonicalRecordPlan,prepareRecordPlanOffThread} from './cloud-record-plan-executor.js?v=20.26.315';
import {enqueueOperationPlan,runOperationWorker} from './cloud-operation-worker.js?v=20.26.315';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const revisionConflict=value=>/revision\s*衝突|revision conflict/i.test(String(value||''));
const monotonicNow=()=>globalThis.performance?.now?.()??Date.now();

export async function runActiveRecordSync({journal,readDocuments,send,persistConflicts,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence=1,maxOperations=1000,maxRebases=5,changedCollections=null,appendOnlyChangesCount=0,trustedDocuments=null,verifiedRemote=null,publishedOwnerBatch=false,onProgress=()=>{}}={}){
 if(typeof publishedOwnerBatch!=='boolean'||(publishedOwnerBatch&&environment!=='production'))throw new Error('Published Owner batch configuration invalid');
 if(!journal||typeof journal.replaceUnconfirmed!=='function'||typeof readDocuments!=='function'||typeof send!=='function'||typeof onProgress!=='function'||!Number.isSafeInteger(maxRebases)||maxRebases<0||maxRebases>20)throw new Error('日常逐筆執行器設定無效');
 let sequence=startSequence,rebases=0,lastPlan=null,conflictBackups=[],recoveryMs=0;
 const prepare=async({replace=false,reason=''}={})=>{
  const started=monotonicNow();
  const trusted=!replace&&trustedDocuments&&verifiedRemote;
  const documents=trusted?trustedDocuments:await readDocuments({force:replace,preferCache:!replace,reason}),options={documentsByCollection:documents,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence:sequence,changedCollections,appendOnlyChangesCount:trusted?appendOnlyChangesCount:0,...(trusted?{authoritativeSourceHash:verifiedRemote.hash,verifiedRemote}:{})};
  // Production planning is pure CPU work, independent of the transport gate.
  // Keep journal ordering, conflict persistence, batch limits and trusted
  // server receipts in this runtime. Legacy transport also uses the worker.
  const readFinished=monotonicNow();
  const plan=await (environment==='production'?prepareRecordPlanOffThread(options,{reuseWorker:true}):prepareCanonicalRecordPlan(options));sequence=plan.nextSequence;
  const planFinished=monotonicNow();
  let backup=null;if(plan.conflicts.length){if(typeof persistConflicts!=='function')throw new Error('偵測到同筆衝突但缺少不可變備份介面');backup=await persistConflicts(clone(plan.conflicts),{environment,activationEpoch,deviceId,baseHash:plan.baseHash,targetHash:plan.targetHash});if(!backup)throw new Error('同筆衝突備份未完成');conflictBackups.push(clone(backup))}
  const backupFinished=monotonicNow();
  if(replace)await journal.replaceUnconfirmed(plan.operations,{reason});else await enqueueOperationPlan(journal,plan);lastPlan=plan;
  // Isolated acceptance metadata only: no names, IDs, records, hashes or
  // capability decisions are exposed. Timing never changes success criteria.
  const planningDiagnostics=publishedOwnerBatch?{recoveryMs,readMs:Math.max(0,readFinished-started),plannerMs:Math.max(0,planFinished-readFinished),conflictBackupMs:Math.max(0,backupFinished-planFinished),journalMs:Math.max(0,monotonicNow()-backupFinished),trustedSource:Boolean(trusted),appendOnlyChangesCount:options.appendOnlyChangesCount,operationCount:plan.operations.length}:null;
  await onProgress({kind:replace?'replanned':'planned',plan,backup,...(planningDiagnostics?{planningDiagnostics}:{})});return plan;
 };
 const recoveryStarted=monotonicNow();
 const recovered=await journal.recoverInterrupted();let rows=Array.isArray(recovered?.rows)?recovered.rows:await journal.list();
 recoveryMs=Math.max(0,monotonicNow()-recoveryStarted);
 if(rows.some(row=>row.status==='quarantined')){
  await prepare({replace:true,reason:'隔離操作重新讀取雲端後安全重排'});
  rows=await journal.list();
 }
 if(!rows.some(row=>!['confirmed','superseded'].includes(row.status)))await prepare();
 while(true){
  const stagingBatch=environment==='staging';
  const worker=await runOperationWorker({journal,send,recoverInterrupted:false,maxOperations,maxBatchOperations:stagingBatch?120:publishedOwnerBatch?80:8,maxBatchRecords:stagingBatch?90:publishedOwnerBatch?40:8,maxBatchAudits:publishedOwnerBatch?40:stagingBatch?30:8,onProgress});
  if(worker.state==='complete')return{state:'complete',worker,plan:lastPlan,db:clone(lastPlan?.db??localDb),nextSequence:sequence,rebases,conflictBackups};
  if(worker.state!=='blocked'||!revisionConflict(worker.head?.lastError))return{state:worker.state,worker,plan:lastPlan,db:null,nextSequence:sequence,rebases,conflictBackups};
  if(rebases>=maxRebases)return{state:'blocked',reason:'超過自動重讀重排上限',worker,plan:lastPlan,db:null,nextSequence:sequence,rebases,conflictBackups};
  rebases++;await prepare({replace:true,reason:`revision 衝突後第 ${rebases} 次重新讀取與規劃`});rows=await journal.list();if(!rows.some(row=>!['confirmed','superseded'].includes(row.status)))return{state:'complete',worker,plan:lastPlan,db:clone(lastPlan.db),nextSequence:sequence,rebases,conflictBackups};
 }
}
