import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V1_WRITER_CURRENT_AUTHORITY,
 RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA,
 RECORD_SYNC_V1_WRITER_CURRENT_SOURCE_SCOPE,
 RECORD_SYNC_V1_WRITER_GENESIS_GENERATION,
 RECORD_SYNC_V1_WRITER_HARD_PAUSE_SCOPE,
 RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION,
 RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID,
 RECORD_SYNC_V1_WRITER_DURABLE_POLICY,
 RECORD_SYNC_V1_WRITER_ADMISSION_POLICY_SCHEMA,
 RECORD_SYNC_V1_WRITER_DURABLE_OPEN_ADMISSION_POLICY_TOKEN,
 assertHardPausedRecordSyncV1WriterCurrent,
 assertDurableOpenRecordSyncV1WriterCurrentSource,
 assertOpenRecordSyncV1WriterCurrent,
 assertOpenRecordSyncV1WriterCurrentSource,
 buildHardPausedRecordSyncV1WriterCurrent,
 buildDurableOpenRecordSyncV1WriterCurrent,
 buildOpenRecordSyncV1WriterCurrent,
 buildRecordSyncV1WriterAdmissionPolicyToken,
 stripRecordSyncV1WriterCurrentAudit
} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {createFirebaseRecordSyncV1WriterCurrentAdapter,RECORD_SYNC_V1_WRITER_CURRENT_PATH,RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH} from '../js/core/firebase-record-sync-v1-writer-current-adapter.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const ZERO_HASH='0'.repeat(64);
const sourceControl=(extra={})=>({
 schema:'danbridge-record-sync-control-v1',
 environment:'staging',
 companyId:'danbridge',
 state:'active',
 activationEpoch:'active-epoch-12345',
 manifestHash:'a'.repeat(64),
 candidateEpoch:'candidate-epoch-123',
 candidateRevision:2,
 candidateSealHash:'b'.repeat(64),
 legacyVersionHash:'legacy-version-123',
 recordDataHash:'record-v1:'+'c'.repeat(64),
 roleEvidenceHash:'d'.repeat(64),
 backupId:'backup-12345678',
 restoreReceiptId:'restore-1234567',
 collectionCount:16,
 documentCount:1739,
 activeCount:19,
 tombstoneCount:1720,
 roleViewCount:4,
 readTakeover:true,
 writeTakeover:true,
 activatedAt:'2026-08-16T12:00:00+08:00',
 ...extra
});
const safetyControl=(extra={})=>({
 schema:'danbridge-record-sync-safety-control-v1',
 environment:'staging',
 companyId:'danbridge',
 activationEpoch:'active-epoch-12345',
 state:'active',
 revision:3,
 lastEventId:'resume-event-12345',
 lastEventHash:'e'.repeat(64),
 readAllowed:true,
 writeAllowed:true,
 updatedAt:'2026-08-16T12:05:00+08:00',
 ...extra
});
const input=(extra={})=>({
 recordSyncControl:sourceControl(),
 safetyControl:safetyControl(),
 writerGeneration:1,
 minClientProtocolVersion:3,
 minClientReleaseId:'20.26.113',
 createdAt:'2026-08-17T11:00:00.123456789+08:00',
 ...extra
});
const durableInput=(extra={})=>input({minClientProtocolVersion:4,minClientReleaseId:'20.26.114',createdAt:safetyControl().updatedAt,...extra});
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const withoutHash=value=>{const copy=structuredClone(value);delete copy.controlHash;return copy};
const rehashCurrent=value=>({...withoutHash(value),controlHash:sha256Canonical(withoutHash(value))});
const policyFields=['writerProtocol','writerGeneration','revision','state','admissionOpen','acceptNewSessions','acceptNewMutations','operationPolicy','currentFreezeId','currentFreezeRequestHash','currentFreezeControlHash','minClientProtocolVersion','minClientReleaseId'];
const rehashCurrentPolicy=value=>{const body=withoutHash(value),policy=Object.fromEntries(policyFields.map(key=>[key,body[key]]));body.admissionPolicyToken=buildRecordSyncV1WriterAdmissionPolicyToken(policy);return{...body,controlHash:sha256Canonical(body)}};

