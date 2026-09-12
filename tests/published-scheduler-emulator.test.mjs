import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {randomUUID} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {scopedFirestore} from './helpers/scoped-firestore.mjs';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {SCHEDULER_OPERATION_SCHEMA,SCHEDULER_OPERATION_RESPONSE_SCHEMA,schedulerLesson} from '../js/core/production-scheduler-operation.js';
import {createRoleViewTransportSession} from '../js/core/role-view-transport-session.js';
const {createProductionSchedulerRuntime}=createRequire(import.meta.url)('../functions/production-scheduler-runtime.cjs');
const {createPublishedRolePublisher}=createRequire(import.meta.url)('../functions/published-role-publisher.cjs');
const {COMMIT_LEASE_PATH}=createRequire(import.meta.url)('../functions/production-commit-lease.cjs');
const cloudAcceptance=process.env.DANBRIDGE_ISOLATED_CLOUD_ACCEPTANCE==='staging-published-277';
for(const preserveLegacyViews of [false,true])test(`native Firestore: 40-command writes, published role heads, notices and receipts commit together (legacy compatibility: ${preserveLegacyViews})`,{skip:preserveLegacyViews?(!process.env.FIRESTORE_EMULATOR_HOST||cloudAcceptance):!process.env.FIRESTORE_EMULATOR_HOST&&!cloudAcceptance,timeout:600000},async()=>{
 let settings={projectId:'demo-danbridge-published-scheduler'};
 if(cloudAcceptance){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,undefined,'Never mix emulator and real cloud modes');
  const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();
  await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877-staging',user:account.user,tokens:account.tokens});
  const token=await require(root+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
  authClient.setCredentials({access_token:token.access_token});
  settings={projectId:'danbridge-d8877-staging',authClient};
 }else assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const native=new Firestore(settings),prefix='acceptancePublishedTransport/run-277-'+randomUUID(),firestore=scopedFirestore(native,prefix),empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 await native.doc(prefix).create({purpose:'published-277-isolated-synthetic-only',createdAt:FieldValue.serverTimestamp()});
 const source={...empty(),branches:[{id:'art_museum',name:'測試'}],students:[{id:'s1',name:'隔離學生',rate:600,parentContact:'private'},...Array.from({length:400},(_,i)=>({id:'archived-'+i,name:'隔離資料庫學生'+i,rate:999,parentContact:'not-for-AA'}))],teachers:[{id:'t1',name:'隔離老師',rate:300}]},email='aa0966626336@gmail.com',actor={uid:'isolated-aa',email,emailVerified:true,appVerified:true};
 const members=[{email,role:'teacher',teacherId:'aa',canManageSchedule:true},{email:'teacher@example.test',role:'teacher',teacherId:'t1'},{email:'branch@example.test',role:'branch_manager',teacherId:'branch',branchIds:['art_museum']},{email:'owner@example.test',role:'owner'},{email:'revoked@example.test',role:'teacher',teacherId:'t1',active:false}].map(m=>({companyId:'danbridge',active:true,...m}));
 const control=buildProductionRecordRuntimeControl({activationEpoch:'published-scheduler-isolated-277',legacyVersionHash:'seed:1',recordDataHash:recordDataHash(source),sourceSha256:'a'.repeat(64),documentCount:403,activeCount:403,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'emulator-only',activatedAt:'2026-09-11T00:00:00.000Z'});
 try{
  const seed=firestore.batch();seed.set(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH),control);seed.set(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:control.activatedAt}));for(const m of members)seed.set(firestore.doc('companyAccess/'+m.email),m);for(const op of buildFullRecordShadowPlan(empty(),source,{environment:'production',sourceHash:'seed'}).operations)seed.set(firestore.doc(op.path),op.payload);await seed.commit();
  const phases=[];const runtime=await createProductionSchedulerRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:'owner@example.test',publishedRoleChunks:true,preserveLegacyViews,onTiming:event=>phases.push(event.phase),now:()=>Date.parse('2026-09-11T00:00:00Z')});
  let sequence=0;
  const request=changes=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:'published-277-'+(++sequence),release:'20.26.277',changes});
  const original=Array.from({length:40},(_,i)=>({id:'published-lesson-'+i,studentId:'s1',teacherId:'t1',teacherIds:['t1'],date:new Date(Date.UTC(2026,10,i+1)).toISOString().slice(0,10),start:'08:00',end:'09:00',branchId:'art_museum',status:'未上課'}));
  const coldRequest=request(original.map(row=>{const after={...row,id:row.id+'-0'};return{lessonId:after.id,before:null,after}}));
  let preparationBatches=0,preparationLeaseToken=null;
  const interruptedStore=new Proxy(firestore,{get(target,key){
   if(key==='batch')return()=>{const batch=target.batch(),commit=batch.commit.bind(batch);batch.commit=async()=>{
    const number=++preparationBatches,lease=await target.doc(COMMIT_LEASE_PATH).get();
    assert.equal(lease.exists,true,'scheduler retains its lease during immutable preparation');
    if(preparationLeaseToken===null)preparationLeaseToken=lease.data().token;
    assert.equal(lease.data().token,preparationLeaseToken,'all preparation batches share the same logical lease');
    if(number===2)throw Object.assign(Error('injected preparation disconnect'),{code:14});return commit();
   };return batch};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const interrupted=await createProductionSchedulerRuntime({firestore:interruptedStore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:'owner@example.test',publishedRoleChunks:true,preserveLegacyViews,now:()=>Date.parse('2026-09-11T00:00:00Z')});
  await assert.rejects(interrupted.execute(coldRequest,actor),/injected preparation disconnect/);
  assert.equal((await firestore.doc(COMMIT_LEASE_PATH).get()).exists,false,'failed preparation drains before releasing its lease');
  assert.ok(preparationBatches>=2&&preparationBatches<=4,'failed preparation stops admission and drains bounded in-flight commits');assert.equal((await firestore.collection('productionFullRecordShadows/danbridge/collections/lessons/records').get()).size,0);
  assert.equal((await firestore.doc('companies/danbridge/productionSchedulerReceipts/'+coldRequest.requestId).get()).exists,false);
  assert.equal((await firestore.collection('companies/danbridge/scheduleNotifications').get()).size,0);
  assert.equal((await firestore.collection('companies/danbridge/schedulerViews').get()).size,0);
  const sessions=[];
  for(const m of members.filter(m=>m.role!=='owner'&&m.active)){
   const kind=m.canManageSchedule?'scheduler':m.role,identity={kind,email:m.email,teacherId:m.teacherId,branchIds:m.branchIds||[]},path=kind==='branch_manager'?'companyAccess/'+m.email:`companies/danbridge/${kind==='scheduler'?'schedulerViews':'teacherViews'}/${m.email}`;
   const head=async()=>{const v=(await firestore.doc(path).get()).data();return kind==='branch_manager'?{...v,sourceRecordRevision:v.scopedSourceRecordRevision,sourceRecordHash:v.scopedSourceRecordHash}:v};
   const applied=[];sessions.push({kind,path,head,applied,session:createRoleViewTransportSession({identity,isActive:()=>true,readCurrentHead:head,readPart:async(id,scope)=>(await firestore.doc(`productionRoleChunkViews/${scope}/parts/${id}`).get()).data(),apply:(db,meta)=>applied.push({db,meta})})});
  }
  const timings=[],commitTimings=[],receiverTimings=[];
  for(let cycle=0;cycle<3;cycle++){
   const lessons=original.map(l=>({...l,id:l.id+'-'+cycle})),moved=lessons.map(l=>({...l,start:'09:00',end:'10:00'})),copied=moved.map(l=>({...l,id:l.id+'-copy',start:'10:00',end:'11:00'}));
   const sets=[lessons.map(after=>({lessonId:after.id,before:null,after})),moved.map((after,i)=>({lessonId:after.id,before:lessons[i],after})),copied.map(after=>({lessonId:after.id,before:null,after})),moved.map(before=>({lessonId:before.id,before,after:null})),copied.map(before=>({lessonId:before.id,before,after:null}))];
   for(let action=0;action<sets.length;action++){
    const input=cycle===0&&action===0?coldRequest:request(sets[action]),at=performance.now(),result=await runtime.execute(input,actor);commitTimings.push(performance.now()-at);assert.equal(result.schema,preserveLegacyViews?SCHEDULER_OPERATION_RESPONSE_SCHEMA:'danbridge-production-scheduler-chunk-response-v1');if(!preserveLegacyViews)assert.equal(result.schedulerDb,undefined);assert.equal(result.notificationCount,4);assert.deepEqual(await runtime.execute(input,actor),result);
    const safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(result.sourceRecordRevision,safety.recordRevision);assert.equal(result.sourceHash,safety.recordDataHash);
    const receiveStarted=performance.now();
    await Promise.all(sessions.map(async s=>{const saved=await s.head();await s.session.receive(saved);const last=s.applied.at(-1);if(preserveLegacyViews){
     const legacy=s.kind==='branch_manager'?saved.scopedDb:saved.db;
     const normalized=db=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,k==='changes'?db[k]:[...db[k]].sort((a,b)=>String(a.id).localeCompare(String(b.id)))]));
     assert.deepEqual(normalized(legacy),normalized(last.db),'old and new clients receive identical authorized content');
     if(s.kind==='scheduler')assert.deepEqual(normalized(result.schedulerDb),normalized(legacy),'old AA response and saved projection agree');
    }else{assert.equal(saved.db,undefined);assert.equal(saved.scopedDb,undefined)}assert.equal(last.meta.sourceRecordRevision,result.sourceRecordRevision);assert.equal(last.db.lessons.length,[40,40,80,40,0][action]);assert.equal(new Set(last.db.lessons.map(l=>l.id)).size,last.db.lessons.length);if(s.kind!=='branch_manager')assert.ok(last.db.students.every(student=>student.rate===undefined))}));
    receiverTimings.push(performance.now()-receiveStarted);
    const receipt=await firestore.doc('companies/danbridge/productionSchedulerReceipts/'+input.requestId).get(),notices=await firestore.collection('companies/danbridge/scheduleNotifications').where('sourceRecordRevision','==',result.sourceRecordRevision).get();assert.equal(notices.size,4);assert.ok(notices.docs.every(n=>n.updateTime.isEqual(receipt.updateTime)));assert.ok(notices.docs.every(n=>n.data().changeCount===40&&n.data().recipientEmail!=='revoked@example.test'));timings.push(performance.now()-at);
   }
  }
  const collections=await Promise.all(FULL_RECORD_COLLECTIONS.map(k=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get())),rebuilt=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,collections[i].docs.map(d=>({id:d.id,data:d.data()}))])),{environment:'production'});assert.equal(rebuilt.db.lessons.length,0);
  // Firestore enumerates document IDs, not fixture insertion order. Compare
  // every field by stable record ID; order is not stored by the record model.
  const byId=rows=>[...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const collection of FULL_RECORD_COLLECTIONS.filter(k=>k!=='lessons'&&k!=='changes'))assert.deepEqual(byId(rebuilt.db[collection]),byId(source[collection]),collection+' must remain unchanged');
  assert.ok(phases.includes('role-chunk-preparation'),'cold start must actually exercise immutable preparation');
  const publisher=await createPublishedRolePublisher({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:'primary@example.test',preserveLegacyViews,now:()=>Date.parse('2026-09-11T00:00:00Z')});
  const owner={uid:'isolated-owner',email:'owner@example.test',emailVerified:true,appVerified:true},head=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();
  const publish={schema:'danbridge-production-role-view-publish-v1',requestId:'owner-publish-277-first',sourceHash:head.recordDataHash,release:'20.26.277'};
  const published=await publisher.execute(publish,owner);assert.equal(published.result.formalRecordWrites,0);assert.equal(published.result.roleViewCount,3);assert.equal((await publisher.execute(publish,owner)).result.kind,'duplicate');
  const branchPath='companyAccess/branch@example.test',oldBranch=(await firestore.doc(branchPath).get()).data();
  await firestore.doc(branchPath).update({branchIds:['hexi']});
  await publisher.execute({...publish,requestId:'owner-publish-277-scope'},owner);
  const newBranch=(await firestore.doc(branchPath).get()).data();assert.notEqual(newBranch.roleChunkManifest.scope,oldBranch.roleChunkManifest.scope);assert.equal(newBranch.roleChunkManifest.publicationRevision,1);assert.equal(newBranch.scopedSourceRecordRevision,head.recordRevision);
  await firestore.doc('companyAccess/teacher@example.test').update({active:false});
  await publisher.execute({...publish,requestId:'owner-publish-277-revoke'},owner);
  assert.equal((await firestore.doc('companies/danbridge/teacherViews/teacher@example.test').get()).exists,false);
  await firestore.doc('companyAccess/owner@example.test').update({active:false});
  await assert.rejects(publisher.execute(publish,owner),/access revoked/);
  assert.deepEqual((await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data(),head,'Owner role publication must not alter formal authority');
  const oldRuntime=await createProductionSchedulerRuntime({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),primaryOwnerEmail:'owner@example.test'});
  const after={...original[0],id:'must-not-write-from-old-runtime'};
  await assert.rejects(oldRuntime.execute(request([{lessonId:after.id,before:null,after}]),actor),/舊排課服務不能覆蓋新版視圖/);
  assert.equal((await firestore.doc(`productionFullRecordShadows/danbridge/collections/lessons/records/${after.id}`).get()).exists,false);
  console.log('ISOLATED_NATIVE_40_PUBLICATION '+JSON.stringify({project:settings.projectId,namespace:prefix,cloudAcceptance,rounds:timings.length,minMs:Math.min(...timings),maxMs:Math.max(...timings),commitMs:{min:Math.min(...commitTimings),max:Math.max(...commitTimings),samples:commitTimings},receiverMs:{min:Math.min(...receiverTimings),max:Math.max(...receiverTimings),samples:receiverTimings},coldPreparation:true,formalDataWrites:0,productionDeployment:false,callableAuthenticationTested:false}));
 }finally{
  const marker=await native.doc(prefix).get();
  if(marker.data()?.purpose!=='published-277-isolated-synthetic-only')throw Error('Cleanup namespace ownership mismatch');
  await native.recursiveDelete(native.doc(prefix));
  console.log('ISOLATED_SYNTHETIC_NAMESPACE_REMOVED '+prefix);
  await native.terminate();
 }
});
