import {FULL_RECORD_COLLECTIONS, materializeFullRecordDb} from './cloud-full-record-shadow.js';

const RUN_SCHEMA='danbridge-record-shadow-run-v2';
const ACTIVATION_SCHEMA='danbridge-record-shadow-activation-v2';
const RECORD_SHADOW_RUN_COLLECTIONS=Object.freeze([...FULL_RECORD_COLLECTIONS]);
export const LEGACY_RECORD_SHADOW_CORE_COLLECTIONS=Object.freeze(['lessons','students','teachers']);
const RECORD_SHADOW_RUN_COLLECTION_SET=Object.fromEntries(RECORD_SHADOW_RUN_COLLECTIONS.map(collection=>[collection,true]));
const recordCountValidationError='全資料逐筆核心資料必須同時包含 16 個集合且只能包含既定集合';

function normalizeFullRecordRows(value){
	if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('核心資料格式無效');
	for(const key of Object.keys(value)){
		if(!RECORD_SHADOW_RUN_COLLECTION_SET[key]){
			throw new Error(`${recordCountValidationError}，發現未知集合 ${key}`);
		}
	}
	const prepared={};
	for(const collection of RECORD_SHADOW_RUN_COLLECTIONS){
		if(!Object.prototype.hasOwnProperty.call(value,collection)){
			throw new Error(`${recordCountValidationError}，缺少 ${collection}`);
		}
		if(!Array.isArray(value[collection])){
			throw new Error(`${collection} 核心資料必須是陣列`);
		}
		prepared[collection]=value[collection];
	}
	return prepared;
}

function nonEmpty(value,label){const text=String(value??'').trim();if(!text)throw new Error(`${label} 不可空白`);return text}
function count(value,label){if(!Number.isSafeInteger(value)||value<0)throw new Error(`${label} 無效`);return value}
function identity(value){
 const runId=nonEmpty(value?.runId,'runId'),sourceHash=nonEmpty(value?.sourceHash,'sourceHash'),coreHash=nonEmpty(value?.coreHash,'coreHash'),documentCount=count(value?.documentCount,'文件數'),activeCount=count(value?.activeCount,'有效數'),tombstoneCount=count(value?.tombstoneCount,'墓碑數');
 if(documentCount!==activeCount+tombstoneCount)throw new Error('文件數與有效或墓碑數不一致');
 return{runId,sourceHash,coreHash,documentCount,activeCount,tombstoneCount};
}

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){if(typeof value.toMillis==='function')return{__timestampMillis:value.toMillis()};return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]))}return value}
function compareId(left,right){const a=String(left?.id??''),b=String(right?.id??'');return a<b?-1:a>b?1:0}
function validId(id){return id&&id.trim()===id&&!id.includes('/')&&id!=='.'&&id!=='..'&&!/^__.*__$/.test(id)&&new TextEncoder().encode(id).length<=1500}

function sortCanonicalCollections(preparedDb){
	const output={};
	for(const collection of RECORD_SHADOW_RUN_COLLECTIONS){
		const rows=[...preparedDb[collection]];
		const seen=new Set();
		for(const row of rows){
			const hasInvalidId=collection!=='changes'&&(!validId(String(row?.id))||seen.has(String(row.id)));
			if(!row||typeof row!=='object'||Array.isArray(row)||hasInvalidId){throw new Error(`${collection} 核心資料 ID 無效或重複`);}
			if(collection!=='changes')seen.add(String(row.id));
		}
		output[collection]=collection==='changes'?[...rows]:[...rows].sort(compareId);
	}
	return output;
}

function canonicalRows(db,collection){
	const rows=db?.[collection];
	if(!Array.isArray(rows))throw new Error(`${collection} 核心資料必須是陣列`);
	const seen=new Set();
	for(const row of rows){
		const id=String(row?.id??'');
		if(!row||typeof row!=='object'||Array.isArray(row)||!validId(id)||seen.has(id)){
			throw new Error(`${collection} 核心資料 ID 無效或重複`);
		}
		seen.add(id);
	}
	return[...rows].sort(compareId).map(stable);
}

export function extractFullRecordShadowSyncResult(result){
	if(!result||typeof result!=='object')throw new Error('逐筆同步結果不正確');
	if(!result.db||typeof result.db!=='object')throw new Error('逐筆同步結果缺少 db 欄位');
	if(!Number.isSafeInteger(result.documentCount)||result.documentCount<0)throw new Error('逐筆同步結果文件數無效');
	if(!Number.isSafeInteger(result.activeCount)||result.activeCount<0)throw new Error('逐筆同步結果有效數無效');
	if(!Number.isSafeInteger(result.tombstoneCount)||result.tombstoneCount<0)throw new Error('逐筆同步結果墓碑數無效');
	return{db:result.db,documents:result.documents,documentCount:result.documentCount,activeCount:result.activeCount,tombstoneCount:result.tombstoneCount};
}

