import {prepareCanonicalRecordPlan,RECORD_PLAN_WORKER_PROTOCOL} from './cloud-record-plan-executor.js?v=20.26.310';

self.onmessage=async({data})=>{
 const {protocol,requestId,options}=data||{};
 if(protocol!==RECORD_PLAN_WORKER_PROTOCOL||!Number.isSafeInteger(requestId)||requestId<1)return;
 try{const plan=await prepareCanonicalRecordPlan(options);self.postMessage({protocol,requestId,ok:true,plan})}
 catch(error){self.postMessage({protocol,requestId,ok:false,error:String(error?.message||error)})}
};
