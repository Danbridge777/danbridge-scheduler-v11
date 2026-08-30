import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applicationDefault,deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {createStagingV2ActivationSupervisor} from '../js/core/staging-v2-activation-supervisor.js';
import {createStagingV2ConcreteManualSupervisorActions} from '../js/core/staging-v2-concrete-manual-supervisor-actions.js';
import {createStagingV2AdminBinderRegistry} from '../js/core/staging-v2-admin-binder-registry.js';
import {createStagingV2AdminSupervisorSteps} from '../js/core/staging-v2-admin-supervisor-steps.js';
import {createStagingV2AdminSupervisorPrimitives} from '../js/core/staging-v2-admin-supervisor-primitives.js';
import {buildStagingV2PreAtomicArtifacts} from '../js/core/staging-v2-pre-atomic-artifacts.js';
import {createStagingV2AdminReadinessAdapter} from '../js/core/firebase-staging-v2-readiness-adapter.js';
import {createStagingV2AdminRulesAttestation} from '../js/core/firebase-staging-v2-rules-attestation.js';
import {createFirebaseStagingV2SupervisorJournal} from '../js/core/firebase-staging-v2-supervisor-journal.js';
import {createStagingV2WriterCurrentPrerequisite} from '../js/core/staging-v2-writer-current-prerequisite.js';
import {RECORD_SYNC_V1_WRITER_CURRENT_PATH,RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH} from '../js/core/firebase-record-sync-v1-writer-current-adapter.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PROJECT_ID='danbridge-d8877-staging';

function environment(){
 const env=process.env,runId=`gh_${env.GITHUB_RUN_ID}_${env.GITHUB_RUN_ATTEMPT}_${String(env.GITHUB_SHA??'').slice(0,12)}`;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='Danbridge777/danbridge-scheduler-v11'||env.GITHUB_REF!=='refs/heads/main'||env.STAGING_V2_MODE!=='pre-atomic'||!/^gh_[0-9]+_[0-9]+_[a-f0-9]{12}$/.test(runId))throw new Error('staging V2 pre-atomic GitHub main boundary blocked');
 return{runId,resultPath:env.STAGING_V2_RESULT_PATH||resolve(ROOT,'staging-v2-pre-atomic-result.json')};
}

async function main(){
 const runtime=environment(),app=initializeApp({projectId:PROJECT_ID,credential:applicationDefault()},'staging-v2-pre-atomic-'+runtime.runId),firestore=getFirestore(app);
 try{
  const rulesSource=readFileSync(resolve(ROOT,'firebase/firestore.rules.deploy'),'utf8'),readiness=createStagingV2AdminReadinessAdapter({app,firestore,expectedProjectId:PROJECT_ID}),rules=createStagingV2AdminRulesAttestation({app,expectedProjectId:PROJECT_ID,source:rulesSource}),preflight=await rules.preflight(),artifacts=buildStagingV2PreAtomicArtifacts({root:ROOT,runId:runtime.runId,firestoreRulesDeployAllowed:!preflight.matches}),registry=await createStagingV2AdminBinderRegistry({app,firestore,expectedProjectId:PROJECT_ID});
  await createStagingV2WriterCurrentPrerequisite({readiness,writerCurrent:registry.binders.writerCurrent}).run();
  const baselineReadback=async()=>{
   const paths=[RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,RECORD_SYNC_V1_WRITER_CURRENT_PATH],snapshots=await firestore.getAll(...paths.map(path=>firestore.doc(path)));
   if(snapshots.length!==paths.length||snapshots.some(snapshot=>snapshot.exists!==true))throw new Error('staging V2 baseline source document missing');
   const sourceHashes=Object.fromEntries(snapshots.map((snapshot,index)=>[paths[index],sha256Canonical(snapshot.data())]));
   return Object.freeze({capability:Object.freeze({schema:'danbridge-staging-v2-baseline-attestation-readback-v1',projectId:PROJECT_ID,sourceHashes}),readCount:paths.length,writeCount:0});
  };
  const primitives=createStagingV2AdminSupervisorPrimitives({readiness,rules,baselineReadback,gateSourceHashes:artifacts.gateSourceHashes}),wired=createStagingV2AdminSupervisorSteps({registry,primitives}),actions=createStagingV2ConcreteManualSupervisorActions({steps:wired.steps,rollback:wired.rollback}),journal=createFirebaseStagingV2SupervisorJournal({app,firestore,expectedProjectId:PROJECT_ID,runId:runtime.runId}),supervisor=createStagingV2ActivationSupervisor({rawManifest:artifacts.manifest,actions,journal}),result=await supervisor.run(),output={schema:'danbridge-staging-v2-pre-atomic-run-result-v1',...result,projectId:PROJECT_ID,requestHash:artifacts.manifest.requestHash,manifestHash:artifacts.manifest.manifestHash,rulesetHash:artifacts.manifest.rulesetHash,firestoreRulesDeployed:artifacts.manifest.firestoreRulesDeployAllowed,productionTouched:false,hostingDeployed:false,timeMachineTouched:false};
  if(result.status!=='PRE_ATOMIC_READY'||result.lastPhase!=='PRE_ATOMIC_GATE'||result.atomicStarted!==false)throw new Error('staging V2 pre-atomic terminal state blocked');
  writeFileSync(runtime.resultPath,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(output)+'\n');
 }finally{await deleteApp(app)}
}

await main();
