import {PRODUCTION_TRUSTED_OPERATION_SCHEMA,PRODUCTION_TRUSTED_RESPONSE_SCHEMA,assertProductionTrustedOperation} from './production-trusted-operation-contract.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export function createProductionTrustedOperationClient({call,getIdentity}={}){
 if(typeof call!=='function'||typeof getIdentity!=='function')throw new Error('production trusted client 注入不完整');
 let publicationIdentity='';const atomicPublications=new Map();
 const identity=()=>{const row=getIdentity();if(typeof row?.uid!=='string'||!row.uid||typeof row?.email!=='string'||row.email!==row.email.trim().toLowerCase())throw new Error('production trusted client 尚未登入');return{uid:row.uid,email:row.email}};
 const publicationScope=()=>{const row=identity(),key=JSON.stringify(row);if(key!==publicationIdentity){atomicPublications.clear();publicationIdentity=key}return row};
 const execute=async input=>{
  const before=publicationScope(),request=assertProductionTrustedOperation({...input,schema:PRODUCTION_TRUSTED_OPERATION_SCHEMA,actor:before}),response=await call(request),after=publicationScope();
  if(before.uid!==after.uid||before.email!==after.email)throw new Error('production trusted client 執行期間身分變更');
  const data=response?.data??response;
  if(data?.schema!==PRODUCTION_TRUSTED_RESPONSE_SCHEMA||data?.state!=='committed'||data?.requestId!==request.requestId||!data.result||typeof data.result!=='object')throw new Error('production trusted response 無效');
  const publication=data.result.publication;
  if(publication){
   const targetHash=request.kind==='record.apply'?request.operation.targetHash:request.kind==='record.batch.apply'?request.batch.operations.at(-1).targetHash:null;
   if(publication.schema!=='danbridge-owner-atomic-publication-v1'||!/^record-v1:[a-f0-9]{64}$/.test(publication.sourceHash)||!['sourceRecordRevision','notificationCount','roleViewCount'].every(k=>Number.isSafeInteger(publication[k])&&publication[k]>=0)||(targetHash&&publication.sourceHash!==targetHash))throw new Error('production atomic publication receipt 無效');
   if(targetHash){atomicPublications.delete(targetHash);atomicPublications.set(targetHash,publication);while(atomicPublications.size>128)atomicPublications.delete(atomicPublications.keys().next().value)}
  }
  return data.result;
 };
 const requestId=prefix=>`${prefix}-${crypto.randomUUID()}`;
 const dailyBatch=value=>{
  if(!Array.isArray(value))return value;
  return{activationEpoch:value[0]?.activationEpoch,reason:'daily-record-sync',operations:value};
 };
 return Object.freeze({enabled:true,
  hasAtomicPublication:hash=>{try{publicationScope();return atomicPublications.has(hash)}catch{atomicPublications.clear();publicationIdentity='';return false}},
  apply:operation=>execute({kind:'record.apply',requestId:operation?.operationId,operation}),
  previewBatch:batch=>execute({kind:'record.batch.preview',requestId:requestId('preview'),batch}),
  // A lost response must replay the same command after reconnect/reload, not
  // create a new batch receipt around already-committed operation IDs.
  applyBatch:value=>{const batch=dailyBatch(value);return execute({kind:'record.batch.apply',requestId:`batch-${sha256Canonical({actor:identity(),batch})}`,batch})},
  mutateAccess:mutation=>execute({kind:'access.mutate',requestId:`access-${sha256Canonical({actor:identity(),mutation})}`,mutation})
 });
}
