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
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {buildRecordShadowRunManifest,verifyRecordShadowRun} from '../js/core/cloud-record-shadow-run.js';

const PROJECT_ID = 'danbridge-rules-test';
const COMPANY_ID = 'danbridge';
const OWNER_EMAIL = 'a0965487920@gmail.com';
const BACKUP_OWNER_EMAIL = 'backup-owner@gmail.com';
const TEACHER_EMAIL = 'teacher@example.com';
const WENDY_EMAIL = 'wendylee0820520@gmail.com';
const SECOND_SCHEDULER_EMAIL = 'aa0966626336@gmail.com';
const OTHER_TEACHER_EMAIL = 'other@example.com';
const MANAGER_EMAIL = 'manager@example.com';
const INACTIVE_EMAIL = 'inactive@example.com';
const INVITED_EMAIL = 'invited@example.com';

let testEnv;

const auth = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
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
      [`companies/${COMPANY_ID}/scheduleNotifications/other-notice`, { recipientEmail: OTHER_TEACHER_EMAIL, read: false, message: 'other notice' }]
    ];
    for (const [path, data] of rows) await setDoc(doc(db, path), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
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
after(async () => {
  await testEnv?.cleanup();
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
  });
});
