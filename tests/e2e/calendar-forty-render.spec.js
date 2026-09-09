const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
// Playwright trace DOM/screenshot capture is useful for functional debugging,
// but must not be included in a frame-time measurement of the application.
test.use({trace:'off'});

test('40 堂實際批次按鈕連續操作：畫面量測與資料順序（隔離傳輸，非雲端延遲證據）',async({page},testInfo)=>{
 test.setTimeout(90000);
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';
  const lesson={studentId:'render-student',teacherId:'render-teacher',teacherIds:['render-teacher'],branchId:'art_museum',location:'美術東四路',room:'教室 1',status:'未上課',paymentStatus:'unpaid'};
  db={...db,students:[{id:'render-student',name:'隔離畫面測試',courseType:'1對1',rate:600}],teachers:[{id:'render-teacher',name:'測試老師'}],lessons:Array.from({length:40},(_,i)=>({...lesson,id:'render-'+i,date:`2026-10-${String(5+Math.floor(i/8)).padStart(2,'0')}`,start:String(8+i%8).padStart(2,'0')+':00',end:String(8+i%8).padStart(2,'0')+':30'})),changes:[]};
  db.lessons.push(...Array.from({length:3000},(_,i)=>({...lesson,id:'archived-render-'+i,date:new Date(Date.UTC(2010,0,i+1)).toISOString().slice(0,10),start:'08:00',end:'08:30'})));
  window.saveDB=()=>{}; // No Firebase or formal records; UI timing only.
  renderAll();switchTab('calendar');document.getElementById('calendarDate').value='2026-10-05';document.getElementById('calendarMode').value='week';renderCalendar();
  window.__renderProfiles=[];
  window.__renderLongTasks=[];
  if(window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
   window.__renderLongTaskObserver=new PerformanceObserver(list=>window.__renderLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration}))));
   window.__renderLongTaskObserver.observe({type:'longtask'});
  }
  for(const name of ['renderCalendar','renderWeek','renderCalendarAnalysis','rebuildCalendarTeacherConflictCache','attachDragHandlers','renderSelects','buildBatchCandidates']){
   const original=window[name];if(typeof original!=='function')continue;
   window[name]=function(...args){const started=performance.now();try{return original.apply(this,args)}finally{window.__renderProfiles.push({name,ms:performance.now()-started})}};
  }
  window.__renderFrames=[];window.__renderMarks=[];let last=0;const tick=now=>{if(last)window.__renderFrames.push(now-last);last=now;window.__renderRaf=requestAnimationFrame(tick)};window.__renderRaf=requestAnimationFrame(tick);
 });
 const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});
 for(let round=0;round<6;round++){
  await page.locator('#selectionModeBtn').click();await page.locator('#selectionBar').getByRole('button',{name:'全選目前畫面',exact:true}).click();
  await expect(page.locator('#selectionCount')).toContainText('40');
  await page.locator('#selectionBar').getByRole('button',{name:'批次調整',exact:true}).click();await page.locator('#batchTimeShift').selectOption('30');
  await page.locator('#batchModal').getByRole('button',{name:'預覽',exact:true}).click();await expect(page.locator('#batchPreview')).toContainText('可套用 40 堂');
  await page.evaluate(()=>window.__renderActionStart=performance.now());
  await page.locator('#batchModal').getByRole('button',{name:'確認套用',exact:true}).click();
  await expect(page.locator('#batchModal')).not.toHaveClass(/show/);
  const state=await page.evaluate(()=>{window.__renderMarks.push(performance.now()-window.__renderActionStart);return{count:db.lessons.length,ids:new Set(db.lessons.map(l=>l.id)).size,first:db.lessons.find(l=>l.id==='render-0').start,paid:db.lessons.map(l=>l.paymentStatus)}});
  expect(state.count).toBe(3040);expect(state.ids).toBe(3040);expect(state.first).toBe(`${String(8+Math.floor((round+1)/2)).padStart(2,'0')}:${(round+1)%2?'30':'00'}`);expect(state.paid.every(v=>v==='unpaid')).toBe(true);
 }
 expect(dialogs).toEqual([]);
 const timing=await page.evaluate(()=>{cancelAnimationFrame(window.__renderRaf);window.__renderLongTaskObserver?.disconnect();const frames=window.__renderFrames.sort((a,b)=>a-b);return{samples:frames.length,medianFrameMs:frames[Math.floor(frames.length/2)],p95FrameMs:frames[Math.ceil(frames.length*.95)-1],maxFrameMs:frames.at(-1),automationActionMs:window.__renderMarks,profiles:window.__renderProfiles,longTasks:window.__renderLongTasks}});
 console.log('ISOLATED_BROWSER_40_FRAME_MEASUREMENTS '+JSON.stringify({project:testInfo.project.name,...timing}));
 await testInfo.attach('frame-measurements',{body:JSON.stringify(timing,null,2),contentType:'application/json'});
 // Do not assert 120 Hz on a 60 Hz/headless device, and never call this a
 // production cloud synchronization measurement.
 expect(timing.samples).toBeGreaterThan(0);
});
