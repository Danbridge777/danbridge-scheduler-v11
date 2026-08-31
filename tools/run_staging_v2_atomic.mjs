import {readFileSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applicationDefault,deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {buildStagingV2AtomicArtifacts,confirmStagingV2AtomicRulesReadbacks,STAGING_V2_ATOMIC_CONFIRMATION,STAGING_V2_ATOMIC_RULES_READBACK_COUNT} from '../js/core/staging-v2-atomic-artifacts.js';
import {createStagingV2ActivationSupervisor,STAGING_V2_ATOMIC_TERMINAL_PHASE,STAGING_V2_SUPERVISOR_PHASES} from '../js/core/staging-v2-activation-supervisor.js';
import {createStagingV2ConcreteManualSupervisorActions} from '../js/core/staging-v2-concrete-manual-supervisor-actions.js';
import {createStagingV2AdminBinderRegistry} from '../js/core/staging-v2-admin-binder-registry.js';
import {createStagingV2AdminSupervisorSteps} from '../js/core/staging-v2-admin-supervisor-steps.js';
import {createStagingV2AdminSupervisorPrimitives} from '../js/core/staging-v2-admin-supervisor-primitives.js';
import {createStagingV2AdminReadinessAdapter} from '../js/core/firebase-staging-v2-readiness-adapter.js';
import {createStagingV2AdminRulesAttestation} from '../js/core/firebase-staging-v2-rules-attestation.js';
import {createFirebaseStagingV2SupervisorJournal} from '../js/core/firebase-staging-v2-supervisor-journal.js';
import {createStagingV2WriterCurrentPrerequisite} from '../js/core/staging-v2-writer-current-prerequisite.js';
import {RECORD_SYNC_V1_WRITER_CURRENT_PATH,RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH} from '../js/core/firebase-record-sync-v1-writer-current-adapter.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PROJECT_ID='danbridge-d8877-staging';
const REPOSITORY='Danbridge777/danbridge-scheduler-v11';

function safeRead(path,label,maxBytes=16384){
 if(typeof path!=='string'||!isAbsolute(path))throw new Error(label+' path blocked');
 let real,info;try{real=realpathSync(path);info=statSync(real)}catch{throw new Error(label+' path blocked')}
 if(real!==path||!info.isFile()||info.isSymbolicLink?.()||info.size<2||info.size>maxBytes||(info.mode&0o077)!==0)throw new Error(label+' file boundary blocked');
 return readFileSync(real,'utf8');
}

async function githubRun(token,runId){
 if(typeof token!=='string'||token.length<20)throw new Error('staging V2 GitHub token blocked');
 const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${runId}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'danbridge-staging-v2-atomic'}});
 if(!response.ok)throw new Error('staging V2 pre-atomic GitHub run lookup blocked');
 const value=await response.json();
 return Object.freeze({schema:'danbridge-staging-v2-pre-atomic-github-run-v1',runId:String(value.id),runAttempt:value.run_attempt,headSha:value.head_sha,headBranch:value.head_branch,event:value.event,status:value.status,conclusion:value.conclusion,repository:value.repository?.full_name,workflowPath:value.path});
}

