import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFails,assertSucceeds,initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {Timestamp,collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,setDoc,updateDoc} from 'firebase/firestore';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {createFirebaseRoleRecordViewAdapter} from '../js/core/firebase-role-record-view-adapter.js';

const PROJECT_ID='danbridge-rules-test';
const COMPANY_ID='danbridge';
const OWNER_EMAIL='a0965487920@gmail.com';
const SCHEDULER_EMAIL='aa0966626336@gmail.com';
const TEACHER_EMAIL='yamiiii8549@gmail.com';
const OTHER_EMAIL='other@example.com';
const EPOCH='v2-role-runtime-epoch-20260904';
const h=value=>String(value).repeat(64);
let env;

const auth=(uid,email)=>env.authenticatedContext(uid,{email}).firestore();
const emptyDb=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const roleAdapter=(db,uid,email)=>createFirebaseRoleRecordViewAdapter({
  environment:'staging',
  role:'owner',
  actor:{uid,email},
  serverTimestamp,
  getDocument:path=>getDoc(doc(db,path)),
  getCollectionDocuments:async path=>(await getDocs(collection(db,path))).docs.map(row=>({id:row.id,data:row.data()})),
  runBatchTransaction:callback=>runTransaction(db,transaction=>callback({
    get:path=>transaction.get(doc(db,path)),
    set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})
  })),
  runTransaction:callback=>runTransaction(db,transaction=>callback({
    get:path=>transaction.get(doc(db,path)),
    set:(path,value)=>transaction.set(doc(db,path),value,{merge:false})
  }))
});

before(async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Firestore Emulator is required');
  env=await initializeTestEnvironment({projectId:PROJECT_ID});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),activeHeadHash=h('d'),controlHash=h('e');
    const roots={authorityRootHash:h('a'),genesisAuthorityHash:h('b'),reservationAuthorityHash:h('c')};
    const rows=[
      [`companyAccess/${TEACHER_EMAIL}`,{active:true,companyId:COMPANY_ID,role:'teacher',teacherId:'teacher-1'}],
      [`companyAccess/${SCHEDULER_EMAIL}`,{active:true,companyId:COMPANY_ID,role:'teacher',teacherId:'scheduler-1',canManageSchedule:true}],
      [`companyAccess/${OTHER_EMAIL}`,{active:true,companyId:COMPANY_ID,role:'teacher',teacherId:'teacher-2'}],
      [`stagingRecordSyncControls/${COMPANY_ID}`,{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:COMPANY_ID,state:'active',activationEpoch:'retired-v1-epoch',readTakeover:true,writeTakeover:true}],
      [`stagingRecordSyncSafetyControls/${COMPANY_ID}`,{schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:COMPANY_ID,activationEpoch:'retired-v1-epoch',state:'paused',revision:2,lastEventId:'retired-v1',lastEventHash:h('9'),readAllowed:true,writeAllowed:false}],
      [`stagingRecordSyncV1PermanentFences/${COMPANY_ID}`,{schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',environment:'staging',companyId:COMPANY_ID,projectId:'danbridge-d8877-staging',targetV2Epoch:EPOCH,fencePolicy:'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence',fenceHash:h('f'),activeControlHash:controlHash,activeHeadHash,...roots}],
      [`stagingRecordSyncV2ActiveControls/${COMPANY_ID}/epochs/${EPOCH}`,{schema:'danbridge-record-sync-v2-structural-active-control-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:COMPANY_ID,activationEpoch:EPOCH,writerProtocol:'v2',writerGeneration:2,readAllowed:true,writeAllowed:true,readTakeoverEnabled:true,writeTakeoverEnabled:true,acceptNewSessions:true,acceptNewMutations:true,allowAuditAppends:true,controlHash,activeHeadHash,...roots}],
      [`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${EPOCH}`,{schema:'danbridge-active-record-authority-head-v2',environment:'staging',companyId:COMPANY_ID,activationEpoch:EPOCH,revision:2,headHash:h('1'),commitHash:h('2'),sourceActiveControlHash:controlHash,sourceStructuralHeadHash:activeHeadHash,...roots}]
    ];
    for(const [path,data] of rows)await setDoc(doc(db,path),{...data,persistedAt:Timestamp.now()});
  });
});

