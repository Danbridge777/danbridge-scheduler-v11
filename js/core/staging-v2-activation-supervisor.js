import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const STAGING_V2_SUPERVISOR_PHASES=Object.freeze([
 'READINESS',
 'BASELINE_ATTESTATION',
 'HARD_PAUSE',
 'POST_PAUSE_SCAN',
 'RAW_BACKUP',
 'FROZEN_SOURCE_PROOF',
 'GENESIS_SEED',
 'GENESIS_IDENTITY_INDEX',
 'GENESIS_AUTHORITY',
 'RESERVATION',
 'TAKEOVER_CANDIDATE',
 'CUTOVER_INTENT',
 'STAGING_RULES_ATTESTATION',
 'DEPLOYMENT_ATTESTATION',
 'TRUSTED_DEPLOYMENT_EVIDENCE',
 'PRE_ATOMIC_GATE',
 'ATOMIC_ACTIVATION',
 'POST_CUTOVER_RECOVERY',
 'H1_SAVE',
 'H1_BASELINE_SNAPSHOT',
 'FINAL_READBACK',
]);

export const STAGING_V2_PRE_ATOMIC_PHASE='PRE_ATOMIC_GATE';
export const STAGING_V2_ATOMIC_PHASE='ATOMIC_ACTIVATION';
export const STAGING_V2_ATOMIC_TERMINAL_PHASE='POST_CUTOVER_RECOVERY';

const PROJECT_ID='danbridge-d8877-staging';
const SERVICE_ACCOUNT='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;

function data(value,label){
 if(value===null||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be a plain data object');
 const output={};
 for(const key of Object.keys(value)){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+' accessor blocked');
  output[key]=descriptor.value;
 }
 return output;
}

function exact(value,keys,label){
 const row=data(value,label),actual=Object.keys(row).sort(),expected=[...keys].sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(label+' fields invalid');
 return row;
}

function manifest(raw){
 const keys=['schema','runId','requestHash','environment','companyId','projectId','serviceAccountEmail','rulesetHash','runtimePolicyHash','runtimeAdapterHash','clientWiringHash','firestoreRulesDeployAllowed','hostingDeployAllowed','productionAllowed','timeMachineAllowed','atomicActivationAllowed','manifestHash'];
 const value=exact(raw,keys,'staging V2 supervisor manifest');
 const body={...value};delete body.manifestHash;
 if(value.schema!=='danbridge-staging-v2-activation-supervisor-manifest-v1'||!token(value.runId)||!digest(value.requestHash)||value.environment!=='staging'||value.companyId!=='danbridge'||value.projectId!==PROJECT_ID||value.serviceAccountEmail!==SERVICE_ACCOUNT||!digest(value.rulesetHash)||!digest(value.runtimePolicyHash)||!digest(value.runtimeAdapterHash)||!digest(value.clientWiringHash)||typeof value.firestoreRulesDeployAllowed!=='boolean'||value.hostingDeployAllowed!==false||value.productionAllowed!==false||value.timeMachineAllowed!==false||typeof value.atomicActivationAllowed!=='boolean'||!digest(value.manifestHash)||sha256Canonical(body)!==value.manifestHash)throw new Error('staging V2 supervisor manifest blocked');
 return Object.freeze({...value});
}

function result(raw,phase){
 const keys=['schema','phase','status','receiptHash','readCount','writeCount','firestoreRulesDeployed','hostingDeployed','productionTouched','timeMachineTouched','capability'];
 const value=exact(raw,keys,'staging V2 phase result');
 if(value.schema!=='danbridge-staging-v2-supervisor-phase-result-v1'||value.phase!==phase||value.status!=='complete'||!digest(value.receiptHash)||!integer(value.readCount)||!integer(value.writeCount)||typeof value.firestoreRulesDeployed!=='boolean'||value.hostingDeployed!==false||value.productionTouched!==false||value.timeMachineTouched!==false||(value.firestoreRulesDeployed&&phase!=='STAGING_RULES_ATTESTATION')||value.capability===null||(typeof value.capability!=='object'&&typeof value.capability!=='function'))throw new Error('staging V2 phase result blocked');
 return value;
}

function entry({runId,sequence,phase,event,previousHash,receiptHash='',readCount=0,writeCount=0,firestoreRulesDeployed=false}){
 const body={schema:'danbridge-staging-v2-supervisor-journal-entry-v1',runId,sequence,phase,event,previousHash,receiptHash,readCount,writeCount,firestoreRulesDeployed,hostingDeployed:false,productionTouched:false,timeMachineTouched:false};
 return Object.freeze({...body,entryHash:sha256Canonical(body)});
}

export function verifyStagingV2SupervisorJournal(rawRows,runId){
 if(!Array.isArray(rawRows))throw new Error('staging V2 journal readback blocked');
 let previousHash='0'.repeat(64);
 for(let index=0;index<rawRows.length;index++){
  const row=exact(rawRows[index],['schema','runId','sequence','phase','event','previousHash','receiptHash','readCount','writeCount','firestoreRulesDeployed','hostingDeployed','productionTouched','timeMachineTouched','entryHash'],'staging V2 journal row');
  const body={...row};delete body.entryHash;
  if(row.schema!=='danbridge-staging-v2-supervisor-journal-entry-v1'||row.runId!==runId||row.sequence!==index||row.previousHash!==previousHash||![...STAGING_V2_SUPERVISOR_PHASES,'ROLLBACK'].includes(row.phase)||!['started','completed','blocked','ready-for-separate-atomic-authorization'].includes(row.event)||!digest(row.entryHash)||sha256Canonical(body)!==row.entryHash||row.hostingDeployed!==false||row.productionTouched!==false||row.timeMachineTouched!==false)throw new Error('staging V2 journal chain blocked');
  previousHash=row.entryHash;
 }
 return Object.freeze({count:rawRows.length,lastHash:previousHash});
}

