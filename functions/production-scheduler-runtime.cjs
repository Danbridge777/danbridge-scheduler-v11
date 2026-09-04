'use strict';

// Requests handled by one warm instance share a commit lane. The database is
// still the authority across instances: every request runs its full transaction
// and all validation again. This only avoids self-inflicted lock contention.
function createSchedulerExecutionLane({maxPending=16,maxWaitMs=5000,clock=()=>Date.now()}={}){
 let tail=Promise.resolve(),pending=0;
 return work=>{
  if(pending>=maxPending)return Promise.reject(Object.assign(new Error('排課服務忙碌，待送操作保留並稍後續傳'),{code:14}));
  pending++;const queuedAt=clock();
  const next=tail.then(()=>{if(clock()-queuedAt>maxWaitMs)throw Object.assign(new Error('排課等待逾時，待送操作保留並稍後續傳'),{code:14});return work()});
  tail=next.catch(()=>{});return next.finally(()=>{pending--});
 };
}

// Server-only scheduler capability. The caller never supplies raw record
// operations, paths, role views or notification recipients.
async function createProductionSchedulerRuntime({firestore,serverTimestamp,primaryOwnerEmail,now=()=>Date.now()}){
 const executeInOrder=createSchedulerExecutionLane();
 const [{FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb},{recordDataHash},{sha256Canonical},{prepareActiveRecordSync},{createFirebaseProductionRecordBatchAdapter},controlPolicy,policy,projection,notificationPolicy]=await Promise.all([
  import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js'),import('../js/core/cloud-immutable-migration-backup.js'),import('../js/core/cloud-active-record-sync.js'),import('../js/core/firebase-production-record-runtime-adapter.js'),import('../js/core/cloud-production-record-runtime.js'),import('../js/core/production-scheduler-operation.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/production-notification-policy.js')
 ]);
 const {PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH,assertProductionRecordRuntimeControl,assertProductionRecordRuntimeSafety}=controlPolicy;
 const equal=(a,b)=>sha256Canonical(a??null)===sha256Canonical(b??null);
 const teachers=row=>[...new Set((row?.teacherIds?.length?row.teacherIds:[row?.teacherId]).filter(Boolean))];
 const lessonSnapshot=row=>row?{...Object.fromEntries(['date','start','end','studentId','title','location','branchId','deliveryMode','room','address','onlinePlatform','meetingUrl','status','note'].map(key=>[key,row[key]||''])),teacherIds:teachers(row)}:null;
 function notifications(before,after,accessRows,caller,request,sourceHash){
  const old=new Map(before.lessons.map(row=>[row.id,row])),next=new Map(after.lessons.map(row=>[row.id,row])),changes=[];
  for(const id of new Set([...old.keys(),...next.keys()])){const a=old.get(id),b=next.get(id);if(!equal(a,b))changes.push({lessonId:id,before:a||null,after:b||null})}
  const members=new Map(accessRows.filter(row=>row.active===true&&row.companyId==='danbridge').map(row=>[row.email,row]));
  members.set(primaryOwnerEmail,{email:primaryOwnerEmail,role:'owner',active:true,companyId:'danbridge'});
  const result=[];
  for(const member of members.values()){
   const scheduler=member.role==='teacher'&&member.canManageSchedule===true&&projection.PRODUCTION_SCHEDULER_EMAILS.includes(member.email),role=scheduler?'scheduler':member.role;
   if(!['owner','scheduler','teacher','branch_manager'].includes(role))continue;
   const details=[];
   for(const change of changes){let a=change.before,b=change.after;
    if(role==='teacher'){a=teachers(a).includes(member.teacherId)?a:null;b=teachers(b).includes(member.teacherId)?b:null}
    if(role==='branch_manager'){const allowed=new Set(member.branchIds||[]);a=allowed.has(a?.branchId)?a:null;b=allowed.has(b?.branchId)?b:null}
    if(!a&&!b)continue;
    const type=!a?'added':!b?'removed':'modified',row=b||a,studentName=String(after.students.find(item=>item.id===row.studentId)?.name||before.students.find(item=>item.id===row.studentId)?.name||'未命名學生'),time=value=>value?`${value.date} ${value.start}–${value.end}`:'';
    let safeBefore=lessonSnapshot(a),safeAfter=lessonSnapshot(b);
    if(role==='teacher'){if(safeBefore)safeBefore={...safeBefore,address:'',meetingUrl:'',note:''};if(safeAfter)safeAfter={...safeAfter,address:'',meetingUrl:'',note:''}}
    details.push({type,lessonId:change.lessonId,summary:`${{added:'新增',removed:'取消',modified:'修改'}[type]}：${studentName}｜${time(row)}`,studentName,beforeTime:time(a),afterTime:time(b),before:safeBefore,after:safeAfter});
   }
   if(!details.length)continue;
   const item={id:`scheduler_${sha256Canonical({requestId:request.requestId,email:member.email})}`,payload:{companyId:'danbridge',recipientEmail:member.email,recipientRole:role,teacherId:role==='teacher'?member.teacherId:'',branchIds:role==='branch_manager'?member.branchIds:[],teacherName:String(member.teacherName||member.displayName||''),title:'課表更新通知',message:`課表有 ${details.length} 個變更`,changeCount:details.length,details,read:false,createdBy:caller.uid,createdByName:caller.displayName}};
   notificationPolicy.assertProductionScheduleNotificationAccess(item,member,primaryOwnerEmail);result.push(item);
  }
  if(!result.length)return[];
  return notificationPolicy.normalizeProductionScheduleNotificationPublishRequest({schema:'danbridge-production-schedule-notification-publish-v1',requestId:`scheduler_${sha256Canonical(request.requestId)}`,sourceHash,release:request.release,notifications:result}).notifications;
 }
 return Object.freeze({async execute(input,identity){
  if(!identity||identity.emailVerified!==true||identity.appVerified!==true||!projection.PRODUCTION_SCHEDULER_EMAILS.includes(identity.email))throw new Error('排課專員登入驗證無效');
  const request=policy.normalizeProductionSchedulerRequest(input),fingerprint=sha256Canonical(request),receiptRef=firestore.doc(`companies/danbridge/productionSchedulerReceipts/${request.requestId}`),nowIso=new Date(now()).toISOString();
  return executeInOrder(()=>firestore.runTransaction(async transaction=>{
   const [receipt,controlSnapshot,safetySnapshot,accessSnapshot,...collections]=await Promise.all([
    transaction.get(receiptRef),transaction.get(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH)),transaction.get(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH)),transaction.get(firestore.collection('companyAccess').where('companyId','==','danbridge')),
    ...FULL_RECORD_COLLECTIONS.map(name=>transaction.get(firestore.collection(`productionFullRecordShadows/danbridge/collections/${name}/records`)))
   ]);
   const accessRows=accessSnapshot.docs.map(row=>({...row.data(),email:row.id.toLowerCase()})),member=accessRows.find(row=>row.email===identity.email),caller=policy.assertProductionSchedulerActor({...member,uid:identity.uid,email:identity.email});
   if(receipt.exists){const saved=receipt.data();if(saved.fingerprint!==fingerprint||saved.uid!==caller.uid||saved.email!==caller.email)throw new Error('排課回條識別衝突');return saved.response}
   const control=assertProductionRecordRuntimeControl(controlSnapshot.data()),safety=assertProductionRecordRuntimeSafety(safetySnapshot.data(),{activationEpoch:control.activationEpoch});
   if(safety.state!=='active'||!safety.writeAllowed)throw new Error('正式逐筆同步已安全暫停');
   const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map((name,index)=>[name,collections[index].docs.map(row=>({id:row.id,data:row.data()}))])),source=rebuildFullRecordShadowDb(documents,{environment:'production'});
   if(recordDataHash(source.db)!==safety.recordDataHash||source.documentCount!==safety.documentCount||source.activeCount!==safety.activeCount||source.tombstoneCount!==safety.tombstoneCount)throw new Error('正式權威資料 16 集合核對不符');
   for(const change of request.changes)if(change.before===null&&documents.lessons.some(row=>row.id===change.lessonId))throw new Error('課程 ID 曾使用過，不能復活刪除紀錄');
   const target=policy.buildProductionSchedulerTarget(source.db,request,caller,{nowIso}),plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:source.db,localDb:target.db,environment:'production',deviceId:`scheduler-${sha256Canonical({uid:caller.uid,requestId:request.requestId}).slice(0,48)}`,activationEpoch:control.activationEpoch,createdAt:nowIso});
   if(plan.conflicts.length||plan.operationCount>180)throw new Error('排課交易超過安全範圍或有資料衝突');
   const sourceRevision=safety.recordRevision+plan.operationCount,views=projection.buildProductionRoleViews(plan.db,accessRows,{now:now()}),notices=notifications(source.db,plan.db,accessRows,caller,request,plan.targetHash),oldMeta=new Map(projection.buildProductionLessonMeta(source.db).map(row=>[row.lessonId,row.payload])),newMeta=new Map(projection.buildProductionLessonMeta(plan.db).map(row=>[row.lessonId,row.payload])),derived=[];
   // Write every scoped view with the same revision, including unchanged views;
   // this is the recipient's ordering fence, not a claim about delivery latency.
   for(const view of views){
    if(view.kind==='branch_manager')derived.push({ref:firestore.doc(`companyAccess/${view.email}`),value:{scopedDb:view.db,scopedClientHash:view.clientHash,scopedSourceRecordHash:plan.targetHash,scopedSourceRecordRevision:sourceRevision,scopedUpdatedAt:serverTimestamp()},merge:true});
    else derived.push({ref:firestore.doc(`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`),value:{db:view.db,email:view.email,...(view.kind==='teacher'?{teacherId:view.teacherId}:{}),clientHash:view.clientHash,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,release:request.release,updatedAt:serverTimestamp()}});
   }
   for(const id of new Set([...oldMeta.keys(),...newMeta.keys()])){const before=oldMeta.get(id),after=newMeta.get(id);if(before&&after&&projection.productionLessonMetaSignature(before)===projection.productionLessonMetaSignature(after))continue;derived.push({ref:firestore.doc(`companies/danbridge/lessonMeta/${id}`),...(after?{value:{...after,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,updatedAt:serverTimestamp()}}:{remove:true})})}
   for(const notice of notices)derived.push({ref:firestore.doc(`companies/danbridge/scheduleNotifications/${notice.id}`),value:{...notice.payload,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,createdAt:serverTimestamp()}});
   const response={schema:policy.SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash:plan.targetHash,sourceRecordRevision:sourceRevision,operationCount:plan.operationCount,notificationCount:notices.length,schedulerDb:projection.projectProductionSchedulerDb(plan.db)};
   if(Buffer.byteLength(JSON.stringify(response))>750000)throw new Error('排課回條超過安全大小');
   if(2*plan.operationCount+3+derived.length>450)throw new Error('排課原子交易超過安全寫入上限');
   // The existing Owner-only adapter is an internal service primitive. It only
   // receives this server-built bounded plan after scheduler authorization.
   const adapter=createFirebaseProductionRecordBatchAdapter({actor:{uid:caller.uid,email:caller.email},role:'owner',serverTimestamp,runTransaction:callback=>callback({get:path=>transaction.get(firestore.doc(path)),set:(path,value,options)=>transaction.set(firestore.doc(path),value,options||{merge:false}),delete:path=>transaction.delete(firestore.doc(path))})});
   if(plan.operationCount){const result=await adapter.apply({activationEpoch:plan.activationEpoch,reason:'scheduler-timetable',operations:plan.operations},`scheduler-${sha256Canonical({uid:caller.uid,requestId:request.requestId}).slice(0,48)}`);if(result.kind!=='batch'||result.targetHash!==plan.targetHash)throw new Error('排課原子提交回條不符')}
   for(const write of derived){if(write.remove)transaction.delete(write.ref);else transaction.set(write.ref,write.value,{merge:write.merge===true})}
   transaction.set(receiptRef,{fingerprint,uid:caller.uid,email:caller.email,response,createdAt:serverTimestamp()});
   return response;
  }));
 }});
}
function productionSchedulerErrorCode(error){
 // Preserve transient transport/transaction errors so clients replay the same
 // idempotency key. Never turn validation/permission conflicts into retries.
 const code=error?.code;
 const numeric={1:'cancelled',4:'deadline-exceeded',10:'aborted',13:'internal',14:'unavailable'};
 if(typeof code==='number'&&numeric[code])return numeric[code];
 const named=typeof code==='string'?code.toLowerCase().replace(/^functions\//,'').replaceAll('_','-'):'';
 return ['cancelled','deadline-exceeded','aborted','internal','unavailable'].includes(named)?named:'failed-precondition';
}
module.exports={createProductionSchedulerRuntime,productionSchedulerErrorCode,createSchedulerExecutionLane};
