import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{refreshProductionHealth}=require('../functions/production-health-refresh.cjs');
const at=Date.parse('2026-09-12T07:00:00Z'),path='companies/danbridge/systemHealth/ownerAlert';
function fixture({errors=[],pending=0,unread=178,previous=null,protection={pitrEnabled:true,deleteProtectionEnabled:true},fail=null,capacity={schema:'danbridge-role-capacity-v1',roleCount:7,maximumBytes:100000,budgetBytes:800000,truncated:false}}={}){
 const writes=[],queries=[];
 const firestore={
  collection(name){assert.ok(['errorEvents','scheduleRequests','scheduleNotifications'].some(k=>name==='companies/danbridge/'+k));const q={name,filters:[],fields:[],limit:null};queries.push(q);const query={where(...args){q.filters.push(args);return query},select(...fields){q.fields=fields;return query},limit(n){q.limit=n;return query},async get(){if(fail)throw Error(fail);assert.equal(name,'companies/danbridge/errorEvents');return{docs:errors.map(row=>({data:()=>row}))}},count(){return{get:async()=>({data:()=>({count:name.endsWith('/scheduleRequests')?pending:unread})})}}};return query},
  doc(value){assert.equal(value,path);return{path:value}},
  async runTransaction(fn){return fn({get:async ref=>{assert.equal(ref.path,path);return{data:()=>previous}},set(ref,value,options){assert.equal(ref.path,path);assert.deepEqual(options,{merge:false});writes.push(value)}})}
 };
 return{writes,queries,run:()=>refreshProductionHealth({firestore,primaryOwnerEmail:'owner@example.com',readProtection:async()=>protection,readRoleCapacity:async()=>capacity,serverTimestamp:()=>null,now:()=>at})};
}
test('unread delivered notifications remain reminders, and health refresh writes only one metadata snapshot',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.state,'healthy');assert.equal(r.formalDataWrites,0);assert.equal(r.healthWrites,1);assert.deepEqual(r.alerts,[]);assert.deepEqual(r.reminders,['178 筆通知待閱讀']);assert.equal(r.metrics.unreadNotifications,178);
 assert.equal(f.writes.length,1);assert.ok(f.writes[0].checkedAt instanceof Date);assert.equal(f.writes[0].maxAgeMs,45*60000);
 const unread=f.queries.find(q=>q.name.endsWith('scheduleNotifications'));assert.deepEqual(unread.filters,[['recipientEmail','==','owner@example.com'],['read','==',false]]);
 assert.deepEqual(f.queries[0].fields,['area','code','release']);assert.equal(f.queries[0].limit,501);
});
test('unresolved error, pending request and unavailable database protection each remain attention',async()=>{
 for(const options of [{errors:[{code:'unavailable',area:'owner-upload',release:'20.26.311'}]},{pending:1},{protection:{pitrEnabled:false,deleteProtectionEnabled:true}},{protection:{configurationError:'database-metadata-unavailable'}}]){
  const f=fixture(options),r=await f.run();assert.equal(r.state,'attention');assert.ok(r.alerts.length>0);
 }
});
test('bounded error sample cannot hide unresolved errors behind resolved records',async()=>{
 const resolved={area:'owner-upload',code:'permission-denied',release:'20.26.123'};
 assert.equal((await fixture({errors:[resolved]}).run()).state,'healthy');
 const f=fixture({errors:Array.from({length:501},()=>resolved)}),r=await f.run();assert.equal(r.state,'attention');assert.equal(f.writes[0].recentErrorsTruncated,true);assert.match(r.alerts.join(''),/上限/);
});
test('failed reads or invalid aggregate never overwrite the last health snapshot',async()=>{
 for(const options of [{fail:'offline'},{pending:NaN},{unread:-1}]){const f=fixture(options);await assert.rejects(f.run());assert.equal(f.writes.length,0)}
});
test('an older overlapping health run cannot overwrite a later sample',async()=>{
 const f=fixture({previous:{sampleStartedAt:new Date(at+1000)}}),r=await f.run();assert.equal(r.state,'superseded');assert.equal(r.healthWrites,0);assert.equal(f.writes.length,0);
});
test('capacity warning is distinct from failure; critical capacity or incomplete sample needs attention',async()=>{
 for(const [maximumBytes,truncated,state] of [[559999,false,'healthy'],[560000,false,'healthy'],[720000,false,'attention'],[100,true,'attention']]){
  const f=fixture({capacity:{schema:'danbridge-role-capacity-v1',roleCount:7,maximumBytes,budgetBytes:800000,truncated}}),r=await f.run();assert.equal(r.state,state);
  assert.equal(f.writes[0].roleCapacity.maximumBytes,maximumBytes);
  if(maximumBytes===560000)assert.ok(r.reminders.some(x=>x.includes('容量遷移')));
 }
});
test('invalid capacity metadata cannot overwrite healthy or failed previous evidence',async()=>{const f=fixture({capacity:{schema:'danbridge-role-capacity-v1',roleCount:7,maximumBytes:NaN,budgetBytes:800000,truncated:false}});await assert.rejects(f.run(),/Invalid role capacity/);assert.equal(f.writes.length,0)});
