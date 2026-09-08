/* Two CRM views, one existing record/save path. No student or lesson ID migration. */
let studentWorkspaceMode='individual';
const studentWorkspaceDrafts=new Map();
function clearStudentWorkspaceDraftsOnIdentityChange(){
  const ctx=window.DanbridgeAccess?.getContext?.()||{},key=JSON.stringify([ctx.role,ctx.email]);
  if(document.body.classList.contains('auth-locked')||ctx.role!=='owner'||studentWorkspaceDrafts.identity!==key)studentWorkspaceDrafts.clear();
  studentWorkspaceDrafts.identity=key;
}
function ensureStudentWorkspace(){
  const section=$('students');if(!section||$('studentWorkspaceTabs'))return;
  const tabs=document.createElement('div');tabs.id='studentWorkspaceTabs';tabs.className='student-workspace-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','登記類型');
  for(const [mode,id,label] of [['individual','individualStudentTab','家教'],['group','createGroupRosterButton','團課']]){
    const button=document.createElement('button');button.type='button';button.id=id;button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','studentWorkspacePanel');button.dataset.workspace=mode;
    button.onclick=()=>switchStudentWorkspace(mode);
    button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'individual':event.key==='End'?'group':mode==='group'?'individual':'group';switchStudentWorkspace(next);$(next==='group'?'createGroupRosterButton':'individualStudentTab').focus()};tabs.append(button);
  }
  const panel=section.querySelector(':scope > .grid');panel.id='studentWorkspacePanel';panel.setAttribute('role','tabpanel');section.prepend(tabs);
  for(const id of ['studentSchool','studentGrade','studentLevel','parentName','parentContact','parentLine','parentEmail','studentHomeAddress','studentCourseType','studentBilling','studentRate','studentScores'])$(id)?.parentElement.classList.add('individual-student-field');
  setStudentWorkspaceView(studentWorkspaceMode);
  queueMicrotask(ensureCompactStudentWorkspace);
}
function ensureCompactStudentWorkspace(){
  const section=$('students'),form=section?.querySelector('.crm-form-grid');if(!form||form.dataset.compact==='true')return;
  form.dataset.compact='true';
  const details=document.createElement('details');details.id='studentAdditionalDetails';details.className='student-additional-details span-2';
  const summary=document.createElement('summary');summary.textContent='聯絡與學習資料';const grid=document.createElement('div');grid.className='student-details-grid';details.append(summary,grid);
  for(const id of ['studentSchool','studentGrade','studentLevel','parentContact','parentLine','parentEmail','studentHomeAddress','studentMaterials','studentScores','studentNote']){const input=$(id);if(input)grid.append(input.parentElement)}
  form.append(details);
  // Keep the roster at the top of the group editor, not below billing notes.
  const members=$('studentGroupFields');if(members)$('studentStatus').parentElement.after(members);
  for(const input of section.querySelectorAll('.col-4 input,.col-4 textarea')){if(input.type!=='search'&&input.type!=='hidden')input.removeAttribute('placeholder');const label=input.previousElementSibling;if(label?.tagName==='LABEL'&&input.id)label.htmlFor=input.id}
  for(const select of section.querySelectorAll('.col-4 select')){const label=select.previousElementSibling;if(label?.tagName==='LABEL')label.htmlFor=select.id}
  const course=$('studentCourseType');if(course)course.onchange=()=>{
    if(studentWorkspaceMode==='individual'&&course.value==='團班'){
      // A group is a separate record. Never convert an existing child or lose
      // an unfinished individual draft just because this shortcut was chosen.
      const childId=$('studentId').value,child=db.students.find(s=>s.id===childId&&!s.isGroupRoster);
      course.value=child?.courseType||'1對1';switchStudentWorkspace('group');
      if(child&&!$('studentId').value){const checkbox=[...document.querySelectorAll('#studentGroupMembers input')].find(el=>el.value===childId);if(checkbox){checkbox.checked=true;filterGroupMemberChecks($('studentGroupMembers'));renderGroupFeePreview()}}
      $('studentName').focus();return;
    }
    syncStudentBillingFields();
  };
  const card=form.parentElement,actions=document.createElement('div');actions.className='student-editor-actions';
  for(const button of [...card.children].filter(el=>el.tagName==='BUTTON'))actions.append(button);
  for(const br of [...card.children].filter(el=>el.tagName==='BR'))br.remove();card.append(actions);
}
function setStudentWorkspaceView(mode){
  studentWorkspaceMode=mode==='group'?'group':'individual';
  const section=$('students');if(!section)return;section.dataset.workspace=studentWorkspaceMode;
  const group=studentWorkspaceMode==='group';
  section.querySelectorAll('[role="tab"][data-workspace]').forEach(button=>{const active=button.dataset.workspace===studentWorkspaceMode;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
  $('studentWorkspacePanel')?.setAttribute('aria-labelledby',group?'createGroupRosterButton':'individualStudentTab');
  const title=section.querySelector('.col-4 h2'),nameLabel=$('studentName')?.previousElementSibling,listTitle=$('crmSearch')?.closest('.toolbar')?.querySelector('h2');
  if(title)title.textContent=group?'團課資料':'學生資料';if(nameLabel)nameLabel.textContent=group?'團課名稱 *':'學生姓名 *';if(listTitle)listTitle.textContent=group?'團課清單':'學生清單';
  const additional=$('studentAdditionalDetails');if(additional)additional.querySelector('summary').textContent=group?'教材與備註':'聯絡與學習資料';
  const headers=section.querySelectorAll('table thead th');['學生','家長／聯絡','學校／程度','課程／收費','歷程','操作'].forEach((label,i)=>{if(headers[i])headers[i].textContent=group?['團班','班內學生','固定老師','歸屬／上課校區','歷程','操作'][i]:label});
  if($('crmSearch'))$('crmSearch').placeholder=group?'團班名稱、學生或家長姓名':'姓名、家長、學校、程度、電話';
  const searchLabel=$('crmSearch')?.previousElementSibling;if(searchLabel?.tagName==='LABEL')searchLabel.textContent=group?'搜尋團課':'搜尋學生';
}
function switchStudentWorkspace(mode){
  clearStudentWorkspaceDraftsOnIdentityChange();
  if(mode===studentWorkspaceMode)return;
  const fields=[...document.querySelectorAll('#students .col-4 input:not([type="checkbox"]),#students .col-4 select,#students .col-4 textarea')];
  studentWorkspaceDrafts.set(studentWorkspaceMode,{fields:fields.map(el=>[el.id,el.value]),members:[...document.querySelectorAll('#studentGroupMembers input:checked')].map(el=>el.value)});
  const draft=studentWorkspaceDrafts.get(mode);setStudentWorkspaceView(mode);clearStudentForm();if($('studentAdditionalDetails'))$('studentAdditionalDetails').open=false;
  if(draft){for(const [id,value] of draft.fields)if($(id))$(id).value=value;renderStudentGroupRoster({id:$('studentId').value,isGroupRoster:mode==='group',groupMemberIds:draft.members,billingBranchId:$('studentBillingBranch').value,attendanceBranchId:$('studentAttendanceBranch').value});syncStudentBillingFields();const indicator=$('studentEditIndicator');if(indicator&&$('studentId').value){indicator.textContent='正在編輯：'+$('studentName').value;indicator.style.display='block'}}
  $('crmSearch').value='';renderStudents();
}
function renderGroupFeePreview(){
  const target=$('studentGroupFeePreview');if(!target)return;
  const owner=(window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)==='owner';target.replaceChildren();if(!owner)return;
  const ids=[...document.querySelectorAll('#studentGroupMembers input:checked')].map(el=>el.value);
  const rows=ids.map(id=>(db.students||[]).find(s=>s.id===id)).filter(Boolean);let hourly=0;
  for(const s of rows){const line=document.createElement('p');line.className='small';const valid=s.rate!==''&&s.rate!=null&&Number.isFinite(Number(s.rate))&&Number(s.rate)>=0,monthly=studentUsesMonthlyFee(s);if(valid&&!monthly)hourly+=Number(s.rate);line.textContent=`${s.name}｜家長：${s.parent||'未填寫'}｜${valid?money(Number(s.rate))+(monthly?'／月（不重複收取）':'／小時'):'未設定收費'}`;target.append(line)}
  const total=document.createElement('p');total.className='small';total.textContent=`已選 ${rows.length} 位 · 鐘點費合計 ${money(hourly)}／小時`;target.append(total);
}
function renderGroupWorkspaceRows(q,teacherId,archiveMode){
  const rows=(db.students||[]).filter(s=>s.isGroupRoster&&(archiveMode==='all'||(archiveMode==='archived')===isArchivedRecord(s))&&(!teacherId||studentTeacherIds(s).has(String(teacherId)))&&(!q||[s.name,...(s.groupMemberIds||[]).flatMap(id=>{const child=student(id);return[child.name,child.parent]})].join(' ').toLowerCase().includes(q)));
  const body=$('studentRows');body.replaceChildren();
  for(const s of rows){const tr=document.createElement('tr'),h=studentHistoryStats(s.id),archived=isArchivedRecord(s);if(archived)tr.className='is-archived';
    tr.innerHTML=`<td><b>${esc(s.name)}</b><div class="small">${archived?'已封存':'團班'}</div></td><td>${(s.groupMemberIds||[]).map(id=>{const child=student(id);return esc(child.name||'未找到學生')+'<span class="small">（'+esc(child.parent||'未填家長')+'）</span>'}).join('<br>')||'尚無學生'}</td><td>${esc(teacher(s.preferredTeacherId)?.name||'未設定')}</td><td>${studentBranchSummary(s)}<div class="small">依各學生收費 × 課表時數</div></td><td>${h.total} 堂<br><span class="small">${h.last?'最近 '+esc(h.last.date):'尚無課程'}</span></td><td class="crm-actions"></td>`;
    const actions=tr.lastElementChild;for(const [label,fn] of [['檢視／編輯',()=>editStudent(s.id)],...(!archived?[['排課',()=>openSmartScheduler(s.id)]]:[]),['歷程',()=>showStudentHistory(s.id)],[archived?'恢復':'封存',()=>archived?restoreStudent(s.id):archiveStudent(s.id)]]){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent=label;button.onclick=fn;actions.append(button)}body.append(tr);
  }
  if(!rows.length)body.innerHTML='<tr><td colspan="6" class="small">沒有符合條件的團班。</td></tr>';
}
document.addEventListener('DOMContentLoaded',()=>{ensureStudentWorkspace();setStudentWorkspaceView(studentWorkspaceMode);queueMicrotask(ensureCompactStudentWorkspace);new MutationObserver(clearStudentWorkspaceDraftsOnIdentityChange).observe(document.body,{attributes:true,attributeFilter:['class','data-cloud-role']})});
