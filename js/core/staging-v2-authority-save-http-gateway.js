export const STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA='danbridge-staging-v2-authority-save-request-v1';
export const STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA='danbridge-staging-v2-authority-save-response-v1';
export const STAGING_V2_AUTHORITY_SAVE_PROJECT_ID='danbridge-d8877-staging';
export const STAGING_V2_AUTHORITY_SAVE_PROJECT_NUMBER='883029466360';
export const STAGING_V2_AUTHORITY_SAVE_APP_ID='1:883029466360:web:c45a0a2164d4c897aaef0d';
export const STAGING_V2_AUTHORITY_SAVE_ORIGINS=Object.freeze(['https://danbridge-d8877-staging.web.app','https://danbridge-d8877-staging.firebaseapp.com']);
export const STAGING_V2_AUTHORITY_SAVE_MAX_REQUEST_BYTES=1024*1024;

const requestFields=['schema','projectId','requestId','payload'];
const payloadFields=['save','changedKeys','baselineRecords','localRecords'];
const completionFields=['state','transactionState','projectId','activationEpoch','resultHeadHash','commitHash','saveId','operationCount','persistedAt','writeCount'];
const configFields=['expectedProjectId','expectedAppId','allowedOrigins','verifyIdToken','verifyAppCheckToken','authorizeOwner','executeAuthoritySave','now'];
const rawRequestFields=['method','headers','rawBody'];
const encoder=new TextEncoder();

