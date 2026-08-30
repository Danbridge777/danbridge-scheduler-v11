import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {STAGING_V2_SUPERVISOR_PHASES} from './staging-v2-activation-supervisor.js';
import {createStagingV2ManualSupervisorActions} from './staging-v2-manual-supervisor-actions.js';

export const STAGING_V2_CONCRETE_MANUAL_SUPERVISOR_SCOPE='same-process-fixed-granular-step-composition-with-hidden-native-capabilities-staging-only';

export const STAGING_V2_CONCRETE_STEP_NAMES=Object.freeze([
 'READINESS_CHECK',
 'BASELINE_ATTESTATION_READBACK',
 'HARD_PAUSE',
 'POST_PAUSE_SCAN_U',
 'POST_PAUSE_SCAN_V',
 'POST_PAUSE_SCAN_PAIR',
 'RAW_BACKUP',
 'FROZEN_SOURCE_PROOF',
 'GENESIS_SEED_PLAN',
 'GENESIS_SEED_BATCHES',
 'GENESIS_IDENTITY_INDEX',
 'GENESIS_SEED_READBACK_MANIFEST',
 'GENESIS_SEED_READBACK_RECEIPT',
 'GENESIS_SEED_READBACK_CONFIRM',
 'GENESIS_AUTHORITY',
 'GENESIS_AUTHORITY_AUDIT_RECEIPT',
 'RESERVATION_REGISTRATION',
 'RESERVATION_BATCHES',
 'RESERVATION_BATCH_SET_SEAL',
 'RESERVATION_FINALIZATION',
 'RESERVATION_READBACK',
 'RESERVATION_AUTHORITY',
 'RESERVATION_AUTHORITY_AUDIT_RECEIPT',
 'TAKEOVER_CANDIDATE',
 'CUTOVER_INTENT',
 'STAGING_RULES_READBACK_ATTESTATION',
 'STAGING_RULES_DEPLOY_AND_ATTEST',
 'DEPLOYMENT_ATTESTATION',
 'TRUSTED_DEPLOYMENT_EVIDENCE',
 'ATOMIC_PREFLIGHT',
 'ATOMIC_ACTIVATION',
 'POST_CUTOVER_RECOVERY',
 'H1_SAVE',
 'H1_BASELINE_SNAPSHOT',
 'FINAL_READBACK',
]);

const FIXED_PHASE_STEPS=Object.freeze({
 READINESS:Object.freeze(['READINESS_CHECK']),
 BASELINE_ATTESTATION:Object.freeze(['BASELINE_ATTESTATION_READBACK']),
 HARD_PAUSE:Object.freeze(['HARD_PAUSE']),
 POST_PAUSE_SCAN:Object.freeze(['POST_PAUSE_SCAN_U','POST_PAUSE_SCAN_V','POST_PAUSE_SCAN_PAIR']),
 RAW_BACKUP:Object.freeze(['RAW_BACKUP']),
 FROZEN_SOURCE_PROOF:Object.freeze(['FROZEN_SOURCE_PROOF']),
 GENESIS_SEED:Object.freeze(['GENESIS_SEED_PLAN','GENESIS_SEED_BATCHES']),
 GENESIS_IDENTITY_INDEX:Object.freeze(['GENESIS_IDENTITY_INDEX']),
 GENESIS_AUTHORITY:Object.freeze(['GENESIS_SEED_READBACK_MANIFEST','GENESIS_SEED_READBACK_RECEIPT','GENESIS_SEED_READBACK_CONFIRM','GENESIS_AUTHORITY','GENESIS_AUTHORITY_AUDIT_RECEIPT']),
 RESERVATION:Object.freeze(['RESERVATION_REGISTRATION','RESERVATION_BATCHES','RESERVATION_BATCH_SET_SEAL','RESERVATION_FINALIZATION','RESERVATION_READBACK','RESERVATION_AUTHORITY','RESERVATION_AUTHORITY_AUDIT_RECEIPT']),
 TAKEOVER_CANDIDATE:Object.freeze(['TAKEOVER_CANDIDATE']),
 CUTOVER_INTENT:Object.freeze(['CUTOVER_INTENT']),
 DEPLOYMENT_ATTESTATION:Object.freeze(['DEPLOYMENT_ATTESTATION']),
 TRUSTED_DEPLOYMENT_EVIDENCE:Object.freeze(['TRUSTED_DEPLOYMENT_EVIDENCE']),
 PRE_ATOMIC_GATE:Object.freeze(['ATOMIC_PREFLIGHT']),
 ATOMIC_ACTIVATION:Object.freeze(['ATOMIC_ACTIVATION']),
 POST_CUTOVER_RECOVERY:Object.freeze(['POST_CUTOVER_RECOVERY']),
 H1_SAVE:Object.freeze(['H1_SAVE']),
 H1_BASELINE_SNAPSHOT:Object.freeze(['H1_BASELINE_SNAPSHOT']),
 FINAL_READBACK:Object.freeze(['FINAL_READBACK']),
});

