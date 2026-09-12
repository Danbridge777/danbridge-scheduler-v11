import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createImmutableHistoryMaterializer}=require('../functions/immutable-history-materializer.cjs');
const {nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');
const snapshot=body=>({exists:true,updateTime:{},data:()=>structuredClone(body)});
test('history materialization reuses only the exact native snapshot and freezes all nested values',()=>{
 const cache=createImmutableHistoryMaterializer(),row=snapshot({record:{id:'a',items:[{value:1}]}}),first=cache.materialize(row);
 assert.equal(cache.materialize(row),first);
 assert.throws(()=>{first.record.items[0].value=2},TypeError);
 assert.throws(()=>{first.record.items.push({value:3})},TypeError);
 const independent=row.data();independent.record.items[0].value=9;
 assert.equal(cache.materialize(row).record.items[0].value,1);
 const replacement=cache.materialize(snapshot({record:{id:'a',items:[{value:2}]}}));
 assert.notEqual(replacement,first);assert.equal(replacement.record.items[0].value,2);
 assert.notEqual(createImmutableHistoryMaterializer().materialize(row),first);
});
test('cached canonical bytes equal fresh full hashing across repetitions, edits and deletion',()=>{
 const cache=createImmutableHistoryMaterializer();
 const first=cache.materialize(snapshot({record:{id:'a',items:['x',1],nested:{'10':1,'2':2,z:'引號"'}}}));
 const second=cache.materialize(snapshot({record:{id:'a',items:['changed']}}));
 for(const data of [first,first,second,first]){
  const memo=new WeakMap();cache.seedHashMemo([{data}],memo);
  assert.equal(nativeCanonicalSha256([data.record],{memo}),nativeCanonicalSha256([data.record]));
 }
 const memo=new WeakMap();cache.seedHashMemo([],memo);
 assert.equal(nativeCanonicalSha256([],{memo}),nativeCanonicalSha256([]));
 assert.throws(()=>cache.seedHashMemo([{data:{record:{}}}],memo),/immutable/);
 assert.throws(()=>cache.seedHashMemo([{data:Object.freeze({record:Object.freeze({nested:{mutable:true}})})}],memo),/immutable/);
 assert.throws(()=>cache.materialize({exists:false}),/native/);
 assert.throws(()=>cache.materialize({exists:true,updateTime:{},data:()=>({get record(){throw Error('must not run')}})}),/accessors/);
});
