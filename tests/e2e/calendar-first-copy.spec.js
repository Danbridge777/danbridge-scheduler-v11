const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

// Isolated identity/data; mouse and keyboard exercise the actual calendar UI.
async function openCalendarFixture(page){
  await isolateApplicationAuth(page);
  await page.goto('/index.html',{waitUntil:'load'});
  await page.evaluate(()=>{
    document.body.classList.remove('auth-locked');
    document.getElementById('authScreen')?.classList.add('hidden');
    document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden');delete el.dataset.authIsolated});
    window.DanbridgeAccess.setContext({role:'owner',email:'copy-test@example.com'});
    window.currentCloudRole=()=> 'owner';
    db={...db,students:[{id:'copy-student',name:'Copy fixture'}],teachers:[{id:'copy-teacher',name:'Test teacher'}],lessons:[{id:'first-copy',studentId:'copy-student',teacherId:'copy-teacher',teacherIds:['copy-teacher'],date:'2026-09-08',start:'10:00',end:'11:00',title:'Copy fixture',status:'未上課'}]};
    window.renderAll();window.switchTab('calendar');
    document.getElementById('calendarMode').value='month';
    document.getElementById('calendarDate').value='2026-09-08';
    window.renderCalendar();
  });
}
test.beforeEach(async({page})=>openCalendarFixture(page));

for(const shortcut of ['Control+c','Meta+c'])test(`first ${shortcut} after search and marquee copies immediately`,async({page})=>{
  const card=page.locator('#calendarCanvas [data-id="first-copy"]').first();
  await expect(card).toBeVisible();
  await page.locator('#calendarSearch').focus();
  await card.scrollIntoViewIfNeeded();
  const box=await card.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y-3);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:5});
  await page.mouse.up();
  await expect(card).toHaveClass(/selected/);
  await page.keyboard.press(shortcut);
  await expect(page.locator('#pasteModeBanner')).toHaveClass(/show/);
  expect(await page.evaluate(()=>getLessonClipboard().map(row=>row.id))).toEqual(['first-copy']);
});

test('repeated scheduler selections copy while ordinary teacher stays read-only',async({page,browserName})=>{
  await page.evaluate(()=>{
    window.DanbridgeAccess.setContext({role:'teacher',email:'scheduler@example.com',teacherId:'copy-teacher',canManageSchedule:true});
    window.currentCloudRole=()=> 'teacher';
    document.body.dataset.cloudRole='teacher';
  });
  const card=page.locator('#calendarCanvas [data-id="first-copy"]').first();
  for(let attempt=0;attempt<3;attempt++){
    await page.locator('#calendarSearch').focus();
    await card.click({modifiers:[browserName==='webkit'?'Meta':'Control']});
    await expect(card).toHaveClass(/selected/);
    await page.keyboard.press('Control+c');
    await expect(page.locator('#pasteModeBanner')).toHaveClass(/show/);
    expect(await page.evaluate(()=>getLessonClipboard().map(row=>row.id))).toEqual(['first-copy']);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>{
    cancelPasteClickMode(true);
    window.DanbridgeAccess.setContext({role:'teacher',email:'teacher@example.com',teacherId:'copy-teacher',canManageSchedule:false});
    document.body.classList.remove('scheduler-cloud-role');
  });
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(()=>getLessonClipboard())).toEqual([]);
  expect(await page.evaluate(()=>db.lessons.map(row=>row.id))).toEqual(['first-copy']);
});

test('copy inside editable text is not consumed by the calendar',async({page})=>{
  await page.evaluate(()=>{
    selectedLessonIds.add('first-copy');
    window.__copyKeys=[];
    document.addEventListener('keydown',event=>{
      if(event.key.toLowerCase()==='c')window.__copyKeys.push({prevented:event.defaultPrevented,target:event.target.id});
    });
  });
  await page.locator('#calendarSearch').fill('Copy fixture');
  await page.keyboard.press('Control+c');
  const result=await page.evaluate(()=>({events:window.__copyKeys,copied:getLessonClipboard()}));
  expect(result.events).toEqual([{prevented:false,target:'calendarSearch'}]);
  expect(result.copied).toEqual([]);
});

