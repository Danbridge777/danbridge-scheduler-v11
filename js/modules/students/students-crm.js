/**
 * Danbridge Scheduler V15.4 — Students CRM module
 *
 * Extracted from application-and-business-features.js without changing behavior.
 * This is a classic script so existing inline onclick handlers remain compatible.
 */

function studentDefaults(x={}){return {...x,status:x.status||'active',school:x.school||'',grade:x.grade||'',level:x.level||'',preferredTeacherId:x.preferredTeacherId||'',parentLine:x.parentLine||'',parentEmail:x.parentEmail||'',materials:x.materials||'',availability:x.availability||'',scores:x.scores||'',archivedAt:x.archivedAt||'',archivedReason:x.archivedReason||'',archivedBy:x.archivedBy||''}}
function normalizedStudentBilling(courseType){return courseType==='安親'?'month':'hour'}
function syncStudentBillingFields(){const courseType=$('studentCourseType')?.value||'1對1',monthly=courseType==='安親',billing=$('studentBilling'),rate=$('studentRate');if(billing){billing.value=normalizedStudentBilling(courseType);billing.disabled=true}syncStudentGroupVisibility();if(rate){const label=rate.previousElementSibling;if(label)label.textContent=monthly?'每月月費':'每小時鐘點費';rate.placeholder=monthly?'請輸入每月固定月費':'請輸入每小時鐘點費'}}
function isArchivedRecord(x){return !!String(x?.archivedAt||'').trim()}
function archivalActorLabel(){const ctx=window.DanbridgeAccess?.getContext?.()||{};return String(document.body.dataset.cloudDisplayName||ctx.email||'Owner').trim()||'Owner'}

function saveStudent(){const id=$('studentId').value||uid(),old=db.students.find(x=>String(x.id)===String(id)),courseType=$('studentCourseType').value,o=studentDefaults({...old,id,name:$('studentName').value.trim(),status:$('studentStatus').value,school:$('studentSchool').value.trim(),grade:$('studentGrade').value.trim(),level:$('studentLevel').value.trim(),preferredTeacherId:$('studentPreferredTeacher').value,parent:$('parentName').value.trim(),contact:$('parentContact').value.trim(),parentLine:$('parentLine').value.trim(),parentEmail:$('parentEmail').value.trim(),homeAddress:$('studentHomeAddress').value.trim(),courseType,billing:normalizedStudentBilling(courseType),rate:+$('studentRate').value||0,materials:$('studentMaterials').value.trim(),scores:$('studentScores').value.trim(),note:$('studentNote').value});
if(!o.name)return alert(studentWorkspaceMode==='group'?'請輸入團班名稱':'請輸入學生姓名');
if(!saveStudentTeacherPricing(o))return;
if(!saveStudentGroupRoster(o))return;
if(!o.isGroupRoster){const familyId=$('studentBillingFamilyId')?.value.trim()||'';if(familyId.length>80)return alert('家庭識別碼最多 80 字');if(familyId)o.billingFamilyId=familyId;else delete o.billingFamilyId}
if(!savePricingHistoryFromEditor(old,o,'student'))return;
snapshot();
const i=db.students.findIndex(x=>x.id===id);i>=0?db.students[i]=o:db.students.push(o);
const wasEdit=i>=0;clearStudentForm();
saveDB();toast(o.isGroupRoster?(wasEdit?'團班已更新':'團班已新增'):(wasEdit?'學生 CRM 已更新':'學生已新增'))}

function editStudent(id){const x=studentDefaults(db.students.find(s=>String(s.id)===String(id)));
setStudentWorkspaceView(x.isGroupRoster?'group':'individual');
if(!x?.id)return alert('找不到這位學生，請重新整理後再試');switchTab('students');$('studentId').value=x.id;$('studentName').value=x.name||'';$('studentStatus').value=x.status;$('studentSchool').value=x.school;$('studentGrade').value=x.grade;$('studentLevel').value=x.level;$('studentPreferredTeacher').value=x.preferredTeacherId;$('parentName').value=x.parent||'';$('parentContact').value=x.contact||'';$('parentLine').value=x.parentLine;$('parentEmail').value=x.parentEmail;$('studentHomeAddress').value=x.homeAddress||'';$('studentCourseType').value=x.courseType||'1對1';syncStudentBillingFields();$('studentRate').value=x.rate??'';$('studentMaterials').value=x.materials;$('studentScores').value=x.scores;$('studentNote').value=x.note||'';renderStudentGroupRoster(x);
renderStudentTeacherPricing(x);const box=$('studentEditIndicator');
if(box){box.textContent='正在編輯：'+(x.name||'未命名學生');box.style.display='block'}$('studentName').focus();$('students').scrollIntoView({behavior:'smooth',block:'start'});toast('已載入 '+(x.name||'學生')+' 的 CRM')}

