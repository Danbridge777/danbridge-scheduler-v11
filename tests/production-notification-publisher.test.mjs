import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createProductionNotificationPublisher}=require('../functions/production-notification-publisher.cjs');
const {buildNotificationDeliveryProofs}=require('../functions/production-notification-delivery-proof.cjs');
const {normalizeProductionScheduleNotificationPublishRequest}=await import('../js/core/production-notification-policy.js');
const root='companies/danbridge/',actor={uid:'owner-unit-278',email:'owner@example.test'},sourceHash='record-v1:'+'a'.repeat(64);
async function fixture({missingSecond=false,relay=false}={}){
 const detail=id=>({lessonId:id,type:'added',summary:'新增',studentName:'隔離學生',beforeTime:'',afterTime:'2026-11-01 10:00–11:00',before:null,after:{date:'2026-11-01',start:'10:00',end:'11:00',teacherIds:['t1']}});
 const eventActor=relay?{uid:'aa-unit-278',email:'aa0966626336@gmail.com'}:actor;
 const raw=normalizeProductionScheduleNotificationPublishRequest({schema:'danbridge-production-schedule-notification-publish-v1',requestId:'legacy-unit-278',sourceHash,release:'20.26.276',notifications:[{id:'legacy-notice-278',payload:{companyId:'danbridge',recipientEmail:'teacher@example.test',recipientRole:'teacher',teacherId:'t1',branchIds:[],changeCount:2,details:[detail('l1'),detail('l2')],read:false,createdBy:eventActor.uid}}]});
 const atomic={id:'atomic-notice-278',payload:{...raw.notifications[0].payload,details:missingSecond?[raw.notifications[0].payload.details[0]]:raw.notifications[0].payload.details}};
 const records=new Map(['l1','l2'].map(id=>[id,{revision:1,sourceHash,record:{id},deleted:false}]));
 const proofs=buildNotificationDeliveryProofs([atomic],records,eventActor,sourceHash);
 const store=new Map(structuredClone([
  [root+'productionRecordRuntime/safety',{state:'active',writeAllowed:true,recordDataHash:sourceHash}],
  ['companyAccess/'+actor.email,{active:true,companyId:'danbridge',role:'owner'}],
  ['companyAccess/teacher@example.test',{active:true,companyId:'danbridge',role:'teacher',teacherId:'t1'}],
  [root+'scheduleNotifications/'+atomic.id,{...atomic.payload,read:true}],
  ...[...records].map(([id,data])=>['productionFullRecordShadows/danbridge/collections/lessons/records/'+id,data]),...proofs.map(p=>[p.path,p.value])
 ]));
 const firestore={doc:path=>({path}),async runTransaction(fn){let writing=false;const writes=[];const result=await fn({get:async ref=>{assert.equal(writing,false,'all reads precede writes');return{exists:store.has(ref.path),id:ref.path.split('/').at(-1),data:()=>structuredClone(store.get(ref.path))}},set:(ref,value)=>{writing=true;writes.push([ref.path,structuredClone(value)])}});for(const [path,value] of writes)store.set(path,value);return result}};
 const publisher=await createProductionNotificationPublisher({firestore,serverTimestamp:()=>'<server timestamp>',primaryOwnerEmail:'primary@example.test'});
 return{store,publisher,raw,atomic,proofs};
}
test('legacy aggregate containing already delivered and missing events publishes only missing detail',async()=>{
 const f=await fixture({missingSecond:true}),result=await f.publisher.execute(f.raw,actor);
 assert.equal(result.writeCount,1);const saved=f.store.get(root+'scheduleNotifications/legacy-notice-278');assert.equal(saved.changeCount,1);assert.deepEqual(saved.details.map(d=>d.lessonId),['l2']);
 assert.equal(f.store.get(root+'scheduleNotifications/atomic-notice-278').read,true,'do not reset an already read atomic notice');
 f.store.get(root+'productionRecordRuntime/safety').recordDataHash='record-v1:'+'b'.repeat(64);
 assert.equal((await f.publisher.execute(f.raw,actor)).kind,'duplicate','same completed request works after a newer authority head');
});
test('Owner relay of an atomic AA event does not generate duplicate notifications',async()=>{
 const f=await fixture({relay:true});assert.equal((await f.publisher.execute(f.raw,actor)).writeCount,0);assert.equal(f.store.has(root+'scheduleNotifications/legacy-notice-278'),false);
});
test('missing atomic notice, mismatched revision or tampered notice cannot suppress delivery',async()=>{
 for(const mode of ['absent','revision','content']){
  const f=await fixture();
  if(mode==='absent')f.store.delete(root+'scheduleNotifications/atomic-notice-278');
  if(mode==='revision')f.store.get('productionFullRecordShadows/danbridge/collections/lessons/records/l1').revision=2;
  if(mode==='content')f.store.get(root+'scheduleNotifications/atomic-notice-278').details[0].after.end='12:00';
  assert.equal((await f.publisher.execute(f.raw,actor)).writeCount,1,mode);
  assert.equal(f.store.get(root+'scheduleNotifications/legacy-notice-278').changeCount,mode==='absent'?2:1);
 }
});
test('scope and caller are freshly checked even on completed receipt replay',async()=>{
 for(const target of ['owner','recipient']){
  const f=await fixture();await f.publisher.execute(f.raw,actor);
  f.store.get('companyAccess/'+(target==='owner'?actor.email:'teacher@example.test')).active=false;
  await assert.rejects(f.publisher.execute(f.raw,actor),/成員|撤銷/);
 }
});
test('stale unpublished jobs and changed receipt payloads fail without modifying data',async()=>{
 const f=await fixture();const before=structuredClone([...f.store]);
 await assert.rejects(f.publisher.execute({...f.raw,sourceHash:'record-v1:'+'b'.repeat(64)},actor),/權威 head/);assert.deepEqual([...f.store],before);
 await f.publisher.execute(f.raw,actor);const committed=structuredClone([...f.store]);
 await assert.rejects(f.publisher.execute({...f.raw,release:'20.26.278'},actor),/identity/);assert.deepEqual([...f.store],committed);
});
