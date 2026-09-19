'use strict';

const DAY_MS=86400000;
const STATUTORY_LEAVE_RULES=Object.freeze({
 annual:{label:'特別休假',period:'依年資',paid:'工資照給'},
 personal:{label:'事假',days:14,period:'每年',paid:'不給工資'},
 sick:{label:'普通傷病假',days:30,period:'每年（未住院）',paid:'30 日內工資折半'},
 hospitalSick:{label:'住院傷病假',days:365,period:'兩年內',paid:'依法計算'},
 bereavement:{label:'喪假',period:'每一喪亡事件',paid:'工資照給'},
 marriage:{label:'婚假',days:8,period:'每一結婚事件',paid:'工資照給'},
 familyCare:{label:'家庭照顧假',days:7,period:'每年，併入事假 14 日',paid:'依事假規定'},
 menstrual:{label:'生理假',days:12,period:'每月 1 日；全年前 3 日不併病假',paid:'工資折半'},
 occupational:{label:'公傷病假',days:null,period:'治療、休養期間',paid:'依法給付'},
 official:{label:'公假',days:null,period:'依實際需要',paid:'工資照給'}
});
const BEREAVEMENT_ALLOWANCE=Object.freeze({close8:8,middle6:6,other3:3});
const BEREAVEMENT_LABELS=Object.freeze({
 close8:'父母、養／繼父母或配偶（8 日）',
 middle6:'祖父母、子女或配偶之父母（6 日）',
 other3:'曾祖父母、兄弟姊妹或配偶之祖父母（3 日）'
});
const APPROVED_STATUSES=new Set(['approved','active']);