for(const mode of ['month','week'])test(`parent hover uses student IDs for duplicate names in ${mode}`,async({page},testInfo)=>{
  await page.evaluate(mode=>{
    db.students=[{id:'copy-student',name:'同名學生',parent:'王媽媽 <img src=x onerror=alert(1)>'},{id:'other-student',name:'同名學生',parent:'陳爸爸'}];
    db.lessons.push({...db.lessons[0],id:'second-copy',studentId:'other-student',date:'2026-09-09'});
    renderSelects();document.getElementById('calendarMode').value=mode;renderCalendar();
  },mode);
  for(const [id,parent] of [['first-copy','王媽媽 <img src=x onerror=alert(1)>'],['second-copy','陳爸爸']]){
    await page.locator(`#calendarCanvas [data-id="${id}"]`).first().hover();
    await expect(page.locator('#calendarStudentParentPreview')).toHaveText(`同名學生\n家長：${parent}`);
    await expect(page.locator('#calendarStudentParentPreview img')).toHaveCount(0);
  }
  const bounds=await page.locator('#calendarStudentParentPreview').boundingBox();
  const viewport=page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({path:testInfo.outputPath('parent-preview.png')});
  await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'copy-teacher',canManageSchedule:false});window.currentCloudRole=()=> 'teacher'});
  await expect(page.locator('#calendarStudentParentPreview')).toHaveCount(0);
  await page.locator('#calendarCanvas [data-id="first-copy"]').first().hover();
  await expect(page.locator('#calendarStudentParentPreview')).toHaveCount(0);
});

test('parent preview follows selected student and drawer; missing parents never match by name',async({page})=>{
  await page.evaluate(()=>{
    db.students=[{id:'copy-student',name:'同名學生',parent:''},{id:'other-student',name:'同名學生',parent:'陳爸爸'}];
    renderSelects();document.getElementById('calendarStudentFilter').value='copy-student';
  });
  await page.locator('#calendarStudentFilter').hover();
  await expect(page.locator('#calendarStudentParentPreview')).toHaveText('同名學生\n家長：尚未填寫');
  await page.locator('#calendarStudentFilter').selectOption('other-student');
  await expect(page.locator('#calendarStudentParentPreview')).toHaveText('同名學生\n家長：陳爸爸');
  await page.evaluate(()=>openCourseDrawer('first-copy'));
  await page.locator('#courseDrawerTitle').hover();
  await expect(page.locator('#calendarStudentParentPreview')).toHaveText('同名學生\n家長：尚未填寫');
});

test('first Command+C remains ready after reload and repeated eight-lesson selections',async({page})=>{
  for(let visit=0;visit<2;visit++){
    if(visit)await openCalendarFixture(page);
    await page.evaluate(()=>{
      const base=db.lessons[0];
      db.lessons=Array.from({length:8},(_,i)=>({...base,id:`copy-${i}`,date:`2026-09-${String(7+i).padStart(2,'0')}`}));
      renderCalendar();
    });
    for(let attempt=0;attempt<3;attempt++){
      await page.locator('#calendarSearch').focus();
      for(let i=0;i<8;i++)await page.locator(`#calendarCanvas [data-id="copy-${i}"]`).first().click({modifiers:['Meta']});
      expect(await page.evaluate(()=>selectedLessonIds.size)).toBe(8);
      await page.keyboard.press('Meta+c');
      await expect(page.locator('#pasteModeBanner')).toHaveClass(/show/);
      expect(await page.evaluate(()=>getLessonClipboard().map(row=>row.id).sort())).toEqual(Array.from({length:8},(_,i)=>`copy-${i}`));
      expect(await page.evaluate(()=>db.lessons.length)).toBe(8);
      await page.keyboard.press('Escape');
    }
  }
});