test('open genesis deterministic、deep frozen、no-mutate且只宣稱pure authority',()=>{
 const value=input(),before=structuredClone(value),current=buildOpenRecordSyncV1WriterCurrent(value);
 assert.deepEqual(value,before);
 assert.equal(current.schema,RECORD_SYNC_V1_WRITER_CURRENT_SCHEMA);
 assert.equal(current.state,'open');
 assert.equal(current.writerProtocol,'v1');
 assert.equal(current.writerGeneration,RECORD_SYNC_V1_WRITER_GENESIS_GENERATION);
 assert.equal(current.revision,1);
 assert.equal(current.admissionOpen,true);
 assert.equal(current.acceptNewSessions,true);
 assert.equal(current.acceptNewMutations,true);
 assert.equal(current.operationPolicy,'v1-open');
 assert.equal(current.admissionPolicyToken,buildRecordSyncV1WriterAdmissionPolicyToken(Object.fromEntries(policyFields.map(key=>[key,current[key]]))));
 assert.notEqual(current.admissionPolicyToken,RECORD_SYNC_V1_WRITER_DURABLE_OPEN_ADMISSION_POLICY_TOKEN);
 assert.equal(current.currentFreezeId,'');
 assert.equal(current.currentFreezeRequestHash,ZERO_HASH);
 assert.equal(current.currentFreezeControlHash,ZERO_HASH);
 assert.equal(current.sourceRecordSyncManifestHash,value.recordSyncControl.manifestHash);
 assert.equal(current.safetyRevision,value.safetyControl.revision);
 assert.equal(current.safetyLastEventHash,value.safetyControl.lastEventHash);
 assert.equal(current.lastTransitionHash,value.recordSyncControl.manifestHash);
 assert.equal(current.controlHash,sha256Canonical(withoutHash(current)));
 assert.equal(RECORD_SYNC_V1_WRITER_CURRENT_AUTHORITY,'pure-genesis-not-rules-authority');
 assert.equal(RECORD_SYNC_V1_WRITER_CURRENT_SOURCE_SCOPE,'activation-manifest-safety-pointer-not-current-data-root');
 assert.ok(Object.isFrozen(current));
 assert.throws(()=>{current.state='closed'},TypeError);
});

test('durable W0 full source assert逐欄綁active control與S0',()=>{const source=input(),current=buildOpenRecordSyncV1WriterCurrent(source);assert.deepEqual(assertOpenRecordSyncV1WriterCurrentSource(current,source),current);assert.throws(()=>assertOpenRecordSyncV1WriterCurrentSource(current,{...source,safetyControl:{...source.safetyControl,lastEventHash:'f'.repeat(64)}}),/expected|hash|source|canonical/)});

test('durable W0 createdAt固定S0.updatedAt且鎖protocol 4/release 20.26.114',()=>{const source=durableInput(),current=buildDurableOpenRecordSyncV1WriterCurrent(source);assert.equal(current.createdAt,source.safetyControl.updatedAt);assert.equal(current.minClientProtocolVersion,RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_PROTOCOL_VERSION);assert.equal(current.minClientReleaseId,RECORD_SYNC_V1_WRITER_DURABLE_MIN_CLIENT_RELEASE_ID);assert.equal(current.admissionPolicyToken,RECORD_SYNC_V1_WRITER_DURABLE_OPEN_ADMISSION_POLICY_TOKEN);assert.equal(RECORD_SYNC_V1_WRITER_ADMISSION_POLICY_SCHEMA,'danbridge-record-sync-v1-writer-admission-policy-v1');assert.equal(RECORD_SYNC_V1_WRITER_DURABLE_POLICY,'authoritative-safety-timestamp-and-fixed-client-floor');assert.deepEqual(assertDurableOpenRecordSyncV1WriterCurrentSource(current,source),current);for(const changed of [{createdAt:'2026-08-16T12:05:00.000000001+08:00'},{minClientProtocolVersion:3},{minClientProtocolVersion:5},{minClientReleaseId:'20.26.113'},{minClientReleaseId:'20.26.115'}])assert.throws(()=>buildDurableOpenRecordSyncV1WriterCurrent(durableInput(changed)),/durable V1 writer policy/);assert.throws(()=>buildDurableOpenRecordSyncV1WriterCurrent(durableInput({safetyControl:safetyControl({updatedAt:'2026-08-16T11:59:59.999999999+08:00'}),createdAt:'2026-08-16T11:59:59.999999999+08:00'})),/chronology/);assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(rehashCurrent({...current,admissionPolicyToken:'forged-open-policy-token'})),/open/);const legacy=buildOpenRecordSyncV1WriterCurrent(input());assert.equal(legacy.minClientProtocolVersion,3);assert.notEqual(legacy.admissionPolicyToken,current.admissionPolicyToken)});

