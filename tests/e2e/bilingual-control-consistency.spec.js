const {test,expect}=require('@playwright/test');
const {isolateApplicationAuth}=require('./helpers/isolate-application-auth');

test.beforeEach(async({page})=>isolateApplicationAuth(page));

const SECTION_IDS=['dashboard','students','teachers','teacherLeave','calendar','lessons','makeups','camps','winterCamps','settlement','finance','data','security'];

async function unlockOwnerWorkspace(page){
 await page.goto('/index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  document.body.classList.remove('auth-locked','teacher-cloud-role','branch-manager-cloud-role','scheduler-cloud-role');
  document.getElementById('authScreen')?.classList.add('hidden');
  document.querySelectorAll('[data-auth-isolated]').forEach(element=>{element.inert=false;element.removeAttribute('aria-hidden');delete element.dataset.authIsolated});
  window.DanbridgeAccess?.setContext({role:'owner',email:'owner@example.com',teacherId:'',canManageSchedule:false});
  window.currentCloudRole=()=> 'owner';
  window.renderAll?.();
 });
}

async function auditCurrentSection(page,language,section){
 return page.evaluate(({language,section})=>{
  const tolerance=1.5;
  const viewportWidth=document.documentElement.clientWidth;
  const root=document.querySelector('main section.active');
  const visible=element=>{
   const style=getComputedStyle(element),rect=element.getBoundingClientRect();
   return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'&&rect.width>0&&rect.height>0;
  };
  const deliberateScroller=element=>element.closest('.table-wrap,.change-table-wrap,.backup-table-wrap,.calendar-shell,.notification-tabs,.camp-date-scroll,body>nav');
  const key=element=>element.id||element.getAttribute('name')||element.getAttribute('aria-label')||element.textContent.trim().replace(/\s+/g,' ').slice(0,36)||element.tagName;
  const issues=[];
  if(!root)return{language,section,issues:['missing-active-section']};

  for(const element of root.querySelectorAll('button,.btn,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]),select,textarea')){
   if(!visible(element)||deliberateScroller(element))continue;
   const rect=element.getBoundingClientRect(),style=getComputedStyle(element),name=key(element);
   if(rect.left<-tolerance||rect.right>viewportWidth+tolerance)issues.push(`viewport:${name}:${Math.round(rect.left)}..${Math.round(rect.right)}/${viewportWidth}`);
   if(element.matches('button,.btn')&&(element.scrollWidth>element.clientWidth+tolerance||element.scrollHeight>element.clientHeight+tolerance))issues.push(`button-text-clipped:${name}:${element.clientWidth}x${element.clientHeight}/${element.scrollWidth}x${element.scrollHeight}`);
   const compactViewport=viewportWidth<=700;
   if(element.matches('.btn')){
    if(Math.abs(rect.height-48)>tolerance)issues.push(`button-height:${name}:${rect.height}`);
    if(Math.abs(parseFloat(style.fontSize)-14)>.2)issues.push(`button-font:${name}:${style.fontSize}`);
   }
   if(element.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]),select')){
    if(Math.abs(rect.height-48)>tolerance)issues.push(`control-height:${name}:${rect.height}`);
    if(Math.abs(parseFloat(style.fontSize)-(compactViewport?16:15))>.2)issues.push(`control-font:${name}:${style.fontSize}`);
   }
   if(element.matches('input[type=month]')){
    if(viewportWidth>700&&rect.width<190-tolerance)issues.push(`month-too-narrow:${name}:${rect.width}`);
    if(element.scrollWidth>element.clientWidth+tolerance)issues.push(`month-clipped:${name}:${element.clientWidth}/${element.scrollWidth}`);
   }
  }
  return{language,section,issues};
 },{language,section});
}

for(const language of ['zh','en']){
 test(`${language} every owner workspace keeps controls uniform and month text visible`,async({page})=>{
  await unlockOwnerWorkspace(page);
  await page.evaluate(language=>window.DanbridgeLanguage?.setLanguage(language),language);
  const results=[];
  for(const section of SECTION_IDS){
   await page.evaluate(section=>window.switchTab(section),section);
   await page.waitForTimeout(80);
   results.push(await auditCurrentSection(page,language,section));
  }
  const failures=results.flatMap(result=>result.issues.map(issue=>`${result.language}/${result.section}:${issue}`));
  expect(failures,JSON.stringify(results,null,2)).toEqual([]);
 });
}

test('English month controls keep a readable native date width on desktop and Safari',async({page})=>{
 await unlockOwnerWorkspace(page);
 await page.evaluate(()=>window.DanbridgeLanguage?.setLanguage('en'));
 const results=[];
 for(const section of SECTION_IDS){
  await page.evaluate(section=>window.switchTab(section),section);
  await page.waitForTimeout(60);
  results.push(...await page.locator('main section.active input[type=month]:visible').evaluateAll((elements,section)=>elements.map(element=>{
   const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
   return{section,id:element.id||element.name||'month',width:rect.width,height:rect.height,fontSize:style.fontSize,paddingLeft:style.paddingLeft,paddingRight:style.paddingRight};
  }),section));
 }
 expect(results.length).toBeGreaterThan(0);
 const expectedFont=await page.evaluate(()=>document.documentElement.clientWidth<=700?16:15);
 expect(results.filter(item=>item.width<188||Math.abs(item.height-48)>1.5||Math.abs(parseFloat(item.fontSize)-expectedFont)>.2),JSON.stringify(results,null,2)).toEqual([]);
});

