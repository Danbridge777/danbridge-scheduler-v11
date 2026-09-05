'use strict';

const {onRequest,onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onInit}=require('firebase-functions/v2/core');
const {applicationDefault,getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getAppCheck}=require('firebase-admin/app-check');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {GoogleAuth}=require('google-auth-library');
const {createHash}=require('node:crypto');
const {commitProductionDerivedWrites,readProductionRoleViewInputs}=require('./production-derived-commit.cjs');
const {createProductionSchedulerRuntime,productionSchedulerErrorCode}=require('./production-scheduler-runtime.cjs');
const {createStagingDerivedDeliveryRuntime}=require('./staging-derived-delivery-runtime.cjs');

const PROJECT_ID='danbridge-d8877-staging';
const SERVICE_ACCOUNT='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
const PRODUCTION_PROJECT_ID='danbridge-d8877';
const PRODUCTION_SERVICE_ACCOUNT='danbridge-production-runtime@danbridge-d8877.iam.gserviceaccount.com';
const PRIMARY_OWNER_EMAIL='a0965487920@gmail.com';
let runtimePromise=null;
let stagingSchedulerRuntimePromise=null;
let productionRuntimePromise=null;
let productionSchedulerRuntimePromise=null;

function reportRuntimeBlocked(error){
 const name=error instanceof Error&&typeof error.name==='string'?error.name:'UnknownError';
 const message=error instanceof Error&&typeof error.message==='string'?error.message:'unknown runtime initialization error';
 console.error('STAGING_V2_RUNTIME_BLOCKED',JSON.stringify({name,message}));
}

function reportSaveBlocked(error){
 const name=error instanceof Error&&typeof error.name==='string'?error.name:'UnknownError';
 const message=error instanceof Error&&typeof error.message==='string'?error.message:'unknown authority save error';
 console.error('STAGING_V2_SAVE_BLOCKED',JSON.stringify({name,message}));
}

function shouldEagerWarmStagingService(service){
 const gcloudProject=String(process.env.GCLOUD_PROJECT||''),googleProject=String(process.env.GOOGLE_CLOUD_PROJECT||'');
 return process.env.K_SERVICE===service&&(!gcloudProject||gcloudProject===PROJECT_ID)&&(!googleProject||googleProject===PROJECT_ID)&&(gcloudProject===PROJECT_ID||googleProject===PROJECT_ID);
}

function stagingMixedAuditSaveId(saveId,recordId){
 return `mix:${createHash('sha256').update(`${saveId}:${recordId}`,'utf8').digest('hex').slice(0,48)}`;
}

async function executeStagingAuthorityPayload({payload,recordBinder,auditBinder,derivedDelivery,trustedHashes=null}){
 const keys=Array.isArray(payload?.changedKeys)?payload.changedKeys:[],baselines=Array.isArray(payload?.baselineRecords)?payload.baselineRecords:[],locals=Array.isArray(payload?.localRecords)?payload.localRecords:[];
 if(!keys.length||keys.length!==baselines.length||keys.length!==locals.length)throw new Error('staging authority mixed payload count invalid');
 const auditIndexes=[],recordIndexes=[];keys.forEach((key,index)=>(key?.collection==='changes'?auditIndexes:recordIndexes).push(index));
 const select=(indexes,save)=>({save,changedKeys:indexes.map(index=>keys[index]),baselineRecords:indexes.map(index=>baselines[index]),localRecords:indexes.map(index=>locals[index])});
 const publicCompletion=(recordCompletion,auditCompletion)=>Object.freeze({state:'complete-confirmed',transactionState:[recordCompletion,auditCompletion].filter(Boolean).every(row=>row.transactionState==='replayed')?'replayed':'created',projectId:PROJECT_ID,activationEpoch:(recordCompletion||auditCompletion).activationEpoch,resultHeadHash:(recordCompletion||auditCompletion).resultHeadHash,commitHash:(recordCompletion||auditCompletion).commitHash,saveId:payload.save.saveId,operationCount:keys.length,persistedAt:(auditCompletion||recordCompletion).persistedAt,writeCount:[recordCompletion,auditCompletion].filter(Boolean).reduce((sum,row)=>sum+row.writeCount,0)});
 const auditPayloads=auditIndexes.map((index,position)=>select([index],!recordIndexes.length&&position===0?payload.save:{...payload.save,saveId:stagingMixedAuditSaveId(payload.save.saveId,keys[index].recordId)}));
 if(!recordIndexes.length){const auditCompletion=auditPayloads.length===1?await auditBinder.execute(auditPayloads[0]):await auditBinder.executeBatch(auditPayloads),completion=publicCompletion(null,auditCompletion),derived=await derivedDelivery.deliver(payload,completion,trustedHashes);return trustedHashes?Object.freeze({...completion,schedulerEvidence:derived}):completion}
 if(!auditIndexes.length){const completion=await recordBinder.execute(payload,trustedHashes),derived=await derivedDelivery.deliver(payload,completion,trustedHashes);return trustedHashes?Object.freeze({...completion,schedulerEvidence:derived}):completion}
 const mixedStarted=Date.now(),recordPayload=select(recordIndexes,payload.save),recordStarted=Date.now(),recordPromise=recordBinder.execute(recordPayload,trustedHashes).then(value=>({value,elapsedMs:Date.now()-recordStarted})),auditStarted=Date.now(),auditPromise=auditBinder.executeBatch(auditPayloads).then(value=>({value,elapsedMs:Date.now()-auditStarted})),[recordResult,auditResult]=await Promise.all([recordPromise,auditPromise]),recordCompletion=recordResult.value,auditCompletion=auditResult.value;
 console.info('STAGING_V2_MIXED_AUTHORITY',JSON.stringify({state:'committed',recordMs:recordResult.elapsedMs,auditMs:auditResult.elapsedMs,totalMs:Date.now()-mixedStarted,recordOperations:recordIndexes.length,auditOperations:auditIndexes.length}));
 if(auditCompletion.projectId!==PROJECT_ID||auditCompletion.activationEpoch!==recordCompletion.activationEpoch)throw new Error('staging authority mixed completion identity invalid');
 const completion=publicCompletion(recordCompletion,auditCompletion),derived=await derivedDelivery.deliver(payload,completion,trustedHashes);return trustedHashes?Object.freeze({...completion,schedulerEvidence:derived}):completion;
}

async function runtime(){
 if(runtimePromise===null)runtimePromise=(async()=>{
  const app=getApps()[0]??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),auth=getAuth(app),appCheck=getAppCheck(app),firestore=getFirestore(app),[{createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder},{createFirebaseStagingV2AuditAppendCloudRuntimeBinder},{createStagingV2AuthoritySaveAdminCloudRuntime}]=await Promise.all([import('../js/core/firebase-active-record-authority-save-chain-v2-adapter.js'),import('../js/core/firebase-staging-v2-audit-append-adapter.js'),import('../js/core/staging-v2-authority-save-cloud-runtime.js')]),recordBinder=createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID}),auditBinder=createFirebaseStagingV2AuditAppendCloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID});
  const derivedDelivery=await createStagingDerivedDeliveryRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),now:()=>Date.now(),expectedProjectId:PROJECT_ID});
  await derivedDelivery.warm();
  const reportingBinder=Object.freeze({scope:recordBinder.scope,execute:async payload=>{try{return await executeStagingAuthorityPayload({payload,recordBinder,auditBinder,derivedDelivery})}catch(error){reportSaveBlocked(error);throw error}}});
  return createStagingV2AuthoritySaveAdminCloudRuntime({app,auth,appCheck,firestore,binder:reportingBinder,now:()=>Date.now()})
 })().catch(error=>{runtimePromise=null;throw error});
 return runtimePromise
}

