import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {createMockUserToken} from '@firebase/util';
import {doc,getDoc,collection,getDocs,query,where,documentId,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {prepareDailyShardedBackup,verifyDailyShardedBackupReadback,sealDailyShardedBackup} from '../js/core/cloud-daily-sharded-backup.js';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {createOperationJournal} from '../js/core/cloud-operation-journal.js';
import {createActiveRecordPageController} from '../js/core/cloud-active-record-page-controller.js';
import {createProductionTrustedOperationClient} from '../js/core/production-trusted-operation-client.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
const require=createRequire(import.meta.url);
const {executePublishedWorkspace,validateWorkspaceRequest,MEMBERS,workspaceTeachers}=require('../functions/staging-published-workspace.cjs');
const {createPublishedWorkspaceScope}=require('../functions/published-workspace-scope.cjs');
const owner={uid:'workspace-owner-280',email:MEMBERS[0],emailVerified:true,appVerified:true},projectId='danbridge-d8877-staging';
test('two authorized roles may share a teacher entity without duplicate seed records or changed access',()=>{
 const profiles=[{},{},{teacherId:'same',canManageSchedule:true},{teacherId:'same'}],before=JSON.stringify(profiles);
 assert.deepEqual(workspaceTeachers(profiles),[{id:'same',name:'張毅（隔離驗收）',rate:300}]);
 assert.equal(JSON.stringify(profiles),before);
 assert.deepEqual(workspaceTeachers([{},{},{teacherId:'aa'},{teacherId:'teacher'}]).map(row=>row.id),['teacher','aa']);
});
test('normal UI workspace cannot target production or arbitrary run/action/identity',()=>{
 const data={runId:randomUUID(),action:'status'};
 assert.match(validateWorkspaceRequest(data,owner,projectId),/workspace-280-/);
 for(const value of ['danbridge-d8877',''])assert.throws(()=>validateWorkspaceRequest(data,owner,value));
 for(const patch of [{runId:'../escape'},{action:'deleteAll'},{path:'companies/danbridge'}])assert.throws(()=>validateWorkspaceRequest({...data,...patch},owner,projectId));
 for(const patch of [{appVerified:false},{emailVerified:false},{email:'other@example.test'},{uid:''}])assert.throws(()=>validateWorkspaceRequest(data,{...owner,...patch},projectId));
});
test('normal UI scope rejects foreign refs, including native refs in transaction and batch writes',async()=>{
 const native={doc:path=>({path}),batch:()=>({set(){throw Error('must not call native')},commit(){}}),runTransaction:callback=>callback({get(){throw Error('must not call native')},set(){throw Error('must not call native')}})};
 const scoped=createPublishedWorkspaceScope(native,'acceptancePublishedTransport/workspace-280-'+randomUUID());
 assert.equal(scoped.doc('companies/danbridge').path,'companies/danbridge');
 for(const path of ['../x','/x','x//y','x/../y','projects/x'])assert.throws(()=>scoped.doc(path));
 assert.throws(()=>scoped.batch().set(native.doc('companies/danbridge'),{}),/Foreign/);
 await assert.rejects(scoped.runTransaction(tx=>tx.get(native.doc('companies/danbridge'))),/Foreign/);
 assert.throws(()=>scoped.doc('companies/danbridge').firestore,/Unscoped/);
});
test('deployed-workspace bridge uses native Owner runtime, live-role fence, atomic notices and closed cleanup',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:120000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(localhost|127\.0\.0\.1):\d+$/);
 const native=new Firestore({projectId:'demo-danbridge-workspace-280'}),runId=randomUUID(),prefix='acceptancePublishedTransport/workspace-280-'+runId;
 const rulesFile=process.env.DANBRIDGE_WORKSPACE_RULES_FILE||'firebase/firestore.rules';
 if(process.env.DANBRIDGE_WORKSPACE_RULES_FILE)assert.match(rulesFile,/^\/private\/tmp\/danbridge-280-rules-[A-Za-z0-9]+\/candidate\.rules$/);
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),env=await initializeTestEnvironment({projectId:'demo-danbridge-workspace-280',firestore:{host,port:Number(port),rules:await readFile(rulesFile,'utf8')}});
 const execute=(data,identity=owner)=>executePublishedWorkspace({native,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),identity,data:{runId,...data},projectId,preserveLegacyViews:true});
 const profiles=MEMBERS.map((email,i)=>({companyId:'danbridge',active:true,role:i<2?'owner':'teacher',email,accessRevision:0,...(i>=2?{teacherId:'teacher1',canManageSchedule:i===2}:{})}));
 const read=async()=>Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async key=>[key,(await native.collection(`${prefix}/productionFullRecordShadows/danbridge/collections/${key}/records`).get()).docs.map(row=>({id:row.id,data:row.data()}))])));
 try{
  await Promise.all(profiles.map(row=>native.doc('companyAccess/'+row.email).set(row)));
  const seeded=await execute({action:'seed'});assert.equal(seeded.state,'ready');assert.equal(seeded.syntheticRecords,404);
  assert.equal((await execute({action:'seed'})).replayed,true);
  const documents=await read(),source=rebuildFullRecordShadowDb(documents,{environment:'production'});
  const ownerDb=env.authenticatedContext(owner.uid,{email:owner.email,email_verified:true}).firestore(),unauthorizedDb=env.authenticatedContext('aa-backup',{email:MEMBERS[2],email_verified:true}).firestore();
  const backup=prepareDailyShardedBackup(source.db,{day:'2026-09-11',environment:'production'}),backupPath=prefix+'/dailyShardedBackups/danbridge/days/2026-09-11';
  for(const chunk of backup.chunks){
   const path=backupPath+'/chunks/'+chunk.chunkId,payload={...chunk,createdAt:serverTimestamp(),createdBy:owner.uid,createdByEmail:owner.email};
   await assertFails(setDoc(doc(unauthorizedDb,path),payload));
   await assertFails(setDoc(doc(ownerDb,path),{...payload,environment:'staging'}));
   await assertSucceeds(setDoc(doc(ownerDb,path),payload));
   await assertFails(setDoc(doc(ownerDb,path),payload));await assertFails(deleteDoc(doc(ownerDb,path)));
  }
  const backupRead=await getDocs(collection(ownerDb,backupPath+'/chunks'));
  const verified=verifyDailyShardedBackupReadback(backup.manifest,backupRead.docs.map(row=>row.data()));
  const sealed=sealDailyShardedBackup(backup.manifest,verified,{verifiedBy:owner.uid,verifiedByEmail:owner.email});
  await assertFails(setDoc(doc(ownerDb,backupPath),{...sealed,verifiedHash:'invalid',verifiedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(ownerDb,backupPath),{...sealed,verifiedAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(ownerDb,backupPath)));
  await assertFails(setDoc(doc(ownerDb,prefix+'/productionFullRecordShadows/danbridge/collections/lessons/records/forged'),{record:{id:'forged'}}));
  const lesson={id:'workspace-lesson',studentId:'workspace-student',teacherId:'teacher1',teacherIds:['teacher1'],date:'2026-11-01',start:'08:00',end:'09:00',branchId:'art_museum',status:'未上課'};
  const plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:source.db,localDb:{...source.db,lessons:[lesson]},environment:'production',deviceId:'workspace-test-280',activationEpoch:'workspace-280-'+runId,createdAt:new Date().toISOString()});
  const payload={schema:'danbridge-production-trusted-operation-v1',actor:{uid:owner.uid,email:owner.email},kind:'record.batch.apply',requestId:'workspace-create-280',batch:{activationEpoch:'workspace-280-'+runId,reason:'daily-record-sync',operations:plan.operations}};
  const result=await execute({action:'owner',payload});assert.equal(result.result.publication.schema,'danbridge-owner-atomic-publication-v1');
  assert.equal((await execute({action:'status'})).activeLessons,1);
  const receipt=await native.doc(prefix+'/'+result.result.receiptPath).get(),notices=await native.collection(prefix+'/companies/danbridge/scheduleNotifications').get();
  assert.equal(notices.size,4);assert.ok(notices.docs.every(row=>row.updateTime.isEqual(receipt.updateTime)));
  const teacherDb=env.authenticatedContext('workspace-teacher',{email:MEMBERS[3],email_verified:true}).firestore(),aaDb=env.authenticatedContext('workspace-aa',{email:MEMBERS[2],email_verified:true}).firestore();
  const teacherHead=prefix+'/companies/danbridge/teacherViews/'+MEMBERS[3];
  const head=await assertSucceeds(getDoc(doc(teacherDb,teacherHead))),manifest=head.data().roleChunkManifest;
  assert.equal(head.data().db.lessons.length,1,'old teacher clients retain the same current lesson');
  assert.equal(head.data().db.lessons[0].id,lesson.id);
  assert.equal(head.data().db.students[0].rate,undefined,'compatibility must not expose billing to teachers');
  const part=prefix+'/productionRoleChunkViews/'+manifest.scope+'/parts/'+manifest.chunkIds[0];
  await assertSucceeds(getDoc(doc(teacherDb,part)));
  const partCollection=prefix+'/productionRoleChunkViews/'+manifest.scope+'/parts';
  const authorizedIds=manifest.chunkIds.slice(0,30);
  // Published parts deliberately deny collection listing, even for an ID-IN
  // query. Keep that boundary; batching must use authorized document gets.
  await assertFails(getDocs(query(collection(teacherDb,partCollection),where(documentId(),'in',authorizedIds))));
  await assertFails(getDocs(query(collection(aaDb,partCollection),where(documentId(),'in',authorizedIds))));
  await assertFails(getDocs(query(collection(teacherDb,partCollection),where(documentId(),'in',[...authorizedIds.slice(0,29),'f'.repeat(64)]))));
  const batchGet=async(email,paths)=>fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${env.projectId}/databases/(default)/documents:batchGet`,{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+createMockUserToken({sub:'batch-get-test',email,email_verified:true},env.projectId)},
   body:JSON.stringify({documents:paths.map(path=>`projects/${env.projectId}/databases/(default)/documents/${path}`)})
  });
  const exactParts=authorizedIds.slice(0,16).map(id=>partCollection+'/'+id);
  const batchResponse=await batchGet(MEMBERS[3],exactParts);
  assert.equal(batchResponse.status,200,await batchResponse.clone().text());
  const batchRows=await batchResponse.json();assert.equal(batchRows.length,exactParts.length);
  assert.ok(batchRows.every(row=>row.found));
  assert.equal((await batchGet(MEMBERS[2],exactParts)).status,403);
  assert.equal((await batchGet(MEMBERS[3],[...exactParts,partCollection+'/'+'f'.repeat(64)])).status,403);
  await assertFails(getDoc(doc(aaDb,part)));await assertFails(getDoc(doc(teacherDb,prefix+'/productionFullRecordShadows/danbridge/collections/students/records/workspace-student')));
  await assertFails(setDoc(doc(aaDb,part),{forged:true}));
  await assertSucceeds(getDocs(query(collection(teacherDb,prefix+'/companies/danbridge/scheduleNotifications'),where('recipientEmail','==',MEMBERS[3]))));
  await assertFails(getDocs(collection(teacherDb,prefix+'/companies/danbridge/scheduleNotifications')));
  await native.doc('companyAccess/'+MEMBERS[3]).update({accessRevision:1});await assertFails(getDoc(doc(teacherDb,part)));
  await native.doc('companyAccess/'+MEMBERS[3]).update({accessRevision:0});
  assert.equal((await native.doc('productionFullRecordShadows/danbridge/collections/lessons/records/workspace-lesson').get()).exists,false);
  // Exercise the isolated Owner page controller's 40-record causal batches, not only
  // a hand-built single operation. Synthetic identity/emulator, NOT live UI.
  let journalRows=null,screen=rebuildFullRecordShadowDb(await read(),{environment:'production'}).db;
  const journal=createOperationJournal({storage:{load:async()=>structuredClone(journalRows),save:async rows=>{journalRows=structuredClone(rows)}}});
  const requests=[],client=createProductionTrustedOperationClient({getIdentity:()=>({uid:owner.uid,email:owner.email}),call:async payload=>{requests.push(payload);return{data:await execute({action:'owner',payload})}}});
  const controller=createActiveRecordPageController({environment:'production',publishedOwnerBatch:true,role:'owner',deviceId:'workspace-controller-280',journal,readDocuments:read,send:client.apply,sendBatch:client.applyBatch,persistConflicts:async()=>{throw Error('Unexpected conflict')},getLocalDb:()=>screen,applyCloudDb:async db=>{screen=db},ensureCloudBackup:async()=>verified.verified===true||sealed.verified===true,trustCommittedPlan:true,strictConvergence:true,setTimer:()=>1,clearTimer:()=>{}});
  await controller.acceptCloudSnapshot({db:screen,hash:recordDataHash(screen),activationEpoch:'workspace-280-'+runId,writeAllowed:true,documents:await read()});
  const weekly=Array.from({length:40},(_,i)=>({...lesson,id:'workspace-series-'+i,title:'AUDIT280-40-LIVE',date:new Date(Date.UTC(2026,8,11+7*i)).toISOString().slice(0,10),start:'16:00',end:'17:00',location:'美術東四路',ownershipBranchId:'art_museum'}));
  for(const action of ['create','move1','move2','move3','delete','recreate']){
   if(action==='create'||action==='recreate')screen={...screen,lessons:[lesson,...structuredClone(weekly)]};
   else if(action==='delete')screen={...screen,lessons:[lesson]};
   else screen={...screen,lessons:screen.lessons.map(row=>row.id==='workspace-lesson'?row:{...row,room:action})};
   screen={...screen,changes:[...weekly.map((row,index)=>({at:`2026-09-11T10:00:${String(index).padStart(2,'0')}Z`,action,lessonId:row.id})),...screen.changes]};
   if(action==='create'){
    const previous=rebuildFullRecordShadowDb(await read(),{environment:'production'}).db;
    const oldPlan=prepareActiveRecordSync({documentsByCollection:await read(),baselineDb:previous,localDb:screen,environment:'production',deviceId:'old-boundary-280',activationEpoch:'workspace-280-'+runId});
    await journal.appendMany(oldPlan.operations);const claimed=await journal.claimNextMany({causal:true,max:8});
    await assert.rejects(client.applyBatch(claimed.map(row=>row.operation)),/Owner authority verification failed \(target: hash\)/);
    await journal.failMany(claimed.map(row=>row.operationId),Error('Owner authority verification failed'),{retryable:false});
    assert.equal((await execute({action:'status'})).activeLessons,1);
   }
   controller.queueLocalSave({changedCollections:['lessons','changes']});
   const flushed=await controller.flush();assert.equal(flushed.state,'complete',action+': '+JSON.stringify({state:flushed.state,error:flushed.worker?.head?.lastError,counts:flushed.worker?.counts}));
   const status=await execute({action:'status'});assert.equal(status.activeLessons,action==='delete'?1:41,action);assert.equal(status.sourceHash,recordDataHash(screen),action);
   assert.equal((await journal.counts()).quarantined,0,action);
   if(action==='create'){
    // Terminal history is bounded; older superseded entries may be compacted.
    const rows=await journal.list();assert.ok(rows.filter(row=>row.operationId.startsWith('old-boundary-280:')).every(row=>row.status==='superseded'));
    assert.equal((await journal.counts()).confirmed,64);
   }
  }
  assert.equal(requests.length,7);assert.equal(requests.filter(row=>row.batch?.operations.length===80).length,6);controller.stop();
  const leaveActor={...owner,uid:'workspace-teacher',email:MEMBERS[3]},leaveRequest={action:'create',operationId:'workspace_leave_create',leaveId:'workspace_leave_record',expectedRevision:0,input:{teacherId:'teacher1',leaveType:'personal',date:'2026-09-13',start:'09:00',end:'10:30',note:'isolated'}};
  const createdLeave=await execute({action:'teacherLeave',payload:leaveRequest},leaveActor);assert.equal(createdLeave.record.hours,1.5);
  for(const email of MEMBERS){const result=await execute({action:'readTeacherLeaves'},{...owner,email});assert.equal(result.records.length,1);assert.equal(result.records[0].leaveId,leaveRequest.leaveId)}
  assert.equal((await native.collection('productionTeacherLeaveRecords').get()).size,0,'No unscoped/formal leave writes');
  assert.equal((await native.collection(prefix+'/companies/danbridge/scheduleNotifications').where('notificationType','==','teacher-leave').get()).size,4,'Every Owner plus AA and the teacher receive one notice');
  assert.equal((await execute({action:'teacherLeave',payload:leaveRequest},leaveActor)).duplicate,true);
  const cancelledLeave=await execute({action:'teacherLeave',payload:{...leaveRequest,action:'cancel',operationId:'workspace_leave_cancel',expectedRevision:1}},leaveActor);assert.equal(cancelledLeave.record.status,'cancelled');
  await native.doc('companyAccess/'+MEMBERS[1]).update({accessRevision:1});
  await assert.rejects(execute({action:'owner',payload}),/live role revision changed/);
  await native.doc('companyAccess/'+MEMBERS[1]).update({accessRevision:0});
  await assert.rejects(execute({action:'owner',payload},{...owner,email:MEMBERS[2]}),/Owner required/);
  await assert.rejects(execute({action:'owner',payload:{...payload,kind:'access.mutate'}}),/Only isolated record/);
  assert.deepEqual((await native.doc(prefix).get()).data().activeOperations,{});
  assert.equal((await execute({action:'cleanup'})).state,'removed');
  assert.equal((await native.doc(prefix).get()).data().state,'closed');
  assert.equal((await native.doc(prefix).listCollections()).length,0);
  await assert.rejects(execute({action:'seed'}),/cannot be reopened/);
  await assert.rejects(execute({action:'owner',payload}),/not active/);
 }finally{
  await native.recursiveDelete(native.doc(prefix));
  await Promise.all(MEMBERS.map(email=>native.doc('companyAccess/'+email).delete()));await native.terminate();await env.cleanup();
 }
});
