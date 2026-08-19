import {sha256Canonical} from './cloud-immutable-migration-backup.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const email=value=>typeof value==='string'&&value===value.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>typeof value==='string'&&value.trim()===value&&Number.isFinite(Date.parse(value));

export const RECORD_SYNC_ROLE_SCENARIOS=[
 'primary-owner-record-write',
 'backup-owner-record-write',
 'two-owner-realtime-read',
 'two-owner-same-record-conflict',
 'scheduler-request-accepted',
 'scheduler-role-view-realtime',
 'scheduler-record-direct-denied',
 'teacher-role-view-realtime',
 'teacher-report-write',
 'teacher-record-direct-denied',
 'disabled-account-denied',
 'cross-role-access-denied'
];

function resultsAreComplete(results){
 return results&&typeof results==='object'&&!Array.isArray(results)&&Object.keys(results).sort().join('|')===[...RECORD_SYNC_ROLE_SCENARIOS].sort().join('|')&&RECORD_SYNC_ROLE_SCENARIOS.every(key=>results[key]===true);
}

export function buildRecordSyncRoleEvidence({environment='staging',primaryOwnerEmail,backupOwnerEmail,schedulerEmail,teacherAccounts,roleViewCount,candidateRunId,candidateSourceHash,candidateManifestHash,receiptCount,receiptSetHash,results,testedAt}={}){
 const teachers=[...new Set((teacherAccounts||[]).map(value=>String(value).trim().toLowerCase()))].sort();
 if(environment!=='staging'||!email(primaryOwnerEmail)||!email(backupOwnerEmail)||!email(schedulerEmail)||new Set([primaryOwnerEmail,backupOwnerEmail,schedulerEmail]).size!==3||!teachers.length||teachers.some(value=>!email(value))||!integer(roleViewCount)||roleViewCount<teachers.length+1||typeof candidateRunId!=='string'||!/^[A-Za-z0-9_.:%@+-]{1,256}$/.test(candidateRunId)||!digest(candidateSourceHash)||!digest(candidateManifestHash)||!integer(receiptCount)||receiptCount!==roleViewCount+2||!digest(receiptSetHash)||!resultsAreComplete(results)||!timestamp(testedAt))throw new Error('逐筆同步角色實測證據輸入無效');
 const body={schema:'danbridge-record-sync-role-evidence-v2',environment,companyId:'danbridge',state:'verified',primaryOwnerEmail,backupOwnerEmail,schedulerEmail,teacherAccountCount:teachers.length,teacherAccountHash:sha256Canonical(teachers),roleViewCount,candidateRunId,candidateSourceHash,candidateManifestHash,receiptCount,receiptSetHash,results:clone(results),testedAt};
 return{...body,evidenceHash:sha256Canonical(body)};
}

export function assertRecordSyncRoleEvidence(evidence){
 if(!evidence||evidence.schema!=='danbridge-record-sync-role-evidence-v2'||!['staging','production'].includes(evidence.environment)||evidence.companyId!=='danbridge'||evidence.state!=='verified'||!email(evidence.primaryOwnerEmail)||!email(evidence.backupOwnerEmail)||!email(evidence.schedulerEmail)||new Set([evidence.primaryOwnerEmail,evidence.backupOwnerEmail,evidence.schedulerEmail]).size!==3||!integer(evidence.teacherAccountCount)||evidence.teacherAccountCount<1||!digest(evidence.teacherAccountHash)||!integer(evidence.roleViewCount)||evidence.roleViewCount<evidence.teacherAccountCount+1||typeof evidence.candidateRunId!=='string'||!/^[A-Za-z0-9_.:%@+-]{1,256}$/.test(evidence.candidateRunId)||!digest(evidence.candidateSourceHash)||!digest(evidence.candidateManifestHash)||!integer(evidence.receiptCount)||evidence.receiptCount!==evidence.roleViewCount+2||!digest(evidence.receiptSetHash)||!resultsAreComplete(evidence.results)||!timestamp(evidence.testedAt)||!digest(evidence.evidenceHash))throw new Error('逐筆同步角色實測證據格式無效');
 const body=clone(evidence);delete body.evidenceHash;if(sha256Canonical(body)!==evidence.evidenceHash)throw new Error('逐筆同步角色實測證據 hash 不符');return evidence;
}
