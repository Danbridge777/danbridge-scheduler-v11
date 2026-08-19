import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ACTIVE_RECORD_SAVE_MAX_CHANGES,
 ACTIVE_RECORD_SAVE_ZERO_HASH,
 ACTIVE_RECORD_SYNC_HEAD_SCHEMA,
 activeRecordSaveEnvelopeHash,
 assertActiveRecordSaveCommit,
 buildActiveRecordSavePlan,
 isStrictActiveRecordSaveTimestamp
} from '../js/core/cloud-active-record-save-plan.js';
import {
 ACTIVE_RECORD_AUTHORITY_SAVE_PLAN_SCOPE,
 ACTIVE_RECORD_AUTHORITY_HEAD_SCHEMA,
 assertAuthorityBoundActiveRecordCommit,
 buildAuthorityBoundActiveRecordSavePlan
} from '../js/core/cloud-active-record-authority-save-plan.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const CAPACITY_COUNT=Number(process.env.DANBRIDGE_V2_CAPACITY_COUNT??15_000);
if(![15_000,22_000,30_000].includes(CAPACITY_COUNT))throw new Error('DANBRIDGE_V2_CAPACITY_COUNT must be 15000, 22000, or 30000');
import {
 RECORD_SYNC_V2_AUTHORITY_BOUND_HEAD_SCHEMA,
 RECORD_SYNC_V2_AUTHORITY_BOUND_HEAD_SCOPE,
 RECORD_SYNC_V2_TAKEOVER_CANDIDATE_STATE
} from '../js/core/cloud-record-sync-v2-takeover-candidate.js';

const epoch='epoch-save-12345';
const save={saveId:'save-deterministic-12345',deviceId:'device-owner-12345',actorUid:'owner-uid-12345',actorEmail:'owner@example.com',createdAt:'2026-08-17T09:00:00+08:00'};
const key=(recordId,collection='lessons')=>({collection,recordId});
const head=(overrides={})=>({schema:ACTIVE_RECORD_SYNC_HEAD_SCHEMA,environment:'staging',companyId:'danbridge',activationEpoch:epoch,revision:0,headSaveId:'',previousCommitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,commitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,operationCount:0,updatedAt:'',...overrides});
function envelope({collection='lessons',recordId='lesson-1',exists=true,revision=1,deleted=false,record={id:recordId,room:'A'},activationEpoch=epoch}={}){
 const core={collection,recordId,exists,revision,deleted,record};
 return{environment:'staging',companyId:'danbridge',activationEpoch,...core,recordHash:activeRecordSaveEnvelopeHash(core)};
}
const absent=(recordId='lesson-1',collection='lessons')=>envelope({collection,recordId,exists:false,revision:0,deleted:false,record:null});
function input({changedKeys=[key('lesson-1')],baselineRecords=[envelope()],localRecords=[envelope({record:{id:'lesson-1',room:'B'}})],remoteRecords=baselineRecords,currentSyncHead=head(),saveIdentity=save,confirmedExistingSaveCommitHash=null}={}){
 return{save:saveIdentity,changedKeys,baselineRecords,localRecords,remoteRecords,currentSyncHead,confirmedExistingSaveCommitHash};
}
const clone=value=>structuredClone(value);
const committed=value=>envelope({...value,exists:true,revision:value.revision+1,record:clone(value.record)});

const authorityBinding={authorityRootHash:'a'.repeat(64),genesisAuthorityHash:'b'.repeat(64),genesisAuthorityAuditHash:'c'.repeat(64),changesAuthorityHash:'d'.repeat(64),changesAuthorityAuditHash:'e'.repeat(64),seedId:'v2-genesis:'+'f'.repeat(64)};
const authorityH0=()=>{const body={schema:RECORD_SYNC_V2_AUTHORITY_BOUND_HEAD_SCHEMA,state:RECORD_SYNC_V2_TAKEOVER_CANDIDATE_STATE,scope:RECORD_SYNC_V2_AUTHORITY_BOUND_HEAD_SCOPE,environment:'staging',companyId:'danbridge',sourceV1ActivationEpoch:'source-v1-epoch-12345',targetV2Epoch:epoch,...authorityBinding,revision:0,headSaveId:'',previousCommitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,commitHash:ACTIVE_RECORD_SAVE_ZERO_HASH,operationCount:0,updatedAt:'',lastActorUid:'',lastActorEmail:'',previousHeadHash:ACTIVE_RECORD_SAVE_ZERO_HASH};return{...body,headHash:sha256Canonical(body)}};
const authorityInput=overrides=>{const base=input(overrides),{currentSyncHead,confirmedExistingSaveCommitHash,...request}=base;return{...request,currentHead:overrides?.currentHead??authorityH0(),expectedAuthorityBinding:overrides?.expectedAuthorityBinding??{activationEpoch:epoch,...authorityBinding},currentAuthorityLedger:overrides?.currentAuthorityLedger??null}};

