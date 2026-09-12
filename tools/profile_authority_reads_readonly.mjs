// Read-only experiment. Every method reads all 16 collections in one native
// transaction, verifies the complete hash/counts, and refuses an active writer.
// No cache of record contents or IDs is used, and no cloud writes are exposed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldPath} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';

const runId=process.argv[2];
const comparison=process.argv[3]||'membership';
assert.ok(['membership','transport','inputs','version-cache'].includes(comparison),'Known read-only comparison required');
assert.equal(runId,'80190109-2684-4a92-a726-abf3cae53b5a','Exact existing synthetic workspace required');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,undefined);
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const project='danbridge-d8877-staging',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const clients={rest:new Firestore({projectId:project,authClient,preferRest:true})};
if(comparison==='transport')clients.grpc=new Firestore({projectId:project,authClient,preferRest:false});
const prefix='acceptancePublishedTransport/workspace-280-'+runId;
const idle=state=>{
 assert.equal(state?.purpose,'normal-ui-published-280-synthetic-only');
 assert.equal(state.state,'active');assert.equal(Object.keys(state.activeOperations||{}).length,0,'Workspace has an in-flight writer');
};
const rowsByCollection=snapshots=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map((k,i)=>[k,snapshots[i].map(row=>({id:row.id,data:row.data()}))]));
const samples=[];
const historyCache=new Map();
try{
 const cases=comparison==='version-cache'?['version-cache','version-cache','version-cache','version-cache'].map(method=>({transport:'rest',method})):comparison==='transport'?['rest','grpc','rest','grpc'].map(transport=>({transport,method:'queries'})):comparison==='inputs'?['inputs','inputs','inputs'].map(method=>({transport:'rest',method})):['queries','membership-then-batchget','queries','membership-then-batchget'].map(method=>({transport:'rest',method}));
 for(const {method,transport} of cases){
  const native=clients[transport],root=native.doc(prefix),safetyRef=native.doc(prefix+'/companies/danbridge/productionRecordRuntime/safety');
  const queries=FULL_RECORD_COLLECTIONS.map(k=>native.collection(prefix+`/productionFullRecordShadows/danbridge/collections/${k}/records`));
  const started=performance.now();
  const sample=await native.runTransaction(async tx=>{
   const [rootRow,safetyRow]=await Promise.all([tx.get(root),tx.get(safetyRef)]);idle(rootRow.data());
   const safety=safetyRow.data(),at=performance.now();let documents,queryMs,recordMs,inputTimings;
   if(method==='version-cache'){
    const rows=await Promise.all(queries.map(async(q,i)=>{
     if(FULL_RECORD_COLLECTIONS[i]!=='changes')return(await tx.get(q)).docs;
     if(!historyCache.size){const full=(await tx.get(q)).docs;for(const d of full){assert.ok(d.updateTime);historyCache.set(d.ref.path,d)}return full}
     const membership=(await tx.get(q.select(FieldPath.documentId()))).docs;
     const missing=membership.filter(d=>{assert.ok(d.updateTime);return!historyCache.get(d.ref.path)?.updateTime.isEqual(d.updateTime)});
     if(missing.length)for(const d of await tx.getAll(...missing.map(d=>d.ref)))historyCache.set(d.ref.path,d);
     const paths=new Set(membership.map(d=>d.ref.path));for(const path of historyCache.keys())if(!paths.has(path))historyCache.delete(path);
     return membership.map(d=>{const cached=historyCache.get(d.ref.path);assert.ok(cached.updateTime.isEqual(d.updateTime));return cached});
    }));
    documents=rowsByCollection(rows);queryMs=performance.now()-at;recordMs=0;
   }else if(method==='inputs'){
    inputTimings=[];
    const read=async(name,query)=>{const begin=performance.now(),row=await tx.get(query),docs=row.docs||[row];inputTimings.push({name,ms:Math.round(performance.now()-begin),count:docs.length,bytes:docs.reduce((sum,d)=>sum+Buffer.byteLength(JSON.stringify(d.data()||{})),0)});return row};
    const inputs=[
     ['control',native.doc(prefix+'/companies/danbridge/productionRecordRuntime/control')],
     ['access',native.collection(prefix+'/companyAccess').where('companyId','==','danbridge')],
     ...['teacherViews','schedulerViews','lessonMeta'].map(k=>[k,native.collection(prefix+'/companies/danbridge/'+k)])
    ];
    const all=await Promise.all([...inputs.map(([name,q])=>read(name,q)),...queries.map((q,i)=>read('source:'+FULL_RECORD_COLLECTIONS[i],q))]);
    documents=rowsByCollection(all.slice(inputs.length).map(row=>row.docs));queryMs=performance.now()-at;recordMs=0;
    inputTimings.sort((a,b)=>b.ms-a.ms);
   }else if(method==='queries'){
    const rows=await Promise.all(queries.map(q=>tx.get(q)));queryMs=performance.now()-at;recordMs=0;
    documents=rowsByCollection(rows.map(row=>row.docs));
   }else{
    // A fresh transaction query enumerates EVERY ID, including new/deleted
    // membership. It does not infer membership from a previous head or cache.
    const memberships=await Promise.all(queries.map(q=>tx.get(q.select(FieldPath.documentId()))));
    queryMs=performance.now()-at;
    const refs=memberships.flatMap(row=>row.docs.map(doc=>doc.ref)),readStarted=performance.now();
    assert.ok(refs.length<=6000,'Bound this read-only experiment');
    const rows=refs.length?await tx.getAll(...refs):[];recordMs=performance.now()-readStarted;
    const byPath=new Map(rows.map(row=>[row.ref.path,row]));
    assert.equal(byPath.size,refs.length);assert.ok(rows.every(row=>row.exists));
    documents=rowsByCollection(memberships.map(row=>row.docs.map(doc=>byPath.get(doc.ref.path))));
   }
   const verifyStarted=performance.now(),rebuilt=rebuildFullRecordShadowDb(documents,{environment:'production'});
   assert.equal(recordDataHash(rebuilt.db),safety.recordDataHash);
   for(const key of ['documentCount','activeCount','tombstoneCount'])assert.equal(rebuilt[key],safety[key]);
   return{method,transport,revision:safety.recordRevision,records:rebuilt.documentCount,queryMs:Math.round(queryMs),recordMs:Math.round(recordMs),verifyMs:Math.round(performance.now()-verifyStarted),...(inputTimings?{inputTimings}:{}),hash:safety.recordDataHash,verified:true};
  },{readOnly:true});
  const [rootAfter,safetyAfter]=await Promise.all([root.get(),safetyRef.get()]);idle(rootAfter.data());
  assert.equal(safetyAfter.data().recordRevision,sample.revision);assert.equal(safetyAfter.data().recordDataHash,sample.hash);
  delete sample.hash;sample.elapsedMs=Math.round(performance.now()-started);samples.push(sample);
  console.log(JSON.stringify({project,namespace:prefix,cloudWrites:0,formalDataWrites:0,...sample}));
 }
 assert.equal(new Set(samples.map(row=>row.revision)).size,1,'Source changed across comparison');
}finally{await Promise.all(Object.values(clients).map(client=>client.terminate()))}
