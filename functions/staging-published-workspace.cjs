'use strict';
const {randomUUID}=require('node:crypto');
const {createPublishedWorkspaceScope,ROOT_PATTERN}=require('./published-workspace-scope.cjs');
const {createPublishedOwnerRuntime}=require('./published-owner-runtime.cjs');
const {createProductionSchedulerRuntime}=require('./production-scheduler-runtime.cjs');
const {createPublishedRolePublisher}=require('./published-role-publisher.cjs');
const {createProductionNotificationPublisher}=require('./production-notification-publisher.cjs');
const runtimePool=require('./staging-workspace-runtime-pool.cjs').createWorkspaceRuntimePool();
const PROJECT='danbridge-d8877-staging',PURPOSE='normal-ui-published-280-synthetic-only';
const MEMBERS=['a0965487920@gmail.com','catherine890202@gmail.com','aa0966626336@gmail.com','yamiiii8549@gmail.com'];
const ACTIONS=['seed','status','cleanup','owner','scheduler','publishRoles','publishNotifications','acknowledge'];
const roleCore=row=>Object.fromEntries(['companyId','active','role','teacherId','canManageSchedule','branchId','branchIds','accessRevision'].map(k=>[k,row?.[k]??null]));
function workspaceTeachers(actual){
 const rows=[{id:actual[3].teacherId,name:'張毅（隔離驗收）',rate:300},{id:actual[2].teacherId,name:'AA（隔離驗收）',rate:300}];
 return rows.filter((row,index)=>rows.findIndex(other=>other.id===row.id)===index);
}
function validateWorkspaceRequest(data,identity,projectId){
 if(projectId!==PROJECT)throw Error('Exact staging project required');
 if(!identity?.uid||identity.emailVerified!==true||identity.appVerified!==true||!MEMBERS.includes(identity.email))throw Error('Authorized verified workspace member required');
 if(!data||Object.keys(data).some(k=>!['runId','action','payload'].includes(k))||!ACTIONS.includes(data.action))throw Error('Invalid workspace request');
 const prefix='acceptancePublishedTransport/workspace-280-'+data.runId;
 if(!ROOT_PATTERN.test(prefix))throw Error('Invalid workspace identity');
 return prefix;
}
async function executePublishedWorkspace({native,serverTimestamp,deleteField,identity,data,projectId,preserveLegacyViews=false}){
 if(typeof preserveLegacyViews!=='boolean')throw Error('Invalid workspace legacy compatibility configuration');
 const prefix=validateWorkspaceRequest(data,identity,projectId),root=native.doc(prefix);
 const accessRefs=MEMBERS.map(email=>native.doc('companyAccess/'+email));
 const verifyMembers=rows=>rows.map((row,index)=>{
  const member=row.data();
  if(!row.exists||member.companyId!=='danbridge'||member.active!==true||member.role!==(index<2?'owner':'teacher')||(index===2&&member.canManageSchedule!==true)||(index===3&&member.canManageSchedule===true)||(index>=2&&(!member.teacherId||String(member.teacherId).includes('/'))))throw Error('Workspace role membership changed');
  return{...member,email:MEMBERS[index]};
 });
 const actual=verifyMembers(await native.getAll(...accessRefs));
 const isOwner=MEMBERS.indexOf(identity.email)<2;
 if(['seed','cleanup','status','owner','publishRoles','publishNotifications'].includes(data.action)&&!isOwner)throw Error('Workspace Owner required');
 const [{FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb},{recordDataHash},policy]=await Promise.all([import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js'),import('../js/core/cloud-production-record-runtime.js')]);
 const copiedRefs=MEMBERS.map(email=>native.doc(prefix+'/companyAccess/'+email));
 const assertRoot=row=>{if(row?.purpose!==PURPOSE||row?.runId!==data.runId)throw Error('Workspace ownership mismatch')};
 const firestore=createPublishedWorkspaceScope(native,prefix,async tx=>{
  const [state,...rows]=await tx.getAll(root,...accessRefs,...copiedRefs);assertRoot(state.data());
  if(state.data().state!=='active'&&!(data.action==='seed'&&state.data().state==='preparing'))throw Error('Workspace closed or not ready');
  const current=verifyMembers(rows.slice(0,4));
  current.forEach((member,index)=>{if(JSON.stringify(roleCore(member))!==JSON.stringify(roleCore(rows[index+4].data())))throw Error('Workspace live role revision changed')});
 });
 const dependencies={firestore,serverTimestamp,deleteField,primaryOwnerEmail:MEMBERS[0],release:'20.26.314',preserveLegacyViews,historyVersionCache:true,onTiming:sample=>console.info('ISOLATED_OWNER_TIMING',JSON.stringify(sample))};
 const read=async()=>Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async key=>[key,(await firestore.collection(`productionFullRecordShadows/danbridge/collections/${key}/records`).get()).docs.map(row=>({id:row.id,data:row.data()}))])));
 if(data.action==='seed'){
  const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
  const db={...empty(),branches:[{id:'art_museum',name:'美術東四路'},{id:'hexi',name:'河西一路'}],students:[{id:'workspace-student',name:'驗收學生 280',parent:'隔離驗收家長',status:'在讀',courseType:'1對1',billing:'hour',rate:600,ownershipBranchId:'art_museum'},...Array.from({length:400},(_,i)=>({id:'workspace-capacity-'+i,name:'容量資料 '+i,status:'離班',rate:900}))],teachers:workspaceTeachers(actual)};
  const sourceHash=recordDataHash(db),epoch='workspace-280-'+data.runId,now=new Date().toISOString(),count=FULL_RECORD_COLLECTIONS.reduce((sum,key)=>sum+db[key].length,0);
  const control=policy.buildProductionRecordRuntimeControl({activationEpoch:epoch,legacyVersionHash:'seed:1',recordDataHash:sourceHash,sourceSha256:'a'.repeat(64),documentCount:count,activeCount:count,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'isolated-only',activatedAt:now});
  await native.runTransaction(async tx=>{
   const [previous,...members]=await tx.getAll(root,...accessRefs);const fresh=verifyMembers(members);
   if(previous.exists){assertRoot(previous.data());if(previous.data().state==='active')return;if(previous.data().state==='closed')throw Error('Closed workspace cannot be reopened');throw Error('Workspace preparation incomplete; preserve for diagnosis')}
   if(fresh.some((row,index)=>JSON.stringify(roleCore(row))!==JSON.stringify(roleCore(actual[index]))))throw Error('Seed role revision changed');
   tx.create(root,{purpose:PURPOSE,runId:data.runId,state:'preparing',createdBy:identity.uid,createdAt:serverTimestamp(),activeOperations:{}});
   fresh.forEach((row,index)=>tx.set(copiedRefs[index],row));
   tx.set(native.doc(prefix+'/'+policy.PRODUCTION_RECORD_CONTROL_PATH),control);tx.set(native.doc(prefix+'/'+policy.PRODUCTION_RECORD_SAFETY_PATH),policy.buildProductionRecordRuntimeSafety({control,updatedAt:now}));
   for(const op of buildFullRecordShadowPlan(empty(),db,{environment:'production',sourceHash:'seed'}).operations)tx.set(native.doc(prefix+'/'+op.path),op.payload);
  });
  const state=(await root.get()).data();
  if(state.state==='active')return{state:'ready',replayed:true,runId:data.runId,formalDataWrites:0};
  const publisher=await createPublishedRolePublisher(dependencies);
  await publisher.execute({schema:'danbridge-production-role-view-publish-v1',requestId:'workspace-seed-'+data.runId,sourceHash,release:'20.26.314'},identity);
  await firestore.runTransaction(async tx=>{await tx.get(firestore.doc(policy.PRODUCTION_RECORD_SAFETY_PATH));/* role and root checks above */});
  await root.update({state:'active',readyAt:serverTimestamp()});
  return{state:'ready',runId:data.runId,syntheticRecords:count,formalDataWrites:0};
 }
 if(data.action==='cleanup'){
  await native.runTransaction(async tx=>{const row=await tx.get(root);assertRoot(row.data());if(!['active','closed'].includes(row.data().state)||Object.keys(row.data().activeOperations||{}).length)throw Error('Workspace operations still in flight');tx.update(root,{state:'closed',closedAt:serverTimestamp()})});
  // Keep a closed root tombstone: stale browser journals cannot recreate it.
  for(const collection of await root.listCollections()){
   const refs=await collection.listDocuments();for(const ref of refs)await native.recursiveDelete(ref);
  }
  return{state:'removed',runId:data.runId,closedTombstoneRetained:true,formalDataWrites:0};
 }
 const operationId=randomUUID();
 await native.runTransaction(async tx=>{const row=await tx.get(root);assertRoot(row.data());if(row.data().state!=='active')throw Error('Workspace not active');tx.update(root,{['activeOperations.'+operationId]:identity.email})});
 try{
  if(data.action==='status'){
   const source=rebuildFullRecordShadowDb(await read(),{environment:'production'}),safety=(await firestore.doc(policy.PRODUCTION_RECORD_SAFETY_PATH).get()).data();
   if(recordDataHash(source.db)!==safety.recordDataHash)throw Error('Workspace authority mismatch');
   return{state:'verified',activeLessons:source.db.lessons.length,sourceHash:safety.recordDataHash,sourceRecordRevision:safety.recordRevision,runId:data.runId,formalDataWrites:0};
  }
  if(data.action==='owner'){
   if(!['record.apply','record.batch.apply','record.batch.preview'].includes(data.payload?.kind))throw Error('Only isolated record operations allowed');
   return await(await runtimePool.get(native,{prefix,kind:'owner',preserveLegacyViews},()=>createPublishedOwnerRuntime(dependencies))).execute(data.payload,identity);
  }
  if(data.action==='scheduler')return await(await runtimePool.get(native,{prefix,kind:'scheduler',preserveLegacyViews},()=>createProductionSchedulerRuntime({...dependencies,publishedRoleChunks:true}))).execute(data.payload,identity);
  if(data.action==='publishRoles')return await(await createPublishedRolePublisher(dependencies)).execute(data.payload,identity);
  if(data.action==='publishNotifications')return await(await createProductionNotificationPublisher(dependencies)).execute(data.payload,identity);
  if(data.action==='acknowledge'){
   const {normalizeProductionNotificationAcknowledgeRequest,assertProductionNotificationRecipient}=await import('../js/core/production-notification-policy.js');
   const {notificationIds}=normalizeProductionNotificationAcknowledgeRequest(data.payload);
   const result=await firestore.runTransaction(async tx=>{
    const refs=notificationIds.map(id=>firestore.doc('companies/danbridge/scheduleNotifications/'+id)),rows=await tx.getAll(...refs);let updatedCount=0,alreadyReadCount=0;
    rows.forEach((row,index)=>{if(!row.exists)throw Error('Notification missing');assertProductionNotificationRecipient(row.data(),identity);if(row.data().read===true)alreadyReadCount++;else{tx.update(refs[index],{read:true,acknowledgedAt:serverTimestamp(),acknowledgedBy:identity.uid});updatedCount++}});
    return{updatedCount,alreadyReadCount};
   });
   return{schema:'danbridge-schedule-notification-acknowledge-response-v1',ok:true,notificationCount:notificationIds.length,...result};
  }
  throw Error('Unsupported workspace operation');
 }finally{
  await native.runTransaction(async tx=>{const row=await tx.get(root);if(row.exists&&row.data().purpose===PURPOSE)tx.update(root,{['activeOperations.'+operationId]:deleteField()})});
 }
}
module.exports={executePublishedWorkspace,validateWorkspaceRequest,MEMBERS,PURPOSE,roleCore,workspaceTeachers};
