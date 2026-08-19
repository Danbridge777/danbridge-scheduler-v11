import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVE_RECORD_SAVE_ZERO_HASH,ACTIVE_RECORD_SYNC_HEAD_SCHEMA,activeRecordSaveEnvelopeHash} from '../js/core/cloud-active-record-save-plan.js';
import {
 ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA,
 ACTIVE_RECORD_V2_GENESIS_DAILY_UNION_SCOPE,
 ACTIVE_RECORD_V2_HEAD_SCHEMA,
 ACTIVE_RECORD_V2_RECEIPT_SCHEMA,
 ACTIVE_RECORD_V2_RECORD_SCHEMA,
 createActiveRecordSaveTransaction
} from '../js/core/cloud-active-record-save-transaction.js';
import {RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA} from '../js/core/cloud-record-sync-v2-genesis-seed.js';
import {RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,normalizeAndBuildRecordSyncV1RawDocumentLeaf} from '../js/core/cloud-record-sync-v1-raw-document-leaf.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const CAPACITY_COUNT=Number(process.env.DANBRIDGE_V2_CAPACITY_COUNT??15_000);
if(![15_000,22_000,30_000].includes(CAPACITY_COUNT))throw new Error('DANBRIDGE_V2_CAPACITY_COUNT must be 15000, 22000, or 30000');

