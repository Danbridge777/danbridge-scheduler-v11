#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(root, 'js'), { recursive: true })
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(root, 'js', file));
const source = jsFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');

const expectedTabs = ['dashboard', 'students', 'teachers', 'calendar', 'lessons', 'makeups', 'camps', 'finance', 'data', 'security'];
const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, expectedTabs, 'the owner navigation exposes every expected system module exactly once and in order');
for (const id of expectedTabs) assert.match(html, new RegExp(`<section id="${id}"`), `${id} navigation has a matching section`);

const handlerRoots = new Set();
for (const match of html.matchAll(/on(?:click|change|input|blur|keydown)="([^"]+)"/g)) {
  for (const call of match[1].matchAll(/(?:^|[;{}?:]\s*)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)) handlerRoots.add(call[1]);
}
const browserBuiltins = new Set(['document.getElementById', 'window.print']);
const namespaceContracts = {
  'DanbridgeBranchBusiness.setScope': /window\.DanbridgeBranchBusiness=\{[\s\S]*setScope/,
  'DanbridgeNotifications.close': /window\.DanbridgeNotifications=\{[\s\S]*close/,
  'DanbridgeNotifications.markAllRead': /window\.DanbridgeNotifications=\{[\s\S]*markAllRead/,
  'DanbridgeNotifications.open': /window\.DanbridgeNotifications=\{[\s\S]*open/,
  'DanbridgeNotifications.setFilter': /window\.DanbridgeNotifications=\{[\s\S]*setFilter/
};
for (const name of [...handlerRoots].sort()) {
  if (browserBuiltins.has(name)) continue;
  if (namespaceContracts[name]) {
    assert.ok(namespaceContracts[name].test(source), `${name} namespace handler exists`);
    continue;
  }
  assert.ok(!name.includes('.'), `unknown inline namespace handler: ${name}`);
  const escaped = name.replace(/[$]/g, '\\$&');
  const contract = new RegExp(`(?:function\\s+${escaped}\\s*\\(|(?:window\\.)?${escaped}\\s*=)`);
  assert.ok(contract.test(source), `${name} inline handler has an implementation`);
}

const requiredContracts = {
  'student CRM': ['saveStudent', 'editStudent', 'deleteStudent', 'studentMatchesCrmFilters', 'studentTeacherIds', 'renderStudents'],
  'teacher management': ['saveTeacher', 'editTeacher', 'deleteTeacher', 'calculateTeacherPayroll', 'renderTeacherKpi'],
  'calendar interactions': ['renderCalendar', 'moveLessonTo', 'copyVisibleWeekToNextWeek', 'copyMonth', 'toggleSelectionMode', 'buildBatchCandidates'],
  'lesson execution': ['saveLesson', 'lessonBlocksScheduling', 'markMonthLessonsCompleted', 'openCourseDrawer'],
  'makeups': ['renderMakeups', 'scheduleMakeup', 'finishMakeup', 'completeMakeupForLesson', 'cancelOpenMakeupForSourceLesson'],
  'summer and winter camps': ['previewCamp', 'createCampSeries', 'previewWinterCamp', 'createWinterCampSeries', 'saveSummerRegistration'],
  'finance and settlement': ['financeData', 'renderFinance', 'settlementDataFor', 'renderSettlement', 'createLockedSettlementRecord', 'appendSettlementAdjustment'],
  'notifications': ['buildScheduleNotificationChanges', 'buildNotifications', 'createScheduleNotificationIfMissing'],
  'backup and integrity': ['downloadBackup', 'importBackup', 'renderDataIntegrity', 'repairDataIntegrity'],
  'undo and redo': ['snapshot', 'undoLast', 'redoLast'],
  'authentication and role isolation': ['filteredTeacherDB', 'filteredBranchDB', 'applyRoleUI', 'roleAccessSignature']
};
for (const [feature, names] of Object.entries(requiredContracts)) {
  for (const name of names) {
    const escaped = name.replace(/[$]/g, '\\$&');
    assert.ok(new RegExp(`(?:function\\s+${escaped}\\s*\\(|(?:window\\.)?${escaped}\\s*=)`).test(source), `${feature}: ${name} exists`);
  }
}

const scriptOrder = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
const before = (first, second) => assert.ok(scriptOrder.indexOf(first) >= 0 && scriptOrder.indexOf(first) < scriptOrder.indexOf(second), `${first} loads before ${second}`);
before('./js/modules/business/business-logic.js', './js/core/branch-business-scope.js');
before('./js/core/branch-business-scope.js', './js/modules/teachers/teacher-kpi.js');
before('./js/app/render-orchestrator.js', './js/core/firebase-auth-and-cloud-sync.module.js');
before('./js/core/firebase-auth-and-cloud-sync.module.js', './js/app/v20014-role-responsive-ux.js');

console.log(`PASS: ${expectedTabs.length} modules, ${handlerRoots.size} inline handlers, ${Object.keys(requiredContracts).length} feature groups, and critical load order.`);
