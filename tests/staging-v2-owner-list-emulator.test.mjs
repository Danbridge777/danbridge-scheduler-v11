import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,setLogLevel} from 'firebase/firestore';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';

test('staging V2 list: all 16 collections, real query shape, roles, epoch fences and no client writes', {skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:120000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^127\.0\.0\.1:8087$/);
 const source=readFileSync(process.env.DANBRIDGE_RULES_FILE||new URL('../firebase/firestore.rules',import.meta.url),'utf8');
 const h=c=>c.repeat(64),epoch='v2-list-regression-epoch',roots={authorityRootHash:h('a'),genesisAuthorityHash:h('b'),reservationAuthorityHash:h('c')};
 const defaults={
  fence:{schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',environment:'staging',companyId:'danbridge',projectId:'danbridge-d8877-staging',targetV2Epoch:epoch,fencePolicy:'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence',fenceHash:h('f'),activeControlHash:h('e'),activeHeadHash:h('d'),...roots},
  control:{schema:'danbridge-record-sync-v2-structural-active-control-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:'danbridge',activationEpoch:epoch,writerProtocol:'v2',writerGeneration:2,readAllowed:true,writeAllowed:true,readTakeoverEnabled:true,writeTakeoverEnabled:true,acceptNewSessions:true,acceptNewMutations:true,allowAuditAppends:true,controlHash:h('e'),activeHeadHash:h('d'),...roots},
  head:{schema:'danbridge-active-record-authority-head-v2',environment:'staging',companyId:'danbridge',activationEpoch:epoch,revision:1,headHash:h('1'),commitHash:h('2'),sourceActiveControlHash:h('e'),sourceStructuralHeadHash:h('d'),...roots},
  manifest:{schema:'danbridge-active-record-v2-baseline-snapshot-manifest-v1',state:'h1-complete-baseline-confirmed',environment:'staging',companyId:'danbridge',activationEpoch:epoch,h1HeadHash:h('1'),h1CommitHash:h('2'),recordCount:16}
 };
 const metadata=process.env.DANBRIDGE_METADATA_FILE?JSON.parse(readFileSync(process.env.DANBRIDGE_METADATA_FILE,'utf8')).stagingMetadata:defaults;
 const {fence,head,control,manifest}=metadata,currentEpoch=fence.targetV2Epoch;
 const base=type=>`stagingActiveRecordV2${type}/danbridge/epochs/${currentEpoch}`;
 const fencePath='stagingRecordSyncV1PermanentFences/danbridge',controlPath=`stagingRecordSyncV2ActiveControls/danbridge/epochs/${currentEpoch}`,headPath=base('Heads'),manifestPath=base('Baselines')+'/artifacts/manifest';
 const queries=FULL_RECORD_COLLECTIONS.flatMap(name=>[base('Baselines')+`/collections/${name}/records`,base('Records')+`/collections/${name}/records`]).concat(base('SaveCommits')+'/saves');
 const env=await initializeTestEnvironment({projectId:'demo-staging-read-diagnosis',firestore:{host:'127.0.0.1',port:8087,rules:source}});
 setLogLevel('silent');let positive=0,negative=0;
  let checkNumber=0;
  const succeeds=async promise=>{const number=++checkNumber;try{const result=await assertSucceeds(promise);positive++;return result}catch(error){error.message=`positive check ${number}: ${error.message}`;throw error}};
  const fails=async promise=>{const number=++checkNumber;try{await assertFails(promise);negative++}catch(error){error.message=`negative check ${number}: ${error.message}`;throw error}};
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   for(const [p,value] of [[fencePath,fence],[controlPath,control],[headPath,head],[manifestPath,manifest]])await setDoc(doc(db,p),value);
   for(const [email,role,extra] of [['backup@example.com','owner',{}],['aa0966626336@gmail.com','teacher',{teacherId:'t-aa',canManageSchedule:true}],['teacher@example.com','teacher',{teacherId:'t-1'}],['manager@example.com','branch_manager',{teacherId:'t-2',branchIds:['b-1']}],['inactive@example.com','owner',{active:false}]])await setDoc(doc(db,'companyAccess/'+email),{companyId:'danbridge',active:true,role,...extra});
   const common={environment:'staging',companyId:'danbridge',activationEpoch:currentEpoch};
   for(const name of FULL_RECORD_COLLECTIONS){
    await setDoc(doc(db,base('Baselines')+`/collections/${name}/records/synthetic`),{...common,schema:'danbridge-active-record-v2-first-daily-union-row-v1',collection:name,recordId:'synthetic'});
    await setDoc(doc(db,base('Records')+`/collections/${name}/records/synthetic`),{...common,schema:'danbridge-active-record-authority-daily-record-v2',collection:name,recordId:'synthetic'});
   }
   await setDoc(doc(db,base('SaveCommits')+'/saves/synthetic'),{...common,schema:'danbridge-active-record-authority-ledger-v2',saveId:'synthetic'});
  });
  const owner=env.authenticatedContext('owner',{email:'a0965487920@gmail.com',email_verified:true}).firestore(),backup=env.authenticatedContext('backup',{email:'backup@example.com',email_verified:true}).firestore();
  for(const db of [owner,backup]){
   for(const p of [fencePath,headPath,controlPath,manifestPath])await succeeds(getDoc(doc(db,p)));
   for(const p of queries){assert.equal((await succeeds(getDocs(collection(db,p)))).size,1);await succeeds(getDoc(doc(db,p+'/synthetic')));}
  }
  const blocked=[...['aa0966626336@gmail.com','teacher@example.com','manager@example.com','inactive@example.com'].map((email,i)=>env.authenticatedContext('other-'+i,{email,email_verified:true}).firestore()),env.unauthenticatedContext().firestore()];
  for(const db of blocked)for(const p of queries)await fails(getDocs(collection(db,p)));
  for(const db of [owner,backup,...blocked.slice(0,2)])for(const p of queries){
   await fails(setDoc(doc(db,p+'/forged'),{forged:true}));
   await fails(updateDoc(doc(db,p+'/synthetic'),{forged:true}));
   await fails(deleteDoc(doc(db,p+'/synthetic')));
  }
  for(const p of queries)for(const altered of [p.replace(currentEpoch,'v2-old-epoch'),p.replace('/danbridge/','/foreign-company/')])await fails(getDocs(collection(owner,altered)));
  for(const type of ['Baselines','Records'])await fails(getDocs(collection(owner,base(type)+'/collections/unknown/records')));
  const blockedControls=['readAllowed','writeAllowed','readTakeoverEnabled','writeTakeoverEnabled','acceptNewSessions','acceptNewMutations','allowAuditAppends'];
  for(const flag of blockedControls){
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),controlPath),{[flag]:false}));
   for(const p of [queries[0],queries[1],queries.at(-1)])await fails(getDocs(collection(owner,p)));
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),controlPath),control));
  }
  for(const [p,value,corruption] of [[fencePath,fence,{targetV2Epoch:'v2-wrong-epoch'}],[controlPath,control,{controlHash:h('9')}],[headPath,head,{sourceStructuralHeadHash:h('9')}],[headPath,head,{revision:0}]]){
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),p),corruption));
   for(const q of [queries[0],queries[1],queries.at(-1)])await fails(getDocs(collection(owner,q)));
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),p),value));
  }
  // Empty collections must load too; rules are not per-document filters.
  await env.withSecurityRulesDisabled(async ctx=>{for(const p of queries)await deleteDoc(doc(ctx.firestore(),p+'/synthetic'));});
  for(const p of queries)assert.equal((await succeeds(getDocs(collection(owner,p)))).size,0);
  console.log('STAGING_LIST_BOUNDARY_RESULTS '+JSON.stringify({positiveChecks:positive,negativeChecks:negative,queryShapes:queries.length,formalDataWrites:0,cloudWrites:0}));
 }finally{await env.cleanup();}
});
