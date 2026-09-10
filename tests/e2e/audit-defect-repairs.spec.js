const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
const bootstrapSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
const bootstrapUiSource=bootstrapSource.slice(bootstrapSource.indexOf('let cloudStatusHideTimer=null;'),bootstrapSource.indexOf('\nfunction canonicalHashValue('));
test.beforeEach(async({page})=>{
 await isolateApplicationAuth(page);
 await page.clock.setFixedTime(new Date('2026-09-10T01:00:00Z'));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof withPricingChange==='function'&&typeof window.loadSettlementRecord==='function');
 await page.addStyleTag({content:'#authScreen{display:none!important;pointer-events:none!important}'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
  window.DanbridgeAccess.setContext({role:'owner',email:'fixture-owner@example.com'});window.currentCloudRole=()=> 'owner';window.__DANBRIDGE_ENVIRONMENT__='local';
  db={...db,students:[{id:'a',name:'孩子甲',parent:'同名家長',courseType:'1對1',rate:600},{id:'b',name:'孩子乙',parent:'同名家長',courseType:'1對1',rate:800}],teachers:[{id:'t',name:'測試老師',type:'兼職',payrollMode:'hourly',rate:300,workDays:[1,2,3,4,5],minWeeklyHours:0}],lessons:[{id:'l',studentId:'a',teacherId:'t',date:'2026-09-08',start:'10:00',end:'11:00',status:'未上課',billingBranchId:'hexi',branchId:'hexi'}],makeups:[],changes:[],summerCampClasses:[],summerCampRegistrations:[],winterCampClasses:[],winterCampRegistrations:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[]};
  window.__actualLocalSaveDB=saveDB;
  saveDB=()=>{window.__testSaves=(window.__testSaves||0)+1;renderSelects();renderStudents()};snapshot=()=>{};renderSelects();
 });
});
test('bootstrap error stays visible and locked after the old timeout, then unlocks only on verified readiness',async({page})=>{
 await page.evaluate(async source=>{
  const {createCloudBootstrapProgress,CLOUD_BOOTSTRAP_STAGES}=await import('/js/core/cloud-bootstrap-progress.js');
  const timerCallbacks=[];
  window.__bootstrapUi=new Function('createCloudBootstrapProgress','CLOUD_BOOTSTRAP_STAGES','escapeHTML','setTimeout','clearTimeout',source+';return {beginCloudBootstrap,advanceCloudBootstrap,failCloudBootstrap}')(
   createCloudBootstrapProgress,CLOUD_BOOTSTRAP_STAGES,text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fn=>{timerCallbacks.push(fn);return timerCallbacks.length},()=>{}
  );
  window.__bootstrapUi.beginCloudBootstrap();window.__bootstrapUi.advanceCloudBootstrap('data','驗證資料');
  window.__bootstrapUi.failCloudBootstrap(new Error('permission-denied：禁止存取，未寫入'),{readOnly:true});
  timerCallbacks.forEach(fn=>fn());
 },bootstrapUiSource);
 const panel=page.locator('#cloudBootstrapProgress');await expect(panel).toBeVisible();await expect(panel).toContainText('permission-denied：禁止存取，未寫入');
 expect(await page.locator('main').evaluate(el=>el.inert)).toBe(true);
 expect(await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})).toBe(true);
 await page.evaluate(()=>window.__bootstrapUi.advanceCloudBootstrap('ready','已驗證'));await expect(panel).not.toBeVisible();expect(await page.locator('main').evaluate(el=>el.inert)).toBe(false);
});
test('student archive uses a page dialog, preserves history, and can be restored without native prompts',async({page})=>{
 await page.evaluate(()=>{window.prompt=()=>{throw Error('prompt() is not supported.')};window.confirm=()=>{throw Error('native confirm unavailable')};switchTab('students');renderStudents();db.collectionRecords=[{id:'receipt-a',studentIds:['a'],amount:600}];window.__historyBefore=JSON.stringify({lessons:db.lessons,receipts:db.collectionRecords});editStudent('b');document.getElementById('studentName').value='未儲存的另一位學生'});
 const row=page.locator('#studentRows tr').filter({hasText:'孩子甲'});
 await row.getByRole('button',{name:'封存',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'封存學生',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
 const fits=await dialog.locator('.modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1});expect(fits).toBe(true);
 await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'確認封存',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.getByLabel('封存原因')).toBeFocused();
 await dialog.getByLabel('封存原因').fill(' ');await dialog.getByRole('button',{name:'確認封存',exact:true}).click();
 await expect(dialog.getByRole('alert')).toHaveText('請輸入封存原因');expect(await page.evaluate(()=>window.__testSaves||0)).toBe(0);
 await dialog.getByLabel('封存原因').fill('本輪合成資料清理');await dialog.getByRole('button',{name:'確認封存',exact:true}).click();
 await expect(dialog).not.toBeVisible();expect(await page.evaluate(()=>db.students[0].archivedReason)).toBe('本輪合成資料清理');
 await expect(page.locator('#studentName')).toHaveValue('未儲存的另一位學生');
 expect(await page.evaluate(()=>JSON.stringify({lessons:db.lessons,receipts:db.collectionRecords})===window.__historyBefore)).toBe(true);
 await page.locator('#crmArchiveFilter').selectOption('archived');await page.locator('#studentRows tr').filter({hasText:'孩子甲'}).getByRole('button',{name:'恢復',exact:true}).click();
 await page.getByRole('dialog',{name:'恢復學生',exact:true}).getByRole('button',{name:'確認恢復',exact:true}).click();
 expect(await page.evaluate(()=>({archived:db.students[0].archivedAt,status:db.students[0].status,saves:window.__testSaves}))).toEqual({archived:'',status:'active',saves:2});
});
test('student archival cancellation, duplicate clicks and Escape never save',async({page})=>{
 await page.evaluate(()=>{switchTab('students');renderStudents();void archiveStudent('a');void archiveStudent('a')});
 await expect(page.locator('#studentArchiveConfirmation')).toHaveCount(1);
 await page.getByRole('dialog',{name:'封存學生',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('#studentRows tr').filter({hasText:'孩子甲'}).getByRole('button',{name:'封存',exact:true}).click();await page.keyboard.press('Escape');
 await expect(page.locator('#studentArchiveConfirmation')).toHaveCount(0);expect(await page.evaluate(()=>window.__testSaves||0)).toBe(0);expect(await page.evaluate(()=>db.students[0].archivedAt||'')).toBe('');
});
for(const change of ['record','role','account'])test(`student archival refuses changed ${change} while confirmation is open`,async({page})=>{
 await page.evaluate(()=>{switchTab('students');renderStudents();void archiveStudent('a')});
 const dialog=page.getByRole('dialog',{name:'封存學生',exact:true});await expect(dialog).toBeVisible();
 await page.evaluate(change=>{if(change==='record')db.students[0].rate=999;else if(change==='role')DanbridgeAccess.setContext({role:'teacher',email:'fixture-owner@example.com'});else DanbridgeAccess.setContext({role:'owner',email:'different@example.com'})},change);
 await dialog.getByRole('button',{name:'確認封存',exact:true}).click();
 expect(await page.evaluate(()=>window.__testSaves||0)).toBe(0);expect(await page.evaluate(()=>db.students[0].archivedAt||'')).toBe('');
});
test('JSON upload preserves itemized receipts and historical camp fees through the actual FileReader workflow',async({page})=>{
 page.on('dialog',d=>d.accept());
 await page.evaluate(()=>{switchTab('data');createVersion=()=>{window.__backupCreated=true}});
 const backup=await page.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));x.collectionRecords=[{id:'receipt',month:'2026-09',studentIds:['a'],status:'collected',amount:200,billingItemsVersion:1,billingItems:[{key:'l',studentId:'a',amount:200}]}];x.summerCampRegistrations=[{id:'camp',studentId:'a',month:'2026-08',dates:['2026-08-03'],dailyRate:600,totalFee:1700}];x._meta={checksum:backupChecksum(x),counts:backupCollectionCounts(x)};return x});
 await page.locator('#importFile').setInputFiles({name:'isolated-test-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect.poll(()=>page.evaluate(()=>db.collectionRecords[0]?.amount)).toBe(200);
 expect(await page.evaluate(()=>db.collectionRecords[0].billingItems[0].amount)).toBe(200);
 expect(await page.evaluate(()=>db.summerCampRegistrations[0].totalFee)).toBe(1700);
 expect(await page.evaluate(()=>window.__backupCreated)).toBe(true);
 // Exercise the real post-import persistence boundary, not just the FileReader callback.
 const saved=await page.evaluate(()=>{window.__actualLocalSaveDB({skipRender:true});return JSON.parse(localStorage.getItem(LS_KEY))});
 expect(saved.summerCampRegistrations).toEqual(backup.summerCampRegistrations);
 expect(saved.collectionRecords).toEqual(backup.collectionRecords);
});
test('actual backup upload preserves newer audit history and explains this before confirmation',async({page})=>{
 const confirmations=[];page.on('dialog',async dialog=>{confirmations.push(dialog.message());await dialog.accept()});
 await page.evaluate(()=>{switchTab('data');createVersion=()=>{};db.changes=[{id:'latest-change',text:'備份後操作'},{id:'shared-change',text:'原始操作'}]});
 const backup=await page.evaluate(()=>{const saved=JSON.parse(JSON.stringify(db));saved.changes=[{id:'shared-change',text:'原始操作'},{id:'older-change',text:'備份獨有操作'}];saved.collectionRecords=[{id:'partial',amount:200,history:[{text:'不得覆寫'}]}];saved._meta={checksum:backupChecksum(saved),counts:backupCollectionCounts(saved)};return saved});
 await page.locator('#importFile').setInputFiles({name:'older-synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect.poll(()=>page.evaluate(()=>db.changes.map(row=>row.id))).toEqual(['older-change','latest-change','shared-change']);
 expect(confirmations.some(text=>text.includes('操作日誌會保留現有紀錄'))).toBe(true);
 expect(await page.evaluate(()=>db.collectionRecords)).toEqual(backup.collectionRecords);
 await page.locator('#importFile').setInputFiles({name:'same-synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect.poll(()=>page.evaluate(()=>document.getElementById('importFile').value)).toBe('');
 expect(await page.evaluate(()=>db.changes.map(row=>row.id))).toEqual(['older-change','latest-change','shared-change']);
});
test('signed-out screen never exposes a cached notification drawer or late-created private panels',async({page})=>{
 await page.evaluate(()=>{DanbridgeNotifications.open();document.body.classList.add('auth-locked');document.getElementById('authScreen').classList.remove('hidden');DanbridgeNotifications.render();const late=document.createElement('aside');late.id='testLatePrivatePanel';late.textContent='PRIVATE_CACHED_DATA';document.body.append(late)});
 await expect(page.locator('#notificationDrawer')).not.toBeVisible();
 await expect(page.locator('#testLatePrivatePanel')).not.toBeVisible();
 expect(await page.locator('#notificationList').textContent()).toBe('');
 await page.evaluate(()=>DanbridgeNotifications.open());
 expect(await page.evaluate(()=>document.body.classList.contains('notification-center-open'))).toBe(false);
});
test('student editor records a future rate without repricing September or changing the parent salutation',async({page})=>{
 await page.evaluate(()=>editStudent('a'));
 await page.locator('#studentRate').fill('1000');await page.locator('#studentPricingEffectiveDate').fill('2026-10-01');
 await page.locator('#students button[onclick="saveStudent()"]').click();
 expect(await page.evaluate(()=>studentMonthlyBillingData('a','2026-09').total)).toBe(600);
 expect(await page.evaluate(()=>studentPricingAt('a','2026-10-01').rate)).toBe(1000);
 await expect(page.locator('#studentRows tr').filter({hasText:'孩子甲'})).toContainText('NT$600');
 await expect(page.locator('#studentRows tr').filter({hasText:'孩子甲'})).not.toContainText('NT$1,000');
 expect(await page.evaluate(()=>billingLineSalutation('a'))).toBe('同名家長');
});
test('same parent name requires review; explicitly distinct households stay separate; copy is not sent',async({page})=>{
 await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.__copied=text};openLineBillingPreview('a','2026-09')});
 await page.locator('#v181LineBillingPreview button').filter({hasText:'確認複製'}).click();
 expect(await page.evaluate(()=>window.__copied)).toBeUndefined();
 await page.locator('#lineFamilyReviewConfirmed').check();await page.locator('#v181LineBillingPreview button').filter({hasText:'確認複製'}).click();
 await expect.poll(()=>page.evaluate(()=>!!window.__copied)).toBe(true);
 expect(await page.evaluate(()=>db.collectionRecords[0]?.notifiedAt||'')).toBe('');
 expect(await page.evaluate(()=>!!db.collectionRecords[0]?.copiedAt)).toBe(true);
 await page.evaluate(()=>editStudent('a'));await page.locator('#studentBillingFamilyId').fill('household-a');await page.locator('#students button[onclick="saveStudent()"]').click();
 expect(await page.evaluate(()=>billingFamilyStudents('a').map(s=>s.id))).toEqual(['a']);
 expect(await page.evaluate(()=>billingFamilyStudents('b').map(s=>s.id))).toEqual(['b']);
});
test('one group lesson counts once while billing each child; original settlement opens without recalculation',async({page})=>{
 await page.evaluate(()=>{
  db.students.push({id:'g',name:'團班',isGroupRoster:true,groupMemberIds:['a','b'],courseType:'團班'});db.lessons[0].studentId='g';db.lessons[0].groupStudentIds=['a','b'];
  const data=DanbridgeBranchBusiness.settlementDataFor('2026-09','all');db.settlementRecords=[createLockedSettlementRecord('2026-09','all',data)];
  db.lessons.push({...db.lessons[0],id:'second'});loadSettlementRecord('2026-09','all');
 });
 const modal=page.locator('#settlementRecordPreview');await expect(modal).toBeVisible();
 expect(await page.evaluate(()=>({lessons:db.settlementRecords[0].totalLessons,attendances:db.settlementRecords[0].studentAttendances,revenue:db.settlementRecords[0].totalRevenue}))).toEqual({lessons:1,attendances:2,revenue:1400});
 await expect(modal).toContainText('原結算（封存、不重算）');
 await modal.getByRole('button',{name:'目前重算',exact:true}).click();await expect(modal).toContainText('目前重算（未取代原結算）');
 expect(await page.evaluate(()=>db.settlementRecords[0].totalRevenue)).toBe(1400);
 const overflow=await modal.evaluate(el=>{const box=el.querySelector('.modal');return box.getBoundingClientRect().right>innerWidth+1||box.getBoundingClientRect().left<0});expect(overflow).toBe(false);
});
test('delayed clipboard completion stays with the original family and month',async({page})=>{
 await page.evaluate(()=>{db.students[0].billingFamilyId='family-a';db.students[1].billingFamilyId='family-b';navigator.clipboard.writeText=()=>new Promise(resolve=>{window.__finishClipboard=resolve});openLineBillingPreview('a','2026-09')});
 await page.locator('#v181LineBillingPreview button').filter({hasText:'確認複製'}).click();
 await page.evaluate(()=>{openLineBillingPreview('b','2026-10');window.__finishClipboard()});
 await expect.poll(()=>page.evaluate(()=>db.collectionRecords.length)).toBe(1);
 expect(await page.evaluate(()=>({month:db.collectionRecords[0].month,ids:db.collectionRecords[0].studentIds,notified:db.collectionRecords[0].notifiedAt}))).toEqual({month:'2026-09',ids:['a'],notified:''});
 await expect(page.locator('#v181LineBillingPreview')).toBeVisible();
 await expect(page.locator('#v181LineBillingPreview')).toHaveAttribute('data-student-id','b');
});
test('changed household during clipboard completion is not recorded against different children',async({page})=>{
 await page.evaluate(()=>{db.students[0].billingFamilyId='family-a';db.students[1].billingFamilyId='family-b';navigator.clipboard.writeText=()=>new Promise(resolve=>{window.__finishClipboard=resolve});openLineBillingPreview('a','2026-09')});
 await page.locator('#v181LineBillingPreview button').filter({hasText:'確認複製'}).click();
 await page.evaluate(()=>{db.students[1].billingFamilyId='family-a';window.__finishClipboard()});
 expect(await page.evaluate(()=>db.collectionRecords)).toEqual([]);
});
test('finance overview refreshes month-end pending counts after cloud data arrives',async({page})=>{
 await page.evaluate(()=>{db.students[0].billingFamilyId='family-a';setFinanceWorkspaceMonth('2026-09');switchTab('finance');renderFinance()});
 const tasks=page.locator('#v181MonthTasks');
 await expect(tasks.locator('article').nth(0).locator('b')).toHaveText('1');
 await expect(tasks.locator('article').nth(1).locator('b')).toHaveText('1');
 await page.evaluate(()=>{db.lessons=[];renderFinance()});
 await expect(tasks.locator('article').nth(0).locator('b')).toHaveText('0');
 await expect(tasks.locator('article').nth(1).locator('b')).toHaveText('0');
});
test('localStorage quota falls back to durable IndexedDB without deleting old backups or blocking cloud enqueue',async({page})=>{
 await page.evaluate(()=>{
  localStorage.setItem('quota-test-preserved-backup','keep');
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===LS_KEY)throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value)};
  window.__danbridgeQueueCloudSave=()=>{window.__quotaCloudQueued=(window.__quotaCloudQueued||0)+1};
  window.__actualLocalSaveDB({skipRender:true});
 });
 await expect.poll(()=>page.evaluate(()=>window.__danbridgeLocalSnapshotState?.state)).toBe('saved');
 expect(await page.evaluate(()=>window.__danbridgeLocalSnapshotState.storage)).toBe('indexeddb');
 expect(await page.evaluate(()=>window.__quotaCloudQueued)).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('quota-test-preserved-backup'))).toBe('keep');
 const saved=await page.evaluate(async()=>JSON.parse((await window.__danbridgeReadLargeLocalSnapshot()).serialized));
 expect(saved.students.map(s=>s.id)).toEqual(['a','b']);expect(saved.lessons[0].id).toBe('l');
 await page.evaluate(()=>{db.students[0].name='newer';flushScheduleLocalSnapshot();db.students[0].name='newest';flushScheduleLocalSnapshot()});
 await expect.poll(()=>page.evaluate(async()=>JSON.parse((await window.__danbridgeReadLargeLocalSnapshot()).serialized).students[0].name)).toBe('newest');
});
test('single lesson deletion has a nonblocking confirmation and retains the existing cloud operation',async({page})=>{
 const nativeDialogs=[];page.on('dialog',async d=>{nativeDialogs.push(d.message());await d.dismiss()});
 await page.evaluate(()=>{window.__deleteActions=[];commitScheduleMutation=action=>window.__deleteActions.push(action);openLessonModal('2026-09-08','10:00','l')});
 await page.locator('#modalDeleteBtn').click();
 const dialog=page.getByRole('dialog',{name:'確認刪除課程',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('孩子甲｜2026-09-08 10:00–11:00');
 await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
 await page.evaluate(()=>{deleteCurrentLesson()});await expect(dialog).toHaveCount(1);
 expect(await page.evaluate(()=>db.lessons.length)).toBe(1);
 const overflow=await dialog.evaluate(el=>{const r=el.firstElementChild.getBoundingClientRect();return r.left<0||r.right>innerWidth+1});expect(overflow).toBe(false);
 await dialog.getByRole('button',{name:'確認刪除',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>db.lessons.length)).toBe(0);
 expect(await page.evaluate(()=>window.__deleteActions)).toEqual(['lesson.delete']);expect(nativeDialogs).toEqual([]);
});
test('cancel and Escape never delete the lesson',async({page})=>{
 await page.evaluate(()=>openLessonModal('2026-09-08','10:00','l'));
 for(const cancel of ['button','escape']){
  await page.locator('#modalDeleteBtn').click();
  const dialog=page.getByRole('dialog',{name:'確認刪除課程',exact:true});
  if(cancel==='button')await dialog.getByRole('button',{name:'取消',exact:true}).click();else await dialog.getByRole('button',{name:'取消',exact:true}).press('Escape');
  await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>db.lessons.map(l=>l.id))).toEqual(['l']);
 }
});
for(const change of ['cloud-record','permission','editor'])test(`delete confirmation fails closed after ${change} changes`,async({page})=>{
 await page.evaluate(()=>{window.__deleteActions=[];commitScheduleMutation=action=>window.__deleteActions.push(action);openLessonModal('2026-09-08','10:00','l')});
 await page.locator('#modalDeleteBtn').click();
 await page.evaluate(kind=>{
  if(kind==='cloud-record')db.lessons[0].end='12:00';
  if(kind==='permission')DanbridgeAccess.setContext({readOnly:true});
  if(kind==='editor')document.getElementById('lessonId').value='different-lesson';
 },change);
 await page.getByRole('dialog',{name:'確認刪除課程',exact:true}).getByRole('button',{name:'確認刪除',exact:true}).click();
 expect(await page.evaluate(()=>db.lessons.map(l=>l.id))).toEqual(['l']);expect(await page.evaluate(()=>window.__deleteActions)).toEqual([]);
});
