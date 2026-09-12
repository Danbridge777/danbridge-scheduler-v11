// Production reads and pure in-memory planning only. No write-capable adapter
// is passed to the planner. Output contains sizes/counts, never business rows.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
const require=createRequire(import.meta.url),base='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877';
const {planPublishedRoleChunks}=require('../functions/published-role-chunk-plan.cjs');
const {nativeCanonicalSha256}=require('../functions/native-canonical-sha256.cjs');
const account=require(base+'/auth.js').getGlobalDefaultAccount();
await require(base+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(base+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),safetyRef=db.doc('companies/danbridge/productionRecordRuntime/safety');
const rows=s=>s.docs.map(row=>({id:row.id,data:row.data()}));
try{
 const safetyBefore=(await safetyRef.get()).data();
 const [access,teachers,schedulers,...records]=await Promise.all([
  db.collection('companyAccess').where('companyId','==','danbridge').get(),
  db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get(),
  ...FULL_RECORD_COLLECTIONS.map(k=>db.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get())
 ]);
 const source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,rows(records[i])])),{environment:'production'});
 if(safetyBefore?.state!=='active'||safetyBefore.writeAllowed!==true||recordDataHash(source.db)!==safetyBefore.recordDataHash||['documentCount','activeCount','tombstoneCount'].some(k=>source[k]!==safetyBefore[k]))throw Error('Authority changed or validation failed; no cutover evidence produced');
 const heads=new Map([...access.docs,...teachers.docs,...schedulers.docs].map(row=>[row.ref.path,row.data()]));
 const plan=await planPublishedRoleChunks({source:source.db,accessRows:access.docs.map(row=>({...row.data(),email:row.id})),sourceRevision:safetyBefore.recordRevision,sourceHash:safetyBefore.recordDataHash,release:'20.26.310',reservedWrites:183,preserveLegacyViews:true},async path=>heads.get(path)||null,{deleteField:()=>null});
 const [after,accessAfter,teachersAfter,schedulersAfter]=await Promise.all([safetyRef.get(),db.collection('companyAccess').where('companyId','==','danbridge').get(),db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get()]);
 if(nativeCanonicalSha256(after.data())!==nativeCanonicalSha256(safetyBefore)||[[access,accessAfter],[teachers,teachersAfter],[schedulers,schedulersAfter]].some(([a,b])=>nativeCanonicalSha256(rows(a))!==nativeCanonicalSha256(rows(b))))throw Error('Authority or roles changed during preflight; retry read-only');
 console.log(JSON.stringify({project,cloudWrites:0,sourceRecordRevision:safetyBefore.recordRevision,authorityVerified:true,activeLessons:source.db.lessons.length,roleCount:plan.views.length,immutableParts:plan.parts.length,headWrites:plan.headWrites.length,needsPreparation:plan.needsPreparation,estimatedPublicationBytes:plan.estimatedBytes,heads:plan.views.map(view=>{const write=plan.headWrites.find(w=>w.path===view.headPath),current=heads.get(view.headPath),value=write?{...current,...write.value}:current;return{kind:view.kind,headJsonBytes:Buffer.byteLength(JSON.stringify(value)),legacyPresent:!!value[view.kind==='branch_manager'?'scopedDb':'db'],publishedPartCount:view.manifest.chunkIds.length}})},null,2));
}finally{await db.terminate()}