function environment(){
 const env=process.env,currentGitSha=String(env.GITHUB_SHA??''),runId=`gh_${env.GITHUB_RUN_ID}_${env.GITHUB_RUN_ATTEMPT}_${currentGitSha.slice(0,12)}`;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||env.STAGING_V2_MODE!=='atomic'||env.STAGING_V2_ATOMIC_CONFIRMATION!==STAGING_V2_ATOMIC_CONFIRMATION||!/^gh_[0-9]+_[0-9]+_[a-f0-9]{12}$/.test(runId)||!/^[a-f0-9]{40}$/.test(currentGitSha)||!/^\/[A-Za-z0-9_./-]+$/.test(env.STAGING_V2_PRE_ATOMIC_RECEIPT_PATH??'')||!/^\/[A-Za-z0-9_./-]+$/.test(env.STAGING_V2_RESULT_PATH??''))throw new Error('staging V2 atomic GitHub main boundary blocked');
 const preAtomicRunId=String(env.STAGING_V2_PRE_ATOMIC_RUN_ID??''),preAtomicRunAttempt=Number(env.STAGING_V2_PRE_ATOMIC_RUN_ATTEMPT),preAtomicReceiptSha256=String(env.STAGING_V2_PRE_ATOMIC_RECEIPT_SHA256??'');
 if(!/^[1-9][0-9]{0,19}$/.test(preAtomicRunId)||!Number.isSafeInteger(preAtomicRunAttempt)||preAtomicRunAttempt<1||!/^[a-f0-9]{64}$/.test(preAtomicReceiptSha256))throw new Error('staging V2 atomic pre-atomic input blocked');
 return Object.freeze({runId,currentGitSha,preAtomicRunId,preAtomicRunAttempt,preAtomicReceiptSha256,preAtomicReceiptPath:env.STAGING_V2_PRE_ATOMIC_RECEIPT_PATH,resultPath:env.STAGING_V2_RESULT_PATH,githubToken:env.STAGING_V2_GITHUB_TOKEN});
}

