/**
 * Danbridge Scheduler V15.4 — Students CRM module
 *
 * Extracted from application-and-business-features.js without changing behavior.
 * This is a classic script so existing inline onclick handlers remain compatible.
 */

function studentDefaults(x={}){return {...x,status:x.status||'active',school:x.school||'',grade:x.grade||'',level:x.level||'',preferredTeacherId:x.preferredTeacherId||'',parentLine:x.parentLine||'',parentEmail:x.parentEmail||'',materials:x.materials||'',availability:x.availability||'',scores:x.scores||''}}

function saveStudent(){const id=$('studentId').value||uid(),o=studentDefaults({id,name:$('studentName').value.trim(),status:$('studentStatus').value,school:$('studentSchool').value.trim(),grade:$('studentGrade').value.trim(),level:$('studentLevel').value.trim(),preferredTeacherId:$('studentPreferredTeacher').value,parent:$('parentName').value.trim(),contact:$('parentContact').value.trim(),parentLine:$('parentLine').value.trim(),parentEmail:$('parentEmail').value.trim(),homeAddress:$('studentHomeAddress').value.trim(),courseType:$('studentCourseType').value,billing:$('studentBilling').value,rate:+$('studentRate').value||0,materials:$('studentMaterials').value.trim(),availability:$('studentAvailability').value.trim(),scores:$('studentScores').value.trim(),note:$('studentNote').value});
if(!o.name)return alert('請輸入學生姓名');
snapshot();
const i=db.students.findIndex(x=>x.id===id);i>=0?db.students[i]=o:db.students.push(o);
const wasEdit=i>=0;clearStudentForm();
saveDB();toast(wasEdit?'學生 CRM 已更新':'學生已新增')}

function editStudent(id){const x=studentDefaults(db.students.find(s=>String(s.id)===String(id)));
if(!x?.id)return alert('找不到這位學生，請重新整理後再試');switchTab('students');$('studentId').value=x.id;$('studentName').value=x.name||'';$('studentStatus').value=x.status;$('studentSchool').value=x.school;$('studentGrade').value=x.grade;$('studentLevel').value=x.level;$('studentPreferredTeacher').value=x.preferredTeacherId;$('parentName').value=x.parent||'';$('parentContact').value=x.contact||'';$('parentLine').value=x.parentLine;$('parentEmail').value=x.parentEmail;$('studentHomeAddress').value=x.homeAddress||'';$('studentCourseType').value=x.courseType||'1對1';$('studentBilling').value=x.billing||'hour';$('studentRate').value=x.rate??'';$('studentMaterials').value=x.materials;$('studentAvailability').value=x.availability;$('studentScores').value=x.scores;$('studentNote').value=x.note||'';
const box=$('studentEditIndicator');
if(box){box.textContent='正在編輯：'+(x.name||'未命名學生');box.style.display='block'}$('studentName').focus();$('students').scrollIntoView({behavior:'smooth',block:'start'});toast('已載入 '+(x.name||'學生')+' 的 CRM')}

function clearStudentForm(){['studentId','studentName','studentSchool','studentGrade','studentLevel','parentName','parentContact','parentLine','parentEmail','studentHomeAddress','studentRate','studentMaterials','studentAvailability','studentScores','studentNote'].forEach(id=>{if($(id))$(id).value=''});$('studentStatus').value='active';$('studentPreferredTeacher').value='';$('studentCourseType').value='1對1';$('studentBilling').value='hour';
const box=$('studentEditIndicator');
if(box){box.textContent='';box.style.display='none'}}

function deleteStudent(id){if(confirm('確定刪除學生？既有課程紀錄不會自動刪除。')){snapshot();db.students=db.students.filter(x=>x.id!==id);
saveDB()}}

function studentHistoryStats(id){const ls=db.lessons.filter(l=>l.studentId===id),completed=ls.filter(l=>l.status==='已上課'||l.status==='補課').length,absent=ls.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status)).length,unpaid=ls.filter(l=>l.paymentStatus==='unpaid'&&timetableRevenueCharge(l)>0).length;return{total:ls.length,completed,absent,unpaid,last:[...ls].sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start))[0]}}

function renderStudents(){const q=($('crmSearch')?.value||'').trim().toLowerCase();
const rows=db.students.map(studentDefaults).filter(s=>!q||[s.name,s.parent,s.contact,s.parentLine,s.parentEmail,s.school,s.grade,s.level,s.materials].join(' ').toLowerCase().includes(q));$('studentRows').innerHTML=rows.map(s=>{const h=studentHistoryStats(s.id),t=teacher(s.preferredTeacherId);return`<tr><td><b>${esc(s.name)}</b><div class="crm-badges"><span class="crm-badge">${s.status==='active'?'在讀':s.status==='trial'?'試讀':s.status==='paused'?'暫停':'離班'}</span>${s.grade?`<span class="crm-badge">${esc(s.grade)}</span>`:''}</div></td><td>${esc(s.parent)}<br><span class="small">${esc(s.contact||s.parentLine||s.parentEmail||'—')}</span></td><td>${esc(s.school||'—')}<br><span class="small">${esc(s.level||'未設定程度')}${t?.name?'｜'+esc(t.name):''}</span></td><td>${esc(s.courseType)}<br><span class="small">${s.billing==='hour'?'每小時':s.billing==='lesson'?'每堂':'月費'} ${money(s.rate)}</span></td><td><b>${h.total}</b> 堂｜請假 ${h.absent}<br><span class="small ${h.unpaid?'status-unpaid':''}">未繳 ${h.unpaid} 堂${h.last?'｜最近 '+h.last.date:''}</span></td><td class="crm-actions"><button type="button" class="btn" onclick="editStudent('${s.id}')">編輯</button><button type="button" class="btn ok" onclick="openSmartScheduler('${s.id}')">排課</button><button type="button" class="btn" onclick="showStudentHistory('${s.id}')">歷程</button><button type="button" class="btn danger" onclick="deleteStudent('${s.id}')">刪除</button></td></tr>`}).join('')||'<tr><td colspan="6" class="small">沒有符合條件的學生。</td></tr>'}

function showStudentHistory(id){const s=studentDefaults(db.students.find(x=>x.id===id)||{}),ls=db.lessons.filter(l=>l.studentId===id).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
const lines=ls.slice(0,30).map(l=>`${l.date} ${l.start}–${l.end}｜${lessonTeacherNames(l)}｜${l.title||'課程'}｜${l.status}｜${l.paymentStatus==='paid'?'已繳':'未繳'}`).join('\n');alert(`【${s.name||'學生'} CRM 歷程】\n學校／年級：${s.school||'—'} ${s.grade||''}\n程度：${s.level||'—'}\n教材：${s.materials||'—'}\n考試紀錄：${s.scores||'—'}\n\n最近課程（最多30筆）\n${lines||'尚無課程紀錄'}`)}
