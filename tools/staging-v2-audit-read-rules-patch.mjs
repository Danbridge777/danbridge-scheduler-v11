import {createHash} from 'node:crypto';

export const STAGING_V2_AUDIT_READ_RULES_BASE_SHA256='80bf69109fc087d672bf7b06789cf3837275e59562dfce3cf2eac28115f4d547';
export const STAGING_V2_AUDIT_READ_RULES_MARKER='DANBRIDGE_STAGING_V2_AUDIT_APPEND_READ_V1';
const digest=value=>createHash('sha256').update(value).digest('hex');
const needle='match/stagingRecordSyncV1PermanentFences/{companyId}';
const block=`match/stagingActiveRecordV2AuditAppends/{companyId}/epochs/{targetV2Epoch}/records/{recordId}{/*${STAGING_V2_AUDIT_READ_RULES_MARKER}*/allow list:if v2OwnerRuntimeReadOpen(companyId,targetV2Epoch);allow get:if v2OwnerRuntimeReadOpen(companyId,targetV2Epoch)&&resource.data.keys().hasOnly(['schema','environment','companyId','activationEpoch','authorityHash','recordId','recordIndex','record','revision','deleted','operationId','actorUid','actorEmail','createdAt','requestHash','appendHash','persistedAt'])&&resource.data.schema=='danbridge-staging-v2-audit-append-v1'&&resource.data.environment=='staging'&&resource.data.companyId==companyId&&resource.data.activationEpoch==targetV2Epoch&&resource.data.recordId==recordId&&resource.data.recordIndex is int&&resource.data.recordIndex>=0&&resource.data.record is map&&resource.data.revision==1&&resource.data.deleted==false&&resource.data.requestHash is string&&resource.data.appendHash is string;}`;

export function patchStagingV2AuditReadRules(source,{projectId,expectedBaseSha256=STAGING_V2_AUDIT_READ_RULES_BASE_SHA256}={}){
 if(projectId!=='danbridge-d8877-staging')throw new Error('staging-only audit rules patch rejects other project');
 if(typeof source!=='string'||digest(source)!==expectedBaseSha256)throw new Error('staging audit rules base changed; fresh review required');
 if(source.includes(STAGING_V2_AUDIT_READ_RULES_MARKER)||source.split(needle).length!==2)throw new Error('staging audit rules insertion boundary invalid');
 const patched=source.replace(needle,block+needle),restored=patched.replace(block,'');
 if(restored!==source)throw new Error('staging audit rules patch changed unrelated content');
 return Object.freeze({source:patched,beforeSha256:digest(source),afterSha256:digest(patched),changedPath:'stagingActiveRecordV2AuditAppends/{companyId}/epochs/{targetV2Epoch}/records/{recordId}'});
}
