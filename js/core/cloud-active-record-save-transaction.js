import {
 activeRecordSaveEnvelopeHash,
 assertActiveRecordSaveCommit,
 assertActiveRecordSyncHead,
 buildActiveRecordSavePlan,
 isStrictActiveRecordSaveTimestamp,
 preflightActiveRecordSaveLocalEnvelopes,
 strictCloneActiveRecordSaveValue
} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assertRecordSyncSafetyControl} from './cloud-record-sync-safety-control.js';
import {RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA} from './cloud-record-sync-v2-genesis-seed.js';
import {RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA,RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA,assertRecordSyncV1RawDocumentLeaf} from './cloud-record-sync-v1-raw-document-leaf.js';

export const ACTIVE_RECORD_V2_RECORD_SCHEMA='danbridge-active-record-v2-record-v1';
export const ACTIVE_RECORD_V2_RECEIPT_SCHEMA='danbridge-active-record-v2-receipt-v1';
export const ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA='danbridge-active-record-v2-commit-ledger-v1';
export const ACTIVE_RECORD_V2_HEAD_SCHEMA='danbridge-active-record-v2-head-v1';
export const ACTIVE_RECORD_V2_GENESIS_DAILY_UNION_SCOPE='pure-genesis-daily-schema-union-requires-authoritative-seed-manifest-control-before-wiring';

const exact=(value,fields,label)=>{
 const prototype=value&&typeof value==='object'?Object.getPrototypeOf(value):null,keys=value&&typeof value==='object'?Reflect.ownKeys(value):[];
 if(!value||typeof value!=='object'||Array.isArray(value)||(prototype!==Object.prototype&&prototype!==null)||keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(`${label}欄位無效`);
 for(const field of fields){const descriptor=Object.getOwnPropertyDescriptor(value,field);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(`${label}欄位無效`)}
 return value;
};
const token=(value,max=128)=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=max&&/^[A-Za-z0-9_.:-]+$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&value.length<=320&&!value.includes('/')&&/^[^@\s]+@[^@\s]+$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nonzeroHash=value=>hash(value)&&value!=='0'.repeat(64);
const same=(left,right)=>sha256Canonical(strictCloneActiveRecordSaveValue(left))===sha256Canonical(strictCloneActiveRecordSaveValue(right));
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot&&typeof snapshot==='object'&&('exists'in snapshot||'data'in snapshot)?(snapshot.exists===false?null:snapshot.data??null):snapshot??null);
const operationId=(saveId,index)=>`${saveId}:${String(index+1).padStart(2,'0')}`;
const recordPath=(epoch,key)=>`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/${key.collection}/records/${key.recordId}`;
const receiptPath=(epoch,id)=>`stagingActiveRecordV2OperationReceipts/danbridge/epochs/${epoch}/operations/${id}`;
const ledgerPath=(epoch,saveId)=>`stagingActiveRecordV2SaveCommits/danbridge/epochs/${epoch}/saves/${saveId}`;
const headPath=epoch=>`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`;
const CONTROL_PATH='stagingRecordSyncControls/danbridge';
const SAFETY_PATH='stagingRecordSyncSafetyControls/danbridge';

