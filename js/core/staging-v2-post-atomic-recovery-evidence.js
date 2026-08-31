import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {STAGING_V2_ATOMIC_TERMINAL_PHASE,verifyStagingV2SupervisorJournal} from './staging-v2-activation-supervisor.js';

export const STAGING_V2_POST_ATOMIC_RECOVERY_STATUS='ATOMIC_ACTIVATED_AWAITING_FIRST_DAILY_SAVE';
const PROJECT_ID='danbridge-d8877-staging';
const RUN_PREFIX='gh_';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

function exact(value,fields,label){
 if(!plain(value))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 return Object.fromEntries(fields.map(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' field blocked');return[key,descriptor.value]}));
}

export function buildStagingV2PostAtomicRecoveryEvidence(raw){
 const input=exact(raw,['runMetadata','rows','recovery'],'post-atomic recovery evidence input'),run=exact(input.runMetadata,['runId','runAttempt','headSha','headBranch','event','status','conclusion','repository','workflowPath'],'post-atomic GitHub run');
 if(!/^[1-9][0-9]{0,19}$/.test(run.runId)||!Number.isSafeInteger(run.runAttempt)||run.runAttempt<1||!/^[a-f0-9]{40}$/.test(run.headSha)||run.headBranch!=='main'||run.event!=='workflow_dispatch'||run.status!=='completed'||run.conclusion!=='failure'||run.repository!=='Danbridge777/danbridge-scheduler-v11'||run.workflowPath!=='.github/workflows/staging-v2-atomic.yml')throw new Error('post-atomic GitHub run blocked');
 const runKey=`${RUN_PREFIX}${run.runId}_${run.runAttempt}_${run.headSha.slice(0,12)}`,chain=verifyStagingV2SupervisorJournal(input.rows,runKey),rows=input.rows;
 const completed=(index,phase,event)=>rows[index]?.phase===phase&&rows[index]?.event===event;
 if(rows.length!==38||!completed(32,'ATOMIC_ACTIVATION','started')||!completed(33,'ATOMIC_ACTIVATION','completed')||!completed(34,STAGING_V2_ATOMIC_TERMINAL_PHASE,'started')||!completed(35,STAGING_V2_ATOMIC_TERMINAL_PHASE,'completed')||!completed(36,'H1_SAVE','started')||!completed(37,'H1_SAVE','blocked')||rows[33].writeCount!==4||rows[35].writeCount!==0||rows.some(row=>row.productionTouched!==false||row.hostingDeployed!==false||row.timeMachineTouched!==false||row.firestoreRulesDeployed!==false)||rows.slice(0,36).some(row=>row.event==='blocked'))throw new Error('post-atomic journal terminal shape blocked');
 const recovery=exact(input.recovery,['state','transactionState','scope','environment','companyId','projectId','sourceV1ActivationEpoch','sourceFreezeId','targetV2Epoch','seedId','identityIndexRootHash','identityIndexRootAuditHash','identityIndexRootPersistedAt','authorityRootHash','candidateControlHash','candidateHeadHash','candidatePairAuditHash','activationIntentHash','activationIntentAuditHash','deploymentAttestationHash','deploymentAttestationAuditHash','deploymentEvidenceHash','deploymentEvidenceAuditHash','rulesetHash','runtimePolicyHash','orderedGateSetHash','candidatePolicyHash','activeHeadHash','activeControlHash','activationReceiptHash','atomicAuditHash','fenceHash','persistedAt','writeCount'],'post-atomic recovery completion');
 if(recovery.state!=='complete-confirmed'||recovery.transactionState!=='recovered'||recovery.scope!=='native-admin-ci-fixed-twelve-document-read-only-post-cutover-recovery-capability-for-first-daily-only'||recovery.environment!=='staging'||recovery.companyId!=='danbridge'||recovery.projectId!==PROJECT_ID||recovery.writeCount!==0||![recovery.identityIndexRootHash,recovery.identityIndexRootAuditHash,recovery.authorityRootHash,recovery.activeHeadHash,recovery.activeControlHash,recovery.activationReceiptHash,recovery.atomicAuditHash,recovery.fenceHash].every(digest))throw new Error('post-atomic recovery completion blocked');
 const body={schema:'danbridge-staging-v2-post-atomic-recovery-result-v1',status:STAGING_V2_POST_ATOMIC_RECOVERY_STATUS,projectId:PROJECT_ID,failedAtomicRunId:run.runId,failedAtomicRunAttempt:run.runAttempt,failedAtomicRunKey:runKey,headSha:run.headSha,journalCount:chain.count,journalLastHash:chain.lastHash,atomicReceiptHash:rows[33].receiptHash,atomicWriteCount:4,postCutoverRecoveryReceiptHash:rows[35].receiptHash,recovery,workflowFailureClass:'ORCHESTRATION_H1_PLACEHOLDER_AFTER_ATOMIC_SUCCESS',firstDailySaveRequired:true,dataWrite:false,firestoreRulesDeployed:false,productionTouched:false,hostingDeployed:false,timeMachineTouched:false};
 return Object.freeze({...body,receiptHash:sha256Canonical(body)});
}
