import {Buffer} from 'node:buffer';
import {getAuth as getAdminAuth} from 'firebase-admin/auth';
import {getAppCheck as getAdminAppCheck} from 'firebase-admin/app-check';
import {getFirestore as getAdminFirestore} from 'firebase-admin/firestore';
import {ACTIVE_RECORD_AUTHORITY_CHAIN_V2_CLOUD_BINDER_SCOPE} from './firebase-active-record-authority-save-chain-v2-adapter.js';
import {
 STAGING_V2_AUTHORITY_SAVE_APP_ID,
 STAGING_V2_AUTHORITY_SAVE_ORIGINS,
 STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,
 createStagingV2AuthoritySaveHttpGateway
} from './staging-v2-authority-save-http-gateway.js';

export const STAGING_V2_AUTHORITY_SAVE_CLOUD_RUNTIME_SCOPE='gen2-https-raw-body-id-token-app-check-replay-owner-fixed-hn-binder';
export const STAGING_V2_PRIMARY_OWNER_EMAIL='a0965487920@gmail.com';
const configFields=['verifyIdToken','verifyAppCheckToken','readCompanyAccess','executeAuthoritySave','now'];
const completionFields=['state','transactionState','projectId','activationEpoch','resultHeadHash','commitHash','saveId','operationCount','persistedAt','writeCount'];
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=descriptor.value}return out}
function completion(value){if(!plain(value))throw new Error('cloud runtime completion invalid');const out={};for(const key of completionFields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('cloud runtime completion field invalid');out[key]=descriptor.value}return out}
function headerSnapshot(raw){if(!plain(raw))throw new Error('cloud runtime headers invalid');const out={};for(const key of Reflect.ownKeys(raw)){if(typeof key!=='string')throw new Error('cloud runtime header key invalid');const descriptor=Object.getOwnPropertyDescriptor(raw,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||typeof descriptor.value!=='string')throw new Error('cloud runtime header value invalid');out[key]=descriptor.value}return out}
function apply(response,value){for(const [key,header] of Object.entries(value.headers))response.set(key,header);response.status(value.status).send(value.body)}

export function createStagingV2AuthoritySaveCloudRuntime(rawConfig){
 const cfg=exact(rawConfig,configFields,'cloud runtime config');if(!configFields.every(key=>typeof cfg[key]==='function'))throw new Error('cloud runtime config invalid');
 const gateway=createStagingV2AuthoritySaveHttpGateway({expectedProjectId:STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,expectedAppId:STAGING_V2_AUTHORITY_SAVE_APP_ID,allowedOrigins:[...STAGING_V2_AUTHORITY_SAVE_ORIGINS],verifyIdToken:cfg.verifyIdToken,verifyAppCheckToken:cfg.verifyAppCheckToken,authorizeOwner:async({email})=>{if(email===STAGING_V2_PRIMARY_OWNER_EMAIL)return true;let access;try{access=await cfg.readCompanyAccess(email)}catch{return false}return plain(access)&&access.active===true&&access.companyId==='danbridge'&&access.role==='owner'},executeAuthoritySave:async payload=>completion(await cfg.executeAuthoritySave(payload)),now:cfg.now});
 return Object.freeze({scope:STAGING_V2_AUTHORITY_SAVE_CLOUD_RUNTIME_SCOPE,async handle(request,response){let result;try{if(!request||typeof request.method!=='string'||!Buffer.isBuffer(request.rawBody))throw new Error('cloud runtime raw request invalid');result=await gateway.handle({method:request.method,headers:headerSnapshot(request.headers),rawBody:request.rawBody.toString('utf8')})}catch{result=Object.freeze({status:400,headers:Object.freeze({'cache-control':'no-store','content-type':'application/json; charset=utf-8'}),body:JSON.stringify({schema:'danbridge-staging-v2-authority-save-response-v1',state:'blocked',code:'INVALID_REQUEST'})})}apply(response,result)}})
}

export function createStagingV2AuthoritySaveAdminCloudRuntime(raw){
 const row=exact(raw,['app','auth','appCheck','firestore','binder','now'],'Admin cloud runtime config'),projectId=row.app?.options?.projectId;
 let auth,appCheck,firestore;try{auth=getAdminAuth(row.app);appCheck=getAdminAppCheck(row.app);firestore=getAdminFirestore(row.app)}catch{throw new Error('Admin cloud runtime Firebase identity invalid')}
 if(projectId!==STAGING_V2_AUTHORITY_SAVE_PROJECT_ID||auth!==row.auth||appCheck!==row.appCheck||firestore!==row.firestore||row.binder?.scope!==ACTIVE_RECORD_AUTHORITY_CHAIN_V2_CLOUD_BINDER_SCOPE||typeof row.binder.execute!=='function'||typeof row.now!=='function')throw new Error('Admin cloud runtime Firebase identity invalid');
 return createStagingV2AuthoritySaveCloudRuntime({verifyIdToken:(token,revoked)=>row.auth.verifyIdToken(token,revoked),verifyAppCheckToken:(token,options)=>row.appCheck.verifyToken(token,options),readCompanyAccess:async email=>{const snapshot=await row.firestore.doc(`companyAccess/${email}`).get();return snapshot.exists?snapshot.data():null},executeAuthoritySave:payload=>row.binder.execute(payload),now:row.now})
}
