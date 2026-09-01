import {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb} from './cloud-full-record-shadow.js';
import {applyActiveRecordOperation} from './cloud-active-record-sync.js';
import {recordDataHash} from './cloud-record-data-hash.js';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {splitRecordConflicts} from './cloud-record-three-way-merge.js';
import {PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH,productionRecordPath,productionRecordCollectionPath,productionRecordReceiptPath,productionConflictBackupPath,assertProductionRecordRuntimeControl,assertProductionRecordRuntimeSafety} from './cloud-production-record-runtime.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const valueOf=snapshot=>typeof snapshot?.exists==='function'?(snapshot.exists()?snapshot.data():null):(snapshot&&typeof snapshot==='object'&&('exists'in snapshot||'data'in snapshot)?(snapshot.exists===false?null:snapshot.data??null):snapshot??null);
const token=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=1500&&!/[\u0000-\u001f/]/.test(value);
const stable=value=>Array.isArray(value)?value.map(stable):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value);
const same=(left,right)=>JSON.stringify(stable(left))===JSON.stringify(stable(right));

export function createFirebaseProductionRecordOperationAdapter({runTransaction,serverTimestamp,actor,role}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('production 逐筆 operation adapter 注入不完整');
 const email=String(actor?.email||'').trim().toLowerCase(),guard=()=>{if(role!=='owner'||!token(actor?.uid)||!token(email))throw new Error('production 逐筆 operation 只允許 Owner')};
 return{enabled:role==='owner',async apply(operation){
  guard();if(!operation||operation.environment!=='production'||!token(operation.activationEpoch)||!token(operation.operationId)||!FULL_RECORD_COLLECTIONS.includes(operation.collection)||!token(operation.recordId))throw new Error('production 逐筆 operation identity 無效');
  const recordPath=productionRecordPath(operation.collection,operation.recordId),receiptPath=productionRecordReceiptPath(operation.activationEpoch,operation.operationId);if(operation.path!==recordPath)throw new Error('production 逐筆 operation 路徑不符');
  const operationHash=sha256Canonical(Object.fromEntries(Object.entries(operation).filter(([key])=>key!=='path')));
  return runTransaction(async transaction=>{
   const [controlSnapshot,safetySnapshot,recordSnapshot,receiptSnapshot]=await Promise.all([transaction.get(PRODUCTION_RECORD_CONTROL_PATH),transaction.get(PRODUCTION_RECORD_SAFETY_PATH),transaction.get(recordPath),transaction.get(receiptPath)]),control=assertProductionRecordRuntimeControl(valueOf(controlSnapshot)),safety=assertProductionRecordRuntimeSafety(valueOf(safetySnapshot),{activationEpoch:operation.activationEpoch}),current=valueOf(recordSnapshot),receipt=valueOf(receiptSnapshot);
   if(control.activationEpoch!==operation.activationEpoch||control.writeTakeover!==true||safety.state!=='active'||safety.writeAllowed!==true)throw new Error('production 逐筆同步已安全暫停');
   if(receipt){if(receipt.schema!=='danbridge-production-record-operation-receipt-v1'||receipt.activationEpoch!==operation.activationEpoch||receipt.operationId!==operation.operationId||receipt.operationHash!==operationHash||receipt.collection!==operation.collection||receipt.recordId!==operation.recordId||receipt.revision!==operation.nextRevision||receipt.deleted!==operation.payload.deleted)throw new Error('production 逐筆 receipt identity 衝突');return{kind:'duplicate',write:false,revision:receipt.revision,path:recordPath,receiptPath}}
   const result=applyActiveRecordOperation(current,operation),audit={updatedAt:serverTimestamp(),updatedBy:actor.uid,updatedByEmail:email};
   if(result.write){const payload=clone(result.payload);delete payload.lastOperationId;delete payload.deviceId;delete payload.activationEpoch;transaction.set(recordPath,{...payload,...audit});transaction.set(receiptPath,{schema:'danbridge-production-record-operation-receipt-v1',environment:'production',companyId:'danbridge',activationEpoch:operation.activationEpoch,operationId:operation.operationId,operationHash,collection:operation.collection,recordId:operation.recordId,revision:operation.nextRevision,deleted:operation.payload.deleted,deviceId:operation.deviceId,...audit})}
   return{...result,path:recordPath,receiptPath};
  });
 }};
}

