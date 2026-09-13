'use strict';
// Explicit Owner audit only. Normal schedule commits do not pay this read cost.
async function auditPublishedRoleReadback({firestore,sourceHash,identity,primaryOwnerEmail}){
 const [{FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb},{recordDataHash},{buildProductionRoleViews},{readRoleViewForAudit},{sha256Canonical}]=await Promise.all([
  import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/role-view-audit-reader.js'),import('../js/core/cloud-immutable-migration-backup.js')]);
 const safetyRef=firestore.doc('companies/danbridge/productionRecordRuntime/safety'),accessRef=firestore.collection('companyAccess').where('companyId','==','danbridge');
 const [safety,access,...collections]=await Promise.all([safetyRef.get(),accessRef.get(),...FULL_RECORD_COLLECTIONS.map(k=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get())]);
 const rows=access.docs.map(r=>({...r.data(),email:r.id}));
 const member=rows.find(r=>r.email===identity.email);
 if(identity.email!==primaryOwnerEmail&&!(member?.active===true&&member.role==='owner'))throw Error('Role audit access revoked');
 if(safety.data()?.recordDataHash!==sourceHash)throw Error('Role audit authority changed');
 const source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,collections[i].docs.map(r=>({id:r.id,data:r.data()}))])),{environment:'production'});
 if(recordDataHash(source.db)!==sourceHash)throw Error('Role audit authority mismatch');
 const views=buildProductionRoleViews(source.db,rows),evidence=[];
 for(const view of views){
  const branch=view.kind==='branch_manager',ref=firestore.doc(branch?'companyAccess/'+view.email:`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`),head=(await ref.get()).data();
  if(!head?.roleChunkManifest||head.roleChunkManifest.sourceRevision!==safety.data().recordRevision)throw Error('Role audit published head missing or stale');
  const db=await readRoleViewForAudit({head,identity:{email:view.email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds||[]},expectedSourceHash:sourceHash,readPart:async(id,scope)=>(await firestore.doc(`productionRoleChunkViews/${scope}/parts/${id}`).get()).data(),readCurrentHead:async()=>(await ref.get()).data()});
  if(recordDataHash(db)!==recordDataHash(view.db))throw Error('Role audit permission projection mismatch');
  evidence.push({kind:view.kind,email:view.email,hash:recordDataHash(db),manifest:head.roleChunkManifest.digest});
 }
 const [end,accessEnd]=await Promise.all([safetyRef.get(),accessRef.get()]);
 if(sha256Canonical(end.data())!==sha256Canonical(safety.data())||sha256Canonical(accessEnd.docs.map(r=>({id:r.id,data:r.data()})))!==sha256Canonical(access.docs.map(r=>({id:r.id,data:r.data()}))))throw Error('Role audit concurrent authority or access change');
 return{verified:true,sourceHash,sourceRevision:safety.data().recordRevision,total:views.length,teachers:views.filter(v=>v.kind==='teacher').length,schedulers:views.filter(v=>v.kind==='scheduler').length,branchManagers:views.filter(v=>v.kind==='branch_manager').length,roleViewDigest:sha256Canonical(evidence),formalRecordWrites:0};
}
module.exports={auditPublishedRoleReadback};
