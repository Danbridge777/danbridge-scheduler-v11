/* Danbridge Scheduler V15.9 — Business logic module
 * Extracted from application-and-business-features.js without changing behavior.
 * Loaded as a classic script so existing global callers remain compatible.
 */

function pricingFields(kind){return kind==='teacher'?['rate','payrollMode','baseSalary','overtimeRate','deductionRate','minWeeklyHours','workDays','type']:['rate','partTimeTeacherRate','courseType']}
function pricingSnapshot(record,kind){return Object.fromEntries(pricingFields(kind).map(key=>[key,record?.[key]===undefined?null:JSON.parse(JSON.stringify(record[key]))]))}
function pricingDateValid(date){return typeof date==='string'&&date>='0001-01-01'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date}
function checkedPricingRows(record,kind){
 if(record?.pricingHistory===undefined&&record?.pricingHistoryVersion===undefined)return null;
 const rows=record.pricingHistory,fields=pricingFields(kind);let previous='';
 if(record.pricingHistoryVersion!==1||!Array.isArray(rows)||!rows.length||rows.length>120)throw new Error('費率歷程版本或筆數不符，請核對後再計算');
 for(const row of rows){
  if(!row||!pricingDateValid(row.effectiveFrom)||row.effectiveFrom<=previous||!row.values||typeof row.values!=='object'||Array.isArray(row.values)||Object.keys(row.values).length!==fields.length||fields.some(key=>!Object.hasOwn(row.values,key)))throw new Error('費率歷程日期或欄位不符，請核對後再計算');
  // Validate imported/cached data as well as server-validated writes. A bad
  // historical amount must never become zero via Number(value) || 0.
  for(const [key,value] of Object.entries(row.values)){
   if(value===null)continue;
   if(key==='workDays'){
    if(!Array.isArray(value)||value.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(value).size!==value.length)throw new Error('費率歷程上班日格式不符，請核對後再計算');
   }else if(['courseType','payrollMode','type'].includes(key)){
    if(typeof value!=='string')throw new Error('費率歷程計費類型格式不符，請核對後再計算');
   }else if(!(typeof value==='number'||typeof value==='string')||!Number.isFinite(Number(value))||Number(value)<0)throw new Error('費率歷程金額或時數無效，請核對後再計算');
  }
  previous=row.effectiveFrom;
 }
 if(rows[0].effectiveFrom!=='0001-01-01')throw new Error('費率歷程缺少原始基準，請核對後再計算');return rows;
}
function pricingProfileAt(record,date,kind='student'){
 const rows=checkedPricingRows(record,kind);if(!rows)return record||{};
 if(!pricingDateValid(date))throw new Error('費率計算日期無效');
 let selected=null;
 for(const row of rows){if(row.effectiveFrom<=date&&(!selected||row.effectiveFrom>selected.effectiveFrom))selected=row}
 if(!selected)throw new Error('找不到指定日期的費率，請先核對歷史設定');
 const value={...record};for(const key of pricingFields(kind)){if(selected.values[key]===null||selected.values[key]===undefined)delete value[key];else value[key]=selected.values[key]}
 return value;
}
function withPricingChange(before,after,{kind='student',effectiveFrom,today}={}){
 checkedPricingRows(before,kind);
 const next=pricingSnapshot(after,kind),prior=pricingSnapshot(before,kind);
 if(!before?.id||JSON.stringify(prior)===JSON.stringify(next))return after;
 if(!pricingDateValid(today)||!pricingDateValid(effectiveFrom)||effectiveFrom<today)throw new Error('費率生效日不得早於今天；歷史更正請使用月結調整，不直接覆寫舊費率');
 if((kind==='teacher'||before.courseType!==after.courseType||before.courseType==='安親'||after.courseType==='安親')&&!effectiveFrom.endsWith('-01'))throw new Error('薪資制度、安親月費或課程類型變更須從月份第一天生效');
 const history=Array.isArray(before.pricingHistory)&&before.pricingHistory.length?JSON.parse(JSON.stringify(before.pricingHistory)):[{effectiveFrom:'0001-01-01',values:prior,source:'preserved-before-first-change'}];
 if(history.length>=120&&!history.some(row=>row.effectiveFrom===effectiveFrom))throw new Error('費率歷程已達保護上限，請先封存核對，不會丟棄舊價格');
 const rows=history.filter(row=>row.effectiveFrom!==effectiveFrom);rows.push({effectiveFrom,values:next,source:'explicit-rate-change'});rows.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 const result={...after,pricingHistoryVersion:1,pricingHistory:rows};
 // Inserting an intermediate future price must not erase a later agreement.
 for(const key of pricingFields(kind)){const value=rows[rows.length-1].values[key];if(value===null||value===undefined)delete result[key];else result[key]=value}
 return result;
}
function studentPricingAt(value,date){return pricingProfileAt(typeof value==='object'&&value?value:student(value),date,'student')}
function teacherPricingAt(value,date){return pricingProfileAt(typeof value==='object'&&value?value:teacher(value),date,'teacher')}

