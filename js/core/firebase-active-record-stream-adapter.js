import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {createActiveRecordStream} from './cloud-active-record-stream.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));

export function createFirebaseActiveRecordStreamAdapter({environment='staging',subscribeDocument,subscribeCollection,onApply,onState=()=>{}}={}){
 if(environment!=='staging'||typeof subscribeDocument!=='function'||typeof subscribeCollection!=='function'||typeof onApply!=='function'||typeof onState!=='function')throw new Error('逐筆 Firestore 串流 adapter 設定無效');
 let rootUnsubscribe=null,activeUnsubscribes=[],generation=0,generationKey='',control=null,manifest=null,safety=null,stream=null,stopped=false,blocked=false,chain=Promise.resolve(),lastState='idle',lastError='';
 const state=(next,extra={})=>{lastState=next;lastError=extra.error||'';try{onState({state:next,error:lastError,generationKey,...extra})}catch{}};
 const unsubscribeActive=()=>{generation++;for(const unsubscribe of activeUnsubscribes.splice(0))try{unsubscribe?.()}catch{}stream=null;manifest=null;safety=null;generationKey=''};
 const block=error=>{blocked=true;lastError=String(error?.message||error);state('blocked',{error:lastError});unsubscribeActive()};
 const enqueue=(work,token)=>{chain=chain.then(async()=>{if(stopped||blocked||token!==generation)return;await work()}).catch(block);return chain};
 const docValue=value=>value&&typeof value==='object'&&('data'in value||'exists'in value)?(value.exists===false?null:value.data??null):value;
 const pending=value=>Boolean(value?.hasPendingWrites);
 const maybeActivate=async token=>{if(!control||!manifest||!stream||token!==generation)return;const result=stream.setActivation(control,manifest);if(!result.eligible)throw new Error(result.reason||'逐筆串流啟用證據無效');if(safety){const safetyResult=await stream.setSafetyControl(safety);if(!safetyResult.valid)throw new Error(safetyResult.reason||'逐筆串流安全控制無效');if(safetyResult.emission?.ready)return}state('loading',{activationEpoch:control.activationEpoch})};
 const bind=nextControl=>{
  if(!nextControl){unsubscribeActive();control=null;blocked=false;state('legacy');return}
  if(nextControl.schema!=='danbridge-record-sync-control-v1'||nextControl.environment!==environment||nextControl.companyId!=='danbridge'||nextControl.state!=='active'||nextControl.readTakeover!==true||nextControl.writeTakeover!==true||typeof nextControl.activationEpoch!=='string'||typeof nextControl.manifestHash!=='string')throw new Error('逐筆 Firestore 控制文件無效');
  const key=`${nextControl.activationEpoch}:${nextControl.manifestHash}`;if(key===generationKey){if(!same(control,nextControl))throw new Error('逐筆 Firestore 控制同 identity 被改寫');return}
  unsubscribeActive();blocked=false;control=clone(nextControl);generationKey=key;const token=generation;stream=createActiveRecordStream({environment,onApply:async snapshot=>{if(token!==generation||stopped)return;await onApply(snapshot);state(snapshot.writeAllowed?'ready':'paused',{activationEpoch:snapshot.activationEpoch,hash:snapshot.hash,safetyRevision:snapshot.safetyRevision})}});
  const manifestPath=`stagingRecordSyncActivationManifests/danbridge/manifests/${control.manifestHash}`,safetyPath='stagingRecordSyncSafetyControls/danbridge';
  activeUnsubscribes.push(subscribeDocument(manifestPath,value=>enqueue(async()=>{if(pending(value))return;manifest=clone(docValue(value));if(!manifest)throw new Error('逐筆串流 manifest 不存在');await maybeActivate(token)},token),error=>block(error)));
  activeUnsubscribes.push(subscribeDocument(safetyPath,value=>enqueue(async()=>{if(pending(value))return;safety=clone(docValue(value));if(!safety)throw new Error('逐筆串流安全控制不存在');if(manifest)await maybeActivate(token)},token),error=>block(error)));
  for(const collectionName of FULL_RECORD_COLLECTIONS){let loaded=false,refreshRequired=false;const path=`stagingFullRecordShadows/danbridge/collections/${collectionName}/records`;activeUnsubscribes.push(subscribeCollection(path,value=>enqueue(async()=>{if(pending(value)){if(loaded)refreshRequired=true;return}if(!value||!Array.isArray(value.documents)||!Array.isArray(value.changes))throw new Error(`${collectionName} Firestore 串流快照格式無效`);const documents=value.documents.map(row=>({id:String(row.id),data:clone(row.data)}));if(!loaded){await stream.replaceCollection(collectionName,documents);loaded=true}else if(refreshRequired){refreshRequired=false;await stream.refreshCollection(collectionName,documents)}else if(value.changes.length)await stream.applyChanges(collectionName,value.changes.map(change=>({type:change.type,id:String(change.id),data:clone(change.data)})))},token),error=>block(error)))}
  state('loading',{activationEpoch:control.activationEpoch});
 };
 const start=()=>{if(stopped)throw new Error('逐筆 Firestore 串流 adapter 已停止');if(rootUnsubscribe)return;rootUnsubscribe=subscribeDocument('stagingRecordSyncControls/danbridge',value=>{if(pending(value))return;try{bind(clone(docValue(value)))}catch(error){block(error)}},error=>block(error));state('checking')};
 const stop=()=>{stopped=true;try{rootUnsubscribe?.()}catch{}rootUnsubscribe=null;unsubscribeActive();state('stopped')};
 return{enabled:true,start,stop,diagnostics:()=>({environment,state:lastState,error:lastError,generationKey,blocked,activeSubscriptionCount:activeUnsubscribes.length,stream:stream?.diagnostics?.()||null})};
}
