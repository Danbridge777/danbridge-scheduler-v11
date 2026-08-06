/* Danbridge Scheduler V15.9 — Business logic module
 * Extracted from application-and-business-features.js without changing behavior.
 * Loaded as a classic script so existing global callers remain compatible.
 */

function lessonMakeupId(l){const explicit=String(l?.makeupId||'').trim();if(explicit)return explicit;return String(l?.note||'').match(/(?:^|｜|\s)MAKEUP:([^｜\s]+)/)?.[1]||''}
function lessonIsLinkedMakeup(l){return !!(l?.isMakeup||lessonMakeupId(l)||l?.sourceLessonId)}
function lessonOutcome(l){return String(l?.teacherReportStatus||l?.status||'')}
function lessonCountsAsTaught(l){return ['completed','makeup_completed','已上課','補課完成'].includes(lessonOutcome(l))}
function lessonCountsForTeacherPay(l){if(!l||l.isDraft||l.payTeacher==='no')return false;return lessonCountsAsTaught(l)||['no_show','缺席'].includes(lessonOutcome(l))}
function lessonCountsForStudentCharge(l){if(!l||l.isDraft||l.chargeStudent==='no'||lessonIsLinkedMakeup(l))return false;return !['teacher_leave','老師請假','取消','停課'].includes(lessonOutcome(l))}
function lessonCharge(l){if(!lessonCountsForStudentCharge(l))return 0;const s=student(l.studentId),rate=Number(s.rate)||0,duration=hours(l.start,l.end);return rate*duration}

/* V17.25 — revenue is derived from actual teacher schedule rows, never from a headcount multiplier.
 * Every teacher assigned to a formal timetable lesson owns one independent revenue row.
 * Each row amount = the student's hourly rate × that lesson's scheduled duration.
 * Repeated lessons remain repeated rows and are never deduplicated. Collection confirmation,
 * payment status, report status and lesson status are display-only metadata for revenue. */
function teacherScheduleRevenueRows(l){
  if(!l||l.isDraft||effectiveCampId(l))return [];
  const amount=lessonCharge(l);
  return lessonTeacherIds(l).map(teacherId=>({teacherId,lesson:l,amount}));
}
function timetableRevenueCharge(l){
  if(!l||l.isDraft||effectiveCampId(l))return 0;
  return lessonCharge(l);
}

/* Summer-camp tuition is earned from the registration record, never from camp timetable rows.
 * This keeps a multi-teacher camp from multiplying student revenue. */