export function createFirebaseProductionRecordConflictAdapter({runTransaction,serverTimestamp,actor,role,maxChars=160000}={}){
 if(typeof runTransaction!=='function'||typeof serverTimestamp!=='function')throw new Error('production 衝突備份 adapter 注入不完整');const email=String(actor?.email||'').trim().toLowerCase();
 return{enabled:role==='owner',async persist(conflicts,{activationEpoch,deviceId,baseHash,targetHash}={}){if(role!=='owner'||!token(actor?.uid)||!token(email)||!Array.isArray(conflicts)||!conflicts.length||!token(activationEpoch)||!token(deviceId))throw new Error('production 衝突備份 identity 無效');const conflictHash=sha256Canonical(conflicts),parts=splitRecordConflicts(conflicts,maxChars),backupId=`conflict-${conflictHash.slice(0,24)}`;if(parts.length>400)throw new Error('production 衝突備份超過安全上限');const documents=parts.map((payload,index)=>({path:productionConflictBackupPath(`${backupId}-${index}`),payload:{schema:'danbridge-production-record-conflict-backup-v1',environment:'production',companyId:'danbridge',activationEpoch,backupId,conflictHash,baseHash,targetHash,deviceId,partIndex:index,partCount:parts.length,encoding:'json-fragment',payload}}));const result=await runTransaction(async transaction=>{const [controlSnapshot,safetySnapshot,...snapshots]=await Promise.all([transaction.get(PRODUCTION_RECORD_CONTROL_PATH),transaction.get(PRODUCTION_RECORD_SAFETY_PATH),...documents.map(row=>transaction.get(row.path))]);const control=assertProductionRecordRuntimeControl(valueOf(controlSnapshot)),safety=assertProductionRecordRuntimeSafety(valueOf(safetySnapshot),{activationEpoch});if(control.activationEpoch!==activationEpoch||safety.writeAllowed!==true)throw new Error('production 衝突備份時同步未啟用');let writes=0,duplicates=0;documents.forEach((row,index)=>{const current=valueOf(snapshots[index]);if(current){const core=clone(current);delete core.createdAt;delete core.createdBy;delete core.createdByEmail;if(!same(core,row.payload))throw new Error('production 衝突備份 immutable 衝突');duplicates++;return}transaction.set(row.path,{...row.payload,createdAt:serverTimestamp(),createdBy:actor.uid,createdByEmail:email});writes++});return{writes,duplicates}});return{environment:'production',activationEpoch,backupId,conflictHash,partCount:parts.length,conflictCount:conflicts.length,...result}}};
}

