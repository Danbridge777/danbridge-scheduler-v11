import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {buildFirebaseRecordSyncV2GenesisAllBatchesCompletion} from './firebase-record-sync-v2-genesis-all-batches-capability.js';
import {buildFirebaseRecordSyncV2ChangeReservationAllBatchesCompletion} from './firebase-record-sync-v2-change-reservation-seal-adapter.js';
import {STAGING_V2_ADMIN_BINDER_NAMES,STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE} from './staging-v2-admin-binder-registry.js';
import {STAGING_V2_CONCRETE_STEP_NAMES} from './staging-v2-concrete-manual-supervisor-actions.js';

export const STAGING_V2_ADMIN_SUPERVISOR_STEPS_SCOPE='fixed-admin-binder-to-concrete-supervisor-step-wiring-staging-only-v1';

const PRIMITIVE_NAMES=Object.freeze([
  'readinessCheck',
  'baselineAttestationReadback',
  'rulesReadbackAttestation',
  'rulesDeployAndAttest',
  'deploymentAttestationExpected',
  'h1SaveRequest',
  'h1BaselinePlan',
  'finalReadback',
  'rollback',
]);

const BINDER_METHODS=Object.freeze({
  writerCurrent:Object.freeze(['execute']),
  hardPause:Object.freeze(['execute']),
  postPauseScan:Object.freeze(['executeU','executeV','executePair']),
  rawBackup:Object.freeze(['execute']),
  frozenSourceProof:Object.freeze(['execute']),
  genesisSeedPlan:Object.freeze(['execute']),
  genesisSeedBatch:Object.freeze(['execute']),
  genesisIdentityIndex:Object.freeze(['execute']),
  genesisReadback:Object.freeze(['executeManifest','executeReadback','confirm']),
  genesisAuthority:Object.freeze(['execute']),
  genesisAuthorityReceipt:Object.freeze(['execute']),
  reservationRegistration:Object.freeze(['execute']),
  reservationBatch:Object.freeze(['execute']),
  reservationSeal:Object.freeze(['execute']),
  reservationFinalization:Object.freeze(['execute']),
  reservationReadback:Object.freeze(['execute']),
  reservationAuthority:Object.freeze(['execute']),
  reservationAuthorityReceipt:Object.freeze(['execute']),
  takeoverCandidate:Object.freeze(['execute']),
  cutoverIntent:Object.freeze(['execute']),
  deploymentAttestation:Object.freeze(['execute']),
  trustedDeploymentEvidence:Object.freeze(['execute']),
  atomicActivation:Object.freeze(['preflight','execute','recover']),
  h1Save:Object.freeze(['execute','recover']),
  h1Baseline:Object.freeze(['execute']),
});

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const count=value=>Number.isSafeInteger(value)&&value>=0;

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

function capability(value,label){
  if(value===null||(typeof value!=='object'&&typeof value!=='function'))throw new Error(label+' capability invalid');
  return value;
}

function add(left,right,label){
  const value=left+right;
  if(!Number.isSafeInteger(value))throw new Error(label+' count overflow');
  return value;
}

function publicCount(value,key){
  const descriptor=value!==null&&(typeof value==='object'||typeof value==='function')?Object.getOwnPropertyDescriptor(value,key):null;
  if(!descriptor)return null;
  if(!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!count(descriptor.value))throw new Error('admin supervisor '+key+' invalid');
  return descriptor.value;
}

function observedCounts(value){
  const readCount=publicCount(value,'totalReadCount')??publicCount(value,'readCount')??0;
  const writeCount=publicCount(value,'writeCount')??0;
  return{readCount,writeCount};
}

function result(step,value,counts=observedCounts(value),firestoreRulesDeployed=false){
  const native=capability(value,'admin supervisor '+step),readCount=counts.readCount,writeCount=counts.writeCount;
  if(!count(readCount)||!count(writeCount)||typeof firestoreRulesDeployed!=='boolean')throw new Error('admin supervisor '+step+' counts invalid');
  return Object.freeze({
    capability:native,
    receiptHash:sha256Canonical({schema:'danbridge-staging-v2-admin-supervisor-step-receipt-v1',step,capability:native,readCount,writeCount,firestoreRulesDeployed}),
    readCount,
    writeCount,
    firestoreRulesDeployed,
  });
}

function primitiveResult(step,raw,{readOnly=false,rulesDeployed=false}={}){
  const value=exact(raw,['capability','readCount','writeCount'],'admin supervisor '+step+' primitive result');
  if(!count(value.readCount)||!count(value.writeCount)||(readOnly&&value.writeCount!==0))throw new Error('admin supervisor '+step+' primitive count blocked');
  return result(step,value.capability,{readCount:value.readCount,writeCount:value.writeCount},rulesDeployed);
}

