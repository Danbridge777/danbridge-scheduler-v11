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
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
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
