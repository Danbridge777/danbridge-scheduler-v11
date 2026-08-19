import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const identity=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(value);
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
const hash=value=>typeof value==='string'&&/^record-v1:[a-f0-9]{64}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>typeof value==='string'&&value.trim()===value&&Number.isFinite(Date.parse(value));
const coreFields=['schema','environment','companyId','state','candidateEpoch','legacyVersionHash','recordDataHash','documentCount','activeCount','tombstoneCount','revision','createdAt','sealedAt','readTakeover','writeTakeover','sealHash'];
const auditFields=['persistedAt','updatedBy','updatedByEmail'];

export function stripRecordSyncCandidateControlAudit(control){
 if(!control||typeof control!=='object'||Array.isArray(control)||Object.keys(control).some(key=>![...coreFields,...auditFields].includes(key)))throw new Error('逐筆候選封存控制格式無效');
 const auditCount=auditFields.filter(key=>key in control).length;if(auditCount!==0&&auditCount!==auditFields.length)throw new Error('逐筆候選封存稽核欄位不完整');
 return Object.fromEntries(coreFields.filter(key=>key in control).map(key=>[key,clone(control[key])]));
}

function openBody({candidateEpoch,legacyVersionHash,revision,createdAt}){
 return{schema:'danbridge-record-sync-candidate-control-v1',environment:'staging',companyId:'danbridge',state:'open',candidateEpoch,legacyVersionHash,recordDataHash:'',documentCount:0,activeCount:0,tombstoneCount:0,revision,createdAt,sealedAt:'',readTakeover:false,writeTakeover:false,sealHash:''};
}

export function buildOpenRecordSyncCandidateControl({candidateEpoch,legacyVersionHash,createdAt}={}){
 if(!identity(candidateEpoch)||!text(legacyVersionHash)||!timestamp(createdAt))throw new Error('逐筆候選開啟證據無效');
 return openBody({candidateEpoch,legacyVersionHash,revision:1,createdAt});
}

export function reopenRecordSyncCandidateControl({control,candidateEpoch,legacyVersionHash,createdAt}={}){
 const current=assertRecordSyncCandidateControl(control);if(current.state!=='sealed'||!identity(candidateEpoch)||candidateEpoch===current.candidateEpoch||!text(legacyVersionHash)||!timestamp(createdAt))throw new Error('逐筆候選重新開啟證據無效');
 return openBody({candidateEpoch,legacyVersionHash,revision:current.revision+1,createdAt});
}

export function sealRecordSyncCandidateControl({control,currentLegacyVersionHash,recordDataHash,documentCount,activeCount,tombstoneCount,sealedAt}={}){
 const current=assertRecordSyncCandidateControl(control);if(current.state!=='open'||currentLegacyVersionHash!==current.legacyVersionHash||!hash(recordDataHash)||!integer(documentCount)||!integer(activeCount)||!integer(tombstoneCount)||documentCount!==activeCount+tombstoneCount||!timestamp(sealedAt))throw new Error('逐筆候選封存證據無效');
 const body={...current,state:'sealed',recordDataHash,documentCount,activeCount,tombstoneCount,revision:current.revision+1,sealedAt};delete body.sealHash;return{...body,sealHash:sha256Canonical(body)};
}

export function assertRecordSyncCandidateControl(control){
 const core=stripRecordSyncCandidateControlAudit(control),base=core.schema==='danbridge-record-sync-candidate-control-v1'&&core.environment==='staging'&&core.companyId==='danbridge'&&identity(core.candidateEpoch)&&text(core.legacyVersionHash)&&integer(core.documentCount)&&integer(core.activeCount)&&integer(core.tombstoneCount)&&integer(core.revision)&&core.revision>=1&&timestamp(core.createdAt)&&core.readTakeover===false&&core.writeTakeover===false;
 if(!base)throw new Error('逐筆候選封存控制格式無效');
 if(core.state==='open'){
  if(core.recordDataHash!==''||core.documentCount!==0||core.activeCount!==0||core.tombstoneCount!==0||core.sealedAt!==''||core.sealHash!=='')throw new Error('逐筆候選封存控制格式無效');
 }else if(core.state==='sealed'){
  if(!hash(core.recordDataHash)||core.documentCount!==core.activeCount+core.tombstoneCount||!timestamp(core.sealedAt)||!digest(core.sealHash))throw new Error('逐筆候選封存控制格式無效');
  const body=clone(core);delete body.sealHash;if(sha256Canonical(body)!==core.sealHash)throw new Error('逐筆候選 seal hash 不符');
 }else throw new Error('逐筆候選封存控制格式無效');
 return core;
}
