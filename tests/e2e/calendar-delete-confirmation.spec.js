const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

async function openSelection(page){
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'fixture-student',name:'測試學生'}],teachers:[{id:'fixture-teacher',name:'測試老師'}],changes:[],makeups:[],lessons:[{id:'delete-fixture',date:'2026-10-01',start:'10:00',end:'11:00',studentId:'fixture-student',teacherId:'fixture-teacher',branchId:'art_museum',status:'未上課',meta:{updatedAt:new Date('2026-10-01T00:00:00Z')}}]};
  window.__deleteCommits=[];window.__deleteMessages=[];window.toast=message=>window.__deleteMessages.push(message);
  window.commitScheduleMutation=action=>{window.__deleteCommits.push(action);renderCalendar()};
  renderAll();switchTab('calendar');document.getElementById('calendarDate').value='2026-10-01';document.getElementById('calendarMode').value='week';renderCalendar();
 });
 await page.locator('#selectionModeBtn').click();await page.locator('#selectionBar').getByRole('button',{name:'全選目前畫面',exact:true}).click();
 await page.locator('#selectionBar').getByRole('button',{name:'刪除選取',exact:true}).click();await expect(page.locator('#calendarDeleteConfirmation')).toBeVisible();
}

test('delete confirmation is responsive, bounded, cancellable and does not block animation frames',async({page},testInfo)=>{
 const native=[];page.on('dialog',async dialog=>{native.push(dialog.message());await dialog.dismiss()});
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:720});await openSelection(page);
  const dialog=page.locator('#calendarDeleteConfirmation');await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  const layout=await dialog.evaluate(async element=>{
   const times=[];await new Promise(resolve=>{const frame=time=>{times.push(time);times.length===10?resolve():requestAnimationFrame(frame)};requestAnimationFrame(frame)});
   const r=element.getBoundingClientRect(),buttons=[...element.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return{width:b.width,height:b.height,font:getComputedStyle(button).fontSize,overflow:button.scrollWidth>button.clientWidth+1}});
   return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,buttons,frames:times.length};
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);expect(layout.right).toBeLessThanOrEqual(width);expect(layout.top).toBeGreaterThanOrEqual(0);expect(layout.bottom).toBeLessThanOrEqual(720);
  expect(layout.frames).toBe(10);expect(layout.buttons[0]).toEqual(layout.buttons[1]);expect(layout.buttons[0].font).toBe('14px');expect(layout.buttons[0].overflow).toBe(false);
  await page.keyboard.press('Delete');await expect(dialog).toHaveCount(1);
  await page.evaluate(()=>{void deleteSelectedLessons()});await expect(dialog).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath(`delete-confirm-${width}.png`)});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>({count:db.lessons.length,calls:window.__deleteCommits.length}))).toEqual({count:1,calls:0});
 }
 expect(native).toEqual([]);
});

for(const mutation of ['unchanged','key-order','cancel','date-value','record-changed','record-deleted','selection-changed','revoked'])test(`delete confirmation revalidates before commit: ${mutation}`,async({page})=>{
 const native=[];page.on('dialog',async dialog=>{native.push(dialog.message());await dialog.dismiss()});await openSelection(page);
 await page.evaluate(mutation=>{
  if(mutation==='key-order')db.lessons[0]=Object.fromEntries(Object.entries(db.lessons[0]).reverse());
  if(mutation==='record-changed')db.lessons[0].note='遠端修改必須保留';
  if(mutation==='date-value')db.lessons[0].meta.updatedAt=new Date('2026-10-02T00:00:00Z');
  if(mutation==='record-deleted')db.lessons=[];
  if(mutation==='selection-changed')selectedLessonIds.clear();
  if(mutation==='revoked'){window.DanbridgeAccess.setContext({role:'teacher',teacherId:'other',canManageSchedule:false});window.currentCloudRole=()=> 'teacher'}
 },mutation);
 if(mutation==='revoked')expect(await page.evaluate(()=>calendarOwnerCanEdit())).toBe(false);
 await page.locator('#calendarDeleteConfirmation').getByRole('button',{name:mutation==='cancel'?'取消':'刪除 1 堂課',exact:true}).click();await expect(page.locator('#calendarDeleteConfirmation')).toHaveCount(0);
 const result=await page.evaluate(()=>({lessons:db.lessons,calls:window.__deleteCommits,messages:window.__deleteMessages}));
 if(['unchanged','key-order'].includes(mutation)){expect(result.lessons).toHaveLength(0);expect(result.calls).toEqual(['lesson.delete']);await expect(page.locator('#selectionBar')).toBeHidden();await expect(page.locator('#selectionModeBtn')).toHaveText('部分選取')}
 else{expect(result.calls).toHaveLength(0);expect(result.lessons).toHaveLength(mutation==='record-deleted'?0:1);if(mutation==='record-changed')expect(result.lessons[0].note).toBe('遠端修改必須保留');if(mutation==='revoked')expect(native).toEqual(['目前帳號沒有修改課表的權限。']);else if(mutation!=='cancel')expect(result.messages.join('')).toContain('未刪除任何課程')}
});
