import {createRoleViewTransportSession} from './role-view-transport-session.js';
import {SCHEDULER_OPERATION_RESPONSE_SCHEMA} from './production-scheduler-operation.js';

export const PUBLISHED_SCHEDULER_RESPONSE_SCHEMA='danbridge-production-scheduler-chunk-response-v1';
// The durable queue is acknowledged only after a complete authorized view has
// been assembled. A receipt from an older commit can resolve to a newer head,
// but may never grant access to unpublished old parts or another account.
export function createPublishedSchedulerReceiptReader({identity,readCurrentHead,readPart,isActive}){
 if(identity?.kind!=='scheduler')throw Error('Scheduler receipt identity required');
 let latest=null;
 const session=createRoleViewTransportSession({identity,readCurrentHead,readPart,isActive,apply:(db,meta)=>{latest={db,meta}}});
 return Object.freeze({
  invalidate(){session.invalidate();latest=null},
  async resolve(response){
   if(response?.schema!==PUBLISHED_SCHEDULER_RESPONSE_SCHEMA||response.state!=='committed'||typeof response.requestId!=='string'||!/^[A-Za-z0-9_.:-]{12,128}$/.test(response.requestId)||!Number.isSafeInteger(response.sourceRecordRevision)||response.sourceRecordRevision<0||!Number.isSafeInteger(response.operationCount)||response.operationCount<0||response.operationCount>180||!Number.isSafeInteger(response.notificationCount)||response.notificationCount<0||!/^record-v1:[a-f0-9]{64}$/.test(response.sourceHash||''))throw Error('Invalid published scheduler receipt');
   let result=await session.receive({roleChunkManifest:response.roleManifest,sourceRecordRevision:response.sourceRecordRevision,sourceRecordHash:response.sourceHash});
   if(result.state==='superseded'&&isActive())result=await session.receive(await readCurrentHead());
   if(!['applied','unchanged'].includes(result.state)||!latest||!isActive()||latest.meta.sourceRecordRevision<response.sourceRecordRevision)throw Error('Scheduler receipt superseded; retain durable request');
   return{schema:SCHEDULER_OPERATION_RESPONSE_SCHEMA,state:'committed',requestId:response.requestId,operationCount:response.operationCount,notificationCount:response.notificationCount,sourceHash:latest.meta.sourceRecordHash,sourceRecordRevision:latest.meta.sourceRecordRevision,schedulerDb:latest.db};
  }
 });
}