class GatewayError extends Error{constructor(status,code){super(code);this.status=status;this.code=code}}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exact(value,fields,label){if(!plain(value))throw new GatewayError(400,'INVALID_REQUEST');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new GatewayError(400,'INVALID_REQUEST');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new GatewayError(400,'INVALID_REQUEST');out[key]=descriptor.value}return out}
function safeClone(value,seen=new Set()){if(value===null||['string','boolean'].includes(typeof value))return value;if(typeof value==='number'){if(!Number.isFinite(value))throw new GatewayError(400,'INVALID_REQUEST');return value}if(typeof value!=='object'||seen.has(value))throw new GatewayError(400,'INVALID_REQUEST');seen.add(value);if(Array.isArray(value)){if(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw new GatewayError(400,'INVALID_REQUEST');const out=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new GatewayError(400,'INVALID_REQUEST');out.push(safeClone(descriptor.value,seen))}seen.delete(value);return out}if(!plain(value))throw new GatewayError(400,'INVALID_REQUEST');const out={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw new GatewayError(400,'INVALID_REQUEST');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new GatewayError(400,'INVALID_REQUEST');out[key]=safeClone(descriptor.value,seen)}seen.delete(value);return out}
function headerMap(raw){if(!plain(raw))throw new GatewayError(400,'INVALID_REQUEST');const out=new Map();for(const key of Reflect.ownKeys(raw)){if(typeof key!=='string')throw new GatewayError(400,'INVALID_REQUEST');const descriptor=Object.getOwnPropertyDescriptor(raw,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||typeof descriptor.value!=='string')throw new GatewayError(400,'INVALID_REQUEST');const normalized=key.toLowerCase();if(out.has(normalized))throw new GatewayError(400,'INVALID_REQUEST');out.set(normalized,descriptor.value.trim())}return out}
function token(value,max=4096){return typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=max}
function actor(value){return typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value)}
function email(value){return typeof value==='string'&&value===value.trim()&&value===value.toLowerCase()&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function cors(origin){return Object.freeze({'access-control-allow-origin':origin,'access-control-allow-credentials':'false','cache-control':'no-store','content-type':'application/json; charset=utf-8','vary':'Origin'})}
function response(status,origin,body){return Object.freeze({status,headers:cors(origin),body:JSON.stringify(body)})}
function failure(error,origin){const status=error instanceof GatewayError?error.status:500,code=error instanceof GatewayError?error.code:'INTERNAL';return response(status,origin,{schema:STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA,state:'blocked',code})}
function config(raw){const row=exact(raw,configFields,'gateway config');if(row.expectedProjectId!==STAGING_V2_AUTHORITY_SAVE_PROJECT_ID||row.expectedAppId!==STAGING_V2_AUTHORITY_SAVE_APP_ID||!Array.isArray(row.allowedOrigins)||row.allowedOrigins.length!==STAGING_V2_AUTHORITY_SAVE_ORIGINS.length||row.allowedOrigins.some((value,index)=>value!==STAGING_V2_AUTHORITY_SAVE_ORIGINS[index])||![row.verifyIdToken,row.verifyAppCheckToken,row.authorizeOwner,row.executeAuthoritySave,row.now].every(value=>typeof value==='function'))throw new Error('staging-v2 authority gateway config invalid');return Object.freeze({...row,allowedOrigins:Object.freeze([...row.allowedOrigins])})}
function verifiedCompletion(raw,requestId){const row=exact(raw,completionFields,'gateway completion');if(row.state!=='complete-confirmed'||!['created','replayed'].includes(row.transactionState)||row.projectId!==STAGING_V2_AUTHORITY_SAVE_PROJECT_ID||!actor(row.activationEpoch)||!digest(row.resultHeadHash)||!digest(row.commitHash)||row.saveId!==requestId||!Number.isSafeInteger(row.operationCount)||row.operationCount<1||row.operationCount>120||typeof row.persistedAt!=='string'||!Number.isSafeInteger(row.writeCount)||row.writeCount<0)throw new Error('staging-v2 authority completion invalid');return row}

export function createStagingV2AuthoritySaveHttpGateway(rawConfig){
 const cfg=config(rawConfig);
 return Object.freeze({
  async handle(rawRequest){
   let origin='';
   try{
    const input=exact(rawRequest,rawRequestFields,'gateway request'),headers=headerMap(input.headers);origin=headers.get('origin')??'';
    if(!cfg.allowedOrigins.includes(origin))throw new GatewayError(403,'ORIGIN_BLOCKED');
    if(input.method==='OPTIONS'){
     if(headers.get('access-control-request-method')!=='POST')throw new GatewayError(403,'PREFLIGHT_BLOCKED');
     const requested=(headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean),allowed=new Set(['authorization','content-type','x-firebase-appcheck','x-danbridge-request-id']);
     if(requested.some(value=>!allowed.has(value)))throw new GatewayError(403,'PREFLIGHT_BLOCKED');
     return Object.freeze({status:204,headers:Object.freeze({...cors(origin),'access-control-allow-methods':'POST','access-control-allow-headers':'Authorization, Content-Type, X-Firebase-AppCheck, X-Danbridge-Request-Id','access-control-max-age':'600'}),body:''})
    }
    if(input.method!=='POST')throw new GatewayError(405,'METHOD_NOT_ALLOWED');
    if(headers.get('content-type')!=='application/json')throw new GatewayError(415,'CONTENT_TYPE_REQUIRED');
    if(typeof input.rawBody!=='string')throw new GatewayError(400,'INVALID_REQUEST');
    const byteLength=encoder.encode(input.rawBody).length,declared=headers.get('content-length');
    if(byteLength>STAGING_V2_AUTHORITY_SAVE_MAX_REQUEST_BYTES||(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)!==byteLength)))throw new GatewayError(byteLength>STAGING_V2_AUTHORITY_SAVE_MAX_REQUEST_BYTES?413:400,byteLength>STAGING_V2_AUTHORITY_SAVE_MAX_REQUEST_BYTES?'PAYLOAD_TOO_LARGE':'INVALID_REQUEST');
    const authorization=headers.get('authorization')??'',appCheckToken=headers.get('x-firebase-appcheck')??'',requestHeader=headers.get('x-danbridge-request-id')??'';
    if(!authorization.startsWith('Bearer ')||!token(authorization.slice(7))||!token(appCheckToken)||!actor(requestHeader))throw new GatewayError(401,'UNAUTHENTICATED');
    let parsed;try{parsed=JSON.parse(input.rawBody)}catch{throw new GatewayError(400,'INVALID_REQUEST')}
    const envelope=exact(parsed,requestFields,'gateway envelope'),payload=exact(envelope.payload,payloadFields,'gateway payload'),requestId=envelope.requestId;
    if(envelope.schema!==STAGING_V2_AUTHORITY_SAVE_REQUEST_SCHEMA||envelope.projectId!==cfg.expectedProjectId||!actor(requestId)||requestHeader!==requestId)throw new GatewayError(400,'INVALID_REQUEST');
    const clonedPayload=safeClone(payload),save=plain(clonedPayload.save)?clonedPayload.save:null;
    if(!save||save.saveId!==requestId||!actor(save.actorUid)||!email(save.actorEmail))throw new GatewayError(400,'INVALID_REQUEST');
    let idClaims,appResponse;try{[idClaims,appResponse]=await Promise.all([cfg.verifyIdToken(authorization.slice(7),true),cfg.verifyAppCheckToken(appCheckToken,Object.freeze({consume:true}))])}catch{throw new GatewayError(401,'UNAUTHENTICATED')}
    idClaims=safeClone(idClaims);appResponse=safeClone(appResponse);const appClaims=plain(appResponse)?appResponse.token:null;
    const now=Math.floor(cfg.now()/1000),uid=idClaims.sub,emailValue=String(idClaims.email??'').toLowerCase();
    if(idClaims.aud!==cfg.expectedProjectId||idClaims.iss!==`https://securetoken.google.com/${cfg.expectedProjectId}`||!actor(uid)||idClaims.user_id!==uid||!email(emailValue)||idClaims.email_verified!==true||!Number.isSafeInteger(idClaims.auth_time)||idClaims.auth_time>now+30||!Number.isSafeInteger(idClaims.iat)||idClaims.iat>now+30||now-idClaims.iat>3700||idClaims.auth_time>idClaims.iat||!Number.isSafeInteger(idClaims.exp)||idClaims.exp<=now||idClaims.exp-idClaims.iat>3700||save.actorUid!==uid||save.actorEmail!==emailValue)throw new GatewayError(403,'IDENTITY_BLOCKED');
    if(!plain(appClaims)||appResponse.alreadyConsumed!==false||appResponse.appId!==cfg.expectedAppId||appClaims.app_id!==cfg.expectedAppId||appClaims.sub!==cfg.expectedAppId||appClaims.iss!==`https://firebaseappcheck.googleapis.com/${STAGING_V2_AUTHORITY_SAVE_PROJECT_NUMBER}`||!Array.isArray(appClaims.aud)||Object.getPrototypeOf(appClaims.aud)!==Array.prototype||appClaims.aud.length!==2||appClaims.aud[0]!==`projects/${STAGING_V2_AUTHORITY_SAVE_PROJECT_NUMBER}`||appClaims.aud[1]!==`projects/${cfg.expectedProjectId}`||!Number.isSafeInteger(appClaims.iat)||appClaims.iat>now+30||!Number.isSafeInteger(appClaims.exp)||appClaims.exp<=now)throw new GatewayError(403,'APP_CHECK_BLOCKED');
    let authorized=false;try{authorized=await cfg.authorizeOwner(Object.freeze({uid,email:emailValue,claims:Object.freeze(idClaims)}))}catch{authorized=false}
    if(authorized!==true)throw new GatewayError(403,'OWNER_REQUIRED');
    let completion;try{completion=await cfg.executeAuthoritySave(Object.freeze(clonedPayload))}catch{throw new GatewayError(500,'SAVE_FAILED')}
    const verified=verifiedCompletion(completion,requestId);
    return response(200,origin,{schema:STAGING_V2_AUTHORITY_SAVE_RESPONSE_SCHEMA,state:'complete-confirmed',transactionState:verified.transactionState,projectId:verified.projectId,activationEpoch:verified.activationEpoch,resultHeadHash:verified.resultHeadHash,commitHash:verified.commitHash,saveId:verified.saveId,operationCount:verified.operationCount,persistedAt:verified.persistedAt,writeCount:verified.writeCount})
   }catch(error){return failure(error,origin)}
  }
 })
}
