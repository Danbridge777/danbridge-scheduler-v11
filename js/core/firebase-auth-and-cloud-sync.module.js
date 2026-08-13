import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, deleteField, onSnapshot, collection, query, where, getDocs, serverTimestamp, Timestamp, runTransaction, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfigs={
 production:{apiKey:"AIzaSyB4tID5Dl1c_6MCev1OZxMSpiYFq3t3_EU",authDomain:"danbridge-d8877.firebaseapp.com",projectId:"danbridge-d8877",messagingSenderId:"251283850754",appId:"1:251283850754:web:105a2813d86918af03091b",measurementId:"G-K6ZH7DF7RS"},
 staging:{apiKey:"AIzaSyDD1zt1Zc8n8Rzk6Vf1hYhanRWHzfrmGeI",authDomain:"danbridge-d8877-staging.firebaseapp.com",projectId:"danbridge-d8877-staging",storageBucket:"danbridge-d8877-staging.firebasestorage.app",messagingSenderId:"883029466360",appId:"1:883029466360:web:c45a0a2164d4c897aaef0d"}
};
const DANBRIDGE_ENVIRONMENT=['danbridge-d8877-staging.web.app','danbridge-d8877-staging.firebaseapp.com'].includes(location.hostname)?'staging':'production';
const firebaseConfig=firebaseConfigs[DANBRIDGE_ENVIRONMENT];
document.body.dataset.environment=DANBRIDGE_ENVIRONMENT;
window.__DANBRIDGE_ENVIRONMENT__=DANBRIDGE_ENVIRONMENT;

const COMPANY_ID='danbridge';
const OWNER_EMAIL='a0965487920@gmail.com';
const APP_RELEASE='20.26.50';
const SCHEDULER_ACCOUNT_EMAILS=new Set(['aa0966626336@gmail.com']);
const RETIRED_SCHEDULER_ACCOUNT_EMAILS=new Set(['wendylee0820520@gmail.com']);
const REPORT_NOTIFICATION_STARTED_AT=Date.parse('2026-08-11T06:50:00.000Z');
const OWNER_SYNC_RECOVERY_KEY='danbridge_owner_sync_recovery_v20210';
const CLOUD_BACKUP_RETENTION_DAYS=30;
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const cloud=getFirestore(app);
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});

// 舊版 Header 使用 onclick="authLogout()"；公開相容 API，避免 Header 重建前點擊失效。
window.authLogout=async function authLogout(){
 try{await signOut(auth)}
 catch(error){
   console.error('Firebase logout failed:',error);
   cloudStatus('登出失敗：'+(error?.message||error),'error');
 }
};
try{await setPersistence(auth,browserLocalPersistence)}catch(e){console.warn(e)}
try{await enableIndexedDbPersistence(cloud)}catch(e){console.warn('Firestore offline persistence:',e?.code||e)}

