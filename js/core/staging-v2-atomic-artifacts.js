import {createHash} from 'node:crypto';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {buildStagingV2PreAtomicArtifacts} from './staging-v2-pre-atomic-artifacts.js';

export const STAGING_V2_ATOMIC_ARTIFACTS_SCOPE='exact-successful-pre-atomic-receipt-and-github-run-bound-atomic-manifest-v1';
export const STAGING_V2_ATOMIC_CONFIRMATION='STAGING_V2_ATOMIC_ACTIVATION';
export const STAGING_V2_ATOMIC_RULES_READBACK_COUNT=3;

const PROJECT_ID='danbridge-d8877-staging';
const REPOSITORY='Danbridge777/danbridge-scheduler-v11';
const WORKFLOW_PATH='.github/workflows/staging-v2-pre-atomic.yml';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const gitSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>0;
const numeric=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
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

function receipt(raw){
 if(typeof raw!=='string'||raw.length<2||raw.length>16384)throw new Error('staging V2 pre-atomic receipt raw blocked');
 let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('staging V2 pre-atomic receipt JSON blocked')}
 const value=exact(parsed,['schema','status','runId','lastPhase','atomicStarted','projectId','requestHash','manifestHash','rulesetHash','firestoreRulesDeployed','productionTouched','hostingDeployed','timeMachineTouched'],'staging V2 pre-atomic receipt');
 if(value.schema!=='danbridge-staging-v2-pre-atomic-run-result-v1'||value.status!=='PRE_ATOMIC_READY'||value.lastPhase!=='PRE_ATOMIC_GATE'||value.atomicStarted!==false||value.projectId!==PROJECT_ID||!digest(value.requestHash)||!digest(value.manifestHash)||!digest(value.rulesetHash)||typeof value.firestoreRulesDeployed!=='boolean'||value.productionTouched!==false||value.hostingDeployed!==false||value.timeMachineTouched!==false)throw new Error('staging V2 pre-atomic receipt blocked');
 return value;
}

function metadata(raw){
 const value=exact(raw,['schema','runId','runAttempt','headSha','headBranch','event','status','conclusion','repository','workflowPath'],'staging V2 pre-atomic GitHub run');
 if(value.schema!=='danbridge-staging-v2-pre-atomic-github-run-v1'||!numeric(value.runId)||!integer(value.runAttempt)||!gitSha(value.headSha)||value.headBranch!=='main'||value.event!=='workflow_dispatch'||value.status!=='completed'||value.conclusion!=='success'||value.repository!==REPOSITORY||value.workflowPath!==WORKFLOW_PATH)throw new Error('staging V2 pre-atomic GitHub run blocked');
 return value;
}

export function confirmStagingV2AtomicRulesReadbacks(raw){
 const input=exact(raw,['readbacks'],'staging V2 atomic Rules readback input');
 if(!Array.isArray(input.readbacks)||input.readbacks.length!==STAGING_V2_ATOMIC_RULES_READBACK_COUNT)throw new Error('staging V2 atomic Rules readback count blocked');
 const rows=input.readbacks.map((rawRow,index)=>{
  const row=exact(rawRow,['matches','activeRulesetHash','expectedRulesetHash','readCount','writeCount'],`staging V2 atomic Rules readback ${index}`);
  if(typeof row.matches!=='boolean'||(row.activeRulesetHash!==null&&!digest(row.activeRulesetHash))||!digest(row.expectedRulesetHash)||row.readCount!==1||row.writeCount!==0||row.matches!==(row.activeRulesetHash===row.expectedRulesetHash))throw new Error('staging V2 atomic Rules readback blocked');
  return row;
 });
 if(new Set(rows.map(row=>row.expectedRulesetHash)).size!==1||rows.at(-2).matches!==true||rows.at(-1).matches!==true)throw new Error('staging V2 atomic Rules stability blocked');
 return Object.freeze({matches:true,readCount:rows.length,writeCount:0,activeRulesetHash:rows.at(-1).activeRulesetHash,expectedRulesetHash:rows.at(-1).expectedRulesetHash});
}

export function buildStagingV2AtomicArtifacts(raw){
 const input=exact(raw,['root','currentRunId','currentGitSha','preAtomicRunId','preAtomicRunAttempt','preAtomicReceiptSha256','preAtomicReceiptRaw','preAtomicRunMetadata','confirmation','rulesMatch'],'staging V2 atomic artifact input');
 if(typeof input.root!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(input.currentRunId)||!gitSha(input.currentGitSha)||!numeric(input.preAtomicRunId)||!integer(input.preAtomicRunAttempt)||!digest(input.preAtomicReceiptSha256)||input.confirmation!==STAGING_V2_ATOMIC_CONFIRMATION||input.rulesMatch!==true)throw new Error('staging V2 atomic authorization boundary blocked');
 if(createHash('sha256').update(input.preAtomicReceiptRaw).digest('hex')!==input.preAtomicReceiptSha256)throw new Error('staging V2 pre-atomic receipt hash blocked');
 const preReceipt=receipt(input.preAtomicReceiptRaw),run=metadata(input.preAtomicRunMetadata);
 if(run.runId!==input.preAtomicRunId||run.runAttempt!==input.preAtomicRunAttempt||run.headSha!==input.currentGitSha||preReceipt.runId!==`gh_${run.runId}_${run.runAttempt}_${run.headSha.slice(0,12)}`)throw new Error('staging V2 pre-atomic run lineage blocked');
 const preArtifacts=buildStagingV2PreAtomicArtifacts({root:input.root,runId:preReceipt.runId,firestoreRulesDeployAllowed:preReceipt.firestoreRulesDeployed});
 if(preArtifacts.manifest.requestHash!==preReceipt.requestHash||preArtifacts.manifest.manifestHash!==preReceipt.manifestHash||preArtifacts.manifest.rulesetHash!==preReceipt.rulesetHash)throw new Error('staging V2 pre-atomic source lineage blocked');
 const current=buildStagingV2PreAtomicArtifacts({root:input.root,runId:input.currentRunId,firestoreRulesDeployAllowed:false});
 if(current.manifest.requestHash!==preReceipt.requestHash||current.manifest.rulesetHash!==preReceipt.rulesetHash)throw new Error('staging V2 atomic current source lineage blocked');
 const manifestBody={...current.manifest,atomicActivationAllowed:true};delete manifestBody.manifestHash;
 const manifest=Object.freeze({...manifestBody,manifestHash:sha256Canonical(manifestBody)});
 const authorizationHash=sha256Canonical({schema:'danbridge-staging-v2-atomic-authorization-v1',confirmation:input.confirmation,projectId:PROJECT_ID,preAtomicRunId:input.preAtomicRunId,preAtomicRunAttempt:input.preAtomicRunAttempt,preAtomicReceiptSha256:input.preAtomicReceiptSha256,requestHash:preReceipt.requestHash,currentGitSha:input.currentGitSha});
 return Object.freeze({scope:STAGING_V2_ATOMIC_ARTIFACTS_SCOPE,rulesSource:current.rulesSource,gateSourceHashes:current.gateSourceHashes,manifest,preAtomicReceipt:Object.freeze(preReceipt),authorizationHash});
}