test('authority H0→H1直接建立root-bound commit/head/ledger/receipt/daily DAG且candidate不授權runtime',()=>{const plan=buildAuthorityBoundActiveRecordSavePlan(authorityInput());assert.equal(plan.scope,ACTIVE_RECORD_AUTHORITY_SAVE_PLAN_SCOPE);assert.equal(plan.nextHead.schema,ACTIVE_RECORD_AUTHORITY_HEAD_SCHEMA);assert.equal(plan.nextHead.previousHeadHash,authorityH0().headHash);assert.equal(plan.saveCommit.baseHeadHash,authorityH0().headHash);for(const artifact of [plan.saveCommit,plan.nextHead,plan.ledger,...plan.receipts,...plan.dailyRecords])for(const key of Object.keys(authorityBinding))assert.equal(artifact[key],authorityBinding[key]);assert.equal(plan.ledger.resultHeadHash,plan.nextHead.headHash);assert.equal(plan.receipts[0].resultHeadHash,plan.nextHead.headHash);assert.equal(plan.dailyRecords[0].resultHeadHash,plan.nextHead.headHash);assert.equal('replay'in plan,false);assert.equal(plan.responseLossState,'needs-future-strict-durable-readback');assert.match(plan.expectedBindingScope,/future-branded-active-control/);assert.match(plan.scope,/not-rules-runtime/)})

test('authority planner涵蓋create/update/delete/revive與genesis rev1 tombstone delete/revive；M8固定工作量',()=>{const active=envelope(),tomb=envelope({revision:1,deleted:true}),cases=[[absent(),envelope({exists:true,revision:0,record:{id:'lesson-1',room:'new'}}),'create'],[active,envelope({record:{id:'lesson-1',room:'B'}}),'update'],[active,envelope({deleted:true,record:active.record}),'delete'],[tomb,envelope({revision:1,deleted:false,record:{id:'lesson-1',room:'revived'}}),'revive']];for(const [baseline,local,type] of cases){const plan=buildAuthorityBoundActiveRecordSavePlan(authorityInput({baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline]}));assert.equal(plan.operations[0].type,type)}const keys=Array.from({length:8},(_,index)=>key('authority-'+index)),baseline=keys.map(row=>envelope({...row,record:{id:row.recordId,value:0}})),local=keys.map(row=>envelope({...row,record:{id:row.recordId,value:1}})),m8=buildAuthorityBoundActiveRecordSavePlan(authorityInput({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline}));assert.equal(m8.operationCount,8);assert.deepEqual(m8.workUnits,{changedKeys:8,envelopesValidated:24,operationsBuilt:8});assert.equal(m8.dailyRecords.length,8);assert.equal(m8.receipts.length,8)})

test('expected binding與current Hn ledger是new-save結構規劃的雙重anchor；response-loss不冒充replay',()=>{const original=authorityInput(),first=buildAuthorityBoundActiveRecordSavePlan(original),committedBase=committed(original.localRecords[0]),nextLocal=envelope({revision:committedBase.revision,record:{id:'lesson-1',room:'C'}}),secondInput=authorityInput({saveIdentity:{...save,saveId:'save-authority-second-12345',createdAt:'2026-08-17T09:01:00+08:00'},baselineRecords:[committedBase],localRecords:[nextLocal],remoteRecords:[committedBase],currentHead:first.nextHead,currentAuthorityLedger:first.ledger}),second=buildAuthorityBoundActiveRecordSavePlan(secondInput);assert.equal(second.nextHead.revision,2);assert.equal(second.nextHead.previousHeadHash,first.nextHead.headHash);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...original,expectedAuthorityBinding:{...original.expectedAuthorityBinding,authorityRootHash:'1'.repeat(64)}}),/binding\/head mismatch/);for(const patch of [{resultHeadHash:'1'.repeat(64)},{commitHash:'2'.repeat(64)},{authorityRootHash:'3'.repeat(64)}]){const core={...first.ledger,...patch};delete core.ledgerHash;const forged={...core,ledgerHash:sha256Canonical(core)};assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...secondInput,currentAuthorityLedger:forged}),/ledger/)}assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...secondInput,currentAuthorityLedger:null}),/requires current ledger/);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...original,currentAuthorityLedger:first.ledger}),/H0 current ledger/);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...original,currentHead:first.nextHead,currentAuthorityLedger:first.ledger}),/needs-future-strict-durable-readback/);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...original,currentHead:head()}),/authority (head|Hn)/);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...original,currentHead:null}),/authority head/)})

test('authority head/input descriptor getter0、custom proto與output mutation全部fail closed/deepFreeze',()=>{const source=authorityInput(),before=clone(source),plan=buildAuthorityBoundActiveRecordSavePlan(source);assert.deepEqual(source,before);assert.equal(Object.isFrozen(plan),true);assert.equal(Object.isFrozen(plan.nextHead),true);let calls=0;const hostile={...source};Object.defineProperty(hostile,'currentHead',{enumerable:true,get(){calls++;return authorityH0()}});assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan(hostile),/data field|JSON/);const hostileHead={...authorityH0()};Object.defineProperty(hostileHead,'authorityRootHash',{enumerable:true,get(){calls++;return authorityBinding.authorityRootHash}});assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan({...source,currentHead:hostileHead}),/data field|JSON/);assert.equal(calls,0);assert.throws(()=>buildAuthorityBoundActiveRecordSavePlan(Object.assign(Object.create({}),source)),/plain object|JSON/)})

