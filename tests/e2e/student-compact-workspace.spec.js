const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
const path=require('node:path'),os=require('node:os');

test('家教與團課精簡版型：入口、草稿、搜尋、統一尺寸及邊界',async({page},info)=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  db.students=[{id:'child-one',name:'同名學生',parent:'林家長',rate:600,courseType:'1對1'},{id:'child-two',name:'同名學生',parent:'王家長',rate:900,courseType:'團班'},{id:'saved-group',name:'既有英語團課',isGroupRoster:true,courseType:'團班',groupMemberIds:['child-one','child-two']}];db.lessons=[];
  window.saveDB=()=>{};renderAll();switchTab('students');clearStudentForm();
 });
 await expect(page.getByRole('tab',{name:'家教',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tab',{name:'團課',exact:true})).toBeVisible();
 await page.locator('#studentName').fill('尚未儲存家教');await page.locator('#parentName').fill('保留家長');
 await expect(page.locator('#studentAdditionalDetails')).not.toHaveAttribute('open','');
 await page.locator('#studentCourseType').selectOption('團班');
 await expect(page.getByRole('tab',{name:'團課',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#studentGroupMembersSearch')).toBeVisible();
 await page.locator('#studentName').fill('英文團課');await page.locator('#studentGroupMembersSearch').fill('王家長');
 await expect(page.locator('#studentGroupMembers .group-roster-option:visible')).toHaveCount(1);
 await page.locator('#studentGroupMembers input[value="child-two"]').check();
 await page.getByRole('tab',{name:'家教',exact:true}).click();
 await expect(page.locator('#studentName')).toHaveValue('尚未儲存家教');await expect(page.locator('#parentName')).toHaveValue('保留家長');
 await page.getByRole('tab',{name:'團課',exact:true}).click();
 await expect(page.locator('#studentName')).toHaveValue('英文團課');await expect(page.locator('#studentGroupMembers input[value="child-two"]')).toBeChecked();
 const geometry=await page.evaluate(()=>{
  const controls=[...document.querySelectorAll('#students input:not([type=checkbox]):not([type=hidden]),#students select')].filter(el=>el.getClientRects().length);
  return {controls:controls.map(el=>({id:el.id,h:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,align:getComputedStyle(el).textAlign,lastAlign:getComputedStyle(el).textAlignLast})),overflow:document.documentElement.scrollWidth>innerWidth+1,
   fieldsOutside:controls.filter(el=>{const r=el.getBoundingClientRect(),c=el.closest('.card').getBoundingClientRect();return r.left<c.left-1||r.right>c.right+1}).map(el=>el.id)};
 });
 expect(await page.locator('#studentWorkspacePanel').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(300);
 expect(geometry.controls.length).toBeGreaterThan(4);for(const control of geometry.controls){expect(control.h,control.id).toBe(48);expect(control.font,control.id).toBe('14px');expect(control.align,control.id).toBe('left');expect(control.lastAlign,control.id).toBe('left')}
 expect(geometry.overflow).toBe(false);expect(geometry.fieldsOutside).toEqual([]);
 expect(await page.locator('#studentStatus').evaluate(el=>getComputedStyle(el).backgroundImage)).not.toBe('none');
 const actions=await page.locator('#students .crm-actions .btn').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const parent=el.parentElement,style=getComputedStyle(parent);return{h:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,parentWidth:parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),font:getComputedStyle(el).fontSize,overflow:el.scrollWidth>el.clientWidth+1}}));
 expect(actions.length).toBeGreaterThan(0);for(const action of actions){expect(action.h).toBe(48);expect(Math.abs(action.width-action.parentWidth)).toBeLessThanOrEqual(1);expect(action.font).toBe('14px');expect(action.overflow).toBe(false)}
 await page.screenshot({path:path.join(os.tmpdir(),'danbridge263-student-workspace-'+info.project.name+'.png'),fullPage:false});
 expect(await page.evaluate(()=>db.students.length)).toBe(3);
});
