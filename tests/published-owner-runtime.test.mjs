import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {scopedFirestore} from './helpers/scoped-firestore.mjs';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {prepareActiveRecordSync,canonicalizeActiveRecordPlanHeads} from '../js/core/cloud-active-record-sync.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {createProductionTrustedOperationClient} from '../js/core/production-trusted-operation-client.js';
const require=createRequire(import.meta.url),{createPublishedOwnerRuntime}=require('../functions/published-owner-runtime.cjs');
const {createProductionNotificationPublisher}=require('../functions/production-notification-publisher.cjs');
const schema='danbridge-production-trusted-operation-v1',responseSchema='danbridge-production-trusted-operation-response-v1';
const hash='record-v1:'+'a'.repeat(64),otherHash='record-v1:'+'b'.repeat(64);
const operation={environment:'production',companyId:'danbridge',activationEpoch:'test-epoch',operationId:'client-test-1',collection:'lessons',recordId:'test-lesson',targetHash:hash};
const publication={schema:'danbridge-owner-atomic-publication-v1',sourceHash:hash,sourceRecordRevision:1,notificationCount:4,roleViewCount:3};

test('lost batch responses replay the same identity even after client recreation',async()=>{
 const requests=[],identity={uid:'owner-test-1',email:'owner@example.test'};let fail=true;
 const factory=()=>createProductionTrustedOperationClient({getIdentity:()=>identity,call:async request=>{requests.push(request);if(fail){fail=false;throw Error('lost response')}return{schema:responseSchema,state:'committed',requestId:request.requestId,result:{write:true}}}});
 await assert.rejects(factory().applyBatch([operation]),/lost response/);
 await factory().applyBatch([structuredClone(operation)]);assert.equal(requests[0].requestId,requests[1].requestId);
 await factory().applyBatch([{...operation,operationId:'another-operation'}]);assert.notEqual(requests[1].requestId,requests[2].requestId);
});

test('browser skips redundant delivery only for validated exact-hash same-account atomic receipts',async()=>{
 let identity={uid:'owner-test-1',email:'owner@example.test'},reply={write:true,publication};
 const client=createProductionTrustedOperationClient({getIdentity:()=>identity,call:async request=>({schema:responseSchema,state:'committed',requestId:request.requestId,result:reply})});
 assert.equal(client.hasAtomicPublication(hash),false);await client.apply(operation);
 assert.equal(client.hasAtomicPublication(hash),true);assert.equal(client.hasAtomicPublication(otherHash),false);
 identity={uid:'owner-test-2',email:'owner2@example.test'};assert.equal(client.hasAtomicPublication(hash),false);
 reply={write:true,publication:{...publication,sourceHash:otherHash}};await assert.rejects(client.apply(operation),/receipt 無效/);
 assert.equal(client.hasAtomicPublication(hash),false);assert.equal(client.hasAtomicPublication(otherHash),false);
 reply={write:true};await client.apply(operation);assert.equal(client.hasAtomicPublication(hash),false);
 identity=null;assert.equal(client.hasAtomicPublication(hash),false);
});

test('malformed atomic delivery markers cannot suppress notification retries',async()=>{
 for(const invalid of [{...publication,notificationCount:-1},{...publication,sourceRecordRevision:1.5},{...publication,schema:'old'},{...publication,roleViewCount:'3'}]){
  const client=createProductionTrustedOperationClient({getIdentity:()=>({uid:'owner-test-1',email:'owner@example.test'}),call:async request=>({schema:responseSchema,state:'committed',requestId:request.requestId,result:{publication:invalid}})});
  await assert.rejects(client.apply(operation),/receipt 無效/);assert.equal(client.hasAtomicPublication(hash),false);
 }
});