function lessonMakeupId(l){const explicit=String(l?.makeupId||'').trim();if(explicit)return explicit;return String(l?.note||'').match(/(?:^|｜|\s)MAKEUP:([^｜\s]+)/)?.[1]||''}
function lessonIsLinkedMakeup(l){return !!(l?.isMakeup||lessonMakeupId(l)||l?.sourceLessonId)}
function lessonOutcome(l){return String(l?.teacherReportStatus||l?.status||'')}
function lessonCountsAsTaught(l){return ['completed','makeup_completed','已上課','補課完成'].includes(lessonOutcome(l))}
function lessonCountsForTeacherHours(l){return !!l&&!l.isDraft}
function lessonCountsForTeacherPay(l){return !!l&&!l.isDraft&&l.payTeacher!=='no'}
function lessonCountsForStudentCharge(l){if(!l||l.isDraft||l.chargeStudent==='no'||lessonIsLinkedMakeup(l))return false;return !['teacher_leave','老師請假','取消','停課'].includes(lessonOutcome(l))}
function studentBillingCategory(value){const s=typeof value==='object'&&value?value:student(value);return s?.courseType==='安親'?'after_school_monthly':s?.courseType==='團班'?'group_hourly':'tutoring_hourly'}
function studentUsesMonthlyFee(value,date=''){return studentBillingCategory(date?studentPricingAt(value,date):value)==='after_school_monthly'}
function studentIsPresentForBilling(s){return !!s?.id&&!s.campSeason&&!String(s.archivedAt||'').trim()}
function studentMonthlyFlatFee(value){const s=typeof value==='object'&&value?value:student(value);return studentIsPresentForBilling(s)&&studentUsesMonthlyFee(s)?Math.max(0,Number(s.rate)||0):0}
function lessonBillingStudentIds(l){
  if(!l)return[];
  if(Array.isArray(l.groupStudentIds)&&l.groupStudentIds.length)return [...new Set(l.groupStudentIds)];
  const s=student(l.studentId);
  return s.isGroupRoster?[...new Set(s.groupMemberIds||[])]:[l.studentId];
}
function lessonIncludesStudent(l,id){return lessonBillingStudentIds(l).includes(id)}
function lessonStudentCharge(l,id){if(!lessonCountsForStudentCharge(l)||!lessonIncludesStudent(l,id))return 0;const s=studentPricingAt(id,l.date);return s.isGroupRoster||studentUsesMonthlyFee(s)?0:Math.max(0,Number(s.rate)||0)*hours(l.start,l.end)}
function lessonCharge(l){return lessonBillingStudentIds(l).reduce((sum,id)=>sum+lessonStudentCharge(l,id),0)}
function lessonChargeLabel(l){return studentUsesMonthlyFee(student(l?.studentId),l?.date)?'安親月費制':money(lessonCharge(l))}

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
/* Revenue ownership is explicit and independent of the attendance classroom.
 * Old rows without a snapshot use the student's newly supplied ownership field;
 * neither legacy branchIds nor attendance location may silently supply it. */
