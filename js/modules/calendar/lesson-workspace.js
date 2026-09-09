/* Presentation only: existing student IDs, lesson snapshots and save paths stay intact. */
let lessonWorkspaceMode='individual';
function ensureLessonWorkspace(){
  const modal=$('lessonModal'),row=$('lessonStudent')?.closest('.student-select-row');
  if(!row||$('lessonWorkspaceTabs'))return;
  const tabs=document.createElement('div');tabs.id='lessonWorkspaceTabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','排課類型');
  for(const [mode,label] of [['individual','家教'],['group','團課']]){
    const button=document.createElement('button');button.type='button';button.id='lessonWorkspace-'+mode;button.textContent=label;button.setAttribute('role','tab');button.dataset.mode=mode;
    button.onclick=()=>setLessonWorkspaceMode(mode,true);
    button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'individual':event.key==='End'?'group':mode==='group'?'individual':'group';setLessonWorkspaceMode(next,true);$('lessonWorkspace-'+next).focus()};tabs.append(button);
  }
  modal.querySelector('.modal-head').after(tabs);
  const label=row.previousElementSibling;if(label?.tagName==='LABEL'){label.id='lessonWorkspaceLabel';label.htmlFor='lessonStudent'}
  const add=row.querySelector('button');if(add){add.id='lessonWorkspaceAdd';add.onclick=()=>lessonWorkspaceMode==='group'?toggleLessonNewGroup(true):toggleQuickStudent(true)}
  const box=document.createElement('div');box.id='lessonNewGroup';box.className='hidden';
  box.innerHTML='<label for="lessonNewGroupName">團課名稱</label><input id="lessonNewGroupName" autocomplete="off"><div id="lessonNewGroupStudents"></div><div class="lesson-workspace-actions"><button type="button" class="btn" id="lessonNewGroupCancel">取消</button><button type="button" class="btn primary" id="lessonNewGroupSave">建立並選取</button></div>';
  row.after(box);$('lessonNewGroupCancel').onclick=()=>toggleLessonNewGroup(false);$('lessonNewGroupSave').onclick=saveLessonNewGroup;
  for(const input of modal.querySelectorAll('input,select,textarea')){const label=input.previousElementSibling;if(input.id&&label?.tagName==='LABEL')label.htmlFor=input.id}
}
function setLessonWorkspaceMode(mode,clear=false){
  ensureLessonWorkspace();lessonWorkspaceMode=mode==='group'?'group':'individual';
  const group=lessonWorkspaceMode==='group',select=$('lessonStudent');if(!select)return;
  if(clear){select.value='';toggleQuickStudent(false);toggleLessonNewGroup(false);renderLessonGroupRoster()}
  $('lessonModal').dataset.workspace=lessonWorkspaceMode;
  $('lessonWorkspaceTabs').querySelectorAll('button').forEach(button=>{const active=button.dataset.mode===lessonWorkspaceMode;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
  const byId=new Map((db.students||[]).map(row=>[String(row.id),row]));
  for(const option of select.options)option.hidden=!!option.value&&!!byId.get(option.value)?.isGroupRoster!==group;
  const label=$('lessonWorkspaceLabel');if(label){label.textContent=group?'選擇團課':'選擇學生';label.htmlFor='lessonStudentSearch'}
  const add=$('lessonWorkspaceAdd');if(add){add.textContent=group?'新增團課':'新增學生';add.hidden=(window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)!=='owner'}
  const search=select.closest('.student-select-search')?.querySelector('input');if(search){search.placeholder=group?'搜尋已登記團課':'搜尋學生';search.setAttribute('aria-label',search.placeholder)}
  window.DanbridgeStudentSelectSearch?.refresh();
}
function syncLessonWorkspace(){
  ensureLessonWorkspace();const selected=student($('lessonStudent')?.value);
  setLessonWorkspaceMode($('lessonStudent')?.value?(selected.isGroupRoster?'group':'individual'):lessonWorkspaceMode);
}
function toggleLessonNewGroup(show){
  const box=$('lessonNewGroup');if(!box)return;
  const owner=(window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)==='owner';
  box.classList.toggle('hidden',!show||!owner);
  if(show&&owner){$('lessonNewGroupName').value='';groupMemberChecks($('lessonNewGroupStudents'),[],{parent:true});$('lessonNewGroupName').focus()}
  else{$('lessonNewGroupName').value='';$('lessonNewGroupStudents').replaceChildren()}
}
function saveLessonNewGroup(){
  if((window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)!=='owner')return;
  const name=$('lessonNewGroupName').value.trim(),ids=[...document.querySelectorAll('#lessonNewGroupStudents input:checked')].map(input=>input.value);
  if(!name)return alert('請輸入團課名稱');
  if(!ids.length||ids.length>100)return alert('請選擇 1 至 100 位學生');
  if(ids.some(id=>!db.students.some(row=>row.id===id&&!row.isGroupRoster&&!row.archivedAt)))return alert('學生名單已變更，請重新選擇');
  if(db.students.some(row=>row.isGroupRoster&&row.name.trim()===name))return alert('已有同名團課，請選取既有團課或使用不同名稱');
  // Same owner student-record workflow as the existing quick-add form.
  const record=studentDefaults({id:uid(),name,courseType:'團班',billing:normalizedStudentBilling('團班'),isGroupRoster:true,groupMemberIds:ids,billingBranchId:$('lessonBillingBranch')?.value||'',attendanceBranchId:$('lessonBranch')?.value||'',preferredTeacherId:$('lessonTeacher')?.value||''});
  snapshot();db.students.push(record);saveDB();renderSelects();$('lessonStudent').value=record.id;toggleLessonNewGroup(false);handleLessonStudentChange();syncLessonWorkspace();
}
