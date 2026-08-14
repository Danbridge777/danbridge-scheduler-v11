const RUN_SCHEMA='danbridge-record-shadow-run-v2';
const ACTIVATION_SCHEMA='danbridge-record-shadow-activation-v2';

function fail(reason){return{eligible:false,reason}}
function sameCounts(left,right){return ['documentCount','activeCount','tombstoneCount'].every(key=>Number.isSafeInteger(left?.[key])&&left[key]>=0&&left[key]===right?.[key])}

export function evaluateRecordShadowReadCandidate({activation,run,readback,currentSourceHash,hashCore}={}){
 if(activation?.schema!==ACTIVATION_SCHEMA||activation?.environment!=='staging')return fail('啟用控制格式無效');
 if(run?.schema!==RUN_SCHEMA||run?.environment!=='staging'||run?.state!=='verified')return fail('verified run 格式無效');
 if(typeof hashCore!=='function')return fail('缺少核心資料 hash 函式');
 if(!activation.coreHash||!run.coreHash)return fail('缺少獨立 coreHash');
 if(activation.activeRunId!==run.runId)return fail('run identity 不符');
 if(activation.sourceHash!==run.sourceHash||activation.verifiedHash!==run.verifiedHash||run.verifiedHash!==run.sourceHash)return fail('來源 hash 不符');
 if(String(currentSourceHash||'')!==run.sourceHash)return fail('目前主資料版本已改變');
 if(activation.coreHash!==run.coreHash)return fail('控制文件 coreHash 不符');
 if(!sameCounts(activation,run)||!sameCounts(readback,run))return fail('逐筆文件數不符');
 if(readback.documentCount!==readback.activeCount+readback.tombstoneCount)return fail('逐筆文件計數無效');
 let actualCoreHash='';try{actualCoreHash=String(hashCore(readback.db))}catch{return fail('核心資料 hash 計算失敗')}
 if(actualCoreHash!==run.coreHash)return fail('逐筆資料 coreHash 不符');
 return{eligible:true,reason:'verified',runId:run.runId,sourceHash:run.sourceHash,coreHash:run.coreHash,db:readback.db};
}
