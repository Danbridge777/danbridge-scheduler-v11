import test from 'node:test';
import assert from 'node:assert/strict';
import {
 STAGING_V2_CLOUD_RUNTIME_BLOCKER,
 STAGING_V2_CLOUD_RUNTIME_REGION,
 STAGING_V2_CLOUD_RUNTIME_SERVICE,
 STAGING_V2_CLOUD_RUNTIME_TARGET,
 attestStagingV2CloudRuntime,
 createStagingV2CloudRuntimeBoundary
} from '../js/core/firebase-staging-v2-cloud-runtime-boundary.js';
import {STAGING_V2_PROJECT_ID,STAGING_V2_SERVICE_ACCOUNT_EMAIL} from '../js/core/firebase-staging-v2-service-account-boundary.js';

const env=()=>({GOOGLE_CLOUD_PROJECT:STAGING_V2_PROJECT_ID,FUNCTION_TARGET:STAGING_V2_CLOUD_RUNTIME_TARGET,FUNCTION_REGION:STAGING_V2_CLOUD_RUNTIME_REGION,K_SERVICE:STAGING_V2_CLOUD_RUNTIME_SERVICE,K_REVISION:STAGING_V2_CLOUD_RUNTIME_SERVICE+'-00001-safe'});
const authFactory=({email=STAGING_V2_SERVICE_ACCOUNT_EMAIL,token='x'.repeat(40),privateKey}={})=>()=>({getCredentials:async()=>({client_email:email,...(privateKey?{private_key:privateKey}:{})}),getClient:async()=>({getAccessToken:async()=>token})});

test('Gen2 runtime只接受固定 staging service/region/target 與 keyless metadata ADC',async()=>{const result=await attestStagingV2CloudRuntime({expectedProjectId:STAGING_V2_PROJECT_ID,env:env(),authFactory:authFactory()});assert.equal(result.serviceAccountEmail,STAGING_V2_SERVICE_ACCOUNT_EMAIL);assert.equal(result.credentialType,'metadata-adc');assert.equal(result.userManagedKeyUsed,false);assert.match(STAGING_V2_CLOUD_RUNTIME_BLOCKER,/keyless-adc/)});
test('錯 project/service/region、emulator、credential file、private key 或帳號全部拒絕',async()=>{for(const change of [{GOOGLE_CLOUD_PROJECT:'production-project'},{K_SERVICE:'other-service'},{FUNCTION_REGION:'us-central1'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{GOOGLE_APPLICATION_CREDENTIALS:'/tmp/key.json'},{GITHUB_ACTIONS:'true'}])await assert.rejects(()=>attestStagingV2CloudRuntime({expectedProjectId:STAGING_V2_PROJECT_ID,env:{...env(),...change},authFactory:authFactory()}),/keyless-adc/);await assert.rejects(()=>attestStagingV2CloudRuntime({expectedProjectId:STAGING_V2_PROJECT_ID,env:env(),authFactory:authFactory({email:'wrong@example.com'})}),/keyless-adc/);await assert.rejects(()=>attestStagingV2CloudRuntime({expectedProjectId:STAGING_V2_PROJECT_ID,env:env(),authFactory:authFactory({privateKey:'secret'})}),/keyless-adc/)});
test('boundary建立後環境變動會 fail closed 且不呼叫 ADC',async()=>{const runtimeEnv=env();let calls=0;const boundary=createStagingV2CloudRuntimeBoundary(STAGING_V2_PROJECT_ID,{env:runtimeEnv,authFactory:()=>{calls++;return authFactory()()}});runtimeEnv.K_REVISION=STAGING_V2_CLOUD_RUNTIME_SERVICE+'-00002-changed';await assert.rejects(()=>boundary.attest(),/keyless-adc/);assert.equal(calls,0)});
