import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildProductionRecordRuntimeControl,assertProductionRecordRuntimeControl,buildProductionRecordRuntimeSafety,assertProductionRecordRuntimeSafety,advanceProductionRecordRuntimeSafety,PRODUCTION_RECORD_CONTROL_PATH,PRODUCTION_RECORD_SAFETY_PATH,productionRecordPath,productionRecordCollectionPath} from '../js/core/cloud-production-record-runtime.js';
import {createFirebaseProductionRecordOperationAdapter,createFirebaseProductionRecordStreamAdapter} from '../js/core/firebase-production-record-runtime-adapter.js';
import {buildFullRecordShadowPlan,FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const target=()=>({...empty(),students:[{id:'student-1',name:'A'}]});
const activation=()=>{const db=target(),hash=recordDataHash(db),control=buildProductionRecordRuntimeControl({activationEpoch:'production-epoch-1',legacyVersionHash:'4fwqr7:1255035',recordDataHash:hash,sourceSha256:'a'.repeat(64),documentCount:1,activeCount:1,tombstoneCount:0,roleViewDigest:'b'.repeat(64),rollbackChannel:'rollback-pre-v2-20260901',activatedAt:'2026-09-01T04:00:00.000Z'}),safety=buildProductionRecordRuntimeSafety({control,updatedAt:'2026-09-01T04:00:00.000Z'});return{db,control,safety}};
const snapshot=value=>({exists:()=>value!==undefined,data:()=>structuredClone(value)});

test('production runtime 控制逐欄綁定、hash 防竄改且 safety 可暫停寫入',()=>{const {control,safety}=activation();assert.equal(assertProductionRecordRuntimeControl(control).readTakeover,true);assert.equal(assertProductionRecordRuntimeSafety(safety,{activationEpoch:control.activationEpoch}).writeAllowed,true);assert.throws(()=>assertProductionRecordRuntimeControl({...control,activeCount:2}),/activation hash|格式/);assert.throws(()=>assertProductionRecordRuntimeSafety({...safety,state:'paused',writeAllowed:true},{activationEpoch:control.activationEpoch}),/格式/)});

test('production operation 只改一筆、原子推進權威 head、保留主文件且 receipt 使重送 exactly-once',async()=>{const {db,control,safety}=activation(),seed=buildFullRecordShadowPlan(Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]])),db,{environment:'production',sourceHash:'legacy'}).operations[0].payload,recordPath=productionRecordPath('students','student-1'),store=new Map([[PRODUCTION_RECORD_CONTROL_PATH,control],[PRODUCTION_RECORD_SAFETY_PATH,safety],[recordPath,{...seed,updatedAt:'before',updatedBy:'seed',updatedByEmail:'owner@example.com'}],['companies/danbridge/data/main',{sentinel:'unchanged'}]]),runTransaction=async callback=>{const writes=[];const result=await callback({get:async path=>snapshot(store.get(path)),set:(path,value)=>writes.push([path,structuredClone(value)])});for(const [path,value] of writes)store.set(path,value);return result},adapter=createFirebaseProductionRecordOperationAdapter({runTransaction,serverTimestamp:()=> 'SERVER',actor:{uid:'owner-uid',email:'owner@example.com'},role:'owner'}),nextDb=target();nextDb.students[0].name='B';const operation=buildFullRecordShadowPlan({students:[{id:'student-1',data:store.get(recordPath)}]},nextDb,{environment:'production',sourceHash:'next'}).operations[0];Object.assign(operation,{schema:'danbridge-active-record-operation-v1',environment:'production',companyId:'danbridge',activationEpoch:control.activationEpoch,operationId:'device-1:1',deviceId:'device-1',collection:'students',recordId:'student-1',createdAt:'2026-09-01T04:01:00.000Z',baseRevision:1,nextRevision:2,baseHash:recordDataHash(db),targetHash:recordDataHash(nextDb),targetDocumentCount:1,targetActiveCount:1,targetTombstoneCount:0,baselineRecord:{},localRecord:{}});const first=await adapter.apply(operation),second=await adapter.apply(operation),savedSafety=assertProductionRecordRuntimeSafety(store.get(PRODUCTION_RECORD_SAFETY_PATH),{activationEpoch:control.activationEpoch});assert.equal(first.write,true);assert.equal(second.kind,'duplicate');assert.equal(store.get(recordPath).record.name,'B');assert.equal(store.get(recordPath).revision,2);assert.equal(savedSafety.recordDataHash,recordDataHash(nextDb));assert.equal(savedSafety.recordRevision,1);assert.equal(savedSafety.lastOperationId,operation.operationId);assert.equal('lastOperationId'in store.get(recordPath),false);assert.deepEqual(store.get('companies/danbridge/data/main'),{sentinel:'unchanged'})});

