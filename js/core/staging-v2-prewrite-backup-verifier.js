import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {assertRecordSyncV1PermanentFenceV2Integrity} from './cloud-record-sync-v1-permanent-fence-v2.js';
import {assertRecordSyncV1FrozenSourceProofIntegrity} from './cloud-record-sync-v1-frozen-source-proof.js';
import {assertRecordSyncV1RawCutoverBackupCompactMetadataLink} from './cloud-record-sync-v1-raw-cutover-backup.js';
import {assertRecordSyncV2GenesisAuthorityIntegrity} from './cloud-record-sync-v2-genesis-authority.js';

export const STAGING_V2_PREWRITE_BACKUP_VERIFIER_SCOPE='fresh-server-immutable-v1-backup-genesis-fence-and-stable-head-prewrite-verifier';

const PROJECT_ID='danbridge-d8877-staging';
const auditFields=['persistedAt','persistedBy','persistedByEmail'];
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);

function exactData(value,label){
 if(!plain(value))throw new Error(label+' must be a plain object');
 const out={};
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string')throw new Error(label+' symbol field blocked');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be an own data field');
  out[key]=descriptor.value;
 }
 return out;
}

function coreWithoutAudit(value,label){
 const row=exactData(value,label);
 const present=auditFields.filter(key=>Object.prototype.hasOwnProperty.call(row,key));
 if(present.length!==0&&present.length!==auditFields.length)throw new Error(label+' audit must be all-or-none');
 for(const key of present)delete row[key];
 return row;
}

function auditHash(value,label){
 const row=exactData(value,label),audit={};
 for(const key of auditFields){
  if(!Object.prototype.hasOwnProperty.call(row,key))throw new Error(label+' durable audit missing');
  audit[key]=row[key];
 }
 return sha256Canonical(audit);
}

function assertGenesisPair(rawManifest,rawReadback,authority){
 const manifest=coreWithoutAudit(rawManifest,'staging V2 durable Genesis manifest'),readback=coreWithoutAudit(rawReadback,'staging V2 Genesis readback');
 const manifestBody={...manifest};delete manifestBody.manifestHash;
 const readbackBody={...readback};delete readbackBody.readbackReceiptHash;
 if(manifest.schema!=='danbridge-record-sync-v2-genesis-durable-manifest-v2'||manifest.state!=='persisted-observation'||!digest(manifest.manifestHash)||sha256Canonical(manifestBody)!==manifest.manifestHash)throw new Error('staging V2 durable Genesis manifest integrity invalid');
 if(readback.schema!=='danbridge-record-sync-v2-genesis-strict-readback-receipt-v2'||readback.state!=='complete-observation'||!digest(readback.readbackReceiptHash)||sha256Canonical(readbackBody)!==readback.readbackReceiptHash)throw new Error('staging V2 Genesis readback integrity invalid');
 const mirrors=['environment','companyId','targetV2Epoch','seedId','parentFrozenSourceProofHash','seedPlanManifestHash','identityIndexRootHash','identityIndexRootAuditHash','identityIndexRootPersistedAt','sourceRawDocumentRootHash','activeLogicalHashSchema','activeLogicalDataHash','documentCount','activeCount','tombstoneCount','auditedCount','unauditedCount','orderedGenesisRecordSetHash','batchCount','orderedDurableBatchReceiptHashesHash','recordAuditSetHash','batchReceiptAuditSetHash'];
 if(readback.durableManifestHash!==manifest.manifestHash||readback.manifestAuditHash!==auditHash(rawManifest,'staging V2 durable Genesis manifest')||mirrors.some(key=>readback[key]!==manifest[key]))throw new Error('staging V2 Genesis durable manifest/readback split');
 if(authority.durableSeedManifestHash!==manifest.manifestHash||authority.durableSeedManifestAuditHash!==auditHash(rawManifest,'staging V2 durable Genesis manifest')||authority.strictReadbackReceiptHash!==readback.readbackReceiptHash||authority.strictReadbackReceiptAuditHash!==auditHash(rawReadback,'staging V2 Genesis readback'))throw new Error('staging V2 Genesis authority durable proof split');
 return{manifestHash:manifest.manifestHash,readbackReceiptHash:readback.readbackReceiptHash};
}