test('authority commit完整重算operation、summary、delta、chain且hostile getter零執行',()=>{
 const valid=buildAuthorityBoundActiveRecordSavePlan(authorityInput()).saveCommit;
 assert.doesNotThrow(()=>assertAuthorityBoundActiveRecordCommit(valid));
 const rehash=mutate=>{const forged=clone(valid);mutate(forged);delete forged.commitHash;forged.commitHash=sha256Canonical(forged);return forged};
 const invalid=[
  rehash(commit=>{commit.activationEpoch='other-authority-epoch'}),
  rehash(commit=>{commit.operationCount=2}),
  rehash(commit=>{commit.createdAt='2026-08-17 09:00:00'}),
  rehash(commit=>{commit.operations={}}),
  rehash(commit=>{commit.operations[0].operationHash='1'.repeat(64)}),
  rehash(commit=>{commit.operationSummaries[0].afterHash='record-item-v1:'+'2'.repeat(64)}),
  rehash(commit=>{commit.collectionCountDeltas[0].activeCountDelta++})
 ];
 for(const forged of invalid)assert.throws(()=>assertAuthorityBoundActiveRecordCommit(forged),/authority|JSON/);
 const badActor=rehash(commit=>{commit.operations[0].actorUid='different-owner-uid';const operation={...commit.operations[0]};delete operation.operationHash;commit.operations[0].operationHash=sha256Canonical(operation)});
 assert.throws(()=>assertAuthorityBoundActiveRecordCommit(badActor),/operation/);
 let calls=0;
 const hostileTop=clone(valid);Object.defineProperty(hostileTop,'operations',{enumerable:true,get(){calls++;return[]}});
 assert.throws(()=>assertAuthorityBoundActiveRecordCommit(hostileTop),/JSON|data field/);
 const hostileNested=clone(valid);Object.defineProperty(hostileNested.operations[0],'payload',{enumerable:true,get(){calls++;return{}}});
 assert.throws(()=>assertAuthorityBoundActiveRecordCommit(hostileNested),/JSON|data field/);
 assert.equal(calls,0)
})

test('create、update、delete/tombstone 與 revive 都只規劃明確指定的一筆',()=>{
 const created=buildActiveRecordSavePlan(input({baselineRecords:[absent()],remoteRecords:[absent()],localRecords:[envelope({exists:true,revision:0,record:{id:'lesson-1',room:'new'}})]}));
 assert.equal(created.operations[0].type,'create');assert.equal(created.operations[0].baseRevision,0);assert.equal(created.operations[0].nextRevision,1);

 const updated=buildActiveRecordSavePlan(input());
 assert.equal(updated.operations[0].type,'update');assert.equal(updated.operations[0].payload.record.room,'B');assert.equal(updated.operations[0].actorUid,save.actorUid);assert.equal(updated.operations[0].actorEmail,save.actorEmail);assert.equal(updated.saveCommit.actorUid,save.actorUid);assert.equal(updated.saveCommit.actorEmail,save.actorEmail);

 const active=envelope(),deleted=envelope({deleted:true});
 const tombstone=buildActiveRecordSavePlan(input({baselineRecords:[active],remoteRecords:[active],localRecords:[deleted]}));
 assert.equal(tombstone.operations[0].type,'delete');assert.equal(tombstone.operations[0].payload.deleted,true);assert.equal(tombstone.operations[0].nextRevision,2);

 const oldTombstone=envelope({revision:2,deleted:true}),revived=envelope({revision:2,deleted:false,record:{id:'lesson-1',room:'revived'}});
 const revival=buildActiveRecordSavePlan(input({baselineRecords:[oldTombstone],remoteRecords:[oldTombstone],localRecords:[revived]}));
 assert.equal(revival.operations[0].type,'revive');assert.equal(revival.operations[0].baseRevision,2);assert.equal(revival.operations[0].nextRevision,3);
});

test('非 changes 文件嚴格綁定 record.id；strict hash 仍支援未來專用 changes envelope 沒有 record.id',()=>{
 const wrong={...envelope(),record:{id:'lesson-other',room:'A'}};
 assert.throws(()=>buildActiveRecordSavePlan(input({baselineRecords:[wrong],remoteRecords:[wrong]})),/record\.id.*recordId/);
 for(const id of [123,{value:'lesson-1'},{toString(){return'lesson-1'}}])assert.throws(()=>activeRecordSaveEnvelopeHash({collection:'lessons',recordId:'lesson-1',exists:true,revision:1,deleted:false,record:{id}}),/record\.id.*recordId/);

 const changeHash=activeRecordSaveEnvelopeHash({collection:'changes',recordId:'seq_00000001_deadbeef',exists:true,revision:1,deleted:false,record:{type:'lesson-updated',lessonId:'lesson-1'}});assert.match(changeHash,/^record-item-v1:[a-f0-9]{64}$/);
});

test('recordId 依 UTF-8 1500 bytes 邊界驗證並拒絕 slash、newline、null、control 與 DEL',()=>{
 const acceptedId='課'.repeat(500),baseline=envelope({recordId:acceptedId,record:{id:acceptedId,value:0}}),local=envelope({recordId:acceptedId,record:{id:acceptedId,value:1}}),plan=buildActiveRecordSavePlan(input({changedKeys:[key(acceptedId)],baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline]}));assert.equal(new TextEncoder().encode(acceptedId).length,1500);assert.equal(plan.operations[0].recordId,acceptedId);
 const rejected=['課'.repeat(501),'bad/id','bad\nline','bad\0null','bad\u001fcontrol','bad\u007fdel',`bad${String.fromCharCode(0xd800)}high`,`bad${String.fromCharCode(0xdc00)}low`];
 for(const recordId of rejected)assert.throws(()=>activeRecordSaveEnvelopeHash({collection:'lessons',recordId,exists:true,revision:1,deleted:false,record:{id:recordId}}),/identity 無效/);
});

