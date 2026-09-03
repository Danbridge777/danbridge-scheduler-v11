import test from 'node:test';
import assert from 'node:assert/strict';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {createFirebaseProductionRecordOperationAdapter,createFirebaseProductionRecordBatchAdapter} from '../js/core/firebase-production-record-runtime-adapter.js';
import {projectProductionTeacherDb,projectProductionSchedulerDb} from '../js/core/production-role-view-projection.js';

test('真實本機 Firestore：三裝置競爭新增→拖移→複製→批次刪除→同ID復原，權威回讀不遺失', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:120000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const firestore=new Firestore({projectId:'demo-danbridge-schedule-test'}),empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const baseline={...empty(),students:[{id:'test-student',name:'Isolated'}],teachers:[1,2,3].map(n=>({id:'teacher-'+n,name:'Teacher '+n})),lessons:[]};
 const epoch='production-emulator-epoch',hash=recordDataHash(baseline),control=buildProductionRecordRuntimeControl({activationEpoch:epoch,legacyVersionHash:'seed:1',recordDataHash:hash,sourceSha256:'a'.repeat(64),documentCount:4,activeCount:4,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'emulator-only',activatedAt:'2026-09-03T00:00:00.000Z'});
 const runTransaction=callback=>firestore.runTransaction(t=>callback({get:path=>t.get(firestore.doc(path)),set:(path,value)=>t.set(firestore.doc(path),value),delete:path=>t.delete(firestore.doc(path))}));
 const dependencies={runTransaction,serverTimestamp:()=>FieldValue.serverTimestamp(),actor:{uid:'test-owner',email:'owner@example.com'},role:'owner'};
 const adapter=createFirebaseProductionRecordOperationAdapter(dependencies),batchAdapter=createFirebaseProductionRecordBatchAdapter(dependencies);
 const read=async()=>{const snapshots=await Promise.all(FULL_RECORD_COLLECTIONS.map(name=>firestore.collection('productionFullRecordShadows/danbridge/collections/'+name+'/records').get()));return Object.fromEntries(FULL_RECORD_COLLECTIONS.map((name,i)=>[name,snapshots[i].docs.map(d=>({id:d.id,data:d.data()}))]))};
 const timings=[],sequences=new Map();
 const prepare=(documents,baselineDb,localDb,deviceId)=>{const p=prepareActiveRecordSync({documentsByCollection:documents,baselineDb,localDb,environment:'production',deviceId,activationEpoch:epoch,startSequence:sequences.get(deviceId)||1});sequences.set(deviceId,p.nextSequence);return p};
 const mutate=async(device,base,desired)=>{const started=performance.now();let conflicts=0;for(let attempt=0;attempt<8;attempt++){const p=prepare(await read(),base,desired,device);try{for(const op of p.operations){await adapter.apply(op);assert.equal((await adapter.apply(op)).kind,'duplicate')}timings.push({device,elapsedMs:Math.round(performance.now()-started),conflicts});return p}catch(error){if(!/衝突|hash|head|權威/.test(error.message))throw error;conflicts++}}throw Error('Concurrent save did not converge')};
 const verify=async(expectedLessons)=>{const documents=await read(),rebuilt=rebuildFullRecordShadowDb(documents,{environment:'production'}),safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(rebuilt.db.lessons.length,expectedLessons);assert.equal(recordDataHash(rebuilt.db),safety.recordDataHash);assert.equal(rebuilt.activeCount,safety.activeCount);assert.equal(rebuilt.tombstoneCount,safety.tombstoneCount);return rebuilt.db};
 try{
  const seed=firestore.batch();seed.set(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH),control);seed.set(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:'2026-09-03T00:00:00.000Z'}));for(const op of buildFullRecordShadowPlan(empty(),baseline,{environment:'production',sourceHash:'seed'}).operations)seed.set(firestore.doc(op.path),op.payload);await seed.commit();
  const makeLesson=n=>({id:'test-lesson-'+n,studentId:'test-student',teacherId:'teacher-'+n,teacherIds:['teacher-'+n],date:'2026-10-01',start:'20:00',end:'20:30',location:'美術東四路',branchId:'art_museum',status:'未上課'});
  await Promise.all([1,2,3].map(n=>mutate('device-'+n,baseline,{...structuredClone(baseline),lessons:[makeLesson(n)]})));
  const added=await verify(3);
  await Promise.all([1,2,3].map(n=>{const desired=structuredClone(added);desired.lessons.find(l=>l.id==='test-lesson-'+n).date='2026-10-02';return mutate('device-'+n,added,desired)}));
  const moved=await verify(3);assert.ok(moved.lessons.every(l=>l.date==='2026-10-02'));
  const copied={...structuredClone(moved),lessons:[...structuredClone(moved.lessons),...moved.lessons.map(l=>({...l,id:l.id+'-copy',date:'2026-10-03'}))]};await mutate('copy-device',moved,copied);const copiedDb=await verify(6);
  for(const n of [1,2,3]){const scoped=projectProductionTeacherDb(copiedDb,'teacher-'+n);assert.equal(scoped.lessons.length,2);assert.ok(scoped.lessons.every(l=>l.teacherId==='teacher-'+n))}assert.equal(projectProductionSchedulerDb(copiedDb).lessons.length,6);
  const deletePlan=prepare(await read(),copiedDb,{...copiedDb,lessons:[]},'delete-device'),batch={activationEpoch:epoch,reason:'delete-lessons',operations:deletePlan.operations};const start=performance.now();const result=await batchAdapter.apply(batch,'delete-emulator-test');assert.equal(result.write,true);assert.equal((await batchAdapter.apply(batch,'delete-emulator-test')).kind,'duplicate-batch');await verify(0);timings.push({device:'batch-delete',elapsedMs:Math.round(performance.now()-start)});
  const deleted=await verify(0);await mutate('restore-device',deleted,{...deleted,lessons:[makeLesson(1)]});const restored=await verify(1);assert.equal(restored.lessons[0].id,'test-lesson-1');const restoredDocument=(await read()).lessons.find(l=>l.id==='test-lesson-1').data;assert.equal(restoredDocument.revision,4);assert.equal(restoredDocument.deleted,false);
  console.log('EMULATOR_ONLY_SCHEDULE_MEASUREMENTS '+JSON.stringify(timings));
 }finally{await firestore.terminate()}
});
