// Authorized capacity cutover. Deletes only redundant embedded role copies;
// never touches authority, role identities, parts, notifications, or Rules.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
const project='danbridge-d8877',require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
assert.equal(process.argv[2],'--confirmed-all-staff-reopened');
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
assert.equal(account.user.email,'a0965487920@gmail.com');
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
for(const name of ['productionTrustedOperation','productionSchedulerOperation','productionPublishRoleViews']){
 const fn=(await api.get(`/projects/${project}/locations/asia-east1/functions/${name}`,{skipLog:{resBody:true}})).body;
 assert.equal(fn.state,'ACTIVE');assert.equal(fn.serviceConfig.environmentVariables.DANBRIDGE_ROLE_TRANSPORT,'published-v1');assert.equal(fn.serviceConfig.allTrafficOnLatestRevision,true);
}
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),safetyRef=db.doc('companies/danbridge/productionRecordRuntime/safety'),accessQuery=db.collection('companyAccess').where('companyId','==','danbridge');
try{
 const [safety,access,teachers,schedulers]=await Promise.all([safetyRef.get(),accessQuery.get(),db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get()]);
 assert.equal(safety.data().state,'active');assert.equal(safety.data().writeAllowed,true);
 const heads=[...teachers.docs,...schedulers.docs,...access.docs.filter(r=>r.data().role==='branch_manager'&&r.data().active===true)];assert.equal(heads.length,7,'Re-review unexpected role inventory');
 const sourceHash=safety.data().recordDataHash;
 const audit=await require('../functions/audit-published-role-readback.cjs').auditPublishedRoleReadback({firestore:db,sourceHash,identity:{email:account.user.email},primaryOwnerEmail:account.user.email});
 assert.equal(audit.total,7);
 const writes=heads.flatMap(row=>{const h=row.data(),key=row.ref.path.startsWith('companyAccess/')?'scopedDb':'db';assert.ok(h.roleChunkManifest);const compact={...h};delete compact[key];assert.ok(Buffer.byteLength(JSON.stringify(compact))+2048<=240000);return Object.hasOwn(h,key)?[{row,key,compact}]:[]});
 const backup='/private/tmp/danbridge-capacity-320-role-backup-'+Date.now()+'.json';
 await writeFile(backup,JSON.stringify({project,sourceHash,revision:safety.data().recordRevision,heads:heads.map(r=>({path:r.ref.path,data:r.data()}))}),{flag:'wx',mode:0o600});
 await db.runTransaction(async tx=>{
  const [currentSafety,currentAccess,lock,...currentHeads]=await Promise.all([tx.get(safetyRef),tx.get(accessQuery),tx.get(db.doc('companies/danbridge/productionRuntimeLocks/recordCommit')),...heads.map(h=>tx.get(h.ref))]);
  assert.equal(sha256Canonical(currentSafety.data()),sha256Canonical(safety.data()),'Authority changed: rerun fresh audit');
  const accessHash=s=>sha256Canonical(s.docs.map(r=>({id:r.id,data:r.data()})).sort((a,b)=>a.id.localeCompare(b.id)));
  assert.equal(accessHash(currentAccess),accessHash(access),'Access changed: abort');
  assert.ok(!lock.exists||lock.data().expiresAtMs<Date.now(),'Active business commit: retry after it finishes');
  currentHeads.forEach((h,i)=>assert.ok(h.updateTime.isEqual(heads[i].updateTime),'Head changed: abort'));
  for(const w of writes)tx.update(w.row.ref,{[w.key]:FieldValue.delete()});
 });
 for(const row of heads){const data=(await row.ref.get()).data(),key=row.ref.path.startsWith('companyAccess/')?'scopedDb':'db',expected={...row.data()};delete expected[key];assert.deepEqual(data,expected,'Unexpected head change after compaction')}
 const after=await require('../functions/audit-published-role-readback.cjs').auditPublishedRoleReadback({firestore:db,sourceHash,identity:{email:account.user.email},primaryOwnerEmail:account.user.email});
 assert.equal(after.roleViewDigest,audit.roleViewDigest);assert.equal(after.sourceRevision,audit.sourceRevision);
 console.log(JSON.stringify({project,removedDuplicateFields:writes.length,authorityWrites:0,notificationWrites:0,permissionWrites:0,allRoleContentsUnchanged:true,sourceRevision:after.sourceRevision,backup,capacity:await require('../functions/production-role-capacity.cjs').readProductionRoleCapacity(db)},null,2));
}finally{await db.terminate()}