const epoch='epoch-transaction-12345';
const epochB='epoch-transaction-b-12345';
const actor={uid:'owner-uid-12345',email:'owner@example.com'};
const CONTROL_PATH='stagingRecordSyncControls/danbridge';
const SAFETY_PATH='stagingRecordSyncSafetyControls/danbridge';
const headPath=(activationEpoch=epoch)=>`stagingActiveRecordV2Heads/danbridge/epochs/${activationEpoch}`;
const recordPath=(collection,recordId,activationEpoch=epoch)=>`stagingActiveRecordV2Records/danbridge/epochs/${activationEpoch}/collections/${collection}/records/${recordId}`;
const receiptPath=(saveId,index,activationEpoch=epoch)=>`stagingActiveRecordV2OperationReceipts/danbridge/epochs/${activationEpoch}/operations/${saveId}:${String(index+1).padStart(2,'0')}`;
const ledgerPath=(saveId,activationEpoch=epoch)=>`stagingActiveRecordV2SaveCommits/danbridge/epochs/${activationEpoch}/saves/${saveId}`;
const key=(recordId,collection='lessons')=>({collection,recordId});
const save=(saveId='save-transaction-12345')=>({saveId,deviceId:'device-owner-12345',actorUid:actor.uid,actorEmail:actor.email,createdAt:'2026-08-17T12:00:00+08:00'});
function envelope({collection='lessons',recordId='lesson-1',exists=true,revision=1,deleted=false,record={id:recordId,value:0},activationEpoch=epoch}={}){
 const core={collection,recordId,exists,revision,deleted,record};
 return{environment:'staging',companyId:'danbridge',activationEpoch,...core,recordHash:activeRecordSaveEnvelopeHash(core)};
}
const absent=(recordId='lesson-1',collection='lessons',activationEpoch=epoch)=>envelope({collection,recordId,exists:false,revision:0,deleted:false,record:null,activationEpoch});
function request({activationEpoch=epoch,saveIdentity=save(),changedKeys=[key('lesson-1')],baselineRecords=[absent('lesson-1','lessons',activationEpoch)],localRecords=[envelope({revision:0,record:{id:'lesson-1',value:1},activationEpoch})]}={}){
 return{activationEpoch,save:saveIdentity,changedKeys,baselineRecords,localRecords};
}
const genesisHead=activationEpoch=>{const head={schema:ACTIVE_RECORD_SYNC_HEAD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,revision:0,headSaveId:'',previousCommitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,commitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,operationCount:0,updatedAt:''};return{schema:ACTIVE_RECORD_V2_HEAD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch,revision:0,headSaveId:'',previousCommitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,commitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,operationCount:0,head,actorUid:actor.uid,actorEmail:actor.email,persistedAt:{__activationServerTimestamp:true}}};
const guards=(activationEpoch=epoch)=>new Map([
 [CONTROL_PATH,{schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:'danbridge',state:'active',activationEpoch,manifestHash:'a'.repeat(64),candidateEpoch:'candidate-epoch-12345',candidateRevision:2,candidateSealHash:'b'.repeat(64),legacyVersionHash:'legacy-version-12345',recordDataHash:'record-v1:'+'c'.repeat(64),roleEvidenceHash:'d'.repeat(64),backupId:'backup-id-12345',restoreReceiptId:'restore-id-12345',collectionCount:16,documentCount:1739,activeCount:19,tombstoneCount:1720,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-17T11:00:00+08:00'}],
 [SAFETY_PATH,{schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch,state:'active',revision:1,lastEventId:'activation-event-12345',lastEventHash:'e'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-08-17T11:00:00+08:00'}],
 [headPath(activationEpoch),genesisHead(activationEpoch)]
]);
const clone=value=>structuredClone(value);
function storedGenesis({collection='lessons',recordId='lesson-1',record={id:recordId,value:0},sourceRevision=7,deleted=false,activationEpoch=epoch}={}){
 const sourceV1ActivationEpoch='v1-source-epoch-12345',seedId='v2-genesis:'+'1'.repeat(64),parentFrozenSourceProofHash='2'.repeat(64),sourceHardPauseReceiptHash='3'.repeat(64),sourceRawDocumentRootHash='4'.repeat(64),sourceHash='record-v1:'+'5'.repeat(64),recordIndex=null,sourceAudit={updatedAt:{schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds:'1786896000',nanoseconds:123456789},updatedBy:'owner-uid-12345',updatedByEmail:'owner@example.com'},raw={documentId:recordId,data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection,recordId,record,recordIndex,sourceHash,revision:sourceRevision,deleted,environment:'staging',...sourceAudit}},prepared=normalizeAndBuildRecordSyncV1RawDocumentLeaf(raw),leaf=prepared.leaf,targetCore={collection,recordId,exists:true,revision:1,deleted,record:prepared.normalizedDocument.record},recordHash=activeRecordSaveEnvelopeHash(targetCore),core={schema:RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA,artifactKind:'create-only-genesis-record',environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch,targetV2Epoch:activationEpoch,seedId,parentFrozenSourceProofHash,sourceHardPauseReceiptHash,sourceRawDocumentRootHash,collection,recordId,recordIndex,record:prepared.normalizedDocument.record,deleted,revision:1,sourceRevision,sourceHash,sourceRecordValueHash:leaf.recordValueHash,sourceDocumentCoreHash:leaf.documentCoreHash,sourceAuditState:'present',sourceAudit:prepared.normalizedDocument.audit,sourceAuditHash:leaf.auditHash,sourceLeafHash:leaf.leafHash,recordHash},commitment={schema:RECORD_SYNC_V2_GENESIS_RECORD_HASH_SCHEMA,genesisRecordSchema:core.schema,environment:core.environment,companyId:core.companyId,sourceV1ActivationEpoch,targetV2Epoch:activationEpoch,seedId,parentFrozenSourceProofHash,sourceHardPauseReceiptHash,sourceRawDocumentRootHash,collection,recordId,recordIndex,deleted,revision:1,sourceRevision,sourceHash,sourceRecordValueHash:core.sourceRecordValueHash,sourceDocumentCoreHash:core.sourceDocumentCoreHash,sourceAuditState:core.sourceAuditState,sourceAuditHash:core.sourceAuditHash,sourceLeafHash:core.sourceLeafHash,recordHash};return{...core,genesisRecordHash:sha256Canonical(commitment),persistedAt:'2026-08-17T11:30:00.123456789+08:00',persistedBy:actor.uid,persistedByEmail:actor.email};
}
function fakeStore({irrelevantRecordCount=0,activationEpoch=epoch,readGate=null,throwAfterCommitOnce=false,rawReadThrough=false}={}){
 const store=guards(activationEpoch),events=[],transactions=[];let loseCommittedResponse=throwAfterCommitOnce;
 for(let index=0;index<irrelevantRecordCount;index++)store.set(`unrelated/${index}`,{index});
 async function runTransaction(callback){
  const transactionEvent=[],pending=[];events.push(transactionEvent);transactions.push(pending);
  const transaction={
   async get(path){transactionEvent.push({type:'get',path});if(readGate)await readGate;const value=store.get(path);return{exists:()=>value!==undefined,data:()=>rawReadThrough?value:clone(value)}} ,
   set(path,payload){transactionEvent.push({type:'set',path});pending.push([path,clone(payload)])}
  };
  const result=await callback(transaction);
  for(const [path,payload] of pending)store.set(path,payload);
  if(loseCommittedResponse){loseCommittedResponse=false;throw new Error('simulated response loss after committed transaction')}
  return result;
 }
 const adapter=(overrides={})=>createActiveRecordSaveTransaction({runTransaction,serverTimestamp:()=>({__serverTimestamp:true}),environment:'staging',role:'owner',actor,...overrides});
 return{store,events,transactions,runTransaction,adapter};
}
function versionedInterleavedFakeStore(){
 const store=guards(),versions=new Map([...store.keys()].map(path=>[path,0])),attempts=[];let firstAttemptArrivals=0,releaseFirstAttempts;const firstAttemptBarrier=new Promise(resolve=>{releaseFirstAttempts=resolve});
 async function runTransaction(callback){
  for(let attempt=1;attempt<=4;attempt++){
   const event=[],pending=[],readVersions=new Map();attempts.push(event);const transaction={
    async get(path){event.push({type:'get',path});if(!readVersions.has(path))readVersions.set(path,versions.get(path)??0);const value=store.get(path);return{exists:()=>value!==undefined,data:()=>clone(value)}},
    set(path,payload){event.push({type:'set',path});pending.push([path,clone(payload)])}
   },result=await callback(transaction);
   if(attempt===1){firstAttemptArrivals++;if(firstAttemptArrivals===2)releaseFirstAttempts();await firstAttemptBarrier}
   if([...readVersions].some(([path,version])=>(versions.get(path)??0)!==version))continue;
   for(const [path,payload] of pending){store.set(path,payload);versions.set(path,(versions.get(path)??0)+1)}return result;
  }
  throw new Error('optimistic transaction retry exhausted');
 }
 const adapter=createActiveRecordSaveTransaction({runTransaction,serverTimestamp:()=>({__serverTimestamp:true}),environment:'staging',role:'owner',actor});return{store,attempts,adapter};
}
const counts=event=>({reads:event.filter(row=>row.type==='get').length,writes:event.filter(row=>row.type==='set').length});
function assertReadsBeforeWrites(event){const firstWrite=event.findIndex(row=>row.type==='set');assert.notEqual(firstWrite,-1);assert.ok(event.slice(0,firstWrite).every(row=>row.type==='get'));assert.ok(event.slice(firstWrite).every(row=>row.type==='set'))}

test('M=1 固定 6 reads/4 writes，寫入 V2 record、immutable receipt、ledger 與 head',async()=>{
 const fake=fakeStore(),input=request(),result=await fake.adapter().execute(input),event=fake.events[0];
 assert.deepEqual(counts(event),{reads:6,writes:4});assert.equal(result.readCount,6);assert.equal(result.writeCount,4);assert.equal(result.state,'committed');assertReadsBeforeWrites(event);
 const operation=result.plan.operations[0],record=fake.store.get(recordPath('lessons','lesson-1')),receipt=fake.store.get(receiptPath(input.save.saveId,0)),ledger=fake.store.get(ledgerPath(input.save.saveId)),head=fake.store.get(headPath());
 assert.equal(record.schema,ACTIVE_RECORD_V2_RECORD_SCHEMA);assert.equal(record.saveId,input.save.saveId);assert.equal(record.commitRevision,1);assert.equal(record.operationId,operation.operationId);assert.equal(record.recordHash,operation.afterHash);assert.equal(record.actorUid,actor.uid);assert.equal(record.actorEmail,actor.email);
 assert.equal(receipt.schema,ACTIVE_RECORD_V2_RECEIPT_SCHEMA);assert.equal(receipt.operationHash,operation.operationHash);assert.equal(receipt.commitHash,result.plan.saveCommit.commitHash);assert.equal(receipt.actorUid,actor.uid);
 assert.equal(ledger.schema,ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA);assert.deepEqual(ledger.saveCommit,result.plan.saveCommit);assert.equal(head.schema,ACTIVE_RECORD_V2_HEAD_SCHEMA);assert.equal(head.revision,1);assert.equal(head.commitHash,result.plan.saveCommit.commitHash);
 assert.ok(event.every(row=>row.path===CONTROL_PATH||row.path===SAFETY_PATH||row.path===headPath()||row.path.startsWith('stagingActiveRecordV2')));
});

test(`M=8 固定 20 reads/18 writes，且 N=1k/${CAPACITY_COUNT} 背景資料量完全不影響 transaction 工作量`,async()=>{
 const changedKeys=Array.from({length:8},(_,index)=>key(`lesson-${index}`)),baselineRecords=changedKeys.map(value=>absent(value.recordId)),localRecords=changedKeys.map(value=>envelope({recordId:value.recordId,revision:0,record:{id:value.recordId,value:1}})),input=request({saveIdentity:save('save-m-eight-12345'),changedKeys,baselineRecords,localRecords});
 for(const irrelevantRecordCount of [1000,CAPACITY_COUNT]){const fake=fakeStore({irrelevantRecordCount}),adapter=fake.adapter(),result=await adapter.execute(input),replay=await adapter.execute(input);assert.deepEqual(counts(fake.events[0]),{reads:20,writes:18});assert.deepEqual(counts(fake.events[1]),{reads:20,writes:0});assert.equal(result.readCount,20);assert.equal(result.writeCount,18);assert.equal(result.plan.operationCount,8);assert.equal(replay.state,'replayed');assert.equal(replay.readCount,20);assert.equal(fake.store.size,irrelevantRecordCount+2+8+8+1+1)}
});

test('genesis active/tombstone 首次日常save只允許revision1→daily revision2，M1成本不變',async()=>{
 assert.match(ACTIVE_RECORD_V2_GENESIS_DAILY_UNION_SCOPE,/requires-authoritative-seed-manifest-control-before-wiring/);for(const deleted of [false,true]){const fake=fakeStore(),sourceRecord={id:'lesson-1',value:0},genesis=storedGenesis({record:sourceRecord,deleted}),baseline=envelope({revision:1,deleted,record:sourceRecord}),local=envelope({revision:1,deleted:false,record:{id:'lesson-1',value:deleted?10:1}}),input=request({saveIdentity:save(deleted?'save-genesis-revive-12345':'save-genesis-update-12345'),baselineRecords:[baseline],localRecords:[local]});fake.store.set(recordPath('lessons','lesson-1'),genesis);const result=await fake.adapter().execute(input),stored=fake.store.get(recordPath('lessons','lesson-1'));assert.equal(result.state,'committed');assert.deepEqual(counts(fake.events[0]),{reads:6,writes:4});assert.equal(result.plan.operations[0].nextRevision,2);assert.equal(stored.schema,ACTIVE_RECORD_V2_RECORD_SCHEMA);assert.equal(stored.revision,2);assert.equal(stored.deleted,false);assert.equal(stored.record.value,deleted?10:1);assert.equal('genesisRecordHash'in stored,false)}
});

test('genesis active 首次日常 delete 保留完整 record 並只允許 revision1→daily revision2',async()=>{const fake=fakeStore(),sourceRecord={id:'lesson-1',value:0,nested:{preserved:true}},baseline=envelope({revision:1,record:sourceRecord}),local=envelope({revision:1,deleted:true,record:sourceRecord}),input=request({saveIdentity:save('save-genesis-delete-12345'),baselineRecords:[baseline],localRecords:[local]});fake.store.set(recordPath('lessons','lesson-1'),storedGenesis({record:sourceRecord}));const result=await fake.adapter().execute(input),stored=fake.store.get(recordPath('lessons','lesson-1'));assert.equal(result.state,'committed');assert.deepEqual(counts(fake.events[0]),{reads:6,writes:4});assert.equal(result.plan.operations[0].nextRevision,2);assert.equal(stored.schema,ACTIVE_RECORD_V2_RECORD_SCHEMA);assert.equal(stored.revision,2);assert.equal(stored.deleted,true);assert.deepEqual(stored.record,sourceRecord)});

test('genesis schema/top-level/nested getters 與 custom prototype 全部 getter0、6 reads/0 writes fail closed',async()=>{
 const source=storedGenesis(),input=request({saveIdentity:save('save-genesis-hostile-12345'),baselineRecords:[envelope({revision:1,record:{id:'lesson-1',value:0}})],localRecords:[envelope({revision:1,record:{id:'lesson-1',value:1}})]}),cases=[
  ()=>{let calls=0;const value={...source};Object.defineProperty(value,'schema',{enumerable:true,get(){calls++;return RECORD_SYNC_V2_GENESIS_RECORD_SCHEMA}});return{value,calls:()=>calls}},
  ()=>{let calls=0;const value={...source};Object.defineProperty(value,'record',{enumerable:true,get(){calls++;return source.record}});return{value,calls:()=>calls}},
  ()=>{let calls=0;const record={...source.record};Object.defineProperty(record,'value',{enumerable:true,get(){calls++;return 0}});return{value:{...source,record},calls:()=>calls}},
  ()=>{let calls=0;const sourceAudit={...source.sourceAudit};Object.defineProperty(sourceAudit,'updatedBy',{enumerable:true,get(){calls++;return actor.uid}});return{value:{...source,sourceAudit},calls:()=>calls}},
  ()=>({value:Object.assign(Object.create({inherited:true}),source),calls:()=>0})
 ];
 for(const makeCase of cases){const hostile=makeCase(),fake=fakeStore({rawReadThrough:true});fake.store.set(recordPath('lessons','lesson-1'),hostile.value);await assert.rejects(()=>fake.adapter().execute(input),/record|欄位|plain object|plain JSON/);assert.equal(hostile.calls(),0);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0});assert.equal(fake.transactions[0].length,0)}
});

test('M8 genesis→daily union仍固定20 reads/18 writes，每筆只走revision1→2',async()=>{const keys=Array.from({length:8},(_,index)=>key(`genesis-lesson-${index}`)),baselineRecords=keys.map((row,index)=>envelope({recordId:row.recordId,revision:1,deleted:index%2===0,record:{id:row.recordId,value:index}})),localRecords=keys.map((row,index)=>envelope({recordId:row.recordId,revision:1,deleted:false,record:{id:row.recordId,value:index+100}})),fake=fakeStore();for(let index=0;index<keys.length;index++)fake.store.set(recordPath('lessons',keys[index].recordId),storedGenesis({recordId:keys[index].recordId,record:baselineRecords[index].record,deleted:baselineRecords[index].deleted,sourceRevision:index+1}));const input=request({saveIdentity:save('save-genesis-m-eight-12345'),changedKeys:keys,baselineRecords,localRecords}),result=await fake.adapter().execute(input);assert.deepEqual(counts(fake.events[0]),{reads:20,writes:18});assert.equal(result.plan.operationCount,8);assert.ok(result.plan.operations.every(operation=>operation.nextRevision===2));assert.ok(keys.every(row=>fake.store.get(recordPath('lessons',row.recordId)).schema===ACTIVE_RECORD_V2_RECORD_SCHEMA))});

test('genesis首次daily commit response-loss後只接受daily exact replay，0重寫',async()=>{const fake=fakeStore({throwAfterCommitOnce:true}),sourceRecord={id:'lesson-1',value:0},input=request({saveIdentity:save('save-genesis-response-loss-12345'),baselineRecords:[envelope({revision:1,record:sourceRecord})],localRecords:[envelope({revision:1,record:{id:'lesson-1',value:1}})]});fake.store.set(recordPath('lessons','lesson-1'),storedGenesis({record:sourceRecord}));await assert.rejects(()=>fake.adapter().execute(input),/response loss/);const replay=await fake.adapter().execute(input),stored=fake.store.get(recordPath('lessons','lesson-1'));assert.equal(replay.state,'replayed');assert.deepEqual(counts(fake.events[1]),{reads:6,writes:0});assert.equal(stored.schema,ACTIVE_RECORD_V2_RECORD_SCHEMA);assert.equal(stored.revision,2)});

test('genesis不能偽造daily/ledger/receipt/head或跳revision，全部0 writes fail closed',async()=>{const source=storedGenesis(),mutations=[value=>{value.revision=2},value=>{value.targetV2Epoch=epochB},value=>{value.recordHash='record-item-v1:'+'f'.repeat(64)},value=>{value.genesisRecordHash='f'.repeat(64)},value=>{value.saveId='forged-save-12345'},value=>{value.schema=ACTIVE_RECORD_V2_COMMIT_LEDGER_SCHEMA},value=>{value.schema=ACTIVE_RECORD_V2_RECEIPT_SCHEMA},value=>{value.schema=ACTIVE_RECORD_V2_HEAD_SCHEMA}];for(const mutate of mutations){const fake=fakeStore(),value=clone(source);mutate(value);fake.store.set(recordPath('lessons','lesson-1'),value);const input=request({saveIdentity:save('save-genesis-invalid-12345'),baselineRecords:[envelope({revision:1,record:{id:'lesson-1',value:0}})],localRecords:[envelope({revision:1,record:{id:'lesson-1',value:1}})]});await assert.rejects(()=>fake.adapter().execute(input),/genesis|record|欄位|identity|schema/);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0});assert.equal(fake.transactions[0].length,0)}const fake=fakeStore();fake.store.set(recordPath('lessons','lesson-1'),source);const jump=request({saveIdentity:save('save-genesis-jump-12345'),baselineRecords:[envelope({revision:2,record:{id:'lesson-1',value:0}})],localRecords:[envelope({revision:2,record:{id:'lesson-1',value:1}})]});await assert.rejects(()=>fake.adapter().execute(jump),/revision race/);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0})});

