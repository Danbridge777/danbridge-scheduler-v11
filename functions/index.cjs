'use strict';

const {onRequest,onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {applicationDefault,getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getAppCheck}=require('firebase-admin/app-check');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');

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
  const app=getApps().find(row=>row.name==='production-trusted')??initializeApp({projectId:PRODUCTION_PROJECT_ID,credential:applicationDefault()},'production-trusted'),firestore=getFirestore(app),[{createFirebaseProductionRecordOperationAdapter},{assertProductionTrustedCaller,assertProductionTrustedOperation,buildProductionTrustedResponse}]=await Promise.all([import('../js/core/firebase-production-record-runtime-adapter.js'),import('../js/core/production-trusted-operation-contract.js')]);
  const reference=path=>firestore.doc(path),runTransaction=callback=>firestore.runTransaction(native=>callback({get:path=>native.get(reference(path)),set:(path,value)=>native.set(reference(path),value,{merge:false})}));
  return Object.freeze({app,firestore,assertProductionTrustedCaller,assertProductionTrustedOperation,buildProductionTrustedResponse,adapterFor:actor=>createFirebaseProductionRecordOperationAdapter({runTransaction,serverTimestamp:()=>FieldValue.serverTimestamp(),actor,role:'owner'})});
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

exports.productionTrustedOperation=onCall({region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,enforceAppCheck:true,consumeAppCheckToken:true,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:0,maxInstances:20},async request=>{
 try{
  const runtimeValue=await productionRuntime(),caller=await verifiedProductionOwner(request,runtimeValue),trusted=runtimeValue.assertProductionTrustedOperation(request.data);
  if(trusted.actor.uid!==caller.uid||trusted.actor.email!==caller.email)throw new HttpsError('permission-denied','操作身分不一致。');
  const result=await runtimeValue.adapterFor({uid:caller.uid,email:caller.email}).apply(trusted.operation);
  return runtimeValue.buildProductionTrustedResponse({requestId:trusted.requestId,result});
 }catch(error){if(error instanceof HttpsError)throw error;console.error('PRODUCTION_TRUSTED_OPERATION_BLOCKED',JSON.stringify({name:String(error?.name||'Error'),message:String(error?.message||'blocked')}));throw new HttpsError('failed-precondition','正式寫入已安全阻止。')}
});

async function deleteSnapshots(firestore,snapshots){let deleted=0;for(let offset=0;offset<snapshots.length;offset+=400){const batch=firestore.batch(),rows=snapshots.slice(offset,offset+400);rows.forEach(snapshot=>batch.delete(snapshot.ref));await batch.commit();deleted+=rows.length}return deleted}

exports.productionDailyMaintenance=onSchedule({schedule:'17 3 * * *',timeZone:'Asia/Taipei',region:'asia-east1',serviceAccount:PRODUCTION_SERVICE_ACCOUNT,timeoutSeconds:300,memory:'512MiB',retryCount:3,maxRetrySeconds:3600},async()=>{
 const startedAt=Date.now(),runtimeValue=await productionRuntime(),firestore=runtimeValue.firestore,[{shouldDeleteProductionMaintenanceDocument,buildProductionMaintenanceReceipt}]=await Promise.all([import('../js/core/production-maintenance-policy.js')]),errorSnapshot=await firestore.collection('companies/danbridge/errorEvents').where('occurredAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(2000).get(),notificationSnapshot=await firestore.collection('companies/danbridge/scheduleNotifications').where('createdAt','<',Timestamp.fromMillis(startedAt-30*86400000)).limit(4000).get(),expiredErrors=errorSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('errorEvent',row.data(),startedAt)),expiredNotifications=notificationSnapshot.docs.filter(row=>shouldDeleteProductionMaintenanceDocument('scheduleNotification',row.data(),startedAt)),deleted={errorEvents:await deleteSnapshots(firestore,expiredErrors),scheduleNotifications:await deleteSnapshots(firestore,expiredNotifications)},finishedAt=Date.now(),runId=new Date(startedAt).toISOString().slice(0,10),receipt=buildProductionMaintenanceReceipt({runId,startedAt,finishedAt,deleted,scanned:{errorEvents:errorSnapshot.size,scheduleNotifications:notificationSnapshot.size}}),payload={...receipt,startedAt:Timestamp.fromMillis(startedAt),finishedAt:Timestamp.fromMillis(finishedAt),updatedAt:FieldValue.serverTimestamp()};
 await Promise.all([firestore.doc('companies/danbridge/systemHealth/maintenance').set(payload,{merge:false}),firestore.doc(`companies/danbridge/maintenanceRuns/${runId}`).set(payload,{merge:false})]);
 console.info('PRODUCTION_DAILY_MAINTENANCE_VERIFIED',JSON.stringify({runId,deleted,scanned:receipt.scanned}));
});
