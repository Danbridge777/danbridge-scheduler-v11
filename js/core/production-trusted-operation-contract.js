import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';

export const PRODUCTION_TRUSTED_OPERATION_SCHEMA='danbridge-production-trusted-operation-v1';
export const PRODUCTION_TRUSTED_RESPONSE_SCHEMA='danbridge-production-trusted-operation-response-v1';
export const PRODUCTION_TRUSTED_PROJECT_ID='danbridge-d8877';
export const PRODUCTION_PRIMARY_OWNER_EMAIL='a0965487920@gmail.com';
export const PRODUCTION_TRUSTED_RECORD_COLLECTIONS=Object.freeze([...FULL_RECORD_COLLECTIONS]);
export const PRODUCTION_TRUSTED_KINDS=Object.freeze(['record.apply','record.batch.preview','record.batch.apply','access.mutate']);

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,allowed,label)=>{if(!object(value))throw new Error(`${label} 格式無效`);const unknown=Object.keys(value).filter(key=>!allowed.includes(key));if(unknown.length)throw new Error(`${label} 包含未允許欄位：${unknown.join(',')}`);return value};
const token=(value,max=1500)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max&&!/[\u0000-\u001f/]/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=254&&/^[^\s@]+@[^\s@]+$/.test(value);

export function assertProductionTrustedCaller(caller){const row=exact(caller,['uid','email','role','active','companyId'],'trusted caller');if(!token(row.uid,128)||!email(row.email)||row.role!=='owner'||row.active!==true||row.companyId!=='danbridge')throw new Error('trusted caller 不是有效 Owner');return Object.freeze({...row})}

export function assertProductionTrustedOperation(request){
 const row=exact(request,['schema','kind','requestId','actor','operation','batch','mutation'],'trusted request');
 if(row.schema!==PRODUCTION_TRUSTED_OPERATION_SCHEMA||!PRODUCTION_TRUSTED_KINDS.includes(row.kind)||!token(row.requestId,160))throw new Error('trusted request identity 無效');
 const actor=exact(row.actor,['uid','email'],'trusted request actor');if(!token(actor.uid,128)||!email(actor.email))throw new Error('trusted request actor 無效');
 if(row.kind==='record.apply'){
  const operation=row.operation;
  if(!object(operation)||operation.environment!=='production'||operation.companyId!=='danbridge'||!token(operation.activationEpoch,180)||!token(operation.operationId,180)||!PRODUCTION_TRUSTED_RECORD_COLLECTIONS.includes(operation.collection)||!token(operation.recordId,400))throw new Error('trusted production operation 無效');
  if(operation.operationId!==row.requestId)throw new Error('trusted requestId 與 operationId 不符');
  if(JSON.stringify(operation).length>900000)throw new Error('trusted operation 超過安全大小');
  return Object.freeze({schema:row.schema,kind:row.kind,requestId:row.requestId,actor:Object.freeze({...actor}),operation});
 }
 if(row.kind==='record.batch.preview'||row.kind==='record.batch.apply'){
  const batch=exact(row.batch,['activationEpoch','reason','operations','previewId'],'trusted batch');
  if(!token(batch.activationEpoch,180)||!token(batch.reason,120)||!Array.isArray(batch.operations)||batch.operations.length<1||batch.operations.length>180)throw new Error('trusted batch identity 無效');
  if(row.kind==='record.batch.apply'&&batch.reason==='restore'&&!token(batch.previewId,160))throw new Error('restore apply 缺少有效預覽');
  if(row.kind==='record.batch.preview'&&batch.previewId!==undefined)throw new Error('preview 不接受既有 previewId');
  for(const operation of batch.operations)if(!object(operation)||operation.environment!=='production'||operation.companyId!=='danbridge'||operation.activationEpoch!==batch.activationEpoch||!token(operation.operationId,180)||!PRODUCTION_TRUSTED_RECORD_COLLECTIONS.includes(operation.collection)||!token(operation.recordId,400))throw new Error('trusted batch operation 無效');
  if(JSON.stringify(batch).length>3500000)throw new Error('trusted batch 超過安全大小');
  return Object.freeze({schema:row.schema,kind:row.kind,requestId:row.requestId,actor:Object.freeze({...actor}),batch});
 }
 const mutation=exact(row.mutation,['action','email','expectedRevision','payload','userPaths','detail'],'trusted access mutation');
 if(!['upsert','delete'].includes(mutation.action)||!email(mutation.email)||!Number.isSafeInteger(mutation.expectedRevision)||mutation.expectedRevision<0)throw new Error('trusted access mutation 無效');
 if(mutation.action==='upsert'&&!object(mutation.payload))throw new Error('trusted access payload 無效');
 if(mutation.action==='delete'&&mutation.payload!==undefined)throw new Error('trusted access delete 不接受 payload');
 if(mutation.userPaths!==undefined&&(!Array.isArray(mutation.userPaths)||mutation.userPaths.length>20||mutation.userPaths.some(path=>typeof path!=='string'||!/^users\/[A-Za-z0-9_.:-]{8,128}$/.test(path))))throw new Error('trusted access userPaths 無效');
 if(!object(mutation.detail)||JSON.stringify(mutation).length>100000)throw new Error('trusted access audit 無效');
 return Object.freeze({schema:row.schema,kind:row.kind,requestId:row.requestId,actor:Object.freeze({...actor}),mutation});
}

export function buildProductionTrustedResponse({requestId,result}){if(!token(requestId,160)||!object(result))throw new Error('trusted response 無效');return Object.freeze({schema:PRODUCTION_TRUSTED_RESPONSE_SCHEMA,state:'committed',requestId,result})}