exports.stagingV2AuthoritySave=onRequest({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,invoker:'public',cors:false,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:1,maxInstances:10},async(request,response)=>{try{const handler=await runtime();await handler.handle(request,response)}catch(error){reportRuntimeBlocked(error);response.set('cache-control','no-store').set('content-type','application/json; charset=utf-8').status(500).send(JSON.stringify({schema:'danbridge-staging-v2-authority-save-response-v1',state:'blocked',code:'RUNTIME_BLOCKED'}))}});

// The staging function keeps one instance available. Start its sealed runtime
// while that instance boots so the first real timetable write does not pay the
// dynamic module and Firebase Admin initialization cost. The exact service and
// project guards prevent every production function from initializing staging.
async function productionRuntime(){
 if(productionRuntimePromise===null)productionRuntimePromise=(async()=>{
  const app=getApps().find(row=>row.name==='production-trusted')??initializeApp({projectId:PRODUCTION_PROJECT_ID,credential:applicationDefault()},'production-trusted'),firestore=getFirestore(app),[{createFirebaseProductionRecordOperationAdapter,createFirebaseProductionRecordBatchAdapter,createFirebaseProductionAccessMutationAdapter},{assertProductionTrustedCaller,assertProductionTrustedOperation,buildProductionTrustedResponse}]=await Promise.all([import('../js/core/firebase-production-record-runtime-adapter.js'),import('../js/core/production-trusted-operation-contract.js')]);
  const reference=path=>firestore.doc(path),runTransaction=callback=>firestore.runTransaction(native=>callback({get:path=>native.get(reference(path)),set:(path,value,options={merge:false})=>native.set(reference(path),value,options),delete:path=>native.delete(reference(path))})),serverTimestamp=()=>FieldValue.serverTimestamp(),deleteField=()=>FieldValue.delete();
  return Object.freeze({app,firestore,assertProductionTrustedCaller,assertProductionTrustedOperation,buildProductionTrustedResponse,adaptersFor:actor=>Object.freeze({record:createFirebaseProductionRecordOperationAdapter({runTransaction,serverTimestamp,actor,role:'owner'}),batch:createFirebaseProductionRecordBatchAdapter({runTransaction,serverTimestamp,actor,role:'owner'}),access:createFirebaseProductionAccessMutationAdapter({runTransaction,serverTimestamp,deleteField,actor,role:'owner'})})});
 })().catch(error=>{productionRuntimePromise=null;throw error});
 return productionRuntimePromise;
}

async function verifiedProductionOwner(request,runtimeValue){
 const uid=String(request.auth?.uid||''),email=String(request.auth?.token?.email||'').trim().toLowerCase();
 if(!uid||!email||request.auth?.token?.email_verified!==true||!request.app)throw new HttpsError('unauthenticated','需要有效登入與 App Check。');
 let access={uid,email,role:'owner',active:true,companyId:'danbridge'};
 if(email!==PRIMARY_OWNER_EMAIL){const snapshot=await runtimeValue.firestore.doc(`companyAccess/${email}`).get(),row=snapshot.exists?snapshot.data():null;access={uid,email,role:row?.role,active:row?.active,companyId:row?.companyId}}
 try{return runtimeValue.assertProductionTrustedCaller(access)}catch{throw new HttpsError('permission-denied','只有有效 Owner 可以執行正式寫入。')}
}

async function verifiedStagingOwner(request){
 const uid=String(request.auth?.uid||''),email=String(request.auth?.token?.email||'').trim().toLowerCase();
 if(!uid||!email||request.auth?.token?.email_verified!==true||!request.app)throw new HttpsError('unauthenticated','需要有效登入與 App Check。');
 if(email===PRIMARY_OWNER_EMAIL)return Object.freeze({uid,email});
 const app=getApps().find(row=>row.options?.projectId===PROJECT_ID)??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),firestore=getFirestore(app),snapshot=await firestore.doc(`companyAccess/${email}`).get(),row=snapshot.exists?snapshot.data():null;
 if(row?.active!==true||row?.companyId!=='danbridge'||row?.role!=='owner')throw new HttpsError('permission-denied','只有有效 Owner 可以保存 staging 衝突證據。');
 return Object.freeze({uid,email});
}

exports.stagingAcknowledgeScheduleNotification=onCall({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:30,memory:'256MiB',concurrency:40,minInstances:1,maxInstances:10},async request=>{
 try{
  const [{normalizeProductionNotificationAcknowledgeRequest,normalizeProductionNotificationActor,assertProductionNotificationRecipient}]=await Promise.all([import('../js/core/production-notification-policy.js')]),actor=normalizeProductionNotificationActor({uid:request.auth?.uid,email:request.auth?.token?.email,emailVerified:request.auth?.token?.email_verified===true,appVerified:Boolean(request.app)}),{notificationIds}=normalizeProductionNotificationAcknowledgeRequest(request.data),app=getApps().find(row=>row.options?.projectId===PROJECT_ID)??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),firestore=getFirestore(app);
  const result=await firestore.runTransaction(async transaction=>{
   const refs=notificationIds.map(id=>firestore.doc(`companies/danbridge/scheduleNotifications/${id}`)),snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));let updatedCount=0,alreadyReadCount=0;
   for(let index=0;index<snapshots.length;index++){
    const snapshot=snapshots[index];
    if(!snapshot.exists)throw new Error('找不到通知，請重新整理');
    assertProductionNotificationRecipient(snapshot.data(),actor);
    if(snapshot.data()?.read===true){alreadyReadCount++;continue}
    transaction.update(refs[index],{read:true,acknowledgedAt:FieldValue.serverTimestamp(),acknowledgedBy:actor.uid});updatedCount++;
   }
   return{updatedCount,alreadyReadCount};
  });
  return{schema:'danbridge-staging-schedule-notification-acknowledge-response-v1',ok:true,...result};
 }catch(error){if(error instanceof HttpsError)throw error;console.error('STAGING_NOTIFICATION_ACK_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition',String(error?.message||'通知確認已安全阻止。').slice(0,200))}
});

async function stagingSchedulerRuntime(){
 if(!stagingSchedulerRuntimePromise)stagingSchedulerRuntimePromise=(async()=>{
   const app=getApps().find(row=>row.options?.projectId===PROJECT_ID)??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),firestore=getFirestore(app),[{createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder},{createFirebaseStagingV2AuditAppendCloudRuntimeBinder},{createStagingDerivedDeliveryRuntime},{createStagingSchedulerRuntime}]=await Promise.all([import('../js/core/firebase-active-record-authority-save-chain-v2-adapter.js'),import('../js/core/firebase-staging-v2-audit-append-adapter.js'),Promise.resolve(require('./staging-derived-delivery-runtime.cjs')),Promise.resolve(require('./staging-scheduler-runtime.cjs'))]),recordBinder=createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID}),auditBinder=createFirebaseStagingV2AuditAppendCloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID}),derivedDelivery=await createStagingDerivedDeliveryRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),now:()=>Date.now(),expectedProjectId:PROJECT_ID}),executeAuthorityPayload=async(payload,trustedHashes)=>executeStagingAuthorityPayload({payload,recordBinder,auditBinder,derivedDelivery,trustedHashes});
   await derivedDelivery.warm();
   return createStagingSchedulerRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),executeAuthorityPayload,getCachedAuthoritySnapshot:()=>derivedDelivery.peek(),primaryOwnerEmail:PRIMARY_OWNER_EMAIL});
  })().catch(error=>{stagingSchedulerRuntimePromise=null;throw error});
 return stagingSchedulerRuntimePromise
}

