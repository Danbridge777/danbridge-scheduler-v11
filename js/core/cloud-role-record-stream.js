import {FULL_RECORD_COLLECTIONS} from './cloud-full-record-shadow.js';
import {assertRoleRecordViewControl,assertRoleRecordViewDocument,rebuildRoleRecordViewDb} from './cloud-role-record-view.js';
import {evaluateRecordSyncSafety} from './cloud-record-sync-safety-control.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&value!=='0'.repeat(64);

function evaluateRoleRuntimeSafety(control,{environment,activationEpoch}={}){
 if(control?.schema==='danbridge-record-sync-v2-structural-active-control-v2'){
  const valid=environment==='staging'&&control.environment===environment&&control.companyId==='danbridge'&&control.activationEpoch===activationEpoch&&control.state==='structural-active-transition-awaiting-native-fixed-path-atomic-cutover'&&control.writerProtocol==='v2'&&control.writerGeneration===2&&control.readAllowed===true&&typeof control.writeAllowed==='boolean'&&control.readTakeoverEnabled===true&&typeof control.writeTakeoverEnabled==='boolean'&&typeof control.acceptNewSessions==='boolean'&&typeof control.acceptNewMutations==='boolean'&&typeof control.allowAuditAppends==='boolean'&&digest(control.controlHash);
  if(!valid)return{valid:false,state:'blocked',readAllowed:false,writeAllowed:false,revision:0,reason:'角色 V2 runtime control 無效'};
  const writeAllowed=control.writeAllowed===true&&control.writeTakeoverEnabled===true&&control.acceptNewMutations===true;
  return{valid:true,state:writeAllowed?'active':'paused',readAllowed:true,writeAllowed,revision:control.writerGeneration,reason:writeAllowed?'':'V2 寫入已安全暫停'};
 }
 return evaluateRecordSyncSafety({control,environment,activationEpoch});
}

export function createRoleRecordStream({environment='staging',identity,onApply=()=>{}}={}){
 if(environment!=='staging'||typeof onApply!=='function')throw new Error('角色逐筆串流設定無效');const rows=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,new Map()])),loaded=new Set();let control=null,safetyControl=null,lastControl=null,lastEmissionKey='',lastSnapshot=null;
 const assertCollection=collection=>{if(!FULL_RECORD_COLLECTIONS.includes(collection))throw new Error('角色逐筆串流集合無效')};
 const countsMatch=rebuilt=>control.viewHash===rebuilt.viewHash&&control.documentCount===rebuilt.documentCount&&control.activeCount===rebuilt.activeCount&&control.tombstoneCount===rebuilt.tombstoneCount&&same(control.collectionActiveCounts,rebuilt.collectionActiveCounts)&&same(control.collectionDocumentCounts,rebuilt.collectionDocumentCounts)&&same(control.collectionTombstoneCounts,rebuilt.collectionTombstoneCounts);
 const emit=async reason=>{
  if(!control||loaded.size!==FULL_RECORD_COLLECTIONS.length)return{ready:false,waiting:true,reason:'角色逐筆集合尚未完整載入',snapshot:lastSnapshot};const safety=evaluateRoleRuntimeSafety(safetyControl,{environment,activationEpoch:control.activationEpoch});if(!safety.valid||!safety.readAllowed)return{ready:false,waiting:true,reason:safety.reason||'角色逐筆安全控制尚未就緒',snapshot:lastSnapshot};const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[...rows[collection]].map(([id,data])=>({id,data:clone(data)}))])),rebuilt=rebuildRoleRecordViewDb(documents,{environment,identity,activationEpoch:control.activationEpoch,viewKey:control.viewKey,allowIncompleteChanges:true});if(!countsMatch(rebuilt))return{ready:false,waiting:true,reason:'角色逐筆資料尚未與發布控制完整一致',snapshot:lastSnapshot};const emissionKey=`${control.viewKey}|${control.revision}|${control.viewHash}|${safety.state}|${safety.revision}`;if(emissionKey===lastEmissionKey)return{ready:true,unchanged:true,snapshot:lastSnapshot};lastEmissionKey=emissionKey;lastSnapshot={...rebuilt,controlRevision:control.revision,sourceRecordRevision:control.revision,publishId:control.publishId,sourceRecordHash:control.sourceRecordHash,activationEpoch:control.activationEpoch,viewKey:control.viewKey,safetyState:safety.state,safetyRevision:safety.revision,writeAllowed:safety.writeAllowed,reason};await onApply(clone(lastSnapshot));return{ready:true,unchanged:false,snapshot:clone(lastSnapshot)};
 };
 const setControl=async next=>{assertRoleRecordViewControl(next,{environment,identity});if(lastControl){if(next.viewKey!==lastControl.viewKey)throw new Error('角色逐筆串流不能在同一實例切換 viewKey');if(next.revision<lastControl.revision||(next.revision===lastControl.revision&&!same(next,lastControl)))throw new Error('角色逐筆控制 revision 倒退或同版變造')}control=clone(next);lastControl=clone(next);return emit('control')};
 return{
  setControl,
  async setSafetyControl(next){safetyControl=clone(next);return emit('safety-control')},
  async replaceCollection(collection,documents){assertCollection(collection);if(!control)throw new Error('角色逐筆串流尚未取得控制');if(!Array.isArray(documents))throw new Error('角色逐筆集合快照格式無效');const next=new Map();for(const row of documents){const id=String(row?.id??'');if(!id||next.has(id))throw new Error(`${collection} 角色逐筆包含缺少或重複 ID`);assertRoleRecordViewDocument(row.data,{environment,viewKey:control.viewKey,identity,activationEpoch:control.activationEpoch,collection,recordId:id});next.set(id,clone(row.data))}rows[collection]=next;loaded.add(collection);return emit(`initial:${collection}`)},
  async applyChanges(collection,changes){assertCollection(collection);if(!control||!loaded.has(collection)||!Array.isArray(changes))throw new Error(`${collection} 角色逐筆變更尚未可套用`);for(const change of changes){const id=String(change?.id??''),type=String(change?.type??'');if(!id||!['added','modified','removed'].includes(type))throw new Error('角色逐筆變更格式無效');if(type==='removed')throw new Error(`${collection}/${id} 發生禁止的實體刪除`);assertRoleRecordViewDocument(change.data,{environment,viewKey:control.viewKey,identity,activationEpoch:control.activationEpoch,collection,recordId:id});const current=rows[collection].get(id);if(type==='added'&&current&&!same(current,change.data))throw new Error(`${collection}/${id} added 與既有文件衝突`);if(type==='modified'){if(!current)throw new Error(`${collection}/${id} modified 缺少既有文件`);if(change.data.revision<current.revision||(change.data.revision===current.revision&&!same(current,change.data)))throw new Error(`${collection}/${id} revision 倒退或同版變造`)}rows[collection].set(id,clone(change.data))}return emit(`changes:${collection}`)},
  snapshot:()=>emit('manual'),
  diagnostics:()=>({environment,viewKey:control?.viewKey||'',controlRevision:control?.revision||0,loadedCollections:[...loaded],ready:loaded.size===FULL_RECORD_COLLECTIONS.length,lastViewHash:lastSnapshot?.viewHash||'',writeAllowed:lastSnapshot?.writeAllowed??false})
 };
}
