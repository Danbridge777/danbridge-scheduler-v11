/* A group is a timetable container. Children keep their own CRM and parent. */
function ensureStudentGroupFields(){
  if($('studentGroupFields'))return;
  const anchor=$('studentCourseType')?.parentElement;if(!anchor)return;
  const box=document.createElement('div');box.id='studentGroupFields';box.className='span-2 hidden';
  box.innerHTML='<input type="checkbox" id="studentIsGroupRoster" hidden aria-hidden="true" tabindex="-1"><div id="studentGroupMembersWrap" class="hidden"><label>團班學生名單</label><div id="studentGroupMembers" class="group-roster-options"></div><div id="studentGroupFeePreview" aria-live="polite"></div><p class="small">每位孩子沿用自己的收費與家長資料。更改名單只影響之後新增的課程；排課時核對老師、教室與學生的時間。</p></div>';
  anchor.after(box);
  const branchFields=document.createElement('div');branchFields.className='span-2 student-branch-fields';branchFields.innerHTML='<div><label for="studentBillingBranch">歸屬校區（營收計入）</label><select id="studentBillingBranch"></select></div><div><label for="studentAttendanceBranch">預設上課校區</label><select id="studentAttendanceBranch"></select></div><p class="small span-2">兩者獨立保存。營收只依歸屬校區；未填寫時列為未歸屬，不以教室或舊校區猜填。</p>';anchor.before(branchFields);
  $('studentGroupMembers').addEventListener('change',renderGroupFeePreview);
  ensureStudentWorkspace();
}
function filterGroupMemberChecks(target){
  const query=document.getElementById(target.id+'Search').value.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let visible=0,selected=0;const options=target.querySelectorAll('.group-roster-option');
  for(const label of options){const match=query.every(word=>label.dataset.search.includes(word));label.hidden=!match;if(match)visible++;if(label.querySelector('input').checked)selected++}
  document.getElementById(target.id+'Summary').textContent=`已選 ${selected} 位 · 顯示 ${visible}／${options.length} 位`;
  const empty=document.getElementById(target.id+'Empty');empty.hidden=visible>0;empty.textContent=options.length?'找不到符合的學生，請更換關鍵字。已勾選名單不受搜尋影響。':'請先建立學生資料，再選入團班。';
}
function ensureGroupMemberSearch(target,parent){
  let tools=document.getElementById(target.id+'SearchTools');
  if(!tools){tools=document.createElement('div');tools.id=target.id+'SearchTools';tools.className='group-roster-search';const label=document.createElement('label'),input=document.createElement('input'),summary=document.createElement('p'),empty=document.createElement('p');input.id=target.id+'Search';input.type='search';input.autocomplete='off';label.htmlFor=input.id;summary.id=target.id+'Summary';summary.className='small';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');empty.id=target.id+'Empty';empty.className='small';tools.append(label,input,summary);target.before(tools);target.after(empty);input.addEventListener('input',()=>filterGroupMemberChecks(target));input.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault()});target.addEventListener('change',()=>filterGroupMemberChecks(target))}
  tools.querySelector('label').textContent=target.id==='studentGroupMembers'?'搜尋團班學生':'搜尋本堂學生';
  const input=tools.querySelector('input');input.placeholder=parent?'輸入學生、家長姓名、電話或學校':'輸入學生姓名';input.value='';
}
function groupMemberChecks(target,ids=[],{parent=true,exclude=''}={}){
  const selected=new Set(ids),rows=(db.students||[]).filter(s=>s.id!==exclude&&!s.isGroupRoster&&(!s.archivedAt||selected.has(s.id))&&!s.campSeason);
  target.replaceChildren();target.classList.add('group-roster-options');
  for(const s of rows){const label=document.createElement('label');label.className='group-roster-option';label.dataset.search=[s.name,...(parent?[s.parent,s.contact,s.school,s.grade]:[])].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();const input=document.createElement('input');input.type='checkbox';input.value=s.id;input.checked=selected.has(s.id);const name=document.createElement('span');name.textContent=s.name+(parent?'｜家長：'+(s.parent||'未填寫'):'')+(s.archivedAt?'（已封存）':'');label.append(input,name);target.append(label)}
  ensureGroupMemberSearch(target,parent);filterGroupMemberChecks(target);
}
function syncStudentGroupVisibility(){ensureStudentGroupFields();const group=studentWorkspaceMode==='group';if(group)$('studentCourseType').value='團班';$('studentIsGroupRoster').checked=group;$('studentGroupFields')?.classList.toggle('hidden',!group);$('studentGroupMembersWrap')?.classList.toggle('hidden',!group);renderGroupFeePreview()}
function fillGroupBranchOptions(select,value=''){select.replaceChildren(new Option('未設定',''));for(const branch of(db.branches?.length?db.branches:window.DanbridgeAccess?.DEFAULT_BRANCHES||[]))select.add(new Option(branch.name,branch.id));select.value=value}
function studentBranchSummary(s){const rows=db.branches?.length?db.branches:window.DanbridgeAccess?.DEFAULT_BRANCHES||[],name=id=>rows.find(b=>b.id===id)?.name||'未設定';return '<div class="small">歸屬：'+esc(name(s.billingBranchId))+'<br>上課：'+esc(name(s.attendanceBranchId))+'</div>'}
function renderStudentGroupRoster(s={}){ensureStudentGroupFields();if(!$('studentIsGroupRoster'))return;if(s.isGroupRoster===true)setStudentWorkspaceView('group');fillGroupBranchOptions($('studentBillingBranch'),s.billingBranchId||'');fillGroupBranchOptions($('studentAttendanceBranch'),s.attendanceBranchId||'');groupMemberChecks($('studentGroupMembers'),s.groupMemberIds||[],{exclude:s.id||''});syncStudentGroupVisibility()}
function saveStudentGroupRoster(s){
  s.billingBranchId=$('studentBillingBranch')?.value||'';s.attendanceBranchId=$('studentAttendanceBranch')?.value||'';
  const isGroup=s.courseType==='團班'&&$('studentIsGroupRoster')?.checked===true;
  if(!isGroup){if(s.isGroupRoster&&(db.lessons||[]).some(l=>l.studentId===s.id)) {alert('已有課表的團班請保留團班類型，以維持歷史計費。');return false}delete s.isGroupRoster;delete s.groupMemberIds;return true}
  const ids=[...document.querySelectorAll('#studentGroupMembers input:checked')].map(x=>x.value);
  if(ids.length>100){alert('每個團班最多選擇 100 位學生');return false}
  if(!ids.length){alert('請至少選擇一位團班學生');return false}
  if(ids.some(id=>!db.students.some(row=>row.id===id&&!row.isGroupRoster&&row.id!==s.id))){alert('團班學生不存在，請重新選擇');return false}
  const old=db.students.find(row=>row.id===s.id);
  if(old&&!old.isGroupRoster&&(db.lessons||[]).some(l=>l.studentId===s.id)){alert('這筆資料已有歷史課程，請用「新增團班」建立班別，保留原學生帳單。');return false}
  Object.assign(s,{isGroupRoster:true,groupMemberIds:[...new Set(ids)]});return true;
}
function renderLessonGroupRoster(lesson=null){
  const s=student($('lessonStudent')?.value);let box=$('lessonGroupRoster');
  let billingBox=$('lessonBillingBranchWrap');if(!billingBox){billingBox=document.createElement('div');billingBox.id='lessonBillingBranchWrap';billingBox.innerHTML='<label for="lessonBillingBranch">歸屬校區（營收計入）</label><select id="lessonBillingBranch"></select><p class="small">與上課校區分開保存；移動教室不改變營收歸屬。未填寫的收入列為未歸屬。</p>';$('lessonStudent')?.closest('.student-select-row')?.after(billingBox)}
  fillGroupBranchOptions($('lessonBillingBranch'),lesson?.billingBranchId||s.billingBranchId||'');const branchLabel=document.querySelector('label[for="lessonBranch"]')||$('lessonBranch')?.previousElementSibling;if(branchLabel?.tagName==='LABEL')branchLabel.textContent='上課校區';
  if(!box){box=document.createElement('div');box.id='lessonGroupRoster';box.innerHTML='<label>本堂團班學生</label><div id="lessonGroupStudents"></div><p class="small">此名單隨本堂課保存，月底依學生分別歸入家長帳單。</p>';$('lessonStudent')?.closest('.student-select-row')?.after(box)}
  box.classList.toggle('hidden',!s.isGroupRoster);if(!s.isGroupRoster)return;
  const owner=(window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)==='owner';
  groupMemberChecks($('lessonGroupStudents'),lesson?.groupStudentIds||s.groupMemberIds||[],{parent:owner,exclude:s.id});
}
function selectedLessonGroupStudents(){return [...new Set([...document.querySelectorAll('#lessonGroupStudents input:checked')].map(x=>x.value))]}
function lessonGroupRosterText(lesson){return(lesson?.groupStudentIds||[]).map(id=>student(id).name||'學生資料未載入').join('、')}
document.addEventListener('DOMContentLoaded',()=>renderStudentGroupRoster());