test('new lesson fills exact student schedule, never copies payment or overwrites edited lessons',async({page})=>{
  await page.evaluate(()=>{
    db.students=[{id:'copy-student',name:'同名',preferredTeacherId:'preferred',branchIds:['hexi'],homeAddress:'學生最新地址',courseType:'1對1'},{id:'other',name:'同名',preferredTeacherId:'copy-teacher',branchIds:['art_museum']}];
    db.teachers.push({id:'preferred',name:'Preferred teacher'});
    db.lessons=[{...db.lessons[0],date:'2026-09-01',start:'10:00',end:'11:30',branchId:'hexi',deliveryMode:'onsite',room:'教室 2',title:'英文',paymentStatus:'paid',status:'已上課',note:'不要複製的回報'},
      {...db.lessons[0],id:'cancelled',date:'2026-09-07',status:'取消',room:'錯誤教室'},
      {...db.lessons[0],id:'same-name',studentId:'other',date:'2026-09-07',title:'不可混入的課'}];
    window.__beforeAutofill=JSON.stringify(db.lessons);
    openLessonModal('2026-09-08','16:00');
  });
  await page.locator('#lessonStudent').selectOption('copy-student');
  await expect(page.locator('#lessonTeacher')).toHaveValue('preferred');
  await expect(page.locator('#lessonBranch')).toHaveValue('hexi');
  await expect(page.locator('#lessonRoom')).toHaveValue('教室 2');
  await expect(page.locator('#lessonTitle')).toHaveValue('英文');
  await expect(page.locator('#startTime')).toHaveValue('16:00');
  await expect(page.locator('#endTime')).toHaveValue('17:30');
  await expect(page.locator('#lessonDate')).toHaveValue('2026-09-08');
  await expect(page.locator('#paymentStatus')).toHaveValue('unpaid');
  await expect(page.locator('#lessonStatus')).toHaveValue('未上課');
  await expect(page.locator('#lessonNote')).toHaveValue('');
  await expect(page.locator('#lessonStudentDefaultsHint')).toContainText('2026-09-01');
  await page.evaluate(()=>{closeLessonModal();openLessonModal('2026-09-01','10:00','first-copy')});
  await expect(page.locator('#lessonTeacher')).toHaveValue('copy-teacher');
  await expect(page.locator('#paymentStatus')).toHaveValue('paid');
  await expect(page.locator('#lessonNote')).toHaveValue('不要複製的回報');
  expect(await page.evaluate(()=>JSON.stringify(db.lessons)===window.__beforeAutofill)).toBe(true);
});

test('switching new students clears old location and uses the selected home address',async({page})=>{
  await page.evaluate(()=>{
    db.students=[{id:'copy-student',name:'A',branchIds:['hexi'],homeAddress:'A 最新住址'},{id:'other',name:'B',branchIds:['art_museum'],courseType:'1對1'}];
    db.lessons[0]={...db.lessons[0],date:'2026-09-01',branchId:'hexi',deliveryMode:'home',address:'A 舊地址',meetingUrl:'不可外帶',start:'10:00',end:'12:00'};
    openLessonModal('2026-09-08','16:00');
  });
  await page.locator('#lessonStudent').selectOption('copy-student');
  await expect(page.locator('#lessonDeliveryMode')).toHaveValue('home');
  await expect(page.locator('#lessonAddress')).toHaveValue('A 最新住址');
  await page.locator('#lessonStudent').selectOption('other');
  await expect(page.locator('#lessonTeacher')).toHaveValue('');
  await expect(page.locator('#lessonBranch')).toHaveValue('art_museum');
  await expect(page.locator('#lessonRoom')).toHaveValue('');
  await expect(page.locator('#lessonAddress')).toHaveValue('');
  await expect(page.locator('#lessonMeetingUrl')).toHaveValue('');
  await expect(page.locator('#endTime')).toHaveValue('17:00');
});
