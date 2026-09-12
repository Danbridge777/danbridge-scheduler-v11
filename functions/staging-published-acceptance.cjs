'use strict';
const {randomUUID}=require('node:crypto');
const {scopedFirestore}=require('./staging-acceptance-scope.cjs');
const {createPublishedOwnerRuntime}=require('./published-owner-runtime.cjs');
const PROJECT='danbridge-d8877-staging',PURPOSE='published-callable-279-synthetic-only';
const OWNERS=['a0965487920@gmail.com','catherine890202@gmail.com'];
const RECIPIENTS=[...OWNERS,'aa0966626336@gmail.com','yamiiii8549@gmail.com'];
function validateRequest(data,identity,projectId){
 if(projectId!==PROJECT)throw Error('Staging project required');
 if(!identity?.uid||!OWNERS.includes(identity.email)||identity.emailVerified!==true||identity.appVerified!==true)throw Error('Verified authorized Owner required');
 if(!data||Object.keys(data).some(k=>!['runId','action','step'].includes(k))||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.runId)||!['seed','step','status','cleanup'].includes(data.action))throw Error('Invalid acceptance request');
 if(data.action==='step'&&(!Number.isInteger(data.step)||data.step<0||data.step>5))throw Error('Invalid acceptance step');
 return `acceptancePublishedTransport/callable-279-${data.runId}`;
}
async function executeAcceptance({native,serverTimestamp,deleteField,identity,data,projectId}){
 const prefix=validateRequest(data,identity,projectId),root=native.doc(prefix),firestore=scopedFirestore(native,prefix);
 const [{FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb},{recordDataHash},{buildProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH},{prepareActiveRecordSync}]=await Promise.all([import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js'),import('../js/core/cloud-production-record-runtime.js'),import('../js/core/cloud-active-record-sync.js')]);
 const epoch='callable-279-'+data.runId,actor={uid:identity.uid,email:identity.email};
 const assertOwned=row=>{if(row?.purpose!==PURPOSE||row?.uid!==actor.uid||row?.email!==actor.email)throw Error('Acceptance ownership mismatch')};
 const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 const read=async()=>Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async k=>[k,(await firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get()).docs.map(row=>({id:row.id,data:row.data()}))])));
 if(data.action==='seed'){
  const previous=await root.get();if(previous.exists){assertOwned(previous.data());return{state:'seeded',replayed:true,runId:data.runId,formalDataWrites:0}}
  const db={...empty(),branches:[{id:'art_museum',name:'隔離校區'}],students:[{id:'student1',name:'隔離學生',rate:600},...Array.from({length:400},(_,i)=>({id:'archived-'+i,name:'隔離容量學生'+i,rate:900}))],teachers:[{id:'teacher1',name:'隔離老師',rate:300}]};
  const now=new Date().toISOString(),control=buildProductionRecordRuntimeControl({activationEpoch:epoch,legacyVersionHash:'seed:1',recordDataHash:recordDataHash(db),sourceSha256:'a'.repeat(64),documentCount:403,activeCount:403,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'isolated-only',activatedAt:now});
  const batch=firestore.batch();batch.create(root,{purpose:PURPOSE,...actor,createdAt:serverTimestamp(),nextStep:0});batch.set(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH),control);batch.set(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH),buildProductionRecordRuntimeSafety({control,updatedAt:now}));
  const members=[...OWNERS.map(email=>({email,role:'owner'})),{email:RECIPIENTS[2],role:'teacher',teacherId:'aa',canManageSchedule:true},{email:RECIPIENTS[3],role:'teacher',teacherId:'teacher1'}];
  for(const member of members)batch.set(firestore.doc('companyAccess/'+member.email),{...member,companyId:'danbridge',active:true,accessRevision:0});
  for(const op of buildFullRecordShadowPlan(empty(),db,{environment:'production',sourceHash:'seed'}).operations)batch.set(firestore.doc(op.path),op.payload);
  await batch.commit();return{state:'seeded',runId:data.runId,syntheticRecords:403,formalDataWrites:0};
 }
 const nonce=randomUUID();
 // Do not steal a timed-out run: an old server invocation might still commit.
 // Explicitly retain its namespace for diagnosis rather than risk resurrection.
 await native.runTransaction(async tx=>{const s=await tx.get(root);assertOwned(s.data());if(s.data().busy)throw Error('Acceptance run busy; preserve operation');tx.update(root,{busy:nonce})});
 let removed=false;
 try{
  if(data.action==='cleanup'){await native.recursiveDelete(root);removed=true;return{state:'removed',runId:data.runId,formalDataWrites:0}}
  if(data.action==='status'){
   const rebuilt=rebuildFullRecordShadowDb(await read(),{environment:'production'}),reports=await root.collection('acceptanceReports').orderBy('step').get();
   return{state:'verified',runId:data.runId,activeLessons:rebuilt.db.lessons.length,reports:reports.docs.map(r=>r.data()),formalDataWrites:0};
  }
  const reportRef=root.collection('acceptanceReports').doc(String(data.step)),report=await reportRef.get();
  if(report.exists)return{...report.data(),replayed:true};
  const state=(await root.get()).data();if(state.nextStep!==data.step)throw Error('Acceptance step out of order');
  const requestRef=root.collection('acceptanceRequests').doc(String(data.step)),saved=await requestRef.get();let input;
  if(saved.exists)input=saved.data();else{
   const documents=await read(),source=rebuildFullRecordShadowDb(documents,{environment:'production'}),db=source.db;
   const lessons=Array.from({length:40},(_,i)=>({id:'callable-lesson-'+i,studentId:'student1',teacherId:'teacher1',teacherIds:['teacher1'],date:new Date(Date.UTC(2026,10,i+1)).toISOString().slice(0,10),start:'08:00',end:'09:00',branchId:'art_museum',status:'未上課'}));
   const target=data.step===0?lessons:data.step===1||data.step===2?db.lessons.map(r=>({...r,start:data.step===1?'09:00':'10:00',end:data.step===1?'10:00':'11:00'})):data.step===3?[...db.lessons,...db.lessons.map(r=>({...r,id:r.id+'-copy',start:'12:00',end:'13:00'}))]:data.step===4?db.lessons.filter(r=>r.id.endsWith('-copy')):[];
   const plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:db,localDb:{...db,lessons:target},environment:'production',deviceId:'callable-step-'+data.step,activationEpoch:epoch,createdAt:new Date().toISOString()});
   if(plan.operations.length!==40)throw Error('Expected exactly 40 authority operations');
   input={schema:'danbridge-production-trusted-operation-v1',actor,kind:'record.batch.apply',requestId:'callable-batch-'+data.step,batch:{activationEpoch:epoch,reason:'daily-record-sync',operations:plan.operations}};await requestRef.create(input);
  }
  const runtime=await createPublishedOwnerRuntime({firestore,serverTimestamp,deleteField,primaryOwnerEmail:OWNERS[0],release:'20.26.279',now:()=>Date.now()});
  const start=performance.now(),result=await runtime.execute(input,identity),commitMs=performance.now()-start;
  const rebuilt=rebuildFullRecordShadowDb(await read(),{environment:'production'}),safety=(await firestore.doc(PRODUCTION_RECORD_SAFETY_PATH).get()).data();
  const expected=[40,40,40,80,40,0][data.step];
  if(rebuilt.db.lessons.length!==expected||recordDataHash(rebuilt.db)!==safety.recordDataHash||result.result.publication?.sourceHash!==safety.recordDataHash)throw Error('Authority verification failed');
  const receipt=await firestore.doc(result.result.receiptPath).get(),notices=(await firestore.collection('companies/danbridge/scheduleNotifications').get()).docs.filter(r=>r.data().sourceRecordRevision===safety.recordRevision);
  if(notices.length!==4||JSON.stringify(notices.map(r=>r.data().recipientEmail).sort())!==JSON.stringify([...RECIPIENTS].sort())||!notices.every(r=>r.data().changeCount===40&&r.updateTime.isEqual(receipt.updateTime)))throw Error('Atomic recipient verification failed');
  const proofs=(await firestore.collection('companies/danbridge/productionNotificationDeliveryProofs').get()).docs.filter(r=>r.data().sourceHash===safety.recordDataHash);
  if(proofs.length!==40||!proofs.every(r=>r.updateTime.isEqual(receipt.updateTime)))throw Error('Delivery proof verification failed');
  for(const path of [`companies/danbridge/teacherViews/${RECIPIENTS[3]}`,`companies/danbridge/schedulerViews/${RECIPIENTS[2]}`]){const view=await firestore.doc(path).get();if(view.data()?.roleChunkManifest?.sourceHash!==safety.recordDataHash||!view.updateTime.isEqual(receipt.updateTime))throw Error('Role head verification failed')}
  const evidence={state:'verified',runId:data.runId,step:data.step,commitMs,activeLessons:expected,notificationRecipients:RECIPIENTS,changedLessons:40,atomicProofs:40,sourceHash:safety.recordDataHash,formalDataWrites:0,verificationIncludesReadback:true};
  const done=native.batch();done.create(reportRef,evidence);done.update(root,{nextStep:data.step+1});await done.commit();return evidence;
 }finally{if(!removed)await native.runTransaction(async tx=>{const s=await tx.get(root);if(s.exists&&s.data().busy===nonce)tx.update(root,{busy:null})})}
}
module.exports={executeAcceptance,validateRequest};
