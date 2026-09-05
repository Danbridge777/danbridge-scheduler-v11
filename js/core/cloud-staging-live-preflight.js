import {buildLiveOperationPlan,canonicalizeLiveTargetDb} from './cloud-live-operation-plan.js?v=20.26.230';
import {buildStagingExecutionManifest,verifyStagingExecutionManifest} from './cloud-staging-execution-manifest.js';
import {recordDataHash} from './cloud-record-data-hash.js';

export function buildStagingLivePreflight({environment,role,projectId,sourceState,targetDb,backup,restoreReceipt,legacyVersionHash,deviceId,startSequence=1,readBudget,writeBudget,createdAt,maxOperationsPerRun=100}={}){
 if(environment!=='staging'||role!=='owner'||projectId!=='danbridge-d8877-staging')throw new Error('live 逐筆預檢只允許 staging Owner');
 const canonicalTargetDb=canonicalizeLiveTargetDb(sourceState?.db,targetDb),plan=buildLiveOperationPlan(sourceState,canonicalTargetDb,{deviceId,startSequence,expectedBaseHash:recordDataHash(sourceState?.db)});
 const manifest=buildStagingExecutionManifest({plan,sourceDb:sourceState.db,sourceRevisions:sourceState.revisions,targetDb:canonicalTargetDb,legacyTargetDb:targetDb,backup,restoreReceipt,legacyVersionHash,readBudget,writeBudget,createdAt,maxOperationsPerRun});
 verifyStagingExecutionManifest(manifest,{currentLegacyVersionHash:legacyVersionHash,currentRecordHash:recordDataHash(sourceState.db),currentOperationPlan:plan});
 return{schema:'danbridge-staging-live-preflight-v1',environment:'staging',companyId:'danbridge',state:'ready',plan,manifest,writes:0,featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false};
}
