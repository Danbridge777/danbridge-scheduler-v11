// Bounded staging-only activation for the branch-finance read capability.
// It never reads or writes production and never modifies business records.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {buildRoleRecordViewPlan,roleRecordViewKey,verifyRoleRecordViewReadback} from '../js/core/cloud-role-record-view.js';

const require=createRequire(import.meta.url);
const {Firestore,FieldValue}=require('@google-cloud/firestore');
const {OAuth2Client}=require('google-auth-library');
const {nativeCanonicalSha256:hash}=require('../functions/native-canonical-sha256.cjs');
const project='danbridge-d8877-staging',email='aa0966626336@gmail.com',apply=process.argv[2]==='--apply';
assert.ok(process.argv.length<=3&&[undefined,'--plan','--apply'].includes(process.argv[2]));
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
const accessRef=db.doc(`companyAccess/${email}`),controlRef=db.doc(`stagingRoleRecordViewControls/danbridge/views/${email}`),auditRef=db.doc('stagingRoleAcceptance/aa-branch-finance-343');
const ids=rows=>rows.map(row=>String(row.id)).sort();
const managed=row=>String(row?.branchId||'')==='art_museum';

try{
 const [accessSnap,controlSnap,priorAudit]=await db.getAll(accessRef,controlRef,auditRef),access=accessSnap.data(),control=controlSnap.data();
 assert.equal(priorAudit.exists,false,'The 343 staging activation already exists; inspect it instead of overwriting');
 assert.equal(access?.role,'branch_manager');assert.equal(access.active,true);assert.equal(access.companyId,'danbridge');
 assert.equal(access.teacherId,'ent_be028c89-d80f-4887-830e-5b8b0273293a');assert.deepEqual(access.branchIds,['art_museum']);
 assert.equal(access.hideFinancials,true);assert.equal(access.readOnly,true);assert.equal(access.canMoveSchedule,false);assert.equal(access.canManageSchedule,false);
 assert.deepEqual(access.scheduleBranchIds,['art_museum','hexi']);assert.notEqual(access.canViewBranchFinance,true);
 const runtime=await require('../functions/staging-derived-delivery-runtime.cjs').createStagingDerivedDeliveryRuntime({firestore:db,expectedProjectId:project,serverTimestamp:()=>FieldValue.serverTimestamp()});
 await runtime.warm();const source=runtime.snapshot();assert.equal(source.sourceHash,control.sourceRecordHash);
 const candidate={...access,canViewBranchFinance:true};delete candidate.scopedDb;delete candidate.scopedClientHash;
 const view=buildProductionRoleViews(source.sourceDb,[candidate])[0],identity={email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds},viewKey=roleRecordViewKey(identity,source.activationEpoch);
 assert.equal(viewKey,control.viewKey);assert.deepEqual([...new Set(view.db.lessons.map(row=>String(row.branchId)))].filter(Boolean).sort(),['art_museum','hexi']);
 for(const key of ['fixedExpenses','oneTimeExpenses','settlementRecords','summerCampRegistrations','winterCampRegistrations'])assert.deepEqual(ids(view.db[key]),ids((source.sourceDb[key]||[]).filter(managed)),`${key} must contain only Art Museum records`);
 assert.ok(view.db.collectionRecords.every(managed),'Every visible collection record must belong to Art Museum');
 const sourceStudents=new Map((source.sourceDb.students||[]).map(row=>[String(row.id),row]));
 for(const student of view.db.students){const original=sourceStudents.get(String(student.id));if(String(original?.billingBranchId||'')!=='hexi')continue;assert.equal(student.scheduleReferenceOnly,true);assert.deepEqual(Object.keys(student).sort(),['courseType','groupMemberIds','id','isGroupRoster','name','scheduleReferenceOnly','status'].filter(key=>student[key]!==undefined).sort())}
 const sourceTeachers=new Map((source.sourceDb.teachers||[]).map(row=>[String(row.id),row])),financeTeacherIds=new Set((source.sourceDb.teachers||[]).filter(row=>(row.assignedBranchIds||[]).includes('art_museum')).map(row=>String(row.id)));
 for(const lesson of source.sourceDb.lessons||[])if(!lesson.isDraft&&String(lesson.branchId||'')==='art_museum')for(const id of Array.isArray(lesson.teacherIds)&&lesson.teacherIds.length?lesson.teacherIds:[lesson.teacherId])if(id)financeTeacherIds.add(String(id));
 for(const teacher of view.db.teachers){if(financeTeacherIds.has(String(teacher.id)))continue;assert.equal(teacher.scheduleReferenceOnly,true);assert.deepEqual(Object.keys(teacher).sort(),['color','displayName','id','name','scheduleReferenceOnly'].filter(key=>teacher[key]!==undefined).sort())}
 for(const lesson of view.db.lessons.filter(row=>String(row.branchId)==='hexi'))for(const key of ['paymentStatus','chargeStudent','payTeacher','note','address','meetingUrl','onlinePlatform'])assert.equal(lesson[key],undefined,`Hexi schedule cannot expose ${key}`);
 const existing=[];for(const key of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${key}/records`).get();existing.push(...rows.docs)}
 assert.ok(existing.length<5000);for(const row of existing){assert.equal(row.data().email,email);assert.equal(row.data().viewKey,viewKey)}
 const userRows=await db.collection('users').where('companyId','==','danbridge').where('email','==',email).get();
 const plan=buildRoleRecordViewPlan({},view.db,{environment:'staging',identity,activationEpoch:source.activationEpoch,sourceRecordHash:source.sourceHash,publishId:'aa_branch_finance_343_20260918',publishedAt:new Date().toISOString(),currentControl:control,batchSize:100});
 const headRef=db.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`),originalAccessHash=hash(access),originalControlHash=hash(control);
 if(apply){
  await db.runTransaction(async tx=>{const [freshAccess,freshControl,head,audit]=await tx.getAll(accessRef,controlRef,headRef,auditRef);assert.equal(audit.exists,false);assert.equal(hash(freshAccess.data()),originalAccessHash);assert.equal(hash(freshControl.data()),originalControlHash);assert.equal(head.data().headHash,source.headHash);tx.create(auditRef,{schema:'aa-branch-finance-activation-v1',release:'20.26.343',project,email,state:'rebuilding',originalAccess:access,originalControl:control,viewKey,sourceHead:source.headHash,businessWrites:0,createdAt:FieldValue.serverTimestamp()});tx.update(accessRef,{active:false})});
  const guard=async tx=>{const [freshAccess,head,audit]=await tx.getAll(accessRef,headRef,auditRef);assert.equal(freshAccess.data().active,false);assert.equal(hash({...freshAccess.data(),active:true}),originalAccessHash);assert.equal(head.data().headHash,source.headHash);assert.equal(audit.data().state,'rebuilding')};
  for(let offset=0;offset<existing.length;offset+=100){const rows=existing.slice(offset,offset+100);await db.runTransaction(async tx=>{await guard(tx);const fresh=await tx.getAll(...rows.map(row=>row.ref));fresh.forEach((row,index)=>{assert.equal(hash(row.data()),hash(rows[index].data()));tx.delete(row.ref)})})}
  for(const batch of plan.batches)await db.runTransaction(async tx=>{await guard(tx);const refs=batch.operations.map(operation=>db.doc(operation.path)),rows=await tx.getAll(...refs);assert.ok(rows.every(row=>!row.exists));refs.forEach((ref,index)=>tx.create(ref,batch.operations[index].payload))});
  const documents={};for(const key of FULL_RECORD_COLLECTIONS){const rows=await db.collection(`stagingRoleRecordViews/danbridge/views/${viewKey}/collections/${key}/records`).get();documents[key]=rows.docs.map(row=>({id:row.id,data:row.data()}))}
  verifyRoleRecordViewReadback(documents,view.db,{environment:'staging',identity,activationEpoch:source.activationEpoch,control:plan.control});
  await db.runTransaction(async tx=>{await guard(tx);tx.set(accessRef,candidate);tx.set(controlRef,plan.control);for(const row of userRows.docs)tx.update(row.ref,{canViewBranchFinance:true,hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false,canManageSchedule:false,readOnly:true,scopedDb:FieldValue.delete(),scopedClientHash:FieldValue.delete()});tx.update(auditRef,{state:'active',activatedAt:FieldValue.serverTimestamp(),removedDerivedRecords:existing.length,publishedRecords:plan.writes,financeBranchIds:['art_museum'],scheduleBranchIds:['art_museum','hexi']})});
  const [freshAccess,freshControl,head]=await db.getAll(accessRef,controlRef,headRef);assert.equal(hash(freshAccess.data()),hash(candidate));assert.equal(hash(freshControl.data()),hash(plan.control));assert.equal(head.data().headHash,source.headHash);
 }
 console.log(JSON.stringify({project,state:apply?'active-and-readback-verified':'planned',oldDerivedRecords:existing.length,newDerivedRecords:plan.writes,lessons:view.db.lessons.length,financeBranchIds:['art_museum'],scheduleBranchIds:candidate.scheduleBranchIds,canViewBranchFinance:true,canMoveSchedule:false,readOnly:true,businessWrites:0}));
}finally{await db.terminate()}
