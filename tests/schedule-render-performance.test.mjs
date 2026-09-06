import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('課表操作先讓出目前輸入，再於下一畫面幀單次重畫並保存且不重畫隱藏頁面',async()=>{
  const [scheduler,persistence,orchestrator,visibilityGuard]=await Promise.all([
    source('../js/modules/calendar/scheduler-ui.js'),
    source('../js/core/data-persistence.js'),
    source('../js/app/render-orchestrator.js'),
    source('../js/modules/calendar/lesson-save-visibility-guard.js')
  ]);
  assert.match(scheduler,/function commitScheduleMutation/);
  assert.match(scheduler,/renderCalendar\(\{deferAnalysis:true\}\)/);
  assert.match(scheduler,/scheduleRenderFrame=requestAnimationFrame\(render\)/);
  assert.match(scheduler,/schedulePersistenceFrame=setTimeout\(persist,0\)/);
  assert.match(scheduler,/lastScheduleRenderMs/);
  assert.match(scheduler,/lastScheduleMutationQueuedAt/);
  assert.match(persistence,/options\.scheduleAction&&calendarSectionIsActive\(\)/);
  assert.match(persistence,/renderCalendar\(\{deferAnalysis:true\}\):renderAll\(\)/);
  assert.match(orchestrator,/function renderVisibleWorkspace/);
  assert.match(orchestrator,/if\(id==='calendar'\)renderCalendar\(\{deferAnalysis:true\}\)/);
  assert.match(visibilityGuard,/clearMismatchedCalendarFilters\(saved\);toast/);
  assert.doesNotMatch(visibilityGuard,/clearMismatchedCalendarFilters\(saved\);window\.renderCalendar/);
});

test('背景分析、健康檢查與相同雲端回條不搶主畫面',async()=>{
  const [scheduler,cloud]=await Promise.all([
    source('../js/modules/calendar/scheduler-ui.js'),
    source('../js/core/firebase-auth-and-cloud-sync.module.js')
  ]);
  assert.match(scheduler,/requestIdleCallback\(run,\{timeout:350\}\)/);
  assert.match(cloud,/function scheduleSyncRecoveryCenterRefresh\(delay=700\)/);
  assert.match(cloud,/visualChange=recordDataHash\(current\)!==recordDataHash\(nextDb\)/);
  assert.match(cloud,/lastScheduleSyncMs/);
 assert.match(cloud,/if\(!visualChange\)\{if\(document\.body\?\.dataset\)document\.body\.dataset\.lastScheduleAckRenderSkipped='true';return\}/);
  assert.match(cloud,/persistCurrentLocalView\(\{defer:true\}\)/);
  assert.doesNotMatch(cloud,/scheduleDailyCloudBackup\(\);renderSyncRecoveryCenter\(\);cloudStatus\('逐筆雲端已確認/);
});

test('新增、複製、批次修改與刪除都走非阻塞課表提交',async()=>{
  const [scheduler,course,batch,features]=await Promise.all([
    source('../js/modules/calendar/scheduler-ui.js'),
    source('../js/modules/calendar/course-operations.js'),
    source('../js/modules/calendar/batch-lesson-operations.js'),
    source('../js/modules/application-and-business-features.js')
  ]);
  assert.match(scheduler,/commitScheduleMutation\('lesson\.copy'\)/);
  assert.match(scheduler,/commitScheduleMutation\('lesson\.delete'\)/);
  assert.match(course,/commitScheduleMutation\(old\?'lesson\.update\.fields':'lesson\.create'\)/);
  assert.match(course,/commitScheduleMutation\('lesson\.delete'\)/);
  assert.match(batch,/commitScheduleMutation\('lesson\.update\.fields'\)/);
  assert.match(features,/commitScheduleMutation\('lesson\.copy'\)/);
  assert.match(features,/function beginScheduleHistory/);
  assert.match(features,/function finishScheduleHistory/);
  assert.doesNotMatch(course,/\bsnapshot\(\)/);
  assert.doesNotMatch(scheduler,/\bsnapshot\(\)/);
  assert.doesNotMatch(batch,/\bsnapshot\(\)/);
});

test('課表撞課顯示只建立一次日期索引，不對每張卡重掃全部課程',async()=>{
  const [scheduler,features]=await Promise.all([
    source('../js/modules/calendar/scheduler-ui.js'),
    source('../js/modules/application-and-business-features.js')
  ]);
  assert.match(scheduler,/function rebuildCalendarTeacherConflictCache/);
  assert.match(scheduler,/const cache=new Map\(\),byDate=new Map\(\)/);
  assert.match(scheduler,/rebuildCalendarTeacherConflictCache\(\)/);
  assert.match(features,/calendarTeacherConflictCache instanceof Map/);
});
