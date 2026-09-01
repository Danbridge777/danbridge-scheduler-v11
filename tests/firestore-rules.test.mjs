import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import {buildRecordShadowRunManifest,verifyRecordShadowRun} from '../js/core/cloud-record-shadow-run.js';
import {prepareImmutableMigrationBackup,verifyImmutableMigrationBackupReadback} from '../js/core/cloud-immutable-migration-backup.js';
import {buildFullRecordCandidateManifest,buildRoleViewCandidateManifest as buildLegacyRoleViewCandidateManifest,buildAtomicRecordActivation} from '../js/core/cloud-record-activation.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {buildStagingLivePreflight} from '../js/core/cloud-staging-live-preflight.js';
import {buildStagingLiveActivationControl} from '../js/core/cloud-staging-live-activation.js';
import {createFirebaseLiveRecordOperationAdapter} from '../js/core/firebase-live-record-operation-adapter.js';
import {buildRecordSyncActivationManifest,buildActiveRecordSyncControl} from '../js/core/cloud-record-sync-control.js';
import {buildRecordSyncRoleEvidence,RECORD_SYNC_ROLE_SCENARIOS} from '../js/core/cloud-record-sync-role-evidence.js';
import {buildOpenRecordSyncCandidateControl,sealRecordSyncCandidateControl} from '../js/core/cloud-record-sync-candidate-control.js';
import {buildInitialRecordSyncSafetyControl,buildRecordSyncSafetyPause,buildRecordSyncRecoveryReceipt,buildRecordSyncSafetyResume} from '../js/core/cloud-record-sync-safety-control.js';
import {buildHardPausedRecordSyncV1WriterCurrent,buildOpenRecordSyncV1WriterCurrent} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {createFirebaseActiveRecordOperationAdapter} from '../js/core/firebase-active-record-operation-adapter.js';
import {createFirebaseRecordSyncSafetyAdapter} from '../js/core/firebase-record-sync-safety-adapter.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {createFirebaseRoleRecordViewAdapter} from '../js/core/firebase-role-record-view-adapter.js';
import {buildRoleRecordViewPlan,roleRecordViewKey} from '../js/core/cloud-role-record-view.js';
import {prepareDailyShardedBackup,verifyDailyShardedBackupReadback,sealDailyShardedBackup} from '../js/core/cloud-daily-sharded-backup.js';
import {buildRoleViewCandidateManifest as buildVerifiedRoleViewCandidateManifest,buildRoleViewVerificationReceipt} from '../js/core/cloud-role-view-verification.js';

const PROJECT_ID = 'danbridge-rules-test';
const COMPANY_ID = 'danbridge';
const OWNER_EMAIL = 'a0965487920@gmail.com';
const BACKUP_OWNER_EMAIL = 'catherine890202@gmail.com';
const TEACHER_EMAIL = 'yamiiii8549@gmail.com';
const WENDY_EMAIL = 'wendylee0820520@gmail.com';
const SECOND_SCHEDULER_EMAIL = 'aa0966626336@gmail.com';
const OTHER_TEACHER_EMAIL = 'other@example.com';
const MANAGER_EMAIL = 'manager@example.com';
const INACTIVE_EMAIL = 'inactive@example.com';
const INVITED_EMAIL = 'invited@example.com';

let testEnv;

const auth = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
const authClaims = (uid, email, claims = {}) => testEnv.authenticatedContext(uid, { email, ...claims }).firestore();
const unauthenticated = () => testEnv.unauthenticatedContext().firestore();

