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

const lockedAt = '2026-09-01T00:00:00.000Z';
const lockedData = { m: '2026-08', scope: 'all', sr: [{ s: { id: 's1' }, total: 1, charged: 1, h: 1, abs: 0, lessonAmount: 200, campAmount: 0, amount: 200 }], tr: [{ t: { id: 't1' }, count: 1, h: 1, expected: 1, amount: 100, revenue: 200, payroll: { mode: 'hourly', hourlyRate: 100 } }], lessons: [lesson()] };
const lockedRecord = context.createLockedSettlementRecord('2026-08', 'all', lockedData, lockedAt);
assert.equal(lockedRecord.locked, true, 'monthly settlement is locked');
assert.equal(lockedRecord.id, '2026-08::all', 'settlement identity combines its exact month and scope');
assert.notEqual(context.createLockedSettlementRecord('2026-08', 'branch-a', { ...lockedData, scope: 'branch-a' }, lockedAt).id, lockedRecord.id, 'the same month in another branch is not a duplicate');
assert.throws(() => context.createLockedSettlementRecord('2026-07', 'all', lockedData, lockedAt), /month mismatch/, 'a snapshot cannot be stored under the wrong month');
assert.throws(() => context.appendSettlementAdjustment(lockedRecord, { ...lockedData, m: '2026-09' }, lockedAt), /month mismatch/, 'an adjustment cannot be attached to the wrong month');
assert.throws(() => context.createLockedSettlementRecord('2026-08', 'branch-a', lockedData, lockedAt), /scope mismatch/, 'a snapshot cannot be stored under the wrong branch scope');
assert.throws(() => context.appendSettlementAdjustment(lockedRecord, { ...lockedData, scope: 'branch-a' }, lockedAt), /scope mismatch/, 'an adjustment cannot be attached to the wrong branch scope');
assert.equal(lockedRecord.totalRevenue, 200, 'locked settlement stores original revenue');
assert.equal(context.appendSettlementAdjustment(lockedRecord, lockedData, '2026-09-01T00:01:00.000Z'), false, 'unchanged data does not create an adjustment');
const changedData = { ...lockedData, sr: [{ ...lockedData.sr[0], amount: 400, lessonAmount: 400 }], lessons: [lesson({ price: 400 })] };
assert.equal(context.appendSettlementAdjustment(lockedRecord, changedData, '2026-09-01T00:02:00.000Z'), true, 'post-lock change creates an adjustment');
assert.equal(lockedRecord.totalRevenue, 200, 'adjustment never overwrites original revenue');
assert.equal(lockedRecord.adjustments[0].delta.totalRevenue, 200, 'adjustment stores revenue delta');
assert.deepEqual([...lockedRecord.adjustments[0].affectedLessonIds], ['l1'], 'adjustment identifies the changed lesson');
assert.equal(context.appendSettlementAdjustment(lockedRecord, changedData, '2026-09-01T00:03:00.000Z'), false, 'repeated save does not duplicate an adjustment');
assert.equal(context.appendSettlementAdjustment(lockedRecord, lockedData, '2026-09-01T00:04:00.000Z'), true, 'reverting data creates a compensating adjustment');
assert.equal(lockedRecord.adjustments[1].delta.totalRevenue, -200, 'compensating adjustment stores negative delta');

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

