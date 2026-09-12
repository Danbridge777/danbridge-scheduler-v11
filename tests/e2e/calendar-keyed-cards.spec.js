const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test.beforeEach(async({page},info)=>{
 const mobile=page.viewportSize().width<=700;
 test.skip(info.title.startsWith('mobile agenda:')?!mobile:mobile,
  '桌機 keyed grid 與手機 agenda 使用不同 DOM；各自由相對應案例驗證，不把 null 節點當成重用成功');
});
async function openCalendar(page){
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'s',name:'測試學生',parent:'測試家長'}],teachers:[{id:'t',name:'測試老師'}],changes:[],makeups:[],lessons:['a','b'].map((id,index)=>({id,date:'2026-10-05',start:index?'12:00':'10:00',end:index?'13:00':'11:00',studentId:'s',teacherId:'t',branchId:'art_museum',status:'未上課'}))};
  window.__keyedWrites=[];window.commitScheduleMutation=action=>{window.__keyedWrites.push(action);renderCalendar({deferAnalysis:true})};
  renderAll();switchTab('calendar');document.getElementById('calendarDate').value='2026-10-05';document.getElementById('calendarMode').value='week';renderCalendar({deferAnalysis:true});
  window.__keyedOriginal={a:document.querySelector('#calendarCanvas [data-id="a"]'),b:document.querySelector('#calendarCanvas [data-id="b"]'),slot:document.querySelector('#calendarCanvas .time-slot')};
 });
}
test('week rerenders preserve cards/time cells, exact ordering, refreshed content and one click handler',async({page})=>{
 await openCalendar(page);
 await page.evaluate(()=>{for(let i=0;i<12;i++)renderCalendar({deferAnalysis:true})});
 expect(await page.evaluate(()=>({a:window.__keyedOriginal.a===document.querySelector('#calendarCanvas [data-id="a"]'),slot:window.__keyedOriginal.slot===document.querySelector('#calendarCanvas .time-slot')}))).toEqual({a:true,slot:true});
 await page.locator('#calendarCanvas [data-id="a"]').click({modifiers:['Meta']});expect(await page.evaluate(()=>[...selectedLessonIds])).toEqual(['a']);
 await page.evaluate(()=>{for(let i=0;i<12;i++)renderCalendar({deferAnalysis:true})});
 await page.locator('#calendarCanvas [data-id="a"]').click({modifiers:['Meta']});expect(await page.evaluate(()=>[...selectedLessonIds])).toEqual([]);
 await page.evaluate(()=>{Object.assign(db.lessons.find(row=>row.id==='b'),{start:'09:00',end:'10:30'});db.students[0].name='新學生名字';renderCalendar({deferAnalysis:true})});
 expect(await page.locator('#calendarCanvas .week-event').evaluateAll(nodes=>nodes.map(node=>node.dataset.id))).toEqual(['b','a']);
 await expect(page.locator('#calendarCanvas [data-id="b"]')).toContainText('09:00–10:30');await expect(page.locator('#calendarCanvas [data-id="b"]')).toContainText('新學生名字');
 expect(await page.evaluate(()=>window.__keyedOriginal.b===document.querySelector('#calendarCanvas [data-id="b"]'))).toBe(true);
 await page.evaluate(()=>{db.lessons=db.lessons.filter(row=>row.id!=='b');db.lessons.push({id:'c',date:'2026-10-06',start:'09:00',end:'10:00',studentId:'s',teacherId:'t',branchId:'art_museum',status:'未上課'});renderCalendar({deferAnalysis:true})});
 await expect(page.locator('#calendarCanvas [data-id="b"]')).toHaveCount(0);expect(await page.evaluate(()=>window.__keyedOriginal.b.isConnected)).toBe(false);
 expect(await page.locator('#calendarCanvas .week-event').evaluateAll(nodes=>nodes.map(node=>node.dataset.id))).toEqual(['a','c']);expect(await page.evaluate(()=>window.__keyedWrites)).toEqual([]);
});
test('retained card rebinding revokes drag handlers and restores exactly one selection handler',async({page})=>{
 await openCalendar(page);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'t',canManageSchedule:false});window.currentCloudRole=()=> 'teacher';attachDragHandlers();attachDragHandlers();dragState=null});
 expect(await page.evaluate(()=>calendarOwnerCanEdit())).toBe(false);await expect(page.locator('#calendarCanvas [data-id="a"]')).toHaveAttribute('draggable','false');
 await page.locator('#calendarCanvas [data-id="a"]').dispatchEvent('dragstart',{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});expect(await page.evaluate(()=>dragState)).toBe(null);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';attachDragHandlers();attachDragHandlers()});
 await page.locator('#calendarCanvas [data-id="a"]').click({modifiers:['Meta']});expect(await page.evaluate(()=>[...selectedLessonIds])).toEqual(['a']);expect(await page.evaluate(()=>window.__keyedWrites)).toEqual([]);
});
test('unchanged retained cards do not churn attributes or children during rerenders',async({page})=>{
 await openCalendar(page);await page.locator('#calendarCanvas [data-id="a"]').click({modifiers:['Meta']});
 const mutations=await page.evaluate(()=>{
  const observer=new MutationObserver(()=>{});for(const card of document.querySelectorAll('#calendarCanvas .week-event'))observer.observe(card,{attributes:true,childList:true,subtree:true});
  for(let i=0;i<12;i++)renderCalendar({deferAnalysis:true});
  const records=observer.takeRecords().map(r=>({type:r.type,attribute:r.attributeName}));observer.disconnect();return records;
 });
 expect(mutations).toEqual([]);expect(await page.evaluate(()=>[...selectedLessonIds])).toEqual(['a']);
});
test('time-only edits retain name and teacher nodes; later student/teacher changes still update content and hover text',async({page})=>{
 await openCalendar(page);
 await page.evaluate(()=>{const card=document.querySelector('#calendarCanvas [data-id="a"]');window.__cardLeaves={time:card.querySelector('.week-event-time'),student:card.querySelector('.week-event-student'),teacher:card.querySelector('.week-event-meta>span')};db.lessons[0].start='10:30';db.lessons[0].end='11:30';renderCalendar({deferAnalysis:true})});
 expect(await page.evaluate(()=>{const card=document.querySelector('#calendarCanvas [data-id="a"]');return{time:window.__cardLeaves.time===card.querySelector('.week-event-time'),student:window.__cardLeaves.student===card.querySelector('.week-event-student'),teacher:window.__cardLeaves.teacher===card.querySelector('.week-event-meta>span'),row:card.style.gridRow}})).toEqual({time:true,student:true,teacher:true,row:'32 / 44'});
 await expect(page.locator('#calendarCanvas [data-id="a"]')).toContainText('10:30–11:30');
 await page.evaluate(()=>{db.students[0].name='新學生 <測試>';db.students[0].parent='新家長';db.teachers[0].name='新老師';db.teachers[0].color='#abcdef';renderCalendar({deferAnalysis:true})});
 const card=page.locator('#calendarCanvas [data-id="a"]');await expect(card).toContainText('新學生 <測試>');await expect(card).toContainText('新老師');await expect(card).toHaveAttribute('title',/新家長/);
 expect(await card.evaluate(node=>node.style.getPropertyValue('--teacher'))).toBe('#abcdef');expect(await card.locator('script, img').count()).toBe(0);
});

