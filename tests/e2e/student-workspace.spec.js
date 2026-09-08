const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
test.beforeEach(async({page})=>{
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
  window.DanbridgeAccess.setContext({role:'owner',email:'owner@example.com'});window.currentCloudRole=()=> 'owner';
  db={...db,students:[{id:'a',name:'同名學生',parent:'王家長',rate:600,courseType:'1對1'},{id:'b',name:'同名學生',parent:'李家長',rate:800,courseType:'團班'},{id:'care',name:'安親學生',parent:'陳家長',rate:9000,courseType:'安親'},{id:'g',name:'週三團班',isGroupRoster:true,courseType:'團班',groupMemberIds:['a','b'],partTimeTeacherRate:500,billingBranchId:'hexi',attendanceBranchId:'art_museum'}],teachers:[{id:'t',name:'老師',rate:500}],lessons:[]};
  saveDB=()=>{renderSelects();renderStudents()};renderSelects();switchTab('students');clearStudentForm();renderStudents();
 });
});
test('左右分頁分開學生與團班，切換保留草稿，編輯既有團班保留 ID 與收費',async({page})=>{
 const left=page.getByRole('tab',{name:'家教',exact:true}),right=page.getByRole('tab',{name:'團班',exact:true});
 await expect(left).toHaveAttribute('aria-selected','true');await expect(page.locator('#studentRows tr')).toHaveCount(3);
 await expect(page.locator('#studentRows')).toContainText('安親學生');await expect(page.locator('#studentRows')).not.toContainText('週三團班');
 await page.locator('#studentName').fill('家教未存草稿');await page.locator('#parentName').fill('草稿家長');
 await right.click();await expect(page.locator('#parentName')).not.toBeVisible();await expect(page.locator('#studentRate')).not.toBeVisible();await expect(page.locator('#studentName').locator('..')).toContainText('團班名稱');await expect(page.locator('#studentPartTimeTeacherRate')).toBeVisible();await expect(page.locator('#studentRows tr')).toHaveCount(1);
 await page.locator('#studentName').fill('團班未存草稿');await page.locator('#studentGroupMembers input[value="a"]').check();await page.locator('#studentPartTimeTeacherRate').fill('700');await page.locator('#studentBillingBranch').selectOption('hexi');
 await left.click();await expect(page.locator('#studentName')).toHaveValue('家教未存草稿');await expect(page.locator('#parentName')).toHaveValue('草稿家長');
 await right.click();await expect(page.locator('#studentName')).toHaveValue('團班未存草稿');await expect(page.locator('#studentGroupMembers input[value="a"]')).toBeChecked();await expect(page.locator('#studentPartTimeTeacherRate')).toHaveValue('700');await expect(page.locator('#studentBillingBranch')).toHaveValue('hexi');
 await page.locator('#studentRows').getByRole('button',{name:'檢視／編輯',exact:true}).click();await expect(page.locator('#studentName')).toHaveValue('週三團班');await expect(page.locator('#studentGroupFeePreview')).toContainText('NT$1,400');
 await page.locator('#studentName').fill('週三團班改名');await page.locator('#students button[onclick="saveStudent()"]').click();
 expect(await page.evaluate(()=>db.students.find(s=>s.id==='g'))).toMatchObject({id:'g',name:'週三團班改名',groupMemberIds:['a','b'],partTimeTeacherRate:500,billingBranchId:'hexi',attendanceBranchId:'art_museum'});
 expect(await page.evaluate(()=>db.students.length)).toBe(4);await expect(page.locator('#studentName')).toHaveValue('');
 await left.click();await right.click();await expect(page.locator('#studentName')).toHaveValue('');
 await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'danbridge-student-tabs-'+test.info().project.name+'.png'),fullPage:false});
 const sizes=await page.locator('#studentWorkspaceTabs button').evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
 expect(Math.abs(sizes[0].width-sizes[1].width)).toBeLessThan(1);expect(sizes[0].height).toBe(sizes[1].height);expect(sizes[0].x).toBeLessThan(sizes[1].x);
});
test('團班預览區分月費、缺漏費率及零元，搜尋與清空不改既有孩子',async({page})=>{
 await page.evaluate(()=>db.students.push({id:'missing',name:'未填費用',parent:'未填家長',courseType:'1對1'},{id:'zero',name:'零元學生',rate:0,courseType:'1對1'}));
 const before=await page.evaluate(()=>JSON.stringify(db.students));
 await page.getByRole('tab',{name:'團班',exact:true}).click();
 for(const id of ['a','care','missing','zero'])await page.locator('#studentGroupMembers input[value="'+id+'"]').check();
 const preview=page.locator('#studentGroupFeePreview');await expect(preview).toContainText('NT$600／小時');await expect(preview).toContainText('NT$9,000／月');await expect(preview).toContainText('未設定收費');await expect(preview).toContainText('NT$0／小時');
 await page.getByRole('searchbox',{name:'搜尋團班學生',exact:true}).fill('王家長');await expect(preview).toContainText('已選 4 位');
 await page.locator('#students button[onclick="clearStudentForm()"]').click();await expect(page.locator('#studentGroupMembers input:checked')).toHaveCount(0);await expect(preview).toContainText('已選 0 位');
 expect(await page.evaluate(()=>JSON.stringify(db.students))).toBe(before);
 await page.getByRole('tab',{name:'家教',exact:true}).click();expect(await page.evaluate(()=>studentWorkspaceDrafts.size)).toBeGreaterThan(0);
 await page.evaluate(()=>{window.DanbridgeAccess.setContext({role:'teacher',email:'teacher@example.com'});window.currentCloudRole=()=> 'teacher';renderGroupFeePreview()});await expect(preview).toHaveText('');
 await expect.poll(()=>page.evaluate(()=>studentWorkspaceDrafts.size)).toBe(0);
});
