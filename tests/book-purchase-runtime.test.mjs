import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {Firestore,FieldValue} from '@google-cloud/firestore';
const {executeBookPurchase,normalizeInput}=createRequire(import.meta.url)('../functions/book-purchase-runtime.cjs');
const {acknowledgeScheduleNotifications}=createRequire(import.meta.url)('../functions/production-notification-acknowledge.cjs');
const {scheduleNotificationReadFilters,scheduleNotificationMatchesFilters}=await import('../js/core/schedule-notification-read-scope.js');
const actors=['Daniel','Catherine','AA','張毅'].map((name,i)=>({uid:'book_user_'+i,email:`book${i}@example.com`,displayName:name,role:i<2?'owner':i===2?'branch_manager':'teacher',active:true,companyId:'danbridge',teacherId:i===3?'teacher_book':'',branchIds:i===2?['east']:[],hideFinancials:i===2}));
test('actual callable rejects consumed App Check and unverified auth before database access',async()=>{
 const source=readFileSync(new URL('../functions/index.cjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function bookPurchaseHandler(environment)'),source.indexOf('exports.stagingBookPurchase='));
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
 const factory=new Function('HttpsError',body+';return bookPurchaseHandler;')(HttpsError);
 for(const environment of ['staging','production'])for(const request of [
  {auth:{uid:'fixture',token:{email_verified:true}},app:{alreadyConsumed:true}},
  {auth:{uid:'fixture',token:{email_verified:false}},app:{}},
  {auth:{uid:'fixture',token:{email_verified:true}}},
  {app:{}}
 ])await assert.rejects(factory(environment)(request),error=>error.code==='unauthenticated');
});
function memory(){
 const rows=new Map(actors.map(a=>['companyAccess/'+a.email,{...a}]));
 const collection=(path,options={})=>({path,options,orderBy:()=>collection(path,options),limit:n=>collection(path,{...options,limit:n}),startAfter:cursor=>collection(path,{...options,cursor})});
 const snap=(path,value)=>({id:path.split('/').at(-1),exists:value!==undefined,data:()=>structuredClone(value)});
 return{rows,db:{doc:path=>({path}),collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>{assert.equal(writes.length,0);if(ref.options)return{docs:[...rows].filter(([p])=>p.startsWith(ref.path+'/')&&!p.slice(ref.path.length+1).includes('/')&&(!ref.options.cursor||p.split('/').at(-1)>ref.options.cursor)).sort(([a],[b])=>a.localeCompare(b)).slice(0,ref.options.limit||Infinity).map(([p,v])=>snap(p,v))};return snap(ref.path,rows.get(ref.path))},set:(ref,v)=>writes.push([ref.path,v])});for(const [p,v] of writes)rows.set(p,structuredClone(v));return result}}};
}
const request=(id,patch={})=>({action:'create',id:'book_item_'+id,operationId:'book_op_'+id,expectedRevision:0,input:{title:'Cambridge '+id,quantity:2,publisher:'Test',isbn:'123',note:''},...patch});
test('four roles see all books; only exact creator can update/delete including Owner; notices scoped to all four',async()=>{
 const {db,rows}=memory(),call=(i,r)=>executeBookPurchase({firestore:db,identity:actors[i],request:r,serverTimestamp:()=>123});
 for(let i=0;i<4;i++)await call(i,request(i));
 for(let i=0;i<4;i++){
  assert.equal((await call(i,{action:'list'})).records.length,4-i);
  for(let j=0;j<4;j++)if(i!==j)for(const action of ['update','delete']){
   const before=JSON.stringify([...rows]);await assert.rejects(call(i,request(j,{action,operationId:`forged_${i}_${j}_${action}`,expectedRevision:1})),/只能/);assert.equal(JSON.stringify([...rows]),before);
  }
  const notices=[...rows].filter(([p])=>p.includes('/scheduleNotifications/')).map(([,v])=>v),filter=scheduleNotificationReadFilters({...actors[i],email:actors[i].email});
  assert.equal(notices.filter(n=>scheduleNotificationMatchesFilters(n,filter)).length,4+2*i);
  const updated=await call(i,request(i,{action:'update',operationId:'update_book_'+i,expectedRevision:1,input:{title:'Updated',quantity:3}}));assert.equal(updated.record.revision,2);
  const deleted=await call(i,request(i,{action:'delete',operationId:'delete_book_'+i,expectedRevision:2}));assert.equal(deleted.record.deleted,true);
 }
 assert.equal((await call(0,{action:'list'})).records.length,0);
});
test('replays deduplicate, stale revisions and forged creators rejected, revoked read/write denied',async()=>{
 const {db,rows}=memory(),call=r=>executeBookPurchase({firestore:db,identity:actors[0],request:r});
 const r=request('replay');const record=(await call({...r,input:{...r.input,createdByUid:'forged'}})).record;assert.equal(record.createdByUid,actors[0].uid);
 assert.equal((await call(r)).duplicate,true);const before=JSON.stringify([...rows]);await assert.rejects(call({...r,input:{...r.input,title:'Changed'}}),/衝突/);assert.equal(JSON.stringify([...rows]),before);
 await assert.rejects(call({...r,action:'update',operationId:'stale_update',expectedRevision:0}),/已更新/);
 rows.get('companyAccess/'+actors[0].email).active=false;await assert.rejects(call({action:'list'}),/未授權/);await assert.rejects(call(r),/未授權/);
});
test('pagination preserves 501 records, skips tombstones without stopping early; input limits',async()=>{
 const {db,rows}=memory();for(let i=0;i<502;i++)rows.set('bookPurchaseRequests/book_'+String(i).padStart(5,'0'),{id:'book_'+String(i).padStart(5,'0'),companyId:'danbridge',deleted:i===3});
 let cursor='',all=[];do{const r=await executeBookPurchase({firestore:db,identity:actors[0],request:{action:'list',cursor}});all.push(...r.records);cursor=r.nextCursor}while(cursor);
 assert.equal(all.length,501);assert.equal(new Set(all.map(r=>r.id)).size,501);
 for(const quantity of [0,-1,1.5,1000,NaN])assert.throws(()=>normalizeInput({title:'X',quantity}));
 assert.throws(()=>normalizeInput({title:'x'.repeat(201),quantity:1}));assert.equal(normalizeInput({title:' <script> ',quantity:999}).title,'<script>');
});
test('native Firestore atomic writes, concurrent replay, four-role notification isolation and creator guard',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:60000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(localhost|127\.0\.0\.1):\d+$/);
 const db=new Firestore({projectId:'demo-books-353'});
 try{
  for(const actor of actors)await db.doc('companyAccess/'+actor.email).set(actor);
  const call=(i,r)=>executeBookPurchase({firestore:db,identity:actors[i],request:r,serverTimestamp:()=>FieldValue.serverTimestamp()});
  for(let i=0;i<4;i++){
   const req=request('native_'+i),results=await Promise.all([call(i,req),call(i,req)]);
   assert.equal(results.filter(r=>!r.duplicate).length,1);
   for(let j=0;j<4;j++)if(i!==j)await assert.rejects(call(j,{...req,action:'delete',operationId:`forged_native_${i}_${j}`,expectedRevision:1}),/只能/);
  }
  for(let i=0;i<4;i++){
   assert.equal((await call(i,{action:'list'})).records.length,4-i);
   const filters=scheduleNotificationReadFilters({...actors[i],email:actors[i].email});
   let query=db.collection('companies/danbridge/scheduleNotifications');for(const f of filters)query=query.where(...f);
   const notices=(await query.get()).docs;
   assert.equal(notices.length,4+2*i);
   const acknowledged=await acknowledgeScheduleNotifications({firestore:db,actor:actors[i],notificationIds:notices.map(n=>n.id),serverTimestamp:()=>FieldValue.serverTimestamp()});
   assert.equal(acknowledged.updatedCount,notices.length);
   assert.ok((await query.get()).docs.every(n=>n.data().read===true));
   const req=request('native_'+i);
   await call(i,{...req,action:'update',operationId:'native_update_'+i,expectedRevision:1,input:{title:'Updated',quantity:3}});
   await call(i,{...req,action:'delete',operationId:'native_delete_'+i,expectedRevision:2});
   assert.equal((await db.doc('bookPurchaseRequests/'+req.id).get()).data().deleted,true);
  }
  assert.equal((await call(0,{action:'list'})).records.length,0);
  await db.doc('companyAccess/'+actors[0].email).update({active:false});await assert.rejects(call(0,{action:'list'}),/未授權/);
 }finally{await db.terminate()}
});