function writerFake({trusted=true,throwAfterCommit=false}={}){const stamp={seconds:Math.floor(Date.parse('2026-08-17T03:00:30Z')/1000),nanoseconds:123456789},sourceAudit={persistedAt:stamp,activatedBy:'owner-12345678',activatedByEmail:'owner@example.com'},safetyAudit={persistedAt:stamp,updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'},store=new Map([[RECORD_SYNC_V1_WRITER_SOURCE_CONTROL_PATH,{...sourceControl(),...sourceAudit}],[RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,{...safetyControl(),...safetyAudit}]]),transactions=[],fresh=[];let throws=throwAfterCommit;const adapter=createFirebaseRecordSyncV1WriterCurrentAdapter({environment:'staging',role:'owner',actor:{uid:'owner-12345678',email:'owner@example.com',claims:{recordSyncV2CutoverOperator:trusted}},serverTimestamp:()=>stamp,getDocumentFromServer:async path=>{fresh.push(path);return store.get(path)??null},runTransaction:async callback=>{const events=[],writes=[];transactions.push(events);const result=await callback({get:async path=>{events.push(['get',path]);return store.get(path)??null},set:(path,value)=>{events.push(['set',path]);writes.push([path,value])}});for(const row of writes)store.set(...row);if(throws){throws=false;throw new Error('response loss')}return result}});return{adapter,store,transactions,fresh,stamp}}

test('trusted W0 adapter三讀一寫、fresh server readback；exact retry與response-loss均零重寫',async()=>{const sourceExpected=durableInput(),writerCurrent=buildDurableOpenRecordSyncV1WriterCurrent(sourceExpected),fake=writerFake(),first=await fake.adapter.execute({writerCurrent,sourceExpected});assert.equal(first.writeCount,1);assert.equal(first.totalReadCount,4);assert.deepEqual(fake.transactions[0].map(row=>row[0]),['get','get','get','set']);assert.deepEqual(fake.fresh,[RECORD_SYNC_V1_WRITER_CURRENT_PATH]);const replay=await fake.adapter.execute({writerCurrent,sourceExpected});assert.equal(replay.transactionState,'replayed');assert.equal(replay.writeCount,0);assert.deepEqual(fake.transactions[1].map(row=>row[0]),['get','get','get']);const lost=writerFake({throwAfterCommit:true});await assert.rejects(()=>lost.adapter.execute({writerCurrent,sourceExpected}),/response loss/);const recovered=await lost.adapter.execute({writerCurrent,sourceExpected});assert.equal(recovered.writeCount,0)});

test('W0 source race、clock/protocol poison、partial audit、普通Owner與malformed input在寫前fail closed',async()=>{const sourceExpected=durableInput(),writerCurrent=buildDurableOpenRecordSyncV1WriterCurrent(sourceExpected),race=writerFake();race.store.set(RECORD_SYNC_V1_WRITER_SAFETY_CONTROL_PATH,{...safetyControl(),revision:4});await assert.rejects(()=>race.adapter.execute({writerCurrent,sourceExpected}),/source|expected|safety/);assert.equal(race.transactions[0].some(row=>row[0]==='set'),false);for(const poison of [durableInput({createdAt:'2026-08-16T12:05:00.000000001+08:00'}),durableInput({minClientProtocolVersion:5}),durableInput({minClientReleaseId:'20.26.115'})]){const forged=buildOpenRecordSyncV1WriterCurrent(poison),blocked=writerFake();await assert.rejects(()=>blocked.adapter.execute({writerCurrent:forged,sourceExpected:poison}),/durable V1 writer policy/);assert.equal(blocked.transactions.length,0)}const unaudited=writerFake();unaudited.store.set(RECORD_SYNC_V1_WRITER_CURRENT_PATH,writerCurrent);await assert.rejects(()=>unaudited.adapter.execute({writerCurrent,sourceExpected}),/audit/);const owner=writerFake({trusted:false});await assert.rejects(()=>owner.adapter.execute({writerCurrent,sourceExpected}),/trusted staging Owner/);assert.equal(owner.transactions.length,0);let calls=0;const hostile={writerCurrent};Object.defineProperty(hostile,'sourceExpected',{enumerable:true,get(){calls++;return sourceExpected}});await assert.rejects(()=>writerFake().adapter.execute(hostile),/data field/);assert.equal(calls,0)});

test('source/readback Firestore map key reorder不影響canonical current',()=>{
 const value=input({recordSyncControl:reorder(sourceControl()),safetyControl:reorder(safetyControl())});
 const current=buildOpenRecordSyncV1WriterCurrent(reorder(value));
 assert.deepEqual(assertOpenRecordSyncV1WriterCurrent(reorder(current)),current);
});

test('現有source control與safety audit可strip；output audit只接受0或all3',()=>{
 const sourceAudit={persistedAt:{server:true},activatedBy:'owner-12345678',activatedByEmail:'owner@example.com'};
 const safetyAudit={persistedAt:{server:true},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'};
 const current=buildOpenRecordSyncV1WriterCurrent(input({recordSyncControl:{...sourceControl(),...sourceAudit},safetyControl:{...safetyControl(),...safetyAudit}}));
 const outputAudit={persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'},document={...current,...outputAudit};
 assert.deepEqual(stripRecordSyncV1WriterCurrentAudit(document),current);
 assert.deepEqual(assertOpenRecordSyncV1WriterCurrent(document),current);
 assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(input({recordSyncControl:{...sourceControl(),persistedAt:{server:true}}})),/audit/);
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent({...current,persistedAt:{server:true}}),/audit/);
});

test('source必須是同epoch active takeover與active safety exact control',()=>{
 const invalidInputs=[
  input({recordSyncControl:sourceControl({state:'paused'})}),
  input({recordSyncControl:sourceControl({writeTakeover:false})}),
  input({recordSyncControl:sourceControl({documentCount:1740})}),
  input({recordSyncControl:sourceControl({manifestHash:ZERO_HASH})}),
  input({recordSyncControl:{...sourceControl(),extra:true}}),
  input({safetyControl:safetyControl({state:'paused',writeAllowed:false})}),
  input({safetyControl:safetyControl({activationEpoch:'other-epoch-123'})}),
  input({safetyControl:safetyControl({revision:0})}),
  input({safetyControl:{...safetyControl(),extra:true}})
 ];
 for(const value of invalidInputs)assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(value),/source|欄位/);
});

test('genesis generation固定1；protocol/release/timestamp全部fail closed',()=>{
 assert.equal(RECORD_SYNC_V1_WRITER_GENESIS_GENERATION,1);
 for(const value of [
  input({writerGeneration:0}),
  input({writerGeneration:2}),
  input({minClientProtocolVersion:0}),
  input({minClientReleaseId:'bad\ud800'}),
  input({createdAt:'2026-08-17 11:00:00'})
 ])assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(value),/genesis input/);
});