function timetableBillingBranchId(l){
  return l?.billingBranchId||student(l?.studentId).billingBranchId||'unassigned';
}
function studentMonthlyFeeBranch(studentId,m){
  return student(studentId).billingBranchId||'unassigned';
}
function studentChargeableTutoringLessons(studentId,m,scope='all',sourceLessons=null){
  const branchOf=timetableBillingBranchId;
  return (sourceLessons||db.lessons||[]).filter(l=>lessonCountsForStudentCharge(l)&&lessonIncludesStudent(l,studentId)&&l.date?.startsWith(m)&&!effectiveCampId(l)&&(scope==='all'||branchOf(l)===scope));
}
function studentMonthlyBillingData(studentId,m,scope='all',campSeason='all'){
  const s=studentPricingAt(studentId,m+'-01'),tutoringLessons=studentChargeableTutoringLessons(studentId,m,scope);
  const afterSchool=studentUsesMonthlyFee(s),afterSchoolLessons=afterSchool?tutoringLessons:[],groupLessons=afterSchool?[]:tutoringLessons.filter(l=>(l.groupStudentIds?.length||student(l.studentId).courseType==='團班')),privateLessons=afterSchool?[]:tutoringLessons.filter(l=>!(l.groupStudentIds?.length||student(l.studentId).courseType==='團班'));
  const privateHours=privateLessons.reduce((sum,l)=>sum+hours(l.start,l.end),0),privateAmount=privateLessons.reduce((sum,l)=>sum+lessonStudentCharge(l,studentId),0),groupHours=groupLessons.reduce((sum,l)=>sum+hours(l.start,l.end),0),groupAmount=groupLessons.reduce((sum,l)=>sum+lessonStudentCharge(l,studentId),0);
  const afterSchoolHours=afterSchoolLessons.reduce((sum,l)=>sum+hours(l.start,l.end),0),afterSchoolInScope=scope==='all'||studentMonthlyFeeBranch(studentId,m)===scope,afterSchoolAmount=afterSchoolInScope?studentMonthlyFlatFee(s):0,tutoringHours=afterSchool?afterSchoolHours:privateHours+groupHours,tutoringRate=+s.rate||0,tutoringAmount=afterSchoolAmount+privateAmount+groupAmount;
  const campRows=summerCampRegistrationRows(m,scope,campSeason).filter(r=>r.studentId===studentId),campAmount=campRows.reduce((sum,r)=>sum+summerRegistrationTotal(r),0);
  const campDates=[...new Set(campRows.flatMap(r=>r.dates||[]))].sort();
  return{student:s,month:m,scope,billingCategory:studentBillingCategory(s),billable:studentIsPresentForBilling(s),tutoringLessons,tutoringHours,tutoringRate,tutoringAmount,afterSchoolLessons,afterSchoolHours,afterSchoolAmount,privateLessons,privateHours,privateAmount,groupLessons,groupHours,groupAmount,campRows,campDates,campAmount,total:tutoringAmount+campAmount};
}
function studentTuitionRevenue(m,scope='all'){return(db.students||[]).reduce((sum,s)=>sum+studentMonthlyBillingData(s.id,m,scope).tutoringAmount,0)}
// Every payment covers identified charge items, not a global money bucket.
// Repeated all-campus / campus receipts cover the same item only once.
function billingCollectionItems(m){
  const items=[];
  for(const s of db.students||[]){
    if(!s.id||s.isGroupRoster)continue;
    const data=studentMonthlyBillingData(s.id,m);
    if(data.afterSchoolAmount>0)items.push({key:JSON.stringify(['monthly',m,s.id]),studentId:s.id,branchId:studentMonthlyFeeBranch(s.id,m),kind:'tuition',amount:data.afterSchoolAmount,paid:false});
    for(const lesson of data.tutoringLessons){
      const amount=lessonStudentCharge(lesson,s.id);if(!(amount>0))continue;
      items.push({key:JSON.stringify(['lesson',lesson.id,s.id]),studentId:s.id,branchId:timetableBillingBranchId(lesson),kind:'tuition',amount,paid:lesson.paymentStatus==='paid'});
    }
    for(const row of data.campRows){
      const amount=summerRegistrationTotal(row);if(!(amount>0))continue;
      items.push({key:JSON.stringify(['camp',row.season,row.id,s.id]),studentId:s.id,branchId:row.branchId||'unassigned',kind:'camp',amount,paid:false});
    }
  }
  return items;
}
function billingCollectionRecordStudentIds(record){
  const raw=Array.isArray(record.studentIds)?record.studentIds:String(record.familyKey||String(record.id||'').split('|').pop()||'').split(',');
  return new Set(raw.filter(Boolean).map(String));
}
function billingCollectionSnapshot(studentIds,m,scope='all'){
  const ids=new Set(studentIds.map(String));
  return billingCollectionItems(m).filter(item=>ids.has(String(item.studentId))&&(scope==='all'||item.branchId===scope)).map(({key,studentId,branchId,kind,amount})=>({key,studentId,branchId,kind,amount}));
}
function billingCollectionBalance(m,scope='all',includeCamp=false,studentIds=null){
  const items=billingCollectionItems(m),covered=new Map(items.map(item=>[item.key,item.paid?item.amount:0])),issues=[];
  for(const record of db.collectionRecords||[]){
    if(record.month!==m||record.status!=='collected')continue;
    const ids=billingCollectionRecordStudentIds(record),branch=record.branchId||'all';
    const candidates=items.filter(item=>ids.has(String(item.studentId))&&(branch==='all'||item.branchId===branch));
    if(!candidates.length)continue;
    const total=candidates.reduce((sum,item)=>sum+item.amount,0),amount=Math.max(0,Number(record.amount)||0);
    let allocations;
    if(record.billingItemsVersion===1&&Array.isArray(record.billingItems)){
      const unique=new Map(record.billingItems.map(item=>[item.key,item]));
      allocations=candidates.map(item=>{const paid=unique.get(item.key);return paid&&String(paid.studentId)===String(item.studentId)&&paid.branchId===item.branchId?{...item,amount:Math.min(item.amount,Math.max(0,Number(paid.amount)||0))}:null}).filter(Boolean);
      if(allocations.reduce((sum,item)=>sum+item.amount,0)>amount+.001){issues.push({recordId:record.id,items:candidates});continue}
    }else if(amount+.001>=total){
      allocations=candidates;
    }else if(candidates.length===1){
      allocations=[{...candidates[0],amount}];
    }else{
      // Legacy partial receipts have no trustworthy lesson/campus allocation.
      // Preserve them, flag review, and never invent an allocation to a child.
      issues.push({recordId:record.id,items:candidates});continue;
    }
    for(const item of allocations)covered.set(item.key,Math.max(covered.get(item.key)||0,item.amount));
  }
  const selectedIds=studentIds?new Set(studentIds.map(String)):null;
  const selected=items.filter(item=>(includeCamp||item.kind==='tuition')&&(scope==='all'||item.branchId===scope)&&(!selectedIds||selectedIds.has(String(item.studentId))));
  const keys=new Set(selected.map(item=>item.key)),due=selected.reduce((sum,item)=>sum+item.amount,0),collected=selected.reduce((sum,item)=>sum+Math.min(item.amount,covered.get(item.key)||0),0);
  const reviewRecords=issues.filter(issue=>issue.items.some(item=>keys.has(item.key))).map(issue=>issue.recordId);
  return{due,collected,unpaid:Math.max(0,due-collected),requiresReview:reviewRecords.length>0,reviewRecords,items:selected.map(item=>({...item,collected:Math.min(item.amount,covered.get(item.key)||0)})),reviewStudentIds:[...new Set(issues.filter(issue=>reviewRecords.includes(issue.recordId)).flatMap(issue=>issue.items.map(item=>String(item.studentId))))]};
}
function studentUnpaidTuitionRevenue(m,scope='all'){return billingCollectionBalance(m,scope).unpaid}
function studentUnpaidTuitionLabel(m,scope='all'){const balance=billingCollectionBalance(m,scope);return balance.requiresReview?'需核對':money(balance.unpaid)}
function billingNumber(n){const value=Math.round((+n||0)*100)/100;return Number.isInteger(value)?String(value):String(value.toFixed(2)).replace(/0+$/,'').replace(/\.$/,'')}
function studentBillingSummary(row){return row?.billingCategory==='after_school_monthly'?`月費制／排課 ${row.total||0} 堂（時數不影響費用）`:`${row?.charged||0} 堂／${billingNumber(row?.h||0)} hr`}
function billingMonthLabel(m){const[y,month]=String(m||'').split('-').map(Number);return `${y} 年 ${month} 月`}
function billingCampFormula(rows){
  if(!rows.length)return'';if(rows.length>1)return`${rows.length} 筆報名`;
  const r=rows[0],mode=summerRegistrationPricingMode(r),days=(r.dates||[]).length,weeks=summerRegistrationWeekCount(r.dates||[]);
  if(mode==='monthly')return`月費 ${money(+r.monthlyRate||0)}`;
  if(mode==='weekly')return`${weeks} 週 × ${money(+r.weeklyRate||0)}`;
  if(mode==='weeklySplit')return`前 ${+r.frontWeeks||0} 週 ${money(+r.frontWeeklyRate||0)}／週，後段 ${money(+r.backWeeklyRate||0)}／週`;
  return`${days} 天 × ${money(+r.dailyRate||0)}`;
}
function billingParentName(value){return String(value||'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim()}
/* LINE 家庭對帳只以學生 CRM 的「家長姓名」為單一綁定來源。
 * 舊的 lineSalutation 僅保留在歷史資料中，不再參與稱呼或家庭合併。 */
function billingLineSalutation(studentId){return billingParentName(student(studentId)?.parent)||'家長'}
function billingFamilyStudents(studentId){
  const selected=student(studentId),parent=billingParentName(selected.parent),familyId=String(selected.billingFamilyId||'').trim();
  if(!parent)return[selected];
  return(db.students||[]).filter(s=>!s.campSeason&&!s.isGroupRoster&&billingParentName(s.parent)===parent&&String(s.billingFamilyId||'').trim()===familyId);
}
function billingFamilyNeedsReview(studentId){const family=billingFamilyStudents(studentId);return family.length>1&&!String(student(studentId).billingFamilyId||'').trim()}
function billingFamilyReviewSignature(studentId){return JSON.stringify(billingFamilyStudents(studentId).map(s=>[s.id,s.name,billingParentName(s.parent),String(s.billingFamilyId||'')]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))}
function billingLessonDateLabel(date){const[,month,day]=String(date||'').split('-').map(Number);return month&&day?`${month}/${day}`:String(date||'')}
function billingLessonDateTimeLines(lessons){return[...lessons].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.start||'').localeCompare(String(b.start||''))).map(l=>`${billingLessonDateLabel(l.date)} ${l.start||'--:--'}–${l.end||'--:--'}（${billingNumber(hours(l.start,l.end))} 小時）`)}
function billingLessonDayCount(lessons){return new Set(lessons.map(l=>l.date).filter(Boolean)).size}
function billingTutoringSection(label,lessons,totalHours,rate,amount,subtotalLabel,rateBreakdown=[]){
  if(!lessons.length)return[];
  const formula=rateBreakdown.length?rateBreakdown.map(row=>`${billingNumber(row.hours)} 小時 × ${money(row.rate)}`).join(' ＋ '):`${billingNumber(totalHours)} 小時 × ${money(rate)}`;
  return[label,'上課日期與時間：',...billingLessonDateTimeLines(lessons).map(line=>`- ${line}`),`上課天數：${billingLessonDayCount(lessons)} 天`,`課程堂數：${lessons.length} 堂`,`總時數：${billingNumber(totalHours)} 小時`,`計算：${formula} = ${money(amount)}`,`${subtotalLabel}：${money(amount)}`,''];
}
function studentLessonRateBreakdown(lessons,studentId){const groups=new Map();for(const l of lessons){const rate=Math.max(0,Number(studentPricingAt(studentId,l.date).rate)||0),row=groups.get(rate)||{rate,hours:0};row.hours+=hours(l.start,l.end);groups.set(rate,row)}return [...groups.values()]}
function studentBillingSections(d,includeName=false){
  const lines=[`學生：${d.student.name||'學生'}`];
  if(d.billingCategory==='after_school_monthly'){
    lines.push('安親月費',`計算：每月固定 ${money(d.afterSchoolAmount)}`,`安親小計：${money(d.afterSchoolAmount)}`);
    if(d.afterSchoolLessons.length)lines.push('本月排課（不影響月費）：',...billingLessonDateTimeLines(d.afterSchoolLessons).map(line=>`- ${line}`),`排課天數：${billingLessonDayCount(d.afterSchoolLessons)} 天`,`排課堂數：${d.afterSchoolLessons.length} 堂`,`排課時數：${billingNumber(d.afterSchoolHours)} 小時`);
    lines.push('');
  }
  lines.push(...billingTutoringSection('一般家教',d.privateLessons,d.privateHours,d.tutoringRate,d.privateAmount,'家教小計',studentLessonRateBreakdown(d.privateLessons,d.student.id)));
  lines.push(...billingTutoringSection('團班費用',d.groupLessons,d.groupHours,d.tutoringRate,d.groupAmount,'團班小計',studentLessonRateBreakdown(d.groupLessons,d.student.id)));
  if(d.campRows.length){['summer','winter'].forEach(season=>{const rows=d.campRows.filter(r=>campRegistrationSeason(r)===season);if(!rows.length)return;const rawDates=[...new Set(rows.flatMap(r=>r.dates||[]))].sort(),dates=rawDates.map(billingLessonDateLabel).join('、'),amount=rows.reduce((sum,r)=>sum+summerRegistrationTotal(r),0);lines.push(season==='winter'?'冬令營':'夏令營',`參加日期：${dates}`,`參加天數：${rawDates.length} 天`,billingCampFormula(rows),`小計：${money(amount)}`,'')})}
  return lines;
}
function studentLineBillingText(studentId,m,scope='all',familyStudentIds=null,campSeason=activeCampBillingSeason()){
  const explicitIds=Array.isArray(familyStudentIds)?new Set(familyStudentIds.filter(Boolean).map(String)):null,boundFamily=billingFamilyStudents(studentId);
  /* 即使呼叫端傳入舊 ID 清單，也只允許同一「家長姓名」的孩子進入同份帳單。 */
  const selectedFamily=explicitIds?boundFamily.filter(s=>explicitIds.has(String(s.id))):boundFamily,family=selectedFamily.length?selectedFamily:boundFamily,details=family.map(s=>studentMonthlyBillingData(s.id,m,scope,campSeason)).filter(d=>(d.billingCategory==='after_school_monthly'&&d.billable)||d.tutoringLessons.length||d.campRows.length);
  const salutation=billingLineSalutation(studentId),total=details.reduce((sum,d)=>sum+d.total,0);let lines=[`${salutation}您好，以下是小朋友 ${billingMonthLabel(m)}的課程費用明細：`,''];
  details.forEach(d=>lines.push(...studentBillingSections(d,true)));
  const monthNumber=Number(String(m||'').slice(5,7))||Number(String(m||'').split('-')[1])||'';
  lines.push(`${monthNumber}月共計：${money(total)}`,'',`以上請${salutation}確認！`);return lines.join('\n');
}
function copyStudentLineBilling(studentId,m,scope='all',encodedFamilyIds='',campSeason=activeCampBillingSeason()){
  const familyIds=encodedFamilyIds?decodeURIComponent(encodedFamilyIds).split(',').filter(Boolean):null,text=studentLineBillingText(studentId,m,scope,familyIds,campSeason),done=()=>toast('LINE 對帳內容已複製');
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text).then(done).catch(()=>copyStudentLineBillingFallback(text,done));
  copyStudentLineBillingFallback(text,done);
}
function copyStudentLineBillingFallback(text,done){
  const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);
  let copied=false;try{area.select();copied=document.execCommand('copy')===true}catch{}finally{area.remove()}
  if(copied){done();return true}
  if(typeof toast==='function')toast('複製失敗，請保留預覽並手動選取文字複製；尚未標記通知');
  return false;
}

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

