// Bounded staging-only cutover. Never reads or writes production.
// Rebuildable role records are replaced while AA is inactive, so financial
// tombstones cannot remain accessible under the retained role identity.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {buildRoleRecordViewPlan,roleRecordViewKey,verifyRoleRecordViewReadback} from '../js/core/cloud-role-record-view.js';
const require=createRequire(import.meta.url),{Firestore,FieldValue}=require('@google-cloud/firestore'),{OAuth2Client}=require('google-auth-library');
const {nativeCanonicalSha256:hash}=require('../functions/native-canonical-sha256.cjs');
const project='danbridge-d8877-staging',email='aa0966626336@gmail.com',apply=process.argv[2]==='--apply';
assert.ok(process.argv.length<=3&&[undefined,'--plan','--apply'].includes(process.argv[2]));
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),ar=db.doc('companyAccess/'+email),cr=db.doc('stagingRoleRecordViewControls/danbridge/views/'+email),audit=db.doc('stagingRoleAcceptance/aa-no-finance-333');
try{
 const [a,c,prior]=await db.getAll(ar,cr,audit),access=a.data(),control=c.data();
 assert.equal(prior.exists,false,'A previous cutover exists; inspect it, do not overwrite');
 assert.equal(access?.role,'branch_manager');assert.equal(access.active,true);assert.equal(access.companyId,'danbridge');assert.equal(access.teacherId,'ent_be028c89-d80f-4887-830e-5b8b0273293a');assert.deepEqual(access.branchIds,['art_museum']);assert.equal(access.canMoveSchedule,false);
 const runtime=await require('../functions/staging-derived-delivery-runtime.cjs').createStagingDerivedDeliveryRuntime({firestore:db,expectedProjectId:project,serverTimestamp:()=>FieldValue.serverTimestamp()});
 await runtime.warm();const source=runtime.snapshot();assert.equal(source.sourceHash,control.sourceRecordHash);
 const candidate={...access,hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false};delete candidate.scopedDb;
 const view=buildProductionRoleViews(source.sourceDb,[candidate])[0],identity={email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds},viewKey=roleRecordViewKey(identity,source.activationEpoch);
 assert.equal(viewKey,control.viewKey);assert.doesNotMatch(JSON.stringify(view.db),/"(?:rate|baseSalary|pricingHistory|paymentStatus|payTeacher|chargeStudent|totalFee|amount)":/);
 const existing=[];for(const key of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${key}/records`).get();existing.push(...rows.docs)}
 assert.ok(existing.length<5000);for(const row of existing){assert.equal(row.data().email,email);assert.equal(row.data().viewKey,viewKey)}
 const users=await db.collection('users').where('companyId','==','danbridge').where('email','==',email).get();
 const plan=buildRoleRecordViewPlan({},view.db,{environment:'staging',identity,activationEpoch:source.activationEpoch,sourceRecordHash:source.sourceHash,publishId:'aa_privacy_333_20260917',publishedAt:new Date().toISOString(),currentControl:control,batchSize:100});
 const head=db.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`),originalHash=hash(access),controlHash=hash(control);
 if(apply){
  await db.runTransaction(async tx=>{const [aa,cc,h,l]=await tx.getAll(ar,cr,head,audit);assert.equal(l.exists,false);assert.equal(hash(aa.data()),originalHash);assert.equal(hash(cc.data()),controlHash);assert.equal(h.data().headHash,source.headHash);tx.create(audit,{schema:'aa-schedule-privacy-cutover-v1',project,email,state:'rebuilding',originalAccess:access,originalControl:control,viewKey,sourceHead:source.headHash,businessWrites:0,createdAt:FieldValue.serverTimestamp()});tx.update(ar,{active:false})});
  const guard=async tx=>{const [aa,h,l]=await tx.getAll(ar,head,audit);assert.equal(aa.data().active,false);assert.equal(hash({...aa.data(),active:true}),originalHash);assert.equal(h.data().headHash,source.headHash);assert.equal(l.data().state,'rebuilding')};
  for(let offset=0;offset<existing.length;offset+=100){const rows=existing.slice(offset,offset+100);await db.runTransaction(async tx=>{await guard(tx);const fresh=await tx.getAll(...rows.map(r=>r.ref));fresh.forEach((r,i)=>{assert.equal(hash(r.data()),hash(rows[i].data()));tx.delete(r.ref)})})}
  for(const batch of plan.batches)await db.runTransaction(async tx=>{await guard(tx);const refs=batch.operations.map(op=>db.doc(op.path)),rows=await tx.getAll(...refs);assert.ok(rows.every(row=>!row.exists));refs.forEach((ref,i)=>tx.create(ref,batch.operations[i].payload))});
  const docs={};for(const key of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${key}/records`).get();docs[key]=rows.docs.map(row=>({id:row.id,data:row.data()}))}
  verifyRoleRecordViewReadback(docs,view.db,{environment:'staging',identity,activationEpoch:source.activationEpoch,control:plan.control});
  await db.runTransaction(async tx=>{await guard(tx);tx.set(ar,candidate);tx.set(cr,plan.control);for(const row of users.docs)tx.update(row.ref,{hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false,scopedDb:FieldValue.delete(),scopedClientHash:FieldValue.delete()});tx.update(audit,{state:'active',activatedAt:FieldValue.serverTimestamp(),removedDerivedRecords:existing.length,publishedRecords:plan.writes})});
  const [aa,cc,h]=await db.getAll(ar,cr,head);assert.equal(hash(aa.data()),hash(candidate));assert.equal(hash(cc.data()),hash(plan.control));assert.equal(h.data().headHash,source.headHash);
 }
 console.log(JSON.stringify({project,state:apply?'active-and-readback-verified':'planned',oldDerivedRecords:existing.length,newDerivedRecords:plan.writes,lessons:view.db.lessons.length,financialDataAbsent:true,canMoveSchedule:false,scheduleBranchIds:candidate.scheduleBranchIds,businessWrites:0}));
}finally{await db.terminate()}