export function createStagingV2ActivationSupervisor({rawManifest,actions,journal,terminalPhase='FINAL_READBACK'}={}){
 const fixedManifest=manifest(rawManifest),actionMap=exact(actions,[...STAGING_V2_SUPERVISOR_PHASES,'ROLLBACK'],'staging V2 supervisor actions'),journalApi=exact(journal,['append','readAll'],'staging V2 supervisor journal');
 const terminalIndex=STAGING_V2_SUPERVISOR_PHASES.indexOf(terminalPhase);
 if(terminalIndex<STAGING_V2_SUPERVISOR_PHASES.indexOf(STAGING_V2_ATOMIC_PHASE)||![STAGING_V2_ATOMIC_TERMINAL_PHASE,'FINAL_READBACK'].includes(terminalPhase))throw new Error('staging V2 supervisor terminal phase blocked');
 for(const name of [...STAGING_V2_SUPERVISOR_PHASES,'ROLLBACK'])if(typeof actionMap[name]!=='function')throw new Error('staging V2 supervisor action missing '+name);
 if(typeof journalApi.append!=='function'||typeof journalApi.readAll!=='function')throw new Error('staging V2 supervisor journal incomplete');
 let used=false;
 const append=async payload=>{
  const before=verifyStagingV2SupervisorJournal(await journalApi.readAll(),fixedManifest.runId),row=entry({...payload,runId:fixedManifest.runId,sequence:before.count,previousHash:before.lastHash});
  await journalApi.append(row);
  const after=verifyStagingV2SupervisorJournal(await journalApi.readAll(),fixedManifest.runId);
  if(after.count!==before.count+1||after.lastHash!==row.entryHash)throw new Error('staging V2 journal append not durable');
  return row;
 };
 return Object.freeze({
  manifest:fixedManifest,
  async run(){
   if(used)throw new Error('staging V2 supervisor is one-shot');used=true;
   if(verifyStagingV2SupervisorJournal(await journalApi.readAll(),fixedManifest.runId).count!==0)throw new Error('staging V2 supervisor journal must start empty');
   let capability=Object.freeze({schema:'danbridge-staging-v2-supervisor-start-capability-v1'}),atomicStarted=false,lastPhase='';
   try{
    for(const phase of STAGING_V2_SUPERVISOR_PHASES.slice(0,terminalIndex+1)){
     if(phase===STAGING_V2_ATOMIC_PHASE&&!fixedManifest.atomicActivationAllowed){
      await append({phase:STAGING_V2_PRE_ATOMIC_PHASE,event:'ready-for-separate-atomic-authorization'});
      return Object.freeze({status:'PRE_ATOMIC_READY',runId:fixedManifest.runId,lastPhase:STAGING_V2_PRE_ATOMIC_PHASE,atomicStarted:false});
     }
     if(phase===STAGING_V2_ATOMIC_PHASE)atomicStarted=true;
     lastPhase=phase;await append({phase,event:'started'});
     const completed=result(await actionMap[phase](Object.freeze({manifest:fixedManifest,phase,capability})),phase);
     if(completed.firestoreRulesDeployed&&!fixedManifest.firestoreRulesDeployAllowed)throw new Error('staging Firestore Rules deployment not authorized');
     capability=completed.capability;
     await append({phase,event:'completed',receiptHash:completed.receiptHash,readCount:completed.readCount,writeCount:completed.writeCount,firestoreRulesDeployed:completed.firestoreRulesDeployed});
    }
    return Object.freeze({status:terminalPhase===STAGING_V2_ATOMIC_TERMINAL_PHASE?'ATOMIC_ACTIVATED_AWAITING_FIRST_DAILY_SAVE':'COMPLETE',runId:fixedManifest.runId,lastPhase:terminalPhase,atomicStarted:true});
   }catch(error){
    await append({phase:lastPhase||'READINESS',event:'blocked'});
    if(atomicStarted)throw new Error('staging V2 terminal blocked after atomic start; recovery evidence retained',{cause:error});
    await append({phase:'ROLLBACK',event:'started'});
    const rolled=result(await actionMap.ROLLBACK(Object.freeze({manifest:fixedManifest,phase:'ROLLBACK',capability})), 'ROLLBACK');
    if(rolled.writeCount>0||rolled.firestoreRulesDeployed)throw new Error('staging V2 rollback exceeded cleanup-only boundary',{cause:error});
    await append({phase:'ROLLBACK',event:'completed',receiptHash:rolled.receiptHash,readCount:rolled.readCount,writeCount:0});
    throw new Error('staging V2 blocked and pre-atomic rollback confirmed',{cause:error});
   }
  },
 });
}
