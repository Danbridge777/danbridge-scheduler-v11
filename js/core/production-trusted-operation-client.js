import {PRODUCTION_TRUSTED_OPERATION_SCHEMA,PRODUCTION_TRUSTED_RESPONSE_SCHEMA,assertProductionTrustedOperation} from './production-trusted-operation-contract.js';

export function createProductionTrustedOperationClient({call,getIdentity}={}){
 if(typeof call!=='function'||typeof getIdentity!=='function')throw new Error('production trusted client 注入不完整');
 const identity=()=>{const row=getIdentity();if(typeof row?.uid!=='string'||!row.uid||typeof row?.email!=='string'||row.email!==row.email.trim().toLowerCase())throw new Error('production trusted client 尚未登入');return{uid:row.uid,email:row.email}};
 const execute=async input=>{
  const before=identity(),request=assertProductionTrustedOperation({...input,schema:PRODUCTION_TRUSTED_OPERATION_SCHEMA,actor:before}),response=await call(request),after=identity();
  if(before.uid!==after.uid||before.email!==after.email)throw new Error('production trusted client 執行期間身分變更');
  const data=response?.data??response;
  if(data?.schema!==PRODUCTION_TRUSTED_RESPONSE_SCHEMA||data?.state!=='committed'||data?.requestId!==request.requestId||!data.result||typeof data.result!=='object')throw new Error('production trusted response 無效');
  return data.result;
 };
 const requestId=prefix=>`${prefix}-${crypto.randomUUID()}`;
 const dailyBatch=value=>{
  if(!Array.isArray(value))return value;
  return{activationEpoch:value[0]?.activationEpoch,reason:'daily-record-sync',operations:value};
 };
 return Object.freeze({enabled:true,
  apply:operation=>execute({kind:'record.apply',requestId:operation?.operationId,operation}),
  previewBatch:batch=>execute({kind:'record.batch.preview',requestId:requestId('preview'),batch}),
  applyBatch:value=>execute({kind:'record.batch.apply',requestId:requestId('batch'),batch:dailyBatch(value)}),
  mutateAccess:mutation=>execute({kind:'access.mutate',requestId:requestId('access'),mutation})
 });
}