test('revision0 首筆與後續新 save 精確成本：M1 6→7 reads、M8 20→21 reads，writes 不變',async()=>{
 const one=fakeStore(),oneAdapter=one.adapter(),firstOne=request({saveIdentity:save('save-count-one-first-12345')}),secondOne=request({saveIdentity:{...save('save-count-one-second-12345'),createdAt:'2026-08-17T12:01:00+08:00'},changedKeys:[key('lesson-2')],baselineRecords:[absent('lesson-2')],localRecords:[envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:1}})]}),firstOneResult=await oneAdapter.execute(firstOne),secondOneResult=await oneAdapter.execute(secondOne);assert.deepEqual(counts(one.events[0]),{reads:6,writes:4});assert.deepEqual(counts(one.events[1]),{reads:7,writes:4});assert.equal(firstOneResult.readCount,6);assert.equal(secondOneResult.readCount,7);
 const keysA=Array.from({length:8},(_,index)=>key(`lesson-a-${index}`)),keysB=Array.from({length:8},(_,index)=>key(`lesson-b-${index}`)),makeRows=keys=>({baselineRecords:keys.map(value=>absent(value.recordId)),localRecords:keys.map(value=>envelope({recordId:value.recordId,revision:0,record:{id:value.recordId,value:1}}))}),eight=fakeStore(),eightAdapter=eight.adapter(),firstEight=request({saveIdentity:save('save-count-eight-first-12345'),changedKeys:keysA,...makeRows(keysA)}),secondEight=request({saveIdentity:{...save('save-count-eight-second-12345'),createdAt:'2026-08-17T12:02:00+08:00'},changedKeys:keysB,...makeRows(keysB)}),firstEightResult=await eightAdapter.execute(firstEight),secondEightResult=await eightAdapter.execute(secondEight);assert.deepEqual(counts(eight.events[0]),{reads:20,writes:18});assert.deepEqual(counts(eight.events[1]),{reads:21,writes:18});assert.equal(firstEightResult.readCount,20);assert.equal(secondEightResult.readCount,21);
});