let cloudRole='';
let cloudTeacherId='';
let cloudBranchIds=[];
let cloudUid='';
let cloudEmailKey='';
let cloudRoleAccessSignature='';
let cloudCanManageSchedule=false;
let schedulerBaselineLessons=[],schedulerBaselineStudents=[];
let schedulerSaveChain=Promise.resolve();
let schedulerOptimisticLessons=new Map();
let schedulerOptimisticStudents=new Map();
let schedulerUploadRetryTimer=null,schedulerUploadRetryCount=0;
let schedulerStartupRecoveryChecked=false;
let schedulerEmergencyRecoveryCandidates=[];
let schedulerRecoveryHold=false;
function inspectSchedulerLocalRecoveryCandidates(){
 const candidates=[],add=(label,value)=>{if(!value||!Array.isArray(value.lessons)||!Array.isArray(value.students)||!Array.isArray(value.teachers))return;const dates=value.lessons.map(l=>l.date).filter(Boolean).sort();candidates.push({label,db:deepCopy(value),lessons:value.lessons.length,students:value.students.length,teachers:value.teachers.length,from:dates[0]||'—',to:dates.at(-1)||'—'})},parse=raw=>{try{return JSON.parse(raw||'null')}catch{return null}};
 add('主本機資料',parse(localStorage.getItem('danbridge_scheduler_v1')));add('aa 角色快取',parse(localStorage.getItem(localRoleCacheKey())));add('草稿資料',parse(localStorage.getItem('danbridge_scheduler_draft_v8')));try{const versions=parse(localStorage.getItem('danbridge_scheduler_versions_v4'));if(Array.isArray(versions))versions.forEach((v,index)=>add(`版本 ${index+1}｜${v.reason||v.createdAt||''}`,v.data))}catch{}
 schedulerEmergencyRecoveryCandidates=candidates.sort((a,b)=>b.lessons-a.lessons);return schedulerEmergencyRecoveryCandidates.map(({db,...summary})=>summary);
}
window.__danbridgeInspectSchedulerRecovery=inspectSchedulerLocalRecoveryCandidates;
function buildSchedulerRecoveryDifferenceReport(){
 inspectSchedulerLocalRecoveryCandidates();const source=schedulerEmergencyRecoveryCandidates.find(x=>x.label==='主本機資料'),comparison=schedulerEmergencyRecoveryCandidates.find(x=>x.label==='aa 角色快取');if(!source||!comparison)return null;
 const lessonKey=row=>String(row?.id||''),studentKey=row=>String(row?.id||''),comparisonLessons=new Map(comparison.db.lessons.map(row=>[lessonKey(row),row])),comparisonStudents=new Map(comparison.db.students.map(row=>[studentKey(row),row]));
 const missingLessons=source.db.lessons.filter(row=>!comparisonLessons.has(lessonKey(row))).map(row=>({id:row.id||'',date:row.date||'',start:row.start||row.startTime||'',end:row.end||row.endTime||'',teacherId:row.teacherId||'',teacher:row.teacher||row.teacherName||'',studentId:row.studentId||'',student:row.student||row.studentName||row.className||'',location:row.location||row.branch||'',room:row.room||row.classroom||'',raw:deepCopy(row)})).sort((a,b)=>`${a.date} ${a.start} ${a.id}`.localeCompare(`${b.date} ${b.start} ${b.id}`));
 const missingStudents=source.db.students.filter(row=>!comparisonStudents.has(studentKey(row))).map(row=>deepCopy(row));return{generatedAt:new Date().toISOString(),release:APP_RELEASE,readOnly:true,source:{label:source.label,lessons:source.lessons,students:source.students},comparison:{label:comparison.label,lessons:comparison.lessons,students:comparison.students},missingLessonCount:missingLessons.length,missingStudentCount:missingStudents.length,missingLessons,missingStudents};
}
window.__danbridgeBuildSchedulerRecoveryDifferenceReport=buildSchedulerRecoveryDifferenceReport;
function downloadSchedulerRecoveryDifferenceReport(){const report=buildSchedulerRecoveryDifferenceReport();if(!report)return alert('找不到可比較的主本機資料與 aa 角色快取。');const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`danbridge-aa-recovery-difference-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);alert(`唯讀差異報告已下載：\n缺少課程 ${report.missingLessonCount} 堂\n缺少學生 ${report.missingStudentCount} 位\n\n此報告只供安全檢查，不會還原、上傳或修改資料。`)}
function showSchedulerRecoveryInspector(){
 if(document.getElementById('schedulerRecoveryInspector'))return;const report=buildSchedulerRecoveryDifferenceReport();if(!report||(!report.missingLessonCount&&!report.missingStudentCount))return;const button=document.createElement('button');button.id='schedulerRecoveryInspector';button.type='button';button.className='btn';button.style.cssText='position:fixed;right:18px;bottom:92px;z-index:10002;background:#7f1d1d;color:#fff;border-color:#fecaca;box-shadow:0 10px 28px rgba(127,29,29,.28)';button.textContent=`下載唯讀差異（課程 ${report.missingLessonCount}）`;button.onclick=downloadSchedulerRecoveryDifferenceReport;document.body.appendChild(button);
}
let unsubscribeScheduleRequests=null;
let schedulerRequestQueue=[],schedulerRequestQueueIds=new Set(),schedulerRequestWorkerActive=false,schedulerRequestRetryTimer=null;
let schedulerQuarantinedRequestIds=new Set(),schedulerAppliedRequestCount=0;
let applyingCloud=false;
let unsubscribeState=null;
let unsubscribeAccessGuard=null;
let syncTimer=null;
let unsubscribeReports=null;
let unsubscribeScheduleNotifications=null;
let scheduleNotificationDocuments=[];
let currentScheduleNotification=null;
let scheduleNotificationCleanupStarted=false;
let lastPublishedOwnerDB=null;
let ownerBaselineReady=false;
let lessonReportDocuments=[];
let currentReportNotification=null;
let ownerUploadInFlight=false;
let ownerUploadQueued=false;
let ownerRetryTimer=null;
let ownerRetryCount=0;
const scheduleNotificationDeliveryJobs=new Map();
let roleViewPublishInFlight=false;
let roleViewPublishQueued=false;
let roleViewPublishSourceDB=null;
let roleViewRetryCount=0;
let roleViewRetryTimer=null;
let lastUploadedHash='';
let lastCloudSnapshotHash='';
let approvedLessonShrinkHash='';
// 本機資料一旦修改，在雲端確認寫入前禁止舊 snapshot 倒灌覆蓋。
let localDirtyHash='';
let localMutationVersion=0;
let ownerRecoveryBaseDB=null;
let reportSyncTimer=null;
let lessonMetaSignatureCache=new Map();
let lessonMetaCacheReady=false;
let scopedViewHashCache=new Map();
let companyAccessCache=null;
let companyAccessCacheAt=0;
let legacyMigrationStarted=false;
const COMPANY_ACCESS_CACHE_TTL=30000;
const errorEventQueue=[];
const errorEventFingerprints=new Map();
let errorEventCount=0;
let dailyBackupTimer=null;
let originalSaveDB=window.saveDB;
const originalEditLesson=window.editLesson;

function emptyDB(){return {students:[],teachers:[],lessons:[],makeups:[],changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[],branches:[]}}
function deepCopy(x){return JSON.parse(JSON.stringify(x||emptyDB()))}
function localRoleCacheKey(){
 if(cloudRole==='owner')return 'danbridge_scheduler_v1';
 const identity=(cloudEmailKey||cloudUid||'unknown').replace(/[^a-z0-9@._-]/gi,'_');
 return `danbridge_scheduler_view_${cloudRole||'signed_out'}_${identity}`;
}
function persistCurrentLocalView(){try{localStorage.setItem(localRoleCacheKey(),JSON.stringify(window.__danbridgeGetDB()))}catch{}}
function persistOwnerSyncRecovery(){
 if(cloudRole!=='owner'||!localDirtyHash)return;
 try{localStorage.setItem(OWNER_SYNC_RECOVERY_KEY,JSON.stringify({hash:localDirtyHash,mutationVersion:localMutationVersion,baseDb:ownerRecoveryBaseDB||lastPublishedOwnerDB||null,updatedAt:new Date().toISOString()}))}catch{}
}
function clearOwnerSyncRecovery(){ownerRecoveryBaseDB=null;try{localStorage.removeItem(OWNER_SYNC_RECOVERY_KEY)}catch{}}
function restoreOwnerSyncRecovery(){
 if(cloudRole!=='owner')return false;
 try{const saved=JSON.parse(localStorage.getItem(OWNER_SYNC_RECOVERY_KEY)||'null'),currentHash=dataHash(window.__danbridgeGetDB?.());if(saved?.hash&&saved.hash===currentHash){localDirtyHash=saved.hash;localMutationVersion=Math.max(localMutationVersion,Number(saved.mutationVersion)||1);ownerRecoveryBaseDB=saved.baseDb?deepCopy(saved.baseDb):null;ownerUploadQueued=true;return true}if(saved?.hash)clearOwnerSyncRecovery()}catch{}
 return false;
}
let cloudStatusHideTimer=null;
function cloudStatus(text,kind=''){let el=document.getElementById('firebaseCloudStatus');if(!el){el=document.createElement('div');el.id='firebaseCloudStatus';el.style.cssText='position:fixed;left:12px;bottom:12px;z-index:10001;padding:8px 11px;border-radius:10px;background:#172033;color:#fff;font-size:12px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.2);pointer-events:none';document.body.appendChild(el)}clearTimeout(cloudStatusHideTimer);el.hidden=false;el.textContent=text;el.dataset.kind=kind||'';el.style.background=kind==='error'?'#991b1b':kind==='ok'?'#18794e':kind==='pending'?'#9a6700':kind==='offline'?'#475569':'#172033';if(kind==='ok')cloudStatusHideTimer=setTimeout(()=>{if(el.dataset.kind==='ok')el.hidden=true},2200)}
function canonicalHashValue(value){
 if(Array.isArray(value))return value.map(canonicalHashValue);
 if(value&&typeof value==='object'){
  if(typeof value.toMillis==='function')return{__timestampMillis:value.toMillis()};
  return Object.keys(value).sort().reduce((result,key)=>{result[key]=canonicalHashValue(value[key]);return result},{});
 }
 return value;
}
function dataHash(value){try{const text=JSON.stringify(canonicalHashValue(value||{}));let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+text.length}catch{return String(Date.now())}}
const OWNER_MERGE_COLLECTION_KEYS=['students','teachers','lessons','makeups','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
const OWNER_APPEND_ONLY_COLLECTION_KEYS=['changes'];
function cloneMergeValue(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value))}
function mergeValueHash(value){return value===undefined?'__undefined__':dataHash(['__defined__',value])}
function mergeOwnerRecord(base,local,remote,path,conflicts){
 if(mergeValueHash(local)===mergeValueHash(base))return cloneMergeValue(remote);
 if(mergeValueHash(remote)===mergeValueHash(base)||mergeValueHash(local)===mergeValueHash(remote))return cloneMergeValue(local);
 if(!local||!remote||typeof local!=='object'||typeof remote!=='object'||Array.isArray(local)||Array.isArray(remote)){
  conflicts.push({path,local:cloneMergeValue(local),remote:cloneMergeValue(remote)});return cloneMergeValue(local);
 }
 const result={},keys=new Set([...Object.keys(base||{}),...Object.keys(local||{}),...Object.keys(remote||{})]);
 for(const key of keys){
  const b=base?.[key],l=local?.[key],r=remote?.[key],localChanged=mergeValueHash(l)!==mergeValueHash(b),remoteChanged=mergeValueHash(r)!==mergeValueHash(b);
  if(!localChanged)result[key]=cloneMergeValue(r);
  else if(!remoteChanged||mergeValueHash(l)===mergeValueHash(r))result[key]=cloneMergeValue(l);
  else if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r))result[key]=mergeOwnerRecord(b,l,r,`${path}.${key}`,conflicts);
  else {conflicts.push({path:`${path}.${key}`,local:cloneMergeValue(l),remote:cloneMergeValue(r)});result[key]=cloneMergeValue(l)}
 }
 return result;
}
function mergeOwnerCollection(baseRows=[],localRows=[],remoteRows=[],key,conflicts){
 const identity=(row,index)=>String(row?.id||row?.key||row?.email||row?.month||`${key}:missing-id:${index}`);
 const map=(rows)=>new Map((rows||[]).map((row,index)=>[identity(row,index),row]));
 const base=map(baseRows),local=map(localRows),remote=map(remoteRows),result=[];
 for(const id of new Set([...remote.keys(),...local.keys(),...base.keys()])){
  const b=base.get(id),l=local.get(id),r=remote.get(id),localChanged=mergeValueHash(l)!==mergeValueHash(b),remoteChanged=mergeValueHash(r)!==mergeValueHash(b);
  if(!localChanged){if(r!==undefined)result.push(cloneMergeValue(r));continue}
  if(!remoteChanged||mergeValueHash(l)===mergeValueHash(r)){if(l!==undefined)result.push(cloneMergeValue(l));continue}
  if(l===undefined){conflicts.push({path:`${key}.${id}:delete`,local:null,remote:cloneMergeValue(r)});result.push(cloneMergeValue(r));continue}
  if(r===undefined){conflicts.push({path:`${key}.${id}:remote-delete`,local:cloneMergeValue(l),remote:null});result.push(cloneMergeValue(l));continue}
  result.push(mergeOwnerRecord(b,l,r,`${key}.${id}`,conflicts));
 }
 return result;
}
function mergeAppendOnlyOwnerCollection(baseRows=[],localRows=[],remoteRows=[]){
 const hash=row=>dataHash(row),baseCounts=new Map(),result=[],resultCounts=new Map();
 for(const row of baseRows||[])baseCounts.set(hash(row),(baseCounts.get(hash(row))||0)+1);
 for(const row of remoteRows||[]){const key=hash(row);result.push(cloneMergeValue(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 const localCounts=new Map();
 for(const row of localRows||[]){
  const key=hash(row),seen=(localCounts.get(key)||0)+1;localCounts.set(key,seen);
  const baseCount=baseCounts.get(key)||0,target=Math.max(resultCounts.get(key)||0,seen,baseCount);
  if((resultCounts.get(key)||0)<target){result.push(cloneMergeValue(row));resultCounts.set(key,(resultCounts.get(key)||0)+1)}
 }
 return result;
}
function mergeConcurrentOwnerDB(baseDb,localDb,remoteDb){
 const base=baseDb||emptyDB(),local=localDb||emptyDB(),remote=remoteDb||emptyDB(),merged=deepCopy(remote),conflicts=[];
 for(const key of OWNER_MERGE_COLLECTION_KEYS)merged[key]=mergeOwnerCollection(base[key],local[key],remote[key],key,conflicts);
 for(const key of OWNER_APPEND_ONLY_COLLECTION_KEYS)merged[key]=mergeAppendOnlyOwnerCollection(base[key],local[key],remote[key]);
 for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  if(OWNER_MERGE_COLLECTION_KEYS.includes(key)||OWNER_APPEND_ONLY_COLLECTION_KEYS.includes(key))continue;
  merged[key]=mergeOwnerRecord(base[key],local[key],remote[key],key,conflicts);
 }
 const unique=[];for(const conflict of conflicts)if(!unique.some(x=>x.path===conflict.path))unique.push(conflict);
 return{db:merged,conflicts:unique};
}
function conflictBackupParts(conflicts,maxChars=160000){
 const serialized=JSON.stringify(conflicts),parts=[];for(let offset=0;offset<serialized.length;offset+=maxChars)parts.push(serialized.slice(offset,offset+maxChars));return parts.length?parts:['[]'];
}
const AUDIT_COLLECTION_KEYS=['students','teachers','lessons','makeups','teacherGroups','winterTeacherGroups','summerCampClasses','summerCampRegistrations','winterCampRegistrations','winterCampClasses','settlementRecords','fixedExpenses','oneTimeExpenses','collectionRecords','branches'];
function auditEntityId(row,index){return String(row?.id||row?.email||row?.month||index)}
function auditChangedFields(before,after){const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);return[...keys].filter(key=>JSON.stringify(before?.[key])!==JSON.stringify(after?.[key])).sort().slice(0,30)}
function buildImmutableDataAudit(beforeDb,afterDb){
 if(!beforeDb||!afterDb)return null;
 const entityChanges=[],fieldSet=new Set();let totalChanges=0;
 for(const key of AUDIT_COLLECTION_KEYS){
  const beforeRows=Array.isArray(beforeDb[key])?beforeDb[key]:[],afterRows=Array.isArray(afterDb[key])?afterDb[key]:[];
  const beforeMap=new Map(beforeRows.map((row,index)=>[auditEntityId(row,index),row])),afterMap=new Map(afterRows.map((row,index)=>[auditEntityId(row,index),row]));
  for(const id of new Set([...beforeMap.keys(),...afterMap.keys()])){
   const before=beforeMap.get(id),after=afterMap.get(id);if(JSON.stringify(before)===JSON.stringify(after))continue;
   const operation=!before?'create':!after?'delete':'update',fields=auditChangedFields(before,after);fields.forEach(field=>fieldSet.add(`${key}.${field}`));totalChanges++;
   if(entityChanges.length<80)entityChanges.push(`${key}:${operation}:${id}:${fields.join(',')}`);
  }
 }
 if(!totalChanges)return null;
 return{action:'data-change',category:'data',targetType:'company-data',targetId:COMPANY_ID,changedFields:[...fieldSet].slice(0,80),entityChanges,totalChanges,truncated:totalChanges>entityChanges.length,beforeHash:dataHash(beforeDb),afterHash:dataHash(afterDb)};
}
function immutableAuditRecord(detail={}){
 const afterHash=String(detail.afterHash||''),beforeHash=String(detail.beforeHash||''),stable=detail.eventId||dataHash([detail.category,detail.action,detail.targetType,detail.targetId,beforeHash,afterHash,Date.now(),Math.random()]).replace(/[^a-z0-9_-]/gi,'-');
 const payload={companyId:COMPANY_ID,action:String(detail.action||'unknown').slice(0,64),category:String(detail.category||'system').slice(0,32),actorUid:cloudUid,actorEmail:cloudEmailKey,targetType:String(detail.targetType||'system').slice(0,48),targetId:String(detail.targetId||'').slice(0,180),changedFields:(detail.changedFields||[]).map(String).slice(0,80),entityChanges:(detail.entityChanges||[]).map(String).slice(0,80),totalChanges:Math.max(0,Number(detail.totalChanges)||0),truncated:detail.truncated===true,beforeHash:beforeHash.slice(0,80),afterHash:afterHash.slice(0,80),release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT,createdAt:serverTimestamp()};
 return{ref:doc(cloud,'companyAudit',`${COMPANY_ID}-${stable}`),payload};
}
async function writeImmutableAudit(detail={}){
 if(cloudRole!=='owner'||!cloudUid||!cloudEmailKey)return false;
 const audit=immutableAuditRecord(detail);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);if(!existing.exists())transaction.set(audit.ref,audit.payload)});return true;
}
async function setCompanyAccessWithAudit(email,payload,detail,merge=true){
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);transaction.set(accessRef,payload,{merge});if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function deleteCompanyAccessWithAudit(email,detail){
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);transaction.delete(accessRef);if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function deleteOwnerAccessWithAudit(email,userRefs,detail){
 const audit=immutableAuditRecord(detail),accessRef=doc(cloud,'companyAccess',email);await runTransaction(cloud,async transaction=>{const existing=await transaction.get(audit.ref);userRefs.forEach(userRef=>transaction.set(userRef,{active:false,role:'revoked',updatedAt:serverTimestamp()},{merge:true}));transaction.delete(accessRef);if(!existing.exists())transaction.set(audit.ref,audit.payload)});
}
async function listImmutableAudit(){
 const box=document.getElementById('immutableAuditList');if(!box||cloudRole!=='owner')return;
 try{const qs=await getDocs(query(collection(cloud,'companyAudit'),where('companyId','==',COMPANY_ID))),rows=qs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)).slice(0,50);box.innerHTML=rows.length?rows.map(x=>`<div class="backup-item"><div class="info"><b>${escapeHTML(x.action||'操作')}</b><div class="small">${escapeHTML(x.actorEmail||x.actorUid||'Owner')}｜${escapeHTML(formatNotificationTimestamp(x.createdAt)||'時間確認中')}<br>${escapeHTML(x.targetType||'system')}：${escapeHTML(x.targetId||'—')}｜${Number(x.totalChanges)||0} 筆變更</div></div><span class="pill blue">不可覆寫</span></div>`).join(''):'<span class="small">尚無不可覆寫稽核紀錄。</span>'}catch(e){console.error('listImmutableAudit failed',e);box.innerHTML='<span class="small">稽核紀錄暫時無法讀取。</span>'}
}
function ownerSnapshotDecision(localDirty,incoming,current,lastCloud){if(localDirty&&incoming!==localDirty)return'ignore-dirty';if(incoming===lastCloud&&incoming===current)return'unchanged';return'apply'}
function ownerUploadConfirmation(uploadMutationVersion,currentMutationVersion,uploadedHash,latestHash){const confirmed=uploadMutationVersion===currentMutationVersion&&uploadedHash===latestHash;return{clearDirty:confirmed,queueNext:!confirmed}}
function ownerLessonShrinkRisk(beforeDb,afterDb){
 const beforeIds=new Set((beforeDb?.lessons||[]).map(row=>String(row?.id||'')).filter(Boolean));
 const afterIds=new Set((afterDb?.lessons||[]).map(row=>String(row?.id||'')).filter(Boolean));
 const removed=[...beforeIds].filter(id=>!afterIds.has(id)).length,before=beforeIds.size,after=afterIds.size;
 const risky=before>=20&&removed>=10&&removed/before>=0.1;
 return{risky,before,after,removed,ratio:before?removed/before:0};
}
function ownerRetryDelay(retryCount){return Math.min(30000,1000*Math.pow(2,Math.min(Math.max(0,retryCount),5)))}
function safeErrorCode(error){
 const raw=String(error?.code||error?.name||'unknown').toLowerCase();
 return raw.replace(/[^a-z0-9._/-]/g,'-').slice(0,80)||'unknown';
}
async function sendOperationalError(event){
 if(!auth.currentUser||!cloudRole||errorEventCount>=20)return;
 const fingerprint=[event.category,event.area,event.code,cloudRole].join('|');
 const now=Date.now(),last=errorEventFingerprints.get(fingerprint)||0;
 if(now-last<60000)return;
 errorEventFingerprints.set(fingerprint,now);errorEventCount++;
 try{
   await setDoc(doc(collection(cloud,'companies',COMPANY_ID,'errorEvents')),{release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT,category:event.category,area:event.area,code:event.code,role:cloudRole,retryable:event.retryable===true,occurredAt:serverTimestamp()},{merge:false});
 }catch{ /* 監控寫入失敗不得影響操作，也不得形成遞迴錯誤。 */ }
}
function reportOperationalError(error,{category='unhandled',area='window',retryable=false}={}){
 const allowedCategories=new Set(['unhandled','cloud-write','cloud-read','role-view']);
 const allowedAreas=new Set(['window','promise','owner-upload','owner-snapshot','teacher-view','branch-view','role-publish','access-guard']);
 const event={category:allowedCategories.has(category)?category:'unhandled',area:allowedAreas.has(area)?area:'window',code:safeErrorCode(error),retryable:retryable===true};
 if(!auth.currentUser||!cloudRole){if(errorEventQueue.length<10)errorEventQueue.push(event);return}
 void sendOperationalError(event);
}
function flushOperationalErrors(){while(errorEventQueue.length)void sendOperationalError(errorEventQueue.shift())}
window.addEventListener('error',event=>reportOperationalError(event.error||{name:'window-error'}));
window.addEventListener('unhandledrejection',event=>reportOperationalError(event.reason||{name:'promise-rejection'},{area:'promise'}));
function withSyncTimeout(promise,ms=15000){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('雲端連線逾時，將自動重試')),ms))])}
function scheduleOwnerRetry(){clearTimeout(ownerRetryTimer);if(cloudRole!=='owner'||!ownerUploadQueued)return;ownerRetryTimer=setTimeout(()=>uploadOwnerState(),ownerRetryDelay(ownerRetryCount))}
function setOfflineStatus(){if(!navigator.onLine){cloudStatus('目前離線；所有變更已先保存在這台裝置，恢復網路後會自動同步。','offline')}}
function setAuthCard(message='Sign in with your authorized Google account to continue.'){
 const screen=document.getElementById('authScreen');
 screen.innerHTML=`<div class="auth-minimal-shell">
  <section class="auth-minimal-brand" aria-label="Danbridge Operations">
    <div class="auth-minimal-wordmark">Danbridge</div>
    <div class="auth-feather-scene" aria-hidden="true">
      <span class="auth-feather-halo"></span>
      <img class="auth-gold-feather" src="./assets/images/danbridge-gold-feather-v2.png" alt="">
      <span class="auth-feather-line"></span>
    </div>
    <div class="auth-minimal-copy">
      <span>EDUCATION OPERATIONS</span>
      <h1>Quiet precision.<br><em>Exceptional learning.</em></h1>
      <p>Private education operations, refined.</p>
    </div>
  </section>

  <section class="auth-minimal-panel">
    <div class="auth-card auth-card-minimal">
    <div class="auth-card-seal"><i></i> SECURE ACCESS</div>
    <div class="auth-card-kicker">WELCOME BACK</div>
    <h1>Enter the workspace.</h1>
    <p>${message}</p>
    <button id="googleCloudLogin" type="button" class="auth-google-btn"><span class="auth-google-mark">G</span><span class="auth-google-label">Continue with Google</span><span class="auth-google-arrow">→</span></button>
    <div id="cloudLoginError" class="auth-error"></div>
    <div class="auth-minimal-security"><span>Authorized accounts only</span><i></i><span>Role-based access</span></div>
    <div class="auth-meta"><span>Danbridge English Co., Ltd.</span><strong>Private Cloud</strong></div>
    </div>
  </section>
</div>`;
 document.getElementById('googleCloudLogin').onclick=async()=>{const btn=document.getElementById('googleCloudLogin');btn.disabled=true;btn.querySelector('.auth-google-label').textContent='Signing in…';try{await signInWithPopup(auth,provider)}catch(e){console.error(e);if(['auth/popup-blocked','auth/cancelled-popup-request','auth/popup-closed-by-user'].includes(e.code)){try{await signInWithRedirect(auth,provider);return}catch(e2){showCloudLoginError(e2.message)}}else showCloudLoginError(e.message);btn.disabled=false;btn.querySelector('.auth-google-label').textContent='Continue with Google'}};
}
function showCloudLoginError(msg){const e=document.getElementById('cloudLoginError');if(e){e.textContent=msg;e.classList.add('show')}}
function setSignedOutIsolation(locked){
 const screen=document.getElementById('authScreen');
 if(locked){
  window.DanbridgeNotifications?.close?.();window.closeCourseDrawer?.();document.body.classList.remove('notification-center-open','course-drawer-open','lesson-paste-mode');
  const scheduleModal=document.getElementById('scheduleNotificationModal');if(scheduleModal)scheduleModal.hidden=true;
  const reportModal=document.getElementById('reportSubmissionNotificationModal');if(reportModal)reportModal.hidden=true;
  currentScheduleNotification=null;
  currentReportNotification=null;
  const sensitiveIds=['notificationList','notificationSummary','notificationFooter','scheduleNotificationBody','reportSubmissionNotificationBody','courseDrawerTitle','courseDrawerSubtitle','courseDrawerBody','cloudBackupList','syncRecoveryErrors','emergencyOwnerList','emergencyOwnerStatus','immutableAuditList'];
  sensitiveIds.forEach(id=>{const el=document.getElementById(id);if(!el)return;if(id==='notificationSummary')el.textContent='登入後顯示通知';else if(id==='notificationFooter')el.textContent='尚未更新';else el.replaceChildren()});
  const badge=document.getElementById('notificationCount');if(badge){badge.textContent='0';badge.hidden=true}
 }
 [...document.body.children].forEach(el=>{
  if(el===screen||['SCRIPT','STYLE','LINK'].includes(el.tagName))return;
  if(locked){el.dataset.authIsolated='1';el.inert=true;el.setAttribute('aria-hidden','true')}
  else if(el.dataset.authIsolated==='1'){el.inert=false;el.removeAttribute('aria-hidden');delete el.dataset.authIsolated}
 });
}
function showCloudApp(){setSignedOutIsolation(false);document.body.classList.remove('auth-locked');document.getElementById('authScreen')?.classList.add('hidden')}
function showCloudLogin(){document.body.classList.add('auth-locked');document.getElementById('authScreen')?.classList.remove('hidden');setAuthCard();setSignedOutIsolation(true)}

async function ensureProfile(user){
 const emailKey=(user.email||'').trim().toLowerCase();
 if(!emailKey)throw new Error('This Google account does not have a usable email address.');

 // Owner 保留 users/{uid} 個人檔案；老師與校區管理者則直接以 companyAccess 為唯一權限來源。
 // 登入流程不再要求一般帳號寫入 users，避免任何 users 規則或舊資料欄位造成登入被拒絕。
 if(emailKey===OWNER_EMAIL){
   const ref=doc(cloud,'users',user.uid);let snap=await getDoc(ref);
   if(!snap.exists()){
     await setDoc(ref,{email:user.email,displayName:user.displayName||'Daniel',role:'owner',companyId:COMPANY_ID,createdAt:serverTimestamp(),active:true});
     snap=await getDoc(ref);
   }
   const p=snap.data();
   if(p.active===false)throw new Error('This account has been deactivated.');
   if(p.companyId!==COMPANY_ID||p.role!=='owner')throw new Error('The owner account profile is not configured correctly.');
   return p;
 }

 const accessSnap=await getDoc(doc(cloud,'companyAccess',emailKey));
 if(!accessSnap.exists())throw new Error('This Google account has not been authorized for Danbridge. Please ask the owner to add it in Security Settings.');
 const a=accessSnap.data()||{};
 if(a.active!==true)throw new Error('This account has been deactivated.');
 if(a.companyId!==COMPANY_ID)throw new Error('This account does not belong to Danbridge.');
 if(!['owner','teacher','branch_manager'].includes(a.role))throw new Error('The role assigned to this account is not valid.');
 if(a.role!=='owner'&&!a.teacherId)throw new Error('No teacher profile is linked to this account. Please ask the owner to update the account settings.');
 if(a.role==='branch_manager'&&(!Array.isArray(a.branchIds)||!a.branchIds.length))throw new Error('No branch has been assigned to this manager account.');
 return {
   email:user.email,
   displayName:a.displayName||user.displayName||'',
   role:a.role,
   companyId:a.companyId,
   active:true,
   teacherId:a.teacherId?String(a.teacherId):'',
   teacherName:a.teacherName||'',
   managerName:a.managerName||'',
   branchIds:Array.isArray(a.branchIds)?a.branchIds:[],
   branchNames:Array.isArray(a.branchNames)?a.branchNames:[],
   readOnly:a.readOnly===true,
   canSubmitOwnReports:a.canSubmitOwnReports!==false,
   canManageSchedule:a.canManageSchedule===true,
   scopedDb:a.scopedDb||null
 };
}
async function recordSuccessfulLogin(user,profile){
 const email=String(user?.email||profile?.email||'').trim().toLowerCase();
 if(!user?.uid||!email)return;
 const payload={email,displayName:user.displayName||profile?.displayName||'',photoURL:user.photoURL||'',role:profile.role,companyId:COMPANY_ID,active:profile.active!==false,lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()};
 if(profile.teacherId)payload.teacherId=String(profile.teacherId);
 if(profile.teacherName)payload.teacherName=profile.teacherName;
 if(profile.managerName)payload.managerName=profile.managerName;
 if(Array.isArray(profile.branchIds))payload.branchIds=profile.branchIds;
 if(Array.isArray(profile.branchNames))payload.branchNames=profile.branchNames;
 if(profile.role==='branch_manager'){payload.readOnly=true;payload.canSubmitOwnReports=profile.canSubmitOwnReports!==false}
 if(profile.role==='teacher'&&profile.canManageSchedule===true)payload.canManageSchedule=true;
 await setDoc(doc(cloud,'users',user.uid),payload,{merge:true});
}
function loginTimeValue(value){
 const date=value?.toDate?.()||new Date(value||0);
 return Number.isNaN(date.getTime())||date.getTime()<=0?'尚未登入':date.toLocaleString('zh-TW');
}
async function lastLoginByEmail(){
 const result=new Map(),qs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID)));
 qs.docs.forEach(d=>{const x=d.data(),email=String(x.email||'').trim().toLowerCase(),time=x.lastLoginAt?.toMillis?.()||new Date(x.lastLoginAt||0).getTime()||0,old=result.get(email);if(email&&(!old||time>old.time))result.set(email,{time,label:loginTimeValue(x.lastLoginAt)})});
 return result;
}
function teacherBadgeName(t){return String(t?.displayName||t?.name||'').trim()}

function resilienceStatus(message='',kind=''){
 const el=document.getElementById('cloudBackupStatus');if(el){el.textContent=message||'尚未檢查';el.dataset.kind=kind}
}
function backupDayKey(date=new Date()){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function backupCounts(db={}){return{students:db.students?.length||0,teachers:db.teachers?.length||0,lessons:db.lessons?.length||0,makeups:db.makeups?.length||0}}
async function listCloudSafetyBackups(){
 const list=document.getElementById('cloudBackupList');if(!list||cloudRole!=='owner')return;
 try{
  const qs=await getDocs(collection(cloud,'companies',COMPANY_ID,'dailyBackups'));
  const rows=qs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.id).localeCompare(String(a.id))).slice(0,CLOUD_BACKUP_RETENTION_DAYS);
  list.innerHTML=rows.length?rows.map(x=>{const verified=!!x.snapshot&&dataHash(x.snapshot)===x.hash;return`<div class="backup-item"><div class="info"><b>${escapeHTML(x.id)}</b><div class="small">學生 ${x.counts?.students||0}｜老師 ${x.counts?.teachers||0}｜課程 ${x.counts?.lessons||0}<br>${escapeHTML(formatNotificationTimestamp(x.createdAt)||'時間確認中')}</div></div><div class="row-actions"><span class="pill ${verified?'green':'red'}">${verified?'雜湊一致':'驗證失敗'}</span>${verified?`<button type="button" class="btn cloud-backup-restore" data-day="${escapeHTML(x.id)}">還原</button>`:''}</div></div>`}).join(''):'<span class="small">尚未建立雲端安全快照。</span>';
  list.querySelectorAll('.cloud-backup-restore').forEach(button=>button.onclick=()=>restoreCloudSafetyBackup(button.dataset.day));
  const today=rows.find(x=>x.id===backupDayKey());resilienceStatus(today?'今日雲端快照已完成':'今日尚未建立雲端快照',today?'ok':'pending');
 }catch(e){console.error('listCloudSafetyBackups failed',e);resilienceStatus('雲端快照清單讀取失敗','error');list.innerHTML='<span class="small">讀取失敗，請稍後重試。</span>'}
}
async function restoreCloudSafetyBackup(day){
 if(cloudRole!=='owner'||!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return;
 try{const snap=await getDoc(doc(cloud,'companies',COMPANY_ID,'dailyBackups',day));if(!snap.exists())return alert('找不到這份雲端快照。');const backup=snap.data(),restored=backup.snapshot;if(!restored||dataHash(restored)!==backup.hash)return alert('快照雜湊驗證失敗，已阻止還原。');if(!confirm(`確定還原 ${day} 的雲端快照？\n學生 ${backup.counts?.students||0}、老師 ${backup.counts?.teachers||0}、課程 ${backup.counts?.lessons||0}\n\n目前資料會先建立本機版本，再由還原內容取代。`))return;const beforeHash=dataHash(window.__danbridgeGetDB?.());window.snapshot?.();window.createVersion?.(`還原 ${day} 雲端快照前`);applyingCloud=true;window.__danbridgeSetDB(deepCopy(restored));persistCurrentLocalView();window.renderAll?.();applyingCloud=false;await writeImmutableAudit({action:'backup-restored',category:'backup',targetType:'daily-backup',targetId:day,changedFields:['snapshot'],totalChanges:1,beforeHash,afterHash:dataHash(restored)});window.saveDB?.();cloudStatus(`已還原 ${day} 雲端快照，正在同步…`,'pending')}catch(e){console.error('restoreCloudSafetyBackup failed',e);alert('還原失敗：'+(e?.message||e))}
}
async function cleanupOldCloudBackups(){
 if(cloudRole!=='owner')return;
 const qs=await getDocs(collection(cloud,'companies',COMPANY_ID,'dailyBackups')),cutoff=new Date();cutoff.setDate(cutoff.getDate()-CLOUD_BACKUP_RETENTION_DAYS);
 await Promise.allSettled(qs.docs.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.id)&&new Date(`${d.id}T00:00:00`)<cutoff).map(d=>deleteDoc(d.ref)));
}
async function createCloudSafetyBackup(force=false){
 if(cloudRole!=='owner')return false;
 const current=deepCopy(window.__danbridgeGetDB?.()),score=window.__danbridgeDataScore?.(current)||0;if(!score){resilienceStatus('資料為空，已阻止建立快照','error');return false}
 const day=backupDayKey(),ref=doc(cloud,'companies',COMPANY_ID,'dailyBackups',day);
 try{
  if(!force&&(await getDoc(ref)).exists()){await listCloudSafetyBackups();return true}
  resilienceStatus('正在建立今日雲端快照…','pending');
  await setDoc(ref,{companyId:COMPANY_ID,day,snapshot:current,hash:dataHash(current),counts:backupCounts(current),schema:'danbridge-db-v1',environment:DANBRIDGE_ENVIRONMENT,createdAt:serverTimestamp(),createdBy:cloudUid,createdByEmail:cloudEmailKey},{merge:false});
  await cleanupOldCloudBackups();await listCloudSafetyBackups();cloudStatus('今日雲端安全快照已完成','ok');return true;
 }catch(e){console.error('createCloudSafetyBackup failed',e);resilienceStatus('建立雲端快照失敗，系統會在下次連線重試','error');reportOperationalError(e,{category:'cloud-write',area:'owner-upload',retryable:true});return false}
}
function scheduleDailyCloudBackup(){clearTimeout(dailyBackupTimer);dailyBackupTimer=setTimeout(()=>createCloudSafetyBackup(false),1200)}
async function renderSyncRecoveryCenter(){
 if(cloudRole!=='owner')return;
 const summary=document.getElementById('syncRecoverySummary'),errors=document.getElementById('syncRecoveryErrors');if(!summary||!errors)return;
 const pending=[localDirtyHash&&'本機資料待上傳',ownerUploadInFlight&&'主資料同步中',ownerUploadQueued&&'主資料等待重試',roleViewPublishQueued&&'角色檢視等待重試',scheduleNotificationDeliveryJobs.size&&`${scheduleNotificationDeliveryJobs.size} 批課表通知待送`].filter(Boolean);
 summary.textContent=`網路：${navigator.onLine?'正常':'離線'}｜${pending.length?pending.join('｜'):'目前沒有待處理項目'}`;summary.dataset.kind=pending.length?'pending':'ok';
 try{const qs=await getDocs(collection(cloud,'companies',COMPANY_ID,'errorEvents')),rows=qs.docs.map(d=>d.data()).sort((a,b)=>(b.occurredAt?.toMillis?.()||0)-(a.occurredAt?.toMillis?.()||0)).slice(0,12);errors.innerHTML=rows.length?rows.map(x=>`<div class="backup-item"><div class="info"><b>${escapeHTML(x.area||'同步')}｜${escapeHTML(x.code||'unknown')}</b><div class="small">${escapeHTML(formatNotificationTimestamp(x.occurredAt)||'時間確認中')}｜${x.retryable?'可自動重試':'需人工檢查'}</div></div><span class="pill ${x.retryable?'blue':'red'}">${x.retryable?'已記錄':'注意'}</span></div>`).join(''):'<span class="small">目前沒有同步錯誤紀錄。</span>'}catch(e){errors.innerHTML='<span class="small">錯誤紀錄暫時無法讀取。</span>'}
}
async function retryAllOperationalSync(){
 if(cloudRole!=='owner')return;
 ownerUploadQueued=true;roleViewPublishQueued=true;cloudStatus('正在重試所有待處理同步…','pending');
 await uploadOwnerState(true);publishRoleViewsWithRetry();scheduleDailyCloudBackup();setTimeout(renderSyncRecoveryCenter,500);
}
function emergencyOwnerStatus(message='',kind=''){const el=document.getElementById('emergencyOwnerStatus');if(el){el.textContent=message;el.dataset.kind=kind;el.style.display=message?'block':'none'}}
async function listEmergencyOwners(){
 const box=document.getElementById('emergencyOwnerList');if(!box||cloudRole!=='owner')return;
 try{
  const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID),where('role','==','owner')));
  const primary=cloudEmailKey===OWNER_EMAIL,rows=qs.docs.map(d=>({id:d.id,...d.data()}));box.innerHTML=rows.length?rows.map(x=>{const email=String(x.email||x.id).toLowerCase(),active=x.active!==false,isPrimary=email===OWNER_EMAIL;return`<div class="backup-item"><div class="info"><b>${escapeHTML(isPrimary?'主要 Owner':(x.displayName||'備援 Owner'))}</b><div class="small">${escapeHTML(email)}</div></div><div class="row-actions"><span class="pill ${active?'green':'red'}">${active?'已啟用':'已停權'}</span>${isPrimary||!primary?'<span class="pill blue">受保護</span>':`<button type="button" class="btn emergency-owner-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger emergency-owner-delete" data-email="${escapeHTML(email)}">刪除</button>`}</div></div>`}).join(''):'<span class="small">尚未建立備援 Owner。</span>';
  box.querySelectorAll('.emergency-owner-toggle').forEach(button=>button.onclick=async()=>{await setCloudAccessActive(button.dataset.email,button.dataset.active!=='true');await listEmergencyOwners()});
  box.querySelectorAll('.emergency-owner-delete').forEach(button=>button.onclick=async()=>{await deleteEmergencyOwner(button.dataset.email);await listEmergencyOwners()});
 }catch(e){console.error('listEmergencyOwners failed',e);emergencyOwnerStatus('備援 Owner 清單讀取失敗，請稍後重試。','error');box.innerHTML='<span class="small">讀取失敗，請稍後重試。</span>'}
}
async function deleteEmergencyOwner(email){
 if(cloudEmailKey!==OWNER_EMAIL)return emergencyOwnerStatus('只有主要 Owner 可以刪除其他 Owner。','error');
 email=String(email||'').trim().toLowerCase();if(!email||email===OWNER_EMAIL)return;
 if(!confirm(`確定永久刪除 ${email} 的 Owner 登入權限？\n此帳號會立即失去所有 Danbridge 存取權。`))return;
 try{
  const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
  await deleteOwnerAccessWithAudit(email,userQs.docs.map(userDoc=>userDoc.ref),{action:'backup-owner-deleted',category:'access',targetType:'account',targetId:email,changedFields:['active','role'],totalChanges:1});
  invalidateCompanyAccessCache();emergencyOwnerStatus('備援 Owner 權限已刪除。','ok');await listImmutableAudit();
 }catch(e){console.error(e);emergencyOwnerStatus('刪除備援 Owner 失敗：'+(e?.message||e),'error')}
}
async function saveEmergencyOwner(){
 if(cloudRole!=='owner')return;
 if(cloudEmailKey!==OWNER_EMAIL)return emergencyOwnerStatus('只有主要 Owner 可以新增或更新其他 Owner。','error');
 const email=String(document.getElementById('emergencyOwnerEmail')?.value||'').trim().toLowerCase(),displayName=String(document.getElementById('emergencyOwnerName')?.value||'備援 Owner').trim()||'備援 Owner';
 if(!validGmailAddress(email))return emergencyOwnerStatus('請輸入有效的 Gmail。','error');
 if(email===OWNER_EMAIL||email===cloudEmailKey)return emergencyOwnerStatus('主要 Owner 或目前登入帳號不需要重複加入。','error');
 if(!confirm(`確定授予 ${email} 完整 Owner 權限？此帳號可查看及修改所有課表、學生、財務與帳號設定。`))return;
 try{const existing=await getDoc(doc(cloud,'companyAccess',email));if(existing.exists()&&existing.data()?.role!=='owner'&&!confirmCloudRoleTransition(existing,'owner',email))return;const payload={email,displayName,role:'owner',companyId:COMPANY_ID,active:true,invitedAt:existing.exists()?existing.data()?.invitedAt||serverTimestamp():serverTimestamp(),invitedBy:cloudEmailKey,updatedAt:serverTimestamp()};await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'backup-owner-updated':'backup-owner-created',category:'access',targetType:'account',targetId:email,changedFields:['role','active'],totalChanges:1},false);await Promise.allSettled([deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)),deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email))]);invalidateCompanyAccessCache();emergencyOwnerStatus('備援 Owner 已建立；首次 Google 登入後即可使用。','ok');await Promise.all([listEmergencyOwners(),listImmutableAudit()])}catch(e){console.error(e);emergencyOwnerStatus('建立備援 Owner 失敗：'+(e?.message||e),'error')}
}
function installOperationalResilienceUI(){
 if(cloudRole!=='owner')return;
 const bind=(id,handler)=>{const button=document.getElementById(id);if(button)button.onclick=handler};
 bind('createCloudBackupNow',()=>createCloudSafetyBackup(true));bind('refreshCloudBackups',listCloudSafetyBackups);bind('retryAllSync',retryAllOperationalSync);bind('refreshSyncRecovery',renderSyncRecoveryCenter);bind('saveEmergencyOwner',saveEmergencyOwner);bind('refreshImmutableAudit',listImmutableAudit);
 listCloudSafetyBackups();renderSyncRecoveryCenter();listEmergencyOwners();listImmutableAudit();
}

function lessonTeacherIds(lesson){
 const ids=Array.isArray(lesson?.teacherIds)&&lesson.teacherIds.length?lesson.teacherIds:[lesson?.teacherId];
 return [...new Set(ids.filter(Boolean).map(String))];
}

function filteredTeacherDB(source,teacherId){
 teacherId=String(teacherId||'');
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&lessonTeacherIds(l).includes(teacherId));
 const safeLessons=lessons.map(stripPrematureLessonReport).map(l=>{const {paymentStatus,chargeStudent,payTeacher,draftOriginal,...safe}=l;return safe});
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const lessonIds=new Set(lessons.map(l=>String(l.id)));
 const students=(source.students||[]).filter(s=>studentIds.has(s.id)).map(s=>({id:s.id,name:s.name||'',courseType:s.courseType||'',preferredTeacherId:String(s.preferredTeacherId||'')===String(teacherId)?String(teacherId):''}));
 const teachers=(source.teachers||[]).filter(t=>String(t.id)===String(teacherId)).map(t=>({id:t.id,name:t.name||'',displayName:t.displayName||'',color:t.color||'',type:t.type||'',subjects:t.subjects||''}));
 return {...emptyDB(),students,teachers,lessons:safeLessons,makeups:(source.makeups||[]).filter(m=>String(m.teacherId)===String(teacherId)||lessonIds.has(String(m.sourceLessonId||m.lessonId||''))||lessonIds.has(String(m.scheduledLessonId||''))).map(m=>{const {amount,rate,paymentStatus,...safe}=m;return safe}),changes:[],teacherGroups:[],winterTeacherGroups:[],summerCampClasses:[],summerCampRegistrations:[],winterCampRegistrations:[],winterCampClasses:[],settlementRecords:[],fixedExpenses:[],oneTimeExpenses:[],collectionRecords:[]};
}

function schedulerSafeLesson(lesson={}){
 const allowed=['id','date','start','end','studentId','teacherId','teacherIds','title','campId','room','location','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','note','seriesId','lessonState','isDraft'];
 return Object.fromEntries(allowed.filter(key=>lesson[key]!==undefined).map(key=>[key,JSON.parse(JSON.stringify(lesson[key]))]));
}
function schedulerSafeStudent(student={}){
 const allowed=['id','name','status','school','grade','level','preferredTeacherId','parent','contact','parentLine','parentEmail','homeAddress','courseType','branchIds'];
 return Object.fromEntries(allowed.filter(key=>student[key]!==undefined).map(key=>[key,JSON.parse(JSON.stringify(student[key]))]));
}
function filteredSchedulerDB(source){
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft).map(schedulerSafeLesson);
 const branches=(source.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).map(b=>({id:b.id,name:b.name||'',rooms:Array.isArray(b.rooms)?b.rooms.map(String):[]}));
 return {...emptyDB(),branches,students:(source.students||[]).filter(s=>!s.archivedAt).map(schedulerSafeStudent),teachers:(source.teachers||[]).filter(t=>!t.archivedAt).map(t=>({id:t.id,name:t.name||'',displayName:t.displayName||'',color:t.color||'',subjects:t.subjects||''})),lessons};
}

function lessonBranchId(l){return l?.branchId||window.DanbridgeAccess?.branchIdFromLocation?.(l?.location||'')||'art_museum'}
function filteredBranchDB(source,branchIds){
 const allowed=new Set(Array.isArray(branchIds)?branchIds:[]);
 const lessons=(source.lessons||[]).filter(l=>!l.isDraft&&allowed.has(lessonBranchId(l))).map(stripPrematureLessonReport);
 const studentIds=new Set(lessons.map(l=>l.studentId));
 const teacherIds=new Set(lessons.flatMap(lessonTeacherIds));
 const branches=(source.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[]).filter(b=>allowed.has(b.id));
 const lessonById=new Map((source.lessons||[]).map(l=>[String(l.id),l]));
 const students=(source.students||[]).filter(st=>studentIds.has(st.id)||(st.branchIds||[]).some(id=>allowed.has(id)));
 const visibleStudentIds=new Set(students.map(st=>String(st.id)));
 return {...emptyDB(),branches,students,teachers:(source.teachers||[]).filter(t=>teacherIds.has(t.id)||(t.assignedBranchIds||[]).some(id=>allowed.has(id))),lessons,makeups:(source.makeups||[]).filter(m=>{const sourceLesson=lessonById.get(String(m.sourceLessonId||m.lessonId||''));return allowed.has(m.branchId||lessonBranchId(sourceLesson||m))}),changes:(source.changes||[]).filter(c=>{const lesson=lessonById.get(String(c.lessonId))||c.after||c.before;return lesson&&allowed.has(lessonBranchId(lesson))}),teacherGroups:[],winterTeacherGroups:[],summerCampClasses:(source.summerCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),summerCampRegistrations:(source.summerCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampRegistrations:(source.winterCampRegistrations||[]).filter(r=>allowed.has(r.branchId)),winterCampClasses:(source.winterCampClasses||[]).filter(c=>allowed.has(c.branchId||lessonBranchId(c))),settlementRecords:(source.settlementRecords||[]).filter(r=>allowed.has(r.branchId)),fixedExpenses:(source.fixedExpenses||[]).filter(e=>allowed.has(e.branchId)),oneTimeExpenses:(source.oneTimeExpenses||[]).filter(e=>allowed.has(e.branchId)),collectionRecords:(source.collectionRecords||[]).filter(r=>allowed.has(r.branchId)).map(r=>({...r,studentIds:(r.studentIds||[]).filter(id=>visibleStudentIds.has(String(id)))}))};
}

async function renderCloudUserManager(){
 if(cloudRole!=='owner')return;
 const sec=document.getElementById('security');if(!sec)return;
 let card=document.getElementById('cloudUserManager');
 if(!card){card=document.createElement('div');card.id='cloudUserManager';card.className='card col-4';sec.querySelector('.grid')?.appendChild(card)}
 card.innerHTML=`<h2>老師帳號</h2><div class="small">一般老師只能查看自己的課表。只有指定的排課專員帳號可額外管理所有老師課表，且仍看不到費用、家長、薪資與公司資料。</div><label>老師</label><select id="cloudTeacherSelect"></select><label>老師 Gmail</label><input id="cloudTeacherEmail" type="email" placeholder="teacher@gmail.com"><label class="scheduler-access-choice"><input id="cloudTeacherScheduleAccess" type="checkbox"> <span>角色顯示排課專員，額外開放全老師排課</span></label><br><button class="btn primary" id="saveCloudTeacherAccess">建立／更新老師邀請</button><div id="cloudTeacherAccessList" class="backup-list" style="margin-top:12px"></div>`;
 const sel=document.getElementById('cloudTeacherSelect');sel.innerHTML='<option value="">請選擇老師</option>'+window.__danbridgeGetDB().teachers.filter(t=>!t.archivedAt).map(t=>`<option value="${t.id}">${teacherBadgeName(t)||t.name}</option>`).join('');
 document.getElementById('saveCloudTeacherAccess').onclick=async()=>{
   const button=document.getElementById('saveCloudTeacherAccess'),teacherId=sel.value,email=document.getElementById('cloudTeacherEmail').value.trim().toLowerCase(),canManageSchedule=SCHEDULER_ACCOUNT_EMAILS.has(email);
   if(!teacherId||!validGmailAddress(email))return alert('請選老師並輸入有效的 Gmail');
   button.disabled=true;button.textContent='正在儲存…';
   try{
    const t=window.__danbridgeGetDB().teachers.find(x=>x.id===teacherId),existing=await getDoc(doc(cloud,'companyAccess',email));
    if(!confirmCloudRoleTransition(existing,'teacher',email))return;
    if(canManageSchedule&&!confirm(`確定讓 ${email} 以排課專員角色管理所有老師課表？此帳號仍無法查看費用、家長、薪資與公司資料。`))return;
    const payload={email,role:'teacher',companyId:COMPANY_ID,teacherId,teacherName:teacherBadgeName(t),active:true,canManageSchedule:canManageSchedule?true:deleteField(),branchIds:deleteField(),branchNames:deleteField(),managerName:deleteField(),readOnly:canManageSchedule?false:deleteField(),canSubmitOwnReports:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()};
    if(!existing.exists()){payload.invitedAt=serverTimestamp();payload.invitedBy=cloudEmailKey||OWNER_EMAIL}
    invalidateCompanyAccessCache();
    await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'teacher-access-updated':'teacher-access-created',category:'access',targetType:'account',targetId:email,changedFields:['role','teacherId','active','canManageSchedule'],totalChanges:1},true);
    const schedulerViewRef=doc(cloud,'companies',COMPANY_ID,'schedulerViews',email);
    if(canManageSchedule){const db=filteredSchedulerDB(window.__danbridgeGetDB());await setDoc(schedulerViewRef,{db,clientHash:dataHash(db),updatedAt:serverTimestamp(),email},{merge:false})}
    else {await deleteDoc(schedulerViewRef).catch(()=>{});await setDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email),{db:filteredTeacherDB(window.__danbridgeGetDB(),teacherId),updatedAt:serverTimestamp(),teacherId,email},{merge:false})}
    try{const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));await Promise.all(userQs.docs.map(u=>setDoc(u.ref,payload,{merge:true})))}catch(e){console.warn('同步老師帳號資料失敗：',e)}
    if(canManageSchedule)await deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)).catch(()=>{});
    await deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email)).catch(()=>{});
    alert(existing.exists()?'老師邀請與專屬課表已更新。':'老師邀請已建立。請複製登入邀請給老師。');
    document.getElementById('cloudTeacherEmail').value='';await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess()]);
   }catch(e){console.error('save teacher access failed',e);alert('儲存老師權限失敗：'+(e?.message||e))}
   finally{button.disabled=false;button.textContent='建立／更新老師邀請'}
 };
 await listCloudTeacherAccess();
}
function cloudInvitationState(active,hasLogin){
 if(!active)return {label:'停權',className:'red'};
 return hasLogin?{label:'已加入',className:'green'}:{label:'待首次登入',className:'blue'};
}
async function copyCloudLoginInvitation(email){
 if(cloudRole!=='owner')return;
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return;
 const message=`Danbridge 已開放 ${normalized} 登入。請使用這個 Google 帳號前往 ${location.origin} 登入。`;
 try{await navigator.clipboard.writeText(message);cloudStatus('登入邀請已複製','ok')}
 catch(e){console.error('copy invitation failed',e);alert(message)}
}
function confirmCloudRoleTransition(existing,targetRole,email){
 if(!existing?.exists?.())return true;
 const currentRole=String(existing.data()?.role||'');
 if(!currentRole||currentRole===targetRole)return true;
 const labels={owner:'Owner',teacher:'老師',branch_manager:'校區管理者'};
 return confirm(`這個 Gmail 目前是「${labels[currentRole]||currentRole}」。\n確定要變更為「${labels[targetRole]||targetRole}」嗎？\n\n變更後舊角色的資料範圍會立即移除，該帳號若正在使用會被登出。`);
}
async function removeCloudTeacherAccess(email,teacherName='老師'){
 if(cloudRole!=='owner')return;
 email=String(email||'').trim().toLowerCase();
 if(!email)return;
 if(!confirm(`確定要刪除 ${teacherName}（${email}）的登入權限嗎？\n刪除後該帳號將無法再登入。`))return;
 try{
   cloudStatus('正在刪除老師權限…','pending');
   // 先停用已建立的 users 登入資料，避免只刪 companyAccess 後仍可登入。
   const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
   await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:false,updatedAt:serverTimestamp()},{merge:true})));
   invalidateCompanyAccessCache();
   await Promise.all([
     deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)),
     deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email))
   ]);
   await deleteCompanyAccessWithAudit(email,{action:'teacher-access-deleted',category:'access',targetType:'account',targetId:email,changedFields:['active','role'],totalChanges:1});
   await listCloudTeacherAccess();
   cloudStatus('老師權限已刪除','ok');
 }catch(e){
   console.error(e);
   cloudStatus('刪除權限失敗','error');
   alert('刪除失敗：'+(e?.message||e));
 }
}
async function setCloudAccessActive(email,active){
 if(cloudRole!=='owner')return;
 email=String(email||'').trim().toLowerCase();if(!email)return;
 if(email===OWNER_EMAIL)return alert('主要 Owner 帳號受保護，不能停權。');
 const action=active?'重新啟用':'停權';
 if(!confirm(`確定要${action} ${email}？\n${active?'原本的角色與資料範圍會恢復。':'帳號會立即失去存取權，但綁定與歷史紀錄會保留。'}`))return;
 try{
  cloudStatus(`正在${action}帳號…`,'pending');invalidateCompanyAccessCache();
  await setCompanyAccessWithAudit(email,{active,updatedAt:serverTimestamp()},{action:active?'account-enabled':'account-disabled',category:'access',targetType:'account',targetId:email,changedFields:['active'],totalChanges:1},true);
  const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
  await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active,updatedAt:serverTimestamp()},{merge:true})));
  await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess(),listEmergencyOwners()]);
  if(active)publishRoleViewsWithRetry();
  cloudStatus(`帳號已${action}`,'ok');
 }catch(e){console.error(e);cloudStatus(`${action}帳號失敗`,'error');alert(`${action}失敗：`+(e?.message||e))}
}
async function disableTeacherAccessForArchive(teacherId){
 if(cloudRole!=='owner')throw new Error('只有 Owner 可以封存老師。');
 const normalized=String(teacherId||'');if(!normalized)throw new Error('找不到老師 ID。');
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 const matches=qs.docs.filter(d=>{const x=d.data()||{};return String(x.teacherId||'')===normalized&&x.active!==false});
 for(const accessDoc of matches){
  const x=accessDoc.data()||{},email=String(x.email||accessDoc.id).trim().toLowerCase();
  invalidateCompanyAccessCache();
  await setCompanyAccessWithAudit(email,{active:false,updatedAt:serverTimestamp()},{action:'teacher-archived-account-disabled',category:'access',targetType:'account',targetId:email,changedFields:['active','teacherId'],totalChanges:1},true);
  const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
  await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:false,updatedAt:serverTimestamp()},{merge:true})));
 }
 await Promise.all([listCloudTeacherAccess(),listCloudBranchManagerAccess()]);
 return matches.length;
}
window.__danbridgeDisableTeacherAccessForArchive=disableTeacherAccessForArchive;
async function listCloudTeacherAccess(){
 const box=document.getElementById('cloudTeacherAccessList');if(!box||cloudRole!=='owner')return;
 const [qs,logins]=await Promise.all([getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID))),lastLoginByEmail()]);
 box.innerHTML=qs.docs.filter(d=>d.data()?.role==='teacher').map(d=>{const x=d.data();const email=String(x.email||d.id).toLowerCase(),login=logins.get(email),last=login?.label||'尚未登入',active=x.active!==false,state=cloudInvitationState(active,!!login);return `<div class="backup-item ${x.canManageSchedule===true?'scheduler-access-item':''}"><div class="info"><b>${escapeHTML(x.canManageSchedule===true?'排課專員':(x.teacherName||'老師'))}</b><div class="small">${escapeHTML(email)}<br>${x.canManageSchedule===true?'一般老師＋全老師排課<br>':''}最後登入：${escapeHTML(last)}</div></div><div class="row-actions"><span class="pill ${state.className}">${state.label}</span><button type="button" class="btn cloud-invitation-copy" data-email="${escapeHTML(email)}">複製登入邀請</button><button type="button" class="btn cloud-access-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger cloud-access-delete" data-email="${escapeHTML(email)}" data-name="${escapeHTML(x.teacherName||'老師')}">刪除權限</button></div></div>`}).join('')||'<span class="small">尚未建立老師 Gmail 邀請。</span>';
 box.querySelectorAll('.cloud-invitation-copy').forEach(btn=>btn.onclick=()=>copyCloudLoginInvitation(btn.dataset.email));
 box.querySelectorAll('.cloud-access-toggle').forEach(btn=>btn.onclick=()=>setCloudAccessActive(btn.dataset.email,btn.dataset.active!=='true'));
 box.querySelectorAll('.cloud-access-delete').forEach(btn=>btn.onclick=()=>removeCloudTeacherAccess(btn.dataset.email,btn.dataset.name));
}


function branchManagerFormStatus(message='',kind=''){
 const el=document.getElementById('cloudBranchManagerStatus');
 if(!el)return;
 el.textContent=message;
 el.dataset.kind=kind;
 el.style.display=message?'block':'none';
 el.style.color=kind==='error'?'#b91c1c':kind==='ok'?'#15803d':'#475569';
}
function validGmailAddress(email){
 return /^[^\s@]+@gmail\.com$/i.test(String(email||'').trim());
}
async function saveCloudBranchManagerAccess(){
 if(cloudRole!=='owner')return alert('只有 Owner 可以設定校區管理者權限。');
 const emailInput=document.getElementById('cloudBranchManagerEmail');
 const saveButton=document.getElementById('saveCloudBranchManager');
 const email=String(emailInput?.value||'').trim().toLowerCase();
 const branchIds=[...document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]:checked')].map(x=>x.value);
 const teacherId=String(document.getElementById('cloudBranchManagerTeacher')?.value||'').trim();
 if(!validGmailAddress(email)){
   branchManagerFormStatus('請輸入有效的 Gmail，例如 manager@gmail.com。','error');
   emailInput?.focus();
   return;
 }
 if(!teacherId){
   branchManagerFormStatus('請選擇校區管理者本人對應的老師身分。','error');
   return;
 }
 if(!branchIds.length){
   branchManagerFormStatus('請至少選擇一個校區。','error');
   return;
 }
 if(saveButton?.dataset.saving==='1')return;
 try{
   if(saveButton){saveButton.dataset.saving='1';saveButton.disabled=true;saveButton.textContent='儲存中…'}
   branchManagerFormStatus('正在建立校區管理者權限…','pending');
   cloudStatus('正在儲存校區管理者權限…','pending');
   const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
   const branchNames=branches.filter(b=>branchIds.includes(b.id)).map(b=>b.name);
   const existing=await getDoc(doc(cloud,'companyAccess',email));
   if(!confirmCloudRoleTransition(existing,'branch_manager',email)){
     branchManagerFormStatus('已取消角色變更。','');
     cloudStatus('已取消角色變更','ok');
     return;
   }
   const managerTeacher=(window.__danbridgeGetDB()?.teachers||[]).find(t=>t.id===teacherId);
   if(!managerTeacher)throw new Error('找不到所選老師，請重新選擇。');
   const scopedDb=filteredBranchDB(window.__danbridgeGetDB(),branchIds);
   // 將管理者可讀取的校區快照直接存進自己的 companyAccess 文件。
   // 這條路徑已被現有登入規則允許，避免新 branchViews 路徑因規則尚未部署而失敗。
   const payload={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true,scopedDb,scopedUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()};
   if(!existing.exists()){payload.invitedAt=serverTimestamp();payload.invitedBy=cloudEmailKey||OWNER_EMAIL}
   invalidateCompanyAccessCache();
   await setCompanyAccessWithAudit(email,payload,{action:existing.exists()?'branch-access-updated':'branch-access-created',category:'access',targetType:'account',targetId:email,changedFields:['role','teacherId','branchIds','active'],totalChanges:1},true);
   try{
     const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
     await Promise.all(userQs.docs.map(u=>setDoc(u.ref,payload,{merge:true})));
   }catch(e){console.warn('同步既有使用者資料失敗：',e)}
   await deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email)).catch(()=>{});
   // 不再把儲存成功綁在 branchViews / teacherViews 上。
   // 舊 Firebase 規則若不允許這些路徑，主權限仍已完整儲存在 companyAccess。
   // 先更新本機畫面，不等待下一次 Firestore 查詢或快取刷新。
   const optimistic={email,role:'branch_manager',companyId:COMPANY_ID,branchIds,branchNames,teacherId,teacherName:teacherBadgeName(managerTeacher),managerName:teacherBadgeName(managerTeacher),active:true,readOnly:true,canSubmitOwnReports:true};
   renderCloudBranchManagerList([...branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==email),optimistic]);
   if(emailInput)emailInput.value='';
   const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');if(managerTeacherSelect)managerTeacherSelect.value='';
   document.querySelectorAll('#cloudBranchChoices input[type="checkbox"]').forEach(x=>x.checked=false);
   await Promise.all([listCloudBranchManagerAccess(),listCloudTeacherAccess()]);
   branchManagerFormStatus(existing.exists()?'校區管理者邀請已更新。':'校區管理者邀請已建立，可複製登入邀請。','ok');
   cloudStatus(existing.exists()?'校區管理者邀請已更新':'校區管理者邀請已建立','ok');
 }catch(e){
   console.error('saveCloudBranchManagerAccess failed:',e);
   branchManagerFormStatus('儲存失敗：'+(e?.message||e),'error');
   cloudStatus('儲存校區管理者權限失敗','error');
 }finally{
   if(saveButton){saveButton.dataset.saving='0';saveButton.disabled=false;saveButton.textContent='建立／更新管理者邀請'}
 }
}
function installBranchManagerAccessEvents(){
 if(document.documentElement.dataset.branchManagerEventsInstalled==='1')return;
 document.documentElement.dataset.branchManagerEventsInstalled='1';
 document.addEventListener('click',event=>{
   const button=event.target.closest?.('#saveCloudBranchManager');
   if(!button)return;
   event.preventDefault();
   event.stopPropagation();
   saveCloudBranchManagerAccess();
 });
}
async function renderBranchManagerAccess(){
 if(cloudRole!=='owner')return;
 const card=document.getElementById('cloudBranchManager');
 if(!card)return;
 const branches=window.__danbridgeGetDB()?.branches||window.DanbridgeAccess?.DEFAULT_BRANCHES||[];
 const choices=document.getElementById('cloudBranchChoices');
 if(choices){
   choices.innerHTML=branches.map(b=>`<label><input type="checkbox" value="${b.id}"> <span>${b.name}</span></label>`).join('');
 }
 const managerTeacherSelect=document.getElementById('cloudBranchManagerTeacher');
 if(managerTeacherSelect){
   const current=managerTeacherSelect.value;
   managerTeacherSelect.innerHTML='<option value="">請選擇管理者本人</option>'+((window.__danbridgeGetDB()?.teachers||[]).filter(t=>!t.archivedAt).map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name||'未命名老師')}</option>`).join(''));
   if(current)managerTeacherSelect.value=current;
 }
 const button=document.getElementById('saveCloudBranchManager');
 if(button){button.type='button';button.disabled=false;button.dataset.saving='0'}
 branchManagerFormStatus('','');
 await listCloudBranchManagerAccess();
}
let branchManagerAccessCache=[];
function escapeHTML(value=''){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function renderCloudBranchManagerList(records=branchManagerAccessCache,logins=new Map()){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 branchManagerAccessCache=Array.isArray(records)?records:[];
 box.innerHTML=branchManagerAccessCache.map(x=>{const email=String(x.email||x.id||'').toLowerCase(),login=logins.get(email),last=login?.label||'尚未登入',active=x.active!==false,state=cloudInvitationState(active,!!login);return `<div class="backup-item branch-access-item"><div class="info"><b>${escapeHTML((x.branchNames||x.branchIds||[]).join('、')||'未指定校區')}</b><div class="small" title="${escapeHTML(email)}">${escapeHTML(email)}｜${escapeHTML(x.teacherName||x.managerName||'未綁定老師')}｜可回報本人課程<br>最後登入：${escapeHTML(last)}</div></div><div class="row-actions"><span class="pill ${state.className}">${state.label}</span><button type="button" class="btn cloud-invitation-copy" data-email="${escapeHTML(email)}">複製登入邀請</button><button type="button" class="btn branch-access-toggle" data-email="${escapeHTML(email)}" data-active="${active?'true':'false'}">${active?'停權':'重新啟用'}</button><button type="button" class="btn danger branch-access-delete" data-email="${escapeHTML(email)}">刪除權限</button></div></div>`}).join('')||'<span class="small">尚未建立校區管理者邀請。</span>';
 box.querySelectorAll('.cloud-invitation-copy').forEach(btn=>btn.onclick=()=>copyCloudLoginInvitation(btn.dataset.email));
 box.querySelectorAll('.branch-access-toggle').forEach(btn=>btn.onclick=()=>setCloudAccessActive(btn.dataset.email,btn.dataset.active!=='true'));
 box.querySelectorAll('.branch-access-delete').forEach(btn=>btn.onclick=()=>removeCloudBranchManagerAccess(btn.dataset.email));
}
async function listCloudBranchManagerAccess(){
 const box=document.getElementById('cloudBranchManagerList');if(!box||cloudRole!=='owner')return;
 try{
   const [qs,logins]=await Promise.all([getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID),where('role','==','branch_manager'))),lastLoginByEmail()]);
   renderCloudBranchManagerList(qs.docs.map(d=>({id:d.id,...d.data()})),logins);
 }catch(e){
   console.error('listCloudBranchManagerAccess failed:',e);
   if(!branchManagerAccessCache.length)box.innerHTML='<span class="small" style="color:#b91c1c">管理者清單讀取失敗，請重新整理後再試。</span>';
 }
}
async function removeCloudBranchManagerAccess(email){
 if(cloudRole!=='owner')return;
 if(!confirm(`確定刪除 ${email} 的校區管理權限？`))return;
 const userQs=await getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email)));
 await Promise.all(userQs.docs.map(u=>setDoc(u.ref,{active:false,updatedAt:serverTimestamp()},{merge:true})));
 invalidateCompanyAccessCache();
 await deleteCompanyAccessWithAudit(email,{action:'branch-access-deleted',category:'access',targetType:'account',targetId:String(email).toLowerCase(),changedFields:['active','role','branchIds'],totalChanges:1});
 // 舊檢視只做清理，不讓未部署的 Firestore 規則阻斷刪除流程。
 await Promise.allSettled([
   deleteDoc(doc(cloud,'companies',COMPANY_ID,'branchViews',email)),
   deleteDoc(doc(cloud,'companies',COMPANY_ID,'teacherViews',email))
 ]);
 renderCloudBranchManagerList(branchManagerAccessCache.filter(x=>String(x.email||x.id||'').toLowerCase()!==String(email).toLowerCase()));
 listCloudBranchManagerAccess();
}


