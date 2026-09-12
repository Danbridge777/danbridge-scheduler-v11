const {test,expect}=require('@playwright/test');
async function open(page){
 await page.route('**/tests/fixtures/update-safety.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><header><div class="header-auth-actions"></div></header><input id="studentName"><input id="teacherName"></body></html>'}));
 await page.goto('/tests/fixtures/update-safety.html');
 await page.evaluate(()=>{
  window.__syncSafe=true;window.__danbridgeCanReloadForUpdate=()=>window.__syncSafe;
  const worker=new EventTarget();worker.state='installed';worker.postMessage=message=>window.__updatePosts.push(message);
  const registration=new EventTarget();registration.waiting=worker;registration.update=async()=>{};
  const service=new EventTarget();service.controller={};service.register=async()=>registration;
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:service});window.__updatePosts=[];window.__updateWorker=worker;
 });
 await page.addScriptTag({url:'/js/core/pwa-installation.js'});
 await page.evaluate(()=>window.dispatchEvent(new Event('load')));
 await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
}
for(const blocker of ['pending','student','teacher','dialog'])test(`立即更新保留 ${blocker}，不送切版指令`,async({page})=>{
 await open(page);
 await page.evaluate(blocker=>{if(blocker==='pending')window.__syncSafe=false;else if(blocker==='dialog'){const d=document.createElement('dialog');d.innerHTML='<p>未儲存</p>';document.body.append(d);d.showModal()}else document.getElementById(blocker+'Name').value='未儲存的姓名'},blocker);
 // A modal intentionally makes the outer button inert. Invoke its actual
 // handler to cover an already accepted update/activation racing an editor.
 if(blocker==='dialog')await page.locator('.pwa-update-now').evaluate(button=>button.click());else await page.locator('.pwa-update-now').click();
 expect(await page.evaluate(()=>window.__updatePosts)).toEqual([]);await expect(page.locator('.pwa-update-now')).toBeEnabled();
 await expect(page.locator('#pwaUpdateBanner')).toContainText(blocker==='pending'?'尚有同步':'請先儲存');
});
test('接受更新之後新操作到達，啟用回呼仍重新確認，保留輸入與網址',async({page})=>{
 await open(page);await page.locator('.pwa-update-now').click();expect(await page.evaluate(()=>window.__updatePosts)).toEqual([{type:'SKIP_WAITING'}]);
  await page.evaluate(()=>{window.__syncSafe=false;document.getElementById('studentName').value='不能遺失';window.__updateWorker.state='activated';navigator.serviceWorker.controller=window.__updateWorker;window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await expect(page.locator('.pwa-update-now')).toBeEnabled();await expect(page.locator('#studentName')).toHaveValue('不能遺失');expect(page.url()).toContain('update-safety.html');
});
test('已確認同步且沒有編輯表單才重新載入',async({page})=>{
 await open(page);await page.locator('.pwa-update-now').click();
 await page.evaluate(()=>{window.__updateWorker.state='activated';navigator.serviceWorker.controller=window.__updateWorker;window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await page.waitForURL(/__danbridge_refresh=/);expect(page.url()).toContain('update-safety.html');
});

test('新版啟用但舊 worker 仍控制分頁時不刷新，接管後才更新',async({page})=>{
 await open(page);await page.locator('.pwa-update-now').click();
 await page.evaluate(()=>{window.__updateWorker.state='activated';window.__updateWorker.dispatchEvent(new Event('statechange'))});
 expect(page.url()).not.toContain('__danbridge_refresh');await expect(page.locator('.pwa-update-now')).toBeDisabled();
 await page.evaluate(()=>{navigator.serviceWorker.controller=window.__updateWorker;navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))});
 await page.waitForURL(/__danbridge_refresh=/);
});
test('慢速或失效 worker 不以計時器強制刷新，保留分頁並可重試',async({page})=>{
 await page.clock.install();await open(page);await page.locator('.pwa-update-now').click();
 await page.clock.fastForward(1900);expect(page.url()).not.toContain('__danbridge_refresh');
 await expect(page.locator('.pwa-update-now')).toBeDisabled();
 await page.clock.fastForward(19000);expect(page.url()).not.toContain('__danbridge_refresh');
 await expect(page.locator('.pwa-update-now')).toBeEnabled();await expect(page.locator('#pwaUpdateBanner')).toContainText('已保留目前畫面');
 await page.locator('.pwa-update-now').click();
 await page.evaluate(()=>{window.__updateWorker.state='redundant';window.__updateWorker.dispatchEvent(new Event('statechange'))});
 await expect(page.locator('.pwa-update-now')).toBeEnabled();expect(page.url()).not.toContain('__danbridge_refresh');
});
