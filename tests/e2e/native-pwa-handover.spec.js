const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const source=fs.readFileSync(path.join(__dirname,'../../js/core/pwa-installation.js'),'utf8');

// Unlike pwa-update-safety, this uses real browser service workers. The local
// fixture serves the actual updater and two deliberately minimal SW versions;
// no Firebase account, production cache or application data is accessed.
test('native worker handover updates the accepted tab and preserves another tab’s unsaved form',async({browser})=>{
 let revision=1;
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url.startsWith('/sw.js')){
   res.setHeader('Content-Type','text/javascript; charset=utf-8');
   res.end(`// generation ${revision}\nself.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')e.waitUntil(self.skipWaiting());if(e.data?.type==='VERSION')e.ports[0].postMessage(${revision})});`);return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><meta charset="utf-8"><input id="studentName"><input id="teacherName"><script>window.__danbridgeCanReloadForUpdate=()=>true;</script><script>'+source+'</script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const context=await browser.newContext({serviceWorkers:'allow'});
 try{
  const first=await context.newPage();await first.goto(origin);
  await first.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
  const second=await context.newPage();await second.goto(origin);
  await second.locator('#studentName').fill('不可遺失的未存表單');const secondUrl=second.url();
  revision=2;
  await first.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await first.locator('.pwa-update-now').click();await first.waitForURL(/__danbridge_refresh=/);
  const activeVersion=await first.evaluate(()=>new Promise(resolve=>{
   const channel=new MessageChannel();channel.port1.onmessage=e=>{channel.port1.close();resolve(e.data)};
   navigator.serviceWorker.controller.postMessage({type:'VERSION'},[channel.port2]);
  }));
  expect(activeVersion).toBe(2);expect(second.url()).toBe(secondUrl);
  await expect(second.locator('#studentName')).toHaveValue('不可遺失的未存表單');
  await second.locator('.pwa-update-now').click();
  expect(second.url()).toBe(secondUrl);await expect(second.locator('#pwaUpdateBanner')).toContainText('請先儲存');
  await expect(second.locator('#studentName')).toHaveValue('不可遺失的未存表單');
 }finally{
  await context.close();await new Promise(resolve=>server.close(resolve));
 }
});
