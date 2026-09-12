import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('從總覽新增課程或在下一幀前換頁，必須更新實際可見頁面且只保存一次',async()=>{
 const code=await source('../js/modules/calendar/scheduler-ui.js');
 const commit=code.slice(code.indexOf('let schedulePersistenceFrame='),code.indexOf('function updateSelectionCount('));
 for(const [initial,visible] of [['dashboard','dashboard'],['calendar','dashboard'],['dashboard','calendar'],['finance','finance']]){
  const frames=[],timers=[],renders=[],saves=[],document={body:{dataset:{activeSection:initial}}};
  const context={document,Date,performance:{now:()=>0},calendarTeacherConflictCache:new Map(),requestAnimationFrame:fn=>{frames.push(fn);return 1},setTimeout:fn=>{timers.push(fn);return 2},calendarSectionIsActive:()=>document.body.dataset.activeSection==='calendar',renderCalendar:options=>renders.push(['calendar',options]),saveDB:options=>saves.push(options),window:{renderVisibleWorkspace:()=>renders.push([document.body.dataset.activeSection])}};
  vm.createContext(context);vm.runInContext(commit,context);
  context.commitScheduleMutation('lesson.create');context.commitScheduleMutation('lesson.create');
  assert.equal(renders.length,0);assert.equal(frames.length,1);
  document.body.dataset.activeSection=visible;frames.shift()();
  assert.equal(renders.length,1);assert.equal(renders[0][0],visible);assert.equal(saves.length,0);
  timers.shift()();assert.equal(saves.length,1);assert.equal(saves[0].skipRender,true);assert.equal(saves[0].scheduleAction,'lesson.create');
 }
});

test('畫面渲染失敗仍保存已完成的課表操作，不丟失下一步同步',async()=>{
 const code=await source('../js/modules/calendar/scheduler-ui.js');
 const commit=code.slice(code.indexOf('let schedulePersistenceFrame='),code.indexOf('function updateSelectionCount('));
 const frames=[],timers=[],saves=[],errors=[],context={document:{body:{dataset:{activeSection:'dashboard'}}},Date,performance:{now:()=>0},console:{error:(...args)=>errors.push(args)},calendarTeacherConflictCache:null,requestAnimationFrame:fn=>{frames.push(fn);return 1},setTimeout:fn=>{timers.push(fn);return 2},calendarSectionIsActive:()=>false,renderCalendar:()=>{},saveDB:options=>saves.push(options),window:{renderVisibleWorkspace:()=>{throw Error('synthetic render failure')}}};
 vm.createContext(context);vm.runInContext(commit,context);context.commitScheduleMutation('lesson.create');
 assert.doesNotThrow(()=>frames.shift()());assert.equal(timers.length,1);timers.shift()();
 assert.equal(saves.length,1);assert.equal(saves[0].scheduleAction,'lesson.create');assert.equal(errors.length,1);
});

test('實際角色 UI 包裝保留課表延後分析參數、this 與回傳值',async()=>{
 const code=await source('../js/app/v20014-role-responsive-ux.js');
 const calls=[],receiver={},options={deferAnalysis:true},result={rendered:true};
 const document={readyState:'complete',body:{dataset:{}},querySelector:()=>null,querySelectorAll:()=>[]};
 const window={renderCalendar:function(...args){calls.push({receiver:this,args});return result}};
 vm.runInNewContext(code,{window,document});
 assert.equal(window.renderCalendar.call(receiver,options),result);
 assert.equal(calls.length,1);assert.equal(calls[0].receiver,receiver);assert.equal(calls[0].args[0],options);
});

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
