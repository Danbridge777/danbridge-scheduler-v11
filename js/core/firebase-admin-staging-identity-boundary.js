import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const FIREBASE_ADMIN_RULES_TEST_PROJECT_ID='danbridge-rules-test';
export const FIREBASE_ADMIN_STAGING_PROJECT_ID='danbridge-d8877-staging';
export const FIREBASE_ADMIN_PRODUCTION_PROJECT_ID='danbridge-d8877';
export const FIREBASE_ADMIN_STAGING_IAM_RECEIPT_SCHEMA='danbridge-staging-admin-iam-review-receipt-v2';
export const FIREBASE_ADMIN_STAGING_IAM_ALLOWLIST=Object.freeze([]);

const receiptFields=['schema','state','environment','stage','projectId','projectNumber','serviceAccountEmail','serviceAccountUniqueId','serviceAccountDisabled','serviceAccountKeyCount','serviceAccountResourceName','roles','projectIam','serviceAccountIam','serviceUsage','requiredForbiddenPermissionsAbsent','productionZeroBindingProof','reviewedAt','sourceHashes','reviewer','receiptHash'];
const boundaryFields=['mode','app','firestore','nativeFirestore','expectedProjectId','emulatorHost','credential','iamReceipt'];
const credentialFields=['clientEmail','projectId','source'];
const PROJECT_NUMBER='883029466360';
const STAGING_SERVICE_ACCOUNT_EMAIL='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
const DATA_PERMISSIONS=Object.freeze(['datastore.entities.create','datastore.entities.get','datastore.entities.list','datastore.entities.update']);
const TOKEN_PERMISSIONS=Object.freeze(['iam.serviceAccounts.getAccessToken']);
const SERVICE_USAGE_PERMISSIONS=Object.freeze(['serviceusage.services.use']);
const FORBIDDEN_PERMISSIONS=Object.freeze(['datastore.entities.delete','iam.serviceAccountKeys.create','iam.serviceAccountKeys.delete','iam.serviceAccountKeys.list','iam.serviceAccounts.actAs','iam.serviceAccounts.create','iam.serviceAccounts.delete','iam.serviceAccounts.getOpenIdToken','iam.serviceAccounts.setIamPolicy','iam.serviceAccounts.signBlob','iam.serviceAccounts.signJwt','resourcemanager.projects.setIamPolicy','serviceusage.services.enable']);
const sourceHashFields=['enabledApis','projectIam','projectInfo','productionZero','roleDefinitions','serviceAccountIam','serviceAccountMetadata','serviceUsage'];
const email=value=>typeof value==='string'&&value===value.trim()&&value.length<=254&&/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9.-]+\.gserviceaccount\.com$/.test(value);
const stagingEmail=value=>email(value)&&value===STAGING_SERVICE_ACCOUNT_EMAIL;
const token=(value,min=1,max=256)=>typeof value==='string'&&value===value.trim()&&value.length>=min&&value.length<=max&&/^[A-Za-z0-9_.:@/+\-=]+$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);
function timestampMs(value){const match=typeof value==='string'&&/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);if(!match)return null;const parts=match.slice(1).map(Number),[year,month,day,hour,minute,second]=parts;if(year<2026||year>2100||month<1||month>12||hour>23||minute>59||second>59)return null;const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(day<1||day>days[month-1])return null;const valueMs=Date.UTC(year,month-1,day,hour,minute,second);return Number.isFinite(valueMs)&&new Date(valueMs).toISOString()===value.slice(0,-1)+'.000Z'?valueMs:null}