test('record 僅允許可無損 JSON plain object，nested/array 的所有非法值都 fail closed',()=>{
 const core=record=>({collection:'lessons',recordId:'lesson-1',exists:true,revision:1,deleted:false,record}),custom=Object.assign(Object.create({custom:true}),{value:'x'}),cycle={value:'x'};cycle.self=cycle;const withSymbolKey={value:'x'};withSymbolKey[Symbol('hidden')]='lost';const sparse=[];sparse[1]='value';const extra=[];extra.extra='lost';
 const invalid=[
  {id:'lesson-1',nested:{value:undefined}},
  {id:'lesson-1',nested:[undefined]},
  {id:'lesson-1',nested:{value:NaN}},
  {id:'lesson-1',nested:{value:Infinity}},
  {id:'lesson-1',nested:{value:-0}},
  {id:'lesson-1',nested:{value:1n}},
  {id:'lesson-1',nested:{value:()=>{}}},
  {id:'lesson-1',nested:{value:Symbol('x')}},
  {id:'lesson-1',nested:{value:new Date('2026-08-17T00:00:00Z')}},
  {id:'lesson-1',nested:custom},
  {id:'lesson-1',nested:cycle},
  {id:'lesson-1',nested:withSymbolKey},
  {id:'lesson-1',nested:sparse},
  {id:'lesson-1',nested:extra}
 ];
 for(const record of invalid)assert.throws(()=>activeRecordSaveEnvelopeHash(core(record)),/JSON|finite|plain|cycle|symbol|sparse|array/);
});

test('generic planner 對 changes create/update/delete/revive 全拒絕，且拒絕發生在讀 envelopes 前',()=>{
 const changeKey=key('seq_00000002_cafebabe','changes'),missing=absent(changeKey.recordId,'changes'),active=envelope({...changeKey,record:{type:'created'}}),updated=envelope({...changeKey,record:{type:'changed'}}),deleted=envelope({...changeKey,deleted:true,record:{type:'created'}}),tombstone=envelope({...changeKey,revision:2,deleted:true,record:{type:'created'}}),revived=envelope({...changeKey,revision:2,deleted:false,record:{type:'revived'}}),cases=[['create',missing,envelope({...changeKey,exists:true,revision:0,record:{type:'created'}})],['update',active,updated],['delete',active,deleted],['revive',tombstone,revived]];
 for(const [kind,baseline,local] of cases){const sentinel={reads:0},guard=rows=>new Proxy(rows,{get(target,property,receiver){sentinel.reads++;return Reflect.get(target,property,receiver)}});assert.throws(()=>buildActiveRecordSavePlan(input({changedKeys:[changeKey],baselineRecords:guard([baseline]),localRecords:guard([local]),remoteRecords:guard([baseline])})),/dedicated immutable audit\/append planner/,kind);assert.equal(sentinel.reads,0,`${kind} 不得讀 envelopes`)}
});

test('delete tombstone 必須逐欄完整保留 remote record，縮欄位或改欄位都拒絕',()=>{
 const remote=envelope({record:{id:'lesson-1',room:'A',note:'keep',nested:{value:1}}}),valid=envelope({deleted:true,record:{id:'lesson-1',room:'A',note:'keep',nested:{value:1}}}),plan=buildActiveRecordSavePlan(input({baselineRecords:[remote],localRecords:[valid],remoteRecords:[remote]}));assert.deepEqual(plan.operations[0].payload.record,remote.record);
 const shortened=envelope({deleted:true,record:{id:'lesson-1',room:'A'}}),changed=envelope({deleted:true,record:{id:'lesson-1',room:'B',note:'keep',nested:{value:1}}});
 for(const local of [shortened,changed])assert.throws(()=>buildActiveRecordSavePlan(input({baselineRecords:[remote],localRecords:[local],remoteRecords:[remote]})),/完整保留 remote record/);
});

test('嚴格 JSON clone 不 mutate 輸入，且 operation payload 與來源完全脫鉤',()=>{
 const baseline=envelope({record:{id:'lesson-1',nested:{list:[1,'two',null,true]}}}),local=envelope({record:{id:'lesson-1',nested:{list:[1,'changed',null,true]}}}),source=input({baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline]}),before=clone(source),plan=buildActiveRecordSavePlan(source);assert.deepEqual(source,before);plan.operations[0].payload.record.nested.list[1]='mutated-output';assert.equal(source.localRecords[0].record.nested.list[1],'changed');
});