const REPORT_STATUS_LABELS={completed:'已完成',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
const REPORT_TO_LESSON_STATUS={completed:'已上課',student_leave:'學生請假',teacher_leave:'老師請假',no_show:'缺席',makeup_completed:'補課完成'};
function reportStatusLabel(v){return REPORT_STATUS_LABELS[v]||'尚未回報'}
function lessonBelongsToTeacher(l,teacherId){return lessonTeacherIds(l).includes(String(teacherId||''))}
function canUseTeacherReporting(){return cloudRole==='owner'||((cloudRole==='teacher'||cloudRole==='branch_manager')&&!!cloudTeacherId)}
function canActAsTeacherForLesson(lesson){return !!lesson&&!!cloudTeacherId&&(cloudRole==='teacher'||cloudRole==='branch_manager')&&lessonBelongsToTeacher(lesson,cloudTeacherId)}
function lessonReportDeadline(lesson){
 if(!lesson?.date)return null;
 const [y,m,d]=String(lesson.date).split('-').map(Number);
 if(!y||!m||!d)return null;
 // Teachers and branch managers may submit only on the lesson's calendar day.
 // The window closes exactly when the local date changes at 00:00.
 return new Date(y,m-1,d,23,59,59,999);
}
function teacherReportWindowOpen(lesson){
 const deadline=lessonReportDeadline(lesson);
 return !!deadline&&!Number.isNaN(deadline.getTime())&&Date.now()<=deadline.getTime()&&Date.now()>=new Date(`${lesson.date}T00:00:00`).getTime();
}
function canReportLesson(lesson){
 if(cloudRole==='owner')return !!lesson;
 if(!canUseTeacherReporting()||!canActAsTeacherForLesson(lesson))return false;
 // 老師與校區管理者只能在課程當天回報；跨日後立即關閉。
 return teacherReportWindowOpen(lesson);
}
function canViewLessonReport(lesson){
 if(!lesson)return false;
 if(cloudRole==='owner')return true;
 if(cloudRole==='branch_manager')return cloudBranchIds.includes(lessonBranchId(lesson));
 return cloudRole==='teacher'&&lessonBelongsToTeacher(lesson,cloudTeacherId);
}
function setTeacherReportReadOnly(readOnly,message=''){
 const modal=document.getElementById('teacherReportModal');if(!modal)return;
 modal.dataset.readOnly=readOnly?'true':'false';
 modal.querySelectorAll('input[name="teacherReportStatus"], textarea').forEach(el=>el.disabled=!!readOnly);
 ['saveTeacherReportBtn','quickCompleteTeacherReportBtn','startClassFocusBtn'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=!!readOnly});
 const note=document.getElementById('teacherReportPermissionNote');
 if(note){note.hidden=!message;note.textContent=message}
}
function applyReportToLesson(lesson,report){
 if(!lesson||!report)return false;
 const next={teacherReportStatus:report.status||'',teacherReportContent:report.content||'',teacherReportHomework:report.homework||'',teacherReportFeedback:report.feedback||'',teacherReportNote:report.note||'',teacherReportUpdatedAt:report.updatedAtClient||'',teacherReportBy:report.teacherName||'',teacherReportEmail:report.teacherEmail||''};
 let changed=false;
 for(const [k,v] of Object.entries(next)){if((lesson[k]||'')!==v){lesson[k]=v;changed=true}}
 const mapped=REPORT_TO_LESSON_STATUS[report.status];
 if(mapped&&lesson.status!==mapped){lesson.status=mapped;changed=true}
 if(report.status==='student_leave'&&window.addMakeupForLesson){const list=window.__danbridgeGetDB?.().makeups||[],before=list.find(m=>m.sourceLessonId===lesson.id),beforeStatus=before?.status||'';const makeup=window.addMakeupForLesson(lesson);if(!before||makeup?.status!==beforeStatus)changed=true;}
 if(report.status!=='student_leave'&&!window.lessonIsLinkedMakeup?.(lesson)&&window.cancelOpenMakeupForSourceLesson?.(lesson))changed=true;
 if(report.status==='makeup_completed'&&window.completeMakeupForLesson?.(lesson))changed=true;
 return changed;
}

