const {test,expect}=require('@playwright/test');

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

async function auditActiveSurface(page,label){
 return page.evaluate(label=>{
  const tolerance=1.5,viewport={width:document.documentElement.clientWidth,height:document.documentElement.clientHeight};
  const shown=element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'&&rect.width>0&&rect.height>0};
  const deliberateScroller=element=>element.closest('.table-wrap,.change-table-wrap,.backup-table-wrap,.calendar-shell,.notification-tabs,.camp-date-scroll,body>nav');
  const problems=[];
  if(document.documentElement.scrollWidth>viewport.width+tolerance)problems.push(`document-overflow:${document.documentElement.scrollWidth}>${viewport.width}`);
  const root=document.querySelector('main section.active');
  if(!root)return{label,problems:[...problems,'missing-active-section']};
  for(const element of root.querySelectorAll('.card,input:not([type=hidden]),select,textarea,button,h1,h2,h3,h4,p,label,.hint,.metric,.finance-metric,.sync-health-metric')){
   if(!shown(element)||deliberateScroller(element))continue;
   const rect=element.getBoundingClientRect();
   if(rect.left<-tolerance||rect.right>viewport.width+tolerance)problems.push(`viewport:${element.id||element.className||element.tagName}:${Math.round(rect.left)}..${Math.round(rect.right)}/${viewport.width}`);
   const card=element.closest('.card,.modal');
   if(card&&card!==element){const outer=card.getBoundingClientRect();if(rect.left<outer.left-tolerance||rect.right>outer.right+tolerance)problems.push(`card:${element.id||element.className||element.tagName}`)}
  }
  const allButtons=[...root.querySelectorAll('button')].filter(element=>shown(element)&&!deliberateScroller(element));
  const buttons=allButtons.filter(button=>button.matches('.btn'));
  for(const button of allButtons){
   const rect=button.getBoundingClientRect(),style=getComputedStyle(button);
   if(button.matches('.btn')&&Math.abs(rect.height-48)>tolerance)problems.push(`button-height:${button.id||button.textContent.trim().slice(0,24)}:${rect.height}`);
   if(button.matches('.btn')&&parseFloat(style.fontSize)!==14&&viewport.width>700)problems.push(`button-font:${button.id||button.textContent.trim().slice(0,24)}:${style.fontSize}`);
   if(button.scrollHeight>button.clientHeight+tolerance||button.scrollWidth>button.clientWidth+tolerance)problems.push(`button-text-overflow:${button.id||button.textContent.trim().slice(0,24)}`);
  }
  for(let index=0;index<allButtons.length;index++)for(let other=index+1;other<allButtons.length;other++){
   const a=allButtons[index],b=allButtons[other];if(a.contains(b)||b.contains(a))continue;
   const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),overlapX=Math.min(ar.right,br.right)-Math.max(ar.left,br.left),overlapY=Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top);
   if(overlapX>tolerance&&overlapY>tolerance)problems.push(`button-overlap:${a.id||a.textContent.trim().slice(0,16)}<>${b.id||b.textContent.trim().slice(0,16)}`);
  }
  return{label,problems,buttonCount:allButtons.length,actionButtonCount:buttons.length,viewport};
 },label);
}

test('signed-out entry is contained on every supported platform',async({page})=>{
 await page.goto('/index.html',{waitUntil:'load'});
 const result=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,authWidth:document.getElementById('authScreen').getBoundingClientRect().width,bodyWidth:document.body.getBoundingClientRect().width}));
 expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth+1);
 expect(result.authWidth).toBeLessThanOrEqual(result.clientWidth+1);
 expect(result.bodyWidth).toBeLessThanOrEqual(result.clientWidth+1);
});

test('all owner workspaces keep controls contained, uniform and non-overlapping',async({page})=>{
 await unlockOwnerWorkspace(page);
 const results=[];
 for(const id of SECTION_IDS){
  await page.evaluate(id=>window.switchTab(id),id);
  await page.waitForTimeout(80);
  results.push(await auditActiveSurface(page,id));
 }
 const failures=results.flatMap(result=>result.problems.map(problem=>`${result.label}:${problem}`));
 expect(failures,JSON.stringify(results,null,2)).toEqual([]);
});

test('header actions and every dialog stay inside the current viewport',async({page})=>{
 await unlockOwnerWorkspace(page);
 const result=await page.evaluate(()=>{
  const tolerance=1.5,viewport={width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},problems=[];
  const inspect=(element,label)=>{const rect=element.getBoundingClientRect();if(rect.left<-tolerance||rect.right>viewport.width+tolerance||rect.top<-tolerance||rect.bottom>viewport.height+tolerance)problems.push(`${label}:${Math.round(rect.left)},${Math.round(rect.top)}..${Math.round(rect.right)},${Math.round(rect.bottom)}`)};
  for(const button of document.querySelectorAll('body>header .header-auth-actions button')){inspect(button,button.textContent.trim()||button.getAttribute('aria-label'));if(Math.abs(button.getBoundingClientRect().height-48)>tolerance)problems.push(`header-button-height:${button.id||button.textContent.trim()}:${button.getBoundingClientRect().height}`)}
  for(const backdrop of document.querySelectorAll('.modal-backdrop')){
   const dialog=backdrop.querySelector('.modal');if(!dialog)continue;backdrop.classList.add('show');inspect(dialog,backdrop.id||'modal');backdrop.classList.remove('show');
  }
  return{problems,viewport};
 });
 expect(result.problems,JSON.stringify(result)).toEqual([]);
});

test('completed cloud status really hides instead of covering the mobile title',async({page})=>{
 await unlockOwnerWorkspace(page);
 const result=await page.evaluate(()=>{
  let status=document.getElementById('firebaseCloudStatus');
  if(!status){status=document.createElement('div');status.id='firebaseCloudStatus';document.body.appendChild(status)}
  status.hidden=true;
  return{display:getComputedStyle(status).display,hidden:status.hidden};
 });
 expect(result).toEqual({display:'none',hidden:true});
});