async function seed() {
  const now = Date.now();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const rows = [
      [`companyAccess/${TEACHER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1' }],
      [`companyAccess/${WENDY_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1', canManageSchedule: true, scopedDb: { lessons: [], students: [], teachers: [] } }],
      [`companyAccess/${SECOND_SCHEDULER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-2', canManageSchedule: true, scopedDb: { lessons: [], students: [], teachers: [] } }],
      [`companyAccess/${OTHER_TEACHER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-2' }],
      [`companyAccess/${MANAGER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'branch_manager', teacherId: 'manager-teacher', branchIds: ['branch-a'] }],
      [`companyAccess/${INACTIVE_EMAIL}`, { active: false, companyId: COMPANY_ID, role: 'teacher', teacherId: 'inactive-teacher' }],
      [`companyAccess/${INVITED_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1', invitedBy: OWNER_EMAIL, invitedAt: Timestamp.now() }],
      [`companyAccess/${BACKUP_OWNER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'owner', displayName: 'Backup Owner', invitedBy: OWNER_EMAIL, invitedAt: Timestamp.now() }],
      [`stagingRecordSyncSafetyControls/${COMPANY_ID}`, {
        schema: 'danbridge-record-sync-safety-control-v1',
        environment: 'staging',
        companyId: COMPANY_ID,
        activationEpoch: 'rules-seed-active-epoch-1',
        state: 'active',
        revision: 1,
        lastEventId: 'activation:rules-seed-active',
        lastEventHash: 'a'.repeat(64),
        readAllowed: true,
        writeAllowed: true,
        updatedAt: '2026-08-15T00:00:00+08:00'
      }],
      ['users/teacher-uid', { email: TEACHER_EMAIL, active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1' }],
      ['users/manager-uid', { email: MANAGER_EMAIL, active: true, companyId: COMPANY_ID, role: 'branch_manager', teacherId: 'manager-teacher', branchIds: ['branch-a'] }],
      [`companies/${COMPANY_ID}/data/main`, { privateValue: 'owner-only' }],
      [`companies/${COMPANY_ID}/syncConflictBackups/conflict-1`, { companyId: COMPANY_ID, payload: '[{"path":"lessons.lesson-1.title"}]' }],
      [`companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`, { teacherId: 'teacher-1', lessons: ['lesson-own'] }],
      [`companies/${COMPANY_ID}/teacherViews/${OTHER_TEACHER_EMAIL}`, { teacherId: 'teacher-2', lessons: ['lesson-other'] }],
      [`companies/${COMPANY_ID}/teacherViews/${INVITED_EMAIL}`, { teacherId: 'teacher-1', lessons: ['lesson-own'] }],
      [`companies/${COMPANY_ID}/schedulerViews/${SECOND_SCHEDULER_EMAIL}`, { email: SECOND_SCHEDULER_EMAIL, db: { lessons: [], students: [], teachers: [] } }],
      [`companies/${COMPANY_ID}/teacherViews/${MANAGER_EMAIL}`, { teacherId: 'manager-teacher', lessons: ['stale-teacher-view'] }],
      [`companies/${COMPANY_ID}/branchViews/${TEACHER_EMAIL}`, { branchIds: ['branch-a'] }],
      [`companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`, { branchIds: ['branch-a'] }],
      [`companies/${COMPANY_ID}/lessonMeta/lesson-own`, { active: true, teacherIds: ['teacher-1'], branchId: 'branch-a', editableFrom: Timestamp.fromMillis(now - 60_000), editableUntil: Timestamp.fromMillis(now + 60_000) }],
      [`companies/${COMPANY_ID}/lessonMeta/lesson-other`, { active: true, teacherIds: ['teacher-2'], branchId: 'branch-b', editableFrom: Timestamp.fromMillis(now - 60_000), editableUntil: Timestamp.fromMillis(now + 60_000) }],
      [`companies/${COMPANY_ID}/lessonMeta/lesson-manager`, { active: true, teacherIds: ['manager-teacher'], branchId: 'branch-a', editableFrom: Timestamp.fromMillis(now - 60_000), editableUntil: Timestamp.fromMillis(now + 60_000) }],
      [`companies/${COMPANY_ID}/lessonMeta/lesson-expired`, { active: true, teacherIds: ['teacher-1'], branchId: 'branch-a', editableFrom: Timestamp.fromMillis(now - 120_000), editableUntil: Timestamp.fromMillis(now - 60_000) }],
      [`companies/${COMPANY_ID}/lessonReports/lesson-own`, { companyId: COMPANY_ID, lessonId: 'lesson-own', reportedForTeacherIds: ['teacher-1'], branchId: 'branch-a', content: 'own report' }],
      [`companies/${COMPANY_ID}/lessonReports/lesson-other`, { companyId: COMPANY_ID, lessonId: 'lesson-other', reportedForTeacherIds: ['teacher-2'], branchId: 'branch-b', content: 'other report' }],
      [`companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`, { recipientEmail: TEACHER_EMAIL, read: false, message: 'own notice' }],
      [`companies/${COMPANY_ID}/scheduleNotifications/scheduler-notice`, { recipientEmail: SECOND_SCHEDULER_EMAIL, recipientRole: 'scheduler', read: false, message: 'scheduler notice' }],
      [`companies/${COMPANY_ID}/scheduleNotifications/other-notice`, { recipientEmail: OTHER_TEACHER_EMAIL, read: false, message: 'other notice' }],
      ['productionTeacherLeaveRecords/leave-own', { companyId: COMPANY_ID, leaveId: 'leave-own', teacherId: 'teacher-1', teacherName: 'Teacher One', leaveType: 'sick', date: '2026-09-02', start: '09:00', end: '10:00', hours: 1, status: 'active', revision: 1 }],
      ['productionTeacherLeaveRecords/leave-other', { companyId: COMPANY_ID, leaveId: 'leave-other', teacherId: 'teacher-2', teacherName: 'Teacher Two', leaveType: 'personal', date: '2026-09-03', start: '10:00', end: '12:00', hours: 2, status: 'active', revision: 1 }],
      ['productionTeacherLeaveOperationReceipts/leave-operation-own', { companyId: COMPANY_ID, leaveId: 'leave-own', committedByUid: 'teacher-uid' }]
    ];
    for (const [path, data] of rows) await setDoc(doc(db, path), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

describe('正式老師請假角色隔離',()=>{
 test('Daniel 與 AA 可讀全部；老師只能讀自己；校區管理者不可讀',async()=>{
  const owner=auth('owner-uid',OWNER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),other=auth('other-uid',OTHER_TEACHER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL);
  await assertSucceeds(getDoc(doc(owner,'productionTeacherLeaveRecords/leave-own')));await assertSucceeds(getDoc(doc(owner,'productionTeacherLeaveRecords/leave-other')));
  await assertSucceeds(getDocs(query(collection(scheduler,'productionTeacherLeaveRecords'),where('companyId','==',COMPANY_ID))));
  await assertSucceeds(getDocs(query(collection(teacher,'productionTeacherLeaveRecords'),where('companyId','==',COMPANY_ID),where('teacherId','==','teacher-1'))));
  await assertFails(getDoc(doc(teacher,'productionTeacherLeaveRecords/leave-other')));await assertSucceeds(getDoc(doc(other,'productionTeacherLeaveRecords/leave-other')));await assertFails(getDoc(doc(manager,'productionTeacherLeaveRecords/leave-own')));
 });
 test('任何前端角色都不能直接新增、修改或刪除請假紀錄',async()=>{for(const [uid,email] of [['owner-uid',OWNER_EMAIL],['scheduler-2-uid',SECOND_SCHEDULER_EMAIL],['teacher-uid',TEACHER_EMAIL]]){const db=auth(uid,email),ref=doc(db,'productionTeacherLeaveRecords/leave-own');await assertFails(setDoc(doc(db,'productionTeacherLeaveRecords/forged'),{companyId:COMPANY_ID,teacherId:'teacher-1'}));await assertFails(updateDoc(ref,{hours:99}));await assertFails(deleteDoc(ref))}});
 test('操作 receipt 僅 Daniel 或實際提交者可讀，所有前端均不可寫',async()=>{const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),other=auth('other-uid',OTHER_TEACHER_EMAIL),ref='productionTeacherLeaveOperationReceipts/leave-operation-own';await assertSucceeds(getDoc(doc(owner,ref)));await assertSucceeds(getDoc(doc(teacher,ref)));await assertFails(getDoc(doc(other,ref)));await assertFails(setDoc(doc(owner,'productionTeacherLeaveOperationReceipts/forged'),{companyId:COMPANY_ID,committedByUid:'owner-uid'}))});
});

describe('staging 全資料與角色候選原子控制',()=>{
  const manifestPath=id=>`stagingRecordCandidateManifests/${COMPANY_ID}/manifests/${id}`;
  const controlPath=`stagingRecordActivationControls/${COMPANY_ID}`;
  const withAudit=(payload,uid='owner-uid',email=OWNER_EMAIL)=>({...payload,createdAt:serverTimestamp(),createdBy:uid,createdByEmail:email});
  const evidence=(suffix='ok')=>{
    const fullManifest=buildFullRecordCandidateManifest({environment:'staging',manifestId:`full-${suffix}`,sourceHash:'source-hash-1',collectionCount:16,documentCount:1709,activeCount:1709,tombstoneCount:0});
    const roleManifest=buildLegacyRoleViewCandidateManifest({environment:'staging',manifestId:`role-${suffix}`,runId:`role-run-${suffix}`,sourceHash:'source-hash-1',viewCount:7,documentCount:2353});
    return{fullManifest,roleManifest,activation:buildAtomicRecordActivation({environment:'staging',fullManifest,roleManifest,currentSourceHash:'source-hash-1'})};
  };
  const controlPayload=(activation,uid='owner-uid',email=OWNER_EMAIL)=>({...activation,activatedAt:serverTimestamp(),activatedBy:uid,activatedByEmail:email});

  test('同一交易建立兩份 verified manifest 與不接管讀寫的控制文件',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),{fullManifest,roleManifest,activation}=evidence('atomic');
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{},clientHash:'source-hash-1'});
    await assertSucceeds(runTransaction(owner,async transaction=>{
      transaction.set(doc(owner,manifestPath(fullManifest.manifestId)),withAudit(fullManifest));
      transaction.set(doc(owner,manifestPath(roleManifest.manifestId)),withAudit(roleManifest));
      transaction.set(doc(owner,controlPath),controlPayload(activation));
    }));
    const saved=(await getDoc(doc(owner,controlPath))).data();
    assert.equal(saved.readTakeover,false);assert.equal(saved.writeTakeover,false);assert.equal(saved.viewCount,7);
    const backup=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),backupEvidence=evidence('backup-owner');
    await assertSucceeds(runTransaction(backup,async transaction=>{
      transaction.set(doc(backup,manifestPath(backupEvidence.fullManifest.manifestId)),withAudit(backupEvidence.fullManifest,'backup-owner-uid',BACKUP_OWNER_EMAIL));
      transaction.set(doc(backup,manifestPath(backupEvidence.roleManifest.manifestId)),withAudit(backupEvidence.roleManifest,'backup-owner-uid',BACKUP_OWNER_EMAIL));
      transaction.set(doc(backup,controlPath),controlPayload(backupEvidence.activation,'backup-owner-uid',BACKUP_OWNER_EMAIL));
    }));
    assert.equal((await getDoc(doc(backup,controlPath))).data().activatedByEmail,BACKUP_OWNER_EMAIL);
  });

  test('中斷、版本改變、缺筆、多筆、hash 或 run 不符全部 fail-closed',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),{fullManifest,roleManifest,activation}=evidence('blocked');
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{},clientHash:'source-hash-1'});
    await assertFails(setDoc(doc(owner,controlPath),controlPayload(activation)));
    await assertSucceeds(setDoc(doc(owner,manifestPath(fullManifest.manifestId)),withAudit(fullManifest)));
    await assertSucceeds(setDoc(doc(owner,manifestPath(roleManifest.manifestId)),withAudit(roleManifest)));
    for(const changed of [
      {sourceHash:'source-hash-2'},
      {documentCount:1708},
      {documentCount:1710},
      {fullVerifiedHash:'wrong-hash'},
      {roleVerifiedHash:'wrong-hash'},
      {roleRunId:'wrong-run'},
      {viewCount:6},
      {roleDocumentCount:2352},
      {readTakeover:true},
      {writeTakeover:true}
    ])await assertFails(setDoc(doc(owner,controlPath),controlPayload({...activation,...changed})));
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{newer:true},clientHash:'source-hash-2'});
    await assertFails(setDoc(doc(owner,controlPath),controlPayload(activation)));
  });

  test('manifest 綁定 live 控制、逐筆文件與完成啟用都必須由 Owner 原子推進',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),sourceDb=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),targetDb=structuredClone(sourceDb),revisions=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{}]));targetDb.lessons=[{id:'lesson-live-1',name:'safe'}];
    const legacyVersionHash='legacy-live-v1',backupId='backup-live-1',drillId='restore-live-1',backupSha=sha256Canonical(targetDb),collections=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{count:key==='lessons'?1:0,chunks:key==='lessons'?1:0}])),backup={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId,sourceHash:backupSha,sourceVersionHash:legacyVersionHash,collectionOrder:[...FULL_RECORD_COLLECTIONS],collections,chunkCount:1,recordCount:1,maxChunkBytes:180000,verifiedHash:backupSha,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL,verifiedAt:serverTimestamp()},receipt={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId,sourceBackupId:backupId,sourceHash:backupSha,restoredHash:backupSha,sourceChunkCount:1,restoredChunkCount:1,recordCount:1,collections,mainVersionHash:legacyVersionHash,mainUnchanged:true,verifiedAt:serverTimestamp(),verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL};
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:targetDb,clientHash:legacyVersionHash});await assertSucceeds(setDoc(doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}`),backup));await assertSucceeds(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}`),receipt));
    const preflight=buildStagingLivePreflight({environment:'staging',role:'owner',projectId:'danbridge-d8877-staging',sourceState:{db:sourceDb,revisions},targetDb,backup:{...backup,verifiedAt:undefined},restoreReceipt:{...receipt,persisted:true},legacyVersionHash,deviceId:'device-live',readBudget:500,writeBudget:100,createdAt:'2026-08-15T01:00:00+08:00'}),manifest=preflight.manifest,manifestRef=doc(owner,`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${manifest.manifestHash}`),liveControlRef=doc(owner,`stagingLiveRecordControls/${COMPANY_ID}`),initial={...buildStagingLiveActivationControl(manifest),updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    const invalidEstimateHash='e'.repeat(64);await assertFails(setDoc(doc(owner,`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${invalidEstimateHash}`),{...manifest,manifestHash:invalidEstimateHash,estimatedWrites:99,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));
    const invalidPassHash='f'.repeat(64);await assertFails(setDoc(doc(owner,`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${invalidPassHash}`),{...manifest,manifestHash:invalidPassHash,plannedExecutionPasses:2,activationAttemptAllowance:5,estimatedReads:manifest.estimatedReads+15,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));
    await assertFails(setDoc(liveControlRef,initial));
    await assertSucceeds(runTransaction(owner,async transaction=>{transaction.set(manifestRef,{...manifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});transaction.set(liveControlRef,initial)}));
    const operation=preflight.plan.operations[0],recordRef=doc(owner,`stagingLiveRecords/${COMPANY_ID}/collections/lessons/records/lesson-live-1`),operationReceiptRef=doc(owner,`stagingLiveOperationReceipts/${COMPANY_ID}/runs/${manifest.manifestHash}/operations/${operation.operationId}`),record={schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,collection:'lessons',recordId:'lesson-live-1',record:operation.record,recordIndex:null,sourceHash:operation.nextHash,revision:1,deleted:false,environment:'staging',lastOperationId:operation.operationId,executionManifestHash:manifest.manifestHash,updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    await assertFails(setDoc(recordRef,record));
    const verifying={...initial,state:'verifying',dataHash:operation.nextHash,rootRevision:1,confirmedOperationCount:1,lastOperationId:operation.operationId,lastCollection:'lessons',lastRecordId:'lesson-live-1'},operationReceipt={schema:'danbridge-live-operation-receipt-v1',environment:'staging',companyId:COMPANY_ID,executionManifestHash:manifest.manifestHash,operationId:operation.operationId,operationHash:sha256Canonical(operation),collection:'lessons',recordId:'lesson-live-1',nextHash:operation.nextHash,revision:1,deleted:false,rootRevision:1,updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    await assertSucceeds(runTransaction(owner,async transaction=>{transaction.set(recordRef,record);transaction.set(operationReceiptRef,operationReceipt);transaction.set(liveControlRef,verifying,{merge:false})}));assert.equal((await getDoc(recordRef)).data().revision,1);
    await assertFails(setDoc(liveControlRef,{...verifying,state:'active',verifiedHash:manifest.targetRecordHash,verifiedDocumentCount:0,verifiedActiveCount:1,verifiedTombstoneCount:0}));
    await assertSucceeds(setDoc(liveControlRef,{...verifying,state:'active',verifiedHash:manifest.targetRecordHash,verifiedDocumentCount:1,verifiedActiveCount:1,verifiedTombstoneCount:0}));
    let activeDb=structuredClone(targetDb),activeRevisions=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{}])),rootRevision=1;activeRevisions.lessons['lesson-live-1']=1;
    const runNextRound=async(label,nextDb,expectedDeleted)=>{
      const nextLegacyVersion=`legacy-${label}-v1`,nextBackupId=`backup-${label}-1`,nextDrillId=`restore-${label}-1`,nextSha=sha256Canonical(nextDb),nextCollections=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{count:nextDb[key].length,chunks:nextDb[key].length?1:0}]));
      const nextBackup={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId:nextBackupId,sourceHash:nextSha,sourceVersionHash:nextLegacyVersion,collectionOrder:[...FULL_RECORD_COLLECTIONS],collections:nextCollections,chunkCount:Object.values(nextCollections).reduce((sum,value)=>sum+value.chunks,0),recordCount:Object.values(nextCollections).reduce((sum,value)=>sum+value.count,0),maxChunkBytes:180000,verifiedHash:nextSha,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL,verifiedAt:serverTimestamp()},nextReceipt={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId:nextDrillId,sourceBackupId:nextBackupId,sourceHash:nextSha,restoredHash:nextSha,sourceChunkCount:nextBackup.chunkCount,restoredChunkCount:nextBackup.chunkCount,recordCount:nextBackup.recordCount,collections:nextCollections,mainVersionHash:nextLegacyVersion,mainUnchanged:true,verifiedAt:serverTimestamp(),verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL};
      await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:nextDb,clientHash:nextLegacyVersion});await assertSucceeds(setDoc(doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/${nextBackupId}`),nextBackup));await assertSucceeds(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${nextDrillId}`),nextReceipt));
      const round=buildStagingLivePreflight({environment:'staging',role:'owner',projectId:'danbridge-d8877-staging',sourceState:{db:activeDb,revisions:activeRevisions},targetDb:nextDb,backup:{...nextBackup,verifiedAt:undefined},restoreReceipt:{...nextReceipt,persisted:true},legacyVersionHash:nextLegacyVersion,deviceId:'device-live',startSequence:rootRevision+1,readBudget:500,writeBudget:100,createdAt:`2026-08-15T0${rootRevision+1}:00:00+08:00`}),roundManifest=round.manifest,roundManifestRef=doc(owner,`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${roundManifest.manifestHash}`),roundInitial={...buildStagingLiveActivationControl(roundManifest,{rootRevision}),updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
      await assertSucceeds(runTransaction(owner,async transaction=>{transaction.set(roundManifestRef,{...roundManifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});transaction.set(liveControlRef,roundInitial)}));
      const nextOperation=round.plan.operations[0];assert.equal(round.plan.operationCount,1);assert.equal(nextOperation.deleted,expectedDeleted);
      const nextRecord={schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,collection:'lessons',recordId:'lesson-live-1',record:nextOperation.record,recordIndex:null,sourceHash:nextOperation.nextHash,revision:nextOperation.nextRevision,deleted:nextOperation.deleted,environment:'staging',lastOperationId:nextOperation.operationId,executionManifestHash:roundManifest.manifestHash,updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL},roundVerifying={...roundInitial,state:'verifying',dataHash:nextOperation.nextHash,rootRevision:rootRevision+1,confirmedOperationCount:1,lastOperationId:nextOperation.operationId,lastCollection:'lessons',lastRecordId:'lesson-live-1'},nextOperationReceiptRef=doc(owner,`stagingLiveOperationReceipts/${COMPANY_ID}/runs/${roundManifest.manifestHash}/operations/${nextOperation.operationId}`),nextOperationReceipt={schema:'danbridge-live-operation-receipt-v1',environment:'staging',companyId:COMPANY_ID,executionManifestHash:roundManifest.manifestHash,operationId:nextOperation.operationId,operationHash:sha256Canonical(nextOperation),collection:'lessons',recordId:'lesson-live-1',nextHash:nextOperation.nextHash,revision:nextOperation.nextRevision,deleted:nextOperation.deleted,rootRevision:rootRevision+1,updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
      await assertSucceeds(runTransaction(owner,async transaction=>{transaction.set(recordRef,nextRecord);transaction.set(nextOperationReceiptRef,nextOperationReceipt);transaction.set(liveControlRef,roundVerifying)}));
      await assertSucceeds(setDoc(liveControlRef,{...roundVerifying,state:'active',verifiedHash:roundManifest.targetRecordHash,verifiedDocumentCount:roundManifest.targetDocumentCount,verifiedActiveCount:roundManifest.targetActiveCount,verifiedTombstoneCount:roundManifest.targetTombstoneCount}));rootRevision++;activeRevisions.lessons['lesson-live-1']=nextOperation.nextRevision;activeDb=structuredClone(nextDb);return roundManifestRef;
    };
    const modified=structuredClone(activeDb);modified.lessons[0].name='updated';await runNextRound('modify',modified,false);const tombstoned=structuredClone(activeDb);tombstoned.lessons=[];await runNextRound('tombstone',tombstoned,true);const revived=structuredClone(activeDb);revived.lessons=[{id:'lesson-live-1',name:'revived'}];const latestManifestRef=await runNextRound('revive',revived,false);assert.equal((await getDoc(recordRef)).data().revision,4);assert.equal((await getDoc(recordRef)).data().deleted,false);
    await assertFails(updateDoc(recordRef,{revision:2,lastOperationId:'forged'}));await assertFails(getDoc(doc(teacher,recordRef.path)));await assertFails(setDoc(doc(teacher,`stagingLiveRecords/${COMPANY_ID}/collections/lessons/records/teacher-write`),{...record,recordId:'teacher-write',record:{id:'teacher-write'},updatedBy:'teacher-uid',updatedByEmail:TEACHER_EMAIL}));
    await assertFails(updateDoc(operationReceiptRef,{operationHash:'0'.repeat(64)}));await assertFails(deleteDoc(operationReceiptRef));await assertFails(getDoc(doc(teacher,operationReceiptRef.path)));
    await assertFails(updateDoc(manifestRef,{operationCount:2}));await assertFails(deleteDoc(manifestRef));await assertFails(deleteDoc(latestManifestRef));await assertFails(deleteDoc(recordRef));await assertFails(deleteDoc(liveControlRef));
  });

  test('Daniel 與 Catherine 雙分頁競爭只落地一次，失敗頁重試成 duplicate',async()=>{
    const sourceDb=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),targetDb=structuredClone(sourceDb),revisions=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{}]));targetDb.lessons=[{id:'two-owner-lesson',name:'safe'}];
    const legacyVersionHash='legacy-two-owner-v1',backupId='backup-two-owner',drillId='restore-two-owner',backupSha=sha256Canonical(targetDb),collections=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{count:key==='lessons'?1:0,chunks:key==='lessons'?1:0}])),backup={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId,sourceHash:backupSha,verifiedHash:backupSha,sourceVersionHash:legacyVersionHash,collectionOrder:[...FULL_RECORD_COLLECTIONS],collections,chunkCount:1,recordCount:1},restoreReceipt={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',persisted:true,drillId,sourceBackupId:backupId,sourceHash:backupSha,restoredHash:backupSha,recordCount:1,mainVersionHash:legacyVersionHash,mainUnchanged:true};
    const preflight=buildStagingLivePreflight({environment:'staging',role:'owner',projectId:'danbridge-d8877-staging',sourceState:{db:sourceDb,revisions},targetDb,backup,restoreReceipt,legacyVersionHash,deviceId:'two-owner-device',readBudget:500,writeBudget:100,createdAt:'2026-08-15T10:00:00+08:00'}),manifest=preflight.manifest,operation=preflight.plan.operations[0],manifestPath=`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${manifest.manifestHash}`,controlPath=`stagingLiveRecordControls/${COMPANY_ID}`;
    await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore(),stamp=Timestamp.now();await setDoc(doc(db,manifestPath),{...manifest,persistedAt:stamp,persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});await setDoc(doc(db,controlPath),{...buildStagingLiveActivationControl(manifest),updatedAt:stamp,updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL})});
    const daniel=auth('owner-uid',OWNER_EMAIL),catherine=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),transactionRunner=db=>callback=>runTransaction(db,transaction=>callback({get:path=>transaction.get(doc(db,path)),set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})})),adapter=(db,uid,email)=>createFirebaseLiveRecordOperationAdapter({manifestHash:manifest.manifestHash,actor:{uid,email},serverTimestamp,runTransaction:transactionRunner(db)}),danielAdapter=adapter(daniel,'owner-uid',OWNER_EMAIL),catherineAdapter=adapter(catherine,'backup-owner-uid',BACKUP_OWNER_EMAIL);
    const firstPass=await Promise.allSettled([danielAdapter.apply(operation),catherineAdapter.apply(operation)]),firstKinds=firstPass.filter(row=>row.status==='fulfilled').map(row=>row.value.kind);assert.equal(firstKinds.filter(kind=>kind==='create').length,1);assert.ok(firstPass.every(row=>row.status==='fulfilled'||row.reason?.code==='permission-denied'));
    const retries=await Promise.all([danielAdapter.apply(operation),catherineAdapter.apply(operation)]);assert.deepEqual(retries.map(row=>row.kind),['duplicate','duplicate']);
    const record=(await getDoc(doc(daniel,`stagingLiveRecords/${COMPANY_ID}/collections/lessons/records/two-owner-lesson`))).data(),receipt=(await getDoc(doc(daniel,`stagingLiveOperationReceipts/${COMPANY_ID}/runs/${manifest.manifestHash}/operations/${operation.operationId}`))).data(),control=(await getDoc(doc(daniel,controlPath))).data();
    assert.equal(record.revision,1);assert.equal(record.deleted,false);assert.ok([OWNER_EMAIL,BACKUP_OWNER_EMAIL].includes(record.updatedByEmail));assert.equal(receipt.operationId,operation.operationId);assert.equal(control.rootRevision,1);assert.equal(control.confirmedOperationCount,1);assert.equal(control.state,'verifying');
  });

  test('日常逐筆啟用、完成憑證、雙 Owner 與權限在 Emulator 全部 fail-closed',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),backupOwner=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),legacyVersionHash='active-legacy-v1',backupId='active-backup-1',restoreId='active-restore-1',sha='a'.repeat(64),collections=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{count:key==='lessons'?1:0,chunks:key==='lessons'?1:0}]));
    const backup={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId,sourceHash:sha,sourceVersionHash:legacyVersionHash,collectionOrder:[...FULL_RECORD_COLLECTIONS],collections,chunkCount:1,recordCount:1,maxChunkBytes:180000,verifiedHash:sha,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL,verifiedAt:serverTimestamp()},restore={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId:restoreId,sourceBackupId:backupId,sourceHash:sha,restoredHash:sha,sourceChunkCount:1,restoredChunkCount:1,recordCount:1,collections,mainVersionHash:legacyVersionHash,mainUnchanged:true,verifiedAt:serverTimestamp(),verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL};
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{lessons:[{id:'active-lesson-1',room:'A'}]},clientHash:legacyVersionHash});await assertSucceeds(setDoc(doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}`),backup));await assertSucceeds(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${restoreId}`),restore));
    const candidatePath=`stagingRecordSyncCandidateControls/${COMPANY_ID}`,candidateOpen=buildOpenRecordSyncCandidateControl({candidateEpoch:'candidate-active-1',legacyVersionHash,createdAt:'2026-08-15T13:45:00+08:00'});await assertSucceeds(setDoc(doc(owner,candidatePath),{...candidateOpen,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL}));
    const recordPath=`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/active-lesson-1`,seedRecord={schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,collection:'lessons',recordId:'active-lesson-1',record:{id:'active-lesson-1',room:'A'},recordIndex:null,sourceHash:legacyVersionHash,revision:1,deleted:false,environment:'staging',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};await assertSucceeds(setDoc(doc(owner,recordPath),seedRecord));
    const candidateControl=sealRecordSyncCandidateControl({control:candidateOpen,currentLegacyVersionHash:legacyVersionHash,recordDataHash:'record-v1:'+'b'.repeat(64),documentCount:1,activeCount:1,tombstoneCount:0,sealedAt:'2026-08-15T13:58:00+08:00'});await assertSucceeds(setDoc(doc(owner,candidatePath),{...candidateControl,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL}));await assertFails(updateDoc(doc(owner,recordPath),{revision:2}));
    const candidateSourceHash='3'.repeat(64),zeroRoleCounts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,0])),candidateEvidenceManifest=buildVerifiedRoleViewCandidateManifest({runId:'role-run-active-1',sourceHash:candidateSourceHash,views:[{viewId:'scheduler-view',email:SECOND_SCHEDULER_EMAIL,kind:'scheduler',viewHash:'6'.repeat(64),documentCount:0,counts:zeroRoleCounts},{viewId:'teacher-one-view',email:TEACHER_EMAIL,kind:'teacher',viewHash:'7'.repeat(64),documentCount:0,counts:zeroRoleCounts},{viewId:'teacher-two-view',email:OTHER_TEACHER_EMAIL,kind:'teacher',viewHash:'8'.repeat(64),documentCount:0,counts:zeroRoleCounts},{viewId:'manager-view',email:MANAGER_EMAIL,kind:'branch_manager',viewHash:'9'.repeat(64),documentCount:0,counts:zeroRoleCounts}],createdAt:'2026-08-15T13:54:00+08:00'});await assertSucceeds(setDoc(doc(owner,`stagingRoleViewCandidateManifests/${COMPANY_ID}/runs/${candidateEvidenceManifest.runId}`),{...candidateEvidenceManifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));
    const roleEvidence=buildRecordSyncRoleEvidence({environment:'staging',primaryOwnerEmail:OWNER_EMAIL,backupOwnerEmail:BACKUP_OWNER_EMAIL,schedulerEmail:SECOND_SCHEDULER_EMAIL,teacherAccounts:[TEACHER_EMAIL,OTHER_TEACHER_EMAIL],roleViewCount:4,candidateRunId:candidateEvidenceManifest.runId,candidateSourceHash,candidateManifestHash:candidateEvidenceManifest.manifestHash,receiptCount:6,receiptSetHash:'5'.repeat(64),results:Object.fromEntries(RECORD_SYNC_ROLE_SCENARIOS.map(key=>[key,true])),testedAt:'2026-08-15T13:55:00+08:00'}),roleEvidencePath=`stagingRecordSyncRoleEvidence/${COMPANY_ID}/runs/${roleEvidence.evidenceHash}`,manifest=buildRecordSyncActivationManifest({environment:'staging',activationEpoch:'epoch-active-1',candidateControl,legacyVersionHash,recordDataHash:'record-v1:'+'b'.repeat(64),roleEvidence,backupId,restoreReceiptId:restoreId,documentCount:1,activeCount:1,tombstoneCount:0,createdAt:'2026-08-15T14:00:00+08:00'}),controlCore=buildActiveRecordSyncControl({manifest,currentLegacyVersionHash:legacyVersionHash,currentRecordDataHash:manifest.recordDataHash,currentRoleEvidenceHash:manifest.roleEvidenceHash,activatedAt:'2026-08-15T14:01:00+08:00'}),control={...controlCore,persistedAt:serverTimestamp(),activatedBy:'owner-uid',activatedByEmail:OWNER_EMAIL},safetyCore=buildInitialRecordSyncSafetyControl({manifest,createdAt:controlCore.activatedAt}),safety={...safetyCore,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL},manifestPath=`stagingRecordSyncActivationManifests/${COMPANY_ID}/manifests/${manifest.manifestHash}`,controlPath=`stagingRecordSyncControls/${COMPANY_ID}`,safetyPath=`stagingRecordSyncSafetyControls/${COMPANY_ID}`;
    await testEnv.withSecurityRulesDisabled(async context=>deleteDoc(doc(context.firestore(),safetyPath)));
    await assertFails(setDoc(doc(owner,controlPath),control));await assertFails(runTransaction(owner,async transaction=>{transaction.set(doc(owner,manifestPath),{...manifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});transaction.set(doc(owner,controlPath),control)}));await assertSucceeds(runTransaction(owner,async transaction=>{transaction.set(doc(owner,roleEvidencePath),{...roleEvidence,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});transaction.set(doc(owner,manifestPath),{...manifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL});transaction.set(doc(owner,controlPath),control);transaction.set(doc(owner,safetyPath),safety)}));await assertFails(updateDoc(doc(owner,roleEvidencePath),{roleViewCount:5}));await assertFails(deleteDoc(doc(owner,roleEvidencePath)));await assertFails(getDoc(doc(teacher,roleEvidencePath)));await assertFails(updateDoc(doc(owner,manifestPath),{roleViewCount:5}));await assertFails(updateDoc(doc(owner,controlPath),{writeTakeover:false}));
    const makeOperation=(recordId,revision,room,deviceId='daniel')=>({schema:'danbridge-active-record-operation-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:manifest.activationEpoch,operationId:`${deviceId}:${revision}`,deviceId,collection:'lessons',recordId,type:revision===1?'create':'update',baseRevision:revision-1,nextRevision:revision,payload:{schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,collection:'lessons',recordId,record:{id:recordId,room},recordIndex:null,sourceHash:`active-${revision}`,revision,deleted:false,environment:'staging'},path:`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${recordId}`}),runner=db=>callback=>runTransaction(db,transaction=>callback({get:path=>transaction.get(doc(db,path)),set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})})),adapter=(db,uid,email)=>createFirebaseActiveRecordOperationAdapter({environment:'staging',role:'owner',actor:{uid,email},serverTimestamp,runTransaction:runner(db)}),safetyAdapter=createFirebaseRecordSyncSafetyAdapter({environment:'staging',role:'owner',actor:{uid:'owner-uid',email:OWNER_EMAIL},serverTimestamp,runTransaction:runner(owner)});
    const daniel=adapter(owner,'owner-uid',OWNER_EMAIL),catherine=adapter(backupOwner,'backup-owner-uid',BACKUP_OWNER_EMAIL),updated=await daniel.apply(makeOperation('active-lesson-1',2,'Daniel'));assert.equal(updated.kind,'update');assert.equal((await getDoc(doc(owner,recordPath))).data().record.room,'Daniel');assert.equal((await daniel.apply(makeOperation('active-lesson-1',2,'Daniel'))).kind,'duplicate');
    const created=await catherine.apply(makeOperation('active-lesson-2',1,'Catherine','catherine'));assert.equal(created.kind,'create');assert.equal((await getDoc(doc(owner,created.path))).data().updatedByEmail,BACKUP_OWNER_EMAIL);await assertFails(updateDoc(doc(owner,recordPath),{revision:99}));await assertFails(deleteDoc(doc(owner,recordPath)));await assertFails(getDoc(doc(teacher,recordPath)));await assertFails(getDoc(doc(teacher,created.receiptPath)));await assertFails(setDoc(doc(teacher,`stagingRecordSyncControls/${COMPANY_ID}`),control));
    const conflictBackupId='conflict-'+sha.slice(0,24),conflictPartId=`${conflictBackupId}-0`,conflictPartPath=`stagingRecordSyncConflictBackups/${COMPANY_ID}/epochs/${manifest.activationEpoch}/parts/${conflictPartId}`,conflictPart={schema:'danbridge-record-sync-conflict-backup-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:manifest.activationEpoch,backupId:conflictBackupId,partId:conflictPartId,conflictHash:sha,baseHash:'record-v1:'+'d'.repeat(64),targetHash:'record-v1:'+'e'.repeat(64),deviceId:'daniel',partIndex:0,partCount:1,encoding:'json-fragment',payload:'[{"path":"lessons.active-lesson-1.room"}]',createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL};await assertSucceeds(setDoc(doc(owner,conflictPartPath),conflictPart));await assertFails(updateDoc(doc(owner,conflictPartPath),{payload:'tampered'}));await assertFails(deleteDoc(doc(owner,conflictPartPath)));await assertFails(getDoc(doc(teacher,conflictPartPath)));await assertFails(setDoc(doc(owner,`stagingRecordSyncConflictBackups/${COMPANY_ID}/epochs/wrong-epoch/parts/${conflictPartId}`),{...conflictPart,activationEpoch:'wrong-epoch'}));
    const pause=buildRecordSyncSafetyPause({control:safetyCore,eventId:'pause-active-1',reason:'Emulator 串流異常演練',safeRecordDataHash:'record-v1:'+'f'.repeat(64),cloudBackupId:backupId,createdAt:'2026-08-15T14:10:00+08:00'}),pauseEventPath=`stagingRecordSyncSafetyEvents/${COMPANY_ID}/epochs/${manifest.activationEpoch}/events/${pause.event.eventId}`;await safetyAdapter.pause(pause);assert.equal((await getDoc(doc(owner,pauseEventPath))).data().createdAt,pause.event.createdAt);assert.equal((await getDoc(doc(owner,safetyPath))).data().updatedAt,pause.nextControl.updatedAt);await assert.rejects(catherine.apply(makeOperation('active-lesson-2',2,'Blocked while paused','catherine')),/安全暫停/);await assertFails(setDoc(doc(owner,conflictPartPath+'-paused'),{...conflictPart,partId:conflictPartId+'-paused'}));await assertFails(updateDoc(doc(owner,safetyPath),{state:'active',writeAllowed:true,revision:3}));
    const recovery=buildRecordSyncRecoveryReceipt({environment:'staging',activationEpoch:manifest.activationEpoch,pauseEventId:pause.event.eventId,sourceBackupId:backupId,restoredRecordDataHash:'record-v1:'+'1'.repeat(64),operationLogHash:'2'.repeat(64),confirmedOperationCount:2,createdAt:'2026-08-15T14:15:00+08:00'}),recoveryPath=`stagingRecordSyncRecoveryReceipts/${COMPANY_ID}/epochs/${manifest.activationEpoch}/receipts/${recovery.receiptHash}`;await safetyAdapter.persistRecovery(recovery);await assertFails(updateDoc(doc(owner,recoveryPath),{confirmedOperationCount:99}));await assertFails(deleteDoc(doc(owner,recoveryPath)));const resume=buildRecordSyncSafetyResume({control:pause.nextControl,eventId:'resume-active-1',recoveryReceipt:recovery,readbackRecordDataHash:recovery.restoredRecordDataHash,createdAt:'2026-08-15T14:20:00+08:00'}),resumeEventPath=`stagingRecordSyncSafetyEvents/${COMPANY_ID}/epochs/${manifest.activationEpoch}/events/${resume.event.eventId}`;await safetyAdapter.resume({...resume,recoveryReceipt:recovery,readbackRecordDataHash:recovery.restoredRecordDataHash});assert.equal((await getDoc(doc(owner,resumeEventPath))).data().createdAt,resume.event.createdAt);assert.equal((await getDoc(doc(owner,safetyPath))).data().updatedAt,resume.nextControl.updatedAt);assert.equal((await catherine.apply(makeOperation('active-lesson-2',2,'Resumed','catherine'))).kind,'update');await assertSucceeds(getDoc(doc(teacher,safetyPath)));await assertFails(getDoc(doc(teacher,pauseEventPath)));await assertFails(getDoc(doc(teacher,recoveryPath)));
  });

  test('manifest 不可覆寫刪除，非 Owner 不可讀寫或建立控制',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),{fullManifest,roleManifest,activation}=evidence('permission');
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{},clientHash:'source-hash-1'});
    await assertSucceeds(setDoc(doc(owner,manifestPath(fullManifest.manifestId)),withAudit(fullManifest)));
    await assertSucceeds(setDoc(doc(owner,manifestPath(roleManifest.manifestId)),withAudit(roleManifest)));
    await assertFails(updateDoc(doc(owner,manifestPath(fullManifest.manifestId)),{documentCount:1708}));
    await assertFails(deleteDoc(doc(owner,manifestPath(fullManifest.manifestId))));
    for(const db of [teacher,scheduler,unauthenticated()]){
      await assertFails(getDoc(doc(db,manifestPath(fullManifest.manifestId))));
      await assertFails(setDoc(doc(db,controlPath),controlPayload(activation,'forged',TEACHER_EMAIL)));
    }
  });
});

describe('aa 全老師排課權限', () => {
  test('第二位排課專員具備與 Wendy 相同的最小化排課權限', async () => {
    const db = auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL);
    const request = { companyId: COMPANY_ID, operation: 'create', lessonId: 'lesson-scheduler-2', lesson: { id: 'lesson-scheduler-2', date: '2026-08-14', start: '10:00', end: '11:00', studentId: 'student-1', teacherId: 'teacher-1', teacherIds: ['teacher-1'], title: 'English', status: '未上課' }, actorUid: 'scheduler-2-uid', actorEmail: SECOND_SCHEDULER_EMAIL, createdAt: serverTimestamp(), status: 'pending' };
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduler-2-request`), request));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduler-extra-actor-name`), { ...request, actorName: 'aa' }));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduler-2-request`)));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/schedulerViews/${SECOND_SCHEDULER_EMAIL}`)));
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduler-new-student`), { ...request, lessonId: 'lesson-new-student', lesson: { ...request.lesson, id: 'lesson-new-student', studentId: 'student-new' }, student: { id: 'student-new', name: 'New Student', parent: 'Parent', contact: '0912345678', homeAddress: 'Address', courseType: '1對1' } }));
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduler-update-student-snapshot`), { ...request, operation: 'update', lessonId: 'lesson-own', lesson: { ...request.lesson, id: 'lesson-own', studentId: 'student-1' }, student: { id: 'student-1', name: 'Student One', parent: 'Parent' } }));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/data/main`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/syncConflictBackups/conflict-1`)));
  });

  test('舊 Wendy 排課旗標立即失效並恢復純老師權限', async () => {
    const db = auth('wendy-uid', WENDY_EMAIL);
    const request = { companyId: COMPANY_ID, operation: 'create', lessonId: 'lesson-new', lesson: { id: 'lesson-new', date: '2026-08-13', start: '10:00', end: '11:00', studentId: 'student-1', teacherId: 'teacher-2', teacherIds: ['teacher-2'], title: 'English', status: '未上課' }, actorUid: 'wendy-uid', actorEmail: WENDY_EMAIL, createdAt: serverTimestamp(), status: 'pending' };
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/wendy-request`), request));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/data/main`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-other`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/schedulerViews/${SECOND_SCHEDULER_EMAIL}`)));
  });

  test('一般老師不能偽造 Wendy 排課要求', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/forged`), { companyId: COMPANY_ID, operation: 'delete', lessonId: 'lesson-other', lesson: {}, actorUid: 'teacher-uid', actorEmail: TEACHER_EMAIL, createdAt: serverTimestamp(), status: 'pending' }));
  });

  test('aa 排課要求不能夾帶費用或薪資', async () => {
    const db = auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL);
    const base = { companyId: COMPANY_ID, operation: 'create', lessonId: 'lesson-private', actorUid: 'scheduler-2-uid', actorEmail: SECOND_SCHEDULER_EMAIL, createdAt: serverTimestamp(), status: 'pending' };
    for (const [index, field] of ['paymentStatus', 'chargeStudent', 'payTeacher'].entries()) {
      const lesson = { id: 'lesson-private', date: '2026-08-13', start: '10:00', end: '11:00', studentId: 'student-1', teacherId: 'teacher-2', teacherIds: ['teacher-2'], [field]: 'forbidden' };
      await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/private-${index}`), { ...base, lesson }));
    }
    const schedulingLesson = { id: 'lesson-private', date: '2026-08-13', start: '10:00', end: '11:00', studentId: 'student-1', teacherId: 'teacher-2', teacherIds: ['teacher-2'], address: '上課地址', meetingUrl: 'https://meet.example', note: '排課備註', lessonState: 'active' };
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/scheduling-fields`), { ...base, lesson: schedulingLesson }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/scheduleRequests/private-student-rate`), { ...base, lesson: { ...schedulingLesson, studentId: 'student-new' }, student: { id: 'student-new', name: 'New Student', rate: 2000 } }));
  });
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

describe('V1 hard-pause 與永久 fence 不可旁路', () => {
  const safetyPath = `stagingRecordSyncSafetyControls/${COMPANY_ID}`;
  const fencePath = `stagingRecordSyncV1PermanentFences/${COMPANY_ID}`;
  const safetyCore = ({ paused = false, epoch = 'rules-fence-epoch-1' } = {}) => ({
    schema: 'danbridge-record-sync-safety-control-v1',
    environment: 'staging',
    companyId: COMPANY_ID,
    activationEpoch: epoch,
    state: paused ? 'paused' : 'active',
    revision: paused ? 2 : 1,
    lastEventId: paused ? 'pause:rules-fence-1' : 'activation:rules-fence-1',
    lastEventHash: 'a'.repeat(64),
    readAllowed: true,
    writeAllowed: !paused,
    updatedAt: paused ? '2026-08-15T01:01:00+08:00' : '2026-08-15T01:00:00+08:00'
  });
  const setGate = ({ paused = false, fenced = false } = {}) => testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, safetyPath), safetyCore({ paused }), { merge: false });
    if (fenced) await setDoc(doc(db, fencePath), { schema: 'danbridge-record-sync-v1-permanent-fence-v1', companyId: COMPANY_ID, state: 'fenced' });
    else await deleteDoc(doc(db, fencePath));
  });
  const scheduleRequest = (uid = 'scheduler-2-uid', email = SECOND_SCHEDULER_EMAIL) => ({
    companyId: COMPANY_ID,
    operation: 'create',
    lessonId: 'rules-fence-lesson',
    lesson: { id: 'rules-fence-lesson', date: '2026-08-16', start: '10:00', end: '11:00', studentId: 'student-1', teacherId: 'teacher-2', teacherIds: ['teacher-2'], title: 'Fence', status: '未上課' },
    actorUid: uid,
    actorEmail: email,
    createdAt: serverTimestamp(),
    status: 'pending'
  });
  const recordShadow = (uid, email, environment = 'staging') => ({
    companyId: COMPANY_ID,
    collection: 'lessons',
    recordId: `rules-${environment}-record`,
    record: { id: `rules-${environment}-record`, title: 'Allowed only while active' },
    sourceHash: `rules-${environment}-source`,
    revision: 1,
    deleted: false,
    environment,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    updatedByEmail: email
  });

  test('active 且尚未 fence 時保留既有 Owner 與排課寫入', async () => {
    await setGate();
    const owner = auth('owner-uid', OWNER_EMAIL);
    const backup = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    const scheduler = auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL);
    await assertSucceeds(setDoc(doc(owner, `companies/${COMPANY_ID}/data/main`), { active: true }));
    await assertSucceeds(setDoc(doc(backup, `companies/${COMPANY_ID}/customSurface/owner-write`), { active: true }));
    await assertSucceeds(setDoc(doc(scheduler, `companies/${COMPANY_ID}/scheduleRequests/rules-active`), scheduleRequest()));
    await assertSucceeds(setDoc(doc(owner, `stagingRecordShadows/${COMPANY_ID}/collections/lessons/records/rules-staging-record`), recordShadow('owner-uid', OWNER_EMAIL)));
    const production = recordShadow('backup-owner-uid', BACKUP_OWNER_EMAIL, 'production');
    await assertSucceeds(setDoc(doc(backup, `productionFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${production.recordId}`), { schema: 'danbridge-full-record-shadow-v1', ...production, recordIndex: null }));
  });

  test('paused 時 broad OR、specific actor 與 top-level V1 source 全部拒絕', async () => {
    await setGate({ paused: true });
    const owner = auth('owner-uid', OWNER_EMAIL);
    const backup = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    const scheduler = auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL);
    const teacher = auth('teacher-uid', TEACHER_EMAIL);
    for (const [db, suffix] of [[owner, 'owner'], [backup, 'backup']]) {
      await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/data/${suffix}`), { blocked: true }));
      await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/shardedGenerations/g-${suffix}/chunks/c-1`), { blocked: true }));
      await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/unknownNested/${suffix}`), { blocked: true }));
    }
    await assertFails(setDoc(doc(scheduler, `companies/${COMPANY_ID}/scheduleRequests/rules-paused`), scheduleRequest()));
    await assertFails(setDoc(doc(teacher, `companies/${COMPANY_ID}/lessonReports/lesson-own`), { companyId: COMPANY_ID, lessonId: 'lesson-own', reportedForTeacherIds: ['teacher-1'], branchId: 'branch-a', content: 'blocked' }));
    await assertFails(setDoc(doc(owner, `stagingRecordShadows/${COMPANY_ID}/collections/lessons/records/rules-staging-record`), recordShadow('owner-uid', OWNER_EMAIL)));
    const production = recordShadow('owner-uid', OWNER_EMAIL, 'production');
    await assertFails(setDoc(doc(owner, `productionFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${production.recordId}`), { schema: 'danbridge-full-record-shadow-v1', ...production, recordIndex: null }));
    await assertFails(setDoc(doc(owner, `stagingRecordSyncOperationReceipts/${COMPANY_ID}/epochs/rules-fence-epoch-1/operations/blocked-operation`), {}));
    await assertFails(setDoc(doc(owner, `stagingRoleRecordViewControls/${COMPANY_ID}/views/${TEACHER_EMAIL}`), {}));
  });

  test('fence path 對所有 client 不可建立覆寫刪除，fence 後 active safety 仍無法寫 V1', async () => {
    await setGate();
    const actors = [
      auth('owner-uid', OWNER_EMAIL),
      auth('backup-owner-uid', BACKUP_OWNER_EMAIL),
      auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL),
      auth('teacher-uid', TEACHER_EMAIL),
      auth('manager-uid', MANAGER_EMAIL),
      unauthenticated()
    ];
    for (const db of actors) await assertFails(setDoc(doc(db, fencePath), { forged: true }));
    await setGate({ fenced: true });
    for (const db of actors) {
      await assertFails(setDoc(doc(db, fencePath), { forged: true }));
      await assertFails(deleteDoc(doc(db, fencePath)));
      await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/all-actors/blocked`), { forged: true }));
    }
    const owner = auth('owner-uid', OWNER_EMAIL);
    await assertFails(updateDoc(doc(owner, safetyPath), { updatedAt: '2026-08-15T01:02:00+08:00' }));
  });

  test('fence 後 recovery receipt 與 resume event/control 原子交易都拒絕', async () => {
    const epoch = 'rules-fence-epoch-1';
    const backupId = 'rules-fence-backup-1';
    const active = safetyCore({ epoch });
    const pause = buildRecordSyncSafetyPause({ control: active, eventId: 'pause-rules-fence-1', reason: '永久 fence 測試', safeRecordDataHash: `record-v1:${'b'.repeat(64)}`, cloudBackupId: backupId, createdAt: '2026-08-15T01:01:00+08:00' });
    const recovery = buildRecordSyncRecoveryReceipt({ environment: 'staging', activationEpoch: epoch, pauseEventId: pause.event.eventId, sourceBackupId: backupId, restoredRecordDataHash: `record-v1:${'c'.repeat(64)}`, operationLogHash: 'd'.repeat(64), confirmedOperationCount: 0, createdAt: '2026-08-15T01:02:00+08:00' });
    const owner = auth('owner-uid', OWNER_EMAIL);
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, safetyPath), pause.nextControl, { merge: false });
      await setDoc(doc(db, `stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}`), { state: 'verified' });
      await setDoc(doc(db, fencePath), { schema: 'danbridge-record-sync-v1-permanent-fence-v1', companyId: COMPANY_ID, state: 'fenced' });
    });
    const recoveryPath = `stagingRecordSyncRecoveryReceipts/${COMPANY_ID}/epochs/${epoch}/receipts/${recovery.receiptHash}`;
    await assertFails(setDoc(doc(owner, recoveryPath), { ...recovery, persistedAt: serverTimestamp(), persistedBy: 'owner-uid', persistedByEmail: OWNER_EMAIL }));
    await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), recoveryPath), recovery));
    const resume = buildRecordSyncSafetyResume({ control: pause.nextControl, eventId: 'resume-rules-fence-1', recoveryReceipt: recovery, readbackRecordDataHash: recovery.restoredRecordDataHash, createdAt: '2026-08-15T01:03:00+08:00' });
    await assertFails(runTransaction(owner, async transaction => {
      transaction.set(doc(owner, `stagingRecordSyncSafetyEvents/${COMPANY_ID}/epochs/${epoch}/events/${resume.event.eventId}`), { ...resume.event, persistedAt: serverTimestamp(), createdBy: 'owner-uid', createdByEmail: OWNER_EMAIL });
      transaction.set(doc(owner, safetyPath), { ...resume.nextControl, persistedAt: serverTimestamp(), updatedBy: 'owner-uid', updatedByEmail: OWNER_EMAIL }, { merge: false });
    }));
  });
});

describe('V1 fence 全寫入面合法 fixture hardening', () => {
  const safetyPath=`stagingRecordSyncSafetyControls/${COMPANY_ID}`,fencePath=`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,writerPath=`stagingRecordSyncV1WriterCurrents/${COMPANY_ID}`,rootPath=`stagingRecordSyncControls/${COMPANY_ID}`;
  const gateCore=(mode='active',epoch='hardening-active-epoch-1')=>({schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,state:mode==='paused'?'paused':'active',revision:mode==='paused'?2:1,lastEventId:mode==='paused'?'pause:hardening-1':'activation:hardening-1',lastEventHash:'a'.repeat(64),readAllowed:true,writeAllowed:mode!=='paused',updatedAt:'2026-08-15T02:00:00+08:00'});
  const setGate=mode=>testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,safetyPath),gateCore(mode),{merge:false});await deleteDoc(doc(db,writerPath));if(mode==='fenced')await setDoc(doc(db,fencePath),{schema:'danbridge-record-sync-v1-permanent-fence-v1',companyId:COMPANY_ID,state:'fenced'});else await deleteDoc(doc(db,fencePath))});
  const disabled=callback=>testEnv.withSecurityRulesDisabled(async context=>callback(context.firestore()));
  const audit=(value,uid='owner-uid',email=OWNER_EMAIL)=>({...value,updatedAt:serverTimestamp(),updatedBy:uid,updatedByEmail:email});
  const record=(id,environment='staging')=>({schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,collection:'lessons',recordId:id,record:{id,title:'hardening'},recordIndex:null,sourceHash:`hardening-${environment}-source`,revision:1,deleted:false,environment});
  const installWriter=mode=>disabled(async db=>{
    const safety=(await getDoc(doc(db,safetyPath))).data(),snapshot=await getDoc(doc(db,rootPath)),existing=snapshot.exists()?snapshot.data():{},source={schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:safety.activationEpoch,manifestHash:typeof existing.manifestHash==='string'&&/^[a-f0-9]{64}$/.test(existing.manifestHash)?existing.manifestHash:'6'.repeat(64),candidateEpoch:'hardening-writer-candidate',candidateRevision:2,candidateSealHash:'7'.repeat(64),legacyVersionHash:'hardening-writer-legacy',recordDataHash:'record-v1:'+'8'.repeat(64),roleEvidenceHash:'9'.repeat(64),backupId:'hardening-writer-backup',restoreReceiptId:'hardening-writer-restore',collectionCount:16,documentCount:0,activeCount:0,tombstoneCount:0,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-15T01:59:59.999999999+08:00',...existing};
    source.schema='danbridge-record-sync-control-v1';source.environment='staging';source.companyId=COMPANY_ID;source.state='active';source.activationEpoch=safety.activationEpoch;source.readTakeover=true;source.writeTakeover=true;if(typeof source.manifestHash!=='string'||!/^[a-f0-9]{64}$/.test(source.manifestHash))source.manifestHash='6'.repeat(64);
    await setDoc(doc(db,rootPath),source,{merge:false});
    const open=buildOpenRecordSyncV1WriterCurrent({recordSyncControl:source,safetyControl:safety,writerGeneration:1,minClientProtocolVersion:4,minClientReleaseId:'20.26.114',createdAt:safety.updatedAt});
    if(mode==='writer-open'){await setDoc(doc(db,writerPath),open,{merge:false});return}
    const pausedSafety={...safety,revision:safety.revision+1,lastEventId:'pause-hardening-writer',lastEventHash:'b'.repeat(64)},paused=buildHardPausedRecordSyncV1WriterCurrent({current:open,freezeId:'freeze-hardening-writer',freezeRequestHash:'c'.repeat(64),freezeControlHash:'d'.repeat(64),safetyRevision:pausedSafety.revision,safetyLastEventHash:pausedSafety.lastEventHash,transitionReceiptHash:'e'.repeat(64)});
    await setDoc(doc(db,safetyPath),pausedSafety,{merge:false});await setDoc(doc(db,writerPath),paused,{merge:false});
  });

  const surfaces=async label=>{
    const owner=auth('owner-uid',OWNER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL);
    const candidateSource=`hardening-candidate-${label}`,candidate=buildOpenRecordSyncCandidateControl({candidateEpoch:`hardening-candidate-${label}`,legacyVersionHash:candidateSource,createdAt:'2026-08-15T02:00:00+08:00'}),candidateRecordId=`candidate-${label}`,candidatePayload=audit({...record(candidateRecordId),sourceHash:candidateSource});
    const writerSurface=label==='writer-open'||label==='writer-hard-paused',writerRecordEpoch=`hardening-writer-record-${label}`,writerRecordId=`writer-record-${label}`,writerOperationId=`writer-operation-${label}`,writerRecordPayload=audit({...record(writerRecordId),sourceHash:`hardening-writer-source-${label}`,lastOperationId:writerOperationId,deviceId:'hardening-writer-device',activationEpoch:writerRecordEpoch}),writerRecordReceipt={schema:'danbridge-active-record-operation-receipt-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:writerRecordEpoch,operationId:writerOperationId,operationHash:'5'.repeat(64),collection:'lessons',recordId:writerRecordId,revision:1,deleted:false,deviceId:'hardening-writer-device',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    const operationEpoch=`hardening-operation-${label}`,operationId=`hardening-operation-${label}`,operationRecordId=`operation-${label}`,operationReceipt={schema:'danbridge-active-record-operation-receipt-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:operationEpoch,operationId,operationHash:'b'.repeat(64),collection:'lessons',recordId:operationRecordId,revision:1,deleted:false,deviceId:'hardening-device',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    const conflictPartId=`hardening-conflict-${label}`,conflict={schema:'danbridge-record-sync-conflict-backup-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:operationEpoch,backupId:`hardening-backup-${label}`,partId:conflictPartId,conflictHash:'c'.repeat(64),baseHash:`record-v1:${'d'.repeat(64)}`,targetHash:`record-v1:${'e'.repeat(64)}`,deviceId:'hardening-device',partIndex:0,partCount:1,encoding:'json-fragment',payload:'[]',createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL};
    const liveManifestHash='f'.repeat(64),liveOperationId=`hardening-live-${label}`,liveRecordId=`live-${label}`,liveHash=`record-v1:${'1'.repeat(64)}`,liveRecord=audit({...record(liveRecordId),sourceHash:liveHash,lastOperationId:liveOperationId,executionManifestHash:liveManifestHash}),liveReceipt={schema:'danbridge-live-operation-receipt-v1',environment:'staging',companyId:COMPANY_ID,executionManifestHash:liveManifestHash,operationId:liveOperationId,operationHash:'2'.repeat(64),collection:'lessons',recordId:liveRecordId,nextHash:liveHash,revision:1,deleted:false,rootRevision:1,updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    const emptyDb=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),liveLegacy=`hardening-live-legacy-${label}`,liveBackupId=`hardening-live-backup-${label}`,liveDrillId=`hardening-live-drill-${label}`,liveSha=sha256Canonical(emptyDb),liveCollections=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{count:0,chunks:0}])),liveBackup={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId:liveBackupId,sourceHash:liveSha,sourceVersionHash:liveLegacy,collectionOrder:[...FULL_RECORD_COLLECTIONS],collections:liveCollections,chunkCount:0,recordCount:0,maxChunkBytes:180000,verifiedHash:liveSha,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL},liveRestore={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId:liveDrillId,sourceBackupId:liveBackupId,sourceHash:liveSha,restoredHash:liveSha,sourceChunkCount:0,restoredChunkCount:0,recordCount:0,collections:liveCollections,mainVersionHash:liveLegacy,mainUnchanged:true,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL},livePreflight=buildStagingLivePreflight({environment:'staging',role:'owner',projectId:'danbridge-d8877-staging',sourceState:{db:emptyDb,revisions:Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,{}]))},targetDb:emptyDb,backup:liveBackup,restoreReceipt:{...liveRestore,persisted:true},legacyVersionHash:liveLegacy,deviceId:'hardening-live-device',readBudget:500,writeBudget:100,createdAt:'2026-08-15T02:00:00+08:00'}),liveManifest=livePreflight.manifest,liveControl={...buildStagingLiveActivationControl(liveManifest),updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    const roleEpoch=`hardening-role-${label}`,roleIdentity={email:TEACHER_EMAIL,kind:'teacher',teacherId:'teacher-1',branchIds:[]},roleDb=structuredClone(emptyDb);roleDb.lessons=[{id:`role-${label}`,title:'hardening'}];const rolePlan=buildRoleRecordViewPlan({},roleDb,{environment:'staging',identity:roleIdentity,activationEpoch:roleEpoch,sourceRecordHash:`record-v1:${'3'.repeat(64)}`,publishId:`publish-hardening-${label}`,publishedAt:'2026-08-15T02:00:00+08:00'}),roleOperation=rolePlan.operations[0],roleRecordPayload=audit(roleOperation.payload),roleControlPayload={...rolePlan.control,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL};
    const scheduleRequest={companyId:COMPANY_ID,operation:'create',lessonId:`schedule-${label}`,lesson:{id:`schedule-${label}`,date:'2026-08-16',start:'10:00',end:'11:00',studentId:'student-1',teacherId:'teacher-2',teacherIds:['teacher-2'],title:'Hardening',status:'未上課'},actorUid:'scheduler-2-uid',actorEmail:SECOND_SCHEDULER_EMAIL,createdAt:serverTimestamp(),status:'pending'};
    const prepareActiveRoot=epoch=>disabled(async db=>{const current=(await getDoc(doc(db,safetyPath))).data();await setDoc(doc(db,safetyPath),{...current,activationEpoch:epoch},{merge:false});await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:epoch,readTakeover:true,writeTakeover:true},{merge:false})});
    return [
      {name:'stagingRecordShadows',run:()=>setDoc(doc(owner,`stagingRecordShadows/${COMPANY_ID}/collections/lessons/records/shadow-${label}`),{companyId:COMPANY_ID,collection:'lessons',recordId:`shadow-${label}`,record:{id:`shadow-${label}`},sourceHash:'hardening-source',revision:1,deleted:false,environment:'staging',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL})},
      {name:'stagingFullRecordShadows',prepare:()=>writerSurface?disabled(async db=>{await prepareActiveRoot(writerRecordEpoch);await setDoc(doc(db,`stagingRecordSyncOperationReceipts/${COMPANY_ID}/epochs/${writerRecordEpoch}/operations/${writerOperationId}`),{...writerRecordReceipt,updatedAt:Timestamp.now()})}):disabled(async db=>{await deleteDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`));await setDoc(doc(db,`stagingRecordSyncCandidateControls/${COMPANY_ID}`),candidate)}),run:()=>writerSurface?setDoc(doc(owner,`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${writerRecordId}`),writerRecordPayload):setDoc(doc(owner,`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${candidateRecordId}`),candidatePayload)},
      {name:'operationReceipts',prepare:async()=>{await prepareActiveRoot(operationEpoch);await disabled(db=>setDoc(doc(db,`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/${operationRecordId}`),{...record(operationRecordId),sourceHash:'hardening-operation-source',lastOperationId:operationId,deviceId:'hardening-device',activationEpoch:operationEpoch,updatedAt:Timestamp.now(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL}))},run:()=>setDoc(doc(owner,`stagingRecordSyncOperationReceipts/${COMPANY_ID}/epochs/${operationEpoch}/operations/${operationId}`),operationReceipt)},
      {name:'conflictBackups',prepare:()=>prepareActiveRoot(operationEpoch),run:()=>setDoc(doc(owner,`stagingRecordSyncConflictBackups/${COMPANY_ID}/epochs/${operationEpoch}/parts/${conflictPartId}`),conflict)},
      {name:'stagingLiveRecordControls',prepare:()=>disabled(async db=>{await deleteDoc(doc(db,`stagingLiveRecordControls/${COMPANY_ID}`));await setDoc(doc(db,`companies/${COMPANY_ID}/data/main`),{clientHash:liveLegacy});await setDoc(doc(db,`stagingMigrationBackups/${COMPANY_ID}/runs/${liveBackupId}`),liveBackup);await setDoc(doc(db,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${liveDrillId}`),liveRestore);await setDoc(doc(db,`stagingLiveExecutionManifests/${COMPANY_ID}/runs/${liveManifest.manifestHash}`),liveManifest)}),run:()=>setDoc(doc(owner,`stagingLiveRecordControls/${COMPANY_ID}`),liveControl)},
      {name:'stagingLiveRecords',prepare:()=>disabled(db=>setDoc(doc(db,`stagingLiveRecordControls/${COMPANY_ID}`),{executionManifestHash:liveManifestHash,lastOperationId:liveOperationId,lastCollection:'lessons',lastRecordId:liveRecordId,dataHash:liveHash,rootRevision:1})),run:()=>setDoc(doc(owner,`stagingLiveRecords/${COMPANY_ID}/collections/lessons/records/${liveRecordId}`),liveRecord)},
      {name:'stagingLiveOperationReceipts',prepare:()=>disabled(async db=>{await setDoc(doc(db,`stagingLiveRecordControls/${COMPANY_ID}`),{executionManifestHash:liveManifestHash,lastOperationId:liveOperationId,lastCollection:'lessons',lastRecordId:liveRecordId,dataHash:liveHash,rootRevision:1});await setDoc(doc(db,`stagingLiveRecords/${COMPANY_ID}/collections/lessons/records/${liveRecordId}`),{...liveRecord,updatedAt:Timestamp.now()})}),run:()=>setDoc(doc(owner,`stagingLiveOperationReceipts/${COMPANY_ID}/runs/${liveManifestHash}/operations/${liveOperationId}`),liveReceipt)},
      {name:'productionFullRecordShadows',run:()=>setDoc(doc(owner,`productionFullRecordShadows/${COMPANY_ID}/collections/lessons/records/production-${label}`),audit(record(`production-${label}`,'production')))},
      {name:'roleViewControl',prepare:()=>prepareActiveRoot(roleEpoch),run:()=>setDoc(doc(owner,`stagingRoleRecordViewControls/${COMPANY_ID}/views/${TEACHER_EMAIL}`),roleControlPayload)},
      {name:'roleViewRecord',prepare:()=>prepareActiveRoot(roleEpoch),run:()=>setDoc(doc(owner,roleOperation.path),roleRecordPayload)},
      {name:'companiesBroad',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/hardeningBroad/${label}`),{ok:true})},
      {name:'companiesData',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/data/hardening-${label}`),{ok:true})},
      {name:'companiesShardGeneration',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/shardedGenerations/g-${label}`),{ok:true})},
      {name:'companiesShardChunk',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/shardedGenerations/g-${label}/chunks/c-1`),{ok:true})},
      {name:'companiesShardControl',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/shardedControl/hardening-${label}`),{ok:true})},
      {name:'companiesSyncConflict',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/syncConflictBackups/hardening-${label}`),{ok:true})},
      {name:'companiesTeacherView',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/teacherViews/hardening-${label}@example.com`),{teacherId:'hardening'})},
      {name:'companiesSchedulerView',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/schedulerViews/hardening-${label}@example.com`),{email:`hardening-${label}@example.com`})},
      {name:'companiesBranchView',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/branchViews/hardening-${label}@example.com`),{branchIds:['branch-a']})},
      {name:'companiesScheduleRequest',run:()=>setDoc(doc(scheduler,`companies/${COMPANY_ID}/scheduleRequests/schedule-${label}`),scheduleRequest)},
      {name:'companiesLessonMeta',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/lessonMeta/hardening-${label}`),{active:true,teacherIds:['teacher-1'],branchId:'branch-a'})},
      {name:'companiesNotification',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/scheduleNotifications/hardening-${label}`),{recipientEmail:TEACHER_EMAIL,read:false})},
      {name:'companiesError',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/errorEvents/hardening-${label}`),{release:'20.26.113',environment:'staging',category:'cloud-write',area:'access-guard',code:'hardening',role:'owner',retryable:false,occurredAt:serverTimestamp()})},
      {name:'companiesReport',run:()=>setDoc(doc(owner,`companies/${COMPANY_ID}/lessonReports/hardening-${label}`),{companyId:COMPANY_ID,lessonId:`hardening-${label}`,reportedForTeacherIds:['teacher-1'],branchId:'branch-a',content:'hardening'})},
      {name:'teacherReportSpecific',run:()=>setDoc(doc(teacher,`companies/${COMPANY_ID}/lessonReports/lesson-own`),{companyId:COMPANY_ID,lessonId:'lesson-own',reportedForTeacherIds:['teacher-1'],branchId:'branch-a',content:'teacher hardening'})}
    ];
  };

  for(const mode of ['active','writer-open','paused','fenced','writer-hard-paused'])test(`${mode} 使用同一批合法 fixture ${mode==='active'||mode==='writer-open'?'全部允許':'逐項拒絕'}`,async()=>{await setGate(mode==='writer-open'||mode==='writer-hard-paused'?'active':mode);const rows=await surfaces(mode);for(const row of rows){await row.prepare?.();if(mode==='writer-open'||mode==='writer-hard-paused')await installWriter(mode);const result=row.run();if(mode==='active'||mode==='writer-open')await assertSucceeds(result);else await assertFails(result)}});

  test('active 外觀但 safety identity 任一欄不符仍 fail-closed',async()=>{const owner=auth('owner-uid',OWNER_EMAIL);for(const changed of [{schema:'wrong-schema'},{environment:'production'},{companyId:'other-company'}]){await disabled(db=>setDoc(doc(db,safetyPath),{...gateCore(),...changed},{merge:false}));await assertFails(setDoc(doc(owner,`companies/${COMPANY_ID}/hardeningIdentity/${Object.keys(changed)[0]}`),{blocked:true}))}});
});