function context(raw,step){
  const value=exact(raw,['manifest','phase','step','priorStepCapabilities','phaseStepCapabilities'],'admin supervisor '+step+' context');
  if(value.step!==step||!plain(value.priorStepCapabilities)||!plain(value.phaseStepCapabilities))throw new Error('admin supervisor '+step+' context blocked');
  return value;
}

function prior(value,name){
  if(!Object.prototype.hasOwnProperty.call(value.priorStepCapabilities,name))throw new Error('admin supervisor '+value.step+' prior capability missing '+name);
  return capability(value.priorStepCapabilities[name],'admin supervisor '+value.step+' prior '+name);
}

function phasePrior(value,name){
  if(!Object.prototype.hasOwnProperty.call(value.phaseStepCapabilities,name))throw new Error('admin supervisor '+value.step+' phase capability missing '+name);
  return capability(value.phaseStepCapabilities[name],'admin supervisor '+value.step+' phase '+name);
}

function batchCount(value,label){
  const amount=publicCount(value,'batchCount');
  if(amount===null||amount<1||amount>100000)throw new Error(label+' batchCount invalid');
  return amount;
}

function sumCounts(rows){
  let readCount=0,writeCount=0;
  for(const row of rows){
    const counts=observedCounts(row);
    readCount=add(readCount,counts.readCount,'admin supervisor read');
    writeCount=add(writeCount,counts.writeCount,'admin supervisor write');
  }
  return{readCount,writeCount};
}

function registry(raw){
  const value=exact(raw,['scope','projectId','binders'],'admin supervisor registry');
  if(value.scope!==STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE||value.projectId!=='danbridge-d8877-staging'||!plain(value.binders))throw new Error('admin supervisor registry identity blocked');
  const keys=Reflect.ownKeys(value.binders);
  if(keys.length!==STAGING_V2_ADMIN_BINDER_NAMES.length||keys.some(key=>typeof key!=='string'||!STAGING_V2_ADMIN_BINDER_NAMES.includes(key)))throw new Error('admin supervisor binder inventory blocked');
  for(const name of STAGING_V2_ADMIN_BINDER_NAMES){
    const binder=value.binders[name];
    if(!binder||typeof binder!=='object'||typeof binder.scope!=='string')throw new Error('admin supervisor binder invalid '+name);
    for(const method of BINDER_METHODS[name]??[])if(typeof binder[method]!=='function')throw new Error('admin supervisor binder method missing '+name+'.'+method);
  }
  return value.binders;
}

function primitives(raw){
  const value=exact(raw,PRIMITIVE_NAMES,'admin supervisor primitives');
  for(const name of PRIMITIVE_NAMES)if(typeof value[name]!=='function')throw new Error('admin supervisor primitive missing '+name);
  return value;
}