exports.stagingSchedulerOperation=onCall({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'2GiB',cpu:2,concurrency:4,minInstances:1,maxInstances:10},async request=>{
 try{
  const scheduler=await stagingSchedulerRuntime();
  return await scheduler.execute(request.data,{uid:request.auth?.uid,email:String(request.auth?.token?.email||'').trim().toLowerCase(),emailVerified:request.auth?.token?.email_verified===true,appVerified:Boolean(request.app)});
 }catch(error){if(error instanceof HttpsError)throw error;console.error('STAGING_SCHEDULER_BLOCKED',String(error?.message||'blocked'));const {stagingSchedulerErrorCode}=require('./staging-scheduler-runtime.cjs');throw new HttpsError(stagingSchedulerErrorCode(error),String(error?.message||'排課操作未完成，資料已保留').slice(0,240))}
});

// The callable has a minimum instance. Hydrate and hash-check the complete
// authority snapshot while that instance boots so the first real operation
// gets the same verified hot path as subsequent operations.
onInit(async()=>{
 if(shouldEagerWarmStagingService('stagingv2authoritysave')){
  console.info('STAGING_RUNTIME_EAGER_WARM',JSON.stringify({state:'started',service:'stagingv2authoritysave'}));
  await runtime();
  console.info('STAGING_RUNTIME_EAGER_WARM',JSON.stringify({state:'complete',service:'stagingv2authoritysave'}));
  return;
 }
 if(shouldEagerWarmStagingService('stagingscheduleroperation')){
  console.info('STAGING_RUNTIME_EAGER_WARM',JSON.stringify({state:'started',service:'stagingscheduleroperation'}));
  await stagingSchedulerRuntime();
  console.info('STAGING_RUNTIME_EAGER_WARM',JSON.stringify({state:'complete',service:'stagingscheduleroperation'}));
 }
});

