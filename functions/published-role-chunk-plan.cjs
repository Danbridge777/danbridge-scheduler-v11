'use strict';
const {nativeCanonicalSha256,nativeCanonicalRecordDbSha256}=require('./native-canonical-sha256.cjs');
const ROOT='productionRoleChunkViews';
const LIMIT=450;

// Pure server planning. Call getHead in the authority transaction, and commit
// ALL final writes in that transaction. No public endpoint enables this yet.
// A preparation pass contains only immutable, still-unpublished parts.
async function planPublishedRoleChunks({source,accessRows,sourceRevision,sourceHash,release,now=Date.now(),reservedWrites=0,prepared=null,forceHeadPaths=[],preserveLegacyViews=false},getHead,{deleteField}){
 if(typeof getHead!=='function'||typeof deleteField!=='function'||!Number.isSafeInteger(reservedWrites)||reservedWrites<0||reservedWrites>LIMIT||!/^\d+\.\d+\.\d+$/.test(release||''))throw Error('Invalid role publication dependencies');
 if(!Array.isArray(forceHeadPaths)||forceHeadPaths.some(path=>typeof path!=='string'||!/^companyAccess\/[^/]+$/.test(path)))throw Error('Invalid forced role head paths');
 if(typeof preserveLegacyViews!=='boolean')throw Error('Invalid legacy role compatibility mode');
 const forcedHeads=new Set(forceHeadPaths);
 const [{FULL_RECORD_COLLECTIONS},{buildProductionRoleViews},{buildRoleViewChunks}]=await Promise.all([import('../js/core/cloud-full-record-shadow.js'),import('../js/core/production-role-view-projection.js'),import('../js/core/role-view-chunks.js')]);
 if(`record-v1:${nativeCanonicalRecordDbSha256(source,FULL_RECORD_COLLECTIONS)}`!==sourceHash)throw Error('Role authority hash mismatch');
 const views=buildProductionRoleViews(source,accessRows,{now}),seen=new Set();
 const candidates=views.map(view=>{
  if(!/^[^/@\s]+@[^/@\s]+$/.test(view.email)||seen.has(view.email))throw Error('Invalid or duplicate role recipient');seen.add(view.email);
  const built=buildRoleViewChunks(view.db,{identity:{email:view.email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds||[]},sourceRevision,sourceHash,stableRecords:true,hashCanonical:nativeCanonicalSha256});
  const headPath=view.kind==='branch_manager'?`companyAccess/${view.email}`:`companies/danbridge/${view.kind==='scheduler'?'schedulerViews':'teacherViews'}/${view.email}`;
  return{view,headPath,...built};
 });
 const heads=await Promise.all(candidates.map(c=>getHead(c.headPath))),parts=[],headWrites=[];
 for(let i=0;i<candidates.length;i++){
  const c=candidates[i],previous=heads[i]?.roleChunkManifest;
  if(previous){
   const{digest,...body}=previous;
   if(nativeCanonicalSha256(body)!==digest||!Number.isSafeInteger(previous.publicationRevision??0)||(previous.publicationRevision??0)<0)throw Error('Published role head integrity mismatch');
   if(previous.sourceRevision>sourceRevision)throw Error('Cannot publish an older role generation');
   if(previous.sourceRevision===sourceRevision){
    if(previous.sourceHash!==sourceHash)throw Error('Conflicting role generation');
    // Report visibility can advance at midnight, and authorized scope can
    // change without changing a lesson. Give those projections a separate
    // monotonic generation; never invent a new authoritative record revision.
    const{digest:unused,...nextBody}=c.manifest;
    nextBody.publicationRevision=previous.publicationRevision??0;
    if(nativeCanonicalSha256(nextBody)!==digest)nextBody.publicationRevision++;
    if(!Number.isSafeInteger(nextBody.publicationRevision))throw Error('Publication generation overflow');
    c.manifest={...nextBody,digest:nativeCanonicalSha256(nextBody)};
   }
  }
  if(prepared&&(prepared.sourceRevision!==sourceRevision||prepared.sourceHash!==sourceHash||prepared.manifests[c.headPath]!==c.manifest.digest))throw Object.assign(Error('Authority or role scope changed during preparation'),{code:10});
  const legacyKey=c.view.kind==='branch_manager'?'scopedDb':'db';
  const legacyCurrent=preserveLegacyViews&&heads[i]?.[legacyKey]&&nativeCanonicalSha256(heads[i][legacyKey])===nativeCanonicalSha256(c.view.db);
  if(previous?.digest===c.manifest.digest&&!forcedHeads.has(c.headPath)&&(!preserveLegacyViews||legacyCurrent))continue;
  const oldIds=new Set(previous?.chunkIds||[]);
  for(const part of c.chunks){const path=`${ROOT}/${c.manifest.scope}/parts/${part.id}`;if(!oldIds.has(part.id)&&!prepared?.paths.has(path))parts.push({path,value:part,merge:false})}
  const common={roleChunkManifest:c.manifest,release},value=c.view.kind==='branch_manager'?{...common,scopedDb:deleteField(),scopedSourceRecordRevision:sourceRevision,scopedSourceRecordHash:sourceHash}:{...common,db:deleteField(),email:c.view.email,...(c.view.kind==='teacher'?{teacherId:c.view.teacherId}:{}),sourceRecordRevision:sourceRevision,sourceRecordHash:sourceHash};
  if(preserveLegacyViews){
   // Already-open clients still consume the original field. Publish the SAME
   // permission-filtered projection, not an old copy, in the final transaction.
   value[legacyKey]=c.view.db;
   if(c.view.kind==='branch_manager'){value.scopedClientHash=c.view.clientHash;value.scopedUpdatedAt=new Date(now).toISOString()}
   else{value.clientHash=c.view.clientHash;value.updatedAt=new Date(now).toISOString()}
   // Never silently drop compatibility to fit a document. Abort planning
   // before any authority write, with ample room below Firestore's 1 MiB cap.
   if(Buffer.byteLength(JSON.stringify({...heads[i],...value}))+2048>800000)throw Error('Legacy role compatibility exceeds safe document size; client migration required');
  }
  // Merge keeps access roles untouched. A branch head and its part index are
  // advanced together; old parts never become visible before this commit.
  headWrites.push({path:c.headPath,value,merge:true},{path:`${ROOT}/${c.manifest.scope}`,value:c.manifest,merge:false});
 }
 if(headWrites.length+reservedWrites>LIMIT)throw Error('Role publication head transaction budget exceeded');
 const writes=[...parts,...headWrites],estimatedBytes=writes.reduce((n,w)=>n+Buffer.byteLength(JSON.stringify(w))+256,0),needsPreparation=writes.length+reservedWrites>LIMIT||estimatedBytes>8*1024*1024;
 if(prepared&&needsPreparation)throw Error('Prepared role publication still exceeds transaction budget');
 return{writes,parts,headWrites,needsPreparation,estimatedBytes,sourceHash,sourceRevision,formalRecordWrites:0,manifests:Object.fromEntries(candidates.map(c=>[c.headPath,c.manifest.digest])),views:candidates.map(c=>({kind:c.view.kind,email:c.view.email,headPath:c.headPath,manifest:c.manifest}))};
}

