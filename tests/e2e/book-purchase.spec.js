const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
async function setup(page){
 await isolateApplicationAuth(page);await page.goto('/index.html');
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(e=>{e.inert=false;e.removeAttribute('aria-hidden')});
  window.DanbridgeAccess.setContext({role:'owner',email:'one@example.com'});
  window.__bookServer=[{id:'other-book',title:'Other teacher book',quantity:1,note:'<script>alert(1)</script>',publisher:'Test',isbn:'',revision:1,createdByUid:'other_user',createdByEmail:'two@example.com',createdByName:'Other teacher'}];window.__bookCalls=[];window.__holdBooks=true;
  window.__danbridgeBookPurchaseCall=async request=>{if(request.action==='list')return{ok:true,records:structuredClone(window.__bookServer),nextCursor:''};window.__bookCalls.push(request);if(window.__holdBooks)await new Promise(r=>window.__releaseBook=r);if(window.__failBooks)throw Error('fixture offline');const prior=window.__bookServer.find(r=>r.id===request.id);const record={...prior,...request.input,id:request.id,revision:request.expectedRevision+1,createdByUid:'own_user',createdByEmail:'one@example.com',createdByName:'Self',deleted:request.action==='delete'};window.__bookServer=[...window.__bookServer.filter(r=>r.id!==record.id),record];return{ok:true,record}};
  window.__danbridgeSetBookIdentity({uid:'own_user',email:'one@example.com',name:'Self'});window.switchTab('bookPurchase');
 });
}
test('all role navigation, other-user read-only, optimistic create/edit/delete remains responsive while cloud held',async({page})=>{
 await setup(page);page.on('dialog',d=>d.accept());
 await expect(page.locator('#bookPurchaseRows')).toContainText('Other teacher book');await expect(page.locator('#bookPurchaseRows [data-book-edit]')).toHaveCount(0);
 for(const role of ['owner','branch_manager','teacher']){
  await page.evaluate(role=>{window.DanbridgeAccess.setContext({role,email:'one@example.com',teacherId:'teacher_own',branchIds:['east'],canManageSchedule:false});window.DanbridgeRoleResponsive?.apply?.();window.switchTab('bookPurchase')},role);
  await expect(page.locator('nav [data-tab="bookPurchase"]')).toBeVisible();await expect(page.locator('#bookPurchase')).toBeVisible();
 }
 await page.locator('#bookTitle').fill('My new book');const started=Date.now();await page.locator('#bookPurchaseSave').click();await expect(page.locator('#bookPurchaseRows')).toContainText('My new book');expect(Date.now()-started).toBeLessThan(1000);
 await expect(page.locator('#bookPurchaseRows')).toContainText('待同步');await expect(page.locator('#bookPurchaseSave')).toBeEnabled();
 await page.locator('#bookPurchaseRows [data-book-edit]').click();await page.locator('#bookTitle').fill('Edited before cloud');await page.locator('#bookPurchaseSave').click();await expect(page.locator('#bookPurchaseRows')).toContainText('Edited before cloud');
 await page.locator('#bookPurchaseRows [data-book-delete]').click();await expect(page.locator('#bookPurchaseRows')).not.toContainText('Edited before cloud');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-outbox-v1:own_user:op:')).length)).toBe(3);
 await page.evaluate(()=>{window.__holdBooks=false;window.__releaseBook()});await expect(page.locator('#bookPurchaseStatus')).toHaveText('已同步');
 expect(await page.evaluate(()=>window.__bookCalls.map(r=>[r.action,r.expectedRevision]))).toEqual([['create',0],['update',1],['delete',2]]);
 expect(await page.evaluate(()=>window.__bookServer.find(r=>r.title==='Edited before cloud')?.deleted)).toBe(true);
 await expect(page.locator('#bookPurchaseRows')).toContainText('<script>alert(1)</script>');
 if((page.viewportSize()?.width||0)>1100){
  const compact=await page.locator('#bookPurchaseRows .book-purchase-item').first().evaluate(item=>({display:getComputedStyle(item).display,columns:getComputedStyle(item).gridTemplateColumns.split(' ').length,height:item.getBoundingClientRect().height,overflow:item.scrollWidth>item.clientWidth+2}));
  expect(compact.display).toBe('grid');expect(compact.columns).toBe(4);expect(compact.height).toBeLessThan(80);expect(compact.overflow).toBe(false);
 }
});
test('failed background writes retain draft, same operation retries, cross-user isolation and centered controls',async({page})=>{
 await setup(page);await page.evaluate(()=>{window.__holdBooks=false;window.__failBooks=true});
 await page.locator('#bookTitle').fill('Retained draft');await page.locator('#bookPurchaseSave').click();await expect(page.locator('#bookPurchaseStatus')).toContainText('草稿已保留');
 const op=await page.evaluate(()=>window.__bookCalls[0].operationId);
 await page.evaluate(()=>{window.__danbridgeSetBookIdentity({uid:'other_user',email:'two@example.com'});window.switchTab('bookPurchase')});await expect(page.locator('#bookPurchaseRows')).not.toContainText('Retained draft');
 await page.evaluate(()=>{window.__failBooks=false;window.__danbridgeSetBookIdentity({uid:'own_user',email:'one@example.com'});window.switchTab('bookPurchase')});await expect(page.locator('#bookPurchaseStatus')).toHaveText('已同步');
 expect(await page.evaluate(()=>window.__bookCalls.at(-1).operationId)).toBe(op);
 const fieldFont=await page.evaluate(()=>document.documentElement.clientWidth<=700?'16px':'15px');
 for(const id of ['bookTitle','bookPublisher','bookIsbn','bookQuantity','bookPurchaseSave']){const css=await page.locator('#'+id).evaluate(el=>({align:getComputedStyle(el).textAlign,font:getComputedStyle(el).fontSize,height:el.getBoundingClientRect().height}));expect(css.align).toBe('center');expect(css.font).toBe(id==='bookPurchaseSave'?'14px':fieldFont);expect(css.height).toBe(48)}
 const overflow=await page.locator('#bookPurchase').evaluate(el=>el.scrollWidth>el.clientWidth+2);expect(overflow).toBe(false);
});