function assertControl(control,safety,activationEpoch){
 if(!control||control.schema!=='danbridge-record-sync-control-v1'||control.environment!=='staging'||control.companyId!=='danbridge'||control.state!=='active'||control.activationEpoch!==activationEpoch||!hash(control.manifestHash)||!token(control.candidateEpoch)||!Number.isSafeInteger(control.candidateRevision)||control.candidateRevision<2||!hash(control.candidateSealHash)||typeof control.legacyVersionHash!=='string'||control.legacyVersionHash.trim()!==control.legacyVersionHash||!control.legacyVersionHash||!/^record-v1:[a-f0-9]{64}$/.test(control.recordDataHash)||!hash(control.roleEvidenceHash)||!token(control.backupId)||!token(control.restoreReceiptId)||control.collectionCount!==16||!Number.isSafeInteger(control.documentCount)||!Number.isSafeInteger(control.activeCount)||!Number.isSafeInteger(control.tombstoneCount)||control.documentCount<0||control.activeCount<0||control.tombstoneCount<0||control.documentCount!==control.activeCount+control.tombstoneCount||!Number.isSafeInteger(control.roleViewCount)||control.roleViewCount<1||control.readTakeover!==true||control.writeTakeover!==true||!isStrictActiveRecordSaveTimestamp(control.activatedAt))throw new Error('V2 save transaction control 尚未 active');
 try{assertRecordSyncSafetyControl(safety,{environment:'staging',activationEpoch})}catch{throw new Error('V2 save transaction safety 已封鎖')}
 if(safety.state!=='active'||safety.readAllowed!==true||safety.writeAllowed!==true)throw new Error('V2 save transaction safety 已封鎖');
}
function readHead(value,activationEpoch){
 if(value==null)throw new Error('V2 epoch head 缺失；必須由 activation 預建 revision 0 head');
 exact(value,['schema','environment','companyId','activationEpoch','revision','headSaveId','previousCommitHash','commitHash','operationCount','head','actorUid','actorEmail','persistedAt'],'V2 head');
 if(value.schema!==ACTIVE_RECORD_V2_HEAD_SCHEMA||value.environment!=='staging'||value.companyId!=='danbridge'||value.activationEpoch!==activationEpoch||!token(value.actorUid)||!email(value.actorEmail))throw new Error('V2 head identity 無效');
 const head=strictCloneActiveRecordSaveValue(value.head);assertActiveRecordSyncHead(head);if(head.revision!==value.revision||head.headSaveId!==value.headSaveId||head.previousCommitHash!==value.previousCommitHash||head.commitHash!==value.commitHash||head.operationCount!==value.operationCount||head.updatedAt!==value.head.updatedAt||head.activationEpoch!==activationEpoch)throw new Error('V2 head envelope 與 head 不符');return{head,stored:value};
}
function readLedger(value,{activationEpoch,saveId}){
 if(value==null)return null;
 exact(value,['schema','environment','companyId','activationEpoch','saveId','commitHash','actorUid','actorEmail','saveCommit','persistedAt'],'V2 commit ledger');
 if(value.schema!==ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA||value.environment!=='staging'||value.companyId!=='danbridge'||value.activationEpoch!==activationEpoch||value.saveId!==saveId||!hash(value.commitHash)||!token(value.actorUid)||!email(value.actorEmail))throw new Error('V2 commit ledger identity 無效');
 const saveCommit=strictCloneActiveRecordSaveValue(value.saveCommit);assertActiveRecordSaveCommit(saveCommit);if(saveCommit.saveId!==saveId||saveCommit.activationEpoch!==activationEpoch||saveCommit.commitHash!==value.commitHash||saveCommit.actorUid!==value.actorUid||saveCommit.actorEmail!==value.actorEmail)throw new Error('V2 commit ledger 內容不符');return{...value,saveCommit};
}
function assertCurrentHeadLedger(ledger,head,storedHead){
 if(!ledger)throw new Error('V2 current-head immutable ledger 缺失');const commit=ledger.saveCommit;
 if(ledger.saveId!==head.headSaveId||commit.saveId!==head.headSaveId||commit.nextHeadRevision!==head.revision||commit.previousCommitHash!==head.previousCommitHash||commit.commitHash!==head.commitHash||commit.operationCount!==head.operationCount||commit.createdAt!==head.updatedAt||ledger.actorUid!==storedHead.actorUid||ledger.actorEmail!==storedHead.actorEmail)throw new Error('V2 current-head ledger 與 head mirror 不符');
}
function absentEnvelope(key,activationEpoch){const core={collection:key.collection,recordId:key.recordId,exists:false,revision:0,deleted:false,record:null};return{environment:'staging',companyId:'danbridge',activationEpoch,...core,recordHash:activeRecordSaveEnvelopeHash(core)}}
function readGenesisRecord(value,{key,activationEpoch}){
 exact(value,['schema','artifactKind','environment','companyId','sourceV1ActivationEpoch','targetV2Epoch','seedId','parentFrozenSourceProofHash','sourceHardPauseReceiptHash','sourceRawDocumentRootHash','collection','recordId','recordIndex','record','deleted','revision','sourceRevision','sourceHash','sourceRecordValueHash','sourceDocumentCoreHash','sourceAuditState','sourceAudit','sourceAuditHash','sourceLeafHash','recordHash','genesisRecordHash','persistedAt','persistedBy','persistedByEmail'],'V2 genesis record');
 if(value.schema!==RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA||value.artifactKind!=='create-only-genesis-record'||value.environment!=='staging'||value.companyId!=='danbridge'||value.targetV2Epoch!==activationEpoch||value.sourceV1ActivationEpoch===value.targetV2Epoch||value.collection!==key.collection||value.recordId!==key.recordId||value.revision!==1||!Number.isSafeInteger(value.sourceRevision)||value.sourceRevision<1||typeof value.deleted!=='boolean'||!token(value.sourceV1ActivationEpoch)||!token(value.targetV2Epoch)||!/^v2-genesis:[a-f0-9]{64}$/.test(value.seedId)||![value.parentFrozenSourceProofHash,value.sourceHardPauseReceiptHash,value.sourceRawDocumentRootHash,value.sourceRecordValueHash,value.sourceDocumentCoreHash,value.sourceAuditHash,value.sourceLeafHash,value.genesisRecordHash].every(nonzeroHash)||typeof value.sourceHash!=='string'||value.sourceHash!==value.sourceHash.trim()||!value.sourceHash||value.sourceHash.length>256||value.sourceAuditState!=='present'||!token(value.persistedBy)||!email(value.persistedByEmail)||!isStrictActiveRecordSaveTimestamp(value.persistedAt))throw new Error('V2 genesis record identity 無效');
 const record=strictCloneActiveRecordSaveValue(value.record),audit=strictCloneActiveRecordSaveValue(value.sourceAudit),normalizedDocument={schema:RECORD_SYNC_V1_RAW_DOCUMENT_NORMALIZED_SCHEMA,documentId:value.recordId,environment:'staging',companyId:'danbridge',collection:value.collection,recordId:value.recordId,record,recordIndex:value.recordIndex,sourceHash:value.sourceHash,revision:value.sourceRevision,deleted:value.deleted,auditState:value.sourceAuditState,audit},leaf={schema:RECORD_SYNC_V1_RAW_DOCUMENT_LEAF_SCHEMA,environment:'staging',companyId:'danbridge',collection:value.collection,recordId:value.recordId,recordIndex:value.recordIndex,revision:value.sourceRevision,deleted:value.deleted,sourceHash:value.sourceHash,recordValueHash:value.sourceRecordValueHash,documentCoreHash:value.sourceDocumentCoreHash,auditState:value.sourceAuditState,auditHash:value.sourceAuditHash,leafHash:value.sourceLeafHash};assertRecordSyncV1RawDocumentLeaf(leaf,{normalizedDocument});
 const core={collection:key.collection,recordId:key.recordId,exists:true,revision:1,deleted:value.deleted,record},recordHash=activeRecordSaveEnvelopeHash(core);if(recordHash!==value.recordHash)throw new Error('V2 genesis recordHash 不符');
 const commitment={schema:RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,genesisRecordSchema:value.schema,environment:value.environment,companyId:value.companyId,sourceV1ActivationEpoch:value.sourceV1ActivationEpoch,targetV2Epoch:value.targetV2Epoch,seedId:value.seedId,parentFrozenSourceProofHash:value.parentFrozenSourceProofHash,sourceHardPauseReceiptHash:value.sourceHardPauseReceiptHash,sourceRawDocumentRootHash:value.sourceRawDocumentRootHash,collection:value.collection,recordId:value.recordId,recordIndex:value.recordIndex,deleted:value.deleted,revision:value.revision,sourceRevision:value.sourceRevision,sourceHash:value.sourceHash,sourceRecordValueHash:value.sourceRecordValueHash,sourceDocumentCoreHash:value.sourceDocumentCoreHash,sourceAuditState:value.sourceAuditState,sourceAuditHash:value.sourceAuditHash,sourceLeafHash:value.sourceLeafHash,recordHash:value.recordHash};if(sha256Canonical(commitment)!==value.genesisRecordHash)throw new Error('V2 genesis record commitment 不符');return{stored:value,envelope:{environment:'staging',companyId:'danbridge',activationEpoch,...core,recordHash}};
}
function readRecordSchema(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw new Error('V2 record 必須是 plain object');
 const descriptor=Object.getOwnPropertyDescriptor(value,'schema');if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('V2 record schema 欄位無效');return descriptor.value;
}
function readRecord(value,{key,activationEpoch}){
 if(value==null)return{envelope:absentEnvelope(key,activationEpoch),stored:null};
 const schema=readRecordSchema(value);if(schema===RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA)return readGenesisRecord(value,{key,activationEpoch});
 exact(value,['schema','environment','companyId','activationEpoch','collection','recordId','record','revision','deleted','recordHash','saveId','commitRevision','operationId','commitHash','actorUid','actorEmail','updatedAt'],'V2 record');
 if(value.schema!==ACTIVE_RECORD_V2_RECORD_SCHEMA||value.environment!=='staging'||value.companyId!=='danbridge'||value.activationEpoch!==activationEpoch||value.collection!==key.collection||value.recordId!==key.recordId||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.deleted!=='boolean'||!/^record-item-v1:[a-f0-9]{64}$/.test(value.recordHash)||!token(value.saveId,110)||!Number.isSafeInteger(value.commitRevision)||value.commitRevision<1||!token(value.operationId)||!hash(value.commitHash)||!token(value.actorUid)||!email(value.actorEmail))throw new Error('V2 record identity 無效');
 const core={collection:key.collection,recordId:key.recordId,exists:true,revision:value.revision,deleted:value.deleted,record:strictCloneActiveRecordSaveValue(value.record)},expected=activeRecordSaveEnvelopeHash(core);if(expected!==value.recordHash)throw new Error('V2 record hash 不符');return{stored:value,envelope:{environment:'staging',companyId:'danbridge',activationEpoch,...core,recordHash:expected}};
}
function assertReceipt(value,{operation,plan}){
 exact(value,['schema','environment','companyId','activationEpoch','saveId','commitRevision','operationId','operationHash','commitHash','collection','recordId','revision','deleted','recordHash','actorUid','actorEmail','persistedAt'],'V2 receipt');
 if(value.schema!==ACTIVE_RECORD_V2_RECEIPT_SCHEMA||value.environment!=='staging'||value.companyId!=='danbridge'||value.activationEpoch!==plan.activationEpoch||value.saveId!==plan.saveId||value.commitRevision!==plan.nextHead.revision||value.operationId!==operation.operationId||value.operationHash!==operation.operationHash||value.commitHash!==plan.saveCommit.commitHash||value.collection!==operation.collection||value.recordId!==operation.recordId||value.revision!==operation.nextRevision||value.deleted!==operation.payload.deleted||value.recordHash!==operation.afterHash||value.actorUid!==operation.actorUid||value.actorEmail!==operation.actorEmail)throw new Error('V2 receipt identity/hash/actor 衝突');
}
function assertReplayRecord(stored,operation,plan){if(!stored||stored.saveId!==plan.saveId||stored.commitRevision!==plan.nextHead.revision||stored.operationId!==operation.operationId||stored.commitHash!==plan.saveCommit.commitHash||stored.recordHash!==operation.afterHash||stored.actorUid!==operation.actorUid||stored.actorEmail!==operation.actorEmail)throw new Error('V2 replay record commit/hash/actor 衝突')}

