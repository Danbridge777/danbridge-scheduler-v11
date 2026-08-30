import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {sha256Canonical,verifyImmutableMigrationBackupManifest} from './cloud-immutable-migration-backup.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {assertRecordSyncActivationSourceLineage} from './cloud-record-sync-control.js';
import {
  buildDurableOpenRecordSyncV1WriterCurrent,
  assertHardPausedRecordSyncV1WriterCurrent,
  assertOpenRecordSyncV1WriterCurrent,
  stripRecordSyncV1WriterCurrentAudit,
  RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION,
  RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID,
} from './cloud-record-sync-v1-writer-current.js';
import {buildRecordSyncV2FreezeRequest,buildRequestedRecordSyncV2FreezeControl} from './cloud-record-sync-v2-freeze-control.js';
import {
  assertRecordSyncV1V2HardPauseTransitionReceipt,
  buildRecordSyncV1V2HardPauseTransition,
} from './cloud-record-sync-v1-v2-hard-pause-transition.js';
import {assertRecordSyncSafetyControl} from './cloud-record-sync-safety-control.js';
import {buildRecordSyncV1RawDocumentRoot} from './cloud-record-sync-v1-raw-document-root.js';
import {RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA} from './cloud-record-sync-v1-raw-document-leaf.js';
import {
  RECORD_SYNC_V1_WRITER_CURRENT_PATH,
  RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,
  RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,
} from './firebase-record-sync-v1-writer-current-adapter.js';
import {RECORD_SYNC_V1_FULL_RECORD_COLLECTION_PATH,RECORD_SYNC_V1_POST_PAUSE_SCAN_PAGE_SIZE} from './firebase-record-sync-v1-post-pause-scan-adapter.js';
import {RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_PATH} from './firebase-record-sync-v1-v2-hard-pause-adapter.js';
import {normalizeRecordSyncV2ServerTimestamp} from './firebase-record-sync-v2-server-timestamp.js';

export const STAGING_V2_READINESS_ADAPTER_SCOPE='server-only-w0-and-full-v1-shadow-readiness-to-native-hard-pause-capability-v1';
export const STAGING_V2_READINESS_ADMIN_SCOPE='wif-service-account-fixed-staging-readiness-reader-v1';
export const STAGING_V2_READINESS_BLOCKER='staging-v2-readiness-source-lineage-backup-shadow-or-w0-blocked';
export const STAGING_V2_MAIN_PATH='companies/danbridge/data/main';
export const STAGING_V2_ACTIVATION_MANIFEST_PATH=manifestHash=>`stagingRecordSyncActivationManifests/danbridge/manifests/${manifestHash}`;
export const STAGING_V2_BACKUP_PATH=backupId=>`stagingMigrationBackups/danbridge/runs/${backupId}`;