test('twenty consecutive additions stay interactive; background queue synchronizes every request exactly once',async({page},testInfo)=>{
 await setup(page);
 await page.evaluate(()=>{window.__bookPaintTimes=[];document.getElementById('bookPurchaseForm').addEventListener('submit',()=>{const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__bookPaintTimes.push(performance.now()-start)))},true)});
 for(let i=0;i<20;i++){
  await page.locator('#bookTitle').fill(`Repeated book ${String(i).padStart(2,'0')}`);await page.locator('#bookPurchaseSave').click();
  await expect(page.locator('#bookPurchaseRows .book-purchase-item')).toHaveCount(i+2);await expect(page.locator('#bookPurchaseSave')).toBeEnabled();
 }
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-outbox-v1:own_user:op:')).length)).toBe(20);
 await expect.poll(()=>page.evaluate(()=>window.__bookPaintTimes.length)).toBe(20);
 const paints=await page.evaluate(()=>window.__bookPaintTimes);await testInfo.attach('local-ui-paint-ms',{body:JSON.stringify({samples:paints,maxMs:Math.max(...paints),meanMs:paints.reduce((a,b)=>a+b,0)/paints.length}),contentType:'application/json'});
 expect(Math.max(...paints)).toBeLessThan(250);
 await page.locator('#bookPurchase').screenshot({path:testInfo.outputPath('books-pending.png')});
 await page.evaluate(()=>{window.__holdBooks=false;window.__releaseBook()});await expect(page.locator('#bookPurchaseStatus')).toHaveText('已同步');
 expect(await page.evaluate(()=>new Set(window.__bookCalls.map(r=>r.operationId)).size)).toBe(20);
 expect(await page.evaluate(()=>window.__bookServer.filter(r=>r.createdByUid==='own_user').length)).toBe(20);
});
test('corrupt saved queue is never overwritten, while notification-driven refresh immediately receives other-user records',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{localStorage.setItem('danbridge-books-outbox-v1:own_user','broken-draft');window.__danbridgeSetBookIdentity({uid:'own_user',email:'one@example.com'})});
 await page.locator('#bookTitle').fill('Preserve input');await page.locator('#bookPurchaseSave').click();
 await expect(page.locator('#bookPurchaseStatus')).toContainText('避免覆蓋');await expect(page.locator('#bookTitle')).toHaveValue('Preserve input');
 expect(await page.evaluate(()=>localStorage.getItem('danbridge-books-outbox-v1:own_user'))).toBe('broken-draft');
 await page.evaluate(()=>{window.__bookServer.push({...window.__bookServer[0],id:'incoming_notice_book',title:'Notification arrival'});window.dispatchEvent(new Event('danbridge:book-purchase-changed'))});
 await expect(page.locator('#bookPurchaseRows')).toContainText('Notification arrival');
 expect(await page.evaluate(()=>window.__bookCalls.length)).toBe(0);
});
test('two tabs of the same account never erase each other’s pending requests',async({page,context})=>{
 const other=await context.newPage();await setup(page);await setup(other);
 await page.locator('#bookTitle').fill('First tab draft');await page.locator('#bookPurchaseSave').click();
 await other.locator('#bookTitle').fill('Second tab draft');await other.locator('#bookPurchaseSave').click();
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-outbox-v1:own_user:op:')).length)).toBe(2);
 await page.evaluate(()=>{window.__holdBooks=false;window.__releaseBook()});await expect(page.locator('#bookPurchaseStatus')).toHaveText('已同步');
 const remaining=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-outbox-v1:own_user:op:')).map(k=>JSON.parse(localStorage.getItem(k)).optimistic.title));expect(remaining).toEqual(['Second tab draft']);
 await other.evaluate(()=>{window.__holdBooks=false;window.__releaseBook()});await expect(other.locator('#bookPurchaseStatus')).toHaveText('已同步');
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-outbox-v1:own_user:op:')).length)).toBe(0);await other.close();
});
test('version conflict preserves draft, never overwrites cloud, and requires explicit re-edit using newest revision',async({page})=>{
 await setup(page);page.on('dialog',d=>d.accept());
 await page.evaluate(()=>{window.__holdBooks=false;window.__bookServer.push({id:'conflict_book_353',title:'Original',quantity:1,note:'',publisher:'',isbn:'',revision:1,createdByUid:'own_user',createdByEmail:'one@example.com'});window.dispatchEvent(new Event('danbridge:book-purchase-changed'))});
 await page.locator('[data-book-edit="conflict_book_353"]').click();await page.locator('#bookTitle').fill('My preserved revision');
 await page.evaluate(()=>{const base=window.__danbridgeBookPurchaseCall;window.__bookServer.find(r=>r.id==='conflict_book_353').revision=5;window.__bookServer.find(r=>r.id==='conflict_book_353').title='Remote new version';window.__danbridgeBookPurchaseCall=async r=>{if(r.action!=='list'&&r.expectedRevision<5)throw Error('這筆書籍已更新，請重新載入後再編輯');return base(r)}});
 await page.locator('#bookPurchaseSave').click();await expect(page.locator('#bookPurchaseRecover')).toBeVisible();
 expect(await page.evaluate(()=>window.__bookServer.find(r=>r.id==='conflict_book_353').title)).toBe('Remote new version');
 await page.locator('#bookPurchaseRecover').click();await expect(page.locator('#bookTitle')).toHaveValue('My preserved revision');await expect(page.locator('#bookPurchaseRecover')).toBeHidden();
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('danbridge-books-recovery-v1:own_user:')).length)).toBe(1);
 expect(await page.evaluate(()=>window.__bookServer.find(r=>r.id==='conflict_book_353').title)).toBe('Remote new version');
 await page.locator('#bookPurchaseSave').click();await expect(page.locator('#bookPurchaseStatus')).toHaveText('已同步');expect(await page.evaluate(()=>window.__bookCalls.at(-1).expectedRevision)).toBe(5);
});

