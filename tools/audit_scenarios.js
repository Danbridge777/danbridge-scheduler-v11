#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {
  console,
  db: { students: [], teachers: [], lessons: [], makeups: [], summerCampRegistrations: [], winterCampRegistrations: [] },
  window: {},
  document: { getElementById: () => null },
  localStorage: { getItem: () => null, setItem: () => {} },
  student(id) { return context.db.students.find(item => item.id === id) || {}; },
  teacher(id) { return context.db.teachers.find(item => item.id === id) || {}; },
  hours(start, end) {
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    return (minutes(end) - minutes(start)) / 60;
  },
  lessonTeacherIds(lesson) { return (lesson.teacherIds || [lesson.teacherId]).filter(Boolean); },
  effectiveCampId: () => '',
  sameCampSlot: () => false,
  summerRegistrationTotal: row => Number(row.totalFee) || 0,
  localDate: date => date.toISOString().slice(0, 10),
  uid: (() => { let value = 0; return () => `audit-${++value}`; })(),
  emptyDB: () => ({ students: [], teachers: [], lessons: [], makeups: [], changes: [], teacherGroups: [], winterTeacherGroups: [], summerCampClasses: [], summerCampRegistrations: [], winterCampRegistrations: [], winterCampClasses: [], settlementRecords: [], fixedExpenses: [], oneTimeExpenses: [], collectionRecords: [], branches: [] }),
  $: () => null,
  esc: value => String(value),
  saveDB: () => {}, toast: () => {}, alert: () => {},
  openLessonModal: () => {}, todayStr: () => '2026-08-05'
};
context.window = context;
context.DanbridgeAccess = { branchIdFromLocation: () => 'unassigned', DEFAULT_BRANCHES: [] };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/business/business-logic.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/modules/makeups/makeup-management.js'), 'utf8'), context);

context.db.students = [{ id: 's1', name: 'Student', rate: 200, parent: 'Private', contact: '0900' }];
context.db.teachers = [{ id: 't1', name: 'One', rate: 100 }, { id: 't2', name: 'Two', rate: 150 }];
const lesson = (overrides = {}) => ({ id: 'l1', studentId: 's1', teacherId: 't1', teacherIds: ['t1'], date: '2026-08-05', start: '10:00', end: '11:00', status: '已上課', ...overrides });
const matrix = [
  ['completed', lesson({ teacherReportStatus: 'completed' }), 200, 100],
  ['student leave', lesson({ status: '學生請假', teacherReportStatus: 'student_leave' }), 200, 0],
  ['teacher leave', lesson({ status: '老師請假', teacherReportStatus: 'teacher_leave' }), 0, 0],
  ['no show', lesson({ status: '缺席', teacherReportStatus: 'no_show' }), 200, 100],
  ['cancelled', lesson({ status: '取消' }), 0, 0],
  ['suspended', lesson({ status: '停課' }), 0, 0],
  ['makeup completed', lesson({ id: 'm1', status: '補課完成', teacherReportStatus: 'makeup_completed', isMakeup: true }), 0, 100],
  ['draft', lesson({ isDraft: true }), 0, 0]
];
for (const [name, row, charge, pay] of matrix) {
  assert.equal(context.lessonCharge(row), charge, `${name}: student charge`);
  assert.equal(context.lessonPay(row), pay, `${name}: teacher pay`);
}
const coTeaching = lesson({ teacherIds: ['t1', 't2'] });
assert.equal(context.lessonCharge(coTeaching), 200, 'co-teaching charges the student once');
assert.equal(context.lessonPay(coTeaching), 250, 'co-teaching pays both teachers');

context.db.lessons = matrix.map(([, row], index) => ({ ...row, id: `matrix-${index}` }));
context.db.teachers = [];
const settlement = context.monthlySettlementSnapshot('2026-08');
assert.ok(settlement.leaveRate >= 0 && settlement.leaveRate <= 100, 'leave rate stays within 0..100');
const branchSettlement = context.settlementSummaryTotals([{ total: 2, charged: 1, abs: 2 }]);
assert.equal(branchSettlement.totalLessons, 2, 'branch settlement counts all formal lessons');
assert.equal(branchSettlement.leaveRate, 100, 'branch settlement leave rate cannot exceed 100%');

context.db.makeups = [];
const source = lesson({ id: 'leave-source', status: '學生請假', teacherReportStatus: 'student_leave', branchId: 'a' });
const makeup = context.addMakeupForLesson(source);
assert.equal(makeup.status, 'pending');
assert.equal(context.syncMakeupForLessonStatus({ ...source, status: '未上課' }, '學生請假'), true);
assert.equal(makeup.status, 'cancelled');
context.syncMakeupForLessonStatus(source, '未上課');
assert.equal(makeup.status, 'pending', 'a second leave reopens the makeup');
makeup.status = 'scheduled'; makeup.scheduledLessonId = 'scheduled';
context.db.lessons = [source, lesson({ id: 'scheduled', makeupId: makeup.id, isMakeup: true, teacherReportStatus: 'makeup_completed' })];
assert.equal(context.completeMakeupForLesson(context.db.lessons[1]), true);
assert.equal(makeup.status, 'done');
context.syncMakeupForDeletedLesson(context.db.lessons[1]);
assert.equal(makeup.status, 'pending', 'deleting a makeup lesson restores the pending item');

