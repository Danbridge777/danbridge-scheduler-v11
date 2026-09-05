import {STAGING_V2_AUTHORITY_SAVE_APP_ID,STAGING_V2_AUTHORITY_SAVE_ORIGINS,STAGING_V2_AUTHORITY_SAVE_PROJECT_ID,STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA,STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA} from './staging-v2-authority-save-http-gateway.js';

export const STAGING_V2_AUTHORITY_SAVE_PATH='/api/staging-v2/authority-save';
const configFields=['projectId','appId','origin','getCurrentUser','getIdToken','getLimitedUseAppCheckToken','fetch','timeoutMs'];
const payloadFields=['save','changedKeys','baselineRecords','localRecords'];
const responseFields=['schema','state','transactionState','projectId','activationEpoch','resultHeadHash','commitHash','saveId','operationCount','persistedAt','writeCount'];
const encoder=new TextEncoder();
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=descriptor.value}return out}
function actor(value){return typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value)}
function email(value){return typeof value==='string'&&value===value.trim()&&value===value.toLowerCase()&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function config(raw){const row=exact(raw,configFields,'authority browser client config');if(row.projectId!==STAGING_V2_AUTHORITY_SAVE_PROJECT_ID||row.appId!==STAGING_V2_AUTHORITY_SAVE_APP_ID||!STAGING_V2_AUTHORITY_SAVE_ORIGINS.includes(row.origin)||![row.getCurrentUser,row.getIdToken,row.getLimitedUseAppCheckToken,row.fetch].every(value=>typeof value==='function')||!Number.isSafeInteger(row.timeoutMs)||row.timeoutMs<1000||row.timeoutMs>30000)throw new Error('authority browser client config invalid');return Object.freeze(row)}
function currentIdentity(cfg){const user=cfg.getCurrentUser(),uid=user?.uid,emailValue=String(user?.email??'').trim().toLowerCase();if(!actor(uid)||!email(emailValue)||user.emailVerified!==true)throw new Error('staging V2 requires a verified signed-in user');return{user,uid,email:emailValue}}
function assertResponse(raw,requestId){const row=exact(raw,responseFields,'authority browser response');if(row.schema!==STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA||row.state!=='complete-confirmed'||!['created','replayed'].includes(row.transactionState)||row.projectId!==STAGING_V2_AUTHORITY_SAVE_PROJECT_ID||!actor(row.activationEpoch)||!digest(row.resultHeadHash)||!digest(row.commitHash)||row.saveId!==requestId||!Number.isSafeInteger(row.operationCount)||row.operationCount<1||row.operationCount>120||typeof row.persistedAt!=='string'||!Number.isSafeInteger(row.writeCount)||row.writeCount<0)throw new Error('authority browser response invalid');return Object.freeze(row)}

export function createStagingV2AuthoritySaveBrowserClient(rawConfig){
 const cfg=config(rawConfig),endpoint=cfg.origin+STAGING_V2_AUTHORITY_SAVE_PATH;
 return Object.freeze({
  endpoint,
  async save(rawPayload){
   const payload=exact(rawPayload,payloadFields,'authority browser payload'),identity=currentIdentity(cfg),save=plain(payload.save)?payload.save:null,requestId=save?.saveId;
   if(!actor(requestId)||save.actorUid!==identity.uid||String(save.actorEmail??'').trim().toLowerCase()!==identity.email)throw new Error('authority browser actor mismatch');
   // Firebase already refreshes a cached ID token when it is near expiry. A
   // forced refresh on every record (including the immediately-following
   // immutable audit append) adds a network round trip without changing the
   // server-side identity/role checks. App Check remains limited-use and is
   // still acquired separately for every request, preserving replay defense.
   const [idToken,appCheckToken]=await Promise.all([cfg.getIdToken(identity.user,false),cfg.getLimitedUseAppCheckToken()]);
   if(typeof idToken!=='string'||idToken.length<8||typeof appCheckToken!=='string'||appCheckToken.length<8)throw new Error('authority browser token missing');
   const beforeSend=currentIdentity(cfg);if(beforeSend.user!==identity.user||beforeSend.uid!==identity.uid||beforeSend.email!==identity.email)throw new Error('authority browser identity changed');
   const body=JSON.stringify({schema:STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA,projectId:cfg.projectId,requestId,payload}),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);
   let response;
   try{response=await cfg.fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${idToken}`,'content-type':'application/json','x-firebase-appcheck':appCheckToken,'x-danbridge-request-id':requestId},body,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal})}finally{clearTimeout(timer)}
   const afterSend=currentIdentity(cfg);if(afterSend.user!==identity.user||afterSend.uid!==identity.uid||afterSend.email!==identity.email)throw new Error('authority browser identity changed');
   if(!response||typeof response.status!=='number'||typeof response.text!=='function')throw new Error('authority browser response missing');const text=await response.text();if(encoder.encode(text).length>64*1024)throw new Error('authority browser response too large');let parsed;try{parsed=JSON.parse(text)}catch{throw new Error('authority browser response invalid')}
   if(response.status!==200){const code=plain(parsed)&&typeof parsed.code==='string'?parsed.code:'BLOCKED';throw new Error(`staging V2 save blocked: ${code}`)}
   return assertResponse(parsed,requestId)
  }
 })
}
