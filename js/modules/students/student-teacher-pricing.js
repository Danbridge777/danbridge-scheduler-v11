/* Owner-only student pricing. Revenue and part-time teaching cost stay independent. */
function ensureStudentTeacherPricingFields(){
  const rate=$('studentRate');if(!rate||$('studentPartTimeTeacherRate'))return;
  const box=document.createElement('div');box.id='studentTeacherPricingFields';
  box.innerHTML='<label for="studentPartTimeTeacherRate">兼職老師鐘點費</label><input id="studentPartTimeTeacherRate" type="number" min="0" step="0.01" inputmode="decimal"><details class="student-pricing-details"><summary>計薪說明</summary><p class="small">留白沿用老師時薪，0 為不支付。家教按學生設定；團課整班每小時只付一次。僅適用兼職純時薪制，不影響正職底薪。</p></details>';
  rate.parentElement.after(box);
}
function renderStudentTeacherPricing(s={}){ensureStudentTeacherPricingFields();if($('studentPartTimeTeacherRate'))$('studentPartTimeTeacherRate').value=s.partTimeTeacherRate??''}
function saveStudentTeacherPricing(s){
  const income=$('studentRate');if(income&&income.value!==''&&(!income.validity.valid||!Number.isFinite(Number(income.value))||Number(income.value)<0)){alert('向學生收取的費用必須是 0 或正數');return false}
  const field=$('studentPartTimeTeacherRate');if(!field)return true;
  const raw=field.value.trim();if(raw===''){delete s.partTimeTeacherRate;return true}
  const value=Number(raw);if(!field.validity.valid||!Number.isFinite(value)||value<0){alert('支付兼職老師的鐘點費必須是 0 或正數，最多兩位小數');return false}
  s.partTimeTeacherRate=value;return true;
}
document.addEventListener('DOMContentLoaded',()=>renderStudentTeacherPricing());
