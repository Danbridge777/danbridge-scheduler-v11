import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {buildRoleRecordViewPlan} from '../js/core/cloud-role-record-view.js';
import {createFirebaseRoleRecordStreamAdapter} from '../js/core/firebase-role-record-stream-adapter.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const blankDocuments=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const clone=value=>structuredClone(value);
const identity={email:'aa@example.com',kind:'scheduler',teacherId:'teacher-aa',branchIds:[]};
const epoch='epoch-role-12345';
const auditControl=control=>({...control,persistedAt:{seconds:1},persistedBy:'owner-1',persistedByEmail:'owner@example.com'});
const auditRecord=payload=>({...payload,updatedAt:{seconds:1},updatedBy:'owner-1',updatedByEmail:'owner@example.com'});
const runtimeControl={schema:'danbridge-record-sync-v2-structural-active-control-v2',state:'structural-active-transition-awaiting-native-fixed-path-atomic-cutover',environment:'staging',companyId:'danbridge',activationEpoch:epoch,writerProtocol:'v2',writerGeneration:2,readAllowed:true,writeAllowed:true,readTakeoverEnabled:true,writeTakeoverEnabled:true,acceptNewSessions:true,acceptNewMutations:true,allowAuditAppends:true,controlHash:'b'.repeat(64)};
const runtimePath=`stagingRecordSyncV2ActiveControls/danbridge/epochs/${epoch}`;
function fixture(db){const documents=blankDocuments(),plan=buildRoleRecordViewPlan(documents,db,{environment:'staging',identity,activationEpoch:epoch,sourceRecordHash:recordDataHash(db),publishId:'publish-role-12345',publishedAt:'2026-08-15T03:01:00+08:00'});for(const operation of plan.operations)documents[operation.collection].push({id:operation.recordId,data:auditRecord(operation.payload)});return{db,documents,control:auditControl(plan.control),runtimeControl:{...runtimeControl}}}
function bus(){const documents=new Map(),collections=new Map(),unsubscribed=[];const subscribe=(target,path,next,error)=>{target.set(path,{next,error});return()=>{unsubscribed.push(path);target.delete(path)}};return{documents,collections,unsubscribed,subscribeDocument:(path,next,error)=>subscribe(documents,path,next,error),subscribeCollection:(path,next,error)=>subscribe(collections,path,next,error),emitDocument(path,value){documents.get(path)?.next(value)},emitCollection(path,value){collections.get(path)?.next(value)},failCollection(path,error){collections.get(path)?.error(error)}}}
async function load(source,network){network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:source.control});await tick();network.emitDocument(runtimePath,{exists:true,data:source.runtimeControl});await tick();for(const collection of FULL_RECORD_COLLECTIONS){const path=`stagingRoleRecordViews/danbridge/views/${source.control.viewKey}/collections/${collection}/records`,rows=source.documents[collection];network.emitCollection(path,{documents:rows,changes:rows.map(row=>({type:'added',...row}))})}await tick();await tick()}

test('安全控制、角色控制與 16 集合可亂序到達，完整 hash 對上後才套用一次',async()=>{
 const db=empty();db.students=[{id:'student-1'}];db.lessons=[{id:'lesson-1',room:'A'}];const source=fixture(db),events=[],states=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot),onState:value=>states.push(value)});adapter.start();await load(source,network);assert.equal(events.length,1);assert.equal(events[0].db.lessons[0].room,'A');assert.equal(events[0].writeAllowed,true);assert.equal(adapter.diagnostics().state,'ready');assert.equal(adapter.diagnostics().activeCollectionSubscriptions,16);assert.ok(states.some(row=>row.state==='waiting'));
});

test('分批資料先到時保留上一版；全部資料與新控制 hash 一致後才原子換畫面',async()=>{
 const firstDb=empty();firstDb.lessons=[{id:'lesson-1',room:'A'},{id:'lesson-2',room:'B'}];const source=fixture(firstDb),events=[],states=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot),onState:value=>states.push(value)});adapter.start();await load(source,network);
 const nextDb=clone(firstDb);nextDb.lessons[0].room='C';nextDb.lessons[1].room='D';const plan=buildRoleRecordViewPlan(source.documents,nextDb,{environment:'staging',identity,activationEpoch:epoch,sourceRecordHash:recordDataHash(nextDb),publishId:'publish-role-12346',publishedAt:'2026-08-15T03:02:00+08:00',currentControl:source.control});assert.equal(plan.operations.length,2);const path=`stagingRoleRecordViews/danbridge/views/${source.control.viewKey}/collections/lessons/records`;
 for(const operation of plan.operations){const row={id:operation.recordId,data:auditRecord(operation.payload)},index=source.documents.lessons.findIndex(item=>item.id===row.id);source.documents.lessons[index]=row;network.emitCollection(path,{documents:source.documents.lessons,changes:[{type:'modified',...row}]});await tick();assert.equal(events.length,1);assert.equal(events[0].db.lessons[0].room,'A')}
 assert.equal(adapter.diagnostics().state,'waiting');network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:auditControl(plan.control)});await tick();await tick();assert.equal(events.length,2);assert.equal(events[1].db.lessons.find(row=>row.id==='lesson-1').room,'C');assert.equal(events[1].db.lessons.find(row=>row.id==='lesson-2').room,'D');assert.equal(adapter.diagnostics().state,'ready');
});