test('M=9、duplicate、invalid 與 changes 都在 runTransaction 前 0 I/O fail closed',async()=>{
 const fake=fakeStore(),adapter=fake.adapter(),nine=Array.from({length:9},(_,index)=>key(`lesson-${index}`)),cases=[
  request({changedKeys:nine,baselineRecords:[],localRecords:[]}),
  request({changedKeys:[key('lesson-1'),key('lesson-1')],baselineRecords:[],localRecords:[]}),
  request({changedKeys:[key('bad/id')],baselineRecords:[],localRecords:[]}),
  request({changedKeys:[key('seq_00000001_deadbeef','changes')],baselineRecords:[],localRecords:[]})
 ];
 for(const value of cases)await assert.rejects(()=>adapter.execute(value),/最多 8 筆|duplicate|identity|dedicated immutable audit\/append planner/);
 assert.equal(fake.events.length,0);
});

test('production、非 owner、adapter/save actor 不一致與 caller 注入 authoritative 欄位都是 0 transaction',async()=>{
 const cases=[
  [{environment:'production'},request()],
  [{role:'scheduler'},request()],
  [{actor:{uid:12345678,email:actor.email}},request()],
  [{},request({saveIdentity:{...save(),actorEmail:'other@example.com'}})],
  [{},{...request(),remoteRecords:[]}]
 ];
 for(const [overrides,input] of cases){const fake=fakeStore(),adapter=fake.adapter(overrides);await assert.rejects(()=>adapter.execute(input),/staging owner|actor\/epoch|欄位無效/);assert.equal(fake.events.length,0)}
});

