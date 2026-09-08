/* Owner-only student pricing. Revenue and part-time teaching cost stay independent. */
function ensureStudentTeacherPricingFields(){
  const rate=$('studentRate');if(!rate||$('studentPartTimeTeacherRate'))return;
  const box=document.createElement('div');box.id='studentTeacherPricingFields';
  box.innerHTML='<label for="studentPartTimeTeacherRate">支付兼職老師的鐘點費</label><input id="studentPartTimeTeacherRate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="留白沿用老師原有時薪"><p class="small">只適用身份為兼職、純時薪制的老師。家教按這位學生設定；團班請填在團班資料，整班每小時付一次，不按孩子人數累加。留白沿用老師時薪，填 0 表示不支付；正職底薪不受影響。</p>';
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