function lessonReportLocalToday(){const now=new Date();return`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
function lessonReportTimestamp(report){return report?.updatedAt?.toMillis?.()||Date.parse(report?.updatedAtClient||report?.teacherReportUpdatedAt||'')}
function reportIsAllowedForLessonDate(lesson,reportedAt){
 const today=lessonReportLocalToday(),date=String(lesson?.date||'');
 if(date>today)return false;
 if(date<today)return true;
 if(!Number.isFinite(reportedAt))return false;
 const time=new Date(reportedAt),reportedDate=`${time.getFullYear()}-${String(time.getMonth()+1).padStart(2,'0')}-${String(time.getDate()).padStart(2,'0')}`;
 return reportedDate===today;
}
function stripPrematureLessonReport(lesson){
 const copy={...(lesson||{})},reportedAt=lessonReportTimestamp(copy);
 if(reportIsAllowedForLessonDate(copy,reportedAt))return copy;
 const reportKeys=Object.keys(copy).filter(key=>key.startsWith('teacherReport'));
 reportKeys.forEach(key=>delete copy[key]);
 if(reportKeys.length&&String(copy.date||'')>=lessonReportLocalToday()&&['已上課','學生請假','老師請假','缺席','補課完成'].includes(copy.status))copy.status='未上課';
 return copy;
}
function reportIsNewForCopiedLesson(lesson,report){
 const reportedAt=lessonReportTimestamp(report);
 if(!reportIsAllowedForLessonDate(lesson,reportedAt))return false;
 if(!lesson?.copyCreatedAt)return true;
 const copiedAt=Date.parse(lesson.copyCreatedAt);
 return Number.isFinite(copiedAt)&&Number.isFinite(reportedAt)&&reportedAt>=copiedAt;
}

function reportNotificationSeenKey(){return`danbridge_report_notification_seen_v20201_${cloudEmailKey||cloudRole||'member'}`}
function reportNotificationSeen(){try{return new Set(JSON.parse(localStorage.getItem(reportNotificationSeenKey())||'[]'))}catch{return new Set()}}
function saveReportNotificationSeen(seen){try{localStorage.setItem(reportNotificationSeenKey(),JSON.stringify([...seen].slice(-300)))}catch{}}
function reportNotificationSignature(report){return`${report.id||report.lessonId||''}:${lessonReportTimestamp(report)||0}`}
function installReportNotificationUI(){
 if(document.getElementById('reportSubmissionNotificationModal'))return;
 const modal=document.createElement('div');
 modal.id='reportSubmissionNotificationModal';modal.className='schedule-notification-backdrop';modal.hidden=true;
 modal.innerHTML=`<div class="schedule-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="reportSubmissionNotificationTitle"><div class="schedule-notification-head"><div><div class="schedule-notification-eyebrow">LESSON REPORT</div><h2 id="reportSubmissionNotificationTitle">課堂回報通知</h2></div></div><div id="reportSubmissionNotificationBody" class="schedule-notification-body"></div><div class="schedule-notification-actions"><button type="button" class="btn primary" id="reportSubmissionNotificationClose">知道了</button></div></div>`;
 document.body.appendChild(modal);
 document.getElementById('reportSubmissionNotificationClose').onclick=()=>{modal.hidden=true;currentReportNotification=null};
}
function openReportNotificationSource(index){
 const item=currentReportNotification?.[index],lesson=item?.lesson;if(!lesson)return;
 const month=document.getElementById('lessonMonth');if(month)month.value=String(lesson.date||'').slice(0,7);
 const modal=document.getElementById('reportSubmissionNotificationModal');if(modal)modal.hidden=true;
 window.switchTab?.('lessons');setTimeout(()=>{window.renderLessons?.();window.openLessonReport?.(lesson.id)},40);
}
function notifyNewLessonReports(reports){
 if(!['owner','branch_manager'].includes(cloudRole))return;
 const seen=reportNotificationSeen(),local=window.__danbridgeGetDB?.(),candidates=(reports||[]).filter(report=>{
   const timestamp=lessonReportTimestamp(report),signature=reportNotificationSignature(report);
   return timestamp>=REPORT_NOTIFICATION_STARTED_AT&&!seen.has(signature)&&String(report.teacherEmail||'').toLowerCase()!==cloudEmailKey;
 }).map(report=>({report,lesson:local?.lessons?.find(lesson=>lesson.id===(report.lessonId||report.id))})).filter(item=>item.lesson&&canViewLessonReport(item.lesson));
 if(!candidates.length)return;
 candidates.forEach(({report})=>seen.add(reportNotificationSignature(report)));saveReportNotificationSeen(seen);
 installReportNotificationUI();currentReportNotification=candidates;
 const body=document.getElementById('reportSubmissionNotificationBody'),modal=document.getElementById('reportSubmissionNotificationModal');if(!body||!modal)return;
 body.innerHTML=`<p class="schedule-notification-lead"><b>${candidates.length===1?`${escapeHTML(candidates[0].report.teacherName||'老師')} 已提交課堂回報`:`收到 ${candidates.length} 筆新課堂回報`}</b><span>內容已同步到課程紀錄、統計與薪資資料。</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>老師</th><th>日期時間</th><th>學生／課程</th><th>狀態</th><th>操作</th></tr></thead><tbody>${candidates.map(({report,lesson},index)=>`<tr><td>${escapeHTML(report.teacherName||'老師')}</td><td>${escapeHTML(`${lesson.date||''} ${lesson.start||''}–${lesson.end||''}`)}</td><td><b>${escapeHTML((window.__danbridgeGetDB?.().students||[]).find(student=>student.id===lesson.studentId)?.name||lesson.title||'課程')}</b></td><td>${escapeHTML(reportStatusLabel(report.status))}</td><td><button type="button" class="btn" data-report-notification-source="${index}">查看回報</button></td></tr>`).join('')}</tbody></table></div>`;
 body.querySelectorAll('[data-report-notification-source]').forEach(button=>button.addEventListener('click',()=>openReportNotificationSource(Number(button.dataset.reportNotificationSource))));
 modal.hidden=false;
}