exports.stagingV2ConflictBackup=onCall({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:30,memory:'256MiB',concurrency:20,minInstances:0,maxInstances:10},async request=>{
 const actor=await verifiedStagingOwner(request),input=request.data;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='activationEpoch,baseHash,conflicts,deviceId,targetHash')throw new HttpsError('invalid-argument','V2 衝突備份欄位無效。');
 const {activationEpoch,deviceId,baseHash,targetHash,conflicts}=input,token=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value),recordHash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
 let serialized='';try{serialized=JSON.stringify(conflicts)}catch{}
 if(!token(activationEpoch)||!token(deviceId)||!recordHash(baseHash)||!recordHash(targetHash)||!Array.isArray(conflicts)||!conflicts.length||serialized.length<2||serialized.length>500000)throw new HttpsError('invalid-argument','V2 衝突備份內容無效。');
 const app=getApps().find(row=>row.options?.projectId===PROJECT_ID)??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),firestore=getFirestore(app),[{splitRecordConflicts},{sha256Canonical}]=await Promise.all([import('../js/core/cloud-record-three-way-merge.js'),import('../js/core/cloud-immutable-migration-backup.js')]),conflictHash=sha256Canonical(conflicts),backupId=`conflict-${conflictHash.slice(0,24)}`,parts=splitRecordConflicts(conflicts,160000);
 if(parts.length>4)throw new HttpsError('invalid-argument','V2 衝突備份超過安全上限。');
 const headRef=firestore.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${activationEpoch}`),documents=parts.map((payload,partIndex)=>{const partId=`${backupId}-${partIndex}`;return{ref:firestore.doc(`stagingActiveRecordV2ConflictBackups/danbridge/epochs/${activationEpoch}/parts/${partId}`),partId,payload:{schema:'danbridge-active-record-v2-conflict-backup-v1',environment:'staging',companyId:'danbridge',activationEpoch,backupId,partId,conflictHash,baseHash,targetHash,deviceId,partIndex,partCount:parts.length,encoding:'json-fragment',payload}}});
 const result=await firestore.runTransaction(async transaction=>{const [headSnapshot,...snapshots]=await Promise.all([transaction.get(headRef),...documents.map(row=>transaction.get(row.ref))]),head=headSnapshot.exists?headSnapshot.data():null;if(!head||head.environment!=='staging'||head.companyId!=='danbridge'||head.activationEpoch!==activationEpoch||head.schema!=='danbridge-active-record-authority-head-v2'||!Number.isSafeInteger(head.revision)||head.revision<1)throw new HttpsError('failed-precondition','V2 權威 head 未啟用。');let writes=0,duplicates=0;for(let index=0;index<documents.length;index++){const current=snapshots[index].exists?snapshots[index].data():null,row=documents[index];if(current){if(current.conflictHash!==conflictHash||current.baseHash!==baseHash||current.targetHash!==targetHash||current.deviceId!==deviceId||current.partIndex!==index||current.partCount!==parts.length)throw new HttpsError('already-exists','V2 衝突備份 immutable 衝突。');duplicates++;continue}transaction.set(row.ref,{...row.payload,createdAt:FieldValue.serverTimestamp(),createdBy:actor.uid,createdByEmail:actor.email},{merge:false});writes++}return{writes,duplicates,headRevision:head.revision}});
 const verified=await Promise.all(documents.map(row=>row.ref.get()));if(verified.some((snapshot,index)=>!snapshot.exists||snapshot.data()?.conflictHash!==conflictHash||snapshot.data()?.partIndex!==index))throw new HttpsError('internal','V2 衝突備份讀回不一致。');
 return Object.freeze({schema:'danbridge-active-record-v2-conflict-backup-result-v1',environment:'staging',companyId:'danbridge',activationEpoch,backupId,conflictHash,baseHash,targetHash,partCount:parts.length,conflictCount:conflicts.length,writes:result.writes,duplicates:result.duplicates,headRevision:result.headRevision,paths:documents.map(row=>row.ref.path)});
});

async function verifiedProductionLeaveActor(request,runtimeValue){
 const uid=String(request.auth?.uid||''),email=String(request.auth?.token?.email||'').trim().toLowerCase();
 if(!uid||!email||request.auth?.token?.email_verified!==true||!request.app)throw new HttpsError('unauthenticated','需要有效登入與 App Check。');
 let access={uid,email,role:'owner',active:true,companyId:'danbridge',teacherId:'',canManageSchedule:false};
 if(email!==PRIMARY_OWNER_EMAIL){const snapshot=await runtimeValue.firestore.doc(`companyAccess/${email}`).get(),row=snapshot.exists?snapshot.data():null;access={uid,email,role:row?.role,active:row?.active,companyId:row?.companyId,teacherId:row?.teacherId,canManageSchedule:row?.canManageSchedule===true}}
 const {normalizeTeacherLeaveActor}=await import('../js/core/teacher-leave-policy.js');
 try{return normalizeTeacherLeaveActor(access)}catch{throw new HttpsError('permission-denied','此帳號沒有請假操作權限。')}
}

exports.productionTeacherLeaveOperation=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'512MiB',concurrency:20,minInstances:0,maxInstances:20},async request=>{
 try{
  const runtimeValue=await productionRuntime(),actor=await verifiedProductionLeaveActor(request,runtimeValue),firestore=runtimeValue.firestore,{normalizeTeacherLeaveRequest,buildTeacherLeaveRecord,teacherLeaveRequestFingerprint,teacherLeaveTypeLabel,teacherRecordFromAuthorityEnvelope}=await import('../js/core/teacher-leave-policy.js'),normalized=normalizeTeacherLeaveRequest(request.data),fingerprint=teacherLeaveRequestFingerprint(request.data),leaveRef=firestore.doc(`productionTeacherLeaveRecords/${normalized.leaveId}`),receiptRef=firestore.doc(`productionTeacherLeaveOperationReceipts/${normalized.operationId}`),auditRef=firestore.doc(`companyAudit/teacher-leave-${normalized.operationId}`),accessSnapshot=await firestore.collection('companyAccess').get(),accessRows=accessSnapshot.docs.map(row=>({email:row.id.toLowerCase(),...(row.data()||{})})).filter(row=>row.active===true&&row.companyId==='danbridge'),actorAccess=accessRows.find(row=>row.email===actor.email),actorName=actor.kind==='owner'?'Daniel':actor.kind==='scheduler'?'AA':String(actorAccess?.teacherName||actorAccess?.displayName||actor.email),nowIso=new Date().toISOString();
  const result=await firestore.runTransaction(async transaction=>{
   const [currentSnapshot,receiptSnapshot]=await Promise.all([transaction.get(leaveRef),transaction.get(receiptRef)]),current=currentSnapshot.exists?currentSnapshot.data():null,receipt=receiptSnapshot.exists?receiptSnapshot.data():null;
   if(receipt){if(receipt.requestFingerprint!==fingerprint||receipt.leaveId!==normalized.leaveId)throw new Error('請假操作 receipt identity 衝突');return{duplicate:true,record:current,revision:receipt.revision}}
   const teacherId=normalized.action==='cancel'?String(current?.teacherId||''):String(normalized.input?.teacherId||''),teacherRef=firestore.doc(`productionFullRecordShadows/danbridge/collections/teachers/records/${teacherId}`),teacherSnapshot=await transaction.get(teacherRef),teacher=teacherSnapshot.exists?teacherSnapshot.data():null,teacherRecord=teacherRecordFromAuthorityEnvelope(teacher,teacherId);
   const record=buildTeacherLeaveRecord({request:request.data,actor,current,teacherName:String(teacherRecord.name||teacherRecord.displayName||teacherId),nowIso}),audit={updatedAt:FieldValue.serverTimestamp(),updatedByUid:actor.uid,updatedByEmail:actor.email};
   transaction.set(leaveRef,{...record,...audit},{merge:false});
   transaction.set(receiptRef,{schema:'danbridge-teacher-leave-operation-receipt-v1',environment:'production',companyId:'danbridge',operationId:normalized.operationId,leaveId:normalized.leaveId,action:normalized.action,requestFingerprint:fingerprint,revision:record.revision,committedAt:FieldValue.serverTimestamp(),committedByUid:actor.uid,committedByEmail:actor.email},{merge:false});
   transaction.set(auditRef,{schema:'danbridge-company-audit-v2',environment:'production',companyId:'danbridge',category:'teacher-leave',action:`teacher-leave-${normalized.action}`,actorUid:actor.uid,actorEmail:actor.email,targetType:'teacherLeave',targetId:normalized.leaveId,teacherId:record.teacherId,leaveType:record.leaveType,date:record.date,durationMinutes:record.durationMinutes,status:record.status,revision:record.revision,createdAt:FieldValue.serverTimestamp()},{merge:false});
   const recipientMap=new Map([[PRIMARY_OWNER_EMAIL,{email:PRIMARY_OWNER_EMAIL,role:'owner',teacherId:''}]]);
   for(const row of accessRows){const email=String(row.email||'').toLowerCase(),scheduler=row.role==='teacher'&&row.canManageSchedule===true&&email==='aa0966626336@gmail.com',ownTeacher=row.role==='teacher'&&String(row.teacherId||'')===record.teacherId;if(scheduler||ownTeacher)recipientMap.set(email,{email,role:scheduler?'scheduler':'teacher',teacherId:String(row.teacherId||'')})}
   for(const recipient of recipientMap.values()){
    const safeRecipient=recipient.email.replace(/[^A-Za-z0-9_-]/g,'_'),notificationRef=firestore.doc(`companies/danbridge/scheduleNotifications/leave_${normalized.operationId}_${safeRecipient}`),verb=normalized.action==='create'?'新增':normalized.action==='update'?'更新':'取消',typeLabel=teacherLeaveTypeLabel(record.leaveType);
    transaction.set(notificationRef,{companyId:'danbridge',notificationType:'teacher-leave',recipientEmail:recipient.email,recipientRole:recipient.role,teacherId:recipient.teacherId,teacherName:record.teacherName,title:'老師請假異動',message:`${record.teacherName} ${record.date} ${record.start}–${record.end} ${typeLabel}已${verb}`,changeCount:1,details:[{leaveId:record.leaveId,teacherId:record.teacherId,teacherName:record.teacherName,leaveType:record.leaveType,leaveTypeLabel:typeLabel,date:record.date,start:record.start,end:record.end,hours:record.hours,status:record.status,action:normalized.action,summary:`${typeLabel} ${record.hours} 小時`}],read:false,createdAt:FieldValue.serverTimestamp(),createdBy:actor.uid,createdByName:actorName},{merge:false});
   }
   return{duplicate:false,record,revision:record.revision};
  });
  return{schema:'danbridge-teacher-leave-operation-response-v1',ok:true,...result};
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_TEACHER_LEAVE_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition',String(error?.message||'請假操作已安全阻止。').slice(0,200))}
});

exports.productionAcknowledgeScheduleNotification=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:30,memory:'256MiB',concurrency:40,minInstances:0,maxInstances:20},async request=>{
 try{
  const runtimeValue=await productionRuntime(),firestore=runtimeValue.firestore,{normalizeProductionNotificationAcknowledgeRequest,normalizeProductionNotificationActor,assertProductionNotificationRecipient}=await import('../js/core/production-notification-policy.js'),actor=normalizeProductionNotificationActor({uid:request.auth?.uid,email:request.auth?.token?.email,emailVerified:request.auth?.token?.email_verified===true,appVerified:Boolean(request.app)}),{notificationIds}=normalizeProductionNotificationAcknowledgeRequest(request.data);
  const result=await firestore.runTransaction(async transaction=>{
   const refs=notificationIds.map(id=>firestore.doc(`companies/danbridge/scheduleNotifications/${id}`)),snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));let updatedCount=0,alreadyReadCount=0;
   for(let index=0;index<snapshots.length;index++){
    const snapshot=snapshots[index];
    if(!snapshot.exists)throw new Error('找不到通知，請重新整理');
    assertProductionNotificationRecipient(snapshot.data(),actor);
    if(snapshot.data()?.read===true){alreadyReadCount++;continue}
    transaction.update(refs[index],{read:true,acknowledgedAt:FieldValue.serverTimestamp(),acknowledgedBy:actor.uid});updatedCount++;
   }
   return{updatedCount,alreadyReadCount};
  });
  return{schema:'danbridge-schedule-notification-acknowledge-response-v1',ok:true,notificationCount:notificationIds.length,...result};
 }catch(error){
  if(error instanceof HttpsError)throw error;
  const message=String(error?.message||'通知確認已安全阻止。').slice(0,200),code=/只能確認|帳號未通過/.test(message)?'permission-denied':/筆數|識別碼/.test(message)?'invalid-argument':'failed-precondition';
  console.error('PRODUCTION_NOTIFICATION_ACKNOWLEDGE_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message}));throw new HttpsError(code,message);
 }
});

exports.productionPublishScheduleNotifications=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:30,memory:'256MiB',concurrency:40,minInstances:1,maxInstances:20},async request=>{
 try{
  const runtimeValue=await productionRuntime(),caller=await verifiedProductionOwner(request,runtimeValue),firestore=runtimeValue.firestore,{normalizeProductionScheduleNotificationPublishRequest,assertProductionScheduleNotificationAccess}=await import('../js/core/production-notification-policy.js'),input=normalizeProductionScheduleNotificationPublishRequest(request.data),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex'),safetyRef=firestore.doc('companies/danbridge/productionRecordRuntime/safety'),receiptRef=firestore.doc(`companies/danbridge/productionScheduleNotificationReceipts/${input.requestId}`),notificationRefs=input.notifications.map(item=>firestore.doc(`companies/danbridge/scheduleNotifications/${item.id}`)),accessRefs=input.notifications.map(item=>item.payload.recipientEmail===PRIMARY_OWNER_EMAIL?null:firestore.doc(`companyAccess/${item.payload.recipientEmail}`));
  const result=await firestore.runTransaction(async transaction=>{
   const [safetySnapshot,receiptSnapshot,...memberAndNotificationSnapshots]=await Promise.all([transaction.get(safetyRef),transaction.get(receiptRef),...accessRefs.map(ref=>ref?transaction.get(ref):Promise.resolve(null)),...notificationRefs.map(ref=>transaction.get(ref))]),safety=safetySnapshot.exists?safetySnapshot.data():null,receipt=receiptSnapshot.exists?receiptSnapshot.data():null,accessSnapshots=memberAndNotificationSnapshots.slice(0,accessRefs.length),notificationSnapshots=memberAndNotificationSnapshots.slice(accessRefs.length);
   if(!safety||safety.state!=='active'||safety.writeAllowed!==true||safety.recordDataHash!==input.sourceHash)throw new Error('通知來源不是目前正式權威 head');
   if(receipt){if(receipt.fingerprint!==fingerprint||receipt.sourceHash!==input.sourceHash)throw new Error('通知發布 receipt identity 衝突');return{kind:'duplicate',writeCount:0,notificationCount:Number(receipt.notificationCount)||input.notifications.length,duplicateCount:input.notifications.length}}
   let writeCount=0,duplicateCount=0;
   input.notifications.forEach((item,index)=>{
    const accessSnapshot=accessSnapshots[index],access=accessSnapshot?.exists?{id:accessSnapshot.id,...(accessSnapshot.data()||{})}:null;
    assertProductionScheduleNotificationAccess(item,access,PRIMARY_OWNER_EMAIL);
    const currentSnapshot=notificationSnapshots[index],current=currentSnapshot?.exists?currentSnapshot.data():null;
    if(current){if(current.publishFingerprint!==fingerprint||current.publishRequestId!==input.requestId||current.recipientEmail!==item.payload.recipientEmail)throw new Error('既有通知 identity 衝突');duplicateCount++;return}
    transaction.set(notificationRefs[index],{...item.payload,sourceHash:input.sourceHash,release:input.release,publishRequestId:input.requestId,publishFingerprint:fingerprint,createdAt:FieldValue.serverTimestamp(),createdBy:caller.uid,createdByEmail:caller.email},{merge:false});writeCount++;
   });
   transaction.set(receiptRef,{schema:'danbridge-production-schedule-notification-publish-receipt-v1',environment:'production',companyId:'danbridge',requestId:input.requestId,sourceHash:input.sourceHash,release:input.release,fingerprint,notificationCount:input.notifications.length,writeCount,duplicateCount,committedAt:FieldValue.serverTimestamp(),committedByUid:caller.uid,committedByEmail:caller.email},{merge:false});
   return{kind:'published',writeCount,notificationCount:input.notifications.length,duplicateCount};
  });
  return{schema:'danbridge-production-schedule-notification-publish-response-v1',ok:true,requestId:input.requestId,sourceHash:input.sourceHash,...result};
 }catch(error){
  if(error instanceof HttpsError)throw error;
  const message=String(error?.message||'課表通知發布已安全阻止。').slice(0,240),code=/identity|請求|內容|收件者|角色|識別碼|範圍/.test(message)?'invalid-argument':/Owner|成員/.test(message)?'permission-denied':'failed-precondition';
  console.error('PRODUCTION_SCHEDULE_NOTIFICATION_PUBLISH_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message}));throw new HttpsError(code,message);
 }
});

exports.productionSchedulerOperation=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'1GiB',concurrency:4,minInstances:1,maxInstances:10},async request=>{
 try{
  const runtimeValue=await productionRuntime();
  if(!productionSchedulerRuntimePromise)productionSchedulerRuntimePromise=createProductionSchedulerRuntime({firestore:runtimeValue.firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),primaryOwnerEmail:PRIMARY_OWNER_EMAIL}).catch(error=>{productionSchedulerRuntimePromise=null;throw error});
  const runtime=await productionSchedulerRuntimePromise;
  return await runtime.execute(request.data,{uid:request.auth?.uid,email:String(request.auth?.token?.email||'').trim().toLowerCase(),emailVerified:request.auth?.token?.email_verified===true,appVerified:Boolean(request.app)});
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_SCHEDULER_BLOCKED',String(error?.message||'blocked'));throw new HttpsError(productionSchedulerErrorCode(error),String(error?.message||'排課操作未完成，資料已保留').slice(0,240))}
});

exports.productionTrustedOperation=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:1,maxInstances:20},async request=>{
 try{
  const runtimeValue=await productionRuntime(),caller=await verifiedProductionOwner(request,runtimeValue),trusted=runtimeValue.assertProductionTrustedOperation(request.data);
  if(trusted.actor.uid!==caller.uid||trusted.actor.email!==caller.email)throw new HttpsError('permission-denied','操作身分不一致。');
  const adapters=runtimeValue.adaptersFor({uid:caller.uid,email:caller.email});
  let result;
  if(trusted.kind==='record.apply')result=await adapters.record.apply(trusted.operation);
  else if(trusted.kind==='record.batch.preview')result=await adapters.batch.preview(trusted.batch,trusted.requestId);
  else if(trusted.kind==='record.batch.apply')result=await adapters.batch.apply(trusted.batch,trusted.requestId);
  else result=await adapters.access.mutate(trusted.mutation,trusted.requestId);
  return runtimeValue.buildProductionTrustedResponse({requestId:trusted.requestId,result});
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_TRUSTED_OPERATION_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition','正式寫入已安全阻止。')}
});

exports.productionPublishRoleViews=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:540,memory:'1GiB',concurrency:4,minInstances:1,maxInstances:10},async request=>{
 const startedAt=Date.now(),timingsMs={},inputReadTimingsMs={};let phaseAt=startedAt;
 const mark=phase=>{const now=Date.now();timingsMs[phase]=now-phaseAt;phaseAt=now};
 try{
  const runtimeValue=await productionRuntime(),caller=await verifiedProductionOwner(request,runtimeValue),firestore=runtimeValue.firestore,[projection,fullRecord,recordHash]=await Promise.all([import('../js/core/production-role-view-projection.js'),import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js')]),input=projection.assertProductionRoleViewPublishRequest(request.data),receiptRef=firestore.doc(`productionRoleViewPublishReceipts/${input.requestId}`),existingReceipt=await receiptRef.get();
  if(existingReceipt.exists){const saved=existingReceipt.data()||{};if(saved.sourceHash!==input.sourceHash||saved.createdByUid!==caller.uid)throw new Error('production 角色檢視發布 receipt identity 衝突');return{...saved,result:{...(saved.result||{}),kind:'duplicate'}}}
  mark('bootstrap');
  const {safetySnapshot,accessSnapshot,teacherSnapshot,schedulerSnapshot,metaSnapshot,collectionSnapshots}=await readProductionRoleViewInputs(firestore,fullRecord.FULL_RECORD_COLLECTIONS,{onRead:(name,ms)=>{inputReadTimingsMs[name]=ms}}),safety=safetySnapshot.exists?safetySnapshot.data():null;
  mark('inputReads');
  if(!safety||safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true||safety.recordDataHash!==input.sourceHash)throw new Error('production 角色檢視來源與目前權威 head 不一致');
  const documentsByCollection=Object.fromEntries(fullRecord.FULL_RECORD_COLLECTIONS.map((name,index)=>[name,collectionSnapshots[index].docs.map(row=>({id:row.id,data:row.data()}))])),rebuilt=fullRecord.rebuildFullRecordShadowDb(documentsByCollection,{environment:'production'}),computedSourceHash=recordHash.recordDataHash(rebuilt.db);
  if(computedSourceHash!==input.sourceHash||rebuilt.documentCount!==safety.documentCount||rebuilt.activeCount!==safety.activeCount||rebuilt.tombstoneCount!==safety.tombstoneCount)throw new Error('production 角色檢視來源 16 集合讀回不一致');
  const accessRows=accessSnapshot.docs.map(row=>({id:row.id,...(row.data()||{})})),now=Date.now(),views=projection.buildProductionRoleViews(rebuilt.db,accessRows,{now}),lessonMeta=projection.buildProductionLessonMeta(rebuilt.db),teacherCurrent=new Map(teacherSnapshot.docs.map(row=>[row.id,row])),schedulerCurrent=new Map(schedulerSnapshot.docs.map(row=>[row.id,row])),metaCurrent=new Map(metaSnapshot.docs.map(row=>[row.id,row])),desiredTeachers=new Set(),desiredSchedulers=new Set(),writes=[];
  for(const view of views){
   if(view.kind==='teacher'){desiredTeachers.add(view.email);const current=teacherCurrent.get(view.email)?.data();if(projection.productionRoleViewNeedsWrite(current,view))writes.push({type:'set',ref:firestore.doc(`companies/danbridge/teacherViews/${view.email}`),value:{db:view.db,updatedAt:FieldValue.serverTimestamp(),teacherId:view.teacherId,email:view.email,clientHash:view.clientHash,sourceRecordHash:input.sourceHash,release:input.release}})}
   else if(view.kind==='scheduler'){desiredSchedulers.add(view.email);const current=schedulerCurrent.get(view.email)?.data();if(projection.productionRoleViewNeedsWrite(current,view))writes.push({type:'set',ref:firestore.doc(`companies/danbridge/schedulerViews/${view.email}`),value:{db:view.db,updatedAt:FieldValue.serverTimestamp(),email:view.email,clientHash:view.clientHash,sourceRecordHash:input.sourceHash,release:input.release}})}
   else {const accessRef=firestore.doc(`companyAccess/${view.email}`),current=accessRows.find(row=>String(row.id).toLowerCase()===view.email);if(current?.scopedClientHash!==view.clientHash||projection.productionClientDataHash(current?.scopedDb)!==view.clientHash)writes.push({type:'set',ref:accessRef,value:{scopedDb:view.db,scopedClientHash:view.clientHash,scopedSourceRecordHash:input.sourceHash,scopedUpdatedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},options:{merge:true}})}
  }
  for(const view of views){
   const path=view.kind==='branch_manager'?`companyAccess/${view.email}`:`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`;
   const fence=view.kind==='branch_manager'?{scopedSourceRecordHash:input.sourceHash,scopedSourceRecordRevision:safety.recordRevision}:{sourceRecordHash:input.sourceHash,sourceRecordRevision:safety.recordRevision};
   const planned=writes.find(write=>write.ref.path===path);
   if(planned)Object.assign(planned.value,fence);else writes.push({type:'set',ref:firestore.doc(path),value:fence,options:{merge:true}});
  }
  for(const [email,row] of teacherCurrent)if(!desiredTeachers.has(email))writes.push({type:'delete',ref:row.ref});
  for(const [email,row] of schedulerCurrent)if(!desiredSchedulers.has(email))writes.push({type:'delete',ref:row.ref});
  const desiredMetaIds=new Set();
  for(const meta of lessonMeta){desiredMetaIds.add(meta.lessonId);const current=metaCurrent.get(meta.lessonId)?.data();if(projection.productionLessonMetaNeedsWrite(current,meta.payload))writes.push({type:'set',ref:firestore.doc(`companies/danbridge/lessonMeta/${meta.lessonId}`),value:{...meta.payload,sourceRecordHash:input.sourceHash,release:input.release,updatedAt:FieldValue.serverTimestamp()}})}
  for(const [lessonId,row] of metaCurrent)if(!desiredMetaIds.has(lessonId))writes.push({type:'delete',ref:row.ref});
  const accessIds=new Set(accessSnapshot.docs.map(row=>row.id)),missingAccessEmails=[...new Set([...teacherCurrent.keys(),...schedulerCurrent.keys()])].filter(email=>!accessIds.has(email)),missingAccessSnapshots=missingAccessEmails.length?await firestore.getAll(...missingAccessEmails.map(email=>firestore.doc(`companyAccess/${email}`))):[];
  if(missingAccessSnapshots.some(row=>row.exists))throw new Error('production 角色成員清單已改變，請重新發布');
  mark('validateAndPlan');
  const committedWrites=await commitProductionDerivedWrites(firestore,writes,{sourceHash:input.sourceHash,accessSnapshots:[...accessSnapshot.docs,...missingAccessSnapshots]});
  mark('guardedCommit');
  const [safetyAfter,teacherAfter,schedulerAfter,metaAfter,accessAfter]=await Promise.all([firestore.doc('companies/danbridge/productionRecordRuntime/safety').get(),firestore.collection('companies/danbridge/teacherViews').get(),firestore.collection('companies/danbridge/schedulerViews').get(),firestore.collection('companies/danbridge/lessonMeta').get(),firestore.collection('companyAccess').where('companyId','==','danbridge').get()]);
  mark('readback');
  if(safetyAfter.data()?.recordDataHash!==input.sourceHash)throw new Error('production 權威 head 在角色檢視發布期間已改變');
  const teacherAfterMap=new Map(teacherAfter.docs.map(row=>[row.id,row.data()])),schedulerAfterMap=new Map(schedulerAfter.docs.map(row=>[row.id,row.data()])),metaAfterMap=new Map(metaAfter.docs.map(row=>[row.id,row.data()])),accessAfterMap=new Map(accessAfter.docs.map(row=>[row.id.toLowerCase(),row.data()]));
  if(teacherAfterMap.size!==desiredTeachers.size||schedulerAfterMap.size!==desiredSchedulers.size||metaAfterMap.size!==desiredMetaIds.size)throw new Error('production 角色檢視發布後文件數不一致');
  for(const view of views){const saved=view.kind==='teacher'?teacherAfterMap.get(view.email):view.kind==='scheduler'?schedulerAfterMap.get(view.email):accessAfterMap.get(view.email),savedDb=view.kind==='branch_manager'?saved?.scopedDb:saved?.db,savedHash=view.kind==='branch_manager'?saved?.scopedClientHash:saved?.clientHash;if(savedHash!==view.clientHash||projection.productionClientDataHash(savedDb)!==view.clientHash)throw new Error(`production ${view.kind} 檢視讀回不一致：${view.email}`)}
  for(const meta of lessonMeta){const saved=metaAfterMap.get(meta.lessonId);if(!saved||projection.productionLessonMetaSignature(saved)!==projection.productionLessonMetaSignature(meta.payload))throw new Error(`production lessonMeta 讀回不一致：${meta.lessonId}`)}
  const result={state:'verified',kind:'published',sourceHash:input.sourceHash,release:input.release,roleViewCount:views.length,teacherViewCount:desiredTeachers.size,schedulerViewCount:desiredSchedulers.size,branchViewCount:views.filter(view=>view.kind==='branch_manager').length,lessonMetaCount:lessonMeta.length,formalRecordWrites:0,derivedWrites:committedWrites};
  const response={schema:projection.PRODUCTION_ROLE_VIEW_PUBLISH_RESPONSE_SCHEMA,requestId:input.requestId,sourceHash:input.sourceHash,createdByUid:caller.uid,createdByEmail:caller.email,verifiedAt:new Date().toISOString(),result};await receiptRef.create({...response,createdAt:FieldValue.serverTimestamp()});
  mark('verifyAndReceipt');console.info('PRODUCTION_ROLE_VIEW_TIMING',JSON.stringify({release:input.release,timingsMs,inputReadTimingsMs,totalMs:Date.now()-startedAt,derivedWrites:committedWrites}));return response;
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_ROLE_VIEW_PUBLISH_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition',String(error?.message||'正式角色檢視發布已安全阻止。').slice(0,240))}
});

async function deleteSnapshots(firestore,snapshots){let deleted=0;for(let offset=0;offset<snapshots.length;offset+=400){const batch=firestore.batch(),rows=snapshots.slice(offset,offset+400);rows.forEach(snapshot=>batch.delete(snapshot.ref));await batch.commit();deleted+=rows.length}return deleted}

async function productionDatabaseProtection(){
 try{const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}),client=await auth.getClient(),response=await client.request({url:`https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)`}),data=response.data||{};return{pitrEnabled:data.pointInTimeRecoveryEnablement==='POINT_IN_TIME_RECOVERY_ENABLED',deleteProtectionEnabled:data.deleteProtectionState==='DELETE_PROTECTION_ENABLED',earliestVersionTime:String(data.earliestVersionTime||''),configurationError:''}}
 catch(error){console.error('PRODUCTION_DATABASE_PROTECTION_READ_FAILED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));return{pitrEnabled:false,deleteProtectionEnabled:false,earliestVersionTime:'',configurationError:'database-metadata-unavailable'}}
}

function decodeFirestoreRestValue(value={}){if('nullValue'in value)return null;if('booleanValue'in value)return value.booleanValue;if('integerValue'in value)return Number(value.integerValue);if('doubleValue'in value)return Number(value.doubleValue);if('timestampValue'in value)return value.timestampValue;if('stringValue'in value)return value.stringValue;if('arrayValue'in value)return(value.arrayValue.values||[]).map(decodeFirestoreRestValue);if('mapValue'in value)return decodeFirestoreRestFields(value.mapValue.fields||{});throw new Error('PITR readback 包含不支援的 Firestore value')}
function decodeFirestoreRestFields(fields={}){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decodeFirestoreRestValue(value)]))}
async function productionPitrReadDocument(path,readTime=''){
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}),client=await auth.getClient(),suffix=readTime?`?readTime=${encodeURIComponent(readTime)}`:'',response=await client.request({url:`https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/${path}${suffix}`});return decodeFirestoreRestFields(response.data?.fields||{});
}

function stablePitrValue(value){if(value&&typeof value.toMillis==='function')return{__timestamp:value.toMillis()};if(Array.isArray(value))return value.map(stablePitrValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stablePitrValue(value[key])]));return value}
function pitrFingerprint(value){return createHash('sha256').update(JSON.stringify(stablePitrValue(value))).digest('hex')}
async function productionRecordFingerprints(firestore,collections){const output={};for(const collectionName of collections){const snapshot=await firestore.collection(`productionFullRecordShadows/danbridge/collections/${collectionName}/records`).get(),rows={};for(const row of snapshot.docs)rows[row.id]=pitrFingerprint(row.data());output[collectionName]=rows}return output}

exports.productionPitrClonePreview=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:540,memory:'1GiB',concurrency:2,minInstances:0,maxInstances:2},async request=>{
 try{
  const runtimeValue=await productionRuntime(),caller=await verifiedProductionOwner(request,runtimeValue);if(caller.email!==PRIMARY_OWNER_EMAIL)throw new HttpsError('permission-denied','只有主要 Owner 可以建立 PITR 暫存還原。');
  const [{assertProductionPitrPreviewRequest,assertProductionPitrPreviewReceipt,assertProductionPitrDiff,normalizeProductionPitrSnapshotTime,buildProductionPitrPreviewDatabaseId,buildProductionPitrDiff},{FULL_RECORD_COLLECTIONS}]=await Promise.all([import('../js/core/production-pitr-clone-preview-policy.js'),import('../js/core/cloud-full-record-shadow.js')]),input=assertProductionPitrPreviewRequest(request.data),auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}),client=await auth.getClient(),verifyReceipt=(row,expectedDatabaseId)=>assertProductionPitrPreviewReceipt({...row,snapshotTime:row?.snapshotTime?.toDate?.().toISOString?.()||String(row?.snapshotTime||'')},{databaseId:expectedDatabaseId,createdByUid:caller.uid,expectedCollections:FULL_RECORD_COLLECTIONS});
  if(input.action==='start'){
   const protection=await productionDatabaseProtection();if(!protection.pitrEnabled||!protection.deleteProtectionEnabled||!protection.earliestVersionTime)throw new Error('PITR 與刪除保護尚未通過實際讀回');
   const snapshotTime=normalizeProductionPitrSnapshotTime({snapshotTime:input.snapshotTime,earliestVersionTime:protection.earliestVersionTime}),databaseId=buildProductionPitrPreviewDatabaseId(snapshotTime,input.requestId),receiptRef=runtimeValue.firestore.doc(`companies/danbridge/pitrPreviews/${databaseId}`),existing=await receiptRef.get();if(existing.exists){const row=verifyReceipt(existing.data(),databaseId);if(row.snapshotTime!==snapshotTime)throw new Error('PITR 暫存資料庫 identity 衝突');return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:row.state,databaseId,snapshotTime,operationName:row.operationName,diff:row.diff||null,formalDataWrites:0}}
   const response=await client.request({method:'POST',url:`https://firestore.googleapis.com/v1/projects/${PRODUCTION_PROJECT_ID}/databases:clone`,data:{databaseId,pitrSnapshot:{database:`projects/${PRODUCTION_PROJECT_ID}/databases/(default)`,snapshotTime}}}),operationName=String(response.data?.name||'');verifyReceipt({schema:'danbridge-production-pitr-clone-preview-v1',environment:'production',companyId:'danbridge',state:'cloning',databaseId,snapshotTime,operationName,createdByUid:caller.uid,formalDataWrites:0,timeMachineDependency:false},databaseId);
   await receiptRef.set({schema:'danbridge-production-pitr-clone-preview-v1',environment:'production',companyId:'danbridge',state:'cloning',databaseId,snapshotTime:Timestamp.fromDate(new Date(snapshotTime)),operationName,createdAt:FieldValue.serverTimestamp(),createdByUid:caller.uid,createdByEmail:caller.email,formalDataWrites:0,timeMachineDependency:false},{merge:false});
   return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:'cloning',databaseId,snapshotTime,operationName,formalDataWrites:0};
  }
  const receiptRef=runtimeValue.firestore.doc(`companies/danbridge/pitrPreviews/${input.databaseId}`),receiptSnapshot=await receiptRef.get(),receipt=receiptSnapshot.exists?verifyReceipt(receiptSnapshot.data(),input.databaseId):null;if(!receipt)throw new Error('找不到 PITR 暫存還原');
  const operation=await client.request({url:`https://firestore.googleapis.com/v1/${receipt.operationName}`}),operationData=operation.data||{};if(operationData.error){await receiptRef.set({state:'failed',errorCode:String(operationData.error.code||'unknown'),updatedAt:FieldValue.serverTimestamp()},{merge:true});throw new Error('PITR 暫存還原失敗')}
  if(operationData.done!==true)return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:'cloning',databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,operationName:receipt.operationName,progress:operationData.metadata?.progressPercentage||{},formalDataWrites:0};
  if(receipt.state==='ready-read-only'&&receipt.diff)return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:'ready-read-only',databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,diff:assertProductionPitrDiff(receipt.diff,{databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,expectedCollections:FULL_RECORD_COLLECTIONS}),formalDataWrites:0};
  const previewFirestore=getFirestore(runtimeValue.app,input.databaseId);let currentByCollection,previewByCollection;try{[currentByCollection,previewByCollection]=await Promise.all([productionRecordFingerprints(runtimeValue.firestore,FULL_RECORD_COLLECTIONS),productionRecordFingerprints(previewFirestore,FULL_RECORD_COLLECTIONS)])}catch(readError){if(Number(readError?.code)===9||/undergoing a restore/i.test(String(readError?.message||'')))return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:'cloning',databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,operationName:receipt.operationName,progress:{estimatedWork:100,completedWork:99},formalDataWrites:0};throw readError}const diff=assertProductionPitrDiff(buildProductionPitrDiff({databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,currentByCollection,previewByCollection}),{databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,expectedCollections:FULL_RECORD_COLLECTIONS});
  await receiptRef.set({state:'ready-read-only',diff,completedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return{schema:'danbridge-production-pitr-clone-preview-response-v1',state:'ready-read-only',databaseId:input.databaseId,snapshotTime:receipt.snapshotTime,diff,formalDataWrites:0};
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_PITR_CLONE_PREVIEW_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition',String(error?.message||'PITR 預覽已安全阻止。').slice(0,200))}
});