const controlFields=['schema','environment','companyId','state','activationEpoch','manifestHash','candidateEpoch','candidateRevision','candidateSealHash','legacyVersionHash','recordDataHash','roleEvidenceHash','backupId','restoreReceiptId','collectionCount','documentCount','activeCount','tombstoneCount','roleViewCount','readTakeover','writeTakeover','activatedAt'];
const safetyFields=['schema','environment','companyId','activationEpoch','state','revision','lastEventId','lastEventHash','readAllowed','writeAllowed','updatedAt'];
const controlAudit=['persistedAt','activatedBy','activatedByEmail'];
const safetyAudit=['persistedAt','updatedBy','updatedByEmail'];
const backupAudit=['persistedAt','persistedBy','persistedByEmail'];
const expectedProject='danbridge-d8877-staging';
const encoder=new TextEncoder();

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=d.value}return out}
function deepFreeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error('readiness value contains unsafe descriptor');deepFreeze(d.value,seen)}return Object.freeze(value)}
function valueOf(snapshot){if(snapshot==null)return null;if(typeof snapshot.exists==='function')return snapshot.exists()?snapshot.data():null;return snapshot}
function strip(value,fields,audits,label){if(!plain(value))throw new Error(label+' invalid');const keys=Reflect.ownKeys(value),count=audits.filter(key=>keys.includes(key)).length;if(count!==audits.length||keys.length!==fields.length+audits.length||keys.some(key=>typeof key!=='string'||![...fields,...audits].includes(key)))throw new Error(label+' exact server audit blocked');const out={};for(const key of fields){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error(label+'.'+key+' accessor blocked');out[key]=d.value}return out}
function timestampTag(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('readiness raw updatedAt timestamp blocked');const seconds=value.seconds,nanoseconds=value.nanoseconds;if(!Number.isSafeInteger(seconds)||!Number.isSafeInteger(nanoseconds)||nanoseconds<0||nanoseconds>999999999)throw new Error('readiness raw updatedAt timestamp blocked');return{schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds:String(seconds),nanoseconds}}
function rawRow(snapshot){const id=typeof snapshot?.id==='string'?snapshot.id:snapshot?.documentId,data=typeof snapshot?.data==='function'?snapshot.data():snapshot?.data;if(typeof id!=='string'||!plain(data))throw new Error('readiness raw Firestore document blocked');const out={};for(const key of Reflect.ownKeys(data)){const d=Object.getOwnPropertyDescriptor(data,key);if(typeof key!=='string'||!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error('readiness raw Firestore document accessor blocked');out[key]=key==='updatedAt'?timestampTag(d.value):d.value}return{documentId:id,data:out}}
function compareUtf8(left,right){const a=encoder.encode(left),b=encoder.encode(right),length=Math.min(a.length,b.length);for(let index=0;index<length;index++)if(a[index]!==b[index])return a[index]-b[index];return a.length-b.length}
function backupCore(value){if(!plain(value))throw new Error('readiness backup missing');const out={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string'||backupAudit.includes(key))continue;const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error('readiness backup accessor blocked');out[key]=d.value}return out}
function normalizedLineageAudit(value,label){if(!plain(value))throw new Error(label+' invalid');const out={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw new Error(label+' symbol blocked');const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.prototype.hasOwnProperty.call(d,'value'))throw new Error(label+'.'+key+' accessor blocked');out[key]=key==='persistedAt'&&typeof d.value!=='string'?normalizeRecordSyncV2ServerTimestamp(d.value):d.value}return out}
function manifestContext(raw){const value=exact(raw,['manifest','phase','step','priorStepCapabilities','phaseStepCapabilities'],'readiness context');if(value.phase!=='READINESS'||value.step!=='READINESS_CHECK'||!plain(value.manifest)||value.manifest.projectId!==expectedProject)throw new Error(STAGING_V2_READINESS_BLOCKER);return value.manifest}
function ids(requestHash){if(typeof requestHash!=='string'||!/^[a-f0-9]{64}$/.test(requestHash))throw new Error(STAGING_V2_READINESS_BLOCKER);return{freezeId:'freeze:'+requestHash.slice(0,32),targetV2Epoch:'v2:'+requestHash.slice(32)}}

export function createStagingV2ReadinessAdapter({getDocumentFromServer,getCollectionPageFromServer,expectedProjectId=expectedProject}={}){
 if(typeof getDocumentFromServer!=='function'||typeof getCollectionPageFromServer!=='function'||expectedProjectId!==expectedProject)throw new Error(STAGING_V2_READINESS_BLOCKER);
 async function readSource(){
  const [controlSnapshot,safetySnapshot,writerSnapshot]=await Promise.all([getDocumentFromServer(RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH),getDocumentFromServer(RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH),getDocumentFromServer(RECORD_SYNC_V1_WRITER_CURRENT_PATH)]),controlRaw=valueOf(controlSnapshot),safetyRaw=valueOf(safetySnapshot),writerRaw=valueOf(writerSnapshot),control=strip(controlRaw,controlFields,controlAudit,'readiness control'),safety=strip(safetyRaw,safetyFields,safetyAudit,'readiness safety'),manifestRaw=valueOf(await getDocumentFromServer(STAGING_V2_ACTIVATION_MANIFEST_PATH(control.manifestHash))),lineage=assertRecordSyncActivationSourceLineage({manifest:normalizedLineageAudit(manifestRaw,'readiness activation manifest'),control:normalizedLineageAudit(controlRaw,'readiness activation control'),expectedManifestHash:control.manifestHash});
  if(lineage.controlCoreHash!==sha256Canonical(control)||lineage.controlCore.activationEpoch!==safety.activationEpoch)throw new Error(STAGING_V2_READINESS_BLOCKER);
  return{control,safety,writerRaw,manifestCore:lineage.manifestCore,readCount:4};
 }
 async function resolveWriterSource(source){
  const sourceExpected=safetyControl=>({recordSyncControl:source.control,safetyControl,writerGeneration:1,minClientProtocolVersion:RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION,minClientReleaseId:RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID,createdAt:safetyControl.updatedAt});
  if(source.writerRaw===null){
   assertRecordSyncSafetyControl(source.safety,{environment:'staging',activationEpoch:source.control.activationEpoch});
   if(source.safety.state!=='active')throw new Error(STAGING_V2_READINESS_BLOCKER);
   const expected=sourceExpected(source.safety);
   return{state:'open-required',writerCurrent:buildDurableOpenRecordSyncV1WriterCurrent(expected),safetyControl:source.safety,sourceExpected:expected,readCount:source.readCount,currentWriter:null,currentSafety:source.safety,receipt:null};
  }
  const currentWriter=stripRecordSyncV1WriterCurrentAudit(source.writerRaw);
  if(currentWriter.state==='open'){
   assertRecordSyncSafetyControl(source.safety,{environment:'staging',activationEpoch:source.control.activationEpoch});
   if(source.safety.state!=='active')throw new Error(STAGING_V2_READINESS_BLOCKER);
   const expected=sourceExpected(source.safety),writerCurrent=buildDurableOpenRecordSyncV1WriterCurrent(expected);
   assertOpenRecordSyncV1WriterCurrent(currentWriter,writerCurrent);
   return{state:'open-replay',writerCurrent,safetyControl:source.safety,sourceExpected:expected,readCount:source.readCount,currentWriter,currentSafety:source.safety,receipt:null};
  }
  assertHardPausedRecordSyncV1WriterCurrent(currentWriter);
  assertRecordSyncSafetyControl(source.safety,{environment:'staging',activationEpoch:source.control.activationEpoch});
  if(source.safety.state!=='paused')throw new Error(STAGING_V2_READINESS_BLOCKER);
  const receiptRaw=valueOf(await getDocumentFromServer(RECORD_SYNC_V1_V2_HARD_PAUSE_RECEIPT_PATH(currentWriter.activationEpoch,currentWriter.currentFreezeId))),receipt=assertRecordSyncV1V2HardPauseTransitionReceipt(receiptRaw);
  if(receipt.activationEpoch!==currentWriter.activationEpoch||receipt.freezeId!==currentWriter.currentFreezeId||receipt.freezeRequestHash!==currentWriter.currentFreezeRequestHash||receipt.requestedFreezeControlHash!==currentWriter.currentFreezeControlHash||receipt.receiptHash!==currentWriter.lastTransitionHash||receipt.pausedSafetyRevision!==source.safety.revision||receipt.legacySafetyPauseEventId!==source.safety.lastEventId||receipt.legacySafetyPauseEventHash!==source.safety.lastEventHash||receipt.createdAt!==source.safety.updatedAt||currentWriter.safetyRevision!==source.safety.revision||currentWriter.safetyLastEventHash!==source.safety.lastEventHash)throw new Error(STAGING_V2_READINESS_BLOCKER);
  const safetyControl={schema:source.safety.schema,environment:source.safety.environment,companyId:source.safety.companyId,activationEpoch:source.safety.activationEpoch,state:'active',revision:receipt.sourceSafetyRevision,lastEventId:receipt.sourceSafetyLastEventId,lastEventHash:receipt.sourceSafetyLastEventHash,readAllowed:true,writeAllowed:true,updatedAt:receipt.createdAt};
  assertRecordSyncSafetyControl(safetyControl,{environment:'staging',activationEpoch:source.control.activationEpoch});
  const expected=sourceExpected(safetyControl),writerCurrent=buildDurableOpenRecordSyncV1WriterCurrent(expected);
  if(receipt.sourceWriterRevision!==writerCurrent.revision||receipt.sourceWriterControlHash!==writerCurrent.controlHash)throw new Error(STAGING_V2_READINESS_BLOCKER);
  return{state:'hard-paused-replay',writerCurrent,safetyControl,sourceExpected:expected,readCount:source.readCount+1,currentWriter,currentSafety:source.safety,receipt};
 }
 async function collectionRows(collectionName){const path=RECORD_SYNC_V1_FULL_RECORD_COLLECTION_PATH(collectionName),result=[];let afterId=null;for(;;){const snapshot=await getCollectionPageFromServer(path,{afterId,pageSize:RECORD_SYNC_V1_POST_PAUSE_SCAN_PAGE_SIZE}),docs=Array.isArray(snapshot)?snapshot:snapshot?.docs;if(!Array.isArray(docs)||docs.length>RECORD_SYNC_V1_POST_PAUSE_SCAN_PAGE_SIZE)throw new Error(STAGING_V2_READINESS_BLOCKER);const page=docs.map(rawRow);for(const row of page){if(afterId!==null&&compareUtf8(row.documentId,afterId)<=0||result.length&&compareUtf8(row.documentId,result.at(-1).documentId)<=0)throw new Error(STAGING_V2_READINESS_BLOCKER);result.push(row);afterId=row.documentId}if(page.length<RECORD_SYNC_V1_POST_PAUSE_SCAN_PAGE_SIZE)return result;if(page.length===0)throw new Error(STAGING_V2_READINESS_BLOCKER)}}
 async function seedInput(){const source=await readSource(),resolved=await resolveWriterSource(source);return deepFreeze({state:resolved.state,input:{writerCurrent:resolved.writerCurrent,sourceExpected:resolved.sourceExpected},readCount:resolved.readCount,writeCount:0})}
 return Object.freeze({scope:STAGING_V2_READINESS_ADAPTER_SCOPE,seedInput,async readinessCheck(rawContext){const manifest=manifestContext(rawContext),source=await readSource();if(source.writerRaw===null)throw new Error('STAGING_V2_W0_REQUIRED');const resolved=await resolveWriterSource(source),writerCurrent=resolved.writerCurrent;const [mainSnapshot,backupSnapshot,entries]=await Promise.all([getDocumentFromServer(STAGING_V2_MAIN_PATH),getDocumentFromServer(STAGING_V2_BACKUP_PATH(source.control.backupId)),Promise.all(FULL_RECORD_COLLECTIONS.map(async collectionName=>[collectionName,await collectionRows(collectionName)]))]),main=valueOf(mainSnapshot),backup=backupCore(valueOf(backupSnapshot));if(!plain(main)||!plain(main.db)||main.clientHash!==source.control.legacyVersionHash||recordDataHash(main.db)!==source.control.recordDataHash)throw new Error(STAGING_V2_READINESS_BLOCKER);verifyImmutableMigrationBackupManifest(backup,{currentSourceHash:sha256Canonical(main.db)});if(backup.backupId!==source.control.backupId||backup.sourceVersionHash!==source.control.legacyVersionHash)throw new Error(STAGING_V2_READINESS_BLOCKER);const root=buildRecordSyncV1RawDocumentRoot({documentsByCollection:Object.fromEntries(entries)}).manifest;if(root.documentCount!==source.control.documentCount||root.activeCount!==source.control.activeCount||root.tombstoneCount!==source.control.tombstoneCount||root.unauditedCount!==0)throw new Error(STAGING_V2_READINESS_BLOCKER);const identity=ids(manifest.requestHash),request=buildRecordSyncV2FreezeRequest({environment:'staging',companyId:'danbridge',freezeId:identity.freezeId,activationEpoch:writerCurrent.activationEpoch,sourceWriterGeneration:writerCurrent.writerGeneration,targetWriterGeneration:writerCurrent.writerGeneration+1,targetV2Epoch:identity.targetV2Epoch,sourceWriterControlHash:writerCurrent.controlHash,minClientProtocolVersion:writerCurrent.minClientProtocolVersion,minClientReleaseId:writerCurrent.minClientReleaseId,rulesetHash:manifest.rulesetHash,preflightRecordDataHash:source.control.recordDataHash,preflightRawDocumentRoot:root.rawDocumentRootHash,preflightBackupId:backup.backupId,preflightBackupManifestHash:sha256Canonical(backup),createdAt:writerCurrent.createdAt}),requestedControl=buildRequestedRecordSyncV2FreezeControl({request}),transitionPlan=buildRecordSyncV1V2HardPauseTransition({writerCurrent,safetyControl:resolved.safetyControl,request,requestedControl,pausedAt:writerCurrent.createdAt});if(resolved.state==='hard-paused-replay'){if(identity.freezeId!==resolved.currentWriter.currentFreezeId||identity.targetV2Epoch!==resolved.receipt.targetV2Epoch)throw new Error(STAGING_V2_READINESS_BLOCKER);assertRecordSyncV1V2HardPauseTransitionReceipt(resolved.receipt,{request,requestedControl,legacySafetyPauseEvent:transitionPlan.pauseEvent,writerCurrent,safetyControl:resolved.safetyControl});assertHardPausedRecordSyncV1WriterCurrent(resolved.currentWriter,transitionPlan.nextWriterCurrent);if(sha256Canonical(resolved.currentSafety)!==sha256Canonical(transitionPlan.nextSafetyControl))throw new Error(STAGING_V2_READINESS_BLOCKER)}const capability=deepFreeze({transitionPlan,expected:{recordSyncControl:source.control,writerCurrent,safetyControl:resolved.safetyControl}});return Object.freeze({capability,readCount:resolved.readCount+2+root.documentCount,writeCount:0})}})
}

export function createStagingV2AdminReadinessAdapter(raw){
 const input=exact(raw,['app','firestore','expectedProjectId'],'staging V2 Admin readiness config'),options=input.app?.options,projectId=options&&Object.getOwnPropertyDescriptor(options,'projectId')?.value,emulator=projectId==='danbridge-rules-test'&&Boolean(globalThis.process?.env?.FIRESTORE_EMULATOR_HOST);if(projectId!==input.expectedProjectId||(projectId!==expectedProject&&!emulator))throw new Error(STAGING_V2_READINESS_BLOCKER);let prepared=null;
 const prepare=async()=>{if(prepared===null)prepared=Promise.all([import('firebase-admin/firestore'),import('./firebase-staging-v2-service-account-boundary.js')]).then(([admin,boundaryModule])=>{if(admin.getFirestore(input.app)!==input.firestore)throw new Error(STAGING_V2_READINESS_BLOCKER);return Object.freeze({FieldPath:admin.FieldPath,boundary:boundaryModule.createStagingV2AdminBoundary(projectId)})}).catch(error=>{prepared=null;throw error});return prepared};
 const make=async()=>{const runtime=await prepare();await runtime.boundary.attest();return createStagingV2ReadinessAdapter({expectedProjectId:projectId,getDocumentFromServer:path=>input.firestore.doc(path).get(),getCollectionPageFromServer:async(path,{afterId,pageSize})=>{if(!FULL_RECORD_COLLECTIONS.some(name=>RECORD_SYNC_V1_FULL_RECORD_COLLECTION_PATH(name)===path)||pageSize!==RECORD_SYNC_V1_POST_PAUSE_SCAN_PAGE_SIZE)throw new Error(STAGING_V2_READINESS_BLOCKER);let query=input.firestore.collection(path).orderBy(runtime.FieldPath.documentId()).limit(pageSize);if(afterId!==null)query=query.startAfter(afterId);return query.get()}})};
 return Object.freeze({scope:STAGING_V2_READINESS_ADMIN_SCOPE,async seedInput(){return(await make()).seedInput()},async readinessCheck(context){return(await make()).readinessCheck(context)}})
}