function applyCachedLessonReportsToCurrentDB(){
 const local=window.__danbridgeGetDB?.();
 if(!local||!Array.isArray(local.lessons)||!Array.isArray(lessonReportDocuments)||!lessonReportDocuments.length)return false;
 let changed=false;
 for(const report of lessonReportDocuments){
   const lesson=local.lessons.find(x=>x.id===(report.lessonId||report.id));
   if(lesson&&canViewLessonReport(lesson)&&reportIsNewForCopiedLesson(lesson,report))changed=applyReportToLesson(lesson,report)||changed;
 }
 return changed;
}
function openTeacherReportModal(lessonId,options={}){
 if(!canUseTeacherReporting())return originalEditLesson?.(lessonId);
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 const readOnly=options.readOnly===true;
 if(!lesson||!canViewLessonReport(lesson)||(!readOnly&&cloudRole!=='owner'&&!lessonBelongsToTeacher(lesson,cloudTeacherId)))return alert('你沒有這堂課的回報權限。');
 document.getElementById('teacherReportLessonId').value=lesson.id;
 const s=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{};
 document.getElementById('teacherReportLessonInfo').innerHTML=`<b>${lesson.date} ${lesson.start}–${lesson.end}</b><br>${s.name||'未命名學生'}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===(lesson.teacherReportStatus||''));
 document.getElementById('teacherReportContent').value=lesson.teacherReportContent||'';
 document.getElementById('teacherReportHomework').value=lesson.teacherReportHomework||'';
 document.getElementById('teacherReportFeedback').value=lesson.teacherReportFeedback||'';
 document.getElementById('teacherReportNote').value=lesson.teacherReportNote||'';
 const deadline=lessonReportDeadline(lesson);
 const locked=!readOnly&&cloudRole!=='owner'&&!teacherReportWindowOpen(lesson);
 let permissionMessage='';
 if(readOnly)permissionMessage='唯讀模式：你可以查看此校區的課堂回報，但不能修改其他老師的內容。';
 else if(deadline)permissionMessage=`僅限課程當天回報，將於隔日 00:00 關閉。`;
 setTeacherReportReadOnly(readOnly||locked,locked?'此課程已非當天，課堂回報已關閉。':permissionMessage);
 document.getElementById('teacherReportModal').classList.add('show');
 if(locked){const modal=document.querySelector('#teacherReportModal .modal');if(modal)modal.scrollTop=0;}
}
async function getTrustedLessonMeta(lessonId){
 const metaSnap=await getDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId));
 if(!metaSnap.exists())throw new Error('找不到這堂課的雲端權限資料，請 Owner 登入並重新同步課表。');
 const meta=metaSnap.data()||{};
 if(meta.active!==true)throw new Error('這堂課目前未啟用回報。');
 const teacherIds=(Array.isArray(meta.teacherIds)?meta.teacherIds:[]).filter(Boolean).map(String);
 if(!cloudUid)throw new Error('登入狀態尚未完成，請重新登入後再試。');
 if(cloudRole==='owner')return {...meta,teacherIds};
 if(!cloudTeacherId)throw new Error('此帳號尚未綁定老師資料，請 Owner 重新儲存帳號設定。');
 if(!teacherIds.includes(String(cloudTeacherId)))throw new Error('雲端課程尚未綁定目前老師，請 Owner 登入後重新同步一次課表。');
 return {...meta,teacherIds};
}
function quickCompleteTeacherReport(){
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value==='completed');
 return saveTeacherReport();
}
function closeTeacherReportModal(){document.getElementById('teacherReportModal')?.classList.remove('show')}
async function saveTeacherReport(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId').value;
 const lesson=window.__danbridgeGetDB().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到可回報的課程。');
 if(cloudRole!=='owner'&&!canActAsTeacherForLesson(lesson))return alert('你沒有這堂課的回報權限。');
 if(cloudRole!=='owner'&&!teacherReportWindowOpen(lesson))return alert('此課程已非當天，課堂回報已關閉。');
 const status=document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'';
 if(!status)return alert('請選擇上課狀態。');
 const btn=document.getElementById('saveTeacherReportBtn');btn.disabled=true;btn.textContent='儲存中…';
 try{
   const trustedMeta=await getTrustedLessonMeta(lessonId);
   const lessonTeacherId=lessonTeacherIds(lesson)[0]||'';
   const reporterName=(document.body.dataset.cloudDisplayName||auth.currentUser?.displayName||auth.currentUser?.email||'').trim();
   const trustedDeadline=trustedMeta.editableUntil?.toDate?.()||null;
   const report={companyId:COMPANY_ID,lessonId,branchId:trustedMeta.branchId,teacherId:cloudRole==='owner'?(cloudTeacherId||lessonTeacherId):cloudTeacherId,teacherUid:cloudUid,teacherEmail:auth.currentUser?.email?.toLowerCase()||'',teacherName:reporterName,reportedByRole:cloudRole,reportedForTeacherIds:Array.isArray(trustedMeta.teacherIds)?trustedMeta.teacherIds:[],isOwnerReport:cloudRole==='owner',status,content:document.getElementById('teacherReportContent').value.trim(),homework:document.getElementById('teacherReportHomework').value.trim(),feedback:document.getElementById('teacherReportFeedback').value.trim(),note:document.getElementById('teacherReportNote').value.trim(),editableUntil:trustedMeta.editableUntil,editableUntilClient:trustedDeadline?.toISOString()||'',updatedAt:serverTimestamp(),updatedAtClient:new Date().toISOString()};
   await setDoc(doc(cloud,'companies',COMPANY_ID,'lessonReports',lessonId),report,{merge:true});
   applyReportToLesson(lesson,report);window.renderAll?.();closeTeacherReportModal();
   cloudStatus('課程回報已儲存','ok');
   return true;
 }catch(e){
   console.error('saveTeacherReport failed',e);
   const code=String(e?.code||'');
   let detail=e?.message||'未知錯誤';
   if(code.includes('permission-denied')){
     detail='課程回報寫入被 Firestore 拒絕。請部署本版本 firebase/firestore.rules；老師與主管只能在課程當天儲存，隔日 00:00 後會關閉。';
   }
   alert('課程回報儲存失敗：'+detail);
   cloudStatus('回報儲存失敗','error');return false
 }
 finally{btn.disabled=false;btn.textContent='儲存回報'}
}


let classFocusLessonId='';
let classFocusTimerHandle=null;
const CLASS_FOCUS_DRAFT_PREFIX='danbridge_class_focus_v31_';
function classFocusDraftKey(id){return CLASS_FOCUS_DRAFT_PREFIX+id}
function getClassFocusDraft(id){try{return JSON.parse(localStorage.getItem(classFocusDraftKey(id))||'null')}catch{return null}}
function saveClassFocusDraft(){
 if(!classFocusLessonId)return;
 const status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 const draft={content:document.getElementById('classFocusContent')?.value||'',homework:document.getElementById('classFocusHomework')?.value||'',feedback:document.getElementById('classFocusFeedback')?.value||'',note:document.getElementById('classFocusNote')?.value||'',status,updatedAt:new Date().toISOString()};
 try{localStorage.setItem(classFocusDraftKey(classFocusLessonId),JSON.stringify(draft))}catch{}
}
function clearClassFocusDraft(id){try{localStorage.removeItem(classFocusDraftKey(id))}catch{}}
function classFocusEndTime(lesson){
 const [y,m,d]=(lesson.date||'').split('-').map(Number),[h,mi]=(lesson.end||'00:00').split(':').map(Number);
 return new Date(y,m-1,d,h,mi,0,0);
}
function updateClassFocusTimer(){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===classFocusLessonId),box=document.getElementById('classFocusTimer'),label=document.getElementById('classFocusTimerLabel'),value=document.getElementById('classFocusTimerValue');
 if(!lesson||!box||!label||!value)return;
 const diff=classFocusEndTime(lesson)-new Date(),over=diff<0,total=Math.floor(Math.abs(diff)/1000),hh=Math.floor(total/3600),mm=Math.floor((total%3600)/60),ss=total%60;
 value.textContent=(hh?String(hh).padStart(2,'0')+':':'')+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
 label.textContent=over?'已超過下課時間':'距離下課';box.classList.toggle('overtime',over);
}
function openClassFocusMode(){
 if(!canUseTeacherReporting())return;
 const lessonId=document.getElementById('teacherReportLessonId')?.value||'';
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson||!canReportLesson(lesson))return alert('找不到可開始的課程。');
 const student=window.__danbridgeGetDB().students.find(x=>x.id===lesson.studentId)||{},draft=getClassFocusDraft(lessonId);
 classFocusLessonId=lessonId;
 document.getElementById('classFocusTitle').textContent=student.name||lesson.title||'課程';
 document.getElementById('classFocusMeta').textContent=`${lesson.date} ${lesson.start}–${lesson.end}｜${lesson.title||'課程'}｜${lesson.location||''} ${lesson.room||''}`.trim();
 document.getElementById('classFocusContent').value=draft?.content ?? document.getElementById('teacherReportContent').value;
 document.getElementById('classFocusHomework').value=draft?.homework ?? document.getElementById('teacherReportHomework').value;
 document.getElementById('classFocusFeedback').value=draft?.feedback ?? document.getElementById('teacherReportFeedback').value;
 document.getElementById('classFocusNote').value=draft?.note ?? document.getElementById('teacherReportNote').value;
 const selected=draft?.status||document.querySelector('input[name="teacherReportStatus"]:checked')?.value||'completed';
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.checked=r.value===selected);
 closeTeacherReportModal();
 document.getElementById('classFocusMode').classList.add('show');document.getElementById('classFocusMode').setAttribute('aria-hidden','false');document.body.classList.add('class-focus-open');
 clearInterval(classFocusTimerHandle);updateClassFocusTimer();classFocusTimerHandle=setInterval(updateClassFocusTimer,1000);
 setTimeout(()=>document.getElementById('classFocusContent')?.focus(),80);
}
function closeClassFocusMode({discard=false,reopen=false}={}){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId;
 if(discard)clearClassFocusDraft(id);else saveClassFocusDraft();
 clearInterval(classFocusTimerHandle);classFocusTimerHandle=null;
 document.getElementById('classFocusMode')?.classList.remove('show');document.getElementById('classFocusMode')?.setAttribute('aria-hidden','true');document.body.classList.remove('class-focus-open');
 classFocusLessonId='';
 if(reopen)openTeacherReportModal(id);
}
async function completeClassFocusMode(){
 if(!classFocusLessonId)return;
 const id=classFocusLessonId,status=document.querySelector('input[name="classFocusStatus"]:checked')?.value||'';
 if(!status)return alert('請先選擇課程狀態。');
 document.getElementById('teacherReportLessonId').value=id;
 document.getElementById('teacherReportContent').value=document.getElementById('classFocusContent').value;
 document.getElementById('teacherReportHomework').value=document.getElementById('classFocusHomework').value;
 document.getElementById('teacherReportFeedback').value=document.getElementById('classFocusFeedback').value;
 document.getElementById('teacherReportNote').value=document.getElementById('classFocusNote').value;
 document.querySelectorAll('input[name="teacherReportStatus"]').forEach(r=>r.checked=r.value===status);
 const btn=document.getElementById('classFocusCompleteBtn');btn.disabled=true;btn.textContent='同步中…';
 try{const saved=await saveTeacherReport();if(saved){clearClassFocusDraft(id);closeClassFocusMode({discard:true,reopen:false})}}
 finally{btn.disabled=false;btn.textContent='完成並儲存'}
}
function installClassFocusMode(){
 document.getElementById('startClassFocusBtn')?.addEventListener('click',openClassFocusMode);
 document.getElementById('quickCompleteTeacherReportBtn')?.addEventListener('click',quickCompleteTeacherReport);
 document.getElementById('classFocusExitBtn')?.addEventListener('click',()=>closeClassFocusMode({reopen:true}));
 document.getElementById('classFocusDiscardBtn')?.addEventListener('click',()=>{if(confirm('確定放棄這次尚未同步的輸入？'))closeClassFocusMode({discard:true,reopen:true})});
 document.getElementById('classFocusCompleteBtn')?.addEventListener('click',completeClassFocusMode);
 ['classFocusContent','classFocusHomework','classFocusNote'].forEach(id=>document.getElementById(id)?.addEventListener('input',saveClassFocusDraft));
 document.querySelectorAll('input[name="classFocusStatus"]').forEach(r=>r.addEventListener('change',saveClassFocusDraft));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('classFocusMode')?.classList.contains('show')){e.preventDefault();closeClassFocusMode({reopen:true})}},true);
}


window.openLessonReport=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 if(!lesson)return alert('找不到課程。');
 if(cloudRole==='owner'||canActAsTeacherForLesson(lesson))return openTeacherReportModal(lessonId);
 if(cloudRole==='branch_manager'&&canViewLessonReport(lesson))return openTeacherReportModal(lessonId,{readOnly:true});
 return alert('你沒有這堂課的回報權限。');
};
window.canCurrentUserReportLesson=function(lessonId){
 const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===lessonId);
 return !!lesson&&canReportLesson(lesson);
};
window.currentCloudRole=function(){return cloudRole};

function installTeacherReportUI(){
 window.editLesson=(id)=>{
   if(cloudRole==='teacher'&&cloudCanManageSchedule)return originalEditLesson?.(id);
   if(cloudRole==='teacher')return openTeacherReportModal(id);
   if(cloudRole==='branch_manager'){
     const lesson=window.__danbridgeGetDB?.().lessons.find(l=>l.id===id);
     return canActAsTeacherForLesson(lesson)?openTeacherReportModal(id):openTeacherReportModal(id,{readOnly:true});
   }
   return originalEditLesson?.(id);
 };
 document.getElementById('closeTeacherReportModal')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('cancelTeacherReportBtn')?.addEventListener('click',closeTeacherReportModal);
 document.getElementById('saveTeacherReportBtn')?.addEventListener('click',saveTeacherReport);
 document.getElementById('teacherReportModal')?.addEventListener('click',e=>{if(e.target===document.getElementById('teacherReportModal'))closeTeacherReportModal()});
}
function subscribeLessonReports(){
 unsubscribeReports?.();unsubscribeReports=null;
 if(cloudRole==='teacher')return;
 if(cloudRole!=='owner'&&!canUseTeacherReporting())return;
 const reportsRef=collection(cloud,'companies',COMPANY_ID,'lessonReports');
 let qy=reportsRef;
 if(cloudRole==='branch_manager'){
   if(!cloudBranchIds.length)return;
   qy=cloudBranchIds.length===1?query(reportsRef,where('branchId','==',cloudBranchIds[0])):query(reportsRef,where('branchId','in',cloudBranchIds.slice(0,30)));
 }
 unsubscribeReports=onSnapshot(qy,snap=>{
   lessonReportDocuments=snap.docs.map(d=>({id:d.id,...d.data()}));
   notifyNewLessonReports(lessonReportDocuments);
   window.DanbridgeNotifications?.render?.();
   const local=window.__danbridgeGetDB();
   const changed=applyCachedLessonReportsToCurrentDB();
   const modal=document.getElementById('teacherReportModal');
   if(modal?.classList.contains('show')){const id=document.getElementById('teacherReportLessonId')?.value;const l=local.lessons.find(x=>x.id===id);if(l)setTimeout(()=>openTeacherReportModal(id,{readOnly:modal.dataset.readOnly==='true'&&cloudRole==='branch_manager'&&!canActAsTeacherForLesson(l)}),0)}
   if(!changed)return;
   persistCurrentLocalView();
   window.renderAll?.();
   window.renderDashboard?.();
   if(cloudRole==='owner'){clearTimeout(reportSyncTimer);reportSyncTimer=setTimeout(uploadOwnerState,500)}
 },e=>{
   console.error('lessonReports listener',e);
   if(cloudRole==='teacher'&&String(e?.code||'').includes('permission-denied')){
     lessonReportDocuments=[];
     cloudStatus('老師課表已同步','ok');
     return;
   }
   cloudStatus('課程回報同步失敗：'+e.message,'error');
 });
}

const OWNER_DISPLAY_NAME='Daniel';
function roleAccessSignature(value={}){
 const branchIds=(Array.isArray(value.branchIds)?value.branchIds:[]).map(String).sort();
 return JSON.stringify({role:String(value.role||''),teacherId:String(value.teacherId||''),branchIds,readOnly:value.readOnly===true,canSubmitOwnReports:value.canSubmitOwnReports!==false,canManageSchedule:value.canManageSchedule===true});
}
function installRoleInteractionGuards(){
 if(document.documentElement.dataset.roleInteractionGuards==='1')return;
 document.documentElement.dataset.roleInteractionGuards='1';
 document.addEventListener('contextmenu',event=>{if(cloudRole==='branch_manager'&&event.target.closest?.('#calendarCanvas')){event.preventDefault();event.stopImmediatePropagation()}},true);
 document.addEventListener('mousedown',event=>{if(cloudRole==='branch_manager'&&event.button===0&&event.target.closest?.('#calendarCanvas')&&!event.target.closest?.('[data-id],button,input,select'))event.stopImmediatePropagation()},true);
}
function markRoleIsolated(element){
 if(!element)return;
 element.dataset.roleIsolated='1';element.hidden=true;element.inert=true;element.setAttribute('aria-hidden','true');element.style.setProperty('display','none','important');
}
function restoreRoleIsolated(){
 document.querySelectorAll('[data-role-isolated="1"]').forEach(element=>{element.hidden=false;element.inert=false;element.removeAttribute('aria-hidden');element.style.removeProperty('display');delete element.dataset.roleIsolated});
}
function applyCalendarLocationRoleScope(){
 const select=document.getElementById('calendarLocationFilter');
 if(!select)return;
 if(!select.dataset.ownerOptions)select.dataset.ownerOptions=select.innerHTML;
 select.innerHTML=select.dataset.ownerOptions;
 if(cloudRole!=='branch_manager')return;
 const allowedBranches=new Set(cloudBranchIds.map(id=>window.DanbridgeAccess?.branchName?.(id)).filter(Boolean));
 [...select.options].forEach(option=>{
   const value=String(option.value||'');
   if(value&&value!=='到府'&&value!=='線上課'&&!allowedBranches.has(value))option.remove();
 });
 if(![...select.options].some(option=>option.value===select.value))select.value='';
}
function applyRoleUI(profile,user){
 const normalizedRole=String(profile?.role||'').trim().toLowerCase();
 cloudRole=normalizedRole;cloudTeacherId=profile.teacherId==null?'':String(profile.teacherId);cloudBranchIds=Array.isArray(profile.branchIds)?profile.branchIds:[];cloudCanManageSchedule=cloudRole==='teacher'&&profile.canManageSchedule===true;cloudUid=user.uid;cloudEmailKey=(user.email||'').trim().toLowerCase();window.__danbridgeLessonIdMigrationAuthority=cloudRole==='owner';
 flushOperationalErrors();
 cloudRoleAccessSignature=cloudRole==='owner'?'':roleAccessSignature({...profile,role:cloudRole,teacherId:cloudTeacherId,branchIds:cloudBranchIds});
 if(cloudRole==='owner'){const current=window.__danbridgeGetDB?.();if(current)window.__danbridgeSetDB(deepCopy(current));}
 window.DanbridgeAccess?.setContext({role:cloudRole,branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:profile.readOnly===true||cloudRole==='branch_manager',canSubmitOwnReports:profile.canSubmitOwnReports!==false,canManageSchedule:cloudCanManageSchedule});
 const signedInName=(cloudRole==='owner'?(cloudEmailKey===OWNER_EMAIL?OWNER_DISPLAY_NAME:(profile.displayName||user.displayName)):cloudRole==='teacher'?(profile.teacherName||profile.displayName):cloudRole==='branch_manager'?(profile.managerName||profile.teacherName||profile.displayName):(profile.displayName||user.displayName))||user.displayName||user.email||'';
 document.body.dataset.cloudDisplayName=String(signedInName).trim();
 if(cloudRole==='owner'&&profile.displayName!==signedInName){
   const ownerRef=doc(cloud,'companies',COMPANY_ID,'accounts',user.uid);
   setDoc(ownerRef,{displayName:signedInName,updatedAt:serverTimestamp()},{merge:true}).catch(error=>console.warn('owner display name sync failed',error));
 }
 const header=document.querySelector('.header-auth-actions');
 if(header)header.innerHTML=`<span class="cloud-role-label" style="font-size:12px;font-weight:800">${cloudCanManageSchedule?'排課專員':(window.DanbridgeAccess?.ROLE_LABELS?.[profile.role]||profile.role)}｜${String(signedInName).trim()}</span>${profile.role==='owner'?'<button type="button" class="btn notification-bell" onclick="DanbridgeNotifications.open()" aria-label="開啟通知中心"><span class="notification-bell-icon">🔔</span><span id="notificationCount" class="notification-count" hidden>0</span></button>':''}<button type="button" class="btn" id="firebaseLogoutBtn">登出</button>`;
 document.getElementById('firebaseLogoutBtn')?.addEventListener('click',()=>signOut(auth));
 document.body.classList.toggle('teacher-cloud-role',profile.role==='teacher');
 document.body.classList.toggle('wendy-teacher-role',cloudRole==='teacher'&&cloudEmailKey==='wendylee0820520@gmail.com');
 document.body.classList.toggle('branch-manager-cloud-role',profile.role==='branch_manager');
 document.body.dataset.cloudRole=cloudRole;
 document.body.dataset.roleUx=cloudRole;
 if(cloudRole==='owner'){
   restoreRoleIsolated();
   window.DanbridgeRoleResponsive?.restoreRoleResponsiveControls?.();
   restoreOwnerSyncRecovery();
   setTimeout(installOperationalResilienceUI,0);
 }
 applyCalendarLocationRoleScope();
 window.ensureTeacherHoursMetric?.();

 const teacherOnly=profile.role==='teacher';
 if(teacherOnly){
   delete document.body.dataset.teacherWeekInitialized;
   applyingCloud=true;
   window.__danbridgeSetDB(emptyDB());
   window.renderAll?.();
   applyingCloud=false;

   const teacherAllowedTabs=new Set(cloudCanManageSchedule?['students','calendar']:['dashboard','calendar','lessons']);
   const teacherTabLabels={dashboard:'我的總覽',calendar:cloudCanManageSchedule?'全老師課表':'我的課表',lessons:'課程回報'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{
     const allowed=teacherAllowedTabs.has(b.dataset.tab);
     if(allowed)b.textContent=teacherTabLabels[b.dataset.tab];
     b.hidden=!allowed;
     b.classList.toggle('teacher-nav-hidden',!allowed);
     b.style.setProperty('display',allowed?'':'none',allowed?'':'important');
     b.setAttribute('aria-hidden',allowed?'false':'true');
     if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex');
   });
   const activeSection=document.querySelector('main section.active');
   if(activeSection&&!teacherAllowedTabs.has(activeSection.id))switchTab(cloudCanManageSchedule?'calendar':'dashboard');

   // 一般老師保留老師功能；純排課專員只保留全老師課表。
   const teacherHiddenSelector=cloudCanManageSchedule?'#dashboard .owner-only-action,#dashboard .owner-v33-only,#dashboard .branch-scope-bar,#lessons .toolbar button,#v18Fab,#v18FabMenu,.floating-actions .v20-owner-action':'.owner-only-action,.floating-actions,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#dashboard .owner-v33-only,#dashboard .branch-scope-bar,#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher,#lessons .toolbar button';
   document.querySelectorAll(teacherHiddenSelector).forEach(e=>{const target=e.matches('select')?e.closest('.calendar-field,#lessons .toolbar>div')||e:e;markRoleIsolated(target)});
   const teacherAnalysis=document.getElementById('calendarAnalysis');if(teacherAnalysis){markRoleIsolated(teacherAnalysis);teacherAnalysis.replaceChildren()}
   if(!cloudCanManageSchedule)document.querySelectorAll('.floating-actions').forEach(e=>e.remove());
   document.querySelectorAll(`#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security${cloudCanManageSchedule?',#dashboard,#lessons':',#students'}`).forEach(e=>{markRoleIsolated(e);e.classList.remove('active')});

   // 隱藏公司營收、未收款、薪資、老師總數與公司異動等敏感資訊。
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     markRoleIsolated(document.getElementById(id)?.closest('.metric'));
   });
   markRoleIsolated(document.querySelector('.dashboard-changes'));
   markRoleIsolated(document.querySelector('#dashboard .card:nth-of-type(2)'));
   window.DanbridgeRoleResponsive?.apply?.();
   if(cloudCanManageSchedule){
     const addStudentButton=document.querySelector('#lessonModal .student-select-row>button');
     if(addStudentButton){addStudentButton.hidden=false;addStudentButton.inert=false;addStudentButton.removeAttribute('aria-hidden');addStudentButton.style.setProperty('display','inline-flex','important')}
   }
   setTimeout(()=>window.DanbridgeRoleResponsive?.apply?.(),500);
 }else if(profile.role==='branch_manager'){
   applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
   const allowedTabs=new Set(['dashboard','students','teachers','calendar','lessons','makeups','settlement','finance']);
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{const allowed=allowedTabs.has(b.dataset.tab);b.hidden=!allowed;b.style.setProperty('display',allowed?'':'none',allowed?'':'important');b.setAttribute('aria-hidden',allowed?'false':'true');b.inert=!allowed;if(!allowed)b.tabIndex=-1;else b.removeAttribute('tabindex')});
   const active=document.querySelector('main section.active');if(active&&!allowedTabs.has(active.id))switchTab('dashboard');
   document.querySelectorAll('.owner-only-action,.v20-owner-action,.floating-actions,#v18Fab,#v18FabMenu,.v181-lesson-undo,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar #selectionBar,#students button,#teachers button,#lessons .toolbar button,#makeups button,#settlement button,#finance button,#lessonModal,#smartSchedulerModal,#batchModal,#v20ReplaceModal,#v20HistoryModal').forEach(markRoleIsolated);
   // 課程清單保留查看入口；點到本人授課課程時會開啟課堂回報，其他課程維持唯讀詳情。
   document.querySelectorAll('#drafts,#camps,#winterCamps,#data,#security').forEach(e=>{markRoleIsolated(e);e.classList.remove('active')});
   window.DanbridgeRoleResponsive?.apply?.();
 }else{
   const ownerTabLabels={dashboard:'總覽',students:'學生／家長',teachers:'老師',calendar:'拖曳課表',lessons:'課程紀錄',makeups:'補課中心',camps:'冬／夏令營',finance:'公司財務',data:'備份／iPad',security:'安全設定'};
   document.querySelectorAll('nav button[data-tab]').forEach(b=>{b.hidden=false;b.inert=false;b.classList.remove('teacher-nav-hidden');b.style.removeProperty('display');b.removeAttribute('aria-hidden');b.removeAttribute('tabindex');if(ownerTabLabels[b.dataset.tab])b.textContent=ownerTabLabels[b.dataset.tab]});
   document.querySelectorAll('#students,#teachers,#drafts,#makeups,#camps,#winterCamps,#settlement,#finance,#data,#security').forEach(e=>{e.hidden=false;e.inert=false;e.removeAttribute('aria-hidden');e.style.removeProperty('display')});
   document.querySelectorAll('.owner-only-action,.v20-owner-action,#v18Fab,#v18FabMenu,#lessonModal,#smartSchedulerModal,#batchModal,#v20ReplaceModal,#v20HistoryModal').forEach(e=>{e.hidden=false;e.inert=false;e.removeAttribute('aria-hidden');e.style.removeProperty('display')});
   document.querySelectorAll('.owner-only-action,.owner-v33-only,#calendar .calendar-head-add,#calendar .calendar-quick-add,#calendar .weekly-copy-btn,#calendar #selectionModeBtn,#calendar .day-add,#lessons .toolbar button,#dashboard .row-actions').forEach(e=>{e.hidden=false;e.style.removeProperty('display')});
   document.querySelectorAll('#calendarTeacherFilter,#calendarLocationFilter,#calendarStudentFilter,#calendarRoomFilter,#calendarStateFilter,#filterStudent,#filterTeacher').forEach(e=>{const target=e.closest('.calendar-field,#lessons .toolbar>div')||e;target.hidden=false;target.style.removeProperty('display');target.classList.remove('teacher-redundant-filter')});
   const analysis=document.getElementById('calendarAnalysis');if(analysis){analysis.hidden=false;analysis.style.removeProperty('display')}
   if(!document.querySelector('.floating-actions')){
     const floating=document.createElement('div');floating.className='floating-actions';floating.innerHTML='<button class="btn v20-owner-action" onclick="openRecentChanges()">最近修改</button><button id="undoBtn" class="btn" onclick="undoLast()">↶ 復原</button><button id="redoBtn" class="btn" onclick="redoLast()">↷ 重做</button><button class="btn primary" onclick="openLessonModal()">＋ 新增</button>';
     const toast=document.getElementById('toast');toast?.parentNode?.insertBefore(floating,toast);
   }
   ['mTeachers','mRevenue','mUnpaid','mPayroll','mChanges'].forEach(id=>{
     document.getElementById(id)?.closest('.metric')?.style.removeProperty('display');
   });
   document.querySelector('.dashboard-changes')?.style.removeProperty('display');
   document.querySelector('#dashboard .card:nth-of-type(2)')?.style.removeProperty('display');
   setTimeout(()=>{window.DanbridgeRoleResponsive?.apply?.();window.renderAll?.()},0);
 }
 window.installNavigationHandlers?.();
}
function lessonMetaSignature(value){
 const teacherIds=(Array.isArray(value?.teacherIds)?value.teacherIds:[]).filter(Boolean).map(String).sort();
 const editableFrom=value?.editableFrom instanceof Date?value.editableFrom.toISOString():(value?.editableFrom?.toDate?.()?.toISOString?.()||String(value?.editableFrom||''));
 const editableUntil=value?.editableUntil instanceof Date?value.editableUntil.toISOString():(value?.editableUntil?.toDate?.()?.toISOString?.()||String(value?.editableUntil||''));
 return dataHash({companyId:String(value?.companyId||COMPANY_ID),lessonId:String(value?.lessonId||''),branchId:String(value?.branchId||''),lessonDate:String(value?.lessonDate||''),lessonStart:String(value?.lessonStart||''),lessonEnd:String(value?.lessonEnd||''),studentId:String(value?.studentId||''),teacherIds,editableFrom,editableUntil,active:value?.active!==false});
}
async function publishLessonMeta(){
 if(cloudRole!=='owner')return;
 const lessons=(window.__danbridgeGetDB()?.lessons||[]).filter(l=>l?.id&&!l.isDraft);
 const metaRef=collection(cloud,'companies',COMPANY_ID,'lessonMeta');
 if(!lessonMetaCacheReady){
   const existing=await getDocs(metaRef);
   lessonMetaSignatureCache=new Map(existing.docs.map(d=>[d.id,lessonMetaSignature({...d.data(),lessonId:d.id})]));
   lessonMetaCacheReady=true;
 }
 const nextIds=new Set();
 const jobs=[];
 lessons.forEach(lesson=>{
   const deadline=lessonReportDeadline(lesson);
   const [y,m,d]=String(lesson.date||'').split('-').map(Number);
   const editableFrom=new Date(y,m-1,d,0,0,0,0);
   const teacherIds=lessonTeacherIds(lesson).sort();
   if(!deadline||Number.isNaN(editableFrom.getTime())||!teacherIds.length)return;
   const lessonId=String(lesson.id);
   nextIds.add(lessonId);
   const payload={companyId:COMPANY_ID,lessonId,branchId:lessonBranchId(lesson),lessonDate:String(lesson.date||''),lessonStart:String(lesson.start||''),lessonEnd:String(lesson.end||''),studentId:String(lesson.studentId||''),teacherIds,editableFrom,editableUntil:deadline,active:true};
   const signature=lessonMetaSignature(payload);
   if(lessonMetaSignatureCache.get(lessonId)===signature)return;
   jobs.push(setDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId),{...payload,editableFrom:Timestamp.fromDate(editableFrom),editableUntil:Timestamp.fromDate(deadline),updatedAt:serverTimestamp()},{merge:false}).then(()=>lessonMetaSignatureCache.set(lessonId,signature)));
 });
 for(const lessonId of [...lessonMetaSignatureCache.keys()]){
   if(nextIds.has(lessonId))continue;
   jobs.push(deleteDoc(doc(cloud,'companies',COMPANY_ID,'lessonMeta',lessonId)).then(()=>lessonMetaSignatureCache.delete(lessonId)));
 }
 await Promise.all(jobs);
}
async function getCompanyAccessDocs(){
 const now=Date.now();
 if(companyAccessCache&&now-companyAccessCacheAt<COMPANY_ACCESS_CACHE_TTL)return companyAccessCache;
 const qs=await getDocs(query(collection(cloud,'companyAccess'),where('companyId','==',COMPANY_ID)));
 companyAccessCache=qs.docs;
 companyAccessCacheAt=now;
 return companyAccessCache;
}
function invalidateCompanyAccessCache(){companyAccessCache=null;companyAccessCacheAt=0}
async function publishScopedViews(sourceOverride=null){
 if(cloudRole!=='owner')return;
 try{
   const sourceDb=sourceOverride?deepCopy(sourceOverride):window.__danbridgeGetDB();
   const accessDocs=await getCompanyAccessDocs();
   const jobs=[],scheduleTargets=[];
   for(const d of accessDocs){
     const p=d.data();
     const email=(p.email||d.id||'').trim().toLowerCase();
     if(p.active===false||!email)continue;
     if(p.role==='teacher'&&p.teacherId&&RETIRED_SCHEDULER_ACCOUNT_EMAILS.has(email)&&p.canManageSchedule===true){
       const viewDb=filteredTeacherDB(sourceDb,p.teacherId),hash=dataHash(viewDb),key='teacher:'+email;
       jobs.push(Promise.all([
         setDoc(d.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}),
         deleteDoc(doc(cloud,'companies',COMPANY_ID,'schedulerViews',email)).catch(()=>{}),
         getDocs(query(collection(cloud,'users'),where('companyId','==',COMPANY_ID),where('email','==',email))).then(qs=>Promise.all(qs.docs.map(u=>setDoc(u.ref,{canManageSchedule:deleteField(),readOnly:deleteField(),scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),updatedAt:serverTimestamp()},{merge:true}))))
       ]));
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'teacherViews',email),payload:{db:viewDb,updatedAt:serverTimestamp(),teacherId:p.teacherId,email,clientHash:hash},key,hash});
       continue;
     }
     if(p.role==='teacher'&&p.teacherId&&SCHEDULER_ACCOUNT_EMAILS.has(email)){
       const scopedDb=filteredSchedulerDB(sourceDb),hash=dataHash(scopedDb),key='scheduler:'+email;
       if(p.canManageSchedule===true&&scopedViewHashCache.get(key)===hash){continue}
       jobs.push(setDoc(d.ref,{canManageSchedule:true,readOnly:false,scopedDb:deleteField(),scopedClientHash:deleteField(),scopedUpdatedAt:deleteField(),active:true},{merge:true}));
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'schedulerViews',email),payload:{db:scopedDb,clientHash:hash,updatedAt:serverTimestamp(),email},key,hash});
     }else if(p.role==='teacher'&&p.teacherId){
       const viewDb=filteredTeacherDB(sourceDb,p.teacherId);
       const hash=dataHash(viewDb);
       const key='teacher:'+email;
       if(scopedViewHashCache.get(key)===hash)continue;
       scheduleTargets.push({ref:doc(cloud,'companies',COMPANY_ID,'teacherViews',email),payload:{db:viewDb,updatedAt:serverTimestamp(),teacherId:p.teacherId,email,clientHash:hash},key,hash});
     }else if(p.role==='branch_manager'&&Array.isArray(p.branchIds)&&p.branchIds.length){
       const scopedDb=filteredBranchDB(sourceDb,p.branchIds);
       const hash=dataHash(scopedDb);
       const key='branch:'+email;
       if(scopedViewHashCache.get(key)===hash||p.scopedClientHash===hash){scopedViewHashCache.set(key,hash);continue}
       jobs.push(setDoc(d.ref,{scopedDb,scopedClientHash:hash,scopedUpdatedAt:serverTimestamp(),branchIds:p.branchIds,active:true},{merge:true}).then(()=>scopedViewHashCache.set(key,hash)));
     }
   }
   if(scheduleTargets.length){
     const sourceHash=dataHash(sourceDb),published=await runTransaction(cloud,async transaction=>{
       const mainSnap=await transaction.get(doc(cloud,'companies',COMPANY_ID,'data','main'));
       const currentHash=mainSnap.exists()?(mainSnap.data()?.clientHash||dataHash(mainSnap.data()?.db)):'';
       if(currentHash!==sourceHash)return false;
       scheduleTargets.forEach(target=>transaction.set(target.ref,target.payload,{merge:false}));
       return true;
     });
     if(!published){await Promise.all(jobs);roleViewPublishQueued=true;return}
     scheduleTargets.forEach(target=>scopedViewHashCache.set(target.key,target.hash));
   }
   await Promise.all(jobs);
 }catch(e){
   console.error('publishScopedViews',e);
   throw e;
 }
}
async function publishRoleViewsWithRetry(sourceDb=null){
 if(cloudRole!=='owner')return;
 if(sourceDb)roleViewPublishSourceDB=deepCopy(sourceDb);
 roleViewPublishQueued=true;if(roleViewPublishInFlight)return;
 roleViewPublishInFlight=true;roleViewPublishQueued=false;clearTimeout(roleViewRetryTimer);const publishSource=roleViewPublishSourceDB;roleViewPublishSourceDB=null;
 try{await Promise.all([publishScopedViews(publishSource),publishLessonMeta()]);roleViewRetryCount=0}
 catch(e){roleViewPublishQueued=true;roleViewRetryCount++;lessonMetaCacheReady=false;console.error('Role view background sync failed',e);reportOperationalError(e,{category:'role-view',area:'role-publish',retryable:true});cloudStatus(roleViewRetryCount<3?'主資料已同步；老師端資料正在背景補送。':'主資料已同步，但老師端資料持續補送中，請保持網路連線。',roleViewRetryCount<3?'pending':'error');roleViewRetryTimer=setTimeout(publishRoleViewsWithRetry,Math.min(30000,1000*Math.pow(2,Math.min(roleViewRetryCount,5))))}
 finally{roleViewPublishInFlight=false;if(roleViewPublishQueued&&!roleViewRetryCount)queueMicrotask(publishRoleViewsWithRetry)}
}
async function migrateLegacyLessonCloudDocuments(){
 if(cloudRole!=='owner')return;
 let migrations=[];try{migrations=JSON.parse(localStorage.getItem('danbridge_lesson_id_migration_v15_28_3')||'[]')}catch{}
 if(!Array.isArray(migrations)||!migrations.length)return;
 const byOld=new Map();
 for(const item of migrations){
   const oldId=String(item?.oldId||''),newId=String(item?.newId||'');
   if(!oldId||!newId||oldId===newId)continue;
   if(!byOld.has(oldId))byOld.set(oldId,[]);
   byOld.get(oldId).push(item);
 }
 const normalizedTeachers=v=>(Array.isArray(v?.teacherIds)?v.teacherIds:(Array.isArray(v?.reportedForTeacherIds)?v.reportedForTeacherIds:[v?.teacherId])).filter(Boolean).map(String).sort();
 const fingerprintKey=v=>[String(v?.lessonDate||v?.date||''),String(v?.lessonStart||v?.start||''),String(v?.lessonEnd||v?.end||''),String(v?.studentId||''),normalizedTeachers(v).join(',')].join('|');
 const chooseTarget=(oldId,data)=>{
   const candidates=byOld.get(oldId)||[];
   if(candidates.length===1)return candidates[0];
   const key=fingerprintKey(data||{});
   const exact=candidates.filter(x=>String(x.fingerprintKey||'')===key);
   return exact.length===1?exact[0]:null;
 };
 const unresolved=[];
 for(const [oldId,candidates] of byOld){
   try{
     for(const col of ['lessonMeta','lessonReports']){
       const oldRef=doc(cloud,'companies',COMPANY_ID,col,oldId),snap=await getDoc(oldRef);
       if(!snap.exists())continue;
       const data=snap.data()||{},target=chooseTarget(oldId,data);
       if(!target){unresolved.push({collection:col,oldId,reason:'ambiguous-fingerprint'});continue}
       await setDoc(doc(cloud,'companies',COMPANY_ID,col,target.newId),{...data,lessonId:target.newId},{merge:false});
       await deleteDoc(oldRef);
     }

   }catch(e){console.error('Legacy lesson cloud migration failed',oldId,e);unresolved.push({oldId,reason:e?.message||String(e)})}
 }
 if(unresolved.length){
   try{localStorage.setItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3',JSON.stringify(unresolved))}catch{}
   console.warn('Lesson ID cloud migration has unresolved legacy documents',unresolved);
   return;
 }
 localStorage.removeItem('danbridge_lesson_id_migration_v15_28_3');
 localStorage.removeItem('danbridge_lesson_id_cloud_migration_issues_v15_28_3');
}


const SCHEDULE_NOTIFICATION_FIELDS=['date','start','end','studentId','title','location','room','branchId','deliveryMode','address','onlinePlatform','meetingUrl','status','lessonState','note','paymentStatus','chargeStudent','payTeacher','campId'];
const SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS=30;
const SCHEDULE_NOTIFICATION_UNREAD_RETENTION_DAYS=90;
function scheduleNotificationCreatedMillis(value){
 if(value?.toMillis)return value.toMillis();
 const parsed=new Date(value||0).getTime();return Number.isFinite(parsed)?parsed:0;
}
function scheduleNotificationExpired(notification,now=Date.now()){
 const created=scheduleNotificationCreatedMillis(notification?.createdAt);if(!created)return false;
 const days=notification?.read===true?SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS:SCHEDULE_NOTIFICATION_UNREAD_RETENTION_DAYS;
 return created<now-days*86400000;
}
async function cleanupExpiredScheduleNotifications(){
 if(scheduleNotificationCleanupStarted||cloudRole!=='owner')return;
 scheduleNotificationCleanupStarted=true;
 try{
  const oldestRead=Timestamp.fromDate(new Date(Date.now()-SCHEDULE_NOTIFICATION_READ_RETENTION_DAYS*86400000));
  const snap=await getDocs(query(collection(cloud,'companies',COMPANY_ID,'scheduleNotifications'),where('createdAt','<',oldestRead)));
  const expired=snap.docs.filter(d=>scheduleNotificationExpired(d.data())).slice(0,100);
  if(expired.length)await Promise.all(expired.map(d=>deleteDoc(d.ref)));
 }catch(e){scheduleNotificationCleanupStarted=false;console.error('Schedule notification retention cleanup failed',e);reportOperationalError(e,{category:'cloud-write',area:'notification-retention',retryable:true})}
}
function lessonFingerprintForNotification(lesson){return SCHEDULE_NOTIFICATION_FIELDS.map(k=>String(lesson?.[k]??'')).join('|')+'|'+lessonTeacherIds(lesson).slice().sort().join(',')}
function lessonDisplayName(lesson,sourceDb){
 const student=(sourceDb?.students||[]).find(s=>String(s.id)===String(lesson?.studentId));
 return String(student?.name||lesson?.studentName||lesson?.title||'未命名課程');
}
function lessonTimeLabel(lesson){return [lesson?.date,lesson?.start&&lesson?.end?`${lesson.start}–${lesson.end}`:lesson?.start||''].filter(Boolean).join(' ')}
function scheduleChangeSummary(type,before,after,sourceDb){
 const target=after||before||{};
 const student=lessonDisplayName(target,sourceDb);
 if(type==='added')return `新增：${student}｜${lessonTimeLabel(target)}`;
 if(type==='removed')return `取消：${student}｜${lessonTimeLabel(target)}`;
 const changes=[];
 if(String(before?.date||'')!==String(after?.date||''))changes.push(`日期 ${before?.date||'—'} → ${after?.date||'—'}`);
 if(String(before?.start||'')!==String(after?.start||'')||String(before?.end||'')!==String(after?.end||''))changes.push(`時間 ${(before?.start||'—')}–${(before?.end||'—')} → ${(after?.start||'—')}–${(after?.end||'—')}`);
 if(String(before?.location||'')!==String(after?.location||''))changes.push(`地點 ${before?.location||'—'} → ${after?.location||'—'}`);
 if(String(before?.branchId||'')!==String(after?.branchId||''))changes.push(`校區 ${before?.branchId||'—'} → ${after?.branchId||'—'}`);
 if(String(before?.room||'')!==String(after?.room||''))changes.push(`教室 ${before?.room||'—'} → ${after?.room||'—'}`);
 if(String(before?.deliveryMode||'')!==String(after?.deliveryMode||''))changes.push(`上課方式 ${before?.deliveryMode||'—'} → ${after?.deliveryMode||'—'}`);
 if(String(before?.address||'')!==String(after?.address||''))changes.push('到府地址已更新');
 if(String(before?.meetingUrl||'')!==String(after?.meetingUrl||''))changes.push('線上課連結已更新');
 if(String(before?.title||'')!==String(after?.title||''))changes.push(`課程 ${before?.title||'—'} → ${after?.title||'—'}`);
 if(lessonTeacherIds(before).slice().sort().join(',')!==lessonTeacherIds(after).slice().sort().join(','))changes.push('授課老師已更新');
 if(String(before?.note||'')!==String(after?.note||''))changes.push('課程備註已更新');
 if(String(before?.status||'')!==String(after?.status||''))changes.push(`狀態 ${before?.status||'—'} → ${after?.status||'—'}`);
 return `修改：${student}｜${changes.slice(0,3).join('；')||lessonTimeLabel(target)}`;
}
function buildScheduleNotificationChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before){
     for(const teacherId of lessonTeacherIds(after))changes.push({teacherId,type:'added',lessonId:id,before:null,after});
     continue;
   }
   if(lessonFingerprintForNotification(before)===lessonFingerprintForNotification(after))continue;
   const oldTeachers=new Set(lessonTeacherIds(before));
   const newTeachers=new Set(lessonTeacherIds(after));
   for(const teacherId of oldTeachers){
     if(!newTeachers.has(teacherId))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
     else changes.push({teacherId,type:'modified',lessonId:id,before,after});
   }
   for(const teacherId of newTeachers){if(!oldTeachers.has(teacherId))changes.push({teacherId,type:'added',lessonId:id,before:null,after});}
 }
 for(const [id,before] of beforeMap){
   if(afterMap.has(id))continue;
   for(const teacherId of lessonTeacherIds(before))changes.push({teacherId,type:'removed',lessonId:id,before,after:null});
 }
 return changes;
}
function buildScheduleLessonChanges(previousDb,currentDb){
 const beforeMap=new Map((previousDb?.lessons||[]).map(l=>[String(l.id),l]));
 const afterMap=new Map((currentDb?.lessons||[]).map(l=>[String(l.id),l]));
 const changes=[];
 for(const [id,after] of afterMap){
   const before=beforeMap.get(id);
   if(!before)changes.push({type:'added',lessonId:id,before:null,after});
   else if(lessonFingerprintForNotification(before)!==lessonFingerprintForNotification(after))changes.push({type:'modified',lessonId:id,before,after});
 }
 for(const [id,before] of beforeMap){if(!afterMap.has(id))changes.push({type:'removed',lessonId:id,before,after:null})}
 return changes;
}
async function createScheduleNotificationIfMissing(notificationRef,payload){
 await runTransaction(cloud,async transaction=>{
  const existing=await transaction.get(notificationRef);
  if(!existing.exists())transaction.set(notificationRef,payload);
 });
}
async function publishScheduleChangeNotifications(previousDb,currentDb,batchKey,actor={}){
 if(cloudRole!=='owner'||!previousDb)return;
 const teacherChanges=buildScheduleNotificationChanges(previousDb,currentDb);
 const lessonChanges=buildScheduleLessonChanges(previousDb,currentDb);
 if(!lessonChanges.length)return;
 const accessDocs=await getCompanyAccessDocs();
 const accessByTeacher=new Map();
 const managers=[];
 const owners=[{email:OWNER_EMAIL,role:'owner',teacherName:OWNER_DISPLAY_NAME,branchIds:[]}];
 for(const d of accessDocs){
   const a=d.data()||{};
   const email=String(a.email||d.id||'').trim().toLowerCase();
   if(a.active===false||!email)continue;
   if(a.role==='owner'){
     if(!owners.some(owner=>owner.email===email))owners.push({email,role:'owner',teacherName:a.displayName||'',branchIds:[]});
     continue;
   }
   if(a.role==='branch_manager'&&Array.isArray(a.branchIds)&&a.branchIds.length){
     managers.push({email,role:'branch_manager',teacherName:a.managerName||a.teacherName||'',branchIds:a.branchIds.map(String)});
     continue;
   }
   if(a.role!=='teacher'||!a.teacherId)continue;
   const teacherId=String(a.teacherId);
   if(!accessByTeacher.has(teacherId))accessByTeacher.set(teacherId,[]);
   accessByTeacher.get(teacherId).push({email,role:'teacher',teacherName:a.teacherName||''});
 }
 const grouped=new Map();
 const addRecipientItem=(recipient,item,teacherId='')=>{
   const key=recipient.email;
   if(!grouped.has(key))grouped.set(key,{recipient,teacherId,items:new Map()});
   grouped.get(key).items.set(`${item.type}:${item.lessonId}`,item);
 };
 for(const change of teacherChanges){
   const recipients=accessByTeacher.get(String(change.teacherId))||[];
   for(const recipient of recipients)addRecipientItem(recipient,change,String(change.teacherId));
 }
 for(const change of lessonChanges){
   const affectedBranches=new Set([change.before&&lessonBranchId(change.before),change.after&&lessonBranchId(change.after)].filter(Boolean).map(String));
   for(const owner of owners)addRecipientItem(owner,change,'');
   for(const manager of managers){if(manager.branchIds.some(branchId=>affectedBranches.has(branchId)))addRecipientItem(manager,change,'')}
 }
 const jobs=[];
 for(const {recipient,teacherId,items:itemsByKey} of grouped.values()){
   if(!recipient.email)continue;
   const items=[...itemsByKey.values()];
   const safeBatch=String(batchKey||dataHash(currentDb)).replace(/[^a-zA-Z0-9_-]/g,'_');
   const safeRecipient=recipient.email.replace(/[^a-zA-Z0-9_-]/g,'_');
   const notificationRef=doc(cloud,'companies',COMPANY_ID,'scheduleNotifications',`${safeBatch}_${safeRecipient}`);
   const details=items.map(item=>({
     type:item.type,lessonId:item.lessonId,
     summary:scheduleChangeSummary(item.type,item.before,item.after,currentDb),
     studentName:lessonDisplayName(item.after||item.before,currentDb),
     beforeTime:item.before?lessonTimeLabel(item.before):'',
     afterTime:item.after?lessonTimeLabel(item.after):'',
     before:item.before?{date:item.before.date||'',start:item.before.start||'',end:item.before.end||'',studentId:item.before.studentId||'',title:item.before.title||'',location:item.before.location||'',branchId:item.before.branchId||'',deliveryMode:item.before.deliveryMode||'',room:item.before.room||'',address:item.before.address||'',onlinePlatform:item.before.onlinePlatform||'',meetingUrl:item.before.meetingUrl||'',status:item.before.status||'',note:item.before.note||'',teacherIds:lessonTeacherIds(item.before)}:null,
     after:item.after?{date:item.after.date||'',start:item.after.start||'',end:item.after.end||'',studentId:item.after.studentId||'',title:item.after.title||'',location:item.after.location||'',branchId:item.after.branchId||'',deliveryMode:item.after.deliveryMode||'',room:item.after.room||'',address:item.after.address||'',onlinePlatform:item.after.onlinePlatform||'',meetingUrl:item.after.meetingUrl||'',status:item.after.status||'',note:item.after.note||'',teacherIds:lessonTeacherIds(item.after)}:null
   })).map(item=>recipient.role==='teacher'?{...item,before:item.before?{...item.before,address:'',meetingUrl:'',note:''}:null,after:item.after?{...item.after,address:'',meetingUrl:'',note:''}:null}:item);
   const manager=recipient.role==='branch_manager',owner=recipient.role==='owner';
   jobs.push(createScheduleNotificationIfMissing(notificationRef,{companyId:COMPANY_ID,recipientEmail:recipient.email,recipientRole:recipient.role,teacherId,branchIds:manager?recipient.branchIds:[],teacherName:recipient.teacherName||'',title:'課表更新通知',message:owner?`公司課表有 ${items.length} 個變更`:manager?`您管理的校區課表有 ${items.length} 個變更`:`您的課表有 ${items.length} 個變更`,changeCount:items.length,details,read:false,createdAt:serverTimestamp(),createdBy:actor.uid||cloudUid,createdByName:actor.name||document.body.dataset.cloudDisplayName||auth.currentUser?.displayName||auth.currentUser?.email||'Owner'}));
 }
 if(jobs.length)await withSyncTimeout(Promise.all(jobs),15000);
}
function queueScheduleChangeNotifications(previousDb,currentDb,batchKey,actor={}){
 if(cloudRole!=='owner'||!previousDb)return;
 const key=String(batchKey||dataHash(currentDb));
 const job={previousDb:deepCopy(previousDb),currentDb:deepCopy(currentDb),batchKey:key,actor:{uid:actor.uid||'',name:actor.name||''},attempts:0,timer:null};
 scheduleNotificationDeliveryJobs.set(key,job);
 const deliver=async()=>{
   if(!scheduleNotificationDeliveryJobs.has(key)||cloudRole!=='owner')return;
   try{await publishScheduleChangeNotifications(job.previousDb,job.currentDb,job.batchKey,job.actor);scheduleNotificationDeliveryJobs.delete(key)}
   catch(e){job.attempts++;console.error('Schedule notification background delivery failed',e);cloudStatus(job.attempts<3?'課表已同步；老師通知正在背景補送。':'課表已同步，但老師通知持續補送中，請保持網路連線。',job.attempts<3?'pending':'error');job.timer=setTimeout(deliver,Math.min(30000,1000*Math.pow(2,Math.min(job.attempts,5))))}
 };
 deliver();
}
function installScheduleNotificationUI(){
 if(document.getElementById('scheduleNotificationModal'))return;
 const modal=document.createElement('div');
 modal.id='scheduleNotificationModal';modal.className='schedule-notification-backdrop';modal.hidden=true;
 modal.innerHTML=`<div class="schedule-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="scheduleNotificationTitle"><div class="schedule-notification-head"><div><div class="schedule-notification-eyebrow">SCHEDULE UPDATE</div><h2 id="scheduleNotificationTitle">課表更新通知</h2></div></div><div id="scheduleNotificationBody" class="schedule-notification-body"></div><div class="schedule-notification-actions"><button type="button" class="btn" id="scheduleNotificationLater">稍後查看</button><button type="button" class="btn primary" id="scheduleNotificationAcknowledge">知道了</button></div></div>`;
 document.body.appendChild(modal);
 document.getElementById('scheduleNotificationLater').onclick=()=>{modal.hidden=true};
 document.getElementById('scheduleNotificationAcknowledge').onclick=acknowledgeCurrentScheduleNotification;
}
function formatNotificationTimestamp(value){try{const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return ''}}
function renderScheduleNotification(notification){
 installScheduleNotificationUI();
 const modal=document.getElementById('scheduleNotificationModal');
 const body=document.getElementById('scheduleNotificationBody');
 if(!modal||!body||!notification)return;
 const details=Array.isArray(notification.details)?notification.details:[];
 currentScheduleNotification=notification;
 body.innerHTML=`<p class="schedule-notification-lead"><b>Daniel 已更新您的課表</b><span>${escapeHTML(notification.message||`共有 ${details.length} 個變更`)}，已合併整理如下。</span></p><div class="schedule-notification-table-wrap"><table class="schedule-notification-table"><thead><tr><th>異動</th><th>學生／課程</th><th>原課程</th><th>新課程</th><th>內容</th><th>來源</th></tr></thead><tbody>${details.map((item,index)=>`<tr data-type="${escapeHTML(item.type||'modified')}"><td><span class="schedule-notification-type">${item.type==='added'?'新增':item.type==='removed'?'取消':'修改'}</span></td><td><b>${escapeHTML(item.studentName||'課程')}</b></td><td>${escapeHTML(item.beforeTime||'—')}</td><td>${escapeHTML(item.afterTime||'—')}</td><td>${escapeHTML(item.summary||'課表內容已更新')}</td><td><button type="button" class="btn schedule-notification-source" data-notification-detail="${index}">查看課表</button></td></tr>`).join('')}</tbody></table></div><div class="schedule-notification-time">更新時間：${escapeHTML(formatNotificationTimestamp(notification.createdAt)||'剛剛')}</div>`;
 const notificationLead=body.querySelector('.schedule-notification-lead b');if(notificationLead)notificationLead.textContent=`${notification.createdByName||'Owner'} 已更新課表`;
 body.querySelectorAll('[data-notification-detail]').forEach(button=>button.addEventListener('click',()=>openScheduleNotificationSource(Number(button.dataset.notificationDetail))));
 modal.dataset.notificationId=notification.id||'';
 modal.dataset.notificationIds=JSON.stringify(Array.isArray(notification.notificationIds)?notification.notificationIds.filter(Boolean):[notification.id].filter(Boolean));
 modal.hidden=false;
}
function openScheduleNotificationSource(index){
 const detail=currentScheduleNotification?.details?.[index];if(!detail)return;
 const source=detail.after||detail.before||{},date=source.date||'';
 const input=document.getElementById('calendarDate');if(input&&date)input.value=date;
 const modal=document.getElementById('scheduleNotificationModal');if(modal)modal.hidden=true;
 window.switchTab?.('calendar');
 setTimeout(()=>{window.renderCalendar?.();if(detail.type!=='removed'&&detail.lessonId)window.editLesson?.(detail.lessonId)},40);
}
async function acknowledgeCurrentScheduleNotification(){
 const modal=document.getElementById('scheduleNotificationModal');
 let ids=[];try{ids=JSON.parse(modal?.dataset.notificationIds||'[]')}catch{}
 if(!ids.length&&modal?.dataset.notificationId)ids=[modal.dataset.notificationId];
 if(!ids.length)return;
 const button=document.getElementById('scheduleNotificationAcknowledge');
 try{
   if(button){button.disabled=true;button.textContent='處理中…'}
   if(modal)modal.hidden=true;
   await Promise.all(ids.map(id=>setDoc(doc(cloud,'companies',COMPANY_ID,'scheduleNotifications',id),{read:true,acknowledgedAt:serverTimestamp(),acknowledgedBy:cloudUid},{merge:true})));
 }catch(e){console.error('Acknowledge schedule notification failed',e);cloudStatus('通知確認失敗：'+(e?.message||e),'error')}
 finally{if(button){button.disabled=false;button.textContent='知道了'}}
}
function subscribeScheduleNotifications(){
 unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;scheduleNotificationDocuments=[];
 if(!['owner','teacher','branch_manager'].includes(cloudRole)||!cloudEmailKey)return;
 installScheduleNotificationUI();
 const q=query(collection(cloud,'companies',COMPANY_ID,'scheduleNotifications'),where('recipientEmail','==',cloudEmailKey));
 unsubscribeScheduleNotifications=onSnapshot(q,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.hasPendingWrites)return;
   scheduleNotificationDocuments=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.read!==true&&!scheduleNotificationExpired(x)).sort((a,b)=>{const at=a.createdAt?.toMillis?.()||0,bt=b.createdAt?.toMillis?.()||0;return at-bt});
   const current=scheduleNotificationDocuments[0];
   if(current&&!document.getElementById('scheduleNotificationModal')?.hidden)return;
   if(current){
     const details=scheduleNotificationDocuments.flatMap(n=>Array.isArray(n.details)?n.details:[]);
     renderScheduleNotification({...current,notificationIds:scheduleNotificationDocuments.map(n=>n.id),details,message:current.recipientRole==='owner'?`公司課表共有 ${details.length} 個變更`:current.recipientRole==='branch_manager'?`您管理的校區課表共有 ${details.length} 個變更`:`您的課表共有 ${details.length} 個變更`});
   }
 },e=>{console.error('Schedule notification listener failed',e);cloudStatus('課表通知讀取失敗：'+(e?.message||e),'error')});
}