test('actor 必須不可變綁入 operation/commit；未正規化 email、非法 uid 或缺欄位全部拒絕',()=>{
 const first=buildActiveRecordSavePlan(input()),second=buildActiveRecordSavePlan(input());assert.equal(first.operations[0].operationHash,second.operations[0].operationHash);assert.equal(first.saveCommit.commitHash,second.saveCommit.commitHash);
 for(const actor of [{...save,actorEmail:'OWNER@example.com'},{...save,actorEmail:' owner@example.com '},{...save,actorEmail:'not-an-email'},{...save,actorUid:'short'}])assert.throws(()=>buildActiveRecordSavePlan(input({saveIdentity:actor})),/identity 或 actor/);
 const missing=clone(save);delete missing.actorUid;assert.throws(()=>buildActiveRecordSavePlan(input({saveIdentity:missing})),/欄位無效/);
});

test('saveCommit 只列受影響 collection 的 deterministic count deltas 並納入 commit hash',()=>{
 const keys=[key('student-new','students'),key('lesson-update'),key('lesson-new'),key('teacher-delete','teachers'),key('branch-revive','branches')],studentMissing=absent('student-new','students'),lessonUpdate=envelope({recordId:'lesson-update',record:{id:'lesson-update',room:'A'}}),lessonMissing=absent('lesson-new'),teacherActive=envelope({collection:'teachers',recordId:'teacher-delete',record:{id:'teacher-delete',name:'T'}}),branchTombstone=envelope({collection:'branches',recordId:'branch-revive',revision:2,deleted:true,record:{id:'branch-revive',name:'B'}}),baseline=[studentMissing,lessonUpdate,lessonMissing,teacherActive,branchTombstone],local=[envelope({collection:'students',recordId:'student-new',exists:true,revision:0,record:{id:'student-new',name:'S'}}),envelope({recordId:'lesson-update',record:{id:'lesson-update',room:'B'}}),envelope({recordId:'lesson-new',exists:true,revision:0,record:{id:'lesson-new',room:'N'}}),envelope({collection:'teachers',recordId:'teacher-delete',deleted:true,record:{id:'teacher-delete',name:'T'}}),envelope({collection:'branches',recordId:'branch-revive',revision:2,deleted:false,record:{id:'branch-revive',name:'B2'}})],plan=buildActiveRecordSavePlan(input({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline}));
 assert.deepEqual(plan.saveCommit.collectionCountDeltas,[
  {collection:'branches',documentCountDelta:0,activeCountDelta:1,tombstoneCountDelta:-1},
  {collection:'lessons',documentCountDelta:1,activeCountDelta:1,tombstoneCountDelta:0},
  {collection:'students',documentCountDelta:1,activeCountDelta:1,tombstoneCountDelta:0},
  {collection:'teachers',documentCountDelta:0,activeCountDelta:-1,tombstoneCountDelta:1}
 ]);
 const reversed=buildActiveRecordSavePlan(input({changedKeys:[...keys].reverse(),baselineRecords:[...baseline].reverse(),localRecords:[...local].reverse(),remoteRecords:[...baseline].reverse()}));assert.equal(plan.saveCommit.commitHash,reversed.saveCommit.commitHash);assert.deepEqual(plan.saveCommit.collectionCountDeltas,reversed.saveCommit.collectionCountDeltas);
});

test('M=8 有固定工作量；M=9 在檢查 envelopes 前零副作用拒絕並要求 bulk',()=>{
 const changedKeys=Array.from({length:ACTIVE_RECORD_SAVE_MAX_CHANGES},(_,index)=>key(`lesson-${index}`)),baselineRecords=changedKeys.map(value=>envelope({...value,record:{id:value.recordId,value:0}})),localRecords=changedKeys.map(value=>envelope({...value,record:{id:value.recordId,value:1}}));
 const accepted=buildActiveRecordSavePlan(input({changedKeys,baselineRecords,localRecords,remoteRecords:baselineRecords}));
 assert.equal(accepted.operationCount,8);assert.deepEqual(accepted.workUnits,{changedKeys:8,envelopesValidated:24,operationsBuilt:8});

 const nineKeys=[...changedKeys,key('lesson-8')],sentinel={touched:false},badRows=new Proxy([],{get(target,property,receiver){if(property==='length')sentinel.touched=true;return Reflect.get(target,property,receiver)}}),oversized=input({changedKeys:nineKeys,baselineRecords:badRows,localRecords:badRows,remoteRecords:badRows}),before=clone(oversized.changedKeys);
 assert.throws(()=>buildActiveRecordSavePlan(oversized),/最多 8 筆|bulk/);assert.equal(sentinel.touched,false);assert.deepEqual(oversized.changedKeys,before);
});

test('commit hash 與 operation 次序完全 deterministic，不受 changedKeys 或 envelopes 輸入順序影響',()=>{
 const keys=[key('lesson-b'),key('lesson-a')],baseline=keys.map(value=>envelope({...value,record:{id:value.recordId,value:0}})),local=keys.map(value=>envelope({...value,record:{id:value.recordId,value:1}})),first=buildActiveRecordSavePlan(input({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline})),second=buildActiveRecordSavePlan(input({changedKeys:[...keys].reverse(),baselineRecords:[...baseline].reverse(),localRecords:[...local].reverse(),remoteRecords:[...baseline].reverse()}));
 assert.equal(first.saveCommit.commitHash,second.saveCommit.commitHash);assert.deepEqual(first.operations,second.operations);assert.deepEqual(first.operations.map(row=>row.recordId),['lesson-a','lesson-b']);
});