function campRegistrationSeason(r){return r?.season==='winter'?'winter':'summer'}
function campRegistrationLabel(r){return campRegistrationSeason(r)==='winter'?'冬令營':'夏令營'}
const CAMP_BILLING_SEASON_KEY='danbridge_camp_billing_season';
function activeCampBillingSeason(next=''){
  if(next==='summer'||next==='winter'){try{localStorage.setItem(CAMP_BILLING_SEASON_KEY,next)}catch{}return next}
  try{const saved=localStorage.getItem(CAMP_BILLING_SEASON_KEY);if(saved==='summer'||saved==='winter')return saved}catch{}
  const selected=document.getElementById('summerRegistrationSeason')?.value;if(selected==='summer'||selected==='winter')return selected;
  const month=Number(String(document.getElementById('summerRegistrationMonth')?.value||'').slice(5,7));return month===1||month===2?'winter':'summer';
}
function summerCampRegistrationRows(m,scope='all',season='all'){
  const rows=[...(db.summerCampRegistrations||[]).map(r=>({...r,season:'summer'})),...(db.winterCampRegistrations||[]).map(r=>({...r,season:'winter'}))];
  return rows.filter(r=>(!m||r.month===m)&&(scope==='all'||(r.branchId||'unassigned')===scope)&&(season==='all'||campRegistrationSeason(r)===season));
}
function summerCampRegistrationRevenue(m,scope='all'){
  return summerCampRegistrationRows(m,scope).reduce((sum,r)=>sum+(typeof summerRegistrationTotal==='function'?summerRegistrationTotal(r):(+r.totalFee||0)),0);
}
function studentSummerCampRevenue(studentId,m,scope='all'){
  return summerCampRegistrationRows(m,scope).filter(r=>r.studentId===studentId).reduce((sum,r)=>sum+(typeof summerRegistrationTotal==='function'?summerRegistrationTotal(r):(+r.totalFee||0)),0);
}
function studentChargeableTutoringLessons(studentId,m,scope='all',sourceLessons=null){
  const branchOf=l=>l.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l.location||'')||'unassigned';
  return (sourceLessons||db.lessons||[]).filter(l=>lessonCountsForStudentCharge(l)&&l.studentId===studentId&&l.date?.startsWith(m)&&!effectiveCampId(l)&&(scope==='all'||branchOf(l)===scope));
}
function studentMonthlyBillingData(studentId,m,scope='all',campSeason='all'){
  const s=student(studentId),tutoringLessons=studentChargeableTutoringLessons(studentId,m,scope);
  const tutoringHours=tutoringLessons.reduce((sum,l)=>sum+hours(l.start,l.end),0),tutoringRate=+s.rate||0,tutoringAmount=tutoringLessons.reduce((sum,l)=>sum+lessonCharge(l),0);
  const campRows=summerCampRegistrationRows(m,scope,campSeason).filter(r=>r.studentId===studentId),campAmount=campRows.reduce((sum,r)=>sum+summerRegistrationTotal(r),0);
  const campDates=[...new Set(campRows.flatMap(r=>r.dates||[]))].sort();
  return{student:s,month:m,scope,tutoringLessons,tutoringHours,tutoringRate,tutoringAmount,campRows,campDates,campAmount,total:tutoringAmount+campAmount};
}
function billingNumber(n){const value=Math.round((+n||0)*100)/100;return Number.isInteger(value)?String(value):String(value.toFixed(2)).replace(/0+$/,'').replace(/\.$/,'')}
function billingMonthLabel(m){const[y,month]=String(m||'').split('-').map(Number);return `${y} 年 ${month} 月`}
function billingCampFormula(rows){
  if(!rows.length)return'';if(rows.length>1)return`${rows.length} 筆報名`;
  const r=rows[0],mode=summerRegistrationPricingMode(r),days=(r.dates||[]).length,weeks=summerRegistrationWeekCount(r.dates||[]);
  if(mode==='monthly')return`月費 ${money(+r.monthlyRate||0)}`;
  if(mode==='weekly')return`${weeks} 週 × ${money(+r.weeklyRate||0)}`;
  if(mode==='weeklySplit')return`前 ${+r.frontWeeks||0} 週 ${money(+r.frontWeeklyRate||0)}／週，後段 ${money(+r.backWeeklyRate||0)}／週`;
  return`${days} 天 × ${money(+r.dailyRate||0)}`;
}
function billingParentName(value){return String(value||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()}
function billingLineSalutation(studentId){return String(student(studentId)?.lineSalutation||'媽咪').trim()||'媽咪'}
function billingFamilyStudents(studentId){
  const selected=student(studentId),parent=billingParentName(selected.parent);
  if(!parent)return[selected];
  return(db.students||[]).filter(s=>!s.campSeason&&billingParentName(s.parent)===parent);
}
function studentBillingSections(d,includeName=false){
  const lines=[];if(includeName)lines.push(`${d.student.name||'學生'}`);
  if(d.tutoringLessons.length)lines.push('家教',`共 ${billingNumber(d.tutoringHours)} 小時`,`${billingNumber(d.tutoringHours)} 小時 × ${money(d.tutoringRate)}`,`小計：${money(d.tutoringAmount)}`,'');
  if(d.campRows.length){['summer','winter'].forEach(season=>{const rows=d.campRows.filter(r=>campRegistrationSeason(r)===season);if(!rows.length)return;const dates=[...new Set(rows.flatMap(r=>r.dates||[]))].sort().map(date=>`${+date.slice(5,7)}/${+date.slice(8,10)}`).join('、'),amount=rows.reduce((sum,r)=>sum+summerRegistrationTotal(r),0);lines.push(season==='winter'?'冬令營':'夏令營',`報名日期：${dates}`,billingCampFormula(rows),`小計：${money(amount)}`,'')})}
  return lines;
}
function studentLineBillingText(studentId,m,scope='all',familyStudentIds=null,campSeason=activeCampBillingSeason()){
  const explicitIds=Array.isArray(familyStudentIds)?new Set(familyStudentIds.filter(Boolean)):null;
  const family=explicitIds?[...explicitIds].map(student).filter(s=>s.id):billingFamilyStudents(studentId),details=family.map(s=>studentMonthlyBillingData(s.id,m,scope,campSeason)).filter(d=>d.tutoringLessons.length||d.campRows.length),multiple=family.length>1;
  const salutation=billingLineSalutation(studentId),total=details.reduce((sum,d)=>sum+d.total,0);let lines=[`${salutation}好，以下是小朋友 ${billingMonthLabel(m)}的課程費用明細：`,''];
  details.forEach(d=>lines.push(...studentBillingSections(d,multiple)));
  const monthNumber=Number(String(m||'').slice(5,7))||Number(String(m||'').split('-')[1])||'';
  lines.push(`${monthNumber}月共計：${money(total)}`,'',`以上請${salutation}確認！`);return lines.join('\n');
}
function copyStudentLineBilling(studentId,m,scope='all',encodedFamilyIds='',campSeason=activeCampBillingSeason()){
  const familyIds=encodedFamilyIds?decodeURIComponent(encodedFamilyIds).split(',').filter(Boolean):null,text=studentLineBillingText(studentId,m,scope,familyIds,campSeason),done=()=>toast('LINE 對帳內容已複製');
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).then(done).catch(()=>copyStudentLineBillingFallback(text,done));
  copyStudentLineBillingFallback(text,done);
}
function copyStudentLineBillingFallback(text,done){const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();done()}