async function stagePublishedRoleParts(firestore,plan){
 if(plan?.needsPreparation!==true||plan.formalRecordWrites!==0||!Array.isArray(plan.parts)||!plan.parts.length)throw Error('Invalid unpublished role preparation');
 for(const part of plan.parts){const{id,...body}=part.value||{};if(!/^[a-f0-9]{64}$/.test(id||'')||!/^productionRoleChunkViews\/[a-f0-9]{64}\/parts\/[a-f0-9]{64}$/.test(part.path)||part.path!==`${ROOT}/${body.scope}/parts/${id}`||nativeCanonicalSha256(body)!==id||Buffer.byteLength(JSON.stringify(part.value))>200*1024)throw Error('Invalid immutable role part')}
 // These content-addressed parts are independent and remain unpublished.
 // Bound concurrent preparation to four 25-part commits; authority/head
 // publication still happens once, in the caller's fenced transaction.
 // Drain every started commit before rejecting, so a retry cannot overlap
 // orphaned promises from this attempt. Never return a partial receipt.
 let next=0,failed=false,failure;
 const worker=async()=>{
  while(!failed&&next<plan.parts.length){
   const offset=next;next+=25;
   try{
    const batch=firestore.batch();
    for(const part of plan.parts.slice(offset,offset+25))batch.set(firestore.doc(part.path),part.value);
    await batch.commit();
   }catch(error){if(!failed){failed=true;failure=error}}
  }
 };
 await Promise.all(Array.from({length:Math.min(4,Math.ceil(plan.parts.length/25))},worker));
 if(failed)throw failure;
 return{sourceHash:plan.sourceHash,sourceRevision:plan.sourceRevision,manifests:plan.manifests,paths:new Set(plan.parts.map(p=>p.path))};
}
module.exports={planPublishedRoleChunks,stagePublishedRoleParts};
