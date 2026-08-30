import {readFileSync,realpathSync,statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {GoogleAuth} from 'google-auth-library';

export const STAGING_V2_PROJECT_ID='danbridge-d8877-staging';
export const STAGING_V2_PROJECT_NUMBER='883029466360';
export const STAGING_V2_SERVICE_ACCOUNT_EMAIL='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
export const STAGING_V2_GITHUB_REPOSITORY='Danbridge777/danbridge-scheduler-v11';
export const STAGING_V2_ADMIN_ACTOR=Object.freeze({uid:'service-account:danbridge-staging-v2',email:STAGING_V2_SERVICE_ACCOUNT_EMAIL});
export const STAGING_V2_SERVICE_ACCOUNT_BLOCKER='staging-service-account-email-project-wif-and-iam-allowlist-blocked';

const providerPrefix=`//iam.googleapis.com/projects/${STAGING_V2_PROJECT_NUMBER}/locations/global/workloadIdentityPools/danbridge-github-staging/providers/`;
const impersonationUrl=`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${STAGING_V2_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`;
const tokenUrl='https://sts.googleapis.com/v1/token';
const subjectType='urn:ietf:params:oauth:token-type:jwt';
const allowedProjectEnv=Object.freeze(['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','CLOUDSDK_CORE_PROJECT']);

function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function blocked(){throw new Error(STAGING_V2_SERVICE_ACCOUNT_BLOCKER)}
function safeFile(path,read,realpath,stat){
 if(typeof path!=='string'||!isAbsolute(path))blocked();
 let resolved,info,raw;
 try{resolved=realpath(path);info=stat(resolved);raw=read(resolved,'utf8')}catch{blocked()}
 if(resolved!==path||!info.isFile()||info.isSymbolicLink?.()||info.size<2||info.size>65536||(info.mode&0o077)!==0)blocked();
 let value;try{value=JSON.parse(raw)}catch{blocked()}
 if(!plain(value))blocked();
 return value;
}
function exactCredential(value){
 if(value.type!=='external_account'||typeof value.audience!=='string'||!value.audience.startsWith(providerPrefix)||value.audience.length<=providerPrefix.length||value.subject_token_type!==subjectType||value.token_url!==tokenUrl||value.service_account_impersonation_url!==impersonationUrl||!plain(value.credential_source))blocked();
 for(const forbidden of ['private_key','private_key_id','client_secret','refresh_token','client_email'])if(Object.prototype.hasOwnProperty.call(value,forbidden))blocked();
 const source=value.credential_source;
 if(typeof source.url!=='string'||!source.url.startsWith('https://')||!plain(source.headers)||typeof source.headers.Authorization!=='string'||!source.headers.Authorization.startsWith('Bearer ')||source.headers.Authorization.length<=7||!plain(source.format)||source.format.type!=='json'||source.format.subject_token_field_name!=='value')blocked();
 return value;
}

export async function attestStagingV2ServiceAccount({
 expectedProjectId,
 env=process.env,
 readFile=readFileSync,
 realpath=realpathSync,
 stat=statSync,
 authFactory=()=>new GoogleAuth({projectId:STAGING_V2_PROJECT_ID,scopes:['https://www.googleapis.com/auth/cloud-platform']}),
}={}){
 if(expectedProjectId!==STAGING_V2_PROJECT_ID||env.FIRESTORE_EMULATOR_HOST||env.FIREBASE_AUTH_EMULATOR_HOST||env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==STAGING_V2_GITHUB_REPOSITORY||typeof env.ACTIONS_ID_TOKEN_REQUEST_URL!=='string'||!env.ACTIONS_ID_TOKEN_REQUEST_URL.startsWith('https://')||typeof env.ACTIONS_ID_TOKEN_REQUEST_TOKEN!=='string'||env.ACTIONS_ID_TOKEN_REQUEST_TOKEN.length<16)blocked();
 for(const key of allowedProjectEnv)if(env[key]!==undefined&&env[key]!==STAGING_V2_PROJECT_ID)blocked();
 exactCredential(safeFile(env.GOOGLE_APPLICATION_CREDENTIALS,readFile,realpath,stat));
 let auth,credentials,client,token;
 try{auth=authFactory();credentials=await auth.getCredentials();client=await auth.getClient();token=await client.getAccessToken()}catch{blocked()}
 const accessToken=typeof token==='string'?token:token?.token;
 if(!plain(credentials)||credentials.client_email!==STAGING_V2_SERVICE_ACCOUNT_EMAIL||credentials.private_key!==undefined||typeof accessToken!=='string'||accessToken.length<32)blocked();
 return Object.freeze({projectId:STAGING_V2_PROJECT_ID,serviceAccountEmail:STAGING_V2_SERVICE_ACCOUNT_EMAIL,repository:STAGING_V2_GITHUB_REPOSITORY,credentialType:'external_account',shortLivedAccessTokenConfirmed:true,userManagedKeyUsed:false});
}

export function createStagingV2AdminBoundary(expectedProjectId,{env=process.env}={}){
 const emulator=expectedProjectId==='danbridge-rules-test'&&typeof env.FIRESTORE_EMULATOR_HOST==='string'&&env.FIRESTORE_EMULATOR_HOST.length>0;
 const staging=expectedProjectId===STAGING_V2_PROJECT_ID&&!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST;
 if(!emulator&&!staging)blocked();
 const keys=['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GITHUB_ACTIONS','GITHUB_REPOSITORY','ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN','GOOGLE_APPLICATION_CREDENTIALS',...allowedProjectEnv];
 const snapshot=Object.freeze(Object.fromEntries(keys.map(key=>[key,env[key]])));
 const unchanged=()=>keys.every(key=>env[key]===snapshot[key]);
 let attestation=null;
 return Object.freeze({
  mode:emulator?'emulator':'staging-service-account',
  async attest(){
   if(!unchanged())blocked();
   if(emulator)return Object.freeze({projectId:expectedProjectId,serviceAccountEmail:'emulator',credentialType:'emulator',shortLivedAccessTokenConfirmed:false,userManagedKeyUsed:false});
   if(attestation===null)attestation=attestStagingV2ServiceAccount({expectedProjectId,env}).catch(error=>{attestation=null;throw error});
   return attestation;
  },
 });
}
