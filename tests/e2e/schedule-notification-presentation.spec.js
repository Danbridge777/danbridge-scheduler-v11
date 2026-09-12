const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

test('40 堂及大量通知：實際通知版型的確認按鈕不需捲到底，內容仍可完整閱讀',async({page})=>{
 const source=fs.readFileSync(path.join(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
 const markup=source.slice(source.indexOf('function installScheduleNotificationUI()')).match(/modal\.innerHTML=`([^`]+)`/)[1];
 const index=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 const styles=[...index.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('\n');
 await page.route('**/notification-layout-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<body><div class="schedule-notification-backdrop">${markup}</div></body></html>`}));
 await page.goto('/notification-layout-fixture');
 for(const count of [40,160]){
  await page.locator('#scheduleNotificationBody').evaluate((body,count)=>{
   body.replaceChildren(...Array.from({length:count},(_,i)=>{const p=document.createElement('p');p.textContent=`第 ${i+1} 堂｜隔離測試學生｜2026-10-01 08:00–09:00`;p.style.padding='12px';return p}));
   body.scrollTop=0;
  },count);
  const before=await page.getByRole('button',{name:'知道了',exact:true}).boundingBox();
  const viewport=page.viewportSize();
  expect(before.y).toBeGreaterThanOrEqual(0);expect(before.y+before.height).toBeLessThanOrEqual(viewport.height);
  expect(before.x).toBeGreaterThanOrEqual(0);expect(before.x+before.width).toBeLessThanOrEqual(viewport.width);
  // Click without Playwright auto-scrolling the target into view.
  await page.getByRole('button',{name:'知道了',exact:true}).evaluate(button=>{button.onclick=()=>button.dataset.clicked='true'});
  await page.mouse.click(before.x+before.width/2,before.y+before.height/2);
  await expect(page.getByRole('button',{name:'知道了',exact:true})).toHaveAttribute('data-clicked','true');
  await page.locator('#scheduleNotificationBody').evaluate(body=>body.scrollTop=body.scrollHeight);
  await expect(page.locator('#scheduleNotificationBody p').last()).toBeInViewport();
  const after=await page.getByRole('button',{name:'知道了',exact:true}).boundingBox();
  expect(Math.abs(after.y-before.y)).toBeLessThan(1);
 }
});

test('真實瀏覽器：新通知不打斷新增、移動、刪除，未讀內容仍能手動查看',async({page})=>{
 await page.route('**/notification-presentation-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>
 <button id="notice" hidden>課表通知</button><button id="own">收到自己的更新</button><button id="other">收到老師的更新</button><button id="delegated">收到排課專員的更新</button>
 <section id="editor"><label>課程<input aria-label="課程" value="隔離測試課"></label><button id="move">移動</button><button id="remove">刪除</button></section>
 <button id="close">關閉編輯</button><output id="operations">0</output><dialog id="modal"><p id="details"></p><button id="later">稍後查看</button></dialog>
 <script type="module">
 import {createScheduleNotificationPresenter} from '/js/core/schedule-notification-presentation.js';
 let rows=[],busy=true,ops=0;
 const button=document.getElementById('notice'),modal=document.getElementById('modal');
 const presenter=createScheduleNotificationPresenter({document,button,getActor:()=>({uid:'owner-fixture',name:'Daniel'}),isBusy:()=>busy||modal.open,render:batch=>{document.getElementById('details').textContent=batch.map(x=>x.id).join(',');modal.showModal()}});
 document.getElementById('own').onclick=()=>{rows.push({id:'own-fixture',createdBy:'owner-fixture',createdByName:'Daniel'});presenter.update(rows)};
 document.getElementById('other').onclick=()=>{rows.push({id:'teacher-fixture',createdBy:'teacher-fixture'});presenter.update(rows)};
 document.getElementById('delegated').onclick=()=>{rows.push({id:'scheduler-fixture',createdBy:'owner-fixture',createdByName:'AA'});presenter.update(rows)};
 for(const id of ['move','remove'])document.getElementById(id).onclick=()=>document.getElementById('operations').textContent=String(++ops);
 document.getElementById('close').onclick=()=>{busy=false};document.getElementById('later').onclick=()=>modal.close();
 document.body.dataset.ready='true';
 </script></body></html>`}));
 await page.goto('/notification-presentation-fixture');
 await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'收到自己的更新'}).click();
 await expect(page.getByRole('button',{name:'查看 1 則課表通知'})).toBeVisible();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'收到老師的更新'}).click();
 await page.getByRole('button',{name:'收到排課專員的更新'}).click();
 await page.getByRole('textbox',{name:'課程'}).fill('隔離測試課－繼續操作');
 await page.getByRole('button',{name:'移動',exact:true}).click();
 await page.getByRole('button',{name:'刪除',exact:true}).click();
 await expect(page.locator('#operations')).toHaveText('2');
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'關閉編輯'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.locator('#details')).toHaveText('teacher-fixture');
 await page.getByRole('button',{name:'稍後查看'}).click();
 await page.getByRole('button',{name:'查看 3 則課表通知'}).click();
 await expect(page.locator('#details')).toHaveText('own-fixture');
});