test('非法 saveId/deviceId/createdAt 在組 path 與 operationId 前 0 transaction/0 I/O 拒絕',async()=>{
 const invalidSaves=[
  {...save(),saveId:'bad/save-id'},
  {...save(),saveId:'short'},
  {...save(),deviceId:'bad/device'},
  {...save(),createdAt:'not-a-timestamp'},
  {...save(),createdAt:'0'},
  {...save(),createdAt:'2026-08-17T12:00:00'},
  {...save(),createdAt:'2026-02-30T12:00:00Z'}
 ];
 for(const saveIdentity of invalidSaves){const fake=fakeStore();await assert.rejects(()=>fake.adapter().execute(request({saveIdentity})),/actor\/epoch/);assert.equal(fake.events.length,0)}
});

test('baseline/local envelopes 在 transaction/path 前完整共用 preflight；任一無效皆 0 transaction',async()=>{
 const mutations=[
  value=>value.baselineRecords.push(envelope({recordId:'lesson-2',record:{id:'lesson-2',value:0}})),
  value=>{value.baselineRecords[0].environment='production'},
  value=>{value.baselineRecords[0].companyId='other'},
  value=>{value.baselineRecords[0].activationEpoch=epochB},
  value=>{value.baselineRecords[0].exists='true'},
  value=>{value.baselineRecords[0].revision=-1},
  value=>{value.localRecords[0].deleted='false'},
  value=>{value.localRecords[0].record.id='lesson-other'},
  value=>{value.localRecords[0].record.nested={lost:undefined}},
  value=>{value.localRecords[0].recordHash='record-item-v1:'+'f'.repeat(64)},
  value=>{value.localRecords[0]=envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:1}})}
 ];
 for(const mutate of mutations){const fake=fakeStore(),input=request();mutate(input);await assert.rejects(()=>fake.adapter().execute(input));assert.equal(fake.events.length,0)}
});

