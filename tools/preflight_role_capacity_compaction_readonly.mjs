// Read-only proof: compare every current role projection with authority and
// immutable parts, then measure removing ONLY the embedded compatibility db.
// No write-capable planner, deployment, data deletion or credential output.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),safetyRef=db.doc('companies/danbridge/productionRecordRuntime/safety');
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8')+2048;
try{
 const start=(await safetyRef.get()).data();
 if(start?.state!=='active'||start.writeAllowed!==true)throw Error('Authority is not active');
 const [access,teachers,schedulers,...snapshots]=await Promise.all([
  db.collection('companyAccess').where('companyId','==','danbridge').get(),
  db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get(),
  ...FULL_RECORD_COLLECTIONS.map(k=>db.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get())
 ]);
 const source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,snapshots[i].docs.map(r=>({id:r.id,data:r.data()}))])),{environment:'production'});
 if(recordDataHash(source.db)!==start.recordDataHash||['documentCount','activeCount','tombstoneCount'].some(k=>source[k]!==start[k]))throw Error('Authority mismatch');
 const heads=new Map([...access.docs,...teachers.docs,...schedulers.docs].map(r=>[r.ref.path,r.data()]));
 const views=buildProductionRoleViews(source.db,access.docs.map(r=>({...r.data(),email:r.id})),{now:Date.now()}),roles=[];
 for(const view of views){
  const branch=view.kind==='branch_manager',path=branch?'companyAccess/'+view.email:`companies/danbridge/${view.kind==='teacher'?'teacherViews':'schedulerViews'}/${view.email}`;
  const head=heads.get(path),manifest=head?.roleChunkManifest,key=branch?'scopedDb':'db';
  if(!manifest||!Array.isArray(manifest.chunkIds)||manifest.chunkIds.length>4096||!/^[a-f0-9]{64}$/.test(manifest.scope)||manifest.chunkIds.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw Error('Missing or invalid role manifest');
  const parts=[];
  for(let i=0;i<manifest.chunkIds.length;i+=100){
   const rows=await db.getAll(...manifest.chunkIds.slice(i,i+100).map(id=>db.doc(`productionRoleChunkViews/${manifest.scope}/parts/${id}`)));
   if(rows.some(r=>!r.exists))throw Error('Published part missing');parts.push(...rows.map(r=>r.data()));
  }
  const assembled=assembleRoleViewChunks(manifest,parts,{identity:{email:view.email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds||[]},minSourceRevision:start.recordRevision,expectedSourceHash:start.recordDataHash});
  const expected=recordDataHash(view.db);
  if(recordDataHash(assembled)!==expected||Object.hasOwn(head,key)&&recordDataHash(head[key])!==expected)throw Error('Permission-filtered role projection mismatch');
  const compact={...head};delete compact[key];
  roles.push({kind:view.kind,lessonCount:assembled.lessons.length,studentCount:assembled.students.length,partCount:parts.length,authorityAndPartsMatch:true,compatibleBytes:bytes(head),compactBytes:bytes(compact),compactPercent:100*bytes(compact)/800000,largestPartBytes:Math.max(0,...parts.map(bytes))});
 }
 const [end,accessEnd,teachersEnd,schedulersEnd]=await Promise.all([safetyRef.get(),db.collection('companyAccess').where('companyId','==','danbridge').get(),db.collection('companies/danbridge/teacherViews').get(),db.collection('companies/danbridge/schedulerViews').get()]);
 const versions=s=>s.docs.map(r=>r.ref.path+':'+JSON.stringify(r.updateTime)).sort().join('|');
 if(JSON.stringify(end.data())!==JSON.stringify(start)||[[access,accessEnd],[teachers,teachersEnd],[schedulers,schedulersEnd]].some(([a,b])=>versions(a)!==versions(b)))throw Error('Concurrent change; retry proof read-only');
 console.log(JSON.stringify({project,checkedAt:new Date().toISOString(),cloudWrites:0,authorityVerified:true,recordRevision:start.recordRevision,activeLessons:source.db.lessons.length,roles,targetBytes:240000,allHeadsBelow30Percent:roles.length>0&&roles.every(r=>r.compactBytes<=240000),clientCutoverVerified:false,productionChanged:false},null,2));
}finally{await db.terminate()}