function clearStudentForm(){['studentId','studentName','studentSchool','studentGrade','studentLevel','parentName','parentContact','parentLine','parentEmail','studentHomeAddress','studentRate','studentMaterials','studentScores','studentNote'].forEach(id=>{if($(id))$(id).value=''});$('studentStatus').value='active';$('studentPreferredTeacher').value='';$('studentCourseType').value='1對1';syncStudentBillingFields();renderStudentGroupRoster();
studentWorkspaceDrafts.delete(studentWorkspaceMode);const box=$('studentEditIndicator');
if(box){box.textContent='';box.style.display='none'}renderStudentTeacherPricing()}

function archiveStudent(id){return runStudentArchiveAction(id,false,(s,reason)=>{
 snapshot();Object.assign(s,{archivedAt:new Date().toISOString(),archivedReason:reason,archivedBy:archivalActorLabel(),status:'inactive'});
 if(String($('studentId')?.value||'')===String(s.id))clearStudentForm();
 saveDB();toast('學生已封存，歷史資料仍保留');
})}
function restoreStudent(id){return runStudentArchiveAction(id,true,s=>{
 snapshot();Object.assign(s,{archivedAt:'',archivedReason:'',archivedBy:'',status:'active',restoredAt:new Date().toISOString(),restoredBy:archivalActorLabel()});
 saveDB();toast('學生已恢復');
})}
function canManageStudentArchive(){
 const ctx=window.DanbridgeAccess?.getContext?.()||{};
 return !document.body.classList.contains('auth-locked')&&(ctx.role||window.currentCloudRole?.())==='owner'&&ctx.readOnly!==true;
}
async function runStudentArchiveAction(id,restore,apply){
 if(!canManageStudentArchive()){toast('目前沒有封存或恢復學生的權限');return false}
 if(runStudentArchiveAction.pending)return false;
 const target=db.students.find(x=>String(x.id)===String(id));
 if(!target||isArchivedRecord(target)!==restore)return false;
 const before=JSON.stringify(target),actor=window.DanbridgeAccess?.getContext?.().email||'';
 runStudentArchiveAction.pending=true;
 try{
  const result=await showStudentArchiveDialog(target,restore);
  if(result===null)return false;
  const current=db.students.find(x=>String(x.id)===String(id));
  if(!canManageStudentArchive()||(window.DanbridgeAccess?.getContext?.().email||'')!==actor||!current||JSON.stringify(current)!==before){
   toast('學生資料或權限已變更，本次未執行；請重新確認');return false;
  }
  apply(current,result);return true;
 }finally{runStudentArchiveAction.pending=false}
}
function showStudentArchiveDialog(record,restore){
 return new Promise(resolve=>{
  const priorFocus=document.activeElement,overlay=document.createElement('div'),panel=document.createElement('div');
  overlay.id='studentArchiveConfirmation';overlay.className='modal-backdrop show';overlay.style.cssText='position:fixed;inset:0;z-index:5200;background:rgba(15,23,42,.35);display:grid;place-items:center;padding:16px;box-sizing:border-box';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','studentArchiveTitle');
  panel.className='modal';
  panel.style.cssText='width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:24px;background:#fff;color:#172b45;border:1px solid #d8e1eb;border-radius:16px;box-shadow:0 20px 60px #10243a33;overflow-wrap:anywhere';
  const title=document.createElement('h2');title.id='studentArchiveTitle';title.textContent=restore?'恢復學生':'封存學生';title.style.cssText='font-size:20px;margin:0 0 12px';
  const name=document.createElement('p');name.textContent=record.name||'未命名學生';
  const description=document.createElement('p');description.textContent=restore?'恢復後會重新出現在排課選項。':'封存後不再出現在排課選項；歷史課程、收款與月結仍會保留，可從已封存清單恢復。';description.style.cssText='font-size:14px;line-height:1.6';
  panel.append(title,name,description);
  const input=document.createElement('input');input.id='studentArchiveReason';input.type='text';input.value='離班';input.maxLength=200;input.style.cssText='width:100%;min-width:0;height:44px;box-sizing:border-box;margin:8px 0 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit';
  if(!restore){const label=document.createElement('label');label.htmlFor=input.id;label.textContent='封存原因';panel.append(label,input)}
  const error=document.createElement('p');error.setAttribute('role','alert');error.style.cssText='font-size:14px;color:#a32121';panel.append(error);
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:12px;margin-top:20px';
  const cancel=document.createElement('button'),approve=document.createElement('button');
  cancel.type=approve.type='button';cancel.className=approve.className='btn';cancel.textContent='取消';approve.textContent=restore?'確認恢復':'確認封存';
  for(const button of [cancel,approve])button.style.cssText='flex:1;min-width:0;min-height:44px;margin:0;font-size:16px';
  let finished=false;
  function finish(value){if(finished)return;finished=true;document.removeEventListener('keydown',onKey,true);overlay.remove();if(priorFocus?.isConnected)priorFocus.focus();resolve(value)}
  function onKey(event){
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(null)}
   else if(event.key==='Tab'){
    const controls=restore?[cancel,approve]:[input,cancel,approve],index=controls.indexOf(document.activeElement);
    event.preventDefault();event.stopImmediatePropagation();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();
   }
  }
  cancel.onclick=()=>finish(null);
  approve.onclick=()=>{const reason=input.value.trim();if(!restore&&!reason){error.textContent='請輸入封存原因';input.focus();return}finish(restore?'':reason)};
  overlay.onclick=event=>{if(event.target===overlay)finish(null)};
  actions.append(cancel,approve);panel.append(actions);overlay.append(panel);document.body.append(overlay);document.addEventListener('keydown',onKey,true);cancel.focus();
 });
}