describe('trusted V1 writer-current W0 seed',()=>{
  const writerPath=`stagingRecordSyncV1WriterCurrents/${COMPANY_ID}`,controlPath=`stagingRecordSyncControls/${COMPANY_ID}`,safetyPath=`stagingRecordSyncSafetyControls/${COMPANY_ID}`;
  const source=()=>({schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:'writer-seed-epoch-1',manifestHash:'1'.repeat(64),candidateEpoch:'candidate-writer-1',candidateRevision:2,candidateSealHash:'2'.repeat(64),legacyVersionHash:'legacy-writer-1',recordDataHash:'record-v1:'+'3'.repeat(64),roleEvidenceHash:'4'.repeat(64),backupId:'backup-writer-1',restoreReceiptId:'restore-writer-1',collectionCount:16,documentCount:2,activeCount:1,tombstoneCount:1,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-17T10:00:00.123456789+08:00'});
  const safety=()=>({schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:'writer-seed-epoch-1',state:'active',revision:3,lastEventId:'resume-writer-123',lastEventHash:'5'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-08-17T10:01:00.123456789+08:00'});
  const writer=(extra={})=>buildOpenRecordSyncV1WriterCurrent({recordSyncControl:source(),safetyControl:safety(),writerGeneration:1,minClientProtocolVersion:4,minClientReleaseId:'20.26.114',createdAt:safety().updatedAt,...extra});
  const seedSources=()=>testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore(),at=Timestamp.now();await setDoc(doc(db,controlPath),{...source(),persistedAt:at,activatedBy:'seed-admin',activatedByEmail:OWNER_EMAIL});await setDoc(doc(db,safetyPath),{...safety(),persistedAt:at,updatedBy:'seed-admin',updatedByEmail:OWNER_EMAIL})});
  const payload=(uid='trusted-writer-uid',mail=OWNER_EMAIL)=>({...writer(),persistedAt:serverTimestamp(),persistedBy:uid,persistedByEmail:mail});

  test('W absent保持legacy active；trusted operator可create W0，W open後日常write仍允許',async()=>{await seedSources();const trusted=authClaims('trusted-writer-uid',OWNER_EMAIL,{recordSyncV2CutoverOperator:true}),ordinary=auth('owner-uid',OWNER_EMAIL);await assertSucceeds(setDoc(doc(ordinary,`companies/${COMPANY_ID}/writerCompatibility/before`),{ok:true}));await assertFails(setDoc(doc(ordinary,writerPath),payload('owner-uid',OWNER_EMAIL)));await assertSucceeds(setDoc(doc(trusted,writerPath),payload()));await assertSucceeds(setDoc(doc(ordinary,`companies/${COMPANY_ID}/writerCompatibility/after`),{ok:true}));const saved=(await getDoc(doc(trusted,writerPath))).data();assert.equal(saved.state,'open');assert.equal(saved.sourceRecordSyncManifestHash,source().manifestHash)});

  test('W create exact mirror/audit/clock/client floor，且update/delete/recreate全部拒',async()=>{await seedSources();const trusted=authClaims('trusted-writer-uid',OWNER_EMAIL,{recordSyncV2CutoverOperator:true});for(const [index,changed] of [{sourceRecordSyncManifestHash:'6'.repeat(64)},{safetyRevision:99},{state:'hard-paused'},{admissionPolicyToken:'forged-open-policy-token'},{persistedBy:'other-uid'},{persistedByEmail:'other@example.com'}].entries())await assertFails(setDoc(doc(trusted,writerPath),{...payload(),...changed}));for(const poisoned of [writer({createdAt:'2026-08-17T10:01:00.123456790+08:00'}),writer({minClientProtocolVersion:5}),writer({minClientReleaseId:'20.26.115'})])await assertFails(setDoc(doc(trusted,writerPath),{...poisoned,persistedAt:serverTimestamp(),persistedBy:'trusted-writer-uid',persistedByEmail:OWNER_EMAIL}));await assertSucceeds(setDoc(doc(trusted,writerPath),payload()));await assertFails(updateDoc(doc(trusted,writerPath),{minClientReleaseId:'20.26.999'}));await assertFails(deleteDoc(doc(trusted,writerPath)));await assertFails(setDoc(doc(trusted,writerPath),payload(),{merge:false}))});

  test('同tx W0 create遇到S0 pause after-state必全批拒且不留下W',async()=>{await seedSources();const trusted=authClaims('trusted-writer-uid',OWNER_EMAIL,{recordSyncV2CutoverOperator:true}),pause=buildRecordSyncSafetyPause({control:safety(),eventId:'pause-writer-seed-1',reason:'W0 after-state race',safeRecordDataHash:'record-v1:'+'6'.repeat(64),cloudBackupId:'writer-pause-backup-1',createdAt:'2026-08-17T10:02:00.123456789+08:00'});await assertFails(runTransaction(trusted,async transaction=>{transaction.set(doc(trusted,writerPath),payload());transaction.set(doc(trusted,`stagingRecordSyncSafetyEvents/${COMPANY_ID}/epochs/${safety().activationEpoch}/events/${pause.event.eventId}`),{...pause.event,persistedAt:serverTimestamp(),createdBy:'trusted-writer-uid',createdByEmail:OWNER_EMAIL});transaction.set(doc(trusted,safetyPath),{...pause.nextControl,persistedAt:serverTimestamp(),updatedBy:'trusted-writer-uid',updatedByEmail:OWNER_EMAIL},{merge:false})}));assert.equal((await getDoc(doc(trusted,writerPath))).exists(),false);assert.equal((await getDoc(doc(trusted,safetyPath))).data().state,'active')});

  test('W若被Admin篡改root/safety/state，legacy寫入fail closed；hard-paused會阻止generic resume',async()=>{await seedSources();const trusted=authClaims('trusted-writer-uid',OWNER_EMAIL,{recordSyncV2CutoverOperator:true}),owner=auth('owner-uid',OWNER_EMAIL);await assertSucceeds(setDoc(doc(trusted,writerPath),payload()));for(const changed of [{sourceRecordSyncManifestHash:'f'.repeat(64)},{safetyRevision:99},{state:'hard-paused'},{admissionPolicyToken:'v1-admission:'+'0'.repeat(64)},{admissionOpen:false},{acceptNewSessions:false},{acceptNewMutations:false}]){await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),writerPath),{...writer(),...changed,persistedAt:Timestamp.now(),persistedBy:'admin',persistedByEmail:OWNER_EMAIL},{merge:false}));await assertFails(setDoc(doc(owner,`companies/${COMPANY_ID}/writerBlocked/${Object.keys(changed)[0]}`),{blocked:true}))}await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,writerPath),{...writer(),persistedAt:Timestamp.now(),persistedBy:'admin',persistedByEmail:OWNER_EMAIL},{merge:false});await setDoc(doc(db,safetyPath),{...safety(),activationEpoch:'writer-seed-other-epoch'},{merge:false})});await assertFails(setDoc(doc(owner,`companies/${COMPANY_ID}/writerBlocked/safetyActivationEpoch`),{blocked:true}))});

  test('W exists即使open也逐項拒recovery receipt、resume event與S paused→active',async()=>{await seedSources();const owner=auth('owner-uid',OWNER_EMAIL),pause=buildRecordSyncSafetyPause({control:safety(),eventId:'pause-writer-resume-1',reason:'writer safety mutation fence',safeRecordDataHash:'record-v1:'+'7'.repeat(64),cloudBackupId:'writer-resume-backup-1',createdAt:'2026-08-17T10:02:00.123456789+08:00'}),recovery=buildRecordSyncRecoveryReceipt({environment:'staging',activationEpoch:safety().activationEpoch,pauseEventId:pause.event.eventId,sourceBackupId:'writer-resume-backup-1',restoredRecordDataHash:'record-v1:'+'8'.repeat(64),operationLogHash:'9'.repeat(64),confirmedOperationCount:0,createdAt:'2026-08-17T10:03:00.123456789+08:00'}),recoveryPath=`stagingRecordSyncRecoveryReceipts/${COMPANY_ID}/epochs/${safety().activationEpoch}/receipts/${recovery.receiptHash}`;await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,writerPath),{...writer(),persistedAt:Timestamp.now(),persistedBy:'admin',persistedByEmail:OWNER_EMAIL});await setDoc(doc(db,safetyPath),pause.nextControl,{merge:false});await setDoc(doc(db,'stagingMigrationBackups/danbridge/runs/writer-resume-backup-1'),{state:'verified'})});await assertFails(setDoc(doc(owner,recoveryPath),{...recovery,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),recoveryPath),recovery));const resume=buildRecordSyncSafetyResume({control:pause.nextControl,eventId:'resume-writer-hardpaused-1',recoveryReceipt:recovery,readbackRecordDataHash:recovery.restoredRecordDataHash,createdAt:'2026-08-17T10:04:00.123456789+08:00'}),eventPath=`stagingRecordSyncSafetyEvents/${COMPANY_ID}/epochs/${safety().activationEpoch}/events/${resume.event.eventId}`;await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),safetyPath),resume.nextControl,{merge:false}));await assertFails(setDoc(doc(owner,eventPath),{...resume.event,persistedAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL}));await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,safetyPath),pause.nextControl,{merge:false});await setDoc(doc(db,eventPath),resume.event)});await assertFails(setDoc(doc(owner,safetyPath),{...resume.nextControl,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL},{merge:false}))});
});

