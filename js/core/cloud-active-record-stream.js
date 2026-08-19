import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {evaluateActiveRecordRuntimeControl} from './cloud-record-sync-control.js';
import {evaluateRecordSyncSafety} from './cloud-record-sync-safety-control.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

export function createActiveRecordStream({environment,onApply=()=>{}}={}){
 if(!['staging','production'].includes(environment)||typeof onApply!=='function')throw new Error('逐筆串流設定無效');
 const rows=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,new Map()])),loaded=new Set();let control=null,manifest=null,safetyControl=null,lastHash='',lastEmissionKey='',lastSnapshot=null;
 const assertCollection=collection=>{if(!FULL_RECORD_COLLECTIONS.includes(collection))throw new Error('逐筆串流集合無效')};
 const assertRuntimeDocument=(collection,id,data,{initial=false}={})=>{
  if(!data||data.collection!==collection||data.recordId!==id||data.environment!==environment||!Number.isSafeInteger(data.revision)||data.revision<1)throw new Error(`${collection}/${id} 逐筆串流文件 identity 無效`);
  if(!initial&&(data.activationEpoch!==control?.activationEpoch||typeof data.lastOperationId!=='string'||!data.lastOperationId||typeof data.deviceId!=='string'||!data.deviceId))throw new Error(`${collection}/${id} 逐筆串流操作證據缺失`);
 };
 const emit=async reason=>{
  if(loaded.size!==FULL_RECORD_COLLECTIONS.length)return{ready:false,reason:'集合尚未完整載入'};
  const eligibility=evaluateActiveRecordRuntimeControl({control,manifest,environment});if(!eligibility.eligible)return{ready:false,reason:eligibility.reason};const safety=evaluateRecordSyncSafety({control:safetyControl,environment,activationEpoch:eligibility.activationEpoch});if(!safety.valid||!safety.readAllowed)return{ready:false,reason:safety.reason};
  const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[...rows[collection]].map(([id,data])=>({id,data:clone(data)}))])),rebuilt=rebuildFullRecordShadowDb(documents,{environment}),hash=recordDataHash(rebuilt.db),emissionKey=`${hash}|${safety.state}|${safety.revision}`;if(emissionKey===lastEmissionKey)return{ready:true,unchanged:true,hash,snapshot:lastSnapshot};
  lastHash=hash;lastEmissionKey=emissionKey;lastSnapshot={...rebuilt,hash,activationEpoch:eligibility.activationEpoch,safetyState:safety.state,safetyRevision:safety.revision,writeAllowed:safety.writeAllowed,reason};await onApply(clone(lastSnapshot));return{ready:true,unchanged:false,hash,snapshot:clone(lastSnapshot)};
 };
 return{
  setActivation(nextControl,nextManifest){control=clone(nextControl);manifest=clone(nextManifest);return evaluateActiveRecordRuntimeControl({control,manifest,environment})},
  async setSafetyControl(nextSafetyControl){safetyControl=clone(nextSafetyControl);const activation=evaluateActiveRecordRuntimeControl({control,manifest,environment}),safety=evaluateRecordSyncSafety({control:safetyControl,environment,activationEpoch:activation.activationEpoch});if(!safety.valid)return safety;return{...safety,emission:await emit('safety-control')}},
 async replaceCollection(collection,documents){assertCollection(collection);if(!Array.isArray(documents))throw new Error('逐筆串流集合快照必須是陣列');const next=new Map();for(const row of documents){const id=String(row?.id??'');if(!id||next.has(id))throw new Error(`${collection} 逐筆串流包含缺少或重複 ID`);assertRuntimeDocument(collection,id,row.data,{initial:true});next.set(id,clone(row.data))}rows[collection]=next;loaded.add(collection);return emit(`initial:${collection}`)},
  async refreshCollection(collection,documents){assertCollection(collection);if(!loaded.has(collection)||!Array.isArray(documents))throw new Error(`${collection} 逐筆串流尚未載入，不能完整重新對齊`);const current=rows[collection],next=new Map();for(const row of documents){const id=String(row?.id??''),data=row?.data;if(!id||next.has(id))throw new Error(`${collection} 完整對齊包含缺少或重複 ID`);assertRuntimeDocument(collection,id,data,{initial:true});const previous=current.get(id);if(!previous)assertRuntimeDocument(collection,id,data);else if(data.revision<previous.revision||(data.revision===previous.revision&&!same(previous,data)))throw new Error(`${collection}/${id} 完整對齊 revision 倒退或同版變造`);else if(!same(previous,data))assertRuntimeDocument(collection,id,data);next.set(id,clone(data))}for(const id of current.keys())if(!next.has(id))throw new Error(`${collection}/${id} 完整對齊偵測到禁止的實體刪除`);rows[collection]=next;return emit(`refresh:${collection}`)},
  async applyChanges(collection,changes){assertCollection(collection);if(!loaded.has(collection))throw new Error(`${collection} 尚未載入初始快照`);if(!Array.isArray(changes))throw new Error('逐筆串流變更必須是陣列');for(const change of changes){const id=String(change?.id??''),type=String(change?.type??'');if(!id||!['added','modified','removed'].includes(type))throw new Error('逐筆串流變更格式無效');if(type==='removed')throw new Error(`${collection}/${id} 發生禁止的實體刪除`);assertRuntimeDocument(collection,id,change.data);const current=rows[collection].get(id);if(type==='added'&&current&&!same(current,change.data))throw new Error(`${collection}/${id} added 與既有文件衝突`);if(type==='modified'){if(!current)throw new Error(`${collection}/${id} modified 缺少既有文件`);if(change.data.revision<current.revision||(change.data.revision===current.revision&&!same(current,change.data)))throw new Error(`${collection}/${id} revision 倒退或同版變造`)}rows[collection].set(id,clone(change.data))}return emit(`changes:${collection}`)},
  async snapshot(){return emit('manual')},
  diagnostics(){const activation=evaluateActiveRecordRuntimeControl({control,manifest,environment}),safety=evaluateRecordSyncSafety({control:safetyControl,environment,activationEpoch:activation.activationEpoch});return{environment,loadedCollections:[...loaded],ready:loaded.size===FULL_RECORD_COLLECTIONS.length,hash:lastHash,activationEpoch:control?.activationEpoch||'',readTakeover:activation.readTakeover&&safety.readAllowed,writeTakeover:activation.writeTakeover&&safety.writeAllowed,safetyState:safety.state}}
 };
}
