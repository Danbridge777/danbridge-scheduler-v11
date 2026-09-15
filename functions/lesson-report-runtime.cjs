'use strict';
const {createHash}=require('node:crypto');
const fields=['status','content','homework','feedback','note'];
const statuses=['completed','student_leave','teacher_leave','no_show','makeup_completed'];
function fail(code,message){throw Object.assign(new Error(message),{code})}
function normalize(input){
 if(!input||Object.keys(input).sort().join(',')!=='expectedUpdatedAt,lessonId,operationId,report')fail('invalid-argument','回報請求欄位無效');
 for(const key of ['lessonId','operationId'])if(typeof input[key]!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input[key]))fail('invalid-argument','回報識別無效');
 if(typeof input.expectedUpdatedAt!=='string'||(input.expectedUpdatedAt!==''&&!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.expectedUpdatedAt)))fail('invalid-argument','回報版本無效');
 if(!input.report||Object.keys(input.report).sort().join(',')!==[...fields].sort().join(','))fail('invalid-argument','回報內容欄位無效');
 if(!statuses.includes(input.report.status))fail('invalid-argument','上課狀態無效');
 const report={};for(const key of fields){if(typeof input.report[key]!=='string'||Buffer.byteLength(input.report[key],'utf8')>20000)fail('invalid-argument','回報內容過長或格式無效');report[key]=input.report[key]}
 return{lessonId:input.lessonId,operationId:input.operationId,expectedUpdatedAt:input.expectedUpdatedAt,report};
}
// Direct browser writes stay denied. Metadata, live membership, optimistic
// concurrency, receipt and report are checked/committed in one transaction.
async function saveLessonReport({firestore,identity,input,serverTimestamp,now=()=>Date.now(),primaryOwnerEmail='a0965487920@gmail.com'}){
 if(input?.readOnly===true&&Array.isArray(input.lessonIds)){
  if(Object.keys(input).sort().join(',')!=='lessonIds,readOnly'||!input.lessonIds.length||input.lessonIds.length>40||new Set(input.lessonIds).size!==input.lessonIds.length||input.lessonIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))fail('invalid-argument','回報批次讀取請求無效');
  const reports=[];
  for(let i=0;i<input.lessonIds.length;i+=4){
   const rows=await Promise.all(input.lessonIds.slice(i,i+4).map(lessonId=>saveLessonReport({firestore,identity,input:{lessonId,readOnly:true},serverTimestamp,now,primaryOwnerEmail})));
   reports.push(...rows);
  }
  return{ok:true,readOnly:true,reports};
 }
 const readOnly=input?.readOnly===true;
 if(readOnly&&(Object.keys(input).sort().join(',')!=='lessonId,readOnly'||typeof input.lessonId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.lessonId)))fail('invalid-argument','回報讀取請求無效');
 const request=readOnly?input:normalize(input),email=String(identity?.email||'').trim().toLowerCase(),uid=String(identity?.uid||'');
 if(!uid||!email||identity.emailVerified!==true||identity.appVerified!==true)fail('unauthenticated','需要有效登入與 App Check');
 const fingerprint=createHash('sha256').update(JSON.stringify({uid,email,...request})).digest('hex');
 const reportRef=firestore.doc(`companies/danbridge/lessonReports/${request.lessonId}`),receiptRef=readOnly?null:firestore.doc(`lessonReportOperationReceipts/${request.operationId}`);
 return firestore.runTransaction(async tx=>{
  const [accessSnap,metaSnap,currentSnap,receiptSnap,profileSnap]=await Promise.all([
   tx.get(firestore.doc('companyAccess/'+email)),tx.get(firestore.doc('companies/danbridge/lessonMeta/'+request.lessonId)),tx.get(reportRef),receiptRef?tx.get(receiptRef):Promise.resolve({exists:false}),tx.get(firestore.doc('users/'+uid))
  ]);
  const access=accessSnap.exists?accessSnap.data():(email===primaryOwnerEmail?{active:true,companyId:'danbridge',role:'owner'}:null),meta=metaSnap.exists?metaSnap.data():null,current=currentSnap.exists?currentSnap.data():null;
  if(!access||access.active!==true||access.companyId!=='danbridge'||!['owner','teacher','branch_manager'].includes(access.role))fail('permission-denied','帳號已停用或沒有回報權限');
  if(!meta||meta.active!==true||!Array.isArray(meta.teacherIds)||!meta.teacherIds.length||typeof meta.branchId!=='string')fail('failed-precondition','課程已取消或權限資料尚未完成');
  const profile=profileSnap.exists?profileSnap.data():{};
  const owner=access.role==='owner',teacherId=typeof access.teacherId==='string'?access.teacherId:(typeof profile.teacherId==='string'?profile.teacherId:''),branchIds=Array.isArray(access.branchIds)?access.branchIds:(Array.isArray(profile.branchIds)?profile.branchIds:[]);
  const ownTeacher=teacherId&&meta.teacherIds.includes(teacherId),ownBranch=branchIds.includes(meta.branchId);
  if(!owner&&!(access.role==='branch_manager'?(ownBranch&&(readOnly||ownTeacher)):ownTeacher))fail('permission-denied','沒有這堂課的回報權限');
  if(readOnly)return{ok:true,readOnly:true,lessonId:request.lessonId,report:current?Object.fromEntries([...fields,'companyId','lessonId','branchId','teacherId','teacherUid','teacherEmail','teacherName','reportedByRole','reportedForTeacherIds','isOwnerReport','updatedAtClient','editableUntilClient'].filter(k=>k in current).map(k=>[k,current[k]])):null};
  // Even replay requires current membership and lesson scope. The original
  // committed receipt may be recovered after the editing window closes.
  if(receiptSnap.exists){const receipt=receiptSnap.data();if(receipt.fingerprint!==fingerprint)fail('already-exists','回報操作識別衝突');return{ok:true,duplicate:true,operationId:request.operationId,lessonId:request.lessonId,report:receipt.report}}
  const time=now(),from=meta.editableFrom?.toMillis?.(),until=meta.editableUntil?.toMillis?.();
  if(!owner&&(!Number.isFinite(from)||!Number.isFinite(until)||time<from||time>until))fail('failed-precondition','僅限課程當天儲存回報');
  if(String(current?.updatedAtClient||'')!==request.expectedUpdatedAt)fail('aborted','回報已有更新，請保留草稿並重新開啟核對');
  const previousTime=Date.parse(current?.updatedAtClient||'');
  const updatedAtClient=new Date(Number.isFinite(previousTime)?Math.max(time,previousTime+1):time).toISOString();
  const report={companyId:'danbridge',lessonId:request.lessonId,branchId:meta.branchId,teacherId:owner?(teacherId||meta.teacherIds[0]):teacherId,teacherUid:uid,teacherEmail:email,teacherName:String(access.teacherName||access.displayName||email),reportedByRole:access.role,reportedForTeacherIds:[...meta.teacherIds],isOwnerReport:owner,...request.report,updatedAtClient,editableUntilClient:Number.isFinite(until)?new Date(until).toISOString():''};
  tx.set(reportRef,{...report,editableUntil:meta.editableUntil,updatedAt:serverTimestamp()},{merge:false});
  tx.set(receiptRef,{fingerprint,report,createdAt:serverTimestamp()},{merge:false});
  return{ok:true,duplicate:false,operationId:request.operationId,lessonId:request.lessonId,report};
 });
}
module.exports={saveLessonReport};
