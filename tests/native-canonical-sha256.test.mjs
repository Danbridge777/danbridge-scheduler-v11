import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {canonicalJson,nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');
const canonical=value=>Array.isArray(value)?value.map(canonical):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value);
const reference=value=>JSON.stringify(canonical(value));

test('native canonical stream is byte-identical to the established canonical JSON contract',()=>{
 const cases=[null,true,false,0,-0,1.25,Number.NaN,Number.POSITIVE_INFINITY,'中文\n"quoted"',[1,undefined,{z:2,a:1}],{z:undefined,b:[undefined,3],a:{y:'二',x:'一'}}];
 for(const value of cases){const expected=reference(value);assert.equal(canonicalJson(value),expected);assert.equal(nativeCanonicalSha256(value),createHash('sha256').update(expected,'utf8').digest('hex'))}
});

test('caller-owned memo reuses immutable rows without changing canonical identity',()=>{
 const shared={id:'lesson-shared',date:'2032-01-07',teacherIds:['teacher-1'],note:'保留'};
 const first={lessons:[shared],changes:[{id:'change-1',before:null,after:shared}]};
 const second={lessons:[shared,{id:'lesson-new',date:'2032-01-08'}],changes:[{id:'change-2'},...first.changes]};
 const memo=new WeakMap();
 assert.equal(nativeCanonicalSha256(first,{memo}),createHash('sha256').update(reference(first),'utf8').digest('hex'));
 assert.equal(nativeCanonicalSha256(second,{memo}),createHash('sha256').update(reference(second),'utf8').digest('hex'));
 assert.equal(nativeCanonicalSha256({b:2,a:1}),nativeCanonicalSha256({a:1,b:2}));
 assert.throws(()=>nativeCanonicalSha256({}, {memo:new Map()}),/WeakMap/);
});