function assertHead(rawHead,fence){
 const head=coreWithoutAudit(rawHead,'staging V2 active head'),body={...head};delete body.headHash;
 if(!digest(head.headHash)||sha256Canonical(body)!==head.headHash||head.environment!=='staging'||head.companyId!=='danbridge'||head.activationEpoch!==fence.targetV2Epoch||head.seedId!==fence.seedId||head.sourceV1ActivationEpoch!==fence.sourceV1ActivationEpoch||head.sourceFreezeId!==fence.sourceFreezeId||head.genesisAuthorityHash!==fence.genesisAuthorityHash||head.genesisAuthorityAuditHash!==fence.genesisAuthorityAuditHash||head.authorityRootHash!==fence.authorityRootHash||!Number.isSafeInteger(head.revision)||head.revision<0)throw new Error('staging V2 active head backup binding invalid');
 if(head.revision===0){if(head.schema!=='danbridge-active-record-v2-structural-head0-v2'||head.headHash!==fence.activeHeadHash||head.headSaveId!==''||head.operationCount!==0)throw new Error('staging V2 structural H0 backup binding invalid')}
 else if(head.schema!=='danbridge-active-record-authority-head-v2'||head.revision<1||!digest(head.commitHash)||!digest(head.previousHeadHash)||typeof head.headSaveId!=='string'||head.headSaveId.length<8)throw new Error('staging V2 Hn backup binding invalid');
 return head;
}

export function verifyStagingV2PrewriteBackup(raw){
 const input=exactData(raw,'staging V2 prewrite backup input'),required=['fence','frozenSourceProof','rawBackupManifest','rawBackupReadback','genesisManifest','genesisReadback','genesisAuthority','headBefore','headAfter'];
 if(Reflect.ownKeys(input).length!==required.length||required.some(key=>!Object.prototype.hasOwnProperty.call(input,key)))throw new Error('staging V2 prewrite backup input fields invalid');
 const fence=assertRecordSyncV1PermanentFenceV2Integrity(coreWithoutAudit(input.fence,'staging V2 permanent fence'));
 if(fence.projectId!==PROJECT_ID)throw new Error('staging V2 prewrite backup project invalid');
 const proof=assertRecordSyncV1FrozenSourceProofIntegrity(input.frozenSourceProof),rawLink=assertRecordSyncV1RawCutoverBackupCompactMetadataLink({manifest:input.rawBackupManifest,readbackReceipt:input.rawBackupReadback}),authority=assertRecordSyncV2GenesisAuthorityIntegrity(input.genesisAuthority);
 if(proof.activationEpoch!==fence.sourceV1ActivationEpoch||proof.freezeId!==fence.sourceFreezeId||proof.targetV2Epoch!==fence.targetV2Epoch||proof.proofHash!==fence.parentFrozenSourceProofHash||proof.hardPauseReceiptHash!==fence.sourceHardPauseReceiptHash||proof.rawDocumentRootHash!==fence.sourceRawDocumentRootHash)throw new Error('staging V2 frozen source/fence backup split');
 if(rawLink.activationEpoch!==proof.activationEpoch||rawLink.backupId!==proof.rawBackupId||rawLink.manifestHash!==proof.rawBackupManifestHash||rawLink.readbackReceiptHash!==proof.rawBackupReadbackReceiptHash||rawLink.rawDocumentRootHash!==proof.rawDocumentRootHash)throw new Error('staging V2 immutable raw backup split');
 if(authority.sourceV1ActivationEpoch!==fence.sourceV1ActivationEpoch||authority.sourceFreezeId!==fence.sourceFreezeId||authority.targetV2Epoch!==fence.targetV2Epoch||authority.seedId!==fence.seedId||authority.parentFrozenSourceProofHash!==proof.proofHash||authority.sourceRawDocumentRootHash!==proof.rawDocumentRootHash||authority.authorityHash!==fence.genesisAuthorityHash||auditHash(input.genesisAuthority,'staging V2 Genesis authority')!==fence.genesisAuthorityAuditHash)throw new Error('staging V2 Genesis authority/fence backup split');
 const genesis=assertGenesisPair(input.genesisManifest,input.genesisReadback,authority),before=assertHead(input.headBefore,fence),after=assertHead(input.headAfter,fence);
 if(before.headHash!==after.headHash||before.revision!==after.revision||sha256Canonical(coreWithoutAudit(input.headBefore,'staging V2 active head before'))!==sha256Canonical(coreWithoutAudit(input.headAfter,'staging V2 active head after')))throw new Error('staging V2 active head changed during prewrite backup verification');
 return Object.freeze({state:'complete-confirmed',scope:STAGING_V2_PREWRITE_BACKUP_VERIFIER_SCOPE,projectId:PROJECT_ID,sourceV1ActivationEpoch:fence.sourceV1ActivationEpoch,sourceFreezeId:fence.sourceFreezeId,targetV2Epoch:fence.targetV2Epoch,seedId:fence.seedId,rawBackupManifestHash:rawLink.manifestHash,rawBackupReadbackReceiptHash:rawLink.readbackReceiptHash,genesisManifestHash:genesis.manifestHash,genesisReadbackReceiptHash:genesis.readbackReceiptHash,headRevision:after.revision,headHash:after.headHash});
}
