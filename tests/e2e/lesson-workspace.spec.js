const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test.beforeEach(async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');$('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'fixture@example.com'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'a',name:'小安',parent:'王媽媽',rate:600,courseType:'1對1'},{id:'b',name:'小安',parent:'李媽媽',rate:900,courseType:'1對1'},{id:'c',name:'小晴',parent:'陳媽媽',rate:800,courseType:'1對1'},{id:'g',name:'英文團課',isGroupRoster:true,courseType:'團班',groupMemberIds:['c'],billingBranchId:'hexi'}],teachers:[{id:'t',name:'老師'}],lessons:[{id:'l',date:'2026-09-08',start:'16:00',end:'17:00',studentId:'g',groupStudentIds:['a','b'],teacherId:'t',teacherIds:['t'],branchId:'art_museum',location:'美術東四路',room:'教室 1',status:'未上課'}]};
  saveDB=()=>{};renderAll();switchTab('calendar');$('calendarDate').value='2026-09-08';$('calendarMode').value='week';renderCalendar();
 });
});
test('團課懸停讀取本堂學生、不帶費用，角色切換及拖曳隱藏預覽',async({page})=>{
 const card=page.locator('#calendarCanvas [data-id="l"]').first();
 for(const role of ['owner','teacher','branch_manager']){
  await page.evaluate(role=>{window.DanbridgeAccess.setContext({role,teacherId:'t',branchIds:['art_museum']});window.currentCloudRole=()=>role;document.body.dataset.cloudRole=role},role);
  await page.mouse.move(0,0);await card.hover();
  await expect(page.locator('#calendarStudentParentPreview')).toHaveText('英文團課\n學生：小安、小安');
  await expect(page.locator('#calendarStudentParentPreview')).not.toContainText(/600|900|媽媽|小晴/);
 }
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'other'});window.currentCloudRole=()=> 'teacher';document.body.dataset.cloudRole='teacher'});
 await expect(page.locator('#calendarStudentParentPreview')).toHaveCount(0);
 await page.mouse.move(0,0);await card.hover();await expect(page.locator('#calendarStudentParentPreview')).toHaveCount(0);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';document.body.dataset.cloudRole='owner';db.lessons[0].groupStudentIds=['c'];renderCalendar()});
 await card.hover();await expect(page.locator('#calendarStudentParentPreview')).toHaveText('英文團課\n學生：小晴');
 await page.mouse.down();await expect(page.locator('#calendarStudentParentPreview')).toHaveCount(0);await page.mouse.up();
});
test('排課家教團課切換、搜尋、收合名單、建立團課與統一尺寸',async({page},info)=>{
 await page.evaluate(()=>openLessonModal('2026-09-08','17:00'));
 await page.getByRole('tab',{name:'團課',exact:true}).click();
 await expect(page.locator('#lessonNewGroup')).not.toBeVisible();
 await expect(page.locator('#lessonGroupStudents')).not.toBeVisible();
 await page.getByRole('combobox',{name:'搜尋已登記團課',exact:true}).fill('英文');
 await page.locator('#lessonModal .student-select-search-option').filter({hasText:'英文團課'}).click();
 await expect(page.locator('#lessonStudent')).toHaveValue('g');
 await expect(page.locator('#lessonGroupRoster summary')).toHaveText('本堂 1 位學生 · 編輯名單');
 await expect(page.locator('#lessonGroupStudents')).not.toBeVisible();
 await page.locator('#lessonGroupRoster summary').click();
 await expect(page.locator('#lessonGroupStudents input[value="c"]')).toBeChecked();
 await page.locator('#lessonGroupRoster summary').click();
 await page.locator('#lessonWorkspaceAdd').click();
 await page.locator('#lessonNewGroupName').fill('週三新團課');
 await page.getByRole('searchbox',{name:'搜尋新團課學生'}).fill('王媽媽');
 await page.locator('#lessonNewGroupStudents input[value="a"]').check();
 await page.getByRole('searchbox',{name:'搜尋新團課學生'}).fill('李媽媽');
 await page.locator('#lessonNewGroupStudents input[value="b"]').check();
 await page.locator('#lessonNewGroupSave').click();
 await expect(page.locator('#lessonNewGroup')).not.toBeVisible();
 expect(await page.evaluate(()=>student($('lessonStudent').value).groupMemberIds)).toEqual(['a','b']);
 expect(await page.evaluate(()=>db.lessons[0].groupStudentIds)).toEqual(['a','b']);
 await page.getByRole('tab',{name:'家教',exact:true}).click();
 await page.getByRole('combobox',{name:'搜尋學生',exact:true}).fill('英文');
 await expect(page.locator('#lessonModal .student-select-search-option')).toHaveCount(0);
 await page.getByRole('combobox',{name:'搜尋學生',exact:true}).fill('小晴');
 await page.locator('#lessonModal .student-select-search-option').click();
 await expect(page.locator('#lessonStudent')).toHaveValue('c');
 const sizes=await page.evaluate(()=>['lessonDate','startTime','endTime','lessonStudentSearch','lessonWorkspaceAdd','lessonWorkspace-individual','lessonWorkspace-group'].map(id=>{const el=$(id),r=el.getBoundingClientRect();return{id,height:r.height,font:getComputedStyle(el).fontSize,width:r.width,left:r.left,right:r.right}}));
 // Device scaling can produce 48.000061 CSS pixels; a 2px mismatch still fails.
 for(const item of sizes){expect(item.height,item.id).toBeCloseTo(48,2);expect(item.font,item.id).toBe('14px');expect(item.left).toBeGreaterThanOrEqual(0);expect(item.right).toBeLessThanOrEqual(page.viewportSize().width)}
 expect(sizes.at(-1).width).toBeCloseTo(sizes.at(-2).width,2);
 await page.screenshot({path:info.outputPath('compact-lesson.png')});
 await page.evaluate(()=>openLessonModal('2026-09-08','16:00','l'));
 await expect(page.getByRole('tab',{name:'團課',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#lessonGroupRoster summary')).toHaveText('本堂 2 位學生 · 編輯名單');
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'t',canManageSchedule:true});window.currentCloudRole=()=> 'teacher';syncLessonWorkspace()});
 await expect(page.locator('#lessonWorkspaceAdd')).not.toBeVisible();
});
test('共同授課老師框名間距一致，點姓名可勾選且不改主要老師',async({page},info)=>{
 await page.evaluate(()=>{db.teachers.push(...['張毅','aa','Wendy','Maria','德立','Daniel','Ray','Lucas','Catherine'].map((name,i)=>({id:'co-'+i,name})));renderSelects();openLessonModal('2026-09-08','16:00','l')});
 const labels=page.locator('#coTeacherChecks .teacher-check');await expect(labels).toHaveCount(9);
 await labels.filter({hasText:'Wendy'}).click();await expect(page.locator('#coTeacherChecks input[value="co-2"]')).toBeChecked();
 await expect(page.locator('#lessonTeacher')).toHaveValue('t');
 await labels.filter({hasText:'Wendy'}).click();await expect(page.locator('#coTeacherChecks input[value="co-2"]')).not.toBeChecked();
 const measurements=await labels.evaluateAll(elements=>elements.map(label=>{const input=label.querySelector('input'),r=input.getBoundingClientRect(),lr=label.getBoundingClientRect(),text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()),range=document.createRange();range.selectNodeContents(text);const tr=range.getBoundingClientRect();return{height:lr.height,gap:tr.left-r.right,checkboxWidth:r.width,checkboxHeight:r.height,font:getComputedStyle(label).fontSize,left:lr.left,right:lr.right,textRight:tr.right}}));
 for(const row of measurements){expect(row.height).toBeCloseTo(48,2);expect(row.gap).toBeGreaterThanOrEqual(11.9);expect(row.checkboxWidth).toBeCloseTo(18,2);expect(row.checkboxHeight).toBeCloseTo(18,2);expect(row.font).toBe('14px');expect(row.left).toBeGreaterThanOrEqual(0);expect(row.right).toBeLessThanOrEqual(page.viewportSize().width);expect(row.textRight).toBeLessThanOrEqual(row.right)}
 await page.locator('#coTeacherWrap').screenshot({path:info.outputPath('co-teacher-spacing.png')});
});
