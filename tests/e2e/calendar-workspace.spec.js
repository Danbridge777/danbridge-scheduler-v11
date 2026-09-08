const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

async function open(page,role='owner'){
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(role=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.classList.add('hidden');
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden');delete el.dataset.authIsolated});
  const access=role==='aa'?{role:'teacher',email:'aa0966626336@gmail.com',teacherId:'fixture-teacher',canManageSchedule:true}:role==='teacher'?{role:'teacher',teacherId:'fixture-teacher',canManageSchedule:false}:role==='lucas'?{role:'branch_manager',teacherId:'fixture-teacher',branchIds:['art_museum'],readOnly:true}:{role:'owner'};
  window.DanbridgeAccess.setContext(access);window.currentCloudRole=()=>access.role;
  db={...db,students:[{id:'fixture-student',name:'工具列測試'}],teachers:[{id:'fixture-teacher',name:'測試老師'}],lessons:[{id:'workspace-lesson',date:'2026-10-01',start:'10:00',end:'11:00',studentId:'fixture-student',teacherId:'fixture-teacher',branchId:'art_museum',location:'美術東四路',status:'未上課'}]};
  renderAll();switchTab('calendar');document.getElementById('calendarDate').value='2026-10-01';document.getElementById('calendarMode').value='week';renderCalendar();window.DanbridgeRoleResponsive?.apply();
 },role);
}

for(const role of ['owner','aa','teacher','lucas'])test(`${role}: compact toolbar retains role visibility and filter operations`,async({page},testInfo)=>{
 await open(page,role);
 const panel=page.locator('#calendarFilterPanel');await expect(panel).not.toHaveAttribute('open','');
 await expect(page.locator('#calendarSearch')).toBeHidden();
 for(const shortcut of ['Control+k','Meta+k']){
  await page.keyboard.press(shortcut);
  await expect(page.locator('#calendarSearch')).toBeVisible();
  await expect(page.locator('#calendarSearch')).toBeFocused();
  await panel.locator('summary').click();
  await expect(page.locator('#calendarSearch')).toBeHidden();
 }
 await panel.locator('summary').click();await expect(page.locator('#calendarSearch')).toBeVisible();
 await page.locator('#calendarSearch').fill('不存在的課程');await expect(page.locator('#calendarFilterSummary')).toContainText('不存在的課程');await expect(page.locator('#calendarCanvas [data-id]')).toHaveCount(0);
 await panel.locator('summary').click();await expect(page.locator('#calendarFilterSummary')).toContainText('不存在的課程');
 await panel.locator('summary').click();await page.locator('#calendarSearch').fill('');await expect(page.locator('#calendarCanvas [data-id="workspace-lesson"]').first()).toBeVisible();
 const boxes=await page.locator('#calendar .calendar-toolbar-v16').evaluate(toolbar=>{
  const nodes=[...toolbar.querySelectorAll('input,select,button,summary')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const outer=toolbar.getBoundingClientRect();return nodes.map(el=>{const r=el.getBoundingClientRect();return{id:el.id||el.textContent.trim(),kind:el.tagName,fontSize:getComputedStyle(el).fontSize,x:r.x,y:r.y,w:r.width,h:r.height,textOverflow:el.tagName==='BUTTON'&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1),outside:r.left<outer.left-1||r.right>outer.right+1}});
 });
 expect(boxes.filter(b=>b.outside)).toEqual([]);
 expect(boxes.filter(b=>b.textOverflow)).toEqual([]);
 for(const b of boxes.filter(b=>b.kind!=='SUMMARY'))expect(b.fontSize,`${b.id} font size`).toBe('14px');
 for(const b of boxes.filter(b=>b.kind!=='SUMMARY'))expect(Math.abs(b.h-48),`${b.id} must share the 48px control height`).toBeLessThanOrEqual(1);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1,`${a.id} overlaps ${b.id}`).toBe(false)}
 await page.screenshot({path:testInfo.outputPath(`calendar-${role}-filters.png`),fullPage:false});
 await panel.locator('summary').click();await page.locator('#calendar .calendar-workspace-head').scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath(`calendar-${role}.png`),fullPage:false});
 if(role==='owner'||role==='aa'){await expect(page.locator('#calendar .calendar-quick-add')).toBeVisible();await page.locator('#calendar .calendar-quick-add').click();await expect(page.locator('#lessonModal')).toHaveClass(/show/)}
 else{await expect(page.locator('#calendar .calendar-quick-add')).toBeHidden()}
});

test('320–1920px：展開篩選與長搜尋文字仍保持控制項尺寸及頁面邊界',async({page},testInfo)=>{
 test.skip(!['desktop-chromium','desktop-webkit'].includes(testInfo.project.name),'Desktop engines explicitly resize; mobile device presets are covered above.');
 await open(page);
 await expect(page.locator('.v32-insight-card h2')).toHaveText('待辦事項');
 await expect(page.locator('.v32-insight-card')).not.toContainText(/AI|智慧提醒|依目前資料自動整理/);
 await expect(page.locator('#v32Insights')).toHaveCount(1);
 await page.locator('#calendarFilterPanel > summary').click();
 await page.locator('#calendarSearch').fill('很長的家長與學生搜尋名稱，用來確認摘要不會把工具列或頁面撐開');
 for(const width of [320,360,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});
  await expect(page.locator('#courseDrawer')).toBeHidden();
  const state=await page.locator('#calendar .calendar-toolbar-v16').evaluate(toolbar=>{
   const outer=toolbar.getBoundingClientRect();
   const controls=[...toolbar.querySelectorAll('input,select,button')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
   return{viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,invalid:controls.flatMap(el=>{const r=el.getBoundingClientRect();return r.left<outer.left-1||r.right>outer.right+1||Math.abs(r.height-48)>1||(el.tagName==='BUTTON'&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1))?[el.id||el.textContent]:[]})};
  });
  expect(state.scroll,`viewport ${width}`).toBeLessThanOrEqual(state.viewport+1);
  expect(state.invalid,`viewport ${width}`).toEqual([]);
 }
});