describe('V2 takeover candidate trusted atomic pair',()=>{
  const controlPath=epoch=>`stagingRecordSyncV2TakeoverCandidateControls/${COMPANY_ID}/epochs/${epoch}`,headPath=epoch=>`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${epoch}`,zero='0'.repeat(64),hash=value=>String(value).repeat(64);
  const pair=(epoch='v2-candidate-rules-epoch-1')=>{const head={schema:'danbridge-active-record-v2-authority-bound-head-v1',state:'root-installed-candidate',scope:'revision-zero-genesis-binding-not-daily-commit-control-or-write-takeover-authority',environment:'staging',companyId:COMPANY_ID,sourceV1ActivationEpoch:'v1-source-rules-epoch-1',targetV2Epoch:epoch,authorityRootHash:hash('1'),genesisAuthorityHash:hash('2'),genesisAuthorityAuditHash:hash('3'),changesAuthorityHash:hash('4'),changesAuthorityAuditHash:hash('5'),seedId:`v2-genesis:${hash('6')}`,revision:0,headSaveId:'',previousCommitHash:zero,commitHash:zero,operationCount:0,updatedAt:'',lastActorUid:'',lastActorEmail:'',previousHeadHash:zero,headHash:hash('7')},control={schema:'danbridge-record-sync-v2-takeover-candidate-control-v1',state:'root-installed-candidate',scope:'root-installed-candidate-not-active-rules-runtime-session-mutation-audit-append-or-write-takeover-authority',environment:'staging',companyId:COMPANY_ID,sourceV1ActivationEpoch:head.sourceV1ActivationEpoch,targetV2Epoch:epoch,authorityRootHash:head.authorityRootHash,authorityBoundHeadHash:head.headHash,genesisAuthorityHash:head.genesisAuthorityHash,genesisAuthorityAuditHash:head.genesisAuthorityAuditHash,changesAuthorityHash:head.changesAuthorityHash,changesAuthorityAuditHash:head.changesAuthorityAuditHash,seedId:head.seedId,sourceRawDocumentRootHash:hash('8'),activeLogicalHashSchema:'danbridge-record-sync-v1-raw-active-logical-hash-v1',activeLogicalDataHash:`raw-active-v1:${hash('9')}`,documentCount:0,activeCount:0,tombstoneCount:0,auditedCount:0,unauditedCount:0,reservationPlanManifestHash:hash('a'),durableReservationManifestHash:hash('b'),durableCursorHash:hash('c'),strictReservationReadbackReceiptHash:hash('d'),changesDocumentCount:0,distinctReservationCount:0,unreservableCount:0,candidateNextIndex:0,cursorRevision:0,writerProtocol:'v2',writerGeneration:2,rulesetHash:hash('e'),minClientProtocolVersion:4,minClientReleaseId:'20.26.114',createdAt:'2026-08-17T11:29:00.123456789+08:00',readAllowed:false,writeAllowed:false,readTakeoverEnabled:false,writeTakeoverEnabled:false,acceptNewSessions:false,acceptNewMutations:false,allowAuditAppends:false,controlHash:hash('f')};return{control,head}};
  const trusted=(uid='trusted-cutover-uid',email=OWNER_EMAIL)=>authClaims(uid,email,{recordSyncV2CutoverOperator:true});
  const writePair=(db,epoch,patch={})=>{const artifacts=pair(epoch),uid=patch.uid??'trusted-cutover-uid',email=patch.email??OWNER_EMAIL,at=patch.literalTime??serverTimestamp(),control={...artifacts.control,...patch.control,persistedAt:at,persistedBy:patch.persistedBy??uid,persistedByEmail:patch.persistedByEmail??email},head={...artifacts.head,...patch.head,persistedAt:at,persistedBy:patch.headPersistedBy??uid,persistedByEmail:patch.headPersistedByEmail??email};return runTransaction(db,async transaction=>{transaction.set(doc(db,controlPath(epoch)),control);transaction.set(doc(db,headPath(epoch)),head)})};

  test('Candidate C/H僅Admin/CI可建立；operatorOwner只讀，其他client讀寫皆拒',async()=>{
    const epoch='v2-candidate-admin-only-1',artifacts=pair(epoch),at=Timestamp.now();
    const allowedReaders=[trusted(),trusted('backup-owner-uid',BACKUP_OWNER_EMAIL)];
    const deniedReaders=[auth('owner-uid',OWNER_EMAIL),auth('backup-owner-uid',BACKUP_OWNER_EMAIL),authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),unauthenticated()];
    for(const actor of [...allowedReaders,...deniedReaders])await assertFails(writePair(actor,epoch));
    await testEnv.withSecurityRulesDisabled(async context=>{
      const db=context.firestore(),audit={persistedAt:at,persistedBy:'service-account:danbridge-staging-v2',persistedByEmail:'danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com'};
      await setDoc(doc(db,controlPath(epoch)),{...artifacts.control,...audit});
      await setDoc(doc(db,headPath(epoch)),{...artifacts.head,...audit});
    });
    for(const actor of allowedReaders){
      assert.equal((await assertSucceeds(getDoc(doc(actor,controlPath(epoch))))).exists(),true);
      assert.equal((await assertSucceeds(getDoc(doc(actor,headPath(epoch))))).exists(),true);
    }
    for(const actor of deniedReaders){
      await assertFails(getDoc(doc(actor,controlPath(epoch))));
      await assertFails(getDoc(doc(actor,headPath(epoch))));
    }
  });

  test('單寫與Admin遺留partial都不能由client補齊',async()=>{const db=trusted(),epoch='v2-candidate-single-1',artifacts=pair(epoch),audit={persistedAt:serverTimestamp(),persistedBy:'trusted-cutover-uid',persistedByEmail:OWNER_EMAIL};await assertFails(setDoc(doc(db,controlPath(epoch)),{...artifacts.control,...audit}));await assertFails(setDoc(doc(db,headPath(epoch)),{...artifacts.head,...audit}));await testEnv.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),controlPath(epoch)),{...artifacts.control,persistedAt:Timestamp.now(),persistedBy:'trusted-cutover-uid',persistedByEmail:OWNER_EMAIL}));await assertFails(setDoc(doc(db,headPath(epoch)),{...artifacts.head,...audit}))});

  test('mirror/hash/audit/actor/任一enable flag與舊V1 schema全部拒',async()=>{const cases=[{control:{authorityBoundHeadHash:hash('0')}},{head:{authorityRootHash:hash('0')}},{control:{controlHash:zero}},{persistedBy:'forged-uid'},{persistedByEmail:'other@example.com'},{headPersistedBy:'other-uid'},{literalTime:Timestamp.fromMillis(Date.now()-60000)},{control:{writeAllowed:true}},{control:{readTakeoverEnabled:true}},{control:{schema:'danbridge-record-sync-control-v1'}}];for(let index=0;index<cases.length;index++)await assertFails(writePair(trusted(),`v2-candidate-invalid-${index}`,cases[index]))});

  test('Admin建立後candidate pair對所有client immutable；不同company path亦全部拒',async()=>{const db=trusted(),epoch='v2-candidate-immutable-1',artifacts=pair(epoch);await testEnv.withSecurityRulesDisabled(async context=>{const adminDb=context.firestore(),at=Timestamp.now(),audit={persistedAt:at,persistedBy:'service-account:danbridge-staging-v2',persistedByEmail:'danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com'};await setDoc(doc(adminDb,controlPath(epoch)),{...artifacts.control,...audit});await setDoc(doc(adminDb,headPath(epoch)),{...artifacts.head,...audit})});await assertFails(updateDoc(doc(db,controlPath(epoch)),{minClientReleaseId:'20.26.999'}));await assertFails(deleteDoc(doc(db,headPath(epoch))));const at=serverTimestamp();await assertFails(runTransaction(db,async transaction=>{transaction.set(doc(db,`stagingRecordSyncV2TakeoverCandidateControls/other/epochs/${epoch}`),{...artifacts.control,companyId:'other',persistedAt:at,persistedBy:'trusted-cutover-uid',persistedByEmail:OWNER_EMAIL});transaction.set(doc(db,`stagingActiveRecordV2Heads/other/epochs/${epoch}`),{...artifacts.head,companyId:'other',persistedAt:at,persistedBy:'trusted-cutover-uid',persistedByEmail:OWNER_EMAIL})}))});

  test('I2 intent僅operatorOwner可讀且所有client CUD永久拒',async()=>{const path='stagingRecordSyncV2ActivationCutoverIntents/danbridge/epochs/i2-admin-only',operator=trusted(),ordinary=auth('owner-uid',OWNER_EMAIL),teacher=authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),foreign=authClaims('foreign-owner','foreign@example.com',{recordSyncV2CutoverOperator:true}),at=Timestamp.now();await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),path),{schema:'fixture-i2',persistedAt:at}));assert.equal((await assertSucceeds(getDoc(doc(operator,path)))).exists(),true);for(const db of [ordinary,teacher,foreign,unauthenticated()])await assertFails(getDoc(doc(db,path)));for(const db of [operator,ordinary,teacher]){await assertFails(setDoc(doc(db,path),{forged:true}));await assertFails(updateDoc(doc(db,path),{forged:true}));await assertFails(deleteDoc(doc(db,path)))}});

  test('D1 fixed receipt僅operatorOwner可讀且所有client CUD永久拒',async()=>{const path='stagingRecordSyncV2DeploymentReceipts/danbridge/epochs/d1-admin-only/receipts/trusted-deployment-evidence-v2',operator=trusted(),backupOperator=trusted('backup-owner-uid',BACKUP_OWNER_EMAIL),ordinary=auth('owner-uid',OWNER_EMAIL),teacher=authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),foreign=authClaims('foreign-owner','foreign@example.com',{recordSyncV2CutoverOperator:true}),at=Timestamp.now();await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),path),{schema:'fixture-d1',persistedAt:at}));for(const db of [operator,backupOperator])assert.equal((await assertSucceeds(getDoc(doc(db,path)))).exists(),true);for(const db of [ordinary,teacher,foreign,unauthenticated()])await assertFails(getDoc(doc(db,path)));for(const db of [operator,backupOperator,ordinary,teacher]){await assertFails(setDoc(doc(db,path),{forged:true}));await assertFails(updateDoc(doc(db,path),{forged:true}));await assertFails(deleteDoc(doc(db,path)))}});

  test('R0 registration僅operatorOwner可讀且所有client CUD永久拒',async()=>{const seed='v2-genesis:'+hash('3'),path=`stagingRecordSyncV2Reservations/danbridge/epochs/r0-admin-only/seeds/${seed}`,operator=trusted(),backupOperator=trusted('backup-owner-uid',BACKUP_OWNER_EMAIL),ordinary=auth('owner-uid',OWNER_EMAIL),teacher=authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),foreign=authClaims('foreign-owner','foreign@example.com',{recordSyncV2CutoverOperator:true}),anonymous=unauthenticated();await testEnv.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),path),{schema:'danbridge-record-sync-v2-change-reservation-registration-v1',persistedAt:Timestamp.now(),persistedBy:'legacy-owner',persistedByEmail:OWNER_EMAIL}));for(const db of [operator,backupOperator])assert.equal((await assertSucceeds(getDoc(doc(db,path)))).exists(),true);for(const db of [ordinary,teacher,foreign,anonymous])await assertFails(getDoc(doc(db,path)));for(const db of [operator,backupOperator,ordinary,teacher,foreign]){await assertFails(setDoc(doc(db,path),{schema:'danbridge-record-sync-v2-change-reservation-registration-v1',persistedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,path),{forged:true}));await assertFails(deleteDoc(doc(db,path)))}});

  test('G1.5 identity index root/bucket/seal對所有client read與CUD永久拒',async()=>{const base='stagingRecordSyncV2GenesisIdentityIndexes/danbridge/epochs/g15-admin-only/seeds/v2-genesis:'+hash('1'),paths=[`${base}/buckets/000`,`${base}/bucketSeals/000`,`${base}/artifacts/root`],actors=[trusted(),trusted('backup-owner-uid',BACKUP_OWNER_EMAIL),auth('owner-uid',OWNER_EMAIL),authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),authClaims('foreign-owner','foreign@example.com',{recordSyncV2CutoverOperator:true}),unauthenticated()];await testEnv.withSecurityRulesDisabled(async context=>{for(const path of paths)await setDoc(doc(context.firestore(),path),{schema:'fixture-g15'})});for(const db of actors)for(const path of paths){await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{forged:true}));await assertFails(updateDoc(doc(db,path),{forged:true}));await assertFails(deleteDoc(doc(db,path)))}});

  test('G2 manifest/readback與G3 authority僅operatorOwner可讀，所有client含舊schema CUD永久拒',async()=>{const seed='v2-genesis:'+hash('2'),base=`stagingRecordSyncV2Genesis/danbridge/epochs/g23-admin-only/seeds/${seed}`,paths=[`${base}/artifacts/manifest`,`${base}/artifacts/readback`,`stagingRecordSyncV2GenesisAuthorities/danbridge/epochs/g23-admin-only/seeds/${seed}`],operator=trusted(),backup=trusted('backup-owner-uid',BACKUP_OWNER_EMAIL),ordinary=auth('owner-uid',OWNER_EMAIL),teacher=authClaims('teacher-uid',TEACHER_EMAIL,{recordSyncV2CutoverOperator:true}),foreign=authClaims('foreign-owner','foreign@example.com',{recordSyncV2CutoverOperator:true}),anonymous=unauthenticated();await testEnv.withSecurityRulesDisabled(async context=>{for(const path of paths)await setDoc(doc(context.firestore(),path),{schema:'fixture-admin-ci',persistedAt:Timestamp.now()})});for(const db of [operator,backup])for(const path of paths)assert.equal((await assertSucceeds(getDoc(doc(db,path)))).exists(),true);for(const db of [ordinary,teacher,foreign,anonymous])for(const path of paths)await assertFails(getDoc(doc(db,path)));for(const db of [operator,backup,ordinary,teacher])for(const path of paths){await assertFails(setDoc(doc(db,path),{schema:'danbridge-record-sync-v2-legacy-v1'}));await assertFails(updateDoc(doc(db,path),{forged:true}));await assertFails(deleteDoc(doc(db,path)))}for(const db of [operator,backup]){const suffix=db===operator?'primary':'backup';await assertFails(setDoc(doc(db,`${base}/artifacts/legacy-${suffix}`),{schema:'danbridge-record-sync-v2-genesis-durable-manifest-v1'}));await assertFails(setDoc(doc(db,`stagingRecordSyncV2GenesisAuthorities/danbridge/epochs/g23-admin-only-${suffix}/seeds/${seed}`),{schema:'danbridge-record-sync-v2-genesis-authority-v1'}))}});

  test('V2永久 fence+active control+精確H0時僅Owner可讀head，其他V2 namespace仍關閉',async()=>{
    const epoch='v2-runtime-owner-h0-read-1',h=value=>String(value).repeat(64),zero='0'.repeat(64);
    const paths={fence:`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,control:`stagingRecordSyncV2ActiveControls/${COMPANY_ID}/epochs/${epoch}`,head:`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${epoch}`};
    const roots={authorityRootHash:h('a'),genesisAuthorityHash:h('b'),reservationAuthorityHash:h('c')},activeHeadHash=h('d'),controlHash=h('e'),sourceV1ActivationEpoch='source-v1-h0-epoch-12345',sourceFreezeId='source-v1-h0-freeze-12345',seedId=`v2-genesis:${h('1')}`,candidateControlHash=h('2'),candidateHeadHash=h('3'),deploymentEvidenceHash=h('4');
    await testEnv.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      await setDoc(doc(db,paths.fence),{schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',environment:'staging',companyId:COMPANY_ID,projectId:'danbridge-d8877-staging',sourceV1ActivationEpoch,sourceFreezeId,targetV2Epoch:epoch,seedId,fencePolicy:'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence',fenceHash:h('f'),activeControlHash:controlHash,activeHeadHash,candidateControlHash,candidateHeadHash,deploymentEvidenceHash,...roots});
      await setDoc(doc(db,paths.control),{schema:'danbridge-record-sync-v2-structural-active-control-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:COMPANY_ID,sourceV1ActivationEpoch,sourceFreezeId,activationEpoch:epoch,seedId,writerProtocol:'v2',writerGeneration:2,readAllowed:true,writeAllowed:true,readTakeoverEnabled:true,writeTakeoverEnabled:true,acceptNewSessions:true,acceptNewMutations:true,allowAuditAppends:true,controlHash,activeHeadHash,...roots});
      await setDoc(doc(db,paths.head),{schema:'danbridge-active-record-v2-structural-head0-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:COMPANY_ID,sourceV1ActivationEpoch,sourceFreezeId,activationEpoch:epoch,seedId,revision:0,headSaveId:'',operationCount:0,previousCommitHash:zero,commitHash:zero,headHash:activeHeadHash,sourceCandidateControlHash:candidateControlHash,sourceCandidateHeadHash:candidateHeadHash,deploymentEvidenceHash,...roots});
    });
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),anonymous=unauthenticated();
    assert.equal((await assertSucceeds(getDoc(doc(owner,paths.head)))).exists(),true);
    await assertFails(getDoc(doc(owner,paths.control)));
    for(const db of [teacher,anonymous])await assertFails(getDoc(doc(db,paths.head)));
    for(const db of [owner,trusted()]){
      await assertFails(setDoc(doc(db,paths.head),{forged:true}));
      await assertFails(updateDoc(doc(db,paths.head),{forged:true}));
      await assertFails(deleteDoc(doc(db,paths.head)));
    }
    await testEnv.withSecurityRulesDisabled(async context=>updateDoc(doc(context.firestore(),paths.head),{deploymentEvidenceHash:h('9')}));
    await assertFails(getDoc(doc(owner,paths.head)));
  });

  test('永久fence精確綁定時Owner僅可讀H1 prewrite所需Genesis三證據',async()=>{
    const epoch='v2-owner-prewrite-epoch-1',h=value=>String(value).repeat(64),seed=`v2-genesis:${h('1')}`;
    const base=`stagingRecordSyncV2Genesis/${COMPANY_ID}/epochs/${epoch}/seeds/${seed}`;
    const paths={
      fence:`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,
      manifest:`${base}/artifacts/manifest`,
      readback:`${base}/artifacts/readback`,
      authority:`stagingRecordSyncV2GenesisAuthorities/${COMPANY_ID}/epochs/${epoch}/seeds/${seed}`,
      seed:base,
      batch:`${base}/batchReceipts/${h('2')}`,
      audit:`stagingRecordSyncV2GenesisAuthorityAuditReceipts/${COMPANY_ID}/epochs/${epoch}/seeds/${seed}`,
      foreignManifest:`stagingRecordSyncV2Genesis/${COMPANY_ID}/epochs/${epoch}-foreign/seeds/${seed}/artifacts/manifest`
    };
    await testEnv.withSecurityRulesDisabled(async context=>{
      const db=context.firestore(),fixture={schema:'fixture-prewrite',persistedAt:Timestamp.now()};
      await setDoc(doc(db,paths.fence),{schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',environment:'staging',companyId:COMPANY_ID,projectId:'danbridge-d8877-staging',targetV2Epoch:epoch,seedId:seed,fencePolicy:'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence',fenceHash:h('f'),genesisAuthorityHash:h('a'),genesisAuthorityAuditHash:h('b'),parentFrozenSourceProofHash:h('c')});
      for(const path of Object.values(paths).filter(path=>path!==paths.fence))await setDoc(doc(db,path),fixture);
    });
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),anonymous=unauthenticated();
    for(const path of [paths.manifest,paths.readback,paths.authority])assert.equal((await assertSucceeds(getDoc(doc(owner,path)))).exists(),true);
    for(const path of [paths.seed,paths.batch,paths.audit,paths.foreignManifest])await assertFails(getDoc(doc(owner,path)));
    for(const db of [teacher,anonymous])for(const path of [paths.manifest,paths.readback,paths.authority])await assertFails(getDoc(doc(db,path)));
    for(const db of [owner,trusted()])for(const path of [paths.manifest,paths.readback,paths.authority]){
      await assertFails(setDoc(doc(db,path),{forged:true}));
      await assertFails(updateDoc(doc(db,path),{forged:true}));
      await assertFails(deleteDoc(doc(db,path)));
    }
  });

  test('V2永久 fence+active control+H1 後僅Owner可讀active epoch，所有client寫入仍拒',async()=>{
    const epoch='v2-runtime-owner-read-1',h=value=>String(value).repeat(64);
    const paths={
      fence:`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,
      control:`stagingRecordSyncV2ActiveControls/${COMPANY_ID}/epochs/${epoch}`,
      head:`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${epoch}`,
      baselineManifest:`stagingActiveRecordV2Baselines/${COMPANY_ID}/epochs/${epoch}/artifacts/manifest`,
      baselineRecord:`stagingActiveRecordV2Baselines/${COMPANY_ID}/epochs/${epoch}/collections/lessons/records/lesson-1`,
      record:`stagingActiveRecordV2Records/${COMPANY_ID}/epochs/${epoch}/collections/lessons/records/lesson-1`,
      receipt:`stagingActiveRecordV2OperationReceipts/${COMPANY_ID}/epochs/${epoch}/operations/op-1`,
      save:`stagingActiveRecordV2SaveCommits/${COMPANY_ID}/epochs/${epoch}/saves/save-1`
    };
    const roots={authorityRootHash:h('a'),genesisAuthorityHash:h('b'),reservationAuthorityHash:h('c')};
    const activeHeadHash=h('d'),controlHash=h('e');
    await testEnv.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      await setDoc(doc(db,paths.fence),{schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',environment:'staging',companyId:COMPANY_ID,projectId:'danbridge-d8877-staging',targetV2Epoch:epoch,fencePolicy:'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence',fenceHash:h('f'),activeControlHash:controlHash,activeHeadHash,...roots});
      await setDoc(doc(db,paths.control),{schema:'danbridge-record-sync-v2-structural-active-control-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,writerProtocol:'v2',writerGeneration:2,readAllowed:true,writeAllowed:true,readTakeoverEnabled:true,writeTakeoverEnabled:true,acceptNewSessions:true,acceptNewMutations:true,allowAuditAppends:true,controlHash,activeHeadHash,...roots});
      await setDoc(doc(db,paths.head),{schema:'danbridge-active-record-authority-head-v2',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,revision:1,headHash:h('1'),commitHash:h('2'),sourceActiveControlHash:controlHash,sourceStructuralHeadHash:activeHeadHash,...roots});
      await setDoc(doc(db,paths.baselineManifest),{schema:'danbridge-active-record-v2-baseline-snapshot-manifest-v1',state:'h1-complete-baseline-confirmed',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,h1HeadHash:h('1'),h1CommitHash:h('2'),recordCount:1});
      await setDoc(doc(db,paths.baselineRecord),{schema:'danbridge-active-record-v2-first-daily-union-row-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,collection:'lessons',recordId:'lesson-1'});
      await setDoc(doc(db,paths.record),{schema:'danbridge-active-record-authority-daily-record-v2',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,collection:'lessons',recordId:'lesson-1'});
      await setDoc(doc(db,paths.receipt),{schema:'danbridge-active-record-authority-receipt-v2',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,operationId:'op-1'});
      await setDoc(doc(db,paths.save),{schema:'danbridge-active-record-authority-ledger-v2',environment:'staging',companyId:COMPANY_ID,activationEpoch:epoch,saveId:'save-1'});
    });
    const owners=[auth('owner-uid',OWNER_EMAIL),auth('backup-owner-uid',BACKUP_OWNER_EMAIL)];
    for(const db of owners)for(const path of [paths.control,paths.head,paths.baselineManifest,paths.baselineRecord,paths.record,paths.receipt,paths.save])assert.equal((await assertSucceeds(getDoc(doc(db,path)))).exists(),true);
    for(const db of [auth('teacher-uid',TEACHER_EMAIL),unauthenticated()])for(const path of [paths.control,paths.head,paths.baselineManifest,paths.baselineRecord,paths.record,paths.receipt,paths.save])await assertFails(getDoc(doc(db,path)));
    for(const db of [...owners,trusted()])for(const path of [paths.control,paths.head,paths.baselineManifest,paths.baselineRecord,paths.record,paths.receipt,paths.save]){
      await assertFails(setDoc(doc(db,path),{forged:true}));
      await assertFails(updateDoc(doc(db,path),{forged:true}));
      await assertFails(deleteDoc(doc(db,path)));
    }
  });

  test('future deployment/active/safety/session/daily/ledger/genesis/reservation仍deny-only',async()=>{const db=trusted(),paths=['stagingRecordSyncV2DeploymentReceipts/danbridge/epochs/blocked/receipts/r1','stagingRecordSyncV2ActiveControls/danbridge/epochs/blocked','stagingRecordSyncV2SafetyControls/danbridge/epochs/blocked','stagingRecordSyncV2Sessions/danbridge/epochs/blocked/sessions/s1','stagingRecordSyncV2PermanentFences/danbridge/epochs/blocked','stagingActiveRecordV2Records/danbridge/epochs/blocked/collections/lessons/records/l1','stagingActiveRecordV2OperationReceipts/danbridge/epochs/blocked/operations/o1','stagingActiveRecordV2SaveCommits/danbridge/epochs/blocked/saves/s1','stagingRecordSyncV2Genesis/danbridge/epochs/blocked','stagingRecordSyncV2Reservations/danbridge/epochs/blocked'];for(const path of paths){await assertFails(setDoc(doc(db,path),{forged:true}));await assertFails(getDoc(doc(db,path)))}});
});
after(async () => {
  await testEnv?.cleanup();
});

  describe('角色逐筆即時檢視權限、墓碑與中斷發布',()=>{
  const epoch='role-view-epoch-1';
  const emptyDb=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
  const roleCollections=[...FULL_RECORD_COLLECTIONS];
  const setupRoot=async({paused=false,state='active',readTakeover=true,writeTakeover=true,activationEpoch=epoch}={})=>testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore(),stamp=Timestamp.now();await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state,activationEpoch,readTakeover,writeTakeover});await setDoc(doc(db,`stagingRecordSyncSafetyControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch,state:paused?'paused':'active',revision:paused?2:1,lastEventId:paused?'pause-role-view-1':'activation:role-view-1',lastEventHash:'a'.repeat(64),readAllowed:true,writeAllowed:!paused,updatedAt:'2026-08-15T04:00:00+08:00',persistedAt:stamp,updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL})});
  const roleAdapter=(db,uid,email,{failBatch=0}={})=>{let batchNumber=0;return createFirebaseRoleRecordViewAdapter({environment:'staging',role:'owner',actor:{uid,email},serverTimestamp,getDocument:path=>getDoc(doc(db,path)),getCollectionDocuments:async path=>(await getDocs(collection(db,path))).docs.map(row=>({id:row.id,data:row.data()})),runBatchTransaction:callback=>{batchNumber++;if(failBatch===batchNumber)throw new Error('Emulator injected interruption');return runTransaction(db,transaction=>callback({get:path=>transaction.get(doc(db,path)),set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})}))},runTransaction:callback=>runTransaction(db,transaction=>callback({get:path=>transaction.get(doc(db,path)),set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})}))})};
  const publish=(adapter,db,identity,label='first',extra={})=>adapter.synchronize(db,{identity,activationEpoch:epoch,sourceRecordHash:recordDataHash(db),publishId:`publish-${label}-12345`,publishedAt:`2026-08-15T04:${label==='first'?'01':'02'}:00+08:00`,batchSize:2,...extra});
  const teacherIdentity={email:TEACHER_EMAIL,kind:'teacher',teacherId:'teacher-1',branchIds:[]},schedulerIdentity={email:SECOND_SCHEDULER_EMAIL,kind:'scheduler',teacherId:'teacher-2',branchIds:[]},managerIdentity={email:MANAGER_EMAIL,kind:'branch_manager',teacherId:'manager-teacher',branchIds:['branch-a']};

  test('尚未啟用時本人可把缺少的角色控制讀成不存在並維持 legacy；跨角色與停權仍拒絕',async()=>{
    const teacher=auth('teacher-uid',TEACHER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL),inactive=auth('inactive-uid',INACTIVE_EMAIL),controlPath=email=>`stagingRoleRecordViewControls/${COMPANY_ID}/views/${email}`;
    await testEnv.withSecurityRulesDisabled(async context=>deleteDoc(doc(context.firestore(),`stagingRecordSyncSafetyControls/${COMPANY_ID}`)));
    for(const [db,email] of [[teacher,TEACHER_EMAIL],[scheduler,SECOND_SCHEDULER_EMAIL],[manager,MANAGER_EMAIL]]){
      const snapshot=await assertSucceeds(getDoc(doc(db,controlPath(email))));
      assert.equal(snapshot.exists(),false);
      const safety=await assertSucceeds(getDoc(doc(db,`stagingRecordSyncSafetyControls/${COMPANY_ID}`)));
      assert.equal(safety.exists(),false);
    }
    await assertFails(getDoc(doc(teacher,controlPath(SECOND_SCHEDULER_EMAIL))));
    await assertFails(getDoc(doc(scheduler,controlPath(TEACHER_EMAIL))));
    await assertFails(getDoc(doc(inactive,controlPath(INACTIVE_EMAIL))));
  });

  test('Daniel 發布後，aa／一般老師／主管只能讀自己的 scope；Catherine 可接手 Owner 讀寫',async()=>{
    await setupRoot();const owner=auth('owner-uid',OWNER_EMAIL),backup=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL),inactive=auth('inactive-uid',INACTIVE_EMAIL);
    const teacherDb=emptyDb();teacherDb.lessons=[{id:'teacher-lesson',teacherId:'teacher-1'}];const schedulerDb=emptyDb();schedulerDb.lessons=[{id:'scheduler-lesson',teacherId:'teacher-2'}];const managerDb=emptyDb();managerDb.lessons=[{id:'manager-lesson',teacherId:'manager-teacher',branchId:'branch-a'}];managerDb.fixedExpenses=[{id:'manager-expense',branchId:'branch-a'}];
    const teacherView=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),teacherDb,teacherIdentity,'teacher'),schedulerView=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),schedulerDb,schedulerIdentity,'scheduler'),managerView=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),managerDb,managerIdentity,'manager');
    const controlPath=email=>`stagingRoleRecordViewControls/${COMPANY_ID}/views/${email}`,recordPath=(view,collectionName,id)=>`stagingRoleRecordViews/${COMPANY_ID}/views/${view.viewKey}/collections/${collectionName}/records/${id}`;
    await assertSucceeds(getDoc(doc(teacher,controlPath(TEACHER_EMAIL))));await assertSucceeds(getDoc(doc(teacher,recordPath(teacherView,'lessons','teacher-lesson'))));await assertFails(getDoc(doc(teacher,controlPath(SECOND_SCHEDULER_EMAIL))));await assertFails(getDoc(doc(teacher,recordPath(schedulerView,'lessons','scheduler-lesson'))));
    await assertSucceeds(getDoc(doc(scheduler,controlPath(SECOND_SCHEDULER_EMAIL))));await assertSucceeds(getDoc(doc(scheduler,recordPath(schedulerView,'lessons','scheduler-lesson'))));await assertFails(getDoc(doc(scheduler,recordPath(teacherView,'lessons','teacher-lesson'))));
    await assertSucceeds(getDoc(doc(manager,controlPath(MANAGER_EMAIL))));await assertSucceeds(getDoc(doc(manager,recordPath(managerView,'lessons','manager-lesson'))));await assertSucceeds(getDoc(doc(manager,recordPath(managerView,'fixedExpenses','manager-expense'))));await assertFails(getDoc(doc(manager,recordPath(schedulerView,'lessons','scheduler-lesson'))));
    for(const db of [teacher,scheduler,manager])await assertSucceeds(getDoc(doc(db,`stagingRecordSyncSafetyControls/${COMPANY_ID}`)));await assertFails(getDoc(doc(inactive,`stagingRecordSyncSafetyControls/${COMPANY_ID}`)));await assertFails(getDoc(doc(inactive,controlPath(TEACHER_EMAIL))));
    await assertSucceeds(getDoc(doc(backup,recordPath(teacherView,'lessons','teacher-lesson'))));teacherDb.lessons[0].room='Catherine';const byCatherine=await publish(roleAdapter(backup,'backup-owner-uid',BACKUP_OWNER_EMAIL),teacherDb,teacherIdentity,'backup');assert.equal(byCatherine.control.persistedByEmail,BACKUP_OWNER_EMAIL);assert.equal((await getDoc(doc(teacher,recordPath(teacherView,'lessons','teacher-lesson')))).data().record.room,'Catherine');
    const forged=(await getDoc(doc(owner,recordPath(teacherView,'lessons','teacher-lesson')))).data();await assertFails(setDoc(doc(teacher,recordPath(teacherView,'lessons','teacher-write')),{...forged,recordId:'teacher-write',record:{id:'teacher-write'},revision:1,updatedAt:serverTimestamp(),updatedBy:'teacher-uid',updatedByEmail:TEACHER_EMAIL}));
  });

  test('aa 與一般老師 16 集合 list 驗證：本人通過，外他 view 擋掉；停權與未登入拒絕',async()=>{
    await setupRoot();const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),inactive=auth('inactive-uid',INACTIVE_EMAIL),anon=unauthenticated();
    const teacherDb=emptyDb();teacherDb.lessons=[{id:'teacher-lesson',teacherId:'teacher-1'}];const schedulerDb=emptyDb();schedulerDb.lessons=[{id:'scheduler-lesson',teacherId:'teacher-2'}];
    const teacherView=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),teacherDb,teacherIdentity,'teacher-list-pass'),schedulerView=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),schedulerDb,schedulerIdentity,'scheduler-list-pass');
    const collectionPath=(viewKey,collectionId)=>`stagingRoleRecordViews/${COMPANY_ID}/views/${viewKey}/collections/${collectionId}/records`;
    for(const collectionId of roleCollections){
      await assertSucceeds(getDocs(collection(scheduler,collectionPath(schedulerView.viewKey,collectionId))));
      await assertFails(getDocs(collection(teacher,collectionPath(schedulerView.viewKey,collectionId))));
      await assertSucceeds(getDocs(collection(teacher,collectionPath(teacherView.viewKey,collectionId))));
      await assertFails(getDocs(collection(scheduler,collectionPath(teacherView.viewKey,collectionId))));
    }
    await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'sealed',activationEpoch:epoch,readTakeover:true,writeTakeover:true},{merge:false});});
    await assertFails(getDocs(collection(teacher,collectionPath(teacherView.viewKey,roleCollections[0]))));
    await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:epoch,readTakeover:false,writeTakeover:true},{merge:false});});
    await assertFails(getDocs(collection(teacher,collectionPath(teacherView.viewKey,roleCollections[0]))));
    await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:'mismatch-epoch',readTakeover:true,writeTakeover:true},{merge:false});});
    await assertFails(getDocs(collection(teacher,collectionPath(teacherView.viewKey,roleCollections[0]))));
    await testEnv.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,`stagingRecordSyncControls/${COMPANY_ID}`),{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:epoch,readTakeover:true,writeTakeover:true},{merge:false});});
    await assertSucceeds(getDocs(collection(teacher,collectionPath(teacherView.viewKey,roleCollections[0]))));
    for(const db of [inactive,anon]){
      await assertFails(getDocs(collection(db,collectionPath(schedulerView.viewKey,roleCollections[0]))));
      await assertFails(getDocs(collection(db,collectionPath(teacherView.viewKey,roleCollections[0]))));
    }
  });

  test('墓碑、同 ID 重建與 revision 在真實 Rules 下連續；實體刪除、跳版及錯 scope 全拒絕',async()=>{
    await setupRoot();const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),adapter=roleAdapter(owner,'owner-uid',OWNER_EMAIL);let db=emptyDb();db.lessons=[{id:'tombstone-lesson',room:'A'}];const first=await publish(adapter,db,teacherIdentity,'first'),path=`stagingRoleRecordViews/${COMPANY_ID}/views/${first.viewKey}/collections/lessons/records/tombstone-lesson`;db=emptyDb();const removed=await publish(adapter,db,teacherIdentity,'remove');assert.equal((await getDoc(doc(owner,path))).data().revision,2);assert.equal((await getDoc(doc(owner,path))).data().deleted,true);assert.equal(removed.tombstoneCount,1);await assertSucceeds(getDoc(doc(teacher,path)));
    db.lessons=[{id:'tombstone-lesson',room:'revived'}];await publish(adapter,db,teacherIdentity,'revive');assert.equal((await getDoc(doc(owner,path))).data().revision,3);assert.equal((await getDoc(doc(owner,path))).data().deleted,false);await assertFails(deleteDoc(doc(owner,path)));await assertFails(updateDoc(doc(owner,path),{revision:9}));
    const controlPath=`stagingRoleRecordViewControls/${COMPANY_ID}/views/${TEACHER_EMAIL}`,control=(await getDoc(doc(owner,controlPath))).data();await assertFails(setDoc(doc(owner,controlPath),{...control,teacherId:'teacher-2',revision:control.revision+1,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));await assertFails(setDoc(doc(owner,controlPath),{...control,collectionActiveCounts:{...control.collectionActiveCounts,unknown:0},revision:control.revision+1,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL}));
  });

  test('分批中斷不發布控制且角色不可讀半套；續傳完成後才一次開放',async()=>{
    await setupRoot();const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),db=emptyDb();db.lessons=Array.from({length:5},(_,index)=>({id:`resume-lesson-${index}`,teacherId:'teacher-1'}));const interrupted=roleAdapter(owner,'owner-uid',OWNER_EMAIL,{failBatch:2});await assert.rejects(()=>publish(interrupted,db,teacherIdentity,'interrupt'),/第 2 批失敗/);const viewKey=roleRecordViewKey(teacherIdentity,epoch),controlPath=`stagingRoleRecordViewControls/${COMPANY_ID}/views/${TEACHER_EMAIL}`,partialPath=`stagingRoleRecordViews/${COMPANY_ID}/views/${viewKey}/collections/lessons/records/resume-lesson-0`;assert.equal((await getDoc(doc(owner,controlPath))).exists(),false);await assertSucceeds(getDoc(doc(owner,partialPath)));await assertFails(getDoc(doc(teacher,partialPath)));
    const resumed=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),db,teacherIdentity,'resume');await assertSucceeds(getDoc(doc(teacher,`stagingRoleRecordViewControls/${COMPANY_ID}/views/${TEACHER_EMAIL}`)));await assertSucceeds(getDoc(doc(teacher,`stagingRoleRecordViews/${COMPANY_ID}/views/${resumed.viewKey}/collections/lessons/records/resume-lesson-0`)));assert.equal(resumed.activeCount,5);
  });

  test('中央暫停時舊畫面仍可讀，但 Daniel／Catherine 都不能發布任何新角色資料',async()=>{
    await setupRoot();const owner=auth('owner-uid',OWNER_EMAIL),backup=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),db=emptyDb();db.lessons=[{id:'paused-lesson',teacherId:'teacher-1'}];const active=await publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),db,teacherIdentity,'first');await testEnv.withSecurityRulesDisabled(async context=>{const raw=context.firestore(),ref=doc(raw,`stagingRecordSyncSafetyControls/${COMPANY_ID}`),current=(await getDoc(ref)).data();await setDoc(ref,{...current,state:'paused',revision:2,lastEventId:'pause-role-view-1',writeAllowed:false})});await assertSucceeds(getDoc(doc(teacher,`stagingRoleRecordViews/${COMPANY_ID}/views/${active.viewKey}/collections/lessons/records/paused-lesson`)));await assertSucceeds(getDoc(doc(teacher,`stagingRecordSyncSafetyControls/${COMPANY_ID}`)));db.lessons[0].room='blocked';await assert.rejects(()=>publish(roleAdapter(owner,'owner-uid',OWNER_EMAIL),db,teacherIdentity,'paused-owner'),/第 1 批失敗/);await assert.rejects(()=>publish(roleAdapter(backup,'backup-owner-uid',BACKUP_OWNER_EMAIL),db,teacherIdentity,'paused-backup'),/第 1 批失敗/);
  });
});

