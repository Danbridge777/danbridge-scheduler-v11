const {test,expect}=require('@playwright/test');

test('登入初始化卡住會顯示可操作的逾時提示，重新載入不清除待送資料',async({page})=>{
 await page.clock.install();
 await page.route('**/js/core/firebase-auth-and-cloud-sync.module.js*',route=>route.fulfill({contentType:'text/javascript',body:'/* simulate initialization that never becomes ready */'}));
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>localStorage.setItem('fixture-pending-operation','must-preserve'));
 await page.clock.runFor(16000);
 await expect(page.getByRole('alert')).toContainText('尚未完成身分驗證');
 await expect(page.locator('body')).toHaveClass(/auth-locked/);
 await page.getByRole('button',{name:'重新載入登入頁',exact:true}).click();await page.waitForLoadState('load');
 expect(await page.evaluate(()=>localStorage.getItem('fixture-pending-operation'))).toBe('must-preserve');
 await expect(page.locator('body')).toHaveClass(/auth-locked/);
});

test('登入模組及時就緒時，不另外顯示重載按鈕或中斷登入',async({page})=>{
 await page.clock.install();
 await page.route('**/js/core/firebase-auth-and-cloud-sync.module.js*',route=>route.fulfill({contentType:'text/javascript',body:"const button=document.querySelector('#authScreen .auth-google-btn');button.id='googleCloudLogin';button.disabled=false;"}));
 await page.goto('/index.html',{waitUntil:'load'});await page.clock.runFor(16000);
 await expect(page.locator('#googleCloudLogin')).toBeEnabled();await expect(page.locator('#authConnectionRecovery')).toHaveCount(0);
});
