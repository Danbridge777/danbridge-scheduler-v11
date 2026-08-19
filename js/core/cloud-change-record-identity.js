// FNV-1a is retained only for byte-for-byte legacy document identity. It is not
// an integrity hash; integrity must continue to come from the SHA control and
// activation manifest.
export const CHANGE_RECORD_SHORT_HASH_PURPOSE='identity-only-not-integrity';

const stable=value=>Array.isArray(value)
 ?value.map(stable)
 :(value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))
  :value);

function assertRecordIndex(recordIndex){
 if(!Number.isSafeInteger(recordIndex)||recordIndex<0)throw new Error('changes recordIndex 必須是 nonnegative safe integer');
 return recordIndex;
}

function hasUnpairedSurrogate(value){for(let index=0;index<value.length;index++){const code=value.charCodeAt(index);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(!(next>=0xdc00&&next<=0xdfff))return true;index++}else if(code>=0xdc00&&code<=0xdfff)return true}return false}
export function isSafeCloudRecordId(value){return typeof value==='string'&&value.trim()===value&&value.length>0&&!hasUnpairedSurrogate(value)&&new TextEncoder().encode(value).length<=1500&&!/[\u0000-\u001f\u007f/]/.test(value)&&value!=='.'&&value!=='..'&&!/^__.*__$/.test(value)}

function strictClone(value,stack,path){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new Error(`${path} 不是 lossless finite number`);return value}
 if(['undefined','bigint','function','symbol'].includes(typeof value))throw new Error(`${path} 不是 lossless JSON value`);
 if(typeof value!=='object')throw new Error(`${path} 不是 lossless JSON value`);
 if(stack.has(value))throw new Error(`${path} 包含 cycle`);
 stack.add(value);
 try{
  if(Array.isArray(value)){
   const keys=Reflect.ownKeys(value);
   for(const key of keys){if(key==='length')continue;if(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)){throw new Error(`${path} array 包含 extra 或 symbol 欄位`)}const index=Number(key);if(!Number.isSafeInteger(index)||index<0||index>=value.length||String(index)!==key)throw new Error(`${path} array index 無效`)}
   const result=[];
   for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor)throw new Error(`${path}[${index}] 是 sparse array hole`);if(!descriptor.enumerable||!('value'in descriptor))throw new Error(`${path}[${index}] 是 accessor 或 non-enumerable`);result.push(strictClone(descriptor.value,stack,`${path}[${index}]`))}
   return result;
  }
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw new Error(`${path} 不是 plain object`);
  const result={};
  for(const key of Reflect.ownKeys(value)){
   if(typeof key!=='string')throw new Error(`${path} 包含 symbol key`);
   const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!('value'in descriptor))throw new Error(`${path}.${key} 是 accessor 或 non-enumerable`);
   Object.defineProperty(result,key,{value:strictClone(descriptor.value,stack,`${path}.${key}`),enumerable:true,writable:true,configurable:true});
  }
  return result;
 }finally{stack.delete(value)}
}

function strictCloneChangeRecord(record){
 if(record===null||typeof record!=='object'||Array.isArray(record))throw new Error('changes record 必須是 non-null plain object');
 return strictClone(record,new Set(),'changes record');
}

export function changeRecordCanonicalFingerprint(record){
 return JSON.stringify(stable(strictCloneChangeRecord(record)));
}

export function changeRecordShortHash(record){
 let hash=2166136261;
 for(const byte of new TextEncoder().encode(changeRecordCanonicalFingerprint(record))){hash^=byte;hash=Math.imul(hash,16777619)}
 return(hash>>>0).toString(16).padStart(8,'0');
}

export function buildChangeRecordId(recordIndex,record){
 assertRecordIndex(recordIndex);
 return`seq_${String(recordIndex).padStart(8,'0')}_${changeRecordShortHash(record)}`;
}

export function assertChangeRecordIdentity({recordIndex,recordId,record}={}){
 assertRecordIndex(recordIndex);
 if(typeof recordId!=='string'||!/^seq_\d{8,}_[0-9a-f]{8}$/.test(recordId)||recordId!==buildChangeRecordId(recordIndex,record))throw new Error('changes record identity 無效');
 return true;
}