describe('未登入與停權帳號', () => {
  test('未登入者不能讀取公司資料', async () => {
    await assertFails(getDoc(doc(unauthenticated(), `companies/${COMPANY_ID}/data/main`)));
  });

  test('停權老師不能讀取老師檢視', async () => {
    const db = auth('inactive-uid', INACTIVE_EMAIL);
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${INACTIVE_EMAIL}`)));
  });
});

describe('帳號邀請', () => {
  test('只有受邀 Gmail 能完成首次登入紀錄並讀取其綁定檢視', async () => {
    const invited = auth('invited-uid', INVITED_EMAIL);
    await assertSucceeds(setDoc(doc(invited, 'users/invited-uid'), { email: INVITED_EMAIL, active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1', displayName: 'Invited Teacher', lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(invited, `companies/${COMPANY_ID}/teacherViews/${INVITED_EMAIL}`)));
    const uninvited = auth('uninvited-uid', 'uninvited@example.com');
    await assertFails(setDoc(doc(uninvited, 'users/uninvited-uid'), { email: 'uninvited@example.com', active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1' }));
    await assertFails(getDoc(doc(uninvited, `companies/${COMPANY_ID}/teacherViews/${INVITED_EMAIL}`)));
  });
});

describe('每日分片雲端備份權限與不可覆寫保護',()=>{
  const keys=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
  const build=(day,uid,email)=>{
    const db=Object.fromEntries(keys.map(key=>[key,[]]));db.lessons=[{id:`lesson-${day}`,date:day,start:'10:00',end:'11:00'}];
    const plan=prepareDailyShardedBackup(db,{day,environment:'staging',maxChunkBytes:180000}),readback=verifyDailyShardedBackupReadback(plan.manifest,plan.chunks),manifest={...sealDailyShardedBackup(plan.manifest,readback,{verifiedBy:uid,verifiedByEmail:email}),verifiedAt:serverTimestamp()},chunks=plan.chunks.map(chunk=>({...chunk,createdAt:serverTimestamp(),createdBy:uid,createdByEmail:email}));
    return{manifest,chunks};
  };
  const dayRef=(db,day)=>doc(db,`dailyShardedBackups/${COMPANY_ID}/days/${day}`);
  const chunkRef=(db,day,id)=>doc(db,`dailyShardedBackups/${COMPANY_ID}/days/${day}/chunks/${id}`);

  test('Daniel 建立全部分片後才能建立 verified manifest，Catherine 可完整讀取',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),backupOwner=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),day='2026-08-15',{manifest,chunks}=build(day,'owner-uid',OWNER_EMAIL);
    for(const chunk of chunks)await assertSucceeds(setDoc(chunkRef(owner,day,chunk.chunkId),chunk));
    await assertSucceeds(setDoc(dayRef(owner,day),manifest));
    assert.equal((await assertSucceeds(getDocs(collection(backupOwner,`dailyShardedBackups/${COMPANY_ID}/days/${day}/chunks`)))).size,chunks.length);
    await assertSucceeds(getDoc(dayRef(backupOwner,day)));
    await assertFails(getDoc(dayRef(teacher,day)));
    await assertFails(setDoc(chunkRef(teacher,day,'lessons-9999'),{...chunks[0],chunkId:'lessons-9999',index:9999,createdBy:'teacher-uid',createdByEmail:TEACHER_EMAIL}));
  });

  test('分片與 manifest 建立後不可修改或提早刪除，未驗證及多餘欄位均拒絕',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),day='2026-08-16',{manifest,chunks}=build(day,'owner-uid',OWNER_EMAIL),first=chunks[0],record=dayRef(owner,day),chunk=chunkRef(owner,day,first.chunkId);
    await assertSucceeds(setDoc(chunk,first));await assertSucceeds(setDoc(record,manifest));
    await assertFails(updateDoc(chunk,{index:first.index}));await assertFails(deleteDoc(chunk));await assertFails(updateDoc(record,{recordCount:manifest.recordCount}));await assertFails(deleteDoc(record));
    const invalidDay='2026-08-17',invalid=build(invalidDay,'owner-uid',OWNER_EMAIL);for(const row of invalid.chunks)await assertSucceeds(setDoc(chunkRef(owner,invalidDay,row.chunkId),row));
    await assertFails(setDoc(dayRef(owner,invalidDay),{...invalid.manifest,state:'uploading'}));
    await assertFails(setDoc(dayRef(owner,invalidDay),{...invalid.manifest,unexpected:true}));
  });

  test('Catherine 具有相同建立能力；只有滿三十天後才可依保留政策刪除',async()=>{
    const backupOwner=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),day='2026-08-18',{manifest,chunks}=build(day,'backup-owner-uid',BACKUP_OWNER_EMAIL);for(const chunk of chunks)await assertSucceeds(setDoc(chunkRef(backupOwner,day,chunk.chunkId),chunk));await assertSucceeds(setDoc(dayRef(backupOwner,day),manifest));
    const youngManifestDay='2026-06-02',expiredDay='2026-06-01',expired=Timestamp.fromMillis(Date.now()-31*24*60*60*1000),recent=Timestamp.now();await testEnv.withSecurityRulesDisabled(async context=>{const admin=context.firestore();await setDoc(chunkRef(admin,youngManifestDay,'lessons-0000'),{createdAt:expired});await setDoc(dayRef(admin,youngManifestDay),{verifiedAt:recent});await setDoc(chunkRef(admin,expiredDay,'lessons-0000'),{createdAt:expired});await setDoc(dayRef(admin,expiredDay),{verifiedAt:expired})});
    await assertFails(deleteDoc(chunkRef(backupOwner,youngManifestDay,'lessons-0000')));
    await assertSucceeds(deleteDoc(chunkRef(backupOwner,expiredDay,'lessons-0000')));await assertSucceeds(deleteDoc(dayRef(backupOwner,expiredDay)));
  });

  test('永久 fence 對 v2-shaped、舊版及畸形文件皆 fail closed，備份建立與保留期刪除全部停止',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),fencePath=`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,expired=Timestamp.fromMillis(Date.now()-31*24*60*60*1000),fences=[
      {schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',companyId:COMPANY_ID,projectId:'danbridge-rules-test',sourceV1ActivationEpoch:'rules-backup-source-v1',sourceFreezeId:'rules-backup-freeze-v1',targetV2Epoch:'rules-backup-fence-v2',deploymentAttestationHash:'a'.repeat(64)},
      {schema:'danbridge-record-sync-v1-permanent-fence-v1',state:'fenced',companyId:COMPANY_ID},
      {malformed:true}
    ];
    for(let index=0;index<fences.length;index++){
      const day=`2026-05-0${index+1}`,attemptDay=`2026-05-1${index+1}`,attempt=build(attemptDay,'owner-uid',OWNER_EMAIL),first=attempt.chunks[0];
      await testEnv.withSecurityRulesDisabled(async context=>{const admin=context.firestore();await setDoc(dayRef(admin,day),{verifiedAt:expired});await setDoc(chunkRef(admin,day,'lessons-0000'),{createdAt:expired});await setDoc(doc(admin,fencePath),fences[index],{merge:false})});
      await assertFails(setDoc(chunkRef(owner,attemptDay,first.chunkId),first));
      await assertFails(setDoc(dayRef(owner,attemptDay),attempt.manifest));
      await assertFails(deleteDoc(chunkRef(owner,day,'lessons-0000')));
      await assertFails(deleteDoc(dayRef(owner,day)));
    }
  });
});

describe('Owner 權限', () => {
  test('排課專員授權只允許 aa 帳號', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    await assertSucceeds(setDoc(doc(owner, `companyAccess/${SECOND_SCHEDULER_EMAIL}`), { email: SECOND_SCHEDULER_EMAIL, active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-aa', canManageSchedule: true }));
    await assertFails(setDoc(doc(owner, `companyAccess/${WENDY_EMAIL}`), { email: WENDY_EMAIL, active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-wendy', canManageSchedule: true }));
    await assertFails(setDoc(doc(owner, 'companyAccess/not-approved@gmail.com'), { email: 'not-approved@gmail.com', active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-other', canManageSchedule: true }));
    await assertFails(updateDoc(doc(owner, `companyAccess/${OTHER_TEACHER_EMAIL}`), { canManageSchedule: true }));
    await assertSucceeds(updateDoc(doc(owner, `companyAccess/${OTHER_TEACHER_EMAIL}`), { canManageSchedule: false }));
  });

  test('Wendy request 狀態與公司主資料可由 Owner 原子完成', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const requestRef = doc(owner, `companies/${COMPANY_ID}/scheduleRequests/atomic-wendy`);
    const mainRef = doc(owner, `companies/${COMPANY_ID}/data/main`);
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), `companies/${COMPANY_ID}/scheduleRequests/atomic-wendy`), { companyId: COMPANY_ID, actorEmail: WENDY_EMAIL, status: 'pending' });
    });
    await assertSucceeds(runTransaction(owner, async transaction => {
      const [requestSnap, mainSnap] = await Promise.all([transaction.get(requestRef), transaction.get(mainRef)]);
      assert.equal(requestSnap.data().status, 'pending');
      transaction.set(mainRef, { ...mainSnap.data(), atomicWendyLesson: 'lesson-atomic' });
      transaction.set(requestRef, { status: 'applied', appliedAt: serverTimestamp(), appliedBy: 'owner-uid' }, { merge: true });
    }));
    assert.equal((await getDoc(requestRef)).data().status, 'applied');
    assert.equal((await getDoc(mainRef)).data().atomicWendyLesson, 'lesson-atomic');
  });

  test('既有 aa 稽核紀錄不會阻擋兩位 Owner 重試套用排課異動', async () => {
    const owners = [
      ['owner-uid', OWNER_EMAIL],
      ['backup-owner-uid', BACKUP_OWNER_EMAIL]
    ];
    for (const [index, [uid, email]] of owners.entries()) {
      const owner = auth(uid, email);
      const requestId = `atomic-aa-existing-audit-${index}`;
      const requestRef = doc(owner, `companies/${COMPANY_ID}/scheduleRequests/${requestId}`);
      const mainRef = doc(owner, `companies/${COMPANY_ID}/data/main`);
      const auditRef = doc(owner, `companyAudit/scheduler-${requestId}`);
      await testEnv.withSecurityRulesDisabled(async context => {
        const admin = context.firestore();
        await setDoc(doc(admin, `companies/${COMPANY_ID}/scheduleRequests/${requestId}`), {
          companyId: COMPANY_ID,
          actorEmail: SECOND_SCHEDULER_EMAIL,
          status: 'pending'
        });
        await setDoc(doc(admin, `companyAudit/scheduler-${requestId}`), {
          companyId: COMPANY_ID,
          actorUid: uid,
          actorEmail: email,
          action: 'scheduler-request-applied'
        });
      });
      await assertSucceeds(runTransaction(owner, async transaction => {
        const [requestSnap, mainSnap, auditSnap] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(mainRef),
          transaction.get(auditRef)
        ]);
        assert.equal(requestSnap.data().status, 'pending');
        assert.equal(auditSnap.exists(), true);
        transaction.set(mainRef, { ...mainSnap.data(), [`atomicAaOwner${index}`]: requestId });
        transaction.set(requestRef, { status: 'applied', appliedAt: serverTimestamp(), appliedBy: uid }, { merge: true });
      }));
      assert.equal((await getDoc(requestRef)).data().status, 'applied');
      assert.equal((await getDoc(auditRef)).data().action, 'scheduler-request-applied');
    }
  });

  test('同步衝突備份只有 Owner 可以讀寫', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const backupOwner = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    await assertSucceeds(getDoc(doc(owner, `companies/${COMPANY_ID}/syncConflictBackups/conflict-1`)));
    await assertSucceeds(setDoc(doc(backupOwner, `companies/${COMPANY_ID}/syncConflictBackups/conflict-2`), { companyId: COMPANY_ID, payload: '[]' }));
    for (const [uid, email] of [['teacher-uid', TEACHER_EMAIL], ['manager-uid', MANAGER_EMAIL], ['wendy-uid', WENDY_EMAIL]]) {
      const member = auth(uid, email);
      await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/syncConflictBackups/conflict-1`)));
      await assertFails(setDoc(doc(member, `companies/${COMPANY_ID}/syncConflictBackups/forbidden-${uid}`), { payload: '[]' }));
    }
  });

  test('備援 Owner 僅憑正式授權即可立即訂閱全部課程回報', async () => {
    const backup = auth('backup-owner-without-profile', BACKUP_OWNER_EMAIL);
    const reports = await assertSucceeds(getDocs(collection(backup, `companies/${COMPANY_ID}/lessonReports`)));
    assert.equal(reports.size, 2);
  });

  test('Owner 可以讀寫公司命名空間與管理授權', async () => {
    const db = auth('owner-uid', OWNER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/data/main`)));
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/data/owner-write`), { ok: true }));
    await assertSucceeds(setDoc(doc(db, 'companyAccess/new@example.com'), { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'new-teacher' }));
  });

  test('受邀備援 Owner 首次登入後取得完整權限，停權後立即失效', async () => {
    const primary = auth('owner-uid', OWNER_EMAIL);
    const backup = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    await assertSucceeds(setDoc(doc(backup, 'users/backup-owner-uid'), { email: BACKUP_OWNER_EMAIL, displayName: 'Backup Owner', active: true, companyId: COMPANY_ID, role: 'owner', lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(backup, `companies/${COMPANY_ID}/data/main`)));
    await assertSucceeds(setDoc(doc(backup, `companies/${COMPANY_ID}/dailyBackups/2026-08-11`), { hash: 'verified', snapshot: { lessons: [] } }));
    await assertSucceeds(updateDoc(doc(primary, `companyAccess/${BACKUP_OWNER_EMAIL}`), { active: false }));
    await assertSucceeds(updateDoc(doc(primary, 'users/backup-owner-uid'), { active: false }));
    await assertFails(getDoc(doc(backup, `companies/${COMPANY_ID}/data/main`)));
  });

  test('備援 Owner 有完整營運權限但不能控制主要 Owner 或建立第三個 Owner', async () => {
    const backup = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    await assertSucceeds(setDoc(doc(backup, 'users/backup-owner-uid'), { email: BACKUP_OWNER_EMAIL, displayName: 'Backup Owner', active: true, companyId: COMPANY_ID, role: 'owner', lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(backup, `companies/${COMPANY_ID}/data/backup-owner-write`), { ok: true }));
    await assertFails(setDoc(doc(backup, 'companyAccess/third-owner@gmail.com'), { email: 'third-owner@gmail.com', active: true, companyId: COMPANY_ID, role: 'owner' }));
    await assertFails(setDoc(doc(backup, 'companyAccess/third-teacher@gmail.com'), { email: 'third-teacher@gmail.com', active: true, companyId: COMPANY_ID, role: 'owner' }));
    await assertFails(setDoc(doc(backup, `companyAccess/${OWNER_EMAIL}`), { email: OWNER_EMAIL, active: false, companyId: COMPANY_ID, role: 'owner' }));
    await assertFails(updateDoc(doc(backup, 'users/owner-uid'), { active: false }));
  });

  test('舊管理者個人檔案可依正式備援 Owner 授權校正後讀取課程回報', async () => {
    const primary = auth('owner-uid', OWNER_EMAIL);
    const backup = auth('backup-owner-uid', BACKUP_OWNER_EMAIL);
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users/backup-owner-uid'), { email: BACKUP_OWNER_EMAIL, displayName: 'Catherine', active: true, companyId: COMPANY_ID, role: 'branch_manager' });
    });
    await assertSucceeds(setDoc(doc(backup, 'users/backup-owner-uid'), { email: BACKUP_OWNER_EMAIL, displayName: 'Catherine', active: true, companyId: COMPANY_ID, role: 'owner', lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(getDoc(doc(backup, `companies/${COMPANY_ID}/lessonReports/lesson-own`)));
    await assertSucceeds(deleteDoc(doc(primary, `companyAccess/${BACKUP_OWNER_EMAIL}`)));
    await assertSucceeds(updateDoc(doc(primary, 'users/backup-owner-uid'), { active: false, role: 'revoked' }));
    await assertFails(getDoc(doc(backup, `companies/${COMPANY_ID}/lessonReports/lesson-own`)));
  });

  test('Owner 停權後立即阻止存取，重新啟用後恢復原老師範圍', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const teacher = auth('teacher-uid', TEACHER_EMAIL);
    const accessRef = doc(owner, `companyAccess/${TEACHER_EMAIL}`);
    await assertSucceeds(updateDoc(accessRef, { active: false }));
    await assertFails(getDoc(doc(teacher, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertSucceeds(updateDoc(accessRef, { active: true }));
    await assertSucceeds(getDoc(doc(teacher, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
  });

  test('Owner 變更角色後舊角色範圍立即失效且只開放新角色範圍', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const member = auth('teacher-uid', TEACHER_EMAIL);
    const accessRef = doc(owner, `companyAccess/${TEACHER_EMAIL}`);
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${TEACHER_EMAIL}`)));
    await assertSucceeds(updateDoc(accessRef, { role: 'branch_manager', branchIds: ['branch-a'] }));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${TEACHER_EMAIL}`)));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-manager`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-other`)));
  });

  test('管理者轉為老師時舊校區範圍失效，老師檢視必須符合新綁定', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const member = auth('manager-uid', MANAGER_EMAIL);
    const accessRef = doc(owner, `companyAccess/${MANAGER_EMAIL}`);
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(updateDoc(accessRef, { role: 'teacher', teacherId: 'teacher-1' }));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(setDoc(doc(owner, `companies/${COMPANY_ID}/teacherViews/${MANAGER_EMAIL}`), { teacherId: 'teacher-1', lessons: ['lesson-own'] }));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${MANAGER_EMAIL}`)));
  });

  test('更換老師綁定時舊老師資料立即失效', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const member = auth('teacher-uid', TEACHER_EMAIL);
    const accessRef = doc(owner, `companyAccess/${TEACHER_EMAIL}`);
    await assertSucceeds(updateDoc(accessRef, { teacherId: 'teacher-2' }));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-own`)));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-other`)));
    await assertSucceeds(setDoc(doc(owner, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`), { teacherId: 'teacher-2', lessons: ['lesson-other'] }));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
  });

  test('管理者校區範圍變更時舊校區檢視立即失效', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const member = auth('manager-uid', MANAGER_EMAIL);
    const accessRef = doc(owner, `companyAccess/${MANAGER_EMAIL}`);
    const viewRef = doc(owner, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`);
    await assertSucceeds(updateDoc(accessRef, { branchIds: ['branch-a', 'branch-b'] }));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(setDoc(viewRef, { branchIds: ['branch-a', 'branch-b'] }));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(updateDoc(accessRef, { branchIds: ['branch-a'] }));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-manager`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-other`)));
  });

  test('刪除權限文件後所有舊角色資料立即拒絕', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const member = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(deleteDoc(doc(owner, `companyAccess/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/lessonMeta/lesson-own`)));
    await assertFails(getDoc(doc(member, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`)));
  });

  test('Owner 課表寫入會同步到另一個即時監聽客戶端', async () => {
    const writer = auth('owner-writer', OWNER_EMAIL);
    const reader = auth('owner-reader', OWNER_EMAIL);
    const ref = doc(reader, `companies/${COMPANY_ID}/data/main`);
    const marker = `sync-${Date.now()}`;
    let unsubscribe;
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('另一個客戶端未在期限內收到課表更新')), 3000);
      unsubscribe = onSnapshot(ref, snapshot => {
        if (snapshot.data()?.clientHash !== marker) return;
        clearTimeout(timer);
        resolve(snapshot.data());
      }, reject);
    });
    await assertSucceeds(setDoc(doc(writer, `companies/${COMPANY_ID}/data/main`), {
      clientHash: marker,
      db: { lessons: [{ id: 'sync-lesson', date: '2026-08-10', teacherId: 'teacher-1' }] }
    }));
    const data = await received;
    unsubscribe?.();
    assert.equal(data.db.lessons[0].id, 'sync-lesson');
  });

  test('稽核紀錄只能由 Owner 建立，建立後任何人都不能修改或刪除', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const teacher = auth('teacher-uid', TEACHER_EMAIL);
    const ref = doc(owner, 'companyAudit/audit-immutable-1');
    const payload = { companyId: COMPANY_ID, action: 'data-change', category: 'data', actorUid: 'owner-uid', actorEmail: OWNER_EMAIL, targetType: 'company-data', targetId: COMPANY_ID, changedFields: ['lessons.date'], entityChanges: ['lessons:update:lesson-own:date'], totalChanges: 1, truncated: false, beforeHash: 'before', afterHash: 'after', release: '20.21.1', environment: 'staging', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(ref, payload));
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { action: 'tampered' }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(teacher, 'companyAudit/teacher-forged'), { ...payload, actorUid: 'teacher-uid', actorEmail: TEACHER_EMAIL }));
    await assertFails(getDoc(doc(teacher, 'companyAudit/audit-immutable-1')));
  });
});

describe('老師權限', () => {
  test('老師只能更新自己的登入時間與公開帳號資訊', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    const ref = doc(db, 'users/teacher-uid');
    await assertSucceeds(updateDoc(ref, { displayName: 'Teacher', photoURL: '', lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { role: 'owner', updatedAt: serverTimestamp() }));
  });

  test('老師只能讀取自己的檢視、課程 metadata 與回報', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${OTHER_TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/branchViews/${TEACHER_EMAIL}`)));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/lessonMeta/lesson-own`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/lessonMeta/lesson-other`)));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-own`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-other`)));
  });

  test('老師不能修改課程或公司主資料', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertFails(updateDoc(doc(db, `companies/${COMPANY_ID}/lessonMeta/lesson-own`), { active: false }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/data/teacher-write`), { forbidden: true }));
  });

  test('老師只能在有效時間窗提交本人課堂回報', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-own`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-own',
      reportedForTeacherIds: ['teacher-1'],
      branchId: 'branch-a',
      content: 'updated by teacher'
    }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-other`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-other',
      reportedForTeacherIds: ['teacher-2'],
      branchId: 'branch-b',
      content: 'cross-teacher write'
    }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-expired`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-expired',
      reportedForTeacherIds: ['teacher-1'],
      branchId: 'branch-a',
      content: 'late write'
    }));
  });

  test('老師不能竄改回報的老師或校區範圍', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-own`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-own',
      reportedForTeacherIds: ['teacher-2'],
      branchId: 'branch-a',
      content: 'spoofed teacher scope'
    }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-own`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-own',
      reportedForTeacherIds: ['teacher-1'],
      branchId: 'branch-b',
      content: 'spoofed branch scope'
    }));
  });
});

