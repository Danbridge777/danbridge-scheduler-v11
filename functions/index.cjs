'use strict';

const {onRequest,onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {applicationDefault,getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getAppCheck}=require('firebase-admin/app-check');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {GoogleAuth}=require('google-auth-library');

const PROJECT_ID='danbridge-d8877-staging';
const SERVICE_ACCOUNT='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
const PRODUCTION_PROJECT_ID='danbridge-d8877';
const PRODUCTION_SERVICE_ACCOUNT='danbridge-production-runtime@danbridge-d8877.iam.gserviceaccount.com';
const PRIMARY_OWNER_EMAIL='a0965487920@gmail.com';
let runtimePromise=null;
let productionRuntimePromise=null;

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

async function runtime(){
 if(runtimePromise===null)runtimePromise=(async()=>{
  const app=getApps()[0]??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),auth=getAuth(app),appCheck=getAppCheck(app),firestore=getFirestore(app),[{createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder},{createStagingV2AuthoritySaveAdminCloudRuntime}]=await Promise.all([import('../js/core/firebase-active-record-authority-save-chain-v2-adapter.js'),import('../js/core/staging-v2-authority-save-cloud-runtime.js')]),binder=createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID});
  const reportingBinder=Object.freeze({scope:binder.scope,execute:async payload=>{try{return await binder.execute(payload)}catch(error){reportSaveBlocked(error);throw error}}});
  return createStagingV2AuthoritySaveAdminCloudRuntime({app,auth,appCheck,firestore,binder:reportingBinder,now:()=>Date.now()})
 })().catch(error=>{runtimePromise=null;throw error});
 return runtimePromise
}