test('book summary, sync state and search labels switch languages repeatedly without altering drafts or queued writes',async({page})=>{
 await setup(page);
 await page.locator('#bookTitle').fill('中文書名：老師筆記');
 await page.locator('#bookQuantity').fill('2');
 await page.locator('#bookPurchaseSave').click();
 await page.locator('#bookTitle').fill('未送出的中文草稿');
 for(let round=0;round<3;round++){
  await page.evaluate(()=>window.DanbridgeLanguage.setLanguage('en'));
  await expect(page.locator('#bookPurchaseCount')).toHaveText('2 requests · 3 books');
  await expect(page.locator('#bookPurchaseStatus')).toHaveText('1 pending sync');
  await expect(page.locator('#bookPurchaseSearch')).toHaveAttribute('aria-label','Search title, ISBN or requester');
  await expect(page.locator('#bookPurchaseScope')).toHaveAttribute('aria-label','Request Scope');
  await expect(page.locator('#bookPurchaseRows')).toContainText('中文書名：老師筆記');
  await expect(page.locator('#bookTitle')).toHaveValue('未送出的中文草稿');
  await page.evaluate(()=>window.DanbridgeLanguage.setLanguage('zh'));
  await expect(page.locator('#bookPurchaseCount')).toHaveText('2 項需求 · 3 本');
  await expect(page.locator('#bookPurchaseStatus')).toHaveText('1 筆待同步');
  await expect(page.locator('#bookPurchaseSearch')).toHaveAttribute('aria-label','搜尋書名、ISBN或申請者');
 }
 await page.evaluate(()=>{window.DanbridgeLanguage.setLanguage('en');window.__holdBooks=false;window.__releaseBook()});
 await expect(page.locator('#bookPurchaseStatus')).toHaveText('Synced');
 await expect(page.locator('#bookTitle')).toHaveValue('未送出的中文草稿');
 expect(await page.evaluate(()=>window.__bookCalls.map(r=>[r.action,r.input?.title,r.input?.quantity]))).toEqual([['create','中文書名：老師筆記',2]]);
 await expect(page.locator('#bookPurchaseRows .book-purchase-quantity').first()).toHaveText('1 book');
 await expect(page.locator('#bookPurchaseRows .book-purchase-quantity').last()).toHaveText('2 books');
 await page.locator('#bookPurchaseSearch').fill('找不到的書籍');
 await expect(page.locator('#bookPurchaseCount')).toHaveText('0 requests · 0 books');
 await expect(page.locator('#bookPurchaseRows')).toHaveText('No matching book requests');
});
