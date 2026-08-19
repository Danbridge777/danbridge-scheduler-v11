import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,buildRecordSyncV1RawDocumentLeaf} from '../js/core/cloud-record-sync-v1-raw-document-leaf.js';
import {buildRecordSyncV1RawDocumentExecution,consumeRecordSyncV1RawDocumentExecution} from '../js/core/cloud-record-sync-v1-raw-document-root.js';
import {
 RECORD_SYNC_V1_POST_PAUSE_SCAN_RECEIPT_SCHEMA,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_INTEGRITY_SCOPE,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCHEMA,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCOPE,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE,
 assertRecordSyncV1PostPauseScanReceipt,
 buildRecordSyncV1PostPauseScanExecution,
 buildRecordSyncV1PostPauseScanReceipt,
 consumeRecordSyncV1PostPauseScanExecution,
 stripRecordSyncV1PostPauseScanReceiptAudit
} from '../js/core/cloud-record-sync-v1-post-pause-scan-receipt.js';
import {buildRecordSyncV1V2HardPauseTransition} from '../js/core/cloud-record-sync-v1-v2-hard-pause-transition.js';
import {buildOpenRecordSyncV1WriterCurrent,buildRecordSyncV1WriterAdmissionPolicyToken} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {buildRecordSyncV2FreezeRequest,buildRequestedRecordSyncV2FreezeControl} from '../js/core/cloud-record-sync-v2-freeze-control.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const sourceControl=()=>({schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:'danbridge',state:'active',activationEpoch:'active-epoch-12345',manifestHash:'a'.repeat(64),candidateEpoch:'candidate-epoch-123',candidateRevision:2,candidateSealHash:'b'.repeat(64),legacyVersionHash:'legacy-version-123',recordDataHash:'record-v1:'+'c'.repeat(64),roleEvidenceHash:'d'.repeat(64),backupId:'backup-source-123',restoreReceiptId:'restore-1234567',collectionCount:16,documentCount:1739,activeCount:19,tombstoneCount:1720,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-16T12:00:00+08:00'});
const activeSafety=()=>({schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch:'active-epoch-12345',state:'active',revision:3,lastEventId:'resume-event-12345',lastEventHash:'e'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-08-16T12:05:00+08:00'});
const rehash=(value,field)=>{const core={...value};delete core[field];return{...core,[field]:sha256Canonical(core)}};
const policyFields=['writerProtocol','writerGeneration','revision','state','admissionOpen','acceptNewSessions','acceptNewMutations','operationPolicy','currentFreezeId','currentFreezeRequestHash','currentFreezeControlHash','minClientProtocolVersion','minClientReleaseId'];
const rehashWriterPolicy=value=>{const core={...value};delete core.controlHash;core.admissionPolicyToken=buildRecordSyncV1WriterAdmissionPolicyToken(Object.fromEntries(policyFields.map(key=>[key,core[key]])));return{...core,controlHash:sha256Canonical(core)}};
const openWriter=revision=>{const writer=buildOpenRecordSyncV1WriterCurrent({recordSyncControl:sourceControl(),safetyControl:activeSafety(),writerGeneration:1,minClientProtocolVersion:3,minClientReleaseId:'20.26.113',createdAt:'2026-08-17T11:00:00.123456789+08:00'});return revision===3?rehashWriterPolicy({...writer,revision:3,lastTransitionHash:'9'.repeat(64)}):writer};
const pauseAnchors=({revision=1,preflightRawDocumentRoot='3'.repeat(64)}={})=>{const writerCurrent=openWriter(revision),request=buildRecordSyncV2FreezeRequest({environment:'staging',companyId:'danbridge',freezeId:'freeze-12345678',activationEpoch:writerCurrent.activationEpoch,sourceWriterGeneration:writerCurrent.writerGeneration,targetWriterGeneration:writerCurrent.writerGeneration+1,targetV2Epoch:'v2-epoch-12345678',sourceWriterControlHash:writerCurrent.controlHash,minClientProtocolVersion:writerCurrent.minClientProtocolVersion,minClientReleaseId:writerCurrent.minClientReleaseId,rulesetHash:'1'.repeat(64),preflightRecordDataHash:'record-v1:'+'2'.repeat(64),preflightRawDocumentRoot,preflightBackupId:'backup-freeze-123',preflightBackupManifestHash:'4'.repeat(64),createdAt:'2026-08-17T11:05:00.123456789+08:00'}),requestedControl=buildRequestedRecordSyncV2FreezeControl({request}),plan=buildRecordSyncV1V2HardPauseTransition({writerCurrent,safetyControl:activeSafety(),request,requestedControl,pausedAt:'2026-08-17T11:06:00.123456789+08:00'});return{hardPauseReceipt:plan.transitionReceipt,hardPausedWriterCurrent:plan.nextWriterCurrent,pausedSafetyControl:plan.nextSafetyControl}};
const emptyDocuments=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
const timestamp={schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds:'1786896000',nanoseconds:123456789};
const rawDocument=(id,{audit=true}={})=>({documentId:id,data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection:'students',recordId:id,record:{id,name:'學生'},recordIndex:null,sourceHash:'record-v1:'+'a'.repeat(64),revision:1,deleted:false,environment:'staging',...(audit?{updatedAt:{...timestamp},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'}:{})}});
const input=({ordinal='U',anchors=pauseAnchors(),documentsByCollection,startedAt='2026-08-17T11:07:00.123456789+08:00',completedAt='2026-08-17T11:08:00.123456789+08:00'}={})=>{const documents=documentsByCollection??emptyDocuments();if(documentsByCollection===undefined)documents.students=[rawDocument('student-scan-12345')];return{...anchors,ordinal,startedAt,completedAt,documentsByCollection:documents}};
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const audit={persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};

test('single post-pause scan deterministic、compact、deepFreeze/no-mutate且只屬observation',()=>{
 const value=input(),before=structuredClone(value),first=buildRecordSyncV1PostPauseScanReceipt(value),second=buildRecordSyncV1PostPauseScanReceipt(input());
 assert.deepEqual(value,before);assert.deepEqual(first,second);
 assert.equal(first.schema,RECORD_SYNC_V1_POST_PAUSE_SCAN_RECEIPT_SCHEMA);
 assert.equal(first.state,'observed');assert.equal(first.scope,RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE);assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_SCOPE,'single-scan-observation-not-cross-query-freeze-authority');
 assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_INTEGRITY_SCOPE,'self-hash-only-not-scan-or-document-authority');
 assert.equal(first.hardPauseAnchorScope,RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE);assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_HARD_PAUSE_ANCHOR_SCOPE,'hard-pause-receipt-self-hash-integration-trust-boundary');
 assert.equal(first.ordinal,'U');assert.equal(first.scanId,'freeze-scan-u:'+first.hardPauseReceiptHash);assert.equal(first.documentCount,1);assert.equal(first.auditedCount,1);assert.equal(first.unauditedCount,0);
 assert.equal(first.pausedSafetyControlHash,sha256Canonical(value.pausedSafetyControl));
 for(const forbidden of ['documentsByCollection','logicalDb','batches','batchReceipts','collectionSummaries','leaves','preflightRecordDataHash','preflightRawDocumentRoot','preflightBackupId'])assert.equal(forbidden in first,false);
 assert.ok(JSON.stringify(first).length<4096);
 assert.ok(Object.isFrozen(first));assert.throws(()=>{first.state='verified'},TypeError);
});

test('scan observation/execution共用單次raw root build，舊receipt輸出逐欄不變且handoff只在記憶體',()=>{
 const source=input(),before=structuredClone(source),legacy=buildRecordSyncV1PostPauseScanReceipt(source),execution=buildRecordSyncV1PostPauseScanExecution(source),payload=consumeRecordSyncV1PostPauseScanExecution(execution,{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash});
 assert.deepEqual(source,before);assert.deepEqual(execution.receipt,legacy);assert.equal(execution.schema,RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCHEMA);assert.equal(execution.scope,RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCOPE);assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_EXECUTION_SCOPE,'ephemeral-in-memory-normalized-documents-not-document-or-persistence-authority');assert.equal(execution.artifactKind,'ephemeral-capability');
 assert.equal(payload.rootSnapshot.manifest.rawDocumentRootHash,legacy.rawDocumentRootHash);assert.equal(payload.normalizedDocumentsByCollection.students.length,1);assert.strictEqual(payload.normalizedDocumentsByCollection.students[0].record,payload.rootSnapshot.logicalDb.students[0]);
 for(const key of ['rawRootExecution','rootSnapshot','normalizedDocumentsByCollection','logicalDb','documentsByCollection'])assert.equal(key in execution,false);for(const key of ['rawRootExecution','normalizedDocumentsByCollection','logicalDb','documentsByCollection'])assert.equal(key in legacy,false);assert.ok(JSON.stringify(execution).length<4096);assert.ok(Object.isFrozen(execution)&&Object.isFrozen(execution.receipt)&&Object.isFrozen(payload));
 assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(structuredClone(execution),{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(JSON.parse(JSON.stringify(execution)),{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(new Proxy(execution,{}),{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution({...execution},{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(execution,{expectedScanHash:'f'.repeat(64),expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/expected hash/);
 const rawExecution=buildRecordSyncV1RawDocumentExecution({documentsByCollection:source.documentsByCollection});assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(rawExecution,{expectedScanHash:execution.scanHash,expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);assert.throws(()=>consumeRecordSyncV1RawDocumentExecution(execution,{expectedRawDocumentRootHash:execution.rawDocumentRootHash}),/capability/);
 let expectedCalls=0;const hostileExpected={expectedRawDocumentRootHash:execution.rawDocumentRootHash};Object.defineProperty(hostileExpected,'expectedScanHash',{enumerable:true,get(){expectedCalls++;return execution.scanHash}});assert.throws(()=>consumeRecordSyncV1PostPauseScanExecution(execution,hostileExpected),/data field/);assert.equal(expectedCalls,0);
});

test('leaf/root/scan canonical golden防止deterministic identity漂移',()=>{
 const source=input(),leaf=buildRecordSyncV1RawDocumentLeaf(source.documentsByCollection.students[0]),execution=buildRecordSyncV1PostPauseScanExecution(source);
 assert.deepEqual({leafHash:leaf.leafHash,rawDocumentRootHash:execution.rawDocumentRootHash,scanHash:execution.scanHash},{leafHash:'87094b9a6a317748661fe402d37115a95d981c52199248a4b363c9150d19e3e2',rawDocumentRootHash:'9b01bd593558113864e9fa9c92cbc955d77af1eb324e10ae9408033a0b3ea6e0',scanHash:'fb2466eb4b91d62ab1497d4d26579b78b57ae6108a7c6c2f17627472b7c6d098'});
});

test('ordinal U/V使用不同path-safe deterministic scanId，空root仍只屬observation',()=>{
 const anchors=pauseAnchors(),documentsByCollection=emptyDocuments(),u=buildRecordSyncV1PostPauseScanReceipt(input({anchors,documentsByCollection,ordinal:'U'})),v=buildRecordSyncV1PostPauseScanReceipt(input({anchors,documentsByCollection,ordinal:'V'}));
 assert.notEqual(u.scanId,v.scanId);assert.match(u.scanId,/^[A-Za-z0-9_.:-]+$/);assert.equal(u.rawDocumentRootHash,v.rawDocumentRootHash);assert.equal(u.documentCount,0);assert.equal(u.state,'observed');
});

test('full expected replay支援H/W1/S1/receipt server audit與Firestore map reorder，audit不入hash',()=>{
 const source=input(),receipt=buildRecordSyncV1PostPauseScanReceipt(source),auditedReceipt=reorder({...receipt,...audit}),expected=reorder({...source,hardPauseReceipt:reorder({...source.hardPauseReceipt,...audit}),hardPausedWriterCurrent:reorder({...source.hardPausedWriterCurrent,...audit}),pausedSafetyControl:reorder({...source.pausedSafetyControl,persistedAt:{server:true},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'}),documentsByCollection:reorder(source.documentsByCollection)});
 assert.deepEqual(stripRecordSyncV1PostPauseScanReceiptAudit(auditedReceipt),receipt);
 assert.deepEqual(assertRecordSyncV1PostPauseScanReceipt(auditedReceipt,expected),receipt);
 assert.deepEqual(buildRecordSyncV1PostPauseScanReceipt(source),receipt);
 assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt(receipt),/expected/);
});

test('H/W1/S1逐欄linkage、paused safety full-core hash與rev3→4皆綁定',()=>{
 const resumed=input({anchors:pauseAnchors({revision:3})}),receipt=buildRecordSyncV1PostPauseScanReceipt(resumed);assert.equal(resumed.hardPauseReceipt.sourceWriterRevision,3);assert.equal(receipt.hardPausedWriterRevision,4);assert.equal(receipt.pausedSafetyControlHash,sha256Canonical(resumed.pausedSafetyControl));
 const wrongWriter={...resumed,hardPausedWriterCurrent:rehashWriterPolicy({...resumed.hardPausedWriterCurrent,currentFreezeId:'freeze-wrong-1234'})};assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(wrongWriter),/linkage/);
 const wrongSafety={...resumed,pausedSafetyControl:{...resumed.pausedSafetyControl,lastEventHash:'f'.repeat(64)}};assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(wrongSafety),/linkage/);
 const otherH=pauseAnchors({preflightRawDocumentRoot:'8'.repeat(64)}).hardPauseReceipt;assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt({...resumed,hardPauseReceipt:otherH}),/linkage/);
});

test('unaudited raw document一律拒；audit observation完整才可產生receipt',()=>{
 const documents=emptyDocuments();documents.students=[rawDocument('student-unaudited',{audit:false})];assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(input({documentsByCollection:documents})),/audit observation/);
});

test('chronology使用nanosecond/offset比較；equal接受、早1ns/反序/非法拒',()=>{
 assert.doesNotThrow(()=>buildRecordSyncV1PostPauseScanReceipt(input({startedAt:'2026-08-17T03:06:00.123456789Z',completedAt:'2026-08-17T03:06:00.123456789Z'})));
 assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(input({startedAt:'2026-08-17T03:06:00.123456788Z'})),/chronology/);
 assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(input({startedAt:'2026-08-17T03:08:00Z',completedAt:'2026-08-17T03:07:59.999999999Z'})),/chronology/);
 assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(input({startedAt:'2026-08-17 11:07:00'})),/timestamp/);
});

test('H.createdAt以BigInt instant不得早於W1.createdAt；offset等價接受、早1ns拒',()=>{
 const anchors=pauseAnchors(),equalWriter=rehash({...anchors.hardPausedWriterCurrent,createdAt:'2026-08-17T03:06:00.123456789Z'},'controlHash');assert.doesNotThrow(()=>buildRecordSyncV1PostPauseScanReceipt(input({anchors:{...anchors,hardPausedWriterCurrent:equalWriter}})));
 const laterWriter=rehash({...anchors.hardPausedWriterCurrent,createdAt:'2026-08-17T03:06:00.123456790Z'},'controlHash');assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(input({anchors:{...anchors,hardPausedWriterCurrent:laterWriter}})),/chronology/);
});

test('preflight只改H rollback identity，不會成為scan data authority欄位',()=>{
 const first=buildRecordSyncV1PostPauseScanReceipt(input({anchors:pauseAnchors()})),second=buildRecordSyncV1PostPauseScanReceipt(input({anchors:pauseAnchors({preflightRawDocumentRoot:'8'.repeat(64)})}));
 assert.equal(first.rawDocumentRootHash,second.rawDocumentRootHash);assert.equal(first.activeLogicalDataHash,second.activeLogicalDataHash);assert.notEqual(first.hardPauseReceiptHash,second.hardPauseReceiptHash);assert.notEqual(first.scanHash,second.scanHash);
 for(const key of Object.keys(first))assert.equal(key.startsWith('preflight'),false);
});

test('receipt canonical/full expected tamper、scope/state/ordinal/root/extra全部fail closed',()=>{
 const source=input(),receipt=buildRecordSyncV1PostPauseScanReceipt(source);
 assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt({...receipt,scanHash:'f'.repeat(64)},source),/canonical/);
 for(const changed of [{...receipt,state:'verified'},{...receipt,scope:'freeze-authority'},{...receipt,ordinal:'X'}]){const forged=rehash(changed,'scanHash');assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt(forged,source),/格式/)}
 const forgedRoot=rehash({...receipt,rawDocumentRootHash:'f'.repeat(64)},'scanHash');assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt(forgedRoot,source),/expected source/);
 assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt({...receipt,documentsByCollection:{}},source),/欄位/);
});

test('receipt/input/expected audit partial、extra、accessor/custom getter全部拒且getter0',()=>{
 const source=input(),receipt=buildRecordSyncV1PostPauseScanReceipt(source);
 assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt({...receipt,persistedAt:{server:true}},source),/all-or-none/);
 assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt({...receipt,...audit,persistedByEmail:'Owner@Example.com'},source),/audit/);
 assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt({...source,extra:true}),/欄位/);
 assert.throws(()=>buildRecordSyncV1PostPauseScanExecution({...source,leaves:[]}),/欄位/);
 let calls=0;const top={...source};Object.defineProperty(top,'startedAt',{enumerable:true,get(){calls++;return source.startedAt}});assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt(top),/data field/);assert.throws(()=>buildRecordSyncV1PostPauseScanExecution(top),/data field/);
 const safety={...source.pausedSafetyControl};Object.defineProperty(safety,'updatedAt',{enumerable:true,get(){calls++;return source.pausedSafetyControl.updatedAt}});assert.throws(()=>buildRecordSyncV1PostPauseScanReceipt({...source,pausedSafetyControl:safety}),/data field/);
 const audited={...receipt,persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};Object.defineProperty(audited,'persistedAt',{enumerable:true,get(){calls++;return{server:true}}});assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt(audited,source),/audit/);
 const expected={...source};Object.defineProperty(expected,'documentsByCollection',{enumerable:true,get(){calls++;return source.documentsByCollection}});assert.throws(()=>assertRecordSyncV1PostPauseScanReceipt(receipt,expected),/data field/);assert.equal(calls,0);
});