test('execute 在任何 await 前嚴格 snapshot；延遲 reads 期間 caller 竄改 request 不影響 path、actor 或內容',async()=>{
 let releaseReads;const readGate=new Promise(resolve=>{releaseReads=resolve}),fake=fakeStore({readGate}),adapter=fake.adapter(),input=request({saveIdentity:save('save-snapshot-original-12345')}),original=clone(input),pending=adapter.execute(input);
 input.activationEpoch=epochB;input.save.saveId='save-snapshot-mutated-12345';input.save.actorUid='attacker-uid-12345';input.save.actorEmail='attacker@example.com';input.changedKeys[0].recordId='lesson-mutated';input.baselineRecords[0]=absent('lesson-mutated');input.localRecords[0]=envelope({recordId:'lesson-mutated',revision:0,record:{id:'lesson-mutated',value:999}});
 releaseReads();const result=await pending,event=fake.events[0],written=fake.store.get(recordPath('lessons','lesson-1'));
 assert.equal(result.plan.saveId,original.save.saveId);assert.equal(result.plan.operations[0].recordId,'lesson-1');assert.equal(result.plan.operations[0].actorUid,original.save.actorUid);assert.equal(written.record.value,1);assert.equal(written.actorEmail,original.save.actorEmail);assert.ok(event.some(row=>row.path===ledgerPath(original.save.saveId)));assert.ok(event.some(row=>row.path===recordPath('lessons','lesson-1')));assert.ok(event.every(row=>!row.path.includes('mutated')&&!row.path.includes(epochB)));assert.deepEqual(counts(event),{reads:6,writes:4});assertReadsBeforeWrites(event);
});

test('V2 head 與 records 依 activationEpoch 隔離；epoch B 可獨立 genesis 且不覆寫 epoch A',async()=>{
 const fake=fakeStore(),adapter=fake.adapter(),inputA=request({saveIdentity:save('save-epoch-a-12345')}),resultA=await adapter.execute(inputA),headA=clone(fake.store.get(headPath(epoch))),recordA=clone(fake.store.get(recordPath('lessons','lesson-1',epoch))),ledgerA=clone(fake.store.get(ledgerPath(inputA.save.saveId,epoch))),receiptA=clone(fake.store.get(receiptPath(inputA.save.saveId,0,epoch)));
 for(const [path,value] of guards(epochB))fake.store.set(path,value);
 const inputB=request({activationEpoch:epochB,saveIdentity:{...save('save-epoch-b-12345'),createdAt:'2026-08-17T12:05:00+08:00'},baselineRecords:[absent('lesson-1','lessons',epochB)],localRecords:[envelope({recordId:'lesson-1',revision:0,record:{id:'lesson-1',value:2},activationEpoch:epochB})]}),resultB=await adapter.execute(inputB),eventB=fake.events[1];
 assert.equal(resultA.plan.nextHead.revision,1);assert.equal(resultB.plan.nextHead.revision,1);assert.equal(resultB.plan.nextHead.previousCommitHash,'0'.repeat(64));assert.deepEqual(counts(eventB),{reads:6,writes:4});assertReadsBeforeWrites(eventB);
 assert.deepEqual(fake.store.get(headPath(epoch)),headA);assert.deepEqual(fake.store.get(recordPath('lessons','lesson-1',epoch)),recordA);assert.deepEqual(fake.store.get(ledgerPath(inputA.save.saveId,epoch)),ledgerA);assert.deepEqual(fake.store.get(receiptPath(inputA.save.saveId,0,epoch)),receiptA);
 assert.equal(fake.store.get(headPath(epochB)).activationEpoch,epochB);assert.equal(fake.store.get(recordPath('lessons','lesson-1',epochB)).record.value,2);assert.ok(eventB.some(row=>row.path===headPath(epochB)));assert.ok(eventB.some(row=>row.path===recordPath('lessons','lesson-1',epochB)));assert.ok(eventB.every(row=>row.path===CONTROL_PATH||row.path===SAFETY_PATH||!row.path.includes(`/epochs/${epoch}/`)));
 for(const event of [fake.events[0],eventB])for(const {path} of event)assert.equal(path.split('/').length%2,0,`${path} 必須是 Firestore document path`);
 for(const [path,value] of guards(epoch))if(path===CONTROL_PATH||path===SAFETY_PATH)fake.store.set(path,value);const replayA=await adapter.execute(inputA);assert.equal(replayA.state,'replayed');assert.deepEqual(counts(fake.events[2]),{reads:6,writes:0});
});

test('missing/malformed/wrong-epoch head 即使有 unrelated old artifacts 也不得猜 genesis，全部 0 writes',async()=>{
 const mutations=[store=>store.delete(headPath()),store=>store.set(headPath(),{schema:'old-head'}),store=>{store.get(headPath()).activationEpoch=epochB}];
 for(const mutate of mutations){const fake=fakeStore();fake.store.set('stagingActiveRecordV2Heads/danbridge',{oldUnscopedHead:true});fake.store.set('stagingActiveRecordV2Records/danbridge/collections/lessons/records/lesson-1',{oldUnscopedRecord:true});fake.store.set(ledgerPath('save-unrelated-old-12345'),{oldLedger:true});mutate(fake.store);await assert.rejects(()=>fake.adapter().execute(request()),/head|V2 head/);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0});assert.equal(fake.transactions[0].length,0)}
});