function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&!Number.isNaN(new Date(`${value}T12:00:00`).getTime())}
function anniversary(start,years){const date=new Date(`${start}T12:00:00`);date.setFullYear(date.getFullYear()+years);return date}
function completedYears(start,asOf){if(!validDate(start)||!validDate(asOf)||start>asOf)return 0;const from=new Date(`${start}T12:00:00`),to=new Date(`${asOf}T12:00:00`);let years=to.getFullYear()-from.getFullYear();if(anniversary(start,years)>to)years--;return Math.max(0,years)}
function completedMonths(start,asOf){if(!validDate(start)||!validDate(asOf)||start>asOf)return 0;const from=new Date(`${start}T12:00:00`),to=new Date(`${asOf}T12:00:00`);let months=(to.getFullYear()-from.getFullYear())*12+to.getMonth()-from.getMonth();if(to.getDate()<from.getDate())months--;return Math.max(0,months)}
function statutoryAnnualLeaveDays(startDate,asOfDate){
 const months=completedMonths(startDate,asOfDate),years=completedYears(startDate,asOfDate);
 if(months<6)return 0;if(years<1)return 3;if(years<2)return 7;if(years<3)return 10;if(years<5)return 14;if(years<10)return 15;return Math.min(30,15+(years-9));
}
function teacherDailyHours(teacher={}){const value=Number(teacher.standardDailyHours);return Number.isFinite(value)&&value>=1&&value<=12?value:8}
function recordDays(record={},teacher={}){const explicit=Number(record.days);if(Number.isFinite(explicit)&&explicit>0)return explicit;const hours=Number(record.hours)||0;return Number((hours/teacherDailyHours(teacher)).toFixed(3))}
function isApproved(record={}){return APPROVED_STATUSES.has(String(record.status||''))}
function quotaDays(type,{teacher={},record={},asOfDate=''}={}){
 if(type==='annual')return statutoryAnnualLeaveDays(teacher.employmentStartDate,asOfDate||record.date||new Date().toISOString().slice(0,10));
 if(type==='bereavement')return BEREAVEMENT_ALLOWANCE[record.bereavementRelationship]||null;
 return Object.hasOwn(STATUTORY_LEAVE_RULES,type)?STATUTORY_LEAVE_RULES[type].days??null:null;
}
function yearWindow(year,type){const current=Number(year)||new Date().getFullYear();return type==='hospitalSick'?[`${current-1}-01-01`,`${current}-12-31`]:[`${current}-01-01`,`${current}-12-31`]}
function leaveBalance({records=[],teacher={},type,year,asOfDate}={}){
 const total=quotaDays(type,{teacher,asOfDate:asOfDate||`${year||new Date().getFullYear()}-12-31`}),[from,to]=yearWindow(year,type);
 const rows=(records||[]).filter(row=>String(row.teacherId)===String(teacher.id)&&row.leaveType===type&&isApproved(row)&&String(row.date||'')>=from&&String(row.date||'')<=to);
 let used=rows.reduce((sum,row)=>sum+recordDays(row,teacher),0);
 if(type==='personal')used+=(records||[]).filter(row=>String(row.teacherId)===String(teacher.id)&&row.leaveType==='familyCare'&&isApproved(row)&&String(row.date||'')>=from&&String(row.date||'')<=to).reduce((sum,row)=>sum+recordDays(row,teacher),0);
 if(type==='sick'){const menstrualUsed=(records||[]).filter(row=>String(row.teacherId)===String(teacher.id)&&row.leaveType==='menstrual'&&isApproved(row)&&String(row.date||'')>=from&&String(row.date||'')<=to).reduce((sum,row)=>sum+recordDays(row,teacher),0);used+=Math.max(0,menstrualUsed-3)}
 const remaining=total===null?null:Math.max(0,Number((total-used).toFixed(3)));
 return{type,total,used:Number(used.toFixed(3)),remaining,rows};
}
function minutes(value){if(!/^\d\d:\d\d$/.test(String(value||'')))return NaN;const [hour,minute]=value.split(':').map(Number);return hour*60+minute}
function lessonTeacherIds(lesson={}){return[lesson.teacherId,...(Array.isArray(lesson.coTeacherIds)?lesson.coTeacherIds:[])].filter(Boolean).map(String)}
function impactedLessonsForLeave(record={},db={}){
 const start=minutes(record.start),end=minutes(record.end);if(!record.date||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return[];
 const students=new Map((db.students||[]).map(row=>[String(row.id),row]));
 return(db.lessons||[]).filter(lesson=>!lesson.isDraft&&lesson.date===record.date&&!['取消','停課'].includes(lesson.status)&&lessonTeacherIds(lesson).includes(String(record.teacherId))).map(lesson=>{
  const lessonStart=minutes(lesson.start),lessonEnd=minutes(lesson.end),overlap=Math.max(0,Math.min(end,lessonEnd)-Math.max(start,lessonStart));if(!overlap)return null;
  const ids=[lesson.studentId,...(Array.isArray(lesson.groupStudentIds)?lesson.groupStudentIds:[])].filter(Boolean),names=[...new Set(ids.map(id=>students.get(String(id))?.name).filter(Boolean))];
  return{id:lesson.id,date:lesson.date,start:lesson.start,end:lesson.end,title:lesson.title||'',studentNames:names.length?names:[lesson.title||'未命名課程'],overlapHours:Number((overlap/60).toFixed(2))};
 }).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start));
}
function isOutstandingTodo(record){return record?.status==='pending'||(record?.requiresCompletion===true&&!record.completedAtIso)}
function leaveDashboardStats({records=[],db={},today=new Date().toISOString().slice(0,10)}={}){
 const pending=records.filter(row=>row.status==='pending'),todayApproved=records.filter(row=>row.date===today&&isApproved(row));
 const impacts=todayApproved.flatMap(row=>impactedLessonsForLeave(row,db));return{pending:pending.length,outstanding:records.filter(isOutstandingTodo).length,today:todayApproved.length,affectedLessons:impacts.length,affectedHours:Number(impacts.reduce((sum,row)=>sum+row.overlapHours,0).toFixed(2))};
}

const api={STATUTORY_LEAVE_RULES,BEREAVEMENT_ALLOWANCE,BEREAVEMENT_LABELS,statutoryAnnualLeaveDays,teacherDailyHours,recordDays,isApproved,isOutstandingTodo,quotaDays,leaveBalance,impactedLessonsForLeave,leaveDashboardStats};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof window!=='undefined')window.DanbridgeTeacherLeaveEntitlement=Object.freeze(api);
