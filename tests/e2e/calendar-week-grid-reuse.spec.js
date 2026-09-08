const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test('週課表保留時間格，重畫不重複送出拖曳，換週與清晨課程重建正確範圍',async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>el.inert=false);
  window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'s',name:'隔離測試'}],teachers:[{id:'t',name:'測試老師'}],lessons:[{id:'l',studentId:'s',teacherId:'t',date:'2026-10-05',start:'09:00',end:'10:00',status:'未上課'}]};
  saveDB=()=>{};renderAll();switchTab('calendar');$('calendarMode').value='week';$('calendarDate').value='2026-10-05';renderCalendar();
 });
 test.skip(await page.evaluate(()=>matchMedia('(max-width:700px)').matches),'小螢幕使用既有行事曆列表，不使用桌面時間格');
 const outcome=await page.evaluate(()=>{
  const cell=()=>document.querySelector('#calendarCanvas .time-slot[data-date="2026-10-05"][data-time="11:00"]'),first=cell();let moves=0;
  const original=moveLessonTo;moveLessonTo=()=>{moves++};
  try{
   for(let i=0;i<8;i++){db.lessons[0].note=String(i);renderCalendar({deferAnalysis:true})}
   const sameCell=first===cell(),transfer=new DataTransfer();transfer.setData('text/plain','l');
   first.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
   db.lessons.push({...db.lessons[0],id:'early',start:'06:00',end:'07:00'});renderCalendar({deferAnalysis:true});
   const early=!!document.querySelector('#calendarCanvas .time-slot[data-time="06:00"]'),changedRange=first!==cell();
   $('calendarDate').value='2026-10-12';renderCalendar({deferAnalysis:true});
   return{sameCell,moves,early,changedRange,oldDate:!!document.querySelector('#calendarCanvas [data-date="2026-10-05"]'),newDate:!!document.querySelector('#calendarCanvas [data-date="2026-10-12"]')};
  }finally{moveLessonTo=original}
 });
 expect(outcome).toEqual({sameCell:true,moves:1,early:true,changedRange:true,oldDate:false,newDate:true});
});
