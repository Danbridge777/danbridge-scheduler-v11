const {test,expect}=require('@playwright/test');

test('真實瀏覽器延遲回條：移動後立即移回、新增後立即刪除均保留最後操作',async({page})=>{
 await page.route('**/rapid-revert-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body>
 <button id="move">移到 B</button><button id="return">移回 A</button><button id="add">新增測試課</button><button id="move-new">立即移動新課</button><button id="remove">立即刪除測試課</button>
 <output id="ui"></output><output id="cloud"></output><output id="state"></output><output id="sending"></output>
 <script type="module">
 import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '/js/core/cloud-full-record-shadow.js';
 import {recordDataHash} from '/js/core/cloud-record-data-hash.js';
 import {applyActiveRecordOperation} from '/js/core/cloud-active-record-sync.js';
 import {createOperationJournal} from '/js/core/cloud-operation-journal.js';
 import {createActiveRecordPageController} from '/js/core/cloud-active-record-page-controller.js';
 const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 let ui=empty(),stored=[],sends=0;ui.lessons=[{id:'test-lesson',room:'A'}];const documents=empty();
 for(const op of buildFullRecordShadowPlan(documents,ui,{sourceHash:'fixture',environment:'production'}).operations)documents[op.collection||op.path.split('/')[3]].push({id:op.recordId||op.path.split('/').at(-1),data:structuredClone(op.payload)});
 const staleDocuments=structuredClone(documents),cloud=()=>rebuildFullRecordShadowDb(documents,{environment:'production'}).db;
 const render=()=>{document.getElementById('ui').textContent=JSON.stringify(ui.lessons);document.getElementById('cloud').textContent=JSON.stringify(cloud().lessons)};
 const controller=createActiveRecordPageController({environment:'production',role:'owner',deviceId:'browser-rapid-fixture',trustCommittedPlan:true,saveDelay:0,
 journal:createOperationJournal({storage:{load:async()=>stored,save:async rows=>{stored=structuredClone(rows)}}}),
 readDocuments:async()=>structuredClone(staleDocuments),getLocalDb:()=>structuredClone(ui),applyCloudDb:async next=>{ui=structuredClone(next);render()},
 persistConflicts:async()=>({backupId:'fixture-only'}),onStatus:status=>document.getElementById('state').textContent=status.state,
 send:async operation=>{document.getElementById('sending').textContent=String(++sends);await new Promise(resolve=>setTimeout(resolve,350));const rows=documents[operation.collection],index=rows.findIndex(row=>row.id===operation.recordId),result=applyActiveRecordOperation(index<0?null:rows[index].data,operation);if(result.write){const row={id:operation.recordId,data:structuredClone(result.payload)};if(index<0)rows.push(row);else rows[index]=row}render();return result}
 });
 const mutate=fn=>{fn();render();controller.queueLocalSave()};
 document.getElementById('move').onclick=()=>mutate(()=>ui.lessons.find(x=>x.id==='test-lesson').room='B');
 document.getElementById('return').onclick=()=>mutate(()=>ui.lessons.find(x=>x.id==='test-lesson').room='A');
 document.getElementById('add').onclick=()=>mutate(()=>ui.lessons.push({id:'new-test',room:'A'}));
 document.getElementById('move-new').onclick=()=>mutate(()=>ui.lessons.find(x=>x.id==='new-test').room='B');
 document.getElementById('remove').onclick=()=>mutate(()=>ui.lessons=ui.lessons.filter(x=>x.id!=='new-test'));
 await controller.acceptCloudSnapshot({db:cloud(),hash:recordDataHash(cloud()),activationEpoch:'epoch-browser-fixture',writeAllowed:true});render();document.body.dataset.ready='true';
 </script></body></html>`}));
 await page.goto('/rapid-revert-fixture');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'移到 B',exact:true}).click();await expect(page.locator('#sending')).toHaveText('1');
 await page.getByRole('button',{name:'移回 A',exact:true}).click();await expect(page.locator('#ui')).toHaveText('[{"id":"test-lesson","room":"A"}]');
 await expect(page.locator('#state')).toHaveText('complete');await expect(page.locator('#cloud')).toHaveText('[{"id":"test-lesson","room":"A"}]');
 await page.getByRole('button',{name:'新增測試課',exact:true}).click();await expect(page.locator('#sending')).toHaveText('3');
 await page.getByRole('button',{name:'立即刪除測試課',exact:true}).click();await expect(page.locator('#state')).toHaveText('complete');
 await expect(page.locator('#ui')).toHaveText('[{"id":"test-lesson","room":"A"}]');await expect(page.locator('#cloud')).toHaveText('[{"id":"test-lesson","room":"A"}]');
 // Keep the listener deliberately stale even after a transaction succeeds.
 // The next immediate action must use the exact confirmed revision.
 await page.getByRole('button',{name:'新增測試課',exact:true}).click();await expect(page.locator('#sending')).toHaveText('5');
 await page.getByRole('button',{name:'立即移動新課',exact:true}).click();
 await expect(page.locator('#ui')).toContainText('"id":"new-test","room":"B"');
 await expect(page.locator('#state')).toHaveText('complete');await expect(page.locator('#cloud')).toContainText('"id":"new-test","room":"B"');
 await page.getByRole('button',{name:'立即刪除測試課',exact:true}).click();await expect(page.locator('#state')).toHaveText('complete');
 await expect(page.locator('#cloud')).toHaveText('[{"id":"test-lesson","room":"A"}]');
});