for(const language of ['zh','en']){
 test(`${language} header, navigation and every dialog button stay readable`,async({page})=>{
  await unlockOwnerWorkspace(page);
  await page.evaluate(language=>window.DanbridgeLanguage?.setLanguage(language),language);
  const result=await page.evaluate(language=>{
   const tolerance=1.5,issues=[];
   const viewport={width:document.documentElement.clientWidth,height:document.documentElement.clientHeight};
   const visible=element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'&&rect.width>0&&rect.height>0};
   const inspect=(root,label)=>{
    const horizontalScroller=root===document.querySelector('body>nav')&&root.scrollWidth>root.clientWidth+1;
    for(const element of root.querySelectorAll('button,.btn,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=color]),select')){
     if(!visible(element))continue;
     const rect=element.getBoundingClientRect(),name=element.id||element.getAttribute('aria-label')||element.textContent.trim().replace(/\s+/g,' ').slice(0,36)||element.tagName;
     // Mobile/tablet navigation deliberately pages through a horizontal rail.
     // Items may be outside the viewport until scrolled, but their own label
     // must remain fully visible inside each navigation button.
     if(!horizontalScroller&&(rect.left<-tolerance||rect.right>viewport.width+tolerance))issues.push(`${label}:viewport:${name}`);
     if(element.matches('button,.btn')&&(element.scrollWidth>element.clientWidth+tolerance||element.scrollHeight>element.clientHeight+tolerance))issues.push(`${label}:button-text-clipped:${name}:${element.clientWidth}x${element.clientHeight}/${element.scrollWidth}x${element.scrollHeight}`);
    }
   };
   inspect(document.querySelector('body>header'),`${language}/header`);
   inspect(document.querySelector('body>nav'),`${language}/nav`);
   for(const backdrop of document.querySelectorAll('.modal-backdrop')){
    const dialog=backdrop.querySelector('.modal');if(!dialog)continue;
    backdrop.classList.add('show');
    inspect(dialog,`${language}/${backdrop.id||'dialog'}`);
    backdrop.classList.remove('show');
   }
   return{issues};
  },language);
  expect(result.issues,JSON.stringify(result,null,2)).toEqual([]);
 });
}

test('English action controls contain no untranslated Chinese UI labels',async({page})=>{
 await unlockOwnerWorkspace(page);
 await page.evaluate(()=>window.DanbridgeLanguage?.setLanguage('en'));
 const untranslated=[];
 for(const section of SECTION_IDS){
  await page.evaluate(section=>window.switchTab(section),section);
  await page.waitForTimeout(60);
  untranslated.push(...await page.locator('main section.active button:visible').evaluateAll((buttons,section)=>buttons.filter(button=>button.id!=='danbridgeLanguageToggle'&&/[\u3400-\u9fff]/u.test(button.textContent||'')).map(button=>`${section}:${button.id||button.textContent.trim()}`),section));
 }
 expect(untranslated).toEqual([]);
});

test('English navigation and schedule notification dialogs contain no untranslated Chinese controls',async({page})=>{
 await unlockOwnerWorkspace(page);
 await page.evaluate(()=>window.DanbridgeLanguage?.setLanguage('en'));
 const untranslated=await page.evaluate(()=>{
  const modal=document.getElementById('scheduleNotificationModal');
  if(modal){
   modal.hidden=false;
   const body=document.getElementById('scheduleNotificationBody');
   if(body)body.innerHTML='<p class="schedule-notification-lead"><b>老師請假異動</b><span>請假紀錄已更新</span></p><table><thead><tr><th>老師</th><th>日期</th><th>時間</th><th>類別</th><th>時數</th><th>狀態</th></tr></thead><tbody><tr><td>Test</td><td>2026-09-19</td><td>09:00–10:00</td><td>事假</td><td>1</td><td>有效</td></tr></tbody></table><div class="schedule-notification-actions"><button type="button" class="btn" data-leave-notification-open>查看請假紀錄</button></div><div class="schedule-notification-time">更新時間：2026/09/19 09:00</div>';
  }
  window.DanbridgeLanguage?.setLanguage('en');
  const roots=[document.querySelector('body>nav'),modal].filter(Boolean);
  return roots.flatMap(root=>[...root.querySelectorAll('button,h2,th,[data-leave-notification-open],.schedule-notification-lead,.schedule-notification-time')]
   .filter(element=>getComputedStyle(element).display!=='none'&&/[\u3400-\u9fff]/u.test(element.textContent||''))
   .map(element=>element.id||element.textContent.trim().replace(/\s+/g,' ').slice(0,80)));
 });
 expect(untranslated).toEqual([]);
});

test('dynamic teacher and notification controls stay translated after updates',async({page})=>{
 await unlockOwnerWorkspace(page);
 await page.evaluate(()=>window.DanbridgeLanguage?.setLanguage('en'));
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='dynamicTeacherTranslationProbe';
  host.innerHTML='<button id="teacherDashboardProbe">我的總覽</button><button id="teacherScheduleProbe">我的課表</button><button id="teacherReportProbe">填寫課程回報</button><button id="notificationProbe" aria-label="查看 12 則課表通知">課表通知（12）</button>';
  document.body.appendChild(host);
 });
 const probe=page.locator('#dynamicTeacherTranslationProbe');
 await expect(probe.getByRole('button',{name:'My Dashboard'})).toBeVisible();
 await expect(probe.getByRole('button',{name:'My Schedule'})).toBeVisible();
 await expect(probe.getByRole('button',{name:'Complete Lesson Report'})).toBeVisible();
 await expect(probe.getByRole('button',{name:'View 12 schedule notifications'})).toHaveText('Schedule Notifications (12)');
 await page.evaluate(()=>{
  const button=document.querySelector('#notificationProbe');
  button.textContent='課表通知（18）';
  button.setAttribute('aria-label','查看 18 則課表通知');
 });
 await expect(probe.getByRole('button',{name:'View 18 schedule notifications'})).toHaveText('Schedule Notifications (18)');
 await probe.evaluate(element=>element.remove());
});
