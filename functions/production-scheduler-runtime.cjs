'use strict';
const {withProductionCommitLease}=require('./production-commit-lease.cjs');
const {nativeCanonicalSha256,nativeCanonicalRecordDbSha256}=require('./native-canonical-sha256.cjs');
const {createProductionTransactionReader}=require('./production-transaction-reads.cjs');

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
async function createProductionSchedulerRuntime({firestore,serverTimestamp,primaryOwnerEmail,now=()=>Date.now(),onTiming=()=>{},publishedRoleChunks=false,preserveLegacyViews=false,deleteField}){
 if(typeof publishedRoleChunks!=='boolean'||publishedRoleChunks&&typeof deleteField!=='function')throw Error('Invalid server role transport configuration');
 if(typeof preserveLegacyViews!=='boolean'||preserveLegacyViews&&!publishedRoleChunks)throw Error('Invalid legacy role compatibility configuration');
 const maxChanges=publishedRoleChunks?40:30;
 const executeInOrder=createSchedulerExecutionLane();
 const [{FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb},{sha256Canonical},{prepareActiveRecordSync},{createFirebaseProductionRecordBatchAdapter},controlPolicy,policy,projection,notificationPolicy]=await Promise.all([
  import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-immutable-migration-backup.js'),import('../js/core/cloud-active-record-sync.js'),import('../js/core/firebase-production-record-runtime-adapter.js'),import('../js/core/cloud-production-record-runtime.js'),import('../js/core/production-scheduler-operation.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/production-notification-policy.js')
 ]);
 const {PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH,assertProductionRecordRuntimeControl,assertProductionRecordRuntimeSafety}=controlPolicy;
 const equal=(a,b)=>a===b||nativeCanonicalSha256(a??null)===nativeCanonicalSha256(b??null);
 const notifications=createProductionScheduleNoticeBuilder({primaryOwnerEmail,projection,notificationPolicy,sha256Canonical});
 return Object.freeze({async execute(input,identity){
  if(!identity||identity.emailVerified!==true||identity.appVerified!==true||!projection.PRODUCTION_SCHEDULER_EMAILS.includes(identity.email))throw new Error('排課專員登入驗證無效');
  const request=policy.normalizeProductionSchedulerRequest(input,{maxChanges}),fingerprint=sha256Canonical(request),receiptRef=firestore.doc(`companies/danbridge/productionSchedulerReceipts/${request.requestId}`),nowIso=new Date(now()).toISOString();
  let phaseStarted=performance.now();
  const mark=phase=>{const at=performance.now();try{onTiming({requestId:request.requestId,phase,ms:at-phaseStarted,count:request.changes.length})}catch{}phaseStarted=at};
  let prepared=null;
  // Keep one admission lane and lease for the whole logical command, including
  // immutable preparation. Each retry still re-reads and verifies authority and
  // checks the live lease inside the native transaction before any writes.
  return executeInOrder(()=>withProductionCommitLease(firestore,async lease=>{
  const executeTransaction=()=>firestore.runTransaction(async transaction=>{
   mark('admission');
   await lease.assertHeld(transaction);
   const [receipt,controlSnapshot,safetySnapshot,accessSnapshot,...collections]=await Promise.all([
    transaction.get(receiptRef),transaction.get(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH)),transaction.get(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH)),transaction.get(firestore.collection('companyAccess').where('companyId','==','danbridge')),
    ...FULL_RECORD_COLLECTIONS.map(name=>transaction.get(firestore.collection(`productionFullRecordShadows/danbridge/collections/${name}/records`)))
   ]);
   mark('authority-read');
   const accessRows=accessSnapshot.docs.map(row=>({...row.data(),email:row.id.toLowerCase()})),member=accessRows.find(row=>row.email===identity.email),caller=policy.assertProductionSchedulerActor({...member,uid:identity.uid,email:identity.email});
   if(receipt.exists){const saved=receipt.data();if(saved.fingerprint!==fingerprint||saved.uid!==caller.uid||saved.email!==caller.email)throw new Error('排課回條識別衝突');return saved.response}
   const control=assertProductionRecordRuntimeControl(controlSnapshot.data()),safety=assertProductionRecordRuntimeSafety(safetySnapshot.data(),{activationEpoch:control.activationEpoch});
   if(safety.state!=='active'||!safety.writeAllowed)throw new Error('正式逐筆同步已安全暫停');
   const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map((name,index)=>[name,collections[index].docs.map(row=>({id:row.id,data:row.data()}))])),source=rebuildFullRecordShadowDb(documents,{environment:'production'});
   const hashMemo=new WeakMap(),orderMemo=new WeakMap(),fastRecordHash=db=>`record-v1:${nativeCanonicalRecordDbSha256(db,FULL_RECORD_COLLECTIONS,{memo:hashMemo,orderMemo})}`;
   if(fastRecordHash(source.db)!==safety.recordDataHash||source.documentCount!==safety.documentCount||source.activeCount!==safety.activeCount||source.tombstoneCount!==safety.tombstoneCount)throw new Error('正式權威資料 16 集合核對不符');
   mark('authority-verify');
   for(const change of request.changes)if(change.before===null&&documents.lessons.some(row=>row.id===change.lessonId))throw new Error('課程 ID 曾使用過，不能復活刪除紀錄');
   const target=policy.buildProductionSchedulerTarget(source.db,request,caller,{nowIso,maxChanges});
   const plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:source.db,localDb:target.db,environment:'production',deviceId:`scheduler-${sha256Canonical({uid:caller.uid,requestId:request.requestId}).slice(0,48)}`,activationEpoch:control.activationEpoch,createdAt:nowIso,
    authoritativeSourceHash:safety.recordDataHash,verifiedRemote:{...source,hash:safety.recordDataHash},hashRecordDb:fastRecordHash,hashCanonical:nativeCanonicalSha256,compactResult:true,changedCollections:FULL_RECORD_COLLECTIONS.filter(name=>['lessons','students','makeups','changes'].includes(name)),appendOnlyChangesCount:target.db.changes.length-source.db.changes.length});
   if(plan.conflicts.length||plan.operationCount>180)throw new Error('排課交易超過安全範圍或有資料衝突');
   mark('target-plan');
   // Unchanged immutable lesson rows cannot change their lesson-only metadata.
   // Include indirect changes (e.g. cancelling an arranged makeup), not merely
   // request IDs, and retain canonical comparison for any newly allocated row.
   const previousLessons=new Map(source.db.lessons.map(row=>[row.id,row])),nextLessons=new Map(plan.db.lessons.map(row=>[row.id,row]));
   const changedIds=new Set([...previousLessons.keys(),...nextLessons.keys()].filter(id=>!equal(previousLessons.get(id),nextLessons.get(id))));
   const oldMeta=new Map(projection.buildProductionLessonMeta({lessons:source.db.lessons.filter(row=>changedIds.has(row.id))}).map(row=>[row.lessonId,row.payload])),newMeta=new Map(projection.buildProductionLessonMeta({lessons:plan.db.lessons.filter(row=>changedIds.has(row.id))}).map(row=>[row.lessonId,row.payload]));
   const sourceRevision=safety.recordRevision+plan.operationCount,views=projection.buildProductionRoleViews(plan.db,accessRows,{now:now()}),notices=notifications(source.db,plan.db,accessRows,caller,request,plan.targetHash),derived=[];
   if(!publishedRoleChunks&&views.length){
    const heads=await transaction.getAll(...views.map(view=>firestore.doc(view.kind==='branch_manager'?`companyAccess/${view.email}`:`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`)));
    if(heads.some(head=>head.exists&&head.data()?.roleChunkManifest))throw Error('角色傳輸已升級，舊排課服務不能覆蓋新版視圖');
   }
   // Write every scoped view with the same revision, including unchanged views;
   // this is the recipient's ordering fence, not a claim about delivery latency.
   for(const view of publishedRoleChunks?[]:views){
    if(view.kind==='branch_manager')derived.push({ref:firestore.doc(`companyAccess/${view.email}`),value:{scopedDb:view.db,scopedClientHash:view.clientHash,scopedSourceRecordHash:plan.targetHash,scopedSourceRecordRevision:sourceRevision,scopedUpdatedAt:serverTimestamp()},merge:true});
    else derived.push({ref:firestore.doc(`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`),value:{db:view.db,email:view.email,...(view.kind==='teacher'?{teacherId:view.teacherId}:{}),clientHash:view.clientHash,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,release:request.release,updatedAt:serverTimestamp()}});
   }
   for(const id of new Set([...oldMeta.keys(),...newMeta.keys()])){const before=oldMeta.get(id),after=newMeta.get(id);if(before&&after&&projection.productionLessonMetaSignature(before)===projection.productionLessonMetaSignature(after))continue;derived.push({ref:firestore.doc(`companies/danbridge/lessonMeta/${id}`),...(after?{value:{...after,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,updatedAt:serverTimestamp()}}:{remove:true})})}
   for(const notice of notices)derived.push({ref:firestore.doc(`companies/danbridge/scheduleNotifications/${notice.id}`),value:{...notice.payload,sourceRecordHash:plan.targetHash,sourceRecordRevision:sourceRevision,createdAt:serverTimestamp()}});
   let publishedPlan;
   if(publishedRoleChunks){
    const {buildNotificationDeliveryProofs}=require('./production-notification-delivery-proof.cjs');
    const lessonRecords=new Map(documents.lessons.map(row=>[row.id,row.data]));
    for(const operation of plan.operations)if(operation.collection==='lessons')lessonRecords.set(operation.recordId,operation.payload);
    for(const proof of buildNotificationDeliveryProofs(notices,lessonRecords,caller,plan.targetHash))derived.push({ref:firestore.doc(proof.path),value:proof.value});
    const {planPublishedRoleChunks}=require('./published-role-chunk-plan.cjs');
    publishedPlan=await planPublishedRoleChunks({source:plan.db,accessRows,sourceRevision,sourceHash:plan.targetHash,release:request.release,now:now(),reservedWrites:2*plan.operationCount+3+derived.length,prepared,preserveLegacyViews},async path=>{const head=await transaction.get(firestore.doc(path));return head.exists?head.data():null},{deleteField});
    // Cold preparation must be performed outside this transaction by the
    // caller before retrying the SAME command. Never partially commit here.
    if(publishedPlan.needsPreparation)throw Object.assign(Error('Role chunk preparation required'),{roleChunkPreparation:publishedPlan});
    for(const write of publishedPlan.writes)derived.push({ref:firestore.doc(write.path),value:write.value,merge:write.merge});
   }
   const callerManifest=publishedPlan?.views.find(view=>view.kind==='scheduler'&&view.email===caller.email)?.manifest;
   const chunkResponse=publishedRoleChunks&&!preserveLegacyViews;
   const response={schema:chunkResponse?'danbridge-production-scheduler-chunk-response-v1':policy.SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash:plan.targetHash,sourceRecordRevision:sourceRevision,operationCount:plan.operationCount,notificationCount:notices.length,...(chunkResponse?{roleManifest:callerManifest}:{schedulerDb:views.find(view=>view.kind==='scheduler'&&view.email===caller.email).db})};
   if(Buffer.byteLength(JSON.stringify(response))>750000)throw new Error('排課回條超過安全大小');
   if(2*plan.operationCount+3+derived.length>450)throw new Error('排課原子交易超過安全寫入上限');
   mark('role-notification-plan');
   // The existing Owner-only adapter is an internal service primitive. It only
   // receives this server-built bounded plan after scheduler authorization.
   const readTransaction=createProductionTransactionReader(firestore,transaction,[controlSnapshot,safetySnapshot,...collections.flatMap(snapshot=>snapshot.docs)]);
   const adapter=createFirebaseProductionRecordBatchAdapter({actor:{uid:caller.uid,email:caller.email},role:'owner',serverTimestamp,runTransaction:callback=>callback({get:readTransaction,set:(path,value,options)=>transaction.set(firestore.doc(path),value,options||{merge:false}),delete:path=>transaction.delete(firestore.doc(path))})});
   if(plan.operationCount){const result=await adapter.apply({activationEpoch:plan.activationEpoch,reason:'scheduler-timetable',operations:plan.operations},`scheduler-${sha256Canonical({uid:caller.uid,requestId:request.requestId}).slice(0,48)}`);if(result.kind!=='batch'||result.targetHash!==plan.targetHash)throw new Error('排課原子提交回條不符')}
   for(const write of derived){if(write.remove)transaction.delete(write.ref);else transaction.set(write.ref,write.value,{merge:write.merge===true})}
   transaction.set(receiptRef,{fingerprint,uid:caller.uid,email:caller.email,response,createdAt:serverTimestamp()});
   mark('adapter-read-write-plan');
   return response;
  });
  let response;
  for(let attempt=0;attempt<3;attempt++){
   try{response=await executeTransaction();break}catch(error){
    if(!publishedRoleChunks||attempt===2)throw error;
    if(prepared&&error.code===10){prepared=null;continue}
    if(!error.roleChunkPreparation)throw error;
    prepared=await require('./published-role-chunk-plan.cjs').stagePublishedRoleParts(firestore,error.roleChunkPreparation);
    mark('role-chunk-preparation');
   }
  }
  mark('commit-release');return response;
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
function createProductionScheduleNoticeBuilder({primaryOwnerEmail,projection,notificationPolicy,sha256Canonical}){
 const equal=(a,b)=>a===b||nativeCanonicalSha256(a??null)===nativeCanonicalSha256(b??null);
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
 return notifications;
}
module.exports={createProductionSchedulerRuntime,productionSchedulerErrorCode,createSchedulerExecutionLane,createProductionScheduleNoticeBuilder};
