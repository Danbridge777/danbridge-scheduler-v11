#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const fakeClassList = (...initial) => {
  const values = new Set(initial);
  return { add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)), toggle: (name, force) => force === undefined ? (values.has(name) ? (values.delete(name), false) : (values.add(name), true)) : (force ? values.add(name) : values.delete(name), force), contains: name => values.has(name) };
};
const elements = {
  calendarTeacherFilter: { value: 't1' },
  calendarDate: { value: '2026-08-03' },
  calendarMode: { value: 'week' },
  selectionBar: { classList: fakeClassList('hidden') },
  selectionCount: { textContent: '' },
  selectionModeBtn: { textContent: '' },
  calendarContextMenu: { classList: fakeClassList() },
  pasteModeBanner: { classList: fakeClassList() },
  pasteModeMessage: { textContent: '' },
  batchDateShift: { value: '7' },
  batchTimeShift: { value: '0' },
  batchTeacher: { value: '' },
  batchBranch: { value: '' },
  batchRoom: { value: '' },
  batchStatus: { value: '' },
  batchPayment: { value: '' }
};
let nextId = 0;
const context = {
  console,
  window: null,
  db: { students: [], teachers: [], lessons: [] },
  selectedLessonIds: new Set(),
  selectionMode: false,
  dragState: null,
  crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` },
  document: {
    body: { classList: { add() {}, remove() {} } },
    querySelectorAll: () => [],
    getElementById: id => elements[id] || null
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  $: id => elements[id] || null,
  student(id) { return context.db.students.find(item => item.id === id) || {}; },
  teacher(id) { return context.db.teachers.find(item => item.id === id) || {}; },
  lessonTeacherIds(lesson) { return [...new Set((lesson.teacherIds || [lesson.teacherId]).filter(Boolean))]; },
  isGroupStudentId: () => false,
  locationLabel: lesson => lesson.location || lesson.branchId || '',
  localDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  todayStr: () => '2026-08-03',
  confirm: () => true,
  alert: message => { context.alerts.push(message); },
  toast: message => { context.toasts.push(message); },
  snapshot: () => { context.snapshots += 1; },
  saveDB: () => { context.saves += 1; },
  renderCalendar: () => { context.renders += 1; },
  clearCalendarSelectionState: () => { context.selectedLessonIds.clear(); context.selectionMode = false; },
  hideCalendarContextMenu: () => elements.calendarContextMenu.classList.remove('show'),
  cancelPasteClickMode: () => {},
  logChange: () => {},
  updateSelectionCount: () => {},
  beginPasteClickMode: () => {},
  alerts: [], toasts: [], snapshots: 0, saves: 0, renders: 0
};
context.lessonClipboard = [];
context.contextPasteTarget = null;
context.pasteClickMode = false;
context.window = context;
vm.createContext(context);

const utilsSource = fs.readFileSync(path.join(root, 'js/core/utils.js'), 'utf8');
vm.runInContext(utilsSource, context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/core/date-utils.js'), 'utf8'), context);

const schedulerSource = fs.readFileSync(path.join(root, 'js/modules/calendar/scheduler-ui.js'), 'utf8');
vm.runInContext(schedulerSource.slice(0, schedulerSource.indexOf('function lessonHoverText')), context);
const selectionStart = schedulerSource.indexOf('function updateSelectionCount');
const selectionEnd = schedulerSource.indexOf('function copySelectedLessons');
vm.runInContext(schedulerSource.slice(selectionStart, selectionEnd), context);
const gapRangeStart = schedulerSource.indexOf('function teacherGapWeekRange');
const gapRangeEnd = schedulerSource.indexOf('function renderCalendarAnalysis');
vm.runInContext(schedulerSource.slice(gapRangeStart, gapRangeEnd), context);
const selectedCopyStart = schedulerSource.indexOf('function copySelectedLessons');
const selectedCopyEnd = schedulerSource.indexOf('function deleteSelectedLessons');
vm.runInContext(schedulerSource.slice(selectedCopyStart, selectedCopyEnd), context);

const courseSource = fs.readFileSync(path.join(root, 'js/modules/calendar/course-operations.js'), 'utf8');
const conflictStart = courseSource.indexOf('function lessonBlocksScheduling');
const conflictEnd = courseSource.indexOf('function deleteCurrentLesson');
vm.runInContext(courseSource.slice(conflictStart, conflictEnd), context);

const clipboardStart = schedulerSource.indexOf('function beginPasteClickMode');
const clipboardEnd = schedulerSource.indexOf('function enableDesktopMarquee');
vm.runInContext(schedulerSource.slice(clipboardStart, clipboardEnd), context);

const batchSource = fs.readFileSync(path.join(root, 'js/modules/calendar/batch-lesson-operations.js'), 'utf8');
const batchStart = batchSource.indexOf('function buildBatchCandidates');
const batchEnd = batchSource.indexOf('function previewBatch');
vm.runInContext(batchSource.slice(batchStart, batchEnd), context);

const applicationSource = fs.readFileSync(path.join(root, 'js/modules/application-and-business-features.js'), 'utf8');
const copyStart = applicationSource.indexOf('function weekMonday');
const copyEnd = applicationSource.indexOf("$('lessonModal').addEventListener");
assert.ok(copyStart >= 0 && copyEnd > copyStart, 'calendar copy functions are available');
vm.runInContext(applicationSource.slice(copyStart, copyEnd), context);

const lesson = (overrides = {}) => ({
  id: 'lesson', date: '2026-08-03', start: '10:00', end: '11:00',
  studentId: 's1', teacherId: 't1', teacherIds: ['t1'], title: 'English',
  branchId: 'branch-a', location: 'Branch A', deliveryMode: 'onsite', room: 'A',
  status: '未上課', paymentStatus: 'unpaid', lessonState: 'active', ...overrides
});
context.db.students = [
  { id: 's1', name: 'Student One' },
  { id: 's2', name: 'Student Two' }
];
context.db.teachers = [
  { id: 't1', name: 'Teacher One' },
  { id: 't2', name: 'Teacher Two' }
];

// Date mapping keeps calendar row + weekday and rejects a missing target row.
assert.equal(context.mapDateByCalendarWeek('2026-08-06', '2026-08', '2026-09'), '2026-09-10');
assert.equal(context.mapDateByCalendarWeek('2026-08-31', '2026-08', '2026-02'), null);

// Gap analysis always presents the selected week as Monday through Sunday.
elements.calendarDate.value = '2026-08-05';
const gapRange = context.teacherGapWeekRange();
assert.equal(gapRange.start, '2026-08-03');
assert.equal(gapRange.end, '2026-08-09');
assert.deepEqual(
  Array.from(context.teacherGapWeekDays(gapRange), day => `${day.label}:${day.date}`),
  ['週一:2026-08-03', '週二:2026-08-04', '週三:2026-08-05', '週四:2026-08-06', '週五:2026-08-07', '週六:2026-08-08', '週日:2026-08-09']
);
const teacherGaps = [];
context.appendTeacherDayGaps([
  { start: '16:00', end: '17:00' },
  { start: '18:00', end: '19:00' }
], 'Teacher One', '2026-08-05', teacherGaps);
assert.deepEqual(Array.from(teacherGaps, gap => `${gap.start}-${gap.end}`), ['09:00-16:00', '17:00-18:00', '19:00-22:00']);
const emptyDayGaps = [];
context.appendTeacherDayGaps([], 'Teacher One', '2026-08-06', emptyDayGaps);
assert.deepEqual(Array.from(emptyDayGaps, gap => `${gap.start}-${gap.end}`), ['09:00-22:00'], 'a day without lessons is entirely available');
const overlapGaps = [];
context.appendTeacherDayGaps([{ start: '10:00', end: '12:00' }, { start: '11:00', end: '13:00' }], 'Teacher One', '2026-08-07', overlapGaps);
assert.deepEqual(Array.from(overlapGaps, gap => `${gap.start}-${gap.end}`), ['09:00-10:00', '13:00-22:00'], 'overlapping lessons are merged before finding gaps');

// Gap analysis is driven only by the selected week and teacher, never by unrelated calendar filters.
context.db.lessons = [
  lesson({ id: 'gap-t1', date: '2026-08-03' }),
  lesson({ id: 'gap-t2', date: '2026-08-04', teacherId: 't2', teacherIds: ['t2'], studentId: 's2', location: 'Other', room: 'B' }),
  lesson({ id: 'gap-outside', date: '2026-08-10', teacherId: 't2', teacherIds: ['t2'] }),
  lesson({ id: 'gap-cancelled', date: '2026-08-05', teacherId: 't2', teacherIds: ['t2'], status: '取消' }),
  lesson({ id: 'gap-draft', date: '2026-08-06', teacherId: 't2', teacherIds: ['t2'], isDraft: true })
];
elements.calendarTeacherFilter.value = '';
assert.deepEqual(Array.from(context.teacherGapAnalysisLessons(gapRange), row => row.id), ['gap-t1', 'gap-t2', 'gap-draft'], 'all-teacher gap analysis uses every scheduled lesson in the selected week');
assert.deepEqual(Array.from(context.teacherGapAnalysisTeachers(context.teacherGapAnalysisLessons(gapRange)), row => row.id), ['t1', 't2'], 'all-teacher mode includes every teacher');
elements.calendarTeacherFilter.value = 't2';
assert.deepEqual(Array.from(context.teacherGapAnalysisLessons(gapRange), row => row.id), ['gap-t2', 'gap-draft'], 'switching teachers switches the entire gap dataset');
assert.deepEqual(Array.from(context.teacherGapAnalysisTeachers(context.teacherGapAnalysisLessons(gapRange)), row => row.id), ['t2'], 'single-teacher mode includes only that teacher');
elements.calendarTeacherFilter.value = 't1';

// Ending multi-selection also closes an open calendar context menu.
context.selectedLessonIds.add('selected-card');
context.selectionMode = true;
elements.calendarContextMenu.classList.add('show');
context.toggleSelectionMode(false);
assert.equal(elements.calendarContextMenu.classList.contains('show'), false, 'context menu closes when multi-selection ends');

// Clipboard copy intersects even a stale mixed selection with the active teacher scope.
context.db.lessons = [
  lesson({ id: 'clipboard-t1' }),
  lesson({ id: 'clipboard-t2', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.selectedLessonIds = new Set(['clipboard-t1', 'clipboard-t2']);
context.selectionMode = true;
assert.equal(context.copyCurrentSelection(), true);
assert.deepEqual(Array.from(context.getLessonClipboard(), row => row.teacherId), ['t1'], 'clipboard excludes lessons outside the active teacher');

// The real paste operation lands immediately, keeps relative offsets, and schedules one save.
context.contextPasteTarget = { date: '2026-08-10', time: '13:00' };
const savesBeforePaste = context.saves;
context.contextPasteLessons();
const pastedLessons = context.db.lessons.filter(row => row.date === '2026-08-10');
assert.equal(pastedLessons.length, 1, 'paste adds the lesson to the local calendar immediately');
assert.equal(pastedLessons[0].start, '13:00');
assert.equal(pastedLessons[0].end, '14:00');
assert.equal(pastedLessons[0].teacherId, 't1', 'paste remains in the active teacher scope');
assert.equal(context.saves, savesBeforePaste + 1, 'paste schedules exactly one persistence operation');

// A batch made from the current teacher selection leaves every other teacher untouched.
context.db.lessons = [
  lesson({ id: 'batch-t1' }),
  lesson({ id: 'batch-t2', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.selectedLessonIds = new Set(['batch-t1']);
const batchCandidates = context.buildBatchCandidates();
assert.equal(batchCandidates.length, 1);
assert.equal(batchCandidates[0].old.teacherId, 't1');
assert.equal(batchCandidates[0].next.date, '2026-08-10');
assert.equal(context.db.lessons.find(row => row.id === 'batch-t2').date, '2026-08-03', 'batch preview does not touch another teacher');

// The actual marquee controller preserves the fixed first-drag selection behavior.
const marqueeSource = fs.readFileSync(path.join(root, 'js/modules/calendar/marquee-multi-selection.js'), 'utf8');
assert.match(marqueeSource, /state\.x=event\.clientX;state\.y=event\.clientY;/, 'marquee uses the pointer-up coordinates');
assert.match(marqueeSource, /if\(!state\.additive\)selectedLessonIds\.clear\(\)/, 'a normal marquee replaces the previous selection');

// Week copy must remain inside the currently selected teacher scope.
context.db.lessons = [
  lesson({ id: 'week-t1' }),
  lesson({ id: 'week-t2', date: '2026-08-04', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.copyVisibleWeekToNextWeek();
const weekCopies = context.db.lessons.filter(row => row.date >= '2026-08-10' && row.date <= '2026-08-16');
assert.deepEqual(weekCopies.map(row => row.teacherId), ['t1'], 'week copy excludes other teachers');
assert.equal(weekCopies[0].date, '2026-08-10', 'week copy shifts exactly seven days');

// Selected week copy must also intersect the selection with the teacher scope.
context.db.lessons = [
  lesson({ id: 'selected-t1' }),
  lesson({ id: 'selected-t2', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.selectedLessonIds = new Set(['selected-t1', 'selected-t2']);
context.copyVisibleWeekToNextWeek();
assert.deepEqual(
  context.db.lessons.filter(row => row.date === '2026-08-10').map(row => row.teacherId),
  ['t1'],
  'selected week copy cannot include a selected lesson from another teacher'
);

// Whole-month copy must only copy the selected teacher.
context.db.lessons = [
  lesson({ id: 'month-t1', date: '2026-08-06' }),
  lesson({ id: 'month-t2', date: '2026-08-07', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.copyMonth('2026-08');
const monthCopies = context.db.lessons.filter(row => row.date.startsWith('2026-09'));
assert.deepEqual(monthCopies.map(row => row.teacherId), ['t1'], 'month copy excludes other teachers');
assert.equal(monthCopies[0].date, '2026-09-10', 'month copy preserves calendar row and weekday');

// Selected-to-next-month copy follows the same teacher boundary.
context.db.lessons = [
  lesson({ id: 'selection-t1', date: '2026-08-06' }),
  lesson({ id: 'selection-t2', date: '2026-08-07', studentId: 's2', teacherId: 't2', teacherIds: ['t2'] })
];
context.selectedLessonIds = new Set(['selection-t1', 'selection-t2']);
context.copySelectedLessons();
assert.deepEqual(
  context.db.lessons.filter(row => row.date.startsWith('2026-09')).map(row => row.teacherId),
  ['t1'],
  'selected month copy cannot cross the active teacher scope'
);

// Conflict boundaries: blank dates and adjacent slots are allowed; real student/room overlaps block.
context.db.lessons = [lesson({ id: 'existing' })];
assert.equal(context.conflictDetail(lesson({ id: 'blank-date', date: '2026-08-04' }), ''), null, 'different date is not a conflict');
assert.equal(context.conflictDetail(lesson({ id: 'adjacent', start: '11:00', end: '12:00' }), ''), null, 'adjacent time is not a conflict');
assert.equal(context.conflictDetail(lesson({ id: 'student-hit', start: '10:30', end: '11:30' }), '').type, '學生', 'same student overlap blocks');
assert.equal(
  context.conflictDetail(lesson({ id: 'room-hit', studentId: 's2', start: '10:30', end: '11:30' }), '').type,
  '教室',
  'same onsite room overlap blocks'
);
assert.equal(
  context.conflictDetail(lesson({ id: 'free', studentId: 's2', room: 'B', start: '10:30', end: '11:30' }), ''),
  null,
  'different student and room is allowed'
);
context.db.lessons[0].status = '取消';
assert.equal(context.conflictDetail(lesson({ id: 'cancelled-slot' }), ''), null, 'cancelled lesson does not block an empty slot');

console.log('PASS: teacher-scoped week/month/selection copy, calendar date mapping, and conflict boundaries.');
