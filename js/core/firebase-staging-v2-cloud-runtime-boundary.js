import {GoogleAuth} from 'google-auth-library';
import {STAGING_V2_PROJECT_ID,STAGING_V2_SERVICE_ACCOUNT_EMAIL} from './firebase-staging-v2-service-account-boundary.js';

export const STAGING_V2_CLOUD_RUNTIME_SERVICE='stagingv2authoritysave';
export const STAGING_V2_CLOUD_RUNTIME_TARGET='stagingV2AuthoritySave';
export const STAGING_V2_CLOUD_RUNTIME_REGION='asia-east1';
export const STAGING_V2_CLOUD_RUNTIME_BLOCKER='exact-staging-gen2-runtime-service-account-and-keyless-adc-required';

const keys=['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FUNCTION_TARGET','FUNCTION_REGION','K_SERVICE','K_REVISION','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GOOGLE_APPLICATION_CREDENTIALS','GITHUB_ACTIONS'];
function blocked(){throw new Error(STAGING_V2_CLOUD_RUNTIME_BLOCKER)}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}

export async function attestStagingV2CloudRuntime({
 expectedProjectId,
 env=process.env,
 authFactory=()=>new GoogleAuth({projectId:STAGING_V2_PROJECT_ID,scopes:['https://www.googleapis.com/auth/cloud-platform']}),
}={}){
 if(expectedProjectId!==STAGING_V2_PROJECT_ID||env.GOOGLE_CLOUD_PROJECT!==STAGING_V2_PROJECT_ID||(env.GCLOUD_PROJECT!==undefined&&env.GCLOUD_PROJECT!==STAGING_V2_PROJECT_ID)||env.FUNCTION_TARGET!==STAGING_V2_CLOUD_RUNTIME_TARGET||env.FUNCTION_REGION!==STAGING_V2_CLOUD_RUNTIME_REGION||env.K_SERVICE!==STAGING_V2_CLOUD_RUNTIME_SERVICE||typeof env.K_REVISION!=='string'||!env.K_REVISION.startsWith(STAGING_V2_CLOUD_RUNTIME_SERVICE+'-')||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS||env.GITHUB_ACTIONS)blocked();
 let auth,credentials,client,token;try{auth=authFactory();credentials=await auth.getCredentials();client=await auth.getClient();token=await client.getAccessToken()}catch{blocked()}
 const accessToken=typeof token==='string'?token:token?.token;
 if(!plain(credentials)||credentials.client_email!==STAGING_V2_SERVICE_ACCOUNT_EMAIL||credentials.private_key!==undefined||typeof accessToken!=='string'||accessToken.length<32)blocked();
 return Object.freeze({projectId:STAGING_V2_PROJECT_ID,serviceAccountEmail:STAGING_V2_SERVICE_ACCOUNT_EMAIL,service:STAGING_V2_CLOUD_RUNTIME_SERVICE,region:STAGING_V2_CLOUD_RUNTIME_REGION,credentialType:'metadata-adc',shortLivedAccessTokenConfirmed:true,userManagedKeyUsed:false})
}

export function createStagingV2CloudRuntimeBoundary(expectedProjectId,{env=process.env,authFactory}={}){
 if(expectedProjectId!==STAGING_V2_PROJECT_ID)blocked();
 const snapshot=Object.freeze(Object.fromEntries(keys.map(key=>[key,env[key]]))),unchanged=()=>keys.every(key=>env[key]===snapshot[key]);let attestation=null;
 return Object.freeze({mode:'staging-gen2-runtime',async attest(){if(!unchanged())blocked();if(attestation===null)attestation=attestStagingV2CloudRuntime({expectedProjectId,env,...(authFactory?{authFactory}:{})}).catch(error=>{attestation=null;throw error});return attestation}})
}
