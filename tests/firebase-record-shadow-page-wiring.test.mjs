import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const adapterSource=fs.readFileSync(new URL('../js/core/firebase-record-shadow-adapter.js',import.meta.url),'utf8');
const fullAdapterSource=fs.readFileSync(new URL('../js/core/firebase-full-record-shadow-adapter.js',import.meta.url),'utf8');
const roleCandidateAdapterSource=fs.readFileSync(new URL('../js/core/firebase-role-view-candidate-adapter.js',import.meta.url),'utf8');
const pwaSource=fs.readFileSync(new URL('../js/core/pwa-installation.js',import.meta.url),'utf8');

test('頁面匯入獨立 record-shadow adapter 且只公開專屬手動入口',()=>{
 assert.match(source,/import \{createFirebaseRecordShadowAdapter\} from '\.\/firebase-record-shadow-adapter\.js\?v=20\.26\.222'/);
 assert.match(source,/window\.__danbridgeRunStagingRecordShadow/);
 assert.match(source,/window\.__danbridgeGetStagingRecordShadowDiagnostic/);
 assert.doesNotMatch(source,/queueStagingRecordShadow[^\n]*uploadOwnerState|uploadOwnerState[^\n]*queueStagingRecordShadow/);
});

test('Checkpoint B 以版本化 service worker 解除舊 staging 快取',()=>{
 assert.match(pwaSource,/register\('\.\/sw\.js\?v=20\.26\.222'/);
});

test('候選驗證主模組與內層 adapter 必須載入同一版歷史來源語意',()=>{
 assert.match(source,/createFirebaseFullRecordShadowAdapter\} from '\.\/firebase-full-record-shadow-adapter\.js\?v=20\.26\.222'/);
 assert.match(source,/FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb\} from '\.\/cloud-full-record-shadow\.js\?v=20\.26\.222'/);
 assert.match(fullAdapterSource,/verifyFullRecordShadowCandidate\} from '\.\/cloud-full-record-shadow\.js\?v=20\.26\.222'/);
 assert.match(source,/createFirebaseRoleViewCandidateAdapter\} from '\.\/firebase-role-view-candidate-adapter\.js\?v=20\.26\.222'/);
 assert.match(source,/verifyOwnRoleViewCandidateReadback\} from '\.\/cloud-role-view-candidate\.js\?v=20\.26\.222'/);
 assert.match(roleCandidateAdapterSource,/verifyRoleViewCandidateDocuments\} from '\.\/cloud-role-view-candidate\.js\?v=20\.26\.222'/);
});

test('staging Owner URL 測試入口只操作專用 ID 並保留既有影子狀態',()=>{
 assert.match(source,/recordShadowTest/);
 assert.match(source,/staging-record-writer-lesson/);
 assert.match(source,/staging-record-writer-student/);
 assert.match(source,/staging-record-writer-teacher/);
 assert.match(source,/current\.db/);
 assert.match(source,/stagingRecordShadowTestResult/);
 assert.match(source,/action==='inspect'/);
});

test('record-shadow 頁面入口硬鎖 staging Owner 並支援故障注入進度',()=>{
 assert.match(source,/DANBRIDGE_ENVIRONMENT!=='staging'\|\|cloudRole!=='owner'/);
 assert.match(source,/failBatch/);
 for(const field of ['state','sourceHash','totalWrites','completedWrites','totalBatches','completedBatches','activeCount','tombstoneCount','verified','error','startedAt','finishedAt'])assert.match(source,new RegExp(`${field}:`));
});

