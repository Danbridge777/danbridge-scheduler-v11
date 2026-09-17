import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH} from '../js/core/cloud-production-record-runtime.js';
import {schedulerLesson,SCHEDULER_OPERATION_SCHEMA} from '../js/core/production-scheduler-operation.js';
import {createPublishedSchedulerReceiptReader} from '../js/core/published-scheduler-receipt.js';
const require=createRequire(import.meta.url),{createPublishedWorkspaceScope}=require('../functions/published-workspace-scope.cjs'),{createProductionSchedulerRuntime}=require('../functions/production-scheduler-runtime.cjs');

// Cloud mode is explicitly restricted to a fresh synthetic staging namespace.
// It tests native transactions, not a user's browser authentication/App Check.
test('branch native transaction: campus scope, all recipient views/notices, retry and revocation', {skip:!process.env.FIRESTORE_EMULATOR_HOST&&process.env.BRANCH_MOVE_STAGING_TEST!=='1',timeout:180000},async()=>{
 const cloud=process.env.BRANCH_MOVE_STAGING_TEST==='1';
 if(!cloud)assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const projectId=cloud?'danbridge-d8877-staging':'demo-danbridge-branch-move';
 let authClient;
 if(cloud){
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,undefined);
  const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
  await require(cli+'/requireAuth.js').requireAuth({project:projectId,user:account.user,tokens:account.tokens});
  const {OAuth2Client}=require('google-auth-library');authClient=new OAuth2Client();authClient.setCredentials({access_token:await require(cli+'/apiv2.js').getAccessToken()});
 }
 const native=new Firestore({projectId,...(authClient?{authClient}:{}),preferRest:cloud}),prefix='acceptancePublishedTransport/workspace-280-'+randomUUID(),store=createPublishedWorkspaceScope(native,prefix),empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const email='lucas@example.test',access={companyId:'danbridge',role:'branch_manager',active:true,teacherId:'t1',canMoveSchedule:true,readOnly:true,branchIds:['art_museum']},identity={uid:'synthetic-lucas',email,emailVerified:true,appVerified:true};
 const l={id:'l1',studentId:'s1',teacherId:'t1',date:'2026-10-01',start:'10:00',end:'11:00',branchId:'art_museum',location:'美術東四路',room:'1',deliveryMode:'onsite',status:'未上課',billingBranchId:'hexi',paymentStatus:'paid'};
 const db={...empty(),branches:[{id:'art_museum',rooms:['1']},{id:'hexi',rooms:['2']}],students:[{id:'s1',name:'Synthetic',rate:700}],teachers:[{id:'t1',name:'Synthetic Teacher'}],lessons:[l,{...l,id:'other',branchId:'hexi',location:'河西一路',date:'2026-10-02',start:'15:00',end:'16:00',room:'2'}]};
 const plan=buildFullRecordShadowPlan(empty(),db,{environment:'production',sourceHash:'seed'}),count=plan.operations.length,control=buildProductionRecordRuntimeControl({activationEpoch:'branch-332-isolated',legacyVersionHash:'seed:1',recordDataHash:recordDataHash(db),sourceSha256:'a'.repeat(64),documentCount:count,activeCount:count,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'synthetic-only',activatedAt:'2026-09-17T01:00:00Z'});
 const read=async()=>rebuildFullRecordShadowDb(Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async name=>[name,(await store.collection(`productionFullRecordShadows/danbridge/collections/${name}/records`).get()).docs.map(r=>({id:r.id,data:r.data()}))]))),{environment:'production'});
 let sequence=0;const req=(before,after)=>({schema:SCHEDULER_OPERATION_SCHEMA,requestId:`branch-native-${++sequence}-${randomUUID()}`,release:'20.26.332',changes:[{lessonId:before.id,before:schedulerLesson(before),after:after?schedulerLesson(after):null}]});
 try{
  await native.doc(prefix).create({purpose:'lucas-332-native-isolated-test',createdAt:FieldValue.serverTimestamp()});
  const batch=store.batch();batch.set(store.doc(PRODUCTION_RECORD_CONTROL_PATH),control);batch.set(store.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:control.activatedAt}));
  batch.set(store.doc('companyAccess/'+email),access);
  for(const [who,role,extra] of [['owner@example.test','owner',{}],['catherine@example.test','owner',{}],['aa0966626336@gmail.com','teacher',{teacherId:'aa',canManageSchedule:true}],['teacher@example.test','teacher',{teacherId:'t1'}]])batch.set(store.doc('companyAccess/'+who),{companyId:'danbridge',active:true,role,...extra});
  for(const op of plan.operations)batch.set(store.doc(op.path),op.payload);await batch.commit();
  const runtime=await createProductionSchedulerRuntime({firestore:store,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:'owner@example.test',publishedRoleChunks:true,preserveLegacyViews:false});
  for(const patch of [{appVerified:false},{emailVerified:false},{email:'teacher@example.test'}])await assert.rejects(runtime.execute(req(l,{...l,date:'2026-10-03'}),{...identity,...patch}));
  const request=req(l,{...l,date:'2026-10-03'}),result=await runtime.execute(request,identity);assert.equal(result.state,'committed');assert.equal(result.roleManifest.identity.kind,'branch_manager');
  assert.deepEqual(await runtime.execute(request,identity),result);
  const rebuilt=await read();assert.equal(rebuilt.db.lessons.find(r=>r.id==='l1').date,'2026-10-03');assert.deepEqual(rebuilt.db.lessons.find(r=>r.id==='other'),db.lessons[1]);assert.deepEqual(rebuilt.db.students,db.students);
  const head=(await store.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(recordDataHash(rebuilt.db),head.recordDataHash);
  const notifications=(await store.collection('companies/danbridge/scheduleNotifications').get()).docs.map(r=>r.data());
  for(const recipient of ['owner@example.test','catherine@example.test','aa0966626336@gmail.com','teacher@example.test',email])assert.equal(notifications.filter(n=>n.recipientEmail===recipient).length,1,recipient+' notification exactly once');
  const reader=createPublishedSchedulerReceiptReader({identity:{kind:'branch_manager',email,teacherId:'t1',branchIds:['art_museum']},isActive:()=>true,readCurrentHead:async()=>{const h=(await store.doc('companyAccess/'+email).get()).data();return{...h,sourceRecordRevision:h.scopedSourceRecordRevision,sourceRecordHash:h.scopedSourceRecordHash}},readPart:async(id,scope)=>(await store.doc(`productionRoleChunkViews/${scope}/parts/${id}`).get()).data()});
  const receipt=await reader.resolve(result);assert.deepEqual(receipt.schedulerDb.lessons.map(r=>r.id),['l1']);
  for(const [before,after] of [[db.lessons[1],{...db.lessons[1],date:'2026-10-05'}],[rebuilt.db.lessons[0],null],[l,{...l,end:'12:00'}]])await assert.rejects(runtime.execute(req(before,after),identity));
  await store.doc('companyAccess/'+email).update({branchIds:['hexi']});await assert.rejects(runtime.execute(request,identity),/範圍已變更/);
  await store.doc('companyAccess/'+email).update({canMoveSchedule:false});await assert.rejects(runtime.execute(request,identity),/權限/);
  assert.equal((await store.collection('companies/danbridge/scheduleNotifications').get()).size,notifications.length);
  console.log(JSON.stringify({mode:cloud?'staging-isolated-native':'emulator',prefix,notificationCount:notifications.length,operationCount:result.operationCount,unchangedOtherCampus:true}));
 }finally{
  const root=await native.doc(prefix).get();if(root.exists){assert.equal(root.data().purpose,'lucas-332-native-isolated-test');await native.recursiveDelete(native.doc(prefix));assert.equal((await native.doc(prefix).get()).exists,false);console.log('CLEANED '+prefix)}
  await native.terminate();
 }
});