test('simulated touch drag is cancelled when edit permission is revoked on a retained card',async({page})=>{
 await openCalendar(page);
 const card=page.locator('#calendarCanvas [data-id="a"]');await card.scrollIntoViewIfNeeded();const rect=await card.boundingBox();
 await card.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:42,button:0,clientX:rect.x+10,clientY:rect.y+10});
 await card.dispatchEvent('pointermove',{pointerType:'touch',pointerId:42,button:0,clientX:rect.x+30,clientY:rect.y+30});
 await expect(page.locator('body')).toHaveClass(/touch-drag-active/);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'t',canManageSchedule:false});window.currentCloudRole=()=> 'teacher';attachDragHandlers()});
 await expect(page.locator('body')).not.toHaveClass(/touch-drag-active/);await expect(card).not.toHaveClass(/dragging/);
 await card.dispatchEvent('pointerup',{pointerType:'touch',pointerId:42,button:0,clientX:rect.x+30,clientY:rect.y+30});
 expect(await page.evaluate(()=>({dragState,writes:window.__keyedWrites}))).toEqual({dragState:null,writes:[]});
});

test('reused week cells follow month/year navigation and real paste/drop target the new date',async({page})=>{
 await openCalendar(page);
 const dates=['2026-10-12','2026-11-02','2026-12-28','2027-01-04','2026-10-05'];
 for(const date of dates){
  await page.locator('#calendarDate').fill(date);await page.locator('#calendarDate').dispatchEvent('change');
  const state=await page.evaluate(()=>({same:window.__keyedOriginal.slot===document.querySelector('#calendarCanvas .time-slot'),dates:[...new Set([...document.querySelectorAll('#calendarCanvas .time-slot')].map(el=>el.dataset.date))],headers:[...document.querySelectorAll('#calendarCanvas .week-head[data-date]')].map(el=>({date:el.dataset.date,label:el.children[0].textContent})),count:document.querySelectorAll('#calendarCanvas .time-slot').length}));
  const expected=Array.from({length:7},(_,i)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
  expect(state.same).toBe(true);expect(state.dates).toEqual(expected);expect(state.headers.map(h=>h.date)).toEqual(expected);expect(state.headers.map(h=>h.label)).toEqual(expected.map(d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10))));expect(state.count).toBe(1176);
 }
 await page.locator('#calendarCanvas [data-id="a"]').click({modifiers:['Meta']});await page.keyboard.press('Control+c');
 await page.locator('#calendar button[title="下一頁"]').click();
 const target=page.locator('#calendarCanvas .time-slot[data-date="2026-10-12"][data-time="14:00"]');await target.hover();await page.keyboard.press('Control+v');
 expect(await page.evaluate(()=>db.lessons.filter(l=>!['a','b'].includes(l.id)).map(l=>({date:l.date,start:l.start,end:l.end})))).toEqual([{date:'2026-10-12',start:'14:00',end:'15:00'}]);
 await page.locator('#calendarDate').fill('2027-01-04');await page.locator('#calendarDate').dispatchEvent('change');
 const transfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('text/plain','b');return d});
 await page.locator('#calendarCanvas .time-slot[data-date="2027-01-06"][data-time="15:00"]').dispatchEvent('drop',{dataTransfer:transfer});
 expect(await page.evaluate(()=>{const l=db.lessons.find(l=>l.id==='b');return{date:l.date,start:l.start,end:l.end}})).toEqual({date:'2027-01-06',start:'15:00',end:'16:00'});
 expect(await page.evaluate(()=>window.__keyedOriginal.slot===document.querySelector('#calendarCanvas .time-slot'))).toBe(true);
});

