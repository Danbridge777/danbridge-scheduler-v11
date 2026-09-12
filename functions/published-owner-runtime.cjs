'use strict';
const {withProductionCommitLease}=require('./production-commit-lease.cjs');
const {nativeCanonicalSha256,nativeCanonicalRecordDbSha256}=require('./native-canonical-sha256.cjs');
const {createProductionTransactionReader}=require('./production-transaction-reads.cjs');
const {createSchedulerExecutionLane,createProductionScheduleNoticeBuilder}=require('./production-scheduler-runtime.cjs');
const {planPublishedRoleChunks,stagePublishedRoleParts}=require('./published-role-chunk-plan.cjs');
const {buildNotificationDeliveryProofs}=require('./production-notification-delivery-proof.cjs');

// The existing adapters still validate revisions, history, preview and replay
// identities. Buffer their writes so the authority, permissions, projections,
// notifications and success receipt can be committed by ONE native transaction.
// This runtime is server-gated; constructing it never changes any cloud state.
async function createPublishedOwnerRuntime({firestore,serverTimestamp,deleteField,primaryOwnerEmail,release,now=()=>Date.now(),onTiming=()=>{},preserveLegacyViews=false,historyVersionCache=false}){
 if(!firestore||[serverTimestamp,deleteField,now].some(f=>typeof f!=='function')||!/^\d+\.\d+\.\d+$/.test(release||''))throw Error('Invalid Owner publication dependencies');
 if(typeof preserveLegacyViews!=='boolean')throw Error('Invalid Owner legacy compatibility mode');
 if(typeof historyVersionCache!=='boolean')throw Error('Invalid history version cache configuration');
 const historyReader=historyVersionCache?require('./transaction-history-version-reader.cjs').createTransactionHistoryVersionReader():null;
 const [full,controlPolicy,contract,adapters,projection,notificationPolicy]=await Promise.all([
  import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-production-record-runtime.js'),import('../js/core/production-trusted-operation-contract.js'),
  import('../js/core/firebase-production-record-runtime-adapter.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/production-notification-policy.js')
 ]);
 const {FULL_RECORD_COLLECTIONS}=full;
 const historyMaterializer=historyVersionCache?require('./immutable-history-materializer.cjs').createImmutableHistoryMaterializer():null;
 const sharedImmutableRebuilder=historyVersionCache?full.createImmutableFullRecordShadowRebuilder():null;
 const {PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH}=controlPolicy;
 const recordPrefix='productionFullRecordShadows/danbridge/collections/';
 const executeInOrder=createSchedulerExecutionLane();
 const notifications=createProductionScheduleNoticeBuilder({primaryOwnerEmail,projection,notificationPolicy,sha256Canonical:nativeCanonicalSha256});
 const verify=(rebuilt,safety,phase,memo)=>{
  const mismatch=[...(`record-v1:${nativeCanonicalRecordDbSha256(rebuilt.db,FULL_RECORD_COLLECTIONS,{memo})}`!==safety.recordDataHash?['hash']:[]),...['documentCount','activeCount','tombstoneCount'].filter(k=>rebuilt[k]!==safety[k])];
  if(mismatch.length)throw Error(`Owner authority verification failed (${phase}: ${mismatch.join(', ')})`);
 };
 return Object.freeze({async execute(raw,identity){
  if(!identity?.uid||identity.emailVerified!==true||identity.appVerified!==true||typeof identity.email!=='string')throw Error('Owner authentication required');
  const startedAt=Date.now();let previousAt=startedAt;
  const mark=phase=>{const at=Date.now();try{onTiming({phase,elapsedMs:at-startedAt,phaseMs:at-previousAt})}catch{}previousAt=at};
  const timedRead=async(input,read)=>{const start=Date.now();const result=await read();try{onTiming({phase:'input-read',input,elapsedMs:Date.now()-start,documents:result.size??(result.exists?1:0)})}catch{}return result};
  const request=contract.assertProductionTrustedOperation(raw),email=identity.email.trim().toLowerCase();
  if(request.actor.uid!==identity.uid||request.actor.email!==email)throw Error('Owner operation identity mismatch');
  const fingerprint=nativeCanonicalSha256(request),receiptPath=`companies/danbridge/productionOwnerPublicationReceipts/${nativeCanonicalSha256({uid:identity.uid,requestId:request.requestId})}`;
  let prepared=null;
  // One logical operation keeps its lane/lease during immutable part staging.
  // The final native transaction still re-reads every authoritative input and
  // asserts that the lease is unexpired. Preparation never publishes a head.
  return executeInOrder(()=>withProductionCommitLease(firestore,async lease=>{
  mark('lease-acquired');
  for(let attempt=0;attempt<3;attempt++){
   try{const committed=await firestore.runTransaction(async transaction=>{
    // These are all reads in the SAME native transaction. Overlap the fence
    // read with authority reads, but await every result before authorization,
    // receipt replay or any buffered/native write. A replaced/expired holder
    // still fails even if a saved receipt was fetched successfully.
    const [,controlRow,safetyRow,access,receipt,teachers,schedulers,meta,...records]=await Promise.all([
     lease.assertHeld(transaction),
     transaction.get(firestore.doc(PRODUCTION_RECORD_CONTROL_PATH)),transaction.get(firestore.doc(PRODUCTION_RECORD_SAFETY_PATH)),
     timedRead('access',()=>transaction.get(firestore.collection('companyAccess').where('companyId','==','danbridge'))),transaction.get(firestore.doc(receiptPath)),
     timedRead('teacherViews',()=>transaction.get(firestore.collection('companies/danbridge/teacherViews'))),timedRead('schedulerViews',()=>transaction.get(firestore.collection('companies/danbridge/schedulerViews'))),
     timedRead('lessonMeta',()=>transaction.get(firestore.collection('companies/danbridge/lessonMeta'))),
     ...FULL_RECORD_COLLECTIONS.map(k=>{const q=firestore.collection(`${recordPrefix}${k}/records`);return timedRead(k,()=>k==='changes'&&historyReader?historyReader.read(transaction,q):transaction.get(q))})
    ]);
    mark('authority-read');
    const accessRows=access.docs.map(row=>({...row.data(),email:row.id.toLowerCase()})),member=accessRows.find(row=>row.email===email);
    contract.assertProductionTrustedCaller({uid:identity.uid,email,role:email===primaryOwnerEmail?'owner':member?.role,active:email===primaryOwnerEmail||member?.active===true,companyId:'danbridge'});
    // A replay is not an authorization bypass. Recheck the live membership
    // before returning even a previously committed response.
    if(receipt.exists){const saved=receipt.data();if(saved.fingerprint!==fingerprint||saved.uid!==identity.uid||saved.email!==email)throw Error('Owner publication receipt identity conflict');return saved.response}
    const control=controlPolicy.assertProductionRecordRuntimeControl(controlRow.data()),safety=controlPolicy.assertProductionRecordRuntimeSafety(safetyRow.data(),{activationEpoch:control.activationEpoch});
    if(safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true)throw Error('Owner authority is safely paused');
    // Hash the full current authority on every attempt. Only history bodies
    // whose native version was rechecked above can reuse frozen decoding and
    // canonical bytes; live membership/counts/order and all fences stay fresh.
    const rebuilder=sharedImmutableRebuilder||full.createImmutableFullRecordShadowRebuilder(),hashMemo=new WeakMap();
    const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,records[i].docs.map(row=>({id:row.id,data:k==='changes'&&historyMaterializer?historyMaterializer.materialize(row):row.data()}))])),source=rebuilder.rebuild(documents,{environment:'production'});
    if(historyMaterializer)historyMaterializer.seedHashMemo(documents.changes,hashMemo);
    verify(source,safety,'source',hashMemo);
    mark('source-verified');
    const writes=[],read=createProductionTransactionReader(firestore,transaction,[controlRow,safetyRow,...access.docs,...records.flatMap(snapshot=>snapshot.docs)]);
    const buffered={get:read,set:(path,value,options={merge:false})=>writes.push({path,value,merge:options.merge===true}),delete:path=>writes.push({path,remove:true})};
    const dependencies={actor:request.actor,role:'owner',serverTimestamp,deleteField,now,runTransaction:callback=>callback(buffered)};
    let result;
    if(request.kind==='record.apply')result=await adapters.createFirebaseProductionRecordOperationAdapter(dependencies).apply(request.operation);
    else if(request.kind==='record.batch.preview')result=await adapters.createFirebaseProductionRecordBatchAdapter(dependencies).preview(request.batch,request.requestId);
    else if(request.kind==='record.batch.apply')result=await adapters.createFirebaseProductionRecordBatchAdapter(dependencies).apply(request.batch,request.requestId);
    else result=await adapters.createFirebaseProductionAccessMutationAdapter(dependencies).mutate(request.mutation,request.requestId);
    mark('adapter-validated');
    // Old successful operations may be replayed after rollout. Preserve their
    // existing receipt, but do not claim their historic notification delivery
    // was atomic. Preview never publishes a future version or a notification.
    if(request.kind==='record.batch.preview'||!writes.length){
     for(const write of writes)transaction.set(firestore.doc(write.path),write.value,{merge:write.merge});
     return contract.buildProductionTrustedResponse({requestId:request.requestId,result});
    }
    const nextDocuments=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,new Map(documents[k].map(row=>[row.id,row]))]));
    const nextAccess=new Map(accessRows.map(row=>[row.email,row]));let nextSafety=safety;
    for(const write of writes){
     if(write.path.startsWith(recordPrefix)){
      const match=/^productionFullRecordShadows\/danbridge\/collections\/([^/]+)\/records\/([^/]+)$/.exec(write.path);
      if(!match||!nextDocuments[match[1]]||write.remove||write.merge)throw Error('Invalid buffered authority write');
      nextDocuments[match[1]].set(match[2],{id:match[2],data:write.value});
     }else if(write.path===PRODUCTION_RECORD_SAFETY_PATH)nextSafety=controlPolicy.assertProductionRecordRuntimeSafety(write.value,{activationEpoch:control.activationEpoch});
     else if(write.path.startsWith('companyAccess/')){
      const target=write.path.slice('companyAccess/'.length);
      if(write.remove)nextAccess.delete(target);else nextAccess.set(target,{...(write.merge?nextAccess.get(target):{}),...write.value,email:target});
     }
    }
    const target=rebuilder.rebuild(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[...nextDocuments[k].values()]])),{environment:'production'});
    verify(target,nextSafety,'target',hashMemo);
    mark('target-verified');
    const clock=now(),members=[...nextAccess.values()],views=projection.buildProductionRoleViews(target.db,members,{now:clock});
    const desiredPaths=new Set(views.map(v=>v.kind==='branch_manager'?`companyAccess/${v.email}`:`companies/danbridge/${v.kind==='teacher'?'teacherViews':'schedulerViews'}/${v.email}`));
    for(const row of [...teachers.docs,...schedulers.docs])if(!desiredPaths.has(row.ref.path))writes.push({path:row.ref.path,remove:true});
    const desiredMeta=new Map(projection.buildProductionLessonMeta(target.db).map(row=>[row.lessonId,row.payload])),currentMeta=new Map(meta.docs.map(row=>[row.id,row]));
    for(const [id,payload] of desiredMeta)if(projection.productionLessonMetaNeedsWrite(currentMeta.get(id)?.data(),payload))writes.push({path:`companies/danbridge/lessonMeta/${id}`,value:{...payload,sourceRecordHash:nextSafety.recordDataHash,sourceRecordRevision:nextSafety.recordRevision,release,updatedAt:serverTimestamp()}});
    for(const [id,row] of currentMeta)if(!desiredMeta.has(id))writes.push({path:row.ref.path,remove:true});
    const notices=notifications(source.db,target.db,members,{...request.actor,displayName:member?.displayName||''},{requestId:`owner_${nativeCanonicalSha256({uid:identity.uid,requestId:request.requestId})}`,release},nextSafety.recordDataHash);
    for(const item of notices)writes.push({path:`companies/danbridge/scheduleNotifications/${item.id}`,value:{...item.payload,sourceRecordHash:nextSafety.recordDataHash,sourceRecordRevision:nextSafety.recordRevision,createdAt:serverTimestamp()}});
    writes.push(...buildNotificationDeliveryProofs(notices,new Map([...nextDocuments.lessons].map(([id,row])=>[id,row.data])),request.actor,nextSafety.recordDataHash));
    mark('notifications-planned');
    const existingHeads=new Map([...teachers.docs,...schedulers.docs,...access.docs].map(row=>[row.ref.path,row.data()]));
    // Access adapters replace their document. Republish even an unchanged
    // branch manifest so a display-name-only edit cannot erase its new head.
    const forceHeadPaths=writes.filter(write=>write.path.startsWith('companyAccess/')&&!write.remove).map(write=>write.path);
    const plan=await planPublishedRoleChunks({source:target.db,accessRows:members,sourceHash:nextSafety.recordDataHash,sourceRevision:nextSafety.recordRevision,release,now:clock,reservedWrites:writes.length+1,prepared,forceHeadPaths,preserveLegacyViews},async path=>existingHeads.get(path)||null,{deleteField});
    mark('roles-planned');
    if(plan.needsPreparation)throw Object.assign(Error('Owner role preparation required'),{roleChunkPreparation:plan});
    writes.push(...plan.writes);
    const response=contract.buildProductionTrustedResponse({requestId:request.requestId,result:{...result,publication:{schema:'danbridge-owner-atomic-publication-v1',sourceHash:nextSafety.recordDataHash,sourceRecordRevision:nextSafety.recordRevision,notificationCount:notices.length,roleViewCount:views.length}}});
    writes.push({path:receiptPath,value:{fingerprint,uid:identity.uid,email,response,committedAt:serverTimestamp()}});
    if(writes.length>450||writes.reduce((n,w)=>n+Buffer.byteLength(JSON.stringify(w))+256,0)>8*1024*1024)throw Error('Owner atomic transaction exceeds safe budget');
    // No native write has occurred before ALL authority/role/size checks.
    for(const write of writes){if(write.remove)transaction.delete(firestore.doc(write.path));else transaction.set(firestore.doc(write.path),write.value,{merge:write.merge===true})}
    mark('writes-buffered');
    return response;
   });mark('transaction-committed');return committed}catch(error){
    if(attempt===2)throw error;
    if(prepared&&error.code===10){prepared=null;continue}
    if(!error.roleChunkPreparation)throw error;
    prepared=await stagePublishedRoleParts(firestore,error.roleChunkPreparation);
   }
  }
  }));
 }});
}
module.exports={createPublishedOwnerRuntime};
