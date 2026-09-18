// Verifies the published production branch projections before closing the
// release audit. Writes only the acceptance document; never business data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';

const project='danbridge-d8877',apply=process.argv[2]==='--apply',emails=['aa0966626336@gmail.com','huberlucas88@gmail.com'];
assert.ok(process.argv.length<=3&&[undefined,'--plan','--apply'].includes(process.argv[2]));
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),auditRef=db.doc('productionRoleAcceptance/branch-finance-343');
try{
 const [safetySnapshot,accessSnapshots,...snapshots]=await Promise.all([
  db.doc('companies/danbridge/productionRecordRuntime/safety').get(),
  db.getAll(...emails.map(email=>db.doc(`companyAccess/${email}`))),
  ...FULL_RECORD_COLLECTIONS.map(collection=>db.collection(`productionFullRecordShadows/danbridge/collections/${collection}/records`).get())
 ]);
 const safety=safetySnapshot.data(),source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((collection,index)=>[collection,snapshots[index].docs.map(row=>({id:row.id,data:row.data()}))])),{environment:'production'});
 assert.equal(recordDataHash(source.db),safety.recordDataHash,'Production authority hash mismatch');
 const accessRows=accessSnapshots.map(snapshot=>({...snapshot.data(),email:snapshot.id}));
 for(const row of accessRows){assert.equal(row.role,'branch_manager');assert.equal(row.active,true);assert.deepEqual(row.branchIds,['art_museum']);assert.deepEqual(row.scheduleBranchIds,['art_museum','hexi']);assert.equal(row.hideFinancials,true);assert.equal(row.canViewBranchFinance,true);assert.equal(row.readOnly,true);assert.equal(row.canMoveSchedule,false);assert.equal(row.canManageSchedule,false)}
 const expectedViews=buildProductionRoleViews(source.db,accessRows,{now:Date.now()}),verified=[];
 for(const email of emails){
  const head=accessRows.find(row=>row.email===email),expected=expectedViews.find(view=>view.email===email);assert.ok(expected&&head?.roleChunkManifest,`Missing role view for ${email}`);
  const manifest=head.roleChunkManifest,parts=[];
  for(let offset=0;offset<manifest.chunkIds.length;offset+=100){const rows=await db.getAll(...manifest.chunkIds.slice(offset,offset+100).map(id=>db.doc(`productionRoleChunkViews/${manifest.scope}/parts/${id}`)));assert.ok(rows.every(row=>row.exists),`Missing role chunk for ${email}`);parts.push(...rows.map(row=>row.data()))}
  const assembled=assembleRoleViewChunks(manifest,parts,{identity:{email,kind:'branch_manager',teacherId:head.teacherId,branchIds:head.branchIds},minSourceRevision:safety.recordRevision,expectedSourceHash:safety.recordDataHash});
  const expectedHash=recordDataHash(expected.db),publishedHash=recordDataHash(assembled);assert.equal(publishedHash,expectedHash,`Published projection mismatch for ${email}`);
  const lessonBranches=[...new Set(assembled.lessons.map(row=>String(row.branchId||'unassigned')))];assert.ok(lessonBranches.includes('art_museum')&&lessonBranches.includes('hexi'),`Incomplete schedule scope for ${email}`);
  for(const key of ['fixedExpenses','oneTimeExpenses','settlementRecords','summerCampRegistrations','winterCampRegistrations','collectionRecords'])assert.ok((assembled[key]||[]).every(row=>String(row.branchId||'')==='art_museum'),`Cross-branch ${key} leak for ${email}`);
  assert.ok((assembled.collectionRecords||[]).flatMap(row=>row.billingItems||[]).every(item=>String(item.branchId||'')==='art_museum'),`Cross-branch billing item leak for ${email}`);
  verified.push({email,projectionHash:publishedHash,lessons:assembled.lessons.length,publicationRevision:manifest.publicationRevision});
 }
 assert.equal(new Set(verified.map(row=>row.projectionHash)).size,1,'AA and Lucas projections differ');
 const audit=await auditRef.get();assert.equal(audit.data()?.state,'access-active-role-view-pending','Acceptance audit is not pending');assert.equal(audit.data()?.release,'20.26.343');
 if(apply)await db.runTransaction(async tx=>{const current=await tx.get(auditRef);assert.equal(current.data()?.state,'access-active-role-view-pending');tx.update(auditRef,{state:'active-and-readback-verified',sourceRecordHash:safety.recordDataHash,sourceRecordRevision:safety.recordRevision,projectionHash:verified[0].projectionHash,verifiedRoles:verified,verifiedAt:require('@google-cloud/firestore').FieldValue.serverTimestamp(),businessWrites:0})});
 console.log(JSON.stringify({project,state:apply?'active-and-readback-verified':'verified-ready-to-finalize',release:'20.26.343',sourceRecordRevision:safety.recordRevision,projectionHash:verified[0].projectionHash,verifiedRoles:verified,businessWrites:0,auditWrites:apply?1:0},null,2));
}finally{await db.terminate()}
