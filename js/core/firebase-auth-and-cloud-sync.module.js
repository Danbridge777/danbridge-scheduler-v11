import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getLimitedUseToken } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app-check.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-functions.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocFromServer, setDoc, deleteDoc, deleteField, onSnapshot, collection, query, where, getDocs, getDocsFromServer, serverTimestamp, Timestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';
import {bootstrapDanbridgeFirebase} from './firebase-environment-bootstrap.js?v=20.26.118';
import {createShardedSnapshot,assembleShardedSnapshot,canRunStagingShadow} from './cloud-sharded-store.js?v=20.26.86';
import {createFirebaseRecordShadowAdapter} from './firebase-record-shadow-adapter.js?v=20.26.86';
import {createFirebaseFullRecordShadowAdapter} from './firebase-full-record-shadow-adapter.js?v=20.26.107';
import {buildRecordShadowRunManifest,verifyRecordShadowRun,buildRecordShadowActivation,canonicalRecordShadowCore,canonicalLegacyRecordShadowCore,extractFullRecordShadowSyncResult,buildFullRecordShadowRunIdentity} from './cloud-record-shadow-run.js?v=20.26.86';
import {evaluateRecordShadowReadCandidate} from './cloud-record-shadow-read-candidate.js?v=20.26.86';
import {prepareImmutableMigrationBackup,verifyImmutableMigrationBackupReadback,sealImmutableMigrationBackup,verifyImmutableMigrationBackupManifest,sha256Canonical} from './cloud-immutable-migration-backup.js?v=20.26.86';
import {createFirebaseRoleViewCandidateAdapter} from './firebase-role-view-candidate-adapter.js?v=20.26.109';
import {verifyOwnRoleViewCandidateReadback} from './cloud-role-view-candidate.js?v=20.26.109';
import {buildFullRecordCandidateManifest,buildRoleViewCandidateManifest as buildLegacyRoleViewCandidateManifest,buildAtomicRecordActivation,evaluateAtomicRecordActivation} from './cloud-record-activation.js?v=20.26.86';
import {decideRecordReadTakeover} from './cloud-record-read-takeover.js?v=20.26.88';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js?v=20.26.107';
import {recordDataDigest,recordDataHash} from './cloud-record-data-hash.js?v=20.26.106';
import {buildStagingLivePreflight} from './cloud-staging-live-preflight.js?v=20.26.106';
import {createBrowserOperationJournalStorage} from './browser-operation-journal-storage.js?v=20.26.106';
import {createBrowserStagingLiveExecutionStorage} from './browser-staging-live-execution-storage.js?v=20.26.106';
import {createOperationJournal} from './cloud-operation-journal.js?v=20.26.106';
import {enqueueOperationPlan,runOperationWorker} from './cloud-operation-worker.js?v=20.26.106';
import {createFirebaseLiveRecordOperationAdapter} from './firebase-live-record-operation-adapter.js?v=20.26.106';
import {assertStagingExecutionManifestEnvelope,stripStagingExecutionManifestAudit,verifyStagingLiveJournalRows} from './cloud-staging-live-activation.js?v=20.26.106';
import {createFirebaseStagingLiveActivationAdapter} from './firebase-staging-live-activation-adapter.js?v=20.26.106';
import {createActiveRecordPageController} from './cloud-active-record-page-controller.js?v=20.26.151';
import {createFirebaseActiveRecordStreamAdapter} from './firebase-active-record-stream-adapter.js?v=20.26.106';
import {createFirebaseActiveRecordOperationAdapter} from './firebase-active-record-operation-adapter.js?v=20.26.106';
import {createFirebaseRecordSyncConflictBackupAdapter} from './firebase-record-sync-conflict-backup-adapter.js?v=20.26.106';
import {createFirebaseRoleRecordViewAdapter} from './firebase-role-record-view-adapter.js?v=20.26.116';
import {createFirebaseRoleRecordStreamAdapter} from './firebase-role-record-stream-adapter.js?v=20.26.106';
import {createActiveRoleRecordPublishQueue} from './cloud-active-role-record-publish-queue.js?v=20.26.115';
import {decideOwnerActiveSaveIntent} from './cloud-owner-active-save-intent.js?v=20.26.117';
import {createRecordSyncActiveFailureResume} from './record-sync-active-failure-resume.js?v=20.26.114';
import {dailyBackupChunkCore,prepareDailyShardedBackup,sealDailyShardedBackup,verifyDailyShardedBackupReadback} from './cloud-daily-sharded-backup.js?v=20.26.106';
import {createFirebaseRecordSyncCandidateAdapter} from './firebase-record-sync-candidate-adapter.js?v=20.26.106';
import {buildRecordSyncRoleEvidence,RECORD_SYNC_ROLE_SCENARIOS} from './cloud-record-sync-role-evidence.js?v=20.26.106';
import {buildRecordSyncActivationManifest,buildActiveRecordSyncControl,evaluateActiveRecordSyncControl} from './cloud-record-sync-control.js?v=20.26.106';
import {createFirebaseRecordSyncActivationAdapter} from './firebase-record-sync-activation-adapter.js?v=20.26.106';
import {verifyRoleViewCandidateSourceBinding,buildRoleViewCandidateSourceAudit,buildRoleViewCandidateManifest as buildVerifiedRoleViewCandidateManifest,assertRoleViewCandidateManifest,buildRoleViewVerificationReceipt,assertRoleViewVerificationReceipt,verifyRoleViewReceiptSet} from './cloud-role-view-verification.js?v=20.26.106';
import {loadProfileAfterAuthReady} from './cloud-auth-profile-bootstrap.js?v=20.26.113';
import {RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH,RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH,createFirebaseRecordSyncV2TakeoverCandidateAdapter} from './firebase-record-sync-v2-takeover-candidate-adapter.js?v=20.26.117';
import {createStagingV2AuthorityReadLoader} from './staging-v2-authority-read-loader.js?v=20.26.119';
import {createStagingV2AuthoritySaveBrowserClient} from './staging-v2-authority-save-browser-client.js?v=20.26.120';
import {createStagingV2ActiveRecordOperationSender,normalizeStagingV2FirestoreValue,stagingV2H0GenesisBaselineDocuments} from './staging-v2-active-record-browser-bridge.js?v=20.26.121';
import {verifyStagingV2PrewriteBackup} from './staging-v2-prewrite-backup-verifier.js?v=20.26.120';
import {createFirebaseProductionRecordConflictAdapter,createFirebaseProductionRecordStreamAdapter} from './firebase-production-record-runtime-adapter.js?v=20.26.151';
import {buildProductionRecordRuntimeControl,assertProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,assertProductionRecordRuntimeSafety,assertLegacyProductionRecordRuntimeSafety} from './cloud-production-record-runtime.js?v=20.26.146';
import {CLOUD_BOOTSTRAP_STAGES,createCloudBootstrapProgress} from './cloud-bootstrap-progress.js?v=20.26.134';
import {createProductionTrustedOperationClient} from './production-trusted-operation-client.js?v=20.26.134';
import {prepareActiveRecordSync} from './cloud-active-record-sync.js?v=20.26.134';

const firebaseConfigs={
 production:{apiKey:"AIzaSyB4tID5Dl1c_6MCev1OZxMSpiYFq3t3_EU",authDomain:"danbridge-d8877.firebaseapp.com",projectId:"danbridge-d8877",messagingSenderId:"251283850754",appId:"1:251283850754:web:105a2813d86918af03091b",measurementId:"G-K6ZH7DF7RS"},
 staging:{apiKey:"AIzaSyDD1zt1Zc8n8Rzk6Vf1hYhanRWHzfrmGeI",authDomain:"danbridge-d8877-staging.firebaseapp.com",projectId:"danbridge-d8877-staging",storageBucket:"danbridge-d8877-staging.firebasestorage.app",messagingSenderId:"883029466360",appId:"1:883029466360:web:c45a0a2164d4c897aaef0d"}
};
const {environment:DANBRIDGE_ENVIRONMENT,firebaseConfig,app,auth,cloud}=bootstrapDanbridgeFirebase({hostname:location.hostname,configs:firebaseConfigs,initializeApp,getAuth,initializeFirestore,firestoreOptions:{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}});
document.body.dataset.environment=DANBRIDGE_ENVIRONMENT;
window.__DANBRIDGE_ENVIRONMENT__=DANBRIDGE_ENVIRONMENT;

const COMPANY_ID='danbridge';
const OWNER_EMAIL='a0965487920@gmail.com';
const APP_RELEASE='20.26.151';
const SCHEDULER_ACCOUNT_EMAILS=new Set(['aa0966626336@gmail.com']);
const RETIRED_SCHEDULER_ACCOUNT_EMAILS=new Set(['wendylee0820520@gmail.com']);
const REPORT_NOTIFICATION_STARTED_AT=Date.parse('2026-08-11T06:50:00.000Z');
const OWNER_SYNC_RECOVERY_KEY='danbridge_owner_sync_recovery_v20210';
const CLOUD_BACKUP_RETENTION_DAYS=30;
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});
const PREFER_REDIRECT_LOGIN=new URLSearchParams(location.search).get('auth')==='redirect';
const STAGING_V2_APP_CHECK_SITE_KEY='6LfvKqItAAAAALRIut991852bJzOP3Aekm8WeXB9';
const PRODUCTION_APP_CHECK_SITE_KEY='6Lf8MqMtAAAAAEGgj4w4c5X6f4bI4dqdVvOtqPoa';
const stagingV2AppCheck=DANBRIDGE_ENVIRONMENT==='staging'?initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(STAGING_V2_APP_CHECK_SITE_KEY),isTokenAutoRefreshEnabled:true}):null;
const productionAppCheck=DANBRIDGE_ENVIRONMENT==='production'?initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(PRODUCTION_APP_CHECK_SITE_KEY),isTokenAutoRefreshEnabled:true}):null;
const productionFunctions=DANBRIDGE_ENVIRONMENT==='production'?getFunctions(app,'asia-east1'):null;
const productionTrustedOperationClient=DANBRIDGE_ENVIRONMENT==='production'&&productionAppCheck?createProductionTrustedOperationClient({call:httpsCallable(productionFunctions,'productionTrustedOperation',{limitedUseAppCheckTokens:true}),getIdentity:()=>({uid:cloudUid,email:cloudEmailKey})}):null;
const productionRoleViewPublishCall=DANBRIDGE_ENVIRONMENT==='production'&&productionAppCheck?httpsCallable(productionFunctions,'productionPublishRoleViews',{limitedUseAppCheckTokens:true}):null;
const productionTeacherLeaveCall=DANBRIDGE_ENVIRONMENT==='production'&&productionAppCheck?httpsCallable(productionFunctions,'productionTeacherLeaveOperation',{limitedUseAppCheckTokens:true}):null;
const productionNotificationAcknowledgeCall=DANBRIDGE_ENVIRONMENT==='production'&&productionAppCheck?httpsCallable(productionFunctions,'productionAcknowledgeScheduleNotification',{limitedUseAppCheckTokens:true}):null;
const productionPitrPreviewCall=DANBRIDGE_ENVIRONMENT==='production'&&productionAppCheck?httpsCallable(productionFunctions,'productionPitrClonePreview',{limitedUseAppCheckTokens:true},):null;

// Explicit-only staging migration composition. Merely importing this module never creates or activates V2.
export function createExplicitStagingV2TakeoverCandidateBinder(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||firebaseConfig.projectId!=='danbridge-d8877-staging'||app.options?.projectId!=='danbridge-d8877-staging'||auth.app!==app||cloud.app!==app)throw new Error('V2 takeover candidate browser binder requires the exact staging Firebase app');
 const ownData=(value,key,label)=>{const descriptor=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key):null;if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(`${label}.${key} must be an own data field`);return descriptor.value};
 const sameUser=(user,uid,email,label)=>{const latestEmail=typeof auth.currentUser?.email==='string'?auth.currentUser.email.trim().toLowerCase():'';if(auth.currentUser!==user||auth.currentUser?.uid!==uid||latestEmail!==email)throw new Error(label)};
 return Object.freeze({
  scope:'inactive-explicit-only-staging-v2-candidate-not-active-runtime-or-write-takeover-authority',
  async execute(input){
   const plan=ownData(input,'plan','candidate execute input'),targetV2Epoch=ownData(plan,'targetV2Epoch','candidate plan'),user=auth.currentUser,uid=user?.uid,email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
   if(typeof uid!=='string'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(uid)||!/^[^@\s]+@[^@\s]+$/.test(email)||typeof user.getIdTokenResult!=='function')throw new Error('V2 takeover candidate browser binder requires a valid current Firebase user');
   const tokenResult=await user.getIdTokenResult(true);sameUser(user,uid,email,'V2 takeover candidate browser auth changed after fresh token');
   const claims=ownData(tokenResult,'claims','Firebase IdTokenResult'),subject=ownData(claims,'sub','Firebase token claims'),userId=ownData(claims,'user_id','Firebase token claims'),tokenEmail=ownData(claims,'email','Firebase token claims'),audience=ownData(claims,'aud','Firebase token claims'),issuer=ownData(claims,'iss','Firebase token claims'),operator=Object.getOwnPropertyDescriptor(claims,'recordSyncV2CutoverOperator');
   if(subject!==uid||userId!==uid||typeof tokenEmail!=='string'||tokenEmail.trim().toLowerCase()!==email||audience!=='danbridge-d8877-staging'||issuer!=='https://securetoken.google.com/danbridge-d8877-staging'||!operator?.enumerable||!Object.prototype.hasOwnProperty.call(operator,'value')||operator.value!==true)throw new Error('V2 takeover candidate browser binder requires the fresh trusted operator token');
   const allowedPaths=new Set([RECORD_SYNC_V2_TAKEOVER_CANDIDATE_CONTROL_PATH(targetV2Epoch),RECORD_SYNC_V2_TAKEOVER_CANDIDATE_HEAD_PATH(targetV2Epoch)]),reference=path=>{if(!allowedPaths.has(path))throw new Error('V2 takeover candidate browser path is outside the exact candidate pair');return doc(cloud,...path.split('/'))};
   sameUser(user,uid,email,'V2 takeover candidate browser auth changed before transaction');
   const adapter=createFirebaseRecordSyncV2TakeoverCandidateAdapter({environment:'staging',role:'owner',actor:{uid,email,claims:{recordSyncV2CutoverOperator:true}},serverTimestamp,getDocumentFromServer:path=>getDocFromServer(reference(path)),runTransaction:callback=>runTransaction(cloud,transaction=>callback({get:path=>transaction.get(reference(path)),set:(path,payload)=>transaction.set(reference(path),payload,{merge:false})}))});
   let result;try{result=await adapter.execute(input)}catch(error){try{sameUser(user,uid,email,'V2 takeover candidate browser auth changed during transaction; exact replay required')}catch(race){race.cause=error;throw race}throw error}
   sameUser(user,uid,email,'V2 takeover candidate browser auth changed after transaction; response-loss exact replay required');
   return result;
  }
 });
}

// End explicit staging V2 takeover candidate binder.

// Explicit-only owner read path. Constructing this object does not switch the
// page runtime, subscribe to data, or perform any read. The caller must pass the
// atomically activated epoch after the separate activation gate has completed.
export function createExplicitStagingV2AuthorityReadLoader(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||firebaseConfig.projectId!=='danbridge-d8877-staging'||app.options?.projectId!=='danbridge-d8877-staging'||auth.app!==app||cloud.app!==app)throw new Error('V2 authority reader requires the exact staging Firebase app');
 const sameUser=(user,uid,email,label)=>{const current=auth.currentUser,currentEmail=typeof current?.email==='string'?current.email.trim().toLowerCase():'';if(current!==user||current?.uid!==uid||currentEmail!==email)throw new Error(label)};
 const loader=createStagingV2AuthorityReadLoader({
  expectedProjectId:'danbridge-d8877-staging',
  getDocumentFromServer:async path=>{const snapshot=await getDocFromServer(doc(cloud,...path.split('/')));return snapshot.exists()?snapshot.data():null},
  getCollectionFromServer:async path=>{const snapshot=await getDocsFromServer(collection(cloud,...path.split('/')));return snapshot.docs.map(row=>({id:row.id,data:row.data()}))},
 });
 return Object.freeze({scope:loader.scope,async load(request){
  const user=auth.currentUser,uid=user?.uid,email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
  if(typeof uid!=='string'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(uid)||email!==OWNER_EMAIL||cloudRole!=='owner'||typeof user.getIdTokenResult!=='function')throw new Error('V2 authority reader requires the signed-in primary Owner');
  await user.getIdTokenResult(true);sameUser(user,uid,email,'V2 authority reader auth changed after fresh token');
  const model=await loader.load(request);sameUser(user,uid,email,'V2 authority reader auth changed during server inventory');
  return model;
 }})
}

// 舊版 Header 使用 onclick="authLogout()"；公開相容 API，避免 Header 重建前點擊失效。
let logoutInFlight=false;
window.authLogout=async function authLogout(){
 if(logoutInFlight)return;
 logoutInFlight=true;
 const button=document.getElementById('firebaseLogoutBtn');
 if(button){button.disabled=true;button.textContent='正在安全登出…'}
 cloudStatus('正在安全登出…','pending');
 try{await signOut(auth);window.location.reload()}
 catch(error){
   console.error('Firebase logout failed:',error);
   cloudStatus('登出失敗：'+(error?.message||error),'error');
   logoutInFlight=false;
   if(button){button.disabled=false;button.textContent='登出'}
 }
};
document.addEventListener('click',event=>{
 const target=event.target instanceof Element?event.target.closest('#firebaseLogoutBtn'):null;
 if(!target)return;
 event.preventDefault();
 void window.authLogout();
},true);
try{await setPersistence(auth,browserLocalPersistence)}catch(e){console.warn(e)}
let cloudRole='';
let cloudTeacherId='';
let cloudBranchIds=[];
let cloudUid='';
let cloudEmailKey='';
let cloudRoleAccessSignature='';
let cloudCanManageSchedule=false;
let schedulerBaselineLessons=[],schedulerBaselineStudents=[];
let schedulerSaveChain=Promise.resolve();
let schedulerOptimisticLessons=new Map();
let schedulerOptimisticStudents=new Map();
let schedulerUploadRetryTimer=null,schedulerUploadRetryCount=0;
let schedulerStartupRecoveryChecked=false;
let schedulerEmergencyRecoveryCandidates=[];
let schedulerRecoveryHold=false;
function inspectSchedulerLocalRecoveryCandidates(){
 const candidates=[],add=(label,value)=>{if(!value||!Array.isArray(value.lessons)||!Array.isArray(value.students)||!Array.isArray(value.teachers))return;const dates=value.lessons.map(l=>l.date).filter(Boolean).sort();candidates.push({label,db:deepCopy(value),lessons:value.lessons.length,students:value.students.length,teachers:value.teachers.length,from:dates[0]||'—',to:dates.at(-1)||'—'})},parse=raw=>{try{return JSON.parse(raw||'null')}catch{return null}};
 add('主本機資料',parse(localStorage.getItem('danbridge_scheduler_v1')));add('aa 角色快取',parse(localStorage.getItem(localRoleCacheKey())));add('草稿資料',parse(localStorage.getItem('danbridge_scheduler_draft_v8')));try{const versions=parse(localStorage.getItem('danbridge_scheduler_versions_v4'));if(Array.isArray(versions))versions.forEach((v,index)=>add(`版本 ${index+1}｜${v.reason||v.createdAt||''}`,v.data))}catch{}
 schedulerEmergencyRecoveryCandidates=candidates.sort((a,b)=>b.lessons-a.lessons);return schedulerEmergencyRecoveryCandidates.map(({db,...summary})=>summary);
}
window.__danbridgeInspectSchedulerRecovery=inspectSchedulerLocalRecoveryCandidates;
function buildSchedulerRecoveryDifferenceReport(){
 inspectSchedulerLocalRecoveryCandidates();const source=schedulerEmergencyRecoveryCandidates.find(x=>x.label==='主本機資料'),comparison=schedulerEmergencyRecoveryCandidates.find(x=>x.label==='aa 角色快取');if(!source||!comparison)return null;
 const lessonKey=row=>String(row?.id||''),studentKey=row=>String(row?.id||''),comparisonLessons=new Map(comparison.db.lessons.map(row=>[lessonKey(row),row])),comparisonStudents=new Map(comparison.db.students.map(row=>[studentKey(row),row]));
 const missingLessons=source.db.lessons.filter(row=>!comparisonLessons.has(lessonKey(row))).map(row=>({id:row.id||'',date:row.date||'',start:row.start||row.startTime||'',end:row.end||row.endTime||'',teacherId:row.teacherId||'',teacher:row.teacher||row.teacherName||'',studentId:row.studentId||'',student:row.student||row.studentName||row.className||'',location:row.location||row.branch||'',room:row.room||row.classroom||'',raw:deepCopy(row)})).sort((a,b)=>`${a.date} ${a.start} ${a.id}`.localeCompare(`${b.date} ${b.start} ${b.id}`));
 const missingStudents=source.db.students.filter(row=>!comparisonStudents.has(studentKey(row))).map(row=>deepCopy(row));return{generatedAt:new Date().toISOString(),release:APP_RELEASE,readOnly:true,source:{label:source.label,lessons:source.lessons,students:source.students},comparison:{label:comparison.label,lessons:comparison.lessons,students:comparison.students},missingLessonCount:missingLessons.length,missingStudentCount:missingStudents.length,missingLessons,missingStudents};
}
window.__danbridgeBuildSchedulerRecoveryDifferenceReport=buildSchedulerRecoveryDifferenceReport;
function downloadSchedulerRecoveryDifferenceReport(){const report=buildSchedulerRecoveryDifferenceReport();if(!report)return alert('找不到可比較的主本機資料與 aa 角色快取。');const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`danbridge-aa-recovery-difference-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);alert(`唯讀差異報告已下載：\n缺少課程 ${report.missingLessonCount} 堂\n缺少學生 ${report.missingStudentCount} 位\n\n此報告只供安全檢查，不會還原、上傳或修改資料。`)}
function showSchedulerRecoveryInspector(){
 if(document.getElementById('schedulerRecoveryInspector'))return;const report=buildSchedulerRecoveryDifferenceReport();if(!report||(!report.missingLessonCount&&!report.missingStudentCount))return;const button=document.createElement('button');button.id='schedulerRecoveryInspector';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:92px;z-index:10002;background:#7f1d1d;color:#fff;border-color:#fecaca;box-shadow:0 10px 28px rgba(127,29,29,.28)';button.textContent=`下載唯讀差異（課程 ${report.missingLessonCount}）`;button.onclick=downloadSchedulerRecoveryDifferenceReport;document.body.appendChild(button);
}
let unsubscribeScheduleRequests=null;
let schedulerRequestQueue=[],schedulerRequestQueueIds=new Set(),schedulerRequestWorkerActive=false,schedulerRequestRetryTimer=null;
let schedulerQuarantinedRequestIds=new Set(),schedulerAppliedRequestCount=0;
let applyingCloud=false;
let stagingShadowQueued=null;
let stagingShadowInFlight=false;
let stagingShadowLastVerifiedHash='';
let stagingShadowDiagnostic={state:'idle',generationId:'',sourceHash:'',verifiedHash:'',totalChunks:0,totalRecords:0,error:'',updatedAt:''};
function setStagingShadowDiagnostic(next){
 stagingShadowDiagnostic={...stagingShadowDiagnostic,...next,updatedAt:new Date().toISOString()};
 if(DANBRIDGE_ENVIRONMENT!=='staging')return;
 document.body.dataset.stagingShadowState=stagingShadowDiagnostic.state;
 document.body.dataset.stagingShadowSourceHash=stagingShadowDiagnostic.sourceHash;
 document.body.dataset.stagingShadowVerifiedHash=stagingShadowDiagnostic.verifiedHash;
 document.body.dataset.stagingShadowChunks=String(stagingShadowDiagnostic.totalChunks||0);
 document.body.dataset.stagingShadowRecords=String(stagingShadowDiagnostic.totalRecords||0);
}
let unsubscribeState=null;
let unsubscribeAccessGuard=null;
let syncTimer=null;
let unsubscribeReports=null;
let unsubscribeScheduleNotifications=null;
let unsubscribeOwnerHealth=null,lastOwnerHealthSignal='';
let scheduleNotificationDocuments=[];
let currentScheduleNotification=null;
let unsubscribeTeacherLeaves=null;
let teacherLeaveDocuments=[];
let scheduleNotificationCleanupStarted=false;
let lastPublishedOwnerDB=null;
let ownerBaselineReady=false;
let lessonReportDocuments=[];
let currentReportNotification=null;
let ownerUploadInFlight=false;
let ownerUploadQueued=false;
let ownerRetryTimer=null;
let ownerRetryCount=0;
let ownerUploadCapacityBlocked=false;
let activeRecordSyncFailureResumeDiagnostic={state:'disabled',targetRecordId:'',pending:0,sending:0,failed:0,quarantined:0,confirmed:0};
let activeRecordMode=['staging','production'].includes(DANBRIDGE_ENVIRONMENT)?'checking':'legacy';
let activeRecordPageController=null;
let activeRecordStreamAdapter=null;
let activeRoleStreamAdapter=null;
let activeRoleWriteAllowed=false;
let activeOwnerDeviceId='';
let activeOwnerControllerEpoch='';
let activeOwnerResumedEpoch='';
let activeOwnerV2ReadDocuments=null;
let activeOwnerProductionReadDocuments=null;
let activeOwnerV2OperationSender=null;
let activeOwnerV2HeadState='';
let activeOwnerV2Fence=null;
let activeRoleBootstrapEpoch='';
let activeRoleBootstrapInFlight=false;
let activeRoleBootstrapRetryCount=0;
let activeRoleBootstrapRetryTimer=null;
let activeRoleBootstrapSourceDb=null;
let activeRoleRecordPublishQueue=null;
const scheduleNotificationDeliveryJobs=new Map();
let roleViewPublishInFlight=false;
let roleViewPublishQueued=false;
let roleViewPublishSourceDB=null;
let roleViewRetryCount=0;
let roleViewRetryTimer=null;
let lastUploadedHash='';
let lastCloudSnapshotHash='';
let approvedLessonShrinkHash='';
// 本機資料一旦修改，在雲端確認寫入前禁止舊 snapshot 倒灌覆蓋。
let localDirtyHash='';
let localMutationVersion=0;
let ownerRecoveryBaseDB=null;
let reportSyncTimer=null;
let lessonMetaSignatureCache=new Map();
let lessonMetaCacheReady=false;
let scopedViewHashCache=new Map();
let companyAccessCache=null;
let companyAccessCacheAt=0;
let legacyMigrationStarted=false;
const SYNC_HEALTH_BASELINE_KEY='danbridge_sync_health_baseline_v1';
let lastSyncHealthReport=null;
const COMPANY_ACCESS_CACHE_TTL=30000;
const errorEventQueue=[];
const errorEventFingerprints=new Map();
let errorEventCount=0;
let dailyBackupTimer=null;
let dailyBackupConfirmedDay='';
let originalSaveDB=window.saveDB;
const originalEditLesson=window.editLesson;

function emptyDB(){return {students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],branches:[]}}
function deepCopy(x){return JSON.parse(JSON.stringify(x||emptyDB()))}
function teacherLeaveOperationId(){return`leaveop-${globalThis.crypto?.randomUUID?.().replaceAll('-','')||`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`}
async function executeTeacherLeaveOperation(payload={}){
 if(DANBRIDGE_ENVIRONMENT!=='production'||!productionTeacherLeaveCall)throw new Error('請假操作只允許正式環境的受保護後端');
 const user=auth.currentUser,uid=user?.uid||'',email=String(user?.email||'').trim().toLowerCase();if(!user||uid!==cloudUid||email!==cloudEmailKey)throw new Error('登入身分已變更，請重新整理');
 const operationId=String(payload.operationId||teacherLeaveOperationId()),leaveId=String(payload.leaveId||`leave-${globalThis.crypto?.randomUUID?.().replaceAll('-','')||Date.now().toString(36)}`),request={...payload,operationId,leaveId},result=await productionTeacherLeaveCall(request);
 if(auth.currentUser!==user||auth.currentUser?.uid!==uid||String(auth.currentUser?.email||'').trim().toLowerCase()!==email)throw new Error('請假同步完成時登入身分已改變，請重新整理確認');
 if(result?.data?.ok!==true)throw new Error('請假後端未回傳完成確認');
 return result.data;
}
window.__danbridgeSaveTeacherLeave=payload=>executeTeacherLeaveOperation(payload);
window.__danbridgeCancelTeacherLeave=payload=>executeTeacherLeaveOperation({...payload,action:'cancel'});
function subscribeTeacherLeaves(){
 unsubscribeTeacherLeaves?.();unsubscribeTeacherLeaves=null;teacherLeaveDocuments=[];window.__danbridgeSetTeacherLeaves?.([]);
 if(DANBRIDGE_ENVIRONMENT!=='production'||!['owner','teacher'].includes(cloudRole))return;
 let leaveQuery=query(collection(cloud,'productionTeacherLeaveRecords'),where('companyId','==',COMPANY_ID));
 if(cloudRole==='teacher'&&!cloudCanManageSchedule){if(!cloudTeacherId)return;leaveQuery=query(collection(cloud,'productionTeacherLeaveRecords'),where('companyId','==',COMPANY_ID),where('teacherId','==',cloudTeacherId))}
 unsubscribeTeacherLeaves=onSnapshot(leaveQuery,{includeMetadataChanges:true},snapshot=>{if(snapshot.metadata.hasPendingWrites)return;teacherLeaveDocuments=snapshot.docs.map(row=>({id:row.id,...row.data()})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.start||'').localeCompare(String(a.start||'')));window.__danbridgeSetTeacherLeaves?.(teacherLeaveDocuments)},error=>{console.error('Teacher leave listener failed',error);window.__danbridgeSetTeacherLeaveError?.(String(error?.message||error));cloudStatus('請假紀錄讀取失敗：'+String(error?.message||error),'error')});
}
function activeFirestoreDocument(path){
 const parts=String(path||'').split('/');if(!path||parts.some(part=>!part)||parts.length%2!==0)throw new Error('逐筆 Firestore 文件路徑無效');return doc(cloud,path);
}
function activeFirestoreCollection(path){
 const parts=String(path||'').split('/');if(!path||parts.some(part=>!part)||parts.length%2!==1)throw new Error('逐筆 Firestore 集合路徑無效');return collection(cloud,path);
}
function activeFirestoreTransaction(work){
 if(typeof work!=='function')throw new Error('逐筆 Firestore transaction work 無效');return runTransaction(cloud,native=>work({get:path=>native.get(activeFirestoreDocument(path)),set:(path,value)=>native.set(activeFirestoreDocument(path),value,{merge:false})}));
}
function activeFirestoreSubscribeDocument(path,next,error){
 return onSnapshot(activeFirestoreDocument(path),{includeMetadataChanges:true},snapshot=>next({exists:snapshot.exists(),data:snapshot.exists()?snapshot.data():null,hasPendingWrites:snapshot.metadata.hasPendingWrites,fromCache:snapshot.metadata.fromCache}),error);
}
function activeFirestoreSubscribeCollection(path,next,error){
 return onSnapshot(activeFirestoreCollection(path),{includeMetadataChanges:true},snapshot=>next({hasPendingWrites:snapshot.metadata.hasPendingWrites,fromCache:snapshot.metadata.fromCache,documents:snapshot.docs.map(row=>({id:row.id,data:row.data()})),changes:snapshot.docChanges({includeMetadataChanges:true}).map(change=>({type:change.type,id:change.doc.id,data:change.doc.data()}))}),error);
}
async function readActiveRecordDocuments(){
 if(DANBRIDGE_ENVIRONMENT!=='staging')throw new Error('日常逐筆讀取只允許 staging');const entries=await Promise.all(FULL_RECORD_COLLECTIONS.map(async collectionName=>{const snapshot=await getDocs(activeFirestoreCollection(`stagingFullRecordShadows/${COMPANY_ID}/collections/${collectionName}/records`));return[collectionName,snapshot.docs.map(row=>({id:row.id,data:row.data()}))]}));return Object.fromEntries(entries);
}
async function readActiveRecordDocumentsFromServer(){
 if(DANBRIDGE_ENVIRONMENT!=='staging')throw new Error('日常逐筆 fresh server 讀取只允許 staging');const entries=await Promise.all(FULL_RECORD_COLLECTIONS.map(async collectionName=>{const snapshot=await getDocsFromServer(activeFirestoreCollection(`stagingFullRecordShadows/${COMPANY_ID}/collections/${collectionName}/records`));return[collectionName,snapshot.docs.map(row=>({id:row.id,data:row.data()}))]}));return Object.fromEntries(entries);
}
function activeOwnerDeviceIdentity(){
 if(activeOwnerDeviceId)return activeOwnerDeviceId;if(!['staging','production'].includes(DANBRIDGE_ENVIRONMENT)||cloudRole!=='owner'||!cloudEmailKey)throw new Error('逐筆裝置 identity 尚未建立');const key=`danbridge-active-record-device:${DANBRIDGE_ENVIRONMENT}:${cloudEmailKey}`;let value='';try{value=String(localStorage.getItem(key)||'')}catch{}if(!/^[A-Za-z0-9_.:-]{8,128}$/.test(value)){const random=globalThis.crypto?.randomUUID?.().replaceAll('-','')||`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;value=`web_${random}`;if(!/^[A-Za-z0-9_.:-]{8,128}$/.test(value))throw new Error('無法建立安全的逐筆裝置 identity');try{localStorage.setItem(key,value)}catch{throw new Error('無法永久保存逐筆裝置 identity')}}activeOwnerDeviceId=value;return value;
}
function stopActiveRecordRuntimes(){
 try{activeRecordStreamAdapter?.stop?.()}catch{}try{activeRoleStreamAdapter?.stop?.()}catch{}try{activeRecordPageController?.stop?.()}catch{}clearTimeout(activeRoleBootstrapRetryTimer);activeRecordStreamAdapter=null;activeRoleStreamAdapter=null;activeRecordPageController=null;activeRoleWriteAllowed=false;activeOwnerDeviceId='';activeOwnerControllerEpoch='';activeOwnerResumedEpoch='';activeOwnerV2ReadDocuments=null;activeOwnerProductionReadDocuments=null;activeOwnerV2OperationSender=null;activeOwnerV2HeadState='';activeOwnerV2Fence=null;activeRoleBootstrapEpoch='';activeRoleBootstrapInFlight=false;activeRoleBootstrapRetryCount=0;activeRoleBootstrapRetryTimer=null;activeRoleBootstrapSourceDb=null;if(activeRoleRecordPublishQueue){activeRoleRecordPublishQueue.closeScope();}activeRecordMode=['staging','production'].includes(DANBRIDGE_ENVIRONMENT)?'checking':'legacy';delete document.body.dataset.activeRecordMode;delete document.body.dataset.activeRecordState;delete document.body.dataset.activeRoleRecordState;delete document.body.dataset.activeRoleRecordBootstrap;delete document.body.dataset.activeRecordAuthority;
}
function localRoleCacheKey(){
 if(cloudRole==='owner')return 'danbridge_scheduler_v1';
 const identity=(cloudEmailKey||cloudUid||'unknown').replace(/[^a-z0-9@._-]/gi,'_');
 return `danbridge_scheduler_view_${cloudRole||'signed_out'}_${identity}`;
}
function persistCurrentLocalView(){try{localStorage.setItem(localRoleCacheKey(),JSON.stringify(window.__danbridgeGetDB()))}catch{}}
function persistOwnerSyncRecovery(){
 if(cloudRole!=='owner'||!localDirtyHash)return;
 try{localStorage.setItem(OWNER_SYNC_RECOVERY_KEY,JSON.stringify({hash:localDirtyHash,mutationVersion:localMutationVersion,baseDb:ownerRecoveryBaseDB||lastPublishedOwnerDB||null,updatedAt:new Date().toISOString()}))}catch{}
}
function clearOwnerSyncRecovery(){ownerRecoveryBaseDB=null;try{localStorage.removeItem(OWNER_SYNC_RECOVERY_KEY)}catch{}}
function restoreOwnerSyncRecovery(){
 if(cloudRole!=='owner')return false;
 try{const saved=JSON.parse(localStorage.getItem(OWNER_SYNC_RECOVERY_KEY)||'null'),currentHash=dataHash(window.__danbridgeGetDB?.());if(saved?.hash&&saved.hash===currentHash){localDirtyHash=saved.hash;localMutationVersion=Math.max(localMutationVersion,Number(saved.mutationVersion)||1);ownerRecoveryBaseDB=saved.baseDb?deepCopy(saved.baseDb):null;ownerUploadQueued=true;return true}if(saved?.hash)clearOwnerSyncRecovery()}catch{}
 return false;
}
let cloudStatusHideTimer=null;
let cloudBootstrapProgress=null,cloudBootstrapTimeout=null;
function renderCloudBootstrapProgress(snapshot){
 let panel=document.getElementById('cloudBootstrapProgress');if(!panel){panel=document.createElement('section');panel.id='cloudBootstrapProgress';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.style.cssText='position:fixed;left:12px;bottom:58px;z-index:10000;width:min(360px,calc(100vw - 24px));padding:12px 14px;border-radius:14px;background:#fff;color:#172033;border:1px solid #dbe4ef;box-shadow:0 12px 30px rgba(15,23,42,.18);font-size:12px';document.body.appendChild(panel)}
 const labels={authenticated:'Google 登入',profile:'權限資料',role:'角色範圍',data:'雲端資料',ready:'可以使用'},index=CLOUD_BOOTSTRAP_STAGES.indexOf(snapshot.stage);panel.hidden=snapshot.state==='ready';panel.dataset.state=snapshot.state;panel.innerHTML=`<div style="font-weight:900;margin-bottom:8px">登入與同步檢查</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">${CLOUD_BOOTSTRAP_STAGES.map((stage,i)=>`<span style="height:5px;border-radius:99px;background:${i<=index?'#18794e':'#dbe4ef'}"></span>`).join('')}</div><div style="margin-top:8px"><b>${escapeHTML(labels[snapshot.stage]||snapshot.stage)}</b>｜${escapeHTML(snapshot.message)}</div>${snapshot.readOnly?'<div style="margin-top:6px;color:#9a6700;font-weight:800">安全唯讀：權限或雲端資料確認完成前不會寫入。</div>':''}`;
 const main=document.querySelector('main'),locked=snapshot.state!=='ready';if(main){main.inert=locked;main.setAttribute('aria-busy',locked?'true':'false');main.style.pointerEvents=locked?'none':'';main.style.userSelect=locked?'none':''}
 document.body.dataset.cloudBootstrapState=snapshot.state;
}
function beginCloudBootstrap(){clearTimeout(cloudBootstrapTimeout);cloudBootstrapProgress=createCloudBootstrapProgress({timeoutMs:20000});renderCloudBootstrapProgress(cloudBootstrapProgress.snapshot());cloudBootstrapTimeout=setTimeout(()=>{if(!cloudBootstrapProgress)return;const current=cloudBootstrapProgress.snapshot();if(current.state!=='loading')return;renderCloudBootstrapProgress(cloudBootstrapProgress.fail(new Error('雲端確認超過 20 秒，仍會自動重試'),{readOnly:true}));cloudStatus('雲端確認較久，目前安全唯讀並持續重試','pending')},20050)}
function advanceCloudBootstrap(stage,message){if(!cloudBootstrapProgress)return;try{renderCloudBootstrapProgress(cloudBootstrapProgress.advance(stage,message));if(stage==='ready'){clearTimeout(cloudBootstrapTimeout);cloudBootstrapTimeout=null}}catch{}}
function failCloudBootstrap(error){if(!cloudBootstrapProgress)return;clearTimeout(cloudBootstrapTimeout);cloudBootstrapTimeout=null;renderCloudBootstrapProgress(cloudBootstrapProgress.fail(error,{readOnly:false}))}
function cloudStatus(text,kind=''){let el=document.getElementById('firebaseCloudStatus');if(!el){el=document.createElement('div');el.id='firebaseCloudStatus';el.setAttribute('aria-live','polite');el.style.cssText='position:fixed;left:12px;bottom:12px;z-index:10001;padding:8px 11px;border-radius:10px;background:#172033;color:#fff;font-size:12px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.2);pointer-events:none';document.body.appendChild(el)}clearTimeout(cloudStatusHideTimer);el.hidden=false;el.textContent=text;el.dataset.kind=kind||'';el.style.background=kind==='error'?'#991b1b':kind==='ok'?'#18794e':kind==='pending'?'#9a6700':kind==='offline'?'#475569':'#172033';if(kind==='ok'&&cloudBootstrapProgress?.snapshot().stage==='data')advanceCloudBootstrap('ready','權限與雲端資料已確認');if(kind==='ok')cloudStatusHideTimer=setTimeout(()=>{if(el.dataset.kind==='ok')el.hidden=true},2200)}
function canonicalHashValue(value){
 if(Array.isArray(value))return value.map(canonicalHashValue);
 if(value&&typeof value==='object'){
  if(typeof value.toMillis==='function')return{__timestampMillis:value.toMillis()};
  return Object.keys(value).sort().reduce((result,key)=>{result[key]=canonicalHashValue(value[key]);return result},{});
 }
 return value;
}
function dataHash(value){try{const text=JSON.stringify(canonicalHashValue(value||{}));let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+text.length}catch{return String(Date.now())}}
const OWNER_MERGE_COLLECTION_KEYS=['students','teachers','lessons','makeups','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
const OWNER_APPEND_ONLY_COLLECTION_KEYS=['changes'];
function cloneMergeValue(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function mergeValueHash(value){return value===undefined?'__undefined__':dataHash(['__defined__',value])}
function mergeOwnerRecord(base,local,remote,path,conflicts){
 if(mergeValueHash(local)===mergeValueHash(base))return cloneMergeValue(remote);
 if(mergeValueHash(remote)===mergeValueHash(base)||mergeValueHash(local)===mergeValueHash(remote))return cloneMergeValue(local);
 if(!local||!remote||typeof local!=='object'||typeof remote!=='object'||Array.isArray(local)||Array.isArray(remote)){
  conflicts.push({path,local:cloneMergeValue(local),remote:cloneMergeValue(remote)});return cloneMergeValue(local);
 }
 const result={},keys=new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})]);
 for(const key of keys){
  const b=base?.[key],l=local?.[key],r=remote?.[key],localChanged=mergeValueHash(l)!==mergeValueHash(b),remoteChanged=mergeValueHash(r)!==mergeValueHash(b);
  if(!localChanged)result[key]=cloneMergeValue(r);
  else if(!remoteChanged||mergeValueHash(l)===mergeValueHash(r))result[key]=cloneMergeValue(l);
  else if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r))result[key]=mergeOwnerRecord(b,l,r,`${path}.${key}`,conflicts);
  else {conflicts.push({path:`${path}.${key}`,local:cloneMergeValue(l),remote:cloneMergeValue(r)});result[key]=cloneMergeValue(l)}
 }
 return result;
}
function mergeOwnerCollection(baseRows=[],localRows=[],remoteRows=[],key,conflicts){
 const identity=(row,index)=>String(row?.id||row?.key||row?.email||row?.month||`${key}:missing-id:${index}`);
 const map=(rows)=>new Map((rows||[]).map((row,index)=>[identity(row,index),row]));
 const base=map(baseRows),local=map(localRows),remote=map(remoteRows),result=[];
 for(const id of new Set([...remote.keys(),...local.keys(),...base.keys()])){
  const b=base.get(id),l=local.get(id),r=remote.get(id),localChanged=mergeValueHash(l)!==mergeValueHash(b),remoteChanged=mergeValueHash(r)!==mergeValueHash(b);
  if(!localChanged){if(r!==undefined)result.push(cloneMergeValue(r));continue}
  if(!remoteChanged||mergeValueHash(l)===mergeValueHash(r)){if(l!==undefined)result.push(cloneMergeValue(l));continue}
  if(l===undefined){conflicts.push({path:`${key}.${id}:delete`,local:null,remote:cloneMergeValue(r)});result.push(cloneMergeValue(r));continue}
  if(r===undefined){conflicts.push({path:`${key}.${id}:remote-delete`,local:cloneMergeValue(l),remote:null});result.push(cloneMergeValue(l));continue}
  result.push(mergeOwnerRecord(b,l,r,`${key}.${id}`,conflicts));
 }
 return result;
}
function mergeAppendOnlyOwnerCollection(baseRows=[],localRows=[],remoteRows=[]){
 const hash=row=>dataHash(row),baseCounts=new Map(),result=[],resultCounts=new Map();
 for(const row of baseRows||[])baseCounts.set(hash(row),(baseCounts.get(hash(row))||0)+1);
 for(const row of remoteRows||[]){const key=hash(row);result.push(cloneMergeValue(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 const localCounts=new Map();
 for(const row of localRows||[]){
  const key=hash(row),seen=(localCounts.get(key)||0)+1;localCounts.set(key,seen);
  const baseCount=baseCounts.get(key)||0,target=Math.max(resultCounts.get(key)||0,seen,baseCount);
  if((resultCounts.get(key)||0)<target){result.push(cloneMergeValue(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 }
 return result;
}
function mergeConcurrentOwnerDB(baseDb,localDb,remoteDb){
 const base=baseDb||emptyDB(),local=localDb||emptyDB(),remote=remoteDb||emptyDB(),merged=deepCopy(remote),conflicts=[];
 for(const key of OWNER_MERGE_COLLECTION_KEYS)merged[key]=mergeOwnerCollection(base[key],local[key],remote[key],key,conflicts);
 for(const key of OWNER_APPEND_ONLY_COLLECTION_KEYS)merged[key]=mergeAppendOnlyOwnerCollection(base[key],local[key],remote[key]);
 for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  if(OWNER_MERGE_COLLECTION_KEYS.includes(key)||OWNER_APPEND_ONLY_COLLECTION_KEYS.includes(key))continue;
  merged[key]=mergeOwnerRecord(base[key],local[key],remote[key],key,conflicts);
 }
 const unique=[];for(const conflict of conflicts)if(!unique.some(x=>x.path===conflict.path))unique.push(conflict);
 return{db:merged,conflicts:unique};
}
function conflictBackupParts(conflicts,maxChars=160000){
 const serialized=JSON.stringify(conflicts),parts=[];for(let offset=0;offset<serialized.length;offset+=maxChars)parts.push(serialized.slice(offset,offset+maxChars));return parts.length?parts:['[]'];
}
const AUDIT_COLLECTION_KEYS=['students','teachers','lessons','makeups','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
function auditEntityId(row,index){return String(row?.id||row?.email||row?.month||index)}
function auditChangedFields(before,after){const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);return[...keys].filter(key=>JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])).sort().slice(0,30)}
function buildImmutableDataAudit(beforeDb,afterDb){
 if(!beforeDb||!afterDb)return null;
 const entityChanges=[],fieldSet=new Set();let totalChanges=0;
 for(const key of AUDIT_COLLECTION_KEYS){
  const beforeRows=Array.isArray(beforeDb[key])?beforeDb[key]:[],afterRows=Array.isArray(afterDb[key])?afterDb[key]:[];
  const beforeMap=new Map(beforeRows.map((row,index)=>[auditEntityId(row,index),row])),afterMap=new Map(afterRows.map((row,index)=>[auditEntityId(row,index),row]));
  for(const id of new Set([...beforeMap.keys(),...afterMap.keys()])){
   const before=beforeMap.get(id),after=afterMap.get(id);if(JSON.stringify(before)===JSON.stringify(after))continue;
   const operation=!before?'create':!after?'delete':'update',fields=auditChangedFields(before,after);fields.forEach(field=>fieldSet.add(`${key}.${field}`));totalChanges++;
   if(entityChanges.length<80)entityChanges.push(`${key}:${operation}:${id}:${fields.join(',')}`);
  }
 }
 if(!totalChanges)return null;
 return{action:'data-change',category:'data',targetType:'company-data',targetId:COMPANY_ID,changedFields:[...fieldSet].slice(0,80),entityChanges,totalChanges,truncated:totalChanges>entityChanges.length,beforeHash:dataHash(beforeDb),afterHash:dataHash(afterDb)};
}
function immutableAuditRecord(detail={}){
 const afterHash=String(detail.afterHash||''),beforeHash=String(detail.beforeHash||''),stable=detail.eventId||dataHash([detail.category,detail.action,detail.targetType,detail.targetId,beforeHash,afterHash,Date.now(),Math.random()]).replace(/[^a-z0-9_-]/gi,'-');
 const payload={companyId:COMPANY_ID,action:String(detail.action||'unknown').slice(0,64),category:String(detail.category||'system').slice(0,32),actorUid:cloudUid,actorEmail:cloudEmailKey,targetType:String(detail.targetType||'system').slice(0,48),targetId:String(detail.targetId||'').slice(0,180),changedFields:(detail.changedFields||[]).map(String).slice(0,80),entityChanges:(detail.entityChanges||[]).map(String).slice(0,80),totalChanges:Math.max(0,Number(detail.totalChanges)||0),truncated:detail.truncated===true,beforeHash:beforeHash.slice(0,80),afterHash:afterHash.slice(0,80),release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT,createdAt:serverTimestamp()};
 return{ref:doc(cloud,'companyAudit',`${COMPANY_ID}-${stable}`),payload};
}
async function writeImmutableAudit(detail={}){
 if(cloudRole!=='owner'||!cloudUid||!cloudEmailKey)return false;
 const audit=immutableAuditRecord(detail);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);if(!existing.exists())transaction.set(audit.ref,audit.payload)});return true;
}
const COMPANY_ACCESS_MUTABLE_FIELDS=['email','displayName','role','companyId','active','invitedBy','teacherId','teacherName','managerName','branchIds','branchNames','readOnly','canSubmitOwnReports','canManageSchedule','scopedDb'];
const COMPANY_ACCESS_USER_MIRROR_FIELDS=['displayName','role','active','teacherId','teacherName','managerName','branchIds','branchNames','readOnly','canSubmitOwnReports','canManageSchedule','scopedDb'];
function isDeleteFieldSentinel(value){return value?._methodName==='deleteField'||/DeleteField/i.test(String(value?.constructor?.name||''))}
function canonicalCompanyAccessPayload(current,payload,merge){const next={};for(const key of COMPANY_ACCESS_MUTABLE_FIELDS){if(Object.prototype.hasOwnProperty.call(payload||{},key)){if(!isDeleteFieldSentinel(payload[key]))next[key]=payload[key]}else if(merge&&Object.prototype.hasOwnProperty.call(current||{},key))next[key]=current[key]}return next}
function companyAccessUserMirrorPayload(payload){return Object.fromEntries(Object.entries(payload||{}).filter(([key])=>COMPANY_ACCESS_USER_MIRROR_FIELDS.includes(key)))}
async function companyUserRefs(email){const snapshot=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',String(email||'').trim().toLowerCase())));return snapshot.docs.map(row=>row.ref)}
async function setCompanyAccessWithAudit(email,payload,detail,merge=true,userRefs=[]){
 if(DANBRIDGE_ENVIRONMENT==='production'){
  const accessRef=doc(cloud,'companyAccess',email),snapshot=await getDocFromServer(accessRef),current=snapshot.exists()?snapshot.data():{},next=canonicalCompanyAccessPayload(current,payload,merge);
  if(snapshot.exists()&&JSON.stringify(canonicalCompanyAccessPayload({},current,false))===JSON.stringify(next))return{kind:'unchanged-access',write:false,revision:Number(current.accessRevision)||0};
  return productionTrustedOperationClient.mutateAccess({action:'upsert',email,expectedRevision:Number(current.accessRevision)||0,payload:next,userPaths:userRefs.map(ref=>ref.path),detail:{...detail,release:APP_RELEASE}});
 }
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email),mirror=companyAccessUserMirrorPayload(payload);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);transaction.set(accessRef,payload,{merge});userRefs.forEach(userRef=>transaction.set(userRef,mirror,{merge:true}));if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function deleteCompanyAccessWithAudit(email,detail,userRefs=[]){
 if(DANBRIDGE_ENVIRONMENT==='production'){
  const snapshot=await getDocFromServer(doc(cloud,'companyAccess',email)),current=snapshot.exists()?snapshot.data():{};
  if(!snapshot.exists())return{kind:'unchanged-access',write:false,revision:0};
  return productionTrustedOperationClient.mutateAccess({action:'delete',email,expectedRevision:Number(current.accessRevision)||0,userPaths:userRefs.map(ref=>ref.path),detail:{...detail,release:APP_RELEASE}});
 }
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);userRefs.forEach(userRef=>transaction.set(userRef,{active:false,role:'revoked',updatedAt:serverTimestamp()},{merge:true}));transaction.delete(accessRef);if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function deleteOwnerAccessWithAudit(email,userRefs,detail){
 if(DANBRIDGE_ENVIRONMENT==='production'){
  const snapshot=await getDocFromServer(doc(cloud,'companyAccess',email)),current=snapshot.exists()?snapshot.data():{};
  if(!snapshot.exists())return{kind:'unchanged-access',write:false,revision:0};
  return productionTrustedOperationClient.mutateAccess({action:'delete',email,expectedRevision:Number(current.accessRevision)||0,userPaths:userRefs.map(ref=>ref.path),detail:{...detail,release:APP_RELEASE}});
 }
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);userRefs.forEach(userRef=>transaction.set(userRef,{active:false,role:'revoked',updatedAt:serverTimestamp()},{merge:true}));transaction.delete(accessRef);if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function refreshRoleViewsAfterAccessMutation(){
 if(DANBRIDGE_ENVIRONMENT==='production')return publishScopedViews(deepCopy(window.__danbridgeGetDB()),{recordAuthority:true});
 publishRoleViewsWithRetry();
}
async function listImmutableAudit(){
 const box=document.getElementById('immutableAuditList');if(!box||cloudRole!=='owner')return;
 try{const qs=await getDocs(query(collection(cloud,'companyAudit'),where('companyId','==',COMPANY_ID))),rows=qs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)).slice(0,50);box.innerHTML=rows.length?rows.map(x=>`<div class="backup-item"><div class="info"><b>${escapeHTML(x.action||'操作')}</b><div class="small">${escapeHTML(x.actorEmail||x.actorUid||'Owner')}｜${escapeHTML(formatNotificationTimestamp(x.createdAt)||'時間確認中')}<br>${escapeHTML(x.targetType||'system')}：${escapeHTML(x.targetId||'—')}｜${Number(x.totalChanges)||0} 筆變更</div></div><span class="pill blue">不可覆寫</span></div>`).join(''):'<span class="small">尚無不可覆寫稽核紀錄。</span>'}catch(e){console.error('listImmutableAudit failed',e);box.innerHTML='<span class="small">稽核紀錄暫時無法讀取。</span>'}
}
function ownerSnapshotDecision(localDirty,incoming,current,lastCloud){if(localDirty&&incoming!==localDirty)return'ignore-dirty';if(incoming===lastCloud&&incoming===current)return'unchanged';return'apply'}
function ownerUploadConfirmation(uploadMutationVersion,currentMutationVersion,uploadedHash,latestHash){const confirmed=uploadMutationVersion===currentMutationVersion&&uploadedHash===latestHash;return{clearDirty:confirmed,queueNext:!confirmed}}
function ownerLessonShrinkRisk(beforeDb,afterDb){
 const beforeIds=new Set((beforeDb?.lessons||[]).map(row=>String(row?.id||'')).filter(Boolean));
 const afterIds=new Set((afterDb?.lessons||[]).map(row=>String(row?.id||'')).filter(Boolean));
 const removed=[...beforeIds].filter(id=>!afterIds.has(id)).length,before=beforeIds.size,after=afterIds.size;
 const risky=before>=20&&removed>=10&&removed/before>=0.1;
 return{risky,before,after,removed,ratio:before?removed/before:0};
}
function ownerRetryDelay(retryCount){return Math.min(30000,1000*Math.pow(2,Math.min(Math.max(0,retryCount),5)))}
function ownerMainDocumentBytes(sourceDb){return new TextEncoder().encode(JSON.stringify({db:sourceDb})).length}
function ownerUploadCapacityError(error){
 const code=String(error?.code||'').replace(/^firestore\//,'').toLowerCase(),message=String(error?.message||error||'').toLowerCase();
 return code==='invalid-argument'&&(message.includes('maximum allowed size')||message.includes('exceeds the maximum')||message.includes('document')&&message.includes('size'));
}
function safeErrorCode(error){
 const raw=String(error?.code||error?.name||'unknown').toLowerCase();
 return raw.replace(/[^a-z0-9._/-]/g,'-').slice(0,80)||'unknown';
}
async function sendOperationalError(event){
 if(!auth.currentUser||!cloudRole||errorEventCount>=20)return;
 const fingerprint=[event.category,event.area,event.code,cloudRole].join('|');
 const now=Date.now(),last=errorEventFingerprints.get(fingerprint)||0;
 if(now-last<60000)return;
 errorEventFingerprints.set(fingerprint,now);errorEventCount++;
 try{
   await setDoc(doc(collection(cloud,'companies',COMPANY_ID,'errorEvents')),{release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT,category:event.category,area:event.area,code:event.code,role:cloudRole,retryable:event.retryable===true,occurredAt:serverTimestamp()},{merge:false});
 }catch{ /* 監控寫入失敗不得影響操作，也不得形成遞迴錯誤。 */ }
}
function reportOperationalError(error,{category='unhandled',area='window',retryable=false}={}){
 const allowedCategories=new Set(['unhandled','cloud-write','cloud-read','role-view']);
 const allowedAreas=new Set(['window','promise','owner-upload','owner-snapshot','teacher-view','branch-view','role-publish','access-guard']);
 const event={category:allowedCategories.has(category)?category:'unhandled',area:allowedAreas.has(area)?area:'window',code:safeErrorCode(error),retryable:retryable===true};
 if(!auth.currentUser||!cloudRole){if(errorEventQueue.length<10)errorEventQueue.push(event);return}
 void sendOperationalError(event);
}
function flushOperationalErrors(){while(errorEventQueue.length)void sendOperationalError(errorEventQueue.shift())}
window.addEventListener('error',event=>reportOperationalError(event.error||{name:'window-error'}));
window.addEventListener('unhandledrejection',event=>reportOperationalError(event.reason||{name:'promise-rejection'},{area:'promise'}));
function withSyncTimeout(promise,ms=15000){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('雲端連線逾時，將自動重試')),ms))])}
function scheduleOwnerRetry(){clearTimeout(ownerRetryTimer);if(cloudRole!=='owner'||!ownerUploadQueued||ownerUploadCapacityBlocked)return;ownerRetryTimer=setTimeout(()=>uploadOwnerState(),ownerRetryDelay(ownerRetryCount))}
function setOfflineStatus(){if(!navigator.onLine){cloudStatus('目前離線；所有變更已先保存在這台裝置，恢復網路後會自動同步。','offline')}}
function setAuthCard(message='Sign in with your authorized Google account to continue.'){
 const screen=document.getElementById('authScreen');
 screen.innerHTML=`<div class="auth-minimal-shell">
  <section class="auth-minimal-brand" aria-label="Danbridge Operations">
    <div class="auth-minimal-wordmark">Danbridge</div>
    <div class="auth-feather-scene" aria-hidden="true">
      <span class="auth-feather-halo"></span>
      <img class="auth-gold-feather" src="./assets/images/danbridge-gold-feather-v2.png" alt="">
      <span class="auth-feather-line"></span>
    </div>
    <div class="auth-minimal-copy">
      <span>EDUCATION OPERATIONS</span>
      <h1>Quiet precision.<br><em>Exceptional learning.</em></h1>
      <p>Private education operations, refined.</p>
    </div>
  </section>

  <section class="auth-minimal-panel">
    <div class="auth-card auth-card-minimal">
    <div class="auth-card-seal"><i></i> SECURE ACCESS</div>
    <div class="auth-card-kicker">WELCOME BACK</div>
    <h1>Enter the workspace.</h1>
    <p>${message}</p>
    <button id="googleCloudLogin" type="button" class="auth-google-btn"><span class="auth-google-mark">G</span><span class="auth-google-label">Continue with Google</span><span class="auth-google-arrow">→</span></button>
    <div id="cloudLoginError" class="auth-error"></div>
    <div class="auth-minimal-security"><span>Authorized accounts only</span><i></i><span>Role-based access</span></div>
    <div class="auth-meta"><span>Danbridge English Co., Ltd.</span><strong>Private Cloud</strong></div>
    </div>
  </section>
</div>`;
 document.getElementById('googleCloudLogin').onclick=async()=>{const btn=document.getElementById('googleCloudLogin');btn.disabled=true;btn.querySelector('.auth-google-label').textContent='Signing in…';try{if(PREFER_REDIRECT_LOGIN){await signInWithRedirect(auth,provider);return}await signInWithPopup(auth,provider)}catch(e){console.error(e);if(['auth/popup-blocked','auth/cancelled-popup-request','auth/popup-closed-by-user','auth/network-request-failed'].includes(e.code)){try{await signInWithRedirect(auth,provider);return}catch(e2){showCloudLoginError(e2.message)}}else showCloudLoginError(e.message);btn.disabled=false;btn.querySelector('.auth-google-label').textContent='Continue with Google'}};
}
function showCloudLoginError(msg){const e=document.getElementById('cloudLoginError');if(e){e.textContent=msg;e.classList.add('show')}}
function setSignedOutIsolation(locked){
 const screen=document.getElementById('authScreen');
 if(locked){
  window.DanbridgeNotifications?.close?.();window.closeCourseDrawer?.();document.body.classList.remove('notification-center-open','course-drawer-open','lesson-paste-mode');
  const scheduleModal=document.getElementById('scheduleNotificationModal');if(scheduleModal)scheduleModal.hidden=true;
  const reportModal=document.getElementById('reportSubmissionNotificationModal');if(reportModal)reportModal.hidden=true;
  currentScheduleNotification=null;
  currentReportNotification=null;
  const sensitiveIds=['notificationList','notificationSummary','notificationFooter','scheduleNotificationBody','reportSubmissionNotificationBody','courseDrawerTitle','courseDrawerSubtitle','courseDrawerBody','cloudBackupList','syncRecoveryErrors','emergencyOwnerList','emergencyOwnerStatus','immutableAuditList'];
  sensitiveIds.forEach(id=>{const el=document.getElementById(id);if(!el)return;if(id==='notificationSummary')el.textContent='登入後顯示通知';else if(id==='notificationFooter')el.textContent='尚未更新';else el.replaceChildren()});
  const badge=document.getElementById('notificationCount');if(badge){badge.textContent='0';badge.hidden=true}
 }
 [...document.body.children].forEach(el=>{
  if(el===screen||['SCRIPT','STYLE','LINK'].includes(el.tagName))return;
  if(locked){el.dataset.authIsolated='1';el.inert=true;el.setAttribute('aria-hidden','true')}
  else if(el.dataset.authIsolated==='1'){el.inert=false;el.removeAttribute('aria-hidden');delete el.dataset.authIsolated}
 });
}
function showCloudApp(){setSignedOutIsolation(false);document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.classList.add('hidden')}
function showCloudLogin(){document.body.classList.add('auth-locked');document.getElementById('authScreen')?.classList.remove('hidden');setAuthCard();setSignedOutIsolation(true)}

async function ensureProfile(user){
 const emailKey=(user.email||'').trim().toLowerCase();
 if(!emailKey)throw new Error('This Google account does not have a usable email address.');

 // Owner 保留 users/{uid} 個人檔案；老師與校區管理者則直接以 companyAccess 為唯一權限來源。
 // 登入流程不再要求一般帳號寫入 users，避免任何 users 規則或舊資料欄位造成登入被拒絕。
 if(emailKey===OWNER_EMAIL){
   const ref=doc(cloud,'users',user.uid);let snap=await getDoc(ref);
   if(!snap.exists()){
     await setDoc(ref,{email:user.email,displayName:user.displayName||'Daniel',role:'owner',companyId:COMPANY_ID,createdAt:serverTimestamp(),active:true});
     snap=await getDoc(ref);
   }
   const p=snap.data();
   if(p.active===false)throw new Error('This account has been deactivated.');
   if(p.companyId!==COMPANY_ID||p.role!=='owner')throw new Error('The owner account profile is not configured correctly.');
   return p;
 }

 const accessSnap=await getDoc(doc(cloud,'companyAccess',emailKey));
 if(!accessSnap.exists())throw new Error('This Google account has not been authorized for Danbridge. Please ask the owner to add it in Security Settings.');
 const a=accessSnap.data()||{};
 if(a.active!==true)throw new Error('This account has been deactivated.');
 if(a.companyId!==COMPANY_ID)throw new Error('This account does not belong to Danbridge.');
 if(!['owner','teacher','branch_manager'].includes(a.role))throw new Error('The role assigned to this account is not valid.');
 if(a.role!=='owner'&&!a.teacherId)throw new Error('No teacher profile is linked to this account. Please ask the owner to update the account settings.');
 if(a.role==='branch_manager'&&(!Array.isArray(a.branchIds)||!a.branchIds.length))throw new Error('No branch has been assigned to this manager account.');
 return {
   email:user.email,
   displayName:a.displayName||user.displayName||'',
   role:a.role,
   companyId:a.companyId,
   active:true,
   teacherId:a.teacherId?String(a.teacherId):'',
   teacherName:a.teacherName||'',
   managerName:a.managerName||'',
   branchIds:Array.isArray(a.branchIds)?a.branchIds:[],
   branchNames:Array.isArray(a.branchNames)?a.branchNames:[],
   readOnly:a.readOnly===true,
   canSubmitOwnReports:a.canSubmitOwnReports!==false,
   canManageSchedule:a.canManageSchedule===true,
   scopedDb:a.scopedDb||null
 };
}
async function recordSuccessfulLogin(user,profile){
 const email=String(user?.email||profile?.email||'').trim().toLowerCase();
 if(!user?.uid||!email)return;
 const userRef=doc(cloud,'users',user.uid),existing=await getDoc(userRef),personal={displayName:user.displayName||profile?.displayName||'',photoURL:user.photoURL||'',lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()};
 if(existing.exists()){await setDoc(userRef,personal,{merge:true});return}
 const payload={email,displayName:user.displayName||profile?.displayName||'',photoURL:user.photoURL||'',role:profile.role,companyId:COMPANY_ID,active:profile.active!==false,lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()};
 if(profile.teacherId)payload.teacherId=String(profile.teacherId);
 if(profile.teacherName)payload.teacherName=profile.teacherName;
 if(profile.managerName)payload.managerName=profile.managerName;
 if(Array.isArray(profile.branchIds))payload.branchIds=profile.branchIds;
 if(Array.isArray(profile.branchNames))payload.branchNames=profile.branchNames;
 if(profile.role==='branch_manager'){payload.readOnly=true;payload.canSubmitOwnReports=profile.canSubmitOwnReports!==false}
 if(profile.role==='teacher'&&profile.canManageSchedule===true)payload.canManageSchedule=true;
 await setDoc(userRef,payload,{merge:false});
}
async function loadSignedInProfile(user){
 const load=()=>loadProfileAfterAuthReady({user,loadProfile:()=>ensureProfile(user)});
 const lockName=`danbridge-auth-profile:${DANBRIDGE_ENVIRONMENT}:${String(user?.uid||'unknown')}`;
 return navigator.locks?.request? navigator.locks.request(lockName,load):load();
}
function loginTimeValue(value){
 const date=value?.toDate?.()||new Date(value||0);
 return Number.isNaN(date.getTime())||date.getTime()<=0?'尚未登入':date.toLocaleString('zh-TW');
}
async function lastLoginByEmail(){
 const result=new Map(),qs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID)));
 qs.docs.forEach(d=>{const x=d.data(),email=String(x.email||'').trim().toLowerCase(),time=x.lastLoginAt?.toMillis?.()||new Date(x.lastLoginAt||0).getTime()||0,old=result.get(email);if(email&&(!old||time>old.time))result.set(email,{time,label:loginTimeValue(x.lastLoginAt)})});
 return result;
}
function teacherBadgeName(t){return String(t?.displayName||t?.name||'').trim()}

function resilienceStatus(message='',kind=''){
 const el=document.getElementById('cloudBackupStatus');if(el){el.textContent=message||'尚未檢查';el.dataset.kind=kind}
}
function backupDayKey(date=new Date()){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function backupCounts(db={}){return{students:db.students?.length||0,teachers:db.teachers?.length||0,lessons:db.lessons?.length||0,makeups:db.makeups?.length||0}}
function dailyShardedBackupDayRef(day){return doc(cloud,'dailyShardedBackups',COMPANY_ID,'days',day)}
function dailyShardedBackupChunksRef(day){return collection(cloud,'dailyShardedBackups',COMPANY_ID,'days',day,'chunks')}
function legacyDailyBackupDayRef(day){return doc(cloud,'companies',COMPANY_ID,'dailyBackups',day)}
async function listCloudSafetyBackups(){
 const list=document.getElementById('cloudBackupList');if(!list||cloudRole!=='owner')return;
 try{
  const [shardedResult,legacyResult]=await Promise.allSettled([getDocs(collection(cloud,'dailyShardedBackups',COMPANY_ID,'days')),getDocs(collection(cloud,'companies',COMPANY_ID,'dailyBackups'))]);
  if(shardedResult.status==='rejected'&&legacyResult.status==='rejected')throw shardedResult.reason;
  if(shardedResult.status==='rejected')console.warn('daily sharded backup list unavailable',shardedResult.reason);
  if(legacyResult.status==='rejected')console.warn('legacy daily backup list unavailable',legacyResult.reason);
  const sharded=shardedResult.status==='fulfilled'?shardedResult.value:null,legacy=legacyResult.status==='fulfilled'?legacyResult.value:null,byDay=new Map((legacy?.docs||[]).map(d=>[d.id,{id:d.id,...d.data()}]));(sharded?.docs||[]).forEach(d=>byDay.set(d.id,{id:d.id,...d.data()}));
  const rows=[...byDay.values()].sort((a,b)=>String(b.id).localeCompare(String(a.id))).slice(0,CLOUD_BACKUP_RETENTION_DAYS);
  list.innerHTML=rows.length?rows.map(x=>{const legacyVerified=!!x.snapshot&&dataHash(x.snapshot)===x.hash,shardedVerified=x.schema==='danbridge-daily-sharded-backup-v2'&&x.state==='verified'&&x.verifiedHash===x.sourceHash&&Number.isSafeInteger(x.chunkCount)&&x.chunkCount>0,verified=legacyVerified||shardedVerified,time=x.verifiedAt||x.createdAt;return`<div class="backup-item"><div class="info"><b>${escapeHTML(x.id)}</b><div class="small">學生 ${x.counts?.students||0}｜老師 ${x.counts?.teachers||0}｜課程 ${x.counts?.lessons||0}${shardedVerified?`<br>分片 ${x.chunkCount} 份｜${x.recordCount} 筆`:''}<br>${escapeHTML(formatNotificationTimestamp(time)||'時間確認中')}</div></div><div class="row-actions"><span class="pill ${verified?'green':'red'}">${shardedVerified?'分片讀回已驗證':legacyVerified?'雜湊一致':'驗證失敗'}</span>${verified?`<button type="button" class="btn cloud-backup-restore" data-day="${escapeHTML(x.id)}">還原</button>`:''}</div></div>`}).join(''):'<span class="small">尚未建立雲端安全快照。</span>';
  list.querySelectorAll('.cloud-backup-restore').forEach(button=>button.onclick=()=>restoreCloudSafetyBackup(button.dataset.day));
  const today=rows.find(x=>x.id===backupDayKey());if(today?.schema==='danbridge-daily-sharded-backup-v2'&&today.state==='verified'&&today.verifiedHash===today.sourceHash)dailyBackupConfirmedDay=today.id;resilienceStatus(today?'今日雲端快照已完成':'今日尚未建立雲端快照',today?'ok':'pending');
 }catch(e){console.error('listCloudSafetyBackups failed',e);resilienceStatus('雲端快照清單讀取失敗','error');list.innerHTML='<span class="small">讀取失敗，請稍後重試。</span>'}
}
async function readCloudSafetyBackup(day,backupSnapshot=null){
 let snapshot=backupSnapshot;if(!snapshot){snapshot=await getDoc(dailyShardedBackupDayRef(day));if(!snapshot.exists())snapshot=await getDoc(legacyDailyBackupDayRef(day))}if(!snapshot.exists())throw new Error('找不到這份雲端快照');const backup=snapshot.data();if(backup.snapshot){if(dataHash(backup.snapshot)!==backup.hash)throw new Error('舊版快照雜湊驗證失敗');return{backup,db:deepCopy(backup.snapshot),kind:'legacy'}}if(backup.schema!=='danbridge-daily-sharded-backup-v2'||backup.state!=='verified'||backup.verifiedHash!==backup.sourceHash)throw new Error('每日分片備份 manifest 尚未 verified');const chunks=await getDocs(dailyShardedBackupChunksRef(day)),readback=verifyDailyShardedBackupReadback(backup,chunks.docs.map(row=>row.data()));return{backup,db:readback.db,kind:'sharded',readback};
}
async function restoreCloudSafetyBackup(day){
 if(cloudRole!=='owner'||!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return;
 try{const {backup,db:restored}=await readCloudSafetyBackup(day);if(!confirm(`確定還原 ${day} 的雲端快照？\n學生 ${backup.counts?.students||0}、老師 ${backup.counts?.teachers||0}、課程 ${backup.counts?.lessons||0}\n\n所有分片已重新讀回並通過 hash。目前資料會先建立本機版本，再由還原內容取代。`))return;const beforeHash=dataHash(window.__danbridgeGetDB?.());window.snapshot?.();window.createVersion?.(`還原 ${day} 雲端快照前`);applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(restored));persistCurrentLocalView();window.renderAll?.()}finally{applyingCloud=false}await writeImmutableAudit({action:'backup-restored',category:'backup',targetType:'daily-backup',targetId:day,changedFields:['snapshot'],totalChanges:1,beforeHash,afterHash:dataHash(restored)});window.saveDB?.();cloudStatus(`已還原 ${day} 雲端快照，正在逐筆同步…`,'pending')}catch(e){console.error('restoreCloudSafetyBackup failed',e);alert('還原失敗：'+(e?.message||e))}
}
async function cleanupOldCloudBackups(){
 if(cloudRole!=='owner')return;
 const [sharded,legacy]=await Promise.all([getDocs(collection(cloud,'dailyShardedBackups',COMPANY_ID,'days')),getDocs(collection(cloud,'companies',COMPANY_ID,'dailyBackups'))]),cutoff=new Date();cutoff.setDate(cutoff.getDate()-CLOUD_BACKUP_RETENTION_DAYS);const expired=d=>/^\d{4}-\d{2}-\d{2}$/.test(d.id)&&new Date(`${d.id}T00:00:00`)<cutoff;
 await Promise.allSettled(sharded.docs.filter(expired).map(async d=>{const chunks=await getDocs(dailyShardedBackupChunksRef(d.id));await Promise.all(chunks.docs.map(chunk=>deleteDoc(chunk.ref)));await deleteDoc(d.ref)}));await Promise.allSettled(legacy.docs.filter(expired).map(d=>deleteDoc(d.ref)));
}
async function createCloudSafetyBackup(force=false,sourceOverride=null){
 if(cloudRole!=='owner')return false;
 const day=backupDayKey();if(!force&&dailyBackupConfirmedDay===day)return true;const current=deepCopy(sourceOverride||window.__danbridgeGetDB?.()),score=window.__danbridgeDataScore?.(current)||0;if(!score){resilienceStatus('資料為空，已阻止建立快照','error');return false}
 const ref=dailyShardedBackupDayRef(day);
 try{
  const existing=await getDoc(ref);if(existing.exists()){
   const saved=existing.data()||{},sealedSharded=saved.schema==='danbridge-daily-sharded-backup-v2'&&saved.environment===DANBRIDGE_ENVIRONMENT&&saved.companyId===COMPANY_ID&&saved.day===day&&saved.state==='verified'&&typeof saved.sourceHash==='string'&&saved.verifiedHash===saved.sourceHash&&Number.isSafeInteger(saved.chunkCount)&&saved.chunkCount>0&&Number.isSafeInteger(saved.recordCount)&&saved.recordCount>=0;
   // 自動備份每次只確認已封存且不可覆寫的 manifest；手動重驗或還原才逐片讀回，避免每筆小修改消耗整套讀取配額。
   if(force||!sealedSharded)await readCloudSafetyBackup(day,existing);
   dailyBackupConfirmedDay=day;await listCloudSafetyBackups();resilienceStatus(force?'今日不可覆寫雲端備份已重新讀回驗證':'今日不可覆寫雲端備份已確認','ok');return true
  }
  resilienceStatus('正在逐片建立今日雲端備份…','pending');const plan=prepareDailyShardedBackup(current,{day,environment:DANBRIDGE_ENVIRONMENT,maxChunkBytes:180000});
  for(let offset=0;offset<plan.chunks.length;offset+=50){const batch=plan.chunks.slice(offset,offset+50);await runTransaction(cloud,async transaction=>{const refs=batch.map(chunk=>doc(dailyShardedBackupChunksRef(day),chunk.chunkId)),snapshots=await Promise.all(refs.map(chunkRef=>transaction.get(chunkRef)));batch.forEach((chunk,index)=>{if(snapshots[index].exists()){if(sha256Canonical(dailyBackupChunkCore(snapshots[index].data()))!==sha256Canonical(chunk))throw new Error('今日備份分片已存在但內容衝突');return}transaction.set(refs[index],{...chunk,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false})})})}
  const chunkReadback=await getDocs(dailyShardedBackupChunksRef(day)),verified=verifyDailyShardedBackupReadback(plan.manifest,chunkReadback.docs.map(row=>row.data())),sealed=sealDailyShardedBackup(plan.manifest,verified,{verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey});await runTransaction(cloud,async transaction=>{const snapshot=await transaction.get(ref);if(snapshot.exists()){const saved=snapshot.data();if(saved.schema===sealed.schema&&saved.state==='verified'&&saved.sourceHash===sealed.sourceHash)return;throw new Error('今日備份 manifest 已存在且 identity 衝突')}transaction.set(ref,{...sealed,verifiedAt:serverTimestamp()},{merge:false})});
  dailyBackupConfirmedDay=day;cleanupOldCloudBackups().catch(error=>console.warn('cleanupOldCloudBackups failed',error));await listCloudSafetyBackups();cloudStatus('今日雲端安全快照已完成','ok');return true;
 }catch(e){console.error('createCloudSafetyBackup failed',e);resilienceStatus('建立雲端快照失敗，系統會在下次連線重試','error');reportOperationalError(e,{category:'cloud-write',area:'owner-upload',retryable:true});return false}
}
function scheduleDailyCloudBackup(){
 clearTimeout(dailyBackupTimer);
 // 逐筆模式只能由 controller 以已確認的雲端 baseline 建立寫入前備份。
 // 禁止一般計時器同時拿尚未確認的畫面資料競爭同一天的不可覆寫備份。
 if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy')return;
 dailyBackupTimer=setTimeout(()=>createCloudSafetyBackup(false),1200);
}
function readSyncHealthBaseline(){try{const value=JSON.parse(localStorage.getItem(SYNC_HEALTH_BASELINE_KEY)||'null');return value&&Number.isFinite(value.lessons)&&value.lessons>=0?value:null}catch{return null}}
function updateSyncHealthBaseline(counts){
 const previous=readSyncHealthBaseline(),today=new Date().toISOString().slice(0,10),next=!previous||counts.lessons>=previous.lessons?{day:today,lessons:counts.lessons,students:counts.students,teachers:counts.teachers,observedAt:new Date().toISOString()}:previous;
 try{localStorage.setItem(SYNC_HEALTH_BASELINE_KEY,JSON.stringify(next))}catch{}
 return next;
}
function syncHealthTimestamp(value){const millis=value?.toMillis?.()||0;return millis?new Date(millis).toISOString():''}
function formatHealthBytes(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/1048576).toFixed(2)} MiB`}
function buildSyncHealthReport({db,mainData,pendingRequests,errorRows,maintenanceData=null,ownerHealthData=null,restoreRehearsalData=null}){
 const counts=backupCounts(db),estimatedBytes=new TextEncoder().encode(JSON.stringify({db})).length,recordAuthority=DANBRIDGE_ENVIRONMENT==='production'&&activeRecordMode==='active'&&document.body.dataset.activeRecordAuthority==='production-records-authoritative',baseline=updateSyncHealthBaseline(counts),drop=Math.max(0,baseline.lessons-counts.lessons),dropRatio=baseline.lessons?drop/baseline.lessons:0;
 const sharded=createShardedSnapshot(db,{hash:dataHash,maxChunkBytes:180000,generationId:'read-only-preflight'}),rebuilt=assembleShardedSnapshot(sharded.manifest,sharded.chunks,{hash:dataHash}),shardPreflight={schema:sharded.manifest.schema,maxChunkBytes:sharded.manifest.maxChunkBytes,totalChunks:sharded.manifest.totalChunks,totalRecords:sharded.manifest.totalRecords,sourceHash:sharded.manifest.sourceHash,reassembledHash:dataHash(rebuilt),verified:true,collections:sharded.manifest.collections};
 const requestAges=pendingRequests.map(row=>{const created=row.createdAt?.toMillis?.()||0;return created?Math.max(0,Date.now()-created):0}),oldestRequestMs=Math.max(0,...requestAges);
 const flags={online:navigator.onLine,localDirty:Boolean(localDirtyHash),ownerUploading:ownerUploadInFlight,ownerQueued:ownerUploadQueued,roleViewUploading:roleViewPublishInFlight,roleViewQueued:roleViewPublishQueued,roleViewRetryCount,notificationBatches:scheduleNotificationDeliveryJobs.size,schedulerLocalQueue:schedulerRequestQueue.length,schedulerWorkerActive:schedulerRequestWorkerActive,schedulerQuarantined:schedulerQuarantinedRequestIds.size,pendingCloudRequests:pendingRequests.length,oldestRequestMs};
 const alerts=[];
 const maintenanceAge=maintenanceData?.finishedAt?.toMillis?.()?Date.now()-maintenanceData.finishedAt.toMillis():Infinity;
 if(DANBRIDGE_ENVIRONMENT==='production'&&maintenanceAge>36*3600000)alerts.push({level:maintenanceData?'error':'pending',message:maintenanceData?'每日後端維護超過 36 小時未成功，請檢查排程執行紀錄。':'正式後端每日維護尚未產生第一份 verified receipt。'});
 if(ownerHealthData?.state==='attention')for(const message of ownerHealthData.alerts||[])alerts.push({level:'error',message:`後端健康警示：${message}`});
 if(!flags.online)alerts.push({level:'error',message:'目前離線；所有新變更會留在本機，恢復網路後才續傳。'});
 if(!recordAuthority&&estimatedBytes>=921600)alerts.push({level:'error',message:`主資料估計 ${formatHealthBytes(estimatedBytes)}，已接近 Firestore 1 MiB 文件上限，應立即進行資料拆分。`});else if(!recordAuthority&&estimatedBytes>=768000)alerts.push({level:'pending',message:`主資料估計 ${formatHealthBytes(estimatedBytes)}，已進入容量預警區，建議安排資料拆分。`});
 if(drop>=10&&dropRatio>=.1)alerts.push({level:'error',message:`本機監測基準為 ${baseline.lessons} 堂，目前少 ${drop} 堂（${Math.round(dropRatio*100)}%）；已警示但不會自動還原或寫入。`});
 if(flags.schedulerQuarantined)alerts.push({level:'error',message:`有 ${flags.schedulerQuarantined} 筆 aa 異常要求被隔離，原始要求仍保留，需人工檢查。`});
 if(oldestRequestMs>=600000)alerts.push({level:'error',message:`最舊 aa 待處理要求已等待 ${Math.floor(oldestRequestMs/60000)} 分鐘。`});else if(oldestRequestMs>=120000)alerts.push({level:'pending',message:`最舊 aa 待處理要求已等待 ${Math.floor(oldestRequestMs/60000)} 分鐘，系統仍會自動續傳。`});
 if(roleViewRetryCount>=3)alerts.push({level:'error',message:`老師／aa 檢視已連續重試 ${roleViewRetryCount} 次，請保持 Owner 裝置連線並檢查錯誤紀錄。`});else if(roleViewPublishQueued||roleViewPublishInFlight)alerts.push({level:'pending',message:'老師／aa 檢視正在背景更新。'});
 const activeWork=flags.localDirty||flags.ownerUploading||flags.ownerQueued||flags.roleViewUploading||flags.roleViewQueued||flags.notificationBatches||flags.schedulerLocalQueue||flags.pendingCloudRequests;
 const level=alerts.some(x=>x.level==='error')?'error':alerts.length||activeWork?'pending':'ok';
 return{generatedAt:new Date().toISOString(),release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT,readOnly:true,level,counts,estimatedMainDocumentBytes:estimatedBytes,authority:{mode:recordAuthority?'production-records-authoritative':DANBRIDGE_ENVIRONMENT==='production'?'production-authority-unverified':'legacy-main',recordAuthority},main:{clientHash:DANBRIDGE_ENVIRONMENT==='production'?'':String(mainData?.clientHash||'').slice(0,16),updatedAt:DANBRIDGE_ENVIRONMENT==='production'?'':syncHealthTimestamp(mainData?.updatedAt),localMatchesCloud:DANBRIDGE_ENVIRONMENT==='production'?null:Boolean(mainData?.clientHash)&&mainData.clientHash===dataHash(db),retainedReadOnlySource:recordAuthority},maintenance:maintenanceData&&maintenanceData.schema==='danbridge-production-maintenance-run-v1'?{state:maintenanceData.state||'',runId:maintenanceData.runId||'',finishedAt:syncHealthTimestamp(maintenanceData.finishedAt),deleted:maintenanceData.deleted||{}}:null,ownerHealth:ownerHealthData&&ownerHealthData.schema==='danbridge-production-owner-health-v1'?{state:ownerHealthData.state,checkedAt:syncHealthTimestamp(ownerHealthData.checkedAt),metrics:ownerHealthData.metrics||{},pitrEnabled:ownerHealthData.pitrEnabled===true,deleteProtectionEnabled:ownerHealthData.deleteProtectionEnabled===true,configurationVerified:ownerHealthData.configurationVerified===true,earliestVersionTime:String(ownerHealthData.earliestVersionTime||''),timeMachineDependency:ownerHealthData.timeMachineDependency===true}:null,restoreRehearsal:restoreRehearsalData&&restoreRehearsalData.schema==='danbridge-production-pitr-rehearsal-v1'?{state:restoreRehearsalData.state,runId:restoreRehearsalData.runId,snapshotTime:syncHealthTimestamp(restoreRehearsalData.snapshotTime),finishedAt:syncHealthTimestamp(restoreRehearsalData.finishedAt),formalDataWrites:Number(restoreRehearsalData.formalDataWrites)||0}:null,shardPreflight,baseline:{...baseline,drop,dropRatio:Number(dropRatio.toFixed(4))},flags,alerts,errorEvents:errorRows.map(row=>({area:String(row.area||'sync'),code:String(row.code||'unknown'),retryable:row.retryable===true,occurredAt:syncHealthTimestamp(row.occurredAt)}))};
}
function downloadSyncHealthReport(){if(!lastSyncHealthReport)return alert('請先按「重新整理」完成健康檢查。');const blob=new Blob([JSON.stringify(lastSyncHealthReport,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`danbridge-sync-health-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
let activePitrPreviewDatabaseId='';
function pitrPreviewStorageKey(){
 if(DANBRIDGE_ENVIRONMENT!=='production'||cloudRole!=='owner'||cloudEmailKey!==OWNER_EMAIL||!cloudUid)return'';
 return `danbridgePitrPreviewDatabaseId:${firebaseConfig.projectId}:${cloudUid}`
}
function rememberedPitrPreviewDatabaseId(){const key=pitrPreviewStorageKey();if(!key)return'';const value=String(sessionStorage.getItem(key)||'').trim();return /^pitr-preview-[a-z0-9-]{12,63}$/.test(value)?value:''}
function rememberPitrPreviewDatabaseId(databaseId){activePitrPreviewDatabaseId=databaseId;const key=pitrPreviewStorageKey();if(!key)return;if(databaseId)sessionStorage.setItem(key,databaseId);else sessionStorage.removeItem(key)}
function pitrPreviewStatus(message,kind='pending'){const element=document.getElementById('pitrPreviewStatus');if(element){element.textContent=message;element.dataset.kind=kind}}
function renderPitrPreviewDiff(diff){const box=document.getElementById('pitrPreviewDiff');if(!box)return;const summary=diff?.summary;if(!summary){box.innerHTML='';return}box.innerHTML=[['暫存資料庫',diff.databaseId],['指定時間',new Date(diff.snapshotTime).toLocaleString('zh-TW')],['新增',summary.added],['變更',summary.changed],['當時有、目前已刪除',summary.removed],['未變更',summary.unchanged],['正式資料寫入',diff.formalDataWrites]].map(([label,value])=>`<div class="sync-health-metric"><span>${escapeHTML(String(label))}</span><b>${escapeHTML(String(value))}</b></div>`).join('')}
async function pollPitrPreview(databaseId,attempt=0){if(!productionPitrPreviewCall||attempt>720){activePitrPreviewDatabaseId='';return pitrPreviewStatus('暫存還原仍在雲端進行；重新整理後會自動續接同一筆 operation。','pending')}rememberPitrPreviewDatabaseId(databaseId);try{const response=await productionPitrPreviewCall({schema:'danbridge-production-pitr-clone-preview-request-v1',action:'status',requestId:`status-${crypto.randomUUID().replaceAll('-','')}`,databaseId}),data=response?.data||{};if(data.schema!=='danbridge-production-pitr-clone-preview-response-v1'||data.formalDataWrites!==0)throw new Error('PITR 預覽回應無效');if(data.state==='ready-read-only'){rememberPitrPreviewDatabaseId('');pitrPreviewStatus('暫存資料庫已建立，差異比對完成；正式資料完全未修改。','ok');renderPitrPreviewDiff(data.diff);return}const progress=data.progress?.completedWork&&data.progress?.estimatedWork?Math.round(Number(data.progress.completedWork)/Number(data.progress.estimatedWork)*100):0;pitrPreviewStatus(`正在建立獨立暫存資料庫${progress?`（${progress}%）`:''}；正式資料未修改。`,'pending');setTimeout(()=>pollPitrPreview(databaseId,attempt+1),5000)}catch(error){activePitrPreviewDatabaseId='';console.error('PITR preview status',error);pitrPreviewStatus(`PITR 預覽失敗：${String(error?.message||error)}`,'error')}}
async function startPitrPreview(){if(cloudRole!=='owner'||cloudEmailKey!==OWNER_EMAIL||!productionPitrPreviewCall)return pitrPreviewStatus('只有 Daniel 主要 Owner 可以建立正式 PITR 暫存還原。','error');const input=document.getElementById('pitrPreviewTime'),raw=String(input?.value||'');if(!raw)return pitrPreviewStatus('請先選擇要還原檢視的日期與時間。','error');const selected=new Date(raw);if(!Number.isFinite(selected.getTime()))return pitrPreviewStatus('選擇的時間無效。','error');selected.setSeconds(0,0);pitrPreviewStatus('正在驗證 PITR 時間並建立獨立暫存資料庫…','pending');try{const response=await productionPitrPreviewCall({schema:'danbridge-production-pitr-clone-preview-request-v1',action:'start',requestId:`preview-${crypto.randomUUID().replaceAll('-','')}`,snapshotTime:selected.toISOString()}),data=response?.data||{};if(data.schema!=='danbridge-production-pitr-clone-preview-response-v1'||!['cloning','ready-read-only'].includes(data.state)||data.formalDataWrites!==0||!data.databaseId)throw new Error('PITR 暫存還原回應無效');if(data.state==='ready-read-only'){rememberPitrPreviewDatabaseId('');pitrPreviewStatus('暫存資料庫已建立，差異比對完成；正式資料完全未修改。','ok');renderPitrPreviewDiff(data.diff);return}rememberPitrPreviewDatabaseId(data.databaseId);await pollPitrPreview(data.databaseId)}catch(error){console.error('start PITR preview',error);pitrPreviewStatus(`PITR 預覽未建立：${String(error?.message||error)}`,'error')}}
async function enableOwnerSystemNotifications(){const button=document.getElementById('enableOwnerSystemNotifications');if(cloudEmailKey!==OWNER_EMAIL)return;if(!('Notification'in window)){if(button)button.textContent='此瀏覽器不支援系統通知';return}const permission=await Notification.requestPermission();if(button)button.textContent=permission==='granted'?'Daniel 系統通知已啟用':'系統通知未允許';if(permission==='granted')new Notification('Danbridge 系統通知已啟用',{body:'正式環境出現健康警示時，Daniel 會收到瀏覽器系統通知。',tag:'danbridge-owner-health-enabled'})}
function notifyOwnerHealth(health){if(cloudEmailKey!==OWNER_EMAIL||!('Notification'in window)||Notification.permission!=='granted'||health?.state!=='attention')return;const body=(Array.isArray(health.alerts)?health.alerts:[]).slice(0,3).join('；')||'請開啟系統健康中心檢查';new Notification('Danbridge 正式環境需要注意',{body,tag:`danbridge-owner-health-${health.runId||'current'}`,renotify:true})}
async function renderSyncRecoveryCenter(){
 if(cloudRole!=='owner')return;
 const pendingPitrDatabaseId=rememberedPitrPreviewDatabaseId();if(pendingPitrDatabaseId&&!activePitrPreviewDatabaseId){pitrPreviewStatus('正在續接先前的 PITR 暫存還原；不會建立第二份。','pending');void pollPitrPreview(pendingPitrDatabaseId)}
 const summary=document.getElementById('syncRecoverySummary'),errors=document.getElementById('syncRecoveryErrors'),badge=document.getElementById('syncHealthBadge'),metrics=document.getElementById('syncHealthMetrics'),alerts=document.getElementById('syncHealthAlerts');if(!summary||!errors||!badge||!metrics||!alerts)return;
 const pending=[localDirtyHash&&'本機資料待上傳',ownerUploadInFlight&&'主資料同步中',ownerUploadQueued&&'主資料等待重試',roleViewPublishQueued&&'角色檢視等待重試',scheduleNotificationDeliveryJobs.size&&`${scheduleNotificationDeliveryJobs.size} 批課表通知待送`].filter(Boolean);
 summary.textContent=`網路：${navigator.onLine?'正常':'離線'}｜${pending.length?pending.join('｜'):'目前沒有待處理項目'}`;summary.dataset.kind=pending.length?'pending':'ok';
 badge.textContent='檢查中';badge.className='sync-health-badge pending';
 try{
  const mainPromise=DANBRIDGE_ENVIRONMENT==='production'?Promise.resolve({data:()=>({})}):getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),[mainSnap,errorSnap,requestSnap,maintenanceSnap,ownerHealthSnap,rehearsalSnap]=await Promise.all([mainPromise,getDocs(collection(cloud,'companies',COMPANY_ID,'errorEvents')),getDocs(query(collection(cloud,'companies',COMPANY_ID,'scheduleRequests'),where('status','==','pending'))),getDoc(doc(cloud,'companies',COMPANY_ID,'systemHealth','maintenance')),getDoc(doc(cloud,'companies',COMPANY_ID,'systemHealth','ownerAlert')),getDoc(doc(cloud,'companies',COMPANY_ID,'systemHealth','restoreRehearsal'))]),rows=errorSnap.docs.map(d=>d.data()).sort((a,b)=>(b.occurredAt?.toMillis?.()||0)-(a.occurredAt?.toMillis?.()||0)).slice(0,12),requests=requestSnap.docs.map(d=>d.data()),db=deepCopy(window.__danbridgeGetDB?.()||emptyDB());
  lastSyncHealthReport=buildSyncHealthReport({db,mainData:mainSnap.data()||{},pendingRequests:requests,errorRows:rows,maintenanceData:maintenanceSnap.data()||null,ownerHealthData:ownerHealthSnap.data()||null,restoreRehearsalData:rehearsalSnap.data()||null});const report=lastSyncHealthReport;
  badge.textContent=report.level==='ok'?'健康':report.level==='pending'?'處理中／注意':'需要處理';badge.className=`sync-health-badge ${report.level}`;
  metrics.innerHTML=[['主資料',`課程 ${report.counts.lessons}｜學生 ${report.counts.students}｜老師 ${report.counts.teachers}`],['資料權威',report.authority.recordAuthority?'正式逐筆資料｜舊主文件不讀取':DANBRIDGE_ENVIRONMENT==='production'?'正式逐筆權威尚未驗證；已停止讀取舊主文件':'舊主文件'],['估計容量',report.authority.recordAuthority?`${formatHealthBytes(report.estimatedMainDocumentBytes)}｜逐筆模式不受單一文件上限影響`:`${formatHealthBytes(report.estimatedMainDocumentBytes)} / 1 MiB`],['分片唯讀預檢',`${report.shardPreflight.totalChunks} 片｜${report.shardPreflight.totalRecords} 筆｜重組驗證通過`],['Owner 主資料',report.authority.recordAuthority?'逐筆讀回驗證通過':DANBRIDGE_ENVIRONMENT==='production'?'等待正式逐筆資料驗證':report.main.localMatchesCloud?'本機與雲端一致':(report.flags.localDirty?'本機變更待確認':'正在比對版本')],['災難復原',report.ownerHealth?.configurationVerified&&report.ownerHealth?.pitrEnabled&&report.ownerHealth?.deleteProtectionEnabled?`PITR 與刪除保護已實際讀回｜最早可還原 ${report.ownerHealth.earliestVersionTime||'確認中'}｜不依賴 Time Machine`:'PITR／刪除保護尚未完成實際讀回'],['還原演練',report.restoreRehearsal?`${report.restoreRehearsal.runId} 歷史快照讀回通過｜正式資料寫入 ${report.restoreRehearsal.formalDataWrites}`:'等待第一份每月 PITR 唯讀演練 receipt'],['後端健康',report.ownerHealth?`${report.ownerHealth.state==='healthy'?'正常':'注意'}｜錯誤 ${report.ownerHealth.metrics.recentErrors||0}｜待處理 ${report.ownerHealth.metrics.pendingRequests||0}`:'等待第一份健康評估'],['每日維護',report.maintenance?`${report.maintenance.runId} 已驗證｜清除錯誤 ${report.maintenance.deleted.errorEvents||0}、通知 ${report.maintenance.deleted.scheduleNotifications||0}`:'尚未收到後端維護 receipt'],['aa 要求',`雲端待處理 ${report.flags.pendingCloudRequests}｜本機佇列 ${report.flags.schedulerLocalQueue}｜隔離 ${report.flags.schedulerQuarantined}`],['老師／aa 檢視',report.flags.roleViewUploading||report.flags.roleViewQueued?`更新中｜重試 ${report.flags.roleViewRetryCount}`:'目前無待處理'],['課表通知',`待送 ${report.flags.notificationBatches} 批`]].map(([label,value])=>`<div class="sync-health-metric"><span>${escapeHTML(label)}</span><b>${escapeHTML(value)}</b></div>`).join('');
  alerts.innerHTML=report.alerts.length?report.alerts.map(item=>`<div class="sync-health-alert ${item.level}">${escapeHTML(item.message)}</div>`).join(''):'<div class="sync-health-alert ok">目前未偵測到容量、課程數下降或同步佇列異常。</div>';
  errors.innerHTML=rows.length?rows.map(x=>`<div class="backup-item"><div class="info"><b>${escapeHTML(x.area||'同步')}｜${escapeHTML(x.code||'unknown')}</b><div class="small">${escapeHTML(formatNotificationTimestamp(x.occurredAt)||'時間確認中')}｜${x.retryable?'可自動重試':'需人工檢查'}</div></div><span class="pill ${x.retryable?'blue':'red'}">${x.retryable?'已記錄':'注意'}</span></div>`).join(''):'<span class="small">目前沒有同步錯誤紀錄。</span>';
 }catch(e){badge.textContent='檢查失敗';badge.className='sync-health-badge error';alerts.innerHTML='<div class="sync-health-alert error">唯讀健康檢查暫時無法完成；沒有修改任何資料。</div>';errors.innerHTML='<span class="small">錯誤紀錄暫時無法讀取。</span>';console.error('renderSyncRecoveryCenter',e)}
}
async function retryAllOperationalSync(){
 if(cloudRole!=='owner')return;
 ownerUploadQueued=true;roleViewPublishQueued=true;cloudStatus('正在重試所有待處理同步…','pending');
 await uploadOwnerState(true);publishRoleViewsWithRetry();scheduleDailyCloudBackup();setTimeout(renderSyncRecoveryCenter,500);
}
function emergencyOwnerStatus(message='',kind=''){const el=document.getElementById('emergencyOwnerStatus');if(el){el.textContent=message;el.dataset.kind=kind;el.style.display=message?'block':'none'}}
async function listEmergencyOwners(){
 const box=document.getElementById('emergencyOwnerList');if(!box||cloudRole!=='owner')return;
 try{
  const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID),where('role','==','owner')));
  const primary=cloudEmailKey===OWNER_EMAIL,rows=qs.docs.map(d=>({id:d.id,...d.data()}));box.innerHTML=rows.length?rows.map(x=>{const email=String(x.email||x.id).toLowerCase(),active=x.active!==false,isPrimary=email===OWNER_EMAIL;return`<div class="backup-item"><div class="info"><b>${escapeHTML(isPrimary?'主要 Owner':(x.displayName||'備援 Owner'))}</b><div class="small">${escapeHTML(email)}</div></div><div class="row-actions"><span class="pill ${active?'green':'red'}">${active?'已啟用':'已停權'}</span>${isPrimary||!primary?'<span class="pill blue">受保護</span>':`<button type="button" class="btn emergency-owner-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger emergency-owner-delete" data-email="${escapeHTML(email)}">刪除</button>`}</div></div>`}).join(''):'<span class="small">尚未建立備援 Owner。</span>';
  box.querySelectorAll('.emergency-owner-toggle').forEach(button=>button.onclick=async()=>{await setCloudAccessActive(button.dataset.email,button.dataset.active!=='true');await listEmergencyOwners()});
  box.querySelectorAll('.emergency-owner-delete').forEach(button=>button.onclick=async()=>{await deleteEmergencyOwner(button.dataset.email);await listEmergencyOwners()});
 }catch(e){console.error('listEmergencyOwners failed',e);emergencyOwnerStatus('備援 Owner 清單讀取失敗，請稍後重試。','error');box.innerHTML='<span class="small">讀取失敗，請稍後重試。</span>'}
}
async function deleteEmergencyOwner(email){
 if(cloudEmailKey!==OWNER_EMAIL)return emergencyOwnerStatus('只有主要 Owner 可以刪除其他 Owner。','error');
 email=String(email||'').trim().toLowerCase();if(!email||email===OWNER_EMAIL)return;
 if(!confirm(`確定永久刪除 ${email} 的 Owner 登入權限？\n此帳號會立即失去所有 Danbridge 存取權。`))return;
 try{
  const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
  await deleteOwnerAccessWithAudit(email,userQs.docs.map(userDoc=>userDoc.ref),{action:'backup-owner-deleted',category:'access',targetType:'account',targetId:email,changedFields:['active','role'],totalChanges:1});
  await refreshRoleViewsAfterAccessMutation();
  invalidateCompanyAccessCache();emergencyOwnerStatus('備援 Owner 權限已刪除。','ok');await listImmutableAudit();
 }catch(e){console.error(e);emergencyOwnerStatus('刪除備援 Owner 失敗：'+(e?.message||e),'error')}
}
async function saveEmergencyOwner(){
 if(cloudRole!=='owner')return;
 if(cloudEmailKey!==OWNER_EMAIL)return emergencyOwnerStatus('只有主要 Owner 可以新增或更新其他 Owner。','error');
 const email=String(document.getElementById('emergencyOwnerEmail')?.value||'').trim().toLowerCase(),displayName=String(document.getElementById('emergencyOwnerName')?.value||'備援 Owner').trim()||'備援 Owner';
 if(!validGmailAddress(email))return emergencyOwnerStatus('請輸入有效的 Gmail。','error');
 if(email===OWNER_EMAIL||email===cloudEmailKey)return emergencyOwnerStatus('主要 Owner 或目前登入帳號不需要重複加入。','error');
 if(!confirm(`確定授予 ${email} 完整 Owner 權限？此帳號可查看及修改所有課表、學生、財務與帳號設定。`))return;
 try{const existing=await getDoc(doc(cloud,'companyAccess',email));if(existing.exists()&&existing.data()?.role!=='owner'&&!confirmCloudRoleTransition(existing,'owner',email))return;const payload={email,displayName,role:'owner',companyId:COMPANY_ID,active:true,invitedAt:existing.exists()?existing.data()?.invitedAt||serverTimestamp():serverTimestamp(),invitedBy:cloudEmailKey,updatedAt:serverTimestamp()},userRefs=await companyUserRefs(email);await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'backup-owner-updated':'backup-owner-created',category:'access',targetType:'account',targetId:email,changedFields:['role','active'],totalChanges:1},false,userRefs);if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();else await Promise.allSettled([deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)),deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email))]);invalidateCompanyAccessCache();emergencyOwnerStatus('備援 Owner 已建立；首次 Google 登入後即可使用。','ok');await Promise.all([listEmergencyOwners(),listImmutableAudit()])}catch(e){console.error(e);emergencyOwnerStatus('建立備援 Owner 失敗：'+(e?.message||e),'error')}
}
function installOperationalResilienceUI(){
 if(cloudRole!=='owner')return;
 const bind=(id,handler)=>{const button=document.getElementById(id);if(button)button.onclick=handler};
 bind('createCloudBackupNow',()=>createCloudSafetyBackup(true));bind('refreshCloudBackups',listCloudSafetyBackups);bind('retryAllSync',retryAllOperationalSync);bind('refreshSyncRecovery',renderSyncRecoveryCenter);bind('downloadSyncHealthReport',downloadSyncHealthReport);bind('enableOwnerSystemNotifications',enableOwnerSystemNotifications);bind('startPitrPreview',startPitrPreview);bind('saveEmergencyOwner',saveEmergencyOwner);bind('refreshImmutableAudit',listImmutableAudit);
 subscribeOwnerHealthAlerts();listCloudSafetyBackups();renderSyncRecoveryCenter();listEmergencyOwners();listImmutableAudit();
}
function subscribeOwnerHealthAlerts(){
 unsubscribeOwnerHealth?.();unsubscribeOwnerHealth=null;if(cloudRole!=='owner')return;
 unsubscribeOwnerHealth=onSnapshot(doc(cloud,'companies',COMPANY_ID,'systemHealth','ownerAlert'),snapshot=>{if(!snapshot.exists())return;const health=snapshot.data()||{},signal=JSON.stringify([health.runId,health.state,health.alerts,health.checkedAt?.toMillis?.()||'']);if(signal===lastOwnerHealthSignal)return;lastOwnerHealthSignal=signal;if(health.state==='attention'){const first=Array.isArray(health.alerts)&&health.alerts.length?health.alerts[0]:'請開啟系統健康中心檢查';cloudStatus(`系統健康警示：${first}`,'error');notifyOwnerHealth(health)}renderSyncRecoveryCenter()},error=>{console.error('owner health listener failed',error);cloudStatus('系統健康監控暫時無法連線','error')});
}

function lessonTeacherIds(lesson){
 const ids=Array.isArray(lesson?.teacherIds)&&lesson.teacherIds.length?lesson.teacherIds:[lesson?.teacherId];
 return [...new Set(ids.filter(Boolean).map(String))];
}

function filteredTeacherDB(source,teacherId){
 teacherId=String(teacherId||'');
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&lessonTeacherIds(l).includes(teacherId));
 const safeLessons=lessons.map(stripPrematureLessonReport).map(l=>{const {paymentStatus,chargeStudent,payTeacher,draftOriginal,...safe}=l;return safe});
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const lessonIds=new Set(lessons.map(l=>String(l.id)));
 const students=(source.students||[]).filter(s=>studentIds.has(s.id)).map(s=>({id:s.id,name:s.name||'',courseType:s.courseType||'',preferredTeacherId:String(s.preferredTeacherId||'')===String(teacherId)?String(teacherId):''}));
 const teachers=(source.teachers||[]).filter(t=>String(t.id)===String(teacherId)).map(t=>({id:t.id,name:t.name||'',displayName:t.displayName||'',color:t.color||'',type:t.type||'',subjects:t.subjects||''}));
 return {...emptyDB(),students,teachers,lessons:safeLessons,makeups:(source.makeups||[]).filter(m=>String(m.teacherId)===String(teacherId)||lessonIds.has(String(m.sourceLessonId||m.lessonId||''))||lessonIds.has(String(m.scheduledLessonId||''))).map(m=>{const {amount,rate,paymentStatus,...safe}=m;return safe}),changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[]};
}

function schedulerSafeLesson(lesson={}){
 const allowed=['id','date','start','end','studentId','teacherId','teacherIds','title','campId','room','location','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','note','seriesId','lessonState','isDraft'];
 return Object.fromEntries(allowed.filter(key=>lesson[key]!==undefined).map(key=>[key,JSON.parse(JSON.stringify(lesson[key]))]));
}
function schedulerSafeStudent(student={}){
 // 排課只需要辨識學生與課程歸屬；家長、聯絡方式與住址永遠不得進入排課專員檢視。
 const allowed=['id','name','status','school','grade','level','preferredTeacherId','courseType','branchIds'];
 return Object.fromEntries(allowed.filter(key=>student[key]!==undefined).map(key=>[key,JSON.parse(JSON.stringify(student[key]))]));
}
function filteredSchedulerDB(source){
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft).map(schedulerSafeLesson);
 const branches=(source.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).map(b=>({id:b.id,name:b.name||'',rooms:Array.isArray(b.rooms)?b.rooms.map(String):[]}));
 return {...emptyDB(),branches,students:(source.students||[]).filter(s=>!s.archivedAt).map(schedulerSafeStudent),teachers:(source.teachers||[]).filter(t=>!t.archivedAt).map(t=>({id:t.id,name:t.name||'',displayName:t.displayName||'',color:t.color||'',subjects:t.subjects||''})),lessons};
}

function lessonBranchId(l){return l?.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l?.location||'')||'art_museum'}
function filteredBranchDB(source,branchIds){
 const allowed=new Set(Array.isArray(branchIds)?branchIds:[]);
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&allowed.has(lessonBranchId(l))).map(stripPrematureLessonReport);
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const teacherIds=new Set(lessons.flatMap(lessonTeacherIds));
 const branches=(source.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).filter(b=>allowed.has(b.id));
 const lessonById=new Map((source.lessons||[]).map(l=>[String(l.id),l]));
 const students=(source.students||[]).filter(st=>studentIds.has(st.id)||(st.branchIds||[]).some(id=>allowed.has(id)));
 const visibleStudentIds=new Set(students.map(st=>String(st.id)));
 return {...emptyDB(),branches,students,teachers:(source.teachers||[]).filter(t=>teacherIds.has(t.id)||(t.assignedBranchIds||[]).some(id=>allowed.has(id))),lessons,makeups:(source.makeups||[]).filter(m=>{const sourceLesson=lessonById.get(String(m.sourceLessonId||m.lessonId||''));return allowed.has(m.branchId||lessonBranchId(sourceLesson||m))}),changes:(source.changes||[]).filter(c=>{const lesson=lessonById.get(String(c.lessonId))||c.after||c.before;return lesson&&allowed.has(lessonBranchId(lesson))}),teacherGroups:[],winterTeacherGroups:[],summerCampClasses:(source.summerCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),summerCampRegistrations:(source.summerCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampRegistrations:(source.winterCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampClasses:(source.winterCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),settlementRecords:(source.settlementRecords||[]).filter(r=>allowed.has(r.branchId)),fixedExpenses:(source.fixedExpenses||[]).filter(e=>allowed.has(e.branchId)),oneTimeExpenses:(source.oneTimeExpenses||[]).filter(e=>allowed.has(e.branchId)),collectionRecords:(source.collectionRecords||[]).filter(r=>allowed.has(r.branchId)).map(r=>({...r,studentIds:(r.studentIds||[]).filter(id=>visibleStudentIds.has(String(id)))}))};
}

async function renderCloudUserManager(){
 if(cloudRole!=='owner')return;
 const sec=document.getElementById('security');if(!sec)return;
 let card=document.getElementById('cloudUserManager');
 if(!card){card=document.createElement('div');card.id='cloudUserManager';card.className='card col-4';sec.querySelector('.grid')?.appendChild(card)}
 card.innerHTML=`<h2>老師帳號</h2><div class="small">一般老師只能查看自己的課表。只有指定的排課專員帳號可額外管理所有老師課表，且仍看不到費用、家長、薪資與公司資料。</div><label>老師</label><select id="cloudTeacherSelect"></select><label>老師 Gmail</label><input id="cloudTeacherEmail" type="email" placeholder="teacher@gmail.com"><label class="scheduler-access-choice"><input id="cloudTeacherScheduleAccess" type="checkbox"> <span>角色顯示排課專員，額外開放全老師排課</span></label><br><button class="btn primary" id="saveCloudTeacherAccess">建立／更新老師邀請</button><div id="cloudTeacherAccessList" class="backup-list" style="margin-top:12px"></div>`;
 const sel=document.getElementById('cloudTeacherSelect');sel.innerHTML='<option value="">請選擇老師</option>'+window.__danbridgeGetDB().teachers.filter(t=>!t.archivedAt).map(t=>`<option value="${t.id}">${teacherBadgeName(t)||t.name}</option>`).join('');
 document.getElementById('saveCloudTeacherAccess').onclick=async()=>{
   const button=document.getElementById('saveCloudTeacherAccess'),teacherId=sel.value,email=document.getElementById('cloudTeacherEmail').value.trim().toLowerCase(),canManageSchedule=SCHEDULER_ACCOUNT_EMAILS.has(email);
   if(!teacherId||!validGmailAddress(email))return alert('請選老師並輸入有效的 Gmail');
   button.disabled=true;button.textContent='正在儲存…';
   try{
    const t=window.__danbridgeGetDB().teachers.find(x=>x.id===teacherId),existing=await getDoc(doc(cloud,'companyAccess',email));
    if(!confirmCloudRoleTransition(existing,'teacher',email))return;
    if(canManageSchedule&&!confirm(`確定讓 ${email} 以排課專員角色管理所有老師課表？此帳號仍無法查看費用、家長、薪資與公司資料。`))return;
    const payload={email,role:'teacher',companyId:COMPANY_ID,teacherId,teacherName:teacherBadgeName(t),active:true,canManageSchedule:canManageSchedule?true:deleteField(),branchIds:deleteField(),branchNames:deleteField(),managerName:deleteField(),readOnly:canManageSchedule?false:deleteField(),canSubmitOwnReports:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()};
    if(!existing.exists()){payload.invitedAt=serverTimestamp();payload.invitedBy=cloudEmailKey||OWNER_EMAIL}
    invalidateCompanyAccessCache();
    const userRefs=await companyUserRefs(email);
    await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'teacher-access-updated':'teacher-access-created',category:'access',targetType:'account',targetId:email,changedFields:['role','teacherId','active','canManageSchedule'],totalChanges:1},true,userRefs);
    if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();
    else {const schedulerViewRef=doc(cloud,'companies',COMPANY_ID,'schedulerViews',email);if(canManageSchedule){const db=filteredSchedulerDB(window.__danbridgeGetDB());await setDoc(schedulerViewRef,{db,clientHash:dataHash(db),updatedAt:serverTimestamp(),email},{merge:false})}else {await deleteDoc(schedulerViewRef).catch(()=>{});await setDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email),{db:filteredTeacherDB(window.__danbridgeGetDB(),teacherId),updatedAt:serverTimestamp(),teacherId,email},{merge:false})}if(canManageSchedule)await deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)).catch(()=>{});await deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email)).catch(()=>{})}
    alert(existing.exists()?'老師邀請與專屬課表已更新。':'老師邀請已建立。請複製登入邀請給老師。');
    document.getElementById('cloudTeacherEmail').value='';await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess()]);
   }catch(e){console.error('save teacher access failed',e);alert('儲存老師權限失敗：'+(e?.message||e))}
   finally{button.disabled=false;button.textContent='建立／更新老師邀請'}
 };
 await listCloudTeacherAccess();
}
function cloudInvitationState(active,hasLogin){
 if(!active)return {label:'停權',className:'red'};
 return hasLogin?{label:'已加入',className:'green'}:{label:'待首次登入',className:'blue'};
}
async function copyCloudLoginInvitation(email){
 if(cloudRole!=='owner')return;
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return;
 const message=`Danbridge 已開放 ${normalized} 登入。請使用這個 Google 帳號前往 ${location.origin} 登入。`;
 try{await navigator.clipboard.writeText(message);cloudStatus('登入邀請已複製','ok')}
 catch(e){console.error('copy invitation failed',e);alert(message)}
}
function confirmCloudRoleTransition(existing,targetRole,email){
 if(!existing?.exists?.())return true;
 const currentRole=String(existing.data()?.role||'');
 if(!currentRole||currentRole===targetRole)return true;
 const labels={owner:'Owner',teacher:'老師',branch_manager:'校區管理者'};
 return confirm(`這個 Gmail 目前是「${labels[currentRole]||currentRole}」。\n確定要變更為「${labels[targetRole]||targetRole}」嗎？\n\n變更後舊角色的資料範圍會立即移除，該帳號若正在使用會被登出。`);
}
async function removeCloudTeacherAccess(email,teacherName='老師'){
 if(cloudRole!=='owner')return;
 email=String(email||'').trim().toLowerCase();
 if(!email)return;
 if(!confirm(`確定要刪除 ${teacherName}（${email}）的登入權限嗎？\n刪除後該帳號將無法再登入。`))return;
 try{
   cloudStatus('正在刪除老師權限…','pending');
   const userRefs=await companyUserRefs(email);
   invalidateCompanyAccessCache();
   await deleteCompanyAccessWithAudit(email,{action:'teacher-access-deleted',category:'access',targetType:'account',targetId:email,changedFields:['active','role'],totalChanges:1},userRefs);
   if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();
   else await Promise.all([deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)),deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email))]);
   await listCloudTeacherAccess();
   cloudStatus('老師權限已刪除','ok');
 }catch(e){
   console.error(e);
   cloudStatus('刪除權限失敗','error');
   alert('刪除失敗：'+(e?.message||e));
 }
}
async function setCloudAccessActive(email,active){
 if(cloudRole!=='owner')return;
 email=String(email||'').trim().toLowerCase();if(!email)return;
 if(email===OWNER_EMAIL)return alert('主要 Owner 帳號受保護，不能停權。');
 const action=active?'重新啟用':'停權';
 if(!confirm(`確定要${action} ${email}？\n${active?'原本的角色與資料範圍會恢復。':'帳號會立即失去存取權，但綁定與歷史紀錄會保留。'}`))return;
 try{
  cloudStatus(`正在${action}帳號…`,'pending');invalidateCompanyAccessCache();
  const userRefs=await companyUserRefs(email);
  await setCompanyAccessWithAudit(email,{active,updatedAt:serverTimestamp()},{action:active?'account-enabled':'account-disabled',category:'access',targetType:'account',targetId:email,changedFields:['active'],totalChanges:1},true,userRefs);
  if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();
  await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess(),listEmergencyOwners()]);
  if(active&&DANBRIDGE_ENVIRONMENT!=='production')publishRoleViewsWithRetry();
  cloudStatus(`帳號已${action}`,'ok');
 }catch(e){console.error(e);cloudStatus(`${action}帳號失敗`,'error');alert(`${action}失敗：`+(e?.message||e))}
}
async function disableTeacherAccessForArchive(teacherId){
 if(cloudRole!=='owner')throw new Error('只有 Owner 可以封存老師。');
 const normalized=String(teacherId||'');if(!normalized)throw new Error('找不到老師 ID。');
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 const matches=qs.docs.filter(d=>{const x=d.data()||{};return String(x.teacherId||'')===normalized&&x.active!==false});
 for(const accessDoc of matches){
  const x=accessDoc.data()||{},email=String(x.email||accessDoc.id).trim().toLowerCase();
  invalidateCompanyAccessCache();
  const userRefs=await companyUserRefs(email);
  await setCompanyAccessWithAudit(email,{active:false,updatedAt:serverTimestamp()},{action:'teacher-archived-account-disabled',category:'access',targetType:'account',targetId:email,changedFields:['active','teacherId'],totalChanges:1},true,userRefs);
 }
 await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess()]);
 if(DANBRIDGE_ENVIRONMENT==='production'&&matches.length)await refreshRoleViewsAfterAccessMutation();
 return matches.length;
}
window.__danbridgeDisableTeacherAccessForArchive=disableTeacherAccessForArchive;
async function listCloudTeacherAccess(){
 const box=document.getElementById('cloudTeacherAccessList');if(!box||cloudRole!=='owner')return;
 const [qs,logins]=await Promise.all([getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID))),lastLoginByEmail()]);
 box.innerHTML=qs.docs.filter(d=>d.data()?.role==='teacher').map(d=>{const x=d.data();const email=String(x.email||d.id).toLowerCase(),login=logins.get(email),last=login?.label||'尚未登入',active=x.active!==false,state=cloudInvitationState(active,!!login);return `<div class="backup-item ${x.canManageSchedule===true?'scheduler-access-item':''}"><div class="info"><b>${escapeHTML(x.canManageSchedule===true?'排課專員':(x.teacherName||'老師'))}</b><div class="small">${escapeHTML(email)}<br>${x.canManageSchedule===true?'一般老師＋全老師排課<br>':''}最後登入：${escapeHTML(last)}</div></div><div class="row-actions"><span class="pill ${state.className}">${state.label}</span><button type="button" class="btn cloud-invitation-copy" data-email="${escapeHTML(email)}">複製登入邀請</button><button type="button" class="btn cloud-access-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger cloud-access-delete" data-email="${escapeHTML(email)}" data-name="${escapeHTML(x.teacherName||'老師')}">刪除權限</button></div></div>`}).join('')||'<span class="small">尚未建立老師 Gmail 邀請。</span>';
 box.querySelectorAll('.cloud-invitation-copy').forEach(btn=>btn.onclick=()=>copyCloudLoginInvitation(btn.dataset.email));
 box.querySelectorAll('.cloud-access-toggle').forEach(btn=>btn.onclick=()=>setCloudAccessActive(btn.dataset.email,btn.dataset.active!=='true'));
 box.querySelectorAll('.cloud-access-delete').forEach(btn=>btn.onclick=()=>removeCloudTeacherAccess(btn.dataset.email,btn.dataset.name));
}


function branchManagerFormStatus(message='',kind=''){
 const el=document.getElementById('cloudBranchManagerStatus');
 if(!el)return;
 el.textContent=message;
 el.dataset.kind=kind;
 el.style.display=message?'block':'none';
 el.style.color=kind==='error'?'#b91c1c':kind==='ok'?'#15803d':'#475569';
}
function validGmailAddress(email){
 return /^[^\s@]+@gmail\.com$/i.test(String(email||'').trim());
}
async function saveCloudBranchManagerAccess(){
 if(cloudRole!=='owner')return alert('只有 Owner 可以設定校區管理者權限。');
 const emailInput=document.getElementById('cloudBranchManagerEmail');
 const saveButton=document.getElementById('saveCloudBranchManager');
 const email=String(emailInput?.value||'').trim().toLowerCase();
 const branchIds=[...document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]:checked')].map(x=>x.value);
 const teacherId=String(document.getElementById('cloudBranchManagerTeacher')?.value||'').trim();
 if(!validGmailAddress(email)){
   branchManagerFormStatus('請輸入有效的 Gmail，例如 manager@gmail.com。','error');
   emailInput?.focus();
   return;
 }
 if(!teacherId){
   branchManagerFormStatus('請選擇校區管理者本人對應的老師身分。','error');
   return;
 }
 if(!branchIds.length){
   branchManagerFormStatus('請至少選擇一個校區。','error');
   return;
 }
 if(saveButton?.dataset.saving==='1')return;
 try{
   if(saveButton){saveButton.dataset.saving='1';saveButton.disabled=true;saveButton.textContent='儲存中…'}
   branchManagerFormStatus('正在建立校區管理者權限…','pending');
   cloudStatus('正在儲存校區管理者權限…','pending');
   const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
   const branchNames=branches.filter(b=>branchIds.includes(b.id)).map(b=>b.name);
   const existing=await getDoc(doc(cloud,'companyAccess',email));
   if(!confirmCloudRoleTransition(existing,'branch_manager',email)){
     branchManagerFormStatus('已取消角色變更。','');
     cloudStatus('已取消角色變更','ok');
     return;
   }
   const managerTeacher=(window.__danbridgeGetDB()?.teachers||[]).find(t=>t.id===teacherId);
   if(!managerTeacher)throw new Error('找不到所選老師，請重新選擇。');
   const payload={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true,updatedAt:serverTimestamp()};
   if(DANBRIDGE_ENVIRONMENT!=='production'){payload.scopedDb=filteredBranchDB(window.__danbridgeGetDB(),branchIds);payload.scopedUpdatedAt=serverTimestamp()}
   if(!existing.exists()){payload.invitedAt=serverTimestamp();payload.invitedBy=cloudEmailKey||OWNER_EMAIL}
   invalidateCompanyAccessCache();
   const userRefs=await companyUserRefs(email);
   await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'branch-access-updated':'branch-access-created',category:'access',targetType:'account',targetId:email,changedFields:['role','teacherId','branchIds','active'],totalChanges:1},true,userRefs);
   if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();
   else await deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)).catch(()=>{});
   // 先更新本機畫面，不等待下一次 Firestore 查詢或快取刷新。
   const optimistic={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true};
   renderCloudBranchManagerList([...branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==email),optimistic]);
   if(emailInput)emailInput.value='';
   const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');if(managerTeacherSelect)managerTeacherSelect.value='';
   document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]').forEach(x=>x.checked=false);
   await Promise.all([listCloudBranchManagerAccess(),listCloudTeacherAccess()]);
   branchManagerFormStatus(existing.exists()?'校區管理者邀請已更新。':'校區管理者邀請已建立，可複製登入邀請。','ok');
   cloudStatus(existing.exists()?'校區管理者邀請已更新':'校區管理者邀請已建立','ok');
 }catch(e){
   console.error('saveCloudBranchManagerAccess failed:',e);
   branchManagerFormStatus('儲存失敗：'+(e?.message||e),'error');
   cloudStatus('儲存校區管理者權限失敗','error');
 }finally{
   if(saveButton){saveButton.dataset.saving='0';saveButton.disabled=false;saveButton.textContent='建立／更新管理者邀請'}
 }
}
function installBranchManagerAccessEvents(){
 if(document.documentElement.dataset.branchManagerEventsInstalled==='1')return;
 document.documentElement.dataset.branchManagerEventsInstalled='1';
 document.addEventListener('click',event=>{
   const button=event.target.closest?.('#saveCloudBranchManager');
   if(!button)return;
   event.preventDefault();
   event.stopPropagation();
   saveCloudBranchManagerAccess();
 });
}
async function renderBranchManagerAccess(){
 if(cloudRole!=='owner')return;
 const card=document.getElementById('cloudBranchManager');
 if(!card)return;
 const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
 const choices=document.getElementById('cloudBranchChoices');
 if(choices){
   choices.innerHTML=branches.map(b=>`<label><input type="checkbox" value="${b.id}"> <span>${b.name}</span></label>`).join('');
 }
 const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');
 if(managerTeacherSelect){
   const current=managerTeacherSelect.value;
   managerTeacherSelect.innerHTML='<option value="">請選擇管理者本人</option>'+((window.__danbridgeGetDB()?.teachers||[]).filter(t=>!t.archivedAt).map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name||'未命名老師')}</option>`).join(''));
   if(current)managerTeacherSelect.value=current;
 }
 const button=document.getElementById('saveCloudBranchManager');
 if(button){button.type='button';button.disabled=false;button.dataset.saving='0'}
 branchManagerFormStatus('','');
 await listCloudBranchManagerAccess();
}
let branchManagerAccessCache=[];
function escapeHTML(value=''){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function renderCloudBranchManagerList(records=branchManagerAccessCache,logins=new Map()){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 branchManagerAccessCache=Array.isArray(records)?records:[];
 box.innerHTML=branchManagerAccessCache.map(x=>{const email=String(x.email||x.id||'').toLowerCase(),login=logins.get(email),last=login?.label||'尚未登入',active=x.active!==false,state=cloudInvitationState(active,!!login);return `<div class="backup-item branch-access-item"><div class="info"><b>${escapeHTML((x.branchNames||x.branchIds||[]).join('、')||'未指定校區')}</b><div class="small" title="${escapeHTML(email)}">${escapeHTML(email)}｜${escapeHTML(x.teacherName||x.managerName||'未綁定老師')}｜可回報本人課程<br>最後登入：${escapeHTML(last)}</div></div><div class="row-actions"><span class="pill ${state.className}">${state.label}</span><button type="button" class="btn cloud-invitation-copy" data-email="${escapeHTML(email)}">複製登入邀請</button><button type="button" class="btn branch-access-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger branch-access-delete" data-email="${escapeHTML(email)}">刪除權限</button></div></div>`}).join('')||'<span class="small">尚未建立校區管理者邀請。</span>';
 box.querySelectorAll('.cloud-invitation-copy').forEach(btn=>btn.onclick=()=>copyCloudLoginInvitation(btn.dataset.email));
 box.querySelectorAll('.branch-access-toggle').forEach(btn=>btn.onclick=()=>setCloudAccessActive(btn.dataset.email,btn.dataset.active!=='true'));
 box.querySelectorAll('.branch-access-delete').forEach(btn=>btn.onclick=()=>removeCloudBranchManagerAccess(btn.dataset.email));
}
async function listCloudBranchManagerAccess(){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 try{
   const [qs,logins]=await Promise.all([getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID),where('role','==','branch_manager'))),lastLoginByEmail()]);
   renderCloudBranchManagerList(qs.docs.map(d=>({id:d.id,...d.data()})),logins);
 }catch(e){
   console.error('listCloudBranchManagerAccess failed:',e);
   if(!branchManagerAccessCache.length)box.innerHTML='<span class="small" style="color:#b91c1c">管理者清單讀取失敗，請重新整理後再試。</span>';
 }
}
async function removeCloudBranchManagerAccess(email){
 if(cloudRole!=='owner')return;
 if(!confirm(`確定刪除 ${email} 的校區管理權限？`))return;
 const userRefs=await companyUserRefs(email);
 invalidateCompanyAccessCache();
 await deleteCompanyAccessWithAudit(email,{action:'branch-access-deleted',category:'access',targetType:'account',targetId:String(email).toLowerCase(),changedFields:['active','role','branchIds'],totalChanges:1},userRefs);
 if(DANBRIDGE_ENVIRONMENT==='production')await refreshRoleViewsAfterAccessMutation();
 else await Promise.allSettled([deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email)),deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email))]);
 renderCloudBranchManagerList(branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==String(email).toLowerCase()));
 listCloudBranchManagerAccess();
}


const REPORT_STATUS_LABELS={completed:'已完成',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
const REPORT_TO_LESSON_STATUS={completed:'已上課',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
function reportStatusLabel(v){return REPORT_STATUS_LABELS[v]||'尚未回報'}
function lessonBelongsToTeacher(l,teacherId){return lessonTeacherIds(l).includes(String(teacherId||''))}
function canUseTeacherReporting(){return cloudRole==='owner'||((cloudRole==='teacher'||cloudRole==='branch_manager')&&!!cloudTeacherId)}
function canActAsTeacherForLesson(lesson){return !!lesson&&!!cloudTeacherId&&(cloudRole==='teacher'||cloudRole==='branch_manager')&&lessonBelongsToTeacher(lesson,cloudTeacherId)}
function lessonReportDeadline(lesson){
 if(!lesson?.date)return null;
 const [y,m,d]=String(lesson.date).split('-').map(Number);
 if(!y||!m||!d)return null;
 // Teachers and branch managers may submit only on the lesson's calendar day.
 // The window closes exactly when the local date changes at 00:00.
 return new Date(y,m-1,d,23,59,59,999);
}
function teacherReportWindowOpen(lesson){
 const deadline=lessonReportDeadline(lesson);
 return !!deadline&&!Number.isNaN(deadline.getTime())&&Date.now()<=deadline.getTime()&&Date.now()>=new Date(`${lesson.date}T00:00:00`).getTime();
}
function canReportLesson(lesson){
 if(cloudRole==='owner')return !!lesson;
 if(!canUseTeacherReporting()||!canActAsTeacherForLesson(lesson))return false;
 // 老師與校區管理者只能在課程當天回報；跨日後立即關閉。
 return teacherReportWindowOpen(lesson);
}
function canViewLessonReport(lesson){
 if(!lesson)return false;
 if(cloudRole==='owner')return true;
 if(cloudRole==='branch_manager')return cloudBranchIds.includes(lessonBranchId(lesson));
 return cloudRole==='teacher'&&lessonBelongsToTeacher(lesson,cloudTeacherId);
}
function setTeacherReportReadOnly(readOnly,message=''){
 const modal=document.getElementById('teacherReportModal');if(!modal)return;
 modal.dataset.readOnly=readOnly?'true':'false';
 modal.querySelectorAll('input[name="teacherReportStatus"], textarea').forEach(el=>el.disabled=!!readOnly);
 ['saveTeacherReportBtn','quickCompleteTeacherReportBtn','startClassFocusBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=!!readOnly});
 const note=document.getElementById('teacherReportPermissionNote');
 if(note){note.hidden=!message;note.textContent=message}
}
function applyReportToLesson(lesson,report){
 if(!lesson||!report)return false;
 const next={teacherReportStatus:report.status||'',teacherReportContent:report.content||'',teacherReportHomework:report.homework||'',teacherReportFeedback:report.feedback||'',teacherReportNote:report.note||'',teacherReportUpdatedAt:report.updatedAtClient||'',teacherReportBy:report.teacherName||'',teacherReportEmail:report.teacherEmail||''};
 let changed=false;
 for(const [k,v] of Object.entries(next)){if((lesson[k]||'')!==v){lesson[k]=v;changed=true}}
 const mapped=REPORT_TO_LESSON_STATUS[report.status];
 if(mapped&&lesson.status!==mapped){lesson.status=mapped;changed=true}
 if(report.status==='student_leave'&&window.addMakeupForLesson){const list=window.__danbridgeGetDB?.().makeups||[],before=list.find(m=>m.sourceLessonId===lesson.id),beforeStatus=before?.status||'';const makeup=window.addMakeupForLesson(lesson);if(!before||makeup?.status!==beforeStatus)changed=true;}
 if(report.status!=='student_leave'&&!window.lessonIsLinkedMakeup?.(lesson)&&window.cancelOpenMakeupForSourceLesson?.(lesson))changed=true;
 if(report.status==='makeup_completed'&&window.completeMakeupForLesson?.(lesson))changed=true;
 return changed;
}

function lessonReportLocalToday(){const now=new Date();return`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
function lessonReportTimestamp(report){return report?.updatedAt?.toMillis?.()||Date.parse(report?.updatedAtClient||report?.teacherReportUpdatedAt||'')}
function reportIsAllowedForLessonDate(lesson,reportedAt){
 const today=lessonReportLocalToday(),date=String(lesson?.date||'');
 if(date>today)return false;
 if(date<today)return true;
 if(!Number.isFinite(reportedAt))return false;
 const time=new Date(reportedAt),reportedDate=`${time.getFullYear()}-${String(time.getMonth()+1).padStart(2,'0')}-${String(time.getDate()).padStart(2,'0')}`;
 return reportedDate===today;
}
function stripPrematureLessonReport(lesson){
 const copy={...(lesson||{})},reportedAt=lessonReportTimestamp(copy);
 if(reportIsAllowedForLessonDate(copy,reportedAt))return copy;
 const reportKeys=Object.keys(copy).filter(key=>key.startsWith('teacherReport'));
 reportKeys.forEach(key=>delete copy[key]);
 if(reportKeys.length&&String(copy.date||'')>=lessonReportLocalToday()&&['已上課','學生請假','老師請假','缺席','補課完成'].includes(copy.status))copy.status='未上課';
 return copy;
}
function reportIsNewForCopiedLesson(lesson,report){
 const reportedAt=lessonReportTimestamp(report);
 if(!reportIsAllowedForLessonDate(lesson,reportedAt))return false;
 if(!lesson?.copyCreatedAt)return true;
 const copiedAt=Date.parse(lesson.copyCreatedAt);
 return Number.isFinite(copiedAt)&&Number.isFinite(reportedAt)&&reportedAt>=copiedAt;
}

function reportNotificationSeenKey(){return`danbridge_report_notification_seen_v20201_${cloudEmailKey||cloudRole||'member'}`}
function reportNotificationSeen(){try{return new Set(JSON.parse(localStorage.getItem(reportNotificationSeenKey())||'[]'))}catch{return new Set()}}
function saveReportNotificationSeen(seen){try{localStorage.setItem(reportNotificationSeenKey(),JSON.stringify([...seen].slice(-300)))}catch{}}
function reportNotificationSignature(report){return`${report.id||report.lessonId||''}:${lessonReportTimestamp(report)||0}`}
function installReportNotificationUI(){
 if(document.getElementById('reportSubmissionNotificationModal'))return;
 const modal=document.createElement('div');
 modal.id='reportSubmissionNotificationModal';modal.className='schedule-notification-backdrop';modal.hidden=true;
 modal.innerHTML=`<div class="schedule-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="reportSubmissionNotificationTitle"><div class="schedule-notification-head"><div><div class="schedule-notification-eyebrow">LESSON REPORT</div><h2 id="reportSubmissionNotificationTitle">課堂回報通知</h2></div></div><div id="reportSubmissionNotificationBody" class="schedule-notification-body"></div><div class="schedule-notification-actions"><button type="button" class="btn primary" id="reportSubmissionNotificationClose">知道了</button></div></div>`;
 document.body.appendChild(modal);
 document.getElementById('reportSubmissionNotificationClose').onclick=()=>{modal.hidden=true;currentReportNotification=null};
}
function openReportNotificationSource(index){
 const item=currentReportNotification?.[index],lesson=item?.lesson;if(!lesson)return;
 const month=document.getElementById('lessonMonth');if(month)month.value=String(lesson.date||'').slice(0,7);
 const modal=document.getElementById('reportSubmissionNotificationModal');if(modal)modal.hidden=true;
 window.switchTab?.('lessons');setTimeout(()=>{window.renderLessons?.();window.openLessonReport?.(lesson.id)},40);
}
function notifyNewLessonReports(reports){
 if(!['owner','branch_manager'].includes(cloudRole))return;
 const seen=reportNotificationSeen(),local=window.__danbridgeGetDB?.(),candidates=(reports||[]).filter(report=>{
   const timestamp=lessonReportTimestamp(report),signature=reportNotificationSignature(report);
   return timestamp>=REPORT_NOTIFICATION_STARTED_AT&&!seen.has(signature)&&String(report.teacherEmail||'').toLowerCase()!==cloudEmailKey;
 }).map(report=>({report,lesson:local?.lessons?.find(lesson=>lesson.id===(report.lessonId||report.id))})).filter(item=>item.lesson&&canViewLessonReport(item.lesson));
 if(!candidates.length)return;
 candidates.forEach(({report})=>seen.add(reportNotificationSignature(report)));saveReportNotificationSeen(seen);
 installReportNotificationUI();currentReportNotification=candidates;
 const body=document.getElementById('reportSubmissionNotificationBody'),modal=document.getElementById('reportSubmissionNotificationModal');if(!body||!modal)return;
 body.innerHTML=`<p class="schedule-notification-lead"><b>${candidates.length===1?`${escapeHTML(candidates[0].report.teacherName||'老師')} 已提交課堂回報`:`收到 ${candidates.length} 筆新課堂回報`}</b><span>內容已同步到課程紀錄、統計與薪資資料。</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>老師</th><th>日期時間</th><th>學生／課程</th><th>狀態</th><th>操作</th></tr></thead><tbody>${candidates.map(({report,lesson},index)=>`<tr><td>${escapeHTML(report.teacherName||'老師')}</td><td>${escapeHTML(`${lesson.date||''} ${lesson.start||''}–${lesson.end||''}`)}</td><td><b>${escapeHTML((window.__danbridgeGetDB?.().students||[]).find(student=>student.id===lesson.studentId)?.name||lesson.title||'課程')}</b></td><td>${escapeHTML(reportStatusLabel(report.status))}</td><td><button type="button" class="btn" data-report-notification-source="${index}">查看回報</button></td></tr>`).join('')}</tbody></table></div>`;
 body.querySelectorAll('[data-report-notification-source]').forEach(button=>button.addEventListener('click',()=>openReportNotificationSource(Number(button.dataset.reportNotificationSource))));
 modal.hidden=false;
}

function applyCachedLessonReportsToCurrentDB(){
 const local=window.__danbridgeGetDB?.();
 if(!local||!Array.isArray(local.lessons)||!Array.isArray(lessonReportDocuments)||!lessonReportDocuments.length)return false;
 let changed=false;
 for(const report of lessonReportDocuments){
   const lesson=local.lessons.find(x=>x.id===(report.lessonId||report.id));
   if(lesson&&canViewLessonReport(lesson)&&reportIsNewForCopiedLesson(lesson,report))changed=applyReportToLesson(lesson,report)||changed;
 }
 return changed;
}
function openTeacherReportModal(lessonId,options={}){
 if(!canUseTeacherReporting())return originalEditLesson?.(lessonId);
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 const readOnly=options.readOnly===true;
 if(!lesson||!canViewLessonReport(lesson)||(!readOnly&&cloudRole!=='owner'&&!lessonBelongsToTeacher(lesson,cloudTeacherId)))return alert('你沒有這堂課的回報權限。');
 document.getElementById('teacherReportLessonId').value=lesson.id;
 const s=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{};
 document.getElementById('teacherReportLessonInfo').innerHTML=`<b>${lesson.date} ${lesson.start}–${lesson.end}</b><br>${s.name||'未命名學生'}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===(lesson.teacherReportStatus||''));
 document.getElementById('teacherReportContent').value=lesson.teacherReportContent||'';
 document.getElementById('teacherReportHomework').value=lesson.teacherReportHomework||'';
 document.getElementById('teacherReportFeedback').value=lesson.teacherReportFeedback||'';
 document.getElementById('teacherReportNote').value=lesson.teacherReportNote||'';
 const deadline=lessonReportDeadline(lesson);
 const locked=!readOnly&&cloudRole!=='owner'&&!teacherReportWindowOpen(lesson);
 let permissionMessage='';
 if(readOnly)permissionMessage='唯讀模式：你可以查看此校區的課堂回報，但不能修改其他老師的內容。';
 else if(deadline)permissionMessage=`僅限課程當天回報，將於隔日 00:00 關閉。`;
 setTeacherReportReadOnly(readOnly||locked,locked?'此課程已非當天，課堂回報已關閉。':permissionMessage);
 document.getElementById('teacherReportModal').classList.add('show');
 if(locked){const modal=document.querySelector('#teacherReportModal .modal');if(modal)modal.scrollTop=0;}
}
async function getTrustedLessonMeta(lessonId){
 const metaSnap=await getDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId));
 if(!metaSnap.exists())throw new Error('找不到這堂課的雲端權限資料，請 Owner 登入並重新同步課表。');
 const meta=metaSnap.data()||{};
 if(meta.active!==true)throw new Error('這堂課目前未啟用回報。');
 const teacherIds=(Array.isArray(meta.teacherIds)?meta.teacherIds:[]).filter(Boolean).map(String);
 if(!cloudUid)throw new Error('登入狀態尚未完成，請重新登入後再試。');
 if(cloudRole==='owner')return {...meta,teacherIds};
 if(!cloudTeacherId)throw new Error('此帳號尚未綁定老師資料，請 Owner 重新儲存帳號設定。');
 if(!teacherIds.includes(String(cloudTeacherId)))throw new Error('雲端課程尚未綁定目前老師，請 Owner 登入後重新同步一次課表。');
 return {...meta,teacherIds};
}
function quickCompleteTeacherReport(){
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value==='completed');
 return saveTeacherReport();
}
function closeTeacherReportModal(){document.getElementById('teacherReportModal')?.classList.remove('show')}
async function saveTeacherReport(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId').value;
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到可回報的課程。');
 if(cloudRole!=='owner'&&!canActAsTeacherForLesson(lesson))return alert('你沒有這堂課的回報權限。');
 if(cloudRole!=='owner'&&!teacherReportWindowOpen(lesson))return alert('此課程已非當天，課堂回報已關閉。');
 const status=document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'';
 if(!status)return alert('請選擇上課狀態。');
 const btn=document.getElementById('saveTeacherReportBtn');btn.disabled=true;btn.textContent='儲存中…';
 try{
   const trustedMeta=await getTrustedLessonMeta(lessonId);
   const lessonTeacherId=lessonTeacherIds(lesson)[0]||'';
   const reporterName=(document.body.dataset.cloudDisplayName||auth.currentUser?.displayName||auth.currentUser?.email||'').trim();
   const trustedDeadline=trustedMeta.editableUntil?.toDate?.()||null;
   const report={companyId:COMPANY_ID,lessonId,branchId:trustedMeta.branchId,teacherId:cloudRole==='owner'?(cloudTeacherId||lessonTeacherId):cloudTeacherId,teacherUid:cloudUid,teacherEmail:auth.currentUser?.email?.toLowerCase()||'',teacherName:reporterName,reportedByRole:cloudRole,reportedForTeacherIds:Array.isArray(trustedMeta.teacherIds)?trustedMeta.teacherIds:[],isOwnerReport:cloudRole==='owner',status,content:document.getElementById('teacherReportContent').value.trim(),homework:document.getElementById('teacherReportHomework').value.trim(),feedback:document.getElementById('teacherReportFeedback').value.trim(),note:document.getElementById('teacherReportNote').value.trim(),editableUntil:trustedMeta.editableUntil,editableUntilClient:trustedDeadline?.toISOString()||'',updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};
   await setDoc(doc(cloud,'companies',COMPANY_ID,'lessonReports',lessonId),report,{merge:true});
   const changed=applyReportToLesson(lesson,report);
   if(changed&&cloudRole==='owner'){persistCurrentLocalView();queueOwnerCloudSave()}
   window.renderAll?.();closeTeacherReportModal();
   cloudStatus('課程回報已儲存','ok');
   return true;
 }catch(e){
   console.error('saveTeacherReport failed',e);
   const code=String(e?.code||'');
   let detail=e?.message||'未知錯誤';
   if(code.includes('permission-denied')){
     detail='課程回報寫入被 Firestore 拒絕。請部署本版本 firebase/firestore.rules；老師與主管只能在課程當天儲存，隔日 00:00 後會關閉。';
   }
   alert('課程回報儲存失敗：'+detail);
   cloudStatus('回報儲存失敗','error');return false
 }
 finally{btn.disabled=false;btn.textContent='儲存回報'}
}


let classFocusLessonId='';
let classFocusTimerHandle=null;
const CLASS_FOCUS_DRAFT_PREFIX='danbridge_class_focus_v31_';
function classFocusDraftKey(id){return CLASS_FOCUS_DRAFT_PREFIX+id}
function getClassFocusDraft(id){try{return JSON.parse(localStorage.getItem(classFocusDraftKey(id))||'null')}catch{return null}}
function saveClassFocusDraft(){
 if(!classFocusLessonId)return;
 const status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 const draft={content:document.getElementById('classFocusContent')?.value||'',homework:document.getElementById('classFocusHomework')?.value||'',feedback:document.getElementById('classFocusFeedback')?.value||'',note:document.getElementById('classFocusNote')?.value||'',status,updatedAt:new Date().toISOString()};
 try{localStorage.setItem(classFocusDraftKey(classFocusLessonId),JSON.stringify(draft))}catch{}
}
function clearClassFocusDraft(id){try{localStorage.removeItem(classFocusDraftKey(id))}catch{}}
function classFocusEndTime(lesson){
 const [y,m,d]=(lesson.date||'').split('-').map(Number),[h,mi]=(lesson.end||'00:00').split(':').map(Number);
 return new Date(y,m-1,d,h,mi,0,0);
}
function updateClassFocusTimer(){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===classFocusLessonId),box=document.getElementById('classFocusTimer'),label=document.getElementById('classFocusTimerLabel'),value=document.getElementById('classFocusTimerValue');
 if(!lesson||!box||!label||!value)return;
 const diff=classFocusEndTime(lesson)-new Date(),over=diff<0,total=Math.floor(Math.abs(diff)/1000),hh=Math.floor(total/3600),mm=Math.floor((total%3600)/60),ss=total%60;
 value.textContent=(hh?String(hh).padStart(2,'0')+':':'')+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
 label.textContent=over?'已超過下課時間':'距離下課';box.classList.toggle('overtime',over);
}
function openClassFocusMode(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId')?.value||'';
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson||!canReportLesson(lesson))return alert('找不到可開始的課程。');
 const student=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{},draft=getClassFocusDraft(lessonId);
 classFocusLessonId=lessonId;
 document.getElementById('classFocusTitle').textContent=student.name||lesson.title||'課程';
 document.getElementById('classFocusMeta').textContent=`${lesson.date} ${lesson.start}–${lesson.end}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`.trim();
 document.getElementById('classFocusContent').value=draft?.content ?? document.getElementById('teacherReportContent').value;
 document.getElementById('classFocusHomework').value=draft?.homework ?? document.getElementById('teacherReportHomework').value;
 document.getElementById('classFocusFeedback').value=draft?.feedback ?? document.getElementById('teacherReportFeedback').value;
 document.getElementById('classFocusNote').value=draft?.note ?? document.getElementById('teacherReportNote').value;
 const selected=draft?.status||document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'completed';
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.checked=r.value===selected);
 closeTeacherReportModal();
 document.getElementById('classFocusMode').classList.add('show');document.getElementById('classFocusMode').setAttribute('aria-hidden','false');document.body.classList.add('class-focus-open');
 clearInterval(classFocusTimerHandle);updateClassFocusTimer();classFocusTimerHandle=setInterval(updateClassFocusTimer,1000);
 setTimeout(()=>document.getElementById('classFocusContent')?.focus(),80);
}
function closeClassFocusMode({discard=false,reopen=false}={}){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId;
 if(discard)clearClassFocusDraft(id);else saveClassFocusDraft();
 clearInterval(classFocusTimerHandle);classFocusTimerHandle=null;
 document.getElementById('classFocusMode')?.classList.remove('show');document.getElementById('classFocusMode')?.setAttribute('aria-hidden','true');document.body.classList.remove('class-focus-open');
 classFocusLessonId='';
 if(reopen)openTeacherReportModal(id);
}
async function completeClassFocusMode(){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId,status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 if(!status)return alert('請先選擇課程狀態。');
 document.getElementById('teacherReportLessonId').value=id;
 document.getElementById('teacherReportContent').value=document.getElementById('classFocusContent').value;
 document.getElementById('teacherReportHomework').value=document.getElementById('classFocusHomework').value;
 document.getElementById('teacherReportFeedback').value=document.getElementById('classFocusFeedback').value;
 document.getElementById('teacherReportNote').value=document.getElementById('classFocusNote').value;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===status);
 const btn=document.getElementById('classFocusCompleteBtn');btn.disabled=true;btn.textContent='同步中…';
 try{const saved=await saveTeacherReport();if(saved){clearClassFocusDraft(id);closeClassFocusMode({discard:true,reopen:false})}}
 finally{btn.disabled=false;btn.textContent='完成並儲存'}
}
function installClassFocusMode(){
 document.getElementById('startClassFocusBtn')?.addEventListener('click',openClassFocusMode);
 document.getElementById('quickCompleteTeacherReportBtn')?.addEventListener('click',quickCompleteTeacherReport);
 document.getElementById('classFocusExitBtn')?.addEventListener('click',()=>closeClassFocusMode({reopen:true}));
 document.getElementById('classFocusDiscardBtn')?.addEventListener('click',()=>{if(confirm('確定放棄這次尚未同步的輸入？'))closeClassFocusMode({discard:true,reopen:true})});
 document.getElementById('classFocusCompleteBtn')?.addEventListener('click',completeClassFocusMode);
 ['classFocusContent','classFocusHomework','classFocusNote'].forEach(id=>document.getElementById(id)?.addEventListener('input',saveClassFocusDraft));
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.addEventListener('change',saveClassFocusDraft));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('classFocusMode')?.classList.contains('show')){e.preventDefault();closeClassFocusMode({reopen:true})}},true);
}


window.openLessonReport=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到課程。');
 if(cloudRole==='owner'||canActAsTeacherForLesson(lesson))return openTeacherReportModal(lessonId);
 if(cloudRole==='branch_manager'&&canViewLessonReport(lesson))return openTeacherReportModal(lessonId,{readOnly:true});
 return alert('你沒有這堂課的回報權限。');
};
window.canCurrentUserReportLesson=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 return !!lesson&&canReportLesson(lesson);
};
window.currentCloudRole=function(){return cloudRole};

function installTeacherReportUI(){
 window.editLesson=(id)=>{
   if(cloudRole==='teacher'&&cloudCanManageSchedule)return originalEditLesson?.(id);
   if(cloudRole==='teacher')return openTeacherReportModal(id);
   if(cloudRole==='branch_manager'){
     const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===id);
     return canActAsTeacherForLesson(lesson)?openTeacherReportModal(id):openTeacherReportModal(id,{readOnly:true});
   }
   return originalEditLesson?.(id);
 };
 document.getElementById('closeTeacherReportModal')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('cancelTeacherReportBtn')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('saveTeacherReportBtn')?.addEventListener('click',saveTeacherReport);
 document.getElementById('teacherReportModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('teacherReportModal'))closeTeacherReportModal()});
}
function subscribeLessonReports(){
 unsubscribeReports?.();unsubscribeReports=null;
 if(cloudRole==='teacher')return;
 if(cloudRole!=='owner'&&!canUseTeacherReporting())return;
 const reportsRef=collection(cloud,'companies',COMPANY_ID,'lessonReports');
 let qy=reportsRef;
 if(cloudRole==='branch_manager'){
   if(!cloudBranchIds.length)return;
   qy=cloudBranchIds.length===1?query(reportsRef,where('branchId','==',cloudBranchIds[0])):query(reportsRef,where('branchId','in',cloudBranchIds.slice(0,30)));
 }
 unsubscribeReports=onSnapshot(qy,snap=>{
   lessonReportDocuments=snap.docs.map(d=>({id:d.id,...d.data()}));
   notifyNewLessonReports(lessonReportDocuments);
   window.DanbridgeNotifications?.render?.();
   const local=window.__danbridgeGetDB();
   const changed=applyCachedLessonReportsToCurrentDB();
   const modal=document.getElementById('teacherReportModal');
   if(modal?.classList.contains('show')){const id=document.getElementById('teacherReportLessonId')?.value;const l=local.lessons.find(x=>x.id===id);if(l)setTimeout(()=>openTeacherReportModal(id,{readOnly:modal.dataset.readOnly==='true'&&cloudRole==='branch_manager'&&!canActAsTeacherForLesson(l)}),0)}
   if(!changed)return;
   persistCurrentLocalView();
   window.renderAll?.();
   window.renderDashboard?.();
   if(cloudRole==='owner'){queueOwnerCloudSave();clearTimeout(reportSyncTimer);reportSyncTimer=setTimeout(uploadOwnerState,500)}
 },e=>{
   console.error('lessonReports listener',e);
   if(cloudRole==='teacher'&&String(e?.code||'').includes('permission-denied')){
     lessonReportDocuments=[];
     cloudStatus('老師課表已同步','ok');
     return;
   }
   cloudStatus('課程回報同步失敗：'+e.message,'error');
 });
}

const OWNER_DISPLAY_NAME='Daniel';
function roleAccessSignature(value={}){
 const branchIds=(Array.isArray(value.branchIds)?value.branchIds:[]).map(String).sort();
 return JSON.stringify({role:String(value.role||''),teacherId:String(value.teacherId||''),branchIds,readOnly:value.readOnly===true,canSubmitOwnReports:value.canSubmitOwnReports!==false,canManageSchedule:value.canManageSchedule===true});
}
function installRoleInteractionGuards(){
 if(document.documentElement.dataset.roleInteractionGuards==='1')return;
 document.documentElement.dataset.roleInteractionGuards='1';
 document.addEventListener('contextmenu',event=>{if(cloudRole==='branch_manager'&&event.target.closest?.('#calendarCanvas')){event.preventDefault();event.stopImmediatePropagation()}},true);
 document.addEventListener('mousedown',event=>{if(cloudRole==='branch_manager'&&event.button===0&&event.target.closest?.('#calendarCanvas')&&!event.target.closest?.('[data-id],button,input,select'))event.stopImmediatePropagation()},true);
}
function markRoleIsolated(element){
 if(!element)return;
 element.dataset.roleIsolated='1';element.hidden=true;element.inert=true;element.setAttribute('aria-hidden','true');element.style.setProperty('display','none','important');
}
function restoreRoleIsolated(){
 document.querySelectorAll('[data-role-isolated="1"]').forEach(element=>{element.hidden=false;element.inert=false;element.removeAttribute('aria-hidden');element.style.removeProperty('display');delete element.dataset.roleIsolated});
}
function applyCalendarLocationRoleScope(){
 const select=document.getElementById('calendarLocationFilter');
 if(!select)return;
 if(!select.dataset.ownerOptions)select.dataset.ownerOptions=select.innerHTML;
 select.innerHTML=select.dataset.ownerOptions;
 if(cloudRole!=='branch_manager')return;
 const allowedBranches=new Set(cloudBranchIds.map(id=>window.DanbridgeAccess?.branchName?.(id)).filter(Boolean));
 [...select.options].forEach(option=>{
   const value=String(option.value||'');
   if(value&&value!=='到府'&&value!=='線上課'&&!allowedBranches.has(value))option.remove();
 });
 if(![...select.options].some(option=>option.value===select.value))select.value='';
}
function applyRoleUI(profile,user){
 const normalizedRole=String(profile?.role||'').trim().toLowerCase();
 cloudRole=normalizedRole;cloudTeacherId=profile.teacherId==null?'':String(profile.teacherId);cloudBranchIds=Array.isArray(profile.branchIds)?profile.branchIds:[];cloudCanManageSchedule=cloudRole==='teacher'&&profile.canManageSchedule===true;cloudUid=user.uid;cloudEmailKey=(user.email||'').trim().toLowerCase();window.__danbridgeLessonIdMigrationAuthority=cloudRole==='owner';
 flushOperationalErrors();
 cloudRoleAccessSignature=cloudRole==='owner'&&cloudEmailKey===OWNER_EMAIL?'':roleAccessSignature({...profile,role:cloudRole,teacherId:cloudTeacherId,branchIds:cloudBranchIds});
 if(cloudRole==='owner'){const current=window.__danbridgeGetDB?.();if(current)window.__danbridgeSetDB(deepCopy(current));}
 window.DanbridgeAccess?.setContext({role:cloudRole,branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:profile.readOnly===true||cloudRole==='branch_manager',canSubmitOwnReports:profile.canSubmitOwnReports!==false,canManageSchedule:cloudCanManageSchedule});
 const signedInName=(cloudRole==='owner'?(cloudEmailKey===OWNER_EMAIL?OWNER_DISPLAY_NAME:(profile.displayName||user.displayName)):cloudRole==='teacher'?(profile.teacherName||profile.displayName):cloudRole==='branch_manager'?(profile.managerName||profile.teacherName||profile.displayName):(profile.displayName||user.displayName))||user.displayName||user.email||'';
 document.body.dataset.cloudDisplayName=String(signedInName).trim();
 if(DANBRIDGE_ENVIRONMENT!=='production'&&cloudRole==='owner'&&profile.displayName!==signedInName){
   const ownerRef=doc(cloud,'companies',COMPANY_ID,'accounts',user.uid);
   setDoc(ownerRef,{displayName:signedInName,updatedAt:serverTimestamp()},{merge:true}).catch(error=>console.warn('owner display name sync failed',error));
 }
 const header=document.querySelector('.header-auth-actions');
 if(header)header.innerHTML=`<span class="cloud-role-label" style="font-size:12px;font-weight:800">${cloudCanManageSchedule?'排課專員':(window.DanbridgeAccess?.ROLE_LABELS?.[profile.role]||profile.role)}｜${String(signedInName).trim()}</span>${profile.role==='owner'?'<button type="button" class="btn notification-bell" onclick="DanbridgeNotifications.open()" aria-label="開啟通知中心"><span class="notification-bell-icon">🔔</span><span id="notificationCount" class="notification-count" hidden>0</span></button>':''}${profile.role==='owner'&&DANBRIDGE_ENVIRONMENT==='production'?'<button type="button" class="btn" id="productionRolePrivacyBtn">驗證角色權限</button>':''}<button type="button" class="btn" id="firebaseLogoutBtn">登出</button>`;
 const productionRolePrivacyBtn=document.getElementById('productionRolePrivacyBtn');
 productionRolePrivacyBtn?.addEventListener('click',async()=>{
   productionRolePrivacyBtn.disabled=true;productionRolePrivacyBtn.textContent='正在驗證角色權限…';
   try{const result=await window.__danbridgeRepublishProductionRoleViews();productionRolePrivacyBtn.dataset.result=JSON.stringify(result);productionRolePrivacyBtn.textContent='角色權限已驗證';cloudStatus('production 角色權限檢視已重發並通過雜湊核對。','ok')}
   catch(error){productionRolePrivacyBtn.dataset.error=String(error?.message||error);productionRolePrivacyBtn.textContent='重新驗證角色權限';cloudStatus('角色權限驗證失敗：'+String(error?.message||error),'error');productionRolePrivacyBtn.disabled=false}
 });
 document.body.classList.toggle('teacher-cloud-role',profile.role==='teacher');
 document.body.classList.toggle('wendy-teacher-role',cloudRole==='teacher'&&cloudEmailKey==='wendylee0820520@gmail.com');
 document.body.classList.toggle('branch-manager-cloud-role',profile.role==='branch_manager');
 document.body.dataset.cloudRole=cloudRole;
 document.body.dataset.roleUx=cloudRole;
 if(cloudRole==='owner'){
   restoreRoleIsolated();
   window.DanbridgeRoleResponsive?.restoreRoleResponsiveControls?.();
   restoreOwnerSyncRecovery();
   setTimeout(installOperationalResilienceUI,0);
 }
 applyCalendarLocationRoleScope();
 window.ensureTeacherHoursMetric?.();

 const teacherOnly=profile.role==='teacher';
 if(teacherOnly){
   delete document.body.dataset.teacherWeekInitialized;
   applyingCloud=true;
   window.__danbridgeSetDB(emptyDB());
   window.renderAll?.();
   applyingCloud=false;

   const teacherAllowedTabs=new Set(cloudCanManageSchedule?['calendar','teacherLeave']:['dashboard','calendar','lessons','teacherLeave']);
   const teacherTabLabels={dashboard:'我的總覽',calendar:cloudCanManageSchedule?'全老師課表':'我的課表',lessons:'課程回報',teacherLeave:cloudCanManageSchedule?'請假管理':'我的請假'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{
     const allowed=teacherAllowedTabs.has(b.dataset.tab);
     if(allowed)b.textContent=teacherTabLabels[b.dataset.tab];
     b.hidden=!allowed;
     b.classList.toggle('teacher-nav-hidden',!allowed);
     b.style.setProperty('display',allowed?'':'none',allowed?'':'important');
     b.setAttribute('aria-hidden',allowed?'false':'true');
     if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex');
   });
   const activeSection=document.querySelector('main section.active');
   if(activeSection&&!teacherAllowedTabs.has(activeSection.id))switchTab(cloudCanManageSchedule?'calendar':'dashboard');

   // 一般老師保留老師功能；純排課專員只保留全老師課表。
   const teacherHiddenSelector=cloudCanManageSchedule?'#dashboard .owner-only-action,#dashboard .owner-v33-only,#dashboard .branch-scope-bar,#lessons .toolbar button,#v18Fab,#v18FabMenu,.floating-actions .v20-owner-action':'.owner-only-action,.floating-actions,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#dashboard .owner-v33-only,#dashboard .branch-scope-bar,#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher,#lessons .toolbar button';
   document.querySelectorAll(teacherHiddenSelector).forEach(e=>{const target=e.matches('select')?e.closest('.calendar-field,#lessons .toolbar>div')||e:e;markRoleIsolated(target)});
   const teacherAnalysis=document.getElementById('calendarAnalysis');if(teacherAnalysis){markRoleIsolated(teacherAnalysis);teacherAnalysis.replaceChildren()}
   if(!cloudCanManageSchedule)document.querySelectorAll('.floating-actions').forEach(e=>e.remove());
   document.querySelectorAll(`#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security${cloudCanManageSchedule?',#dashboard,#students,#lessons':',#students'}`).forEach(e=>{markRoleIsolated(e);e.classList.remove('active')});

   // 隱藏公司營收、未收款、薪資、老師總數與公司異動等敏感資訊。
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     markRoleIsolated(document.getElementById(id)?.closest('.metric'));
   });
   markRoleIsolated(document.querySelector('.dashboard-changes'));
   markRoleIsolated(document.querySelector('#dashboard .card:nth-of-type(2)'));
   window.DanbridgeRoleResponsive?.apply?.();
   if(cloudCanManageSchedule){
     const addStudentButton=document.querySelector('#lessonModal .student-select-row>button');
     if(addStudentButton){addStudentButton.hidden=false;addStudentButton.inert=false;addStudentButton.removeAttribute('aria-hidden');addStudentButton.style.setProperty('display','inline-flex','important')}
     // 排課專員只需要課表欄位；家長、聯絡、地址、收費與薪資控制不可見也不可操作。
     ['quickParentName','quickParentContact','quickHomeAddress','quickBilling','quickRate','paymentStatus','chargeStudent','payTeacher'].forEach(id=>{
       const control=document.getElementById(id);if(!control)return;
       const field=control.closest('.col-6')||control;markRoleIsolated(field);
       if(field===control&&control.previousElementSibling?.tagName==='LABEL')markRoleIsolated(control.previousElementSibling);
     });
   }
   setTimeout(()=>window.DanbridgeRoleResponsive?.apply?.(),500);
 }else if(profile.role==='branch_manager'){
   applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
   const allowedTabs=new Set(['dashboard','students','teachers','calendar','lessons','makeups','settlement','finance']);
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{const allowed=allowedTabs.has(b.dataset.tab);b.hidden=!allowed;b.style.setProperty('display',allowed?'':'none',allowed?'':'important');b.setAttribute('aria-hidden',allowed?'false':'true');b.inert=!allowed;if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex')});
   const active=document.querySelector('main section.active');if(active&&!allowedTabs.has(active.id))switchTab('dashboard');
   document.querySelectorAll('.owner-only-action,.v20-owner-action,.floating-actions,#v18Fab,#v18FabMenu,.v181-lesson-undo,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#students button,#teachers button,#lessons .toolbar button,#makeups button,#settlement button,#finance button,#lessonModal,#smartSchedulerModal,#batchModal,#v20ReplaceModal,#v20HistoryModal').forEach(markRoleIsolated);
   // 課程清單保留查看入口；點到本人授課課程時會開啟課堂回報，其他課程維持唯讀詳情。
   document.querySelectorAll('#drafts,#camps,#winterCamps,#data,#security').forEach(e=>{markRoleIsolated(e);e.classList.remove('active')});
   window.DanbridgeRoleResponsive?.apply?.();
 }else{
   const ownerTabLabels={dashboard:'總覽',students:'學生／家長',teachers:'老師',calendar:'拖曳課表',lessons:'課程紀錄',makeups:'補課中心',camps:'冬／夏令營',finance:'公司財務',data:'備份／iPad',security:'安全設定'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{b.hidden=false;b.inert=false;b.classList.remove('teacher-nav-hidden');b.style.removeProperty('display');b.removeAttribute('aria-hidden');b.removeAttribute('tabindex');if(ownerTabLabels[b.dataset.tab])b.textContent=ownerTabLabels[b.dataset.tab]});
   document.querySelectorAll('#students,#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security').forEach(e=>{e.hidden=false;e.inert=false;e.removeAttribute('aria-hidden');e.style.removeProperty('display')});
   document.querySelectorAll('.owner-only-action,.v20-owner-action,#v18Fab,#v18FabMenu,#lessonModal,#smartSchedulerModal,#batchModal,#v20ReplaceModal,#v20HistoryModal').forEach(e=>{e.hidden=false;e.inert=false;e.removeAttribute('aria-hidden');e.style.removeProperty('display')});
   document.querySelectorAll('.owner-only-action,.owner-v33-only,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar .day-add,#lessons .toolbar button,#dashboard .row-actions').forEach(e=>{e.hidden=false;e.style.removeProperty('display')});
   document.querySelectorAll('#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher').forEach(e=>{const target=e.closest('.calendar-field,#lessons .toolbar>div')||e;target.hidden=false;target.style.removeProperty('display');target.classList.remove('teacher-redundant-filter')});
   const analysis=document.getElementById('calendarAnalysis');if(analysis){analysis.hidden=false;analysis.style.removeProperty('display')}
   if(!document.querySelector('.floating-actions')){
     const floating=document.createElement('div');floating.className='floating-actions';floating.innerHTML='<button class="btn v20-owner-action" onclick="openRecentChanges()">最近修改</button><button id="undoBtn" class="btn" onclick="undoLast()">↶ 復原</button><button id="redoBtn" class="btn" onclick="redoLast()">↷ 重做</button><button class="btn primary" onclick="openLessonModal()">＋ 新增</button>';
     const toast=document.getElementById('toast');toast?.parentNode?.insertBefore(floating,toast);
   }
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     document.getElementById(id)?.closest('.metric')?.style.removeProperty('display');
   });
   document.querySelector('.dashboard-changes')?.style.removeProperty('display');
   document.querySelector('#dashboard .card:nth-of-type(2)')?.style.removeProperty('display');
   setTimeout(()=>{window.DanbridgeRoleResponsive?.apply?.();window.renderAll?.()},0);
 }
 window.installNavigationHandlers?.();
}
function lessonMetaSignature(value){
 const teacherIds=(Array.isArray(value?.teacherIds)?value.teacherIds:[]).filter(Boolean).map(String).sort();
 const editableFrom=value?.editableFrom instanceof Date?value.editableFrom.toISOString():(value?.editableFrom?.toDate?.()?.toISOString?.()||String(value?.editableFrom||''));
 const editableUntil=value?.editableUntil instanceof Date?value.editableUntil.toISOString():(value?.editableUntil?.toDate?.()?.toISOString?.()||String(value?.editableUntil||''));
 return dataHash({companyId:String(value?.companyId||COMPANY_ID),lessonId:String(value?.lessonId||''),branchId:String(value?.branchId||''),lessonDate:String(value?.lessonDate||''),lessonStart:String(value?.lessonStart||''),lessonEnd:String(value?.lessonEnd||''),studentId:String(value?.studentId||''),teacherIds,editableFrom,editableUntil,active:value?.active!==false});
}
async function publishLessonMeta(sourceOverride=null){
 if(cloudRole!=='owner')return;
 if(DANBRIDGE_ENVIRONMENT==='production')return;
 const lessons=((sourceOverride||window.__danbridgeGetDB())?.lessons||[]).filter(l=>l?.id&&!l.isDraft);
 const metaRef=collection(cloud,'companies',COMPANY_ID,'lessonMeta');
 if(!lessonMetaCacheReady){
   const existing=await getDocs(metaRef);
   lessonMetaSignatureCache=new Map(existing.docs.map(d=>[d.id,lessonMetaSignature({...d.data(),lessonId:d.id})]));
   lessonMetaCacheReady=true;
 }
 const nextIds=new Set();
 const jobs=[];
 lessons.forEach(lesson=>{
   const deadline=lessonReportDeadline(lesson);
   const [y,m,d]=String(lesson.date||'').split('-').map(Number);
   const editableFrom=new Date(y,m-1,d,0,0,0,0);
   const teacherIds=lessonTeacherIds(lesson).sort();
   if(!deadline||Number.isNaN(editableFrom.getTime())||!teacherIds.length)return;
   const lessonId=String(lesson.id);
   nextIds.add(lessonId);
   const payload={companyId:COMPANY_ID,lessonId,branchId:lessonBranchId(lesson),lessonDate:String(lesson.date||''),lessonStart:String(lesson.start||''),lessonEnd:String(lesson.end||''),studentId:String(lesson.studentId||''),teacherIds,editableFrom,editableUntil:deadline,active:true};
   const signature=lessonMetaSignature(payload);
   if(lessonMetaSignatureCache.get(lessonId)===signature)return;
   jobs.push(setDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId),{...payload,editableFrom:Timestamp.fromDate(editableFrom),editableUntil:Timestamp.fromDate(deadline),updatedAt:serverTimestamp()},{merge:false}).then(()=>lessonMetaSignatureCache.set(lessonId,signature)));
 });
 for(const lessonId of [...lessonMetaSignatureCache.keys()]){
   if(nextIds.has(lessonId))continue;
   jobs.push(deleteDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId)).then(()=>lessonMetaSignatureCache.delete(lessonId)));
 }
 await Promise.all(jobs);
}
async function getCompanyAccessDocs(){
 const now=Date.now();
 if(companyAccessCache&&now-companyAccessCacheAt<COMPANY_ACCESS_CACHE_TTL)return companyAccessCache;
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 companyAccessCache=qs.docs;
 companyAccessCacheAt=now;
 return companyAccessCache;
}
function invalidateCompanyAccessCache(){companyAccessCache=null;companyAccessCacheAt=0}
function activeRoleRecordIdentity(access,email){
 if(access?.role==='teacher'&&access?.teacherId&&SCHEDULER_ACCOUNT_EMAILS.has(email)&&access.canManageSchedule===true)return{email,kind:'scheduler',teacherId:String(access.teacherId),branchIds:[]};
 if(access?.role==='teacher'&&access?.teacherId)return{email,kind:'teacher',teacherId:String(access.teacherId),branchIds:[]};
 if(access?.role==='branch_manager'&&access?.teacherId&&Array.isArray(access.branchIds)&&access.branchIds.length)return{email,kind:'branch_manager',teacherId:String(access.teacherId),branchIds:[...new Set(access.branchIds.map(String))].sort()};
 return null;
}
function activeRoleTargetDb(sourceDb,identity){
 if(identity.kind==='scheduler')return filteredSchedulerDB(sourceDb);if(identity.kind==='teacher')return filteredTeacherDB(sourceDb,identity.teacherId);if(identity.kind==='branch_manager')return filteredBranchDB(sourceDb,identity.branchIds);throw new Error('角色逐筆檢視類型無效');
}
async function publishActiveRoleRecordViews(sourceDb){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||activeRecordMode!=='active')throw new Error('角色逐筆檢視尚未允許發布');const activationEpoch=activeRecordPageController?.diagnostics?.().activationEpoch;if(!activationEpoch)throw new Error('角色逐筆檢視缺少 activation epoch');
 const adapter=createFirebaseRoleRecordViewAdapter({environment:'staging',role:'owner',actor:{uid:cloudUid,email:cloudEmailKey},getDocument:path=>getDoc(activeFirestoreDocument(path)),getCollectionDocuments:async path=>(await getDocs(activeFirestoreCollection(path))).docs.map(row=>({id:row.id,data:row.data()})),runBatchTransaction:activeFirestoreTransaction,runTransaction:activeFirestoreTransaction,serverTimestamp});
 const accessDocs=await getCompanyAccessDocs(),sourceRecordHash=recordDataHash(sourceDb),publishedAt=new Date().toISOString(),results=[];let index=0;
 for(const accessDocument of accessDocs){
  const access=accessDocument.data()||{},email=String(access.email||accessDocument.id||'').trim().toLowerCase();if(access.active!==true||!email||access.role==='owner')continue;
  if(access.role==='teacher'&&access.teacherId&&RETIRED_SCHEDULER_ACCOUNT_EMAILS.has(email)&&access.canManageSchedule===true){await Promise.all([setDoc(accessDocument.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}),getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email))).then(snapshot=>Promise.all(snapshot.docs.map(userDocument=>setDoc(userDocument.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}))))]);access.canManageSchedule=false}
  const identity=activeRoleRecordIdentity(access,email);if(!identity)continue;const targetDb=activeRoleTargetDb(sourceDb,identity),publishId=`role_${Date.now().toString(36)}_${String(index++).padStart(4,'0')}`;results.push(await adapter.synchronize(targetDb,{identity,activationEpoch,sourceRecordHash,publishId,publishedAt,batchSize:100,onBatchComplete:progress=>{document.body.dataset.activeRoleRecordProgress=`${progress.completedBatches}/${progress.totalBatches}`}}));
 }
 document.body.dataset.activeRoleRecordProgress='complete';return results;
}
function getActiveRoleRecordPublishQueue(){
 if(!activeRoleRecordPublishQueue){
  activeRoleRecordPublishQueue=createActiveRoleRecordPublishQueue({publish:publishActiveRoleRecordViews,computeSourceHash:db=>recordDataHash(db)});
 }
 return activeRoleRecordPublishQueue;
}
function queueInitialActiveRoleRecordViews(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||activeRecordMode!=='active'||activeRoleBootstrapInFlight)return;
 const activationEpoch=activeRecordPageController?.diagnostics?.().activationEpoch;if(!activationEpoch||activeRoleBootstrapEpoch===activationEpoch||!activeRoleBootstrapSourceDb)return;
 // 只能發布逐筆串流已驗證的雲端快照；畫面可能還保有待續傳本機變更，不能搶先洩漏給角色檢視。
 const sourceDb=deepCopy(activeRoleBootstrapSourceDb);activeRoleBootstrapInFlight=true;clearTimeout(activeRoleBootstrapRetryTimer);document.body.dataset.activeRoleRecordBootstrap='publishing';
 getActiveRoleRecordPublishQueue().enqueue({kind:'bootstrap',sourceDb}).then(result=>{
  if(cloudRole!=='owner'||activeRecordMode!=='active'||activeRecordPageController?.diagnostics?.().activationEpoch!==activationEpoch)return;
  activeRoleBootstrapEpoch=activationEpoch;activeRoleBootstrapRetryCount=0;
  if(result.state==='published')document.body.dataset.activeRoleRecordBootstrap=JSON.stringify({state:'verified',activationEpoch,viewCount:Array.isArray(result.result)?result.result.length:0,kind:result.kind,sequence:result.sequence,sourceHash:result.sourceHash});
  else document.body.dataset.activeRoleRecordBootstrap=JSON.stringify({state:result.state,activationEpoch,kind:result.kind,sequence:result.sequence,sourceHash:result.sourceHash});
 }).catch(error=>{
  const currentActivationEpoch=activeRecordPageController?.diagnostics?.().activationEpoch;
  if(currentActivationEpoch!==activationEpoch||cloudRole!=='owner'||activeRecordMode!=='active')return;activeRoleBootstrapRetryCount++;document.body.dataset.activeRoleRecordBootstrap=JSON.stringify({state:'retrying',activationEpoch,retryCount:activeRoleBootstrapRetryCount,error:String(error?.message||error).slice(0,300)});reportOperationalError(error,{category:'role-view',area:'active-role-bootstrap',retryable:true});cloudStatus(activeRoleBootstrapRetryCount<3?'逐筆主資料已就緒；aa／老師逐筆檢視正在背景補送。':'逐筆主資料已就緒，但 aa／老師逐筆檢視持續補送中，請保持網路連線。',activeRoleBootstrapRetryCount<3?'pending':'error');activeRoleBootstrapRetryTimer=setTimeout(queueInitialActiveRoleRecordViews,Math.min(30000,1000*Math.pow(2,Math.min(activeRoleBootstrapRetryCount,5))));
 }).finally(()=>{activeRoleBootstrapInFlight=false});
}
async function publishScopedViews(sourceOverride=null,{recordAuthority=false}={}){
 if(cloudRole!=='owner')return;
 try{
   const sourceDb=sourceOverride?deepCopy(sourceOverride):window.__danbridgeGetDB();
   if(DANBRIDGE_ENVIRONMENT==='production'){
     if(!productionRoleViewPublishCall)throw new Error('production 角色檢視受保護後端尚未就緒');
     const sourceHash=recordDataHash(sourceDb),requestId=`roleview-${crypto.randomUUID()}`,response=await productionRoleViewPublishCall({schema:'danbridge-production-role-view-publish-v1',requestId,sourceHash,release:APP_RELEASE}),data=response?.data;
     if(data?.schema!=='danbridge-production-role-view-publish-response-v1'||data?.requestId!==requestId||data?.sourceHash!==sourceHash||data?.result?.state!=='verified'||data?.result?.formalRecordWrites!==0)throw new Error('production 角色檢視後端讀回驗證失敗');
     scopedViewHashCache=new Map();lessonMetaCacheReady=false;document.body.dataset.productionRoleViewPublish=JSON.stringify(data.result);return data.result;
   }
   if(DANBRIDGE_ENVIRONMENT==='staging'&&activeRecordMode!=='legacy'){
     return await getActiveRoleRecordPublishQueue().enqueue({kind:'confirmed',sourceDb});
   }
   const accessDocs=await getCompanyAccessDocs();
   const jobs=[],scheduleTargets=[];
   for(const d of accessDocs){
     const p=d.data();
     const email=(p.email||d.id||'').trim().toLowerCase();
     if(p.active===false||!email)continue;
     if(p.role==='teacher'&&p.teacherId&&RETIRED_SCHEDULER_ACCOUNT_EMAILS.has(email)&&p.canManageSchedule===true){
       const viewDb=filteredTeacherDB(sourceDb,p.teacherId),hash=dataHash(viewDb),key='teacher:'+email;
       jobs.push(Promise.all([
         setDoc(d.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}),
         deleteDoc(doc(cloud,'companies',COMPANY_ID,'schedulerViews',email)).catch(()=>{}),
         getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email))).then(qs=>Promise.all(qs.docs.map(u=>setDoc(u.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}))))
       ]));
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'teacherViews',email),payload:{db:viewDb,updatedAt:serverTimestamp(),teacherId:p.teacherId,email,clientHash:hash},key,hash});
       continue;
     }
     if(p.role==='teacher'&&p.teacherId&&SCHEDULER_ACCOUNT_EMAILS.has(email)){
       const scopedDb=filteredSchedulerDB(sourceDb),hash=dataHash(scopedDb),key='scheduler:'+email;
       if(p.canManageSchedule===true&&scopedViewHashCache.get(key)===hash){continue}
       jobs.push(setDoc(d.ref,{canManageSchedule:true,readOnly:false,scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),active:true},{merge:true}));
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'schedulerViews',email),payload:{db:scopedDb,clientHash:hash,updatedAt:serverTimestamp(),email},key,hash});
     }else if(p.role==='teacher'&&p.teacherId){
       const viewDb=filteredTeacherDB(sourceDb,p.teacherId);
       const hash=dataHash(viewDb);
       const key='teacher:'+email;
       if(scopedViewHashCache.get(key)===hash)continue;
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'teacherViews',email),payload:{db:viewDb,updatedAt:serverTimestamp(),teacherId:p.teacherId,email,clientHash:hash},key,hash});
     }else if(p.role==='branch_manager'&&Array.isArray(p.branchIds)&&p.branchIds.length){
       const scopedDb=filteredBranchDB(sourceDb,p.branchIds);
       const hash=dataHash(scopedDb);
       const key='branch:'+email;
       if(scopedViewHashCache.get(key)===hash||p.scopedClientHash===hash){scopedViewHashCache.set(key,hash);continue}
       jobs.push(setDoc(d.ref,{scopedDb,scopedClientHash:hash,scopedUpdatedAt:serverTimestamp(),branchIds:p.branchIds,active:true},{merge:true}).then(()=>scopedViewHashCache.set(key,hash)));
     }
   }
   if(scheduleTargets.length){
     const sourceHash=dataHash(sourceDb),published=await runTransaction(cloud,async transaction=>{
       if(!recordAuthority){const mainSnap=await transaction.get(doc(cloud,'companies',COMPANY_ID,'data','main'));const currentHash=mainSnap.exists()?(mainSnap.data()?.clientHash||dataHash(mainSnap.data()?.db)):'';if(currentHash!==sourceHash)return false}
       scheduleTargets.forEach(target=>transaction.set(target.ref,target.payload,{merge:false}));
       return true;
     });
     if(!published){await Promise.all(jobs);roleViewPublishQueued=true;return}
     scheduleTargets.forEach(target=>scopedViewHashCache.set(target.key,target.hash));
   }
   await Promise.all(jobs);
 }catch(e){
   console.error('publishScopedViews',e);
   throw e;
 }
}
async function publishRoleViewsWithRetry(sourceDb=null){
 if(cloudRole!=='owner')return;
 if(sourceDb)roleViewPublishSourceDB=deepCopy(sourceDb);
 roleViewPublishQueued=true;if(roleViewPublishInFlight)return;
 roleViewPublishInFlight=true;roleViewPublishQueued=false;clearTimeout(roleViewRetryTimer);const publishSource=roleViewPublishSourceDB;roleViewPublishSourceDB=null;
 try{const roleSource=publishSource?deepCopy(publishSource):deepCopy(window.__danbridgeGetDB());await Promise.all([publishScopedViews(roleSource),publishLessonMeta(roleSource)]);roleViewRetryCount=0}
 catch(e){roleViewPublishQueued=true;roleViewRetryCount++;lessonMetaCacheReady=false;console.error('Role view background sync failed',e);reportOperationalError(e,{category:'role-view',area:'role-publish',retryable:true});cloudStatus(roleViewRetryCount<3?'主資料已同步；老師端資料正在背景補送。':'主資料已同步，但老師端資料持續補送中，請保持網路連線。',roleViewRetryCount<3?'pending':'error');roleViewRetryTimer=setTimeout(publishRoleViewsWithRetry,Math.min(30000,1000*Math.pow(2,Math.min(roleViewRetryCount,5))))}
 finally{roleViewPublishInFlight=false;if(roleViewPublishQueued&&!roleViewRetryCount)queueMicrotask(publishRoleViewsWithRetry)}
}
async function migrateLegacyLessonCloudDocuments(){
 if(cloudRole!=='owner')return;
 let migrations=[];try{migrations=JSON.parse(localStorage.getItem('danbridge_lesson_id_migration_v15_28_3')||'[]')}catch{}
 if(!Array.isArray(migrations)||!migrations.length)return;
 const byOld=new Map();
 for(const item of migrations){
   const oldId=String(item?.oldId||''),newId=String(item?.newId||'');
   if(!oldId||!newId||oldId===newId)continue;
   if(!byOld.has(oldId))byOld.set(oldId,[]);
   byOld.get(oldId).push(item);
 }
 const normalizedTeachers=v=>(Array.isArray(v?.teacherIds)?v.teacherIds:(Array.isArray(v?.reportedForTeacherIds)?v.reportedForTeacherIds:[v?.teacherId])).filter(Boolean).map(String).sort();
 const fingerprintKey=v=>[String(v?.lessonDate||v?.date||''),String(v?.lessonStart||v?.start||''),String(v?.lessonEnd||v?.end||''),String(v?.studentId||''),normalizedTeachers(v).join(',')].join('|');
 const chooseTarget=(oldId,data)=>{
   const candidates=byOld.get(oldId)||[];
   if(candidates.length===1)return candidates[0];
   const key=fingerprintKey(data||{});
   const exact=candidates.filter(x=>String(x.fingerprintKey||'')===key);
   return exact.length===1?exact[0]:null;
 };
 const unresolved=[];
 for(const [oldId,candidates] of byOld){
   try{
     for(const col of ['lessonMeta','lessonReports']){
       const oldRef=doc(cloud,'companies',COMPANY_ID,col,oldId),snap=await getDoc(oldRef);
       if(!snap.exists())continue;
       const data=snap.data()||{},target=chooseTarget(oldId,data);
       if(!target){unresolved.push({collection:col,oldId,reason:'ambiguous-fingerprint'});continue}
       await setDoc(doc(cloud,'companies',COMPANY_ID,col,target.newId),{...data,lessonId:target.newId},{merge:false});
       await deleteDoc(oldRef);
     }

   }catch(e){console.error('Legacy lesson cloud migration failed',oldId,e);unresolved.push({oldId,reason:e?.message||String(e)})}
 }
 if(unresolved.length){
   try{localStorage.setItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3',JSON.stringify(unresolved))}catch{}
   console.warn('Lesson ID cloud migration has unresolved legacy documents',unresolved);
   return;
 }
 localStorage.removeItem('danbridge_lesson_id_migration_v15_28_3');
 localStorage.removeItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3');
}


const SCHEDULE_NOTIFICATION_FIELDS=['date','start','end','studentId','title','location','room','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','lessonState','note','paymentStatus','chargeStudent','payTeacher','campId'];
const SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS=30;
const SCHEDULE_NOTIFICATION_UNREAD_RETENTION_DAYS=90;
function scheduleNotificationCreatedMillis(value){
 if(value?.toMillis)return value.toMillis();
 const parsed=new Date(value||0).getTime();return Number.isFinite(parsed)?parsed:0;
}
function scheduleNotificationExpired(notification,now=Date.now()){
 const created=scheduleNotificationCreatedMillis(notification?.createdAt);if(!created)return false;
 const days=notification?.read===true?SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS:SCHEDULE_NOTIFICATION_UNREAD_RETENTION_DAYS;
 return created<now-days*86400000;
}
async function cleanupExpiredScheduleNotifications(){
 if(scheduleNotificationCleanupStarted||cloudRole!=='owner')return;
 scheduleNotificationCleanupStarted=true;
 try{
  const oldestRead=Timestamp.fromDate(new Date(Date.now()-SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS*86400000));
  const snap=await getDocs(query(collection(cloud,'companies',COMPANY_ID,'scheduleNotifications'),where('createdAt','<',oldestRead)));
  const expired=snap.docs.filter(d=>scheduleNotificationExpired(d.data())).slice(0,100);
  if(expired.length)await Promise.all(expired.map(d=>deleteDoc(d.ref)));
 }catch(e){scheduleNotificationCleanupStarted=false;console.error('Schedule notification retention cleanup failed',e);reportOperationalError(e,{category:'cloud-write',area:'notification-retention',retryable:true})}
}
function lessonFingerprintForNotification(lesson){return SCHEDULE_NOTIFICATION_FIELDS.map(k=>String(lesson?.[k]??'')).join('|')+'|'+lessonTeacherIds(lesson).slice().sort().join(',')}
function lessonDisplayName(lesson,sourceDb){
 const student=(sourceDb?.students||[]).find(s=>String(s.id)===String(lesson?.studentId));
 return String(student?.name||lesson?.studentName||lesson?.title||'未命名課程');
}
function lessonTimeLabel(lesson){return [lesson?.date,lesson?.start&&lesson?.end?`${lesson.start}–${lesson.end}`:lesson?.start||''].filter(Boolean).join(' ')}
function scheduleChangeSummary(type,before,after,sourceDb){
 const target=after||before||{};
 const student=lessonDisplayName(target,sourceDb);
 if(type==='added')return `新增：${student}｜${lessonTimeLabel(target)}`;
 if(type==='removed')return `取消：${student}｜${lessonTimeLabel(target)}`;
 const changes=[];
 if(String(before?.date||'')!==String(after?.date||''))changes.push(`日期 ${before?.date||'—'} → ${after?.date||'—'}`);
 if(String(before?.start||'')!==String(after?.start||'')||String(before?.end||'')!==String(after?.end||''))changes.push(`時間 ${(before?.start||'—')}–${(before?.end||'—')} → ${(after?.start||'—')}–${(after?.end||'—')}`);
 if(String(before?.location||'')!==String(after?.location||''))changes.push(`地點 ${before?.location||'—'} → ${after?.location||'—'}`);
 if(String(before?.branchId||'')!==String(after?.branchId||''))changes.push(`校區 ${before?.branchId||'—'} → ${after?.branchId||'—'}`);
 if(String(before?.room||'')!==String(after?.room||''))changes.push(`教室 ${before?.room||'—'} → ${after?.room||'—'}`);
 if(String(before?.deliveryMode||'')!==String(after?.deliveryMode||''))changes.push(`上課方式 ${before?.deliveryMode||'—'} → ${after?.deliveryMode||'—'}`);
 if(String(before?.address||'')!==String(after?.address||''))changes.push('到府地址已更新');
 if(String(before?.meetingUrl||'')!==String(after?.meetingUrl||''))changes.push('線上課連結已更新');
 if(String(before?.title||'')!==String(after?.title||''))changes.push(`課程 ${before?.title||'—'} → ${after?.title||'—'}`);
 if(lessonTeacherIds(before).slice().sort().join(',')!==lessonTeacherIds(after).slice().sort().join(','))changes.push('授課老師已更新');
 if(String(before?.note||'')!==String(after?.note||''))changes.push('課程備註已更新');
 if(String(before?.status||'')!==String(after?.status||''))changes.push(`狀態 ${before?.status||'—'} → ${after?.status||'—'}`);
 return `修改：${student}｜${changes.slice(0,3).join('；')||lessonTimeLabel(target)}`;
}
function buildScheduleNotificationChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before){
     for(const teacherId of lessonTeacherIds(after))changes.push({teacherId,type:'added',lessonId:id,before:null,after});
     continue;
   }
   if(lessonFingerprintForNotification(before)===lessonFingerprintForNotification(after))continue;
   const oldTeachers=new Set(lessonTeacherIds(before));
   const newTeachers=new Set(lessonTeacherIds(after));
   for(const teacherId of oldTeachers){
     if(!newTeachers.has(teacherId))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
     else changes.push({teacherId,type:'modified',lessonId:id,before,after});
   }
   for(const teacherId of newTeachers){if(!oldTeachers.has(teacherId))changes.push({teacherId,type:'added',lessonId:id,before:null,after});}
 }
 for(const [id,before] of beforeMap){
   if(afterMap.has(id))continue;
   for(const teacherId of lessonTeacherIds(before))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
 }
 return changes;
}
function buildScheduleLessonChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before)changes.push({type:'added',lessonId:id,before:null,after});
   else if(lessonFingerprintForNotification(before)!==lessonFingerprintForNotification(after))changes.push({type:'modified',lessonId:id,before,after});
 }
 for(const [id,before] of beforeMap){if(!afterMap.has(id))changes.push({type:'removed',lessonId:id,before,after:null})}
 return changes;
}
function buildScheduleNotificationRecipientGroups(accessRows,teacherChanges,lessonChanges,ownerEmail,ownerDisplayName,schedulerEmails){
 const accessByTeacher=new Map(),managers=[],schedulers=[];
 const owners=[{email:ownerEmail,role:'owner',teacherName:ownerDisplayName,branchIds:[]}];
 const schedulerSet=schedulerEmails instanceof Set?schedulerEmails:new Set(schedulerEmails||[]);
 for(const row of accessRows||[]){
   const a=row||{},email=String(a.email||a.id||'').trim().toLowerCase();
   if(a.active===false||!email)continue;
   if(a.role==='owner'){
     if(!owners.some(owner=>owner.email===email))owners.push({email,role:'owner',teacherName:a.displayName||'',branchIds:[]});
     continue;
   }
   if(a.role==='branch_manager'&&Array.isArray(a.branchIds)&&a.branchIds.length){
     managers.push({email,role:'branch_manager',teacherName:a.managerName||a.teacherName||'',branchIds:a.branchIds.map(String)});
     continue;
   }
   if(a.role!=='teacher')continue;
   if(a.canManageSchedule===true||schedulerSet.has(email))schedulers.push({email,role:'scheduler',teacherName:a.teacherName||a.displayName||'aa',branchIds:[]});
   if(!a.teacherId)continue;
   const teacherId=String(a.teacherId);
   if(!accessByTeacher.has(teacherId))accessByTeacher.set(teacherId,[]);
   accessByTeacher.get(teacherId).push({email,role:'teacher',teacherName:a.teacherName||''});
 }
 const grouped=new Map();
 const addRecipientItem=(recipient,item,teacherId='')=>{
   const key=recipient.email;
   if(!grouped.has(key))grouped.set(key,{recipient,teacherId,items:new Map()});
   grouped.get(key).items.set(`${item.type}:${item.lessonId}`,item);
 };
 for(const change of teacherChanges||[]){
   const recipients=accessByTeacher.get(String(change.teacherId))||[];
   for(const recipient of recipients)addRecipientItem(recipient,change,String(change.teacherId));
 }
 for(const change of lessonChanges||[]){
   const affectedBranches=new Set([change.before&&lessonBranchId(change.before),change.after&&lessonBranchId(change.after)].filter(Boolean).map(String));
   for(const owner of owners)addRecipientItem(owner,change,'');
   for(const scheduler of schedulers)addRecipientItem(scheduler,change,'');
   for(const manager of managers){if(manager.branchIds.some(branchId=>affectedBranches.has(branchId)))addRecipientItem(manager,change,'')}
 }
 return [...grouped.values()];
}
async function createScheduleNotificationIfMissing(notificationRef,payload){
 await runTransaction(cloud,async transaction=>{
  const existing=await transaction.get(notificationRef);
  if(!existing.exists())transaction.set(notificationRef,payload);
 });
}
async function publishScheduleChangeNotifications(previousDb,currentDb,batchKey,actor={}){
 if(cloudRole!=='owner'||!previousDb)return;
 const teacherChanges=buildScheduleNotificationChanges(previousDb,currentDb);
 const lessonChanges=buildScheduleLessonChanges(previousDb,currentDb);
 if(!lessonChanges.length)return;
 const accessDocs=await getCompanyAccessDocs();
 const grouped=buildScheduleNotificationRecipientGroups(accessDocs.map(d=>({id:d.id,...(d.data()||{})})),teacherChanges,lessonChanges,OWNER_EMAIL,OWNER_DISPLAY_NAME,SCHEDULER_ACCOUNT_EMAILS);
 const jobs=[];
 for(const {recipient,teacherId,items:itemsByKey} of grouped){
   if(!recipient.email)continue;
   const items=[...itemsByKey.values()];
   const safeBatch=String(batchKey||dataHash(currentDb)).replace(/[^a-zA-Z0-9_-]/g,'_');
   const safeRecipient=recipient.email.replace(/[^a-zA-Z0-9_-]/g,'_');
   const notificationRef=doc(cloud,'companies',COMPANY_ID,'scheduleNotifications',`${safeBatch}_${safeRecipient}`);
   const details=items.map(item=>({
     type:item.type,lessonId:item.lessonId,
     summary:scheduleChangeSummary(item.type,item.before,item.after,currentDb),
     studentName:lessonDisplayName(item.after||item.before,currentDb),
     beforeTime:item.before?lessonTimeLabel(item.before):'',
     afterTime:item.after?lessonTimeLabel(item.after):'',
     before:item.before?{date:item.before.date||'',start:item.before.start||'',end:item.before.end||'',studentId:item.before.studentId||'',title:item.before.title||'',location:item.before.location||'',branchId:item.before.branchId||'',deliveryMode:item.before.deliveryMode||'',room:item.before.room||'',address:item.before.address||'',onlinePlatform:item.before.onlinePlatform||'',meetingUrl:item.before.meetingUrl||'',status:item.before.status||'',note:item.before.note||'',teacherIds:lessonTeacherIds(item.before)}:null,
     after:item.after?{date:item.after.date||'',start:item.after.start||'',end:item.after.end||'',studentId:item.after.studentId||'',title:item.after.title||'',location:item.after.location||'',branchId:item.after.branchId||'',deliveryMode:item.after.deliveryMode||'',room:item.after.room||'',address:item.after.address||'',onlinePlatform:item.after.onlinePlatform||'',meetingUrl:item.after.meetingUrl||'',status:item.after.status||'',note:item.after.note||'',teacherIds:lessonTeacherIds(item.after)}:null
   })).map(item=>recipient.role==='teacher'?{...item,before:item.before?{...item.before,address:'',meetingUrl:'',note:''}:null,after:item.after?{...item.after,address:'',meetingUrl:'',note:''}:null}:item);
   const manager=recipient.role==='branch_manager',owner=recipient.role==='owner',scheduler=recipient.role==='scheduler';
   jobs.push(createScheduleNotificationIfMissing(notificationRef,{companyId:COMPANY_ID,recipientEmail:recipient.email,recipientRole:recipient.role,teacherId,branchIds:manager?recipient.branchIds:[],teacherName:recipient.teacherName||'',title:'課表更新通知',message:owner?`公司課表有 ${items.length} 個變更`:scheduler?`全老師課表有 ${items.length} 個變更`:manager?`您管理的校區課表有 ${items.length} 個變更`:`您的課表有 ${items.length} 個變更`,changeCount:items.length,details,read:false,createdAt:serverTimestamp(),createdBy:actor.uid||cloudUid,createdByName:actor.name||document.body.dataset.cloudDisplayName||auth.currentUser?.displayName||auth.currentUser?.email||'Owner'}));
 }
 if(jobs.length)await withSyncTimeout(Promise.all(jobs),15000);
}
function queueScheduleChangeNotifications(previousDb,currentDb,batchKey,actor={}){
 if(cloudRole!=='owner'||!previousDb)return;
 const key=String(batchKey||dataHash(currentDb));
 const job={previousDb:deepCopy(previousDb),currentDb:deepCopy(currentDb),batchKey:key,actor:{uid:actor.uid||'',name:actor.name||''},attempts:0,timer:null};
 scheduleNotificationDeliveryJobs.set(key,job);
 const deliver=async()=>{
   if(!scheduleNotificationDeliveryJobs.has(key)||cloudRole!=='owner')return;
   try{await publishScheduleChangeNotifications(job.previousDb,job.currentDb,job.batchKey,job.actor);scheduleNotificationDeliveryJobs.delete(key)}
   catch(e){job.attempts++;console.error('Schedule notification background delivery failed',e);cloudStatus(job.attempts<3?'課表已同步；老師通知正在背景補送。':'課表已同步，但老師通知持續補送中，請保持網路連線。',job.attempts<3?'pending':'error');job.timer=setTimeout(deliver,Math.min(30000,1000*Math.pow(2,Math.min(job.attempts,5))))}
 };
 deliver();
}
function installScheduleNotificationUI(){
 if(document.getElementById('scheduleNotificationModal'))return;
 const modal=document.createElement('div');
 modal.id='scheduleNotificationModal';modal.className='schedule-notification-backdrop';modal.hidden=true;
 modal.innerHTML=`<div class="schedule-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduleNotificationTitle"><div class="schedule-notification-head"><div><div class="schedule-notification-eyebrow">SCHEDULE UPDATE</div><h2 id="scheduleNotificationTitle">課表更新通知</h2></div></div><div id="scheduleNotificationBody" class="schedule-notification-body"></div><div class="schedule-notification-actions"><button type="button" class="btn" id="scheduleNotificationLater">稍後查看</button><button type="button" class="btn primary" id="scheduleNotificationAcknowledge">知道了</button></div></div>`;
 document.body.appendChild(modal);
 document.getElementById('scheduleNotificationLater').onclick=()=>{modal.hidden=true};
 document.getElementById('scheduleNotificationAcknowledge').onclick=acknowledgeCurrentScheduleNotification;
}
function formatNotificationTimestamp(value){try{const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return ''}}
function renderScheduleNotification(notification){
 installScheduleNotificationUI();
 const modal=document.getElementById('scheduleNotificationModal');
 const body=document.getElementById('scheduleNotificationBody');
 if(!modal||!body||!notification)return;
 const details=Array.isArray(notification.details)?notification.details:[];
 currentScheduleNotification=notification;
 if(notification.notificationType==='teacher-leave')body.innerHTML=`<p class="schedule-notification-lead"><b>老師請假異動</b><span>${escapeHTML(notification.message||'請假紀錄已更新')}</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>老師</th><th>日期</th><th>時間</th><th>類別</th><th>時數</th><th>狀態</th></tr></thead><tbody>${details.map(item=>`<tr><td><b>${escapeHTML(item.teacherName||'老師')}</b></td><td>${escapeHTML(item.date||'')}</td><td>${escapeHTML(`${item.start||''}–${item.end||''}`)}</td><td>${escapeHTML(item.leaveTypeLabel||'')}</td><td>${escapeHTML(String(item.hours??''))}</td><td>${item.status==='cancelled'?'已取消':'有效'}</td></tr>`).join('')}</tbody></table></div><div class="schedule-notification-actions"><button type="button" class="btn" data-leave-notification-open>查看請假紀錄</button></div><div class="schedule-notification-time">更新時間：${escapeHTML(formatNotificationTimestamp(notification.createdAt)||'剛剛')}</div>`;
 else body.innerHTML=`<p class="schedule-notification-lead"><b>Daniel 已更新您的課表</b><span>${escapeHTML(notification.message||`共有 ${details.length} 個變更`)}，已合併整理如下。</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>異動</th><th>學生／課程</th><th>原課程</th><th>新課程</th><th>內容</th><th>來源</th></tr></thead><tbody>${details.map((item,index)=>`<tr data-type="${escapeHTML(item.type||'modified')}"><td><span class="schedule-notification-type">${item.type==='added'?'新增':item.type==='removed'?'取消':'修改'}</span></td><td><b>${escapeHTML(item.studentName||'課程')}</b></td><td>${escapeHTML(item.beforeTime||'—')}</td><td>${escapeHTML(item.afterTime||'—')}</td><td>${escapeHTML(item.summary||'課表內容已更新')}</td><td><button type="button" class="btn schedule-notification-source" data-notification-detail="${index}">查看課表</button></td></tr>`).join('')}</tbody></table></div><div class="schedule-notification-time">更新時間：${escapeHTML(formatNotificationTimestamp(notification.createdAt)||'剛剛')}</div>`;
 const notificationLead=body.querySelector('.schedule-notification-lead b');if(notificationLead&&notification.notificationType!=='teacher-leave')notificationLead.textContent=`${notification.createdByName||'Owner'} 已更新課表`;
 body.querySelectorAll('[data-notification-detail]').forEach(button=>button.addEventListener('click',()=>openScheduleNotificationSource(Number(button.dataset.notificationDetail))));
 body.querySelector('[data-leave-notification-open]')?.addEventListener('click',()=>{modal.hidden=true;window.switchTab?.('teacherLeave')});
 modal.dataset.notificationId=notification.id||'';
 modal.dataset.notificationIds=JSON.stringify(Array.isArray(notification.notificationIds)?notification.notificationIds.filter(Boolean):[notification.id].filter(Boolean));
 modal.hidden=false;
}
function openScheduleNotificationSource(index){
 const detail=currentScheduleNotification?.details?.[index];if(!detail)return;
 const source=detail.after||detail.before||{},date=source.date||'';
 const input=document.getElementById('calendarDate');if(input&&date)input.value=date;
 const modal=document.getElementById('scheduleNotificationModal');if(modal)modal.hidden=true;
 window.switchTab?.('calendar');
 setTimeout(()=>{window.renderCalendar?.();if(detail.type!=='removed'&&detail.lessonId)window.editLesson?.(detail.lessonId)},40);
}
async function acknowledgeCurrentScheduleNotification(){
 const modal=document.getElementById('scheduleNotificationModal');
 let ids=[];try{ids=JSON.parse(modal?.dataset.notificationIds||'[]')}catch{}
 if(!ids.length&&modal?.dataset.notificationId)ids=[modal.dataset.notificationId];
 if(!ids.length)return;
 const button=document.getElementById('scheduleNotificationAcknowledge');
 try{
   if(button){button.disabled=true;button.textContent='處理中…'}
   if(modal)modal.hidden=true;
   if(!productionNotificationAcknowledgeCall)throw new Error('通知確認服務尚未就緒');
   const result=await productionNotificationAcknowledgeCall({notificationIds:ids});
   if(result?.data?.ok!==true)throw new Error('通知確認未完成');
 }catch(e){console.error('Acknowledge schedule notification failed',e);cloudStatus('通知確認失敗：'+(e?.message||e),'error')}
 finally{if(button){button.disabled=false;button.textContent='知道了'}}
}
function subscribeScheduleNotifications(){
 unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;scheduleNotificationDocuments=[];
 if(!['owner','teacher','branch_manager'].includes(cloudRole)||!cloudEmailKey)return;
 installScheduleNotificationUI();
 const q=query(collection(cloud,'companies',COMPANY_ID,'scheduleNotifications'),where('recipientEmail','==',cloudEmailKey));
 unsubscribeScheduleNotifications=onSnapshot(q,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.hasPendingWrites)return;
   scheduleNotificationDocuments=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.read!==true&&!scheduleNotificationExpired(x)).sort((a,b)=>{const priority=(b.notificationType==='teacher-leave')-(a.notificationType==='teacher-leave');if(priority)return priority;const at=a.createdAt?.toMillis?.()||0,bt=b.createdAt?.toMillis?.()||0;return bt-at});
   const current=scheduleNotificationDocuments[0];
   if(current&&!document.getElementById('scheduleNotificationModal')?.hidden)return;
   if(current){
     const sameType=scheduleNotificationDocuments.filter(n=>(n.notificationType||'schedule')===(current.notificationType||'schedule')),details=sameType.flatMap(n=>Array.isArray(n.details)?n.details:[]);
     renderScheduleNotification({...current,notificationIds:sameType.map(n=>n.id),details,message:current.notificationType==='teacher-leave'?current.message:(current.recipientRole==='owner'?`公司課表共有 ${details.length} 個變更`:current.recipientRole==='scheduler'?`全老師課表共有 ${details.length} 個變更`:current.recipientRole==='branch_manager'?`您管理的校區課表共有 ${details.length} 個變更`:`您的課表共有 ${details.length} 個變更`)});
   }
 },e=>{console.error('Schedule notification listener failed',e);cloudStatus('課表通知讀取失敗：'+(e?.message||e),'error')});
}

async function publishStagingShadowGeneration(db,sourceHash){
 // 硬鎖：影子分片只允許 staging Owner 執行；正式環境與其他角色永遠不建立分片文件。
 if(!canRunStagingShadow({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole}))return;
 const generationRef=doc(collection(cloud,'companies',COMPANY_ID,'shardedGenerations'));
 const snapshot=createShardedSnapshot(db,{hash:dataHash,maxChunkBytes:180000,generationId:generationRef.id});
 if(snapshot.manifest.sourceHash!==sourceHash)throw new Error('影子分片來源版本在排程前已改變');
 setStagingShadowDiagnostic({state:'uploading',generationId:generationRef.id,sourceHash,verifiedHash:'',totalChunks:snapshot.manifest.totalChunks,totalRecords:snapshot.manifest.totalRecords,error:''});
 await setDoc(generationRef,{...snapshot.manifest,status:'uploading',environment:'staging',createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});
 await Promise.all(snapshot.chunks.map(chunk=>setDoc(doc(generationRef,'chunks',chunk.documentId),{generationId:generationRef.id,key:chunk.key,index:chunk.index,items:chunk.items,sourceHash,createdAt:serverTimestamp()},{merge:false})));
 await setDoc(generationRef,{status:'uploaded',uploadedAt:serverTimestamp()},{merge:true});
 const [manifestSnap,chunksSnap]=await Promise.all([getDoc(generationRef),getDocs(collection(generationRef,'chunks'))]);
 if(!manifestSnap.exists())throw new Error('影子分片 manifest 寫入後遺失');
 const manifest=manifestSnap.data(),chunks=chunksSnap.docs.map(row=>row.data());
 const rebuilt=assembleShardedSnapshot(manifest,chunks,{hash:dataHash}),verifiedHash=dataHash(rebuilt);
 if(verifiedHash!==sourceHash)throw new Error('影子分片讀回驗證與舊主資料不一致');
 await setDoc(generationRef,{status:'verified',verifiedHash,verifiedAt:serverTimestamp()},{merge:true});
 stagingShadowLastVerifiedHash=verifiedHash;
 setStagingShadowDiagnostic({state:'verified',verifiedHash,error:''});
}
async function processStagingShadowQueue(){
 if(stagingShadowInFlight||!canRunStagingShadow({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole}))return;
 stagingShadowInFlight=true;
 try{
  while(stagingShadowQueued){
   const queued=stagingShadowQueued;stagingShadowQueued=null;
   if(queued.sourceHash===stagingShadowLastVerifiedHash)continue;
   try{await publishStagingShadowGeneration(queued.db,queued.sourceHash)}
   catch(error){setStagingShadowDiagnostic({state:'failed',error:String(error?.message||error).slice(0,300)});console.error('Staging shadow sharding failed',error);reportOperationalError(error,{category:'cloud-write',area:'staging-shadow-shard',retryable:true})}
  }
 }finally{stagingShadowInFlight=false;if(stagingShadowQueued)queueMicrotask(processStagingShadowQueue)}
}
function queueStagingShadowGeneration(db,sourceHash=dataHash(db)){
 if(!canRunStagingShadow({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole}))return false;
 stagingShadowQueued={db:deepCopy(db),sourceHash:String(sourceHash)};
 setStagingShadowDiagnostic({state:'queued',sourceHash:String(sourceHash),error:''});
 queueMicrotask(processStagingShadowQueue);return true;
}
window.__danbridgeQueueStagingShadowGeneration=queueStagingShadowGeneration;
window.__danbridgeGetStagingShadowDiagnostic=()=>canRunStagingShadow({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole})?deepCopy(stagingShadowDiagnostic):null;

let stagingRecordShadowDiagnostic={state:'idle',sourceHash:'',totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,activeCount:0,tombstoneCount:0,verified:false,error:'',startedAt:'',finishedAt:''};
function setStagingRecordShadowDiagnostic(next){
 stagingRecordShadowDiagnostic={...stagingRecordShadowDiagnostic,...next};
 if(DANBRIDGE_ENVIRONMENT==='staging')document.body.dataset.stagingRecordShadowState=stagingRecordShadowDiagnostic.state;
}
function stagingRecordShadowGuard(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||firebaseConfig.projectId!=='danbridge-d8877-staging')throw new Error('逐筆影子手動入口只允許 staging Owner');
}
function firestoreRecordShadowAdapter({failBatch=0}={}){
 let transactionNumber=0;
 return createFirebaseRecordShadowAdapter({
  environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,actor:{uid:cloudUid,email:cloudEmailKey},serverTimestamp,
  getCollectionDocuments:async path=>{const snapshot=await getDocs(collection(cloud,...path.split('/')));return snapshot.docs.map(row=>({id:row.id,data:row.data()}))},
  runBatchTransaction:async callback=>{
   transactionNumber++;
   if(failBatch===transactionNumber)throw new Error(`staging 測試注入：第 ${failBatch} 批失敗`);
   return runTransaction(cloud,transaction=>callback({get:path=>transaction.get(doc(cloud,...path.split('/'))),set:(path,payload)=>transaction.set(doc(cloud,...path.split('/')),payload,{merge:false})}));
  }
 });
}
async function runStagingRecordShadow(options={}){
 stagingRecordShadowGuard();
 const targetDb=deepCopy(options.targetDb??window.__danbridgeGetDB?.()),sourceHash=String(options.sourceHash||dataHash(targetDb)),startedAt=new Date().toISOString();
 setStagingRecordShadowDiagnostic({state:'reading',sourceHash,totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,activeCount:0,tombstoneCount:0,verified:false,error:'',startedAt,finishedAt:''});
 try{
  const result=await firestoreRecordShadowAdapter({failBatch:Number(options.failBatch)||0}).synchronize(targetDb,{sourceHash,batchSize:options.batchSize,
   onPlan:(plan,current)=>setStagingRecordShadowDiagnostic({state:plan.writes?'writing':'verifying',totalWrites:plan.writes,totalBatches:plan.batches.length,activeCount:current.activeCount,tombstoneCount:current.tombstoneCount}),
   onBatchComplete:progress=>setStagingRecordShadowDiagnostic({state:progress.completedBatches===progress.totalBatches?'verifying':'writing',completedWrites:progress.completedWrites,completedBatches:progress.completedBatches})
  });
  setStagingRecordShadowDiagnostic({state:'verified',totalWrites:result.writes,completedWrites:result.writes,totalBatches:result.batches,completedBatches:result.batches,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,verified:true,error:'',finishedAt:new Date().toISOString()});
  return deepCopy(stagingRecordShadowDiagnostic);
 }catch(error){
  setStagingRecordShadowDiagnostic({state:'failed',completedWrites:Number(error?.completedWrites)||stagingRecordShadowDiagnostic.completedWrites,completedBatches:Number(error?.completedBatches)||stagingRecordShadowDiagnostic.completedBatches,verified:false,error:String(error?.message||error).slice(0,500),finishedAt:new Date().toISOString()});
  console.error('Staging record shadow failed',error);throw error;
 }
}

let stagingFullRecordShadowDiagnostic={state:'idle',sourceHash:'',totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,documentCount:0,activeCount:0,tombstoneCount:0,verified:false,error:''};
function setStagingFullRecordShadowDiagnostic(next){stagingFullRecordShadowDiagnostic={...stagingFullRecordShadowDiagnostic,...next};document.body.dataset.stagingFullRecordShadowState=stagingFullRecordShadowDiagnostic.state}
function firestoreFullRecordShadowAdapter({failBatch=0}={}){
 let transactionNumber=0;
 return createFirebaseFullRecordShadowAdapter({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,actor:{uid:cloudUid,email:cloudEmailKey},serverTimestamp,getCollectionDocuments:async path=>{const snapshot=await getDocs(collection(cloud,...path.split('/')));return snapshot.docs.map(row=>({id:row.id,data:row.data()}))},runBatchTransaction:async callback=>{
  transactionNumber++;if(failBatch===transactionNumber)throw new Error(`staging 全資料測試注入：第 ${failBatch} 批失敗`);
  return runTransaction(cloud,async transaction=>{
   let candidate=null;if(DANBRIDGE_ENVIRONMENT==='staging'){const snapshot=await transaction.get(doc(cloud,'stagingRecordSyncCandidateControls',COMPANY_ID));candidate=snapshot.exists()?snapshot.data():null;if(!candidate||candidate.schema!=='danbridge-record-sync-candidate-control-v1'||candidate.environment!=='staging'||candidate.state!=='open')throw new Error('staging 逐筆候選未開啟或已封存')}
   return callback({get:path=>transaction.get(doc(cloud,...path.split('/'))),set:(path,payload)=>{if(candidate&&payload?.sourceHash!==candidate.legacyVersionHash)throw new Error('staging 逐筆候選來源版本不符');transaction.set(doc(cloud,...path.split('/')),payload,{merge:false})}});
  });
 }});
}
async function runStagingFullRecordShadow({failBatch=0,batchSize=400,targetDb:providedTargetDb}={}){
 stagingRecordShadowGuard();const targetDb=deepCopy(providedTargetDb??window.__danbridgeGetDB?.()),sourceHash=dataHash(targetDb);setStagingFullRecordShadowDiagnostic({state:'reading',sourceHash,totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,documentCount:0,activeCount:0,tombstoneCount:0,verified:false,error:''});
 try{const result=await firestoreFullRecordShadowAdapter({failBatch}).synchronize(targetDb,{sourceHash,batchSize,onBatchComplete:progress=>setStagingFullRecordShadowDiagnostic({state:'writing',...progress})});setStagingFullRecordShadowDiagnostic({state:'verified',totalWrites:result.writes,completedWrites:result.writes,totalBatches:result.batches,completedBatches:result.batches,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,verified:true,error:''});return deepCopy(stagingFullRecordShadowDiagnostic)}catch(error){setStagingFullRecordShadowDiagnostic({state:'failed',completedWrites:Number(error?.completedWrites)||stagingFullRecordShadowDiagnostic.completedWrites,completedBatches:Number(error?.completedBatches)||stagingFullRecordShadowDiagnostic.completedBatches,verified:false,error:String(error?.message||error).slice(0,500)});throw error}
}
function installStagingMigrationActionButton({id,label,runningLabel,successLabel,run}){
 let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id=id;button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:36px;z-index:10002';button.textContent=label;button.onclick=async()=>{button.disabled=true;button.textContent=runningLabel;try{const result=await run();button.textContent=successLabel(result);button.className='btn ok'}catch(error){button.disabled=false;button.textContent=`已阻擋：${String(error?.message||error).slice(0,120)}`;button.className='btn danger';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeRunStagingFullRecordShadow=runStagingFullRecordShadow;
 const fullRecordShadowTest=new URLSearchParams(location.search).get('fullRecordShadowTest');
 if(fullRecordShadowTest){let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);try{let result;if(fullRecordShadowTest==='failure-resume'){const main=deepCopy(window.__danbridgeGetDB?.()),altered=deepCopy(main),testIds=['staging-full-interrupt-1','staging-full-interrupt-2','staging-full-interrupt-3'];altered.branches=[...(altered.branches||[]).filter(row=>!testIds.includes(String(row.id))),...testIds.map((id,index)=>({id,name:`STAGING_FULL_INTERRUPT_${index+1}`,rooms:[]}))];let failed=null;try{await runStagingFullRecordShadow({failBatch:2,batchSize:1,targetDb:altered})}catch{failed=deepCopy(stagingFullRecordShadowDiagnostic)}result={failed,resumed:await runStagingFullRecordShadow({batchSize:1,targetDb:altered}),cleanup:await runStagingFullRecordShadow({batchSize:1,targetDb:main})}}else result=await runStagingFullRecordShadow();document.body.dataset.stagingFullRecordShadowTestResult=JSON.stringify(result)}catch(error){document.body.dataset.stagingFullRecordShadowTestResult=JSON.stringify({error:String(error?.message||error),diagnostic:stagingFullRecordShadowDiagnostic})}},200)}
}

let productionFullRecordMigrationDiagnostic={state:'idle',sourceHash:'',totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,documentCount:0,activeCount:0,tombstoneCount:0,verified:false,error:''};
function setProductionFullRecordMigrationDiagnostic(next){productionFullRecordMigrationDiagnostic={...productionFullRecordMigrationDiagnostic,...next};document.body.dataset.productionFullRecordMigrationState=productionFullRecordMigrationDiagnostic.state}
function productionFullRecordMigrationGuard(){if(DANBRIDGE_ENVIRONMENT!=='production'||cloudRole!=='owner')throw new Error('production 逐筆遷移只允許 production Owner')}
async function readVerifiedProductionLegacySource(expectedSourceHash){
 productionFullRecordMigrationGuard();
 if(firebaseConfig.projectId!=='danbridge-d8877'||app.options?.projectId!=='danbridge-d8877'||auth.app!==app||cloud.app!==app)throw new Error('production 主資料讀取環境不符');
 const user=auth.currentUser,uid=user?.uid,email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
 if(typeof uid!=='string'||!uid||email!==OWNER_EMAIL||typeof user?.getIdTokenResult!=='function')throw new Error('production 主資料只允許目前登入的主要 Owner 讀取');
 await user.getIdTokenResult(true);
 const sameOwner=()=>auth.currentUser===user&&auth.currentUser?.uid===uid&&String(auth.currentUser?.email||'').trim().toLowerCase()===email;
 if(!sameOwner())throw new Error('production Owner 身分在讀取前已改變');
 const snapshot=await getDocFromServer(doc(cloud,'companies',COMPANY_ID,'data','main'));
 if(!sameOwner())throw new Error('production Owner 身分在讀取期間已改變');
 if(!snapshot.exists()||!snapshot.data()?.db)throw new Error('production 雲端主資料不存在');
 const sourceDb=deepCopy(snapshot.data().db),sourceHash=String(snapshot.data()?.clientHash||''),computedHash=dataHash(sourceDb);
 if(!sourceHash||computedHash!==sourceHash)throw new Error(`production 雲端主資料內容與版本不一致：stored ${sourceHash||'—'}，computed ${computedHash}`);
 if(!expectedSourceHash||sourceHash!==expectedSourceHash)throw new Error(`production 雲端來源不符：預期 ${expectedSourceHash||'—'}，實際 ${sourceHash}`);
 return{sourceDb,sourceHash};
}
async function runProductionFullRecordMigration(expectedSourceHash){
 const {sourceDb:targetDb,sourceHash}=await readVerifiedProductionLegacySource(expectedSourceHash);
 setProductionFullRecordMigrationDiagnostic({state:'reading',sourceHash,totalWrites:0,completedWrites:0,totalBatches:0,completedBatches:0,documentCount:0,activeCount:0,tombstoneCount:0,verified:false,error:''});
 try{const result=await firestoreFullRecordShadowAdapter().synchronize(targetDb,{sourceHash,batchSize:400,onBatchComplete:progress=>setProductionFullRecordMigrationDiagnostic({state:'writing',...progress})});setProductionFullRecordMigrationDiagnostic({state:'verified',totalWrites:result.writes,completedWrites:result.writes,totalBatches:result.batches,completedBatches:result.batches,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,verified:true,error:''});document.body.dataset.productionFullRecordMigrationResult=JSON.stringify(productionFullRecordMigrationDiagnostic);return deepCopy(productionFullRecordMigrationDiagnostic)}catch(error){setProductionFullRecordMigrationDiagnostic({state:'failed',completedWrites:Number(error?.completedWrites)||productionFullRecordMigrationDiagnostic.completedWrites,completedBatches:Number(error?.completedBatches)||productionFullRecordMigrationDiagnostic.completedBatches,verified:false,error:String(error?.message||error).slice(0,500)});document.body.dataset.productionFullRecordMigrationResult=JSON.stringify(productionFullRecordMigrationDiagnostic);throw error}
}
if(DANBRIDGE_ENVIRONMENT==='production'){
 const expectedProductionMigrationHash=new URLSearchParams(location.search).get('productionFullRecordMigration');
 if(expectedProductionMigrationHash){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='productionFullRecordMigrationButton';button.type='button';button.className='btn danger';button.style.cssText='position:fixed;right:18px;bottom:148px;z-index:10002';button.textContent='寫入 production 新逐筆集合';button.onclick=async()=>{button.disabled=true;button.textContent='production 逐筆寫入與讀回驗證中…';try{const result=await runProductionFullRecordMigration(expectedProductionMigrationHash);button.textContent=`production 已驗證 ${result.activeCount} 筆`;button.className='btn ok'}catch(error){button.disabled=false;button.textContent='production 遷移失敗，未切換讀取';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
}

async function auditProductionRoleViews(sourceDb){
 const accessDocs=await getCompanyAccessDocs(),issues=[],evidence=[],counts={owners:1,schedulers:0,teachers:0,branchManagers:0};
 for(const accessDoc of accessDocs){
  const access=accessDoc.data(),email=String(access.email||accessDoc.id||'').trim().toLowerCase();
  if(access.active===false||!email)continue;
  if(access.role==='owner'){if(email!==OWNER_EMAIL)counts.owners++;continue}
  let expectedDb=null,storedDb=null,storedHash='',kind='';
  if(access.role==='teacher'&&access.teacherId){
   if(SCHEDULER_ACCOUNT_EMAILS.has(email)){kind='scheduler';counts.schedulers++;expectedDb=filteredSchedulerDB(sourceDb);const snapshot=await getDoc(doc(cloud,'companies',COMPANY_ID,'schedulerViews',email));if(snapshot.exists()){storedDb=snapshot.data()?.db;storedHash=String(snapshot.data()?.clientHash||'')}}
   else{kind='teacher';counts.teachers++;expectedDb=filteredTeacherDB(sourceDb,access.teacherId);const snapshot=await getDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email));if(snapshot.exists()){storedDb=snapshot.data()?.db;storedHash=String(snapshot.data()?.clientHash||'')}}
  }else if(access.role==='branch_manager'&&Array.isArray(access.branchIds)&&access.branchIds.length){kind='branch_manager';counts.branchManagers++;expectedDb=filteredBranchDB(sourceDb,access.branchIds);storedDb=access.scopedDb;storedHash=String(access.scopedClientHash||'')}
  else continue;
  const expectedHash=dataHash(expectedDb),actualHash=storedDb?dataHash(storedDb):'';
  evidence.push({email,kind,expectedHash,actualHash,storedHash});
  if(!storedDb||storedHash!==expectedHash||actualHash!==expectedHash)issues.push({email,kind,reason:!storedDb?'missing':(storedHash!==expectedHash?'stored-hash-mismatch':'content-hash-mismatch')});
 }
 evidence.sort((a,b)=>`${a.kind}:${a.email}`.localeCompare(`${b.kind}:${b.email}`));
 return{...counts,total:counts.schedulers+counts.teachers+counts.branchManagers,verified:issues.length===0,issueCount:issues.length,issues,evidence,roleViewDigest:sha256Canonical(evidence)};
}
window.__danbridgeRepublishProductionRoleViews=async()=>{
 const currentUser=auth.currentUser,currentEmail=String(currentUser?.email||'').trim().toLowerCase();
 if(DANBRIDGE_ENVIRONMENT!=='production'||cloudRole!=='owner'||cloudEmailKey!==OWNER_EMAIL||!currentUser||currentUser.uid!==cloudUid||currentEmail!==OWNER_EMAIL)throw new Error('production 角色檢視重發只允許同一位主要 Owner');
 if(activeRecordMode!=='active'||document.body.dataset.activeRecordAuthority!=='production-records-authoritative')throw new Error('production 逐筆權威資料尚未就緒');
 const sourceDb=deepCopy(window.__danbridgeGetDB?.()||emptyDB()),sourceHash=recordDataHash(sourceDb);
 if(!sourceHash||window.__danbridgeDataScore?.(sourceDb)===0)throw new Error('production 權威資料不可為空');
 await publishScopedViews(sourceDb,{recordAuthority:true});
 const audit=await auditProductionRoleViews(sourceDb);
 if(!audit.verified){document.body.dataset.productionRolePrivacyRepublish=JSON.stringify({state:'failed',release:APP_RELEASE,sourceHash,issues:audit.issues,counts:{schedulers:audit.schedulers,teachers:audit.teachers,branchManagers:audit.branchManagers,total:audit.total}});throw new Error(`production 角色檢視重發後仍有 ${audit.issueCount} 個不一致`)}
 const result={state:'verified',release:APP_RELEASE,sourceHash,roleViewDigest:audit.roleViewDigest,counts:{schedulers:audit.schedulers,teachers:audit.teachers,branchManagers:audit.branchManagers,total:audit.total}};
 document.body.dataset.productionRolePrivacyRepublish=JSON.stringify(result);
 return result;
};
async function buildCurrentRoleViewCandidates(sourceDb){
 const accessDocs=await getCompanyAccessDocs(),views=[];
 for(const accessDoc of accessDocs){
  const access=accessDoc.data(),email=String(access.email||accessDoc.id||'').trim().toLowerCase();
  if(access.active===false||!email||access.role==='owner')continue;
  let kind='',db=null;
  if(access.role==='teacher'&&access.teacherId){if(SCHEDULER_ACCOUNT_EMAILS.has(email)){kind='scheduler';db=filteredSchedulerDB(sourceDb)}else{kind='teacher';db=filteredTeacherDB(sourceDb,access.teacherId)}}
  else if(access.role==='branch_manager'&&Array.isArray(access.branchIds)&&access.branchIds.length){kind='branch_manager';db=filteredBranchDB(sourceDb,access.branchIds)}
  if(!db)continue;
  views.push({viewId:`${kind}--${encodeURIComponent(email)}`,email,kind,db,viewHash:recordDataDigest(db)});
 }
 return views.sort((a,b)=>a.viewId.localeCompare(b.viewId));
}
function stagingRoleViewCandidateGuard(){if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner')throw new Error('staging 角色逐筆候選只允許 staging Owner')}
async function readVerifiedStagingRoleViewCandidateSource(){
 stagingRoleViewCandidateGuard();const [mainSnapshot,candidateControl]=await Promise.all([getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),firestoreRecordSyncCandidateAdapter().read()]);if(!mainSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('staging 角色候選找不到雲端主資料');const sourceDb=deepCopy(mainSnapshot.data().db),legacyVersionHash=String(mainSnapshot.data().clientHash||'');if(!legacyVersionHash||dataHash(sourceDb)!==legacyVersionHash)throw new Error('staging 角色候選雲端主資料與 legacy 版本不一致');const fullReadback=await firestoreFullRecordShadowAdapter().verifyCandidate(sourceDb,{sourceHash:legacyVersionHash});return verifyRoleViewCandidateSourceBinding({sourceDb,legacyVersionHash,candidateControl,fullReadback});
}
async function auditStagingRoleViewCandidateSource(){
 stagingRoleViewCandidateGuard();const [mainSnapshot,candidateSnapshot,documentsByCollection]=await Promise.all([getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),getDoc(doc(cloud,'stagingRecordSyncCandidateControls',COMPANY_ID)),firestoreFullRecordShadowAdapter().read()]);if(!mainSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('staging 角色候選找不到雲端主資料');const sourceDb=deepCopy(mainSnapshot.data().db),legacyVersionHash=String(mainSnapshot.data().clientHash||''),result=buildRoleViewCandidateSourceAudit({sourceDb,legacyVersionHash,legacyHashMatchesSource:!!legacyVersionHash&&dataHash(sourceDb)===legacyVersionHash,candidateControl:candidateSnapshot.exists()?candidateSnapshot.data():null,documentsByCollection});document.body.dataset.stagingRoleViewCandidateAudit=JSON.stringify(result);return result;
}
function firestoreRoleViewCandidateAdapter({failBatch=0}={}){let transactionNumber=0;return createFirebaseRoleViewCandidateAdapter({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,actor:{uid:cloudUid,email:cloudEmailKey},serverTimestamp,hashDb:recordDataDigest,getCollectionDocuments:async path=>{const snapshot=await getDocs(collection(cloud,...path.split('/')));return snapshot.docs.map(row=>({id:row.id,data:row.data()}))},runBatchTransaction:async callback=>{transactionNumber++;if(failBatch===transactionNumber)throw new Error(`staging 角色候選測試注入：第 ${failBatch} 批失敗`);return runTransaction(cloud,transaction=>callback({get:path=>transaction.get(doc(cloud,...path.split('/'))),set:(path,payload)=>transaction.set(doc(cloud,...path.split('/')),payload,{merge:false})}))}})}
const roleCandidateManifestRef=runId=>doc(cloud,'stagingRoleViewCandidateManifests',COMPANY_ID,'runs',runId);
const roleVerificationReceiptRef=(runId,email)=>doc(cloud,'stagingRoleViewVerificationReceipts',COMPANY_ID,'runs',runId,'actors',email);
async function persistStagingRoleCandidateManifest(manifest){assertRoleViewCandidateManifest(manifest);return runTransaction(cloud,async transaction=>{const ref=roleCandidateManifestRef(manifest.runId),snapshot=await transaction.get(ref);if(snapshot.exists()){const saved=deepCopy(snapshot.data());delete saved.persistedAt;delete saved.persistedBy;delete saved.persistedByEmail;assertRoleViewCandidateManifest(saved);if(saved.manifestHash!==manifest.manifestHash)throw new Error('角色候選 manifest 已存在但 identity 衝突');return{kind:'duplicate',manifest:saved}}transaction.set(ref,{...manifest,persistedAt:serverTimestamp(),persistedBy:cloudUid,persistedByEmail:cloudEmailKey},{merge:false});return{kind:'created',manifest}})}
async function persistStagingRoleVerificationReceipt(receipt){assertRoleViewVerificationReceipt(receipt);return runTransaction(cloud,async transaction=>{const ref=roleVerificationReceiptRef(receipt.runId,receipt.email),snapshot=await transaction.get(ref);if(snapshot.exists()){const saved=deepCopy(snapshot.data());delete saved.persistedAt;delete saved.verifiedBy;delete saved.verifiedByEmail;assertRoleViewVerificationReceipt(saved);const identityFields=['runId','sourceHash','manifestHash','email','kind','viewId','viewHash','verifiedViewCount','collectionCount','documentCount','realtimeObserved','directCoreDenied','crossRoleDenied','readTakeover','writeTakeover'];if(identityFields.some(field=>saved[field]!==receipt[field]))throw new Error('角色候選本人憑證已存在但 identity 衝突');return{kind:'duplicate',receipt:saved}}transaction.set(ref,{...receipt,persistedAt:serverTimestamp(),verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey},{merge:false});return{kind:'created',receipt}})}
async function runStagingRoleViewCandidateScenario({failureResume=false}={}){
 const source=await readVerifiedStagingRoleViewCandidateSource(),sourceDb=source.sourceDb,sourceHash=source.sourceHash,views=await buildCurrentRoleViewCandidates(sourceDb);
 if(!views.length)throw new Error('staging 沒有可驗證的現行角色');
 if(!/^[a-f0-9]{64}$/.test(sourceHash)||views.some(view=>!/^[a-f0-9]{64}$/.test(view.viewHash)))throw new Error('staging 角色候選必須在寫入前完成 SHA-256');
 const runId=doc(collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs')).id;
 const options={runId,sourceHash,views,batchSize:failureResume?1:400};let interrupted=null;
 if(failureResume){try{await firestoreRoleViewCandidateAdapter({failBatch:2}).writeAndVerify(options)}catch(error){interrupted={blocked:true,completedBatches:Number(error?.completedBatches)||0,completedWrites:Number(error?.completedWrites)||0,error:String(error?.message||error)}}if(!interrupted?.blocked||interrupted.completedBatches!==1||interrupted.completedWrites!==1)throw new Error('staging 角色候選未實際完成第一批後中斷，禁止把本次 run 當成失敗續傳證據')}
 const result=await firestoreRoleViewCandidateAdapter().writeAndVerify(options),viewSummaries=result.plan.views.map(view=>({viewId:view.viewId,email:view.email,kind:view.kind,viewHash:view.viewHash,documentCount:view.documentCount,counts:deepCopy(view.counts)})),manifest=buildVerifiedRoleViewCandidateManifest({environment:'staging',runId,sourceHash,views:viewSummaries,createdAt:new Date().toISOString()});await persistStagingRoleCandidateManifest(manifest);const ownerReceipt=await verifyOwnerStagingRoleViewCandidate({runId});
 const verifiedResult={state:'verified',runId,sourceHash,manifestHash:manifest.manifestHash,viewCount:result.viewCount,documentCount:result.documentCount,writes:result.writes,skippedWrites:result.skippedWrites,interrupted,views:viewSummaries,ownerReceiptHash:ownerReceipt.receiptHash,permissionsSource:'existing-filter-functions',readTakeover:false,writeTakeover:false};document.body.dataset.stagingRoleViewCandidateResult=JSON.stringify(verifiedResult);return verifiedResult;
}
function currentRoleCandidateKind(){if(cloudRole==='teacher'&&cloudCanManageSchedule&&SCHEDULER_ACCOUNT_EMAILS.has(cloudEmailKey))return'scheduler';if(cloudRole==='teacher'&&!cloudCanManageSchedule)return'teacher';if(cloudRole==='branch_manager')return'branch_manager';return''}
async function expectStagingPermissionDenied(operation,label){try{await operation();throw new Error(`${label} 未被拒絕`)}catch(error){if(String(error?.code||'')==='permission-denied'||/permission.?denied|insufficient permissions/i.test(String(error?.message||error)))return true;if(String(error?.message||error)===`${label} 未被拒絕`)throw error;throw new Error(`${label} 無法確認拒絕：${String(error?.message||error)}`)}}
async function verifyOwnStagingRoleViewCandidate({runId,viewId,sourceHash,viewHash,manifestHash,foreignDocumentPath}={}){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||firebaseConfig.projectId!=='danbridge-d8877-staging'||!cloudEmailKey)throw new Error('角色候選本人驗證只允許已登入的 staging 帳號');const kind=currentRoleCandidateKind();if(!kind)throw new Error('目前帳號不是 aa、老師或校區管理者');
 if(!manifestHash||!foreignDocumentPath)throw new Error('角色候選本人驗證缺少 manifest 或跨角色拒絕路徑');
 const documentsByCollection={};for(const collectionId of FULL_RECORD_COLLECTIONS){const base=collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs',runId,'views',viewId,'collections',collectionId,'records'),ownRows=query(base,where('email','==',cloudEmailKey),where('kind','==',kind)),snapshot=await getDocs(ownRows);documentsByCollection[collectionId]=snapshot.docs.map(row=>({id:row.id,data:row.data()}))}
 const verified=verifyOwnRoleViewCandidateReadback({documentsByCollection,runId,sourceHash,viewId,email:cloudEmailKey,kind,viewHash,environment:'staging'},{hashDb:recordDataDigest});
 const realtimeObserved=await new Promise((resolve,reject)=>{let finished=false,unsubscribe=()=>{};const timer=setTimeout(()=>{if(finished)return;finished=true;unsubscribe();reject(new Error('角色候選即時訂閱逾時'))},10000),lessonRows=query(collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs',runId,'views',viewId,'collections','lessons','records'),where('email','==',cloudEmailKey),where('kind','==',kind));unsubscribe=onSnapshot(lessonRows,()=>{if(finished)return;finished=true;clearTimeout(timer);unsubscribe();resolve(true)},error=>{if(finished)return;finished=true;clearTimeout(timer);unsubscribe();reject(error)})});
 const directCoreDenied=await expectStagingPermissionDenied(()=>getDoc(doc(cloud,'stagingFullRecordShadows',COMPANY_ID,'collections','lessons','records','role-test-probe')),'核心逐筆直接讀取');
 const segments=String(foreignDocumentPath).split('/').filter(Boolean);if(segments.length!==10||segments[0]!=='stagingRoleViewCandidates'||segments[1]!==COMPANY_ID||segments[2]!=='runs'||segments[3]!==runId||segments[4]!=='views'||segments[6]!=='collections'||segments[8]!=='records')throw new Error('跨角色驗證路徑無效');const crossRoleDenied=await expectStagingPermissionDenied(()=>getDoc(doc(cloud,...segments)),'跨角色候選讀取'),testedAt=new Date().toISOString(),receipt=buildRoleViewVerificationReceipt({environment:'staging',runId,sourceHash,manifestHash,email:cloudEmailKey,kind,viewId,viewHash,verifiedViewCount:1,documentCount:verified.documentCount,realtimeObserved,directCoreDenied,crossRoleDenied,testedAt}),persisted=await persistStagingRoleVerificationReceipt(receipt);
 const result={state:'verified',runId,viewId,sourceHash,viewHash,manifestHash,email:cloudEmailKey,kind,collectionCount:verified.collectionCount,documentCount:verified.documentCount,realtimeObserved,directCoreDenied,crossRoleDenied,receiptHash:persisted.receipt.receiptHash,receiptKind:persisted.kind,readTakeover:false,writeTakeover:false,verifiedAt:persisted.receipt.testedAt};document.body.dataset.stagingOwnRoleCandidateResult=JSON.stringify(result);return result;
}
async function verifyOwnerStagingRoleViewCandidate({runId}={}){
 stagingRoleViewCandidateGuard();const manifestSnapshot=await getDoc(roleCandidateManifestRef(runId));if(!manifestSnapshot.exists())throw new Error('找不到角色候選 manifest');const manifest=deepCopy(manifestSnapshot.data());delete manifest.persistedAt;delete manifest.persistedBy;delete manifest.persistedByEmail;assertRoleViewCandidateManifest(manifest);let verifiedDocuments=0;
 for(const view of manifest.views){const documentsByCollection={};for(const collectionId of FULL_RECORD_COLLECTIONS){const snapshot=await getDocs(collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs',runId,'views',view.viewId,'collections',collectionId,'records'));documentsByCollection[collectionId]=snapshot.docs.map(row=>({id:row.id,data:row.data()}))}const verified=verifyOwnRoleViewCandidateReadback({documentsByCollection,runId,sourceHash:manifest.sourceHash,viewId:view.viewId,email:view.email,kind:view.kind,viewHash:view.viewHash,environment:'staging'},{hashDb:recordDataDigest});verifiedDocuments+=verified.documentCount}
 if(verifiedDocuments!==manifest.documentCount)throw new Error('Owner 角色候選讀回總筆數不一致');const source=await readVerifiedStagingRoleViewCandidateSource();if(source.sourceHash!==manifest.sourceHash)throw new Error('Owner 角色候選與目前 sealed 全資料版本不一致');const first=manifest.views[0],realtimeObserved=await new Promise((resolve,reject)=>{let finished=false,unsubscribe=()=>{};const timer=setTimeout(()=>{if(finished)return;finished=true;unsubscribe();reject(new Error('Owner 角色候選即時訂閱逾時'))},10000);unsubscribe=onSnapshot(collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs',runId,'views',first.viewId,'collections','lessons','records'),()=>{if(finished)return;finished=true;clearTimeout(timer);unsubscribe();resolve(true)},error=>{if(finished)return;finished=true;clearTimeout(timer);unsubscribe();reject(error)})}),testedAt=new Date().toISOString(),receipt=buildRoleViewVerificationReceipt({environment:'staging',runId,sourceHash:manifest.sourceHash,manifestHash:manifest.manifestHash,email:cloudEmailKey,kind:'owner',viewHash:manifest.manifestHash,verifiedViewCount:manifest.viewCount,documentCount:manifest.documentCount,realtimeObserved,directCoreDenied:false,crossRoleDenied:false,testedAt}),persisted=await persistStagingRoleVerificationReceipt(receipt);return{state:'verified',runId,manifestHash:manifest.manifestHash,email:cloudEmailKey,kind:'owner',viewCount:manifest.viewCount,documentCount:manifest.documentCount,realtimeObserved,receiptHash:persisted.receipt.receiptHash,receiptKind:persisted.kind,readTakeover:false,writeTakeover:false};
}
function installStagingRoleVerificationButton({id,label,run}){let installed=false;const timer=setInterval(()=>{if(installed||!cloudRole)return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id=id;button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:36px;z-index:10002;max-width:min(720px,calc(100vw - 36px));white-space:normal';button.textContent=label;button.onclick=async()=>{button.disabled=true;button.textContent='逐筆讀回、即時監聽與權限拒絕驗證中…';try{const result=await run();button.textContent=`憑證完成 ${result.receiptHash}`;button.className='btn ok'}catch(error){button.disabled=false;button.textContent=`已阻擋：${String(error?.message||error).slice(0,120)}`;button.className='btn danger';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeRunStagingRoleViewCandidate=runStagingRoleViewCandidateScenario;
 window.__danbridgeAuditStagingRoleViewCandidateSource=auditStagingRoleViewCandidateSource;
 window.__danbridgeVerifyOwnStagingRoleViewCandidate=verifyOwnStagingRoleViewCandidate;
 window.__danbridgeVerifyOwnerStagingRoleViewCandidate=verifyOwnerStagingRoleViewCandidate;
 const roleViewCandidateTest=new URLSearchParams(location.search).get('roleViewCandidateTest');
 if(roleViewCandidateTest)installStagingMigrationActionButton({id:'stagingRoleViewCandidateButton',label:'建立並驗證 staging 角色逐筆候選',runningLabel:'逐角色寫入、失敗續傳、完整讀回與 Owner 憑證驗證中…',run:()=>runStagingRoleViewCandidateScenario({failureResume:roleViewCandidateTest==='failure-resume'}),successLabel:result=>`角色候選已封存 ${result.viewCount} 個角色｜run ${result.runId}`});
 const roleViewCandidateAudit=new URLSearchParams(location.search).get('roleViewCandidateAudit');if(roleViewCandidateAudit)installStagingMigrationActionButton({id:'stagingRoleViewCandidateAuditButton',label:'唯讀稽核 staging 16 集合候選',runningLabel:'唯讀核對版本、缺筆、多筆、內容與來源雜湊中…',run:auditStagingRoleViewCandidateSource,successLabel:result=>result.state==='ready'?'唯讀稽核通過｜候選可建立':`唯讀稽核已阻擋｜差異 ${result.totals.missing+result.totals.extra+result.totals.changed+result.totals.formatErrors} 筆`});
 const verificationParams=new URLSearchParams(location.search),ownerRun=verificationParams.get('recordSyncOwnerVerify'),ownRun=verificationParams.get('recordSyncRoleVerify');if(ownerRun)installStagingRoleVerificationButton({id:'stagingOwnerRoleVerificationButton',label:'驗證 Owner 全部角色候選並建立不可變憑證',run:()=>verifyOwnerStagingRoleViewCandidate({runId:ownerRun})});if(ownRun)installStagingRoleVerificationButton({id:'stagingOwnRoleVerificationButton',label:'驗證本帳號 16 集合、即時監聽與跨角色拒絕',run:()=>verifyOwnStagingRoleViewCandidate({runId:ownRun,viewId:verificationParams.get('recordSyncRoleView'),sourceHash:verificationParams.get('recordSyncRoleSource'),viewHash:verificationParams.get('recordSyncRoleViewHash'),manifestHash:verificationParams.get('recordSyncRoleManifest'),foreignDocumentPath:verificationParams.get('recordSyncRoleForeign')})});
}
async function runProductionRoleViewCandidate(expectedSourceHash){
 const {sourceDb,sourceHash}=await readVerifiedProductionLegacySource(expectedSourceHash);
 const views=await buildCurrentRoleViewCandidates(sourceDb),runId=doc(collection(cloud,'productionRoleViewCandidates',COMPANY_ID,'runs')).id;
 if(!views.length)throw new Error('production 沒有可驗證的現行角色');
 const result=await firestoreRoleViewCandidateAdapter().writeAndVerify({runId,sourceHash,views,batchSize:400});
 return{state:'verified',runId,sourceHash,viewCount:result.viewCount,documentCount:result.documentCount,writes:result.writes,skippedWrites:result.skippedWrites,permissionsSource:'existing-filter-functions',readTakeover:false};
}
if(DANBRIDGE_ENVIRONMENT==='production'){
 const expectedProductionRoleHash=new URLSearchParams(location.search).get('productionRoleViewCandidate');
 if(expectedProductionRoleHash){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='productionRoleViewCandidateButton';button.type='button';button.className='btn danger';button.style.cssText='position:fixed;right:18px;bottom:204px;z-index:10002';button.textContent='建立 production 角色逐筆候選';button.onclick=async()=>{button.disabled=true;button.textContent='production 角色候選寫入與讀回中…';try{const result=await runProductionRoleViewCandidate(expectedProductionRoleHash);document.body.dataset.productionRoleViewCandidateResult=JSON.stringify(result);button.textContent=`角色候選通過 ${result.viewCount} 個角色`;button.className='btn ok'}catch(error){document.body.dataset.productionRoleViewCandidateResult=JSON.stringify({state:'blocked',error:String(error?.message||error),readTakeover:false});button.disabled=false;button.textContent='角色候選失敗，未切換讀取';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
}
async function runStagingAtomicRecordActivation({auditFailures=false}={}){
 stagingRecordShadowGuard();
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),mainSnapshot=await getDoc(mainRef);
 if(!mainSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('staging 雲端主資料不存在');
 const sourceDb=deepCopy(mainSnapshot.data().db),sourceHash=dataHash(sourceDb),storedSourceHash=String(mainSnapshot.data()?.clientHash||'');
 if(!storedSourceHash||storedSourceHash!==sourceHash)throw new Error(`staging 雲端主資料 hash 不一致：內容 ${sourceHash}，標記 ${storedSourceHash||'—'}`);
 const fullAdapter=firestoreFullRecordShadowAdapter();
 await fullAdapter.synchronize(sourceDb,{sourceHash,batchSize:400});
 const fullResult=await fullAdapter.verifyCandidate(sourceDb,{sourceHash});
 document.body.dataset.stagingAtomicFullCounts=JSON.stringify({collectionCount:fullResult.collectionCount,documentCount:fullResult.documentCount,activeCount:fullResult.activeCount,tombstoneCount:fullResult.tombstoneCount});
 const views=await buildCurrentRoleViewCandidates(sourceDb),roleRunId=doc(collection(cloud,'stagingRoleViewCandidates',COMPANY_ID,'runs')).id;
 if(!views.length)throw new Error('staging 沒有可驗證的現行角色');
 const roleResult=await firestoreRoleViewCandidateAdapter().writeAndVerify({runId:roleRunId,sourceHash,views,batchSize:400});
 const fullManifestId=doc(collection(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests')).id,roleManifestId=doc(collection(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests')).id;
 const fullManifest=buildFullRecordCandidateManifest({environment:'staging',manifestId:fullManifestId,sourceHash,collectionCount:fullResult.collectionCount,documentCount:fullResult.documentCount,activeCount:fullResult.activeCount,tombstoneCount:fullResult.tombstoneCount});
 const roleManifest=buildLegacyRoleViewCandidateManifest({environment:'staging',manifestId:roleManifestId,runId:roleRunId,sourceHash,viewCount:roleResult.viewCount,documentCount:roleResult.documentCount});
 const activation=buildAtomicRecordActivation({environment:'staging',fullManifest,roleManifest,currentSourceHash:sourceHash});
 const fullRef=doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',fullManifestId),roleRef=doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',roleManifestId),controlRef=doc(cloud,'stagingRecordActivationControls',COMPANY_ID);
 const audit={};
 if(auditFailures){
  try{await setDoc(controlRef,{...activation,activatedAt:serverTimestamp(),activatedBy:cloudUid,activatedByEmail:cloudEmailKey},{merge:false});audit.interrupted=false}catch{audit.interrupted=true}
  await runTransaction(cloud,async transaction=>{const main=await transaction.get(mainRef);if(String(main.data()?.clientHash||'')!==sourceHash)throw new Error('staging 主資料版本已改變');transaction.set(fullRef,{...fullManifest,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});transaction.set(roleRef,{...roleManifest,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false})});
  for(const [name,changed] of Object.entries({version:{sourceHash:`${sourceHash}-changed`},missing:{documentCount:Math.max(0,activation.documentCount-1)},extra:{documentCount:activation.documentCount+1},hash:{fullVerifiedHash:'wrong-hash'},role:{roleRunId:'wrong-run'}})){
   try{await setDoc(controlRef,{...activation,...changed,activatedAt:serverTimestamp(),activatedBy:cloudUid,activatedByEmail:cloudEmailKey},{merge:false});audit[name]=false}catch{audit[name]=true}
  }
 }
 await runTransaction(cloud,async transaction=>{
  const [main,full,role]=await Promise.all([transaction.get(mainRef),transaction.get(fullRef),transaction.get(roleRef)]);
  if(String(main.data()?.clientHash||'')!==sourceHash)throw new Error('staging 主資料版本已改變');
  if(auditFailures&&(!full.exists()||!role.exists()))throw new Error('staging manifest 中斷後缺失');
  if(!auditFailures){transaction.set(fullRef,{...fullManifest,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});transaction.set(roleRef,{...roleManifest,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false})}
  transaction.set(controlRef,{...activation,activatedAt:serverTimestamp(),activatedBy:cloudUid,activatedByEmail:cloudEmailKey},{merge:false});
 });
 const [savedFull,savedRole,savedControl]=await Promise.all([getDoc(fullRef),getDoc(roleRef),getDoc(controlRef)]),evaluation=evaluateAtomicRecordActivation({activation:savedControl.data(),fullManifest:savedFull.data(),roleManifest:savedRole.data(),currentSourceHash:sourceHash});
 if(!evaluation.eligible)throw new Error(`staging 原子控制讀回失敗：${evaluation.reason}`);
 return{state:'verified',sourceHash,fullManifestId,roleManifestId,roleRunId,collectionCount:activation.collectionCount,documentCount:activation.documentCount,activeCount:activation.activeCount,tombstoneCount:activation.tombstoneCount,viewCount:activation.viewCount,roleDocumentCount:activation.roleDocumentCount,audit,readTakeover:false,writeTakeover:false};
}
async function verifyStagingAtomicRecordActivationReadback(){
 stagingRecordShadowGuard();
 const controlRef=doc(cloud,'stagingRecordActivationControls',COMPANY_ID),mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),[controlSnapshot,mainSnapshot]=await Promise.all([getDoc(controlRef),getDoc(mainRef)]);
 if(!controlSnapshot.exists()||!mainSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('staging 原子控制或主資料不存在');
 const activation=controlSnapshot.data(),fullManifestId=String(activation.fullManifestId||''),roleManifestId=String(activation.roleManifestId||'');
 if(!fullManifestId||!roleManifestId)throw new Error('staging 原子控制缺少 manifest identity');
 const [fullSnapshot,roleSnapshot]=await Promise.all([getDoc(doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',fullManifestId)),getDoc(doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',roleManifestId))]);
 if(!fullSnapshot.exists()||!roleSnapshot.exists())throw new Error('staging 原子控制 manifest 缺失');
 const contentHash=dataHash(mainSnapshot.data().db),storedHash=String(mainSnapshot.data()?.clientHash||'');
 if(!storedHash||contentHash!==storedHash)throw new Error('staging 雲端主資料 hash 不一致');
 const evaluation=evaluateAtomicRecordActivation({activation,fullManifest:fullSnapshot.data(),roleManifest:roleSnapshot.data(),currentSourceHash:storedHash});
 if(!evaluation.eligible)throw new Error(`staging 原子控制讀回失敗：${evaluation.reason}`);
 return{state:'verified',sourceHash:storedHash,fullManifestId,roleManifestId,roleRunId:activation.roleRunId,documentCount:activation.documentCount,viewCount:activation.viewCount,roleDocumentCount:activation.roleDocumentCount,writes:0,readTakeover:false,writeTakeover:false};
}
async function runStagingRecordReadTakeoverExercise({auditFailures=false}={}){
 stagingRecordShadowGuard();
 const controlRef=doc(cloud,'stagingRecordActivationControls',COMPANY_ID),mainRef=doc(cloud,'companies',COMPANY_ID,'data','main');
 const [controlSnapshot,mainSnapshot]=await Promise.all([getDoc(controlRef),getDoc(mainRef)]);
 if(!controlSnapshot.exists()||!mainSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('staging 原子控制或 legacy 主資料不存在');
 const activation=controlSnapshot.data(),legacyDb=deepCopy(mainSnapshot.data().db),legacyHash=String(mainSnapshot.data()?.clientHash||'');
 if(!legacyHash||dataHash(legacyDb)!==legacyHash)throw new Error('staging legacy 主資料內容與 hash 不一致');
 const [fullSnapshot,roleSnapshot]=await Promise.all([getDoc(doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',String(activation.fullManifestId||''))),getDoc(doc(cloud,'stagingRecordCandidateManifests',COMPANY_ID,'manifests',String(activation.roleManifestId||'')))]);
 if(!fullSnapshot.exists()||!roleSnapshot.exists())throw new Error('staging verified manifest 缺失');
 const evaluation=evaluateAtomicRecordActivation({activation,fullManifest:fullSnapshot.data(),roleManifest:roleSnapshot.data(),currentSourceHash:legacyHash});
 const candidate=await firestoreFullRecordShadowAdapter().verifyCandidate(legacyDb,{sourceHash:legacyHash});
 const recordHash=dataHash(candidate.db),decision=decideRecordReadTakeover({environment:DANBRIDGE_ENVIRONMENT,activationEvaluation:evaluation,legacyHash,recordHash,recordDb:candidate.db,exercise:true});
 if(decision.source!=='records')throw new Error(`staging 逐筆讀取演練拒絕：${decision.reason}`);
 const beforeHash=dataHash(window.__danbridgeGetDB?.());applyingCloud=true;
 try{window.__danbridgeSetDB(deepCopy(decision.db));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();requestAnimationFrame(()=>window.renderDashboard?.())}finally{applyingCloud=false}
 const appliedHash=dataHash(window.__danbridgeGetDB?.());if(appliedHash!==legacyHash)throw new Error('staging 逐筆資料套用畫面後 hash 不一致');
 const audit={};if(auditFailures){const scenarios={interrupted:{eligible:false,reason:'manifest 中斷'},version:evaluation,missing:evaluation,extra:evaluation,hash:evaluation};for(const [name,scenarioEvaluation] of Object.entries(scenarios)){const changedHash=['version','hash'].includes(name)?`wrong-${name}`:legacyHash,changedDb=['missing','extra'].includes(name)?null:candidate.db,blocked=decideRecordReadTakeover({environment:'staging',activationEvaluation:scenarioEvaluation,legacyHash,recordHash:changedHash,recordDb:changedDb,exercise:true});audit[name]=blocked.source==='legacy'}if(Object.values(audit).some(value=>value!==true))throw new Error('staging 逐筆讀取 fail-closed 情境未全部拒絕')}
 return{state:'verified',source:'records',sourceHash:legacyHash,beforeHash,appliedHash,collectionCount:candidate.collectionCount,documentCount:candidate.documentCount,activeCount:candidate.activeCount,tombstoneCount:candidate.tombstoneCount,audit,writes:0,automaticReadTakeover:false,writeTakeover:false};
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeRunStagingAtomicRecordActivation=runStagingAtomicRecordActivation;
 window.__danbridgeVerifyStagingAtomicRecordActivationReadback=verifyStagingAtomicRecordActivationReadback;
 const atomicActivationTest=new URLSearchParams(location.search).get('atomicActivationTest');
 if(atomicActivationTest){let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);try{document.body.dataset.stagingAtomicActivationResult=JSON.stringify(await runStagingAtomicRecordActivation({auditFailures:atomicActivationTest==='failures'}))}catch(error){document.body.dataset.stagingAtomicActivationResult=JSON.stringify({state:'blocked',error:String(error?.message||error),readTakeover:false,writeTakeover:false})}},200)}
 const atomicActivationReadback=new URLSearchParams(location.search).get('atomicActivationReadback');
 if(atomicActivationReadback){let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);try{document.body.dataset.stagingAtomicActivationReadback=JSON.stringify(await verifyStagingAtomicRecordActivationReadback())}catch(error){document.body.dataset.stagingAtomicActivationReadback=JSON.stringify({state:'blocked',error:String(error?.message||error),writes:0,readTakeover:false,writeTakeover:false})}},200)}
 window.__danbridgeRunStagingRecordReadTakeoverExercise=runStagingRecordReadTakeoverExercise;
 const recordReadTakeoverTest=new URLSearchParams(location.search).get('recordReadTakeoverTest');
 if(recordReadTakeoverTest){let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);try{document.body.dataset.stagingRecordReadTakeoverResult=JSON.stringify(await runStagingRecordReadTakeoverExercise({auditFailures:recordReadTakeoverTest==='failures'}))}catch(error){document.body.dataset.stagingRecordReadTakeoverResult=JSON.stringify({state:'blocked',error:String(error?.message||error),writes:0,automaticReadTakeover:false,writeTakeover:false})}},200)}
}
async function runProductionFullRecordCandidateVerification(expectedSourceHash){
 const {sourceDb:targetDb,sourceHash}=await readVerifiedProductionLegacySource(expectedSourceHash);
 const recordCandidate=await firestoreFullRecordShadowAdapter().verifyCandidate(targetDb,{sourceHash}),roleViews=await auditProductionRoleViews(targetDb),eligible=recordCandidate.candidateVerified===true&&roleViews.verified===true;
 const result={state:eligible?'eligible':'blocked',sourceHash,sourceSha256:sha256Canonical(targetDb),recordDataHash:recordDataHash(recordCandidate.db),collectionCount:recordCandidate.collectionCount,documentCount:recordCandidate.documentCount,activeCount:recordCandidate.activeCount,tombstoneCount:recordCandidate.tombstoneCount,recordCandidateVerified:true,roleViews,eligible,readTakeover:false,writes:0};
 document.body.dataset.productionFullRecordCandidateState=result.state;document.body.dataset.productionFullRecordCandidateResult=JSON.stringify(result);return result;
}
async function activateProductionRecordRuntime(expectedSourceHash){
 productionFullRecordMigrationGuard();
 const verified=await runProductionFullRecordCandidateVerification(expectedSourceHash);
 if(!verified.eligible||verified.collectionCount!==FULL_RECORD_COLLECTIONS.length||verified.documentCount!==verified.activeCount+verified.tombstoneCount||!verified.roleViews?.verified||verified.roleViews.total<1)throw new Error('production 啟用前的逐筆或角色證據不完整');
 const activatedAt=new Date().toISOString(),activationEpoch=`production-${APP_RELEASE.replaceAll('.','-')}-${crypto.randomUUID().replaceAll('-','')}`,control=buildProductionRecordRuntimeControl({activationEpoch,legacyVersionHash:verified.sourceHash,recordDataHash:verified.recordDataHash,sourceSha256:verified.sourceSha256,documentCount:verified.documentCount,activeCount:verified.activeCount,tombstoneCount:verified.tombstoneCount,roleViewDigest:verified.roleViews.roleViewDigest,rollbackChannel:'rollback-pre-v2-20260901',activatedAt}),safety=buildProductionRecordRuntimeSafety({control,updatedAt:activatedAt}),mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),controlRef=doc(cloud,'companies',COMPANY_ID,'productionRecordRuntime','control'),safetyRef=doc(cloud,'companies',COMPANY_ID,'productionRecordRuntime','safety');
 const transactionResult=await runTransaction(cloud,async transaction=>{
  const [mainSnapshot,controlSnapshot,safetySnapshot]=await Promise.all([transaction.get(mainRef),transaction.get(controlRef),transaction.get(safetyRef)]);
  if(!mainSnapshot.exists()||!mainSnapshot.data()?.db||String(mainSnapshot.data()?.clientHash||'')!==verified.sourceHash||dataHash(mainSnapshot.data().db)!==verified.sourceHash||sha256Canonical(mainSnapshot.data().db)!==verified.sourceSha256)throw new Error('production 主資料在啟用前已改變');
  if(controlSnapshot.exists()||safetySnapshot.exists()){
   if(!controlSnapshot.exists()||!safetySnapshot.exists())throw new Error('production runtime 控制只存在一半，禁止補寫');
   const existingControl=assertProductionRecordRuntimeControl(controlSnapshot.data()),rawSafety=safetySnapshot.data();
   if(existingControl.legacyVersionHash!==verified.sourceHash||existingControl.recordDataHash!==verified.recordDataHash||existingControl.sourceSha256!==verified.sourceSha256||existingControl.roleViewDigest!==verified.roleViews.roleViewDigest)throw new Error('production runtime 已存在但證據不一致');
   try{const existingSafety=assertProductionRecordRuntimeSafety(rawSafety,{activationEpoch:existingControl.activationEpoch});if(existingSafety.state!=='active'||existingSafety.recordDataHash!==verified.recordDataHash||existingSafety.documentCount!==verified.documentCount||existingSafety.activeCount!==verified.activeCount||existingSafety.tombstoneCount!==verified.tombstoneCount)throw new Error('production runtime head 已存在但證據不一致');return{kind:'duplicate',activationEpoch:existingControl.activationEpoch,activationHash:existingControl.activationHash}}
   catch(error){assertLegacyProductionRecordRuntimeSafety(rawSafety,{activationEpoch:existingControl.activationEpoch,activationHash:existingControl.activationHash});const upgradedSafety=buildProductionRecordRuntimeSafety({control:existingControl,updatedAt:rawSafety.updatedAt}),upgradeAudit={persistedAt:serverTimestamp(),updatedBy:cloudUid,updatedByEmail:cloudEmailKey};transaction.set(safetyRef,{...upgradedSafety,...upgradeAudit},{merge:false});return{kind:'upgraded-safety',activationEpoch:existingControl.activationEpoch,activationHash:existingControl.activationHash}}
  }
  const audit={persistedAt:serverTimestamp(),activatedBy:cloudUid,activatedByEmail:cloudEmailKey};transaction.set(controlRef,{...control,...audit},{merge:false});transaction.set(safetyRef,{...safety,...audit},{merge:false});return{kind:'created',activationEpoch:control.activationEpoch,activationHash:control.activationHash};
 });
 const [savedControlSnapshot,savedSafetySnapshot,mainAfterSnapshot]=await Promise.all([getDocFromServer(controlRef),getDocFromServer(safetyRef),getDocFromServer(mainRef)]),savedControl=assertProductionRecordRuntimeControl(savedControlSnapshot.data()),savedSafety=assertProductionRecordRuntimeSafety(savedSafetySnapshot.data(),{activationEpoch:savedControl.activationEpoch});
 if(savedControl.legacyVersionHash!==verified.sourceHash||savedControl.recordDataHash!==verified.recordDataHash||savedControl.sourceSha256!==verified.sourceSha256||savedControl.roleViewDigest!==verified.roleViews.roleViewDigest||savedSafety.state!=='active'||!mainAfterSnapshot.exists()||String(mainAfterSnapshot.data()?.clientHash||'')!==verified.sourceHash||dataHash(mainAfterSnapshot.data()?.db)!==verified.sourceHash)throw new Error('production runtime 啟用讀回驗證失敗');
 const result={state:'active',kind:transactionResult.kind,activationEpoch:savedControl.activationEpoch,activationHash:savedControl.activationHash,sourceHash:verified.sourceHash,recordDataHash:verified.recordDataHash,documentCount:verified.documentCount,activeCount:verified.activeCount,tombstoneCount:verified.tombstoneCount,roleCount:verified.roleViews.total,controlWrites:transactionResult.kind==='created'?1:0,safetyWrites:transactionResult.kind==='created'||transactionResult.kind==='upgraded-safety'?1:0,recordWrites:0,legacyMainWrites:0,productionTouched:true,deployTouched:false,timeMachineTouched:false,rollbackChannel:savedControl.rollbackChannel};document.body.dataset.productionRecordActivationResult=JSON.stringify(result);return result;
}
if(DANBRIDGE_ENVIRONMENT==='production'){
 window.__danbridgeActivateProductionRecordRuntime=activateProductionRecordRuntime;
 const productionParams=new URLSearchParams(location.search),expectedProductionCandidateHash=productionParams.get('productionFullRecordVerify'),expectedProductionActivationHash=productionParams.get('productionRecordActivate');
 if(expectedProductionCandidateHash){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='productionFullRecordCandidateButton';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:92px;z-index:10002';button.textContent='唯讀驗證 production 候選';button.onclick=async()=>{button.disabled=true;button.textContent='唯讀核對逐筆集合與角色檢視中…';try{const result=await runProductionFullRecordCandidateVerification(expectedProductionCandidateHash);button.textContent=result.eligible?`候選通過 ${result.activeCount} 筆`:`候選阻擋：角色檢視 ${result.roleViews.issueCount} 筆不一致`;button.className=result.eligible?'btn ok':'btn danger'}catch(error){button.disabled=false;button.textContent='候選驗證失敗，未切換讀取';document.body.dataset.productionFullRecordCandidateState='failed';document.body.dataset.productionFullRecordCandidateResult=JSON.stringify({state:'failed',eligible:false,readTakeover:false,writes:0,error:String(error?.message||error).slice(0,500)});cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
 if(expectedProductionActivationHash){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='productionRecordActivationButton';button.type='button';button.className='btn danger';button.style.cssText='position:fixed;right:18px;bottom:260px;z-index:10002;max-width:min(760px,calc(100vw - 36px));white-space:normal';button.textContent='啟用 production 正式逐筆同步';button.onclick=async()=>{button.disabled=true;button.textContent='重新核對全部資料、角色與回滾證據後原子啟用中…';try{const result=await activateProductionRecordRuntime(expectedProductionActivationHash);button.textContent=`正式逐筆同步已啟用｜${result.activeCount} 筆｜${result.roleCount} 個角色`;button.className='btn ok'}catch(error){document.body.dataset.productionRecordActivationResult=JSON.stringify({state:'blocked',error:String(error?.message||error),controlWrites:0,recordWrites:0,legacyMainWrites:0,timeMachineTouched:false});button.disabled=false;button.textContent='正式啟用已阻擋，原資料未覆蓋';button.className='btn danger';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 const stagingFullRecordCandidateHash=new URLSearchParams(location.search).get('fullRecordCandidateTest');
 if(stagingFullRecordCandidateHash){let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);const targetDb=deepCopy(window.__danbridgeGetDB?.()),actualSourceHash=dataHash(targetDb),sourceHash=stagingFullRecordCandidateHash==='current'?actualSourceHash:stagingFullRecordCandidateHash;try{if(sourceHash!==actualSourceHash)throw new Error(`staging 候選來源不符：預期 ${sourceHash}，實際 ${actualSourceHash}`);const result=await firestoreFullRecordShadowAdapter().verifyCandidate(targetDb,{sourceHash});document.body.dataset.stagingFullRecordCandidateResult=JSON.stringify({state:'verified',sourceHash,collectionCount:result.collectionCount,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,activeSourceHashCount:result.activeSourceHashCount,matchingSourceHashCount:result.matchingSourceHashCount,distinctSourceHashCount:result.distinctSourceHashCount,candidateVerified:true,writes:0,readTakeover:false})}catch(error){document.body.dataset.stagingFullRecordCandidateResult=JSON.stringify({state:'blocked',writes:0,readTakeover:false,error:String(error?.message||error).slice(0,500)})}},200)}
}

function expectedLegacyRecordShadowRunCounts(current,targetDb){
	let documentCount=0,activeCount=0;
	for(const collectionName of ['lessons','students','teachers']){
		const ids=new Set(Object.keys(current?.revisions?.[collectionName]||{}));
  for(const row of targetDb?.[collectionName]||[])ids.add(String(row.id));
  documentCount+=ids.size;activeCount+=(targetDb?.[collectionName]||[]).length;
 }
 return{documentCount,activeCount,tombstoneCount:documentCount-activeCount};
}

async function createVerifiedStagingRecordShadowRun(targetDb,{interrupt=false,readbackMutation}={}){
	stagingRecordShadowGuard();
	const adapter=firestoreFullRecordShadowAdapter(),current=await adapter.read(),identity=buildFullRecordShadowRunIdentity(targetDb,current,{hashTargetDb:dataHash,hashCanonicalDb:dataHash}),runRef=doc(collection(cloud,'stagingRecordShadowRuns',COMPANY_ID,'runs'));
	const {sourceHash,coreHash,documentCount,activeCount,tombstoneCount}=identity;
	const manifest=buildRecordShadowRunManifest({runId:runRef.id,sourceHash,coreHash,documentCount,activeCount,tombstoneCount});
	await setDoc(runRef,{...manifest,companyId:COMPANY_ID,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});
	if(interrupt)return{runId:runRef.id,manifest,interrupted:true};
	const result=await adapter.synchronize(targetDb,{sourceHash});
	const readbackSync=extractFullRecordShadowSyncResult(result);
	const readbackState=canonicalRecordShadowCore(readbackSync.db);
	let readback={runId:runRef.id,sourceHash,coreHash:dataHash(readbackState),documentCount:readbackSync.documentCount,activeCount:readbackSync.activeCount,tombstoneCount:readbackSync.tombstoneCount};
	if(typeof readbackMutation==='function')readback=readbackMutation({...readback});
	const verified=verifyRecordShadowRun(manifest,readback);
	await setDoc(runRef,{state:'verified',verifiedHash:verified.verifiedHash,verifiedAt:serverTimestamp(),verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey},{merge:true});
	return{runId:runRef.id,manifest:verified,result};
}

async function createVerifiedLegacyStagingRecordShadowRun(targetDb,{interrupt=false,readbackMutation}={}){
 stagingRecordShadowGuard();
 const adapter=firestoreRecordShadowAdapter(),current=await adapter.readState(),sourceHash=dataHash(targetDb),coreHash=dataHash(canonicalLegacyRecordShadowCore(targetDb)),runRef=doc(collection(cloud,'stagingRecordShadowRuns',COMPANY_ID,'runs'));
 const manifest=buildRecordShadowRunManifest({runId:runRef.id,sourceHash,coreHash,...expectedLegacyRecordShadowRunCounts(current,targetDb)});
 await setDoc(runRef,{...manifest,companyId:COMPANY_ID,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});
 if(interrupt)return{runId:runRef.id,manifest,interrupted:true};
 const result=await adapter.synchronize(targetDb,{sourceHash});
 let readback={runId:runRef.id,sourceHash,coreHash:dataHash(canonicalLegacyRecordShadowCore(result.state.db)),documentCount:result.activeCount+result.tombstoneCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount};
 if(typeof readbackMutation==='function')readback=readbackMutation({...readback});
 const verified=verifyRecordShadowRun(manifest,readback);
 await setDoc(runRef,{state:'verified',verifiedHash:verified.verifiedHash,verifiedAt:serverTimestamp(),verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey},{merge:true});
 return{runId:runRef.id,manifest:verified,result};
}
async function activateVerifiedStagingRecordShadowRun(runId,{forceRulesVersionCheck=false}={}){
 stagingRecordShadowGuard();
 const runRef=doc(cloud,'stagingRecordShadowRuns',COMPANY_ID,'runs',runId),mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),controlRef=doc(cloud,'stagingRecordShadowControls',COMPANY_ID);
 return runTransaction(cloud,async transaction=>{
  const [runSnap,mainSnap]=await Promise.all([transaction.get(runRef),transaction.get(mainRef)]);
  if(!runSnap.exists()||!mainSnap.exists())throw new Error('run 或主資料不存在，禁止啟用');
  const run=runSnap.data(),currentSourceHash=forceRulesVersionCheck?run.sourceHash:String(mainSnap.data()?.clientHash||'');
  const activation=buildRecordShadowActivation(run,{currentSourceHash});
  transaction.set(controlRef,{...activation,companyId:COMPANY_ID,activatedAt:serverTimestamp(),activatedBy:cloudUid,activatedByEmail:cloudEmailKey},{merge:false});
  return activation;
 });
}
async function runStagingRecordShadowRunScenario(){
 stagingRecordShadowGuard();
 const target=deepCopy(window.__danbridgeGetDB?.()),results={};
 const interrupted=await createVerifiedLegacyStagingRecordShadowRun(target,{interrupt:true});results.interrupted={runId:interrupted.runId,blocked:false};
 try{await activateVerifiedStagingRecordShadowRun(interrupted.runId,{forceRulesVersionCheck:true})}catch{results.interrupted.blocked=true}
 for(const [name,readbackMutation] of [
  ['missing',value=>({...value,documentCount:value.documentCount-1,activeCount:Math.max(0,value.activeCount-1)})],
  ['extra',value=>({...value,documentCount:value.documentCount+1,tombstoneCount:value.tombstoneCount+1})],
  ['hashMismatch',value=>({...value,sourceHash:value.sourceHash+'-mismatch'})],
  ['coreHashMismatch',value=>({...value,coreHash:value.coreHash+'-mismatch'})]
 ]){
   try{await createVerifiedLegacyStagingRecordShadowRun(target,{readbackMutation});results[name]={blocked:false}}
  catch(error){results[name]={blocked:true,error:String(error?.message||error)}}
 }
 const changed=deepCopy(target),versionLessonId='staging-record-run-version-change';changed.lessons=[...(changed.lessons||[]).filter(row=>String(row.id)!==versionLessonId),{id:versionLessonId,name:'STAGING_RECORD_RUN_VERSION_CHANGE'}];
 const stale=await createVerifiedLegacyStagingRecordShadowRun(changed);results.versionChanged={runId:stale.runId,blocked:false};
 try{await activateVerifiedStagingRecordShadowRun(stale.runId,{forceRulesVersionCheck:true})}catch(error){results.versionChanged={...results.versionChanged,blocked:true,error:String(error?.message||error)}}
 const verified=await createVerifiedLegacyStagingRecordShadowRun(target),activation=await activateVerifiedStagingRecordShadowRun(verified.runId);
 const [controlSnap,runSnap,mainSnap,shadowReadback]=await Promise.all([getDoc(doc(cloud,'stagingRecordShadowControls',COMPANY_ID)),getDoc(doc(cloud,'stagingRecordShadowRuns',COMPANY_ID,'runs',verified.runId)),getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),firestoreRecordShadowAdapter().readState()]);
 const candidate=evaluateRecordShadowReadCandidate({activation:controlSnap.data(),run:runSnap.data(),readback:shadowReadback,currentSourceHash:String(mainSnap.data()?.clientHash||''),hashCore:value=>dataHash(canonicalLegacyRecordShadowCore(value))});
 results.success={runId:verified.runId,verified:true,activated:true,candidateEligible:candidate.eligible,candidateReason:candidate.reason,sourceHash:activation.sourceHash,coreHash:activation.coreHash,documentCount:activation.documentCount,activeCount:activation.activeCount,tombstoneCount:activation.tombstoneCount};
 return results;
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeRunStagingRecordShadow=runStagingRecordShadow;
 window.__danbridgeGetStagingRecordShadowDiagnostic=()=>{stagingRecordShadowGuard();return deepCopy(stagingRecordShadowDiagnostic)};
 window.__danbridgeRunStagingRecordShadowRunScenario=runStagingRecordShadowRunScenario;
}
async function runStagingRecordShadowScenario(action){
 stagingRecordShadowGuard();
 const current=await firestoreRecordShadowAdapter().readState(),target=deepCopy(current.db);
 const ids={lesson:'staging-record-writer-lesson',student:'staging-record-writer-student',teacher:'staging-record-writer-teacher'};
 if(action==='inspect')return{action,activeCount:current.activeCount,tombstoneCount:current.tombstoneCount,revisions:{lesson:current.revisions.lessons[ids.lesson]||0,student:current.revisions.students[ids.student]||0,teacher:current.revisions.teachers[ids.teacher]||0},active:{lesson:current.db.lessons.some(row=>row.id===ids.lesson),student:current.db.students.some(row=>row.id===ids.student),teacher:current.db.teachers.some(row=>row.id===ids.teacher)}};
 const upsert=(collection,record)=>{const index=target[collection].findIndex(row=>String(row.id)===String(record.id));if(index<0)target[collection].push(record);else target[collection][index]=record};
 const remove=(collection,id)=>{target[collection]=target[collection].filter(row=>String(row.id)!==id)};
 if(action==='create'){upsert('lessons',{id:ids.lesson,name:'STAGING_RECORD_WRITER_LESSON',testStep:'create'});upsert('students',{id:ids.student,name:'STAGING_RECORD_WRITER_STUDENT',testStep:'create'});upsert('teachers',{id:ids.teacher,name:'STAGING_RECORD_WRITER_TEACHER',testStep:'create'})}
 else if(action==='modify'){upsert('lessons',{id:ids.lesson,name:'STAGING_RECORD_WRITER_LESSON_MODIFIED',testStep:'modify'})}
 else if(action==='tombstone')remove('lessons',ids.lesson);
 else if(action==='revive')upsert('lessons',{id:ids.lesson,name:'STAGING_RECORD_WRITER_LESSON_REVIVED',testStep:'revive'});
 else if(action==='failure-resume'){
  upsert('lessons',{id:ids.lesson,name:'STAGING_RECORD_WRITER_LESSON_RESUMED',testStep:'failure-resume'});upsert('students',{id:ids.student,name:'STAGING_RECORD_WRITER_STUDENT_RESUMED',testStep:'failure-resume'});upsert('teachers',{id:ids.teacher,name:'STAGING_RECORD_WRITER_TEACHER_RESUMED',testStep:'failure-resume'});
  let failedDiagnostic=null;try{await runStagingRecordShadow({targetDb:target,sourceHash:'staging-record-test-failure',batchSize:1,failBatch:2})}catch{failedDiagnostic=deepCopy(stagingRecordShadowDiagnostic)}
  const resumed=await runStagingRecordShadow({targetDb:target,sourceHash:'staging-record-test-resume',batchSize:1});return{action,failedDiagnostic,resumed};
 }else if(action==='cleanup'){remove('lessons',ids.lesson);remove('students',ids.student);remove('teachers',ids.teacher)}
 else throw new Error('未知的 staging record-shadow 測試動作');
 return{action,result:await runStagingRecordShadow({targetDb:target,sourceHash:`staging-record-test-${action}`,batchSize:1})};
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 const stagingRecordTestAction=new URLSearchParams(location.search).get('recordShadowTest');
 if(stagingRecordTestAction){
  let stagingRecordTestStarted=false;const timer=setInterval(async()=>{if(stagingRecordTestStarted||cloudRole!=='owner')return;stagingRecordTestStarted=true;clearInterval(timer);try{const result=await runStagingRecordShadowScenario(stagingRecordTestAction);document.body.dataset.stagingRecordShadowTestResult=JSON.stringify(result)}catch(error){document.body.dataset.stagingRecordShadowTestResult=JSON.stringify({action:stagingRecordTestAction,error:String(error?.message||error),diagnostic:stagingRecordShadowDiagnostic})}},200);
 }
 const stagingRecordRunTest=new URLSearchParams(location.search).get('recordShadowRunTest');
 if(stagingRecordRunTest==='checkpoint-c2'){
  let started=false;const timer=setInterval(async()=>{if(started||cloudRole!=='owner')return;started=true;clearInterval(timer);try{document.body.dataset.stagingRecordShadowRunTestResult=JSON.stringify(await runStagingRecordShadowRunScenario())}catch(error){document.body.dataset.stagingRecordShadowRunTestResult=JSON.stringify({error:String(error?.message||error)})}},200);
 }
}

let stagingMigrationBackupDiagnostic={state:'idle',backupId:'',sourceHash:'',chunkCount:0,recordCount:0,completedChunks:0,verified:false,error:''};
function stagingMigrationBackupGuard(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||firebaseConfig.projectId!=='danbridge-d8877-staging')throw new Error('不可覆寫遷移備份只允許 staging Owner');
}
function setStagingMigrationBackupDiagnostic(next){
 stagingMigrationBackupDiagnostic={...stagingMigrationBackupDiagnostic,...next};
 document.body.dataset.stagingMigrationBackupState=stagingMigrationBackupDiagnostic.state;
}
async function createVerifiedStagingMigrationBackup(){
 stagingMigrationBackupGuard();
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),sourceSnap=await getDoc(mainRef);
 if(!sourceSnap.exists())throw new Error('staging 主資料不存在，禁止建立遷移備份');
 const sourceDb=deepCopy(sourceSnap.data()?.db),sourceHash=String(sourceSnap.data()?.clientHash||'');
 if(!sourceDb||dataHash(sourceDb)!==sourceHash)throw new Error('staging 主資料 clientHash 與內容不符，禁止建立遷移備份');
 const runRef=doc(collection(cloud,'stagingMigrationBackups',COMPANY_ID,'runs'));
 const {plan,chunks}=prepareImmutableMigrationBackup(sourceDb,{backupId:runRef.id,sourceVersionHash:sourceHash});
 setStagingMigrationBackupDiagnostic({state:'writing',backupId:runRef.id,sourceHash,chunkCount:chunks.length,recordCount:plan.recordCount,completedChunks:0,verified:false,error:''});
 try{
  for(let offset=0;offset<chunks.length;offset+=100){
   const batch=chunks.slice(offset,offset+100);
   await runTransaction(cloud,async transaction=>{
    const refs=batch.map(chunk=>doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',runRef.id,'chunks',chunk.chunkId));
    const existing=await Promise.all(refs.map(ref=>transaction.get(ref)));
    const duplicateIndex=existing.findIndex(snapshot=>snapshot.exists());if(duplicateIndex>=0)throw new Error(`不可覆寫備份分片已存在：${batch[duplicateIndex].chunkId}`);
    batch.forEach((chunk,index)=>transaction.set(refs[index],{...chunk,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false}));
   });
   setStagingMigrationBackupDiagnostic({completedChunks:Math.min(offset+batch.length,chunks.length)});
  }
  setStagingMigrationBackupDiagnostic({state:'verifying'});
  const readbackSnap=await getDocs(collection(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',runRef.id,'chunks'));
  const readback=verifyImmutableMigrationBackupReadback(plan,readbackSnap.docs.map(row=>row.data()));
  const latestSource=await getDoc(mainRef),latestHash=String(latestSource.data()?.clientHash||'');
  if(latestHash!==sourceHash)throw new Error('備份期間主資料版本已改變，這次分片不建立 verified manifest');
  const manifest=sealImmutableMigrationBackup(plan,readback,{verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey});
  if(sha256Canonical(latestSource.data()?.db)!==manifest.sourceHash)throw new Error('備份期間主資料 SHA-256 已改變');
  verifyImmutableMigrationBackupManifest(manifest,{currentSourceHash:manifest.sourceHash});
  await setDoc(runRef,{...manifest,verifiedAt:serverTimestamp()},{merge:false});
  setStagingMigrationBackupDiagnostic({state:'verified',verified:true,completedChunks:chunks.length});
  return{backupId:runRef.id,sourceVersionHash:sourceHash,sourceHash:manifest.sourceHash,verifiedHash:manifest.verifiedHash,chunkCount:chunks.length,recordCount:manifest.recordCount,collections:deepCopy(manifest.collections)};
 }catch(error){
  setStagingMigrationBackupDiagnostic({state:'failed',verified:false,error:String(error?.message||error).slice(0,500)});
  throw error;
 }
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeCreateStagingMigrationBackup=createVerifiedStagingMigrationBackup;
 window.__danbridgeGetStagingMigrationBackupDiagnostic=()=>{stagingMigrationBackupGuard();return deepCopy(stagingMigrationBackupDiagnostic)};
 const migrationBackupTest=new URLSearchParams(location.search).get('migrationBackupTest');
 if(migrationBackupTest==='verified')installStagingMigrationActionButton({id:'stagingMigrationBackupButton',label:'建立 staging verified 備份',runningLabel:'逐片備份並完整讀回中…',run:createVerifiedStagingMigrationBackup,successLabel:result=>`備份通過 ${result.backupId}｜${result.recordCount} 筆`});
}

let stagingMigrationRestoreDiagnostic={state:'idle',drillId:'',sourceBackupId:'',sourceHash:'',chunkCount:0,recordCount:0,completedChunks:0,verified:false,mainUnchanged:false,error:''};
function setStagingMigrationRestoreDiagnostic(next){
 stagingMigrationRestoreDiagnostic={...stagingMigrationRestoreDiagnostic,...next};
 document.body.dataset.stagingMigrationRestoreState=stagingMigrationRestoreDiagnostic.state;
}
async function runStagingMigrationRestoreDrill(sourceBackupId){
 stagingMigrationBackupGuard();
 const backupId=String(sourceBackupId||'').trim();if(!/^[A-Za-z0-9_-]{8,128}$/.test(backupId))throw new Error('復原演練 backupId 無效');
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),backupRef=doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',backupId);
 const [mainBeforeSnap,backupSnap,sourceChunksSnap]=await Promise.all([getDoc(mainRef),getDoc(backupRef),getDocs(collection(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',backupId,'chunks'))]);
 if(!mainBeforeSnap.exists()||!backupSnap.exists())throw new Error('主資料或 verified 備份不存在');
 const backup=backupSnap.data();verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:backup.sourceHash});
 const sourcePlan={...deepCopy(backup),state:'uploading'};
 const sourceReadback=verifyImmutableMigrationBackupReadback(sourcePlan,sourceChunksSnap.docs.map(row=>row.data()));
 if(sourceReadback.verifiedHash!==backup.sourceHash)throw new Error('來源備份重新讀回 SHA-256 不符');
 const drillRef=doc(collection(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs'));
 const {plan,chunks}=prepareImmutableMigrationBackup(sourceReadback.db,{backupId:drillRef.id,sourceVersionHash:backup.sourceVersionHash});
 if(plan.sourceHash!==backup.sourceHash||plan.recordCount!==backup.recordCount)throw new Error('復原沙盒規劃與來源備份不一致');
 setStagingMigrationRestoreDiagnostic({state:'writing',drillId:drillRef.id,sourceBackupId:backupId,sourceHash:backup.sourceHash,chunkCount:chunks.length,recordCount:plan.recordCount,completedChunks:0,verified:false,mainUnchanged:false,error:''});
 try{
  for(let offset=0;offset<chunks.length;offset+=100){
   const batch=chunks.slice(offset,offset+100);
   await runTransaction(cloud,async transaction=>{
    const refs=batch.map(chunk=>doc(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillRef.id,'chunks',chunk.chunkId));
    const existing=await Promise.all(refs.map(ref=>transaction.get(ref)));
    const duplicateIndex=existing.findIndex(snapshot=>snapshot.exists());if(duplicateIndex>=0)throw new Error(`復原沙盒分片已存在：${batch[duplicateIndex].chunkId}`);
    batch.forEach((chunk,index)=>transaction.set(refs[index],{...chunk,sourceBackupId:backupId,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false}));
   });
   setStagingMigrationRestoreDiagnostic({completedChunks:Math.min(offset+batch.length,chunks.length)});
  }
  setStagingMigrationRestoreDiagnostic({state:'verifying'});
  const [sandboxChunksSnap,mainAfterSnap]=await Promise.all([getDocs(collection(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillRef.id,'chunks')),getDoc(mainRef)]);
  const restored=verifyImmutableMigrationBackupReadback(plan,sandboxChunksSnap.docs.map(row=>row.data()));
  const mainVersionHash=String(mainBeforeSnap.data()?.clientHash||''),mainAfterHash=String(mainAfterSnap.data()?.clientHash||'');
  if(!mainVersionHash||mainAfterHash!==mainVersionHash)throw new Error('復原演練期間主文件版本改變，不建立 verified receipt');
  if(restored.verifiedHash!==backup.sourceHash)throw new Error('復原沙盒 SHA-256 與來源備份不一致');
  const receipt={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId:drillRef.id,sourceBackupId:backupId,sourceHash:backup.sourceHash,restoredHash:restored.verifiedHash,sourceChunkCount:backup.chunkCount,restoredChunkCount:sandboxChunksSnap.size,recordCount:restored.recordCount,collections:deepCopy(backup.collections),mainVersionHash,mainUnchanged:true,verifiedAt:serverTimestamp(),verifiedBy:cloudUid,verifiedByEmail:cloudEmailKey};
  await setDoc(drillRef,receipt,{merge:false});
  setStagingMigrationRestoreDiagnostic({state:'verified',verified:true,completedChunks:chunks.length,mainUnchanged:true});
  return{drillId:drillRef.id,sourceBackupId:backupId,sourceHash:backup.sourceHash,restoredHash:restored.verifiedHash,sourceChunkCount:backup.chunkCount,restoredChunkCount:sandboxChunksSnap.size,recordCount:restored.recordCount,collections:deepCopy(backup.collections),mainVersionHash,mainUnchanged:true};
 }catch(error){
  setStagingMigrationRestoreDiagnostic({state:'failed',verified:false,error:String(error?.message||error).slice(0,500)});
  throw error;
 }
}
async function verifyStagingMigrationRestoreReceipt(drillIdValue){
 stagingMigrationBackupGuard();
 const drillId=String(drillIdValue||'').trim();if(!/^[A-Za-z0-9_-]{8,128}$/.test(drillId))throw new Error('復原演練 drillId 無效');
 const receiptRef=doc(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillId);
 const receiptSnap=await getDoc(receiptRef);if(!receiptSnap.exists())throw new Error('復原演練 receipt 不存在');
 const receipt=receiptSnap.data();
 if(receipt.schema!=='danbridge-migration-restore-drill-v1'||receipt.environment!=='staging'||receipt.state!=='verified'||receipt.drillId!==drillId||receipt.mainUnchanged!==true)throw new Error('復原演練 receipt 狀態無效');
 const [backupSnap,chunksSnap,mainSnap]=await Promise.all([getDoc(doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',receipt.sourceBackupId)),getDocs(collection(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillId,'chunks')),getDoc(doc(cloud,'companies',COMPANY_ID,'data','main'))]);
 if(!backupSnap.exists()||!mainSnap.exists())throw new Error('來源備份或主資料不存在');
 const backup=backupSnap.data();verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:backup.sourceHash});
 const plan={...deepCopy(backup),backupId:drillId,state:'uploading'};
 const restored=verifyImmutableMigrationBackupReadback(plan,chunksSnap.docs.map(row=>row.data()));
 if(receipt.sourceHash!==backup.sourceHash||receipt.restoredHash!==restored.verifiedHash||receipt.sourceHash!==receipt.restoredHash)throw new Error('持久化 receipt SHA-256 不符');
 if(receipt.sourceChunkCount!==backup.chunkCount||receipt.restoredChunkCount!==chunksSnap.size||receipt.recordCount!==restored.recordCount)throw new Error('持久化 receipt 分片或筆數不符');
 if(String(mainSnap.data()?.clientHash||'')!==receipt.mainVersionHash)throw new Error('receipt 建立後主文件版本已改變');
 return{drillId,sourceBackupId:receipt.sourceBackupId,sourceHash:receipt.sourceHash,restoredHash:receipt.restoredHash,sourceChunkCount:receipt.sourceChunkCount,restoredChunkCount:receipt.restoredChunkCount,recordCount:receipt.recordCount,mainVersionHash:receipt.mainVersionHash,mainUnchanged:true,persisted:true};
}
async function runStagingMigrationRestoreFailureScenario(sourceBackupId,scenarioValue){
 stagingMigrationBackupGuard();
 const backupId=String(sourceBackupId||'').trim(),scenario=String(scenarioValue||'').trim();
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(backupId))throw new Error('失敗演練 backupId 無效');
 if(!['missing-chunk','extra-chunk','hash-mismatch','version-change','interruption-resume'].includes(scenario))throw new Error('未知的復原失敗演練情境');
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),backupRef=doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',backupId);
 const [mainBeforeSnap,backupSnap,sourceChunksSnap]=await Promise.all([getDoc(mainRef),getDoc(backupRef),getDocs(collection(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',backupId,'chunks'))]);
 if(!mainBeforeSnap.exists()||!backupSnap.exists())throw new Error('失敗演練來源不存在');
 const backup=backupSnap.data();verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:backup.sourceHash});
 const sourcePlan={...deepCopy(backup),state:'uploading'},sourceReadback=verifyImmutableMigrationBackupReadback(sourcePlan,sourceChunksSnap.docs.map(row=>row.data()));
 const drillRef=doc(collection(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs')),{plan,chunks}=prepareImmutableMigrationBackup(sourceReadback.db,{backupId:drillRef.id,sourceVersionHash:backup.sourceVersionHash});
 const writeChunks=async rows=>{for(let offset=0;offset<rows.length;offset+=100){const batch=rows.slice(offset,offset+100);await runTransaction(cloud,async transaction=>{const refs=batch.map(chunk=>doc(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillRef.id,'chunks',chunk.chunkId)),existing=await Promise.all(refs.map(ref=>transaction.get(ref)));if(existing.some(snapshot=>snapshot.exists()))throw new Error('失敗演練分片意外重複');batch.forEach((chunk,index)=>transaction.set(refs[index],{...chunk,sourceBackupId:backupId,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false}))})}};
 const readSandbox=async()=>{const snapshot=await getDocs(collection(cloud,'stagingMigrationRestoreDrills',COMPANY_ID,'runs',drillRef.id,'chunks'));return{snapshot,rows:snapshot.docs.map(row=>row.data())}};
 const mainVersionHash=String(mainBeforeSnap.data()?.clientHash||'');
 if(scenario==='interruption-resume'){
  const split=Math.max(1,Math.floor(chunks.length/2));await writeChunks(chunks.slice(0,split));
  let interruptedError='';try{const partial=await readSandbox();verifyImmutableMigrationBackupReadback(plan,partial.rows)}catch(error){interruptedError=String(error?.message||error)}
  if(!interruptedError)throw new Error('中斷後的不完整分片未被拒絕');
  await writeChunks(chunks.slice(split));const resumed=await readSandbox(),restored=verifyImmutableMigrationBackupReadback(plan,resumed.rows),mainAfter=await getDoc(mainRef);
  if(restored.verifiedHash!==backup.sourceHash||String(mainAfter.data()?.clientHash||'')!==mainVersionHash)throw new Error('中斷續跑驗證失敗或主資料改變');
  return{scenario,drillId:drillRef.id,rejected:true,interruptedError,resumed:true,chunkCount:resumed.snapshot.size,recordCount:restored.recordCount,sourceHash:backup.sourceHash,restoredHash:restored.verifiedHash,mainUnchanged:true,receiptCreated:false};
 }
 let faultChunks=chunks.map(row=>deepCopy(row));
 if(scenario==='missing-chunk')faultChunks=faultChunks.slice(1);
 if(scenario==='extra-chunk'){const extra=deepCopy(faultChunks.at(-1));extra.index=9999;extra.chunkId=`${extra.collection}-9999`;faultChunks.push(extra)}
 if(scenario==='hash-mismatch'){const first=faultChunks.find(row=>row.items.length);if(!first)throw new Error('沒有可破壞的測試分片');first.items[0]={...first.items[0],__restoreFault:'hash-mismatch'}}
 await writeChunks(faultChunks);const sandbox=await readSandbox();let rejection='';
 try{
  const restored=verifyImmutableMigrationBackupReadback(plan,sandbox.rows);
  const currentMain=await getDoc(mainRef),expectedMainVersion=scenario==='version-change'?`stale-${mainVersionHash}`:mainVersionHash;
  if(String(currentMain.data()?.clientHash||'')!==expectedMainVersion)throw new Error('復原演練期間主文件版本改變，不建立 verified receipt');
  if(restored.verifiedHash!==backup.sourceHash)throw new Error('復原沙盒 SHA-256 與來源備份不一致');
 }catch(error){rejection=String(error?.message||error)}
 if(!rejection)throw new Error(`${scenario} 未被 fail-closed 拒絕`);
 const mainAfter=await getDoc(mainRef);if(String(mainAfter.data()?.clientHash||'')!==mainVersionHash)throw new Error('失敗演練不應改變主資料');
 return{scenario,drillId:drillRef.id,rejected:true,rejection,writtenChunkCount:sandbox.snapshot.size,expectedChunkCount:plan.chunkCount,mainVersionHash,mainUnchanged:true,receiptCreated:false};
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeRunStagingMigrationRestoreDrill=runStagingMigrationRestoreDrill;
 window.__danbridgeVerifyStagingMigrationRestoreReceipt=verifyStagingMigrationRestoreReceipt;
 window.__danbridgeRunStagingMigrationRestoreFailureScenario=runStagingMigrationRestoreFailureScenario;
 window.__danbridgeGetStagingMigrationRestoreDiagnostic=()=>{stagingMigrationBackupGuard();return deepCopy(stagingMigrationRestoreDiagnostic)};
 const migrationRestoreDrill=new URLSearchParams(location.search).get('migrationRestoreDrill');
 if(migrationRestoreDrill)installStagingMigrationActionButton({id:'stagingMigrationRestoreButton',label:'執行 staging 復原演練',runningLabel:'逐片重建、讀回並比對主資料中…',run:()=>runStagingMigrationRestoreDrill(migrationRestoreDrill),successLabel:result=>`復原通過 ${result.drillId}｜主資料未變`});
 const migrationRestoreVerify=new URLSearchParams(location.search).get('migrationRestoreVerify');
 if(migrationRestoreVerify)installStagingMigrationActionButton({id:'stagingMigrationRestoreVerifyButton',label:'重新讀回 staging 復原憑證',runningLabel:'重新讀取備份、分片與主資料中…',run:()=>verifyStagingMigrationRestoreReceipt(migrationRestoreVerify),successLabel:result=>`憑證通過 ${result.drillId}｜${result.recordCount} 筆`});
 const migrationRestoreFailure=new URLSearchParams(location.search).get('migrationRestoreFailure'),migrationRestoreFailureBackup=new URLSearchParams(location.search).get('migrationRestoreBackup');
 if(migrationRestoreFailure&&migrationRestoreFailureBackup)installStagingMigrationActionButton({id:'stagingMigrationRestoreFailureButton',label:`執行失敗演練：${migrationRestoreFailure}`,runningLabel:'建立隔離沙盒並驗證 fail-closed…',run:()=>runStagingMigrationRestoreFailureScenario(migrationRestoreFailureBackup,migrationRestoreFailure),successLabel:result=>`已正確拒絕 ${result.scenario}｜主資料未變`});
}

function firestoreRecordSyncCandidateAdapter(){
 return createFirebaseRecordSyncCandidateAdapter({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,actor:{uid:cloudUid,email:cloudEmailKey},serverTimestamp,getDocument:path=>getDoc(doc(cloud,...path.split('/'))),runTransaction:stagingFirestoreTransaction});
}
async function verifyStagingRecordSyncProtection(backupIdValue,restoreReceiptIdValue){
 stagingMigrationBackupGuard();const backupId=String(backupIdValue||'').trim(),restoreReceiptId=String(restoreReceiptIdValue||'').trim();if(!/^[A-Za-z0-9_-]{8,128}$/.test(backupId)||!/^[A-Za-z0-9_-]{8,128}$/.test(restoreReceiptId))throw new Error('逐筆候選備份或復原 identity 無效');
 const [mainSnapshot,backupSnapshot,restoreReceipt]=await Promise.all([getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),getDoc(doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',backupId)),verifyStagingMigrationRestoreReceipt(restoreReceiptId)]);if(!mainSnapshot.exists()||!backupSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('逐筆候選主資料或 verified 備份不存在');
 const db=deepCopy(mainSnapshot.data().db),legacyVersionHash=String(mainSnapshot.data().clientHash||''),backup=backupSnapshot.data(),rawHash=sha256Canonical(db);if(!legacyVersionHash||dataHash(db)!==legacyVersionHash)throw new Error('逐筆候選 legacy 內容與版本不符');verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:rawHash});if(backup.backupId!==backupId||backup.state!=='verified'||backup.sourceVersionHash!==legacyVersionHash||backup.sourceHash!==rawHash||backup.verifiedHash!==rawHash)throw new Error('逐筆候選 verified 備份與目前主資料不一致');if(restoreReceipt.drillId!==restoreReceiptId||restoreReceipt.sourceBackupId!==backupId||restoreReceipt.mainVersionHash!==legacyVersionHash||restoreReceipt.sourceHash!==rawHash||restoreReceipt.restoredHash!==rawHash||restoreReceipt.mainUnchanged!==true||restoreReceipt.persisted!==true)throw new Error('逐筆候選復原憑證與目前主資料不一致');return{db,legacyVersionHash,recordDataHash:recordDataHash(db),backupId,restoreReceiptId,backup,restoreReceipt};
}
async function synchronizeAndSealStagingRecordSyncCandidate({backupId,restoreReceiptId,batchSize=400}={}){
 stagingRecordShadowGuard();const protection=await verifyStagingRecordSyncProtection(backupId,restoreReceiptId),candidateAdapter=firestoreRecordSyncCandidateAdapter(),fullAdapter=firestoreFullRecordShadowAdapter(),existing=await candidateAdapter.read();
 if(existing?.state==='sealed'&&existing.legacyVersionHash===protection.legacyVersionHash&&existing.recordDataHash===protection.recordDataHash){const verified=await fullAdapter.verifyCandidate(protection.db,{sourceHash:protection.legacyVersionHash});if(verified.documentCount===existing.documentCount&&verified.activeCount===existing.activeCount&&verified.tombstoneCount===existing.tombstoneCount)return{state:'sealed',kind:'duplicate',writes:0,candidateEpoch:existing.candidateEpoch,candidateRevision:existing.revision,candidateSealHash:existing.sealHash,legacyVersionHash:existing.legacyVersionHash,recordDataHash:existing.recordDataHash,documentCount:existing.documentCount,activeCount:existing.activeCount,tombstoneCount:existing.tombstoneCount,backupId,restoreReceiptId,readTakeover:false,writeTakeover:false}}
 const createdAt=new Date().toISOString(),candidateEpoch=existing?.state==='open'&&existing.legacyVersionHash===protection.legacyVersionHash?existing.candidateEpoch:`candidate:${Date.now().toString(36)}:${crypto.randomUUID().slice(0,8)}`,openCreatedAt=existing?.state==='open'&&existing.legacyVersionHash===protection.legacyVersionHash?existing.createdAt:createdAt;await candidateAdapter.open({candidateEpoch,legacyVersionHash:protection.legacyVersionHash,createdAt:openCreatedAt});
 const synchronized=await runStagingFullRecordShadow({batchSize:Number(batchSize),targetDb:protection.db}),beforeSeal=await fullAdapter.verifyCandidate(protection.db,{sourceHash:protection.legacyVersionHash}),beforeHash=recordDataHash(beforeSeal.db);if(beforeHash!==protection.recordDataHash||synchronized.documentCount!==beforeSeal.documentCount||synchronized.activeCount!==beforeSeal.activeCount||synchronized.tombstoneCount!==beforeSeal.tombstoneCount)throw new Error('逐筆候選封存前讀回 hash 或計數不一致');
 const sealed=await candidateAdapter.seal({candidateEpoch,legacyVersionHash:protection.legacyVersionHash,recordDataHash:beforeHash,documentCount:beforeSeal.documentCount,activeCount:beforeSeal.activeCount,tombstoneCount:beforeSeal.tombstoneCount,sealedAt:new Date().toISOString()}),afterSeal=await fullAdapter.verifyCandidate(protection.db,{sourceHash:protection.legacyVersionHash}),saved=await candidateAdapter.read(),afterHash=recordDataHash(afterSeal.db);if(saved?.state!=='sealed'||saved.candidateEpoch!==candidateEpoch||saved.sealHash!==sealed.control.sealHash||saved.recordDataHash!==afterHash||afterHash!==protection.recordDataHash||saved.documentCount!==afterSeal.documentCount||saved.activeCount!==afterSeal.activeCount||saved.tombstoneCount!==afterSeal.tombstoneCount)throw new Error('逐筆候選封存後第二次讀回不一致');
 return{state:'sealed',kind:sealed.kind,writes:synchronized.totalWrites,candidateEpoch:saved.candidateEpoch,candidateRevision:saved.revision,candidateSealHash:saved.sealHash,legacyVersionHash:saved.legacyVersionHash,recordDataHash:saved.recordDataHash,documentCount:saved.documentCount,activeCount:saved.activeCount,tombstoneCount:saved.tombstoneCount,backupId,restoreReceiptId,readTakeover:false,writeTakeover:false};
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgeVerifyStagingRecordSyncProtection=verifyStagingRecordSyncProtection;window.__danbridgeSynchronizeAndSealStagingRecordSyncCandidate=synchronizeAndSealStagingRecordSyncCandidate;
 const params=new URLSearchParams(location.search),backupId=params.get('recordSyncCandidateSeal'),restoreReceiptId=params.get('recordSyncCandidateRestore');if(backupId&&restoreReceiptId)installStagingMigrationActionButton({id:'stagingRecordSyncCandidateSealButton',label:'同步並封存 staging 16 集合候選',runningLabel:'核對備份、逐筆續傳、封存並第二次讀回中…',run:()=>synchronizeAndSealStagingRecordSyncCandidate({backupId,restoreReceiptId}),successLabel:result=>`候選已封存 ${result.activeCount} 筆｜revision ${result.candidateRevision}`});
}

let preparedRecordSyncRoleEvidence=null,preparedRecordSyncActivation=null;
function prepareStagingRecordSyncRoleEvidence({primaryOwnerEmail=OWNER_EMAIL,backupOwnerEmail,schedulerEmail,teacherAccounts,roleViewCount,receiptSet,results,testedAt=new Date().toISOString()}={}){
 stagingRecordShadowGuard();if(!receiptSet||!results||RECORD_SYNC_ROLE_SCENARIOS.some(scenario=>results[scenario]!==true))throw new Error('角色本人憑證或實測情境尚未完成，禁止建立啟用證據');preparedRecordSyncRoleEvidence=buildRecordSyncRoleEvidence({environment:'staging',primaryOwnerEmail,backupOwnerEmail,schedulerEmail,teacherAccounts,roleViewCount,candidateRunId:receiptSet.manifest.runId,candidateSourceHash:receiptSet.manifest.sourceHash,candidateManifestHash:receiptSet.manifest.manifestHash,receiptCount:receiptSet.receiptCount,receiptSetHash:receiptSet.receiptSetHash,results,testedAt});return deepCopy(preparedRecordSyncRoleEvidence);
}
async function prepareStagingRecordSyncRoleEvidenceFromReceipts({runId,results}={}){
 stagingRecordShadowGuard();const [manifestSnapshot,receiptSnapshot,accessDocs]=await Promise.all([getDoc(roleCandidateManifestRef(runId)),getDocs(collection(cloud,'stagingRoleViewVerificationReceipts',COMPANY_ID,'runs',runId,'actors')),getCompanyAccessDocs()]);if(!manifestSnapshot.exists())throw new Error('角色候選 manifest 不存在');const manifest=deepCopy(manifestSnapshot.data());delete manifest.persistedAt;delete manifest.persistedBy;delete manifest.persistedByEmail;const receipts=receiptSnapshot.docs.map(row=>{const value=deepCopy(row.data());delete value.persistedAt;delete value.verifiedBy;delete value.verifiedByEmail;return value}),backupOwners=accessDocs.map(row=>({...row.data(),email:String(row.data()?.email||row.id||'').trim().toLowerCase()})).filter(row=>row.active===true&&row.role==='owner'&&row.email!==OWNER_EMAIL);if(backupOwners.length!==1)throw new Error(`備援 Owner 必須且只能有一位，目前 ${backupOwners.length} 位`);const receiptSet=verifyRoleViewReceiptSet({manifest,receipts,primaryOwnerEmail:OWNER_EMAIL,backupOwnerEmail:backupOwners[0].email,schedulerEmail:[...SCHEDULER_ACCOUNT_EMAILS][0]});return prepareStagingRecordSyncRoleEvidence({primaryOwnerEmail:receiptSet.primaryOwnerEmail,backupOwnerEmail:receiptSet.backupOwnerEmail,schedulerEmail:receiptSet.schedulerEmail,teacherAccounts:receiptSet.teacherAccounts,roleViewCount:receiptSet.roleViewCount,receiptSet,results,testedAt:receiptSet.testedAt});
}
async function prepareStagingRecordSyncActivation({backupId,restoreReceiptId,roleEvidence=preparedRecordSyncRoleEvidence}={}){
 stagingRecordShadowGuard();if(!roleEvidence)throw new Error('缺少 Daniel、Catherine、aa 與全部老師的實測證據');const protection=await verifyStagingRecordSyncProtection(backupId,restoreReceiptId),candidate=await firestoreRecordSyncCandidateAdapter().read();if(!candidate||candidate.state!=='sealed'||candidate.legacyVersionHash!==protection.legacyVersionHash||candidate.recordDataHash!==protection.recordDataHash)throw new Error('逐筆同步候選尚未封存或已與主資料分歧');const readback=await firestoreFullRecordShadowAdapter().verifyCandidate(protection.db,{sourceHash:protection.legacyVersionHash}),readbackHash=recordDataHash(readback.db);if(readbackHash!==candidate.recordDataHash||readback.documentCount!==candidate.documentCount||readback.activeCount!==candidate.activeCount||readback.tombstoneCount!==candidate.tombstoneCount)throw new Error('逐筆同步封存候選完整讀回不一致');const createdAt=new Date().toISOString(),activationEpoch=`active:${Date.now().toString(36)}:${crypto.randomUUID().slice(0,8)}`,manifest=buildRecordSyncActivationManifest({environment:'staging',activationEpoch,candidateControl:candidate,legacyVersionHash:protection.legacyVersionHash,recordDataHash:readbackHash,roleEvidence,backupId,restoreReceiptId,documentCount:readback.documentCount,activeCount:readback.activeCount,tombstoneCount:readback.tombstoneCount,createdAt}),control=buildActiveRecordSyncControl({manifest,currentLegacyVersionHash:protection.legacyVersionHash,currentRecordDataHash:readbackHash,currentRoleEvidenceHash:roleEvidence.evidenceHash,activatedAt:createdAt});preparedRecordSyncActivation={roleEvidence:deepCopy(roleEvidence),manifest,control,preparedAt:createdAt};document.body.dataset.recordSyncActivationPreflight=JSON.stringify({state:'ready',manifestHash:manifest.manifestHash,activationEpoch,recordDataHash:readbackHash,documentCount:readback.documentCount,activeCount:readback.activeCount,tombstoneCount:readback.tombstoneCount,roleViewCount:manifest.roleViewCount,writes:0,readTakeover:false,writeTakeover:false});return deepCopy(preparedRecordSyncActivation);
}
async function executePreparedStagingRecordSyncActivation(){
 stagingRecordShadowGuard();if(!preparedRecordSyncActivation)throw new Error('請先在同一頁完成逐筆啟用唯讀預檢');const adapter=createFirebaseRecordSyncActivationAdapter({runTransaction:stagingFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey},environment:'staging',role:cloudRole}),result=await adapter.activate(preparedRecordSyncActivation),{manifest,control,roleEvidence}=preparedRecordSyncActivation,[savedControl,savedManifest]=await Promise.all([getDoc(doc(cloud,'stagingRecordSyncControls',COMPANY_ID)),getDoc(doc(cloud,'stagingRecordSyncActivationManifests',COMPANY_ID,'manifests',manifest.manifestHash))]);if(!savedControl.exists()||!savedManifest.exists())throw new Error('逐筆同步原子啟用讀回缺失');const eligibility=evaluateActiveRecordSyncControl({control:savedControl.data(),manifest:savedManifest.data(),environment:'staging',currentRecordDataHash:manifest.recordDataHash,currentRoleEvidenceHash:roleEvidence.evidenceHash});if(!eligibility.eligible||savedControl.data().candidateSealHash!==control.candidateSealHash)throw new Error(`逐筆同步原子啟用讀回失敗：${eligibility.reason}`);document.body.dataset.recordSyncActivationResult=JSON.stringify({state:'active',kind:result.kind,manifestHash:manifest.manifestHash,activationEpoch:manifest.activationEpoch,recordDataHash:manifest.recordDataHash,documentCount:manifest.documentCount,activeCount:manifest.activeCount,tombstoneCount:manifest.tombstoneCount,roleViewCount:manifest.roleViewCount,readTakeover:true,writeTakeover:true});return{...result,eligible:true,manifestHash:manifest.manifestHash,activationEpoch:manifest.activationEpoch,recordDataHash:manifest.recordDataHash,documentCount:manifest.documentCount,activeCount:manifest.activeCount,tombstoneCount:manifest.tombstoneCount,roleViewCount:manifest.roleViewCount};
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgePrepareStagingRecordSyncRoleEvidence=prepareStagingRecordSyncRoleEvidence;window.__danbridgePrepareStagingRecordSyncRoleEvidenceFromReceipts=prepareStagingRecordSyncRoleEvidenceFromReceipts;window.__danbridgePrepareStagingRecordSyncActivation=prepareStagingRecordSyncActivation;window.__danbridgeExecutePreparedStagingRecordSyncActivation=executePreparedStagingRecordSyncActivation;window.__danbridgeGetPreparedStagingRecordSyncActivation=()=>preparedRecordSyncActivation?deepCopy(preparedRecordSyncActivation):null;
 const activationParams=new URLSearchParams(location.search),activationRunId=activationParams.get('recordSyncActivationRun'),activationBackupId=activationParams.get('recordSyncActivationBackup'),activationRestoreId=activationParams.get('recordSyncActivationRestore');if(activationRunId&&activationBackupId&&activationRestoreId){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const panel=document.createElement('section');panel.id='stagingRecordSyncActivationPanel';panel.style.cssText='position:fixed;right:18px;bottom:24px;z-index:10003;width:min(760px,calc(100vw - 36px));max-height:70vh;overflow:auto;padding:18px;background:#fff;border:2px solid #b99032;border-radius:16px;box-shadow:0 18px 50px #0004';panel.innerHTML=`<strong>staging 逐筆原子啟用最終閘門</strong><p class="small">只有全部角色不可變憑證到齊，且下列實測逐項確認後才能建立唯讀預檢。此步尚不接管。</p><div id="stagingRecordSyncScenarioChecks">${RECORD_SYNC_ROLE_SCENARIOS.map(scenario=>`<label style="display:flex;gap:8px;margin:6px 0"><input type="checkbox" data-scenario="${scenario}"> ${scenario}</label>`).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn" id="stagingRecordSyncPrepareButton">收齊憑證並建立唯讀預檢</button><button type="button" class="btn danger" id="stagingRecordSyncActivateButton" disabled>原子啟用 staging 逐筆讀寫</button></div><p class="small" id="stagingRecordSyncActivationMessage"></p>`;document.body.appendChild(panel);const prepareButton=panel.querySelector('#stagingRecordSyncPrepareButton'),activateButton=panel.querySelector('#stagingRecordSyncActivateButton'),message=panel.querySelector('#stagingRecordSyncActivationMessage');prepareButton.onclick=async()=>{prepareButton.disabled=true;try{const results=Object.fromEntries([...panel.querySelectorAll('[data-scenario]')].map(input=>[input.dataset.scenario,input.checked]));if(RECORD_SYNC_ROLE_SCENARIOS.some(scenario=>results[scenario]!==true))throw new Error('仍有實測情境未勾選');const evidence=await prepareStagingRecordSyncRoleEvidenceFromReceipts({runId:activationRunId,results}),prepared=await prepareStagingRecordSyncActivation({backupId:activationBackupId,restoreReceiptId:activationRestoreId,roleEvidence:evidence});message.textContent=`唯讀預檢通過｜manifest ${prepared.manifest.manifestHash}`;activateButton.disabled=false;prepareButton.textContent='唯讀預檢已通過'}catch(error){prepareButton.disabled=false;message.textContent=`已阻擋：${String(error?.message||error)}`;cloudStatus(message.textContent,'error')}};activateButton.onclick=async()=>{activateButton.disabled=true;try{const result=await executePreparedStagingRecordSyncActivation();message.textContent=`已原子啟用｜epoch ${result.activationEpoch}`;activateButton.textContent='staging 逐筆已啟用';location.reload()}catch(error){activateButton.disabled=false;message.textContent=`啟用已阻擋：${String(error?.message||error)}`;cloudStatus(message.textContent,'error')}}},200)}
}

let stagingLivePreflightDiagnostic={state:'idle',manifestHash:'',operationCount:0,sourceRecordCount:0,targetRecordCount:0,estimatedReads:0,estimatedWrites:0,readBudget:0,writeBudget:0,liveControlExists:false,writes:0,featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false,error:''},stagingLivePreflightEvidence=null;
function stagingLivePreflightGuard(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||firebaseConfig.projectId!=='danbridge-d8877-staging')throw new Error('live 逐筆預檢只允許 staging Owner');
}
function setStagingLivePreflightDiagnostic(next){stagingLivePreflightDiagnostic={...stagingLivePreflightDiagnostic,...next};document.body.dataset.stagingLivePreflightState=stagingLivePreflightDiagnostic.state}
async function readStagingLiveRecordSource(){
 stagingLivePreflightGuard();
 const [controlSnapshot,...snapshots]=await Promise.all([getDoc(doc(cloud,'stagingLiveRecordControls',COMPANY_ID)),...FULL_RECORD_COLLECTIONS.map(collectionName=>getDocs(collection(cloud,'stagingLiveRecords',COMPANY_ID,'collections',collectionName,'records')))]),documentsByCollection={};
 FULL_RECORD_COLLECTIONS.forEach((collectionName,index)=>{documentsByCollection[collectionName]=snapshots[index].docs.map(row=>({id:row.id,data:row.data()}))});
 const rebuilt=rebuildFullRecordShadowDb(documentsByCollection,{environment:'staging'}),sourceRecordHash=recordDataHash(rebuilt.db),control=controlSnapshot.exists()?controlSnapshot.data():null;
 if(!control&&rebuilt.documentCount)throw new Error('live 逐筆文件存在但控制文件缺失');
 if(control){if(control.schema!=='danbridge-live-record-control-v2'||control.environment!=='staging'||control.companyId!==COMPANY_ID||!['migrating','verifying','active'].includes(control.state)||control.dataHash!==sourceRecordHash||!Number.isSafeInteger(control.rootRevision)||control.rootRevision<0||!Number.isSafeInteger(control.executionBaseRootRevision)||control.executionBaseRootRevision<0||!Number.isSafeInteger(control.confirmedOperationCount)||control.rootRevision!==control.executionBaseRootRevision+control.confirmedOperationCount||typeof control.executionManifestHash!=='string'||!/^[a-f0-9]{64}$/.test(control.executionManifestHash))throw new Error('live 逐筆控制與實際文件不一致')}
 return{db:rebuilt.db,revisions:rebuilt.revisions,sourceRecordHash,documentCount:rebuilt.documentCount,activeCount:rebuilt.activeCount,tombstoneCount:rebuilt.tombstoneCount,control,liveControlExists:Boolean(control),nextSequence:control?control.rootRevision+1:1};
}
async function prepareStagingLiveOperationPreflight({backupId,restoreDrillId,readBudget,writeBudget,deviceId,maxOperationsPerRun=100}={}){
 stagingLivePreflightGuard();
 const cleanBackupId=String(backupId||'').trim(),cleanRestoreDrillId=String(restoreDrillId||'').trim();
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(cleanBackupId)||!/^[A-Za-z0-9_-]{8,128}$/.test(cleanRestoreDrillId))throw new Error('live 逐筆預檢 backupId 或 drillId 無效');
 setStagingLivePreflightDiagnostic({state:'reading',error:''});
 try{
  const [mainSnapshot,backupSnapshot,restoreReceipt,source]=await Promise.all([getDoc(doc(cloud,'companies',COMPANY_ID,'data','main')),getDoc(doc(cloud,'stagingMigrationBackups',COMPANY_ID,'runs',cleanBackupId)),verifyStagingMigrationRestoreReceipt(cleanRestoreDrillId),readStagingLiveRecordSource()]);
  if(!mainSnapshot.exists()||!backupSnapshot.exists()||!mainSnapshot.data()?.db)throw new Error('live 逐筆預檢來源、備份或 legacy 主資料不存在');
  const targetDb=deepCopy(mainSnapshot.data().db),legacyVersionHash=String(mainSnapshot.data()?.clientHash||'');if(!legacyVersionHash||dataHash(targetDb)!==legacyVersionHash)throw new Error('live 逐筆預檢 legacy 內容與版本不符');
  if(source.control&&source.control.state!=='active')throw new Error('前一輪 staging live 遷移尚未完成，請使用原 manifest 續傳');
  const resolvedDeviceId=String(deviceId||`staging-${cloudUid}`).replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,120),result=buildStagingLivePreflight({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,projectId:firebaseConfig.projectId,sourceState:{db:source.db,revisions:source.revisions},targetDb,backup:backupSnapshot.data(),restoreReceipt,legacyVersionHash,deviceId:resolvedDeviceId,startSequence:source.nextSequence,readBudget:Number(readBudget),writeBudget:Number(writeBudget),createdAt:new Date().toISOString(),maxOperationsPerRun:Number(maxOperationsPerRun)});
  const summary={state:'ready',manifestHash:result.manifest.manifestHash,operationCount:result.plan.operationCount,sourceRecordCount:result.manifest.sourceRecordCount,targetRecordCount:result.manifest.targetRecordCount,estimatedReads:result.manifest.estimatedReads,estimatedWrites:result.manifest.estimatedWrites,readBudget:result.manifest.readBudget,writeBudget:result.manifest.writeBudget,liveControlExists:source.liveControlExists,writes:0,featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false,error:''};
  stagingLivePreflightEvidence=result;setStagingLivePreflightDiagnostic(summary);document.body.dataset.stagingLivePreflightResult=JSON.stringify(summary);return deepCopy(result);
 }catch(error){stagingLivePreflightEvidence=null;setStagingLivePreflightDiagnostic({state:'blocked',writes:0,featureFlagOnly:true,uploadOwnerStateAttached:false,readTakeover:false,productionAllowed:false,error:String(error?.message||error).slice(0,500)});document.body.dataset.stagingLivePreflightResult=JSON.stringify(stagingLivePreflightDiagnostic);throw error}
}
function stagingFirestoreTransaction(work){return runTransaction(cloud,transaction=>work({get:path=>transaction.get(doc(cloud,path)),set:(path,value)=>transaction.set(doc(cloud,path),value,{merge:false})}))}
function stagingLiveExecutionStorage(manifestHash,manifest){stagingLivePreflightGuard();const storage=createBrowserStagingLiveExecutionStorage({storage:createBrowserOperationJournalStorage({indexedDB:window.indexedDB,locks:navigator.locks,key:`staging:${cloudEmailKey}:${manifestHash}`}),manifestHash,manifest});return{...storage,journal:createOperationJournal({storage:storage.journalStorage})}}
function boundJournalPlan(preflight){return{...preflight.plan,operations:preflight.plan.operations.map(operation=>({...operation,executionManifestHash:preflight.manifest.manifestHash,operationPlanHash:preflight.manifest.operationPlanHash,operationListHash:preflight.manifest.operationListHash}))}}
async function runPersistedStagingLiveExecution(manifest,{journal}={}){
 stagingLivePreflightGuard();assertStagingExecutionManifestEnvelope(manifest);const rows=await journal.list();
 verifyStagingLiveJournalRows(manifest,rows);
 const activation=createFirebaseStagingLiveActivationAdapter({runTransaction:stagingFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey}});await activation.activate(manifest);const sender=createFirebaseLiveRecordOperationAdapter({runTransaction:stagingFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey},manifestHash:manifest.manifestHash}),worker=await runOperationWorker({journal,send:operation=>sender.apply(operation),maxOperations:manifest.maxOperationsPerRun,onProgress:async progress=>{const counts=await journal.counts();setStagingLivePreflightDiagnostic({state:progress.kind,operationCount:manifest.operationCount,confirmedOperationCount:counts.confirmed,pendingOperationCount:counts.pending,failedOperationCount:counts.failed,quarantinedOperationCount:counts.quarantined})}});
 if(worker.state!=='complete')return{...worker,manifestHash:manifest.manifestHash,finalized:false,readTakeover:false,uploadOwnerStateAttached:false,productionAllowed:false};
 const readback=await readStagingLiveRecordSource();await activation.finalize(manifest,readback);const verified=await readStagingLiveRecordSource(),finalControl=verified.control;if(finalControl?.state!=='active'||finalControl.executionManifestHash!==manifest.manifestHash||finalControl.verifiedHash!==manifest.targetRecordHash||verified.sourceRecordHash!==manifest.targetRecordHash||verified.documentCount!==manifest.targetDocumentCount||verified.activeCount!==manifest.targetActiveCount||verified.tombstoneCount!==manifest.targetTombstoneCount||finalControl.verifiedDocumentCount!==verified.documentCount||finalControl.verifiedActiveCount!==verified.activeCount||finalControl.verifiedTombstoneCount!==verified.tombstoneCount)throw new Error('staging live 最終控制讀回失敗');
 return{...worker,manifestHash:manifest.manifestHash,finalized:true,documentCount:verified.documentCount,activeCount:verified.activeCount,tombstoneCount:verified.tombstoneCount,readTakeover:false,uploadOwnerStateAttached:false,productionAllowed:false};
}
async function executePreparedStagingLiveOperationPlan(){
 stagingLivePreflightGuard();const preflight=stagingLivePreflightEvidence;if(!preflight)throw new Error('請先完成同一頁面的唯讀預檢');const journal=stagingLiveExecutionStorage(preflight.manifest.manifestHash,preflight.manifest).journal;
 // 永久日誌必須先完整落地，才允許建立任何雲端執行控制。
 await enqueueOperationPlan(journal,boundJournalPlan(preflight));return runPersistedStagingLiveExecution(preflight.manifest,{journal});
}
async function resumeStagingLiveOperationPlan(manifestHash){
 stagingLivePreflightGuard();if(typeof manifestHash!=='string'||!/^[a-f0-9]{64}$/.test(manifestHash))throw new Error('續傳 manifestHash 無效');const snapshot=await getDoc(doc(cloud,'stagingLiveExecutionManifests',COMPANY_ID,'runs',manifestHash)),local=stagingLiveExecutionStorage(manifestHash),manifest=snapshot.exists()?stripStagingExecutionManifestAudit(snapshot.data()):await local.loadManifest();assertStagingExecutionManifestEnvelope(manifest);if(manifest.manifestHash!==manifestHash)throw new Error('續傳 manifest identity 不符');return runPersistedStagingLiveExecution(manifest,{journal:stagingLiveExecutionStorage(manifestHash,manifest).journal});
}
if(DANBRIDGE_ENVIRONMENT==='staging'){
 window.__danbridgePrepareStagingLiveOperationPreflight=prepareStagingLiveOperationPreflight;
 window.__danbridgeGetStagingLivePreflightDiagnostic=()=>{stagingLivePreflightGuard();return deepCopy(stagingLivePreflightDiagnostic)};
 window.__danbridgeGetStagingLivePreflightEvidence=()=>{stagingLivePreflightGuard();return stagingLivePreflightEvidence?deepCopy(stagingLivePreflightEvidence):null};
 window.__danbridgeExecutePreparedStagingLiveOperationPlan=executePreparedStagingLiveOperationPlan;
 window.__danbridgeResumeStagingLiveOperationPlan=resumeStagingLiveOperationPlan;
 const livePreflightParams=new URLSearchParams(location.search),livePreflightBackupId=livePreflightParams.get('stagingLivePreflight'),livePreflightRestoreDrillId=livePreflightParams.get('stagingLiveRestore'),livePreflightReadBudget=livePreflightParams.get('stagingLiveReadBudget'),livePreflightWriteBudget=livePreflightParams.get('stagingLiveWriteBudget'),livePreflightMaxOperations=Number(livePreflightParams.get('stagingLiveMaxOperations')||100);
 if(livePreflightBackupId&&livePreflightRestoreDrillId&&livePreflightReadBudget&&livePreflightWriteBudget){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='stagingLiveOperationPreflightButton';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:36px;z-index:10002';button.textContent='唯讀預檢 staging 逐筆計畫';button.onclick=async()=>{button.disabled=true;button.textContent='讀取備份、復原證據與逐筆現況中…';try{const result=await prepareStagingLiveOperationPreflight({backupId:livePreflightBackupId,restoreDrillId:livePreflightRestoreDrillId,readBudget:livePreflightReadBudget,writeBudget:livePreflightWriteBudget,maxOperationsPerRun:livePreflightMaxOperations});button.textContent=`預檢通過：${result.plan.operationCount} 筆，尚未寫入`;button.className='btn ok'}catch(error){button.disabled=false;button.textContent='預檢阻擋，未寫入';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
 if(livePreflightParams.get('stagingLiveExecute')==='manual'&&livePreflightBackupId&&livePreflightRestoreDrillId&&livePreflightReadBudget&&livePreflightWriteBudget){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='stagingLiveOperationExecuteButton';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:92px;z-index:10002;background:#7f1d1d;color:#fff;max-width:min(760px,calc(100vw - 36px));white-space:normal';button.textContent='手動執行 staging 逐筆遷移';button.onclick=async()=>{button.disabled=true;button.textContent='保存永久日誌並逐筆執行中…';try{if(!stagingLivePreflightEvidence)await prepareStagingLiveOperationPreflight({backupId:livePreflightBackupId,restoreDrillId:livePreflightRestoreDrillId,readBudget:livePreflightReadBudget,writeBudget:livePreflightWriteBudget,maxOperationsPerRun:livePreflightMaxOperations});const result=await executePreparedStagingLiveOperationPlan();document.body.dataset.stagingLiveExecutionResult=JSON.stringify({state:result.state,manifestHash:result.manifestHash,finalized:result.finalized,processed:result.processed,counts:result.counts,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,readTakeover:false,uploadOwnerStateAttached:false,productionAllowed:false});button.disabled=result.state==='complete';button.textContent=`${result.state==='complete'?`逐筆完成並讀回：${result.activeCount} 筆`:`已安全暫停：${result.counts.confirmed}/${result.counts.total}，按此續傳`}｜manifest ${result.manifestHash}`}catch(error){button.disabled=false;button.textContent='執行已阻擋，按此重試';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
 const liveResumeManifestHash=livePreflightParams.get('stagingLiveResume');if(liveResumeManifestHash){let installed=false;const timer=setInterval(()=>{if(installed||cloudRole!=='owner')return;installed=true;clearInterval(timer);const button=document.createElement('button');button.id='stagingLiveOperationResumeButton';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:92px;z-index:10002;background:#7f1d1d;color:#fff;max-width:min(760px,calc(100vw - 36px));white-space:normal';button.textContent=`續傳 staging 永久操作日誌｜manifest ${liveResumeManifestHash}`;button.onclick=async()=>{button.disabled=true;button.textContent='核對 manifest 與日誌後續傳中…';try{const result=await resumeStagingLiveOperationPlan(liveResumeManifestHash);document.body.dataset.stagingLiveExecutionResult=JSON.stringify({state:result.state,manifestHash:result.manifestHash,finalized:result.finalized,processed:result.processed,counts:result.counts,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount,readTakeover:false,uploadOwnerStateAttached:false,productionAllowed:false});button.disabled=result.state==='complete';button.textContent=`${result.state==='complete'?`續傳完成並讀回：${result.activeCount} 筆`:`已安全暫停：${result.counts.confirmed}/${result.counts.total}，按此續傳`}｜manifest ${result.manifestHash}`}catch(error){button.disabled=false;button.textContent='續傳已阻擋，按此重試';cloudStatus(String(error?.message||error),'error')}};document.body.appendChild(button)},200)}
}

async function applyActiveOwnerCloudDb(nextDb){
 applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(nextDb));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150)}finally{applyingCloud=false}
}
function handleActiveOwnerControllerStatus(status){
 setActiveRecordSyncFailureResumeDiagnostic(status);
  document.body.dataset.activeRecordState=String(status?.state||'unknown');ownerUploadQueued=Boolean(status?.dirty||status?.queued||status?.inFlight);if(status?.state==='complete'&&!status.dirty){localDirtyHash='';ownerUploadQueued=false;clearOwnerSyncRecovery();lastPublishedOwnerDB=deepCopy(window.__danbridgeGetDB());ownerBaselineReady=true;approvedLessonShrinkHash='';ownerRetryCount=0;scheduleDailyCloudBackup();renderSyncRecoveryCenter();cloudStatus('逐筆雲端已確認，待處理 0 筆','ok');return}if(status?.state==='paused'){persistOwnerSyncRecovery();cloudStatus('逐筆同步已中央暫停；畫面與本機修改均已保留。','pending');return}if(status?.state==='blocked'){persistOwnerSyncRecovery();cloudStatus('逐筆同步已阻擋，未覆蓋任何雲端資料：'+String(status.error||'請檢查同步中心'),'error');return}if(['queued','backing-up','syncing','planned','replanned','sent','confirmed','remote-buffered','waiting-for-stream','waiting'].includes(status?.state))cloudStatus(status?.state==='backing-up'?'正在建立並驗證寫入前的雲端分片備份…':'逐筆變更已保存，正在安全同步與讀回確認…','pending');
}
function setActiveRecordSyncFailureResumeDiagnostic(next={}){
 activeRecordSyncFailureResumeDiagnostic={...activeRecordSyncFailureResumeDiagnostic,...next};
 if(DANBRIDGE_ENVIRONMENT!=='staging')return;
 document.body.dataset.recordSyncActiveFailureResume=JSON.stringify(activeRecordSyncFailureResumeDiagnostic);
}
function ensureActiveOwnerPageController(activationEpoch){
 if(
  !['staging','production'].includes(DANBRIDGE_ENVIRONMENT)||cloudRole!=='owner'||!cloudUid||!cloudEmailKey||!/^[A-Za-z0-9_.:-]{8,128}$/.test(String(activationEpoch||''))
 )throw new Error('無法建立 Owner 逐筆控制器');
 if(activeRecordPageController&&activeOwnerControllerEpoch===activationEpoch)return activeRecordPageController;
 if(activeRecordPageController){activeRecordPageController.stop();activeRecordPageController=null}
 const deviceId=activeOwnerDeviceIdentity(),journalKey=`${DANBRIDGE_ENVIRONMENT}:${cloudEmailKey}:${deviceId}:${activationEpoch}`,journalStorage=createBrowserOperationJournalStorage({indexedDB:window.indexedDB,locks:navigator.locks,key:journalKey}),journal=createOperationJournal({storage:journalStorage}),operationAdapter=DANBRIDGE_ENVIRONMENT==='production'?(productionTrustedOperationClient||(()=>{throw new Error('production trusted operation client unavailable')})()):(activeOwnerV2OperationSender||createFirebaseActiveRecordOperationAdapter({runTransaction:activeFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey},environment:'staging',role:'owner'})),conflictAdapter=DANBRIDGE_ENVIRONMENT==='production'?createFirebaseProductionRecordConflictAdapter({runTransaction:activeFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey},role:'owner'}):createFirebaseRecordSyncConflictBackupAdapter({runTransaction:activeFirestoreTransaction,serverTimestamp,actor:{uid:cloudUid,email:cloudEmailKey},environment:'staging',role:'owner'}),failureResume=createRecordSyncActiveFailureResume({environment:DANBRIDGE_ENVIRONMENT,role:cloudRole,recordId:new URLSearchParams(location.search).get('recordSyncActiveFailureResume'),storage:sessionStorage,onDiagnostic:setActiveRecordSyncFailureResumeDiagnostic});
 activeOwnerControllerEpoch=activationEpoch;
 activeOwnerResumedEpoch='';
 activeRecordPageController=createActiveRecordPageController({
  environment:DANBRIDGE_ENVIRONMENT,
  role:'owner',
  deviceId,
  journal,
  readDocuments:activeOwnerProductionReadDocuments||activeOwnerV2ReadDocuments||readActiveRecordDocuments,
  send:operation=>failureResume.wrapSend(operation,()=>operationAdapter.apply(operation)),
  persistConflicts:(conflicts,context)=>conflictAdapter.persist(conflicts,context),
  getLocalDb:()=>deepCopy(window.__danbridgeGetDB()),
  applyCloudDb:applyActiveOwnerCloudDb,
  ensureCloudBackup:activeOwnerV2OperationSender?()=>confirmStagingV2DurablePrewriteBackup():confirmedDb=>createCloudSafetyBackup(false,confirmedDb),
  publishRoleViews:DANBRIDGE_ENVIRONMENT==='production'?async confirmedDb=>{
   const before=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):null;
   await Promise.all([publishScopedViews(confirmedDb,{recordAuthority:true}),publishLessonMeta(confirmedDb)]);
   if(before)queueScheduleChangeNotifications(before,confirmedDb,recordDataHash(confirmedDb));
   lastPublishedOwnerDB=deepCopy(confirmedDb);ownerBaselineReady=true;
  }:activeOwnerV2OperationSender?async confirmedDb=>{lastPublishedOwnerDB=deepCopy(confirmedDb);ownerBaselineReady=true;activeRoleBootstrapSourceDb=deepCopy(confirmedDb);if(activeOwnerV2HeadState==='hn')await getActiveRoleRecordPublishQueue().enqueue({kind:'confirmed',sourceDb:deepCopy(confirmedDb)});}:async confirmedDb=>{
   const before=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):null;
   await Promise.all([
    getActiveRoleRecordPublishQueue().enqueue({kind:'confirmed',sourceDb:deepCopy(confirmedDb)}),
    publishLessonMeta(confirmedDb)
   ]);
   if(before)queueScheduleChangeNotifications(before,confirmedDb,recordDataHash(confirmedDb));
   lastPublishedOwnerDB=deepCopy(confirmedDb);
   ownerBaselineReady=true;
  },
  onStatus:status=>{setActiveRecordSyncFailureResumeDiagnostic({state:status?.state||'waiting',counts:status?.counts||{}});handleActiveOwnerControllerStatus(failureResume.wrapOnStatus(status));},
  saveDelay:120,
  maxOperations:1000,
  maxRebases:5,
  strictConvergence:DANBRIDGE_ENVIRONMENT==='production'
 });
 return activeRecordPageController;
}
async function acceptActiveOwnerSnapshot(snapshot){
 const controller=ensureActiveOwnerPageController(snapshot?.activationEpoch),beforeAccept=controller.diagnostics();activeRoleBootstrapSourceDb=deepCopy(snapshot.db);if(localDirtyHash&&!beforeAccept.dirty&&!beforeAccept.inFlight)controller.queueLocalSave();const result=await controller.acceptCloudSnapshot(snapshot),diagnostics=controller.diagnostics();if(!diagnostics.dirty&&!diagnostics.inFlight){lastPublishedOwnerDB=deepCopy(snapshot.db);ownerBaselineReady=true;lastCloudSnapshotHash=snapshot.hash;lastUploadedHash=snapshot.hash}if(activeOwnerResumedEpoch!==snapshot.activationEpoch){activeOwnerResumedEpoch=snapshot.activationEpoch;await controller.resume()}return result;
}
async function runProductionHighRiskMutation({reason,mutate,requirePreview=false,confirmPreview}={}){
 if(DANBRIDGE_ENVIRONMENT!=='production'||cloudRole!=='owner'||!productionTrustedOperationClient||typeof mutate!=='function')throw new Error('正式高風險操作只允許已登入 Owner');
 if(activeRecordMode!=='active'||!activeOwnerProductionReadDocuments||!activeRecordPageController)throw new Error('正式逐筆同步尚未就緒，未執行任何變更');
 const diagnostics=activeRecordPageController.diagnostics();
 if(diagnostics.dirty||diagnostics.inFlight||diagnostics.writeAllowed===false)throw new Error('仍有一筆同步尚未確認，請等候同步完成後再執行');
 const documents=await activeOwnerProductionReadDocuments(),remote=rebuildFullRecordShadowDb(documents,{environment:'production'}),target=deepCopy(remote.db),mutationResult=await mutate(target);
 const plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:remote.db,localDb:target,environment:'production',deviceId:`trusted-${crypto.randomUUID()}`,activationEpoch:diagnostics.activationEpoch||activeOwnerControllerEpoch,createdAt:new Date().toISOString()});
 if(plan.conflicts.length)throw new Error('正式高風險操作偵測到資料衝突，未執行任何變更');
 if(!plan.operationCount)return{state:'unchanged',operationCount:0,mutationResult};
 if(plan.operationCount>180)throw new Error(`本次涉及 ${plan.operationCount} 筆，超過單次原子安全上限 180 筆；未執行任何變更`);
 let preview=null,batch={activationEpoch:plan.activationEpoch,reason:String(reason||'high-risk').slice(0,120),operations:plan.operations};
 if(requirePreview){preview=await productionTrustedOperationClient.previewBatch(batch);if(typeof confirmPreview==='function'&&await confirmPreview({...preview,plan,mutationResult})!==true)return{state:'cancelled',operationCount:plan.operationCount,preview};batch={...batch,previewId:preview.previewId}}
 const receipt=await productionTrustedOperationClient.applyBatch(batch);
 await acceptActiveOwnerSnapshot({activationEpoch:plan.activationEpoch,db:plan.db,hash:plan.targetHash,writeAllowed:true});
 const before=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):deepCopy(remote.db);
 await Promise.all([publishScopedViews(plan.db,{recordAuthority:true}),publishLessonMeta(plan.db)]);
 queueScheduleChangeNotifications(before,plan.db,plan.targetHash);lastPublishedOwnerDB=deepCopy(plan.db);ownerBaselineReady=true;
 return{state:'complete',operationCount:plan.operationCount,targetHash:plan.targetHash,preview,receipt,mutationResult};
}
window.__danbridgeRunProductionHighRiskMutation=runProductionHighRiskMutation;
function startOwnerLegacyActiveRecordRuntime(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner')return false;
 try{
  activeRecordStreamAdapter?.stop?.();
  activeRecordMode='checking';
  document.body.dataset.activeRecordMode=activeRecordMode;
  activeRecordStreamAdapter=createFirebaseActiveRecordStreamAdapter({
   environment:'staging',
   subscribeDocument:activeFirestoreSubscribeDocument,
   subscribeCollection:activeFirestoreSubscribeCollection,
   onApply:acceptActiveOwnerSnapshot,
   onState:event=>{
    document.body.dataset.activeRecordState=event.state;
    if(event.state==='legacy'){
     activeRecordMode='legacy';
     document.body.dataset.activeRecordMode=activeRecordMode;
     subscribeOwnerLegacy();
     return;
    }
    if(event.state==='loading'){
     activeRecordMode='active-loading';
     document.body.dataset.activeRecordMode=activeRecordMode;
     unsubscribeState?.();
     unsubscribeState=null;
     return;
    }
    if(event.state==='ready'||event.state==='paused'){
     activeRecordMode='active';
     document.body.dataset.activeRecordMode=activeRecordMode;
     activeRecordPageController?.setWriteAllowed(event.state==='ready');
     unsubscribeState?.();
     unsubscribeState=null;
     if(event.state==='ready')queueInitialActiveRoleRecordViews();
     return;
    }
    if(event.state==='blocked'){
     activeRecordMode='active-blocked';
     document.body.dataset.activeRecordMode=activeRecordMode;
     unsubscribeState?.();
     unsubscribeState=null;
     persistOwnerSyncRecovery();
     cloudStatus('逐筆讀取驗證失敗，已封鎖寫入且保留畫面：'+String(event.error||''),'error');
    }
   }
  });
  activeRecordStreamAdapter.start();
  return true;
 }catch(error){
  activeRecordMode='active-blocked';
  document.body.dataset.activeRecordMode=activeRecordMode;
  document.body.dataset.activeRecordState='blocked';
  persistOwnerSyncRecovery();
  cloudStatus('無法建立安全逐筆同步，已阻擋寫入：'+String(error?.message||error),'error');
  return false;
 }
}
function assertStagingV2PermanentFence(raw){
 const value=raw&&typeof raw==='object'?raw:null,epoch=value?.targetV2Epoch;if(!value||value.schema!=='danbridge-record-sync-v1-permanent-fence-v2'||value.state!=='permanently-fenced-after-atomic-v2-structural-activation'||value.environment!=='staging'||value.companyId!==COMPANY_ID||value.projectId!=='danbridge-d8877-staging'||value.fencePolicy!=='v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(String(epoch||''))||!/^[a-f0-9]{64}$/.test(String(value.fenceHash||''))||!/^[a-f0-9]{64}$/.test(String(value.activeControlHash||''))||!/^[a-f0-9]{64}$/.test(String(value.activeHeadHash||'')))throw new Error('staging V2 permanent fence identity invalid');return value;
}
function assertStagingV2RuntimeHead(raw,epoch){
 const value=raw&&typeof raw==='object'?raw:null;if(!value||value.environment!=='staging'||value.companyId!==COMPANY_ID||value.activationEpoch!==epoch||!Number.isSafeInteger(value.revision)||value.revision<0)throw new Error('staging V2 runtime head identity invalid');if(value.revision===0){if(value.schema!=='danbridge-active-record-v2-structural-head0-v2'||value.operationCount!==0||value.headSaveId!=='')throw new Error('staging V2 H0 identity invalid');return'h0'}if(value.schema!=='danbridge-active-record-authority-head-v2'||value.revision<1||!/^[a-f0-9]{64}$/.test(String(value.headHash||''))||!/^[a-f0-9]{64}$/.test(String(value.commitHash||'')))throw new Error('staging V2 Hn identity invalid');return'hn';
}
function stagingV2BrowserOperationSender(){
 if(!stagingV2AppCheck||DANBRIDGE_ENVIRONMENT!=='staging')throw new Error('staging V2 App Check unavailable');const browserClient=createStagingV2AuthoritySaveBrowserClient({projectId:firebaseConfig.projectId,appId:firebaseConfig.appId,origin:location.origin,getCurrentUser:()=>auth.currentUser,getIdToken:(user,force)=>user.getIdToken(force),getLimitedUseAppCheckToken:async()=>{const result=await getLimitedUseToken(stagingV2AppCheck);return result.token},fetch:globalThis.fetch.bind(globalThis),timeoutMs:30000});return createStagingV2ActiveRecordOperationSender({browserClient,getActor:()=>({uid:cloudUid,email:cloudEmailKey})});
}
async function confirmStagingV2DurablePrewriteBackup(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||!activeOwnerV2Fence||!activeOwnerControllerEpoch)throw new Error('staging V2 prewrite backup verifier is unavailable');
 const user=auth.currentUser,uid=user?.uid,email=typeof user?.email==='string'?user.email.trim().toLowerCase():'';
 if(!user||uid!==cloudUid||email!==cloudEmailKey||email!==OWNER_EMAIL)throw new Error('staging V2 prewrite backup verifier requires the same primary Owner');
 const read=async(path,label)=>{const snapshot=await getDocFromServer(doc(cloud,...path.split('/')));if(!snapshot.exists())throw new Error(label+' missing');return normalizeStagingV2FirestoreValue(snapshot.data())},fencePath=`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,epoch=activeOwnerV2Fence.targetV2Epoch,seedId=activeOwnerV2Fence.seedId,headPath=`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${epoch}`,proofPath=`stagingRecordSyncV1FrozenSourceProofs/${COMPANY_ID}/epochs/${activeOwnerV2Fence.sourceV1ActivationEpoch}/freezes/${activeOwnerV2Fence.sourceFreezeId}`;
 const [fence,headBefore,frozenSourceProof]=await Promise.all([read(fencePath,'staging V2 permanent fence'),read(headPath,'staging V2 head before backup verification'),read(proofPath,'staging V2 frozen source proof')]);
 if(fence.fenceHash!==activeOwnerV2Fence.fenceHash||fence.targetV2Epoch!==activeOwnerControllerEpoch)throw new Error('staging V2 permanent fence changed before prewrite verification');
 const rawBase=`stagingRecordSyncV1RawCutoverBackups/${COMPANY_ID}/epochs/${fence.sourceV1ActivationEpoch}/backups/${frozenSourceProof.rawBackupId}`,genesisBase=`stagingRecordSyncV2Genesis/${COMPANY_ID}/epochs/${epoch}/seeds/${seedId}`;
 const [rawBackupManifest,rawBackupReadback,genesisManifest,genesisReadback,genesisAuthority]=await Promise.all([read(rawBase,'staging immutable raw backup manifest'),read(`${rawBase}/readbackReceipts/complete`,'staging immutable raw backup readback'),read(`${genesisBase}/artifacts/manifest`,'staging V2 Genesis manifest'),read(`${genesisBase}/artifacts/readback`,'staging V2 Genesis readback'),read(`stagingRecordSyncV2GenesisAuthorities/${COMPANY_ID}/epochs/${epoch}/seeds/${seedId}`,'staging V2 Genesis authority')]);
 const headAfter=await read(headPath,'staging V2 head after backup verification');
 if(auth.currentUser!==user||auth.currentUser?.uid!==uid||String(auth.currentUser?.email||'').trim().toLowerCase()!==email)throw new Error('staging V2 Owner changed during prewrite backup verification');
 const evidence=verifyStagingV2PrewriteBackup({fence,frozenSourceProof,rawBackupManifest,rawBackupReadback,genesisManifest,genesisReadback,genesisAuthority,headBefore,headAfter});
 document.body.dataset.activeRecordPrewriteBackup=JSON.stringify(evidence);
 return true;
}
async function startOwnerStagingV2Runtime(){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner')return false;activeRecordMode='checking';document.body.dataset.activeRecordMode=activeRecordMode;const fenceSnapshot=await getDocFromServer(doc(cloud,'stagingRecordSyncV1PermanentFences',COMPANY_ID));if(!fenceSnapshot.exists())return startOwnerLegacyActiveRecordRuntime();const fence=assertStagingV2PermanentFence(normalizeStagingV2FirestoreValue(fenceSnapshot.data())),epoch=fence.targetV2Epoch;activeOwnerV2Fence=fence;await auth.currentUser?.getIdTokenResult?.(true);const headReference=doc(cloud,'stagingActiveRecordV2Heads',COMPANY_ID,'epochs',epoch),headSnapshot=await getDocFromServer(headReference);if(!headSnapshot.exists())throw new Error('staging V2 runtime head missing');activeOwnerV2HeadState=assertStagingV2RuntimeHead(normalizeStagingV2FirestoreValue(headSnapshot.data()),epoch);activeOwnerV2OperationSender=stagingV2BrowserOperationSender();const loader=createExplicitStagingV2AuthorityReadLoader();activeOwnerV2ReadDocuments=async()=>{const latestHeadSnapshot=await getDocFromServer(headReference);if(!latestHeadSnapshot.exists())throw new Error('staging V2 runtime head missing during authority read');const latestState=assertStagingV2RuntimeHead(normalizeStagingV2FirestoreValue(latestHeadSnapshot.data()),epoch);if(activeOwnerV2HeadState==='hn'&&latestState!=='hn')throw new Error('staging V2 authority head regressed from Hn to H0');activeOwnerV2HeadState=latestState;if(latestState==='h0')return stagingV2H0GenesisBaselineDocuments(await readActiveRecordDocumentsFromServer());const model=await loader.load({activationEpoch:epoch});return model.documentsByCollection};const documents=await activeOwnerV2ReadDocuments();document.body.dataset.activeRecordAuthority=activeOwnerV2HeadState==='h0'?'v2-h0-awaiting-first-daily':'v2-hn-authoritative';const rebuilt=rebuildFullRecordShadowDb(documents,{environment:'staging'}),controller=ensureActiveOwnerPageController(epoch);activeRoleBootstrapSourceDb=deepCopy(rebuilt.db);activeRecordMode='active';document.body.dataset.activeRecordMode=activeRecordMode;await controller.acceptCloudSnapshot({activationEpoch:epoch,db:rebuilt.db,hash:recordDataHash(rebuilt.db),writeAllowed:true});controller.setWriteAllowed(true);unsubscribeState?.();unsubscribeState=null;if(activeOwnerV2HeadState==='hn')queueInitialActiveRoleRecordViews();cloudStatus(activeOwnerV2HeadState==='h0'?'V2 已就緒，等待第一筆 staging 真實變更完成 H1。':'V2 權威逐筆同步已就緒。','ok');return true;
}
function startOwnerProductionRecordRuntime(){
 if(DANBRIDGE_ENVIRONMENT!=='production'||cloudRole!=='owner')return false;
 try{
  activeRecordStreamAdapter?.stop?.();activeRecordMode='checking';document.body.dataset.activeRecordMode=activeRecordMode;
  activeRecordStreamAdapter=createFirebaseProductionRecordStreamAdapter({
   subscribeDocument:activeFirestoreSubscribeDocument,
   subscribeCollection:activeFirestoreSubscribeCollection,
   onApply:acceptActiveOwnerSnapshot,
   onState:event=>{
    document.body.dataset.activeRecordState=event.state;
    if(event.state==='loading'){activeOwnerProductionReadDocuments=()=>activeRecordStreamAdapter.readDocuments();activeRecordMode='active-loading';document.body.dataset.activeRecordMode=activeRecordMode;activeRecordPageController?.setWriteAllowed(false);unsubscribeState?.();unsubscribeState=null;return}
    if(event.state==='ready'||event.state==='paused'){activeOwnerProductionReadDocuments=()=>activeRecordStreamAdapter.readDocuments();activeRecordMode='active';document.body.dataset.activeRecordMode=activeRecordMode;document.body.dataset.activeRecordAuthority='production-records-authoritative';activeRecordPageController?.setWriteAllowed(event.state==='ready');unsubscribeState?.();unsubscribeState=null;cloudStatus(event.state==='ready'?'正式逐筆同步已就緒。':'正式逐筆同步已中央暫停；畫面資料已保留。',event.state==='ready'?'ok':'pending');return}
    if(event.state==='blocked'){activeRecordMode='active-blocked';document.body.dataset.activeRecordMode=activeRecordMode;unsubscribeState?.();unsubscribeState=null;persistOwnerSyncRecovery();cloudStatus('production 逐筆讀回驗證失敗，已封鎖寫入且未覆蓋資料：'+String(event.error||''),'error')}
   }
  });
  activeOwnerProductionReadDocuments=()=>activeRecordStreamAdapter.readDocuments();activeRecordStreamAdapter.start();return true;
 }catch(error){activeRecordMode='active-blocked';document.body.dataset.activeRecordMode=activeRecordMode;document.body.dataset.activeRecordState='blocked';persistOwnerSyncRecovery();cloudStatus('無法建立 production 安全逐筆同步，已阻擋寫入：'+String(error?.message||error),'error');return false}
}
function startOwnerActiveRecordRuntime(){
 if(cloudRole!=='owner')return false;if(DANBRIDGE_ENVIRONMENT==='production')return startOwnerProductionRecordRuntime();if(DANBRIDGE_ENVIRONMENT!=='staging')return false;startOwnerStagingV2Runtime().catch(error=>{activeRecordMode='active-blocked';document.body.dataset.activeRecordMode=activeRecordMode;document.body.dataset.activeRecordState='blocked';persistOwnerSyncRecovery();cloudStatus('無法建立 staging V2 安全逐筆同步，已阻擋寫入：'+String(error?.message||error),'error')});return true;
}
window.__danbridgeCommitStagingV2H1=async()=>{
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||activeOwnerV2HeadState!=='h0'||activeRecordMode!=='active'||!activeRecordPageController)throw new Error('staging V2 H1 is not ready');const current=deepCopy(window.__danbridgeGetDB()),lesson=current.lessons.find(row=>String(row?.title||row?.name||'').startsWith('STAGING_')&&!String(row?.note||'').includes('[V2-H1-CUTOVER]'));if(!lesson)throw new Error('no exact staging-only lesson is available for H1');lesson.note=`${String(lesson.note||'').trim()} [V2-H1-CUTOVER]`.trim();window.__danbridgeSetDB(current);persistCurrentLocalView();window.renderAll?.();activeRecordPageController.queueLocalSave();const result=await activeRecordPageController.flush();if(result?.state!=='complete')throw new Error('staging V2 H1 did not complete: '+String(result?.error?.message||result?.reason||result?.state||'unknown'));activeOwnerV2HeadState='hn';document.body.dataset.activeRecordAuthority='v2-hn-authoritative';return{state:'complete',activationEpoch:activeOwnerControllerEpoch,readbackHash:result.readbackHash,counts:result.counts};
};
async function flushActiveOwnerState(){
 if(!['staging','production'].includes(DANBRIDGE_ENVIRONMENT)||activeRecordMode==='legacy')return null;if(!activeRecordPageController){cloudStatus('正在等待完整逐筆串流，本機資料已保留。','pending');return{state:'waiting-for-stream'}}const result=await activeRecordPageController.flush();if(result?.state==='complete'&&!activeRecordPageController.diagnostics().dirty){localDirtyHash='';ownerUploadQueued=false;clearOwnerSyncRecovery()}return result;
}

async function uploadOwnerState(force=false){
 if(cloudRole!=='owner'||applyingCloud)return;
 if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy')return flushActiveOwnerState();
 ownerUploadQueued=true;
 if(ownerUploadInFlight)return;
 if(!navigator.onLine){setOfflineStatus();return}
 const current=deepCopy(window.__danbridgeGetDB());
 const previousPublished=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):(ownerRecoveryBaseDB?deepCopy(ownerRecoveryBaseDB):null);
 const currentScore=window.__danbridgeDataScore?.(current)||0;
 if(currentScore===0){cloudStatus('已阻止空白資料上傳；請先確認本機或版本紀錄中的資料。','error');ownerUploadQueued=false;return}
 const estimatedMainBytes=ownerMainDocumentBytes(current);
 if(estimatedMainBytes>=1000000){
  ownerUploadCapacityBlocked=true;ownerUploadQueued=true;clearTimeout(ownerRetryTimer);clearTimeout(syncTimer);
  cloudStatus(`主資料已達 ${formatHealthBytes(estimatedMainBytes)}，超過安全寫入容量；本機變更與復原資料已保留，已停止自動重試。`,'error');
  persistOwnerSyncRecovery();renderSyncRecoveryCenter();return;
 }
 ownerUploadCapacityBlocked=false;
 const hash=dataHash(current);
 const shrink=ownerLessonShrinkRisk(previousPublished,current);
 if(shrink.risky&&approvedLessonShrinkHash!==hash){
  const approved=confirm(`安全檢查：這次同步會讓課程從 ${shrink.before} 堂減少為 ${shrink.after} 堂，共少 ${shrink.removed} 堂。\n\n如果這不是刻意的大量刪除，請按「取消」，資料將保留在本機且不會覆蓋雲端。`);
  if(!approved){ownerUploadQueued=false;cloudStatus(`已阻止大量課程減少（${shrink.removed} 堂）覆蓋雲端，請先檢查課表。`,'error');persistOwnerSyncRecovery();renderSyncRecoveryCenter();return}
  approvedLessonShrinkHash=hash;
 }
 const uploadMutationVersion=localMutationVersion;
 if(!force&&hash===lastUploadedHash){ownerUploadQueued=false;localDirtyHash='';cloudStatus('資料已是最新版本','ok');return}
 ownerUploadInFlight=true;ownerUploadQueued=false;cloudStatus('雲端同步中…','pending');
 let syncStage='主資料';
 try{
   // V15.29.2：主資料是同步成功的唯一必要條件。老師／校區檢視與舊 ID 遷移改為背景工作，
   // 避免任何附屬文件或歷史遷移卡住，讓畫面永久停在「準備同步」。
   const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main');
   const committed=await withSyncTimeout(runTransaction(cloud,async transaction=>{
     const mainSnap=await transaction.get(mainRef),remoteBefore=mainSnap.exists()?deepCopy(mainSnap.data()?.db):emptyDB(),remoteHash=mainSnap.exists()?(mainSnap.data()?.clientHash||dataHash(remoteBefore)):'';
     // 舊版恢復標記沒有保存 Base；這種情況以空 Base 做保守合併，寧可保留雙方資料與衝突備份，也不整份覆蓋遠端。
     const mergeBase=previousPublished||(localDirtyHash?emptyDB():null),baselineHash=mergeBase?dataHash(mergeBase):remoteHash;
     const mergeResult=remoteHash&&remoteHash!==baselineHash?mergeConcurrentOwnerDB(mergeBase,current,remoteBefore):{db:current,conflicts:[]};
     const finalDb=mergeResult.db,finalHash=dataHash(finalDb),immutableAudit=buildImmutableDataAudit(remoteBefore,finalDb);
     let audit=null,existingAudit=null;if(immutableAudit){immutableAudit.eventId=`data-${immutableAudit.beforeHash}-${immutableAudit.afterHash}`;audit=immutableAuditRecord(immutableAudit);existingAudit=await transaction.get(audit.ref)}
     // 所有 transaction.get 都必須在第一個寫入前完成。
     const conflictParts=mergeResult.conflicts.length?conflictBackupParts(mergeResult.conflicts):[],conflictRefs=conflictParts.map(()=>doc(collection(cloud,'companies',COMPANY_ID,'syncConflictBackups'))),backupId=conflictRefs[0]?.id||'';
     transaction.set(mainRef,{db:finalDb,updatedAt:serverTimestamp(),updatedBy:cloudUid,clientHash:finalHash},{merge:false});
     if(audit&&!existingAudit.exists())transaction.set(audit.ref,audit.payload);
     conflictRefs.forEach((ref,index)=>transaction.set(ref,{companyId:COMPANY_ID,backupId,actorUid:cloudUid,actorEmail:cloudEmailKey,baseHash:baselineHash,remoteHash,mergedHash:finalHash,conflictCount:mergeResult.conflicts.length,partIndex:index,partCount:conflictParts.length,encoding:'json',payload:conflictParts[index],createdAt:serverTimestamp(),release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT},{merge:false}));
     return{remoteBefore,finalDb,finalHash,conflicts:mergeResult.conflicts.length};
   }),10000);
   const latestLocal=deepCopy(window.__danbridgeGetDB()),latestDb=uploadMutationVersion===localMutationVersion?committed.finalDb:mergeConcurrentOwnerDB(current,latestLocal,committed.finalDb).db;
   applyingCloud=true;window.__danbridgeSetDB(deepCopy(latestDb));persistCurrentLocalView();window.renderAll?.();applyingCloud=false;
   lastUploadedHash=committed.finalHash;lastCloudSnapshotHash=committed.finalHash;approvedLessonShrinkHash='';ownerRetryCount=0;
   const latestHash=dataHash(window.__danbridgeGetDB());
   const confirmation=ownerUploadConfirmation(uploadMutationVersion,localMutationVersion,committed.finalHash,latestHash);
   if(confirmation.clearDirty){localDirtyHash='';clearOwnerSyncRecovery()}else persistOwnerSyncRecovery();
   if(confirmation.queueNext)ownerUploadQueued=true;
   cloudStatus(localDirtyHash?'目前變更已同步，另有新變更準備同步…':committed.conflicts?`已安全合併同步；${committed.conflicts} 個同筆衝突已保留復原紀錄`:'已同步到雲端','ok');

   // 主資料成功後立即發布各角色檢視，不等待通知文件完成。
   publishRoleViewsWithRetry(committed.finalDb);
   queueStagingShadowGeneration(committed.finalDb,committed.finalHash);

   queueScheduleChangeNotifications(committed.remoteBefore,committed.finalDb,committed.finalHash);
   lastPublishedOwnerDB=deepCopy(committed.finalDb);ownerBaselineReady=true;
   scheduleDailyCloudBackup();renderSyncRecoveryCenter();
   if(!legacyMigrationStarted){
     legacyMigrationStarted=true;
     migrateLegacyLessonCloudDocuments().catch(e=>console.error('Legacy lesson migration background task failed',e));
   }
 }catch(e){
   const capacityBlocked=ownerUploadCapacityError(e);ownerUploadCapacityBlocked=capacityBlocked;
   console.error('Owner cloud sync failed at '+syncStage,e);reportOperationalError(e,{category:'cloud-write',area:'owner-upload',retryable:!capacityBlocked});ownerUploadQueued=true;if(!capacityBlocked)ownerRetryCount++;
   if(capacityBlocked)clearTimeout(ownerRetryTimer);
   const retrying=navigator.onLine&&ownerRetryCount<3;
   cloudStatus(capacityBlocked?'主資料超過 Firestore 1 MiB 上限；本機變更與復原資料已保留，已停止自動重試。':(navigator.onLine?`雲端連線較慢（${syncStage}），系統正在自動重試：`:'目前離線，變更已保存在本機：')+(e.message||e),capacityBlocked?'error':navigator.onLine?(retrying?'pending':'error'):'offline');
   persistOwnerSyncRecovery();renderSyncRecoveryCenter();
   scheduleOwnerRetry();
 }finally{
   ownerUploadInFlight=false;
   if(ownerUploadQueued&&navigator.onLine){clearTimeout(syncTimer);if(ownerRetryCount)scheduleOwnerRetry();else syncTimer=setTimeout(()=>uploadOwnerState(),80);}
 }
}
function queueOwnerCloudSave(){
 if(cloudRole!=='owner')return;
 const nextHash=dataHash(window.__danbridgeGetDB());
 if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy'){
  const diagnostics=activeRecordPageController?.diagnostics?.()||null,intent=decideOwnerActiveSaveIntent({nextHash,localDirtyHash,lastUploadedHash,diagnostics,applyingCloud});
  if(intent.action==='ignore-cloud-apply'||intent.action==='noop-confirmed')return;
  if(intent.action==='coalesce'){ownerUploadQueued=true;persistOwnerSyncRecovery();return}
  if(intent.action==='recover'){
   ownerUploadQueued=true;persistOwnerSyncRecovery();activeRecordPageController?.queueLocalSave();cloudStatus(navigator.onLine?'逐筆待同步資料已重新接回永久日誌。':'逐筆待同步資料仍保存在本機；恢復網路後續傳。',navigator.onLine?'pending':'offline');return;
  }
 }
 if(!localDirtyHash)ownerRecoveryBaseDB=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):null;
 localMutationVersion++;
 localDirtyHash=nextHash;
 persistOwnerSyncRecovery();
 ownerUploadQueued=true;
 if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy'){
  activeRecordPageController?.queueLocalSave();cloudStatus(navigator.onLine?'逐筆變更與待同步標記已永久保存在本機，正在建立操作日誌…':'逐筆變更與待同步標記已永久保存在本機；恢復網路後建立日誌並續傳。',navigator.onLine?'pending':'offline');return;
 }
 cloudStatus(navigator.onLine?'變更已儲存，準備同步…':'變更已保存在本機；恢復網路後自動同步。',navigator.onLine?'pending':'offline');
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),120);
}
function lessonMap(rows=[]){return new Map(rows.map(row=>[String(row.id),row]))}
async function queueSchedulerChanges(){
 if(!cloudCanManageSchedule||applyingCloud)return;
 if(DANBRIDGE_ENVIRONMENT==='staging'&&activeRecordMode!=='legacy'&&!activeRoleWriteAllowed){cloudStatus('aa 逐筆寫入尚未安全開放；本機修改已保留，不會送出。','pending');return}
 if(schedulerRecoveryHold){cloudStatus('已進入 aa 救援唯讀鎖定；確認恢復來源前不會上傳或覆蓋資料','pending');return}
 const current=(window.__danbridgeGetDB?.().lessons||[]).map(schedulerSafeLesson),before=lessonMap(schedulerBaselineLessons),after=lessonMap(current),jobs=[];
 for(const id of new Set([...before.keys(),...after.keys()])){
   const old=before.get(id),next=after.get(id);if(JSON.stringify(old)===JSON.stringify(next))continue;
   const operation=!old?'create':!next?'delete':'update',lesson=next||old,ref=doc(collection(cloud,'companies',COMPANY_ID,'scheduleRequests'));
   const student=operation!=='delete'?schedulerSafeStudent((window.__danbridgeGetDB?.().students||[]).find(s=>String(s.id)===String(lesson.studentId))||{}):undefined;
   jobs.push({id,next,ref,payload:{companyId:COMPANY_ID,operation,lessonId:id,lesson,...(student?.id?{student}:{}),actorUid:cloudUid,actorEmail:cloudEmailKey,createdAt:serverTimestamp(),status:'pending'}});
 }
 if(!jobs.length)return;
 cloudStatus(`aa 排課異動正在逐筆安全送出，共 ${jobs.length} 筆…`,'pending');const progress=lessonMap(schedulerBaselineLessons);let sent=0;
 for(const job of jobs){
  try{await setDoc(job.ref,job.payload,{merge:false})}
  catch(e){schedulerUploadRetryCount++;const wait=Math.min(30000,1000*2**Math.min(schedulerUploadRetryCount,5));clearTimeout(schedulerUploadRetryTimer);schedulerUploadRetryTimer=setTimeout(()=>scheduleSchedulerChanges(),wait);schedulerBaselineLessons=[...progress.values()];persistCurrentLocalView();cloudStatus(`aa 已送出 ${sent} 筆，剩餘 ${jobs.length-sent} 筆於 ${Math.ceil(wait/1000)} 秒後自動續傳：`+(e.message||e),'pending');return}
  if(job.next)progress.set(job.id,deepCopy(job.next));else progress.delete(job.id);schedulerBaselineLessons=[...progress.values()];sent++;persistCurrentLocalView();cloudStatus(`aa 課表續傳中：已送出 ${sent} / ${jobs.length} 筆`,'pending');
 }
 schedulerUploadRetryCount=0;clearTimeout(schedulerUploadRetryTimer);window.renderAll?.();cloudStatus(`課表已立即更新，${sent} 筆異動正在同步給 Owner、校區管理者與老師`,'ok');
}
function scheduleSchedulerChanges(){
 const local=window.__danbridgeGetDB?.()||{},current=(local.lessons||[]).map(schedulerSafeLesson),before=lessonMap(schedulerBaselineLessons),after=lessonMap(current),beforeStudents=lessonMap(schedulerBaselineStudents),afterStudents=lessonMap((local.students||[]).map(schedulerSafeStudent));
 for(const id of new Set([...before.keys(),...after.keys()]))if(JSON.stringify(before.get(id))!==JSON.stringify(after.get(id)))schedulerOptimisticLessons.set(id,after.get(id)||null);
 for(const id of new Set([...beforeStudents.keys(),...afterStudents.keys()]))if(JSON.stringify(beforeStudents.get(id))!==JSON.stringify(afterStudents.get(id)))schedulerOptimisticStudents.set(id,afterStudents.get(id)||null);
 schedulerSaveChain=schedulerSaveChain.catch(()=>{}).then(queueSchedulerChanges);
 return schedulerSaveChain;
}
function buildSchedulerRequestTarget(beforeDb,data,{viewDb=emptyDB()}={}){
 const before=deepCopy(beforeDb),after=deepCopy(before),id=String(data?.lessonId||''),operation=String(data?.operation||''),index=(after.lessons||[]).findIndex(lesson=>String(lesson.id)===id),lesson=schedulerSafeLesson(data?.lesson||{});if(!['create','update','delete'].includes(operation)||!id||String(lesson.id||'')!==id)throw new Error('排課異動 identity 不一致');const alreadyApplied=operation==='delete'?index<0:index>=0&&JSON.stringify(schedulerSafeLesson(after.lessons[index]))===JSON.stringify(lesson);if(alreadyApplied)return{before,after,id,lesson,operation,changed:false};if(operation==='delete'){if(index>=0)after.lessons.splice(index,1);return{before,after,id,lesson,operation,changed:true}}if(!(after.students||[]).some(student=>String(student.id)===String(lesson.studentId))){const requestStudent=schedulerSafeStudent(data.student||{}),viewStudent=schedulerSafeStudent((viewDb.students||[]).find(student=>String(student.id)===String(lesson.studentId))||{}),student=requestStudent.id?requestStudent:viewStudent,unchangedOrphanStudent=operation==='update'&&index>=0&&String(after.lessons[index]?.studentId||'')===String(lesson.studentId||''),approvedLegacyCreate=operation==='create'&&SCHEDULER_ACCOUNT_EMAILS.has(String(data.actorEmail||'').trim().toLowerCase())&&String(lesson.studentId||'');if(student.id===String(lesson.studentId)&&String(student.name||'').trim())after.students.push({...student,billing:'hour',rate:0,note:''});else if(approvedLegacyCreate)after.students.push({id:String(lesson.studentId),name:'待補學生資料',status:'在讀',courseType:'1對1',branchIds:lesson.branchId?[String(lesson.branchId)]:[],billing:'hour',rate:0,note:'由舊版 aa 待同步課程保留，請 Owner 補正學生姓名與資料'});else if(!unchangedOrphanStudent)throw new Error('排課異動包含不存在的學生')}if(!lessonTeacherIds(lesson).every(teacherId=>(after.teachers||[]).some(teacher=>String(teacher.id)===teacherId)))throw new Error('排課異動包含不存在的老師');if(index>=0)after.lessons[index]={...after.lessons[index],...lesson};else after.lessons.push({...lesson,paymentStatus:'unpaid',chargeStudent:'yes',payTeacher:'yes',note:''});return{before,after,id,lesson,operation,changed:true};
}
async function applyActiveSchedulerRequest(requestRef,data){
 if(DANBRIDGE_ENVIRONMENT!=='staging'||cloudRole!=='owner'||activeRecordMode!=='active'||!activeRecordPageController)throw Object.assign(new Error('逐筆同步尚未可處理 aa 要求'),{code:'unavailable'});
 const requestSnapshot=await getDoc(requestRef);if(!requestSnapshot.exists()||requestSnapshot.data()?.status!=='pending')return;
 const currentData=requestSnapshot.data(),target=buildSchedulerRequestTarget(window.__danbridgeGetDB(),currentData);let confirmed;
 if(target.changed){
  applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(target.after));persistCurrentLocalView();window.renderAll?.()}finally{applyingCloud=false}
  queueOwnerCloudSave();const result=await flushActiveOwnerState();if(!['complete','pending'].includes(result?.state)||!result.readbackDb)throw Object.assign(new Error('排課異動逐筆同步尚未完成'),{code:'unavailable'});confirmed=result.readbackDb;
 }else{const documents=await readActiveRecordDocuments();confirmed=rebuildFullRecordShadowDb(documents,{environment:'staging'}).db}
 const confirmedLesson=(confirmed.lessons||[]).find(lesson=>String(lesson.id)===target.id),confirmedApplied=target.operation==='delete'?!confirmedLesson:!!confirmedLesson&&JSON.stringify(schedulerSafeLesson(confirmedLesson))===JSON.stringify(target.lesson);if(!confirmedApplied)throw Object.assign(new Error('排課異動完整讀回尚未確認'),{code:'aborted'});
 const audit=buildImmutableDataAudit(target.before,target.after),auditRecord=audit?(()=>{audit.eventId=`scheduler-${requestSnapshot.id}`;return immutableAuditRecord(audit)})():null,marked=await runTransaction(cloud,async transaction=>{const snapshots=await Promise.all([transaction.get(requestRef),...(auditRecord?[transaction.get(auditRecord.ref)]:[])]),latest=snapshots[0];if(!latest.exists()||latest.data()?.status!=='pending')return false;if(auditRecord&&!snapshots[1].exists())transaction.set(auditRecord.ref,{...auditRecord.payload,action:`scheduler-schedule-${target.operation}`,targetType:'lesson',targetId:target.id,entityChanges:[...auditRecord.payload.entityChanges,`requested-by:${currentData.actorEmail}`].slice(0,80)});transaction.set(requestRef,{status:'applied',appliedAt:serverTimestamp(),appliedBy:cloudUid},{merge:true});return true});
 if(marked&&target.changed)queueScheduleChangeNotifications(target.before,target.after,`scheduler-${requestSnapshot.id}`,{uid:currentData.actorUid,name:SCHEDULER_ACCOUNT_EMAILS.has(String(currentData.actorEmail||'').toLowerCase())?'aa':'排課專員'});
}
async function applySchedulerRequest(requestRef,data){
 if(cloudRole!=='owner'||data?.status!=='pending')return;
 if(DANBRIDGE_ENVIRONMENT==='staging'&&activeRecordMode!=='legacy')return applyActiveSchedulerRequest(requestRef,data);
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),schedulerViewRef=doc(cloud,'companies',COMPANY_ID,'schedulerViews',String(data.actorEmail||'').trim().toLowerCase());
 let notificationBefore=null,notificationAfter=null;
 await runTransaction(cloud,async transaction=>{
   const [requestSnap,mainSnap,schedulerViewSnap]=await Promise.all([transaction.get(requestRef),transaction.get(mainRef),transaction.get(schedulerViewRef)]);if(!requestSnap.exists()||requestSnap.data()?.status!=='pending'||!mainSnap.exists())return;
   const before=deepCopy(mainSnap.data()?.db),after=deepCopy(before),id=String(data.lessonId||''),index=(after.lessons||[]).findIndex(l=>String(l.id)===id),lesson=schedulerSafeLesson(data.lesson||{});
   if(!id||String(lesson.id||'')!==id)throw new Error('排課異動 ID 不一致');
   const alreadyApplied=data.operation==='delete'?index<0:index>=0&&JSON.stringify(schedulerSafeLesson(after.lessons[index]))===JSON.stringify(lesson);
   if(alreadyApplied){transaction.set(requestRef,{status:'applied',appliedAt:serverTimestamp(),appliedBy:cloudUid},{merge:true});return}
   if(data.operation==='delete'){if(index>=0)after.lessons.splice(index,1)}
   else {if(!(after.students||[]).some(s=>String(s.id)===String(lesson.studentId))){const requestStudent=schedulerSafeStudent(data.student||{}),viewStudent=schedulerSafeStudent((schedulerViewSnap.data()?.db?.students||[]).find(s=>String(s.id)===String(lesson.studentId))||{}),student=requestStudent.id?requestStudent:viewStudent,unchangedOrphanStudent=data.operation==='update'&&index>=0&&String(after.lessons[index]?.studentId||'')===String(lesson.studentId||''),approvedLegacyCreate=data.operation==='create'&&SCHEDULER_ACCOUNT_EMAILS.has(String(data.actorEmail||'').trim().toLowerCase())&&String(lesson.studentId||'');if(student.id===String(lesson.studentId)&&String(student.name||'').trim())after.students.push({...student,billing:'hour',rate:0,note:''});else if(approvedLegacyCreate)after.students.push({id:String(lesson.studentId),name:'待補學生資料',status:'在讀',courseType:'1對1',branchIds:lesson.branchId?[String(lesson.branchId)]:[],billing:'hour',rate:0,note:'由舊版 aa 待同步課程保留，請 Owner 補正學生姓名與資料'});else if(!unchangedOrphanStudent)throw new Error('排課異動包含不存在的學生')}if(!lessonTeacherIds(lesson).every(tid=>(after.teachers||[]).some(t=>String(t.id)===tid)))throw new Error('排課異動包含不存在的老師');if(index>=0)after.lessons[index]={...after.lessons[index],...lesson};else after.lessons.push({...lesson,paymentStatus:'unpaid',chargeStudent:'yes',payTeacher:'yes',note:''})}
   notificationBefore=before;notificationAfter=after;
   const audit=buildImmutableDataAudit(before,after),auditRecord=audit?(()=>{audit.eventId=`scheduler-${requestSnap.id}`;return immutableAuditRecord(audit)})():null,auditSnap=auditRecord?await transaction.get(auditRecord.ref):null,hash=dataHash(after);transaction.set(mainRef,{db:after,updatedAt:serverTimestamp(),updatedBy:data.actorUid,clientHash:hash},{merge:false});
   if(auditRecord&&!auditSnap.exists())transaction.set(auditRecord.ref,{...auditRecord.payload,action:`scheduler-schedule-${data.operation}`,targetType:'lesson',targetId:id,entityChanges:[...auditRecord.payload.entityChanges,`requested-by:${data.actorEmail}`].slice(0,80)});
   transaction.set(requestRef,{status:'applied',appliedAt:serverTimestamp(),appliedBy:cloudUid},{merge:true});
 });
 if(notificationAfter){publishRoleViewsWithRetry(notificationAfter);queueStagingShadowGeneration(notificationAfter,dataHash(notificationAfter))}
 if(notificationBefore&&notificationAfter)queueScheduleChangeNotifications(notificationBefore,notificationAfter,`scheduler-${requestRef.id}`,{uid:data.actorUid,name:SCHEDULER_ACCOUNT_EMAILS.has(String(data.actorEmail||'').toLowerCase())?'aa':'排課專員'});
}
function subscribeSchedulerRequests(){
 unsubscribeScheduleRequests?.();unsubscribeScheduleRequests=null;if(cloudRole!=='owner')return;
 const q=query(collection(cloud,'companies',COMPANY_ID,'scheduleRequests'),where('status','==','pending'));
 unsubscribeScheduleRequests=onSnapshot(q,snap=>{for(const d of snap.docs){if(schedulerRequestQueueIds.has(d.id))continue;schedulerRequestQueueIds.add(d.id);schedulerRequestQueue.push({id:d.id,ref:d.ref,data:d.data(),attempt:0})}processSchedulerRequestQueue()});
}
async function processSchedulerRequestQueue(){
 if(schedulerRequestWorkerActive||cloudRole!=='owner')return;schedulerRequestWorkerActive=true;clearTimeout(schedulerRequestRetryTimer);
 while(schedulerRequestQueue.length&&cloudRole==='owner'){
  const item=schedulerRequestQueue[0];
  try{await applySchedulerRequest(item.ref,item.data);schedulerRequestQueue.shift();schedulerRequestQueueIds.delete(item.id);schedulerAppliedRequestCount++;cloudStatus(schedulerRequestQueue.length?`aa 課表續傳中：已處理 ${schedulerAppliedRequestCount} 筆，剩餘 ${schedulerRequestQueue.length} 筆`:`雲端資料已更新：aa 課表同步完成，共處理 ${schedulerAppliedRequestCount} 筆，剩餘 0 筆`,schedulerRequestQueue.length?'pending':'ok')}
  catch(e){item.attempt++;console.error('Scheduler request failed',e);const retryable=['resource-exhausted','unavailable','aborted','deadline-exceeded','cancelled','internal','unknown'].includes(String(e?.code||'').replace(/^firestore\//,''));if(!retryable){schedulerRequestQueue.shift();schedulerQuarantinedRequestIds.add(item.id);cloudStatus(`已隔離 1 筆異常課程，繼續套用後面 ${schedulerRequestQueue.length} 筆；異常資料仍保留待修復`,'pending');continue}const wait=Math.min(30000,1000*2**Math.min(item.attempt,5));cloudStatus(`aa 排課異動暫緩，${Math.ceil(wait/1000)} 秒後自動續傳：`+(e.message||e),'pending');schedulerRequestWorkerActive=false;schedulerRequestRetryTimer=setTimeout(processSchedulerRequestQueue,wait);return}
 }
 schedulerRequestWorkerActive=false;
}
function installCloudSave(){
 window.__danbridgeQueueCloudSave=queueOwnerCloudSave;
 window.saveDB=function(options={}){
   if(cloudRole==='teacher'&&cloudCanManageSchedule){const result=originalSaveDB?.(options);scheduleSchedulerChanges().catch(e=>{console.error(e);cloudStatus('aa 排課同步失敗：'+(e.message||e),'error')});return result}
   if(cloudRole==='teacher'||cloudRole==='branch_manager'){alert(cloudRole==='teacher'?'老師帳號目前為唯讀，只能查看自己的課表。':'校區管理者目前為唯讀，只能查看指定校區資料。');return}
   return originalSaveDB?.(options);
 };
}
function subscribeOwnerLegacy(){
 if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy')return;
 const ref=doc(cloud,'companies',COMPANY_ID,'data','main');
 unsubscribeState?.();
 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},async snap=>{
   if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)&&activeRecordMode!=='legacy')return;
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   const localBest=window.__danbridgeRecoverBestLocalDB?.();
   if(!snap.exists()){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));window.renderAll?.();applyingCloud=false;
       cloudStatus('雲端尚無資料，已載入 '+localBest.label+'，正在建立雲端資料…');
       await uploadOwnerState();
     }else cloudStatus('雲端尚無資料，且這台裝置找不到可恢復的資料。','error');
     return;
   }
   const incoming=snap.data()?.db;
   const incomingHash=snap.data()?.clientHash||dataHash(incoming);
   const incomingScore=window.__danbridgeDataScore?.(incoming)||0;
   if(!incoming||incomingScore===0){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));
       try{localStorage.setItem('danbridge_scheduler_v1',JSON.stringify(window.__danbridgeGetDB()))}catch{}
       window.renderAll?.();applyingCloud=false;
       cloudStatus('偵測到空白雲端資料，已從 '+localBest.label+' 恢復並重新同步…','error');
       await uploadOwnerState();
     }else cloudStatus('雲端資料為空，這台裝置也找不到可恢復版本；系統沒有再寫入空資料。','error');
     return;
   }
   if(snap.metadata.hasPendingWrites)return;
   cleanupExpiredScheduleNotifications();
   const currentHash=dataHash(window.__danbridgeGetDB());
   // 本機尚有未確認上傳的修改時，任何不同版本的遠端快照都視為舊資料。
   // 這可防止拖曳、編輯或批次操作在 debounce / 網路延遲期間被倒灌復原。
   const snapshotDecision=ownerSnapshotDecision(localDirtyHash,incomingHash,currentHash,lastCloudSnapshotHash);
   if(snapshotDecision==='ignore-dirty'){
     cloudStatus('本機變更等待雲端確認，已忽略較舊的雲端資料…','pending');
     if(!ownerUploadInFlight){clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),80);}
     return;
   }
   if(snapshotDecision==='unchanged'){publishRoleViewsWithRetry(incoming);return}
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   lastCloudSnapshotHash=incomingHash;lastUploadedHash=incomingHash;
   lastPublishedOwnerDB=deepCopy(incoming);ownerBaselineReady=true;
   if(localDirtyHash===incomingHash){localDirtyHash='';clearOwnerSyncRecovery()}
   scheduleDailyCloudBackup();renderSyncRecoveryCenter();
   publishRoleViewsWithRetry(incoming);
   cloudStatus(`雲端資料已更新：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{console.error('owner snapshot',err);reportOperationalError(err,{category:'cloud-read',area:'owner-snapshot',retryable:true});cloudStatus('讀取雲端主資料失敗：'+(err.message||err),'error')});
}
function subscribeOwner(){
 unsubscribeState?.();unsubscribeState=null;if(['staging','production'].includes(DANBRIDGE_ENVIRONMENT)){startOwnerActiveRecordRuntime();return}activeRecordMode='legacy';subscribeOwnerLegacy();
}
function applyTeacherRecordView(raw,{verified=false}={}){
 if(!verified&&(window.__danbridgeDataScore?.(raw)||0)===0){cloudStatus('老師課表檢視為空；已保留最後可用資料。','error');return}const incoming=filteredTeacherDB(raw,cloudTeacherId);applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(incoming));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150)}finally{applyingCloud=false}cloudStatus('老師課表已逐筆同步','ok');
}
function applySchedulerRecordView(raw){
 showSchedulerRecoveryInspector();const incoming=filteredSchedulerDB(raw),serverLessons=lessonMap(incoming.lessons),serverStudents=lessonMap(incoming.students),serverBaselineLessons=deepCopy(incoming.lessons),serverBaselineStudents=deepCopy(incoming.students);let recoveredAtStartup=false;if(!schedulerStartupRecoveryChecked){schedulerStartupRecoveryChecked=true;const local=filteredSchedulerDB(window.__danbridgeGetDB?.()||emptyDB()),localLessons=lessonMap(local.lessons),localStudents=lessonMap(local.students);for(const [id,row] of localLessons)if(JSON.stringify(serverLessons.get(id))!==JSON.stringify(row)){schedulerOptimisticLessons.set(id,deepCopy(row));recoveredAtStartup=true}for(const [id,row] of localStudents)if(JSON.stringify(serverStudents.get(id))!==JSON.stringify(row)){schedulerOptimisticStudents.set(id,deepCopy(row));recoveredAtStartup=true}if(recoveredAtStartup)schedulerRecoveryHold=true}for(const [id,desired] of [...schedulerOptimisticLessons]){const server=serverLessons.get(id);if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticLessons.delete(id);continue}if(desired===null)serverLessons.delete(id);else serverLessons.set(id,deepCopy(desired))}for(const [id,desired] of [...schedulerOptimisticStudents]){const server=serverStudents.get(id);if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticStudents.delete(id);continue}if(desired===null)serverStudents.delete(id);else serverStudents.set(id,deepCopy(desired))}incoming.lessons=[...serverLessons.values()];incoming.students=[...serverStudents.values()];schedulerBaselineLessons=recoveredAtStartup?serverBaselineLessons:deepCopy(incoming.lessons);schedulerBaselineStudents=recoveredAtStartup?serverBaselineStudents:deepCopy(incoming.students);applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(incoming));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.()}finally{applyingCloud=false}cloudStatus(schedulerRecoveryHold?'發現 aa 本機與雲端不一致，已唯讀鎖定；請先檢查本機救援資料':'aa 全老師課表已逐筆同步',schedulerRecoveryHold?'pending':'ok');
}
function applyBranchManagerRecordView(raw){
 const incoming=filteredBranchDB(raw,cloudBranchIds);applyingCloud=true;try{window.__danbridgeSetDB(deepCopy(incoming));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150)}finally{applyingCloud=false}cloudStatus(`校區資料已逐筆同步：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
}
function startRoleActiveRecordRuntime(identity,applyView,startLegacy){
 unsubscribeState?.();
 unsubscribeState=null;
 activeRoleStreamAdapter?.stop?.();
 if(DANBRIDGE_ENVIRONMENT!=='staging'){
  activeRecordMode='legacy';
  activeRoleWriteAllowed=true;
  startLegacy();
  return;
 }
 activeRecordMode='checking';
 activeRoleWriteAllowed=false;
 document.body.dataset.activeRecordMode=activeRecordMode;
 activeRoleStreamAdapter=createFirebaseRoleRecordStreamAdapter({
  environment:'staging',
  identity,
  subscribeDocument:activeFirestoreSubscribeDocument,
  subscribeCollection:activeFirestoreSubscribeCollection,
  onApply:async snapshot=>{
   activeRoleWriteAllowed=snapshot.writeAllowed===true;
   applyView(snapshot.db,{verified:true,snapshot});
  },
  onState:event=>{
   document.body.dataset.activeRoleRecordState=event.state;
   if(event.state==='legacy'){
    activeRecordMode='legacy';
    activeRoleWriteAllowed=true;
    document.body.dataset.activeRecordMode=activeRecordMode;
    startLegacy();
    return;
   }
   if(['loading','waiting'].includes(event.state)){
    activeRecordMode='active-loading';
    activeRoleWriteAllowed=false;
    document.body.dataset.activeRecordMode=activeRecordMode;
    unsubscribeState?.();
    unsubscribeState=null;
    return;
   }
   if(event.state==='ready'||event.state==='paused'){
    activeRecordMode='active';
    activeRoleWriteAllowed=event.state==='ready';
    document.body.dataset.activeRecordMode=activeRecordMode;
    unsubscribeState?.();
    unsubscribeState=null;
    if(activeRoleWriteAllowed&&cloudCanManageSchedule&&(schedulerOptimisticLessons.size||schedulerOptimisticStudents.size))scheduleSchedulerChanges();
    return;
   }
   if(event.state==='blocked'){
    activeRecordMode='active-blocked';
    activeRoleWriteAllowed=false;
    document.body.dataset.activeRecordMode=activeRecordMode;
    unsubscribeState?.();
    unsubscribeState=null;
    cloudStatus('角色逐筆資料驗證失敗，已保留畫面並封鎖寫入：'+String(event.error||''),'error');
   }
  }
 });
 activeRoleStreamAdapter.start();
}
async function subscribeTeacherLegacy(){
 if(!cloudTeacherId)throw new Error('老師帳號尚未綁定 teacherId。');
 if(!cloudEmailKey)throw new Error('無法取得老師 Gmail。');
 // 老師檢視以 Gmail 作為文件 ID：老闆可在老師首次登入前就建立與更新。
 const ref=doc(cloud,'companies',COMPANY_ID,'teacherViews',cloudEmailKey);
 unsubscribeState?.();

 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     const best=window.__danbridgeRecoverBestLocalDB?.();
     if(best){applyingCloud=true;window.__danbridgeSetDB(filteredTeacherDB(best.db,cloudTeacherId));window.renderAll?.();applyingCloud=false;}
     cloudStatus('尚未建立這位老師的課表檢視；已保留最後可用資料，請老闆登入重新發布。','error');
     return;
   }
   const raw=snap.data()?.db||emptyDB();
   if((window.__danbridgeDataScore?.(raw)||0)===0){cloudStatus('老師課表檢視為空；已保留最後可用資料。','error');return;}
   // 前端再次依 teacherId 過濾，防止舊檢視夾帶其他老師資料。
   const incoming=filteredTeacherDB(raw,cloudTeacherId);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus('老師課表已同步','ok');
 },err=>{
   console.error('讀取老師課表失敗',err);
   reportOperationalError(err,{category:'cloud-read',area:'teacher-view',retryable:true});
   cloudStatus('讀取老師課表失敗：'+(err.message||err),'error');
 });
}

async function subscribeTeacher(){
 if(!cloudTeacherId||!cloudEmailKey)throw new Error('老師帳號尚未完成綁定。');startRoleActiveRecordRuntime({email:cloudEmailKey,kind:'teacher',teacherId:cloudTeacherId,branchIds:[]},applyTeacherRecordView,subscribeTeacherLegacy);
}

async function subscribeSchedulerTeacherLegacy(){
 if(!cloudTeacherId||!cloudEmailKey)throw new Error('aa 排課帳號尚未完成綁定。');
 const ref=doc(cloud,'companies',COMPANY_ID,'schedulerViews',cloudEmailKey);unsubscribeState?.();
 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.hasPendingWrites)return;const view=snap.data()||{},raw=view.db;
   if(!raw)return cloudStatus('排課專員資料尚未發布，請 Owner 重新儲存帳號權限。','error');
   showSchedulerRecoveryInspector();const incoming=filteredSchedulerDB(raw),serverLessons=lessonMap(incoming.lessons),serverStudents=lessonMap(incoming.students),serverBaselineLessons=deepCopy(incoming.lessons),serverBaselineStudents=deepCopy(incoming.students);let recoveredAtStartup=false;
   if(!schedulerStartupRecoveryChecked){schedulerStartupRecoveryChecked=true;const local=filteredSchedulerDB(window.__danbridgeGetDB?.()||emptyDB()),localLessons=lessonMap(local.lessons),localStudents=lessonMap(local.students);for(const [id,row] of localLessons)if(JSON.stringify(serverLessons.get(id))!==JSON.stringify(row)){schedulerOptimisticLessons.set(id,deepCopy(row));recoveredAtStartup=true}for(const [id,row] of localStudents)if(JSON.stringify(serverStudents.get(id))!==JSON.stringify(row)){schedulerOptimisticStudents.set(id,deepCopy(row));recoveredAtStartup=true}if(recoveredAtStartup)schedulerRecoveryHold=true}
   for(const [id,desired] of [...schedulerOptimisticLessons]){
    const server=serverLessons.get(id);
    if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticLessons.delete(id);continue}
    if(desired===null)serverLessons.delete(id);else serverLessons.set(id,deepCopy(desired));
   }
   for(const [id,desired] of [...schedulerOptimisticStudents]){
    const server=serverStudents.get(id);
    if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticStudents.delete(id);continue}
    if(desired===null)serverStudents.delete(id);else serverStudents.set(id,deepCopy(desired));
   }
   incoming.lessons=[...serverLessons.values()];incoming.students=[...serverStudents.values()];schedulerBaselineLessons=recoveredAtStartup?serverBaselineLessons:deepCopy(incoming.lessons);schedulerBaselineStudents=recoveredAtStartup?serverBaselineStudents:deepCopy(incoming.students);applyingCloud=true;window.__danbridgeSetDB(deepCopy(incoming));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();applyingCloud=false;cloudStatus(schedulerRecoveryHold?'發現 aa 本機與雲端不一致，已唯讀鎖定；請先檢查本機救援資料':'aa 全老師課表已同步',schedulerRecoveryHold?'pending':'ok');
 },e=>{console.error('Scheduler view failed',e);cloudStatus('aa 課表同步失敗：'+(e.message||e),'error')});
}

async function subscribeSchedulerTeacher(){
 if(!cloudTeacherId||!cloudEmailKey)throw new Error('aa 排課帳號尚未完成綁定。');startRoleActiveRecordRuntime({email:cloudEmailKey,kind:'scheduler',teacherId:cloudTeacherId,branchIds:[]},applySchedulerRecordView,subscribeSchedulerTeacherLegacy);
}

function revokeCurrentRoleAccess(message){
 applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
 cloudStatus(message,'error');setTimeout(()=>signOut(auth).catch(e=>console.error('forced role sign-out failed',e)),0);
}
function subscribeRoleAccessGuard(){
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(!cloudEmailKey||(cloudRole==='owner'&&cloudEmailKey===OWNER_EMAIL))return;
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeAccessGuard=onSnapshot(accessRef,snap=>{
   const access=snap.exists()?snap.data()||{}:null;
   const valid=!!access&&access.active===true&&access.companyId===COMPANY_ID&&roleAccessSignature(access)===cloudRoleAccessSignature;
   if(!valid)revokeCurrentRoleAccess('此帳號權限已被移除或變更，系統已安全登出。');
 },e=>{console.error('role access guard failed',e);reportOperationalError(e,{category:'cloud-read',area:'access-guard',retryable:true});cloudStatus('權限狀態暫時無法確認，系統正在重新連線。','pending')});
}

async function subscribeBranchManagerLegacy(){
 if(!cloudEmailKey||!cloudBranchIds.length)throw new Error('校區管理者尚未綁定校區。');
 unsubscribeState?.();
 // 直接監聽自己的 companyAccess 文件。此路徑同時保存角色與 scopedDb，
 // 不需要另外部署 branchViews Firestore 規則。
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeState=onSnapshot(accessRef,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     cloudStatus('校區管理權限已被移除，請聯絡 Owner。','error');
     return;
   }
   const access=snap.data()||{};
   if(access.active===false){cloudStatus('校區管理者帳號已停用。','error');return}
   const latestBranchIds=Array.isArray(access.branchIds)&&access.branchIds.length?access.branchIds:cloudBranchIds;
   cloudBranchIds=latestBranchIds;
   cloudTeacherId=access.teacherId||cloudTeacherId||'';
   window.DanbridgeAccess?.setContext({role:'branch_manager',branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:true,canSubmitOwnReports:true});
   const raw=access.scopedDb;
   if(!raw){
     cloudStatus('校區資料尚未發布；請 Owner 登入並儲存一次資料。','error');
     return;
   }
   const incoming=filteredBranchDB(raw,cloudBranchIds);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus(`校區資料已同步：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{
   console.error('讀取校區權限資料失敗',err);
   reportOperationalError(err,{category:'cloud-read',area:'branch-view',retryable:true});
   cloudStatus('讀取校區資料失敗：'+(err.message||err),'error');
 });
}

async function subscribeBranchManager(){
 if(!cloudEmailKey||!cloudTeacherId||!cloudBranchIds.length)throw new Error('校區管理者尚未完成老師與校區綁定。');startRoleActiveRecordRuntime({email:cloudEmailKey,kind:'branch_manager',teacherId:cloudTeacherId,branchIds:[...new Set(cloudBranchIds.map(String))].sort()},applyBranchManagerRecordView,subscribeBranchManagerLegacy);
}



window.addEventListener('offline',()=>setOfflineStatus());
window.addEventListener('online',()=>{cloudStatus('網路已恢復，正在檢查待同步變更…','pending');if(cloudRole==='owner'){ownerUploadQueued=true;clearTimeout(ownerRetryTimer);uploadOwnerState();scheduleDailyCloudBackup();renderSyncRecoveryCenter()}else cloudStatus('網路已恢復，正在重新連線…','pending')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloudRole==='owner'&&ownerUploadQueued&&navigator.onLine)uploadOwnerState()});

setAuthCard();
installCloudSave();
installTeacherReportUI();
installClassFocusMode();
installBranchManagerAccessEvents();
installRoleInteractionGuards();
onAuthStateChanged(auth,async user=>{
 unsubscribeState?.();unsubscribeState=null;stopActiveRecordRuntimes();unsubscribeReports?.();unsubscribeReports=null;unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;unsubscribeTeacherLeaves?.();unsubscribeTeacherLeaves=null;unsubscribeOwnerHealth?.();unsubscribeOwnerHealth=null;lastOwnerHealthSignal='';unsubscribeScheduleRequests?.();unsubscribeScheduleRequests=null;scheduleNotificationDocuments=[];teacherLeaveDocuments=[];window.__danbridgeSetTeacherLeaves?.([]);lessonReportDocuments=[];lessonMetaSignatureCache=new Map();lessonMetaCacheReady=false;scopedViewHashCache=new Map();roleViewPublishSourceDB=null;
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(!user){clearTimeout(cloudBootstrapTimeout);cloudBootstrapTimeout=null;cloudBootstrapProgress=null;document.getElementById('cloudBootstrapProgress')?.remove();delete document.body.dataset.cloudBootstrapState;lastPublishedOwnerDB=null;ownerBaselineReady=false;scheduleNotificationDeliveryJobs.forEach(job=>clearTimeout(job.timer));scheduleNotificationDeliveryJobs.clear();clearTimeout(roleViewRetryTimer);clearTimeout(dailyBackupTimer);clearTimeout(schedulerRequestRetryTimer);clearTimeout(schedulerUploadRetryTimer);roleViewPublishInFlight=false;roleViewPublishQueued=false;roleViewRetryCount=0;cloudRole='';cloudTeacherId='';cloudBranchIds=[];cloudCanManageSchedule=false;schedulerBaselineLessons=[];schedulerBaselineStudents=[];schedulerSaveChain=Promise.resolve();schedulerOptimisticLessons=new Map();schedulerOptimisticStudents=new Map();schedulerUploadRetryCount=0;schedulerStartupRecoveryChecked=false;schedulerRecoveryHold=false;schedulerRequestQueue=[];schedulerRequestQueueIds=new Set();schedulerQuarantinedRequestIds=new Set();schedulerAppliedRequestCount=0;schedulerRequestWorkerActive=false;cloudUid='';cloudEmailKey='';cloudRoleAccessSignature='';document.body.classList.remove('wendy-teacher-role');window.__danbridgeLessonIdMigrationAuthority=false;window.DanbridgeAccess?.setContext({role:'',branchIds:[],teacherId:'',email:'',readOnly:true,canManageSchedule:false});showCloudLogin();cloudStatus('尚未登入');return}
 try{
   beginCloudBootstrap();cloudStatus('1/5 已確認 Google 登入','pending');const profile=await loadSignedInProfile(user);try{await recordSuccessfulLogin(user,profile)}catch(e){console.warn('最後登入時間更新失敗：',e);reportOperationalError(e,{category:'cloud-write',area:'access-guard',retryable:true})}advanceCloudBootstrap('profile','帳號權限已從雲端讀回');cloudStatus('2/5 權限資料已確認','pending');applyRoleUI(profile,user);advanceCloudBootstrap('role',`${profile.role} 資料範圍已鎖定`);cloudStatus('3/5 角色範圍已確認','pending');showCloudApp();advanceCloudBootstrap('data','正在驗證角色專屬雲端資料');cloudStatus('4/5 正在驗證雲端資料','pending');
   if(profile.role==='owner'){subscribeOwner();subscribeSchedulerRequests();setTimeout(()=>{renderCloudUserManager();renderBranchManagerAccess()},0)}else if(profile.role==='teacher'&&profile.canManageSchedule===true)subscribeSchedulerTeacher();else if(profile.role==='teacher')subscribeTeacher();else if(profile.role==='branch_manager')subscribeBranchManager();else throw new Error('不支援的角色：'+profile.role);subscribeRoleAccessGuard();subscribeLessonReports();subscribeScheduleNotifications();subscribeTeacherLeaves();
 }catch(e){console.error(e);failCloudBootstrap(e);await signOut(auth);showCloudLogin();showCloudLoginError(e.message);cloudStatus(e.message,'error')}
});
