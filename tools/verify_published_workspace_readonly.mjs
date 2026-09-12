// Exact isolated workspace only. Never reads business collections or writes data.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {assembleRoleViewChunks} from '../js/core/role-view-chunks.js';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
const [runId,backupPath]=process.argv.slice(2);
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId||''))throw Error('Exact workspace UUID required');
const require=createRequire(import.meta.url),base='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging',account=require(base+'/auth.js').getGlobalDefaultAccount();
await require(base+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(base+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),root=db.doc('acceptancePublishedTransport/workspace-280-'+runId);
try{
 const state=await root.get();if(!state.exists||state.data().purpose!=='normal-ui-published-280-synthetic-only')throw Error('Workspace purpose mismatch');
 if(Object.keys(state.data().activeOperations||{}).length)throw Error('Workspace operations still active; read back only after completion');
 const safetyRef=root.collection('companies/danbridge/productionRecordRuntime').doc('safety');
 const safetyBefore=(await safetyRef.get()).data();
 const documents=Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async key=>[key,(await root.collection(`productionFullRecordShadows/danbridge/collections/${key}/records`).get()).docs.map(d=>({id:d.id,data:d.data()}))])));
 const lessons=documents.lessons.map(row=>row.data);
 const authority=rebuildFullRecordShadowDb(documents,{environment:'production'}),safety=(await safetyRef.get()).data();
 const authorityHash=recordDataHash(authority.db),authorityVerified=authorityHash===safety?.recordDataHash&&['documentCount','activeCount','tombstoneCount'].every(k=>authority[k]===safety[k]);
 if(!authorityVerified)throw Error('Independent authority hash/count verification failed; retry only after in-flight operations finish');
 const notifications=(await root.collection('companies/danbridge/scheduleNotifications').get()).docs.map(d=>d.data());
 const accessRows=(await root.collection('companyAccess').get()).docs.map(row=>({...row.data(),email:row.id}));
 const expectedViews=buildProductionRoleViews(authority.db,accessRows,{now:Date.now()});
 const roles={};for(const role of ['teacherViews','schedulerViews']){
  roles[role]=[];
  for(const row of (await root.collection('companies/danbridge/'+role).get()).docs){
   const data=row.data(),manifest=data.roleChunkManifest;
   const expected=expectedViews.find(view=>view.email===row.id&&view.kind===(role==='teacherViews'?'teacher':'scheduler'));
   if(!expected||!manifest||!/^[a-f0-9]{64}$/.test(manifest.scope||'')||!Array.isArray(manifest.chunkIds)||manifest.chunkIds.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw Error('Invalid isolated role head or recipient');
   const parts=[];for(let offset=0;offset<manifest.chunkIds.length;offset+=100){
    const snapshots=await db.getAll(...manifest.chunkIds.slice(offset,offset+100).map(id=>root.collection(`productionRoleChunkViews/${manifest.scope}/parts`).doc(id)));
    if(snapshots.some(part=>!part.exists))throw Error('Missing published role part');
    parts.push(...snapshots.map(part=>part.data()));
   }
   const assembled=assembleRoleViewChunks(manifest,parts,{identity:{email:expected.email,kind:expected.kind,teacherId:expected.teacherId,branchIds:expected.branchIds||[]},minSourceRevision:safety.recordRevision,expectedSourceHash:safety.recordDataHash});
   const matchesExpectedProjection=recordDataHash(assembled)===recordDataHash(expected.db);
   if(!matchesExpectedProjection)throw Error('Published role content differs from authoritative permission projection');
   const legacyPresent=!!data.db,legacyMatches=legacyPresent?recordDataHash(data.db)===recordDataHash(expected.db):null;
   if(legacyPresent&&!legacyMatches)throw Error('Legacy compatibility projection differs from chunk authority');
   roles[role].push({id:row.id,lessonCount:assembled.lessons.length,sourceHash:manifest.sourceHash,sourceRevision:manifest.sourceRevision,verifiedParts:parts.length,matchesExpectedProjection,legacyPresent,legacyMatches,release:data.release});
  }
 }
 for(const expected of expectedViews.filter(view=>['teacher','scheduler'].includes(view.kind)))if(!roles[expected.kind==='teacher'?'teacherViews':'schedulerViews'].some(row=>row.id===expected.email))throw Error('Missing expected role publication');
 const active=lessons.filter(r=>!r.deleted),byRecipient={};for(const row of notifications){const key=row.recipientEmail||'unknown',stats=byRecipient[key]??(byRecipient[key]={notifications:0,details:0,lessonIds:new Set(),read:0});stats.notifications++;stats.details+=(row.details||[]).length;for(const item of row.details||[])stats.lessonIds.add(item.lessonId);if(row.readAt||row.read===true)stats.read++}
 for(const stats of Object.values(byRecipient))stats.lessonIds=[...stats.lessonIds];
 let backup=null;if(backupPath){
  const exported=JSON.parse(await readFile(backupPath,'utf8'));const ids=new Set(active.map(r=>r.recordId));
  const rowHash=row=>recordDataHash(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,key==='changes'?[row]:[]])));
  const cloudHistory=authority.db.changes.map(rowHash),localHistory=(exported.changes||[]).map(rowHash),offset=localHistory.length-cloudHistory.length;
  const mismatches=cloudHistory.flatMap((hash,index)=>hash===localHistory[index+offset]?[]:[{cloudIndex:index,expectedLocalIndex:index+offset,actualLocalIndex:localHistory.indexOf(hash)}]);
  backup={lessons:exported.lessons.length,allOriginalIdsPresent:exported.lessons.every(r=>ids.has(String(r.id))),uniqueCloudIds:ids.size,history:{cloud:cloudHistory.length,local:localHistory.length,offset,mismatchCount:mismatches.length,firstMismatches:mismatches.slice(0,20)}};
 }
 const times={};for(const row of active){const key=String(row.record?.start)+'–'+String(row.record?.end);times[key]=(times[key]||0)+1}
 // Exact isolated IDs are retained so a delete/undo UI test can prove that it
 // restored the same records, not merely the same number of replacements.
 const activeLessonIds=active.map(row=>row.recordId).sort();
 // A count and a time histogram cannot detect dates/teachers swapped between
 // lessons. Retain a canonical digest of every full lesson record for exact
 // before/undo comparison, independently of the audit history that advances.
 const lessonRecordsHash=recordDataHash(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,key==='lessons'?active.map(row=>row.record):[]])));
 // Do not silently omit the newly accepted 1–20 lesson batches. Keep all
 // nonempty batch sizes, newest revisions first, including read acknowledgments.
 const recentNotifications=notifications.filter(row=>(row.details||[]).length>0).map(row=>({recipient:row.recipientEmail,sourceHash:row.sourceRecordHash,revision:row.sourceRecordRevision,details:row.details.length,uniqueLessonIds:new Set(row.details.map(item=>item.lessonId)).size,read:row.read===true||Boolean(row.readAt)})).sort((a,b)=>(b.revision??-1)-(a.revision??-1)||String(a.recipient).localeCompare(String(b.recipient)));
 const dailyBackupManifests=(await root.collection('dailyShardedBackups/danbridge/days').get()).docs.map(row=>{const d=row.data();return{day:row.id,state:d.state,sourceHash:d.sourceHash,verifiedHash:d.verifiedHash,chunkCount:d.chunkCount,recordCount:d.recordCount,verifiedAt:d.verifiedAt?.toDate?.().toISOString()||null}});
 const [stateAfter,safetyAfterSnapshot]=await Promise.all([root.get(),safetyRef.get()]),safetyAfter=safetyAfterSnapshot.data();
 if(stateAfter.data()?.purpose!==state.data().purpose||stateAfter.data()?.state!==state.data().state||Object.keys(stateAfter.data()?.activeOperations||{}).length||[safetyBefore,safetyAfter].some(row=>row?.recordRevision!==safety.recordRevision||row?.recordDataHash!==safety.recordDataHash))throw Error('Workspace changed during readback; do not combine evidence from different revisions');
 console.log(JSON.stringify({project,namespace:root.path,state:state.data().state,formalDataWrites:0,authorityVerified,authorityHash,lessonRecordsHash,sourceRecordRevision:safety.recordRevision,activeLessons:active.length,activeLessonIds,tombstones:lessons.length-active.length,times,backup,dailyBackupManifests,notifications:byRecipient,recentNotifications,roles},null,2));
}finally{await db.terminate()}
