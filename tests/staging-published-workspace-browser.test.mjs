import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,webkit} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const script=await readFile('js/core/staging-published-workspace-bootstrap.js','utf8');
for(const [name,browserType] of Object.entries({chromium,webkit}))test(name+': acceptance storage isolation works in real browser without changing normal-page drafts or auth',{timeout:30000},async()=>{
 const browser=await browserType.launch({headless:true}),context=await browser.newContext({serviceWorkers:'block'}),runId=randomUUID();
 try{
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='danbridge-d8877-staging.web.app')return route.abort();
   return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated fixture</title>'+(url.search?'<script>'+script+'</script>':'')+'<main>Storage fixture only</main>'});
  });
  const normal=await context.newPage(),isolated=await context.newPage(),errors=[];isolated.on('pageerror',e=>errors.push(e.message));
  await normal.goto('https://danbridge-d8877-staging.web.app/');
  await normal.evaluate(()=>{localStorage.setItem('danbridge_scheduler_v1','normal fixture');localStorage.setItem('firebase:authUser:fixture','synthetic auth marker');sessionStorage.setItem('danbridge-session','normal session')});
  await isolated.goto('https://danbridge-d8877-staging.web.app/?publishedAcceptance='+runId);
  const result=await isolated.evaluate(async()=>{
   const before=localStorage.getItem('danbridge_scheduler_v1'),auth=localStorage.getItem('firebase:authUser:fixture');
   localStorage.setItem('danbridge_scheduler_v1','isolated fixture');sessionStorage.setItem('danbridge-session','isolated session');
   await new Promise((resolve,reject)=>{const request=indexedDB.open('danbridge-local-snapshots',1);request.onsuccess=()=>{request.result.close();resolve()};request.onerror=()=>reject(request.error)});
   return{before,auth,after:localStorage.getItem('danbridge_scheduler_v1'),prefix:window.__danbridgePublishedWorkspace.storagePrefix};
  });
  assert.equal(result.before,null);assert.equal(result.after,'isolated fixture');assert.equal(result.auth,'synthetic auth marker');assert.deepEqual(errors,[]);
  const retained=await normal.evaluate(async()=>({data:localStorage.getItem('danbridge_scheduler_v1'),auth:localStorage.getItem('firebase:authUser:fixture'),session:sessionStorage.getItem('danbridge-session'),databases:typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(row=>row.name):null}));
  assert.equal(retained.data,'normal fixture');assert.equal(retained.auth,'synthetic auth marker');assert.equal(retained.session,'normal session');
  if(retained.databases)assert.ok(retained.databases.includes(result.prefix+'danbridge-local-snapshots'));
 }finally{await context.close();await browser.close()}
});