test('week grid rebuilds for early/late hours and edit permission changes',async({page})=>{
 await openCalendar(page);
 await page.evaluate(()=>{db.lessons[0].start='06:00';db.lessons[0].end='07:00';renderCalendar({deferAnalysis:true})});
 expect(await page.evaluate(()=>window.__keyedOriginal.slot===document.querySelector('#calendarCanvas .time-slot'))).toBe(false);
 await expect(page.locator('#calendarCanvas .time-slot[data-date="2026-10-05"][data-time="06:00"]')).toHaveCount(1);
 await page.evaluate(()=>{window.__earlySlot=document.querySelector('#calendarCanvas .time-slot');db.lessons[1].start='23:00';db.lessons[1].end='23:55';renderCalendar({deferAnalysis:true})});
 expect(await page.evaluate(()=>window.__earlySlot===document.querySelector('#calendarCanvas .time-slot'))).toBe(false);
 await expect(page.locator('#calendarCanvas .time-slot[data-date="2026-10-05"][data-time="23:55"]')).toHaveCount(1);
 await page.evaluate(()=>{window.__lateSlot=document.querySelector('#calendarCanvas .time-slot');window.DanbridgeAccess.setContext({role:'teacher',teacherId:'t',canManageSchedule:false});window.currentCloudRole=()=> 'teacher';renderCalendar({deferAnalysis:true})});
 expect(await page.evaluate(()=>window.__lateSlot===document.querySelector('#calendarCanvas .time-slot'))).toBe(false);
 // Switching into teacher mode intentionally initializes its current month.
 // Restore the fixture week through the real date control before checking it.
 await page.locator('#calendarMode').selectOption('week');await page.locator('#calendarDate').fill('2026-10-05');await page.locator('#calendarDate').dispatchEvent('change');
 await expect(page.locator('#calendarCanvas [data-id="a"]')).toHaveAttribute('draggable','false');expect(await page.evaluate(()=>window.__keyedWrites)).toEqual([]);
});