test('Firestore adapter 使用逐集合讀取與 transaction，不使用 deleteDoc',()=>{
 assert.match(adapterSource,/stagingRecordShadows/);
 assert.match(source,/getDocs\(collection\(cloud,/);
 assert.match(source,/runTransaction\(cloud/);
 assert.doesNotMatch(source,/deleteDoc\([^\n]*stagingRecordShadows/);
});

test('Checkpoint C2 建立 verified run 並以 legacy clientHash 原子啟用，但不接管讀取或既有上傳',()=>{
 assert.match(source,/buildRecordShadowRunManifest/);
 assert.match(source,/verifyRecordShadowRun/);
 assert.match(source,/buildRecordShadowActivation/);
 assert.match(source,/canonicalRecordShadowCore/);
 assert.match(source,/evaluateRecordShadowReadCandidate/);
 assert.match(source,/stagingRecordShadowRuns/);
 assert.match(source,/stagingRecordShadowControls/);
 assert.match(source,/transaction\.get\(runRef\)/);
 assert.match(source,/transaction\.get\(mainRef\)/);
 assert.match(source,/recordShadowRunTest/);
 assert.match(source,/stagingRecordShadowRunTestResult/);
 assert.doesNotMatch(source,/uploadOwnerState[^}]+createVerifiedStagingRecordShadowRun/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+evaluateRecordShadowReadCandidate|evaluateRecordShadowReadCandidate[^\n]+__danbridgeSetDB/);
});

test('production 逐筆遷移只能由帶 hash 的 Owner 手動啟用，且不接管讀取',()=>{
 assert.match(source,/new URLSearchParams\(location\.search\)\.get\('productionFullRecordMigration'\)/);
 assert.match(source,/button\.id='productionFullRecordMigrationButton'/);
 assert.match(source,/button\.onclick=async\(\)=>/);
 assert.match(source,/DANBRIDGE_ENVIRONMENT!=='production'\|\|cloudRole!=='owner'/);
 assert.match(source,/sourceHash!==expectedSourceHash/);
 assert.match(source,/async function readVerifiedProductionLegacySource/);
 assert.match(source,/getDocFromServer\(doc\(cloud,'companies',COMPANY_ID,'data','main'\)\)/);
 assert.match(source,/computedHash!==sourceHash/);
 assert.match(source,/const \{sourceDb:targetDb,sourceHash\}=await readVerifiedProductionLegacySource\(expectedSourceHash\)/);
 assert.doesNotMatch(source,/uploadOwnerState[^}]+runProductionFullRecordMigration/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionFullRecordMigration|runProductionFullRecordMigration[^\n]+__danbridgeSetDB/);
});

test('production 候選驗證只讀取逐筆集合與角色檢視，不寫入或接管讀取',()=>{
 assert.match(source,/productionParams\.get\('productionFullRecordVerify'\)/);
 assert.match(source,/button\.id='productionFullRecordCandidateButton'/);
 assert.match(source,/verifyCandidate\(targetDb,\{sourceHash\}\)/);
 assert.match(source,/auditProductionRoleViews\(targetDb\)/);
 assert.match(source,/const \{sourceDb:targetDb,sourceHash\}=await readVerifiedProductionLegacySource\(expectedSourceHash\)/);
 assert.match(source,/readTakeover:false,writes:0/);
 assert.doesNotMatch(source,/productionFullRecordCandidateButton[^}]+setDoc|productionFullRecordCandidateButton[^}]+runTransaction/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionFullRecordCandidateVerification|runProductionFullRecordCandidateVerification[^\n]+__danbridgeSetDB/);
});

