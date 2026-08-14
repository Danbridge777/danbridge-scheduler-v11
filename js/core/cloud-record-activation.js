const MANIFEST_SCHEMA='danbridge-record-candidate-manifest-v1';
const ACTIVATION_SCHEMA='danbridge-record-activation-v1';
const ENVIRONMENTS=new Set(['staging','production']);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.trim().length>0;
const fail=message=>{throw new Error(message)};

function validateIdentity(value,{kind,environment}={}){
 if(!value||value.schema!==MANIFEST_SCHEMA||value.kind!==kind)fail(`${kind} manifest 格式無效`);
 if(!ENVIRONMENTS.has(environment)||value.environment!==environment||value.companyId!=='danbridge')fail(`${kind} manifest identity 不符`);
 if(value.state!=='verified'||value.verified!==true||!text(value.sourceHash)||value.verifiedHash!==value.sourceHash)fail(`${kind} manifest 尚未完整驗證`);
}

export function buildFullRecordCandidateManifest({environment,manifestId,sourceHash,collectionCount,documentCount,activeCount,tombstoneCount}={}){
 if(!ENVIRONMENTS.has(environment)||!text(manifestId)||!text(sourceHash))fail('full manifest 輸入無效');
 if(!integer(collectionCount)||!integer(documentCount)||!integer(activeCount)||!integer(tombstoneCount)||documentCount!==activeCount+tombstoneCount)fail('full manifest 筆數無效');
 return{schema:MANIFEST_SCHEMA,kind:'full-records',environment,companyId:'danbridge',state:'verified',verified:true,manifestId,sourceHash,verifiedHash:sourceHash,collectionCount,documentCount,activeCount,tombstoneCount};
}

export function buildRoleViewCandidateManifest({environment,manifestId,runId,sourceHash,viewCount,documentCount}={}){
 if(!ENVIRONMENTS.has(environment)||!text(manifestId)||!text(runId)||!text(sourceHash)||!integer(viewCount)||viewCount<1||!integer(documentCount)||documentCount<viewCount)fail('role manifest 輸入無效');
 return{schema:MANIFEST_SCHEMA,kind:'role-views',environment,companyId:'danbridge',state:'verified',verified:true,manifestId,runId,sourceHash,verifiedHash:sourceHash,viewCount,documentCount};
}

export function buildAtomicRecordActivation({environment,fullManifest,roleManifest,currentSourceHash}={}){
 validateIdentity(fullManifest,{kind:'full-records',environment});
 validateIdentity(roleManifest,{kind:'role-views',environment});
 if(!text(currentSourceHash)||fullManifest.sourceHash!==currentSourceHash||roleManifest.sourceHash!==currentSourceHash)fail('啟用來源版本已改變');
 if(!text(fullManifest.manifestId)||!text(roleManifest.manifestId)||!text(roleManifest.runId))fail('候選 manifest identity 無效');
 return{schema:ACTIVATION_SCHEMA,environment,companyId:'danbridge',state:'verified',sourceHash:currentSourceHash,fullManifestId:fullManifest.manifestId,roleManifestId:roleManifest.manifestId,fullVerifiedHash:fullManifest.verifiedHash,roleVerifiedHash:roleManifest.verifiedHash,roleRunId:roleManifest.runId,collectionCount:fullManifest.collectionCount,documentCount:fullManifest.documentCount,activeCount:fullManifest.activeCount,tombstoneCount:fullManifest.tombstoneCount,viewCount:roleManifest.viewCount,roleDocumentCount:roleManifest.documentCount,readTakeover:false,writeTakeover:false};
}

export function evaluateAtomicRecordActivation({activation,fullManifest,roleManifest,currentSourceHash}={}){
 try{
  const expected=buildAtomicRecordActivation({environment:activation?.environment,fullManifest,roleManifest,currentSourceHash});
  if(!activation||activation.schema!==ACTIVATION_SCHEMA||activation.companyId!=='danbridge'||activation.state!=='verified')fail('啟用控制格式無效');
  for(const key of Object.keys(expected))if(activation[key]!==expected[key])fail(`啟用控制 ${key} 不符`);
  return{eligible:true,reason:'',readTakeover:false,writeTakeover:false};
 }catch(error){return{eligible:false,reason:String(error?.message||error),readTakeover:false,writeTakeover:false}}
}