describe('校區管理者權限', () => {
  test('管理者只能讀取綁定校區的資料', async () => {
    const db = auth('manager-uid', MANAGER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/branchViews/${MANAGER_EMAIL}`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${MANAGER_EMAIL}`)));
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/lessonMeta/lesson-manager`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/lessonMeta/lesson-other`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/data/main`)));
  });

  test('管理者只能回報指定校區且本人授課的課程', async () => {
    const db = auth('manager-uid', MANAGER_EMAIL);
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-manager`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-manager',
      reportedForTeacherIds: ['manager-teacher'],
      branchId: 'branch-a',
      content: 'manager own report'
    }));
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/lessonReports/lesson-other`), {
      companyId: COMPANY_ID,
      lessonId: 'lesson-other',
      reportedForTeacherIds: ['teacher-2'],
      branchId: 'branch-b',
      content: 'cross-branch report'
    }));
  });
});

describe('通知中心權限', () => {
  test('收件人只能讀取自己的通知，且只能更新已讀欄位', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/scheduleNotifications/other-notice`)));
    await assertSucceeds(updateDoc(doc(db, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`), {
      read: true,
      acknowledgedAt: Timestamp.now(),
      acknowledgedBy: TEACHER_EMAIL
    }));
    await assertFails(updateDoc(doc(db, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`), {
      message: 'tampered'
    }));
  });

  test('AA 排課專員可用自己的 uid 確認自己的通知', async () => {
    const db = auth('scheduler-2-uid', SECOND_SCHEDULER_EMAIL);
    await assertSucceeds(updateDoc(doc(db, `companies/${COMPANY_ID}/scheduleNotifications/scheduler-notice`), {
      read: true,
      acknowledgedAt: Timestamp.now(),
      acknowledgedBy: 'scheduler-2-uid'
    }));
  });

  test('老師即時收到自己的通知與權限撤銷串流', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    const teacher = auth('teacher-uid', TEACHER_EMAIL);
    const marker = `live-notice-${Date.now()}`;
    let unsubscribeNotice;
    const noticeReceived = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('老師未在期限內收到自己的通知更新')), 3000);
      unsubscribeNotice = onSnapshot(doc(teacher, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`), snapshot => {
        if (snapshot.data()?.message !== marker) return;
        clearTimeout(timer);resolve(snapshot.data());
      }, reject);
    });
    await assertSucceeds(updateDoc(doc(owner, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`), { message: marker }));
    assert.equal((await noticeReceived).message, marker);
    unsubscribeNotice?.();

    let unsubscribeAccess;
    const revoked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('權限撤銷未在期限內送達登入防護監聽')), 3000);
      unsubscribeAccess = onSnapshot(doc(teacher, `companyAccess/${TEACHER_EMAIL}`), snapshot => {
        if (snapshot.data()?.active !== false) return;
        clearTimeout(timer);resolve(snapshot.data());
      }, reject);
    });
    await assertSucceeds(updateDoc(doc(owner, `companyAccess/${TEACHER_EMAIL}`), { active: false }));
    assert.equal((await revoked).active, false);
    unsubscribeAccess?.();
    await assertFails(getDoc(doc(teacher, `companies/${COMPANY_ID}/scheduleNotifications/teacher-notice`)));
  });
});

