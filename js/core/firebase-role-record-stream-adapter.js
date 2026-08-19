import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {assertRoleRecordViewControl} from './cloud-role-record-view.js';
import {createRoleRecordStream} from './cloud-role-record-stream.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const valueOf=value=>value&&typeof value==='object'&&('data'in value||'exists'in value)?(value.exists===false?null:value.data??null):value;

export function createFirebaseRoleRecordStreamAdapter({environment='staging',identity,subscribeDocument,subscribeCollection,onApply,onState=()=>{}}={}){
 if(environment!=='staging'||typeof subscribeDocument!=='function'||typeof subscribeCollection!=='function'||typeof onApply!=='function'||typeof onState!=='function')throw new Error('角色逐筆 Firestore 串流 adapter 設定無效');let controlUnsubscribe=null,safetyUnsubscribe=null,collectionUnsubscribes=[],generation=0,stream=null,control=null,safety=null,stopped=false,blocked=false,chain=Promise.resolve(),lastState='idle',lastError='';
 const state=(next,extra={})=>{lastState=next;lastError=extra.error||'';try{onState({state:next,error:lastError,viewKey:control?.viewKey||'',...extra})}catch{}};
 const unsubscribeCollections=()=>{generation++;for(const unsubscribe of collectionUnsubscribes.splice(0))try{unsubscribe?.()}catch{}stream=null};
 const unsubscribeAll=()=>{unsubscribeCollections();try{controlUnsubscribe?.()}catch{}try{safetyUnsubscribe?.()}catch{}controlUnsubscribe=null;safetyUnsubscribe=null};
 const block=error=>{blocked=true;lastError=String(error?.message||error);state('blocked',{error:lastError});unsubscribeAll()};
 const pending=value=>Boolean(value?.hasPendingWrites);
 const enqueue=(work,token=null)=>{chain=chain.then(async()=>{if(stopped||blocked||(token!==null&&token!==generation))return;await work()}).catch(block);return chain};
 const resultState=result=>{if(result?.ready)return state(result.snapshot?.writeAllowed?'ready':'paused',{controlRevision:result.snapshot?.controlRevision||0,hash:result.snapshot?.viewHash||''});state('waiting',{reason:result?.reason||'角色逐筆資料等待完整發布'})};
 const bindCollections=async nextControl=>{
  unsubscribeCollections();control=clone(nextControl);const token=generation;stream=createRoleRecordStream({environment,identity,onApply:async snapshot=>{if(token!==generation||stopped)return;await onApply(snapshot)}});await stream.setControl(control);if(safety)await stream.setSafetyControl(safety);
  for(const collectionName of FULL_RECORD_COLLECTIONS){let loaded=false;const path=`stagingRoleRecordViews/danbridge/views/${control.viewKey}/collections/${collectionName}/records`;collectionUnsubscribes.push(subscribeCollection(path,value=>enqueue(async()=>{if(pending(value))return;if(!value||!Array.isArray(value.documents)||!Array.isArray(value.changes))throw new Error(`${collectionName} 角色 Firestore 串流快照格式無效`);const result=!loaded?await stream.replaceCollection(collectionName,value.documents.map(row=>({id:String(row.id),data:clone(row.data)}))):(value.changes.length?await stream.applyChanges(collectionName,value.changes.map(change=>({type:change.type,id:String(change.id),data:clone(change.data)}))):await stream.snapshot());loaded=true;resultState(result)},token),error=>block(error)))}state('loading',{controlRevision:control.revision});
 };
 const handleControl=async value=>{if(pending(value))return;const next=clone(valueOf(value));if(!next){unsubscribeCollections();control=null;blocked=false;state('legacy');return}assertRoleRecordViewControl(next,{environment,identity});if(!stream||next.viewKey!==control?.viewKey){await bindCollections(next);return}const result=await stream.setControl(next);control=clone(next);resultState(result)};
 const handleSafety=async value=>{if(pending(value))return;const next=clone(valueOf(value));if(!next){if(control)throw new Error('角色逐筆安全控制不存在');return}safety=next;if(stream)resultState(await stream.setSafetyControl(safety))};
 const start=()=>{if(stopped)throw new Error('角色逐筆 Firestore 串流 adapter 已停止');if(controlUnsubscribe)return;const email=String(identity?.email||'').trim().toLowerCase();controlUnsubscribe=subscribeDocument(`stagingRoleRecordViewControls/danbridge/views/${email}`,value=>enqueue(()=>handleControl(value)),error=>block(error));safetyUnsubscribe=subscribeDocument('stagingRecordSyncSafetyControls/danbridge',value=>enqueue(()=>handleSafety(value)),error=>block(error));state('checking')};
 const stop=()=>{stopped=true;unsubscribeAll();state('stopped')};
 return{enabled:true,start,stop,diagnostics:()=>({environment,state:lastState,error:lastError,blocked,viewKey:control?.viewKey||'',activeCollectionSubscriptions:collectionUnsubscribes.length,stream:stream?.diagnostics?.()||null})};
}