export function createFirebaseProductionRecordStreamAdapter({subscribeDocument,subscribeCollection,onApply,onState=()=>{},safetyGraceMs=10000}={}){
 if(typeof subscribeDocument!=='function'||typeof subscribeCollection!=='function'||typeof onApply!=='function'||typeof onState!=='function'||!Number.isSafeInteger(safetyGraceMs)||safetyGraceMs<0)throw new Error('production 逐筆 stream adapter 注入不完整');let controlUnsubscribe=null,safetyUnsubscribe=null,safetyMissingTimer=null,collectionUnsubscribes=[],control=null,safety=null,safetyLoaded=false,rows=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,new Map()])),loaded=new Set(),generation=0,stopped=false,blocked=false,lastState='idle',lastError='',initialVerified=false,chain=Promise.resolve();
 const state=(next,extra={})=>{lastState=next;lastError=extra.error||'';try{onState({state:next,error:lastError,activationEpoch:control?.activationEpoch||'',...extra})}catch{}};
 const clearSafetyMissingTimer=()=>{if(safetyMissingTimer!==null)clearTimeout(safetyMissingTimer);safetyMissingTimer=null};
 const stopCollections=()=>{generation++;for(const unsubscribe of collectionUnsubscribes.splice(0))try{unsubscribe?.()}catch{}rows=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,new Map()]));loaded=new Set();initialVerified=false};
 const block=error=>{clearSafetyMissingTimer();blocked=true;stopCollections();state('blocked',{error:String(error?.message||error)})};
 const armSafetyMissingTimer=()=>{clearSafetyMissingTimer();if(!control||safety||stopped||blocked)return;safetyMissingTimer=setTimeout(()=>{safetyMissingTimer=null;if(control&&!safety&&!stopped&&!blocked)block(new Error('production 逐筆安全控制不存在'))},safetyGraceMs)};
 const enqueue=(work,tokenValue)=>{chain=chain.then(async()=>{if(stopped||blocked||tokenValue!==generation)return;await work()}).catch(block);return chain};
 const pending=value=>Boolean(value?.hasPendingWrites),docValue=value=>value&&typeof value==='object'&&('data'in value||'exists'in value)?(value.exists===false?null:value.data??null):value;
 const emit=async reason=>{if(!control||!safety||loaded.size!==FULL_RECORD_COLLECTIONS.length)return;assertProductionRecordRuntimeControl(control);assertProductionRecordRuntimeSafety(safety,{activationEpoch:control.activationEpoch});if(!safety.readAllowed)throw new Error('production 逐筆讀取已安全暫停');const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[...rows[collection]].map(([id,data])=>({id,data:clone(data)}))])),rebuilt=rebuildFullRecordShadowDb(documents,{environment:'production'}),hash=recordDataHash(rebuilt.db);if(!initialVerified){if(hash!==control.recordDataHash||rebuilt.documentCount!==control.documentCount||rebuilt.activeCount!==control.activeCount||rebuilt.tombstoneCount!==control.tombstoneCount)throw new Error('production 逐筆初始讀回與 activation 證據不一致');initialVerified=true}await onApply({...rebuilt,hash,activationEpoch:control.activationEpoch,writeAllowed:safety.writeAllowed,reason});state(safety.writeAllowed?'ready':'paused',{hash})};
 const bind=next=>{
  stopCollections();control=clone(assertProductionRecordRuntimeControl(next));blocked=false;if(safetyLoaded&&!safety)armSafetyMissingTimer();const tokenValue=generation;
  for(const collection of FULL_RECORD_COLLECTIONS){
   let initialized=false;
   collectionUnsubscribes.push(subscribeCollection(productionRecordCollectionPath(collection),value=>enqueue(async()=>{
    if(pending(value))return;
    if(!value||!Array.isArray(value.documents)||!Array.isArray(value.changes))throw new Error(`${collection} production 逐筆快照格式無效`);
    const map=rows[collection];
    if(!initialized){for(const row of value.documents){const id=String(row.id);if(!id||map.has(id))throw new Error(`${collection} production 逐筆包含重複 ID`);map.set(id,clone(row.data))}loaded.add(collection);initialized=true}
    else for(const change of value.changes){const id=String(change.id);if(change.type==='removed')throw new Error(`${collection}/${id} 發生禁止的實體刪除`);const before=map.get(id),after=change.data;if(before&&(!Number.isSafeInteger(after?.revision)||after.revision<before.revision||(after.revision===before.revision&&!same(before,after))))throw new Error(`${collection}/${id} production revision 倒退或同版變造`);map.set(id,clone(after))}
    await emit(`records:${collection}`);
   },tokenValue),block));
  }
  state('loading');
 };
 const start=()=>{if(stopped)throw new Error('production 逐筆 stream 已停止');if(controlUnsubscribe)return;state('checking');controlUnsubscribe=subscribeDocument(PRODUCTION_RECORD_CONTROL_PATH,value=>{if(pending(value))return;try{const next=docValue(value);if(!next){if(control)throw new Error('production 逐筆 runtime 控制不得移除');clearSafetyMissingTimer();stopCollections();control=null;blocked=false;state('legacy');return}const verified=clone(assertProductionRecordRuntimeControl(next));if(control){if(!same(control,verified))throw new Error('production 逐筆 runtime 控制發生禁止的變更');return}bind(verified)}catch(error){block(error)}},block);safetyUnsubscribe=subscribeDocument(PRODUCTION_RECORD_SAFETY_PATH,value=>{if(pending(value))return;try{safetyLoaded=true;const next=docValue(value);safety=next?clone(next):null;if(safety)clearSafetyMissingTimer();else armSafetyMissingTimer();const tokenValue=generation;enqueue(async()=>{if(control&&!safety){state('loading',{waitingFor:'safety'});return}await emit('safety')},tokenValue)}catch(error){block(error)}},block)};
 const stop=()=>{stopped=true;clearSafetyMissingTimer();try{controlUnsubscribe?.()}catch{}try{safetyUnsubscribe?.()}catch{}controlUnsubscribe=null;safetyUnsubscribe=null;stopCollections();state('stopped')};
 const readDocuments=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[...rows[collection]].map(([id,data])=>({id,data:clone(data)}))]));
 return{enabled:true,start,stop,readDocuments,diagnostics:()=>({environment:'production',state:lastState,error:lastError,blocked,activationEpoch:control?.activationEpoch||'',loadedCollections:[...loaded],initialVerified})};
}
