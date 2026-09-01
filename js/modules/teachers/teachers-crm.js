/**
 * Danbridge Scheduler V15.5 — Teachers CRM module
 *
 * Extracted from application-and-business-features.js without changing behavior.
 * This remains a classic script so inline onclick handlers and shared globals work unchanged.
 */

function normalizedWorkDays(days){const src=Array.isArray(days)?days:[1,2,3,4,5];const valid=[...new Set(src.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))];return valid.length?valid:[1,2,3,4,5]}
function workDayNames(days){const names=['週日','週一','週二','週三','週四','週五','週六'];return normalizedWorkDays(days).map(d=>names[d]).join('、')}
function selectedTeacherWorkDays(){return [...document.querySelectorAll('#teacherWorkDays input[type=checkbox]:checked')].map(x=>Number(x.value)).filter(n=>Number.isInteger(n)&&n>=0&&n<=6)}
function clearTeacherForm(){
  ['teacherId','teacherName','teacherDisplayName','teacherRate','teacherBaseSalary','teacherOvertimeRate','teacherDeductionRate','teacherMinWeeklyHours','teacherSubjects','teacherNote'].forEach(id=>{const e=$(id);if(e)e.value=''});
  if($('teacherType'))$('teacherType').value='兼職';
  if($('teacherPayrollMode'))$('teacherPayrollMode').value='hourly';
  if($('teacherColor'))$('teacherColor').value='#2563eb';
  const defaults=new Set([1,2,3,4,5]);
  document.querySelectorAll('#teacherWorkDays input[type=checkbox]').forEach(cb=>cb.checked=defaults.has(Number(cb.value)));
}
function teacherIsArchived(t){return !!String(t?.archivedAt||'').trim()}
function saveTeacher(){
  const name=$('teacherName')?.value.trim()||'';
  const displayName=$('teacherDisplayName')?.value.trim()||'';
  if(!name)return alert('請輸入老師姓名');
  const workDays=selectedTeacherWorkDays();
  if(!workDays.length)return alert('請至少選擇一個固定工作日');
  const id=$('teacherId')?.value||uid();
  const old=db.teachers.find(t=>String(t.id)===String(id));
  const type=$('teacherType')?.value||'兼職';
  const payrollMode=$('teacherPayrollMode')?.value||'hourly';
  const readOptional=id=>{const raw=$(id)?.value.trim()||'';if(raw==='')return null;const value=Number(raw);return Number.isFinite(value)&&value>=0?value:NaN};
  const rate=readOptional('teacherRate'),baseSalary=readOptional('teacherBaseSalary'),overtimeRate=readOptional('teacherOvertimeRate'),deductionRate=readOptional('teacherDeductionRate');
  if([rate,baseSalary,overtimeRate,deductionRate].some(Number.isNaN))return alert('薪資欄位必須是 0 或正數');
  if(payrollMode==='hourly'&&rate===null)return alert('純時薪制請輸入一般時薪');
  if(payrollMode==='fixed'&&(baseSalary===null||overtimeRate===null||deductionRate===null))return alert('固定底薪制請完整輸入固定底薪、超時時薪與不足工時扣款時薪');
  const item={
    ...(old||{}),id,name,displayName,
    payrollMode,
    rate:rate??0,
    baseSalary,
    overtimeRate,
    deductionRate,
    minWeeklyHours:+($('teacherMinWeeklyHours')?.value||0),
    workDays,
    type,
    subjects:$('teacherSubjects')?.value.trim()||'',
    color:$('teacherColor')?.value||'#2563eb',
    note:$('teacherNote')?.value||''
  };
  snapshot();
  const i=db.teachers.findIndex(t=>String(t.id)===String(id));
  if(i>=0)db.teachers[i]=item;else db.teachers.push(item);
  clearTeacherForm();
  saveDB();
  toast(i>=0?'老師資料已更新':'老師已新增');
}
function editTeacher(id){
  const t=db.teachers.find(x=>String(x.id)===String(id));
  if(!t)return alert('找不到老師資料，請重新整理後再試');
  switchTab('teachers');
  $('teacherId').value=t.id||'';$('teacherName').value=t.name||'';$('teacherDisplayName').value=t.displayName||'';$('teacherRate').value=t.rate??'';
  $('teacherPayrollMode').value=teacherPayrollMode(t);$('teacherBaseSalary').value=t.baseSalary??'';$('teacherOvertimeRate').value=t.overtimeRate??'';$('teacherDeductionRate').value=t.deductionRate??'';
  $('teacherMinWeeklyHours').value=t.minWeeklyHours??'';$('teacherType').value=t.type||'兼職';
  $('teacherSubjects').value=t.subjects||'';$('teacherColor').value=t.color||'#2563eb';$('teacherNote').value=t.note||'';
  const days=new Set(normalizedWorkDays(t.workDays));
  document.querySelectorAll('#teacherWorkDays input[type=checkbox]').forEach(cb=>cb.checked=days.has(Number(cb.value)));
  $('teacherName').focus();
}
async function archiveTeacher(id){
  if((window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)!=='owner')return alert('只有 Owner 可以封存老師。');
  const t=db.teachers.find(x=>String(x.id)===String(id));
  if(!t||teacherIsArchived(t))return;
  const reason=prompt(`請輸入封存「${t.name||'老師'}」的原因：`,'離職');if(reason===null)return;if(!reason.trim())return alert('請輸入封存原因');
  if(!confirm(`確定封存「${t.name||'老師'}」？\n\n封存後不再出現在新增課程、代課與教師群組選項；歷史課程、薪資與月結仍會完整保留。綁定此老師的登入帳號會立即停權。`))return;
  try{if(window.__danbridgeDisableTeacherAccessForArchive)await window.__danbridgeDisableTeacherAccessForArchive(id)}catch(error){console.error(error);return alert('老師帳號停權失敗，因此尚未封存。請確認網路後再試：'+(error?.message||error))}
  snapshot();Object.assign(t,{archivedAt:new Date().toISOString(),archivedReason:reason.trim(),archivedBy:archivalActorLabel()});clearTeacherForm();saveDB();toast('老師已封存，歷史資料與帳號綁定仍保留');
}
function restoreTeacher(id){if((window.currentCloudRole?.()||window.DanbridgeAccess?.getContext?.().role)!=='owner')return alert('只有 Owner 可以恢復老師。');const t=db.teachers.find(x=>String(x.id)===String(id));if(!t||!teacherIsArchived(t))return;if(!confirm(`確定恢復「${t.name||'老師'}」？\n\n老師會重新出現在排課選項，但 Gmail 登入權限仍維持停權，必須到安全設定人工確認後重新啟用。`))return;snapshot();Object.assign(t,{archivedAt:'',archivedReason:'',archivedBy:'',restoredAt:new Date().toISOString(),restoredBy:archivalActorLabel()});saveDB();toast('老師資料已恢復；登入權限仍維持停權')}
function ensureTeacherArchiveFilter(){const table=$('teacherRows')?.closest('.card');if(!table)return null;let select=$('teacherArchiveFilter');if(!select){const heading=table.querySelector('h2'),field=document.createElement('div');field.className='toolbar';field.innerHTML='<div><label for="teacherArchiveFilter">資料狀態</label><select id="teacherArchiveFilter" onchange="renderTeachers()"><option value="active">在職老師</option><option value="archived">已封存</option><option value="all">全部</option></select></div>';heading?.after(field);select=$('teacherArchiveFilter')}return select}
function renderTeachers(){const header=$('teacherRows')?.closest('table')?.querySelector('thead tr');if(header&&header.children.length===6){const th=document.createElement('th');th.textContent='請假紀錄';header.insertBefore(th,header.lastElementChild)}const archiveMode=ensureTeacherArchiveFilter()?.value||'active',rows=db.teachers.filter(t=>archiveMode==='all'||(archiveMode==='archived')===teacherIsArchived(t));$('teacherRows').innerHTML=rows.map(t=>{const mode=teacherPayrollMode(t),base=teacherBaseSalary(t),ot=teacherOvertimeRate(t),ded=teacherDeductionRate(t),archived=teacherIsArchived(t),leaveSummary=window.teacherLeaveProfileSummary?.(t.id)||'本月無請假';const payInfo=mode==='fixed'?`固定底薪 ${base===null?'尚未設定':money(base)}<br><span class="small">超時 ${ot===null?'尚未設定':money(ot)}／不足扣款 ${ded===null?'尚未設定':money(ded)}</span>`:`純時薪 ${money(t.rate||0)}`;return `<tr${archived?' class="is-archived"':''}><td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color||'#2563eb'}"></span> <b>${esc(t.name)}</b>${archived?' <span class="pill red">已封存</span>':''}${t.displayName&&t.displayName!==t.name?`<br><span class="small">名牌：${esc(t.displayName)}</span>`:''}${archived?`<br><span class="small">${esc(t.archivedReason||'未填原因')}｜${esc(t.archivedBy||'Owner')}｜${new Date(t.archivedAt).toLocaleDateString('zh-TW')}</span>`:''}</td><td>${payInfo}</td><td>${t.minWeeklyHours||0} hr／週<br><span class="small">${esc(workDayNames(t.workDays))}</span></td><td>${esc(t.type)}</td><td>${esc(t.subjects)}</td><td><span class="teacher-leave-profile-summary">${esc(leaveSummary)}</span><button class="btn" onclick="viewTeacherLeaves('${t.id}')">查看請假</button></td><td class="row-actions"><button class="btn" onclick="editTeacher('${t.id}')">檢視／編輯</button>${archived?`<button class="btn ok" onclick="restoreTeacher('${t.id}')">恢復</button>`:`<button class="btn danger" onclick="archiveTeacher('${t.id}')">封存</button>`}</td></tr>`}).join('')||'<tr><td colspan="7" class="small">沒有符合條件的老師。</td></tr>'}