exports.productionDailyMaintenance=onSchedule({schedule:'17 3 * * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,timeoutSeconds:300,memory:'512MiB',retryCount:3,maxRetrySeconds:3600},async()=>{
 const startedAt=Date.now(),runtimeValue=await productionRuntime(),firestore=runtimeValue.firestore,[{shouldDeleteProductionMaintenanceDocument,isResolvedProductionHealthError,buildProductionMaintenanceReceipt,buildProductionHealthAssessment}]=await Promise.all([import('../js/core/production-maintenance-policy.js')]),[errorSnapshot,notificationSnapshot,recentErrorSnapshot,pendingRequestSnapshot,unreadNotificationSnapshot,protection]=await Promise.all([firestore.collection('companies/danbridge/errorEvents').where('occurredAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(2000).get(),firestore.collection('companies/danbridge/scheduleNotifications').where('createdAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(4000).get(),firestore.collection('companies/danbridge/errorEvents').where('occurredAt','>=',Timestamp.fromMillis(startedAt-86400000)).limit(500).get(),firestore.collection('companies/danbridge/scheduleRequests').where('status','==','pending').limit(500).get(),firestore.collection('companies/danbridge/scheduleNotifications').where('read','==',false).limit(1000).get(),productionDatabaseProtection()]),expiredErrors=errorSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('errorEvent',row.data(),startedAt)),expiredNotifications=notificationSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('scheduleNotification',row.data(),startedAt)),deleted={errorEvents:await deleteSnapshots(firestore,expiredErrors),scheduleNotifications:await deleteSnapshots(firestore,expiredNotifications)},activeRecentErrors=recentErrorSnapshot.docs.filter(row=>!isResolvedProductionHealthError(row.data())),ownerUnreadNotifications=unreadNotificationSnapshot.docs.filter(row=>String(row.data()?.recipientEmail||'').trim().toLowerCase()===PRIMARY_OWNER_EMAIL),finishedAt=Date.now(),runId=new Date(startedAt).toISOString().slice(0,10),receipt=buildProductionMaintenanceReceipt({runId,startedAt,finishedAt,deleted,scanned:{errorEvents:errorSnapshot.size,scheduleNotifications:notificationSnapshot.size}}),health=buildProductionHealthAssessment({runId,checkedAt:finishedAt,recentErrors:activeRecentErrors.length,pendingRequests:pendingRequestSnapshot.size,unreadNotifications:ownerUnreadNotifications.length,...protection}),payload={...receipt,startedAt:Timestamp.fromMillis(startedAt),finishedAt:Timestamp.fromMillis(finishedAt),updatedAt:FieldValue.serverTimestamp()},healthPayload={...health,checkedAt:Timestamp.fromMillis(finishedAt),updatedAt:FieldValue.serverTimestamp()};
 await Promise.all([firestore.doc('companies/danbridge/systemHealth/maintenance').set(payload,{merge:false}),firestore.doc('companies/danbridge/systemHealth/ownerAlert').set(healthPayload,{merge:false}),firestore.doc(`companies/danbridge/maintenanceRuns/${runId}`).set(payload,{merge:false})]);
 console.info('PRODUCTION_DAILY_MAINTENANCE_VERIFIED',JSON.stringify({runId,deleted,scanned:receipt.scanned}));
});

