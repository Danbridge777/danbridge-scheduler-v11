// Explicitly isolated acceptance: production adapter, synthetic data, no app paths.
// This verifies real Firestore transactions, not callable authentication or PITR.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {createFirebaseProductionRecordBatchAdapter} from '../js/core/firebase-production-record-runtime-adapter.js';
import {buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH,productionRecordPath} from '../js/core/cloud-production-record-runtime.js';

const cloudMode=process.argv.includes('--execute-staging');
if(!cloudMode&&!process.argv.includes('--emulator'))throw Error('Choose --emulator or --execute-staging explicitly.');
if(cloudMode&&process.env.FIRESTORE_EMULATOR_HOST)throw Error('Cloud mode cannot silently use an emulator.');
if(!cloudMode&&!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('A loopback emulator is required.');
const projectId=cloudMode?'danbridge-d8877-staging':'demo-danbridge-restore-acceptance';
let authClient;
if(cloudMode){
 const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
 const cliAuth=require(root+'/auth.js'),account=cliAuth.getGlobalDefaultAccount();
 if(!account)throw Error('Existing Firebase CLI sign-in required.');
 const options={project:projectId,user:account.user,tokens:account.tokens};
 await require(root+'/requireAuth.js').requireAuth(options);
 authClient=new OAuth2Client();
 authClient.refreshHandler=async()=>{
  const token=await cliAuth.getAccessToken(account.tokens.refresh_token,options.authScopes);
  if(!token.access_token)throw Error('CLI access token unavailable.');
  return{access_token:token.access_token,expiry_date:token.expires_at||Date.now()+300000};
 };
 authClient.setCredentials(await authClient.refreshHandler());
}
const cleanupId=process.argv.find(value=>value.startsWith('--cleanup='))?.slice('--cleanup='.length);
if(cleanupId&&!/^restore-272-[a-f0-9-]{36}$/.test(cleanupId))throw Error('Invalid exact cleanup ID.');
const firestore=new Firestore({projectId,...(authClient?{authClient}:{})}),runId=cleanupId||'restore-272-'+randomUUID();
const rootRef=firestore.collection('repairAcceptanceDrills').doc(runId),rowsRef=rootRef.collection('documents');
if(cleanupId){
 try{
  const marker=(await rootRef.get()).data();assert.equal(marker?.runId,cleanupId);assert.equal(marker.synthetic,true);assert.equal(marker.projectId,projectId);
  const rows=await rowsRef.get();assert.ok(rows.size<400);
  const cleanup=firestore.batch();for(const row of rows.docs)cleanup.delete(row.ref);cleanup.delete(rootRef);await cleanup.commit();
  assert.equal((await rowsRef.get()).size,0);assert.equal((await rootRef.get()).exists,false);
  console.log(JSON.stringify({phase:'failed-fixture-cleaned',projectId,runId,removedDocuments:rows.size+1,remainingDocuments:0,formalDataWrites:0}));
 }finally{await firestore.terminate()}
 process.exit(0);
}
const physical=logical=>{
 if(typeof logical!=='string'||!['companies/danbridge/','productionFullRecordShadows/danbridge/collections/'].some(prefix=>logical.startsWith(prefix))||logical.includes('..'))throw Error('Unexpected logical path.');
 return rowsRef.doc(Buffer.from(logical).toString('hex'));
};
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const original=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[{id:key+'-original',name:'SYNTHETIC_'+key,detail:{keep:['原始',0,false]},amount:123.45}]]));
Object.assign(original.students[0],{name:'合成學生',parent:'合成家長',courseType:'1對1',rate:600});
Object.assign(original.teachers[0],{type:'兼職',rate:300});
Object.assign(original.lessons[0],{studentId:original.students[0].id,teacherId:original.teachers[0].id,date:'2026-08-03',start:'10:00',end:'11:30',branchId:'attend',billingBranchId:'own'});
Object.assign(original.collectionRecords[0],{month:'2026-08',studentIds:[original.students[0].id],status:'partial',amount:200,billingItemsVersion:1,billingItems:[{key:original.lessons[0].id,studentId:original.students[0].id,amount:200}],history:[{text:'保留原始收款'}]});
original.summerCampRegistrations[0].totalFee=1700;original.winterCampRegistrations[0].totalFee=700;
original.changes.push({id:'backup-only-history',text:'SYNTHETIC_BACKUP_ONLY'});
const context={window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/core/data-persistence.js',import.meta.url),'utf8'),context);
const envelope=JSON.parse(JSON.stringify(original));envelope._meta={checksum:context.backupChecksum(envelope),counts:context.backupCollectionCounts(envelope)};
const restored=JSON.parse(JSON.stringify(context.normalizeImported(envelope)));assert.deepEqual(restored,original);
const current=JSON.parse(JSON.stringify(original));
for(const key of FULL_RECORD_COLLECTIONS){current[key][0].detail.keep=['changed'];current[key].push({id:key+'-extra',name:'SYNTHETIC_EXTRA'})}
current.changes=[{id:'current-only-history',text:'SYNTHETIC_AFTER_BACKUP'},JSON.parse(JSON.stringify(original.changes[0]))];
const expected=JSON.parse(JSON.stringify(original));expected.changes=[original.changes[1],...current.changes];
const restoreTarget=JSON.parse(JSON.stringify(context.prepareBackupRestore(current,restored).db));assert.deepEqual(restoreTarget,expected);
const documents=empty(),seed=buildFullRecordShadowPlan(empty(),current,{environment:'production',sourceHash:'synthetic-baseline'});
for(const operation of seed.operations)documents[operation.payload.collection].push({id:operation.payload.recordId,data:operation.payload});
const control=buildProductionRecordRuntimeControl({activationEpoch:runId,legacyVersionHash:'isolated:1',recordDataHash:recordDataHash(current),sourceSha256:'a'.repeat(64),documentCount:32,activeCount:32,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'isolated-fixture-only',activatedAt:new Date().toISOString()});
const safety=buildProductionRecordRuntimeSafety({control,updatedAt:new Date().toISOString()});
const runTransaction=callback=>firestore.runTransaction(tx=>callback({get:path=>tx.get(physical(path)),set:(path,value)=>tx.set(physical(path),value),delete:path=>tx.delete(physical(path))}));
const config={runTransaction,serverTimestamp:()=>FieldValue.serverTimestamp(),actor:{uid:'synthetic-owner',email:'synthetic-owner@example.invalid'},role:'owner'};
const adapter=createFirebaseProductionRecordBatchAdapter(config);
let completed=false;
console.log(JSON.stringify({phase:'isolated-start',projectId,runId,namespace:rootRef.path,formalDataWrites:0}));
try{
 await rootRef.create({synthetic:true,runId,projectId,createdAt:FieldValue.serverTimestamp()});
 const batch=firestore.batch();batch.set(physical(PRODUCTION_RECORD_CONTROL_PATH),control);batch.set(physical(PRODUCTION_RECORD_SAFETY_PATH),safety);
 for(const key of FULL_RECORD_COLLECTIONS)for(const row of documents[key])batch.set(physical(productionRecordPath(key,row.id)),row.data);
 await batch.commit();
 const plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:current,localDb:restoreTarget,environment:'production',deviceId:'isolated-restore',activationEpoch:runId,createdAt:new Date().toISOString()});
 const request={activationEpoch:runId,reason:'restore',operations:plan.operations};
 const baseline=await rowsRef.get();
 await assert.rejects(()=>adapter.apply(request,'missing-preview'),/預覽/);
 assert.equal((await rowsRef.get()).size,baseline.size);
 const unauthorized=createFirebaseProductionRecordBatchAdapter({...config,role:'teacher'});
 await assert.rejects(()=>unauthorized.preview(request,'wrong-role'),/Owner/);
 const preview=await adapter.preview(request,'restore-preview');assert.equal(preview.operationCount,plan.operations.length);
 const beforeApply=await physical(productionRecordPath('collectionRecords',original.collectionRecords[0].id)).get();
 assert.deepEqual(beforeApply.data().record,current.collectionRecords[0]);
 const result=await adapter.apply({...request,previewId:preview.previewId},'restore-apply');assert.equal(result.write,true);
 const committed=await rowsRef.get(),committedVersions=new Map(committed.docs.map(row=>[row.id,row.updateTime.toMillis()]));
 const replay=await adapter.apply({...request,previewId:preview.previewId},'restore-apply');assert.equal(replay.write,false);
 for(const row of (await rowsRef.get()).docs)assert.equal(row.updateTime.toMillis(),committedVersions.get(row.id));
 const readBack=empty();
 for(const key of FULL_RECORD_COLLECTIONS){
  const ids=[...new Set([...documents[key].map(row=>row.id),...plan.operations.filter(op=>op.collection===key).map(op=>op.recordId)])];
  const snapshots=await firestore.getAll(...ids.map(id=>physical(productionRecordPath(key,id))));
  snapshots.forEach((snapshot,index)=>readBack[key].push({id:ids[index],data:snapshot.data()}));
 }
 const rebuilt=rebuildFullRecordShadowDb(readBack,{environment:'production'});
 for(const key of FULL_RECORD_COLLECTIONS)assert.deepEqual(rebuilt.db[key],expected[key],key);
 const expectedActive=buildFullRecordShadowPlan(empty(),expected,{environment:'production',sourceHash:'expected'}).operations;
 const expectedTombstones=seed.operations.filter(op=>!expectedActive.some(row=>row.path===op.path)).length;
 assert.equal(recordDataHash(rebuilt.db),recordDataHash(expected));assert.equal(rebuilt.activeCount,18);assert.equal(rebuilt.tombstoneCount,expectedTombstones);
 const savedSafety=(await physical(PRODUCTION_RECORD_SAFETY_PATH).get()).data();assert.equal(savedSafety.recordDataHash,recordDataHash(expected));
 // All changed records, tombstones, safety and receipts share one commit timestamp.
 const commitTimes=new Set(committed.docs.filter(row=>!baseline.docs.some(old=>old.id===row.id&&old.updateTime.isEqual(row.updateTime))&&row.id!==physical('companies/danbridge/productionHighRiskPreviews/restore-preview').id).map(row=>row.updateTime.toDate().toISOString()));
 assert.equal(commitTimes.size,1);
 console.log(JSON.stringify({phase:'verified',projectId,runId,collections:FULL_RECORD_COLLECTIONS.length,operations:result.operationCount,activeRecords:18,tombstones:expectedTombstones,preservedHistory:2,importedHistory:1,hash:recordDataHash(rebuilt.db),missingPreviewRejected:true,teacherRejected:true,replayWrites:0,atomicCommit:true,formalDataWrites:0}));
 completed=true;
 // Only this UUID namespace, created above, is eligible for cleanup.
 const marker=(await rootRef.get()).data();assert.equal(marker.runId,runId);assert.equal(marker.synthetic,true);
 const cleanup=firestore.batch();for(const row of (await rowsRef.get()).docs)cleanup.delete(row.ref);cleanup.delete(rootRef);await cleanup.commit();
 assert.equal((await rowsRef.get()).size,0);assert.equal((await rootRef.get()).exists,false);
 console.log(JSON.stringify({phase:'cleaned',runId,remainingDocuments:0,formalDataWrites:0}));
}catch(error){console.error(JSON.stringify({phase:'failed',runId,completed,namespace:rootRef.path,preserved:true,error:String(error?.message||error)}));process.exitCode=1}
finally{await firestore.terminate()}
