import {CORE_RECORD_COLLECTIONS,buildRecordShadowWriteBatches,rebuildRecordShadowState} from './cloud-record-diff.js';
import {executeRecordShadowBatches} from './cloud-record-shadow-writer.js';

const COMPANY_ID='danbridge';
const collectionPath=collection=>`stagingRecordShadows/${COMPANY_ID}/collections/${collection}/records`;

function requireStagingOwner(environment,role){
 if(environment!=='staging'||role!=='owner')throw new Error('逐筆影子 adapter 只允許 staging Owner');
}
function snapshotValue(snapshot){
 if(snapshot?.exists===false)return null;
 if(snapshot?.exists===true)return typeof snapshot.data==='function'?snapshot.data():snapshot.data;
 return snapshot??null;
}
function validateExisting(operation,current){
 const payload=operation.payload;
 if(!current){
  if(payload.revision!==1)throw new Error(`${payload.collection}/${payload.recordId} revision 衝突：新文件必須是 1`);
  return;
 }
 if(current.companyId!==COMPANY_ID||current.collection!==payload.collection||current.recordId!==payload.recordId||current.environment!=='staging')throw new Error(`${payload.collection}/${payload.recordId} identity 衝突`);
 if(!Number.isSafeInteger(current.revision)||payload.revision!==current.revision+1)throw new Error(`${payload.collection}/${payload.recordId} revision 衝突`);
}

export function createFirebaseRecordShadowAdapter({getCollectionDocuments,runBatchTransaction,serverTimestamp,actor,environment,role}={}){
 if(typeof getCollectionDocuments!=='function'||typeof runBatchTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('逐筆影子 adapter 注入介面不完整');
 const readState=async()=>{
  requireStagingOwner(environment,role);
  const entries=await Promise.all(CORE_RECORD_COLLECTIONS.map(async collection=>[collection,await getCollectionDocuments(collectionPath(collection))]));
  return rebuildRecordShadowState(Object.fromEntries(entries));
 };
 const writeBatch=async operations=>runBatchTransaction(async transaction=>{
  if(!transaction||typeof transaction.get!=='function'||typeof transaction.set!=='function')throw new Error('逐筆影子 transaction 介面不完整');
  const snapshots=[];
  for(const operation of operations)snapshots.push(await transaction.get(operation.path));
  operations.forEach((operation,index)=>validateExisting(operation,snapshotValue(snapshots[index])));
  for(const operation of operations)transaction.set(operation.path,{...operation.payload,updatedAt:serverTimestamp(),updatedBy:String(actor?.uid||''),updatedByEmail:String(actor?.email||'').trim().toLowerCase()});
 });
 return{
  enabled:environment==='staging'&&role==='owner',
  readState,
  async synchronize(targetDb,{sourceHash,batchSize}={}){
   requireStagingOwner(environment,role);
   if(!actor?.uid||!String(actor?.email||'').trim())throw new Error('逐筆影子 adapter 缺少 Owner actor');
   const current=await readState();
   const plan=buildRecordShadowWriteBatches(current,targetDb,{companyId:COMPANY_ID,sourceHash,batchSize});
   return executeRecordShadowBatches(plan,{writeBatch,readState,targetDb});
  }
 };
}