test('composed/decomposed Unicode recordId 使用 locale-independent raw 排序，反序輸入仍有相同 operationId/commitHash',()=>{
 const composed='lesson-caf\u00e9',decomposed='lesson-cafe\u0301',keys=[key(composed),key(decomposed)],baseline=keys.map(value=>envelope({...value,record:{id:value.recordId,value:0}})),local=keys.map(value=>envelope({...value,record:{id:value.recordId,value:1}})),first=buildActiveRecordSavePlan(input({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline})),second=buildActiveRecordSavePlan(input({changedKeys:[...keys].reverse(),baselineRecords:[...baseline].reverse(),localRecords:[...local].reverse(),remoteRecords:[...baseline].reverse()}));
 assert.notEqual(composed,decomposed);assert.deepEqual(first.operations,second.operations);assert.equal(first.saveCommit.commitHash,second.saveCommit.commitHash);assert.deepEqual(first.operations.map(value=>value.operationId),second.operations.map(value=>value.operationId));
});

test('createdAt 只接受 Firestore 範圍內、含 Z/明確 offset 與最多 nanosecond 的嚴格 ISO-8601',()=>{
 for(const createdAt of ['0001-01-01T00:00:00Z','0001-01-01T00:00:00-14:00','9999-12-31T23:59:59.999999999Z','9999-12-31T23:59:59+14:00','2026-08-17T12:00:00Z','2026-08-17T12:00:00.123456789+08:00','2024-02-29T23:59:59-05:30','2026-08-17T12:00:00+14:00','2026-08-17T12:00:00-14:00']){assert.equal(isStrictActiveRecordSaveTimestamp(createdAt),true);assert.doesNotThrow(()=>buildActiveRecordSavePlan(input({saveIdentity:{...save,createdAt}})))}
 for(const createdAt of ['0','0000-01-01T00:00:00Z','0001-01-01T00:00:00+14:00','9999-12-31T23:59:59-14:00','2026-08-17T12:00:00.1234567890Z','2026-08-17T12:00:00','2026-08-17 12:00:00Z','2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2026-13-01T12:00:00Z','2026-08-17T24:00:00Z','2026-08-17T12:60:00Z','2026-08-17T12:00:60Z','2026-08-17T12:00:00+14:01','2026-08-17T12:00:00+23:59','2026-08-17T12:00:00-14:01']){assert.equal(isStrictActiveRecordSaveTimestamp(createdAt),false);assert.throws(()=>buildActiveRecordSavePlan(input({saveIdentity:{...save,createdAt}})),/identity 或 actor/)}
});

test('strict saveCommit verifier 驗 exact nested summaries/deltas/canonical hash 且不 mutate',()=>{
 const keys=[key('lesson-a'),key('lesson-b')],baseline=keys.map(value=>envelope({...value,record:{id:value.recordId,value:0}})),local=keys.map(value=>envelope({...value,record:{id:value.recordId,value:1}})),commit=buildActiveRecordSavePlan(input({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline})).saveCommit,before=clone(commit);assert.equal(assertActiveRecordSaveCommit(commit),commit);assert.deepEqual(commit,before);
 const mutations=[value=>{value.operations[0].extra=true},value=>{value.operations[0].type='unknown'},value=>{value.operations.reverse()},value=>{value.operations[0].operationHash='f'.repeat(64)},value=>{value.collectionCountDeltas[0].activeCountDelta++},value=>{value.collectionCountDeltas[0].extra=0},value=>{value.commitHash='f'.repeat(64)}];
 for(const mutate of mutations){const changed=clone(commit);mutate(changed);assert.throws(()=>assertActiveRecordSaveCommit(changed),/commit|summary|delta|canonical/)}
});

test('strict saveCommit verifier 接受 Firestore alphabetic map-key readback，但仍拒絕值或 array 順序改變',()=>{
 const keys=[key('lesson-a'),key('lesson-b')],baseline=keys.map(value=>envelope({...value,record:{id:value.recordId,value:0}})),local=keys.map(value=>envelope({...value,record:{id:value.recordId,value:1}})),commit=buildActiveRecordSavePlan(input({changedKeys:keys,baselineRecords:baseline,localRecords:local,remoteRecords:baseline})).saveCommit,alphabetic=value=>Array.isArray(value)?value.map(alphabetic):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,alphabetic(value[key])])):value),firestoreReadback=alphabetic(commit);
 assert.equal(firestoreReadback.commitHash,commit.commitHash);assert.doesNotThrow(()=>assertActiveRecordSaveCommit(firestoreReadback));
 const changedValue=alphabetic(commit);changedValue.collectionCountDeltas[0].activeCountDelta++;assert.throws(()=>assertActiveRecordSaveCommit(changedValue),/delta|canonical/);
 const changedArrayOrder=alphabetic(commit);changedArrayOrder.operations.reverse();assert.throws(()=>assertActiveRecordSaveCommit(changedArrayOrder),/summary|canonical/);
});