async function main(){
 const runtime=environment(),preAtomicReceiptRaw=safeRead(runtime.preAtomicReceiptPath,'staging V2 pre-atomic receipt'),preAtomicRunMetadata=await githubRun(runtime.githubToken,runtime.preAtomicRunId),app=initializeApp({projectId:PROJECT_ID,credential:applicationDefault()},'staging-v2-atomic-'+runtime.runId),firestore=getFirestore(app);
 try{
  const rulesSource=readFileSync(resolve(ROOT,'firebase/firestore.rules.deploy'),'utf8'),readiness=createStagingV2AdminReadinessAdapter({app,firestore,expectedProjectId:PROJECT_ID}),rules=createStagingV2AdminRulesAttestation({app,expectedProjectId:PROJECT_ID,source:rulesSource}),rulesReadbacks=[];
  let rulesBoundary;
  try{
   for(let index=0;index<STAGING_V2_ATOMIC_RULES_READBACK_COUNT;index++){
    if(index>0)await new Promise(resolveDelay=>setTimeout(resolveDelay,1000));
    rulesReadbacks.push(await rules.preflight());
   }
   rulesBoundary=confirmStagingV2AtomicRulesReadbacks({readbacks:rulesReadbacks});
  }catch(error){
   const output={schema:'danbridge-staging-v2-atomic-preflight-blocked-result-v1',status:'BLOCKED',failureClass:'RULES_PREFLIGHT_BLOCKED',runId:runtime.runId,projectId:PROJECT_ID,preAtomicRunId:runtime.preAtomicRunId,preAtomicRunAttempt:runtime.preAtomicRunAttempt,preAtomicReceiptSha256:runtime.preAtomicReceiptSha256,atomicStarted:false,atomicWriteCount:0,rulesReadbacks,firestoreRulesDeployed:false,productionTouched:false,hostingDeployed:false,timeMachineTouched:false};
   writeFileSync(runtime.resultPath,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',mode:0o600});
   throw error;
  }
  const artifacts=buildStagingV2AtomicArtifacts({root:ROOT,currentRunId:runtime.runId,currentGitSha:runtime.currentGitSha,preAtomicRunId:runtime.preAtomicRunId,preAtomicRunAttempt:runtime.preAtomicRunAttempt,preAtomicReceiptSha256:runtime.preAtomicReceiptSha256,preAtomicReceiptRaw,preAtomicRunMetadata,confirmation:STAGING_V2_ATOMIC_CONFIRMATION,rulesMatch:rulesBoundary.matches});
  const registry=await createStagingV2AdminBinderRegistry({app,firestore,expectedProjectId:PROJECT_ID});
  await createStagingV2WriterCurrentPrerequisite({readiness,writerCurrent:registry.binders.writerCurrent}).run();
  const baselineReadback=async()=>{
   const paths=[RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,RECORD_SYNC_V1_WRITER_CURRENT_PATH],snapshots=await firestore.getAll(...paths.map(path=>firestore.doc(path)));
   if(snapshots.length!==paths.length||snapshots.some(snapshot=>snapshot.exists!==true))throw new Error('staging V2 baseline source document missing');
   const sourceHashes=Object.fromEntries(snapshots.map((snapshot,index)=>[paths[index],sha256Canonical(snapshot.data())]));
   return Object.freeze({capability:Object.freeze({schema:'danbridge-staging-v2-baseline-attestation-readback-v1',projectId:PROJECT_ID,sourceHashes}),readCount:paths.length,writeCount:0});
  };
  const primitives=createStagingV2AdminSupervisorPrimitives({readiness,rules,baselineReadback,gateSourceHashes:artifacts.gateSourceHashes}),wired=createStagingV2AdminSupervisorSteps({registry,primitives}),actions=createStagingV2ConcreteManualSupervisorActions({steps:wired.steps,rollback:wired.rollback}),journal=createFirebaseStagingV2SupervisorJournal({app,firestore,expectedProjectId:PROJECT_ID,runId:runtime.runId}),supervisor=createStagingV2ActivationSupervisor({rawManifest:artifacts.manifest,actions,journal,terminalPhase:STAGING_V2_ATOMIC_TERMINAL_PHASE}),result=await supervisor.run(),rows=await journal.readAll();
  const completedPhases=STAGING_V2_SUPERVISOR_PHASES.slice(0,STAGING_V2_SUPERVISOR_PHASES.indexOf(STAGING_V2_ATOMIC_TERMINAL_PHASE)+1),expectedCount=completedPhases.length*2,atomicRow=rows.find(row=>row.phase==='ATOMIC_ACTIVATION'&&row.event==='completed'),recoveryRow=rows.find(row=>row.phase===STAGING_V2_ATOMIC_TERMINAL_PHASE&&row.event==='completed');
  if(result.status!=='ATOMIC_ACTIVATED_AWAITING_FIRST_DAILY_SAVE'||result.lastPhase!==STAGING_V2_ATOMIC_TERMINAL_PHASE||result.atomicStarted!==true||rows.length!==expectedCount||rows.some(row=>row.hostingDeployed!==false||row.productionTouched!==false||row.timeMachineTouched!==false||row.event==='blocked'||row.phase==='ROLLBACK')||!atomicRow||![0,4].includes(atomicRow.writeCount)||!recoveryRow||recoveryRow.writeCount!==0||rows.some(row=>row.firestoreRulesDeployed!==false))throw new Error('staging V2 atomic terminal state blocked');
  for(let index=0;index<completedPhases.length;index++){
   const phase=completedPhases[index],started=rows[index*2],completed=rows[index*2+1];
   if(started.phase!==phase||started.event!=='started'||completed.phase!==phase||completed.event!=='completed')throw new Error('staging V2 atomic journal order blocked');
  }
  const journalLastHash=rows.at(-1).entryHash;
  const output={schema:'danbridge-staging-v2-atomic-run-result-v1',...result,projectId:PROJECT_ID,preAtomicRunId:runtime.preAtomicRunId,preAtomicRunAttempt:runtime.preAtomicRunAttempt,preAtomicReceiptSha256:runtime.preAtomicReceiptSha256,authorizationHash:artifacts.authorizationHash,requestHash:artifacts.manifest.requestHash,manifestHash:artifacts.manifest.manifestHash,rulesetHash:artifacts.manifest.rulesetHash,journalCount:rows.length,journalLastHash,atomicReceiptHash:atomicRow.receiptHash,atomicWriteCount:atomicRow.writeCount,postCutoverRecoveryReceiptHash:recoveryRow.receiptHash,firstDailySaveRequired:true,firestoreRulesDeployed:false,productionTouched:false,hostingDeployed:false,timeMachineTouched:false};
  writeFileSync(runtime.resultPath,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(output)+'\n');
 }finally{await deleteApp(app)}
}

await main();