function exact(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be plain object');
 const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
 const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=descriptor.value}return out;
}
function exactStringArray(value,label){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw new Error(label+' must be exact array');
 const out=[];for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!token(descriptor.value))throw new Error(label+' item invalid');out.push(descriptor.value)}
 if(new Set(out).size!==out.length||out.some((item,index)=>index>0&&out[index-1]>=item))throw new Error(label+' must be unique sorted');return out;
}
function sameArray(actual,expected){return actual.length===expected.length&&actual.every((value,index)=>value===expected[index])}
function condition(value,label){if(value===null)return null;const row=exact(value,['title','description','expression'],label);if(!token(row.title,4,128)||typeof row.description!=='string'||row.description!==row.description.trim()||row.description.length>512||typeof row.expression!=='string'||row.expression!==row.expression.trim()||row.expression.length<8||row.expression.length>1024)throw new Error(label+' invalid');return row}
function role(value,label,fullName,permissions){const row=exact(value,['fullName','stage','etag','permissions'],label),actual=exactStringArray(row.permissions,label+' permissions');if(row.fullName!==fullName||row.stage!=='GA'||!token(row.etag,4,256)||!sameArray(actual,permissions))throw new Error(label+' integrity invalid');return{...row,permissions:actual}}
function binding(value,label){const row=exact(value,['role','members','condition'],label),members=exactStringArray(row.members,label+' members'),when=condition(row.condition,label+' condition');if(!token(row.role,8,256)||members.some(member=>member==='*'||member==='allUsers'||member==='allAuthenticatedUsers'||/domain:|principalSet:/i.test(member)))throw new Error(label+' unsafe member');return{...row,members,condition:when}}
function policy(value,label,fields){const row=exact(value,fields,label);if(!token(row.etag,4,256)||!digest(row.sourceHash)||!Array.isArray(row.bindings)||Object.getPrototypeOf(row.bindings)!==Array.prototype||Reflect.ownKeys(row.bindings).length!==row.bindings.length+1)throw new Error(label+' invalid');const bindings=row.bindings.map((item,index)=>binding(item,label+' binding '+index)),hashes=bindings.map(item=>sha256Canonical(item));if(new Set(hashes).size!==hashes.length||hashes.some((hash,index)=>index>0&&hashes[index-1]>=hash))throw new Error(label+' bindings must be unique canonical sorted');return{...row,bindings}}
function frozen(value,seen=new Set()){
 if(value===null||typeof value!=='object'||seen.has(value))return true;if(!Object.isFrozen(value))return false;seen.add(value);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!frozen(descriptor.value,seen))return false}return true;
}
function freezeCopy(value){if(Array.isArray(value))return Object.freeze(value.map(freezeCopy));if(value&&typeof value==='object')return Object.freeze(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,freezeCopy(item)])));return value}
function projectIdFromApp(app){
 if(!app||typeof app!=='object')throw new Error('Admin App invalid');const optionsDescriptor=Object.getOwnPropertyDescriptor(app,'options');if(!optionsDescriptor||!Object.prototype.hasOwnProperty.call(optionsDescriptor,'value')||!optionsDescriptor.value||typeof optionsDescriptor.value!=='object')throw new Error('Admin App options identity invalid');
 const descriptor=Object.getOwnPropertyDescriptor(optionsDescriptor.value,'projectId');if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')||!token(descriptor.value,8,128))throw new Error('Admin App project identity invalid');return descriptor.value;
}
function assertNativeIdentity(app,firestore,nativeFirestore){
 if(!firestore||typeof firestore!=='object'||firestore!==nativeFirestore)throw new Error('Admin App/Firestore native identity invalid');
 const descriptor=Object.getOwnPropertyDescriptor(firestore,'app');if(descriptor&&(!Object.prototype.hasOwnProperty.call(descriptor,'value')||descriptor.value!==app))throw new Error('Admin Firestore app identity invalid');
 return projectIdFromApp(app);
}
function receiptBody(row){return Object.fromEntries(receiptFields.slice(0,-1).map(key=>[key,row[key]]))}

