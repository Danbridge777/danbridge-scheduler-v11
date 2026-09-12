import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createTransactionHistoryVersionReader}=createRequire(import.meta.url)('../functions/transaction-history-version-reader.cjs');
const path='productionFullRecordShadows/danbridge/collections/changes/records';
function setup(options){
 const reader=createTransactionHistoryVersionReader(options),stats={full:0,metadata:0,bodies:0},data=new Map();
 const query={path,select:()=>({path,projection:true})};
 const row=(id,entry,projection=false)=>({id,exists:true,ref:{id},updateTime:{isEqual:other=>other?.version===entry.version,version:entry.version},data:()=>projection?{}:structuredClone(entry.body)});
 const tx={get:async q=>{stats[q.projection?'metadata':'full']++;return{docs:[...data].map(([id,e])=>row(id,e,q.projection))}},getAll:async(...refs)=>{stats.bodies+=refs.length;return refs.map(ref=>row(ref.id,data.get(ref.id)))}};
 return{data,stats,tx,query,read:()=>reader.read(tx,query)};
}
test('each call rechecks complete membership and timestamp; add/edit/delete/recreate never reuse old payload',async()=>{
 const f=setup();f.data.set('a',{version:1,body:{value:'a'}});f.data.set('b',{version:1,body:{value:'b'}});
 await f.read();const warm=await f.read();assert.deepEqual(f.stats,{full:1,metadata:1,bodies:0});
 warm.docs[0].data().value='caller mutation';assert.equal((await f.read()).docs[0].data().value,'a');
 f.data.set('a',{version:2,body:{value:'edited'}});f.data.delete('b');f.data.set('c',{version:1,body:{value:'new'}});
 const changed=await f.read();assert.deepEqual(changed.docs.map(d=>d.data().value),['edited','new']);assert.equal(f.stats.bodies,2);
 f.data.set('b',{version:3,body:{value:'recreated'}});assert.deepEqual((await f.read()).docs.map(d=>d.data().value),['edited','new','recreated']);
 f.data.clear();assert.equal((await f.read()).size,0);assert.equal((await f.read()).size,0);
});
test('bounded cache falls back to full reads; foreign path is rejected',async()=>{
 for(const options of [{maxBytes:0},{maxRecords:0}]){const f=setup(options);f.data.set('a',{version:1,body:{value:'a'}});await f.read();await f.read();assert.equal(f.stats.full,2)}
 const f=setup();await assert.rejects(createTransactionHistoryVersionReader().read(f.tx,{path:'companyAccess'}),/foreign/);
});
test('read failure and timestamp mismatch never return stale history',async()=>{
 const f=setup();f.data.set('a',{version:1,body:{value:'old'}});await f.read();f.data.set('a',{version:2,body:{value:'new'}});
 const original=f.tx.getAll;f.tx.getAll=async()=>{throw Error('offline')};await assert.rejects(f.read(),/offline/);
 f.tx.getAll=async(...refs)=>(await original(...refs)).map(row=>({...row,updateTime:{version:99,isEqual:()=>false}}));await assert.rejects(f.read(),/version changed/);
 f.tx.getAll=original;assert.equal((await f.read()).docs[0].data().value,'new');
});
