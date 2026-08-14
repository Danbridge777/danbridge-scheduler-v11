import test from 'node:test';
import assert from 'node:assert/strict';
import {executeRecordShadowBatches,verifyRecordShadowTarget} from '../js/core/cloud-record-shadow-writer.js';
import {buildRecordShadowWriteBatches,rebuildRecordShadowState} from '../js/core/cloud-record-diff.js';

const row=(id,value)=>({id,value});

function memoryShadowStore(initial={lessons:[],students:[],teachers:[]}){
 const store=new Map();
 for(const [collection,rows] of Object.entries(initial))for(const item of rows)store.set(`${collection}/${item.id}`,structuredClone(item.data));
 return{
  async writeBatch(operations){
   for(const operation of operations){
    const key=`${operation.payload.collection}/${operation.payload.recordId}`,previous=store.get(key);
    if(previous&&operation.payload.revision!==previous.revision+1)throw new Error(`revision conflict ${key}`);
    if(!previous&&operation.payload.revision!==1)throw new Error(`create revision conflict ${key}`);
    store.set(key,structuredClone(operation.payload));
   }
  },
  async readState(){
   const documents={lessons:[],students:[],teachers:[]};
   for(const [key,data] of store){const [collection,id]=key.split('/');documents[collection].push({id,data:structuredClone(data)})}
   return rebuildRecordShadowState(documents);
  }
 };
}

test('協調器嚴格依序寫入並在全部批次後讀回驗證',async()=>{
 const target={lessons:Array.from({length:5},(_,index)=>row(`lesson-${index}`,index)),students:[],teachers:[]};
 const plan=buildRecordShadowWriteBatches({lessons:[],students:[],teachers:[]},target,{sourceHash:'hash-five',batchSize:2});
 const store=memoryShadowStore(),events=[];
 const result=await executeRecordShadowBatches(plan,{writeBatch:async operations=>{events.push(`write-${operations.length}`);await store.writeBatch(operations)},readState:async()=>{events.push('verify');return store.readState()},targetDb:target});
 assert.deepEqual(events,['write-2','write-2','write-1','verify']);
 assert.deepEqual({...result,state:undefined},{writes:5,batches:3,verified:true,activeCount:5,tombstoneCount:0,state:undefined});
 assert.deepEqual(result.state.db,target);
});

test('第二批失敗立即停止，不執行第三批也不宣告驗證成功',async()=>{
 const target={lessons:Array.from({length:5},(_,index)=>row(`lesson-${index}`,index)),students:[],teachers:[]};
 const plan=buildRecordShadowWriteBatches({lessons:[],students:[],teachers:[]},target,{sourceHash:'hash-fail',batchSize:2});
 let calls=0,verified=false;
 await assert.rejects(executeRecordShadowBatches(plan,{writeBatch:async()=>{calls++;if(calls===2)throw new Error('injected failure')},readState:async()=>{verified=true},targetDb:target}),error=>{
  assert.equal(error.completedBatches,1);assert.equal(error.completedWrites,2);assert.equal(error.totalBatches,3);return /第 2 批/.test(error.message);
 });
 assert.equal(calls,2);assert.equal(verified,false);
});

test('部分成功後重新讀取與規劃，只續傳剩餘資料且不重播成功批次',async()=>{
 const target={lessons:Array.from({length:5},(_,index)=>row(`lesson-${index}`,index)),students:[],teachers:[]};
 const firstPlan=buildRecordShadowWriteBatches({lessons:[],students:[],teachers:[]},target,{sourceHash:'hash-retry',batchSize:2});
 const store=memoryShadowStore();let calls=0;
 await assert.rejects(executeRecordShadowBatches(firstPlan,{writeBatch:async operations=>{calls++;if(calls===2)throw new Error('offline');await store.writeBatch(operations)},readState:store.readState,targetDb:target}));
 const afterFailure=await store.readState();
 const retryPlan=buildRecordShadowWriteBatches(afterFailure,target,{sourceHash:'hash-retry',batchSize:2});
 assert.equal(retryPlan.writes,3);
 const result=await executeRecordShadowBatches(retryPlan,{writeBatch:store.writeBatch,readState:store.readState,targetDb:target});
 assert.equal(result.verified,true);assert.equal(result.writes,3);
});

test('讀回遺失、內容不同、額外有效資料或墓碑版號異常都不得通過',()=>{
 const target={lessons:[row('one',1)],students:[],teachers:[]};
 assert.throws(()=>verifyRecordShadowTarget({db:{lessons:[],students:[],teachers:[]},revisions:{lessons:{},students:{},teachers:{}},activeCount:0,tombstoneCount:0},target),/不一致/);
 assert.throws(()=>verifyRecordShadowTarget({db:{lessons:[row('one',2)],students:[],teachers:[]},revisions:{lessons:{one:1},students:{},teachers:{}},activeCount:1,tombstoneCount:0},target),/不一致/);
 assert.throws(()=>verifyRecordShadowTarget({db:{lessons:[row('one',1),row('extra',1)],students:[],teachers:[]},revisions:{lessons:{one:1,extra:1},students:{},teachers:{}},activeCount:2,tombstoneCount:0},target),/不一致/);
 assert.throws(()=>verifyRecordShadowTarget({db:structuredClone(target),revisions:{lessons:{one:1,deleted:0},students:{},teachers:{}},activeCount:1,tombstoneCount:1},target),/revision 無效/);
 assert.throws(()=>verifyRecordShadowTarget({db:structuredClone(target),revisions:{lessons:{},students:{},teachers:{}},activeCount:1,tombstoneCount:0},target),/缺少影子 revision/);
});

test('空計畫仍必須讀回驗證，不能因零寫入直接假設成功',async()=>{
 const target={lessons:[row('same',1)],students:[],teachers:[]};
 const state={db:structuredClone(target),revisions:{lessons:{same:4},students:{},teachers:{}},activeCount:1,tombstoneCount:0};
 const plan=buildRecordShadowWriteBatches(state,target,{sourceHash:'same'});let writes=0,reads=0;
 const result=await executeRecordShadowBatches(plan,{writeBatch:async()=>{writes++},readState:async()=>{reads++;return state},targetDb:target});
 assert.equal(writes,0);assert.equal(reads,1);assert.equal(result.verified,true);
});
