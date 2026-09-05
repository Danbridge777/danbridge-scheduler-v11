import {prepareActiveRecordSync} from './cloud-active-record-sync.js';
import {enqueueOperationPlan,runOperationWorker} from './cloud-operation-worker.js?v=20.26.217';

const clone=value=>JSON.parse(JSON.stringify(value));
const revisionConflict=value=>/revision\s*衝突|revision conflict/i.test(String(value||''));

export async function runActiveRecordSync({journal,readDocuments,send,persistConflicts,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence=1,maxOperations=1000,maxRebases=5,onProgress=()=>{}}={}){
 if(!journal||typeof journal.replaceUnconfirmed!=='function'||typeof readDocuments!=='function'||typeof send!=='function'||typeof onProgress!=='function'||!Number.isSafeInteger(maxRebases)||maxRebases<0||maxRebases>20)throw new Error('日常逐筆執行器設定無效');
 let sequence=startSequence,rebases=0,lastPlan=null,conflictBackups=[];
 const prepare=async({replace=false,reason=''}={})=>{
  const documents=await readDocuments({force:replace,preferCache:!replace,reason}),plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb,localDb,environment,deviceId,activationEpoch,startSequence:sequence});sequence=plan.nextSequence;
  let backup=null;if(plan.conflicts.length){if(typeof persistConflicts!=='function')throw new Error('偵測到同筆衝突但缺少不可變備份介面');backup=await persistConflicts(clone(plan.conflicts),{environment,activationEpoch,deviceId,baseHash:plan.baseHash,targetHash:plan.targetHash});if(!backup)throw new Error('同筆衝突備份未完成');conflictBackups.push(clone(backup))}
  if(replace)await journal.replaceUnconfirmed(plan.operations,{reason});else await enqueueOperationPlan(journal,plan);lastPlan=plan;await onProgress({kind:replace?'replanned':'planned',plan,backup});return plan;
 };
 await journal.recoverInterrupted();let rows=await journal.list();
 if(rows.some(row=>row.status==='quarantined')){
  await prepare({replace:true,reason:'隔離操作重新讀取雲端後安全重排'});
  rows=await journal.list();
 }
 if(!rows.some(row=>!['confirmed','superseded'].includes(row.status)))await prepare();
 while(true){
  const worker=await runOperationWorker({journal,send,recoverInterrupted:false,maxOperations,onProgress});
  if(worker.state==='complete')return{state:'complete',worker,plan:lastPlan,db:clone(lastPlan?.db??localDb),nextSequence:sequence,rebases,conflictBackups};
  if(worker.state!=='blocked'||!revisionConflict(worker.head?.lastError))return{state:worker.state,worker,plan:lastPlan,db:null,nextSequence:sequence,rebases,conflictBackups};
  if(rebases>=maxRebases)return{state:'blocked',reason:'超過自動重讀重排上限',worker,plan:lastPlan,db:null,nextSequence:sequence,rebases,conflictBackups};
  rebases++;await prepare({replace:true,reason:`revision 衝突後第 ${rebases} 次重新讀取與規劃`});rows=await journal.list();if(!rows.some(row=>!['confirmed','superseded'].includes(row.status)))return{state:'complete',worker,plan:lastPlan,db:clone(lastPlan.db),nextSequence:sequence,rebases,conflictBackups};
 }
}