/* Company revenue generated by one teacher's timetable.
 * This walks that teacher's own schedule rows one by one; it does not multiply by
 * a teacher count and does not deduplicate repeated course records. */
function teacherCompanyRevenue(t,m,lessons){
  return (lessons||db.lessons||[])
    .filter(l=>!l.isDraft&&(!m||l.date.startsWith(m)))
    .flatMap(teacherScheduleRevenueRows)
    .filter(row=>row.teacherId===t.id)
    .reduce((sum,row)=>sum+row.amount,0);
}

function lessonTeacherPay(l,tid){if(!lessonCountsForTeacherPay(l)||!lessonTeacherIds(l).includes(tid))return 0;const camp=effectiveCampId(l);if(camp){const idx=db.lessons.indexOf(l);/* 同一老師若同時掛在同營隊多個班，只計一次該時段；不同老師仍各自完整計薪。 */const duplicate=db.lessons.some((x,i)=>i<idx&&lessonCountsForTeacherPay(x)&&sameCampSlot(l,x)&&lessonTeacherIds(x).includes(tid));if(duplicate)return 0}return(+teacher(tid).rate||0)*hours(l.start,l.end)}

function lessonPay(l){return lessonTeacherIds(l).reduce((sum,id)=>sum+lessonTeacherPay(l,id),0)}

function fixedExpenseApplies(x,m){const start=x.startMonth||'2026-07',end=x.endMonth||'';return m>=start&&(!end||m<=end)}

function financeData(m){const lessons=db.lessons.filter(l=>l.date.startsWith(m)),lessonRevenue=lessons.reduce((a,l)=>a+timetableRevenueCharge(l),0),campRevenue=summerCampRegistrationRevenue(m),revenue=lessonRevenue+campRevenue;const fixed=(db.fixedExpenses||[]).filter(x=>fixedExpenseApplies(x,m));const one=(db.oneTimeExpenses||[]).filter(x=>x.month===m);const fixedTotal=fixed.reduce((a,x)=>a+(+x.amount||0),0);const oneTimeTotal=one.reduce((a,x)=>a+(+x.amount||0),0);const payrollRows=db.teachers.map(t=>{const paid=teacherPaidLessons(t,m),payroll=calculateTeacherPayroll(t,m,paid);return{teacher:t,h:payroll.actualHours,amount:payroll.amount,payroll}}).filter(x=>x.h||x.amount);const payroll=payrollRows.reduce((a,x)=>a+x.amount,0);const totalExpenses=fixedTotal+oneTimeTotal+payroll;return{m,revenue,lessonRevenue,campRevenue,fixed,one,fixedTotal,oneTimeTotal,payrollRows,payroll,totalExpenses,profit:revenue-totalExpenses}}

