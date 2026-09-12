import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Firestore,FieldValue} from '@google-cloud/firestore';
const require=createRequire(import.meta.url),{executeAcceptance,validateRequest}=require('../functions/staging-published-acceptance.cjs'),{scopedFirestore}=require('../functions/staging-acceptance-scope.cjs');
const identity={uid:'acceptance-owner-279',email:'a0965487920@gmail.com',emailVerified:true,appVerified:true},project='danbridge-d8877-staging';
test('acceptance rejects foreign project, unverified identities, unapproved actors and arbitrary input paths',()=>{
 const data={runId:randomUUID(),action:'seed'};
 assert.match(validateRequest(data,identity,project),/^acceptancePublishedTransport\/callable-279-/);
 for(const p of ['danbridge-d8877','',undefined])assert.throws(()=>validateRequest(data,identity,p));
 for(const actor of [{...identity,appVerified:false},{...identity,emailVerified:false},{...identity,uid:''},{...identity,email:'aa0966626336@gmail.com'},{...identity,email:'unknown@example.test'}])assert.throws(()=>validateRequest(data,actor,project));
 for(const d of [{...data,path:'productionFullRecordShadows/x'},{...data,runId:'../escape'},{...data,action:'write'},{...data,action:'step',step:-1},{...data,action:'step',step:6}])assert.throws(()=>validateRequest(d,identity,project));
});
test('scope blocks direct path escapes and unscoped collection operations',()=>{
 const paths=[],scope=scopedFirestore({doc:p=>{paths.push(p);return{path:p}}},'acceptancePublishedTransport/callable-279-'+randomUUID());
 scope.doc('companies/danbridge');assert.match(paths[0],/^acceptancePublishedTransport\/callable-279-.*\/companies\/danbridge$/);
 for(const p of ['/companies/danbridge','../outside','projects/prod'])assert.throws(()=>scope.doc(p));
 for(const k of ['collectionGroup','listCollections','recursiveDelete','bulkWriter'])assert.throws(()=>scope[k]);
});
test('acceptance endpoint retains Auth and consumed App Check, exact project guard, and is excluded from production Hosting',()=>{
 const index=readFileSync('functions/index.cjs','utf8'),entry=index.slice(index.indexOf('exports.stagingPublishedTransportAcceptance='),index.indexOf('exports.stagingAcknowledgeScheduleNotification='));
 assert.match(entry,/enforceAppCheck:true,consumeAppCheckToken:true/);assert.match(entry,/verifiedStagingOwner\(request\)/);assert.match(entry,/project!==PROJECT_ID/);
 assert.ok(JSON.parse(readFileSync('firebase.production.json')).hosting.ignore.includes('staging-transport-acceptance.html'));
 assert.ok(!JSON.parse(readFileSync('firebase.json')).hosting.ignore.includes('staging-transport-acceptance.html'));
});
test('native acceptance workflow: ordered 6x40 changes, exact recipients, replay, foreign owner rejection, cleanup',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:180000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const native=new Firestore({projectId:'demo-danbridge-acceptance-279'}),runId=randomUUID(),prefix='acceptancePublishedTransport/callable-279-'+runId;
 const execute=(data,actor=identity)=>executeAcceptance({native,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),identity:actor,data:{runId,...data},projectId:project});
 try{
  assert.equal((await execute({action:'seed'})).state,'seeded');assert.equal((await execute({action:'seed'})).replayed,true);
  await assert.rejects(execute({action:'status'},{...identity,uid:'different-owner'}),/ownership/);
  await assert.rejects(execute({action:'step',step:1}),/out of order/);
  for(let step=0;step<6;step++){const result=await execute({action:'step',step});assert.equal(result.state,'verified');assert.equal(result.atomicProofs,40);assert.equal(result.notificationRecipients.length,4);assert.equal((await execute({action:'step',step})).replayed,true)}
  const status=await execute({action:'status'});assert.equal(status.activeLessons,0);assert.equal(status.reports.length,6);
  assert.equal((await native.doc('companies/danbridge/productionRecordRuntime/control').get()).exists,false,'no unscoped authority written');
  assert.equal((await execute({action:'cleanup'})).state,'removed');assert.equal((await native.doc(prefix).get()).exists,false);
 }finally{const root=await native.doc(prefix).get();if(root.exists&&root.data()?.uid===identity.uid&&root.data()?.purpose==='published-callable-279-synthetic-only')await native.recursiveDelete(root.ref);await native.terminate()}
});