export function createStagingV2AdminSupervisorSteps(raw){
  const input=exact(raw,['registry','primitives'],'admin supervisor config'),binders=registry(input.registry),external=primitives(input.primitives),steps={};

  steps.READINESS_CHECK=async rawContext=>primitiveResult('READINESS_CHECK',await external.readinessCheck(context(rawContext,'READINESS_CHECK')),{readOnly:true});
  steps.BASELINE_ATTESTATION_READBACK=async rawContext=>primitiveResult('BASELINE_ATTESTATION_READBACK',await external.baselineAttestationReadback(context(rawContext,'BASELINE_ATTESTATION_READBACK')),{readOnly:true});
  steps.HARD_PAUSE=async rawContext=>{const value=context(rawContext,'HARD_PAUSE');return result(value.step,await binders.hardPause.execute(prior(value,'READINESS_CHECK')))};
  steps.POST_PAUSE_SCAN_U=async rawContext=>{const value=context(rawContext,'POST_PAUSE_SCAN_U');return result(value.step,await binders.postPauseScan.executeU(prior(value,'HARD_PAUSE')))};
  steps.POST_PAUSE_SCAN_V=async rawContext=>{const value=context(rawContext,'POST_PAUSE_SCAN_V');return result(value.step,await binders.postPauseScan.executeV(phasePrior(value,'POST_PAUSE_SCAN_U')))};
  steps.POST_PAUSE_SCAN_PAIR=async rawContext=>{const value=context(rawContext,'POST_PAUSE_SCAN_PAIR');return result(value.step,await binders.postPauseScan.executePair(phasePrior(value,'POST_PAUSE_SCAN_V')))};
  steps.RAW_BACKUP=async rawContext=>{const value=context(rawContext,'RAW_BACKUP');return result(value.step,await binders.rawBackup.execute(prior(value,'POST_PAUSE_SCAN_V'),prior(value,'POST_PAUSE_SCAN_PAIR')))};
  steps.FROZEN_SOURCE_PROOF=async rawContext=>{const value=context(rawContext,'FROZEN_SOURCE_PROOF');return result(value.step,await binders.frozenSourceProof.execute(prior(value,'RAW_BACKUP')))};
  steps.GENESIS_SEED_PLAN=async rawContext=>{const value=context(rawContext,'GENESIS_SEED_PLAN');return result(value.step,await binders.genesisSeedPlan.execute(prior(value,'FROZEN_SOURCE_PROOF')))};
  steps.GENESIS_SEED_BATCHES=async rawContext=>{const value=context(rawContext,'GENESIS_SEED_BATCHES'),g0=phasePrior(value,'GENESIS_SEED_PLAN'),rows=[];for(let index=0;index<batchCount(g0,'admin supervisor G0');index++)rows.push(await binders.genesisSeedBatch.execute(g0,index));return result(value.step,await buildFirebaseRecordSyncV2GenesisAllBatchesCompletion(g0,rows),sumCounts(rows))};
  steps.GENESIS_IDENTITY_INDEX=async rawContext=>{const value=context(rawContext,'GENESIS_IDENTITY_INDEX');return result(value.step,await binders.genesisIdentityIndex.execute(prior(value,'GENESIS_SEED_BATCHES')))};
  steps.GENESIS_SEED_READBACK_MANIFEST=async rawContext=>{const value=context(rawContext,'GENESIS_SEED_READBACK_MANIFEST');return result(value.step,await binders.genesisReadback.executeManifest(prior(value,'GENESIS_SEED_BATCHES'),prior(value,'GENESIS_IDENTITY_INDEX')))};
  steps.GENESIS_SEED_READBACK_RECEIPT=async rawContext=>{const value=context(rawContext,'GENESIS_SEED_READBACK_RECEIPT');return result(value.step,await binders.genesisReadback.executeReadback(phasePrior(value,'GENESIS_SEED_READBACK_MANIFEST')))};
  steps.GENESIS_SEED_READBACK_CONFIRM=async rawContext=>{const value=context(rawContext,'GENESIS_SEED_READBACK_CONFIRM');return result(value.step,await binders.genesisReadback.confirm(phasePrior(value,'GENESIS_SEED_READBACK_RECEIPT')))};
  steps.GENESIS_AUTHORITY=async rawContext=>{const value=context(rawContext,'GENESIS_AUTHORITY');return result(value.step,await binders.genesisAuthority.execute(phasePrior(value,'GENESIS_SEED_READBACK_CONFIRM')))};
  steps.GENESIS_AUTHORITY_AUDIT_RECEIPT=async rawContext=>{const value=context(rawContext,'GENESIS_AUTHORITY_AUDIT_RECEIPT');return result(value.step,await binders.genesisAuthorityReceipt.execute(phasePrior(value,'GENESIS_AUTHORITY')))};
  steps.RESERVATION_REGISTRATION=async rawContext=>{const value=context(rawContext,'RESERVATION_REGISTRATION');return result(value.step,await binders.reservationRegistration.execute(prior(value,'GENESIS_AUTHORITY_AUDIT_RECEIPT')))};
  steps.RESERVATION_BATCHES=async rawContext=>{const value=context(rawContext,'RESERVATION_BATCHES'),r0=phasePrior(value,'RESERVATION_REGISTRATION'),rows=[];for(let index=0;index<batchCount(r0,'admin supervisor R0');index++)rows.push(await binders.reservationBatch.execute(r0,index));return result(value.step,buildFirebaseRecordSyncV2ChangeReservationAllBatchesCompletion(r0,rows),sumCounts(rows))};
  steps.RESERVATION_BATCH_SET_SEAL=async rawContext=>{const value=context(rawContext,'RESERVATION_BATCH_SET_SEAL');return result(value.step,await binders.reservationSeal.execute(phasePrior(value,'RESERVATION_BATCHES')))};
  steps.RESERVATION_FINALIZATION=async rawContext=>{const value=context(rawContext,'RESERVATION_FINALIZATION');return result(value.step,await binders.reservationFinalization.execute(phasePrior(value,'RESERVATION_BATCH_SET_SEAL')))};
  steps.RESERVATION_READBACK=async rawContext=>{const value=context(rawContext,'RESERVATION_READBACK');return result(value.step,await binders.reservationReadback.execute(phasePrior(value,'RESERVATION_FINALIZATION')))};
  steps.RESERVATION_AUTHORITY=async rawContext=>{const value=context(rawContext,'RESERVATION_AUTHORITY');return result(value.step,await binders.reservationAuthority.execute(phasePrior(value,'RESERVATION_READBACK')))};
  steps.RESERVATION_AUTHORITY_AUDIT_RECEIPT=async rawContext=>{const value=context(rawContext,'RESERVATION_AUTHORITY_AUDIT_RECEIPT');return result(value.step,await binders.reservationAuthorityReceipt.execute(phasePrior(value,'RESERVATION_AUTHORITY')))};
  steps.TAKEOVER_CANDIDATE=async rawContext=>{const value=context(rawContext,'TAKEOVER_CANDIDATE');return result(value.step,await binders.takeoverCandidate.execute(prior(value,'GENESIS_AUTHORITY'),prior(value,'RESERVATION_AUTHORITY_AUDIT_RECEIPT')))};
  steps.CUTOVER_INTENT=async rawContext=>{const value=context(rawContext,'CUTOVER_INTENT');return result(value.step,await binders.cutoverIntent.execute(prior(value,'TAKEOVER_CANDIDATE')))};
  steps.STAGING_RULES_READBACK_ATTESTATION=async rawContext=>primitiveResult('STAGING_RULES_READBACK_ATTESTATION',await external.rulesReadbackAttestation(context(rawContext,'STAGING_RULES_READBACK_ATTESTATION')),{readOnly:true});
  steps.STAGING_RULES_DEPLOY_AND_ATTEST=async rawContext=>primitiveResult('STAGING_RULES_DEPLOY_AND_ATTEST',await external.rulesDeployAndAttest(context(rawContext,'STAGING_RULES_DEPLOY_AND_ATTEST')),{rulesDeployed:true});
  steps.DEPLOYMENT_ATTESTATION=async rawContext=>{const value=context(rawContext,'DEPLOYMENT_ATTESTATION'),expected=await external.deploymentAttestationExpected(value);return result(value.step,await binders.deploymentAttestation.execute(expected))};
  steps.TRUSTED_DEPLOYMENT_EVIDENCE=async rawContext=>{const value=context(rawContext,'TRUSTED_DEPLOYMENT_EVIDENCE');return result(value.step,await binders.trustedDeploymentEvidence.execute(prior(value,'CUTOVER_INTENT'),prior(value,'DEPLOYMENT_ATTESTATION')))};
  steps.ATOMIC_PREFLIGHT=async rawContext=>{const value=context(rawContext,'ATOMIC_PREFLIGHT'),native=await binders.atomicActivation.preflight(prior(value,'TRUSTED_DEPLOYMENT_EVIDENCE')),counts=observedCounts(native);if(counts.readCount!==12||counts.writeCount!==0)throw new Error('admin supervisor atomic preflight count blocked');return result(value.step,native,counts)};
  steps.ATOMIC_ACTIVATION=async rawContext=>{const value=context(rawContext,'ATOMIC_ACTIVATION');return result(value.step,await binders.atomicActivation.execute(prior(value,'TRUSTED_DEPLOYMENT_EVIDENCE')))};
  steps.POST_CUTOVER_RECOVERY=async rawContext=>{const value=context(rawContext,'POST_CUTOVER_RECOVERY');return result(value.step,await binders.atomicActivation.recover())};
  steps.H1_SAVE=async rawContext=>{const value=context(rawContext,'H1_SAVE'),request=await external.h1SaveRequest(value);return result(value.step,await binders.h1Save.execute(prior(value,'POST_CUTOVER_RECOVERY'),request))};
  steps.H1_BASELINE_SNAPSHOT=async rawContext=>{const value=context(rawContext,'H1_BASELINE_SNAPSHOT'),plan=await external.h1BaselinePlan(value);return result(value.step,await binders.h1Baseline.execute(plan))};
  steps.FINAL_READBACK=async rawContext=>primitiveResult('FINAL_READBACK',await external.finalReadback(context(rawContext,'FINAL_READBACK')),{readOnly:true});

  const keys=Reflect.ownKeys(steps);
  if(keys.length!==STAGING_V2_CONCRETE_STEP_NAMES.length||keys.some(key=>typeof key!=='string'||!STAGING_V2_CONCRETE_STEP_NAMES.includes(key)))throw new Error('admin supervisor concrete step inventory blocked');
  const rollback=async rawContext=>primitiveResult('ROLLBACK',await external.rollback(rawContext),{readOnly:true});
  return Object.freeze({scope:STAGING_V2_ADMIN_SUPERVISOR_STEPS_SCOPE,steps:Object.freeze(steps),rollback});
}