const cloudAcceptance=process.env.DANBRIDGE_ISOLATED_CLOUD_ACCEPTANCE==='staging-owner-published-278';
test('Owner lease fencing and authority reads overlap, but an invalid fence cannot return even a saved receipt',async()=>{
 const {COMMIT_LEASE_PATH}=require('../functions/production-commit-lease.cjs');
 const {nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');
 const base=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const docs=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const actor={uid:'lease-overlap-owner',email:'owner@example.test'},identity={...actor,emailVerified:true,appVerified:true};
 const plan=prepareActiveRecordSync({documentsByCollection:docs,baselineDb:base,localDb:{...base,students:[{id:'synthetic-student',name:'Synthetic'}]},environment:'production',deviceId:'lease-overlap-device',activationEpoch:'lease-overlap-epoch'});
 const request={schema,actor,kind:'record.apply',requestId:plan.operations[0].operationId,operation:plan.operations[0]};
 const saved={schema:responseSchema,state:'committed',requestId:request.requestId,result:{write:true}};
 for(const mode of ['valid','replaced','expired','read-failed']){
  let held,releaseFence,timer,fenceSettled=false,overlapReads=0,writes=0;
  const ref=path=>({path,create:async value=>{assert.equal(path,COMMIT_LEASE_PATH);held=value;return{writeTime:'test-update-time'}},delete:async()=>{}});
  const snapshot=(path,data)=>({exists:data!==undefined,ref:ref(path),data:()=>data,docs:[]});
  const firestore={doc:ref,collection:path=>({path,where(){return this}}),runTransaction:async callback=>callback({
   get:async reference=>{
    if(reference.path===COMMIT_LEASE_PATH)return new Promise(resolve=>{
     releaseFence=()=>{fenceSettled=true;resolve(snapshot(COMMIT_LEASE_PATH,{...held,token:mode==='replaced'?'replacement-holder':held.token,expiresAtMs:mode==='expired'?Date.now()-1:held.expiresAtMs}))};
     // Makes the old serial implementation finish deterministically, then
     // fail the overlap assertion instead of hanging the test.
     timer=setTimeout(releaseFence,100);
    });
    if(!fenceSettled){overlapReads++;queueMicrotask(releaseFence)}
    if(mode==='read-failed'&&reference.path===PRODUCTION_RECORD_SAFETY_PATH)throw Error('injected authority read failure');
    if(reference.path==='companyAccess')return{docs:[{id:actor.email,data:()=>({role:'owner',active:true,companyId:'danbridge'})}]};
    if(reference.path.includes('/productionOwnerPublicationReceipts/'))return snapshot(reference.path,{fingerprint:nativeCanonicalSha256(request),uid:actor.uid,email:actor.email,response:saved});
    return snapshot(reference.path,undefined);
   },set:()=>{writes++},delete:()=>{writes++}
  })};
  const runtime=await createPublishedOwnerRuntime({firestore,serverTimestamp:()=>null,deleteField:()=>null,primaryOwnerEmail:actor.email,release:'20.26.310'});
  try{
   if(mode==='valid')assert.deepEqual(await runtime.execute(request,identity),saved);
   else await assert.rejects(runtime.execute(request,identity),mode==='read-failed'?/injected authority read failure/:/依序提交/);
   assert.equal(overlapReads,23,'all seven metadata and sixteen authority reads start while the fence is pending');
   assert.equal(writes,0,'replay or rejected fence cannot write');
  }finally{clearTimeout(timer)}
 }
});

for(const preserveLegacyViews of [false,true])test(`native Firestore Owner: authority, 40-lesson changes, roles and notices commit atomically; replays/revocation/preparation are safe (legacy compatibility: ${preserveLegacyViews})`,{skip:preserveLegacyViews?(!process.env.FIRESTORE_EMULATOR_HOST||cloudAcceptance):!process.env.FIRESTORE_EMULATOR_HOST&&!cloudAcceptance,timeout:600000},async()=>{
 let settings={projectId:'demo-danbridge-owner-published'};
 if(cloudAcceptance){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,undefined);
  const root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();
  await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877-staging',user:account.user,tokens:account.tokens});
  const token=await require(root+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
  settings={projectId:'danbridge-d8877-staging',authClient};
 }else{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
  // REST's auth layer also runs against the emulator. Use its synthetic
  // administrative token only after asserting the endpoint is loopback.
  if(process.env.FIRESTORE_PREFER_REST==='true'){
   const authClient=new OAuth2Client();authClient.setCredentials({access_token:'owner'});
   settings={...settings,authClient,preferRest:true};
  }
 }
 const native=new Firestore(settings),prefix='acceptancePublishedTransport/owner-278-'+randomUUID(),firestore=scopedFirestore(native,prefix),purpose='published-owner-278-isolated-synthetic-only';
 await native.doc(prefix).create({purpose,createdAt:FieldValue.serverTimestamp()});
 const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const baseline={...empty(),branches:[{id:'art_museum',name:'隔離校區'}],students:[{id:'student1',name:'隔離學生',rate:600,parentContact:'private'},...Array.from({length:400},(_,i)=>({id:'archived-'+i,name:'隔離容量學生'+i,rate:900,parentContact:'private'}))],teachers:[{id:'teacher1',name:'隔離老師',rate:300}]};
 const actor={uid:'isolated-owner-278',email:'owner@example.test'},identity={...actor,emailVerified:true,appVerified:true};
 const members=[{email:actor.email,role:'owner'},{email:'aa0966626336@gmail.com',role:'teacher',teacherId:'aa',canManageSchedule:true},{email:'teacher@example.test',role:'teacher',teacherId:'teacher1'},{email:'branch@example.test',role:'branch_manager',teacherId:'branch',branchIds:['art_museum']}].map(row=>({...row,companyId:'danbridge',active:true,accessRevision:0}));
 const epoch='owner-published-278',control=buildProductionRecordRuntimeControl({activationEpoch:epoch,legacyVersionHash:'seed:1',recordDataHash:recordDataHash(baseline),sourceSha256:'a'.repeat(64),documentCount:403,activeCount:403,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'isolated-only',activatedAt:'2026-09-11T00:00:00.000Z'});
 const dependencies={firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:actor.email,release:'20.26.278',preserveLegacyViews,historyVersionCache:process.env.DANBRIDGE_TEST_HISTORY_VERSION_CACHE==='1',now:()=>Date.parse('2026-09-11T00:00:00Z')};
 const read=async()=>{const all=await Promise.all(FULL_RECORD_COLLECTIONS.map(k=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get()));return Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,all[i].docs.map(row=>({id:row.id,data:row.data()}))]))};
 let sequence=0;const timings=[];
 const plan=async target=>{const documents=await read(),source=rebuildFullRecordShadowDb(documents,{environment:'production'});return prepareActiveRecordSync({documentsByCollection:documents,baselineDb:source.db,localDb:target(source.db),environment:'production',deviceId:'owner-test-'+(++sequence),activationEpoch:epoch,createdAt:'2026-09-11T00:00:00.000Z'})};
 const requestFor=plan=>({schema,actor,kind:'record.batch.apply',requestId:'owner-batch-'+sequence,batch:{activationEpoch:epoch,reason:'daily-record-sync',operations:plan.operations}});
 try{
  const seed=firestore.batch();seed.set(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH),control);seed.set(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:control.activatedAt}));for(const row of members)seed.set(firestore.doc('companyAccess/'+row.email),row);for(const op of buildFullRecordShadowPlan(empty(),baseline,{environment:'production',sourceHash:'seed'}).operations)seed.set(firestore.doc(op.path),op.payload);await seed.commit();
  const runtime=await createPublishedOwnerRuntime(dependencies);
  const legacyPublisher=await createProductionNotificationPublisher(dependencies);let previousLegacy=null;
  const lessons=Array.from({length:40},(_,i)=>({id:'owner-lesson-'+i,studentId:'student1',teacherId:'teacher1',teacherIds:['teacher1'],date:new Date(Date.UTC(2026,10,i+1)).toISOString().slice(0,10),start:'08:00',end:'09:00',branchId:'art_museum',status:'未上課'}));
  const create=await plan(db=>({...db,lessons})),createRequest=requestFor(create);
  let preparationBatches=0;
  const interruptedStore=new Proxy(firestore,{get(target,key){if(key==='batch')return()=>{const batch=target.batch(),commit=batch.commit.bind(batch);batch.commit=async()=>{const ordinal=++preparationBatches;assert.equal((await firestore.doc('companies/danbridge/productionRuntimeLocks/recordCommit').get()).exists,true,'one logical operation retains the lease during part preparation');if(ordinal===2)throw Object.assign(Error('injected Owner preparation disconnect'),{code:14});return commit()};return batch};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}});
  const interrupted=await createPublishedOwnerRuntime({...dependencies,firestore:interruptedStore});
  await assert.rejects(interrupted.execute(createRequest,identity),/injected Owner preparation disconnect/);
  assert.equal((await firestore.doc('companies/danbridge/productionRuntimeLocks/recordCommit').get()).exists,false,'failed preparation releases its own lease after draining every in-flight part');
  assert.ok(preparationBatches>=2&&preparationBatches<=4,'failed preparation stops admission and drains its bounded in-flight commits');assert.equal((await firestore.collection('productionFullRecordShadows/danbridge/collections/lessons/records').get()).size,0);assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,0);assert.equal((await firestore.collection('companies/danbridge/productionHighRiskReceipts').get()).size,0);
  let noticesBefore=0;
  const executeAndVerify=async(input,count)=>{
   const at=performance.now(),result=await runtime.execute(input,identity);timings.push(performance.now()-at);assert.equal(result.result.publication.schema,publication.schema);
   assert.deepEqual(await runtime.execute(input,identity),result,'replay returns identical receipt');
   const documents=await read(),rebuilt=rebuildFullRecordShadowDb(documents,{environment:'production'}),safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(rebuilt.db.lessons.length,count);assert.equal(recordDataHash(rebuilt.db),safety.recordDataHash);assert.equal(result.result.publication.sourceHash,safety.recordDataHash);
   const notices=await firestore.collection('companies/danbridge/scheduleNotifications').get();assert.equal(notices.size,noticesBefore+4);noticesBefore=notices.size;
   const current=notices.docs.filter(row=>row.data().sourceRecordRevision===safety.recordRevision);assert.equal(current.length,4);assert.ok(current.every(row=>row.data().changeCount===40));
   const receipt=await firestore.doc(result.result.receiptPath).get();assert.ok(current.every(row=>row.updateTime.isEqual(receipt.updateTime)),'notices and authority adapter receipt same commit');
   const proofs=await firestore.collection('companies/danbridge/productionNotificationDeliveryProofs').get();
   const currentProofs=proofs.docs.filter(row=>row.data().sourceHash===safety.recordDataHash);
   assert.equal(currentProofs.length,40,'every changed lesson has a server delivery proof, including deletion');
   assert.ok(currentProofs.every(row=>row.updateTime.isEqual(receipt.updateTime)),'delivery proofs commit with notices and authority');
   if(previousLegacy){const replay=await legacyPublisher.execute(previousLegacy,actor);assert.equal(replay.kind,'duplicate');assert.equal(replay.writeCount,0,'completed retry remains valid after authority advances')}
   const fields=['companyId','recipientEmail','recipientRole','teacherId','branchIds','teacherName','title','message','changeCount','details','read','createdBy','createdByName'];
   const legacy={schema:'danbridge-production-schedule-notification-publish-v1',requestId:'legacy_owner_'+timings.length,sourceHash:safety.recordDataHash,release:'20.26.276',notifications:current.map((row,i)=>({id:`legacy_owner_${timings.length}_${i}`,payload:Object.fromEntries(fields.map(key=>[key,row.data()[key]]))}))};
   const legacyResult=await legacyPublisher.execute(legacy,actor);assert.equal(legacyResult.writeCount,0);assert.equal(legacyResult.duplicateCount,4);
   assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,noticesBefore,'old browser fallback must not duplicate atomic notices');
   assert.equal((await legacyPublisher.execute(legacy,actor)).kind,'duplicate');previousLegacy=legacy;
   for(const path of ['companies/danbridge/teacherViews/teacher@example.test','companies/danbridge/schedulerViews/aa0966626336@gmail.com','companyAccess/branch@example.test']){const view=await firestore.doc(path).get();assert.ok(view.updateTime.isEqual(receipt.updateTime),JSON.stringify({path,viewTime:view.updateTime,receiptTime:receipt.updateTime,head:view.data().roleChunkManifest?.sourceHash,expected:safety.recordDataHash}));assert.equal(view.data().roleChunkManifest.sourceHash,safety.recordDataHash)}
   if(preserveLegacyViews){
    for(const expected of buildProductionRoleViews(rebuilt.db,members,{now:dependencies.now()})){
     const branch=expected.kind==='branch_manager',path=branch?'companyAccess/'+expected.email:`companies/danbridge/${expected.kind==='scheduler'?'schedulerViews':'teacherViews'}/${expected.email}`;
     const saved=(await firestore.doc(path).get()).data();
     assert.deepEqual(saved[branch?'scopedDb':'db'],expected.db,'Owner commit publishes current permission-filtered data to old clients too');
     assert.equal(saved[branch?'scopedClientHash':'clientHash'],expected.clientHash);
    }
   }
   return result;
  };
  await executeAndVerify(createRequest,40);
  for(let cycle=0;cycle<2;cycle++){
   const move=await plan(db=>({...db,lessons:db.lessons.map(row=>({...row,start:cycle?'10:00':'09:00',end:cycle?'11:00':'10:00'}))}));await executeAndVerify(requestFor(move),40);
  }
  const copy=await plan(db=>({...db,lessons:[...db.lessons,...db.lessons.map(row=>({...row,id:row.id+'-copy',start:'12:00',end:'13:00'}))]}));await executeAndVerify(requestFor(copy),80);
  const remove=await plan(db=>({...db,lessons:db.lessons.filter(row=>row.id.endsWith('-copy'))}));await executeAndVerify(requestFor(remove),40);
  const removeCopy=await plan(db=>({...db,lessons:[]}));await executeAndVerify(requestFor(removeCopy),0);
  // Restore preview is side-effect-free for courses/heads/notices, and a
  // subsequent authority revision invalidates it before any write.
  const restore=await plan(db=>({...db,lessons})),preview={...requestFor(restore),kind:'record.batch.preview',requestId:'owner-preview',batch:{...requestFor(restore).batch,reason:'restore'}};
  const beforeHead=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data(),previewResult=await runtime.execute(preview,identity);assert.equal(previewResult.result.kind,'preview');assert.equal(previewResult.result.publication,undefined);assert.deepEqual((await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data(),beforeHead);assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,noticesBefore);
  const rename=await plan(db=>({...db,students:db.students.map(row=>row.id==='student1'?{...row,name:'隔離學生更新'}:row)})),single={schema,actor,kind:'record.apply',requestId:rename.operations[0].operationId,operation:rename.operations[0]};
  const renamed=await runtime.execute(single,identity);assert.equal(renamed.result.publication.notificationCount,0);assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,noticesBefore);
  await assert.rejects(runtime.execute({...preview,kind:'record.batch.apply',requestId:'stale-restore',batch:{...preview.batch,previewId:'owner-preview'}},identity),/失效|已變更/);
  // A legacy plan has non-canonical intermediate heads. A rolling backend
  // MUST NOT accept its first 8-of-20 worker chunk as a complete authority.
  // Publish the canonical-head client before enabling the atomic backend.
  if(preserveLegacyViews){
   const oldPlan=await plan(db=>({...db,lessons:lessons.slice(0,20)}));
   const beforeLegacy=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();
   const beforeLegacyNotices=(await firestore.collection('companies/danbridge/scheduleNotifications').get()).size;
   await assert.rejects(runtime.execute({...requestFor(oldPlan),requestId:'old-page-eight-of-twenty',batch:{activationEpoch:epoch,reason:'daily-record-sync',operations:oldPlan.operations.slice(0,8)}},identity),/Owner authority verification failed \(target: hash\)/);
   assert.deepEqual((await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data(),beforeLegacy,'legacy protocol mismatch commits no authority data');
   assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,beforeLegacyNotices);
   assert.equal(rebuildFullRecordShadowDb(await read(),{environment:'production'}).db.lessons.length,0);
   for(const targetLessons of [lessons.slice(0,3),lessons.slice(0,3).map(row=>({...row,start:'11:00',end:'12:00'})),[]]){
    const legacyPlan=await canonicalizeActiveRecordPlanHeads(await plan(db=>({...db,lessons:targetLessons})),await read());
    for(const operation of legacyPlan.operations){
     const legacyRequest={schema,actor,kind:'record.apply',requestId:operation.operationId,operation};
     const result=await runtime.execute(legacyRequest,identity);
     assert.deepEqual(await runtime.execute(legacyRequest,identity),result,'canonical single-operation retries preserve their committed result');
     const documents=await read(),source=rebuildFullRecordShadowDb(documents,{environment:'production'});
     const safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();
     assert.equal(recordDataHash(source.db),safety.recordDataHash);
     for(const expected of buildProductionRoleViews(source.db,members,{now:dependencies.now()})){
      const branch=expected.kind==='branch_manager',path=branch?'companyAccess/'+expected.email:`companies/danbridge/${expected.kind==='scheduler'?'schedulerViews':'teacherViews'}/${expected.email}`;
      const saved=(await firestore.doc(path).get()).data();
      assert.deepEqual(saved[branch?'scopedDb':'db'],expected.db,'old recipients remain current after each old-protocol operation');
      assert.equal(saved.roleChunkManifest.sourceHash,safety.recordDataHash);
     }
    }
    const rebuilt=rebuildFullRecordShadowDb(await read(),{environment:'production'});
    assert.deepEqual(rebuilt.db.lessons,targetLessons,'canonical client create, move and delete sequence preserves exact data');
   }
   noticesBefore=(await firestore.collection('companies/danbridge/scheduleNotifications').get()).size;
   assert.equal(noticesBefore,24+9*4,'nine real lesson mutations publish once for each of four recipients, without retry duplicates');
  }
  const revoke={schema,actor,kind:'access.mutate',requestId:'revoke-teacher',mutation:{action:'delete',email:'teacher@example.test',expectedRevision:0,detail:{release:'20.26.278'}}};
  const revoked=await runtime.execute(revoke,identity);assert.equal(revoked.result.publication.notificationCount,0);assert.equal((await firestore.doc('companies/danbridge/teacherViews/teacher@example.test').get()).exists,false);assert.equal((await firestore.doc('companyAccess/teacher@example.test').get()).exists,false);
  const scoped={schema,actor,kind:'access.mutate',requestId:'branch-scope-change',mutation:{action:'upsert',email:'branch@example.test',expectedRevision:0,payload:{role:'branch_manager',teacherId:'branch',branchIds:['hexi'],active:true},detail:{release:'20.26.278'}}};
  await runtime.execute(scoped,identity);assert.deepEqual((await firestore.doc('companyAccess/branch@example.test').get()).data().branchIds,['hexi']);
  const branchBefore=(await firestore.doc('companyAccess/branch@example.test').get()).data();
  await runtime.execute({...scoped,requestId:'branch-name-only',mutation:{...scoped.mutation,expectedRevision:1,payload:{...scoped.mutation.payload,displayName:'隔離主管改名'}}},identity);
  const branchAfter=(await firestore.doc('companyAccess/branch@example.test').get()).data();assert.deepEqual(branchAfter.roleChunkManifest,branchBefore.roleChunkManifest,'unchanged branch scope must retain its manifest after access replacement');assert.equal(branchAfter.accessRevision,2);
  const ordinaryOwner=await createPublishedOwnerRuntime({...dependencies,primaryOwnerEmail:'primary@example.test'});
  await firestore.doc('companyAccess/'+actor.email).update({active:false});await assert.rejects(ordinaryOwner.execute(createRequest,identity),/有效 Owner/);
  await assert.rejects(runtime.execute(createRequest,{...identity,appVerified:false}),/authentication/);
  assert.equal((await read()).lessons.filter(row=>row.data.deleted!==true).length,0);
  console.log('ISOLATED_OWNER_ATOMIC_ACCEPTANCE '+JSON.stringify({project:settings.projectId,namespace:prefix,batches:timings.length,commitMs:timings,formalDataWrites:0,productionDeployment:false,callableAuthenticationTested:false}));
 }finally{
  if((await native.doc(prefix).get()).data()?.purpose!==purpose)throw Error('Owner cleanup namespace ownership mismatch');
  await native.recursiveDelete(native.doc(prefix));console.log('ISOLATED_OWNER_NAMESPACE_REMOVED '+prefix);await native.terminate();
 }
});
