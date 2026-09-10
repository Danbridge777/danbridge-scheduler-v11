import test from 'node:test';
import assert from 'node:assert/strict';
import {createHook} from 'node:async_hooks';
import {createRequire} from 'node:module';
const {createProductionTransactionReader}=createRequire(import.meta.url)('../functions/production-transaction-reads.cjs');
const ref=path=>({path,id:path.split('/').at(-1)});
const snap=(path,exists=true)=>({ref:ref(path),exists});

test('30,000 authority snapshots allocate promises only for requested paths, retaining async memoization',async()=>{
 const rows=Array.from({length:30000},(_,i)=>snap('records/'+i));
 let promises=0,calls=0;
 const hook=createHook({init(_id,type){if(type==='PROMISE')promises++}});
 let read,a,b,again,seeded,requested;
 hook.enable();
 try{
  read=createProductionTransactionReader({doc:ref},{getAll:async()=>{calls++;return[]}},rows);
  seeded=promises;a=read('records/1');b=read('records/29999');again=read('records/1');requested=promises;
 }finally{hook.disable()}
 assert.equal(seeded,0);assert.equal(requested,2);assert.equal(a,again);
 assert.ok(a instanceof Promise);assert.equal(await a,rows[1]);assert.equal(await b,rows[29999]);assert.equal(calls,0);
});

test('uncached reads coalesce, tolerate response ordering and memoize a missing document snapshot',async()=>{
 let calls=0;const absent=snap('records/missing',false);
 const read=createProductionTransactionReader({doc:ref},{getAll:async(...refs)=>{calls++;return refs.map(r=>r.path===absent.ref.path?absent:snap(r.path)).reverse()}});
 const a=read('records/a'),missing=read('records/missing');
 assert.equal(read('records/a'),a);assert.equal(read('records/missing'),missing);
 assert.equal((await a).ref.path,'records/a');assert.equal(await missing,absent);assert.equal(calls,1);
});

test('incomplete and failed native reads reject every queued request without converting errors to absence',async()=>{
 for(const fail of [false,true]){
  const read=createProductionTransactionReader({doc:ref},{getAll:async()=>{if(fail)throw Error('native failure');return[snap('records/a')]}});
  const a=read('records/a'),b=read('records/b');
  const results=await Promise.allSettled([a,b]);
  assert.ok(results.every(r=>r.status==='rejected'));
  assert.ok(results.every(r=>fail?r.reason.message==='native failure':r.reason.message.includes('缺漏')));
  assert.equal(read('records/b'),b);
 }
});
