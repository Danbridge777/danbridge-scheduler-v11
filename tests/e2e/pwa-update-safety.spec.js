const {test,expect}=require('@playwright/test');
async function open(page,{syncSafe=true,student='',teacher='',dialog=false}={}){
 await page.route('**/tests/fixtures/update-safety.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><header><div class="header-auth-actions"></div></header><input id="studentName"><input id="teacherName"></body></html>'}));
 await page.goto('/tests/fixtures/update-safety.html');
 await page.evaluate(({syncSafe,student,teacher,dialog})=>{
  window.__syncSafe=syncSafe;window.__danbridgeCanReloadForUpdate=()=>window.__syncSafe;
  document.getElementById('studentName').value=student;document.getElementById('teacherName').value=teacher;
  if(dialog){const d=document.createElement('dialog');d.innerHTML='<p>未儲存</p>';document.body.append(d);d.showModal()}
  const worker=new EventTarget();worker.state='installed';worker.postMessage=message=>window.__updatePosts.push(message);
  const registration=new EventTarget();registration.waiting=worker;registration.update=async()=>{};
  const service=new EventTarget();service.controller={};service.register=async()=>registration;
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:service});window.__updatePosts=[];window.__updateWorker=worker;
 },{syncSafe,student,teacher,dialog});
 await page.addScriptTag({url:'/js/core/pwa-installation.js'});
 await page.evaluate(()=>window.dispatchEvent(new Event('load')));
 await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
}
for(const blocker of ['pending','student','teacher','dialog'])test(`自動更新保留 ${blocker}，完成後自行接管`,async({page})=>{
 const state={syncSafe:blocker!=='pending',student:blocker==='student'?'未儲存的學生':'',teacher:blocker==='teacher'?'未儲存的老師':'',dialog:blocker==='dialog'};
 await open(page,state);await page.waitForTimeout(150);
 expect(await page.evaluate(()=>window.__updatePosts)).toEqual([]);await expect(page.locator('.pwa-update-now')).toBeEnabled();
 await expect(page.locator('#pwaUpdateBanner')).toContainText(blocker==='pending'?'正在等候同步':'正在等候編輯');
 await page.evaluate(blocker=>{
  if(blocker==='pending')window.__syncSafe=true;
  else if(blocker==='dialog')document.querySelector('dialog')?.close();
  else document.getElementById(blocker+'Name').value='';
  window.dispatchEvent(new Event('danbridge:update-safety-change'));
 },blocker);
 await expect.poll(()=>page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
});
test('接受更新之後新操作到達，啟用回呼仍重新確認，保留輸入與網址',async({page})=>{
 await open(page);await expect.poll(()=>page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
  await page.evaluate(()=>{window.__syncSafe=false;document.getElementById('studentName').value='不能遺失';window.__updateWorker.state='activated';navigator.serviceWorker.controller=window.__updateWorker;window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await expect(page.locator('.pwa-update-now')).toBeEnabled();await expect(page.locator('#studentName')).toHaveValue('不能遺失');expect(page.url()).toContain('update-safety.html');
});
test('已確認同步且沒有編輯表單才重新載入',async({page})=>{
 await open(page);await expect.poll(()=>page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
 await page.evaluate(()=>{window.__updateWorker.state='activated';navigator.serviceWorker.controller=window.__updateWorker;window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await page.waitForURL(/__danbridge_refresh=/);expect(page.url()).toContain('update-safety.html');
});

test('新版啟用但舊 worker 仍控制分頁時不刷新，接管後才更新',async({page})=>{
 await open(page);await expect.poll(()=>page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
 await page.evaluate(()=>{window.__updateWorker.state='activated';window.__updateWorker.dispatchEvent(new Event('statechange'))});
 expect(page.url()).not.toContain('__danbridge_refresh');await expect(page.locator('.pwa-update-now')).toBeDisabled();
 await page.evaluate(()=>{navigator.serviceWorker.controller=window.__updateWorker;navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))});
 await page.waitForURL(/__danbridge_refresh=/);
});
test('慢速或失效 worker 不以計時器強制刷新，保留分頁並可重試',async({page})=>{
 await page.clock.install();await open(page);await page.clock.fastForward(100);expect(await page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
 await page.clock.fastForward(1900);expect(page.url()).not.toContain('__danbridge_refresh');
 await expect(page.locator('.pwa-update-now')).toBeDisabled();
 await page.clock.fastForward(19000);expect(page.url()).not.toContain('__danbridge_refresh');
 await expect(page.locator('.pwa-update-now')).toBeEnabled();await expect(page.locator('#pwaUpdateBanner')).toContainText('目前畫面與資料已保留');
 await page.locator('.pwa-update-now').click();
 await page.evaluate(()=>{window.__updateWorker.state='redundant';window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await expect(page.locator('.pwa-update-now')).toBeDisabled();await expect(page.locator('#pwaUpdateBanner')).toContainText('等待下一個可用版本');expect(page.url()).not.toContain('__danbridge_refresh');
});
