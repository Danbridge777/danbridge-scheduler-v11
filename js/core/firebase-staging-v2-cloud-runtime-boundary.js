import {GoogleAuth} from 'google-auth-library';
import {STAGING_V2_PROJECT_ID,STAGING_V2_SERVICE_ACCOUNT_EMAIL} from './firebase-staging-v2-service-account-boundary.js';

export const STAGING_V2_CLOUD_RUNTIME_SERVICE='stagingv2authoritysave';
export const STAGING_V2_CLOUD_RUNTIME_TARGET='stagingV2AuthoritySave';
export const STAGING_V2_CLOUD_RUNTIME_REGION='asia-east1';
export const STAGING_V2_CLOUD_RUNTIME_BLOCKER='exact-staging-gen2-runtime-service-account-and-keyless-adc-required';

const keys=['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FUNCTION_TARGET','FUNCTION_REGION','K_SERVICE','K_REVISION','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_APPLICATION_CREDENTIALS','GITHUB_ACTIONS'];
function blocked(reason='unspecified'){throw new Error(`${STAGING_V2_CLOUD_RUNTIME_BLOCKER}:${reason}`)}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}

export async function attestStagingV2CloudRuntime({
 expectedProjectId,
 env=process.env,
 authFactory=()=>new GoogleAuth({projectId:STAGING_V2_PROJECT_ID,scopes:['https://www.googleapis.com/auth/cloud-platform']}),
}={}){
 if(expectedProjectId!==STAGING_V2_PROJECT_ID)blocked('expected-project');
 if(env.GOOGLE_CLOUD_PROJECT===undefined&&env.GCLOUD_PROJECT===undefined)blocked('project-missing');
 if(env.GOOGLE_CLOUD_PROJECT!==undefined&&env.GOOGLE_CLOUD_PROJECT!==STAGING_V2_PROJECT_ID)blocked('google-cloud-project');
 if(env.GCLOUD_PROJECT!==undefined&&env.GCLOUD_PROJECT!==STAGING_V2_PROJECT_ID)blocked('gcloud-project');
 if(env.FUNCTION_TARGET!==STAGING_V2_CLOUD_RUNTIME_TARGET)blocked('function-target');
 if(env.FUNCTION_REGION!==STAGING_V2_CLOUD_RUNTIME_REGION)blocked('function-region');
 if(env.K_SERVICE!==STAGING_V2_CLOUD_RUNTIME_SERVICE)blocked('service');
 if(typeof env.K_REVISION!=='string'||!env.K_REVISION.startsWith(STAGING_V2_CLOUD_RUNTIME_SERVICE+'-'))blocked('revision');
 if(env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST)blocked('emulator');
 if(env.GOOGLE_APPLICATION_CREDENTIALS)blocked('credential-file');
 if(env.GITHUB_ACTIONS)blocked('github-actions');
 let auth,credentials,client,token;try{auth=authFactory()}catch{blocked('auth-factory')}
 try{credentials=await auth.getCredentials()}catch{blocked('credentials')}
 try{client=await auth.getClient()}catch{blocked('client')}
 try{token=await client.getAccessToken()}catch{blocked('access-token')}
 const accessToken=typeof token==='string'?token:token?.token;
 if(!plain(credentials))blocked('credential-shape');
 if(credentials.client_email!==STAGING_V2_SERVICE_ACCOUNT_EMAIL)blocked('service-account');
 if(credentials.private_key!==undefined)blocked('private-key');
 if(typeof accessToken!=='string'||accessToken.length<32)blocked('access-token-shape');
 return Object.freeze({projectId:STAGING_V2_PROJECT_ID,serviceAccountEmail:STAGING_V2_SERVICE_ACCOUNT_EMAIL,service:STAGING_V2_CLOUD_RUNTIME_SERVICE,region:STAGING_V2_CLOUD_RUNTIME_REGION,credentialType:'metadata-adc',shortLivedAccessTokenConfirmed:true,userManagedKeyUsed:false})
}

export function createStagingV2CloudRuntimeBoundary(expectedProjectId,{env=process.env,authFactory}={}){
 if(expectedProjectId!==STAGING_V2_PROJECT_ID)blocked('expected-project');
 const snapshot=Object.freeze(Object.fromEntries(keys.map(key=>[key,env[key]]))),unchanged=()=>keys.every(key=>env[key]===snapshot[key]);let attestation=null;
 return Object.freeze({mode:'staging-gen2-runtime',async attest(){if(!unchanged())blocked('environment-drift');if(attestation===null)attestation=attestStagingV2CloudRuntime({expectedProjectId,env,...(authFactory?{authFactory}:{})}).catch(error=>{attestation=null;throw error});return attestation}})
}
