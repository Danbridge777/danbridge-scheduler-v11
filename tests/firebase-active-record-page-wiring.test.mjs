import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const limitedUseTokenSource=fs.readFileSync(new URL('../js/core/app-check-limited-use-token.js',import.meta.url),'utf8');
const prewriteVerifier=fs.readFileSync(new URL('../js/core/staging-v2-prewrite-backup-verifier.js',import.meta.url),'utf8');
const chainAdapterSource=fs.readFileSync(new URL('../js/core/firebase-active-record-authority-save-chain-v2-adapter.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const camps=fs.readFileSync(new URL('../js/modules/camps/camp-management.js',import.meta.url),'utf8');
const block=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const sourceBlock=(text,from,to)=>text.slice(text.indexOf(from),text.indexOf(to,text.indexOf(from)));

test('staging auth uses the registered Firebase OAuth redirect origin',()=>{
 assert.match(source,/staging:\{[^\n]*authDomain:"danbridge-d8877-staging\.firebaseapp\.com"/);
 assert.doesNotMatch(source,/staging:\{[^\n]*authDomain:"danbridge-d8877-staging\.web\.app"/);
});

test('browser Firebase SDK鎖定12.17.1，V2 candidate factory只允許staging明確呼叫',()=>{
 const imports=[...source.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/([^/]+)\/firebase-(?:app|auth|app-check|firestore)\.js/g)].map(match=>match[1]);
 assert.deepEqual(imports,['12.17.1','12.17.1','12.17.1','12.17.1']);
 assert.doesNotMatch(source,/firebasejs\/12\.16\.0/);
 assert.match(source,/getDocFromServer/);
 assert.match(source,/createFirebaseRecordSyncV2TakeoverCandidateAdapter/);
 assert.equal((source.match(/createExplicitStagingV2TakeoverCandidateBinder/g)||[]).length,1);
 const factory=block('export function createExplicitStagingV2TakeoverCandidateBinder','// End explicit staging V2 takeover candidate binder.');
 assert.match(factory,/DANBRIDGE_ENVIRONMENT!=='staging'/);
 assert.match(factory,/danbridge-d8877-staging/);
 assert.match(factory,/auth\.app!==app\|\|cloud\.app!==app/);
 assert.match(factory,/getIdTokenResult\(true\)/);
 assert.match(factory,/claims,'sub'.+claims,'user_id'.+claims,'email'.+claims,'aud'.+claims,'iss'/s);
 assert.match(factory,/https:\/\/securetoken\.google\.com\/danbridge-d8877-staging/);
 assert.match(factory,/recordSyncV2CutoverOperator/);
 assert.match(factory,/new Set\(\[RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH\(targetV2Epoch\),RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH\(targetV2Epoch\)\]\)/);
 assert.match(factory,/getDocFromServer\(reference\(path\)\)/);
 assert.match(factory,/merge:false/);
 assert.doesNotMatch(factory,/cloudRole|cloudUid|cloudEmailKey|onAuthStateChanged|activeRecordMode|window\.|readTakeoverEnabled:true|writeTakeoverEnabled:true/);
});

test('V2 authority reader factory保持明確建構、只做fresh server inventory',()=>{
 assert.match(source,/getDocsFromServer/);
 assert.match(source,/createStagingV2AuthorityReadLoader/);
 assert.equal((source.match(/export function createExplicitStagingV2AuthorityReadLoader/g)||[]).length,1);
 const factory=block('export function createExplicitStagingV2AuthorityReadLoader','// 舊版 Header');
 assert.match(factory,/DANBRIDGE_ENVIRONMENT!=='staging'/);
 assert.match(factory,/app\.options\?\.projectId!=='danbridge-d8877-staging'/);
 assert.match(factory,/getIdTokenResult\(true\)/);
 assert.match(factory,/getDocFromServer\(doc\(cloud/);
 assert.match(factory,/getDocsFromServer\(collection\(cloud/);
 assert.match(factory,/cloudRole!=='owner'/);
 assert.doesNotMatch(factory,/onSnapshot|activeRecordMode\s*=|window\.|readTakeoverEnabled:true|writeTakeoverEnabled:true/);
});

test('Firestore 查詢協調使用有界記憶體快取，耐久操作仍由獨立日誌保存',()=>{
 assert.match(source,/import \{ initializeFirestore, memoryLocalCache,/);
 assert.match(source,/function purgeRetiredFirestoreWebStorage\(\)/);
 assert.match(source,/\^firestore_\(\?:clients\|mutations\|targets\|sequence_number\|bundle_loaded\|zombie\)_/);
 assert.match(source,/localStorage\.removeItem\(key\)/);
 assert.match(source,/purgeRetiredFirestoreWebStorage\(\);/);
 assert.match(source,/bootstrapDanbridgeFirebase\(\{hostname:location\.hostname,configs:firebaseConfigs,initializeApp,getAuth,initializeFirestore,firestoreOptions:\{localCache:memoryLocalCache\(\)\}\}\)/);
 assert.doesNotMatch(source,/persistentLocalCache|persistentMultipleTabManager|enableIndexedDbPersistence|getFirestore\(app\)/);
});

test('同帳號雙分頁登入權限初始化會串行化並使用有限權杖重試',()=>{
 assert.match(source,/import \{loadProfileAfterAuthReady\} from '\.\/cloud-auth-profile-bootstrap\.js\?v=20\.26\.248'/);
 const auth=block('async function loadSignedInProfile','function loginTimeValue');
 assert.match(auth,/loadProfileAfterAuthReady\(\{user,loadProfile:\(\)=>ensureProfile\(user\)\}\)/);
 assert.match(auth,/navigator\.locks\?\.request\? navigator\.locks\.request\(lockName,load\):load\(\)/);
 assert.match(source,/const profile=await loadSignedInProfile\(user\)/);
});

test('頁面明確匯入 V2 Owner 日常逐筆、角色發布、候選封存與原子啟用 adapter',()=>{
 for(const name of ['createActiveRecordPageController','createFirebaseActiveRecordStreamAdapter','createFirebaseRoleRecordViewAdapter','createFirebaseRoleRecordStreamAdapter','createFirebaseRecordSyncCandidateAdapter','createFirebaseRecordSyncActivationAdapter'])assert.match(source,new RegExp(`import \\{${name}\\}`));
 assert.doesNotMatch(source,/createFirebaseActiveRecordOperationAdapter|createFirebaseRecordSyncConflictBackupAdapter/);
});

test('staging 候選依序核對備份、逐筆續傳、封存與第二次讀回，production 無入口',()=>{
 const flow=block('async function verifyStagingRecordSyncProtection','let preparedRecordSyncRoleEvidence');
 for(const marker of ['verifyStagingMigrationRestoreReceipt','candidateAdapter.open','runStagingFullRecordShadow','verifyCandidate','candidateAdapter.seal','candidateAdapter.read'])assert.match(flow,new RegExp(marker.replace('.','\\.')));
 assert.ok(flow.indexOf('candidateAdapter.open')<flow.indexOf('runStagingFullRecordShadow'));
 assert.ok(flow.indexOf('runStagingFullRecordShadow')<flow.indexOf('candidateAdapter.seal'));
 assert.ok(flow.indexOf('candidateAdapter.seal')<flow.lastIndexOf('verifyCandidate'));
 assert.match(source,/if\(DANBRIDGE_ENVIRONMENT==='staging'\)\{\s*window\.__danbridgeVerifyStagingRecordSyncProtection/);
});

test('角色證據不能自動填通過，完整實測後才可在記憶體準備並手動原子啟用',()=>{
 const flow=block('let preparedRecordSyncRoleEvidence','let stagingLivePreflightDiagnostic');
 assert.match(flow,/RECORD_SYNC_ROLE_SCENARIOS\.some\(scenario=>results\[scenario\]!==true\)/);
 assert.match(flow,/prepareStagingRecordSyncRoleEvidenceFromReceipts/);
 assert.match(flow,/verifyRoleViewReceiptSet/);
 assert.match(flow,/stagingRecordSyncActivationPanel/);
 assert.match(flow,/id="stagingRecordSyncActivateButton" disabled/);
 assert.match(html,/#stagingRecordSyncActivationPanel\{display:block\}/);
 assert.match(flow,/writes:0,readTakeover:false,writeTakeover:false/);
 assert.match(flow,/async function executePreparedStagingRecordSyncActivation/);
 assert.match(flow,/adapter\.activate\(preparedRecordSyncActivation\)/);
 assert.doesNotMatch(flow,/Object\.fromEntries\(RECORD_SYNC_ROLE_SCENARIOS\.map\(key=>\[key,true\]\)\)/);
});

test('角色候選 manifest 與每位本人收據不可變，URL 只顯示按鈕不會自動寫入',()=>{
 assert.match(source,/cloud-role-view-verification\.js\?v=20\.26\.248/);
 assert.match(source,/stagingRoleViewCandidateManifests/);
 assert.match(source,/stagingRoleViewVerificationReceipts/);
 assert.match(source,/persistStagingRoleCandidateManifest/);
 assert.match(source,/persistStagingRoleVerificationReceipt/);
 assert.match(source,/readVerifiedStagingRoleViewCandidateSource/);
 assert.match(source,/auditStagingRoleViewCandidateSource/);
 assert.match(source,/stagingRoleViewCandidateAuditButton/);
 assert.match(source,/verifyRoleViewCandidateSourceBinding/);
 assert.match(source,/mainSnapshot\.data\(\)\.db/);
 assert.match(source,/candidateControl/);
 assert.match(source,/identityFields\.some\(field=>saved\[field\]!==receipt\[field\]\)/);
 assert.match(source,/receiptHash:persisted\.receipt\.receiptHash/);
 assert.match(source,/buildVerifiedRoleViewCandidateManifest/);
 assert.match(source,/import \{recordDataDigest,recordDataHash\}/);
 const cryptoFlow=block('async function buildCurrentRoleViewCandidates','function currentRoleCandidateKind');
 assert.match(cryptoFlow,/viewHash:recordDataDigest\(db\)/);
 assert.match(cryptoFlow,/sourceHash=source\.sourceHash/);
 assert.match(cryptoFlow,/hashDb:recordDataDigest/);
 assert.match(cryptoFlow,/views\.some\(view=>!\/\^\[a-f0-9\]\{64\}\$\//);
 assert.doesNotMatch(cryptoFlow,/viewHash:dataHash\(db\)|sourceHash=dataHash\(sourceDb\)|hashDb:dataHash/);
 const candidateRun=block('async function runStagingRoleViewCandidateScenario','function currentRoleCandidateKind');
 assert.match(candidateRun,/readVerifiedStagingRoleViewCandidateSource\(\)/);
 assert.doesNotMatch(candidateRun,/window\.__danbridgeGetDB/);
 const sourceAudit=block('async function auditStagingRoleViewCandidateSource','function firestoreRoleViewCandidateAdapter');
 assert.match(sourceAudit,/firestoreFullRecordShadowAdapter\(\)\.read\(\)/);
 assert.match(sourceAudit,/buildRoleViewCandidateSourceAudit/);
 assert.match(sourceAudit,/writes:0|stagingRoleViewCandidateAudit/);
 assert.doesNotMatch(sourceAudit,/setDoc|deleteDoc|runTransaction/);
 assert.match(source,/stagingRoleViewCandidateButton/);
 assert.match(source,/stagingOwnerRoleVerificationButton/);
 assert.match(source,/stagingOwnRoleVerificationButton/);
 const candidateEntry=block("const roleViewCandidateTest=new URLSearchParams(location.search).get('roleViewCandidateTest')","async function runProductionRoleViewCandidate");
 assert.match(candidateEntry,/installStagingMigrationActionButton/);
 assert.doesNotMatch(candidateEntry,/setInterval\(async\(\)=>[^}]+runStagingRoleViewCandidateScenario/);
});

test('啟用前 aa、老師與管理者逐筆讀回自己的 16 集合，並實際確認核心與跨角色拒絕',()=>{
 const flow=block('function currentRoleCandidateKind','async function runProductionRoleViewCandidate');
 assert.match(source,/import \{verifyOwnRoleViewCandidateReadback\}/);
 assert.match(flow,/for\(const collectionId of FULL_RECORD_COLLECTIONS\)/);
 assert.match(flow,/ownRows=query\(base,where\('email','==',cloudEmailKey\),where\('kind','==',kind\)\)/);
 assert.match(flow,/verifyOwnRoleViewCandidateReadback/);
 assert.match(flow,/lessonRows=query\(collection\(cloud,'stagingRoleViewCandidates'/);
 assert.match(flow,/onSnapshot\(lessonRows/);
 assert.match(flow,/stagingFullRecordShadows/);
 assert.match(flow,/crossRoleDenied/);
 assert.match(flow,/window\.__danbridgeVerifyOwnStagingRoleViewCandidate/);
 assert.match(flow,/readTakeover:false,writeTakeover:false/);
});

test('production 使用獨立 Owner 逐筆 runtime，且角色端不會誤啟 staging runtime',()=>{
 assert.match(source,/if\(DANBRIDGE_ENVIRONMENT!=='staging'\|\|cloudRole!=='owner'\)return false/);
 assert.match(source,/if\(DANBRIDGE_ENVIRONMENT!=='staging'\)\s*\{\s*activeRecordMode='legacy';\s*activeRoleWriteAllowed=true;\s*startLegacy\(\);\s*return;?\s*\}/);
 assert.match(source,/createFirebaseProductionRecordStreamAdapter/);
 assert.match(source,/if\(\['staging','production'\]\.includes\(DANBRIDGE_ENVIRONMENT\)\)\{startOwnerActiveRecordRuntime\(\);return\}/);
 assert.match(source,/if\(DANBRIDGE_ENVIRONMENT==='production'\)return startOwnerProductionRecordRuntime\(\)/);
});

test('Owner 啟用後 upload 與 save 先走永久日誌逐筆流程，不再落入 1 MiB 主文件寫入',()=>{
 const upload=block('async function uploadOwnerState','function queueOwnerCloudSave');
 assert.ok(upload.indexOf("activeRecordMode!=='legacy'")<upload.indexOf('ownerMainDocumentBytes(current)'));
 assert.match(upload,/return flushActiveOwnerState\(\)/);
 const queue=block('function queueOwnerCloudSave','function lessonMap');
 assert.match(queue,/activeRecordPageController\?\.queueLocalSave\(\)/);
 assert.ok(queue.indexOf('activeRecordPageController?.queueLocalSave()')<queue.indexOf('setTimeout(()=>uploadOwnerState()'));
});

test('Owner 逐筆寫入前必須用已確認的雲端基準建立當日分片備份',()=>{
 const controller=block('function ensureActiveOwnerPageController','async function acceptActiveOwnerSnapshot');
 assert.match(controller,/ensureCloudBackup:activeOwnerV2OperationSender\?\(\)=>confirmStagingV2DurablePrewriteBackup\(\):confirmedDb=>createCloudSafetyBackup\(false,confirmedDb\)/);
 const status=block('function handleActiveOwnerControllerStatus','function ensureActiveOwnerPageController');
 assert.match(status,/['\"]backing-up['\"]/);
 assert.match(status,/寫入前的雲端分片備份/);
 const schedule=block('function scheduleDailyCloudBackup','function readSyncHealthBaseline');
 assert.match(schedule,/\['staging','production'\]\.includes\(DANBRIDGE_ENVIRONMENT\)&&activeRecordMode!=='legacy'/);
 assert.ok(schedule.indexOf("activeRecordMode!=='legacy'")<schedule.indexOf('setTimeout(()=>createCloudSafetyBackup(false)'));
});

test('核心逐筆已完成但角色發布仍在執行時，串流快照不會誤排第二輪空同步',()=>{
 const accept=block('async function acceptActiveOwnerSnapshot','function startOwnerActiveRecordRuntime');
 assert.match(accept,/beforeAccept=controller\.diagnostics\(\)/);
 assert.match(accept,/localDirtyHash&&!beforeAccept\.dirty&&!beforeAccept\.inFlight/);
 assert.doesNotMatch(accept,/localDirtyHash&&!controller\.diagnostics\(\)\.dirty/);
});

test('Owner active save 依資料 hash 合併相同意圖，但不同 hash 仍排入下一輪',()=>{
 const queue=block('function queueOwnerCloudSave','function lessonMap');
 assert.match(source,/import \{decideOwnerActiveSaveIntent\} from '\.\/cloud-owner-active-save-intent\.js\?v=20\.26\.248'/);
 assert.match(queue,/scheduleMutation.+queueLocalSave\(\{changedCollections:\['lessons','makeups','changes'\]\}\)/s);
 assert.ok(queue.indexOf("if(scheduleMutation&&['staging','production'].includes")<queue.indexOf('const nextHash=dataHash'));
 assert.match(queue,/decideOwnerActiveSaveIntent\(\{nextHash,localDirtyHash,lastUploadedHash,diagnostics,applyingCloud\}\)/);
 assert.match(queue,/intent\.action==='coalesce'.+return/s);
 assert.match(queue,/intent\.action==='recover'.+queueLocalSave\(\)/s);
 const normal=queue.slice(queue.indexOf('const nextHash=dataHash'));
 assert.ok(normal.indexOf("intent.action==='coalesce'")<normal.indexOf('localMutationVersion++'));
 assert.ok(normal.indexOf('localDirtyHash=nextHash')>normal.indexOf('localMutationVersion++'));
});

test('Owner 課堂回報直接套用與 listener 套用都先排入逐筆 journal，其他角色不會排 owner core',()=>{
 const direct=block('async function saveTeacherReport','let classFocusLessonId');
 assert.match(direct,/const changed=applyReportToLesson\(lesson,report\)/);
 assert.match(direct,/if\(changed&&cloudRole==='owner'\)\{persistCurrentLocalView\(\);queueOwnerCloudSave\(\)\}/);
 assert.ok(direct.indexOf('persistCurrentLocalView()')<direct.indexOf('queueOwnerCloudSave()'));
 assert.ok(direct.indexOf('queueOwnerCloudSave()')<direct.indexOf('window.renderAll?.()'));
 const listener=block('function subscribeLessonReports','function subscribeCurrentRoleData');
 assert.match(listener,/if\(cloudRole==='owner'\)\{queueOwnerCloudSave\(\);clearTimeout\(reportSyncTimer\);reportSyncTimer=setTimeout\(uploadOwnerState,500\)\}/);
 assert.ok(listener.indexOf('queueOwnerCloudSave()')<listener.indexOf('setTimeout(uploadOwnerState,500)'));
});

test('營隊 render 不會建立或修改 backing student，只有明確 save/create 路徑可 ensure',()=>{
 const summerRender=sourceBlock(camps,'function renderSummerCampClasses','function saveWinterCampClass');
 const winterRender=sourceBlock(camps,'function renderWinterCampClasses','function saveTeacherGroup');
 assert.doesNotMatch(summerRender,/ensureCampBackingStudent|db\.[A-Za-z]+\.(?:push|splice|unshift)|Object\.assign/);
 assert.doesNotMatch(winterRender,/ensureCampBackingStudent|db\.[A-Za-z]+\.(?:push|splice|unshift)|Object\.assign/);
 const summerSave=sourceBlock(camps,'function saveSummerCampClass','function editSummerCampClass');
 const winterSave=sourceBlock(camps,'function saveWinterCampClass','function editWinterCampClass');
 const create=sourceBlock(camps,'function campClassForTitle','function buildCampCandidates');
 assert.match(summerSave,/ensureCampBackingStudent\(cls,'summer'\)/);
 assert.match(winterSave,/ensureCampBackingStudent\(cls,'winter'\)/);
 assert.match(create,/if\(!cls&&create\).+ensureCampBackingStudent\(cls,season\)/s);
});

test('staging 僅允許永久 fence 後走 V2；缺少 fence 或任何 V2 錯誤都 fail closed',()=>{
 const runtime=block('async function startOwnerStagingV2Runtime','async function flushActiveOwnerState');
 assert.doesNotMatch(runtime,/startOwnerLegacyActiveRecordRuntime\(\)/);
 assert.match(runtime,/staging V2 permanent fence missing; legacy fallback forbidden/);
 assert.match(runtime,/assertStagingV2PermanentFence/);
 assert.match(runtime,/assertStagingV2RuntimeHead/);
 assert.match(runtime,/activeOwnerV2OperationSender=stagingV2BrowserOperationSender\(\)/);
 assert.match(runtime,/stagingV2H0GenesisBaselineDocuments\(await readActiveRecordDocumentsFromServer\(\)\)/);
 assert.match(runtime,/activeOwnerV2HeadState==='hn'&&latestState!=='hn'/);
 assert.match(runtime,/const documents=await activeOwnerV2ReadDocuments\(\)/);
 assert.match(runtime,/activeRecordMode='active-blocked'/);
 assert.doesNotMatch(runtime,/catch\([^)]*\).+startOwnerLegacyActiveRecordRuntime/s);
});

test('角色逐筆發布重用現有 aa、老師、校區篩選且每個 scope 使用獨立 viewKey',()=>{
 const publish=block('function activeRoleRecordIdentity','async function publishScopedViews');
 assert.match(publish,/kind:'scheduler'/);assert.match(publish,/kind:'teacher'/);assert.match(publish,/kind:'branch_manager'/);
 assert.match(publish,/filteredSchedulerDB\(sourceDb\)/);assert.match(publish,/filteredTeacherDB\(sourceDb,identity\.teacherId\)/);assert.match(publish,/filteredBranchDB\(sourceDb,identity\.branchIds\)/);
 assert.match(publish,/adapter\.synchronize\(targetDb/);
});

test('V2 Hn 角色逐筆檢視由同一個受保護後端管理，瀏覽器不再補送',()=>{
 const bootstrap=block('function queueInitialActiveRoleRecordViews','async function publishScopedViews');
 assert.match(bootstrap,/DANBRIDGE_ENVIRONMENT!=='staging'/);
 assert.match(bootstrap,/cloudRole!=='owner'/);
 assert.match(bootstrap,/activeRecordMode!=='active'/);
	 assert.match(bootstrap,/activeOwnerV2OperationSender.*state:'server-managed'/s);
	 assert.match(bootstrap,/activeRoleBootstrapEpoch===activationEpoch/);
	 assert.match(bootstrap,/!activeRoleBootstrapSourceDb/);
	 assert.match(bootstrap,/deepCopy\(activeRoleBootstrapSourceDb\)/);
	 assert.doesNotMatch(bootstrap,/__danbridgeGetDB/);
	 assert.match(bootstrap,/getActiveRoleRecordPublishQueue\(\)\.enqueue\(\{kind:'bootstrap'/);
	 assert.match(bootstrap,/setTimeout\(queueInitialActiveRoleRecordViews/);
	 const ownerRuntime=block('async function startOwnerStagingV2Runtime','async function flushActiveOwnerState');
	 assert.match(source,/(?:async )?function acceptActiveOwnerSnapshot\(snapshot\)\{\s*[^\n]*activeRoleBootstrapSourceDb=deepCopy\(snapshot\.db\)/);
	 assert.match(ownerRuntime,/activeOwnerV2HeadState==='hn'.*state:'server-managed'/s);
	 assert.doesNotMatch(ownerRuntime,/queueInitialActiveRoleRecordViews\(\)/);
	 assert.match(ownerRuntime,/activeRoleBootstrapSourceDb=deepCopy\(rebuilt\.db\)/);
	 assert.doesNotMatch(ownerRuntime,/activeOwnerV2HeadState==='h0'\)queueInitialActiveRoleRecordViews\(\)/);
	});

test('App Check 與 H1 入口只存在 staging，limited-use token 送入固定 same-origin Function',()=>{
 assert.match(source,/firebase-app-check\.js/);
 assert.match(source,/DANBRIDGE_ENVIRONMENT==='staging'\?initializeAppCheck/);
 assert.match(source,/const STAGING_V2_APP_CHECK_SITE_KEY='6LfvKqItAAAAALRIut991852bJzOP3Aekm8WeXB9'/);
 assert.doesNotMatch(source,/6LeW8aEtAAAAALlBdQWdhFZf3yntBChCxCDTW8K6/);
 assert.match(source,/new ReCaptchaEnterpriseProvider\(STAGING_V2_APP_CHECK_SITE_KEY\)/);
 assert.match(source,/createLimitedUseAppCheckTokenPool\(\{appCheck:stagingV2AppCheck,getLimitedUseToken/);
 assert.match(limitedUseTokenSource,/getLimitedUseToken\(appCheck\)/);
 const h1=block('window.__danbridgeCommitStagingV2H1','async function flushActiveOwnerState');
 assert.match(h1,/DANBRIDGE_ENVIRONMENT!=='staging'/);
 assert.match(h1,/activeOwnerV2HeadState!=='h0'/);
 assert.match(h1,/startsWith\('STAGING_'\)/);
 assert.match(h1,/\[V2-H1-CUTOVER\]/);
 assert.match(h1,/queueLocalSave\(\)/);
 assert.match(h1,/result\?\.state!=='complete'/);
});

test('V2 不可變備份與雙 head 驗證在受保護後端執行；瀏覽器不再重複讀取證據而阻塞操作',()=>{
 const verifier=block('async function confirmStagingV2DurablePrewriteBackup','async function startOwnerStagingV2Runtime');
 for(const required of ['server-enforced','activeOwnerV2Fence.targetV2Epoch!==activeOwnerControllerEpoch','activeOwnerV2HeadState!==\'hn\''])assert.match(verifier,new RegExp(required));
 for(const forbidden of ['getDocFromServer','stagingRecordSyncV1FrozenSourceProofs','stagingRecordSyncV1RawCutoverBackups','stagingRecordSyncV2Genesis','verifyStagingV2PrewriteBackup'])assert.equal(verifier.includes(forbidden),false,forbidden);
 for(const required of ['verifyStagingV2PrewriteBackup','stagingRecordSyncV1FrozenSourceProofs','stagingRecordSyncV1RawCutoverBackups','stagingRecordSyncV2Genesis','stagingRecordSyncV2GenesisAuthorities','headBefore','headAfter','verifyDurablePrewrite'])assert.match(chainAdapterSource,new RegExp(required));
 assert.match(chainAdapterSource,/await verifyDurablePrewrite\(fence,head\)/);
 for(const required of ['assertRecordSyncV1PermanentFenceV2Integrity','assertRecordSyncV1FrozenSourceProofIntegrity','assertRecordSyncV1RawCutoverBackupCompactMetadataLink','assertRecordSyncV2GenesisAuthorityIntegrity','active head changed during prewrite backup verification'])assert.match(prewriteVerifier,new RegExp(required));
 for(const forbidden of ['setDoc','deleteDoc','runTransaction','firebase-admin','production'])assert.equal(prewriteVerifier.includes(forbidden),false,forbidden);
});

	test('staging active 的角色檢視由 authority Function 同步提交，瀏覽器不直接寫',()=>{
	 const legacyScoped=block('async function publishScopedViews','async function publishRoleViewsWithRetry');
	 assert.match(legacyScoped,/DANBRIDGE_ENVIRONMENT==='staging'&&activeRecordMode!=='legacy'.*state:'server-managed'/s);
	 assert.doesNotMatch(legacyScoped,/activeRecordMode!=='legacy'.*getActiveRoleRecordPublishQueue\(\)\.enqueue/s);
	 assert.doesNotMatch(legacyScoped,/publishActiveRoleRecordViews\(sourceDb\)/);
	 const retryFlow=block('async function publishRoleViewsWithRetry','async function migrateLegacyLessonCloudDocuments');
	 assert.match(retryFlow,/activeOwnerV2OperationSender.*state:'server-managed'/s);
	 assert.doesNotMatch(retryFlow,/publishActiveRoleRecordViews\(/);
	});

test('V2 H1/Hn主資料讀回後只接受後端已完成的角色與通知交付',()=>{
 const controller=block('function ensureActiveOwnerPageController','async function acceptActiveOwnerSnapshot');
 assert.match(controller,/const confirmedSnapshot=deepCopy\(confirmedDb\);lastPublishedOwnerDB=confirmedSnapshot;[^}]+activeRoleBootstrapSourceDb=confirmedSnapshot/);
	 assert.match(controller,/activeRoleRecordProgress='server-verified'/);
	 assert.match(controller,/scheduleNotificationDelivery='server-verified'/);
	 assert.doesNotMatch(controller,/activeOwnerV2OperationSender\?async confirmedDb=>[^}]+getActiveRoleRecordPublishQueue/s);
});

test('stopActiveRecordRuntimes 會 cancel pending queue 任務並保留 queue 實體，避免清空後建立新 queue',()=>{
 const stopFlow=block('function stopActiveRecordRuntimes','function localRoleCacheKey');
 assert.ok(stopFlow.includes('closeScope()'));
 assert.doesNotMatch(stopFlow,/activeRoleRecordPublishQueue\\s*=\\s*null/);
});

test('bootstrap 失敗 retry 會以 activationEpoch scope 保護，不會覆寫新 owner flow',()=>{
 const bootstrap=block('function queueInitialActiveRoleRecordViews','async function publishScopedViews');
 assert.ok(bootstrap.includes('const currentActivationEpoch=activeRecordPageController?.diagnostics?.().activationEpoch'));
 assert.ok(bootstrap.includes('if(currentActivationEpoch!==activationEpoch||cloudRole!==\'owner\'||activeRecordMode!==\'active\')return;'));
});

test('aa 要求只有逐筆完整讀回指定課程後才標成 applied',()=>{
 const apply=block('async function applyActiveSchedulerRequest','async function applySchedulerRequest');
 assert.match(apply,/flushActiveOwnerState\(\)/);assert.match(apply,/result\.readbackDb/);assert.match(apply,/confirmedApplied/);
 assert.ok(apply.indexOf('confirmedApplied')<apply.indexOf("status:'applied'"));
 assert.doesNotMatch(apply,/companies.*data.*main/);
});

test('老師、aa、管理者都先訂閱逐筆控制，只有無控制才回原檢視',()=>{
 for(const signature of ["kind:'teacher'","kind:'scheduler'","kind:'branch_manager'"])assert.match(source,new RegExp(`startRoleActiveRecordRuntime\\(\\{email:cloudEmailKey,${signature}`));
 const role=block('function startRoleActiveRecordRuntime','async function subscribeTeacherLegacy');
 assert.match(role,/event\.state==='legacy'.+startLegacy\(\)/s);assert.match(role,/\['loading','waiting'\].+activeRoleWriteAllowed=false/s);assert.match(role,/event\.state==='blocked'.+activeRoleWriteAllowed=false/s);
});

test('只有 Daniel 主帳號免除授權監聽，Catherine 備援 Owner 停權會清空畫面並登出',()=>{
 assert.match(source,/cloudRole==='owner'&&cloudEmailKey===OWNER_EMAIL\?'':roleAccessSignature/);
 assert.match(source,/if\(!cloudEmailKey\|\|\(cloudRole==='owner'&&cloudEmailKey===OWNER_EMAIL\)\)return/);
 assert.match(source,/function revokeCurrentRoleAccess\(message\)\{[\s\S]*__danbridgeSetDB\(emptyDB\(\)\)[\s\S]*signOut\(auth\)/);
});
