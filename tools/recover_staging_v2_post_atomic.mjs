import {realpathSync,statSync,writeFileSync} from 'node:fs';
import {applicationDefault,deleteApp,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createFirebaseRecordSyncV2AtomicActivationV2AdminBinder} from '../js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js';
import {createFirebaseStagingV2SupervisorJournal} from '../js/core/firebase-staging-v2-supervisor-journal.js';
import {buildStagingV2PostAtomicRecoveryEvidence} from '../js/core/staging-v2-post-atomic-recovery-evidence.js';

const PROJECT_ID='danbridge-d8877-staging';
const REPOSITORY='Danbridge777/danbridge-scheduler-v11';

function environment(){
 const env=process.env,runId=String(env.STAGING_V2_FAILED_ATOMIC_RUN_ID??''),resultPath=String(env.STAGING_V2_RECOVERY_RESULT_PATH??'');
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||!/^\/[A-Za-z0-9_./-]+$/.test(resultPath)||!/^\d{8,20}$/.test(runId)||typeof env.STAGING_V2_GITHUB_TOKEN!=='string'||env.STAGING_V2_GITHUB_TOKEN.length<20)throw new Error('post-atomic recovery GitHub main boundary blocked');
 let real,info;try{real=realpathSync(new URL('.',`file://${resultPath}`));info=statSync(real)}catch{throw new Error('post-atomic recovery result parent blocked')}
 if(!info.isDirectory()||!resultPath.startsWith(real))throw new Error('post-atomic recovery result path blocked');
 return Object.freeze({runId,resultPath,githubToken:env.STAGING_V2_GITHUB_TOKEN});
}

async function githubRun(token,runId){
 const response=await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${runId}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'danbridge-staging-v2-post-atomic-recovery'}});
 if(!response.ok)throw new Error('post-atomic GitHub run lookup blocked');
 const value=await response.json();
 return Object.freeze({runId:String(value.id),runAttempt:value.run_attempt,headSha:value.head_sha,headBranch:value.head_branch,event:value.event,status:value.status,conclusion:value.conclusion,repository:value.repository?.full_name,workflowPath:value.path});
}

async function main(){
 const runtime=environment(),metadata=await githubRun(runtime.githubToken,runtime.runId),runKey=`gh_${metadata.runId}_${metadata.runAttempt}_${metadata.headSha.slice(0,12)}`,app=initializeApp({projectId:PROJECT_ID,credential:applicationDefault()},'staging-v2-post-atomic-recovery-'+runKey),firestore=getFirestore(app);
 try{
  const journal=createFirebaseStagingV2SupervisorJournal({app,firestore,expectedProjectId:PROJECT_ID,runId:runKey}),rows=await journal.readAll(),binder=createFirebaseRecordSyncV2AtomicActivationV2AdminBinder({app,firestore,expectedProjectId:PROJECT_ID}),recovery=await binder.recover(),output=buildStagingV2PostAtomicRecoveryEvidence({runMetadata:metadata,rows,recovery});
  writeFileSync(runtime.resultPath,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',mode:0o600});
  process.stdout.write(JSON.stringify(output)+'\n');
 }finally{await deleteApp(app)}
}

await main();