function lessonPartTimeTeacherRate(l,t){
  if(t?.type!=='兼職'||teacherPayrollMode(t)!=='hourly'||effectiveCampId(l))return null;
  // The timetable's student is the group container: never sum children's teacher rates.
  return payrollNumber(studentPricingAt(l?.studentId,l?.date)?.partTimeTeacherRate);
}
function lessonTeacherHourlyRate(l,tid){const t=teacherPricingAt(tid,l?.date);return lessonPartTimeTeacherRate(l,t)??(payrollNumber(t?.rate)??0)}
function lessonTeacherPay(l,tid){if(!lessonCountsForTeacherPay(l)||!lessonTeacherIds(l).includes(tid))return 0;const camp=effectiveCampId(l);if(camp){const idx=db.lessons.indexOf(l);/* 同一老師若同時掛在同營隊多個班，只計一次該時段；不同老師仍各自完整計薪。 */const duplicate=db.lessons.some((x,i)=>i<idx&&lessonCountsForTeacherPay(x)&&sameCampSlot(l,x)&&lessonTeacherIds(x).includes(tid));if(duplicate)return 0}return lessonTeacherHourlyRate(l,tid)*hours(l.start,l.end)}

function lessonPay(l){return lessonTeacherIds(l).reduce((sum,id)=>sum+lessonTeacherPay(l,id),0)}

