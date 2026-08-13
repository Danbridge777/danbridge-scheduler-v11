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
  document: { getElementById: () => null, body: { classList: { contains: () => false } } },
  localStorage: { getItem: () => null, setItem: () => {} },
  student(id) { return context.db.students.find(item => item.id === id) || {}; },
  teacher(id) { return context.db.teachers.find(item => item.id === id) || {}; },
  hours(start, end) {
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    return (minutes(end) - minutes(start)) / 60;
  },
  lessonTeacherIds(lesson) { return [...new Set((lesson.teacherIds || [lesson.teacherId]).filter(Boolean))]; },
  effectiveCampId: () => '',
  sameCampSlot: () => false,
  summerRegistrationTotal: row => Number(row.totalFee) || 0,
  money: value => `$${Number(value || 0).toLocaleString('en-US')}`,
  localDate: date => date.toISOString().slice(0, 10),
  uid: (() => { let value = 0; return () => `audit-${++value}`; })(),
  emptyDB: () => ({ students: [], teachers: [], lessons: [], makeups: [], changes: [], teacherGroups: [], winterTeacherGroups: [], summerCampClasses: [], summerCampRegistrations: [], winterCampRegistrations: [], winterCampClasses: [], settlementRecords: [], fixedExpenses: [], oneTimeExpenses: [], collectionRecords: [], branches: [] }),
  deepCopy: value => JSON.parse(JSON.stringify(value)),
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
context.db.teachers = [{ id: 't1', name: 'Wendy', rate: 100 }, { id: 't2', name: 'Kim', rate: 150 }];
assert.equal(context.teacherIncludedForMonth({ archivedAt: '' }, '2027-01'), true, 'an active teacher remains eligible for future payroll');
assert.equal(context.teacherIncludedForMonth({ archivedAt: '2026-08-11T08:00:00.000Z' }, '2026-08'), true, 'an archived teacher remains in the final archival month settlement');
assert.equal(context.teacherIncludedForMonth({ archivedAt: '2026-08-11T08:00:00.000Z' }, '2026-09'), false, 'an archived teacher is excluded from later payroll months');
assert.equal(context.teacherIncludedForMonth({ archivedAt: '2026-08-11T08:00:00.000Z' }, '2026-07'), true, 'historical payroll remains available before archival');
const lesson = (overrides = {}) => ({ id: 'l1', studentId: 's1', teacherId: 't1', teacherIds: ['t1'], date: '2026-08-05', start: '10:00', end: '11:00', status: '已上課', ...overrides });
context.db.students.push({id:'group-line',name:'團班學生',courseType:'團班',rate:300,parent:'Group Parent'});
context.db.lessons=[lesson({id:'private-line'}),lesson({id:'group-line-lesson',studentId:'group-line',start:'14:00',end:'15:30'})];
const privateLineData=context.studentMonthlyBillingData('s1','2026-08');
const groupLineData=context.studentMonthlyBillingData('group-line','2026-08');
assert.equal(privateLineData.privateAmount,200,'private tutoring remains in the general tutoring LINE subtotal');
assert.equal(privateLineData.groupAmount,0,'private tutoring is never duplicated into the group LINE subtotal');
assert.equal(groupLineData.privateAmount,0,'group lessons are excluded from the general tutoring LINE subtotal');
assert.equal(groupLineData.groupAmount,450,'group lessons retain the original hourly charge in their own LINE subtotal');
assert.match(context.studentBillingSections(groupLineData).join('\n'),/團班費用[\s\S]*共 1 堂／1\.5 小時[\s\S]*團班小計：\$450/,'group LINE text shows a distinct fee heading, lesson count, hours, and subtotal');
assert.doesNotMatch(context.studentBillingSections(groupLineData).join('\n'),/一般家教/,'a group-only statement does not show an empty general tutoring section');
context.db.lessons=[];
const schedulerCopySource = fs.readFileSync(path.join(root, 'js/modules/calendar/scheduler-ui.js'), 'utf8');
const freshCopyStart = schedulerCopySource.indexOf('function createFreshLessonCopy');
const selectedCopyStart = schedulerCopySource.indexOf('function copySelectedLessons');
assert.ok(freshCopyStart >= 0 && selectedCopyStart > freshCopyStart, 'fresh lesson copy helper is available before every calendar copy action');
context.createLessonId = () => 'lsn-fresh-copy';
vm.runInContext(schedulerCopySource.slice(freshCopyStart, selectedCopyStart), context);
const reportedSource = lesson({
  id: 'reported-source', seriesId: 'old-series', status: '已上課', paymentStatus: 'paid',
  teacherReportStatus: 'completed', teacherReportContent: '舊課程內容', teacherReportHomework: '舊作業',
  teacherReportFeedback: '舊回饋', teacherReportNote: '舊內部備註', teacherReportUpdatedAt: '2026-08-05T12:00:00Z',
  teacherReportBy: 'Old Teacher', teacherReportEmail: 'old@example.com', makeupId: 'makeup-old',
  sourceLessonId: 'source-old', scheduledLessonId: 'scheduled-old', isMakeup: true, note: '原備註｜MAKEUP:makeup-old'
});
const freshCopy = context.createFreshLessonCopy(reportedSource, { date: '2026-08-19' });
assert.equal(freshCopy.id, 'lsn-fresh-copy', 'copied lesson receives a completely new lesson ID');
assert.equal(freshCopy.studentId, reportedSource.studentId, 'copied lesson preserves the selected student');
assert.equal(freshCopy.start, reportedSource.start, 'copied lesson preserves its start time');
assert.equal(freshCopy.end, reportedSource.end, 'copied lesson preserves its end time');
assert.equal(freshCopy.status, '未上課', 'copied lesson starts as a new unreported class');
assert.equal(freshCopy.paymentStatus, 'unpaid', 'copied lesson starts with fresh payment state');
assert.equal(freshCopy.seriesId, '', 'copied lesson is not linked to the old repeating series');
assert.equal(freshCopy.note, '原備註', 'copied lesson removes a legacy makeup token hidden in its note');
assert.equal(freshCopy.copySourceLessonId, reportedSource.id, 'copied lesson records only its source identity, not its source report');
assert.ok(Number.isFinite(Date.parse(freshCopy.copyCreatedAt)), 'copied lesson records when its fresh report lifecycle begins');
for(const key of Object.keys(reportedSource).filter(key=>key.startsWith('teacherReport'))){
  assert.equal(Object.hasOwn(freshCopy,key),false,`copied lesson removes ${key}`);
}
for(const key of ['makeupId','sourceLessonId','scheduledLessonId','isMakeup']){
  assert.equal(Object.hasOwn(freshCopy,key),false,`copied lesson removes old relationship ${key}`);
}
assert.match(schedulerCopySource, /createFreshLessonCopy\(old,\{date:mapDateByCalendarWeek/, 'selected month copy uses the fresh lesson contract');
assert.match(schedulerCopySource, /createFreshLessonCopy\(old,\{date:targetDateStr,start:ns,end:ne/, 'clipboard paste uses the fresh lesson contract');
assert.match(schedulerCopySource, /lessonClipboard=rows\.map\(l=>createFreshLessonCopy\(l,\{id:l\.id\}\)\)/, 'the clipboard itself never stores lesson report fields');
assert.match(schedulerCopySource, /function ensureTeacherCalendarMonth\(\)[\s\S]*role!==\x27teacher\x27[\s\S]*calendarMode\x27\)\.value=\x27month\x27[\s\S]*calendarDate\x27\)\.value=todayStr\(\)/, 'teacher login starts on the current month');
assert.match(schedulerCopySource, /function calendarTeacherTargetChanged\(\)[\s\S]*if\(targetId\)\{\$\(\x27calendarMode\x27\)\.value=\x27month\x27;\$\(\x27calendarDate\x27\)\.value=todayStr\(\)\}/, 'choosing a teacher switches the schedule to the current month');
const applicationSource = fs.readFileSync(path.join(root, 'js/modules/application-and-business-features.js'), 'utf8');
assert.match(applicationSource, /createFreshLessonCopy\(lesson,\{date:shiftDate\(lesson\.date,7\)/, 'weekly copy uses the fresh lesson contract');
assert.match(applicationSource, /createFreshLessonCopy\(lesson,\{date:newDate/, 'monthly copy uses the fresh lesson contract');
const cloudSyncSource = fs.readFileSync(path.join(root, 'js/core/firebase-auth-and-cloud-sync.module.js'), 'utf8');
const copiedReportGuardStart = cloudSyncSource.indexOf('function lessonReportLocalToday');
const copiedReportGuardEnd = cloudSyncSource.indexOf('function applyCachedLessonReportsToCurrentDB', copiedReportGuardStart);
assert.ok(copiedReportGuardStart >= 0 && copiedReportGuardEnd > copiedReportGuardStart, 'copied lesson report guard is installed before cloud reports are merged');
vm.runInContext(cloudSyncSource.slice(copiedReportGuardStart, copiedReportGuardEnd), context);
const copiedAt = new Date(Date.now() - 60_000).toISOString();
const futureDate = `${new Date().getFullYear() + 1}-01-01`;
assert.equal(context.reportIsNewForCopiedLesson({ date: futureDate, copyCreatedAt: copiedAt }, { updatedAtClient: new Date(Date.now() - 120_000).toISOString() }), false, 'a report older than a future copy can never attach to that copied lesson');
assert.equal(context.reportIsNewForCopiedLesson({ date: futureDate, copyCreatedAt: copiedAt }, { updatedAtClient: new Date().toISOString() }), false, 'even a newly timestamped report cannot attach before a future lesson date');
const todayDate = context.lessonReportLocalToday();
assert.equal(context.reportIsNewForCopiedLesson({ date: todayDate, copyCreatedAt: copiedAt }, { updatedAtClient: new Date().toISOString() }), true, 'a genuinely new report submitted today after a today-copy remains valid');
const staleFutureLesson={date:futureDate,status:'已上課',teacherReportStatus:'completed',teacherReportContent:'舊內容',teacherReportUpdatedAt:new Date(Date.now()-86_400_000).toISOString()};
const cleanFutureLesson=context.stripPrematureLessonReport(staleFutureLesson);
assert.equal(cleanFutureLesson.status,'未上課','a future lesson carrying an old outcome returns to an unreported state');
assert.equal(Object.keys(cleanFutureLesson).some(key=>key.startsWith('teacherReport')),false,'all previous report fields are removed from future teacher and manager views');
assert.match(cloudSyncSource, /canViewLessonReport\(lesson\)&&reportIsNewForCopiedLesson\(lesson,report\)/, 'cloud report merging enforces the copied lesson lifecycle guard');
for(const [teacherId,teacherName] of [['t1','Wendy'],['t2','Kim'],['t3','Maria'],['t4','Daniel']]){
  const teacherSource={...reportedSource,id:`reported-${teacherId}`,teacherId,teacherIds:[teacherId],teacherName};
  const teacherCopy=context.createFreshLessonCopy(teacherSource,{date:futureDate});
  assert.equal(teacherCopy.teacherId,teacherId,`${teacherName} copy preserves the assigned teacher`);
  assert.equal(teacherCopy.status,'未上課',`${teacherName} future copy starts unreported`);
  assert.equal(Object.keys(teacherCopy).some(key=>key.startsWith('teacherReport')),false,`${teacherName} future copy contains no previous report field`);
  assert.equal(context.reportIsNewForCopiedLesson(teacherCopy,{updatedAtClient:new Date().toISOString()}),false,`${teacherName} future copy rejects every report before its lesson date`);
}
const teacherCardPrivacyStart=applicationSource.indexOf('const lessonCardWithOwnerFinance');
const teacherCardPrivacyEnd=applicationSource.indexOf('function weekMonday',teacherCardPrivacyStart);
assert.ok(teacherCardPrivacyStart>=0&&teacherCardPrivacyEnd>teacherCardPrivacyStart,'teacher calendar privacy wrapper is installed before calendar use');
context.lessonCard=lesson=>`<div class="lesson" data-id="${lesson.id}"><span>學生｜老師｜課程｜✓已繳</span></div>`;
context.calendarIsTeacherView=()=>true;
vm.runInContext(applicationSource.slice(teacherCardPrivacyStart,teacherCardPrivacyEnd),context);
const directTeacherCard=context.lessonCard({id:'lesson-direct-edit'});
assert.match(directTeacherCard,/onclick="event\.stopPropagation\(\);editLesson\('lesson-direct-edit'\)"/,'month card directly opens its exact lesson ID when clicked');
assert.doesNotMatch(directTeacherCard,/已繳|未繳|免收/,'teacher calendar card never displays payment state');
context.calendarIsTeacherView=()=>false;
const directOwnerCard=context.lessonCard({id:'owner-direct-edit'});
assert.match(directOwnerCard,/editLesson\('owner-direct-edit'\)/,'owner month card has a direct edit fallback independent of delegated handlers');
assert.match(directOwnerCard,/✓已繳/,'owner calendar card keeps payment state');
const matrix = [
  ['completed', lesson({ teacherReportStatus: 'completed' }), 200, 100],
  ['student leave', lesson({ status: '學生請假', teacherReportStatus: 'student_leave' }), 200, 100],
  ['teacher leave', lesson({ status: '老師請假', teacherReportStatus: 'teacher_leave' }), 0, 100],
  ['no show', lesson({ status: '缺席', teacherReportStatus: 'no_show' }), 200, 100],
  ['cancelled', lesson({ status: '取消' }), 0, 100],
  ['suspended', lesson({ status: '停課' }), 0, 100],
  ['makeup completed', lesson({ id: 'm1', status: '補課完成', teacherReportStatus: 'makeup_completed', isMakeup: true }), 0, 100],
  ['draft', lesson({ isDraft: true }), 0, 0],
  ['explicitly unpaid teacher', lesson({ payTeacher: 'no' }), 200, 0]
];
for (const [name, row, charge, pay] of matrix) {
  assert.equal(context.lessonCharge(row), charge, `${name}: student charge`);
  assert.equal(context.lessonPay(row), pay, `${name}: teacher pay`);
}
const coTeaching = lesson({ teacherIds: ['t1', 't2'] });
assert.equal(context.lessonCharge(coTeaching), 200, 'co-teaching charges the student once');
assert.equal(context.lessonPay(coTeaching), 250, 'co-teaching pays both teachers');
context.db.lessons = matrix.map(([, row], index) => ({ ...row, id: `hours-matrix-${index}` }));
const formalHoursMatrix = context.calculateTeacherPayroll(context.db.teachers[0], '2026-08');
assert.equal(formalHoursMatrix.actualHours, 8, 'every formal timetable status counts toward teacher hours; only the draft is excluded');
assert.equal(formalHoursMatrix.paidHours, 7, 'an explicitly unpaid formal lesson remains in hours but not paid hours');

context.db.teachers = [{ id: 't1', name: 'One', rate: 100 }];
context.db.lessons = [
  lesson({ id: 'aug-a', date: '2026-08-05', start: '10:00', end: '11:30', status: '未上課' }),
  lesson({ id: 'sep-a', date: '2026-09-05', start: '10:00', end: '12:00', status: '未上課' })
];
assert.equal(context.calculateTeacherPayroll(context.db.teachers[0], '2026-08').actualHours, 1.5, 'August payroll uses every formal August timetable lesson');
assert.equal(context.calculateTeacherPayroll(context.db.teachers[0], '2026-08').amount, 150, 'August payroll amount follows August hours');
assert.equal(context.calculateTeacherPayroll(context.db.teachers[0], '2026-09').actualHours, 2, 'switching to September uses only September lessons');
assert.equal(context.calculateTeacherPayroll(context.db.teachers[0], '2026-09').amount, 200, 'September payroll amount follows September hours');
context.db.lessons.push(lesson({ id: 'sep-unpaid', date: '2026-09-06', start: '13:00', end: '14:30', status: '未上課', payTeacher: 'no' }));
const septemberWithUnpaid = context.calculateTeacherPayroll(context.db.teachers[0], '2026-09');
assert.equal(septemberWithUnpaid.actualHours, 3.5, 'every formal timetable lesson counts toward teacher hours even when explicitly unpaid');
assert.equal(septemberWithUnpaid.amount, 200, 'an explicitly unpaid lesson adds hours but not hourly pay');
assert.equal(septemberWithUnpaid.formulaVersion, 'teacher-payroll-v1-formal-timetable', 'payroll results identify the exact formula contract');

const fixedTeacher = { id: 'fixed', name: 'Fixed', payrollMode: 'fixed', baseSalary: 43000, overtimeRate: 500, deductionRate: 300, minWeeklyHours: 40, workDays: [1, 2, 3, 4, 5] };
context.db.teachers = [fixedTeacher];
context.db.lessons = Array.from({ length: 21 }, (_, index) => lesson({ id: `leap-${index}`, teacherId: 'fixed', teacherIds: ['fixed'], date: `2028-02-${String(index + 1).padStart(2, '0')}`, start: '09:00', end: '17:00', status: '未上課' }));
const leapMonthPayroll = context.calculateTeacherPayroll(fixedTeacher, '2028-02');
assert.equal(leapMonthPayroll.expectedHours, 168, 'leap-year February counts its exact Monday-to-Friday workdays');
assert.equal(leapMonthPayroll.actualHours, 168, 'all formal leap-month timetable hours are included');
assert.equal(leapMonthPayroll.amount, 43000, 'fixed salary stays at base salary when actual and expected hours match');
context.db.lessons.pop();
const leapMonthShort = context.calculateTeacherPayroll(fixedTeacher, '2028-02');
assert.equal(leapMonthShort.shortHours, 8, 'one missing full workday produces an eight-hour shortage');
assert.equal(leapMonthShort.amount, 40600, 'fixed salary shortage uses the configured deduction rate');
context.db.lessons.push(lesson({ id: 'march-boundary', teacherId: 'fixed', teacherIds: ['fixed'], date: '2028-03-01', start: '09:00', end: '21:00', status: '未上課' }));
assert.equal(context.calculateTeacherPayroll(fixedTeacher, '2028-02').actualHours, 160, 'the next month never leaks into the selected payroll month');

context.db.teachers = Array.from({ length: 100 }, (_, index) => ({ id: `stress-t${index}`, name: `Stress ${index}`, rate: 357 }));
context.db.lessons = context.db.teachers.flatMap((teacherRow, teacherIndex) => Array.from({ length: 31 }, (_, day) => lesson({ id: `stress-${teacherIndex}-${day}`, teacherId: teacherRow.id, teacherIds: [teacherRow.id, teacherRow.id], date: `2026-07-${String(day + 1).padStart(2, '0')}`, start: '09:00', end: '10:30', status: '未上課' })));
const stressPayroll = context.db.teachers.map(teacherRow => context.calculateTeacherPayroll(teacherRow, '2026-07'));
assert.ok(stressPayroll.every(row => row.actualHours === 46.5), '100 teachers retain exact hours across 3,100 formal lessons');
assert.ok(stressPayroll.every(row => row.amount === 31 * 1.5 * 357), '100 teachers retain exact hourly pay without duplicate teacher IDs doubling salary');
assert.equal(stressPayroll.reduce((sum, row) => sum + row.actualHours, 0), 4650, 'large-month payroll total remains deterministic');

context.db.teachers = [{ id: 't1', name: 'One', rate: 100 }];
context.effectiveCampId = row => row.campId || '';
context.sameCampSlot = (a, b) => a.campId === b.campId && a.date === b.date && a.start === b.start && a.end === b.end;
context.db.lessons = [
  lesson({ id: 'camp-a', campId: 'SC', date: '2026-08-06', start: '09:00', end: '12:00' }),
  lesson({ id: 'camp-b', campId: 'SC', date: '2026-08-06', start: '09:00', end: '12:00' })
];
const campPayroll = context.calculateTeacherPayroll(context.db.teachers[0], '2026-08');
assert.equal(campPayroll.actualHours, 3, 'one teacher teaching parallel classes in the same camp slot counts hours once');
assert.equal(campPayroll.amount, 300, 'parallel camp classes do not duplicate teacher pay');
context.effectiveCampId = () => '';
context.sameCampSlot = () => false;

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
assert.equal(lockedRecord.payrollFormulaVersion, 'teacher-payroll-v1-formal-timetable', 'locked settlements record the payroll formula version');
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
const mergeStart = cloudSource.indexOf('function canonicalHashValue');
const mergeEnd = cloudSource.indexOf('const AUDIT_COLLECTION_KEYS');
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'owner three-way merge helpers are available');
vm.runInContext(`${cloudSource.slice(mergeStart, mergeEnd)}\nthis.__testMergeOwnerDB=mergeConcurrentOwnerDB;this.__testConflictParts=conflictBackupParts;`, context);
const mergeDB = (base, local, remote) => context.__testMergeOwnerDB(base, local, remote);
const mergeBase = context.emptyDB();
mergeBase.lessons = [{ id: 'shared', title: 'Base', room: '1' }];
const danielAdded = Array.from({ length: 100 }, (_, i) => ({ id: `daniel-${i}`, title: 'Daniel' }));
const catherineAdded = Array.from({ length: 100 }, (_, i) => ({ id: `catherine-${i}`, title: 'Catherine' }));
let mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [...mergeBase.lessons, ...danielAdded] }, { ...mergeBase, lessons: [...mergeBase.lessons, ...catherineAdded] });
assert.equal(mergedOwner.db.lessons.length, 201, 'two owners adding 100 lessons each preserves all 200 additions');
assert.equal(new Set(mergedOwner.db.lessons.map(row => row.id)).size, 201, 'concurrent owner additions never duplicate lesson IDs');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], room: '2' }] }, { ...mergeBase, lessons: [...mergeBase.lessons, ...danielAdded] });
assert.equal(mergedOwner.db.lessons.length, 101, 'editing from a stale base preserves the other owner additions');
assert.equal(mergedOwner.db.lessons.find(row => row.id === 'shared').room, '2', 'the stale owner edit is retained alongside remote additions');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], room: '2' }] }, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], title: 'Remote' }] });
assert.deepEqual({ ...mergedOwner.db.lessons[0] }, { id: 'shared', title: 'Remote', room: '2' }, 'different fields on one lesson merge independently');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], title: 'Local' }] }, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], title: 'Remote' }] });
assert.equal(mergedOwner.db.lessons[0].title, 'Local', 'same-field conflict uses the local value as the formal value');
assert.equal(mergedOwner.conflicts.length, 1, 'same-field conflict creates one recoverable conflict entry');
assert.equal(mergedOwner.conflicts[0].remote, 'Remote', 'the overwritten remote field is retained in the conflict entry');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], flags: { paid: false, visible: true } }] }, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], flags: { paid: true, visible: false } }] });
assert.equal(mergedOwner.conflicts.length, 2, 'falsy nested field conflicts are compared exactly instead of being treated as missing');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [] }, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], room: '3' }] });
assert.equal(mergedOwner.db.lessons[0].room, '3', 'local delete versus remote edit conservatively retains the remote lesson');
assert.equal(mergedOwner.conflicts.length, 1, 'local delete versus remote edit records a conflict');
mergedOwner = mergeDB(mergeBase, { ...mergeBase, lessons: [{ ...mergeBase.lessons[0], room: '4' }] }, { ...mergeBase, lessons: [] });
assert.equal(mergedOwner.db.lessons[0].room, '4', 'remote delete versus local edit conservatively retains the local lesson');
assert.equal(mergedOwner.conflicts.length, 1, 'remote delete versus local edit records a conflict');
const changeA = { at: '2026-08-12T05:00:00Z', type: '新增課程', after: { id: 'a' } };
const changeB = { at: '2026-08-12T05:00:00Z', type: '新增課程', after: { id: 'b' } };
mergedOwner = mergeDB({ ...context.emptyDB(), changes: [changeA] }, { ...context.emptyDB(), changes: [changeA, changeB] }, { ...context.emptyDB(), changes: [changeA] });
assert.equal(mergedOwner.db.changes.length, 2, 'append-only changes with the same timestamp are neither collapsed nor duplicated');
const conflictParts = context.__testConflictParts([{ path: 'lessons.shared.note', local: 'x'.repeat(400000), remote: 'y'.repeat(400000) }]);
assert.ok(conflictParts.length > 1 && conflictParts.every(part => part.length <= 160000), 'large conflict backups are split below the per-document safety limit');
const appShellSource = fs.readFileSync(path.join(root, 'js/app/app-shell.js'), 'utf8');
assert.match(appShellSource, /if\(id==='calendar'\)[\s\S]*mode\.value='month'[\s\S]*date\.value=todayStr\(\)/, 'opening the schedule always starts on the current month');
assert.match(appShellSource, /function installNavigationHandlers\(\)[\s\S]*tabHandlerInstalled[\s\S]*addEventListener\('click'[\s\S]*closest\('button\[data-tab\]'\)[\s\S]*switchTab\(button\.dataset\.tab\)/, 'navigation uses one stable delegated handler that survives account and role switching');
assert.match(cloudSource, /function applyRoleUI\(profile,user\)[\s\S]*window\.installNavigationHandlers\?\.\(\);\s*\}/, 'every authenticated role reapplies navigation handlers after role-specific UI restrictions');
assert.match(cloudSource, /function acknowledgeCurrentScheduleNotification\(\)[\s\S]*if\(modal\)modal\.hidden=true;\s*await Promise\.all/, 'acknowledging many schedule notifications releases the interface before cloud writes finish');
assert.match(cloudSource, /function subscribeLessonReports\(\)\{\s*unsubscribeReports\?\.\(\);unsubscribeReports=null;\s*if\(cloudRole==='teacher'\)return;/, 'teachers use their isolated teacher view and never open a redundant company-wide report collection listener');
assert.match(cloudSource, /function applyCalendarLocationRoleScope\(\)[\s\S]*cloudRole!=='branch_manager'[\s\S]*allowedBranches[\s\S]*option\.remove\(\)[\s\S]*applyCalendarLocationRoleScope\(\);/, 'branch managers only receive authorized branch locations while owner options remain restorable');
assert.match(cloudSource, /if\(teacherOnly\)\{\s*delete document\.body\.dataset\.teacherWeekInitialized;/, 'every fresh teacher login resets the one-time current-week initialization');
const syncDecisionStart = cloudSource.indexOf('function ownerSnapshotDecision');
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
assert.equal(context.dataHash({b:1,a:{d:2,c:3}}),context.dataHash({a:{c:3,d:2},b:1}),'backup integrity hashes are stable when Firestore returns map keys in a different order');
assert.equal(context.ownerLessonShrinkRisk({lessons:Array.from({length:100},(_,i)=>({id:`l${i}`}))},{lessons:Array.from({length:95},(_,i)=>({id:`l${i}`}))}).risky,false,'a small lesson adjustment does not trigger the destructive-change guard');
assert.equal(context.ownerLessonShrinkRisk({lessons:Array.from({length:100},(_,i)=>({id:`l${i}`}))},{lessons:Array.from({length:80},(_,i)=>({id:`l${i}`}))}).risky,true,'a large lesson reduction triggers the destructive-change guard');
assert.match(cloudSource, /catch\(e\)[\s\S]*ownerUploadQueued=true;ownerRetryCount\+\+;[\s\S]*scheduleOwnerRetry\(\)/, 'a failed owner upload stays queued, becomes visible, and schedules a retry');
assert.match(cloudSource, /const APP_RELEASE='20\.26\.19'/, 'operational errors identify the current deployed release');
assert.match(cloudSource, /SCHEDULER_ACCOUNT_EMAILS=new Set\(\['aa0966626336@gmail\.com'\]\)/, 'the actual aa Gmail is the only approved scheduler account');
assert.match(cloudSource, /RETIRED_SCHEDULER_ACCOUNT_EMAILS=new Set\(\['wendylee0820520@gmail\.com'\]\)/, 'Wendy is explicitly migrated back to a standard teacher');
assert.match(cloudSource, /canManageSchedule=SCHEDULER_ACCOUNT_EMAILS\.has\(email\)/, 'approved scheduler Gmail accounts always receive all-teacher scheduling instead of relying on a checkbox');
assert.match(cloudSource, /SCHEDULER_ACCOUNT_EMAILS\.has\(email\)[\s\S]*canManageSchedule:true,readOnly:false[\s\S]*schedulerViews/, 'owner publishing automatically repairs aa access and her dedicated scheduler view');
assert.match(cloudSource, /RETIRED_SCHEDULER_ACCOUNT_EMAILS\.has\(email\)[\s\S]*canManageSchedule:deleteField\(\)[\s\S]*scopedDb:deleteField\(\)[\s\S]*teacherViews/, 'owner publishing fully deletes Wendy scheduler fields and restores her teacher-only view');
assert.match(cloudSource, /if\(snapshotDecision==='unchanged'\)\{publishRoleViewsWithRetry\(\);return\}/, 'owner login republishes role views even when the main schedule snapshot is unchanged');
assert.match(cloudSource, /save teacher access failed[\s\S]*儲存老師權限失敗/, 'account management surfaces scheduler permission write failures instead of failing silently');
assert.match(cloudSource, /schedulerViewRef=doc\(cloud,'companies',COMPANY_ID,'schedulerViews'/, 'scheduler data is isolated from the small companyAccess permission document');
assert.match(cloudSource, /function applySchedulerRequest\(requestRef,data\)[\s\S]*runTransaction[\s\S]*transaction\.set\(mainRef[\s\S]*transaction\.set\(requestRef,\{status:'applied'/, 'Wendy main-data application and request acknowledgement commit atomically');
assert.doesNotMatch(cloudSource, /\}\);\s*if\(notificationBefore&&notificationAfter\)[\s\S]*await setDoc\(requestRef,\{status:'applied'/, 'Wendy request acknowledgement is never written outside its main-data transaction');
assert.match(cloudSource, /function uploadOwnerState\(force=false\)[\s\S]*ownerLessonShrinkRisk\(previousPublished,current\)[\s\S]*confirm\(`[\s\S]*已阻止大量課程減少/, 'owner uploads require explicit confirmation before a large lesson reduction can replace cloud data');
const timeControlSource=fs.readFileSync(path.join(root,'js/ui/24-hour-time-controls.js'),'utf8');
assert.match(timeControlSource, /length:24\*12[\s\S]*padStart\(2,'0'\)[\s\S]*input\[type="time"\]/, 'all editable times use fixed HH:mm values instead of device locale formatting');
const windowsProfileSource=fs.readFileSync(path.join(root,'js/ui/windows-performance-profile.js'),'utf8');
const calendarInteractionSource=fs.readFileSync(path.join(root,'js/modules/calendar/marquee-multi-selection.js'),'utf8');
assert.match(windowsProfileSource,/navigator\.userAgentData\?\.platform[\s\S]*isWindows=\/win\/i[\s\S]*danbridge-windows/,'Windows performance mode is isolated by platform');
assert.match(calendarInteractionSource,/DanbridgePlatform\?\.isWindows[\s\S]*requestAnimationFrame/,'Windows pointer movement is coalesced to the display refresh rate');
assert.match(cloudSource,/cloudEmailKey!==OWNER_EMAIL[\s\S]*只有主要 Owner 可以新增或更新其他 Owner/,'only the primary owner can create or update backup owners');
assert.match(cloudSource,/email===OWNER_EMAIL[\s\S]*主要 Owner 帳號受保護，不能停權/,'the primary owner cannot be disabled from the account UI');
const convenienceSource=fs.readFileSync(path.join(root,'js/app/v18-convenience-suite.js'),'utf8');
assert.match(convenienceSource,/push\('校區',branchName\(old\.branchId\),branchName\(branchId\)\)/,'lesson change confirmations display branch names instead of internal IDs');
assert.match(cloudSource, /async function setCloudAccessActive\(email,active\)[\s\S]*setCompanyAccessWithAudit\(email,\{active,updatedAt:serverTimestamp\(\)\}[\s\S]*users/, 'account suspension atomically audits the preserved access record and synchronizes user profiles');
assert.match(cloudSource, /cloud-access-toggle[\s\S]*branch-access-toggle/, 'teacher and branch manager lists both expose suspension separately from deletion');
assert.match(cloudSource, /function confirmCloudRoleTransition\(existing,targetRole,email\)[\s\S]*舊角色的資料範圍會立即移除/, 'cross-role account changes require explicit owner confirmation');
assert.match(cloudSource, /role:'teacher'[\s\S]*branchIds:deleteField\(\)/, 'changing to teacher removes stale branch-manager scope');
assert.match(cloudSource, /if\(canManageSchedule\)\{const db=filteredSchedulerDB[\s\S]*schedulerViews/, 'only the approved scheduler account receives a dedicated scheduler view');
assert.match(cloudSource, /role:'branch_manager'[\s\S]*deleteDoc\(doc\(cloud,'companies',COMPANY_ID,'teacherViews',email\)\)/, 'changing to branch manager removes the stale teacher view');
assert.match(cloudSource, /async function removeCloudTeacherAccess[\s\S]*teacherViews[\s\S]*branchViews/, 'deleting teacher access removes both possible scoped views');
assert.match(cloudSource, /async function removeCloudBranchManagerAccess\(email\)\{\s*if\(cloudRole!=='owner'\)return;/, 'branch-manager deletion has an explicit owner guard');
assert.match(cloudSource, /async function recordSuccessfulLogin\(user,profile\)[\s\S]*lastLoginAt:serverTimestamp\(\)/, 'authorized login records its successful time');
assert.match(cloudSource, /if\(!existing\.exists\(\)\)\{payload\.invitedAt=serverTimestamp\(\);payload\.invitedBy=cloudEmailKey\|\|OWNER_EMAIL\}/, 'only a new account records its original invitation metadata');
assert.match(cloudSource, /function cloudInvitationState\(active,hasLogin\)[\s\S]*停權[\s\S]*已加入[\s\S]*待首次登入/, 'invitation status distinguishes pending, accepted, and suspended accounts');
assert.match(cloudSource, /async function copyCloudLoginInvitation\(email\)[\s\S]*navigator\.clipboard\.writeText\(message\)/, 'owner can copy a login invitation without sending account data');
const roleResponsiveSource = fs.readFileSync(path.join(root, 'js/app/v20014-role-responsive-ux.js'), 'utf8');
assert.match(roleResponsiveSource, /if\(current!==\x27branch_manager\x27\)\$\$\(\x27\.manager-shortcut\x27\)\.forEach\(button=>button\.remove\(\)\)/, 'teacher and owner dashboards remove branch-manager shortcuts left by a previous login');
assert.match(roleResponsiveSource, /if\(current!==\x27teacher\x27\)\$\(\x27#teacherReportShortcut\x27\)\?\.remove\(\)/, 'owner and branch-manager dashboards remove the teacher report shortcut left by a previous login');
const courseOperationsSource = fs.readFileSync(path.join(root, 'js/modules/calendar/course-operations.js'), 'utf8');
assert.match(roleResponsiveSource, /function hideForRole\(element\)[\s\S]*roleResponsiveHidden='1'/, 'responsive role hiding records which controls it owns');
assert.match(roleResponsiveSource, /function teacherStats\(\)[\s\S]*lessonTeacherIds\(l\)\.includes\(teacherId\)[\s\S]*calculateTeacherPayroll\(currentTeacher,month,rows\)[\s\S]*本月課表時數[\s\S]*計薪/, 'teacher dashboard defensively scopes lessons to the signed-in teacher and uses the same payroll calculation');
assert.match(roleResponsiveSource, /function lessonNeedsReport\(lesson\)[\s\S]*lesson\.date<today[\s\S]*lesson\.date>today[\s\S]*lesson\.end/, 'teacher report summaries count overdue and ended-today lessons while excluding future lessons');
assert.match(roleResponsiveSource, /rows\.filter\(lessonNeedsReport\)\.length/g, 'teacher dashboard and lesson list share the same pending-report rule');
assert.match(roleResponsiveSource, /function branchManagerStats\(\)[\s\S]*allowed=new Set\(accessContext\(\)\.branchIds[\s\S]*recordBranchId[\s\S]*校區學生[\s\S]*本月課表時數/, 'branch manager dashboard defensively scopes statistics to authorized branches');
assert.match(roleResponsiveSource, /function branchManagerConvenience\(\)[\s\S]*managerLessonShortcut[\s\S]*managerMakeupShortcut[\s\S]*managerFinanceShortcut/, 'branch manager dashboard exposes read-only shortcuts to its allowed modules');
assert.match(roleResponsiveSource, /if\(current==='owner'\)restoreRoleResponsiveControls\(\)/, 'owner role restores controls hidden by the responsive role layer');
assert.match(cloudSource, /if\(cloudRole==='owner'\)\{[\s\S]*restoreRoleIsolated\(\);[\s\S]*DanbridgeRoleResponsive\?\.restoreRoleResponsiveControls\?\.\(\)/, 'owner login immediately restores both role-isolation layers');
assert.match(courseOperationsSource, /if\(ownerCanEdit\)\{editBtn\.style\.removeProperty\('display'\);delete editBtn\.dataset\.roleResponsiveHidden\}/, 'opening a lesson as owner defensively restores its edit button');
assert.match(cloudSource, /await ensureProfile\(user\);try\{await recordSuccessfulLogin\(user,profile\)\}/, 'last login is written only after authorization succeeds');
assert.match(cloudSource, /最後登入時間更新失敗[\s\S]*applyRoleUI\(profile,user\)/, 'a login timestamp failure does not block an authorized account');
assert.match(cloudSource, /最後登入：\$\{escapeHTML\(last\)\}/, 'account management displays the last successful login');
assert.match(cloudSource, /filter\(d=>d\.data\(\)\?\.role==='teacher'\)/, 'teacher access list excludes branch managers');
const rulesSource = fs.readFileSync(path.join(root, 'firebase/firestore.rules'), 'utf8');
assert.match(rulesSource, /match \/companies\/\{companyId\}\/teacherViews\/\{email\}[\s\S]*email == emailKey\(\)[\s\S]*&& isTeacher\(companyId\)/, 'teacher views require the teacher role, not only active membership');
assert.match(rulesSource, /resource\.data\.teacherId == ownTeacherId\(\)/, 'teacher view binding must match the current teacher assignment');
assert.match(rulesSource, /resource\.data\.branchIds\.hasOnly\(effectiveBranchIds\(\)\)[\s\S]*effectiveBranchIds\(\)\.hasOnly\(resource\.data\.branchIds\)/, 'branch view scope must exactly match the current manager assignment');
assert.match(cloudSource, /profile\.role==='branch_manager'[\s\S]*#v18Fab,#v18FabMenu[\s\S]*forEach\(markRoleIsolated\)/, 'branch manager owner-only controls are hidden and removed from accessibility navigation');
assert.match(cloudSource, /#drafts,#camps,#winterCamps,#data,#security'[\s\S]*markRoleIsolated\(e\)/, 'branch manager forbidden sections are inert and hidden');
assert.match(cloudSource, /function installRoleInteractionGuards\(\)[\s\S]*cloudRole==='branch_manager'[\s\S]*stopImmediatePropagation/, 'branch manager calendar context and empty-cell selection events are blocked in capture phase');
assert.match(cloudSource, /function markRoleIsolated\(element\)[\s\S]*element\.dataset\.roleIsolated='1'[\s\S]*element\.inert=true/, 'role-hidden controls carry a reversible isolation marker');
assert.match(cloudSource, /function restoreRoleIsolated\(\)[\s\S]*\[data-role-isolated="1"\][\s\S]*delete element\.dataset\.roleIsolated/, 'owner login removes only role isolation state');
assert.match(cloudSource, /document\.body\.dataset\.roleUx=cloudRole;\s*if\(cloudRole==='owner'\)\{\s*restoreRoleIsolated\(\);[\s\S]*restoreRoleResponsiveControls/, 'owner restoration happens before owner controls are rendered');
const roleCss = fs.readFileSync(path.join(root, 'css/core/73-v20014-role-responsive-ux.css'), 'utf8');
assert.match(roleCss, /#calendar \.mobile-week-day\{display:block!important;/, 'mobile weekly day cards override the global hidden section rule');
assert.match(roleCss, /@media \(min-width:701px\) and \(max-width:1100px\)[\s\S]*body:not\(\.auth-locked\)>nav button\{[^}]*margin-top:0!important/, 'tablet navigation removes desktop sidebar group margins so every visible tab remains clickable');
assert.match(roleCss, /max-width:1100px\)[\s\S]*nav button\[data-tab="students"\]::before\{content:"◉"!important\}/, 'tablet navigation restores button icons instead of desktop group headings');
assert.match(roleCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/, 'owner tablet navigation uses a readable five-column grid');
assert.match(roleCss, /body:not\(\.auth-locked\)>nav::before,body:not\(\.auth-locked\)>nav::after\{display:none!important;content:none!important\}/, 'tablet navigation removes overlapping desktop brand labels');
assert.match(roleCss, /body\[data-active-section\]:not\(\[data-active-section="dashboard"\]\):not\(\[data-active-section="calendar"\]\):not\(\[data-active-section="lessons"\]\) #v18Fab/, 'quick add stays off form-heavy pages');
const usabilitySource = fs.readFileSync(path.join(root, 'js/app/v1822-usability-polish.js'), 'utf8');
assert.match(usabilitySource, /targetTop=matchMedia\('\(max-width:700px\)'\)\.matches\?0:/, 'mobile section changes always start at the new page top');
assert.match(roleCss, /body\[data-role-ux="branch_manager"\] #v18Fab[\s\S]*body\[data-role-ux="branch_manager"\] #finance button[\s\S]*display:none!important/, 'dynamic owner controls stay hidden after branch view rerenders');
const schedulerSource = fs.readFileSync(path.join(root, 'js/modules/calendar/scheduler-ui.js'), 'utf8');
assert.match(schedulerSource, /const DRAG_START_PX=3/, 'iPad touch drag starts on movement without a long-press delay');
assert.doesNotMatch(schedulerSource, /DRAG_HOLD_MS|setTimeout\(\(\)=>\{\s*dragStarted=true/, 'iPad touch drag has no long-press timer');
assert.match(schedulerSource, /touchDragIds=selectedLessonIds\.has[\s\S]*if\(touchDragIds\.length>1\)moveLessonsTo/, 'iPad direct dragging preserves multi-selected lesson movement');
const dragUxCss = fs.readFileSync(path.join(root, 'css/calendar/16-danbridge-v38-drag-ux.css'), 'utf8');
assert.match(dragUxCss, /@media\(hover:none\)[\s\S]*#calendarCanvas \.lesson,#calendarCanvas \.week-event\{touch-action:none!important\}/, 'iPad lesson cards reserve touch movement for immediate dragging instead of Safari scrolling');
assert.match(schedulerSource, /function handleCalendarShortcuts\(e\)\{\s*if\(!calendarOwnerCanEdit\(\)\)return/, 'branch manager calendar shortcuts stop before any action');
assert.match(cloudSource, /function setSignedOutIsolation\(locked\)[\s\S]*el\.inert=true;el\.setAttribute\('aria-hidden','true'\)/, 'signed-out content is removed from keyboard and accessibility navigation');
assert.match(cloudSource, /function notifyNewLessonReports\(reports\)[\s\S]*\['owner','branch_manager'\][\s\S]*teacherEmail[\s\S]*canViewLessonReport/, 'new report popups are limited to owner or the authorized branch manager and exclude the submitting account');
assert.match(cloudSource, /function reportNotificationSeenKey\(\)[\s\S]*cloudEmailKey/, 'report popup acknowledgement is isolated per signed-in account');
assert.match(cloudSource, /unsubscribeReports=onSnapshot[\s\S]*notifyNewLessonReports\(lessonReportDocuments\)[\s\S]*applyCachedLessonReportsToCurrentDB/, 'report notifications and local data updates share the same realtime Firestore stream');
assert.match(cloudSource, /function createCloudSafetyBackup\(force=false\)[\s\S]*dailyBackups[\s\S]*snapshot:current[\s\S]*hash:dataHash\(current\)/, 'owner daily cloud backups preserve the full database with an integrity hash');
assert.match(cloudSource, /function restoreCloudSafetyBackup\(day\)[\s\S]*dataHash\(restored\)!==backup\.hash[\s\S]*createVersion[\s\S]*__danbridgeSetDB/, 'cloud backup restoration verifies integrity and creates a local rollback version first');
assert.match(cloudSource, /CLOUD_BACKUP_RETENTION_DAYS=30[\s\S]*function cleanupOldCloudBackups/, 'daily cloud backup retention is capped at thirty days');
assert.match(cloudSource, /function persistOwnerSyncRecovery\(\)[\s\S]*OWNER_SYNC_RECOVERY_KEY[\s\S]*function restoreOwnerSyncRecovery/, 'an unconfirmed owner mutation survives reload and can resume synchronization');
assert.match(cloudSource, /function retryAllOperationalSync\(\)[\s\S]*uploadOwnerState\(true\)[\s\S]*publishRoleViewsWithRetry/, 'the recovery center retries main data and role-scoped views together');
assert.match(cloudSource, /function saveEmergencyOwner\(\)[\s\S]*role:'owner'[\s\S]*companyAccess/, 'the primary owner can explicitly create a second full-access owner');
assert.match(cloudSource, /function buildImmutableDataAudit\(beforeDb,afterDb\)[\s\S]*AUDIT_COLLECTION_KEYS[\s\S]*entityChanges/, 'immutable audit summaries cover every business collection without storing full entity contents');
assert.match(cloudSource, /function immutableAuditRecord\(detail=\{\}\)[\s\S]*actorUid:cloudUid[\s\S]*serverTimestamp[\s\S]*companyAudit/, 'immutable audit records bind the authenticated owner and server timestamp outside company data');
assert.match(cloudSource, /function writeImmutableAudit\(detail=\{\}\)[\s\S]*runTransaction[\s\S]*transaction\.set\(audit\.ref/, 'owner audit writes are transactionally deduplicated');
assert.match(cloudSource, /function uploadOwnerState\(force=false\)[\s\S]*runTransaction[\s\S]*buildImmutableDataAudit\(remoteBefore,finalDb\)[\s\S]*syncConflictBackups[\s\S]*transaction\.set\(mainRef[\s\S]*transaction\.set\(audit\.ref[\s\S]*conflictRefs\.forEach/, 'owner merged main data, immutable audit, and conflict backups commit in one Firestore transaction');
assert.match(cloudSource, /function restoreCloudSafetyBackup\(day\)[\s\S]*action:'backup-restored'/, 'cloud backup restoration produces a dedicated immutable audit event');
assert.match(cloudSource, /teacher-access-(?:updated|created)/, 'teacher account changes produce immutable access audit events');
assert.match(cloudSource, /branch-access-(?:updated|created)/, 'branch-manager account changes produce immutable access audit events');
assert.match(cloudSource, /account-disabled/, 'account activation changes produce immutable access audit events');
assert.match(cloudSource, /sensitiveIds=\['notificationList'[\s\S]*'courseDrawerBody'[\s\S]*'cloudBackupList'[\s\S]*'emergencyOwnerStatus'[\s\S]*'immutableAuditList'\]/, 'signed-out isolation clears notifications, recovery details, emergency-owner data, and immutable audit entries');
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
const filterStart = cloudSource.indexOf('function lessonTeacherIds');
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
assert.deepEqual(Array.from(teacherView.students,row=>row.id), ['s1']);
assert.deepEqual(Array.from(teacherView.teachers,row=>row.id), ['t1']);
assert.equal(teacherView.students[0].parent, undefined);
assert.equal(teacherView.lessons[0].paymentStatus, undefined);
assert.equal(teacherView.teachers[0].rate, undefined);
assert.deepEqual(Array.from(teacherView.fixedExpenses), []);
const legacyTeacherView = context.filteredTeacherDB({...scopedSource,lessons:[lesson({id:'legacy-own',teacherId:'t1',teacherIds:[]})]}, 't1');
assert.deepEqual(Array.from(legacyTeacherView.lessons,row=>row.id), ['legacy-own'], 'an empty legacy teacherIds list falls back to the primary teacher');
const schedulerView = context.filteredSchedulerDB({
  ...scopedSource,
  branches: [{id:'a',name:'A',rooms:['1'],managerEmail:'private@example.com'}],
  lessons: [lesson({id:'schedule-safe',address:'Scheduling address',meetingUrl:'https://meeting',note:'Scheduling note',paymentStatus:'paid',chargeStudent:'yes',payTeacher:'yes'})]
});
assert.deepEqual(Object.keys(schedulerView.branches[0]).sort(), ['id','name','rooms']);
assert.equal(schedulerView.lessons[0].address, 'Scheduling address', 'Wendy scheduler lessons retain the scheduling address');
assert.equal(schedulerView.lessons[0].meetingUrl, 'https://meeting', 'Wendy scheduler lessons retain the online meeting link');
assert.equal(schedulerView.lessons[0].note, 'Scheduling note', 'Wendy scheduler lessons retain the scheduling note');
for (const field of ['paymentStatus','chargeStudent','payTeacher']) assert.equal(schedulerView.lessons[0][field], undefined, `Wendy scheduler lessons exclude ${field}`);
assert.deepEqual(Array.from(schedulerView.fixedExpenses), []);
const branchView = context.filteredBranchDB(scopedSource, ['a']);
assert.deepEqual(Array.from(branchView.lessons, row => row.id), ['own-a']);
assert.deepEqual(Array.from(branchView.students,row=>row.id), ['s1']);
assert.deepEqual(Array.from(branchView.teachers,row=>row.id), ['t1']);
assert.deepEqual(Array.from(branchView.fixedExpenses, row => row.id), ['expense']);
assert.deepEqual(Array.from(branchView.collectionRecords,row=>row.id), ['payment']);

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
assert.match(notificationCenterSource, /actual=teacherActualHours\(t,rows\)/, 'weekly short-hours notifications use the same formal timetable hours as payroll');
assert.doesNotMatch(notificationCenterSource, /actual=.*lessonCountsForTeacherPay/, 'weekly short-hours notifications never exclude a formal no-pay lesson from actual hours');
const teacherKpiSource = fs.readFileSync(path.join(root, 'js/modules/teachers/teacher-kpi.js'), 'utf8');
assert.match(teacherKpiSource, /active=typeof teacherPayableHourLessons==='function'[\s\S]*teacherPayableHourLessons\(t,ls\)/, 'teacher KPI hours use the same formal timetable lesson set as payroll');
assert.doesNotMatch(teacherKpiSource, /active=ls\.filter\(lessonCountsAsTaught\)/, 'teacher KPI never falls back to completed-only hours');
assert.match(teacherKpiSource, /revenue:teacherCompanyRevenue\(t,month,ls\)/, 'teacher KPI revenue uses every formal timetable lesson for the selected month');
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
assert.equal(vm.runInContext("financeLessonScopeMatch({branchId:'unassigned'},'all',row=>row.branchId)", context), true, 'all-branch teacher hours include unassigned formal timetable lessons');
assert.equal(vm.runInContext("financeLessonScopeMatch({branchId:'unassigned'},'river',row=>row.branchId)", context), false, 'a single branch excludes lessons outside that branch');
assert.match(branchBusinessSource, /lessons=\(db\.lessons\|\|\[\]\)\.filter\(l=>!l\.isDraft&&l\.date\.startsWith\(m\)&&financeLessonScopeMatch\(l,scope\)\)/, 'finance payroll uses the lesson scope that retains every formal all-branch timetable lesson');
assert.match(branchBusinessSource, /expenseScope\.innerHTML=optionsHTML\(true,false\)/, 'expense scope offers all real branches without unassigned');
assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /id="financeTotalExpenses"/, 'finance overview includes a total expenses metric');
const financeArchitectureSource = fs.readFileSync(path.join(root, 'js/app/v18-information-architecture.js'), 'utf8');
assert.match(financeArchitectureSource, /function setNativeMonthValue\(id,value\)\{const el=document\.getElementById\(id\)/, 'workspace month updates the real hidden finance, settlement and KPI controls by ID');
assert.doesNotMatch(financeArchitectureSource, /function setNativeMonthValue\(id,value\)\{const el=\$\(id\)/, 'month synchronization never treats an ID as an element tag selector');
assert.match(financeArchitectureSource, /\['financeMonth','settleMonth','teacherKpiMonth','oneTimeExpenseMonth'\]\.forEach\(id=>setNativeMonthValue\(id,value\)\)/, 'one workspace month change synchronizes every downstream monthly renderer');
assert.match(financeArchitectureSource, /id="expenseTotalAmount"/, 'expense management includes its own total card');
const studentsCrmSource = fs.readFileSync(path.join(root, 'js/modules/students/students-crm.js'), 'utf8');
assert.match(studentsCrmSource, /id="crmTeacherFilter"[\s\S]*全部老師/, 'student CRM exposes an all-teacher filter');
assert.match(studentsCrmSource, /function archiveStudent[\s\S]*archivedAt:new Date\(\)\.toISOString\(\)[\s\S]*archivedReason[\s\S]*status:'inactive'/, 'student archival preserves the record with actor, time, reason, and inactive status');
assert.match(studentsCrmSource, /function restoreStudent[\s\S]*archivedAt:''[\s\S]*status:'active'[\s\S]*restoredAt/, 'student restoration reactivates the preserved record and records restoration metadata');
assert.doesNotMatch(studentsCrmSource, /function deleteStudent/, 'student CRM no longer exposes destructive record deletion');
vm.runInContext(studentsCrmSource, context);
const crmStudents = [{ id: 'crm-a', name: 'Amy', parent: 'Lin', preferredTeacherId: 't1' }, { id: 'crm-b', name: 'Bob', parent: 'Chen', preferredTeacherId: '' }, { id: 'crm-c', name: 'Ann', parent: 'Wu', preferredTeacherId: '' }, { id: 'crm-d', name: 'Cara', parent: 'Ho', preferredTeacherId: '' }].map(context.studentDefaults);
context.db.lessons = [lesson({ id: 'crm-lesson', studentId: 'crm-b', teacherId: 't1', teacherIds: ['t1'] }), lesson({ id: 'crm-co-lesson', studentId: 'crm-c', teacherId: 't2', teacherIds: ['t2', 't1'] }), lesson({ id: 'crm-draft', studentId: 'crm-d', teacherId: 't1', teacherIds: ['t1'], isDraft: true })];
assert.deepEqual(crmStudents.filter(s => context.studentMatchesCrmFilters(s, '', 't1')).map(s => s.name), ['Bob', 'Ann'], 'teacher filtering follows primary and co-teaching timetable assignments, excluding fixed-only and draft-only relationships');
assert.deepEqual(crmStudents.filter(s => context.studentMatchesCrmFilters(s, 'chen', 't1')).map(s => s.name), ['Bob'], 'teacher and text filters combine without widening results');
assert.deepEqual(crmStudents.filter(s => context.studentMatchesCrmFilters(s, '', '')).map(s => s.name), ['Amy', 'Bob', 'Ann', 'Cara'], 'clearing the teacher filter restores all visible students');
const teachersCrmSource = fs.readFileSync(path.join(root, 'js/modules/teachers/teachers-crm.js'), 'utf8');
const selectOptionsSource = fs.readFileSync(path.join(root, 'js/ui/select-options.js'), 'utf8');
assert.match(teachersCrmSource, /async function archiveTeacher[\s\S]*__danbridgeDisableTeacherAccessForArchive[\s\S]*archivedAt:new Date\(\)\.toISOString\(\)/, 'teacher archival disables linked access before preserving the archived teacher');
assert.match(teachersCrmSource, /function restoreTeacher[\s\S]*登入權限仍維持停權[\s\S]*archivedAt:''/, 'teacher restoration deliberately leaves login access disabled until owner review');
assert.doesNotMatch(teachersCrmSource, /function deleteTeacher/, 'teacher CRM no longer exposes destructive record deletion');
assert.match(selectOptionsSource, /function activeStudents\(\)[\s\S]*!isArchivedRecord[\s\S]*function activeTeachers\(\)[\s\S]*!teacherIsArchived/, 'new scheduling selectors exclude archived students and teachers');
assert.match(selectOptionsSource, /optionsWithCurrent[\s\S]*（已封存）/, 'an archived participant already attached to a historical lesson remains identifiable while editing history');
assert.match(cloudSource, /function disableTeacherAccessForArchive[\s\S]*teacher-archived-account-disabled[\s\S]*active:false[\s\S]*window\.__danbridgeDisableTeacherAccessForArchive/, 'teacher archival atomically audits access suspension and exposes the guarded workflow');
assert.match(branchBusinessSource, /expenseTotalAmount'\)\.textContent=money\(d\.fixedTotal\+d\.oneTimeTotal\)/, 'expense management totals only fixed and one-time expenses');
assert.doesNotMatch(branchBusinessSource, /expenseTotalAmount'\)\.textContent=money\(d\.totalExpenses\)/, 'expense management total excludes teacher payroll');
assert.match(branchBusinessSource, /expenseTotalScope'\)\.textContent=scopeLabel\(scope\)/, 'expense total identifies the selected branch scope');

const moveOperationsStart = courseOperationsSource.indexOf('let calendarMoveSaveTimer');
assert.ok(moveOperationsStart >= 0, 'calendar move operations are available');
assert.match(courseOperationsSource, /function editLesson\(id\)\{[\s\S]*const restricted=role==='teacher'\|\|role==='branch_manager'[\s\S]*if\(!restricted\)return openLessonModal\(todayStr\(\),'16:00',id\)/, 'owner single-click opens the existing lesson directly in the edit modal even while role state is synchronizing');
assert.doesNotMatch(courseOperationsSource.slice(courseOperationsSource.indexOf('function openLessonModal'),courseOperationsSource.indexOf('function saveLesson')), /disabled|readOnly/, 'owner lesson editor does not lock any schedule field');
const editOperationStart = courseOperationsSource.indexOf('function editLesson(id)');
context.openedLessonIds=[];context.openedDrawerIds=[];
context.openLessonModal=(date,start,id)=>context.openedLessonIds.push(id);
context.openCourseDrawer=id=>context.openedDrawerIds.push(id);
context.window.currentCloudRole=()=> 'owner';
vm.runInContext(courseOperationsSource.slice(editOperationStart, moveOperationsStart), context);
context.editLesson('owner-single-click');
assert.deepEqual(context.openedLessonIds,['owner-single-click'],'owner single-click passes the exact existing lesson ID into the edit modal');
context.window.currentCloudRole=()=> 'teacher';
context.editLesson('teacher-single-click');
assert.deepEqual(context.openedDrawerIds,['teacher-single-click'],'non-owner fallback never receives owner edit access');
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
assert.match(interactionSource, /const bindCardDragHandlers=typeof window\.attachDragHandlers[\s\S]*function refreshRenderedInteractions\(\)[\s\S]*bindCardDragHandlers\?\.\(\)[\s\S]*window\.attachDragHandlers=refreshRenderedInteractions/, 'calendar rerenders restore iPad card drag listeners before refreshing selection state');
assert.doesNotMatch(interactionSource, /window\.attachDragHandlers=refresh;/, 'desktop selection refresh never replaces the iPad touch drag binder');
assert.doesNotMatch(interactionSource, /moveLessonsTo\([^\n]+\);else moveLessonTo\([^\n]+\);\s*finishSelection\(\)/, 'successful drops do not clear the same selection twice');
const pointerDragStartSource = interactionSource.slice(interactionSource.indexOf('function beginPointerDrag'), interactionSource.indexOf('const ghostStyleProperties'));
const pointerDragMoveSource = interactionSource.slice(interactionSource.indexOf('function movePointerDrag'), interactionSource.indexOf('function endPointerDrag'));
assert.doesNotMatch(pointerDragStartSource, /setPointerCapture/, 'a plain lesson-card click does not capture the pointer away from the card');
assert.match(pointerDragMoveSource, /state\.moved=true[\s\S]*setPointerCapture/, 'pointer capture starts only after the gesture becomes a real drag');

const pwaSource = fs.readFileSync(path.join(root, 'js/core/pwa-installation.js'), 'utf8');
assert.match(cloudSource, /if\(cloudRole==='owner'\)return \{\.\.\.meta,teacherIds\};[\s\S]*if\(!cloudTeacherId\)throw new Error/, 'every Owner can submit a lesson report without a linked teacher profile');
assert.match(cloudSource, /const owners=\[\{email:OWNER_EMAIL[\s\S]*if\(a\.role==='owner'\)[\s\S]*for\(const owner of owners\)addRecipientItem/, 'every active Owner receives a large schedule-change notification');
assert.match(cloudSource, /applySchedulerRequest[\s\S]*transaction\.set\(requestRef,\{status:'applied'[\s\S]*queueScheduleChangeNotifications\(notificationBefore,notificationAfter,`wendy-\$\{requestRef\.id\}`/, 'Wendy requests commit atomically while large role notifications continue in the retry queue');
assert.match(cloudSource, /課表已立即更新，[\s\S]*正在同步給 Owner、校區管理者與老師/, 'Wendy sees the locally updated all-teacher schedule immediately');
assert.match(cloudSource, /schedulerSaveChain=schedulerSaveChain\.catch\(\(\)=>\{\}\)\.then\(queueSchedulerChanges\)/, 'rapid Wendy drag, paste and edit saves are serialized without duplicate schedule requests');
assert.match(cloudSource, /for\(const \[id,desired\] of \[\.\.\.schedulerOptimisticLessons\]\)[\s\S]*serverLessons\.set\(id,deepCopy\(desired\)\)/, 'an intermediate server snapshot cannot erase Wendy optimistic drag, paste or edit results');
assert.match(cloudSource, /cloudRole==='teacher'&&cloudCanManageSchedule[\s\S]*originalSaveDB[\s\S]*scheduleSchedulerChanges/, 'every shared calendar save path immediately queues Wendy synchronization');
const roleUxSource=fs.readFileSync(path.join(root,'js/app/v20014-role-responsive-ux.js'),'utf8');
assert.match(roleUxSource, /const scheduler=accessContext\(\)\.canManageSchedule===true[\s\S]*hidden=scheduler\?[\s\S]*if\(!scheduler\)\$\$\('\.floating-actions'\)/, 'responsive teacher UI preserves every Wendy editing entry point');
const schedulerUiSource=fs.readFileSync(path.join(root,'js/modules/calendar/scheduler-ui.js'),'utf8');
const marqueeSource=fs.readFileSync(path.join(root,'js/modules/calendar/marquee-multi-selection.js'),'utf8');
const wendyCourseOperationsSource=fs.readFileSync(path.join(root,'js/modules/calendar/course-operations.js'),'utf8');
const lessonListSource=fs.readFileSync(path.join(root,'js/modules/lessons/lesson-list-and-search.js'),'utf8');
const schedulingEfficiencySource=fs.readFileSync(path.join(root,'js/app/v20-scheduling-efficiency.js'),'utf8');
assert.match(schedulerUiSource,/canMove=calendarOwnerCanEdit\(\)/,'Wendy and Owner use the same card drag permission');
assert.match(marqueeSource,/canEdit=\(\)=>window\.calendarOwnerCanEdit/,'Wendy and Owner use the same marquee, click and context-menu controller');
assert.match(wendyCourseOperationsSource,/ownerCanEdit=window\.calendarOwnerCanEdit/,'Wendy and Owner use the same course drawer edit action');
assert.match(wendyCourseOperationsSource,/context\.canManageSchedule===true\|\|document\.body\.classList\.contains\('wendy-cloud-role'\)[\s\S]*openLessonModal/,'Wendy lesson clicks always open scheduling edit instead of the teacher report permission path');
assert.match(lessonListSource,/const scheduler=document\.body\.classList\.contains\('wendy-cloud-role'\)[\s\S]*scheduler\?'編輯'/,'Wendy lesson records expose scheduling edit rather than a misleading report action');
assert.match(marqueeSource,/classList\.toggle\('calendar-selection-active',selecting\)/,'selection decoration is explicitly tied to active multi-selection state');
const wendyRoleCss=fs.readFileSync(path.join(root,'css/core/79-wendy-schedule-role.css'),'utf8');
assert.match(wendyRoleCss,/calendar-toolbar-filters\{display:grid!important;grid-template-columns:repeat\(5,minmax\(130px,1fr\)\) minmax\(250px,1\.55fr\)/,'Wendy desktop filters use the exact Owner row geometry');
assert.match(wendyRoleCss,/--wendy-card:#fffaf3[\s\S]*main section\[id\]>\.card[\s\S]*background:linear-gradient\(155deg,#fffdf9 0%,var\(--wendy-card\) 100%\)/,'Wendy workspace cards use the isolated soft orange treatment');
assert.doesNotMatch(wendyRoleCss,/max-width:700px[\s\S]*calendar-toolbar-filters[\s\S]*grid-template-columns:1fr/,'Wendy no longer has a separate teacher-only mobile toolbar breakpoint');
assert.match(schedulingEfficiencySource,/canEdit=\(\)=>window\.calendarOwnerCanEdit/,'Wendy and Owner use the same smart scheduling and replacement actions');
assert.match(cloudSource, /'paymentStatus','chargeStudent','payTeacher','campId'/, 'small billing, payroll and camp-code changes trigger schedule notifications');
assert.match(cloudSource,/function installTeacherReportUI\(\)[\s\S]*cloudRole==='teacher'&&cloudCanManageSchedule[\s\S]*originalEditLesson\?\.\(id\)[\s\S]*cloudRole==='teacher'\)return openTeacherReportModal/,'the final authenticated click override sends Wendy to scheduling edit and ordinary teachers to reporting');
assert.match(cloudSource, /\['owner','teacher','branch_manager'\]\.includes\(cloudRole\)/, 'Owners, managers and teachers subscribe to large schedule notifications');
assert(/worker\.state==='activated'\)return reloadAcceptedUpdate\(\)/.test(pwaSource), 'PWA update button must reload immediately when the worker already activated');
assert(/setTimeout\(reloadAcceptedUpdate,1800\)/.test(pwaSource), 'PWA update button must have a reload fallback for Safari and installed apps');
assert(/__danbridge_refresh/.test(pwaSource)&&/window\.location\.replace/.test(pwaSource), 'PWA accepted updates must reopen a cache-busted entry URL');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.id, './', 'PWA has a stable app identity across future start URL changes');
assert.equal(manifest.display, 'standalone', 'installed PWA opens as an app window');
assert.deepEqual(manifest.icons.filter(icon=>icon.purpose==='any').map(icon=>icon.sizes), ['192x192','512x512','1024x1024'], 'PWA exposes feather icons for standard launch surfaces');
assert.deepEqual(manifest.icons.filter(icon=>icon.purpose==='maskable').map(icon=>icon.sizes), ['192x192','512x512'], 'PWA exposes separately padded feather icons for masked Android surfaces');
assert.match(pwaSource, /reg\.waiting&&navigator\.serviceWorker\.controller\)offerUpdate/, 'an already waiting update is offered without silently replacing the running app');
assert.match(pwaSource, /worker\.state==='installed'&&navigator\.serviceWorker\.controller/, 'a newly downloaded update is offered only to an existing installation');
assert.match(pwaSource, /navigator\.serviceWorker\.addEventListener\('controllerchange'/, 'accepted updates reload exactly when the new worker takes control');
assert.match(pwaSource, /function reloadAcceptedUpdate\(\)\{\s*if\(!reloadForAcceptedUpdate\|\|refreshing\)return/, 'first Service Worker installation cannot trigger an unsolicited page reload');
assert.match(pwaSource, /reloadForAcceptedUpdate=true;[\s\S]*worker\.postMessage/, 'reload permission is set only when the user accepts the update');
assert.match(pwaSource, /worker\.state==='activated'\)reloadAcceptedUpdate\(\)/, 'accepted update also reloads on the worker activation event when controllerchange is delayed');
assert.doesNotMatch(pwaSource, /reg\.waiting\)reg\.waiting\.postMessage/, 'PWA no longer silently activates a waiting version');
assert.match(pwaSource, /document\.addEventListener\('click'[\s\S]*#pwaInstallBtn/, 'install action survives header and role UI rerenders through delegated handling');

console.log(`PASS: ${matrix.length} accounting states, settlement rates, role scopes, notifications, live access guards, and single/multi calendar dragging.`);