describe('錯誤監控權限與隱私', () => {
  const safeEvent = {
    release: '20.7.0',
    environment: 'staging',
    category: 'cloud-read',
    area: 'teacher-view',
    code: 'permission-denied',
    role: 'teacher',
    retryable: true,
    occurredAt: serverTimestamp()
  };

  test('有效成員只能新增最小化錯誤事件，不能讀取事件', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/errorEvents/teacher-event`), safeEvent));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/errorEvents/teacher-event`)));
  });

  test('拒絕含敏感或額外內容的錯誤事件', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertFails(setDoc(doc(db, `companies/${COMPANY_ID}/errorEvents/leaky-event`), {
      ...safeEvent,
      message: '學生姓名與完整錯誤內容'
    }));
  });

  test('拒絕停權成員與偽造角色', async () => {
    const inactive = auth('inactive-uid', INACTIVE_EMAIL);
    await assertFails(setDoc(doc(inactive, `companies/${COMPANY_ID}/errorEvents/inactive-event`), safeEvent));
    const teacher = auth('teacher-uid', TEACHER_EMAIL);
    await assertFails(setDoc(doc(teacher, `companies/${COMPANY_ID}/errorEvents/spoofed-role`), {
      ...safeEvent,
      role: 'owner'
    }));
  });

  test('Owner 可以集中讀取錯誤事件', async () => {
    const owner = auth('owner-uid', OWNER_EMAIL);
    await assertSucceeds(setDoc(doc(owner, `companies/${COMPANY_ID}/errorEvents/owner-event`), {
      ...safeEvent,
      role: 'owner'
    }));
    await assertSucceeds(getDoc(doc(owner, `companies/${COMPANY_ID}/errorEvents/owner-event`)));
  });
});