function monthDateRange(m){const[y,mo]=m.split('-').map(Number);return{start:new Date(y,mo-1,1),end:new Date(y,mo,0)}}

function countTeacherWorkDaysInRange(t,start,end){const set=new Set((t.workDays||[]).map(Number));let count=0;for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1))if(set.has(d.getDay()))count++;return count}

function teacherExpectedHours(t,m){const days=(t.workDays||[]).length,weekly=+t.minWeeklyHours||0;if(!days||!weekly)return 0;const r=monthDateRange(m),count=countTeacherWorkDaysInRange(t,r.start,r.end);return weekly/days*count}

function teacherPaidLessons(t,m){return db.lessons.filter(l=>l.date.startsWith(m)&&lessonTeacherIds(l).includes(t.id)&&lessonCountsForTeacherPay(l))}

function payrollNumber(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  const value=Number(raw);
  return Number.isFinite(value)&&value>=0?value:null;
}
function teacherBaseSalary(t){return payrollNumber(t?.baseSalary)}
function teacherOvertimeRate(t){return payrollNumber(t?.overtimeRate)}
function teacherDeductionRate(t){return payrollNumber(t?.deductionRate)}
function teacherPayrollMode(t){
  if(t?.payrollMode==='fixed'||t?.payrollMode==='hourly')return t.payrollMode;
  return teacherBaseSalary(t)!==null?'fixed':'hourly';
}
function calculateTeacherPayroll(t,m,paid){
  const rows=paid||teacherPaidLessons(t,m);
  const actualHours=rows.reduce((a,l)=>a+hours(l.start,l.end),0);
  const mode=teacherPayrollMode(t);
  const expectedHours=teacherExpectedHours(t,m);
  const diff=actualHours-expectedHours;
  if(mode==='hourly'){
    const hourlyRate=payrollNumber(t?.rate)??0;
    const amount=rows.reduce((a,l)=>a+lessonTeacherPay(l,t.id),0);
    return{teacher:t,month:m,mode,rows,actualHours,expectedHours:0,diff:actualHours,baseSalary:null,overtimeHours:0,shortHours:0,overtimeRate:null,deductionRate:null,hourlyRate,addition:amount,deduction:0,amount,configured:hourlyRate>0};
  }
  const baseSalary=teacherBaseSalary(t),overtimeRate=teacherOvertimeRate(t),deductionRate=teacherDeductionRate(t);
  const overtimeHours=Math.max(0,diff),shortHours=Math.max(0,-diff);
  const addition=overtimeHours*(overtimeRate??0),deduction=shortHours*(deductionRate??0);
  const configured=baseSalary!==null&&overtimeRate!==null&&deductionRate!==null;
  const amount=configured?Math.max(0,baseSalary+addition-deduction):0;
  return{teacher:t,month:m,mode,rows,actualHours,expectedHours,diff,baseSalary,overtimeHours,shortHours,overtimeRate,deductionRate,hourlyRate:null,addition,deduction,amount,configured};
}
function teacherPayrollAmount(t,m,paid){return calculateTeacherPayroll(t,m,paid).amount}
function teacherPayrollFormulaText(result){
  if(result.mode==='hourly')return `純時薪：${fmtHours(result.actualHours)} hr × ${money(result.hourlyRate||0)}`;
  if(!result.configured)return '薪資設定未完成：請填固定底薪、超時時薪與不足扣款時薪';
  if(result.diff>0)return `底薪 ${money(result.baseSalary)}＋超時 ${fmtHours(result.overtimeHours)} hr × ${money(result.overtimeRate)}`;
  if(result.diff<0)return `底薪 ${money(result.baseSalary)}－不足 ${fmtHours(result.shortHours)} hr × ${money(result.deductionRate)}`;
  return `固定底薪 ${money(result.baseSalary)}`;
}

