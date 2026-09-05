'use strict';

const {createHash}=require('node:crypto');
const {nativeCanonicalSha256}=require('./native-canonical-sha256.cjs');

function createSchedulerExecutionLane({maxPending=16,maxWaitMs=5000,clock=()=>Date.now()}={}){
 let tail=Promise.resolve(),pending=0;
 return work=>{
  if(pending>=maxPending)return Promise.reject(Object.assign(new Error('排課服務忙碌，待送操作保留並稍後續傳'),{code:14}));
  pending++;const queuedAt=clock(),next=tail.then(()=>{if(clock()-queuedAt>maxWaitMs)throw Object.assign(new Error('排課等待逾時，待送操作保留並稍後續傳'),{code:14});return work()});
  tail=next.catch(()=>{});return next.finally(()=>{pending--});
 };
}

async function createStagingSchedulerRuntime({firestore,serverTimestamp,executeAuthorityPayload,getCachedAuthoritySnapshot=()=>null,primaryOwnerEmail,now=()=>Date.now()}={}){
 if(!firestore||typeof firestore.doc!=='function'||typeof firestore.collection!=='function'||typeof serverTimestamp!=='function'||typeof executeAuthorityPayload!=='function'||typeof getCachedAuthoritySnapshot!=='function')throw new Error('staging 排課後端邊界無效');
 const executeInOrder=createSchedulerExecutionLane();
 const [{FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb},{normalizeRecordDb},{sha256Canonical},{prepareActiveRecordSync},{createStagingV2AuthorityReadLoader},{createStagingV2ActiveRecordOperationSender},policy,projection]=await Promise.all([
  import('../js/core/cloud-full-record-shadow.js'),import('../js/core/cloud-record-data-hash.js'),import('../js/core/cloud-immutable-migration-backup.js'),import('../js/core/cloud-active-record-sync.js'),import('../js/core/staging-v2-authority-read-loader.js'),import('../js/core/staging-v2-active-record-browser-bridge.js'),import('../js/core/production-scheduler-operation.js'),import('../js/core/production-role-view-projection.js')
 ]);
 const recordDataHash=db=>`record-v1:${nativeCanonicalSha256(normalizeRecordDb(db))}`;
 const readDocument=async path=>{const snapshot=await firestore.doc(path).get();return snapshot.exists?snapshot.data():null};
 const readCollection=async path=>(await firestore.collection(path).get()).docs.map(row=>({id:row.id,data:row.data()}));
 const loader=createStagingV2AuthorityReadLoader({expectedProjectId:'danbridge-d8877-staging',getDocumentFromServer:readDocument,getCollectionFromServer:readCollection});
 const same=(left,right)=>sha256Canonical(left??null)===sha256Canonical(right??null);
 const requestAlreadyApplied=(db,request)=>request.changes.every(change=>{const current=db.lessons.find(row=>row.id===change.lessonId)||null;if(change.after===null)return current===null;if(!current||!same(policy.schedulerLesson(current),change.after))return false;if(change.student&&!db.students.some(row=>row.id===change.student.id))return false;return true});
 const responseFor=async({request,db,operationCount=0})=>{const control=await readDocument('stagingRoleRecordViewControls/danbridge/views/aa0966626336@gmail.com'),revision=Number(control?.revision),sourceHash=String(control?.sourceRecordHash||'');if(!Number.isSafeInteger(revision)||revision<1||!/^record-v1:[a-f0-9]{64}$/.test(sourceHash))throw new Error('staging AA 角色檢視尚未完成新版讀回');return{schema:policy.SCHEDULER_OPERATION_RESPONSE_SCHEMA,requestId:request.requestId,state:'committed',sourceHash,sourceRecordRevision:revision,operationCount,notificationCount:0,schedulerDb:projection.projectProductionSchedulerDb(db)}};
 return Object.freeze({async execute(input,identity){
  if(!identity||identity.emailVerified!==true||identity.appVerified!==true||!projection.PRODUCTION_SCHEDULER_EMAILS.includes(identity.email))throw new Error('排課專員登入驗證無效');
  const request=policy.normalizeProductionSchedulerRequest(input),fingerprint=sha256Canonical(request),receiptRef=firestore.doc(`companies/danbridge/stagingSchedulerReceipts/${request.requestId}`);
  return executeInOrder(async()=>{
   const started=now(),cachedBefore=getCachedAuthoritySnapshot(),cachedEpoch=String(cachedBefore?.activationEpoch||''),initialReads=[receiptRef.get(),readDocument('stagingRecordSyncV1PermanentFences/danbridge'),readDocument(`companyAccess/${identity.email}`)];
   if(cachedEpoch)initialReads.push(readDocument(`stagingActiveRecordV2Heads/danbridge/epochs/${cachedEpoch}`),readDocument(`stagingActiveRecordV2AuditCursors/danbridge/epochs/${cachedEpoch}`));
   const [existing,fence,member,cachedHead=null,cachedAuditCursor=null]=await Promise.all(initialReads);
   if(existing.exists){const saved=existing.data();if(saved.fingerprint!==fingerprint||saved.uid!==identity.uid||saved.email!==identity.email)throw new Error('排課回條識別衝突');return saved.response}
   const caller=policy.assertProductionSchedulerActor({...member,uid:identity.uid,email:identity.email}),activationEpoch=String(fence?.targetV2Epoch||'');
   if(!activationEpoch)throw new Error('staging V2 永久柵欄未就緒');
   const [liveHead,auditCursor]=cachedEpoch===activationEpoch?[cachedHead,cachedAuditCursor]:await Promise.all([readDocument(`stagingActiveRecordV2Heads/danbridge/epochs/${activationEpoch}`),readDocument(`stagingActiveRecordV2AuditCursors/danbridge/epochs/${activationEpoch}`)]),cached=getCachedAuthoritySnapshot(),cachedValid=cached?.activationEpoch===activationEpoch&&cached?.headHash===liveHead?.headHash&&(Number(cached?.auditRevision)||0)===(Number(auditCursor?.revision)||0)&&String(cached?.auditLastRecordId||'')===String(auditCursor?.lastRecordId||'')&&cached.documentsByCollection&&cached.sourceDb;
   let documents,source,sourceHash;
   if(cachedValid){documents=cached.documentsByCollection;source={db:cached.sourceDb};sourceHash=recordDataHash(source.db);if(sourceHash!==cached.sourceHash)throw new Error('staging 排課快取雜湊不一致')}
   else{const model=await loader.load({activationEpoch});documents=model.documentsByCollection;source=rebuildFullRecordShadowDb(documents,{environment:'staging'});sourceHash=recordDataHash(source.db)}
   console.info('STAGING_SCHEDULER_PREPARED',JSON.stringify({cacheHit:Boolean(cachedValid),elapsedMs:now()-started}));
   let response;
   if(requestAlreadyApplied(source.db,request))response=await responseFor({request,db:source.db});
   else{
    const planningStarted=now(),nowIso=new Date(planningStarted).toISOString(),target=policy.buildProductionSchedulerTarget(source.db,request,caller,{nowIso}),targetBuilt=now(),deviceId=`scheduler-${createHash('sha256').update(`${identity.uid}:${request.requestId}`,'utf8').digest('hex').slice(0,48)}`,plan=prepareActiveRecordSync({documentsByCollection:documents,baselineDb:source.db,localDb:target.db,environment:'staging',deviceId,activationEpoch,createdAt:nowIso,authoritativeSourceHash:sourceHash,hashRecordDb:recordDataHash});
    console.info('STAGING_SCHEDULER_PLANNED',JSON.stringify({targetMs:targetBuilt-planningStarted,planMs:now()-targetBuilt,operationCount:plan.operationCount}));
    if(plan.conflicts.length)throw new Error('staging 排課發現資料衝突，整批未執行');
    const records=plan.operations.filter(row=>row.collection!=='changes'),audits=plan.operations.filter(row=>row.collection==='changes');
    if(records.length>90||audits.length>30||plan.operations.length>120||!records.length)throw new Error('staging 排課交易超過安全範圍');
    const trustedHashes=Object.freeze({sourceHash:plan.targetHash,previousSourceHash:sourceHash}),sender=createStagingV2ActiveRecordOperationSender({browserClient:{save:payload=>executeAuthorityPayload(payload,trustedHashes)},getActor:()=>({uid:caller.uid,email:caller.email})});
    if(plan.operations.length===1)await sender.apply(plan.operations[0]);else await sender.applyBatch(plan.operations);
    response=await responseFor({request,db:target.db,operationCount:plan.operationCount});
   }
   const value={fingerprint,uid:caller.uid,email:caller.email,response,createdAt:serverTimestamp()};
   try{await receiptRef.create(value)}catch(error){if(Number(error?.code)!==6&&String(error?.code)!=='6')throw error;const raced=await receiptRef.get(),saved=raced.data();if(!raced.exists||saved?.fingerprint!==fingerprint||saved?.uid!==caller.uid||saved?.email!==caller.email)throw new Error('排課回條競態衝突');response=saved.response}
   return response;
  });
 }});
}

function stagingSchedulerErrorCode(error){const code=error?.code,numeric={1:'cancelled',4:'deadline-exceeded',10:'aborted',13:'internal',14:'unavailable'};if(typeof code==='number'&&numeric[code])return numeric[code];const named=typeof code==='string'?code.toLowerCase().replace(/^functions\//,'').replaceAll('_','-'):'';return['cancelled','deadline-exceeded','aborted','internal','unavailable'].includes(named)?named:'failed-precondition'}

module.exports={createStagingSchedulerRuntime,stagingSchedulerErrorCode,createSchedulerExecutionLane};
