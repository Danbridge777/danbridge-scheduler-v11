const RUN_SCHEMA='danbridge-record-shadow-run-v2';
const ACTIVATION_SCHEMA='danbridge-record-shadow-activation-v2';

function fail(reason){return{eligible:false,reason}}
function sameCounts(left,right){return ['documentCount','activeCount','tombstoneCount'].every(key=>Number.isSafeInteger(left?.[key])&&left[key]>=0&&left[key]===right?.[key])}

export function evaluateRecordShadowReadCandidate({activation,run,readback,currentSourceHash,hashCore,companyId='danbridge'}={}){
 if(activation?.schema!==ACTIVATION_SCHEMA||activation?.environment!=='staging')return fail('啟用控制格式無效');
 if(run?.schema!==RUN_SCHEMA||run?.environment!=='staging'||run?.state!=='verified')return fail('verified run 格式無效');
 if(activation.companyId!==companyId||run.companyId!==companyId)return fail('company identity 不符');
 if(typeof hashCore!=='function')return fail('缺少核心資料 hash 函式');
 if(typeof activation.sourceHash!=='string'||typeof run.sourceHash!=='string'||typeof activation.coreHash!=='string'||typeof run.coreHash!=='string'||!activation.sourceHash||!run.sourceHash||!activation.coreHash||!run.coreHash)return fail('缺少有效 hash');
 if(activation.activeRunId!==run.runId)return fail('run identity 不符');
 if(activation.sourceHash!==run.sourceHash||activation.verifiedHash!==run.verifiedHash||run.verifiedHash!==run.sourceHash)return fail('來源 hash 不符');
 if(String(currentSourceHash||'')!==run.sourceHash)return fail('目前主資料版本已改變');
 if(activation.coreHash!==run.coreHash)return fail('控制文件 coreHash 不符');
 if(!sameCounts(activation,run)||!sameCounts(readback,run))return fail('逐筆文件數不符');
 if(readback.documentCount!==readback.activeCount+readback.tombstoneCount)return fail('逐筆文件計數無效');
 const collections=['lessons','students','teachers'];
 if(!readback.db||collections.some(collection=>!Array.isArray(readback.db[collection])))return fail('核心讀回格式無效');
 if(Object.keys(readback.db).some(collection=>!collections.includes(collection)))return fail('核心讀回包含未知集合');
 const actualActiveCount=collections.reduce((sum,collection)=>sum+readback.db[collection].length,0);
 if(actualActiveCount!==readback.activeCount)return fail('核心有效筆數不符');
 for(const collection of collections){const ids=readback.db[collection].map(row=>String(row?.id??''));if(ids.some(id=>!id||id.trim()!==id||id.includes('/')||id==='.'||id==='..'||/^__.*__$/.test(id))||new Set(ids).size!==ids.length)return fail('核心 ID 無效或重複')}
 let actualCoreHash='';try{actualCoreHash=String(hashCore(readback.db))}catch{return fail('核心資料 hash 計算失敗')}
 if(actualCoreHash!==run.coreHash)return fail('逐筆資料 coreHash 不符');
 return{eligible:true,reason:'verified',runId:run.runId,sourceHash:run.sourceHash,coreHash:run.coreHash,db:readback.db};
}