function teacherWeekBreakdown(t,m){const r=monthDateRange(m),daily=(+t.minWeeklyHours||0)/Math.max(1,(t.workDays||[]).length),rows=[];let cursor=new Date(r.start);cursor.setDate(cursor.getDate()-((cursor.getDay()+6)%7));while(cursor<=r.end){const ws=new Date(cursor),we=new Date(cursor);we.setDate(we.getDate()+6);const from=ws<r.start?r.start:ws,to=we>r.end?r.end:we,workCount=countTeacherWorkDaysInRange(t,from,to),expected=daily*workCount;const actual=teacherPaidLessons(t,m).filter(l=>{const d=new Date(l.date+'T00:00:00');return d>=from&&d<=to}).reduce((a,l)=>a+hours(l.start,l.end),0);rows.push({from:localDate(from),to:localDate(to),expected,actual,diff:actual-expected});cursor.setDate(cursor.getDate()+7)}return rows}

function diffClass(n){return n<-.001?'hours-short':n>.001?'hours-over':'hours-even'}

function diffText(n){return Math.abs(n)<.001?'剛好':n>0?`多 ${fmtHours(n)} hr`:`少 ${fmtHours(Math.abs(n))} hr`}

function settleData(){const m=$('settleMonth').value||monthNow(),ls=db.lessons.filter(l=>!l.isDraft&&l.date.startsWith(m));const sr=db.students.map(s=>{const x=ls.filter(l=>l.studentId===s.id),chargedLessons=studentChargeableTutoringLessons(s.id,m,'all',ls),abs=x.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status)),lessonAmount=chargedLessons.reduce((a,l)=>a+lessonCharge(l),0),campAmount=studentSummerCampRevenue(s.id,m);return{s,total:x.length,charged:chargedLessons.length,h:chargedLessons.reduce((a,l)=>a+hours(l.start,l.end),0),abs:abs.length,rate:x.length?abs.length/x.length*100:0,lessonAmount,campAmount,amount:lessonAmount+campAmount}}).filter(x=>x.total||x.campAmount);const tr=db.teachers.map(t=>{const paid=teacherPaidLessons(t,m),payroll=calculateTeacherPayroll(t,m,paid),weeks=teacherWeekBreakdown(t,m);return{t,count:paid.length,h:payroll.actualHours,expected:payroll.expectedHours,diff:payroll.diff,weeks,amount:payroll.amount,revenue:teacherCompanyRevenue(t,m,ls),payroll}});return{sr,tr}}

function settlementSummaryTotals(studentRows){const rows=studentRows||[],totalLessons=rows.reduce((n,x)=>n+(+x.total||0),0),leaveCount=rows.reduce((n,x)=>n+(+x.abs||0),0);return{totalLessons,leaveCount,leaveRate:totalLessons?Math.min(100,leaveCount/totalLessons*100):0}}

function monthlySettlementSnapshot(m){
  const ls=db.lessons.filter(l=>l.date.startsWith(m));
  const actualLessons=ls.filter(lessonCountsAsTaught);
  const totalLessons=actualLessons.length;
  const totalHours=actualLessons.reduce((a,l)=>a+hours(l.start,l.end),0);
  const totalRevenue=ls.reduce((a,l)=>a+timetableRevenueCharge(l),0);
  const leaveStatuses=new Set(['學生請假','老師請假','取消','停課']);
  const leaveCount=ls.filter(l=>leaveStatuses.has(l.status)).length;
  const leaveRate=ls.length?leaveCount/ls.length*100:0;
  const payroll=db.teachers.reduce((sum,t)=>sum+teacherPayrollAmount(t,m),0);
  return{month:m,savedAt:new Date().toISOString(),totalLessons,totalHours,totalRevenue,leaveCount,leaveRate,payroll};
}