function fixedExpenseApplies(x,m){const start=x.startMonth||'2026-07',end=x.endMonth||'';return m>=start&&(!end||m<=end)}
function teacherIncludedForMonth(t,m){const archivedMonth=String(t?.archivedAt||'').slice(0,7);return!archivedMonth||String(m||'')<=archivedMonth}

function financeData(m){const lessons=db.lessons.filter(l=>l.date.startsWith(m)),lessonRevenue=studentTuitionRevenue(m),campRevenue=summerCampRegistrationRevenue(m),revenue=lessonRevenue+campRevenue;const fixed=(db.fixedExpenses||[]).filter(x=>fixedExpenseApplies(x,m));const one=(db.oneTimeExpenses||[]).filter(x=>x.month===m);const fixedTotal=fixed.reduce((a,x)=>a+(+x.amount||0),0);const oneTimeTotal=one.reduce((a,x)=>a+(+x.amount||0),0);const payrollRows=db.teachers.filter(t=>teacherIncludedForMonth(t,m)).map(t=>{const paid=teacherPaidLessons(t,m),payroll=calculateTeacherPayroll(t,m,paid);return{teacher:t,h:payroll.actualHours,amount:payroll.amount,payroll}}).filter(x=>x.h||x.amount);const payroll=payrollRows.reduce((a,x)=>a+x.amount,0);const totalExpenses=fixedTotal+oneTimeTotal+payroll;return{m,revenue,lessonRevenue,campRevenue,fixed,one,fixedTotal,oneTimeTotal,payrollRows,payroll,totalExpenses,profit:revenue-totalExpenses}}

function monthDateRange(m){const[y,mo]=m.split('-').map(Number);return{start:new Date(y,mo-1,1),end:new Date(y,mo,0)}}

function countTeacherWorkDaysInRange(t,start,end){const set=new Set((t.workDays||[]).map(Number));let count=0;for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1))if(set.has(d.getDay()))count++;return count}

function teacherMonthlyWorkDays(t,m){const r=monthDateRange(m);return countTeacherWorkDaysInRange(t,r.start,r.end)}
function teacherDailyExpectedHours(t){const days=(t.workDays||[]).length,weekly=+t.minWeeklyHours||0;return days&&weekly?weekly/days:0}
function teacherExpectedHours(t,m){return teacherDailyExpectedHours(t)*teacherMonthlyWorkDays(t,m)}

function teacherPayrollLeaveSource(){
  const live=typeof window!=='undefined'&&typeof window.__danbridgeGetTeacherLeaves==='function'?window.__danbridgeGetTeacherLeaves():null;
  return Array.isArray(live)?live:(Array.isArray(db.teacherLeaveRecords)?db.teacherLeaveRecords:[]);
}
function teacherPayrollLeaveHours(t,m,source=teacherPayrollLeaveSource()){
  const workDays=new Set((t.workDays||[]).map(Number)),byDate=new Map();
  for(const row of source||[]){
    const date=String(row?.date||''),start=String(row?.start||''),end=String(row?.end||'');
    if(String(row?.teacherId)!==String(t.id)||row?.status==='cancelled'||!date.startsWith(`${m}-`)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))continue;
    const day=new Date(`${date}T12:00:00`).getDay();if(!workDays.has(day))continue;
    const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3)),from=minutes(start),to=minutes(end);
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)continue;
    const intervals=byDate.get(date)||[];intervals.push([from,to]);byDate.set(date,intervals);
  }
  let totalMinutes=0;
  for(const intervals of byDate.values()){
    intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let current=null;
    for(const interval of intervals){if(!current){current=[...interval];continue}if(interval[0]<=current[1])current[1]=Math.max(current[1],interval[1]);else{totalMinutes+=current[1]-current[0];current=[...interval]}}
    if(current)totalMinutes+=current[1]-current[0];
  }
  return totalMinutes/60;
}