test('後續 new save 必須取得 current-head canonical ledger；缺失、損壞或 mirror 錯位皆 7 reads/0 writes',async()=>{
 const mutations=[
  (store,first)=>store.delete(ledgerPath(first.save.saveId)),
  (store,first)=>{store.get(ledgerPath(first.save.saveId)).schema='wrong-schema'},
  (store,first)=>{store.get(ledgerPath(first.save.saveId)).saveCommit.operations[0].operationHash='f'.repeat(64)},
  (store,first)=>{store.get(ledgerPath(first.save.saveId)).actorUid='attacker-uid-12345'},
  store=>{store.get(headPath()).head.updatedAt='2026-08-17T12:09:00+08:00'},
  store=>{store.get(headPath()).actorEmail='attacker@example.com'}
 ];
 for(let index=0;index<mutations.length;index++){
  const fake=fakeStore(),adapter=fake.adapter(),first=request({saveIdentity:save(`save-current-proof-${index}-a`)});await adapter.execute(first);mutations[index](fake.store,first);const second=request({saveIdentity:{...save(`save-current-proof-${index}-b`),createdAt:'2026-08-17T12:10:00+08:00'},changedKeys:[key('lesson-2')],baselineRecords:[absent('lesson-2')],localRecords:[envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:1}})]});await assert.rejects(()=>adapter.execute(second),/ledger|commit|mirror/);assert.deepEqual(counts(fake.events[1]),{reads:7,writes:0});assert.equal(fake.transactions[1].length,0);
 }
});

test('response-loss 後相同 save 重送會以 committed record/receipt/ledger 驗證並 0 writes',async()=>{
 const fake=fakeStore(),adapter=fake.adapter(),input=request({saveIdentity:save('save-response-loss-12345')}),first=await adapter.execute(input),second=await adapter.execute(input);
 assert.equal(first.state,'committed');assert.equal(second.state,'replayed');assert.equal(second.plan.saveCommit.commitHash,first.plan.saveCommit.commitHash);assert.deepEqual(counts(fake.events[1]),{reads:6,writes:0});assert.equal(fake.transactions[1].length,0);assert.equal(fake.store.get(recordPath('lessons','lesson-1')).revision,1);
});

test('exact replay 仍用已讀 incoming ledger 驗 outer head actor/email mirror；衝突為 6 reads/0 writes',async()=>{
 for(const mutate of [head=>{head.actorUid='other-owner-uid-12345'},head=>{head.actorEmail='other-owner@example.com'}]){const fake=fakeStore(),adapter=fake.adapter(),input=request({saveIdentity:save('save-replay-head-actor-12345')});await adapter.execute(input);mutate(fake.store.get(headPath()));await assert.rejects(()=>adapter.execute(input),/mirror/);assert.deepEqual(counts(fake.events[1]),{reads:6,writes:0});assert.equal(fake.transactions[1].length,0)}
});

test('historical retry：A→B→A 對不同 record 與同 record 合法 update 都 7 reads/0 writes 且所有 artifacts 不變',async()=>{
 const cases=[
  fake=>request({saveIdentity:{...save('save-historical-b-other-12345'),createdAt:'2026-08-17T12:01:00+08:00'},changedKeys:[key('lesson-2')],baselineRecords:[absent('lesson-2')],localRecords:[envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:1}})]}),
  fake=>{const committed=envelope({recordId:'lesson-1',revision:1,record:{id:'lesson-1',value:1}});return request({saveIdentity:{...save('save-historical-b-same-12345'),createdAt:'2026-08-17T12:01:00+08:00'},baselineRecords:[committed],localRecords:[envelope({recordId:'lesson-1',revision:1,record:{id:'lesson-1',value:2}})]})}
 ];
 for(let index=0;index<cases.length;index++){const fake=fakeStore(),adapter=fake.adapter(),inputA=request({saveIdentity:save(`save-historical-a-${index}-12345`)});await adapter.execute(inputA);await adapter.execute(cases[index](fake));const before=clone([...fake.store.entries()]);await assert.rejects(()=>adapter.execute(inputA),/historical saveId reuse/);assert.deepEqual(counts(fake.events[2]),{reads:7,writes:0});assert.equal(fake.transactions[2].length,0);assert.deepEqual([...fake.store.entries()],before)}
});

test('真 response-loss：transaction 已完整 commit 後 outer promise 丟錯，重送 exact replay 6 reads/0 writes',async()=>{
 const fake=fakeStore({throwAfterCommitOnce:true}),adapter=fake.adapter(),input=request({saveIdentity:save('save-real-response-loss-12345')});await assert.rejects(()=>adapter.execute(input),/response loss/);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:4});const committed=clone([...fake.store.entries()]),replay=await adapter.execute(input);assert.equal(replay.state,'replayed');assert.equal(replay.readCount,6);assert.deepEqual(counts(fake.events[1]),{reads:6,writes:0});assert.equal(fake.transactions[1].length,0);assert.deepEqual([...fake.store.entries()],committed);
});

test('versioned/interleaved fake 模擬 optimistic retry：不同 records 同 head 並送後 head 連續且兩份 artifacts 保留',async()=>{
 const fake=versionedInterleavedFakeStore(),inputA=request({saveIdentity:save('save-interleaved-a-12345')}),inputB=request({saveIdentity:{...save('save-interleaved-b-12345'),createdAt:'2026-08-17T12:01:00+08:00'},changedKeys:[key('lesson-2')],baselineRecords:[absent('lesson-2')],localRecords:[envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:2}})]}),[resultA,resultB]=await Promise.all([fake.adapter.execute(inputA),fake.adapter.execute(inputB)]);
 assert.deepEqual([resultA.plan.nextHead.revision,resultB.plan.nextHead.revision].sort((left,right)=>left-right),[1,2]);assert.equal(fake.store.get(headPath()).revision,2);assert.ok(fake.store.has(ledgerPath(inputA.save.saveId)));assert.ok(fake.store.has(ledgerPath(inputB.save.saveId)));assert.equal(fake.store.get(recordPath('lessons','lesson-1')).record.value,1);assert.equal(fake.store.get(recordPath('lessons','lesson-2')).record.value,2);assert.equal(fake.attempts.length,3);for(const event of fake.attempts){const firstWrite=event.findIndex(row=>row.type==='set');if(firstWrite!==-1){assert.ok(event.slice(0,firstWrite).every(row=>row.type==='get'));assert.ok(event.slice(firstWrite).every(row=>row.type==='set'))}}
});