export const STAGING_V2_CONCRETE_PHASE_STEPS=Object.freeze({
 ...FIXED_PHASE_STEPS,
 STAGING_RULES_ATTESTATION:Object.freeze(['STAGING_RULES_READBACK_ATTESTATION','STAGING_RULES_DEPLOY_AND_ATTEST']),
});

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function exact(value,fields,label){
 if(!plain(value))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 const out={};
 for(const key of fields){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own data field');
  out[key]=descriptor.value;
 }
 return out;
}

function add(left,right,label){
 const total=left+right;
 if(!Number.isSafeInteger(total))throw new Error(label+' count overflow');
 return total;
}

function stepResult(raw,step){
 const value=exact(raw,['capability','receiptHash','readCount','writeCount','firestoreRulesDeployed'],'concrete supervisor '+step+' result');
 if(value.capability===null||(typeof value.capability!=='object'&&typeof value.capability!=='function')||!digest(value.receiptHash)||!count(value.readCount)||!count(value.writeCount)||typeof value.firestoreRulesDeployed!=='boolean')throw new Error('concrete supervisor '+step+' result blocked');
 if(value.firestoreRulesDeployed&&step!=='STAGING_RULES_DEPLOY_AND_ATTEST')throw new Error('concrete supervisor rules deployment claim blocked');
 if(['READINESS_CHECK','BASELINE_ATTESTATION_READBACK','STAGING_RULES_READBACK_ATTESTATION','ATOMIC_PREFLIGHT','FINAL_READBACK'].includes(step)&&(value.writeCount!==0||value.firestoreRulesDeployed))throw new Error('concrete supervisor '+step+' must be read-only');
 if(step==='ATOMIC_PREFLIGHT'&&value.readCount!==12)throw new Error('concrete supervisor atomic preflight must perform exactly 12 reads');
 if(step==='STAGING_RULES_DEPLOY_AND_ATTEST'&&!value.firestoreRulesDeployed)throw new Error('concrete supervisor rules deploy result missing deployment attestation');
 return value;
}

function selectedSteps(phase,manifest){
 if(phase!=='STAGING_RULES_ATTESTATION')return FIXED_PHASE_STEPS[phase];
 return Object.freeze([manifest.firestoreRulesDeployAllowed?'STAGING_RULES_DEPLOY_AND_ATTEST':'STAGING_RULES_READBACK_ATTESTATION']);
}

function phaseCapability({phase,phaseIndex,steps,receiptHash,readCount,writeCount,firestoreRulesDeployed}){
 return Object.freeze({schema:'danbridge-staging-v2-concrete-phase-capability-v1',scope:STAGING_V2_CONCRETE_MANUAL_SUPERVISOR_SCOPE,phase,phaseIndex,steps:Object.freeze([...steps]),receiptHash,readCount,writeCount,firestoreRulesDeployed});
}