export function createActiveRecordSaveTransaction({runTransaction,serverTimestamp,environment='staging',role,actor}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('V2 save transaction 注入介面不完整');
 const owner={uid:actor?.uid,email:actor?.email};
 const guard=request=>{
  if(environment!=='staging'||role!=='owner'||!token(owner.uid)||!email(owner.email))throw new Error('V2 save transaction 只允許 staging owner');
  exact(request,['activationEpoch','save','changedKeys','baselineRecords','localRecords'],'V2 save request');exact(request.save,['saveId','deviceId','actorUid','actorEmail','createdAt'],'V2 save identity');
  if(!token(request.activationEpoch)||!token(request.save.saveId,110)||!token(request.save.deviceId)||!token(request.save.actorUid)||!email(request.save.actorEmail)||!isStrictActiveRecordSaveTimestamp(request.save.createdAt)||request.save.actorUid!==owner.uid||request.save.actorEmail!==owner.email)throw new Error('V2 save actor/epoch 與 adapter 不符');
  return preflightActiveRecordSaveLocalEnvelopes({activationEpoch:request.activationEpoch,changedKeys:request.changedKeys,baselineRecords:request.baselineRecords,localRecords:request.localRecords}).changedKeys;
 };
 return{enabled:environment==='staging'&&role==='owner',async execute(request){
  const snapshot=strictCloneActiveRecordSaveValue(request),keys=guard(snapshot),epoch=snapshot.activationEpoch,saveId=snapshot.save.saveId,commitPath=ledgerPath(epoch,saveId),headDocumentPath=headPath(epoch),recordPaths=keys.map(key=>recordPath(epoch,key)),operationIds=keys.map((_,index)=>operationId(saveId,index)),receiptPaths=operationIds.map(id=>receiptPath(epoch,id));
  return runTransaction(async transaction=>{
   const paths=[CONTROL_PATH,SAFETY_PATH,headDocumentPath,commitPath,...recordPaths,...receiptPaths],snapshots=await Promise.all(paths.map(path=>transaction.get(path))),values=snapshots.map(valueOf),control=values[0],safety=values[1],headRead=readHead(values[2],epoch),head=headRead.head,ledger=readLedger(values[3],{activationEpoch:epoch,saveId}),recordReads=values.slice(4,4+keys.length).map((value,index)=>readRecord(value,{key:keys[index],activationEpoch:epoch})),receiptValues=values.slice(4+keys.length);let currentHeadLedgerReadCount=0;
   assertControl(control,safety,epoch);
   if(head.revision>0){if(head.headSaveId===saveId)assertCurrentHeadLedger(ledger,head,headRead.stored);else{const currentLedgerSnapshot=await transaction.get(ledgerPath(epoch,head.headSaveId)),currentLedger=readLedger(valueOf(currentLedgerSnapshot),{activationEpoch:epoch,saveId:head.headSaveId});currentHeadLedgerReadCount=1;assertCurrentHeadLedger(currentLedger,head,headRead.stored)}}
   const plan=buildActiveRecordSavePlan({save:snapshot.save,changedKeys:keys,baselineRecords:snapshot.baselineRecords,localRecords:snapshot.localRecords,remoteRecords:recordReads.map(value=>value.envelope),currentSyncHead:head,confirmedExistingSaveCommitHash:ledger?.commitHash??null});
   if(plan.replay){
    if(!ledger||ledger.actorUid!==snapshot.save.actorUid||ledger.actorEmail!==snapshot.save.actorEmail||!same(ledger.saveCommit,plan.saveCommit))throw new Error('V2 replay immutable ledger 衝突');
    if(!receiptValues.every(Boolean))throw new Error('V2 replay receipt 不完整');for(let index=0;index<plan.operations.length;index++){assertReplayRecord(recordReads[index].stored,plan.operations[index],plan);assertReceipt(receiptValues[index],{operation:plan.operations[index],plan})}return{state:'replayed',readCount:paths.length+currentHeadLedgerReadCount,writeCount:0,plan:strictCloneActiveRecordSaveValue(plan)};
   }
   if(ledger||receiptValues.some(Boolean))throw new Error('V2 new save 發現既有 immutable ledger/receipt');
   const at=serverTimestamp();for(let index=0;index<plan.operations.length;index++){const operation=plan.operations[index];transaction.set(recordPaths[index],{schema:ACTIVE_RECORD_V2_RECORD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:epoch,collection:operation.collection,recordId:operation.recordId,record:strictCloneActiveRecordSaveValue(operation.payload.record),revision:operation.nextRevision,deleted:operation.payload.deleted,recordHash:operation.afterHash,saveId:plan.saveId,commitRevision:plan.nextHead.revision,operationId:operation.operationId,commitHash:plan.saveCommit.commitHash,actorUid:operation.actorUid,actorEmail:operation.actorEmail,updatedAt:at});transaction.set(receiptPaths[index],{schema:ACTIVE_RECORD_V2_RECEIPT_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:epoch,saveId:plan.saveId,commitRevision:plan.nextHead.revision,operationId:operation.operationId,operationHash:operation.operationHash,commitHash:plan.saveCommit.commitHash,collection:operation.collection,recordId:operation.recordId,revision:operation.nextRevision,deleted:operation.payload.deleted,recordHash:operation.afterHash,actorUid:operation.actorUid,actorEmail:operation.actorEmail,persistedAt:at})}
   transaction.set(commitPath,{schema:ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:epoch,saveId:plan.saveId,commitHash:plan.saveCommit.commitHash,actorUid:snapshot.save.actorUid,actorEmail:snapshot.save.actorEmail,saveCommit:strictCloneActiveRecordSaveValue(plan.saveCommit),persistedAt:at});transaction.set(headDocumentPath,{schema:ACTIVE_RECORD_V2_HEAD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:epoch,revision:plan.nextHead.revision,headSaveId:plan.nextHead.headSaveId,previousCommitHash:plan.nextHead.previousCommitHash,commitHash:plan.nextHead.commitHash,operationCount:plan.nextHead.operationCount,head:strictCloneActiveRecordSaveValue(plan.nextHead),actorUid:snapshot.save.actorUid,actorEmail:snapshot.save.actorEmail,persistedAt:at});return{state:'committed',readCount:paths.length+currentHeadLedgerReadCount,writeCount:plan.operations.length*2+2,plan:strictCloneActiveRecordSaveValue(plan)};
  })
 }};
}