export function buildFullRecordShadowRunIdentity(targetDb,current,options={}){
	const hashTargetDb=typeof options.hashTargetDb==='function'?options.hashTargetDb:undefined;
	const hashCanonicalDb=typeof options.hashCanonicalDb==='function'?options.hashCanonicalDb:undefined;
	const canonicalTargetDb=canonicalRecordShadowCore(targetDb);
	const sourceHash=hashTargetDb?hashTargetDb(targetDb):'';
	const coreHash=hashCanonicalDb?hashCanonicalDb(canonicalTargetDb):'';
	const counts=buildFullRecordShadowRunCounts(current,canonicalTargetDb);
	return{sourceHash,coreHash,...counts,canonicalTargetDb};
}

export function buildFullRecordShadowRunCounts(current,canonicalTargetDb){
	let documentCount=0,activeCount=0;
	for(const collectionName of FULL_RECORD_COLLECTIONS){
		const ids=new Set();
		for(const row of current?.[collectionName]||[]){
			if(!row||typeof row!=='object')throw new Error('逐筆 run 核心資料來源格式不正確');
			if(typeof row.id!=='string'||!row.id)throw new Error('逐筆 run 核心資料來源缺少文件 ID');
			ids.add(String(row.id));
		}
		for(const row of canonicalTargetDb?.[collectionName]||[]){
			if(!row||typeof row!=='object')throw new Error('逐筆 run 核心資料來源格式不正確');
			if(typeof row.recordId!=='string'||!row.recordId)throw new Error('逐筆 run 核心資料來源缺少 recordId');
			ids.add(String(row.recordId));
		}
		documentCount+=ids.size;
		activeCount+=(canonicalTargetDb?.[collectionName]||[]).length;
	}
	return{documentCount,activeCount,tombstoneCount:documentCount-activeCount};
}

export function canonicalRecordShadowCore(db){
	const prepared=normalizeFullRecordRows(db);
	const sorted=sortCanonicalCollections(prepared);
	const materialized=materializeFullRecordDb(sorted);
	return Object.fromEntries(RECORD_SHADOW_RUN_COLLECTIONS.map(collection=>{
		const rows=collection==='changes'?[...materialized[collection]].sort((left,right)=>(left.recordIndex||0)-(right.recordIndex||0)):[...materialized[collection]];
		return[collection,rows.map(row=>({...row,record:stable(row.record)}))];
	}));
}

export function canonicalLegacyRecordShadowCore(db){
 return Object.fromEntries(LEGACY_RECORD_SHADOW_CORE_COLLECTIONS.map(collection=>[collection,canonicalRows(db,collection)]));
}

export function buildRecordShadowRunManifest(value){return{schema:RUN_SCHEMA,environment:'staging',state:'writing',...identity(value)}}

export function verifyRecordShadowRun(manifest,readback){
 if(manifest?.schema!==RUN_SCHEMA||manifest?.environment!=='staging'||manifest?.state!=='writing')throw new Error('run manifest 狀態無效');
 const expected=identity(manifest),actual=identity(readback);
 if(actual.runId!==expected.runId)throw new Error('run identity 不符');
 if(actual.sourceHash!==expected.sourceHash)throw new Error('run hash 不符');
 if(actual.coreHash!==expected.coreHash)throw new Error('run coreHash 不符');
 if(actual.documentCount!==expected.documentCount)throw new Error('run 文件數不符');
 if(actual.activeCount!==expected.activeCount||actual.tombstoneCount!==expected.tombstoneCount)throw new Error('run 有效或墓碑數不符');
 return{...manifest,state:'verified',verifiedHash:expected.sourceHash};
}

export function buildRecordShadowActivation(manifest,{currentSourceHash}={}){
 if(manifest?.schema!==RUN_SCHEMA||manifest?.environment!=='staging'||manifest?.state!=='verified')throw new Error('run 尚未 verified，禁止啟用');
 const run=identity(manifest);
 if(manifest.verifiedHash!==run.sourceHash)throw new Error('run verified hash 不符');
 if(nonEmpty(currentSourceHash,'目前來源 hash')!==run.sourceHash)throw new Error('來源版本已改變，禁止啟用舊 run');
 return{schema:ACTIVATION_SCHEMA,environment:'staging',activeRunId:run.runId,sourceHash:run.sourceHash,verifiedHash:manifest.verifiedHash,coreHash:run.coreHash,documentCount:run.documentCount,activeCount:run.activeCount,tombstoneCount:run.tombstoneCount};
}