exports.productionMonthlyPitrRehearsal=onSchedule({schedule:'23 4 1 * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,timeoutSeconds:300,memory:'512MiB',retryCount:2,maxRetrySeconds:3600},async()=>{
 const startedAt=Date.now(),protection=await productionDatabaseProtection();if(!protection.pitrEnabled||!protection.deleteProtectionEnabled||!protection.earliestVersionTime)throw new Error('production PITR 或刪除保護尚未通過實際讀回');
 const [{productionPitrRehearsalSnapshotTime,buildProductionPitrRehearsalReceipt}]=await Promise.all([import('../js/core/production-pitr-rehearsal-policy.js')]),snapshotTime=productionPitrRehearsalSnapshotTime(startedAt),controlPath='companies/danbridge/productionRecordRuntime/control',safetyPath='companies/danbridge/productionRecordRuntime/safety',[historicalControl,historicalSafety,currentControl,currentSafety]=await Promise.all([productionPitrReadDocument(controlPath,snapshotTime),productionPitrReadDocument(safetyPath,snapshotTime),productionPitrReadDocument(controlPath),productionPitrReadDocument(safetyPath)]),finishedAt=Date.now(),runId=new Date(startedAt).toISOString().slice(0,7),receipt=buildProductionPitrRehearsalReceipt({runId,startedAt,finishedAt,snapshotTime,earliestVersionTime:protection.earliestVersionTime,historicalControl,historicalSafety,currentControl,currentSafety}),payload={...receipt,startedAt:Timestamp.fromMillis(startedAt),finishedAt:Timestamp.fromMillis(finishedAt),snapshotTime:Timestamp.fromDate(new Date(snapshotTime)),earliestVersionTime:Timestamp.fromDate(new Date(protection.earliestVersionTime)),updatedAt:FieldValue.serverTimestamp()},firestore=(await productionRuntime()).firestore;
 await Promise.all([firestore.doc('companies/danbridge/systemHealth/restoreRehearsal').set(payload,{merge:false}),firestore.doc(`companies/danbridge/restoreRehearsals/${runId}`).set(payload,{merge:false})]);
 console.info('PRODUCTION_PITR_REHEARSAL_VERIFIED',JSON.stringify({runId,snapshotTime,formalDataWrites:0}));
});