function streamHarness(){
 const documentListeners=new Map(),collectionListeners=new Map(),states=[],applies=[];
 const adapter=createFirebaseProductionRecordStreamAdapter({
  subscribeDocument:(path,next,error)=>{documentListeners.set(path,{next,error});return()=>documentListeners.delete(path)},
  subscribeCollection:(path,next,error)=>{collectionListeners.set(path,{next,error});return()=>collectionListeners.delete(path)},
  onApply:async value=>applies.push(value),
  onState:value=>states.push(value)
 });
 const emitDocument=(path,data)=>documentListeners.get(path).next({exists:data!==null,data,hasPendingWrites:false});
 const emitCollection=(collection,documents,changes=documents.map(row=>({type:'added',...row})))=>collectionListeners.get(productionRecordCollectionPath(collection)).next({hasPendingWrites:false,documents,changes});
 const settle=async()=>{for(let index=0;index<8;index++)await new Promise(resolve=>setImmediate(resolve))};
 return{adapter,documentListeners,collectionListeners,states,applies,emitDocument,emitCollection,settle};
}

function productionDocuments(db=target()){
 const operations=buildFullRecordShadowPlan(empty(),db,{environment:'production',sourceHash:'legacy'}).operations,documents=empty();
 for(const operation of operations)documents[operation.payload.collection].push({id:operation.payload.recordId,data:operation.payload});
 return documents;
}

test('production stream 即使 safety 先抵達，仍須全 16 集合精確讀回才 ready',async()=>{
 const {db,control,safety}=activation(),app=streamHarness(),documents=productionDocuments(db);app.adapter.start();
 app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,safety);app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);
 for(const collection of FULL_RECORD_COLLECTIONS)app.emitCollection(collection,documents[collection]);
 await app.settle();assert.equal(app.adapter.diagnostics().state,'ready');assert.equal(app.adapter.diagnostics().initialVerified,true);assert.equal(app.applies.length,1);assert.equal(app.applies[0].hash,control.recordDataHash);assert.equal(app.applies[0].writeAllowed,true);
 app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);await app.settle();assert.equal(app.adapter.diagnostics().state,'ready');assert.equal(app.applies.length,1);
});

test('production stream 原子啟用時 control 與 safety 回呼順序不同不會產生假性 blocked',async()=>{
 const {db,control,safety}=activation(),app=streamHarness(),documents=productionDocuments(db);app.adapter.start();
 app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,null);app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,safety);
 for(const collection of FULL_RECORD_COLLECTIONS)app.emitCollection(collection,documents[collection]);
 await app.settle();assert.equal(app.adapter.diagnostics().state,'ready');assert.equal(app.adapter.diagnostics().blocked,false);assert.equal(app.adapter.diagnostics().initialVerified,true);
});