test('相同 saveId 可由同一永久輸入重建相同計畫；head 已提交時只回報 verified replay',()=>{
 const originalInput=input(),first=buildActiveRecordSavePlan(originalInput),same=buildActiveRecordSavePlan(originalInput),committedRemote=committed(originalInput.localRecords[0]),replay=buildActiveRecordSavePlan({...originalInput,remoteRecords:[committedRemote],currentSyncHead:first.nextHead,confirmedExistingSaveCommitHash:first.saveCommit.commitHash});
 assert.deepEqual(first,same);assert.equal(replay.replay,true);assert.equal(replay.saveCommit.commitHash,first.saveCommit.commitHash);assert.deepEqual(replay.nextHead,first.nextHead);
 const forgedHead={...first.nextHead,commitHash:'f'.repeat(64)};
 assert.throws(()=>buildActiveRecordSavePlan({...originalInput,remoteRecords:[committedRemote],currentSyncHead:forgedHead,confirmedExistingSaveCommitHash:forgedHead.commitHash}),/replay.*衝突/);
});

test('current-head response-loss replay 對 update/create/delete/revive 都驗 committed remote 並重建原 operation/commit',()=>{
 const active=envelope(),tombstone=envelope({revision:2,deleted:true}),cases=[
  ['update',active,envelope({record:{id:'lesson-1',room:'updated'}})],
  ['create',absent(),envelope({exists:true,revision:0,record:{id:'lesson-1',room:'created'}})],
  ['delete',active,envelope({deleted:true,record:clone(active.record)})],
  ['revive',tombstone,envelope({revision:2,deleted:false,record:{id:'lesson-1',room:'revived'}})]
 ];
 for(const [kind,baseline,local] of cases){const original=input({baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline],saveIdentity:{...save,saveId:`save-replay-${kind}-12345`}}),first=buildActiveRecordSavePlan(original),remote=committed(local),replay=buildActiveRecordSavePlan({...original,remoteRecords:[remote],currentSyncHead:first.nextHead,confirmedExistingSaveCommitHash:first.saveCommit.commitHash});assert.equal(replay.replay,true);assert.deepEqual(replay.operations,first.operations);assert.deepEqual(replay.saveCommit,first.saveCommit);assert.deepEqual(replay.nextHead,first.nextHead)}
});

test('current-head replay 對舊 remote、部分寫入、錯 revision 或錯 hash 全部拒絕',()=>{
 const baseline=envelope(),local=envelope({record:{id:'lesson-1',room:'committed'}}),original=input({baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline]}),first=buildActiveRecordSavePlan(original),replayBase={...original,currentSyncHead:first.nextHead,confirmedExistingSaveCommitHash:first.saveCommit.commitHash};
 assert.throws(()=>buildActiveRecordSavePlan({...replayBase,remoteRecords:[baseline]}),/尚未完整等於 committed result/);
 assert.throws(()=>buildActiveRecordSavePlan({...replayBase,remoteRecords:[envelope({revision:3,record:clone(local.record)})]}),/尚未完整等於 committed result/);
 assert.throws(()=>buildActiveRecordSavePlan({...replayBase,remoteRecords:[envelope({revision:2,record:{id:'lesson-1',room:'wrong'}})]}),/尚未完整等於 committed result/);

 const keys=[key('lesson-1'),key('lesson-2')],baselines=[baseline,envelope({recordId:'lesson-2',record:{id:'lesson-2',room:'A'}})],locals=[local,envelope({recordId:'lesson-2',record:{id:'lesson-2',room:'committed'}})],multiInput=input({changedKeys:keys,baselineRecords:baselines,localRecords:locals,remoteRecords:baselines,saveIdentity:{...save,saveId:'save-replay-partial-12345'}}),multi=buildActiveRecordSavePlan(multiInput),partial=[committed(locals[0]),baselines[1]];assert.throws(()=>buildActiveRecordSavePlan({...multiInput,remoteRecords:partial,currentSyncHead:multi.nextHead,confirmedExistingSaveCommitHash:multi.saveCommit.commitHash}),/尚未完整等於 committed result/);
});

test('immutable ledger 只允許 current-head exact replay；null 只代表 authoritative lookup confirmed-absent',()=>{
 const aInput=input(),a=buildActiveRecordSavePlan(aInput);
 const omitted=clone(aInput);delete omitted.confirmedExistingSaveCommitHash;assert.throws(()=>buildActiveRecordSavePlan(omitted),/輸入欄位無效/);
 assert.throws(()=>buildActiveRecordSavePlan({...aInput,currentSyncHead:a.nextHead,confirmedExistingSaveCommitHash:null}),/authoritative targeted immutable ledger/);
 assert.throws(()=>buildActiveRecordSavePlan({...aInput,currentSyncHead:a.nextHead,confirmedExistingSaveCommitHash:'f'.repeat(64)}),/authoritative targeted immutable ledger/);
 const aCommitted=committed(aInput.localRecords[0]),bLocal=envelope({revision:aCommitted.revision,record:{id:'lesson-1',room:'C'}}),bInput=input({baselineRecords:[aCommitted],localRecords:[bLocal],remoteRecords:[aCommitted],saveIdentity:{...save,saveId:'save-ledger-b-12345'},currentSyncHead:a.nextHead}),b=buildActiveRecordSavePlan(bInput);assert.equal(b.nextHead.revision,2);
 assert.throws(()=>buildActiveRecordSavePlan({...aInput,currentSyncHead:b.nextHead,confirmedExistingSaveCommitHash:a.saveCommit.commitHash}),/historical saveId reuse/);
 assert.throws(()=>buildActiveRecordSavePlan({...aInput,confirmedExistingSaveCommitHash:'bad'}),/authoritative targeted lookup confirmed-absent/);
});

