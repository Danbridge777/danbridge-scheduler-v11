/* Owner-only student pricing. Revenue and part-time teaching cost stay independent. */
function ensureStudentTeacherPricingFields(){
  const rate=$('studentRate');if(!rate||$('studentPartTimeTeacherRate'))return;
  const box=document.createElement('div');box.id='studentTeacherPricingFields';
  box.innerHTML='<label for="studentPartTimeTeacherRate">兼職老師鐘點費</label><input id="studentPartTimeTeacherRate" type="number" min="0" step="0.01" inputmode="decimal"><details class="student-pricing-details"><summary>計薪說明</summary><p class="small">留白沿用老師時薪，0 為不支付。家教按學生設定；團課整班每小時只付一次。僅適用兼職純時薪制，不影響正職底薪。</p></details>';
  rate.parentElement.after(box);
}
function pricingToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function renderPricingEffectiveDate(kind,record={}){
 const teacher=kind==='teacher',id=teacher?'teacherPricingEffectiveMonth':'studentPricingEffectiveDate',anchor=$(teacher?'teacherRate':'studentRate');if(!anchor)return;
 let input=$(id);if(!input){const box=document.createElement('div');box.className='pricing-effective-field';const label=document.createElement('label');label.htmlFor=id;label.textContent=teacher?'薪資變更生效月份':'費率變更生效日期';input=document.createElement('input');input.id=id;input.type=teacher?'month':'date';box.append(label,input);anchor.parentElement.after(box)}
 const today=pricingToday(),[y,m]=today.split('-').map(Number),nextMonth=String(m===12?y+1:y)+'-'+String(m===12?1:m+1).padStart(2,'0');
 const pending=(record.pricingHistory||[]).filter(row=>row.effectiveFrom>=today).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.effectiveFrom;
 const monthlyStudent=!teacher&&record.courseType==='安親';
 input.value=pending?(teacher?pending.slice(0,7):pending):(teacher?(today.endsWith('-01')?today.slice(0,7):nextMonth):(monthlyStudent&&!today.endsWith('-01')?nextMonth+'-01':today));
 input.min=teacher?(today.endsWith('-01')?today.slice(0,7):nextMonth):today;
}
function savePricingHistoryFromEditor(before,after,kind='student'){
 try{const value=$(kind==='teacher'?'teacherPricingEffectiveMonth':'studentPricingEffectiveDate')?.value||'',effectiveFrom=kind==='teacher'?value+'-01':value;
  Object.assign(after,withPricingChange(before,after,{kind,effectiveFrom,today:pricingToday()}));return true;
 }catch(error){alert(error?.message||'費率歷程未儲存');return false}
}
function renderStudentTeacherPricing(s={}){
 ensureStudentTeacherPricingFields();if($('studentPartTimeTeacherRate'))$('studentPartTimeTeacherRate').value=s.partTimeTeacherRate??'';renderPricingEffectiveDate('student',s);
 const parent=$('parentName');if(parent&&!$('studentBillingFamilyId')){const box=document.createElement('div');box.className='individual-student-field';box.innerHTML='<label for="studentBillingFamilyId">家庭識別碼（同名分戶）</label><input id="studentBillingFamilyId" type="text" maxlength="80"><details><summary>如何使用</summary><p class="small">同一家庭填相同代號；不同家庭填不同代號。LINE 稱呼仍使用家長姓名。留白沿用姓名分組，多名孩子須先核對。</p></details>';parent.parentElement.after(box)}
 if($('studentBillingFamilyId'))$('studentBillingFamilyId').value=s.billingFamilyId||'';
}
function saveStudentTeacherPricing(s){
  const income=$('studentRate');if(income&&income.value!==''&&(!income.validity.valid||!Number.isFinite(Number(income.value))||Number(income.value)<0)){alert('向學生收取的費用必須是 0 或正數');return false}
  const field=$('studentPartTimeTeacherRate');if(!field)return true;
  const raw=field.value.trim();if(raw===''){delete s.partTimeTeacherRate;return true}
  const value=Number(raw);if(!field.validity.valid||!Number.isFinite(value)||value<0){alert('支付兼職老師的鐘點費必須是 0 或正數，最多兩位小數');return false}
  s.partTimeTeacherRate=value;return true;
}
document.addEventListener('DOMContentLoaded',()=>{renderStudentTeacherPricing();renderPricingEffectiveDate('teacher')});