export function verifyFirebaseAdminStagingIamReceiptShape(raw){
 const row=exact(raw,receiptFields,'staging Admin IAM receipt'),resource=`projects/${FIREBASE_ADMIN_STAGING_PROJECT_ID}/serviceAccounts/${row.serviceAccountEmail}`,rolesRow=exact(row.roles,['customData','token','serviceUsage'],'staging Admin IAM roles');
 if(!stagingEmail(row.serviceAccountEmail))throw new Error('staging Admin IAM receipt service account invalid');
 const roles={customData:role(rolesRow.customData,'staging data role',`projects/${FIREBASE_ADMIN_STAGING_PROJECT_ID}/roles/danbridgeV2DataV1`,DATA_PERMISSIONS),token:role(rolesRow.token,'staging token role',`projects/${FIREBASE_ADMIN_STAGING_PROJECT_ID}/roles/danbridgeV2TokenV1`,TOKEN_PERMISSIONS),serviceUsage:role(rolesRow.serviceUsage,'staging service usage role',`projects/${FIREBASE_ADMIN_STAGING_PROJECT_ID}/roles/danbridgeV2ServiceUsageV1`,SERVICE_USAGE_PERMISSIONS)};
 const projectIam=policy(row.projectIam,'staging project IAM',['etag','sourceHash','unrelatedBindingCount','unrelatedBindingsHash','bindings']),serviceAccountIam=policy(row.serviceAccountIam,'staging service account IAM',['etag','sourceHash','bindings']),serviceUsage=exact(row.serviceUsage,['api','permission','enabled','decision'],'staging service usage'),forbidden=exactStringArray(row.requiredForbiddenPermissionsAbsent,'staging required forbidden permissions'),production=exact(row.productionZeroBindingProof,['state','productionProjectId','serviceAccountEmail','serviceAccountUniqueId','matchedBindings','matchedPermissions','sourceHash'],'production zero binding proof'),productionBindings=exactStringArray(production.matchedBindings,'production matched bindings'),productionPermissions=exactStringArray(production.matchedPermissions,'production matched permissions'),hashRows=exact(row.sourceHashes,sourceHashFields,'staging IAM source hashes'),reviewer=exact(row.reviewer,['id','method'],'staging Admin IAM reviewer');
 const sourceHashes=Object.fromEntries(sourceHashFields.map(key=>[key,hashRows[key]])),normalized={...row,roles,projectIam,serviceAccountIam,serviceUsage,requiredForbiddenPermissionsAbsent:forbidden,productionZeroBindingProof:{...production,matchedBindings:productionBindings,matchedPermissions:productionPermissions},sourceHashes,reviewer};
 const reviewedMs=timestampMs(row.reviewedAt),dataMember=`serviceAccount:${row.serviceAccountEmail}`,bindings=projectIam.bindings,saBindings=serviceAccountIam.bindings,expiries=[...bindings,...saBindings].map(item=>/timestamp\('([^']+)'\)/.exec(item.condition?.expression||'')?.[1]),expiry=expiries[0],expiryMs=timestampMs(expiry),projectExpression=`resource.name.startsWith('projects/${FIREBASE_ADMIN_STAGING_PROJECT_ID}/') && request.time < timestamp('${expiry}')`,tokenExpression=`resource.name == '${resource}' && request.time < timestamp('${expiry}')`,dataBinding=bindings.find(item=>item.role===roles.customData.fullName),usageBinding=bindings.find(item=>item.role===roles.serviceUsage.fullName),tokenBinding=saBindings[0];
 const projectCondition=item=>item&&sameArray(item.members,[dataMember])&&item.condition?.title===(item.role===roles.customData.fullName?'staging-data-expiry':'staging-usage-expiry')&&item.condition.description===(item.role===roles.customData.fullName?'Time-boxed staging data access.':'Time-boxed staging service usage.')&&item.condition.expression===projectExpression;
 const tokenCondition=tokenBinding&&tokenBinding.role===roles.token.fullName&&sameArray(tokenBinding.members,['principal://iam.googleapis.com/projects/883029466360/locations/global/workloadIdentityPools/danbridge/subject/staging-runner'])&&tokenBinding.condition?.title==='staging-token-expiry'&&tokenBinding.condition.description==='Time-boxed token minting.'&&tokenBinding.condition.expression===tokenExpression;
 const bindingsValid=bindings.length===2&&dataBinding!==usageBinding&&projectCondition(dataBinding)&&projectCondition(usageBinding)&&saBindings.length===1&&tokenCondition&&expiries.length===3&&expiries.every(value=>value===expiry)&&reviewedMs!==null&&expiryMs!==null&&expiryMs>reviewedMs&&expiryMs-reviewedMs<=3600000;
 if(row.schema!==FIREBASE_ADMIN_STAGING_IAM_RECEIPT_SCHEMA||row.state!=='planned-immutable'||row.environment!=='staging'||row.stage!=='pre-activation-read-only'||row.projectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||row.projectNumber!==PROJECT_NUMBER||!email(row.serviceAccountEmail)||row.serviceAccountEmail.startsWith('firebase-'+'adminsdk-')||!/^\d{6,32}$/.test(row.serviceAccountUniqueId)||row.serviceAccountDisabled!==false||row.serviceAccountKeyCount!==0||row.serviceAccountResourceName!==resource||!Number.isSafeInteger(projectIam.unrelatedBindingCount)||projectIam.unrelatedBindingCount<0||!digest(projectIam.unrelatedBindingsHash)||!bindingsValid||projectIam.sourceHash!==sourceHashes.projectIam||serviceAccountIam.sourceHash!==sourceHashes.serviceAccountIam||serviceUsage.api!=='serviceusage.googleapis.com'||serviceUsage.permission!=='serviceusage.services.use'||serviceUsage.enabled!==true||serviceUsage.decision!=='reviewed-required-no-mutation'||!sameArray(forbidden,FORBIDDEN_PERMISSIONS)||production.state!=='verified-zero'||production.productionProjectId!==FIREBASE_ADMIN_PRODUCTION_PROJECT_ID||production.serviceAccountEmail!==row.serviceAccountEmail||production.serviceAccountUniqueId!==row.serviceAccountUniqueId||productionBindings.length!==0||productionPermissions.length!==0||production.sourceHash!==sourceHashes.productionZero||sourceHashFields.some(key=>!digest(sourceHashes[key]))||!token(reviewer.id,4,128)||reviewer.method!=='spark-reviewed-read-only-iam-inventory'||!digest(row.receiptHash)||sha256Canonical(receiptBody(normalized))!==row.receiptHash)throw new Error('staging Admin IAM receipt integrity invalid');
 return freezeCopy(normalized);
}

