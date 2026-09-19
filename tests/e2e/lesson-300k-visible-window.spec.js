const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

test('300,000 lessons keep visible-week rendering and ten incremental changes bounded',async({page},testInfo)=>{
  test.skip(!['desktop-chromium','desktop-webkit'].includes(testInfo.project.name),'30 萬筆桌面瀏覽器容量驗收');
  test.setTimeout(120_000);
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.DanbridgeLessonIndex&&typeof renderCalendar==='function');
  const result=await page.evaluate(async()=>{
    document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
    window.DanbridgeAccess.setContext({role:'owner',email:'capacity@example.test',canManageSchedule:true});window.currentCloudRole=()=> 'owner';
    const students=Array.from({length:1200},(_,index)=>({id:`s-${index}`,name:`容量學生 ${index}`,parent:`家長 ${index}`,courseType:'1對1',rate:800,billingBranchId:index%2?'hexi':'art_museum'}));
    const teachers=Array.from({length:40},(_,index)=>({id:`t-${index}`,name:`容量老師 ${index}`,rate:600,workDays:[1,2,3,4,5]}));
    const first=Date.UTC(2026,0,1),day=86400000;
    const lessons=Array.from({length:300000},(_,index)=>{const date=new Date(first+(index%3650)*day).toISOString().slice(0,10),hour=8+index%12;return{id:`l-${index}`,studentId:`s-${index%1200}`,teacherId:`t-${index%40}`,teacherIds:[`t-${index%40}`],date,start:`${String(hour).padStart(2,'0')}:00`,end:`${String(hour+1).padStart(2,'0')}:00`,branchId:index%2?'hexi':'art_museum',billingBranchId:index%2?'hexi':'art_museum',location:index%2?'河西一路':'美術東四路',room:`R${index%8}`,status:'未上課',paymentStatus:'unpaid',lessonState:'active',isDraft:false}});
    db={...db,students,teachers,lessons};
    const buildStart=performance.now(),stats=window.DanbridgeLessonIndex.rebuild(db.lessons),buildMs=performance.now()-buildStart;
    $('calendarMode').value='week';$('calendarDate').value='2026-01-05';
    const firstRenderStart=performance.now();renderCalendar({deferAnalysis:true});const firstRenderMs=performance.now()-firstRenderStart,visibleCards=document.querySelectorAll('#calendarCanvas .week-event').length;
    const ids=db.lessons.slice(0,10).map(row=>row.id),token=beginScheduleHistory(ids);
    for(let index=0;index<10;index++){const row=db.lessons[index];row.date='2026-01-06';row.start=`${String(8+index).padStart(2,'0')}:30`;row.end=`${String(9+index).padStart(2,'0')}:30`}
    const patchStart=performance.now();finishScheduleHistory(token,ids);const patchMs=performance.now()-patchStart;
    const rerenderStart=performance.now();renderCalendar({deferAnalysis:true});const rerenderMs=performance.now()-rerenderStart;
    $('lessonArchiveRangeMode').value='custom';syncLessonArchiveRangeControls();$('lessonArchiveFrom').value='2026-01-01';$('lessonArchiveTo').value='2026-12-31';const custom=selectedLessonArchiveRange();
    $('lessonArchiveRangeMode').value='month';syncLessonArchiveRangeControls();$('lessonArchiveMonth').value='2026-01';const month=selectedLessonArchiveRange();
    $('lessonArchiveRangeMode').value='year';syncLessonArchiveRangeControls();$('lessonArchiveMonth').value='2026';const year=selectedLessonArchiveRange();
    $('lessonArchiveRangeMode').value='all';syncLessonArchiveRangeControls();const all=selectedLessonArchiveRange(),archive=completeLessonArchiveSheets(all.rows,all),workbook=await window.DanbridgeXlsx.createWorkbook({sheets:archive.sheets}),courseRows=workbook.rowCounts.slice(3).reduce((sum,count)=>sum+count,0);
    return{stats,buildMs,firstRenderMs,patchMs,rerenderMs,visibleCards,updated:window.DanbridgeLessonIndex.byDate(db.lessons,'2026-01-06').filter(row=>ids.includes(row.id)).length,lessonCount:db.lessons.length,range:{monthCount:month.rows.length,monthLabel:month.label,yearCount:year.rows.length,yearLabel:year.label,customCount:custom.rows.length,customLabel:custom.label,allCount:all.rows.length},excel:{sheetCount:workbook.sheetNames.length,courseRows,bytes:workbook.blob.size,checksum:archive.checksum}};
  });
  expect(result.lessonCount).toBe(300000);expect(result.stats.lessonCount).toBe(300000);expect(result.updated).toBe(10);expect(result.visibleCards).toBeGreaterThan(400);expect(result.range.monthCount).toBeGreaterThan(2400);expect(result.range.monthCount).toBeLessThan(2700);expect(result.range.monthLabel).toBe('2026-01 月');expect(result.range.yearCount).toBeGreaterThan(29000);expect(result.range.yearCount).toBeLessThan(31000);expect(result.range.yearLabel).toBe('2026 年');expect(result.range.customCount).toBe(result.range.yearCount);expect(result.range.customLabel).toBe('2026-01-01 至 2026-12-31');expect(result.range.allCount).toBe(300000);expect(result.excel.sheetCount).toBe(9);expect(result.excel.courseRows).toBe(300000);expect(result.excel.bytes).toBeGreaterThan(1_000_000);expect(result.excel.checksum).toContain('-300000');
  expect(result.buildMs).toBeLessThan(5000);expect(result.firstRenderMs).toBeLessThan(2500);expect(result.patchMs).toBeLessThan(150);expect(result.rerenderMs).toBeLessThan(1000);
  await testInfo.attach('lesson-300k-visible-window.json',{body:JSON.stringify({engine:testInfo.project.name,...result},null,2),contentType:'application/json'});
});
