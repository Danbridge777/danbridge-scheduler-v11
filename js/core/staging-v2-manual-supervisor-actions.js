import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {STAGING_V2_SUPERVISOR_PHASES} from './staging-v2-activation-supervisor.js';

export const STAGING_V2_MANUAL_SUPERVISOR_ACTIONS_SCOPE='one-process-uncloneable-exact-phase-chain-for-real-staging-binders-not-production-hosting-or-time-machine';

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function exact(value,fields,label){
 if(!plain(value))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own data field');out[key]=descriptor.value}return out;
}

function actionResult(raw,phase){
 const value=exact(raw,['capability','receiptHash','readCount','writeCount','firestoreRulesDeployed'],'manual supervisor '+phase+' executor result');
 if(!plain(value.capability)||!digest(value.receiptHash)||!count(value.readCount)||!count(value.writeCount)||typeof value.firestoreRulesDeployed!=='boolean'||(value.firestoreRulesDeployed&&phase!=='STAGING_RULES_ATTESTATION'))throw new Error('manual supervisor '+phase+' executor result blocked');
 return value;
}

function supervisorResult(phase,value,capability){return Object.freeze({schema:'danbridge-staging-v2-supervisor-phase-result-v1',phase,status:'complete',receiptHash:value.receiptHash,readCount:value.readCount,writeCount:value.writeCount,firestoreRulesDeployed:value.firestoreRulesDeployed,hostingDeployed:false,productionTouched:false,timeMachineTouched:false,capability})}

export function createStagingV2ManualSupervisorActions(raw){
 const input=exact(raw,['executors','rollback'],'manual supervisor actions config'),executors=exact(input.executors,STAGING_V2_SUPERVISOR_PHASES,'manual supervisor executors');
 for(const phase of STAGING_V2_SUPERVISOR_PHASES)if(typeof executors[phase]!=='function')throw new Error('manual supervisor executor missing '+phase);
 if(typeof input.rollback!=='function')throw new Error('manual supervisor rollback missing');
 const states=new WeakMap();
 const start=value=>plain(value)&&Reflect.ownKeys(value).length===1&&value.schema==='danbridge-staging-v2-supervisor-start-capability-v1';
 const prior=(value,index)=>{if(index===0){if(!start(value))throw new Error('manual supervisor start capability blocked');return{chainHash:'0'.repeat(64),outputs:Object.freeze({})}}const state=states.get(value);if(!state||state.phaseIndex!==index-1||state.phase!==STAGING_V2_SUPERVISOR_PHASES[index-1])throw new Error('manual supervisor prior capability cloned, foreign, or out of order');return state};
 const actions={};
 for(let index=0;index<STAGING_V2_SUPERVISOR_PHASES.length;index++){
  const phase=STAGING_V2_SUPERVISOR_PHASES[index];
  actions[phase]=async rawContext=>{
   const context=exact(rawContext,['manifest','phase','capability'],'manual supervisor '+phase+' context');if(context.phase!==phase)throw new Error('manual supervisor phase mismatch');
   const before=prior(context.capability,index),value=actionResult(await executors[phase](Object.freeze({manifest:context.manifest,phase,priorCapabilities:before.outputs})),phase),capabilityHash=sha256Canonical(value.capability),body={schema:'danbridge-staging-v2-manual-supervisor-chain-capability-v1',scope:STAGING_V2_MANUAL_SUPERVISOR_ACTIONS_SCOPE,phase,phaseIndex:index,previousChainHash:before.chainHash,receiptHash:value.receiptHash,capabilityHash,readCount:value.readCount,writeCount:value.writeCount,firestoreRulesDeployed:value.firestoreRulesDeployed},chainCapability=Object.freeze({...body,chainHash:sha256Canonical(body)}),outputs=Object.freeze({...before.outputs,[phase]:value.capability});
   states.set(chainCapability,Object.freeze({phase,phaseIndex:index,chainHash:chainCapability.chainHash,outputs}));
   return supervisorResult(phase,value,chainCapability);
  };
 }
 actions.ROLLBACK=async rawContext=>{
  const context=exact(rawContext,['manifest','phase','capability'],'manual supervisor rollback context');if(context.phase!=='ROLLBACK')throw new Error('manual supervisor rollback phase mismatch');
  const state=start(context.capability)?{chainHash:'0'.repeat(64),outputs:Object.freeze({})}:states.get(context.capability);if(!state)throw new Error('manual supervisor rollback capability cloned or foreign');
  const value=actionResult(await input.rollback(Object.freeze({manifest:context.manifest,phase:'ROLLBACK',priorCapabilities:state.outputs})),'ROLLBACK');if(value.writeCount!==0||value.firestoreRulesDeployed)throw new Error('manual supervisor rollback must be cleanup-only');
  return supervisorResult('ROLLBACK',value,Object.freeze({schema:'danbridge-staging-v2-manual-supervisor-rollback-capability-v1',previousChainHash:state.chainHash,receiptHash:value.receiptHash}));
 };
 return Object.freeze(actions);
}