export function assertFirebaseAdminStagingIdentityBoundary(raw){
 const input=exact(raw,boundaryFields,'Firebase Admin identity boundary'),projectId=assertNativeIdentity(input.app,input.firestore,input.nativeFirestore);
 if(input.mode==='emulator'){
  if(input.expectedProjectId!==FIREBASE_ADMIN_RULES_TEST_PROJECT_ID||projectId!==FIREBASE_ADMIN_RULES_TEST_PROJECT_ID||typeof input.emulatorHost!=='string'||input.emulatorHost!==input.emulatorHost.trim()||input.emulatorHost.length===0||input.credential!==null||input.iamReceipt!==null)throw new Error('Firebase Admin emulator identity blocked');
  return Object.freeze({mode:'emulator',projectId});
 }
 if(input.mode!=='staging')throw new Error('Firebase Admin mode blocked');
 if(input.expectedProjectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||projectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||input.emulatorHost!==null)throw new Error('Firebase Admin staging project/emulator blocked');
 const credential=exact(input.credential,credentialFields,'staging Admin credential metadata');
 if(!stagingEmail(credential.clientEmail))throw new Error('staging Admin credential service account blocked');
 if(credential.projectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||!email(credential.clientEmail)||credential.source!=='explicit-service-account-metadata')throw new Error('staging Admin ambient or secret credential blocked');
 if(!frozen(input.iamReceipt))throw new Error('staging Admin IAM receipt must be immutable original');
 const receipt=verifyFirebaseAdminStagingIamReceiptShape(input.iamReceipt);
 if(receipt.projectId!==credential.projectId||receipt.serviceAccountEmail!==credential.clientEmail||!FIREBASE_ADMIN_STAGING_IAM_ALLOWLIST.includes(receipt.receiptHash))throw new Error('staging Admin principal/IAM allowlist blocked');
 return Object.freeze({mode:'staging',projectId,clientEmail:credential.clientEmail,iamReceiptHash:receipt.receiptHash});
}