test('createdAt以Gregorian/offset/nanosecond instant不得早於activation與safety',()=>{
 assert.doesNotThrow(()=>buildOpenRecordSyncV1WriterCurrent(input({createdAt:'2026-08-16T04:05:00Z'})));
 assert.doesNotThrow(()=>buildOpenRecordSyncV1WriterCurrent(input({createdAt:'2026-08-16T04:05:00.000000001Z'})));
 for(const createdAt of ['2026-08-16T04:04:59.999999999Z','2026-08-16T12:04:59.999999999+08:00'])assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(input({createdAt})),/時間早於/);
 assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(input({recordSyncControl:sourceControl({activatedAt:'2026-08-16T12:10:00+08:00'}),createdAt:'2026-08-16T04:09:59.999999999Z'})),/時間早於/);
});

test('writer-current只綁activation manifest與safety pointer，不代表current data root authority',()=>{
 const first=buildOpenRecordSyncV1WriterCurrent(input()),secondSource=sourceControl({recordDataHash:'record-v1:'+'f'.repeat(64),documentCount:2000,activeCount:20,tombstoneCount:1980,roleEvidenceHash:'9'.repeat(64)}),second=buildOpenRecordSyncV1WriterCurrent(input({recordSyncControl:secondSource}));
 assert.notEqual(sourceControl().recordDataHash,secondSource.recordDataHash);
 assert.notEqual(sourceControl().roleEvidenceHash,secondSource.roleEvidenceHash);
 assert.equal(first.sourceRecordSyncManifestHash,second.sourceRecordSyncManifestHash);
 assert.equal(first.safetyLastEventHash,second.safetyLastEventHash);
 assert.equal(first.controlHash,second.controlHash);
 assert.equal(RECORD_SYNC_V1_WRITER_CURRENT_SOURCE_SCOPE,'activation-manifest-safety-pointer-not-current-data-root');
});