function teacherPaidLessons(t,m){return db.lessons.filter(l=>l.date.startsWith(m)&&lessonTeacherIds(l).includes(t.id)&&lessonCountsForTeacherHours(l))}

function teacherPayableHourLessons(t,rows){
  const source=rows||teacherPaidLessons(t,'');
  return source.filter(l=>{
    if(!lessonCountsForTeacherHours(l)||!lessonTeacherIds(l).includes(t.id))return false;
    if(!effectiveCampId(l))return true;
    const index=db.lessons.indexOf(l);
    return !db.lessons.some((other,otherIndex)=>otherIndex<index&&lessonCountsForTeacherHours(other)&&sameCampSlot(l,other)&&lessonTeacherIds(other).includes(t.id));
  });
}

function teacherActualHours(t,rows){
  return teacherPayableHourLessons(t,rows).reduce((sum,l)=>sum+hours(l.start,l.end),0);
}

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
const TEACHER_PAYROLL_FORMULA_VERSION='teacher-payroll-v2-workday-leave';
function calculateTeacherPayroll(t,m,paid){
  t=teacherPricingAt(t,m+'-01');
  const rows=paid||teacherPaidLessons(t,m);
  const hourRows=teacherPayableHourLessons(t,rows);
  const actualHours=hourRows.reduce((a,l)=>a+hours(l.start,l.end),0);
  const paidHours=hourRows.filter(lessonCountsForTeacherPay).reduce((a,l)=>a+hours(l.start,l.end),0);
  const mode=teacherPayrollMode(t);
  const expectedHours=teacherExpectedHours(t,m),monthlyWorkDays=teacherMonthlyWorkDays(t,m),dailyExpectedHours=teacherDailyExpectedHours(t);
  const diff=actualHours-expectedHours;
  if(mode==='hourly'){
    const hourlyRate=payrollNumber(t?.rate)??0;
    const amount=rows.reduce((a,l)=>a+lessonTeacherPay(l,t.id),0);
    const rates=new Map(),payRows=hourRows.filter(lessonCountsForTeacherPay),usesStudentRate=payRows.some(l=>lessonPartTimeTeacherRate(l,t)!==null);
    for(const l of payRows){const rate=lessonTeacherHourlyRate(l,t.id),h=hours(l.start,l.end);rates.set(rate,(rates.get(rate)||0)+h)}
    const rateBreakdown=[...rates].sort((a,b)=>a[0]-b[0]).map(([rate,h])=>({rate,h,amount:rate*h}));
    return{teacher:t,month:m,formulaVersion:usesStudentRate?'teacher-payroll-v3-student-rate':TEACHER_PAYROLL_FORMULA_VERSION,mode,rows,actualHours,paidHours,expectedHours:0,diff:actualHours,monthlyWorkDays,dailyExpectedHours,leaveHours:0,leaveHourlyRate:0,leaveDeduction:0,baseSalary:null,overtimeHours:0,shortHours:0,overtimeRate:null,deductionRate:null,hourlyRate,usesStudentRate,rateBreakdown,addition:amount,shortageDeduction:0,deduction:0,amount,configured:hourlyRate>0||(payRows.length>0&&payRows.every(l=>lessonPartTimeTeacherRate(l,t)!==null))};
  }
  const baseSalary=teacherBaseSalary(t),overtimeRate=teacherOvertimeRate(t),deductionRate=teacherDeductionRate(t);
  const leaveHours=Math.min(expectedHours,teacherPayrollLeaveHours(t,m)),leaveHourlyRate=expectedHours>0&&baseSalary!==null?baseSalary/expectedHours:0;
  /* Active leave is credited against missing timetable hours so one absence cannot be
   * deducted once as a shortage and again as leave. Leave itself is prorated from
   * base salary by this month's exact workday count and daily expected hours. */
  const overtimeHours=Math.max(0,diff),shortHours=Math.max(0,expectedHours-actualHours-leaveHours);
  const addition=overtimeHours*(overtimeRate??0),shortageDeduction=shortHours*(deductionRate??0),leaveDeduction=leaveHours*leaveHourlyRate,deduction=shortageDeduction+leaveDeduction;
  const configured=baseSalary!==null&&overtimeRate!==null&&deductionRate!==null;
  const amount=configured?Math.max(0,baseSalary+addition-deduction):0;
  return{teacher:t,month:m,formulaVersion:TEACHER_PAYROLL_FORMULA_VERSION,mode,rows,actualHours,paidHours,expectedHours,diff,monthlyWorkDays,dailyExpectedHours,leaveHours,leaveHourlyRate,leaveDeduction,baseSalary,overtimeHours,shortHours,overtimeRate,deductionRate,hourlyRate:null,addition,shortageDeduction,deduction,amount,configured};
}
function teacherPayrollFormulaText(result){
  if(result.mode==='hourly'&&result.usesStudentRate)return '依學生／整班鐘點費：'+result.rateBreakdown.map(r=>`${fmtHours(r.h)} hr × ${money(r.rate)} = ${money(r.amount)}`).join('；');
  if(result.mode==='hourly')return result.paidHours===result.actualHours?`純時薪：${fmtHours(result.paidHours)} hr × ${money(result.hourlyRate||0)}`:`純時薪：計薪 ${fmtHours(result.paidHours)} hr × ${money(result.hourlyRate||0)}（課表 ${fmtHours(result.actualHours)} hr）`;
  if(!result.configured)return '薪資設定未完成：請填固定底薪、超時時薪與不足扣款時薪';
  const parts=[`底薪 ${money(result.baseSalary)}`,`本月 ${result.monthlyWorkDays} 個工作日／最低 ${fmtHours(result.expectedHours)} hr`];
  if(result.overtimeHours>0)parts.push(`＋超時 ${fmtHours(result.overtimeHours)} hr × ${money(result.overtimeRate)}`);
  if(result.shortHours>0)parts.push(`－不足 ${fmtHours(result.shortHours)} hr × ${money(result.deductionRate)}`);
  if(result.leaveHours>0)parts.push(`－請假 ${fmtHours(result.leaveHours)} hr × ${money(result.leaveHourlyRate)}（底薪 ÷ 本月最低時數）`);
  return parts.join('；');
}

