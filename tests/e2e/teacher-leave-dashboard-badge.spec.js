const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

async function setup(page){
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});
  db={...db,teachers:[{id:'badge-teacher',name:'Badge fixture',employmentStartDate:'2022-01-01'}],students:[],lessons:[]};
  window.switchTab('dashboard');window.__danbridgeSetTeacherLeaves([]);
  window.__badgeRows=[];
  window.__badgeMakeRows=count=>Array.from({length:count},(_,i)=>({id:`badge-${i}`,leaveId:`badge-${i}`,teacherId:'badge-teacher',teacherName:'Badge fixture',leaveType:'personal',date:'2026-09-21',start:'09:00',end:'10:00',hours:1,status:'pending',revision:1}));
 });
}

test('badge stays until confirmed; repeated actual approve/reject/cancel buttons, failed writes and filters',async({page})=>{
 await setup(page);const badge=page.locator('#teacherLeaveDashboardBadge');
 await expect(badge).toBeHidden();
 page.on('dialog',dialog=>dialog.accept('Fixture rejection'));
 for(let round=0;round<3;round++){
  await page.evaluate(()=>{
   window.__badgeRows=window.__badgeMakeRows(3);window.__danbridgeSetTeacherLeaves(window.__badgeRows);
   window.__danbridgeSaveTeacherLeave=async payload=>{window.__badgeAction=payload;await new Promise(resolve=>window.__badgeResolve=resolve)};
  });
  await expect(badge).toHaveText('3');await expect(badge).toBeVisible();
  await page.locator('.teacher-leave-dashboard-card').click();
  await page.locator('#teacherLeaveMonth').fill('2026-09');await page.locator('#teacherLeaveMonth').dispatchEvent('change');
  for(const [index,action,label] of [[0,'approve','核准'],[1,'reject','駁回'],[2,'cancel','取消']]){
   await page.locator('#teacherLeaveRows tr').filter({has:page.locator(`button[onclick*="badge-${index}"]`)}).getByRole('button',{name:label,exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>window.__badgeAction?.action)).toBe(action);
   // Request started, but not yet acknowledged: no premature decrement.
   await expect(badge).toHaveText(String(3-index));
   await page.evaluate(({index,action})=>{
    window.__badgeRows[index]={...window.__badgeRows[index],status:{approve:'approved',reject:'rejected',cancel:'cancelled'}[action],revision:2,requiresCompletion:true};
    window.__danbridgeSetTeacherLeaves(window.__badgeRows);window.__badgeResolve();
   },{index,action});
   await expect(badge).toHaveText(String(3-index));
   // Decision does NOT clear the todo. Only a separately acknowledged Complete does.
   const complete=page.locator(`[data-leave-complete="badge-${index}"]`);
   await complete.click();await expect(complete).toBeDisabled();
   await expect.poll(()=>page.evaluate(()=>window.__badgeAction?.action)).toBe('complete');
   await expect(badge).toHaveText(String(3-index));
   await page.evaluate(index=>{window.__badgeRows[index].completedAtIso='2026-09-19T00:00:00Z';window.__badgeRows[index].revision++;window.__danbridgeSetTeacherLeaves(window.__badgeRows);window.__badgeResolve()},index);
   if(index<2)await expect(badge).toHaveText(String(2-index));else await expect(badge).toBeHidden();
  }
  await page.evaluate(()=>window.switchTab('dashboard'));await expect(page.locator('#teacherLeaveDashboardIcon')).toBeVisible();
 }
 await page.evaluate(()=>{
  window.__danbridgeSetTeacherLeaves(window.__badgeMakeRows(1));window.switchTab('teacherLeave');
  window.__danbridgeSaveTeacherLeave=async()=>{throw new Error('fixture write failure')};
 });
 await page.locator('#teacherLeavePendingQueue').getByRole('button',{name:'核准',exact:true}).click();
 await expect(page.locator('#teacherLeaveFormStatus')).toHaveText('fixture write failure');await expect(badge).toHaveText('1');
 await page.evaluate(()=>window.__danbridgeSetTeacherLeaves([{...window.__badgeMakeRows(1)[0],status:'approved',requiresCompletion:true}]));
 await page.locator('[data-leave-complete="badge-0"]').click();
 await expect(page.locator('#teacherLeaveFormStatus')).toHaveText('fixture write failure');await expect(badge).toHaveText('1');
 await page.evaluate(()=>{document.getElementById('teacherLeaveMonth').value='2030-01';document.getElementById('teacherLeaveStatus').value='approved';window.renderTeacherLeaves();window.__danbridgeSetTeacherLeaveError('fixture read failure');window.switchTab('dashboard')});
 await expect(badge).toHaveText('1');await expect(badge).toBeVisible();
 // A fresh snapshot after page reload restores the same pending count.
 await page.reload({waitUntil:'load'});await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});
  window.__danbridgeSetTeacherLeaves([{id:'restore',teacherId:'badge-teacher',date:'2026-09-21',status:'approved',requiresCompletion:true}]);window.switchTab('dashboard');
 });await expect(badge).toHaveText('1');
});

test('repeated 0/1/9/10/99/100/999/1000 counts remain circular and centered, with no clipping',async({page})=>{
 test.setTimeout(90_000);await setup(page);const badge=page.locator('#teacherLeaveDashboardBadge');
 for(let round=0;round<3;round++)for(const count of [1,9,10,99,100,999,1000,10,1,0]){
  await page.evaluate(count=>{const rows=window.__badgeMakeRows(count);window.__danbridgeSetTeacherLeaves(rows);window.__danbridgeSetTeacherLeaves(rows)},count);
  if(!count){await expect(badge).toBeHidden();continue}
  await expect(badge).toBeVisible();await expect(badge).toHaveText(String(count));
  const geometry=await badge.evaluate(el=>{
   const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),card=el.closest('button').getBoundingClientRect(),leading=el.parentElement.getBoundingClientRect();
   return{circle:Math.abs(box.width-box.height),dx:Math.abs(text.x+text.width/2-box.x-box.width/2),dy:Math.abs(text.y+text.height/2-box.y-box.height/2),iconDx:Math.abs(leading.x+leading.width/2-box.x-box.width/2),inside:box.left>=card.left&&box.right<=card.right,textFits:text.width<=box.width-8,background:getComputedStyle(el).backgroundColor};
  });
  expect(geometry.circle).toBeLessThan(1);expect(geometry.dx).toBeLessThan(1);expect(geometry.dy).toBeLessThanOrEqual(2);expect(geometry.iconDx).toBeLessThan(1);expect(geometry.inside).toBe(true);expect(geometry.textFits).toBe(true);expect(geometry.background).toBe('rgb(198, 40, 40)');
 }
});
