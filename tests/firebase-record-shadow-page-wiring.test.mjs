import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const adapterSource=fs.readFileSync(new URL('../js/core/firebase-record-shadow-adapter.js',import.meta.url),'utf8');
const roleCandidateAdapterSource=fs.readFileSync(new URL('../js/core/firebase-role-view-candidate-adapter.js',import.meta.url),'utf8');
const pwaSource=fs.readFileSync(new URL('../js/core/pwa-installation.js',import.meta.url),'utf8');

test('頁面匯入獨立 record-shadow adapter 且只公開專屬手動入口',()=>{
 assert.match(source,/import \{createFirebaseRecordShadowAdapter\} from '\.\/firebase-record-shadow-adapter\.js\?v=20\.26\.84'/);
 assert.match(source,/window\.__danbridgeRunStagingRecordShadow/);
 assert.match(source,/window\.__danbridgeGetStagingRecordShadowDiagnostic/);
 assert.doesNotMatch(source,/queueStagingRecordShadow[^\n]*uploadOwnerState|uploadOwnerState[^\n]*queueStagingRecordShadow/);
});

test('Checkpoint B 以版本化 service worker 解除舊 staging 快取',()=>{
 assert.match(pwaSource,/register\('\.\/sw\.js\?v=20\.26\.84'/);
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
 assert.doesNotMatch(source,/uploadOwnerState[^}]+runProductionFullRecordMigration/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionFullRecordMigration|runProductionFullRecordMigration[^\n]+__danbridgeSetDB/);
});

test('production 候選驗證只讀取逐筆集合與角色檢視，不寫入或接管讀取',()=>{
 assert.match(source,/new URLSearchParams\(location\.search\)\.get\('productionFullRecordVerify'\)/);
 assert.match(source,/button\.id='productionFullRecordCandidateButton'/);
 assert.match(source,/verifyCandidate\(targetDb,\{sourceHash\}\)/);
 assert.match(source,/auditProductionRoleViews\(targetDb\)/);
 assert.match(source,/readTakeover:false,writes:0/);
 assert.doesNotMatch(source,/productionFullRecordCandidateButton[^}]+setDoc|productionFullRecordCandidateButton[^}]+runTransaction/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionFullRecordCandidateVerification|runProductionFullRecordCandidateVerification[^\n]+__danbridgeSetDB/);
});

test('staging 實站候選入口支援正確與錯誤 sourceHash，且永遠唯讀',()=>{
 assert.match(source,/get\('fullRecordCandidateTest'\)/);
 assert.match(source,/stagingFullRecordCandidateResult/);
 assert.match(source,/state:'blocked',writes:0,readTakeover:false/);
 assert.doesNotMatch(source,/stagingFullRecordCandidateResult=JSON\.stringify\(\{\.\.\.result/);
});

test('角色逐筆候選直接重用現行 aa、老師、管理者篩選且不接管讀取',()=>{
 assert.match(source,/buildCurrentRoleViewCandidates/);
 assert.match(source,/kind='scheduler';db=filteredSchedulerDB\(sourceDb\)/);
 assert.match(source,/kind='teacher';db=filteredTeacherDB\(sourceDb,access\.teacherId\)/);
 assert.match(source,/kind='branch_manager';db=filteredBranchDB\(sourceDb,access\.branchIds\)/);
 assert.match(source,/get\('roleViewCandidateTest'\)/);
 assert.match(source,/permissionsSource:'existing-filter-functions',readTakeover:false/);
 assert.doesNotMatch(source,/publishScopedViews[^}]+writeAndVerify|uploadOwnerState[^}]+writeAndVerify/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runStagingRoleViewCandidateScenario|runStagingRoleViewCandidateScenario[^\n]+__danbridgeSetDB/);
 assert.doesNotMatch(roleCandidateAdapterSource,/deleteDoc|updateDoc|schedulerViews|teacherViews|branchViews/);
});

test('production 角色逐筆候選需要目前來源 hash 與 Owner 手動按鈕，且不接管讀取',()=>{
 assert.match(source,/get\('productionRoleViewCandidate'\)/);
 assert.match(source,/button\.id='productionRoleViewCandidateButton'/);
 assert.match(source,/sourceHash!==expectedSourceHash/);
 assert.match(source,/runProductionRoleViewCandidate/);
 assert.match(source,/permissionsSource:'existing-filter-functions',readTakeover:false/);
 assert.doesNotMatch(source,/uploadOwnerState[^}]+runProductionRoleViewCandidate/);
 assert.doesNotMatch(source,/__danbridgeSetDB[^\n]+runProductionRoleViewCandidate|runProductionRoleViewCandidate[^\n]+__danbridgeSetDB/);
});
