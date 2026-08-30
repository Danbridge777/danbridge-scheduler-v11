import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {strictCloneActiveRecordSaveValue} from './cloud-active-record-save-plan.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {consumeActiveRecordV2FirstDailyUnionPlan} from './cloud-active-record-v2-first-daily-union.js';

export const ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_MANIFEST_SCHEMA='danbridge-active-record-v2-baseline-snapshot-manifest-v1';
export const ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_PLAN_SCHEMA='danbridge-active-record-v2-baseline-snapshot-plan-v1';
export const ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_SCOPE='pure-h1-complete-current-baseline-snapshot-plan-not-native-persistence-runtime-session-or-write-authority';
export const ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_TRUST_BOUNDARY='full-first-daily-union-capability-required-create-only-materialization-and-full-readback-must-be-native';
export const ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_MAX_PUBLIC_BYTES=16*1024;

const plans=new WeakMap(),encoder=new TextEncoder();
const inputFields=['unionPlan','unionExpected'];
const expectedFields=['expectedProjectId','expectedActivationEpoch','expectedResultHeadHash','expectedCommitHash','expectedRecordCount','expectedRecordSetHash','expectedManifestHash','expectedPlanHash'];

function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)}
function exact(value,fields,label){if(!plain(value))throw new Error(label+' must be plain object');const keys=Reflect.ownKeys(value);if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!fields.includes(key)))throw new Error(label+' fields invalid');const out={};for(const key of fields){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error(label+'.'+key+' must be own enumerable data field');out[key]=descriptor.value}return out}
function count(value){return Number.isSafeInteger(value)&&value>=0}
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function token(value){return typeof value==='string'&&value===value.trim()&&value.length>=8&&value.length<=128&&/^[A-Za-z0-9_.:-]+$/.test(value)}
function freeze(value,seen=new Set()){if(value===null||typeof value!=='object'||Object.isFrozen(value)||seen.has(value))return value;seen.add(value);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor?.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))throw new Error('baseline snapshot unsafe descriptor');freeze(descriptor.value,seen)}return Object.freeze(value)}

export function planActiveRecordV2BaselineSnapshot(raw){
 const value=exact(raw,inputFields,'baseline snapshot input'),union=consumeActiveRecordV2FirstDailyUnionPlan(value.unionPlan,value.unionExpected),source=value.unionPlan;
 if(source.writeCount!==0||source.resultRecordCount!==union.records.length||source.unionRecordSetHash!==sha256Canonical(union.records.map(row=>row.unionRecordHash)))throw new Error('baseline snapshot union identity mismatch');
 const recordsByCollection={},collectionCounts={};let flatCount=0;
 for(const collection of FULL_RECORD_COLLECTIONS){const rows=union.recordsByCollection[collection];if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)throw new Error('baseline snapshot union collection invalid');recordsByCollection[collection]=rows.map(row=>strictCloneActiveRecordSaveValue(row));collectionCounts[collection]=rows.length;flatCount+=rows.length}
 if(flatCount!==union.records.length)throw new Error('baseline snapshot union collection count mismatch');
 const manifestBody={schema:ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_MANIFEST_SCHEMA,state:'h1-complete-baseline-confirmed',scope:ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_SCOPE,trustBoundary:ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_TRUST_BOUNDARY,projectId:source.projectId,environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:source.sourceV1ActivationEpoch,sourceFreezeId:source.sourceFreezeId,activationEpoch:source.activationEpoch,seedId:source.seedId,identityIndexRootHash:source.identityIndexRootHash,identityIndexRootAuditHash:source.identityIndexRootAuditHash,identityIndexRootPersistedAt:source.identityIndexRootPersistedAt,authorityRootHash:source.authorityRootHash,genesisAuthorityHash:source.genesisAuthorityHash,genesisAuthorityAuditHash:source.genesisAuthorityAuditHash,reservationAuthorityHash:source.reservationAuthorityHash,reservationAuthorityAuditHash:source.reservationAuthorityAuditHash,sourceRawDocumentRootHash:source.sourceRawDocumentRootHash,sourceStructuralHeadHash:source.sourceStructuralHeadHash,h1HeadHash:source.resultHeadHash,h1CommitHash:source.commitHash,genesisRecordCount:source.genesisRecordCount,h1OperationCount:source.dailyOperationCount,recordCount:source.resultRecordCount,activeCount:source.activeCount,tombstoneCount:source.tombstoneCount,collectionCounts,recordSetHash:source.unionRecordSetHash},manifest=freeze({...manifestBody,manifestHash:sha256Canonical(manifestBody)}),planBody={schema:ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_PLAN_SCHEMA,state:'create-or-exact-replay-required',scope:ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_SCOPE,projectId:source.projectId,activationEpoch:source.activationEpoch,resultHeadHash:source.resultHeadHash,commitHash:source.commitHash,recordCount:source.resultRecordCount,recordSetHash:source.unionRecordSetHash,manifestHash:manifest.manifestHash,writeCount:source.resultRecordCount+1},plan=freeze({...planBody,planHash:sha256Canonical(planBody)});
 if(!token(plan.projectId)||!token(plan.activationEpoch)||![plan.resultHeadHash,plan.commitHash,plan.recordSetHash,plan.manifestHash,plan.planHash].every(digest)||!count(plan.recordCount)||plan.recordCount<1||encoder.encode(JSON.stringify(plan)).length>=ACTIVE_RECORD_V2_BASELINE_SNAPSHOT_MAX_PUBLIC_BYTES)throw new Error('baseline snapshot plan invalid');
 plans.set(plan,freeze({manifest,recordsByCollection,records:FULL_RECORD_COLLECTIONS.flatMap(collection=>recordsByCollection[collection])}));return plan;
}

export function consumeActiveRecordV2BaselineSnapshotPlan(plan,rawExpected){
 const payload=plans.get(plan),expected=exact(rawExpected,expectedFields,'baseline snapshot expected');
 if(!payload||plan.projectId!==expected.expectedProjectId||plan.activationEpoch!==expected.expectedActivationEpoch||plan.resultHeadHash!==expected.expectedResultHeadHash||plan.commitHash!==expected.expectedCommitHash||plan.recordCount!==expected.expectedRecordCount||plan.recordSetHash!==expected.expectedRecordSetHash||plan.manifestHash!==expected.expectedManifestHash||plan.planHash!==expected.expectedPlanHash||plan.writeCount!==plan.recordCount+1)throw new Error('baseline snapshot plan capability or identity invalid');
 return payload;
}
