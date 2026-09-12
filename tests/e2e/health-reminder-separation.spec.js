const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
const line=source.split('\n').find(line=>line.trimStart().startsWith('metrics.innerHTML='));
const capacitySource=source.slice(source.indexOf(' const capacity=ownerHealthData?.roleCapacity;'),source.indexOf('\n',source.indexOf("alerts.push({level:'pending',message:`${healthFreshness.state")));
for(const freshness of ['current','stale'])test(`capacity reminder renders without reporting sync failure (${freshness})`,async({page})=>{
 await page.goto('/tests/fixtures/native-display-cadence.html');
 await page.evaluate(({capacitySource,freshness})=>{
  const ownerHealthData={roleCapacity:{schema:'danbridge-role-capacity-v1',maximumBytes:622865,budgetBytes:800000}},healthFreshness={state:freshness},alerts=[];
  new Function('ownerHealthData','healthFreshness','alerts',capacitySource)(ownerHealthData,healthFreshness,alerts);
  const output=document.createElement('output');output.id='capacity-reminder';output.textContent=alerts.map(row=>row.message).join('\n');document.body.append(output);
 },{capacitySource,freshness});
 await expect(page.locator('#capacity-reminder')).toContainText('78% 安全預算');
 await expect(page.locator('#capacity-reminder')).toContainText('不會自動刪除資料');
 await expect(page.locator('#capacity-reminder')).not.toContainText('同步失敗');
 if(freshness==='stale')await expect(page.locator('#capacity-reminder')).toContainText('上次檢查：');
});
test('health dashboard keeps delivered unread notices separate from unsent batches',async({page})=>{
 await page.goto('/tests/fixtures/native-display-cadence.html');
 await page.evaluate(({line})=>{
  const metrics=document.createElement('section');metrics.id='health-metrics';document.body.append(metrics);
  const report={counts:{lessons:20,students:10,teachers:4},authority:{recordAuthority:true},estimatedMainDocumentBytes:1000,shardPreflight:{totalChunks:1,totalRecords:34},ownerHealth:{state:'healthy',freshness:'current',checkedAt:'2026-09-12T07:00:00Z',configurationVerified:true,pitrEnabled:true,deleteProtectionEnabled:true,metrics:{recentErrors:0,pendingRequests:0,unreadNotifications:178}},flags:{pendingCloudRequests:0,schedulerLocalQueue:0,schedulerQuarantined:0,roleViewUploading:false,roleViewQueued:false,notificationBatches:0}};
  const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  new Function('metrics','report','escapeHTML','formatHealthBytes','ownerSyncHealthLabel','activeRecordPageController','DANBRIDGE_ENVIRONMENT',line)(metrics,report,escapeHTML,n=>n+' B',()=> '同步完成',null,'production');
 },{line});
 await expect(page.locator('.sync-health-metric').filter({has:page.locator('span',{hasText:'Owner 未讀通知'})})).toHaveText('Owner 未讀通知178 筆待閱讀');
 await expect(page.locator('.sync-health-metric').filter({has:page.locator('span',{hasText:'課表通知'})})).toHaveText('課表通知待送 0 批');
 await expect(page.locator('.sync-health-metric').filter({has:page.locator('span',{hasText:'後端健康'})})).toContainText('正常');
});