export function createStagingV2ConcreteManualSupervisorActions(raw){
 const input=exact(raw,['steps','rollback'],'concrete supervisor config'),steps=exact(input.steps,STAGING_V2_CONCRETE_STEP_NAMES,'concrete supervisor steps');
 for(const name of STAGING_V2_CONCRETE_STEP_NAMES)if(typeof steps[name]!=='function')throw new Error('concrete supervisor step missing '+name);
 if(typeof input.rollback!=='function')throw new Error('concrete supervisor rollback missing');
 const phaseStates=new WeakMap(),executors={};let inFlight=null;
 for(let phaseIndex=0;phaseIndex<STAGING_V2_SUPERVISOR_PHASES.length;phaseIndex++){
  const phase=STAGING_V2_SUPERVISOR_PHASES[phaseIndex];
  executors[phase]=async rawContext=>{
   const context=exact(rawContext,['manifest','phase','priorCapabilities'],'concrete supervisor '+phase+' context');
   if(context.phase!==phase)throw new Error('concrete supervisor phase mismatch');
   const priorStepCapabilities={};
   for(let index=0;index<phaseIndex;index++){
    const priorPhase=STAGING_V2_SUPERVISOR_PHASES[index],priorCapability=context.priorCapabilities[priorPhase],state=phaseStates.get(priorCapability);
    if(!state||state.phase!==priorPhase||state.phaseIndex!==index)throw new Error('concrete supervisor prior phase capability cloned, foreign, or missing');
    Object.assign(priorStepCapabilities,state.stepCapabilities);
   }
   const phaseStepCapabilities={},called=selectedSteps(phase,context.manifest);let readCount=0,writeCount=0,firestoreRulesDeployed=false,previousReceiptHash='0'.repeat(64);inFlight={phase,phaseIndex,stepCapabilities:phaseStepCapabilities};
   for(const step of called){
    const value=stepResult(await steps[step](Object.freeze({manifest:context.manifest,phase,step,priorStepCapabilities:Object.freeze({...priorStepCapabilities}),phaseStepCapabilities:Object.freeze({...phaseStepCapabilities})})),step);
    phaseStepCapabilities[step]=value.capability;
    readCount=add(readCount,value.readCount,phase+' read');writeCount=add(writeCount,value.writeCount,phase+' write');firestoreRulesDeployed=firestoreRulesDeployed||value.firestoreRulesDeployed;
    previousReceiptHash=sha256Canonical({schema:'danbridge-staging-v2-concrete-step-chain-v1',phase,step,previousReceiptHash,receiptHash:value.receiptHash,readCount:value.readCount,writeCount:value.writeCount,firestoreRulesDeployed:value.firestoreRulesDeployed});
   }
   const capability=phaseCapability({phase,phaseIndex,steps:called,receiptHash:previousReceiptHash,readCount,writeCount,firestoreRulesDeployed});
   phaseStates.set(capability,Object.freeze({phase,phaseIndex,stepCapabilities:Object.freeze({...phaseStepCapabilities})}));inFlight=null;
   return Object.freeze({capability,receiptHash:previousReceiptHash,readCount,writeCount,firestoreRulesDeployed});
  };
 }
 const rollback=async rawContext=>{
  const context=exact(rawContext,['manifest','phase','priorCapabilities'],'concrete supervisor rollback context');
  if(context.phase!=='ROLLBACK')throw new Error('concrete supervisor rollback phase mismatch');
  const priorStepCapabilities={};
  for(let index=0;index<STAGING_V2_SUPERVISOR_PHASES.length;index++){
   const phase=STAGING_V2_SUPERVISOR_PHASES[index],priorCapability=context.priorCapabilities[phase];
   if(priorCapability===undefined)break;
   const state=phaseStates.get(priorCapability);
   if(!state||state.phase!==phase||state.phaseIndex!==index)throw new Error('concrete supervisor rollback prior capability cloned or foreign');
   Object.assign(priorStepCapabilities,state.stepCapabilities);
  }
  if(inFlight!==null){
   const expectedIndex=Object.keys(context.priorCapabilities).length;
   if(inFlight.phaseIndex!==expectedIndex||inFlight.phase!==STAGING_V2_SUPERVISOR_PHASES[expectedIndex])throw new Error('concrete supervisor rollback in-flight capability out of order');
   Object.assign(priorStepCapabilities,inFlight.stepCapabilities);
  }
  const value=stepResult(await input.rollback(Object.freeze({manifest:context.manifest,phase:'ROLLBACK',priorStepCapabilities:Object.freeze({...priorStepCapabilities})})),'ROLLBACK');
  if(value.writeCount!==0||value.firestoreRulesDeployed)throw new Error('concrete supervisor rollback must be cleanup-only');
  return value;
 };
 return createStagingV2ManualSupervisorActions({executors:Object.freeze(executors),rollback});
}
