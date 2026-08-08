import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';

const PROJECT_ID = 'danbridge-rules-test';
const COMPANY_ID = 'danbridge';
const OWNER_EMAIL = 'a0965487920@gmail.com';
const TEACHER_EMAIL = 'teacher@example.com';
const OTHER_TEACHER_EMAIL = 'other@example.com';
const MANAGER_EMAIL = 'manager@example.com';
const INACTIVE_EMAIL = 'inactive@example.com';

let testEnv;

const auth = (uid, email) => testEnv.authenticatedContext(uid, { email }).firestore();
const unauthenticated = () => testEnv.unauthenticatedContext().firestore();

async function seed() {
  const now = Date.now();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const rows = [
      [`companyAccess/${TEACHER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1' }],
      [`companyAccess/${OTHER_TEACHER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-2' }],
      [`companyAccess/${MANAGER_EMAIL}`, { active: true, companyId: COMPANY_ID, role: 'branch_manager', teacherId: 'manager-teacher', branchIds: ['branch-a'] }],
      [`companyAccess/${INACTIVE_EMAIL}`, { active: false, companyId: COMPANY_ID, role: 'teacher', teacherId: 'inactive-teacher' }],
      ['users/teacher-uid', { email: TEACHER_EMAIL, active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'teacher-1' }],
      ['users/manager-uid', { email: MANAGER_EMAIL, active: true, companyId: COMPANY_ID, role: 'branch_manager', teacherId: 'manager-teacher', branchIds: ['branch-a'] }],
      [`companies/${COMPANY_ID}/data/main`, { privateValue: 'owner-only' }],
      [`companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`, { lessons: ['lesson-own'] }],
      [`companies/${COMPANY_ID}/teacherViews/${OTHER_TEACHER_EMAIL}`, { lessons: ['lesson-other'] }],
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

describe('Owner 權限', () => {
  test('Owner 可以讀寫公司命名空間與管理授權', async () => {
    const db = auth('owner-uid', OWNER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/data/main`)));
    await assertSucceeds(setDoc(doc(db, `companies/${COMPANY_ID}/data/owner-write`), { ok: true }));
    await assertSucceeds(setDoc(doc(db, 'companyAccess/new@example.com'), { active: true, companyId: COMPANY_ID, role: 'teacher', teacherId: 'new-teacher' }));
  });
});

describe('老師權限', () => {
  test('老師只能讀取自己的檢視、課程 metadata 與回報', async () => {
    const db = auth('teacher-uid', TEACHER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${TEACHER_EMAIL}`)));
    await assertFails(getDoc(doc(db, `companies/${COMPANY_ID}/teacherViews/${OTHER_TEACHER_EMAIL}`)));
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
});
