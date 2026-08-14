const RUN_SCHEMA='danbridge-record-shadow-run-v2';
const ACTIVATION_SCHEMA='danbridge-record-shadow-activation-v2';
function nonEmpty(value,label){const text=String(value??'').trim();if(!text)throw new Error(`${label} 不可空白`);return text}
function count(value,label){if(!Number.isSafeInteger(value)||value<0)throw new Error(`${label} 無效`);return value}
function identity(value){
 const runId=nonEmpty(value?.runId,'runId'),sourceHash=nonEmpty(value?.sourceHash,'sourceHash'),coreHash=nonEmpty(value?.coreHash,'coreHash'),documentCount=count(value?.documentCount,'文件數'),activeCount=count(value?.activeCount,'有效數'),tombstoneCount=count(value?.tombstoneCount,'墓碑數');
 if(documentCount!==activeCount+tombstoneCount)throw new Error('文件數與有效或墓碑數不一致');
 return{runId,sourceHash,coreHash,documentCount,activeCount,tombstoneCount};
}

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value}
export function canonicalRecordShadowCore(db){return Object.fromEntries(['lessons','students','teachers'].map(collection=>[collection,[...(db?.[collection]||[])].sort((a,b)=>String(a?.id??'').localeCompare(String(b?.id??''))).map(stable)]))}

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
