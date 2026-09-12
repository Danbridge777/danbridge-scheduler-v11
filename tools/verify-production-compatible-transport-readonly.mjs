// Formal authority and permission projection comparison. Read-only, no row output.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';
const require=createRequire(import.meta.url),base='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877',a=require(base+'/auth.js').getGlobalDefaultAccount();
await require(base+'/requireAuth.js').requireAuth({project,user:a.user,tokens:a.tokens});
const token=await require(base+'/auth.js').getAccessToken(a.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),safetyRef=db.doc('companies/danbridge/productionRecordRuntime/safety');
try{
 const start=(await safetyRef.get()).data();
 const [access,teachers,schedulers,...snapshots]=await Promise.all([db.collection('companyAccess').where('companyId','==','danbridge').get(),db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get(),...FULL_RECORD_COLLECTIONS.map(k=>db.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get())]);
 const source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,snapshots[i].docs.map(r=>({id:r.id,data:r.data()}))])),{environment:'production'});
 if(recordDataHash(source.db)!==start.recordDataHash||['documentCount','activeCount','tombstoneCount'].some(k=>source[k]!==start[k]))throw Error('Authority mismatch');
 const accessRows=access.docs.map(r=>({...r.data(),email:r.id})),heads=new Map([...access.docs,...teachers.docs,...schedulers.docs].map(r=>[r.ref.path,r.data()])),views=buildProductionRoleViews(source.db,accessRows,{now:Date.now()}),verified=[];
 for(const view of views){
  const branch=view.kind==='branch_manager',path=branch?'companyAccess/'+view.email:`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`,head=heads.get(path),manifest=head?.roleChunkManifest;
  if(!manifest||!Array.isArray(manifest.chunkIds)||manifest.chunkIds.length>4096||!/^[a-f0-9]{64}$/.test(manifest.scope)||manifest.chunkIds.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw Error('Missing or invalid manifest for '+view.kind);
  const parts=[];
  for(let i=0;i<manifest.chunkIds.length;i+=100){const rows=await db.getAll(...manifest.chunkIds.slice(i,i+100).map(id=>db.doc(`productionRoleChunkViews/${manifest.scope}/parts/${id}`)));if(rows.some(r=>!r.exists))throw Error('Published part missing');parts.push(...rows.map(r=>r.data()))}
  const assembled=assembleRoleViewChunks(manifest,parts,{identity:{email:view.email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds||[]},minSourceRevision:start.recordRevision,expectedSourceHash:start.recordDataHash});
  const expected=recordDataHash(view.db);if(recordDataHash(assembled)!==expected||recordDataHash(head[branch?'scopedDb':'db'])!==expected)throw Error('Current and compatible role projection mismatch: '+view.kind);
  verified.push({role:view.kind,lessons:assembled.lessons.length,parts:parts.length,sourceRevision:manifest.sourceRevision,release:head.release,verified:true});
 }
 const [end,accessEnd,teachersEnd,schedulersEnd]=await Promise.all([safetyRef.get(),db.collection('companyAccess').where('companyId','==','danbridge').get(),db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get()]);
 const versions=s=>s.docs.map(r=>r.ref.path+':'+r.updateTime.toMillis()).sort().join('|');
 if(end.data().lastEventHash!==start.lastEventHash||[[access,accessEnd],[teachers,teachersEnd],[schedulers,schedulersEnd]].some(([x,y])=>versions(x)!==versions(y)))throw Error('Concurrent data change during proof; retry read-only');
 console.log(JSON.stringify({project,formalDataWrites:0,authorityVerified:true,state:start.state,recordRevision:start.recordRevision,recordDataHash:start.recordDataHash,activeLessons:source.db.lessons.length,collections:FULL_RECORD_COLLECTIONS.length,roles:verified},null,2));
}finally{await db.terminate()}