function teacherWeekBreakdown(t,m){t=teacherPricingAt(t,m+'-01');const r=monthDateRange(m),daily=(+t.minWeeklyHours||0)/Math.max(1,(t.workDays||[]).length),paid=teacherPayableHourLessons(t,teacherPaidLessons(t,m)),rows=[];let cursor=new Date(r.start);cursor.setDate(cursor.getDate()-((cursor.getDay()+6)%7));while(cursor<=r.end){const ws=new Date(cursor),we=new Date(cursor);we.setDate(we.getDate()+6);const from=ws<r.start?r.start:ws,to=we>r.end?r.end:we,workCount=countTeacherWorkDaysInRange(t,from,to),expected=daily*workCount;const actual=paid.filter(l=>{const d=new Date(l.date+'T00:00:00');return d>=from&&d<=to}).reduce((a,l)=>a+hours(l.start,l.end),0);rows.push({from:localDate(from),to:localDate(to),expected,actual,diff:actual-expected});cursor.setDate(cursor.getDate()+7)}return rows}

function diffClass(n){return n<-.001?'hours-short':n>.001?'hours-over':'hours-even'}

function diffText(n){return Math.abs(n)<.001?'剛好':n>0?`多 ${fmtHours(n)} hr`:`少 ${fmtHours(Math.abs(n))} hr`}

function settleData(){const m=$('settleMonth').value||monthNow(),ls=db.lessons.filter(l=>!l.isDraft&&l.date.startsWith(m));const sr=db.students.map(s=>{const x=ls.filter(l=>lessonIncludesStudent(l,s.id)),billing=studentMonthlyBillingData(s.id,m),chargedLessons=billing.tutoringLessons,abs=x.filter(l=>['學生請假','老師請假','取消','停課'].includes(l.status)),lessonAmount=billing.tutoringAmount,campAmount=billing.campAmount;return{s:billing.student,billingCategory:billing.billingCategory,lessonIds:x.map(l=>l.id),total:x.length,charged:studentUsesMonthlyFee(s,m+'-01')?0:chargedLessons.length,h:chargedLessons.reduce((a,l)=>a+hours(l.start,l.end),0),abs:abs.length,rate:x.length?abs.length/x.length*100:0,lessonAmount,campAmount,amount:lessonAmount+campAmount}}).filter(x=>x.total||x.lessonAmount||x.campAmount||(studentUsesMonthlyFee(x.s)&&studentIsPresentForBilling(x.s)));const tr=db.teachers.filter(t=>teacherIncludedForMonth(t,m)).map(t=>{const paid=teacherPaidLessons(t,m),payroll=calculateTeacherPayroll(t,m,paid),weeks=teacherWeekBreakdown(payroll.teacher,m);return{t:payroll.teacher,count:paid.length,h:payroll.actualHours,expected:payroll.expectedHours,diff:payroll.diff,weeks,amount:payroll.amount,revenue:teacherCompanyRevenue(t,m,ls),payroll}});return{sr,tr}}

function settlementSummaryTotals(studentRows){const rows=studentRows||[],studentAttendances=rows.reduce((n,x)=>n+(+x.total||0),0),hasIds=rows.every(x=>Array.isArray(x.lessonIds)),totalLessons=hasIds?new Set(rows.flatMap(x=>x.lessonIds).filter(Boolean)).size:studentAttendances,leaveCount=rows.reduce((n,x)=>n+(+x.abs||0),0);return{totalLessons,studentAttendances,lessonCountBasis:hasIds?'unique-lesson-id':'legacy-student-attendances',leaveCount,leaveRate:studentAttendances?Math.min(100,leaveCount/studentAttendances*100):0}}

