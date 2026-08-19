import {sha256Canonical} from './cloud-immutable-migration-backup.js';

export const FIREBASE_ADMIN_RULES_TEST_PROJECT_ID='danbridge-rules-test';
export const FIREBASE_ADMIN_STAGING_PROJECT_ID='danbridge-d8877-staging';
export const FIREBASE_ADMIN_PRODUCTION_PROJECT_ID='danbridge-d8877';
export const FIREBASE_ADMIN_STAGING_IAM_RECEIPT_SCHEMA='danbridge-staging-admin-iam-review-receipt-v1';
export const FIREBASE_ADMIN_STAGING_IAM_ALLOWLIST=Object.freeze([]);

const receiptFields=['schema','state','environment','projectId','projectNumber','serviceAccountEmail','serviceAccountUniqueId','credentialSource','principalType','iamPolicyEtag','requiredPermissions','condition','reviewedAt','reviewer','receiptHash'];
const boundaryFields=['mode','app','firestore','nativeFirestore','expectedProjectId','emulatorHost','credential','iamReceipt'];
const credentialFields=['clientEmail','projectId','source'];
const email=value=>typeof value==='string'&&value===value.trim()&&value.length<=254&&/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9.-]+\.gserviceaccount\.com$/.test(value);
const token=(value,min=1,max=256)=>typeof value==='string'&&value===value.trim()&&value.length>=min&&value.length<=max&&/^[A-Za-z0-9_.:@/+\-=]+$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);
const timestamp=value=>typeof value==='string'&&value===value.trim()&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value));

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
 const row=exact(raw,receiptFields,'staging Admin IAM receipt'),permissions=exactStringArray(row.requiredPermissions,'staging Admin IAM permissions'),condition=exact(row.condition,['title','expression'],'staging Admin IAM condition'),reviewer=exact(row.reviewer,['id','method'],'staging Admin IAM reviewer');
 const normalized={...row,requiredPermissions:permissions,condition,reviewer};
 if(row.schema!==FIREBASE_ADMIN_STAGING_IAM_RECEIPT_SCHEMA||row.state!=='reviewed-immutable'||row.environment!=='staging'||row.projectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||!/^\d{6,20}$/.test(row.projectNumber)||!email(row.serviceAccountEmail)||!/^\d{6,32}$/.test(row.serviceAccountUniqueId)||row.credentialSource!=='explicit-service-account-metadata'||row.principalType!=='serviceAccount'||!token(row.iamPolicyEtag,4,256)||permissions.length===0||!token(condition.title,4,128)||typeof condition.expression!=='string'||condition.expression!==condition.expression.trim()||condition.expression.length<8||condition.expression.length>1024||!timestamp(row.reviewedAt)||!token(reviewer.id,4,128)||reviewer.method!=='spark-reviewed-read-only-iam-inventory'||!digest(row.receiptHash)||sha256Canonical(receiptBody(normalized))!==row.receiptHash)throw new Error('staging Admin IAM receipt integrity invalid');
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
 if(credential.projectId!==FIREBASE_ADMIN_STAGING_PROJECT_ID||!email(credential.clientEmail)||credential.source!=='explicit-service-account-metadata')throw new Error('staging Admin ambient or secret credential blocked');
 if(!frozen(input.iamReceipt))throw new Error('staging Admin IAM receipt must be immutable original');
 const receipt=verifyFirebaseAdminStagingIamReceiptShape(input.iamReceipt);
 if(receipt.projectId!==credential.projectId||receipt.serviceAccountEmail!==credential.clientEmail||!FIREBASE_ADMIN_STAGING_IAM_ALLOWLIST.includes(receipt.receiptHash))throw new Error('staging Admin principal/IAM allowlist blocked');
 return Object.freeze({mode:'staging',projectId,clientEmail:credential.clientEmail,iamReceiptHash:receipt.receiptHash});
}