async function uploadOwnerState(force=false){
 if(cloudRole!=='owner'||applyingCloud)return;
 ownerUploadQueued=true;
 if(ownerUploadInFlight)return;
 if(!navigator.onLine){setOfflineStatus();return}
 const current=deepCopy(window.__danbridgeGetDB());
 const previousPublished=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):(ownerRecoveryBaseDB?deepCopy(ownerRecoveryBaseDB):null);
 const currentScore=window.__danbridgeDataScore?.(current)||0;
 if(currentScore===0){cloudStatus('已阻止空白資料上傳；請先確認本機或版本紀錄中的資料。','error');ownerUploadQueued=false;return}
 const hash=dataHash(current);
 const shrink=ownerLessonShrinkRisk(previousPublished,current);
 if(shrink.risky&&approvedLessonShrinkHash!==hash){
  const approved=confirm(`安全檢查：這次同步會讓課程從 ${shrink.before} 堂減少為 ${shrink.after} 堂，共少 ${shrink.removed} 堂。\n\n如果這不是刻意的大量刪除，請按「取消」，資料將保留在本機且不會覆蓋雲端。`);
  if(!approved){ownerUploadQueued=false;cloudStatus(`已阻止大量課程減少（${shrink.removed} 堂）覆蓋雲端，請先檢查課表。`,'error');persistOwnerSyncRecovery();renderSyncRecoveryCenter();return}
  approvedLessonShrinkHash=hash;
 }
 const uploadMutationVersion=localMutationVersion;
 if(!force&&hash===lastUploadedHash){ownerUploadQueued=false;localDirtyHash='';cloudStatus('資料已是最新版本','ok');return}
 ownerUploadInFlight=true;ownerUploadQueued=false;cloudStatus('雲端同步中…','pending');
 let syncStage='主資料';
 try{
   // V15.29.2：主資料是同步成功的唯一必要條件。老師／校區檢視與舊 ID 遷移改為背景工作，
   // 避免任何附屬文件或歷史遷移卡住，讓畫面永久停在「準備同步」。
   const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main');
   const committed=await withSyncTimeout(runTransaction(cloud,async transaction=>{
     const mainSnap=await transaction.get(mainRef),remoteBefore=mainSnap.exists()?deepCopy(mainSnap.data()?.db):emptyDB(),remoteHash=mainSnap.exists()?(mainSnap.data()?.clientHash||dataHash(remoteBefore)):'';
     // 舊版恢復標記沒有保存 Base；這種情況以空 Base 做保守合併，寧可保留雙方資料與衝突備份，也不整份覆蓋遠端。
     const mergeBase=previousPublished||(localDirtyHash?emptyDB():null),baselineHash=mergeBase?dataHash(mergeBase):remoteHash;
     const mergeResult=remoteHash&&remoteHash!==baselineHash?mergeConcurrentOwnerDB(mergeBase,current,remoteBefore):{db:current,conflicts:[]};
     const finalDb=mergeResult.db,finalHash=dataHash(finalDb),immutableAudit=buildImmutableDataAudit(remoteBefore,finalDb);
     let audit=null,existingAudit=null;if(immutableAudit){immutableAudit.eventId=`data-${immutableAudit.beforeHash}-${immutableAudit.afterHash}`;audit=immutableAuditRecord(immutableAudit);existingAudit=await transaction.get(audit.ref)}
     // 所有 transaction.get 都必須在第一個寫入前完成。
     const conflictParts=mergeResult.conflicts.length?conflictBackupParts(mergeResult.conflicts):[],conflictRefs=conflictParts.map(()=>doc(collection(cloud,'companies',COMPANY_ID,'syncConflictBackups'))),backupId=conflictRefs[0]?.id||'';
     transaction.set(mainRef,{db:finalDb,updatedAt:serverTimestamp(),updatedBy:cloudUid,clientHash:finalHash},{merge:false});
     if(audit&&!existingAudit.exists())transaction.set(audit.ref,audit.payload);
     conflictRefs.forEach((ref,index)=>transaction.set(ref,{companyId:COMPANY_ID,backupId,actorUid:cloudUid,actorEmail:cloudEmailKey,baseHash:baselineHash,remoteHash,mergedHash:finalHash,conflictCount:mergeResult.conflicts.length,partIndex:index,partCount:conflictParts.length,encoding:'json',payload:conflictParts[index],createdAt:serverTimestamp(),release:APP_RELEASE,environment:DANBRIDGE_ENVIRONMENT},{merge:false}));
     return{remoteBefore,finalDb,finalHash,conflicts:mergeResult.conflicts.length};
   }),10000);
   const latestLocal=deepCopy(window.__danbridgeGetDB()),latestDb=uploadMutationVersion===localMutationVersion?committed.finalDb:mergeConcurrentOwnerDB(current,latestLocal,committed.finalDb).db;
   applyingCloud=true;window.__danbridgeSetDB(deepCopy(latestDb));persistCurrentLocalView();window.renderAll?.();applyingCloud=false;
   lastUploadedHash=committed.finalHash;lastCloudSnapshotHash=committed.finalHash;approvedLessonShrinkHash='';ownerRetryCount=0;
   const latestHash=dataHash(window.__danbridgeGetDB());
   const confirmation=ownerUploadConfirmation(uploadMutationVersion,localMutationVersion,committed.finalHash,latestHash);
   if(confirmation.clearDirty){localDirtyHash='';clearOwnerSyncRecovery()}else persistOwnerSyncRecovery();
   if(confirmation.queueNext)ownerUploadQueued=true;
   cloudStatus(localDirtyHash?'目前變更已同步，另有新變更準備同步…':committed.conflicts?`已安全合併同步；${committed.conflicts} 個同筆衝突已保留復原紀錄`:'已同步到雲端','ok');

   // 主資料成功後立即發布各角色檢視，不等待通知文件完成。
   publishRoleViewsWithRetry(committed.finalDb);

   queueScheduleChangeNotifications(committed.remoteBefore,committed.finalDb,committed.finalHash);
   lastPublishedOwnerDB=deepCopy(committed.finalDb);ownerBaselineReady=true;
   scheduleDailyCloudBackup();renderSyncRecoveryCenter();
   if(!legacyMigrationStarted){
     legacyMigrationStarted=true;
     migrateLegacyLessonCloudDocuments().catch(e=>console.error('Legacy lesson migration background task failed',e));
   }
 }catch(e){
   console.error('Owner cloud sync failed at '+syncStage,e);reportOperationalError(e,{category:'cloud-write',area:'owner-upload',retryable:true});ownerUploadQueued=true;ownerRetryCount++;
   const retrying=navigator.onLine&&ownerRetryCount<3;
   cloudStatus((navigator.onLine?`雲端連線較慢（${syncStage}），系統正在自動重試：`:'目前離線，變更已保存在本機：')+(e.message||e),navigator.onLine?(retrying?'pending':'error'):'offline');
   persistOwnerSyncRecovery();renderSyncRecoveryCenter();
   scheduleOwnerRetry();
 }finally{
   ownerUploadInFlight=false;
   if(ownerUploadQueued&&navigator.onLine){clearTimeout(syncTimer);if(ownerRetryCount)scheduleOwnerRetry();else syncTimer=setTimeout(()=>uploadOwnerState(),80);}
 }
}
function queueOwnerCloudSave(){
 if(cloudRole!=='owner')return;
 if(!localDirtyHash)ownerRecoveryBaseDB=lastPublishedOwnerDB?deepCopy(lastPublishedOwnerDB):null;
 localMutationVersion++;
 localDirtyHash=dataHash(window.__danbridgeGetDB());
 persistOwnerSyncRecovery();
 ownerUploadQueued=true;
 cloudStatus(navigator.onLine?'變更已儲存，準備同步…':'變更已保存在本機；恢復網路後自動同步。',navigator.onLine?'pending':'offline');
 clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),120);
}
function lessonMap(rows=[]){return new Map(rows.map(row=>[String(row.id),row]))}
async function queueSchedulerChanges(){
 if(!cloudCanManageSchedule||applyingCloud)return;
 if(schedulerRecoveryHold){cloudStatus('已進入 aa 救援唯讀鎖定；確認恢復來源前不會上傳或覆蓋資料','pending');return}
 const current=(window.__danbridgeGetDB?.().lessons||[]).map(schedulerSafeLesson),before=lessonMap(schedulerBaselineLessons),after=lessonMap(current),jobs=[];
 for(const id of new Set([...before.keys(),...after.keys()])){
   const old=before.get(id),next=after.get(id);if(JSON.stringify(old)===JSON.stringify(next))continue;
   const operation=!old?'create':!next?'delete':'update',lesson=next||old,ref=doc(collection(cloud,'companies',COMPANY_ID,'scheduleRequests'));
   const student=operation!=='delete'?schedulerSafeStudent((window.__danbridgeGetDB?.().students||[]).find(s=>String(s.id)===String(lesson.studentId))||{}):undefined;
   jobs.push({id,next,ref,payload:{companyId:COMPANY_ID,operation,lessonId:id,lesson,...(student?.id?{student}:{}),actorUid:cloudUid,actorEmail:cloudEmailKey,createdAt:serverTimestamp(),status:'pending'}});
 }
 if(!jobs.length)return;
 cloudStatus(`aa 排課異動正在逐筆安全送出，共 ${jobs.length} 筆…`,'pending');const progress=lessonMap(schedulerBaselineLessons);let sent=0;
 for(const job of jobs){
  try{await setDoc(job.ref,job.payload,{merge:false})}
  catch(e){schedulerUploadRetryCount++;const wait=Math.min(30000,1000*2**Math.min(schedulerUploadRetryCount,5));clearTimeout(schedulerUploadRetryTimer);schedulerUploadRetryTimer=setTimeout(()=>scheduleSchedulerChanges(),wait);schedulerBaselineLessons=[...progress.values()];persistCurrentLocalView();cloudStatus(`aa 已送出 ${sent} 筆，剩餘 ${jobs.length-sent} 筆於 ${Math.ceil(wait/1000)} 秒後自動續傳：`+(e.message||e),'pending');return}
  if(job.next)progress.set(job.id,deepCopy(job.next));else progress.delete(job.id);schedulerBaselineLessons=[...progress.values()];sent++;persistCurrentLocalView();cloudStatus(`aa 課表續傳中：已送出 ${sent} / ${jobs.length} 筆`,'pending');
 }
 schedulerUploadRetryCount=0;clearTimeout(schedulerUploadRetryTimer);window.renderAll?.();cloudStatus(`課表已立即更新，${sent} 筆異動正在同步給 Owner、校區管理者與老師`,'ok');
}
function scheduleSchedulerChanges(){
 const local=window.__danbridgeGetDB?.()||{},current=(local.lessons||[]).map(schedulerSafeLesson),before=lessonMap(schedulerBaselineLessons),after=lessonMap(current),beforeStudents=lessonMap(schedulerBaselineStudents),afterStudents=lessonMap((local.students||[]).map(schedulerSafeStudent));
 for(const id of new Set([...before.keys(),...after.keys()]))if(JSON.stringify(before.get(id))!==JSON.stringify(after.get(id)))schedulerOptimisticLessons.set(id,after.get(id)||null);
 for(const id of new Set([...beforeStudents.keys(),...afterStudents.keys()]))if(JSON.stringify(beforeStudents.get(id))!==JSON.stringify(afterStudents.get(id)))schedulerOptimisticStudents.set(id,afterStudents.get(id)||null);
 schedulerSaveChain=schedulerSaveChain.catch(()=>{}).then(queueSchedulerChanges);
 return schedulerSaveChain;
}
async function applySchedulerRequest(requestRef,data){
 if(cloudRole!=='owner'||data?.status!=='pending')return;
 const mainRef=doc(cloud,'companies',COMPANY_ID,'data','main'),schedulerViewRef=doc(cloud,'companies',COMPANY_ID,'schedulerViews',String(data.actorEmail||'').trim().toLowerCase());
 let notificationBefore=null,notificationAfter=null;
 await runTransaction(cloud,async transaction=>{
   const [requestSnap,mainSnap,schedulerViewSnap]=await Promise.all([transaction.get(requestRef),transaction.get(mainRef),transaction.get(schedulerViewRef)]);if(!requestSnap.exists()||requestSnap.data()?.status!=='pending'||!mainSnap.exists())return;
   const before=deepCopy(mainSnap.data()?.db),after=deepCopy(before),id=String(data.lessonId||''),index=(after.lessons||[]).findIndex(l=>String(l.id)===id),lesson=schedulerSafeLesson(data.lesson||{});
   if(!id||String(lesson.id||'')!==id)throw new Error('排課異動 ID 不一致');
   const alreadyApplied=data.operation==='delete'?index<0:index>=0&&JSON.stringify(schedulerSafeLesson(after.lessons[index]))===JSON.stringify(lesson);
   if(alreadyApplied){transaction.set(requestRef,{status:'applied',appliedAt:serverTimestamp(),appliedBy:cloudUid},{merge:true});return}
   if(data.operation==='delete'){if(index>=0)after.lessons.splice(index,1)}
   else {if(!(after.students||[]).some(s=>String(s.id)===String(lesson.studentId))){const requestStudent=schedulerSafeStudent(data.student||{}),viewStudent=schedulerSafeStudent((schedulerViewSnap.data()?.db?.students||[]).find(s=>String(s.id)===String(lesson.studentId))||{}),student=requestStudent.id?requestStudent:viewStudent,unchangedOrphanStudent=data.operation==='update'&&index>=0&&String(after.lessons[index]?.studentId||'')===String(lesson.studentId||''),approvedLegacyCreate=data.operation==='create'&&SCHEDULER_ACCOUNT_EMAILS.has(String(data.actorEmail||'').trim().toLowerCase())&&String(lesson.studentId||'');if(student.id===String(lesson.studentId)&&String(student.name||'').trim())after.students.push({...student,billing:'hour',rate:0,note:''});else if(approvedLegacyCreate)after.students.push({id:String(lesson.studentId),name:'待補學生資料',status:'在讀',courseType:'1對1',branchIds:lesson.branchId?[String(lesson.branchId)]:[],billing:'hour',rate:0,note:'由舊版 aa 待同步課程保留，請 Owner 補正學生姓名與資料'});else if(!unchangedOrphanStudent)throw new Error('排課異動包含不存在的學生')}if(!lessonTeacherIds(lesson).every(tid=>(after.teachers||[]).some(t=>String(t.id)===tid)))throw new Error('排課異動包含不存在的老師');if(index>=0)after.lessons[index]={...after.lessons[index],...lesson};else after.lessons.push({...lesson,paymentStatus:'unpaid',chargeStudent:'yes',payTeacher:'yes',note:''})}
   notificationBefore=before;notificationAfter=after;
   const audit=buildImmutableDataAudit(before,after),auditRecord=audit?(()=>{audit.eventId=`scheduler-${requestSnap.id}`;return immutableAuditRecord(audit)})():null,auditSnap=auditRecord?await transaction.get(auditRecord.ref):null,hash=dataHash(after);transaction.set(mainRef,{db:after,updatedAt:serverTimestamp(),updatedBy:data.actorUid,clientHash:hash},{merge:false});
   if(auditRecord&&!auditSnap.exists())transaction.set(auditRecord.ref,{...auditRecord.payload,action:`scheduler-schedule-${data.operation}`,targetType:'lesson',targetId:id,entityChanges:[...auditRecord.payload.entityChanges,`requested-by:${data.actorEmail}`].slice(0,80)});
   transaction.set(requestRef,{status:'applied',appliedAt:serverTimestamp(),appliedBy:cloudUid},{merge:true});
 });
 if(notificationAfter)publishRoleViewsWithRetry(notificationAfter);
 if(notificationBefore&&notificationAfter)queueScheduleChangeNotifications(notificationBefore,notificationAfter,`scheduler-${requestRef.id}`,{uid:data.actorUid,name:SCHEDULER_ACCOUNT_EMAILS.has(String(data.actorEmail||'').toLowerCase())?'aa':'排課專員'});
}
function subscribeSchedulerRequests(){
 unsubscribeScheduleRequests?.();unsubscribeScheduleRequests=null;if(cloudRole!=='owner')return;
 const q=query(collection(cloud,'companies',COMPANY_ID,'scheduleRequests'),where('status','==','pending'));
 unsubscribeScheduleRequests=onSnapshot(q,snap=>{for(const d of snap.docs){if(schedulerRequestQueueIds.has(d.id))continue;schedulerRequestQueueIds.add(d.id);schedulerRequestQueue.push({id:d.id,ref:d.ref,data:d.data(),attempt:0})}processSchedulerRequestQueue()});
}
async function processSchedulerRequestQueue(){
 if(schedulerRequestWorkerActive||cloudRole!=='owner')return;schedulerRequestWorkerActive=true;clearTimeout(schedulerRequestRetryTimer);
 while(schedulerRequestQueue.length&&cloudRole==='owner'){
  const item=schedulerRequestQueue[0];
  try{await applySchedulerRequest(item.ref,item.data);schedulerRequestQueue.shift();schedulerRequestQueueIds.delete(item.id);schedulerAppliedRequestCount++;cloudStatus(schedulerRequestQueue.length?`aa 課表續傳中：已處理 ${schedulerAppliedRequestCount} 筆，剩餘 ${schedulerRequestQueue.length} 筆`:`雲端資料已更新：aa 課表同步完成，共處理 ${schedulerAppliedRequestCount} 筆，剩餘 0 筆`,schedulerRequestQueue.length?'pending':'ok')}
  catch(e){item.attempt++;console.error('Scheduler request failed',e);const retryable=['resource-exhausted','unavailable','aborted','deadline-exceeded','cancelled','internal','unknown'].includes(String(e?.code||'').replace(/^firestore\//,''));if(!retryable){schedulerRequestQueue.shift();schedulerQuarantinedRequestIds.add(item.id);cloudStatus(`已隔離 1 筆異常課程，繼續套用後面 ${schedulerRequestQueue.length} 筆；異常資料仍保留待修復`,'pending');continue}const wait=Math.min(30000,1000*2**Math.min(item.attempt,5));cloudStatus(`aa 排課異動暫緩，${Math.ceil(wait/1000)} 秒後自動續傳：`+(e.message||e),'pending');schedulerRequestWorkerActive=false;schedulerRequestRetryTimer=setTimeout(processSchedulerRequestQueue,wait);return}
 }
 schedulerRequestWorkerActive=false;
}
function installCloudSave(){
 window.__danbridgeQueueCloudSave=queueOwnerCloudSave;
 window.saveDB=function(options={}){
   if(cloudRole==='teacher'&&cloudCanManageSchedule){const result=originalSaveDB?.(options);scheduleSchedulerChanges().catch(e=>{console.error(e);cloudStatus('aa 排課同步失敗：'+(e.message||e),'error')});return result}
   if(cloudRole==='teacher'||cloudRole==='branch_manager'){alert(cloudRole==='teacher'?'老師帳號目前為唯讀，只能查看自己的課表。':'校區管理者目前為唯讀，只能查看指定校區資料。');return}
   return originalSaveDB?.(options);
 };
}
function subscribeOwner(){
 const ref=doc(cloud,'companies',COMPANY_ID,'data','main');
 unsubscribeState?.();
 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},async snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   const localBest=window.__danbridgeRecoverBestLocalDB?.();
   if(!snap.exists()){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));window.renderAll?.();applyingCloud=false;
       cloudStatus('雲端尚無資料，已載入 '+localBest.label+'，正在建立雲端資料…');
       await uploadOwnerState();
     }else cloudStatus('雲端尚無資料，且這台裝置找不到可恢復的資料。','error');
     return;
   }
   const incoming=snap.data()?.db;
   const incomingHash=snap.data()?.clientHash||dataHash(incoming);
   const incomingScore=window.__danbridgeDataScore?.(incoming)||0;
   if(!incoming||incomingScore===0){
     if(localBest){
       applyingCloud=true;window.__danbridgeSetDB(deepCopy(localBest.db));
       try{localStorage.setItem('danbridge_scheduler_v1',JSON.stringify(window.__danbridgeGetDB()))}catch{}
       window.renderAll?.();applyingCloud=false;
       cloudStatus('偵測到空白雲端資料，已從 '+localBest.label+' 恢復並重新同步…','error');
       await uploadOwnerState();
     }else cloudStatus('雲端資料為空，這台裝置也找不到可恢復版本；系統沒有再寫入空資料。','error');
     return;
   }
   if(snap.metadata.hasPendingWrites)return;
   cleanupExpiredScheduleNotifications();
   const currentHash=dataHash(window.__danbridgeGetDB());
   // 本機尚有未確認上傳的修改時，任何不同版本的遠端快照都視為舊資料。
   // 這可防止拖曳、編輯或批次操作在 debounce / 網路延遲期間被倒灌復原。
   const snapshotDecision=ownerSnapshotDecision(localDirtyHash,incomingHash,currentHash,lastCloudSnapshotHash);
   if(snapshotDecision==='ignore-dirty'){
     cloudStatus('本機變更等待雲端確認，已忽略較舊的雲端資料…','pending');
     if(!ownerUploadInFlight){clearTimeout(syncTimer);syncTimer=setTimeout(()=>uploadOwnerState(),80);}
     return;
   }
   if(snapshotDecision==='unchanged'){publishRoleViewsWithRetry(incoming);return}
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   lastCloudSnapshotHash=incomingHash;lastUploadedHash=incomingHash;
   lastPublishedOwnerDB=deepCopy(incoming);ownerBaselineReady=true;
   if(localDirtyHash===incomingHash){localDirtyHash='';clearOwnerSyncRecovery()}
   scheduleDailyCloudBackup();renderSyncRecoveryCenter();
   publishRoleViewsWithRetry(incoming);
   cloudStatus(`雲端資料已更新：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{console.error('owner snapshot',err);reportOperationalError(err,{category:'cloud-read',area:'owner-snapshot',retryable:true});cloudStatus('讀取雲端主資料失敗：'+(err.message||err),'error')});
}
async function subscribeTeacher(){
 if(!cloudTeacherId)throw new Error('老師帳號尚未綁定 teacherId。');
 if(!cloudEmailKey)throw new Error('無法取得老師 Gmail。');
 // 老師檢視以 Gmail 作為文件 ID：老闆可在老師首次登入前就建立與更新。
 const ref=doc(cloud,'companies',COMPANY_ID,'teacherViews',cloudEmailKey);
 unsubscribeState?.();

 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     const best=window.__danbridgeRecoverBestLocalDB?.();
     if(best){applyingCloud=true;window.__danbridgeSetDB(filteredTeacherDB(best.db,cloudTeacherId));window.renderAll?.();applyingCloud=false;}
     cloudStatus('尚未建立這位老師的課表檢視；已保留最後可用資料，請老闆登入重新發布。','error');
     return;
   }
   const raw=snap.data()?.db||emptyDB();
   if((window.__danbridgeDataScore?.(raw)||0)===0){cloudStatus('老師課表檢視為空；已保留最後可用資料。','error');return;}
   // 前端再次依 teacherId 過濾，防止舊檢視夾帶其他老師資料。
   const incoming=filteredTeacherDB(raw,cloudTeacherId);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus('老師課表已同步','ok');
 },err=>{
   console.error('讀取老師課表失敗',err);
   reportOperationalError(err,{category:'cloud-read',area:'teacher-view',retryable:true});
   cloudStatus('讀取老師課表失敗：'+(err.message||err),'error');
 });
}

async function subscribeSchedulerTeacher(){
 if(!cloudTeacherId||!cloudEmailKey)throw new Error('aa 排課帳號尚未完成綁定。');
 const ref=doc(cloud,'companies',COMPANY_ID,'schedulerViews',cloudEmailKey);unsubscribeState?.();
 unsubscribeState=onSnapshot(ref,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.hasPendingWrites)return;const view=snap.data()||{},raw=view.db;
   if(!raw)return cloudStatus('排課專員資料尚未發布，請 Owner 重新儲存帳號權限。','error');
   showSchedulerRecoveryInspector();const incoming=filteredSchedulerDB(raw),serverLessons=lessonMap(incoming.lessons),serverStudents=lessonMap(incoming.students),serverBaselineLessons=deepCopy(incoming.lessons),serverBaselineStudents=deepCopy(incoming.students);let recoveredAtStartup=false;
   if(!schedulerStartupRecoveryChecked){schedulerStartupRecoveryChecked=true;const local=filteredSchedulerDB(window.__danbridgeGetDB?.()||emptyDB()),localLessons=lessonMap(local.lessons),localStudents=lessonMap(local.students);for(const [id,row] of localLessons)if(JSON.stringify(serverLessons.get(id))!==JSON.stringify(row)){schedulerOptimisticLessons.set(id,deepCopy(row));recoveredAtStartup=true}for(const [id,row] of localStudents)if(JSON.stringify(serverStudents.get(id))!==JSON.stringify(row)){schedulerOptimisticStudents.set(id,deepCopy(row));recoveredAtStartup=true}if(recoveredAtStartup)schedulerRecoveryHold=true}
   for(const [id,desired] of [...schedulerOptimisticLessons]){
    const server=serverLessons.get(id);
    if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticLessons.delete(id);continue}
    if(desired===null)serverLessons.delete(id);else serverLessons.set(id,deepCopy(desired));
   }
   for(const [id,desired] of [...schedulerOptimisticStudents]){
    const server=serverStudents.get(id);
    if((desired===null&&!server)||(desired&&JSON.stringify(server)===JSON.stringify(desired))){schedulerOptimisticStudents.delete(id);continue}
    if(desired===null)serverStudents.delete(id);else serverStudents.set(id,deepCopy(desired));
   }
   incoming.lessons=[...serverLessons.values()];incoming.students=[...serverStudents.values()];schedulerBaselineLessons=recoveredAtStartup?serverBaselineLessons:deepCopy(incoming.lessons);schedulerBaselineStudents=recoveredAtStartup?serverBaselineStudents:deepCopy(incoming.students);applyingCloud=true;window.__danbridgeSetDB(deepCopy(incoming));applyCachedLessonReportsToCurrentDB();persistCurrentLocalView();window.renderAll?.();applyingCloud=false;cloudStatus(schedulerRecoveryHold?'發現 aa 本機與雲端不一致，已唯讀鎖定；請先檢查本機救援資料':'aa 全老師課表已同步',schedulerRecoveryHold?'pending':'ok');
 },e=>{console.error('Scheduler view failed',e);cloudStatus('aa 課表同步失敗：'+(e.message||e),'error')});
}

function revokeCurrentRoleAccess(message){
 applyingCloud=true;window.__danbridgeSetDB(emptyDB());window.renderAll?.();applyingCloud=false;
 cloudStatus(message,'error');setTimeout(()=>signOut(auth).catch(e=>console.error('forced role sign-out failed',e)),0);
}
function subscribeRoleAccessGuard(){
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(cloudRole==='owner'||!cloudEmailKey)return;
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeAccessGuard=onSnapshot(accessRef,snap=>{
   const access=snap.exists()?snap.data()||{}:null;
   const valid=!!access&&access.active===true&&access.companyId===COMPANY_ID&&roleAccessSignature(access)===cloudRoleAccessSignature;
   if(!valid)revokeCurrentRoleAccess('此帳號權限已被移除或變更，系統已安全登出。');
 },e=>{console.error('role access guard failed',e);reportOperationalError(e,{category:'cloud-read',area:'access-guard',retryable:true});cloudStatus('權限狀態暫時無法確認，系統正在重新連線。','pending')});
}

async function subscribeBranchManager(){
 if(!cloudEmailKey||!cloudBranchIds.length)throw new Error('校區管理者尚未綁定校區。');
 unsubscribeState?.();
 // 直接監聽自己的 companyAccess 文件。此路徑同時保存角色與 scopedDb，
 // 不需要另外部署 branchViews Firestore 規則。
 const accessRef=doc(cloud,'companyAccess',cloudEmailKey);
 unsubscribeState=onSnapshot(accessRef,{includeMetadataChanges:true},snap=>{
   if(snap.metadata.fromCache&&!navigator.onLine)setOfflineStatus();
   if(snap.metadata.hasPendingWrites)return;
   if(!snap.exists()){
     cloudStatus('校區管理權限已被移除，請聯絡 Owner。','error');
     return;
   }
   const access=snap.data()||{};
   if(access.active===false){cloudStatus('校區管理者帳號已停用。','error');return}
   const latestBranchIds=Array.isArray(access.branchIds)&&access.branchIds.length?access.branchIds:cloudBranchIds;
   cloudBranchIds=latestBranchIds;
   cloudTeacherId=access.teacherId||cloudTeacherId||'';
   window.DanbridgeAccess?.setContext({role:'branch_manager',branchIds:cloudBranchIds,teacherId:cloudTeacherId,email:cloudEmailKey,readOnly:true,canSubmitOwnReports:true});
   const raw=access.scopedDb;
   if(!raw){
     cloudStatus('校區資料尚未發布；請 Owner 登入並儲存一次資料。','error');
     return;
   }
   const incoming=filteredBranchDB(raw,cloudBranchIds);
   applyingCloud=true;
   window.__danbridgeSetDB(deepCopy(incoming));
   applyCachedLessonReportsToCurrentDB();
   persistCurrentLocalView();
   window.renderAll?.();
   requestAnimationFrame(()=>window.renderDashboard?.());
   setTimeout(()=>window.renderDashboard?.(),150);
   applyingCloud=false;
   cloudStatus(`校區資料已同步：學生 ${incoming.students?.length||0}、老師 ${incoming.teachers?.length||0}、課程 ${incoming.lessons?.length||0}`,'ok');
 },err=>{
   console.error('讀取校區權限資料失敗',err);
   reportOperationalError(err,{category:'cloud-read',area:'branch-view',retryable:true});
   cloudStatus('讀取校區資料失敗：'+(err.message||err),'error');
 });
}



window.addEventListener('offline',()=>setOfflineStatus());
window.addEventListener('online',()=>{cloudStatus('網路已恢復，正在檢查待同步變更…','pending');if(cloudRole==='owner'){ownerUploadQueued=true;clearTimeout(ownerRetryTimer);uploadOwnerState();scheduleDailyCloudBackup();renderSyncRecoveryCenter()}else cloudStatus('網路已恢復，正在重新連線…','pending')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloudRole==='owner'&&ownerUploadQueued&&navigator.onLine)uploadOwnerState()});

setAuthCard();
installCloudSave();
installTeacherReportUI();
installClassFocusMode();
installBranchManagerAccessEvents();
installRoleInteractionGuards();
onAuthStateChanged(auth,async user=>{
 unsubscribeState?.();unsubscribeState=null;unsubscribeReports?.();unsubscribeReports=null;unsubscribeScheduleNotifications?.();unsubscribeScheduleNotifications=null;unsubscribeScheduleRequests?.();unsubscribeScheduleRequests=null;scheduleNotificationDocuments=[];lessonReportDocuments=[];lessonMetaSignatureCache=new Map();lessonMetaCacheReady=false;scopedViewHashCache=new Map();roleViewPublishSourceDB=null;
 unsubscribeAccessGuard?.();unsubscribeAccessGuard=null;
 if(!user){lastPublishedOwnerDB=null;ownerBaselineReady=false;scheduleNotificationDeliveryJobs.forEach(job=>clearTimeout(job.timer));scheduleNotificationDeliveryJobs.clear();clearTimeout(roleViewRetryTimer);clearTimeout(dailyBackupTimer);clearTimeout(schedulerRequestRetryTimer);clearTimeout(schedulerUploadRetryTimer);roleViewPublishInFlight=false;roleViewPublishQueued=false;roleViewRetryCount=0;cloudRole='';cloudTeacherId='';cloudBranchIds=[];cloudCanManageSchedule=false;schedulerBaselineLessons=[];schedulerBaselineStudents=[];schedulerSaveChain=Promise.resolve();schedulerOptimisticLessons=new Map();schedulerOptimisticStudents=new Map();schedulerUploadRetryCount=0;schedulerStartupRecoveryChecked=false;schedulerRecoveryHold=false;schedulerRequestQueue=[];schedulerRequestQueueIds=new Set();schedulerQuarantinedRequestIds=new Set();schedulerAppliedRequestCount=0;schedulerRequestWorkerActive=false;cloudUid='';cloudEmailKey='';cloudRoleAccessSignature='';document.body.classList.remove('wendy-teacher-role');window.__danbridgeLessonIdMigrationAuthority=false;window.DanbridgeAccess?.setContext({role:'',branchIds:[],teacherId:'',email:'',readOnly:true,canManageSchedule:false});showCloudLogin();cloudStatus('尚未登入');return}
 try{
   cloudStatus('正在載入權限…');const profile=await ensureProfile(user);try{await recordSuccessfulLogin(user,profile)}catch(e){console.warn('最後登入時間更新失敗：',e);reportOperationalError(e,{category:'cloud-write',area:'access-guard',retryable:true})}applyRoleUI(profile,user);showCloudApp();
   if(profile.role==='owner'){subscribeOwner();subscribeSchedulerRequests();setTimeout(()=>{renderCloudUserManager();renderBranchManagerAccess()},0)}else if(profile.role==='teacher'&&profile.canManageSchedule===true)subscribeSchedulerTeacher();else if(profile.role==='teacher')subscribeTeacher();else if(profile.role==='branch_manager')subscribeBranchManager();else throw new Error('不支援的角色：'+profile.role);subscribeRoleAccessGuard();subscribeLessonReports();subscribeScheduleNotifications();
 }catch(e){console.error(e);await signOut(auth);showCloudLogin();showCloudLoginError(e.message);cloudStatus(e.message,'error')}
});