exports.stagingV2AuthoritySave=onRequest({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,invoker:'public',cors:false,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:0,maxInstances:10},async(request,response)=>{try{const handler=await runtime();await handler.handle(request,response)}catch(error){reportRuntimeBlocked(error);response.set('cache-control','no-store').set('content-type','application/json; charset=utf-8').status(500).send(JSON.stringify({schema:'danbridge-staging-v2-authority-save-response-v1',state:'blocked',code:'RUNTIME_BLOCKED'}))}});

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
  const runtimeValue=await productionRuntime(),actor=await verifiedProductionLeaveActor(request,runtimeValue),firestore=runtimeValue.firestore,{normalizeTeacherLeaveRequest,buildTeacherLeaveRecord,teacherLeaveRequestFingerprint,teacherLeaveTypeLabel}=await import('../js/core/teacher-leave-policy.js'),normalized=normalizeTeacherLeaveRequest(request.data),fingerprint=teacherLeaveRequestFingerprint(request.data),leaveRef=firestore.doc(`productionTeacherLeaveRecords/${normalized.leaveId}`),receiptRef=firestore.doc(`productionTeacherLeaveOperationReceipts/${normalized.operationId}`),auditRef=firestore.doc(`companyAudit/teacher-leave-${normalized.operationId}`),accessSnapshot=await firestore.collection('companyAccess').get(),accessRows=accessSnapshot.docs.map(row=>({email:row.id.toLowerCase(),...(row.data()||{})})).filter(row=>row.active===true&&row.companyId==='danbridge'),actorAccess=accessRows.find(row=>row.email===actor.email),actorName=actor.kind==='owner'?'Daniel':actor.kind==='scheduler'?'AA':String(actorAccess?.teacherName||actorAccess?.displayName||actor.email),nowIso=new Date().toISOString();
  const result=await firestore.runTransaction(async transaction=>{
   const [currentSnapshot,receiptSnapshot]=await Promise.all([transaction.get(leaveRef),transaction.get(receiptRef)]),current=currentSnapshot.exists?currentSnapshot.data():null,receipt=receiptSnapshot.exists?receiptSnapshot.data():null;
   if(receipt){if(receipt.requestFingerprint!==fingerprint||receipt.leaveId!==normalized.leaveId)throw new Error('請假操作 receipt identity 衝突');return{duplicate:true,record:current,revision:receipt.revision}}
   const teacherId=normalized.action==='cancel'?String(current?.teacherId||''):String(normalized.input?.teacherId||''),teacherRef=firestore.doc(`productionFullRecordShadows/danbridge/collections/teachers/records/${teacherId}`),teacherSnapshot=await transaction.get(teacherRef),teacher=teacherSnapshot.exists?teacherSnapshot.data():null;
   if(!teacher||teacher.deleted===true||!teacher.data||String(teacher.data.id||teacherId)!==teacherId)throw new Error('找不到有效老師資料');
   const record=buildTeacherLeaveRecord({request:request.data,actor,current,teacherName:String(teacher.data.name||teacher.data.displayName||teacherId),nowIso}),audit={updatedAt:FieldValue.serverTimestamp(),updatedByUid:actor.uid,updatedByEmail:actor.email};
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

exports.productionTrustedOperation=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:0,maxInstances:20},async request=>{
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

exports.productionDailyMaintenance=onSchedule({schedule:'17 3 * * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,timeoutSeconds:300,memory:'512MiB',retryCount:3,maxRetrySeconds:3600},async()=>{
 const startedAt=Date.now(),runtimeValue=await productionRuntime(),firestore=runtimeValue.firestore,[{shouldDeleteProductionMaintenanceDocument,buildProductionMaintenanceReceipt,buildProductionHealthAssessment}]=await Promise.all([import('../js/core/production-maintenance-policy.js')]),[errorSnapshot,notificationSnapshot,recentErrorSnapshot,pendingRequestSnapshot,unreadNotificationSnapshot,protection]=await Promise.all([firestore.collection('companies/danbridge/errorEvents').where('occurredAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(2000).get(),firestore.collection('companies/danbridge/scheduleNotifications').where('createdAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(4000).get(),firestore.collection('companies/danbridge/errorEvents').where('occurredAt','>=',Timestamp.fromMillis(startedAt-86400000)).limit(500).get(),firestore.collection('companies/danbridge/scheduleRequests').where('status','==','pending').limit(500).get(),firestore.collection('companies/danbridge/scheduleNotifications').where('read','==',false).limit(1000).get(),productionDatabaseProtection()]),expiredErrors=errorSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('errorEvent',row.data(),startedAt)),expiredNotifications=notificationSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('scheduleNotification',row.data(),startedAt)),deleted={errorEvents:await deleteSnapshots(firestore,expiredErrors),scheduleNotifications:await deleteSnapshots(firestore,expiredNotifications)},finishedAt=Date.now(),runId=new Date(startedAt).toISOString().slice(0,10),receipt=buildProductionMaintenanceReceipt({runId,startedAt,finishedAt,deleted,scanned:{errorEvents:errorSnapshot.size,scheduleNotifications:notificationSnapshot.size}}),health=buildProductionHealthAssessment({runId,checkedAt:finishedAt,recentErrors:recentErrorSnapshot.size,pendingRequests:pendingRequestSnapshot.size,unreadNotifications:unreadNotificationSnapshot.size,...protection}),payload={...receipt,startedAt:Timestamp.fromMillis(startedAt),finishedAt:Timestamp.fromMillis(finishedAt),updatedAt:FieldValue.serverTimestamp()},healthPayload={...health,checkedAt:Timestamp.fromMillis(finishedAt),updatedAt:FieldValue.serverTimestamp()};
 await Promise.all([firestore.doc('companies/danbridge/systemHealth/maintenance').set(payload,{merge:false}),firestore.doc('companies/danbridge/systemHealth/ownerAlert').set(healthPayload,{merge:false}),firestore.doc(`companies/danbridge/maintenanceRuns/${runId}`).set(payload,{merge:false})]);
 console.info('PRODUCTION_DAILY_MAINTENANCE_VERIFIED',JSON.stringify({runId,deleted,scanned:receipt.scanned}));
});

exports.productionMonthlyPitrRehearsal=onSchedule({schedule:'23 4 1 * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,timeoutSeconds:300,memory:'512MiB',retryCount:2,maxRetrySeconds:3600},async()=>{
 const startedAt=Date.now(),protection=await productionDatabaseProtection();if(!protection.pitrEnabled||!protection.deleteProtectionEnabled||!protection.earliestVersionTime)throw new Error('production PITR 或刪除保護尚未通過實際讀回');
 const [{productionPitrRehearsalSnapshotTime,buildProductionPitrRehearsalReceipt}]=await Promise.all([import('../js/core/production-pitr-rehearsal-policy.js')]),snapshotTime=productionPitrRehearsalSnapshotTime(startedAt),controlPath='companies/danbridge/productionRecordRuntime/control',safetyPath='companies/danbridge/productionRecordRuntime/safety',[historicalControl,historicalSafety,currentControl,currentSafety]=await Promise.all([productionPitrReadDocument(controlPath,snapshotTime),productionPitrReadDocument(safetyPath,snapshotTime),productionPitrReadDocument(controlPath),productionPitrReadDocument(safetyPath)]),finishedAt=Date.now(),runId=new Date(startedAt).toISOString().slice(0,7),receipt=buildProductionPitrRehearsalReceipt({runId,startedAt,finishedAt,snapshotTime,earliestVersionTime:protection.earliestVersionTime,historicalControl,historicalSafety,currentControl,currentSafety}),payload={...receipt,startedAt:Timestamp.fromMillis(startedAt),finishedAt:Timestamp.fromMillis(finishedAt),snapshotTime:Timestamp.fromDate(new Date(snapshotTime)),earliestVersionTime:Timestamp.fromDate(new Date(protection.earliestVersionTime)),updatedAt:FieldValue.serverTimestamp()},firestore=(await productionRuntime()).firestore;
 await Promise.all([firestore.doc('companies/danbridge/systemHealth/restoreRehearsal').set(payload,{merge:false}),firestore.doc(`companies/danbridge/restoreRehearsals/${runId}`).set(payload,{merge:false})]);
 console.info('PRODUCTION_PITR_REHEARSAL_VERIFIED',JSON.stringify({runId,snapshotTime,formalDataWrites:0}));
});