test('syncHead commit chain 對 revision 1 與後續 revision 使用不同 fail-closed 規則',()=>{
 const first=buildActiveRecordSavePlan(input());assert.doesNotThrow(()=>buildActiveRecordSavePlan({...input({saveIdentity:{...save,saveId:'save-next-12345'}}),currentSyncHead:first.nextHead}));
 assert.throws(()=>buildActiveRecordSavePlan({...input(),currentSyncHead:{...first.nextHead,commitHash:ACTIVE_RECORD_SAVE_ZERO_HASH}}),/commit chain/);
 assert.throws(()=>buildActiveRecordSavePlan({...input(),currentSyncHead:{...first.nextHead,previousCommitHash:'a'.repeat(64)}}),/previous commit chain/);
 const revisionTwo=head({revision:2,headSaveId:'save-head-two-12345',previousCommitHash:'a'.repeat(64),commitHash:'b'.repeat(64),operationCount:1,updatedAt:'2026-08-17T08:00:00+08:00'});assert.doesNotThrow(()=>buildActiveRecordSavePlan({...input({saveIdentity:{...save,saveId:'save-after-two-12345'}}),currentSyncHead:revisionTwo}));
 assert.throws(()=>buildActiveRecordSavePlan({...input(),currentSyncHead:{...revisionTwo,previousCommitHash:ACTIVE_RECORD_SAVE_ZERO_HASH}}),/previous commit chain/);
});

test('remote revision race、缺 revision、hash 或 epoch 不符全部 fail closed 且不改輸入',()=>{
 const baseline=envelope(),local=envelope({record:{id:'lesson-1',room:'Local'}}),raced=envelope({revision:2,record:{id:'lesson-1',room:'Remote'}}),race=input({baselineRecords:[baseline],localRecords:[local],remoteRecords:[raced]}),raceBefore=clone(race);
 assert.throws(()=>buildActiveRecordSavePlan(race),/revision race/);assert.deepEqual(race,raceBefore);

 const missing=clone(baseline);delete missing.revision;assert.throws(()=>buildActiveRecordSavePlan(input({baselineRecords:[missing],remoteRecords:[missing]})),/欄位無效|revision/);
 const badHash={...baseline,recordHash:'record-item-v1:'+'f'.repeat(64)};assert.throws(()=>buildActiveRecordSavePlan(input({baselineRecords:[badHash],remoteRecords:[badHash]})),/hash 不符/);
 const wrongEpoch=envelope({activationEpoch:'epoch-other-12345'});assert.throws(()=>buildActiveRecordSavePlan(input({remoteRecords:[wrongEpoch]})),/epoch/);
});

test('duplicate key、未改變 changed key、非 changed envelope 與 full-scan 欄位均拒絕',()=>{
 const duplicate=[key('lesson-1'),key('lesson-1')];assert.throws(()=>buildActiveRecordSavePlan(input({changedKeys:duplicate,baselineRecords:[envelope(),envelope()],localRecords:[envelope({record:{id:'lesson-1',room:'B'}}),envelope({record:{id:'lesson-1',room:'C'}})],remoteRecords:[envelope(),envelope()]})),/duplicate/);
 const unchanged=envelope();assert.throws(()=>buildActiveRecordSavePlan(input({baselineRecords:[unchanged],localRecords:[unchanged],remoteRecords:[unchanged]})),/沒有實際變更/);
 const foreign=envelope({recordId:'lesson-2',record:{id:'lesson-2'}});assert.throws(()=>buildActiveRecordSavePlan(input({remoteRecords:[foreign]})),/非 changed key|缺少 changed key/);
 assert.throws(()=>buildActiveRecordSavePlan({...input(),documentsByCollection:{lessons:[]}}),/輸入欄位無效/);
});

test(`1k/5k/10k/${CAPACITY_COUNT} 僅抽出同一 explicit changed key，planner 輸出與工作量不依賴總筆數`,()=>{
 let reference=null;
 for(const total of [1000,5000,10000,CAPACITY_COUNT]){
  const fullFixture=Array.from({length:total},(_,index)=>({id:`lesson-${index}`,value:index})),target=fullFixture[432],baseline=envelope({recordId:target.id,record:target}),local=envelope({recordId:target.id,record:{...target,value:'changed'}}),plan=buildActiveRecordSavePlan(input({changedKeys:[key(target.id)],baselineRecords:[baseline],localRecords:[local],remoteRecords:[baseline]})),evidence={operations:plan.operations,saveCommit:plan.saveCommit,nextHead:plan.nextHead,workUnits:plan.workUnits};
  if(reference)assert.deepEqual(evidence,reference);else reference=evidence;
  assert.equal(plan.operationCount,1);assert.deepEqual(plan.workUnits,{changedKeys:1,envelopesValidated:3,operationsBuilt:1});assert.equal(fullFixture.length,total);
 }
});

test('成功規劃也不 mutate 任一輸入 envelope、changedKeys、save 或 syncHead',()=>{const source=input(),before=clone(source);buildActiveRecordSavePlan(source);assert.deepEqual(source,before)});