test('production 正式啟用先重驗全部候選，只原子建立兩個控制且保留 legacy main',()=>{
 assert.match(source,/productionParams\.get\('productionRecordActivate'\)/);
 assert.match(source,/button\.id='productionRecordActivationButton'/);
 const flow=source.slice(source.indexOf('async function activateProductionRecordRuntime'),source.indexOf("if(DANBRIDGE_ENVIRONMENT==='production')",source.indexOf('async function activateProductionRecordRuntime')));
 assert.match(flow,/runProductionFullRecordCandidateVerification\(expectedSourceHash\)/);
 assert.match(flow,/verified\.roleViews\.total<1/);
 assert.match(flow,/transaction\.get\(mainRef\)/);
 assert.match(flow,/transaction\.get\(controlRef\)/);
 assert.match(flow,/transaction\.get\(safetyRef\)/);
 assert.match(flow,/transaction\.set\(controlRef/);
 assert.match(flow,/transaction\.set\(safetyRef/);
 assert.match(flow,/legacyMainWrites:0/);
 assert.match(flow,/recordWrites:0/);
 assert.match(flow,/timeMachineTouched:false/);
 assert.doesNotMatch(flow,/transaction\.set\(mainRef|deleteDoc\s*\(|firebase\s+deploy/);
});

test('staging 實站候選入口支援正確與錯誤 sourceHash，且永遠唯讀',()=>{
 assert.match(source,/get\('fullRecordCandidateTest'\)/);
 assert.match(source,/stagingFullRecordCandidateResult/);
 assert.match(source,/state:'blocked',writes:0,readTakeover:false/);
 assert.doesNotMatch(source,/stagingFullRecordCandidateResult=JSON\.stringify\(\{\.\.\.result/);
});

test('staging 備份、復原、重讀與失敗演練全部需要可見手動按鈕，不會因開啟網址自動寫入',()=>{
 assert.match(source,/function installStagingMigrationActionButton/);
 for(const id of ['stagingMigrationBackupButton','stagingMigrationRestoreButton','stagingMigrationRestoreVerifyButton','stagingMigrationRestoreFailureButton'])assert.match(source,new RegExp(`id:'${id}'`));
 assert.match(source,/button\.onclick=async\(\)=>/);assert.match(source,/successLabel\(result\)/);
 for(const hiddenResult of ['stagingMigrationBackupTestResult','stagingMigrationRestoreTestResult','stagingMigrationRestoreVerifyResult','stagingMigrationRestoreFailureResult'])assert.doesNotMatch(source,new RegExp(hiddenResult));
});

test('角色逐筆候選直接重用現行 aa、老師、管理者篩選且不接管讀取',()=>{
 assert.match(source,/buildCurrentRoleViewCandidates/);
 assert.match(source,/kind='scheduler';db=filteredSchedulerDB\(sourceDb\)/);
 assert.match(source,/kind='teacher';db=filteredTeacherDB\(sourceDb,access\.teacherId\)/);
 assert.match(source,/kind='branch_manager';db=filteredBranchDB\(sourceDb,access\.branchIds\)/);
 assert.match(source,/get\('roleViewCandidateTest'\)/);
 assert.match(source,/button\.id='stagingRoleViewCandidateButton'|id:'stagingRoleViewCandidateButton'/);
 assert.match(source,/permissionsSource:'existing-filter-functions',readTakeover:false/);
 assert.doesNotMatch(source,/publishScopedViews[^}]+writeAndVerify|uploadOwnerState[^}]+writeAndVerify/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runStagingRoleViewCandidateScenario|runStagingRoleViewCandidateScenario[^\n]+__danbridgeSetDB/);
 assert.doesNotMatch(roleCandidateAdapterSource,/deleteDoc|updateDoc|schedulerViews|teacherViews|branchViews/);
 assert.match(source,/batchSize:failureResume\?1:400/);
 assert.match(source,/interrupted\.completedBatches!==1\|\|interrupted\.completedWrites!==1/);
});

test('production 角色逐筆候選需要目前來源 hash 與 Owner 手動按鈕，且不接管讀取',()=>{
 assert.match(source,/get\('productionRoleViewCandidate'\)/);
 assert.match(source,/button\.id='productionRoleViewCandidateButton'/);
 assert.match(source,/sourceHash!==expectedSourceHash/);
 assert.match(source,/runProductionRoleViewCandidate/);
 assert.match(source,/const \{sourceDb,sourceHash\}=await readVerifiedProductionLegacySource\(expectedSourceHash\)/);
 assert.match(source,/permissionsSource:'existing-filter-functions',readTakeover:false/);
 assert.doesNotMatch(source,/uploadOwnerState[^}]+runProductionRoleViewCandidate/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionRoleViewCandidate|runProductionRoleViewCandidate[^\n]+__danbridgeSetDB/);
});

test('staging 原子候選控制同時核對 full、role 與 main，且仍不接管讀寫',()=>{
 assert.match(source,/get\('atomicActivationTest'\)/);
 assert.match(source,/runStagingAtomicRecordActivation/);
 assert.match(source,/stagingRecordCandidateManifests/);
 assert.match(source,/stagingRecordActivationControls/);
 assert.match(source,/evaluateAtomicRecordActivation/);
 assert.match(source,/readTakeover:false,writeTakeover:false/);
 assert.doesNotMatch(source,/uploadOwnerState[^}]+runStagingAtomicRecordActivation/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runStagingAtomicRecordActivation|runStagingAtomicRecordActivation[^\n]+__danbridgeSetDB/);
 assert.match(source,/get\('atomicActivationReadback'\)/);
 assert.match(source,/verifyStagingAtomicRecordActivationReadback/);
 assert.match(source,/roleDocumentCount:activation\.roleDocumentCount,writes:0,readTakeover:false,writeTakeover:false/);
});

test('staging 手動逐筆讀取演練核對控制、manifest、legacy hash 與完整讀回',()=>{
 assert.match(source,/runStagingRecordReadTakeoverExercise/);assert.match(source,/get\('recordReadTakeoverTest'\)/);
 assert.match(source,/verifyCandidate\(legacyDb,\{sourceHash:legacyHash\}\)/);assert.match(source,/decideRecordReadTakeover/);assert.match(source,/appliedHash!==legacyHash/);
 assert.match(source,/automaticReadTakeover:false,writeTakeover:false/);assert.doesNotMatch(source,/uploadOwnerState[^}]+runStagingRecordReadTakeoverExercise/);
});

test('staging live 預檢只讀取證據與逐筆現況，不寫入、不接管且不掛入既有同步',()=>{
 assert.match(source,/import \{buildStagingLivePreflight\} from '\.\/cloud-staging-live-preflight\.js\?v=20\.26\.222'/);
 assert.match(source,/stagingLivePreflightGuard/);assert.match(source,/firebaseConfig\.projectId!=='danbridge-d8877-staging'/);
 assert.match(source,/readStagingLiveRecordSource/);assert.match(source,/stagingLiveRecords/);assert.match(source,/verifyStagingMigrationRestoreReceipt/);
 assert.match(source,/get\('stagingLivePreflight'\)/);assert.match(source,/button\.id='stagingLiveOperationPreflightButton'/);assert.match(source,/button\.onclick=async\(\)=>/);
 const block=source.slice(source.indexOf('async function prepareStagingLiveOperationPreflight'),source.indexOf('function stagingFirestoreTransaction'));
 assert.doesNotMatch(block,/setDoc\(|runTransaction\(|deleteDoc\(|__danbridgeSetDB|uploadOwnerState\(/);
 assert.match(block,/writes:0,featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false/);
});

test('staging live 執行先永久保存完整日誌，再原子啟用並只走獨立手動入口',()=>{
 for(const imported of ['createBrowserOperationJournalStorage','createBrowserStagingLiveExecutionStorage','createOperationJournal','enqueueOperationPlan','runOperationWorker','createFirebaseLiveRecordOperationAdapter','createFirebaseStagingLiveActivationAdapter','verifyStagingLiveJournalRows'])assert.match(source,new RegExp(`import \\{[^}]*${imported}`));
 const block=source.slice(source.indexOf('function stagingFirestoreTransaction'),source.indexOf("if(DANBRIDGE_ENVIRONMENT==='staging')",source.indexOf('function stagingFirestoreTransaction'))),execute=block.slice(block.indexOf('async function executePreparedStagingLiveOperationPlan'));
 assert.ok(execute.indexOf('await enqueueOperationPlan')<execute.indexOf('runPersistedStagingLiveExecution'));
 assert.ok(block.indexOf('await activation.activate')<block.indexOf('runOperationWorker'));
 assert.match(block,/resumeStagingLiveOperationPlan/);assert.match(block,/verifyStagingLiveJournalRows\(manifest,rows\)/);assert.match(block,/operationListHash/);assert.match(block,/activation\.finalize/);assert.match(block,/maxOperations:manifest\.maxOperationsPerRun/);
 assert.match(block,/verified\.documentCount!==manifest\.targetDocumentCount/);assert.match(block,/verified\.activeCount!==manifest\.targetActiveCount/);assert.match(block,/verified\.tombstoneCount!==manifest\.targetTombstoneCount/);
 assert.match(block,/snapshot\.exists\(\)\?stripStagingExecutionManifestAudit\(snapshot\.data\(\)\):await local\.loadManifest\(\)/);
 assert.doesNotMatch(block,/__danbridgeSetDB|uploadOwnerState\(/);assert.match(block,/readTakeover:false,uploadOwnerStateAttached:false,productionAllowed:false/);
 assert.match(source,/button\.id='stagingLiveOperationExecuteButton'/);assert.match(source,/get\('stagingLiveExecute'\)==='manual'/);assert.match(source,/button\.id='stagingLiveOperationResumeButton'/);
 assert.match(source,/manifest \$\{result\.manifestHash\}/);assert.match(source,/manifest \$\{liveResumeManifestHash\}/);
 assert.match(source,/source\.control&&source\.control\.state!=='active'/);assert.match(source,/maxOperationsPerRun:livePreflightMaxOperations/);
});
