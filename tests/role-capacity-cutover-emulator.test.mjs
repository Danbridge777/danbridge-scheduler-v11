import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {scopedFirestore} from './helpers/scoped-firestore.mjs';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';
const {planPublishedRoleChunks}=createRequire(import.meta.url)('../functions/published-role-chunk-plan.cjs');
const {auditPublishedRoleReadback}=createRequire(import.meta.url)('../functions/audit-published-role-readback.cjs');

test('native same-revision compaction deletes only duplicate fields, preserves readers, repeats safely and rolls back', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:60000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const native=new Firestore({projectId:'demo-danbridge-capacity-cutover'}),prefix='acceptancePublishedTransport/run-277-capacity-'+randomUUID(),db=scopedFirestore(native,prefix);
 const source={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),teachers:[{id:'teacher',name:'Synthetic teacher',rate:300}],students:[{id:'student',name:'Synthetic student',parent:'Synthetic parent',rate:800}],lessons:Array.from({length:20},(_,i)=>({id:'lesson-'+i,teacherId:'teacher',studentId:'student',date:'2026-09-14',start:'08:00',end:'09:00',branchId:i%2?'hexi':'art_museum'}))};
 const accessRows=[{email:'teacher@example.test',role:'teacher',teacherId:'teacher'},{email:'aa0966626336@gmail.com',role:'teacher',canManageSchedule:true,teacherId:'aa'},{email:'branch@example.test',role:'branch_manager',teacherId:'branch',branchIds:['art_museum']}].map(r=>({...r,active:true,companyId:'danbridge'}));
 const options={source,accessRows,sourceRevision:10,sourceHash:recordDataHash(source),release:'20.26.319',now:Date.parse('2026-09-13T00:00:00Z')};
 const deps={deleteField:()=>FieldValue.delete()};
 const run=preserveLegacyViews=>db.runTransaction(async tx=>{
  const plan=await planPublishedRoleChunks({...options,preserveLegacyViews},async path=>(await tx.get(db.doc(path))).data(),deps);
  assert.equal(plan.needsPreparation,false);
  for(const w of plan.writes)tx.set(db.doc(w.path),w.value,{merge:w.merge});
  return plan;
 });
 try{
  await native.doc(prefix).create({purpose:'synthetic-capacity-only'});
  for(const row of accessRows)await db.doc('companyAccess/'+row.email).set(row);
  const empty=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
  for(const op of buildFullRecordShadowPlan(empty,source,{environment:'production',sourceHash:'seed'}).operations)await db.doc(op.path).set(op.payload);
  await db.doc('companies/danbridge/productionRecordRuntime/safety').set({recordDataHash:options.sourceHash,recordRevision:10});
  const first=await run(true),before=new Map();
  for(const view of first.views)before.set(view.headPath,(await db.doc(view.headPath).get()).data());
  const compact=await run(false);assert.equal(compact.parts.length,0);assert.equal(compact.headWrites.length,6);
  for(const view of compact.views){
   const head=(await db.doc(view.headPath).get()).data(),old=before.get(view.headPath),key=view.kind==='branch_manager'?'scopedDb':'db';
   assert.equal(Object.hasOwn(head,key),false);const expected={...old};delete expected[key];assert.deepEqual(head,expected);
   const parts=await db.getAll(...view.manifest.chunkIds.map(id=>db.doc(`productionRoleChunkViews/${view.manifest.scope}/parts/${id}`)));
   const assembled=assembleRoleViewChunks(head.roleChunkManifest,parts.map(p=>p.data()),{identity:view.manifest.identity});
   assert.equal(recordDataHash(assembled),recordDataHash(old[key]));
   const row=accessRows.find(a=>a.email===view.email);assert.deepEqual((await db.doc('companyAccess/'+row.email).get()).data().branchIds,row.branchIds);
  }
  assert.equal((await run(false)).writes.length,0);
  const auditArgs={firestore:db,sourceHash:options.sourceHash,identity:{email:'owner@example.test'},primaryOwnerEmail:'owner@example.test'};
  const audit=await auditPublishedRoleReadback(auditArgs);assert.equal(audit.verified,true);assert.equal(audit.total,3);
  await assert.rejects(auditPublishedRoleReadback({...auditArgs,identity:{email:'revoked@example.test'}}),/revoked/);
  const v=compact.views[0],partRef=db.doc(`productionRoleChunkViews/${v.manifest.scope}/parts/${v.manifest.chunkIds[0]}`),part=(await partRef.get()).data();
  await partRef.delete();await assert.rejects(auditPublishedRoleReadback(auditArgs));await partRef.set(part);
  assert.equal((await auditPublishedRoleReadback(auditArgs)).verified,true);
  const rollback=await run(true);assert.equal(rollback.parts.length,0);
  for(const view of rollback.views)assert.deepEqual((await db.doc(view.headPath).get()).data(),before.get(view.headPath));
  assert.equal((await db.collection('companies/danbridge/scheduleNotifications').get()).size,0);
  assert.equal(recordDataHash(source),options.sourceHash);
 }finally{await native.recursiveDelete(native.doc(prefix));await native.terminate()}
});