test('production 舊 safety 升級期間 fail closed 但不誤 blocked，v2 抵達即自動 ready',async()=>{
 const {db,control,safety}=activation(),app=streamHarness(),documents=productionDocuments(db),legacySafety={schema:'danbridge-production-record-runtime-safety-v1',environment:'production',companyId:'danbridge',activationEpoch:control.activationEpoch,state:'active',revision:1,lastEventHash:control.activationHash,readAllowed:true,writeAllowed:true,updatedAt:'2026-09-01T04:00:00.000Z'};app.adapter.start();app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,legacySafety);app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);for(const collection of FULL_RECORD_COLLECTIONS)app.emitCollection(collection,documents[collection]);await app.settle();assert.equal(app.adapter.diagnostics().state,'loading');assert.equal(app.adapter.diagnostics().blocked,false);assert.equal(app.applies.length,0);app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,safety);await app.settle();assert.equal(app.adapter.diagnostics().state,'ready');assert.equal(app.adapter.diagnostics().blocked,false);assert.equal(app.applies.length,1);
});

test('production 寫入後 safety 與 record 任一先抵達都會收斂，重新載入仍以新 head ready',async()=>{
 const {db,control,safety}=activation(),documents=productionDocuments(db),nextDb=target();nextDb.students[0].name='B';const payload=buildFullRecordShadowPlan(documents,nextDb,{environment:'production',sourceHash:'next'}).operations[0].payload,operation={activationEpoch:control.activationEpoch,operationId:'device-1:2',createdAt:'2026-09-01T04:02:00.000Z',baseHash:recordDataHash(db),targetHash:recordDataHash(nextDb),targetDocumentCount:1,targetActiveCount:1,targetTombstoneCount:0},nextSafety=advanceProductionRecordRuntimeSafety(safety,{operation}),nextDocuments=structuredClone(documents);nextDocuments.students[0].data=payload;
 const active=streamHarness();active.adapter.start();active.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);active.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,safety);for(const collection of FULL_RECORD_COLLECTIONS)active.emitCollection(collection,documents[collection]);await active.settle();active.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,nextSafety);await active.settle();assert.equal(active.adapter.diagnostics().state,'loading');assert.equal(active.adapter.diagnostics().blocked,false);active.emitCollection('students',nextDocuments.students,[{type:'modified',...nextDocuments.students[0]}]);await active.settle();assert.equal(active.adapter.diagnostics().state,'ready');assert.equal(active.applies.at(-1).hash,nextSafety.recordDataHash);
 const reloaded=streamHarness();reloaded.adapter.start();reloaded.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);reloaded.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,nextSafety);for(const collection of FULL_RECORD_COLLECTIONS)reloaded.emitCollection(collection,nextDocuments[collection]);await reloaded.settle();assert.equal(reloaded.adapter.diagnostics().state,'ready');assert.equal(reloaded.adapter.diagnostics().initialVerified,true);assert.equal(reloaded.applies[0].hash,nextSafety.recordDataHash);
});

test('production stream 對 activation 變造、實體刪除與 revision 倒退一律 fail closed',async()=>{
 for(const fault of ['control','removed','revision']){
  const {db,control,safety}=activation(),app=streamHarness(),documents=productionDocuments(db);app.adapter.start();app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,control);app.emitDocument(PRODUCTION_RECORD_SAFETY_PATH,safety);for(const collection of FULL_RECORD_COLLECTIONS)app.emitCollection(collection,documents[collection]);await app.settle();
  if(fault==='control')app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,{...control,rollbackChannel:'changed'});
  else if(fault==='removed')app.emitCollection('students',documents.students,[{type:'removed',id:'student-1',data:documents.students[0].data}]);
  else app.emitCollection('students',documents.students,[{type:'modified',id:'student-1',data:{...documents.students[0].data,revision:0}}]);
  await app.settle();assert.equal(app.adapter.diagnostics().state,'blocked',fault);assert.equal(app.adapter.diagnostics().blocked,true,fault);
 }
});

test('production stream 缺少 control 時只回到 legacy，不建立逐筆寫入權限',async()=>{const app=streamHarness();app.adapter.start();app.emitDocument(PRODUCTION_RECORD_CONTROL_PATH,null);await app.settle();assert.equal(app.adapter.diagnostics().state,'legacy');assert.equal(app.collectionListeners.size,0);assert.equal(app.applies.length,0)});
