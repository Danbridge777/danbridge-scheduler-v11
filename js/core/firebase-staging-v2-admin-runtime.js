import {createStagingV2AdminBoundary} from './firebase-staging-v2-service-account-boundary.js';

function exact(value,fields,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error(label+' must be plain object');
  const keys=Reflect.ownKeys(value);
  if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');
  const out={};
  for(const key of fields){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');
    out[key]=descriptor.value;
  }
  return out;
}

export async function createStagingV2AdminRuntime(raw){
  const input=exact(raw,['app','firestore','projectId','blocker'],'staging V2 Admin runtime config');
  if(typeof input.blocker!=='string'||input.blocker.length<8)throw new Error('staging V2 Admin runtime blocker invalid');
  const admin=await import('firebase-admin/firestore');
  if(admin.getFirestore(input.app)!==input.firestore)throw new Error(input.blocker);
  return Object.freeze({
    FieldPath:admin.FieldPath,
    FieldValue:admin.FieldValue,
    boundary:createStagingV2AdminBoundary(input.projectId)
  });
}
