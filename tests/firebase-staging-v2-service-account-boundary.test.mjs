import test from 'node:test';
import assert from 'node:assert/strict';
import {
 STAGING_V2_ADMIN_ACTOR,
 STAGING_V2_PROJECT_ID,
 STAGING_V2_SERVICE_ACCOUNT_BLOCKER,
 STAGING_V2_SERVICE_ACCOUNT_EMAIL,
 attestStagingV2ServiceAccount,
 createStagingV2AdminBoundary,
} from '../js/core/firebase-staging-v2-service-account-boundary.js';

const credentialPath='/tmp/danbridge-wif.json';
const credential=()=>({
 type:'external_account',
 audience:'//iam.googleapis.com/projects/883029466360/locations/global/workloadIdentityPools/danbridge-github-staging/providers/github',
 subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
 token_url:'https://sts.googleapis.com/v1/token',
 service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${STAGING_V2_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
 credential_source:{url:'https://pipelines.actions.githubusercontent.com/idtoken',headers:{Authorization:'Bearer github-oidc-request-token'},format:{type:'json',subject_token_field_name:'value'}},
});
const env=()=>({
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'Danbridge777/danbridge-scheduler-v11',
 ACTIONS_ID_TOKEN_REQUEST_URL:'https://pipelines.actions.githubusercontent.com/idtoken',
 ACTIONS_ID_TOKEN_REQUEST_TOKEN:'github-oidc-request-token',GOOGLE_APPLICATION_CREDENTIALS:credentialPath,
 GOOGLE_CLOUD_PROJECT:STAGING_V2_PROJECT_ID,
});
const deps=(overrides={})=>({
 expectedProjectId:STAGING_V2_PROJECT_ID,env:env(),
 readFile:()=>JSON.stringify(credential()),realpath:path=>path,
 stat:()=>({isFile:()=>true,isSymbolicLink:()=>false,size:1024,mode:0o100600}),
 authFactory:()=>({getCredentials:async()=>({client_email:STAGING_V2_SERVICE_ACCOUNT_EMAIL}),getClient:async()=>({getAccessToken:async()=>({token:'a'.repeat(64)})})}),
 ...overrides,
});

test('固定 staging project、GitHub repo、WIF impersonation 與短效 service-account token 全部精確才通過',async()=>{
 const result=await attestStagingV2ServiceAccount(deps());
 assert.deepEqual(result,{projectId:STAGING_V2_PROJECT_ID,serviceAccountEmail:STAGING_V2_SERVICE_ACCOUNT_EMAIL,repository:'Danbridge777/danbridge-scheduler-v11',credentialType:'external_account',shortLivedAccessTokenConfirmed:true,userManagedKeyUsed:false});
 assert.equal(STAGING_V2_ADMIN_ACTOR.email,STAGING_V2_SERVICE_ACCOUNT_EMAIL);
});

test('錯 project、repo、service account、key credential、emulator 或無短效 token 一律在 I/O 前 fail closed',async()=>{
 const cases=[
  {expectedProjectId:'danbridge-d8877'},
  {env:{...env(),GITHUB_REPOSITORY:'other/repo'}},
  {env:{...env(),FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}},
  {readFile:()=>JSON.stringify({...credential(),private_key:'forbidden'})},
  {authFactory:()=>({getCredentials:async()=>({client_email:'other@example.com'}),getClient:async()=>({getAccessToken:async()=>({token:'a'.repeat(64)})})})},
  {authFactory:()=>({getCredentials:async()=>({client_email:STAGING_V2_SERVICE_ACCOUNT_EMAIL}),getClient:async()=>({getAccessToken:async()=>({token:''})})})},
 ];
 for(const changed of cases)await assert.rejects(()=>attestStagingV2ServiceAccount(deps(changed)),new RegExp(STAGING_V2_SERVICE_ACCOUNT_BLOCKER));
});

test('boundary 只允許 dual-emulator 測試或無 emulator 的精確 staging；結果快取但失敗不快取',async()=>{
 const emulator=createStagingV2AdminBoundary('danbridge-rules-test',{env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}});
 assert.equal(emulator.mode,'emulator');assert.equal((await emulator.attest()).credentialType,'emulator');
 assert.throws(()=>createStagingV2AdminBoundary('danbridge-d8877',{env:{}}),new RegExp(STAGING_V2_SERVICE_ACCOUNT_BLOCKER));
});
