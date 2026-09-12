// Default is read-only. Explicit --activate uses a pinned, recoverable staging
// lease; --restore removes the extra permission before cleaning derived rows.
// No production client or legacy main authority is used.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {buildRoleRecordViewPlan,roleRecordViewKey} from '../js/core/cloud-role-record-view.js';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const project='danbridge-d8877-staging',email='aa0966626336@gmail.com';
const mode=process.argv[2]||'--plan';
assert.ok(['--plan','--activate','--restore'].includes(mode)&&process.argv.length<=3,'Invalid mode');
// The previous lease remains immutable and cleaned. This distinct run tests
// the now-deployed notification boundary; never reuse/erase its old receipt.
const leasePath='stagingRoleAcceptance/aa-branch-318-notification-20260912';
const expectedAccessHash='f301be1f46257c08225a3bae48e54d4054876f4a1e7f27a8e2832fd406974224';
const expectedControlHash='4029dc4695b47714bef4e64e14e5980c57c04f3d33ab32d2a5acdea4bda680fc';
const expectedHeadHash='2ca41c130c0b96f8bf5e595d629c7043ac8bb89098be5c57712467403296a725';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
const digest=require('../functions/native-canonical-sha256.cjs').nativeCanonicalSha256;
try{
 const accessRef=db.doc('companyAccess/'+email),controlRef=db.doc('stagingRoleRecordViewControls/danbridge/views/'+email);
 const leaseRef=db.doc(leasePath);
 if(mode==='--restore'){
  const saved=(await leaseRef.get()).data();assert.equal(saved?.schema,'danbridge-aa-staging-lease-v1');assert.equal(saved?.email,email);assert.equal(saved?.project,project);
  assert.equal(digest(saved.originalAccess),expectedAccessHash);assert.equal(digest(saved.originalControl),expectedControlHash);
  const result=await db.runTransaction(async tx=>{
   const [a,c,h,l]=await tx.getAll(accessRef,controlRef,db.doc(saved.headPath),leaseRef);const phase=l.data()?.state;
   assert.ok(['preparing','prepared','active','restored','cleaned'].includes(phase));
   if(['restored','cleaned'].includes(phase))return {alreadyRestored:true};
   assert.ok([expectedAccessHash,digest(saved.candidateAccess)].includes(digest(a.data())),'AA changed outside test; do not overwrite');
   assert.ok([expectedControlHash,digest(saved.candidateControl)].includes(digest(c.data())),'AA control changed outside test; do not overwrite');
   assert.equal(h.data()?.headHash,expectedHeadHash,'Authority changed; restore requires fresh role publication');
   tx.set(accessRef,saved.originalAccess);tx.set(controlRef,saved.originalControl);tx.update(leaseRef,{state:'restored',restoredAt:FieldValue.serverTimestamp()});return {alreadyRestored:false};
  });
  const [a,c]=await db.getAll(accessRef,controlRef);assert.equal(digest(a.data()),expectedAccessHash);assert.equal(digest(c.data()),expectedControlHash);
  let removed=0;
  for(const name of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${saved.viewKey}/collections/${name}/records`).get();
   for(let offset=0;offset<rows.docs.length;offset+=100){const chunk=rows.docs.slice(offset,offset+100);await db.runTransaction(async tx=>{const fresh=await tx.getAll(...chunk.map(row=>row.ref));for(const row of fresh){assert.equal(row.data()?.lastPublishId,saved.publishId);assert.equal(row.data()?.email,email);assert.equal(row.data()?.viewKey,saved.viewKey);tx.delete(row.ref)}});removed+=chunk.length;}
  }
  if(saved.state!=='cleaned')await leaseRef.update({state:'cleaned',removedDerivedRecords:removed,cleanedAt:FieldValue.serverTimestamp()});
  console.log(JSON.stringify({project,state:'restored-and-cleaned',originalAccessRestored:true,originalControlRestored:true,removedDerivedRecords:removed,businessWrites:0,...result}));
 }else{
 const [accessSnapshot,controlSnapshot]=await db.getAll(accessRef,controlRef);
 const access=accessSnapshot.data(),control=controlSnapshot.data();
 assert.equal(access?.role,'teacher');assert.equal(access?.active,true);assert.equal(access?.canManageSchedule,true);
 assert.equal(access?.companyId,'danbridge');assert.equal(control?.kind,'scheduler');assert.equal(control?.teacherId,access.teacherId);
 const runtime=await require('../functions/staging-derived-delivery-runtime.cjs').createStagingDerivedDeliveryRuntime({firestore:db,expectedProjectId:project,serverTimestamp:()=>FieldValue.serverTimestamp()});
 await runtime.warm();const source=runtime.snapshot();
 assert.equal(source.activationEpoch,control.activationEpoch);assert.equal(source.sourceHash,control.sourceRecordHash);
 const candidate={...access,email,role:'branch_manager',branchIds:['art_museum'],branchNames:['美術東四路'],managerName:access.teacherName,readOnly:true,canManageSchedule:false,canSubmitOwnReports:true};
 const views=buildProductionRoleViews(source.sourceDb,[candidate]);assert.equal(views.length,1);
 const view=views[0],identity={email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds};
 const viewKey=roleRecordViewKey(identity,source.activationEpoch),existing={};
 for(const name of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${name}/records`).get();existing[name]=rows.docs.map(row=>({id:row.id,data:row.data()}));}
 const publishId='aa_branch_318_notification_20260912',plan=buildRoleRecordViewPlan(existing,view.db,{environment:'staging',identity,activationEpoch:source.activationEpoch,sourceRecordHash:source.sourceHash,publishId,publishedAt:new Date().toISOString(),currentControl:control,batchSize:100});
 const [accessAfter,controlAfter,headAfter]=await db.getAll(accessRef,controlRef,db.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`));
 assert.equal(digest(accessAfter.data()),digest(access));assert.equal(digest(controlAfter.data()),digest(control));assert.equal(headAfter.data()?.headHash,source.headHash);
 assert.ok(view.db.lessons.every(lesson=>lesson.branchId==='art_museum'||!lesson.branchId&&lesson.location!=='河西一路'));
 if(mode==='--activate'){
  assert.equal(digest(access),expectedAccessHash);assert.equal(digest(control),expectedControlHash);assert.equal(source.headHash,expectedHeadHash);
  assert.equal(Object.values(existing).reduce((n,rows)=>n+rows.length,0),0,'Refuse to replace existing derived branch view');
  assert.ok(plan.operations.every(op=>op.beforeRevision===0&&op.payload.lastPublishId===publishId));assert.ok(plan.writes<=1500,'Bounded test publication');
  const headPath=`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`;
  await db.runTransaction(async tx=>{const [a,c,h,l]=await tx.getAll(accessRef,controlRef,db.doc(headPath),leaseRef);assert.equal(l.exists,false,'Lease already exists; restore or inspect instead of replay');assert.equal(digest(a.data()),expectedAccessHash);assert.equal(digest(c.data()),expectedControlHash);assert.equal(h.data()?.headHash,expectedHeadHash);tx.create(leaseRef,{schema:'danbridge-aa-staging-lease-v1',project,email,state:'preparing',headPath,viewKey,publishId,originalAccess:access,originalControl:control,candidateAccess:candidate,candidateControl:plan.control,createdAt:FieldValue.serverTimestamp(),businessWrites:0})});
  for(const batch of plan.batches){await db.runTransaction(async tx=>{const refs=batch.operations.map(op=>db.doc(op.path)),rows=await tx.getAll(...refs);assert.ok(rows.every(row=>!row.exists),'Derived target already exists');for(let i=0;i<refs.length;i++)tx.create(refs[i],batch.operations[i].payload)});}
  for(const batch of plan.batches){const rows=await db.getAll(...batch.operations.map(op=>db.doc(op.path)));for(let i=0;i<rows.length;i++)assert.equal(digest(rows[i].data()),digest(batch.operations[i].payload));}
  await leaseRef.update({state:'prepared'});
  await db.runTransaction(async tx=>{const [a,c,h,l]=await tx.getAll(accessRef,controlRef,db.doc(headPath),leaseRef);assert.equal(l.data()?.state,'prepared');assert.equal(digest(a.data()),expectedAccessHash);assert.equal(digest(c.data()),expectedControlHash);assert.equal(h.data()?.headHash,expectedHeadHash);tx.set(accessRef,candidate);tx.set(controlRef,plan.control);tx.update(leaseRef,{state:'active',activatedAt:FieldValue.serverTimestamp()})});
  const [a,c]=await db.getAll(accessRef,controlRef);assert.equal(digest(a.data()),digest(candidate));assert.equal(digest(c.data()),digest(plan.control));
  console.log(JSON.stringify({project,state:'temporary-branch-role-active',branchIds:identity.branchIds,derivedRecords:plan.writes,roleAndControlWrites:2,businessWrites:0,restoreCommand:'node tools/staging-aa-branch-preflight.mjs --restore'}));
 }
 else
 console.log(JSON.stringify({project,writes:0,state:'planned-only',sourceHash:source.sourceHash,sourceHeadHash:source.headHash,originalControlRevision:control.revision,originalAccessHash:digest(access),originalControlHash:digest(control),candidateRole:identity.kind,candidateBranchIds:identity.branchIds,sourceCounts:Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,source.sourceDb[k].length])),branchCounts:Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,view.db[k].length])),existingCandidateDocuments:Object.values(existing).reduce((n,rows)=>n+rows.length,0),plannedRoleRecordWrites:plan.writes,plannedBatches:plan.batches.length,plannedControlRevision:plan.control.revision,businessWrites:0},null,2));
 }
}finally{await db.terminate()}
