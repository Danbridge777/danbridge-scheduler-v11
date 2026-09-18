'use strict';
// Rebuild derived schedule notices using an allowlist; never copy freeform
// summaries/notes into a newly restricted role. Lesson authority is untouched.
const META=['companyId','recipientEmail','recipientRole','teacherId','branchIds','teacherName','read','createdAt','createdBy','createdByName','acknowledgedAt','acknowledgedBy','sourceRecordHash','sourceSaveId'];
const SNAPSHOT=['date','start','end','studentId','title','location','branchId','deliveryMode','room','status','teacherIds'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.prototype.hasOwnProperty.call(value,k)).map(k=>[k,value[k]]));
function sanitizeScheduleOnlyNotification(value){
 if(!value||value.companyId!=='danbridge'||value.recipientRole!=='branch_manager'||value.notificationType||!Array.isArray(value.details)||!value.details.length)throw Error('Unsupported historical notification; no mutation permitted');
 const snapshot=v=>v===null?null:(v&&typeof v==='object'&&!Array.isArray(v)?{...pick(v,SNAPSHOT),note:'',address:'',meetingUrl:'',onlinePlatform:''}:(()=>{throw Error('Invalid notification snapshot')})());
 const time=v=>v?`${v.date||''} ${v.start||''}–${v.end||''}`:'';
 const details=value.details.map(d=>{
  if(!d||!['added','modified','removed'].includes(d.type)||typeof d.lessonId!=='string'||typeof d.studentName!=='string')throw Error('Unsupported historical detail; no mutation permitted');
  const before=snapshot(d.before),after=snapshot(d.after);
  return {type:d.type,lessonId:d.lessonId,studentName:d.studentName,beforeTime:time(before),afterTime:time(after),before,after,summary:`${{added:'新增',modified:'修改',removed:'取消'}[d.type]}：${d.studentName}｜${time(after||before)}`};
 });
 return {...pick(value,META),privacyScope:'schedule-only-v1',title:'課表更新通知',message:`課表有 ${details.length} 個變更`,changeCount:details.length,details};
}
module.exports={sanitizeScheduleOnlyNotification};
