'use strict';
const {withProductionCommitLease}=require('./production-commit-lease.cjs');
const {nativeCanonicalRecordDbSha256}=require('./native-canonical-sha256.cjs');
const {planPublishedRoleChunks,stagePublishedRoleParts}=require('./published-role-chunk-plan.cjs');

// Owner publication uses exactly the scheduler's manifest/part format. All
// public heads, lesson permissions and the receipt commit together. Parts may
// be prepared first, but are unreadable until the fenced final transaction.
async function createPublishedRolePublisher({firestore,serverTimestamp,deleteField,primaryOwnerEmail,now=()=>Date.now(),onTiming=()=>{},preserveLegacyViews=false}){
 if(!firestore||[serverTimestamp,deleteField,now,onTiming].some(f=>typeof f!=='function'))throw Error('Invalid role publisher dependencies');
 if(typeof preserveLegacyViews!=='boolean')throw Error('Invalid publisher legacy compatibility mode');
 const [full,projection,policy]=await Promise.all([import('../js/core/cloud-full-record-shadow.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/cloud-production-record-runtime.js')]);
 const {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb}=full;
 return Object.freeze({async execute(raw,identity){
  if(!identity?.uid||identity.emailVerified!==true||identity.appVerified!==true||typeof identity.email!=='string')throw Error('Owner publisher authentication required');
  const input=projection.assertProductionRoleViewPublishRequest(raw),email=identity.email.trim().toLowerCase(),receiptRef=firestore.doc(`productionRoleViewPublishReceipts/${input.requestId}`);
  let prepared=null;
  for(let attempt=0;attempt<3;attempt++){
   try{return await withProductionCommitLease(firestore,lease=>firestore.runTransaction(async transaction=>{
    await lease.assertHeld(transaction);
    const [controlRow,safetyRow,access,receipt,teachers,schedulers,meta,...records]=await Promise.all([
     transaction.get(firestore.doc(policy.PRODUCTION_RECORD_CONTROL_PATH)),transaction.get(firestore.doc(policy.PRODUCTION_RECORD_SAFETY_PATH)),
     transaction.get(firestore.collection('companyAccess').where('companyId','==','danbridge')),transaction.get(receiptRef),
     transaction.get(firestore.collection('companies/danbridge/teacherViews')),transaction.get(firestore.collection('companies/danbridge/schedulerViews')),
     transaction.get(firestore.collection('companies/danbridge/lessonMeta')),
     ...FULL_RECORD_COLLECTIONS.map(k=>transaction.get(firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`)))
    ]);
    const accessRows=access.docs.map(r=>({...r.data(),email:r.id.toLowerCase()})),member=accessRows.find(r=>r.email===email);
    if(email!==primaryOwnerEmail&&!(member?.active===true&&member.role==='owner'))throw Error('Owner publisher access revoked');
    // Even an idempotent retry must freshly pass the access check.
    if(receipt.exists){const saved=receipt.data();if(saved.sourceHash!==input.sourceHash||saved.createdByUid!==identity.uid||saved.createdByEmail!==email)throw Error('Role publication receipt identity conflict');return{...saved,result:{...saved.result,kind:'duplicate'}}}
    const control=policy.assertProductionRecordRuntimeControl(controlRow.data()),safety=policy.assertProductionRecordRuntimeSafety(safetyRow.data(),{activationEpoch:control.activationEpoch});
    if(safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true||safety.recordDataHash!==input.sourceHash)throw Error('Role publication authority changed');
    const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,records[i].docs.map(r=>({id:r.id,data:r.data()}))])),source=rebuildFullRecordShadowDb(documents,{environment:'production'});
    if(`record-v1:${nativeCanonicalRecordDbSha256(source.db,FULL_RECORD_COLLECTIONS)}`!==input.sourceHash||['documentCount','activeCount','tombstoneCount'].some(k=>source[k]!==safety[k]))throw Error('Role publication source verification failed');
    const clock=now(),views=projection.buildProductionRoleViews(source.db,accessRows,{now:clock}),desiredPaths=new Set(views.map(v=>v.kind==='branch_manager'?`companyAccess/${v.email}`:`companies/danbridge/${v.kind==='teacher'?'teacherViews':'schedulerViews'}/${v.email}`));
    const removeViews=[...teachers.docs,...schedulers.docs].filter(r=>!desiredPaths.has(r.ref.path));
    const desiredMeta=new Map(projection.buildProductionLessonMeta(source.db).map(row=>[row.lessonId,row.payload])),currentMeta=new Map(meta.docs.map(row=>[row.id,row])),metaWrites=[];
    for(const [id,payload] of desiredMeta)if(projection.productionLessonMetaNeedsWrite(currentMeta.get(id)?.data(),payload))metaWrites.push({path:`companies/danbridge/lessonMeta/${id}`,value:{...payload,sourceRecordHash:input.sourceHash,sourceRecordRevision:safety.recordRevision,release:input.release,updatedAt:serverTimestamp()}});
    for(const [id,row] of currentMeta)if(!desiredMeta.has(id))metaWrites.push({path:row.ref.path,remove:true});
    const existingHeads=new Map([...teachers.docs,...schedulers.docs,...access.docs].map(r=>[r.ref.path,r.data()]));
    const plan=await planPublishedRoleChunks({source:source.db,accessRows,sourceRevision:safety.recordRevision,sourceHash:input.sourceHash,release:input.release,now:clock,reservedWrites:1+removeViews.length+metaWrites.length,prepared,preserveLegacyViews},async path=>existingHeads.get(path)||null,{deleteField});
    if(plan.needsPreparation)throw Object.assign(Error('Role preparation required'),{roleChunkPreparation:plan});
    const response={schema:projection.PRODUCTION_ROLE_VIEW_PUBLISH_RESPONSE_SCHEMA,requestId:input.requestId,sourceHash:input.sourceHash,createdByUid:identity.uid,createdByEmail:email,verifiedAt:new Date(clock).toISOString(),result:{state:'verified',kind:'published',sourceHash:input.sourceHash,release:input.release,roleViewCount:views.length,teacherViewCount:views.filter(v=>v.kind==='teacher').length,schedulerViewCount:views.filter(v=>v.kind==='scheduler').length,branchViewCount:views.filter(v=>v.kind==='branch_manager').length,lessonMetaCount:desiredMeta.size,formalRecordWrites:0,derivedWrites:plan.writes.length+removeViews.length+metaWrites.length}};
    for(const write of plan.writes)transaction.set(firestore.doc(write.path),write.value,{merge:write.merge===true});
    for(const row of removeViews)transaction.delete(row.ref);
    for(const write of metaWrites){if(write.remove)transaction.delete(firestore.doc(write.path));else transaction.set(firestore.doc(write.path),write.value)}
    transaction.set(receiptRef,response);
    return response;
   }))}catch(error){
    if(attempt===2)throw error;
    if(prepared&&error.code===10){prepared=null;continue}
    if(!error.roleChunkPreparation)throw error;
    prepared=await stagePublishedRoleParts(firestore,error.roleChunkPreparation);
    try{onTiming({phase:'role-chunk-preparation',sourceHash:input.sourceHash})}catch{}
   }
  }
 }});
}
module.exports={createPublishedRolePublisher};
