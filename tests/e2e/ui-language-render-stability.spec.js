const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');
async function open(page){
 await isolateApplicationAuth(page);await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.remove();document.querySelectorAll('[data-auth-isolated]').forEach(el=>{el.inert=false;el.removeAttribute('aria-hidden')});window.DanbridgeAccess.setContext({role:'owner'});window.currentCloudRole=()=> 'owner';window.DanbridgeLanguage.setLanguage('zh');const host=document.createElement('div');host.id='language-fixture';document.body.append(host)});
 await expect(page.locator('#danbridgeLanguageToggle')).toHaveText('EN');
}
test('dynamic UI additions never reset an unchanged document language or language button',async({page})=>{
 await open(page);
 const result=await page.evaluate(async()=>{
  await new Promise(resolve=>setTimeout(resolve,0));const changes=[],button=document.getElementById('danbridgeLanguageToggle');const observer=new MutationObserver(records=>changes.push(...records.map(r=>({target:r.target===document.documentElement?'html':'button',type:r.type,attribute:r.attributeName}))));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});observer.observe(button,{attributes:true,childList:true,subtree:true,characterData:true});
  for(let round=0;round<4;round++){
   document.getElementById('language-fixture').innerHTML=Array.from({length:40},(_,i)=>`<div><b>課表</b><span>${round}-${i} 測試學生</span><input placeholder="學生姓名 *" title="老師"></div>`).join('');
   await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));
  }
  observer.disconnect();return{changes:changes.length,lang:document.documentElement.lang,button:button.textContent,title:button.title,aria:button.getAttribute('aria-label'),label:document.querySelector('#language-fixture b').textContent};
 });
 expect(result).toEqual({changes:0,lang:'zh-Hant',button:'EN',title:'Switch to English',aria:'Switch to English',label:'課表'});
});
test('real language button still translates new labels and restores dynamic Chinese without touching input data',async({page})=>{
 await open(page);await page.locator('#danbridgeLanguageToggle').click();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.evaluate(()=>{document.getElementById('language-fixture').innerHTML='<b>課表</b><span>原來的學生</span><input value="學生本人輸入" placeholder="學生姓名 *" title="老師" aria-label="家長姓名">'});
 await expect(page.locator('#language-fixture b')).toHaveText('Schedule');await expect(page.locator('#language-fixture input')).toHaveAttribute('title','Teachers');await expect(page.locator('#language-fixture input')).toHaveAttribute('aria-label','Parent Name');
 await page.evaluate(()=>{document.querySelector('#language-fixture b').textContent='課程紀錄';document.querySelector('#language-fixture span').textContent='更新後的學生'});
 await expect(page.locator('#language-fixture b')).toHaveText('Lesson Records');
 await page.locator('#danbridgeLanguageToggle').click();await expect(page.locator('html')).toHaveAttribute('lang','zh-Hant');await expect(page.locator('#language-fixture b')).toHaveText('課程紀錄');await expect(page.locator('#language-fixture span')).toHaveText('更新後的學生');
 await expect(page.locator('#language-fixture input')).toHaveValue('學生本人輸入');await expect(page.locator('#language-fixture input')).toHaveAttribute('title','老師');await expect(page.locator('#language-fixture input')).toHaveAttribute('aria-label','家長姓名');
});