function studentHistoryStats(id){const ls=db.lessons.filter(l=>l.studentId===id||lessonIncludesStudent(l,id)),completed=ls.filter(l=>l.status==='已上課'||l.status==='補課').length,absent=ls.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status)).length,unpaid=ls.filter(l=>l.paymentStatus==='unpaid'&&timetableRevenueCharge(l)>0).length;return{total:ls.length,completed,absent,unpaid,last:[...ls].sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start))[0]}}

function ensureStudentTeacherFilter(){const search=$('crmSearch'),toolbar=search?.closest('.toolbar');if(!search||!toolbar)return null;let select=$('crmTeacherFilter');if(!select){const field=document.createElement('div');field.className='crm-teacher-filter-field';field.innerHTML='<label for="crmTeacherFilter">篩選老師</label><select id="crmTeacherFilter" onchange="renderStudents()"><option value="">全部老師</option></select>';toolbar.append(field);select=$('crmTeacherFilter')}const old=select.value,allowedIds=new Set((db.teachers||[]).map(t=>String(t.id)));select.innerHTML='<option value="">全部老師</option>'+(db.teachers||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');select.value=allowedIds.has(String(old))?old:'';return select}
function ensureStudentArchiveFilter(){const search=$('crmSearch'),toolbar=search?.closest('.toolbar');if(!search||!toolbar)return null;let select=$('crmArchiveFilter');if(!select){const field=document.createElement('div');field.className='crm-teacher-filter-field';field.innerHTML='<label for="crmArchiveFilter">資料狀態</label><select id="crmArchiveFilter" onchange="renderStudents()"><option value="active">使用中</option><option value="archived">已封存</option><option value="all">全部</option></select>';toolbar.append(field);select=$('crmArchiveFilter')}return select}

function studentTeacherIds(s){const ids=new Set();(db.lessons||[]).filter(l=>!l.isDraft&&(String(l.studentId)===String(s.id)||lessonIncludesStudent(l,s.id))).forEach(l=>lessonTeacherIds(l).forEach(id=>ids.add(String(id))));return ids}
function studentMatchesCrmFilters(s,q='',teacherId=''){const text=[s.name,s.parent,s.contact,s.parentLine,s.parentEmail,s.school,s.grade,s.level,s.materials].join(' ').toLowerCase();return(!teacherId||studentTeacherIds(s).has(String(teacherId)))&&(!q||text.includes(q))}

function renderStudents(){ensureStudentWorkspace();renderGroupFeePreview();const q=($('crmSearch')?.value||'').trim().toLowerCase(),teacherId=ensureStudentTeacherFilter()?.value||'',archiveMode=ensureStudentArchiveFilter()?.value||'active';
if(studentWorkspaceMode==='group'){renderGroupWorkspaceRows(q,teacherId,archiveMode);return}
const rows=db.students.map(studentDefaults).filter(s=>!s.isGroupRoster&&(archiveMode==='all'||(archiveMode==='archived')===isArchivedRecord(s))&&studentMatchesCrmFilters(s,q,teacherId));$('studentRows').innerHTML=rows.map(s=>{const h=studentHistoryStats(s.id),t=teacher(s.preferredTeacherId),archived=isArchivedRecord(s),currentPricing=studentPricingAt(s,pricingToday());return`<tr${archived?' class="is-archived"':''}><td><b>${esc(s.name)}</b><div class="crm-badges"><span class="crm-badge">${archived?'已封存':s.status==='active'?'在讀':s.status==='trial'?'試讀':s.status==='paused'?'暫停':'離班'}</span>${s.grade?`<span class="crm-badge">${esc(s.grade)}</span>`:''}</div>${archived?`<div class="small">${esc(s.archivedReason||'未填原因')}｜${esc(s.archivedBy||'Owner')}｜${new Date(s.archivedAt).toLocaleDateString('zh-TW')}</div>`:''}</td><td>${esc(s.parent)}<br><span class="small">${esc(s.contact||s.parentLine||s.parentEmail||'—')}</span></td><td>${esc(s.school||'—')}<br><span class="small">${esc(s.level||'未設定程度')}${t?.name?'｜'+esc(t.name):''}</span></td><td>${esc(currentPricing.courseType)}${studentBranchSummary(s)}<br><span class="small">${studentUsesMonthlyFee(currentPricing)?'每月月費':'每小時鐘點費'} ${money(currentPricing.rate)}</span></td><td><b>${h.total}</b> 堂｜請假 ${h.absent}<br><span class="small ${h.unpaid?'status-unpaid':''}">未繳 ${h.unpaid} 堂${h.last?'｜最近 '+h.last.date:''}</span></td><td class="crm-actions"><button type="button" class="btn" onclick="editStudent('${s.id}')">檢視／編輯</button>${archived?'':`<button type="button" class="btn ok" onclick="openSmartScheduler('${s.id}')">排課</button>`}<button type="button" class="btn" onclick="showStudentHistory('${s.id}')">歷程</button>${archived?`<button type="button" class="btn ok" onclick="restoreStudent('${s.id}')">恢復</button>`:`<button type="button" class="btn danger" onclick="archiveStudent('${s.id}')">封存</button>`}</td></tr>`}).join('')||'<tr><td colspan="6" class="small">沒有符合條件的學生。</td></tr>'}

function showStudentHistory(id){const s=studentDefaults(db.students.find(x=>x.id===id)||{}),ls=db.lessons.filter(l=>l.studentId===id||lessonIncludesStudent(l,id)).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
const lines=ls.slice(0,30).map(l=>`${l.date} ${l.start}–${l.end}｜${lessonTeacherNames(l)}｜${l.title||'課程'}｜${l.status}｜${l.paymentStatus==='paid'?'已繳':'未繳'}`).join('\n');alert(`【${s.name||'學生'} CRM 歷程】\n學校／年級：${s.school||'—'} ${s.grade||''}\n程度：${s.level||'—'}\n教材：${s.materials||'—'}\n考試紀錄：${s.scores||'—'}\n\n最近課程（最多30筆）\n${lines||'尚無課程紀錄'}`)}
