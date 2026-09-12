// Read-only cloud input, local browser planning only. No submit/seed/cleanup API.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {chromium,webkit} from '@playwright/test';
const runId=process.argv[2];
if(runId!=='80190109-2684-4a92-a726-abf3cae53b5a')throw Error('Exact existing synthetic workspace required');
const lessonCount=Number(process.argv[3]||20);
if(!Number.isSafeInteger(lessonCount)||lessonCount<1||lessonCount>20)throw Error('Read-only profile supports 1–20 lessons');
const require=createRequire(import.meta.url),p='/usr/local/lib/node_modules/firebase-tools/lib',account=require(p+'/auth.js').getGlobalDefaultAccount(),project='danbridge-d8877-staging';
await require(p+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(p+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const native=new Firestore({projectId:project,authClient}),root=native.doc('acceptancePublishedTransport/workspace-280-'+runId);
const {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb,createImmutableFullRecordShadowRebuilder}=await import('../js/core/cloud-full-record-shadow.js');
const {recordDataHash}=await import('../js/core/cloud-record-data-hash.js');
let documents,safety;
try{
 const state=(await root.get()).data();if(state?.purpose!=='normal-ui-published-280-synthetic-only'||state.state!=='active'||Object.keys(state.activeOperations||{}).length)throw Error('Workspace not safely idle');
 const ref=root.collection('companies/danbridge/productionRecordRuntime').doc('safety'),before=(await ref.get()).data();
 documents=Object.fromEntries(await Promise.all(FULL_RECORD_COLLECTIONS.map(async k=>[k,(await root.collection(`productionFullRecordShadows/danbridge/collections/${k}/records`).get()).docs.map(row=>({id:row.id,data:JSON.parse(JSON.stringify(row.data()))}))])));
 safety=(await ref.get()).data();const source=rebuildFullRecordShadowDb(documents,{environment:'production'});
 if(before.recordRevision!==safety.recordRevision||recordDataHash(source.db)!==safety.recordDataHash)throw Error('Source changed or hash mismatch');
}finally{await native.terminate()}
if(process.argv.includes('--native-only')){
 const {nativeCanonicalRecordDbSha256}=require('../functions/native-canonical-sha256.cjs');
 const target={...documents,lessons:documents.lessons.map((row,index)=>index<lessonCount?{...row,data:{...row.data,revision:row.data.revision+1,record:{...row.data.record,title:'read-only-native-profile'}}}:row)};
 const samples=[];
 for(let round=0;round<3;round++){
  let at=performance.now();const previous=rebuildFullRecordShadowDb(documents,{environment:'production'}),oldSource=nativeCanonicalRecordDbSha256(previous.db,FULL_RECORD_COLLECTIONS),next=rebuildFullRecordShadowDb(target,{environment:'production'}),oldTarget=nativeCanonicalRecordDbSha256(next.db,FULL_RECORD_COLLECTIONS),oldMs=performance.now()-at;
  at=performance.now();const reader=createImmutableFullRecordShadowRebuilder(),memo=new WeakMap(),a=reader.rebuild(documents,{environment:'production'}),newSource=nativeCanonicalRecordDbSha256(a.db,FULL_RECORD_COLLECTIONS,{memo}),b=reader.rebuild(target,{environment:'production'}),newTarget=nativeCanonicalRecordDbSha256(b.db,FULL_RECORD_COLLECTIONS,{memo});
  if(oldSource!==newSource||oldTarget!==newTarget)throw Error('Native profile hash mismatch');
  samples.push({round,legacyMs:Math.round(oldMs),immutableMs:Math.round(performance.now()-at),hashesMatch:true});
 }
 console.log(JSON.stringify({mode:'local-native-verification-only',lessonCount,revision:safety.recordRevision,records:safety.documentCount,documentBytes:Buffer.byteLength(JSON.stringify(documents)),samples,cloudWrites:0,formalDataWrites:0}));
}
for(const [name,engine]of process.argv.includes('--native-only')?[]:[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage();
  await page.route('**/readonly-plan-profile',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><p>Read-only local planner</p>'}));
  await page.goto('http://127.0.0.1:4173/readonly-plan-profile');
  const samples=await page.evaluate(async({documents,safety,lessonCount})=>{
   const {rebuildFullRecordShadowDb}=await import('/js/core/cloud-full-record-shadow.js');
   const {recordDataHash}=await import('/js/core/cloud-record-data-hash.js');
   const {prepareActiveRecordSync,canonicalizeActiveRecordPlanHeads}=await import('/js/core/cloud-active-record-sync.js');
   const {prepareRecordPlanOffThread}=await import('/js/core/cloud-record-plan-executor.js');
   const remote=rebuildFullRecordShadowDb(documents,{environment:'production'}),base=remote.db,pool=base.lessons.filter(row=>JSON.stringify(row).includes('AUDIT286-MULTI40'));
   if(pool.length!==40)throw Error('Expected exactly 40 existing synthetic source lessons');
   const chosen=pool.slice(0,lessonCount);
   const ids=new Set(chosen.map(row=>row.id)),moved=row=>({...row,date:new Date(Date.parse(row.date+'T00:00:00Z')-86400000).toISOString().slice(0,10)});
   const local={...base,lessons:base.lessons.map(row=>ids.has(row.id)?moved(row):row),changes:[...chosen.map(row=>({at:'2026-09-12T00:00:00.000Z',message:'local-profile-only',before:row,after:moved(row)})),...base.changes]};
   const options={documentsByCollection:documents,baselineDb:base,localDb:local,environment:'production',deviceId:'readonly-profiler',activationEpoch:safety.activationEpoch,createdAt:'2026-09-12T00:00:00.000Z',authoritativeSourceHash:safety.recordDataHash,verifiedRemote:{...remote,db:base,hash:safety.recordDataHash},changedCollections:['lessons','changes'],appendOnlyChangesCount:lessonCount};
   const samples=[];
   for(let round=0;round<2;round++){
    let hashingMs=0;const at=performance.now();
    const plan=prepareActiveRecordSync({...options,hashRecordDb:db=>{const start=performance.now();const hash=recordDataHash(db);hashingMs+=performance.now()-start;return hash}}),prepared=performance.now();
    const canonical=await canonicalizeActiveRecordPlanHeads(plan,documents),finished=performance.now();
    const workerStart=performance.now(),worker=await prepareRecordPlanOffThread(options);
    samples.push({round,records:remote.documentCount,changes:base.changes.length,prepareMs:Math.round(prepared-at),wholeTargetHashMs:Math.round(hashingMs),remainingPrepareMs:Math.round(prepared-at-hashingMs),canonicalHeadsMs:Math.round(finished-prepared),workerRoundtripMs:Math.round(performance.now()-workerStart),sameHeads:JSON.stringify(worker.operations)===JSON.stringify(canonical.operations),operations:worker.operationCount});
   }
   return samples;
  },{documents,safety,lessonCount});
  console.log(JSON.stringify({engine:name,lessonCount,revision:safety.recordRevision,formalDataWrites:0,cloudWrites:0,samples}));
 }finally{await browser.close()}
}
