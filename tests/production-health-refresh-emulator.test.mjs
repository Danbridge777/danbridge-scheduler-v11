import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue,Timestamp} from '@google-cloud/firestore';
const {refreshProductionHealth}=createRequire(import.meta.url)('../functions/production-health-refresh.cjs');

test('Firestore emulator: exact owner aggregates, timestamp freshness, no business writes and failed/older runs preserve the snapshot', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:90000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const db=new Firestore({projectId:'demo-danbridge-health-refresh'}),base='companies/danbridge',health=db.doc(base+'/systemHealth/ownerAlert');
 let clock=Date.parse('2026-09-12T07:00:00Z');
 const run=options=>refreshProductionHealth({firestore:db,primaryOwnerEmail:'owner@example.com',readProtection:async()=>({pitrEnabled:true,deleteProtectionEnabled:true}),serverTimestamp:()=>FieldValue.serverTimestamp(),now:()=>clock,...options});
 try{
  const batch=db.batch();
  for(let i=0;i<12;i++)batch.set(db.doc(base+'/scheduleNotifications/n'+i),{recipientEmail:i<8?'owner@example.com':'other@example.com',read:i===0,createdAt:Timestamp.fromMillis(clock)});
  batch.set(db.doc(base+'/scheduleRequests/request'),{status:'completed'});
  batch.set(db.doc(base+'/errorEvents/old'),{occurredAt:Timestamp.fromMillis(clock-2*86400000),area:'unknown',code:'broken'});
  batch.set(db.doc(base+'/lessons/sentinel'),{id:'sentinel',note:'must remain unchanged'});
  batch.set(db.doc('companyAccess/capacity-teacher@example.test'),{companyId:'danbridge',active:true,role:'teacher'});
  batch.set(db.doc(base+'/teacherViews/capacity-teacher@example.test'),{roleChunkManifest:{digest:'test-capacity'},db:{notes:'x'.repeat(570000)}});
  batch.set(db.doc('companyAccess/archived@example.test'),{companyId:'danbridge',active:false,role:'teacher'});
  batch.set(db.doc(base+'/teacherViews/archived@example.test'),{roleChunkManifest:{digest:'test-capacity'},db:{notes:'x'.repeat(750000)}});
  await batch.commit();
  const paths=['scheduleNotifications','scheduleRequests','errorEvents','lessons','teacherViews'];
  const snapshot=async()=>Promise.all(paths.map(async path=>(await db.collection(base+'/'+path).get()).docs.map(d=>({id:d.id,updateTime:d.updateTime.toMillis(),data:d.data()}))));
  const before=await snapshot(),result=await run();
  assert.equal(result.state,'healthy');assert.equal(result.metrics.unreadNotifications,7);assert.equal(result.formalDataWrites,0);assert.equal(result.healthWrites,1);
  const saved=(await health.get()).data();assert.equal(saved.checkedAt.toMillis(),clock);assert.equal(saved.sampleStartedAt.toMillis(),clock);assert.equal(saved.maxAgeMs,2700000);assert.ok(saved.updatedAt instanceof Timestamp);
  assert.equal(saved.roleCapacity.roleCount,1);assert.ok(saved.roleCapacity.maximumBytes>=570000&&saved.roleCapacity.maximumBytes<600000);assert.ok(saved.reminders.some(text=>text.includes('容量遷移')));assert.doesNotMatch(JSON.stringify(saved.roleCapacity),/example.test|test-capacity/);
  assert.deepEqual(await snapshot(),before);
  clock-=1000;assert.equal((await run()).state,'superseded');assert.deepEqual((await health.get()).data(),saved);
  clock+=2000;await assert.rejects(run({readProtection:async()=>{throw Error('protection unavailable')}}),/protection unavailable/);assert.deepEqual((await health.get()).data(),saved);
  await db.doc(base+'/errorEvents/current').set({occurredAt:Timestamp.fromMillis(clock),area:'owner-upload',code:'unavailable',release:'20.26.311'});
  const broken=await run();assert.equal(broken.state,'attention');assert.equal(broken.metrics.recentErrors,1);assert.equal(broken.metrics.unreadNotifications,7);
 }finally{await db.terminate()}
});