describe('非正式環境備份還原演練', () => {
  test('完整匯出、清空、還原後集合數量、關聯與抽樣資料一致', async () => {
    const db = auth('owner-uid', OWNER_EMAIL);
    const collectionKeys = ['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampClasses','winterCampRegistrations','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
    const source = Object.fromEntries(collectionKeys.map(key => [key, []]));
    source.students.push({ id: 'TEST-student-1', name: 'TEST Student' });
    source.teachers.push({ id: 'TEST-teacher-1', name: 'TEST Teacher' });
    source.branches.push({ id: 'TEST-branch-1', name: 'TEST Branch' });
    source.lessons.push({ id: 'TEST-lesson-1', studentId: 'TEST-student-1', teacherId: 'TEST-teacher-1', teacherIds: ['TEST-teacher-1'], branchId: 'TEST-branch-1', date: '2026-08-10', start: '10:00', end: '11:00' });
    source.makeups.push({ id: 'TEST-makeup-1', lessonId: 'TEST-lesson-1', studentId: 'TEST-student-1', teacherId: 'TEST-teacher-1' });
    source.collectionRecords.push({ id: 'TEST-collection-1', studentIds: ['TEST-student-1'], amount: 1000 });

    const canonical = JSON.stringify(source);
    const checksum = createHash('sha256').update(canonical).digest('hex');
    const counts = Object.fromEntries(collectionKeys.map(key => [key, source[key].length]));
    const exportedFile = JSON.stringify({ ...source, _meta: { environment: 'emulator', exportedAt: new Date().toISOString(), counts, checksum } });

    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/data/main`), { db: source, clientHash: checksum }));
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/data/main`), { db: Object.fromEntries(collectionKeys.map(key => [key, []])), clientHash: 'cleared-for-restore-test' }));

    const backup = JSON.parse(exportedFile);
    const restored = Object.fromEntries(collectionKeys.map(key => [key, backup[key]]));
    assert.equal(createHash('sha256').update(JSON.stringify(restored)).digest('hex'), backup._meta.checksum);
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/data/main`), { db: restored, clientHash: backup._meta.checksum }));

    const snapshot = await getDoc(doc(db, `companies/${COMPANY_ID}/data/main`));
    const actual = snapshot.data().db;
    assert.deepEqual(Object.fromEntries(collectionKeys.map(key => [key, actual[key].length])), counts);
    assert.equal(actual.lessons[0].studentId, actual.students[0].id);
    assert.ok(actual.lessons[0].teacherIds.includes(actual.teachers[0].id));
    assert.equal(actual.lessons[0].branchId, actual.branches[0].id);
    assert.equal(actual.makeups[0].lessonId, actual.lessons[0].id);
    assert.equal(actual.collectionRecords[0].studentIds[0], actual.students[0].id);
    assert.deepEqual(actual, source);
  });
});

describe('分片世代權限與原子啟用', () => {
  const generationPath=`companies/${COMPANY_ID}/shardedGenerations/generation-test`;
  const chunkPath=`${generationPath}/chunks/lessons-0000`;
  const activationPath=`companies/${COMPANY_ID}/shardedControl/active`;

  test('只有 Owner 可存取未啟用世代、分片與啟用指標', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL),scheduler=auth('scheduler-uid',SECOND_SCHEDULER_EMAIL);
    const manifest={schema:'danbridge-sharded-db-v1',generationId:'generation-test',sourceHash:'hash-v1',totalChunks:1,totalRecords:1};
    const chunk={key:'lessons',index:0,items:[{id:'lesson-1'}]};
    await assertSucceeds(setDoc(doc(owner,generationPath),manifest));
    await assertSucceeds(setDoc(doc(owner,chunkPath),chunk));
    await assertSucceeds(getDoc(doc(owner,generationPath)));
    for(const db of [unauthenticated(),teacher,manager,scheduler]){
      await assertFails(getDoc(doc(db,generationPath)));
      await assertFails(getDoc(doc(db,chunkPath)));
      await assertFails(setDoc(doc(db,activationPath),{activeGenerationId:'generation-test'}));
    }
  });

  test('舊主資料雜湊改變時禁止啟用，未改變時只提交小型指標', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),mainRef=doc(owner,`companies/${COMPANY_ID}/data/main`),manifestRef=doc(owner,generationPath),activationRef=doc(owner,activationPath);
    await setDoc(mainRef,{db:{lessons:[]},clientHash:'hash-v1'});
    await setDoc(manifestRef,{schema:'danbridge-sharded-db-v1',generationId:'generation-test',sourceHash:'hash-v1',verifiedHash:'hash-v1',totalChunks:1,totalRecords:0});
    await setDoc(mainRef,{db:{lessons:[{id:'newer'}]},clientHash:'hash-v2'});
    await assert.rejects(runTransaction(owner,async transaction=>{
      const [mainSnap,manifestSnap]=await Promise.all([transaction.get(mainRef),transaction.get(manifestRef)]);
      if(mainSnap.data().clientHash!==manifestSnap.data().sourceHash)throw new Error('legacy hash changed');
      transaction.set(activationRef,{activeGenerationId:manifestSnap.data().generationId,sourceHash:manifestSnap.data().sourceHash});
    }),/legacy hash changed/);
    assert.equal((await getDoc(activationRef)).exists(),false);
    await setDoc(mainRef,{db:{lessons:[]},clientHash:'hash-v1'});
    await assertSucceeds(runTransaction(owner,async transaction=>{
      const [mainSnap,manifestSnap]=await Promise.all([transaction.get(mainRef),transaction.get(manifestRef)]);
      assert.equal(manifestSnap.data().sourceHash,manifestSnap.data().verifiedHash);
      if(mainSnap.data().clientHash!==manifestSnap.data().sourceHash)throw new Error('legacy hash changed');
      transaction.set(activationRef,{schema:'danbridge-sharded-activation-v1',activeGenerationId:manifestSnap.data().generationId,sourceHash:manifestSnap.data().sourceHash,totalChunks:manifestSnap.data().totalChunks,totalRecords:manifestSnap.data().totalRecords});
    }));
    assert.deepEqual((await getDoc(activationRef)).data(),{schema:'danbridge-sharded-activation-v1',activeGenerationId:'generation-test',sourceHash:'hash-v1',totalChunks:1,totalRecords:0});
  });
});

describe('staging 逐筆影子資料權限', () => {
  const recordPath=collection=>`stagingRecordShadows/${COMPANY_ID}/collections/${collection}/records/record-1`;
  const payload=(collection,record={id:'record-1'})=>({
    companyId:COMPANY_ID,collection,recordId:'record-1',record,
    sourceHash:'hash-v1',revision:1,deleted:false,environment:'staging',
    updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL
  });

  test('只有 Owner 可讀寫三個核心集合的 staging 影子文件', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL),scheduler=auth('scheduler-uid',SECOND_SCHEDULER_EMAIL);
    await assertSucceeds(setDoc(doc(owner,recordPath('lessons')),payload('lessons')));
    await assertSucceeds(getDoc(doc(owner,recordPath('lessons'))));
    for(const db of [unauthenticated(),teacher,manager,scheduler]){
      await assertFails(getDoc(doc(db,recordPath('lessons'))));
      await assertFails(setDoc(doc(db,recordPath('lessons')),payload('lessons')));
    }
  });

  test('拒絕非核心集合、production 標記與不完整 metadata', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL);
    await assertFails(setDoc(doc(owner,recordPath('changes')),payload('changes')));
    await assertFails(setDoc(doc(owner,recordPath('students')),{...payload('students'),environment:'production'}));
    const missingRevision=payload('teachers');delete missingRevision.revision;
    await assertFails(setDoc(doc(owner,recordPath('teachers')),missingRevision));
    await assertFails(setDoc(doc(owner,recordPath('lessons')),{...payload('lessons'),extra:'forbidden'}));
  });

  test('revision 只能逐次加一且禁止實體刪除', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),recordRef=doc(owner,recordPath('lessons'));
    await assertSucceeds(setDoc(recordRef,payload('lessons')));
    await assertFails(setDoc(recordRef,{...payload('lessons'),revision:1,record:{id:'record-1',note:'重播'}}));
    await assertFails(setDoc(recordRef,{...payload('lessons'),revision:3,record:{id:'record-1',note:'跳號'}}));
    await assertSucceeds(setDoc(recordRef,{...payload('lessons'),revision:2,deleted:true,record:{id:'record-1'}}));
    await assertFails(deleteDoc(recordRef));
  });
});

describe('staging record-shadow verified run 與原子啟用', () => {
  const runPath=id=>`stagingRecordShadowRuns/${COMPANY_ID}/runs/${id}`;
  const controlPath=`stagingRecordShadowControls/${COMPANY_ID}`;
  const writingRun=(id='run-1',overrides={})=>({
    schema:'danbridge-record-shadow-run-v2',companyId:COMPANY_ID,environment:'staging',state:'writing',
    runId:id,sourceHash:'hash-v1',coreHash:'core-v1',documentCount:3,activeCount:2,tombstoneCount:1,
    createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL,...overrides
  });
  const verifiedFields={state:'verified',verifiedHash:'hash-v1',verifiedAt:serverTimestamp(),verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL};
  const activation=(runId='run-1',overrides={})=>({
    schema:'danbridge-record-shadow-activation-v2',companyId:COMPANY_ID,environment:'staging',
    activeRunId:runId,sourceHash:'hash-v1',verifiedHash:'hash-v1',coreHash:'core-v1',documentCount:3,activeCount:2,tombstoneCount:1,
    activatedAt:serverTimestamp(),activatedBy:'owner-uid',activatedByEmail:OWNER_EMAIL,...overrides
  });

  test('只有 Owner 可讀寫，且 run/control 均禁止實體刪除', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),runRef=doc(owner,runPath('role-run'));
    await assertSucceeds(setDoc(runRef,writingRun('role-run')));
    await assertSucceeds(getDoc(runRef));
    for(const db of [unauthenticated(),auth('teacher-uid',TEACHER_EMAIL),auth('manager-uid',MANAGER_EMAIL),auth('scheduler-uid',SECOND_SCHEDULER_EMAIL)]){
      await assertFails(getDoc(doc(db,runPath('role-run'))));
      await assertFails(setDoc(doc(db,runPath('forbidden')),writingRun('forbidden')));
      await assertFails(setDoc(doc(db,controlPath),activation('role-run')));
    }
    await assertFails(deleteDoc(runRef));
  });

  test('中斷 writing run、hash 不符、缺筆或多筆計數都不能啟用', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),mainRef=doc(owner,`companies/${COMPANY_ID}/data/main`),runRef=doc(owner,runPath('run-1')),controlRef=doc(owner,controlPath);
    await setDoc(mainRef,{db:{},clientHash:'hash-v1'});
    await assertSucceeds(setDoc(runRef,writingRun()));
    await assertFails(setDoc(controlRef,activation()));
    await assertFails(updateDoc(runRef,{...verifiedFields,verifiedHash:'wrong-hash'}));
    await assertSucceeds(updateDoc(runRef,verifiedFields));
    await assertFails(setDoc(controlRef,activation('run-1',{sourceHash:'wrong-hash',verifiedHash:'wrong-hash'})));
    await assertFails(setDoc(controlRef,activation('run-1',{documentCount:2,activeCount:1,tombstoneCount:1})));
    await assertFails(setDoc(controlRef,activation('run-1',{documentCount:4,activeCount:3,tombstoneCount:1})));
  });

  test('Emulator 實際逐筆讀回的缺筆、多筆與文件 hash 不符都不能 verified', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),manifest=buildRecordShadowRunManifest({runId:'readback',sourceHash:'hash-v1',coreHash:'core-v1',documentCount:2,activeCount:2,tombstoneCount:0});
    const record=(id,sourceHash='hash-v1',revision=1)=>({companyId:COMPANY_ID,collection:'lessons',recordId:id,record:{id},sourceHash,revision,deleted:false,environment:'staging',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL});
    const records=collection(owner,`stagingRecordShadows/${COMPANY_ID}/collections/lessons/records`);
    const readback=async()=>{
      const rows=(await getDocs(records)).docs.map(row=>row.data()),hashes=new Set(rows.map(row=>row.sourceHash));
      return{runId:'readback',sourceHash:hashes.size===1?[...hashes][0]:'mixed-hash',coreHash:'core-v1',documentCount:rows.length,activeCount:rows.filter(row=>!row.deleted).length,tombstoneCount:rows.filter(row=>row.deleted).length};
    };
    await setDoc(doc(records,'one'),record('one'));
    let actual=await readback();assert.throws(()=>verifyRecordShadowRun(manifest,actual),/文件數/);
    await setDoc(doc(records,'two'),record('two'));
    await setDoc(doc(records,'three'),record('three'));
    actual=await readback();assert.throws(()=>verifyRecordShadowRun(manifest,actual),/文件數/);
    await assertFails(deleteDoc(doc(records,'three')));
    await testEnv.withSecurityRulesDisabled(async context=>deleteDoc(doc(context.firestore(),`stagingRecordShadows/${COMPANY_ID}/collections/lessons/records/three`)));
    await setDoc(doc(records,'two'),record('two','hash-v2',2));
    actual=await readback();assert.throws(()=>verifyRecordShadowRun(manifest,actual),/hash/);
  });

  test('來源版本改變會阻止啟用；恢復相同版本後才能原子建立小型控制文件', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),mainRef=doc(owner,`companies/${COMPANY_ID}/data/main`),runRef=doc(owner,runPath('run-atomic')),controlRef=doc(owner,controlPath);
    await setDoc(mainRef,{db:{},clientHash:'hash-v1'});
    await assertSucceeds(setDoc(runRef,writingRun('run-atomic')));
    await assertSucceeds(updateDoc(runRef,verifiedFields));
    await setDoc(mainRef,{db:{newer:true},clientHash:'hash-v2'});
    await assertFails(setDoc(controlRef,activation('run-atomic')));
    assert.equal((await getDoc(controlRef)).exists(),false);
    await setDoc(mainRef,{db:{},clientHash:'hash-v1'});
    await assertSucceeds(setDoc(controlRef,activation('run-atomic')));
    const saved=(await getDoc(controlRef)).data();
    assert.equal(saved.activeRunId,'run-atomic');
    assert.equal(saved.sourceHash,'hash-v1');
    await assertFails(deleteDoc(controlRef));
  });

  test('run identity、計數與 staging metadata 建立後不可改寫或重播 verified', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),runRef=doc(owner,runPath('immutable'));
    await assertFails(setDoc(runRef,writingRun('immutable',{schema:'danbridge-record-shadow-run-v1'})));
    await assertFails(setDoc(runRef,writingRun('immutable',{environment:'production'})));
    await assertFails(setDoc(runRef,writingRun('immutable',{coreHash:''})));
    await assertFails(setDoc(runRef,writingRun('other')));
    await assertFails(setDoc(runRef,writingRun('immutable',{documentCount:4})));
    await assertSucceeds(setDoc(runRef,writingRun('immutable')));
    await assertFails(updateDoc(runRef,{sourceHash:'hash-v2'}));
    await assertFails(updateDoc(runRef,{documentCount:4,activeCount:3}));
    await assertSucceeds(updateDoc(runRef,verifiedFields));
    await assertFails(updateDoc(runRef,{...verifiedFields,verifiedAt:serverTimestamp()}));
  });

  test('v1 或缺少、偽造 coreHash 的控制文件一律拒絕', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),mainRef=doc(owner,`companies/${COMPANY_ID}/data/main`),runRef=doc(owner,runPath('core-hash')),controlRef=doc(owner,controlPath);
    await setDoc(mainRef,{db:{},clientHash:'hash-v1'});
    await setDoc(runRef,writingRun('core-hash'));
    await updateDoc(runRef,verifiedFields);
    await assertFails(setDoc(controlRef,activation('core-hash',{schema:'danbridge-record-shadow-activation-v1'})));
    const missing=activation('core-hash');delete missing.coreHash;
    await assertFails(setDoc(controlRef,missing));
    await assertFails(setDoc(controlRef,activation('core-hash',{coreHash:'forged'})));
    await assertSucceeds(setDoc(controlRef,activation('core-hash')));
    const backup=auth('backup-owner-uid',BACKUP_OWNER_EMAIL);
    await assertSucceeds(setDoc(doc(backup,controlPath),activation('core-hash',{activatedBy:'backup-owner-uid',activatedByEmail:BACKUP_OWNER_EMAIL})));
  });

  test('舊 Rules 留下的 v1 writing run 不得在 v2 Rules 下升級為 verified', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),legacyRef=doc(owner,runPath('legacy-v1'));
    await testEnv.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),runPath('legacy-v1')),{
      schema:'danbridge-record-shadow-run-v1',companyId:COMPANY_ID,environment:'staging',state:'writing',runId:'legacy-v1',sourceHash:'hash-v1',documentCount:3,activeCount:2,tombstoneCount:1,
      createdAt:Timestamp.now(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL
    }));
    await assertFails(updateDoc(legacyRef,verifiedFields));
  });

  test('遷移前備份分片與 verified manifest 建立後不可覆寫或刪除', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),backupId='migration-backup-1',sha='a'.repeat(64);
    const chunkRef=doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}/chunks/lessons-0000`);
    const chunk={schema:'danbridge-immutable-migration-backup-chunk-v2',environment:'staging',backupId,chunkId:'lessons-0000',collection:'lessons',index:0,items:[{id:'lesson-1'}],sourceHash:sha,sourceVersionHash:'legacy-hash-v1',createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL};
    await assertSucceeds(setDoc(chunkRef,chunk));
    await assertFails(setDoc(chunkRef,{...chunk,items:[]}));
    await assertFails(updateDoc(chunkRef,{sourceHash:'hash-v2'}));
    await assertFails(deleteDoc(chunkRef));
    await assertFails(getDoc(doc(teacher,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}/chunks/lessons-0000`)));
    await assertFails(setDoc(doc(teacher,`stagingMigrationBackups/${COMPANY_ID}/runs/teacher/chunks/lessons-0000`),{...chunk,backupId:'teacher',createdBy:'teacher-uid',createdByEmail:TEACHER_EMAIL}));

    const collectionOrder=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
    const collections=Object.fromEntries(collectionOrder.map(key=>[key,{count:key==='lessons'?1:0,chunks:key==='lessons'?1:0}]));
    const manifestRef=doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}`);
    const manifest={schema:'danbridge-immutable-migration-backup-v2',environment:'staging',state:'verified',backupId,sourceHash:sha,sourceVersionHash:'legacy-hash-v1',collectionOrder,collections,chunkCount:1,recordCount:1,maxChunkBytes:180000,verifiedHash:sha,verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL,verifiedAt:serverTimestamp()};
    await assertFails(setDoc(doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/production`),{...manifest,backupId:'production',environment:'production'}));
    await assertFails(setDoc(doc(owner,`stagingMigrationBackups/${COMPANY_ID}/runs/wrong-hash`),{...manifest,backupId:'wrong-hash',verifiedHash:'other'}));
    await assertSucceeds(setDoc(manifestRef,manifest));
    await assertFails(updateDoc(manifestRef,{recordCount:2}));
    await assertFails(deleteDoc(manifestRef));
    await assertFails(getDoc(doc(teacher,`stagingMigrationBackups/${COMPANY_ID}/runs/${backupId}`)));
  });

  test('隔離復原沙盒與 verified receipt 不能覆寫、刪除或由老師讀取', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),drillId='restore-drill-1',sha='b'.repeat(64);
    const chunkRef=doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}/chunks/lessons-0000`);
    const chunk={schema:'danbridge-immutable-migration-backup-chunk-v2',environment:'staging',backupId:drillId,sourceBackupId:'source-backup-1',chunkId:'lessons-0000',collection:'lessons',index:0,items:[{id:'lesson-1'}],sourceHash:sha,sourceVersionHash:'legacy-hash-v1',createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL};
    await assertSucceeds(setDoc(chunkRef,chunk));
    await assertFails(updateDoc(chunkRef,{items:[]}));
    await assertFails(deleteDoc(chunkRef));
    await assertFails(getDoc(doc(teacher,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}/chunks/lessons-0000`)));

    const receiptRef=doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}`);
    const receipt={schema:'danbridge-migration-restore-drill-v1',environment:'staging',state:'verified',drillId,sourceBackupId:'source-backup-1',sourceHash:sha,restoredHash:sha,sourceChunkCount:1,restoredChunkCount:1,recordCount:1,collections:{lessons:{count:1,chunks:1}},mainVersionHash:'legacy-hash-v1',mainUnchanged:true,verifiedAt:serverTimestamp(),verifiedBy:'owner-uid',verifiedByEmail:OWNER_EMAIL};
    await assertFails(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/wrong-hash`),{...receipt,drillId:'wrong-hash',restoredHash:'c'.repeat(64)}));
    await assertFails(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/main-changed`),{...receipt,drillId:'main-changed',mainUnchanged:false}));
    await assertSucceeds(setDoc(receiptRef,receipt));
    await assertFails(updateDoc(receiptRef,{recordCount:2}));
    await assertFails(deleteDoc(receiptRef));
    await assertFails(getDoc(doc(teacher,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}`)));
  });

  test('Emulator 隔離復原缺片、多片、hash、版本改變與中斷續跑全部 fail-closed', async () => {
    const owner=auth('owner-uid',OWNER_EMAIL),keys=['students','teachers','lessons','makeups','changes','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
    const db=Object.fromEntries(keys.map(key=>[key,['students','teachers','lessons'].includes(key)?[{id:`${key}-1`,name:'safe'}]:[]]));
    const writeRows=async(drillId,rows)=>{for(const row of rows)await assertSucceeds(setDoc(doc(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}/chunks/${row.chunkId}`),{...row,sourceBackupId:'emulator-source',createdAt:serverTimestamp(),createdBy:'owner-uid',createdByEmail:OWNER_EMAIL}))};
    const readRows=async drillId=>(await getDocs(collection(owner,`stagingMigrationRestoreDrills/${COMPANY_ID}/runs/${drillId}/chunks`))).docs.map(row=>row.data());
    const setup=id=>prepareImmutableMigrationBackup(db,{backupId:id,sourceVersionHash:'main-v1',maxChunkBytes:4096});

    let sample=setup('emulator-missing');await writeRows('emulator-missing',sample.chunks.slice(1));let rows=await readRows('emulator-missing');assert.throws(()=>verifyImmutableMigrationBackupReadback(sample.plan,rows),/分片數|遺失/);
    sample=setup('emulator-extra');const extra={...sample.chunks.at(-1),index:9999,chunkId:`${sample.chunks.at(-1).collection}-9999`};await writeRows('emulator-extra',[...sample.chunks,extra]);rows=await readRows('emulator-extra');assert.throws(()=>verifyImmutableMigrationBackupReadback(sample.plan,rows),/分片數|序號/);
    sample=setup('emulator-hash');const damaged=structuredClone(sample.chunks);damaged.find(row=>row.items.length).items[0].name='damaged';await writeRows('emulator-hash',damaged);rows=await readRows('emulator-hash');assert.throws(()=>verifyImmutableMigrationBackupReadback(sample.plan,rows),/雜湊/);
    sample=setup('emulator-version');await writeRows('emulator-version',sample.chunks);rows=await readRows('emulator-version');verifyImmutableMigrationBackupReadback(sample.plan,rows);assert.throws(()=>{if('main-v2'!==sample.plan.sourceVersionHash)throw new Error('主文件版本改變')},/版本改變/);
    sample=setup('emulator-resume');const split=Math.max(1,Math.floor(sample.chunks.length/2));await writeRows('emulator-resume',sample.chunks.slice(0,split));rows=await readRows('emulator-resume');assert.throws(()=>verifyImmutableMigrationBackupReadback(sample.plan,rows),/分片數|遺失/);await writeRows('emulator-resume',sample.chunks.slice(split));rows=await readRows('emulator-resume');assert.equal(verifyImmutableMigrationBackupReadback(sample.plan,rows).recordCount,3);
  });

  test('全 16 集合影子規則允許 Owner 逐筆 revision，拒絕錯誤 changes 與其他角色',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),base={schema:'danbridge-full-record-shadow-v1',companyId:COMPANY_ID,sourceHash:'main-hash',revision:1,deleted:false,environment:'staging',updatedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL};
    await setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{db:{lessons:[]},clientHash:'main-hash'});const candidatePath=`stagingRecordSyncCandidateControls/${COMPANY_ID}`,candidateOpen=buildOpenRecordSyncCandidateControl({candidateEpoch:'candidate-rules-1',legacyVersionHash:'main-hash',createdAt:'2026-08-15T12:00:00+08:00'});await assertSucceeds(setDoc(doc(owner,candidatePath),{...candidateOpen,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL}));
    const lessonRef=doc(owner,`stagingFullRecordShadows/${COMPANY_ID}/collections/lessons/records/lesson-1`),lesson={...base,collection:'lessons',recordId:'lesson-1',record:{id:'lesson-1'},recordIndex:null};
    await assertSucceeds(setDoc(lessonRef,lesson));await assertSucceeds(setDoc(lessonRef,{...lesson,revision:2,deleted:true}));await assertFails(deleteDoc(lessonRef));
    const changeId='seq_00000000_1234abcd',change={...base,collection:'changes',recordId:changeId,record:{type:'新增'},recordIndex:0};
    await assertSucceeds(setDoc(doc(owner,`stagingFullRecordShadows/${COMPANY_ID}/collections/changes/records/${changeId}`),change));
    await assertFails(setDoc(doc(owner,`stagingFullRecordShadows/${COMPANY_ID}/collections/changes/records/bad-change`),{...change,recordId:'bad-change'}));
    await assertFails(setDoc(doc(teacher,`stagingFullRecordShadows/${COMPANY_ID}/collections/teachers/records/teacher-1`),{...base,collection:'teachers',recordId:'teacher-1',record:{id:'teacher-1'},recordIndex:null,updatedBy:'teacher-uid',updatedByEmail:TEACHER_EMAIL}));
    const candidateSealed=sealRecordSyncCandidateControl({control:candidateOpen,currentLegacyVersionHash:'main-hash',recordDataHash:'record-v1:'+'c'.repeat(64),documentCount:2,activeCount:1,tombstoneCount:1,sealedAt:'2026-08-15T12:05:00+08:00'});await assertSucceeds(setDoc(doc(owner,candidatePath),{...candidateSealed,persistedAt:serverTimestamp(),updatedBy:'owner-uid',updatedByEmail:OWNER_EMAIL}));await assertFails(setDoc(lessonRef,{...lesson,revision:3,deleted:false}));await assertFails(deleteDoc(doc(owner,candidatePath)));
    const productionBase={...base,environment:'production'},productionRef=doc(owner,`productionFullRecordShadows/${COMPANY_ID}/collections/lessons/records/lesson-1`),productionLesson={...productionBase,collection:'lessons',recordId:'lesson-1',record:{id:'lesson-1'},recordIndex:null};
    await assertSucceeds(setDoc(productionRef,productionLesson));await assertSucceeds(setDoc(productionRef,{...productionLesson,revision:2,deleted:true}));await assertFails(deleteDoc(productionRef));
    await assertFails(setDoc(doc(owner,`productionFullRecordShadows/${COMPANY_ID}/collections/teachers/records/staging-env`),{...base,collection:'teachers',recordId:'staging-env',record:{id:'staging-env'},recordIndex:null}));
    await assertFails(setDoc(doc(teacher,`productionFullRecordShadows/${COMPANY_ID}/collections/teachers/records/teacher-1`),{...productionBase,collection:'teachers',recordId:'teacher-1',record:{id:'teacher-1'},recordIndex:null,updatedBy:'teacher-uid',updatedByEmail:TEACHER_EMAIL}));
  });

  test('隔離角色逐筆候選只讓 Daniel／Catherine 或本人讀取，跨角色、停權與所有角色寫入均拒絕',async()=>{
    const owner=auth('owner-uid',OWNER_EMAIL),backupOwner=auth('backup-owner-uid',BACKUP_OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),scheduler=auth('scheduler-2-uid',SECOND_SCHEDULER_EMAIL),manager=auth('manager-uid',MANAGER_EMAIL),inactive=auth('inactive-uid',INACTIVE_EMAIL),runId='role-run-12345678',sourceHash='a'.repeat(64);
    const payload=({environment='staging',candidateRunId=runId,candidateSourceHash=sourceHash,viewId='aa-view',email=SECOND_SCHEDULER_EMAIL,kind='scheduler',viewHash='b'.repeat(64),recordId='lesson-aa',uid='owner-uid',actorEmail=OWNER_EMAIL}={})=>({schema:'danbridge-role-view-candidate-v1',environment,companyId:COMPANY_ID,runId:candidateRunId,sourceHash:candidateSourceHash,viewId,email,kind,viewHash,collection:'lessons',recordId,record:{id:recordId},recordIndex:0,createdAt:serverTimestamp(),createdBy:uid,createdByEmail:actorEmail});
    const candidates=[
      {db:scheduler,receiptUid:'scheduler-2-uid',email:SECOND_SCHEDULER_EMAIL,kind:'scheduler',viewId:'aa-view',viewHash:'b'.repeat(64),recordId:'lesson-aa'},
      {db:teacher,receiptUid:'teacher-uid',email:TEACHER_EMAIL,kind:'teacher',viewId:'teacher-view',viewHash:'c'.repeat(64),recordId:'lesson-teacher'},
      {db:manager,receiptUid:'manager-uid',email:MANAGER_EMAIL,kind:'branch_manager',viewId:'manager-view',viewHash:'d'.repeat(64),recordId:'lesson-manager'}
    ];
    const pathFor=row=>`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/${row.viewId}/collections/lessons/records/${row.recordId}`;
    for(const candidate of candidates){const path=pathFor(candidate),ref=doc(owner,path);await assertSucceeds(setDoc(ref,payload(candidate)));await assertSucceeds(getDoc(ref));await assertSucceeds(getDoc(doc(backupOwner,path)));await assertFails(updateDoc(ref,{viewHash:'changed-hash'}));await assertFails(deleteDoc(ref))}
    for(const viewer of candidates)for(const candidate of candidates){const read=getDoc(doc(viewer.db,pathFor(candidate)));if(viewer.email===candidate.email)await assertSucceeds(read);else await assertFails(read)}
    for(const viewer of candidates){const ownCollectionPath=pathFor(viewer).split('/').slice(0,-1).join('/'),ownRows=query(collection(viewer.db,ownCollectionPath),where('email','==',viewer.email),where('kind','==',viewer.kind));assert.equal((await assertSucceeds(getDocs(ownRows))).size,1);const foreign=candidates.find(candidate=>candidate.email!==viewer.email),foreignCollectionPath=pathFor(foreign).split('/').slice(0,-1).join('/'),foreignRows=query(collection(viewer.db,foreignCollectionPath),where('email','==',foreign.email),where('kind','==',foreign.kind));await assertFails(getDocs(foreignRows))}
    for(const viewer of candidates){const recordId=`${viewer.kind}-write`,path=`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/${viewer.viewId}/collections/lessons/records/${recordId}`;await assertFails(setDoc(doc(viewer.db,path),payload({...viewer,recordId,uid:'forged',actorEmail:viewer.email})))}
    await assertFails(setDoc(doc(owner,`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/weak-source/collections/lessons/records/weak-source`),payload({viewId:'weak-source',email:TEACHER_EMAIL,kind:'teacher',recordId:'weak-source',candidateSourceHash:'legacy:123'})));
    await assertFails(setDoc(doc(owner,`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/weak-view/collections/lessons/records/weak-view`),payload({viewId:'weak-view',email:TEACHER_EMAIL,kind:'teacher',recordId:'weak-view',viewHash:'legacy:123'})));
    await assertSucceeds(updateDoc(doc(owner,`companyAccess/${TEACHER_EMAIL}`),{active:false}));await assertFails(getDoc(doc(teacher,pathFor(candidates[1]))));await assertSucceeds(updateDoc(doc(owner,`companyAccess/${TEACHER_EMAIL}`),{active:true}));
    const backupRunId='role-run-backup-write',backupCandidate={email:TEACHER_EMAIL,kind:'teacher',viewId:'backup-view',viewHash:'e'.repeat(64),recordId:'lesson-backup'},backupPath=`stagingRoleViewCandidates/${COMPANY_ID}/runs/${backupRunId}/views/${backupCandidate.viewId}/collections/lessons/records/${backupCandidate.recordId}`;await assertSucceeds(setDoc(doc(backupOwner,backupPath),payload({...backupCandidate,candidateRunId:backupRunId,uid:'backup-owner-uid',actorEmail:BACKUP_OWNER_EMAIL})));
    await assertFails(setDoc(doc(owner,`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/inactive-view/collections/lessons/records/inactive-lesson`),payload({viewId:'inactive-view',email:INACTIVE_EMAIL,kind:'teacher',recordId:'inactive-lesson'})));

    const counts=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,key==='lessons'?1:0])),manifest=buildVerifiedRoleViewCandidateManifest({runId,sourceHash,views:candidates.map(({viewId,email,kind,viewHash})=>({viewId,email,kind,viewHash,documentCount:1,counts})),createdAt:'2026-08-15T15:00:00+08:00'}),manifestPath=`stagingRoleViewCandidateManifests/${COMPANY_ID}/runs/${runId}`,persistedManifest={...manifest,persistedAt:serverTimestamp(),persistedBy:'owner-uid',persistedByEmail:OWNER_EMAIL};
    await assertSucceeds(setDoc(doc(owner,manifestPath),persistedManifest));
    await assertSucceeds(getDoc(doc(owner,manifestPath)));await assertSucceeds(getDoc(doc(backupOwner,manifestPath)));
    for(const viewer of candidates)await assertFails(getDoc(doc(viewer.db,manifestPath)));
    await assertFails(updateDoc(doc(owner,manifestPath),{documentCount:99}));await assertFails(deleteDoc(doc(owner,manifestPath)));
    await assertFails(setDoc(doc(owner,`stagingRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/late-view/collections/lessons/records/late-lesson`),payload({viewId:'late-view',email:TEACHER_EMAIL,kind:'teacher',viewHash:'f'.repeat(64),recordId:'late-lesson'})));

    const testedAt='2026-08-15T15:05:00+08:00',ownerReceipt=email=>buildRoleViewVerificationReceipt({runId,sourceHash,manifestHash:manifest.manifestHash,email,kind:'owner',viewHash:manifest.manifestHash,verifiedViewCount:manifest.viewCount,documentCount:manifest.documentCount,realtimeObserved:true,directCoreDenied:false,crossRoleDenied:false,testedAt}),roleReceipt=row=>buildRoleViewVerificationReceipt({runId,sourceHash,manifestHash:manifest.manifestHash,email:row.email,kind:row.kind,viewId:row.viewId,viewHash:row.viewHash,verifiedViewCount:1,documentCount:1,realtimeObserved:true,directCoreDenied:true,crossRoleDenied:true,testedAt}),receipts=[
      {db:owner,uid:'owner-uid',email:OWNER_EMAIL,receipt:ownerReceipt(OWNER_EMAIL)},
      {db:backupOwner,uid:'backup-owner-uid',email:BACKUP_OWNER_EMAIL,receipt:ownerReceipt(BACKUP_OWNER_EMAIL)},
      ...candidates.map(row=>({...row,uid:row.receiptUid,receipt:roleReceipt(row)}))
    ],receiptPath=email=>`stagingRoleViewVerificationReceipts/${COMPANY_ID}/runs/${runId}/actors/${email}`;
    for(const row of receipts){const path=receiptPath(row.email),ref=doc(row.db,path),saved={...row.receipt,persistedAt:serverTimestamp(),verifiedBy:row.uid,verifiedByEmail:row.email};await assertSucceeds(runTransaction(row.db,async transaction=>{const existing=await transaction.get(ref);assert.equal(existing.exists(),false);transaction.set(ref,saved,{merge:false})}));await assertSucceeds(getDoc(doc(owner,path)));await assertSucceeds(getDoc(ref));await assertFails(updateDoc(ref,{documentCount:99}));await assertFails(deleteDoc(ref));await assertFails(setDoc(ref,saved))}
    await assertFails(getDoc(doc(scheduler,receiptPath(TEACHER_EMAIL))));await assertFails(getDoc(doc(teacher,receiptPath(SECOND_SCHEDULER_EMAIL))));await assertFails(getDoc(doc(manager,receiptPath(TEACHER_EMAIL))));
    const forgedOwner=ownerReceipt(SECOND_SCHEDULER_EMAIL);await assertFails(setDoc(doc(scheduler,receiptPath('scheduler-forged-owner@example.com')),{...forgedOwner,email:'scheduler-forged-owner@example.com',persistedAt:serverTimestamp(),verifiedBy:'scheduler-2-uid',verifiedByEmail:SECOND_SCHEDULER_EMAIL}));
    const inactiveReceipt=buildRoleViewVerificationReceipt({runId,sourceHash,manifestHash:manifest.manifestHash,email:INACTIVE_EMAIL,kind:'teacher',viewId:'inactive-view',viewHash:'f'.repeat(64),verifiedViewCount:1,documentCount:0,realtimeObserved:true,directCoreDenied:true,crossRoleDenied:true,testedAt});await assertFails(setDoc(doc(inactive,receiptPath(INACTIVE_EMAIL)),{...inactiveReceipt,persistedAt:serverTimestamp(),verifiedBy:'inactive-uid',verifiedByEmail:INACTIVE_EMAIL}));
    await assertSucceeds(updateDoc(doc(owner,`companyAccess/${TEACHER_EMAIL}`),{active:false}));await assertFails(getDoc(doc(teacher,receiptPath(TEACHER_EMAIL))));await assertSucceeds(updateDoc(doc(owner,`companyAccess/${TEACHER_EMAIL}`),{active:true}));
    const productionPath=`productionRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/aa-view/collections/lessons/records/lesson-aa`;
    await assertSucceeds(setDoc(doc(owner,productionPath),payload({environment:'production'})));await assertFails(getDoc(doc(scheduler,productionPath)));await assertFails(setDoc(doc(owner,`productionRoleViewCandidates/${COMPANY_ID}/runs/${runId}/views/aa-view/collections/lessons/records/wrong-env`),payload({recordId:'wrong-env'})));
  });
});
