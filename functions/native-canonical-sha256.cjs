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

module.exports={canonicalJson,nativeCanonicalSha256};