const branchBusinessSource = fs.readFileSync(path.join(root, 'js/core/branch-business-scope.js'), 'utf8');
assert.match(branchBusinessSource, /window\.settleData=function\(\)\{return settlementDataFor\(\$\('settleMonth'\)\.value\|\|monthNow\(\)/, 'settlement rendering always uses the selected settlement month');
assert.match(branchBusinessSource, /data=settlementDataFor\(month,scope\)/, 'settlement locking calculates the exact month stored in the record');
assert.doesNotMatch(branchBusinessSource, /window\.settleData=function\(\)\{return settlementDataFor\(window\.__danbridgeFinanceWorkspaceMonth/, 'finance workspace month cannot override settlement month');

const cloudSource = fs.readFileSync(path.join(root, 'js/core/firebase-auth-and-cloud-sync.module.js'), 'utf8');
const syncDecisionStart = cloudSource.indexOf('function dataHash');
const syncDecisionEnd = cloudSource.indexOf('function safeErrorCode');
vm.runInContext(cloudSource.slice(syncDecisionStart, syncDecisionEnd), context);
assert.equal(context.ownerSnapshotDecision('local-new','cloud-old','local-new','cloud-old'),'ignore-dirty','an older cloud snapshot cannot overwrite an unconfirmed local mutation');
assert.equal(context.ownerSnapshotDecision('local-new','local-new','local-new','cloud-old'),'apply','the cloud confirmation matching the dirty local hash is applied');
assert.equal(context.ownerSnapshotDecision('','same','same','same'),'unchanged','an already applied cloud snapshot does not trigger another render');
assert.deepEqual({...context.ownerUploadConfirmation(4,4,'uploaded','uploaded')},{clearDirty:true,queueNext:false},'a confirmed upload clears the local dirty state');
assert.deepEqual({...context.ownerUploadConfirmation(4,5,'uploaded','newer-local')},{clearDirty:false,queueNext:true},'a newer local mutation remains dirty and queues another upload');
assert.equal(context.ownerRetryDelay(0),1000,'owner sync retry starts after one second');
assert.equal(context.ownerRetryDelay(3),8000,'owner sync retry uses exponential backoff');
assert.equal(context.ownerRetryDelay(9),30000,'owner sync retry delay is capped at thirty seconds');
assert.match(cloudSource, /catch\(e\)[\s\S]*ownerUploadQueued=true;ownerRetryCount\+\+;[\s\S]*scheduleOwnerRetry\(\)/, 'a failed owner upload stays queued, becomes visible, and schedules a retry');
assert.match(cloudSource, /const APP_RELEASE='20\.13\.8'/, 'operational errors identify the current deployed release');
assert.match(cloudSource, /async function recordSuccessfulLogin\(user,profile\)[\s\S]*lastLoginAt:serverTimestamp\(\)/, 'authorized login records its successful time');
assert.match(cloudSource, /await ensureProfile\(user\);try\{await recordSuccessfulLogin\(user,profile\)\}/, 'last login is written only after authorization succeeds');
assert.match(cloudSource, /最後登入時間更新失敗[\s\S]*applyRoleUI\(profile,user\)/, 'a login timestamp failure does not block an authorized account');
assert.match(cloudSource, /最後登入：\$\{escapeHTML\(last\)\}/, 'account management displays the last successful login');
assert.match(cloudSource, /filter\(d=>d\.data\(\)\?\.role==='teacher'\)/, 'teacher access list excludes branch managers');
const rulesSource = fs.readFileSync(path.join(root, 'firebase/firestore.rules'), 'utf8');
assert.match(rulesSource, /match \/companies\/\{companyId\}\/teacherViews\/\{email\}[\s\S]*email == emailKey\(\) && isTeacher\(companyId\)/, 'teacher views require the teacher role, not only active membership');
assert.match(cloudSource, /profile\.role==='branch_manager'[\s\S]*#v18Fab,#v18FabMenu[\s\S]*e\.inert=true;e\.setAttribute\('aria-hidden','true'\)/, 'branch manager owner-only controls are hidden and removed from accessibility navigation');
assert.match(cloudSource, /#drafts,#camps,#winterCamps,#data,#security'[\s\S]*e\.inert=true;e\.setAttribute\('aria-hidden','true'\)/, 'branch manager forbidden sections are inert and hidden');
assert.match(cloudSource, /function installRoleInteractionGuards\(\)[\s\S]*cloudRole==='branch_manager'[\s\S]*stopImmediatePropagation/, 'branch manager calendar context and empty-cell selection events are blocked in capture phase');
const roleCss = fs.readFileSync(path.join(root, 'css/core/73-v20014-role-responsive-ux.css'), 'utf8');
assert.match(roleCss, /body\[data-role-ux="branch_manager"\] #v18Fab[\s\S]*body\[data-role-ux="branch_manager"\] #finance button[\s\S]*display:none!important/, 'dynamic owner controls stay hidden after branch view rerenders');
const schedulerSource = fs.readFileSync(path.join(root, 'js/modules/calendar/scheduler-ui.js'), 'utf8');
assert.match(schedulerSource, /function handleCalendarShortcuts\(e\)\{\s*if\(!calendarOwnerCanEdit\(\)\)return/, 'branch manager calendar shortcuts stop before any action');
assert.match(cloudSource, /function setSignedOutIsolation\(locked\)[\s\S]*el\.inert=true;el\.setAttribute\('aria-hidden','true'\)/, 'signed-out content is removed from keyboard and accessibility navigation');
assert.match(cloudSource, /sensitiveIds=\['notificationList'[\s\S]*'courseDrawerBody'\]/, 'signed-out isolation clears notification and course-detail content');
assert.match(cloudSource, /function showCloudApp\(\)\{setSignedOutIsolation\(false\)/, 'authorized login restores the isolated application UI');
assert.match(cloudSource, /function showCloudLogin\(\)[\s\S]*setSignedOutIsolation\(true\)/, 'logout applies signed-out isolation after rebuilding the login screen');
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
const retentionNow = Date.parse('2026-08-09T00:00:00Z');
assert.equal(context.scheduleNotificationExpired({ createdAt: '2026-07-09T00:00:00Z', read: true }, retentionNow), true, 'read schedule notifications expire after 30 days');
assert.equal(context.scheduleNotificationExpired({ createdAt: '2026-07-09T00:00:00Z', read: false }, retentionNow), false, 'unread schedule notifications remain for 90 days');
assert.equal(context.scheduleNotificationExpired({ createdAt: '2026-05-01T00:00:00Z', read: false }, retentionNow), true, 'unread schedule notifications expire after 90 days');
assert.equal(context.scheduleNotificationExpired({ read: false }, retentionNow), false, 'pending server timestamps are not removed');
assert.match(cloudSource, /async function createScheduleNotificationIfMissing[\s\S]*runTransaction[\s\S]*if\(!existing\.exists\(\)\)transaction\.set/, 'notification retries use create-if-missing transactions');
assert.doesNotMatch(cloudSource, /jobs\.push\(setDoc\(notificationRef/, 'notification retries never overwrite an existing read state');
const before = { lessons: [lesson({ id: 'switch', teacherId: 't1', teacherIds: ['t1'], branchId: 'a' })] };
const after = { lessons: [lesson({ id: 'switch', teacherId: 't2', teacherIds: ['t2'], branchId: 'a' })] };
const changes = context.buildScheduleNotificationChanges(before, after);
assert.deepEqual(Array.from(changes, row => `${row.teacherId}:${row.type}`).sort(), ['t1:removed', 't2:added']);

const notificationRules = fs.readFileSync(path.join(root, 'firebase/firestore.rules'), 'utf8').match(/match \/companies\/\{companyId\}\/scheduleNotifications[\s\S]*?match \/companies\/\{companyId\}\/lessonReports/)[0];
assert.match(notificationRules, /recipientEmail == emailKey\(\)/);
assert.doesNotMatch(notificationRules, /teacherId == ownTeacherId\(\)/);
assert.match(cloudSource, /roleAccessSignature\(access\)===cloudRoleAccessSignature/);

const notificationCenterSource = fs.readFileSync(path.join(root, 'js/modules/notifications/notification-center.js'), 'utf8');
const notificationHelperStart = notificationCenterSource.indexOf('const addDays=');
const notificationHelperEnd = notificationCenterSource.indexOf('const readKey=');
vm.runInContext(notificationCenterSource.slice(notificationHelperStart, notificationHelperEnd), context);
assert.equal(vm.runInContext("withinRetention('2026-07-07', '2026-08-05', 30)", context), true, 'notification retention keeps recent items');
assert.equal(vm.runInContext("withinRetention('2026-07-01', '2026-08-05', 30)", context), false, 'notification retention removes expired items');
context.db.students = [{ id: 's1', name: 'Same Name', parent: 'Parent One', rate: 200 }, { id: 's2', name: 'Same Name', parent: 'Parent Two', rate: 300 }];
context.notificationPaymentRows = [
  lesson({ id: 'due-1', date: '2026-08-01', paymentStatus: 'unpaid' }),
  lesson({ id: 'due-2', date: '2026-08-02', paymentStatus: 'unpaid' }),
  lesson({ id: 'same-name-other-student', studentId: 's2', date: '2026-08-02', paymentStatus: 'unpaid' }),
  lesson({ id: 'unknown-student', studentId: 'missing', date: '2026-08-02', paymentStatus: 'unpaid' }),
  lesson({ id: 'paid', date: '2026-08-03', paymentStatus: 'paid' }),
  lesson({ id: 'expired', date: '2026-03-01', paymentStatus: 'unpaid' })
];
const paymentGroups = vm.runInContext("outstandingPaymentGroups(notificationPaymentRows, '2026-08-05')", context);
assert.equal(paymentGroups.length, 2, 'same-name students remain separate and unknown students are excluded');
const firstStudentPaymentGroup = paymentGroups.find(row => row.studentId === 's1');
assert.equal(firstStudentPaymentGroup.student.parent, 'Parent One', 'notification uses the exact CRM student and parent record');
assert.equal(firstStudentPaymentGroup.lessons.length, 2, 'paid and expired lessons are excluded from the notification group');
assert.equal(firstStudentPaymentGroup.amount, 400, 'grouped notification totals only the exact student outstanding amount');

const accessibilitySource = fs.readFileSync(path.join(root, 'js/ui/accessibility-baseline.js'), 'utf8');
assert.match(accessibilitySource, /label:not\(\[for\]\)/, 'accessibility baseline associates visible labels with controls');
assert.match(accessibilitySource, /control\.setAttribute\('aria-label'/, 'unnamed controls receive an accessible name');
assert.match(accessibilitySource, /aria-live','polite'/, 'dynamic status regions announce updates politely');
assert.match(accessibilitySource, /MutationObserver/, 'dynamically inserted forms receive the same accessibility treatment');

const financeBranchStart = branchBusinessSource.indexOf('const normalizedRoom=');
const financeBranchEnd = branchBusinessSource.indexOf('const allowedScope=');
vm.runInContext(branchBusinessSource.slice(financeBranchStart, financeBranchEnd), context);
context.financeBranches = [{ id: 'river', rooms: ['R101', 'R102'] }, { id: 'museum', rooms: ['M201'] }];
assert.equal(vm.runInContext("financeBranchId({room:'R101',branchId:'unassigned'},financeBranches)", context), 'river', 'finance scope derives the branch from an exact room match');
assert.equal(vm.runInContext("financeScopeMatch({room:'R101'},'all',row=>financeBranchId(row,financeBranches))", context), true, 'all branches includes assigned room records');
assert.equal(vm.runInContext("financeScopeMatch({branchId:'unassigned'},'all',row=>row.branchId)", context), false, 'all branches excludes unassigned records');
assert.match(branchBusinessSource, /expenseScope\.innerHTML=optionsHTML\(true,false\)/, 'expense scope offers all real branches without unassigned');
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /id="financeTotalExpenses"/, 'finance overview includes a total expenses metric');
const financeArchitectureSource = fs.readFileSync(path.join(root, 'js/app/v18-information-architecture.js'), 'utf8');
assert.match(financeArchitectureSource, /id="expenseTotalAmount"/, 'expense management includes its own total card');
assert.match(branchBusinessSource, /expenseTotalAmount'\)\.textContent=money\(d\.fixedTotal\+d\.oneTimeTotal\)/, 'expense management totals only fixed and one-time expenses');
assert.doesNotMatch(branchBusinessSource, /expenseTotalAmount'\)\.textContent=money\(d\.totalExpenses\)/, 'expense management total excludes teacher payroll');
assert.match(branchBusinessSource, /expenseTotalScope'\)\.textContent=scopeLabel\(scope\)/, 'expense total identifies the selected branch scope');

const courseOperationsSource = fs.readFileSync(path.join(root, 'js/modules/calendar/course-operations.js'), 'utf8');
const moveOperationsStart = courseOperationsSource.indexOf('let calendarMoveSaveTimer');
assert.ok(moveOperationsStart >= 0, 'calendar move operations are available');
context.addMinutes = (time, delta) => { const [h, m] = time.split(':').map(Number); const value = h * 60 + m + delta; return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; };
context.shiftDate = (date, delta) => { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + delta); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
context.shiftTime = context.addMinutes;
context.conflictDetail = () => null;
context.teacherConflictDetail = () => null;
context.snapshot = () => { context.moveSnapshots = (context.moveSnapshots || 0) + 1; };
context.clearCalendarSelectionState = () => {};
context.cancelPasteClickMode = () => {};
context.logChange = () => {};
context.saveDB = options => { context.moveSaves = (context.moveSaves || 0) + 1; context.lastMoveSaveOptions = options; };
context.renderCalendar = () => { context.moveRenders = (context.moveRenders || 0) + 1; };
context.setTimeout = callback => { callback(); return 1; };
context.clearTimeout = () => {};
context.toast = () => {};
context.confirm = () => true;
context.alert = message => { throw new Error(message); };
vm.runInContext(courseOperationsSource.slice(moveOperationsStart), context);
context.db.lessons = [
  lesson({ id: 'drag-one', date: '2026-08-10', start: '10:00', end: '11:00', teacherId: 't1', teacherIds: ['t1', 't2'] }),
  lesson({ id: 'drag-two', date: '2026-08-11', start: '12:00', end: '13:00', teacherId: 't2', teacherIds: ['t2'] })
];
context.moveSnapshots = 0; context.moveSaves = 0;
context.moveLessonTo('drag-one', '2026-08-12', '14:00');
assert.equal(context.db.lessons[0].date, '2026-08-12', 'single drag moves only the anchor lesson');
assert.equal(context.db.lessons[0].start, '14:00', 'single drag uses the dropped week time');
assert.deepEqual(Array.from(context.db.lessons[0].teacherIds), ['t1', 't2'], 'single drag preserves all assigned teachers');
assert.equal(context.db.lessons[1].date, '2026-08-11', 'single drag leaves other lessons unchanged');
assert.equal(context.moveSnapshots, 1, 'single drag creates one undo snapshot');
assert.equal(context.moveSaves, 1, 'single drag saves once');
assert.equal(context.moveRenders, 1, 'single drag paints the new calendar position immediately');
context.moveSnapshots = 0; context.moveSaves = 0;
context.moveLessonsTo(['drag-one', 'drag-two'], 'drag-one', '2026-08-14', '15:00');
const movedAnchor = context.db.lessons.find(row => row.id === 'drag-one');
const movedCompanion = context.db.lessons.find(row => row.id === 'drag-two');
assert.equal(movedAnchor.date, '2026-08-14', 'multi drag moves the anchor to the drop date');
assert.equal(movedCompanion.date, '2026-08-13', 'multi drag preserves relative day spacing');
assert.equal(movedAnchor.start, '15:00', 'multi drag moves the anchor to the drop time');
assert.equal(movedCompanion.start, '13:00', 'multi drag preserves relative time spacing');
assert.equal(context.moveSnapshots, 1, 'multi drag creates one undo snapshot');
assert.equal(context.moveSaves, 1, 'multi drag saves the whole set once');
assert.equal(context.lastMoveSaveOptions.skipRender, true, 'drag persistence does not replace the freshly painted calendar');

const interactionSource = fs.readFileSync(path.join(root, 'js/modules/calendar/marquee-multi-selection.js'), 'utf8');
assert.match(interactionSource, /selectedRenderedIds\(\)/, 'multi drag intersects selection with rendered cards');
assert.doesNotMatch(interactionSource, /moveLessonsTo\([^\n]+\);else moveLessonTo\([^\n]+\);\s*finishSelection\(\)/, 'successful drops do not clear the same selection twice');

console.log(`PASS: ${matrix.length} accounting states, settlement rates, role scopes, notifications, live access guards, and single/multi calendar dragging.`);