test('replay 的 record、receipt 或 ledger 任一缺漏／hash／actor 衝突都 fail closed 且 0 writes',async()=>{
 const mutations=[
  (store,input)=>store.delete(recordPath('lessons','lesson-1')),
  (store,input)=>store.delete(receiptPath(input.save.saveId,0)),
  (store,input)=>{store.get(receiptPath(input.save.saveId,0)).actorUid='attacker-uid-12345'},
  (store,input)=>{store.get(receiptPath(input.save.saveId,0)).operationHash='f'.repeat(64)},
  (store,input)=>store.delete(ledgerPath(input.save.saveId)),
  (store,input)=>{store.get(ledgerPath(input.save.saveId)).actorEmail='attacker@example.com'},
  (store,input)=>{store.get(ledgerPath(input.save.saveId)).commitHash='f'.repeat(64)}
 ];
 for(let index=0;index<mutations.length;index++){
  const fake=fakeStore(),adapter=fake.adapter(),input=request({saveIdentity:save(`save-replay-conflict-${index}`)});await adapter.execute(input);mutations[index](fake.store,input);await assert.rejects(()=>adapter.execute(input));assert.deepEqual(counts(fake.events[1]),{reads:6,writes:0});assert.equal(fake.transactions[1].length,0);
 }
});

test('control/safety/epoch 衝突仍完成 targeted reads 但在任何 write 前 fail closed',async()=>{
 const mutations=[
  store=>{store.get(CONTROL_PATH).writeTakeover=false},
  store=>{store.get(SAFETY_PATH).writeAllowed=false},
  store=>{store.get(CONTROL_PATH).activationEpoch='epoch-other-12345'}
 ];
 for(const mutate of mutations){const fake=fakeStore();mutate(fake.store);await assert.rejects(()=>fake.adapter().execute(request()),/control|safety/);assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0});assert.equal(fake.transactions[0].length,0)}
});

test('同 record stale revision race 會 0 writes；不同 record 可依 head commit chain 順序成功',async()=>{
 const fake=fakeStore(),adapter=fake.adapter(),createOne=request({saveIdentity:save('save-sequence-one-12345')}),first=await adapter.execute(createOne),committedOne=envelope({recordId:'lesson-1',revision:1,record:{id:'lesson-1',value:1}}),updateOne=request({saveIdentity:{...save('save-sequence-update-12345'),createdAt:'2026-08-17T12:01:00+08:00'},baselineRecords:[committedOne],localRecords:[envelope({recordId:'lesson-1',revision:1,record:{id:'lesson-1',value:2}})]});
 const update=await adapter.execute(updateOne);assert.equal(update.plan.nextHead.revision,2);
 const stale=request({saveIdentity:{...save('save-sequence-stale-12345'),createdAt:'2026-08-17T12:02:00+08:00'},baselineRecords:[committedOne],localRecords:[envelope({recordId:'lesson-1',revision:1,record:{id:'lesson-1',value:3}})]});await assert.rejects(()=>adapter.execute(stale),/revision race/);assert.deepEqual(counts(fake.events[2]),{reads:7,writes:0});
 const createTwo=request({saveIdentity:{...save('save-sequence-two-12345'),createdAt:'2026-08-17T12:03:00+08:00'},changedKeys:[key('lesson-2')],baselineRecords:[absent('lesson-2')],localRecords:[envelope({recordId:'lesson-2',revision:0,record:{id:'lesson-2',value:1}})]}),second=await adapter.execute(createTwo);assert.equal(first.plan.nextHead.revision,1);assert.equal(second.plan.nextHead.revision,3);assert.equal(second.plan.nextHead.previousCommitHash,update.plan.saveCommit.commitHash);assert.equal(fake.store.get(recordPath('lessons','lesson-1')).revision,2);assert.equal(fake.store.get(recordPath('lessons','lesson-2')).revision,1);
});

test('new save 若 targeted receipt/ledger 已存在，或 record revision 已變，全部 0 writes',async()=>{
 const cases=[
  (fake,input)=>fake.store.set(receiptPath(input.save.saveId,0),{forged:true}),
  (fake,input)=>fake.store.set(ledgerPath(input.save.saveId),{forged:true})
 ];
 for(let index=0;index<cases.length;index++){const fake=fakeStore(),input=request({saveIdentity:save(`save-new-conflict-${index}`)});cases[index](fake,input);await assert.rejects(()=>fake.adapter().execute(input));assert.deepEqual(counts(fake.events[0]),{reads:6,writes:0})}
});

test('request 與 baseline/local 輸入不被 mutate，transaction 回傳計畫亦與來源脫鉤',async()=>{
 const fake=fakeStore(),input=request({saveIdentity:save('save-no-mutation-12345')}),before=clone(input),result=await fake.adapter().execute(input);assert.deepEqual(input,before);result.plan.operations[0].payload.record.value=999;assert.equal(input.localRecords[0].record.value,1);assert.equal(fake.store.get(recordPath('lessons','lesson-1')).record.value,1);
});
