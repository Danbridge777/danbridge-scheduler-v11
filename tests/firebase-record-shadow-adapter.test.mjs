import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseRecordShadowAdapter} from '../js/core/firebase-record-shadow-adapter.js';

const row=(id,value)=>({id,value});
const empty=()=>({lessons:[],students:[],teachers:[]});

function fakeFirestore({initial=empty(),failBatch=0,beforeTransaction}={}){
 const store=new Map(),events=[];let batchCalls=0;
 for(const [collection,documents] of Object.entries(initial))for(const item of documents)store.set(`${collection}/${item.id}`,structuredClone(item.data));
 const collectionFromPath=path=>path.split('/')[3];
 return{
  events,store,
  async getCollectionDocuments(path){
   events.push(`list:${path}`);const collection=collectionFromPath(path),rows=[];
   for(const [key,data] of store)if(key.startsWith(`${collection}/`))rows.push({id:key.slice(collection.length+1),data:structuredClone(data)});
   return rows;
  },
  async runBatchTransaction(callback){
   batchCalls++;await beforeTransaction?.({batchCalls,store});const writes=[];
   const transaction={
    async get(path){events.push(`get:${path}`);const [,collection,id]=path.match(/collections\/([^/]+)\/records\/(.+)$/)||[];const data=store.get(`${collection}/${id}`);return{exists:data!==undefined,data:data===undefined?undefined:structuredClone(data)}},
    set(path,payload){events.push(`set:${path}`);writes.push({path,payload:structuredClone(payload)})}
   };
   await callback(transaction);
   if(failBatch===batchCalls)throw new Error('injected batch failure');
   for(const {path,payload} of writes){const [,collection,id]=path.match(/collections\/([^/]+)\/records\/(.+)$/)||[];store.set(`${collection}/${id}`,payload)}
  }
 };
}

function adapter(fake,overrides={}){
 return createFirebaseRecordShadowAdapter({
  getCollectionDocuments:fake.getCollectionDocuments,
  runBatchTransaction:fake.runBatchTransaction,
  serverTimestamp:()=>({server:true}),
  actor:{uid:'owner-uid',email:'owner@example.com'},environment:'staging',role:'owner',...overrides
 });
}

test('staging Owner 可新增三類文件，transaction 先讀完才寫並注入 actor metadata',async()=>{
 const fake=fakeFirestore(),target={lessons:[row('lesson',1)],students:[row('student',2)],teachers:[row('teacher',3)]};
 const result=await adapter(fake).synchronize(target,{sourceHash:'hash-create'});
 assert.equal(result.verified,true);assert.equal(result.writes,3);
 const firstSet=fake.events.findIndex(event=>event.startsWith('set:')),lastGet=fake.events.findLastIndex(event=>event.startsWith('get:'));
 assert.ok(firstSet>lastGet);
 for(const data of fake.store.values()){assert.equal(data.revision,1);assert.equal(data.deleted,false);assert.deepEqual(data.updatedAt,{server:true});assert.equal(data.updatedBy,'owner-uid');assert.equal(data.updatedByEmail,'owner@example.com')}
});

test('修改、墓碑與墓碑後重建都逐次增加 revision 且不實體刪除',async()=>{
 const fake=fakeFirestore();const api=adapter(fake);
 await api.synchronize({lessons:[row('lesson',1)],students:[],teachers:[]},{sourceHash:'h1'});
 await api.synchronize({lessons:[row('lesson',2)],students:[],teachers:[]},{sourceHash:'h2'});
 assert.equal(fake.store.get('lessons/lesson').revision,2);
 await api.synchronize(empty(),{sourceHash:'h3'});
 assert.equal(fake.store.get('lessons/lesson').revision,3);assert.equal(fake.store.get('lessons/lesson').deleted,true);assert.deepEqual(fake.store.get('lessons/lesson').record,row('lesson',2));
 await api.synchronize({lessons:[row('lesson',4)],students:[],teachers:[]},{sourceHash:'h4'});
 assert.equal(fake.store.get('lessons/lesson').revision,4);assert.equal(fake.store.get('lessons/lesson').deleted,false);
});

test('production 與非 Owner 角色硬鎖且完全不讀寫',async()=>{
 for(const overrides of [{environment:'production'},{role:'aa'},{role:'teacher'},{role:'branch_manager'}]){
  const fake=fakeFirestore();const api=adapter(fake,overrides);
  await assert.rejects(api.synchronize(empty(),{sourceHash:'blocked'}),/只允許 staging Owner/);assert.deepEqual(fake.events,[]);
 }
});

test('400、401、801 筆安全分批，零寫入仍重新讀回驗證',async()=>{
 for(const [count,batches] of [[400,1],[401,2],[801,3]]){
  const fake=fakeFirestore(),target={lessons:Array.from({length:count},(_,i)=>row(`lesson-${i}`,i)),students:[],teachers:[]};
  const result=await adapter(fake).synchronize(target,{sourceHash:`hash-${count}`});assert.equal(result.batches,batches);assert.equal(result.writes,count);
  const readsBefore=fake.events.filter(event=>event.startsWith('list:')).length;
  const zero=await adapter(fake).synchronize(target,{sourceHash:`hash-${count}-same`});assert.equal(zero.writes,0);assert.equal(zero.verified,true);assert.equal(fake.events.filter(event=>event.startsWith('list:')).length,readsBefore+6);
 }
});

test('第二批失敗保留進度，重新讀取後只續傳剩餘資料',async()=>{
 const target={lessons:Array.from({length:5},(_,i)=>row(`lesson-${i}`,i)),students:[],teachers:[]},fake=fakeFirestore({failBatch:2});
 await assert.rejects(adapter(fake).synchronize(target,{sourceHash:'fail',batchSize:2}),error=>error.completedBatches===1&&error.completedWrites===2&&error.totalBatches===3);
 const retry=await adapter(fake).synchronize(target,{sourceHash:'retry',batchSize:2});assert.equal(retry.writes,3);assert.equal(retry.verified,true);
});

test('transaction 偵測另一個 Owner 的 revision 變更並拒絕覆蓋',async()=>{
 const seed={lessons:[{id:'lesson',data:{companyId:'danbridge',collection:'lessons',recordId:'lesson',record:row('lesson',1),sourceHash:'old',revision:1,deleted:false,environment:'staging'}}],students:[],teachers:[]};
 const fake=fakeFirestore({initial:seed,beforeTransaction:({store})=>{const current=store.get('lessons/lesson');store.set('lessons/lesson',{...current,revision:2,record:row('lesson',99)})}});
 await assert.rejects(adapter(fake).synchronize({lessons:[row('lesson',2)],students:[],teachers:[]},{sourceHash:'race'}),/revision 衝突/);
 assert.deepEqual(fake.store.get('lessons/lesson').record,row('lesson',99));
});

test('讀回少一筆、多一筆或內容不同都不得 verified',async()=>{
 for(const mutate of [store=>store.delete('lessons/one'),store=>store.set('lessons/extra',{...store.get('lessons/one'),recordId:'extra',record:row('extra',1)}),store=>store.set('lessons/one',{...store.get('lessons/one'),record:row('one',99)})]){
  let lists=0;const fake=fakeFirestore(),original=fake.getCollectionDocuments;
  fake.getCollectionDocuments=async path=>{const rows=await original(path);lists++;if(lists>3&&path.includes('/lessons/')){mutate(fake.store);return original(path)}return rows};
  await assert.rejects(adapter(fake).synchronize({lessons:[row('one',1)],students:[],teachers:[]},{sourceHash:'verify'}),/不一致/);
 }
});
