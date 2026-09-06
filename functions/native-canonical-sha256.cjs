'use strict';

const {createHash}=require('node:crypto');

// Produce the exact bytes emitted by JSON.stringify(canonicalValue(value))
// without first allocating a second deep copy of the whole database.  A
// caller-owned WeakMap may retain canonical strings for immutable record
// objects between consecutive timetable writes.  Scheduler targets preserve
// object identity for untouched authority rows, so a 30-lesson edit only
// serializes those 30 lessons and their new audit rows on the next request.
function canonicalJson(value,memo=new WeakMap(),stack=new Set()){
 if(value===null)return'null';
 if(typeof value!=='object')return JSON.stringify(value);
 const cached=memo.get(value);if(cached!==undefined)return cached;
 if(stack.has(value))throw new TypeError('Converting circular structure to JSON');
 stack.add(value);let result;
 if(Array.isArray(value))result=`[${value.map(item=>canonicalJson(item,memo,stack)??'null').join(',')}]`;
 else result=`{${Object.keys(value).sort().flatMap(key=>{const item=canonicalJson(value[key],memo,stack);return item===undefined?[]:[`${JSON.stringify(key)}:${item}`]}).join(',')}}`;
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
 const names=[...collections].sort(),hash=createHash('sha256');hash.update('{','utf8');
 for(let collectionIndex=0;collectionIndex<names.length;collectionIndex++){
  const collection=names[collectionIndex],rows=db[collection];
  if(!Array.isArray(rows))throw new TypeError(`canonical record DB ${collection} must be an array`);
  if(collectionIndex)hash.update(',','utf8');hash.update(`${JSON.stringify(collection)}:[`,'utf8');
  let ordered=orderMemo.get(rows);
  if(ordered===undefined){
   ordered=collection==='changes'?[...rows].reverse():[...rows].sort((left,right)=>String(left?.id??'').localeCompare(String(right?.id??'')));
   orderMemo.set(rows,ordered)
  }
  for(let rowIndex=0;rowIndex<ordered.length;rowIndex++){
   const record=ordered[rowIndex];
   if(!record||typeof record!=='object'||Array.isArray(record))throw new TypeError(`canonical record DB ${collection} contains an invalid record`);
   if(rowIndex)hash.update(',','utf8');hash.update(canonicalJson(record,memo),'utf8')
  }
  hash.update(']','utf8')
 }
 hash.update('}','utf8');return hash.digest('hex')
}

module.exports={canonicalJson,nativeCanonicalSha256,nativeCanonicalRecordDbSha256};