function settlementSourceHash(value){const serialized=typeof value==='string'?value:JSON.stringify(value);let hash=2166136261;for(let i=0;i<serialized.length;i++){hash^=serialized.charCodeAt(i);hash=Math.imul(hash,16777619)}return`v1-${(hash>>>0).toString(16).padStart(8,'0')}`}
function settlementSnapshotPayload(data){
  const sr=data?.sr||[],tr=data?.tr||[],lessons=data?.lessons||[];
  const {totalLessons,studentAttendances,lessonCountBasis,leaveCount,leaveRate}=settlementSummaryTotals(sr);
  const totals={totalLessons,studentAttendances,lessonCountBasis,totalHours:tr.reduce((n,x)=>n+(+x.h||0),0),totalRevenue:sr.reduce((n,x)=>n+(+x.amount||0),0),leaveCount,leaveRate,payroll:tr.reduce((n,x)=>n+(+x.amount||0),0)};
  const source={
    lessons:lessons.map(l=>{const id=l.id||'',financialFields=[l.date||'',l.start||'',l.end||'',l.studentId||'',l.groupStudentIds||[],l.billingBranchId||'',lessonTeacherIds(l).slice().sort(),l.status||'',l.teacherReportStatus||'',l.chargeStudent||'',l.payTeacher||'',+l.price||0,+l.rate||0,!!l.isDraft];return{id,fingerprint:settlementSourceHash(financialFields)}}).sort((a,b)=>a.id.localeCompare(b.id)),
    students:sr.map(x=>({id:x.s?.id||'',billingCategory:x.billingCategory||studentBillingCategory(x.s),total:+x.total||0,charged:+x.charged||0,h:+x.h||0,abs:+x.abs||0,lessonAmount:+x.lessonAmount||0,campAmount:+x.campAmount||0,amount:+x.amount||0})).sort((a,b)=>a.id.localeCompare(b.id)),
    teachers:tr.map(x=>({id:x.t?.id||'',count:+x.count||0,h:+x.h||0,expected:+x.expected||0,amount:+x.amount||0,revenue:+x.revenue||0,payrollMode:x.payroll?.mode||'',baseSalary:x.payroll?.baseSalary??null,hourlyRate:x.payroll?.hourlyRate??null,overtimeRate:x.payroll?.overtimeRate??null,deductionRate:x.payroll?.deductionRate??null,monthlyWorkDays:+x.payroll?.monthlyWorkDays||0,leaveHours:+x.payroll?.leaveHours||0,leaveHourlyRate:+x.payroll?.leaveHourlyRate||0,leaveDeduction:+x.payroll?.leaveDeduction||0,shortageDeduction:+x.payroll?.shortageDeduction||0})).sort((a,b)=>a.id.localeCompare(b.id))
  };
  source.teacherPricing=tr.map(x=>({id:x.t?.id||'',formulaVersion:x.payroll?.formulaVersion||TEACHER_PAYROLL_FORMULA_VERSION,rateBreakdown:x.payroll?.rateBreakdown||[]})).sort((a,b)=>a.id.localeCompare(b.id));
  return{totals,source,sourceHash:settlementSourceHash({totals,source})};
}
function createLockedSettlementRecord(month,scope,data,at=new Date().toISOString()){
  if(data?.m&&data.m!==month)throw new Error(`Settlement month mismatch: ${month} !== ${data.m}`);
  if(data?.scope&&data.scope!==scope)throw new Error(`Settlement scope mismatch: ${scope} !== ${data.scope}`);
  const snapshot=settlementSnapshotPayload(data);
  return{id:`${month}::${scope}`,month,branchId:scope,savedAt:at,lockedAt:at,locked:true,formulaVersion:'settlement-v3-group-roster',billingFormulaVersion:'course-type-v2-group-roster',payrollFormulaVersion:data?.tr?.some(x=>x.payroll?.usesStudentRate)?'teacher-payroll-v3-student-rate':TEACHER_PAYROLL_FORMULA_VERSION,...snapshot.totals,snapshot,adjustments:[]};
}
function appendSettlementAdjustment(record,data,at=new Date().toISOString()){
  if(data?.m&&data.m!==record.month)throw new Error(`Settlement adjustment month mismatch: ${record.month} !== ${data.m}`);
  if(data?.scope&&data.scope!==(record.branchId||'all'))throw new Error(`Settlement adjustment scope mismatch: ${record.branchId||'all'} !== ${data.scope}`);
  const current=settlementSnapshotPayload(data),adjustments=Array.isArray(record.adjustments)?record.adjustments:[],previousAdjustment=adjustments[adjustments.length-1],previous=previousAdjustment?previousAdjustment.currentTotals:(record.snapshot?.totals||{totalLessons:record.totalLessons,totalHours:record.totalHours,totalRevenue:record.totalRevenue,leaveCount:record.leaveCount,leaveRate:record.leaveRate,payroll:record.payroll});
  const previousHash=adjustments.length?adjustments[adjustments.length-1].sourceHash:record.snapshot?.sourceHash;
  if(!previousHash){record.snapshot={totals:{...previous},source:current.source,sourceHash:current.sourceHash};record.locked=true;record.lockedAt=record.lockedAt||record.savedAt||at;record.adjustments=adjustments;return false}
  if(previousHash===current.sourceHash)return false;
  const delta={};for(const key of ['totalLessons','totalHours','totalRevenue','leaveCount','leaveRate','payroll'])delta[key]=(+current.totals[key]||0)-(+previous[key]||0);
  const previousSource=previousAdjustment?.currentSource||record.snapshot?.source||{lessons:[]},beforeIds=new Set((previousSource.lessons||[]).map(x=>`${x.id}:${JSON.stringify(x)}`)),afterIds=new Set((current.source.lessons||[]).map(x=>`${x.id}:${JSON.stringify(x)}`));
  const affectedLessonIds=[...new Set([...(previousSource.lessons||[]).filter(x=>!afterIds.has(`${x.id}:${JSON.stringify(x)}`)).map(x=>x.id),...(current.source.lessons||[]).filter(x=>!beforeIds.has(`${x.id}:${JSON.stringify(x)}`)).map(x=>x.id)])].filter(Boolean).sort();
  adjustments.push({id:`adj-${record.id||record.month}-${at}-${current.sourceHash}`,createdAt:at,type:'post-lock-data-change',sourceHash:current.sourceHash,affectedLessonIds,previousTotals:{...previous},currentTotals:{...current.totals},currentSource:current.source,delta});
  record.locked=true;record.lockedAt=record.lockedAt||record.savedAt||at;record.adjustments=adjustments;return true;
}

function monthlySettlementSnapshot(m){
  const ls=db.lessons.filter(l=>l.date.startsWith(m));
  const actualLessons=ls.filter(lessonCountsAsTaught);
  const totalLessons=actualLessons.length;
  const totalHours=actualLessons.reduce((a,l)=>a+hours(l.start,l.end),0);
  const totalRevenue=studentTuitionRevenue(m);
  const leaveStatuses=new Set(['學生請假','老師請假','取消','停課']);
  const leaveCount=ls.filter(l=>leaveStatuses.has(l.status)).length;
  const leaveRate=ls.length?leaveCount/ls.length*100:0;
  const payroll=db.teachers.reduce((sum,t)=>sum+teacherPayrollAmount(t,m),0);
  return{month:m,savedAt:new Date().toISOString(),totalLessons,totalHours,totalRevenue,leaveCount,leaveRate,payroll};
}
