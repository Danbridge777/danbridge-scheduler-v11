const clone=value=>JSON.parse(JSON.stringify(value));

export function decideRecordReadTakeover({environment,activationEvaluation,legacyHash,recordHash,recordDb,exercise=false}={}){
 if(environment!=='staging')return{source:'legacy',reason:'逐筆讀取接管演練只允許 staging',db:null};
 if(!activationEvaluation?.eligible)return{source:'legacy',reason:String(activationEvaluation?.reason||'原子啟用控制未通過'),db:null};
 if(!legacyHash||recordHash!==legacyHash)return{source:'legacy',reason:'逐筆資料版本與現行主資料不一致',db:null};
 if(!recordDb||typeof recordDb!=='object')return{source:'legacy',reason:'逐筆資料讀回為空',db:null};
 if(!exercise&&activationEvaluation.readTakeover!==true)return{source:'legacy',reason:'逐筆讀取尚未啟用',db:null};
 return{source:'records',reason:'',db:clone(recordDb)};
}