after(async()=>env?.cleanup());

test('V2 Hn 後 Owner 可發布角色逐筆檢視，角色可 list 大量本人資料且不可跨 scope',async()=>{
  const owner=auth('owner-uid',OWNER_EMAIL),teacher=auth('teacher-uid',TEACHER_EMAIL),other=auth('other-uid',OTHER_EMAIL);
  const target=emptyDb();
  target.lessons=[{id:'role-v2-lesson',teacherId:'teacher-1',title:'V2 role projection'}];
  const identity={email:TEACHER_EMAIL,kind:'teacher',teacherId:'teacher-1',branchIds:[]};
  const result=await roleAdapter(owner,'owner-uid',OWNER_EMAIL).synchronize(target,{identity,activationEpoch:EPOCH,sourceRecordHash:recordDataHash(target),publishId:'publish-v2-role-20260904',publishedAt:'2026-09-04T02:00:00+08:00',batchSize:100});
  assert.equal(result.verified,true);
  const base=`stagingRoleRecordViews/${COMPANY_ID}/views/${result.viewKey}/collections`;
  for(const collectionName of FULL_RECORD_COLLECTIONS){
    await assertSucceeds(getDocs(collection(teacher,`${base}/${collectionName}/records`)));
    await assertFails(getDocs(collection(other,`${base}/${collectionName}/records`)));
  }
  await assertSucceeds(getDoc(doc(teacher,`${base}/lessons/records/role-v2-lesson`)));
  await assertFails(getDoc(doc(other,`${base}/lessons/records/role-v2-lesson`)));

  const scheduler=auth('scheduler-uid',SCHEDULER_EMAIL),schedulerTarget=emptyDb();
  schedulerTarget.lessons=Array.from({length:60},(_,index)=>({id:`role-v2-scheduler-lesson-${String(index).padStart(2,'0')}`,teacherId:'teacher-1',title:`V2 scheduler projection ${index}`}));
  const schedulerResult=await roleAdapter(owner,'owner-uid',OWNER_EMAIL).synchronize(schedulerTarget,{identity:{email:SCHEDULER_EMAIL,kind:'scheduler',teacherId:'scheduler-1',branchIds:[]},activationEpoch:EPOCH,sourceRecordHash:recordDataHash(schedulerTarget),publishId:'publish-v2-scheduler-20260905',publishedAt:'2026-09-05T10:20:00+08:00',batchSize:100});
  const schedulerBase=`stagingRoleRecordViews/${COMPANY_ID}/views/${schedulerResult.viewKey}/collections`;
  await assertSucceeds(getDoc(doc(scheduler,`stagingRecordSyncV2ActiveControls/${COMPANY_ID}/epochs/${EPOCH}`)));
  for(const collectionName of FULL_RECORD_COLLECTIONS){
    await assertSucceeds(getDocs(collection(scheduler,`${schedulerBase}/${collectionName}/records`)));
    await assertFails(getDocs(collection(teacher,`${schedulerBase}/${collectionName}/records`)));
  }
});

test('V1 永久 fence 仍拒絕舊主資料寫入；V2 head 被竄改後角色更新立即 fail closed',async()=>{
  const owner=auth('owner-uid',OWNER_EMAIL);
  await assertFails(setDoc(doc(owner,`companies/${COMPANY_ID}/data/main`),{forged:true}));
  await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),`stagingActiveRecordV2Heads/${COMPANY_ID}/epochs/${EPOCH}`),{sourceActiveControlHash:h('0')}));
  const target=emptyDb();target.lessons=[{id:'role-v2-lesson-2',teacherId:'teacher-1'}];
  await assert.rejects(()=>roleAdapter(owner,'owner-uid',OWNER_EMAIL).synchronize(target,{identity:{email:TEACHER_EMAIL,kind:'teacher',teacherId:'teacher-1',branchIds:[]},activationEpoch:EPOCH,sourceRecordHash:recordDataHash(target),publishId:'publish-v2-role-blocked-20260904',publishedAt:'2026-09-04T02:01:00+08:00',batchSize:100}),/第 1 批失敗|Missing or insufficient permissions/);
});
