import {createShardedSnapshot,assembleShardedSnapshot,SHARDED_DB_COLLECTION_KEYS} from './cloud-sharded-store.js';
import {recordDataHash} from './cloud-record-data-hash.js';

export const DAILY_SHARDED_BACKUP_SCHEMA='danbridge-daily-sharded-backup-v2';
export const DAILY_SHARDED_BACKUP_CHUNK_SCHEMA='danbridge-daily-sharded-backup-chunk-v2';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(`${value}T00:00:00Z`);return!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value};
const environments=new Set(['staging','production']);
const manifestCoreFields=['schema','environment','companyId','day','state','sourceHash','collectionOrder','collections','chunkCount','recordCount','maxChunkBytes','counts'];
const manifestAuditFields=['verifiedHash','verifiedAt','verifiedBy','verifiedByEmail'];
const chunkCoreFields=['schema','environment','companyId','day','chunkId','collection','index','items','sourceHash'];
const chunkAuditFields=['createdAt','createdBy','createdByEmail'];
function exact(value,core,audit,label){if(!value||typeof value!=='object'||Array.isArray(value)||core.some(key=>!(key in value))||Object.keys(value).some(key=>![...core,...audit].includes(key)))throw new Error(`${label}欄位無效`);const count=audit.filter(key=>key in value).length;if(count!==0&&count!==audit.length)throw new Error(`${label}稽核欄位不完整`)}
function counts(db){return{students:db.students?.length||0,teachers:db.teachers?.length||0,lessons:db.lessons?.length||0,makeups:db.makeups?.length||0}}
function countsValid(value){return value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),['lessons','makeups','students','teachers'])&&Object.values(value).every(count=>Number.isSafeInteger(count)&&count>=0)}

export function prepareDailyShardedBackup(db,{day:backupDay,environment='staging',maxChunkBytes=180000}={}){
 if(!day(backupDay)||!environments.has(environment)||!Number.isSafeInteger(maxChunkBytes)||maxChunkBytes<10000||maxChunkBytes>180000)throw new Error('每日分片備份設定無效');const sharded=createShardedSnapshot(db,{hash:recordDataHash,maxChunkBytes,generationId:backupDay}),manifest={schema:DAILY_SHARDED_BACKUP_SCHEMA,environment,companyId:'danbridge',day:backupDay,state:'uploading',sourceHash:sharded.manifest.sourceHash,collectionOrder:[...sharded.manifest.collectionOrder],collections:clone(sharded.manifest.collections),chunkCount:sharded.manifest.totalChunks,recordCount:sharded.manifest.totalRecords,maxChunkBytes,counts:counts(db)},chunks=sharded.chunks.map(row=>({schema:DAILY_SHARDED_BACKUP_CHUNK_SCHEMA,environment,companyId:'danbridge',day:backupDay,chunkId:row.documentId,collection:row.key,index:row.index,items:clone(row.items),sourceHash:manifest.sourceHash}));return{manifest,chunks};
}

export function dailyBackupChunkCore(value){exact(value,chunkCoreFields,chunkAuditFields,'每日備份分片');return Object.fromEntries(chunkCoreFields.map(key=>[key,clone(value[key])]))}

export function verifyDailyShardedBackupReadback(manifest,rows){
 exact(manifest,manifestCoreFields,manifestAuditFields,'每日備份 manifest');if(manifest.schema!==DAILY_SHARDED_BACKUP_SCHEMA||!environments.has(manifest.environment)||manifest.companyId!=='danbridge'||!day(manifest.day)||!['uploading','verified'].includes(manifest.state)||!/^record-v1:[a-f0-9]{64}$/.test(manifest.sourceHash)||!same(manifest.collectionOrder,SHARDED_DB_COLLECTION_KEYS)||!Number.isSafeInteger(manifest.chunkCount)||manifest.chunkCount<0||!Number.isSafeInteger(manifest.recordCount)||manifest.recordCount<0||!Number.isSafeInteger(manifest.maxChunkBytes)||manifest.maxChunkBytes<10000||manifest.maxChunkBytes>180000||!countsValid(manifest.counts))throw new Error('每日備份 manifest identity 無效');const seen=new Set(),chunks=(rows||[]).map(row=>{const value=dailyBackupChunkCore(row),expectedId=`${value.collection}-${String(value.index).padStart(4,'0')}`;if(value.schema!==DAILY_SHARDED_BACKUP_CHUNK_SCHEMA||value.environment!==manifest.environment||value.companyId!=='danbridge'||value.day!==manifest.day||value.chunkId!==expectedId||value.sourceHash!==manifest.sourceHash||seen.has(value.chunkId))throw new Error('每日備份分片 identity、重複或 hash 無效');seen.add(value.chunkId);return{key:value.collection,index:value.index,items:clone(value.items)}});if(chunks.length!==manifest.chunkCount)throw new Error('每日備份分片數不符');const shardedManifest={schema:'danbridge-sharded-db-v1',generationId:manifest.day,sourceHash:manifest.sourceHash,maxChunkBytes:manifest.maxChunkBytes,collectionOrder:manifest.collectionOrder,collections:manifest.collections,totalChunks:manifest.chunkCount,totalRecords:manifest.recordCount},db=assembleShardedSnapshot(shardedManifest,chunks,{hash:recordDataHash}),verifiedHash=recordDataHash(db),actualCounts=counts(db);if(verifiedHash!==manifest.sourceHash||Object.keys(actualCounts).some(key=>actualCounts[key]!==manifest.counts[key]))throw new Error('每日備份完整讀回 hash 或摘要不符');return{db,verifiedHash,chunkCount:chunks.length,recordCount:manifest.recordCount,verified:true};
}

export function sealDailyShardedBackup(manifest,readback,{verifiedBy,verifiedByEmail}={}){
 if(manifest?.state!=='uploading'||readback?.verified!==true||readback.verifiedHash!==manifest.sourceHash||typeof verifiedBy!=='string'||!verifiedBy.trim()||typeof verifiedByEmail!=='string'||!verifiedByEmail.trim())throw new Error('每日備份尚未完成完整讀回，禁止封存');return{...clone(manifest),state:'verified',verifiedHash:readback.verifiedHash,verifiedBy:verifiedBy.trim(),verifiedByEmail:verifiedByEmail.trim().toLowerCase()};
}