test('所有primitive在canonical hash前驗證，hostile toJSON與getter都不執行',()=>{
 let toJSONCalls=0;
 const hostile={toJSON(){toJSONCalls++;return '2026-08-17T11:00:00Z'}};
 for(const value of [
  input({createdAt:hostile}),
  input({recordSyncControl:sourceControl({activatedAt:hostile})}),
  input({safetyControl:safetyControl({updatedAt:hostile})})
 ])assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(value),/source|genesis input/);
 assert.equal(toJSONCalls,0);
 let getterCalls=0;
 const control=sourceControl();
 Object.defineProperty(control,'manifestHash',{enumerable:true,get(){getterCalls++;return'a'.repeat(64)}});
 assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(input({recordSyncControl:control})),/data field/);
 assert.equal(getterCalls,0);
});

test('expected省略可驗文件；提供時必須完整exact且逐欄一致',()=>{
 const current=buildOpenRecordSyncV1WriterCurrent(input());
 assert.deepEqual(assertOpenRecordSyncV1WriterCurrent(current),current);
 assert.deepEqual(assertOpenRecordSyncV1WriterCurrent(current,reorder(current)),current);
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(current,{controlHash:current.controlHash}),/欄位/);
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(current,{...current,persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'}),/欄位/);
 const other=buildOpenRecordSyncV1WriterCurrent(input({minClientReleaseId:'20.26.114',createdAt:'2026-08-17T11:00:01Z'}));
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(current,other),/expected genesis/);
 const tampered={...current,minClientReleaseId:'20.26.999'};
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(tampered),/open|canonical hash/);
});

test('input/output extra、custom prototype與accessor全部fail closed',()=>{
 assert.throws(()=>buildOpenRecordSyncV1WriterCurrent({...input(),extra:true}),/欄位/);
 assert.throws(()=>buildOpenRecordSyncV1WriterCurrent(Object.assign(Object.create({unsafe:true}),input())),/plain object/);
 const current=buildOpenRecordSyncV1WriterCurrent(input());
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent({...current,extra:true}),/欄位/);
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(Object.assign(Object.create({unsafe:true}),current)),/plain object/);
 let reads=0;
 const getter={...current};
 Object.defineProperty(getter,'revision',{enumerable:true,get(){reads++;return 1}});
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(getter),/data field/);
 assert.equal(reads,0);
});

