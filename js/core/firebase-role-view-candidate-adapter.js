import {buildRoleViewCandidatePlan,verifyRoleViewCandidateDocuments} from './cloud-role-view-candidate.js?v=20.26.220';

const CORE_FIELDS=['schema','environment','companyId','runId','sourceHash','viewId','email','kind','viewHash','collection','recordId','record','recordIndex'];
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
const same=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
const corePayload=value=>Object.fromEntries(CORE_FIELDS.map(key=>[key,clone(value[key])]));
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot?.exists?snapshot.data:null);
function guard(environment,role){if(!['staging','production'].includes(environment)||role!=='owner')throw new Error('角色逐筆候選 adapter 只允許指定環境 Owner')}

export function createFirebaseRoleViewCandidateAdapter({getCollectionDocuments,runBatchTransaction,serverTimestamp,actor,environment,role,hashDb}={}){
 if(typeof getCollectionDocuments!=='function'||typeof runBatchTransaction!=='function'||typeof serverTimestamp!=='function'||typeof hashDb!=='function')throw new Error('角色逐筆候選 adapter 注入介面不完整');
 const readPlan=async plan=>{const rows=[];for(const view of plan.views){for(const collection of Object.keys(view.counts)){const base=`${environment==='production'?'productionRoleViewCandidates':'stagingRoleViewCandidates'}/danbridge/runs/${plan.runId}/views/${view.viewId}/collections/${collection}/records`,documents=await getCollectionDocuments(base);for(const document of documents)rows.push({path:`${base}/${document.id}`,payload:corePayload(document.data)})}}return rows};
 return{enabled:['staging','production'].includes(environment)&&role==='owner',async writeAndVerify({runId,sourceHash,views,batchSize=400,onBatchComplete}={}){
  guard(environment,role);if(!actor?.uid||!String(actor?.email||'').trim())throw new Error('角色逐筆候選 adapter 缺少 Owner actor');
  const plan=buildRoleViewCandidatePlan({runId,sourceHash,views,batchSize,environment});let completedBatches=0,completedWrites=0,skippedWrites=0;
  for(const batch of plan.batches){try{const progress=await runBatchTransaction(async transaction=>{const snapshots=[];for(const document of batch.documents)snapshots.push(await transaction.get(document.path));let writes=0,skipped=0;batch.documents.forEach((document,index)=>{const current=valueOf(snapshots[index]);if(current){if(!same(corePayload(current),document.payload))throw new Error(`角色逐筆候選 immutable 衝突：${document.path}`);skipped++;return}transaction.set(document.path,{...document.payload,createdAt:serverTimestamp(),createdBy:String(actor.uid),createdByEmail:String(actor.email).trim().toLowerCase()});writes++});return{writes,skipped}});completedWrites+=progress.writes;skippedWrites+=progress.skipped}catch(cause){const error=new Error(`角色逐筆候選第 ${completedBatches+1} 批失敗：${cause?.message||cause}`,{cause});error.completedBatches=completedBatches;error.completedWrites=completedWrites;error.totalBatches=plan.batches.length;throw error}completedBatches++;onBatchComplete?.({completedBatches,totalBatches:plan.batches.length,completedWrites,skippedWrites,totalDocuments:plan.documentCount})}
  const readback=await readPlan(plan),verified=verifyRoleViewCandidateDocuments(plan,readback,{hashDb});return{...verified,writes:completedWrites,skippedWrites,batches:completedBatches,readTakeover:false,plan};
 }};
}