const cloudSource = fs.readFileSync(path.join(root, 'js/core/firebase-auth-and-cloud-sync.module.js'), 'utf8');
const signatureStart = cloudSource.indexOf('function roleAccessSignature');
const signatureEnd = cloudSource.indexOf('function applyRoleUI');
vm.runInContext(cloudSource.slice(signatureStart, signatureEnd), context);
const originalAccess = { role: 'branch_manager', teacherId: 't1', branchIds: ['b', 'a'], readOnly: true, canSubmitOwnReports: true };
const originalSignature = context.roleAccessSignature(originalAccess);
assert.equal(originalSignature, context.roleAccessSignature({ ...originalAccess, branchIds: ['a', 'b'] }), 'branch ordering does not revoke access');
assert.notEqual(originalSignature, context.roleAccessSignature({ ...originalAccess, branchIds: ['a'] }), 'branch changes revoke access');
assert.notEqual(originalSignature, context.roleAccessSignature({ ...originalAccess, teacherId: 't2' }), 'teacher changes revoke access');
assert.notEqual(originalSignature, context.roleAccessSignature({ ...originalAccess, canSubmitOwnReports: false }), 'report policy changes revoke access');
const filterStart = cloudSource.indexOf('function filteredTeacherDB');
const filterEnd = cloudSource.indexOf('async function renderCloudUserManager');
assert.ok(filterStart >= 0 && filterEnd > filterStart);
vm.runInContext(cloudSource.slice(filterStart, filterEnd), context);
const scopedSource = {
  students: [{ id: 's1', name: 'Student', parent: 'Private', contact: '0900' }, { id: 's2', name: 'Other', parent: 'Hidden', contact: '0911' }],
  teachers: [{ id: 't1', name: 'One', rate: 999 }, { id: 't2', name: 'Two', rate: 999 }],
  lessons: [lesson({ id: 'own-a', branchId: 'a', paymentStatus: 'paid', chargeStudent: 'yes', payTeacher: 'yes' }), lesson({ id: 'other-b', studentId: 's2', teacherId: 't2', teacherIds: ['t2'], branchId: 'b' })],
  fixedExpenses: [{ id: 'expense', branchId: 'a' }], collectionRecords: [{ id: 'payment', branchId: 'a' }], branches: [{ id: 'a' }, { id: 'b' }]
};
const teacherView = context.filteredTeacherDB(scopedSource, 't1');
assert.deepEqual(Array.from(teacherView.lessons, row => row.id), ['own-a']);
assert.equal(teacherView.students[0].parent, undefined);
assert.equal(teacherView.lessons[0].paymentStatus, undefined);
assert.equal(teacherView.teachers[0].rate, undefined);
assert.deepEqual(Array.from(teacherView.fixedExpenses), []);
const branchView = context.filteredBranchDB(scopedSource, ['a']);
assert.deepEqual(Array.from(branchView.lessons, row => row.id), ['own-a']);
assert.deepEqual(Array.from(branchView.fixedExpenses, row => row.id), ['expense']);

const notificationStart = cloudSource.indexOf('const SCHEDULE_NOTIFICATION_FIELDS');
const notificationEnd = cloudSource.indexOf('async function publishScheduleChangeNotifications');
vm.runInContext(cloudSource.slice(notificationStart, notificationEnd), context);
const before = { lessons: [lesson({ id: 'switch', teacherId: 't1', teacherIds: ['t1'], branchId: 'a' })] };
const after = { lessons: [lesson({ id: 'switch', teacherId: 't2', teacherIds: ['t2'], branchId: 'a' })] };
const changes = context.buildScheduleNotificationChanges(before, after);
assert.deepEqual(Array.from(changes, row => `${row.teacherId}:${row.type}`).sort(), ['t1:removed', 't2:added']);

const notificationRules = fs.readFileSync(path.join(root, 'firebase/firestore.rules'), 'utf8').match(/match \/companies\/\{companyId\}\/scheduleNotifications[\s\S]*?match \/companies\/\{companyId\}\/lessonReports/)[0];
assert.match(notificationRules, /recipientEmail == emailKey\(\)/);
assert.doesNotMatch(notificationRules, /teacherId == ownTeacherId\(\)/);
assert.match(cloudSource, /roleAccessSignature\(access\)===cloudRoleAccessSignature/);

console.log(`PASS: ${matrix.length} accounting states, settlement rates, leave/makeup lifecycle, role scopes, teacher replacement notifications, and live access guards.`);