test('hard-paused current只關admission並保留W0 immutable identity',()=>{
 const current=buildOpenRecordSyncV1WriterCurrent(input()),paused=buildHardPausedRecordSyncV1WriterCurrent({current,freezeId:'freeze-12345678',freezeRequestHash:'1'.repeat(64),freezeControlHash:'2'.repeat(64),safetyRevision:current.safetyRevision+1,safetyLastEventHash:'3'.repeat(64),transitionReceiptHash:'4'.repeat(64)});
 assert.deepEqual(assertHardPausedRecordSyncV1WriterCurrent(reorder(paused),reorder(paused)),paused);
 assert.equal(paused.state,'hard-paused');
 assert.equal(paused.revision,current.revision+1);
 assert.equal(paused.admissionOpen,false);
 assert.equal(paused.acceptNewSessions,false);
 assert.equal(paused.acceptNewMutations,false);
 assert.equal(paused.operationPolicy,'hard-pause-all-v1-no-drain');
 assert.equal(paused.admissionPolicyToken,buildRecordSyncV1WriterAdmissionPolicyToken(Object.fromEntries(policyFields.map(key=>[key,paused[key]]))));
 assert.notEqual(paused.admissionPolicyToken,current.admissionPolicyToken);
 for(const key of ['writerGeneration','sourceRecordSyncManifestHash','minClientProtocolVersion','minClientReleaseId','createdAt'])assert.equal(paused[key],current[key]);
 assert.equal(RECORD_SYNC_V1_WRITER_HARD_PAUSE_SCOPE,'immutable-admission-close-not-rules-authority');
 const forged={...paused,admissionOpen:true};forged.controlHash=sha256Canonical(withoutHash(forged));
 assert.throws(()=>assertHardPausedRecordSyncV1WriterCurrent(forged),/hard pause/);
 assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(paused),/open/);
});

test('writer revision parity固定open odd、hard-paused even，並拒MAX overflow',()=>{
 const genesis=buildOpenRecordSyncV1WriterCurrent(input()),resumed=rehashCurrentPolicy({...genesis,revision:3,lastTransitionHash:'9'.repeat(64)}),paused=buildHardPausedRecordSyncV1WriterCurrent({current:resumed,freezeId:'freeze-87654321',freezeRequestHash:'5'.repeat(64),freezeControlHash:'6'.repeat(64),safetyRevision:resumed.safetyRevision+1,safetyLastEventHash:'7'.repeat(64),transitionReceiptHash:'8'.repeat(64)});
 assert.deepEqual(assertOpenRecordSyncV1WriterCurrent(resumed),resumed);
 assert.equal(paused.revision,4);
 assert.deepEqual(assertHardPausedRecordSyncV1WriterCurrent(paused),paused);
 const rev2=rehashCurrent({...genesis,revision:2,lastTransitionHash:'9'.repeat(64)});assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(rev2),/open/);
 const forgedOpenEven=rehashCurrent({...resumed,revision:4});assert.throws(()=>assertOpenRecordSyncV1WriterCurrent(forgedOpenEven),/open/);
 const forgedPausedOdd=rehashCurrent({...paused,revision:3});assert.throws(()=>assertHardPausedRecordSyncV1WriterCurrent(forgedPausedOdd),/hard pause/);
 const terminal=rehashCurrentPolicy({...genesis,revision:Number.MAX_SAFE_INTEGER,lastTransitionHash:'9'.repeat(64)});assert.throws(()=>buildHardPausedRecordSyncV1WriterCurrent({current:terminal,freezeId:'freeze-87654321',freezeRequestHash:'5'.repeat(64),freezeControlHash:'6'.repeat(64),safetyRevision:terminal.safetyRevision+1,safetyLastEventHash:'7'.repeat(64),transitionReceiptHash:'8'.repeat(64)}),/hard pause input/);
});