test('V2 runtime 暫停即使資料不變也立即讓 aa 停止送出，讀取畫面保留',async()=>{
 const db=empty();db.lessons=[{id:'lesson-1',room:'A'}];const source=fixture(db),events=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot)});adapter.start();await load(source,network);network.emitDocument(runtimePath,{exists:true,data:{...source.runtimeControl,writeAllowed:false,writeTakeoverEnabled:false,acceptNewMutations:false}});await tick();assert.equal(events.length,2);assert.equal(events[1].db.lessons[0].room,'A');assert.equal(events[1].writeAllowed,false);assert.equal(adapter.diagnostics().state,'paused');
});

test('缺筆只等待但不清空畫面；實體刪除、同版變造與監聽錯誤都 fail closed',async()=>{
 for(const scenario of ['missing','removed','same-revision','listener']){const db=empty();db.lessons=[{id:'lesson-1',room:'A'}];const source=fixture(db),events=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot)});adapter.start();await load(source,network);const path=`stagingRoleRecordViews/danbridge/views/${source.control.viewKey}/collections/lessons/records`,row=source.documents.lessons[0];if(scenario==='missing'){const nextDb=empty(),plan=buildRoleRecordViewPlan(source.documents,nextDb,{environment:'staging',identity,activationEpoch:epoch,sourceRecordHash:recordDataHash(nextDb),publishId:'publish-role-12346',publishedAt:'2026-08-15T03:04:00+08:00',currentControl:source.control});network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:auditControl(plan.control)});await tick();assert.equal(adapter.diagnostics().state,'waiting');assert.equal(events.at(-1).db.lessons.length,1);adapter.stop();continue}if(scenario==='removed')network.emitCollection(path,{documents:[],changes:[{type:'removed',...row}]});else if(scenario==='same-revision')network.emitCollection(path,{documents:[row],changes:[{type:'modified',id:row.id,data:{...row.data,record:{...row.data.record,room:'forged'}}}]});else network.failCollection(path,new Error('offline'));await tick();assert.equal(adapter.diagnostics().state,'blocked');assert.equal(adapter.diagnostics().activeCollectionSubscriptions,0);assert.equal(events.at(-1).db.lessons[0].room,'A')}
});

test('控制不存在時保持 legacy 且不訂閱資料；pending writes 不會進入畫面',async()=>{
 const db=empty();db.lessons=[{id:'lesson-1'}];const source=fixture(db),events=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot)});adapter.start();network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:false,data:null});await tick();assert.equal(adapter.diagnostics().state,'legacy');assert.equal(network.collections.size,0);network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:source.control,hasPendingWrites:true});await tick();assert.equal(network.collections.size,0);adapter.stop();assert.equal(adapter.diagnostics().state,'stopped');assert.equal(network.documents.size,0);
});

test('舊快取角色控制、runtime 與集合不得開啟串流或覆蓋 server 資料',async()=>{
 const db=empty();db.lessons=[{id:'lesson-1',room:'SERVER'}];const source=fixture(db),events=[],states=[],network=bus(),adapter=createFirebaseRoleRecordStreamAdapter({environment:'staging',identity,subscribeDocument:network.subscribeDocument,subscribeCollection:network.subscribeCollection,onApply:snapshot=>events.push(snapshot),onState:value=>states.push(value)});adapter.start();
 const stale={...source.control,viewKey:'c'.repeat(64),activationEpoch:'epoch-stale-12345'};
 network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:stale,fromCache:true});await tick();
 assert.equal(network.documents.has(`stagingRecordSyncV2ActiveControls/danbridge/epochs/${stale.activationEpoch}`),false);
 assert.equal(adapter.diagnostics().viewKey,'');
 network.emitDocument('stagingRoleRecordViewControls/danbridge/views/aa@example.com',{exists:true,data:source.control,fromCache:false});await tick();
 network.emitDocument(runtimePath,{exists:true,data:source.runtimeControl,fromCache:true});await tick();
 assert.equal(network.collections.size,0);
 network.emitDocument(runtimePath,{exists:true,data:source.runtimeControl,fromCache:false});await tick();
 for(const collection of FULL_RECORD_COLLECTIONS){const path=`stagingRoleRecordViews/danbridge/views/${source.control.viewKey}/collections/${collection}/records`,rows=source.documents[collection];network.emitCollection(path,{documents:rows,changes:rows.map(row=>({type:'added',...row})),fromCache:true})}
 await tick();assert.equal(events.length,0);
 for(const collection of FULL_RECORD_COLLECTIONS){const path=`stagingRoleRecordViews/danbridge/views/${source.control.viewKey}/collections/${collection}/records`,rows=source.documents[collection];network.emitCollection(path,{documents:rows,changes:rows.map(row=>({type:'added',...row})),fromCache:false})}
 await tick();await tick();assert.equal(events.length,1);assert.equal(events[0].db.lessons[0].room,'SERVER');assert.equal(adapter.diagnostics().state,'ready');assert.ok(states.some(row=>String(row.reason||'').includes('舊快取')));
});
