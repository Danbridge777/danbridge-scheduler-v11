import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS} from './cloud-record-sync-v2-deployment-gate-contract.js';

export const STAGING_V2_ADMIN_SUPERVISOR_PRIMITIVES_SCOPE='fixed-staging-readiness-rules-baseline-and-gate-source-primitives-v1';

const PROJECT_ID='danbridge-d8877-staging';
const ZERO='0'.repeat(64);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!==ZERO;

function exact(value,fields,label){
 if(!plain(value))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 const output={};
 for(const key of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');
  output[key]=descriptor.value;
 }
 return output;
}

function checkedResult(raw,label,{readOnly=false}={}){
 const value=exact(raw,['capability','readCount','writeCount'],label);
 if(!plain(value.capability)||!count(value.readCount)||!count(value.writeCount)||(readOnly&&value.writeCount!==0))throw new Error(label+' blocked');
 return Object.freeze({capability:Object.freeze({...value.capability}),readCount:value.readCount,writeCount:value.writeCount});
}

function gates(raw){
 const value=exact(raw,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS,'staging V2 gate source hashes'),output={};
 for(const gateId of RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS){
  const type=RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[gateId],typed=value[gateId];
  if(typeof typed!=='string'||!typed.startsWith(type+':')||!digest(typed.slice(type.length+1)))throw new Error('staging V2 gate source hash blocked '+gateId);
  output[gateId]=typed;
 }
 return Object.freeze(output);
}

function cutover(context){
 const capability=context?.priorStepCapabilities?.CUTOVER_INTENT;
 if(!capability||typeof capability!=='object'||capability.projectId!==PROJECT_ID||capability.environment!=='staging'||capability.companyId!=='danbridge')throw new Error('staging V2 deployment attestation cutover capability blocked');
 const sourceV1ActivationEpoch=capability.sourceV1ActivationEpoch,targetV2Epoch=capability.targetV2Epoch;
 if(typeof sourceV1ActivationEpoch!=='string'||typeof targetV2Epoch!=='string'||sourceV1ActivationEpoch.length<8||targetV2Epoch.length<8||sourceV1ActivationEpoch===targetV2Epoch)throw new Error('staging V2 deployment attestation epoch blocked');
 return{sourceV1ActivationEpoch,targetV2Epoch};
}

export function createStagingV2AdminSupervisorPrimitives(raw){
 const input=exact(raw,['readiness','rules','baselineReadback','gateSourceHashes'],'staging V2 primitive config'),gateSourceHashes=gates(input.gateSourceHashes);
 if(typeof input.readiness?.readinessCheck!=='function'||typeof input.rules?.rulesReadbackAttestation!=='function'||typeof input.rules?.rulesDeployAndAttest!=='function'||typeof input.baselineReadback!=='function')throw new Error('staging V2 primitive dependencies blocked');
 const unsupported=label=>async()=>{throw new Error('staging V2 '+label+' requires separate atomic authorization')};
 return Object.freeze({
  readinessCheck:context=>input.readiness.readinessCheck(context),
  baselineAttestationReadback:async context=>checkedResult(await input.baselineReadback(context),'staging V2 baseline readback',{readOnly:true}),
  rulesReadbackAttestation:context=>input.rules.rulesReadbackAttestation(context),
  rulesDeployAndAttest:context=>input.rules.rulesDeployAndAttest(context),
  async deploymentAttestationExpected(context){
   const epochs=cutover(context),manifest=context?.manifest;
   if(!plain(manifest)||manifest.projectId!==PROJECT_ID||!digest(manifest.rulesetHash)||!digest(manifest.runtimePolicyHash))throw new Error('staging V2 deployment manifest blocked');
   return Object.freeze({environment:'staging',companyId:'danbridge',projectId:PROJECT_ID,...epochs,rulesetHash:manifest.rulesetHash,runtimePolicyHash:manifest.runtimePolicyHash,gateSourceHashes});
  },
  h1SaveRequest:unsupported('H1 save'),
  h1BaselinePlan:unsupported('H1 baseline'),
  finalReadback:unsupported('final readback'),
  async rollback(context){
   const body={schema:'danbridge-staging-v2-pre-atomic-cleanup-only-receipt-v1',scope:STAGING_V2_ADMIN_SUPERVISOR_PRIMITIVES_SCOPE,projectId:PROJECT_ID,phase:context?.phase??'ROLLBACK',retainedDurableReplayArtifacts:true,productionTouched:false,hostingDeployed:false,timeMachineTouched:false};
   return Object.freeze({capability:Object.freeze({...body,receiptHash:sha256Canonical(body)}),readCount:0,writeCount:0});
  },
 });
}