test('mobile agenda: repeated updates preserve exact records, ordering, month navigation and read-only scope',async({page})=>{
 await openCalendar(page);
 await expect(page.locator('#calendarCanvas .mobile-week-agenda')).toHaveCount(1);
 await expect(page.locator('#calendarCanvas .mobile-week-day')).toHaveCount(7);
 const ids=()=>page.locator('#calendarCanvas [data-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
 for(let i=0;i<12;i++){
  await page.evaluate(i=>{db.lessons[1].start=i%2?'09:00':'12:00';db.lessons[1].end=i%2?'10:00':'13:00';renderCalendar({deferAnalysis:true})},i);
  expect(await ids()).toEqual(i%2?['b','a']:['a','b']);
 }
 await page.evaluate(()=>{db.students[0].name='新學生';db.students[0].parent='新家長';db.teachers[0].name='新老師';db.lessons[0].start='06:00';db.lessons[0].end='07:00';db.lessons[1].start='23:00';db.lessons[1].end='23:55';renderCalendar({deferAnalysis:true})});
 const a=page.locator('#calendarCanvas [data-id="a"]'),b=page.locator('#calendarCanvas [data-id="b"]');
 await expect(a).toContainText('06:00–07:00');await expect(b).toContainText('23:00–23:55');
 await expect(a).toContainText('新學生');await expect(a).toContainText('新老師');await expect(a).toHaveAttribute('title',/新家長/);
 await a.click({modifiers:['Meta']});expect(await page.evaluate(()=>[...selectedLessonIds])).toEqual(['a']);
 await page.evaluate(()=>renderCalendar({deferAnalysis:true}));await expect(a).toHaveClass(/selected/);
 await page.evaluate(()=>{clearLessonSelection();db.lessons=db.lessons.filter(l=>l.id!=='b');db.lessons.push({id:'c',date:'2027-01-04',start:'08:00',end:'09:00',studentId:'s',teacherId:'t',branchId:'art_museum'});renderCalendar({deferAnalysis:true})});
 expect(await ids()).toEqual(['a']);
 await page.locator('#calendarDate').fill('2027-01-04');await page.locator('#calendarDate').dispatchEvent('change');
 expect(await ids()).toEqual(['c']);await expect(page.locator('#calendarTitle')).toHaveText('2027-01-04 ～ 2027-01-10');
 await page.locator('#calendarDate').fill('2026-10-05');await page.locator('#calendarDate').dispatchEvent('change');expect(await ids()).toEqual(['a']);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',teacherId:'t',canManageSchedule:false});window.currentCloudRole=()=> 'teacher';renderCalendar({deferAnalysis:true})});
 await page.locator('#calendarMode').selectOption('week');await page.locator('#calendarDate').fill('2026-10-05');await page.locator('#calendarDate').dispatchEvent('change');
 await expect(a).toHaveAttribute('draggable','false');await expect(page.locator('.mobile-week-add')).toHaveCount(0);expect(await page.evaluate(()=>window.__keyedWrites)).toEqual([]);
});
