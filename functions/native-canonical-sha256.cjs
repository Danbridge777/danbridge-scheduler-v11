'use strict';

const {createHash}=require('node:crypto');

// Cache only key spelling/order, never record values, identities, revisions or
// authority hashes. The exact JSON array of own keys is a collision-free key;
// embedded NULs/quotes cannot alias another layout. Bounded to 64 small shapes.
const keyLayouts=new Map();
function canonicalKeyLayout(value){
 const keys=Object.keys(value),signature=keys.length<=64?JSON.stringify(keys):null,cacheable=signature!==null&&signature.length<=4096;
 if(cacheable&&keyLayouts.has(signature))return keyLayouts.get(signature);
 let numeric=0;
 while(numeric<keys.length){const key=keys[numeric],index=key>>>0;if(index===4294967295||String(index)!==key)break;numeric++}
 const ordered=numeric?keys.slice(0,numeric).concat(keys.slice(numeric).sort()):keys.sort();
 const layout=ordered.map(key=>[key,JSON.stringify(key)+':']);
 if(cacheable){if(keyLayouts.size>=64)keyLayouts.delete(keyLayouts.keys().next().value);keyLayouts.set(signature,layout)}
 return layout;
}

// Produce the exact bytes emitted by JSON.stringify(canonicalValue(value))
// without first allocating a second deep copy of the whole database.  A
// caller-owned WeakMap retains canonical strings for immutable records within
// one transaction attempt. Scheduler targets share untouched authority rows,
// so target hashing reuses those strings after source verification. Every new
// request/retry must read fresh authority and allocate fresh memo tables.
function canonicalJson(value,memo=new WeakMap(),stack=new Set()){
 if(value===null)return'null';
 if(typeof value!=='object')return JSON.stringify(value);
 const cached=memo.get(value);if(cached!==undefined)return cached;
 if(stack.has(value))throw new TypeError('Converting circular structure to JSON');
 stack.add(value);let result;
 if(Array.isArray(value)){
  const items=new Array(value.length);for(let i=0;i<value.length;i++)items[i]=canonicalJson(value[i],memo,stack)??'null';result=`[${items.join(',')}]`;
 }else{
  // JSON.stringify enumerates integer-index keys numerically even after
  // canonicalValue inserted them in lexicographic order. Object.keys already
  // places these keys first; preserve that prefix and sort only other names.
  // A direct loop also avoids one temporary flatMap array per field.
  const items=[];
  for(const [key,prefix]of canonicalKeyLayout(value)){const item=canonicalJson(value[key],memo,stack);if(item!==undefined)items.push(prefix+item)}
  result=`{${items.join(',')}}`;
 }
 stack.delete(value);memo.set(value,result);return result
}
function nativeCanonicalSha256(value,{memo=new WeakMap()}={}){
 if(!(memo instanceof WeakMap))throw new TypeError('canonical SHA-256 memo must be a WeakMap');
 const canonical=canonicalJson(value,memo);return createHash('sha256').update(canonical,'utf8').digest('hex')
}

// Hash the canonical record database without first concatenating the complete
// 16-collection JSON document.  `normalizeRecordDb` sorts ordinary collections
// by record id and reverses the newest-first changes array.  Streaming those
// exact JSON tokens into node:crypto produces the identical digest while
// retaining memoized canonical strings for unchanged record objects.
function nativeCanonicalRecordDbSha256(db,collections,{memo=new WeakMap(),orderMemo=new WeakMap()}={}){
 if(!db||typeof db!=='object'||Array.isArray(db)||!Array.isArray(collections)||!collections.length||!(memo instanceof WeakMap)||!(orderMemo instanceof WeakMap))throw new TypeError('canonical record DB input invalid');
 const expected=new Set(collections),unknown=Object.keys(db).filter(key=>!expected.has(key));
 if(unknown.length)throw new TypeError(`canonical record DB contains unknown collections: ${unknown.join(',')}`);
 const names=[...collections].sort(),hash=createHash('sha256');let buffered='';
 // Feed the exact same canonical byte stream in bounded blocks instead of
 // crossing into node:crypto twice for every one of 30,000 records. Keep the
 // full SHA calculation; this is not a cached database hash or sampled check.
 const write=token=>{buffered+=token;if(buffered.length>=32768){hash.update(buffered,'utf8');buffered=''}};
 write('{');
 for(let collectionIndex=0;collectionIndex<names.length;collectionIndex++){
  const collection=names[collectionIndex],rows=db[collection];
  if(!Array.isArray(rows))throw new TypeError(`canonical record DB ${collection} must be an array`);
  if(collectionIndex)write(',');write(`${JSON.stringify(collection)}:[`);
  let ordered=orderMemo.get(rows);
  if(ordered===undefined){
   ordered=collection==='changes'?[...rows].reverse():[...rows].sort((left,right)=>String(left?.id??'').localeCompare(String(right?.id??'')));
   orderMemo.set(rows,ordered)
  }
  for(let rowIndex=0;rowIndex<ordered.length;rowIndex++){
   const record=ordered[rowIndex];
   if(!record||typeof record!=='object'||Array.isArray(record))throw new TypeError(`canonical record DB ${collection} contains an invalid record`);
   if(rowIndex)write(',');write(canonicalJson(record,memo))
  }
  write(']')
 }
 write('}');if(buffered)hash.update(buffered,'utf8');return hash.digest('hex')
}

module.exports={canonicalJson,nativeCanonicalSha256,nativeCanonicalRecordDbSha256};
