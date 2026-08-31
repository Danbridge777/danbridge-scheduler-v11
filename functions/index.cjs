'use strict';

const {onRequest}=require('firebase-functions/v2/https');
const {applicationDefault,getApps,initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getAppCheck}=require('firebase-admin/app-check');
const {getFirestore}=require('firebase-admin/firestore');

const PROJECT_ID='danbridge-d8877-staging';
const SERVICE_ACCOUNT='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
let runtimePromise=null;

function reportRuntimeBlocked(error){
 const name=error instanceof Error&&typeof error.name==='string'?error.name:'UnknownError';
 const message=error instanceof Error&&typeof error.message==='string'?error.message:'unknown runtime initialization error';
 console.error('STAGING_V2_RUNTIME_BLOCKED',JSON.stringify({name,message}));
}

async function runtime(){
 if(runtimePromise===null)runtimePromise=(async()=>{
  const app=getApps()[0]??initializeApp({projectId:PROJECT_ID,credential:applicationDefault()}),auth=getAuth(app),appCheck=getAppCheck(app),firestore=getFirestore(app),[{createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder},{createStagingV2AuthoritySaveAdminCloudRuntime}]=await Promise.all([import('../js/core/firebase-active-record-authority-save-chain-v2-adapter.js'),import('../js/core/staging-v2-authority-save-cloud-runtime.js')]),binder=createFirebaseActiveRecordAuthoritySaveChainV2CloudRuntimeBinder({app,firestore,expectedProjectId:PROJECT_ID});
  return createStagingV2AuthoritySaveAdminCloudRuntime({app,auth,appCheck,firestore,binder,now:()=>Date.now()})
 })().catch(error=>{runtimePromise=null;throw error});
 return runtimePromise
}

exports.stagingV2AuthoritySave=onRequest({region:'asia-east1',serviceAccount:SERVICE_ACCOUNT,invoker:'public',cors:false,timeoutSeconds:60,memory:'512MiB',concurrency:8,minInstances:0,maxInstances:10},async(request,response)=>{try{const handler=await runtime();await handler.handle(request,response)}catch(error){reportRuntimeBlocked(error);response.set('cache-control','no-store').set('content-type','application/json; charset=utf-8').status(500).send(JSON.stringify({schema:'danbridge-staging-v2-authority-save-response-v1',state:'blocked',code:'RUNTIME_BLOCKED'}))}});
