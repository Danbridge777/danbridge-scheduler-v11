import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA} from '../js/core/cloud-record-sync-v1-raw-document-leaf.js';
import {buildRecordSyncV1PostPauseScanReceipt} from '../js/core/cloud-record-sync-v1-post-pause-scan-receipt.js';
import {
 RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_INTEGRITY_SCOPE,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_SCHEMA,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_SCOPE,
 RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_TRUST_BOUNDARY,
 assertRecordSyncV1PostPauseScanPair,
 assertRecordSyncV1PostPauseScanPairIntegrity,
 buildRecordSyncV1PostPauseScanPair,
 stripRecordSyncV1PostPauseScanPairAudit
} from '../js/core/cloud-record-sync-v1-post-pause-scan-pair.js';
import {buildRecordSyncV1V2HardPauseTransition} from '../js/core/cloud-record-sync-v1-v2-hard-pause-transition.js';
import {buildOpenRecordSyncV1WriterCurrent} from '../js/core/cloud-record-sync-v1-writer-current.js';
import {buildRecordSyncV2FreezeRequest,buildRequestedRecordSyncV2FreezeControl} from '../js/core/cloud-record-sync-v2-freeze-control.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const sourceControl=()=>({schema:'danbridge-record-sync-control-v1',environment:'staging',companyId:'danbridge',state:'active',activationEpoch:'active-epoch-12345',manifestHash:'a'.repeat(64),candidateEpoch:'candidate-epoch-123',candidateRevision:2,candidateSealHash:'b'.repeat(64),legacyVersionHash:'legacy-version-123',recordDataHash:'record-v1:'+'c'.repeat(64),roleEvidenceHash:'d'.repeat(64),backupId:'backup-source-123',restoreReceiptId:'restore-1234567',collectionCount:16,documentCount:1739,activeCount:19,tombstoneCount:1720,roleViewCount:4,readTakeover:true,writeTakeover:true,activatedAt:'2026-08-16T12:00:00+08:00'});
const activeSafety=()=>({schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch:'active-epoch-12345',state:'active',revision:3,lastEventId:'resume-event-12345',lastEventHash:'e'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-08-16T12:05:00+08:00'});
const anchors=(freezeId='freeze-12345678')=>{const writerCurrent=buildOpenRecordSyncV1WriterCurrent({recordSyncControl:sourceControl(),safetyControl:activeSafety(),writerGeneration:1,minClientProtocolVersion:3,minClientReleaseId:'20.26.113',createdAt:'2026-08-17T11:00:00.123456789+08:00'}),request=buildRecordSyncV2FreezeRequest({environment:'staging',companyId:'danbridge',freezeId,activationEpoch:writerCurrent.activationEpoch,sourceWriterGeneration:1,targetWriterGeneration:2,targetV2Epoch:'v2-epoch-12345678',sourceWriterControlHash:writerCurrent.controlHash,minClientProtocolVersion:3,minClientReleaseId:'20.26.113',rulesetHash:'1'.repeat(64),preflightRecordDataHash:'record-v1:'+'2'.repeat(64),preflightRawDocumentRoot:'3'.repeat(64),preflightBackupId:'backup-freeze-123',preflightBackupManifestHash:'4'.repeat(64),createdAt:'2026-08-17T11:05:00.123456789+08:00'}),requestedControl=buildRequestedRecordSyncV2FreezeControl({request}),plan=buildRecordSyncV1V2HardPauseTransition({writerCurrent,safetyControl:activeSafety(),request,requestedControl,pausedAt:'2026-08-17T11:06:00.123456789+08:00'});return{hardPauseReceipt:plan.transitionReceipt,hardPausedWriterCurrent:plan.nextWriterCurrent,pausedSafetyControl:plan.nextSafetyControl}};
const emptyDocuments=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(collection=>[collection,[]]));
const rawDocument=id=>({documentId:id,data:{schema:'danbridge-full-record-shadow-v1',companyId:'danbridge',collection:'students',recordId:id,record:{id,name:'學生'},recordIndex:null,sourceHash:'record-v1:'+'a'.repeat(64),revision:1,deleted:false,environment:'staging',updatedAt:{schema:RECORD_SYNC_V1_RAW_TIMESTAMP_SCHEMA,type:'timestamp',seconds:'1786896000',nanoseconds:123456789},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'}});
const scans=(source=anchors(),documentsByCollection)=>{const documents=documentsByCollection??emptyDocuments();if(documentsByCollection===undefined)documents.students=[rawDocument('student-pair-12345')];const common={...source,documentsByCollection:documents};return{uScanReceipt:buildRecordSyncV1PostPauseScanReceipt({...common,ordinal:'U',startedAt:'2026-08-17T11:07:00.123456789+08:00',completedAt:'2026-08-17T11:08:00.123456789+08:00'}),vScanReceipt:buildRecordSyncV1PostPauseScanReceipt({...common,ordinal:'V',startedAt:'2026-08-17T11:08:00.123456789+08:00',completedAt:'2026-08-17T11:09:00.123456789+08:00'})}};
const input=({source=anchors(),documentsByCollection,matchedAt='2026-08-17T11:10:00.123456789+08:00'}={})=>({...source,...scans(source,documentsByCollection),matchedAt});
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const rehash=(value,field)=>{const core={...value};delete core[field];return{...core,[field]:sha256Canonical(core)}};
const audit={persistedAt:{server:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};

test('U/V pair deterministic、compact、deepFreeze且只接受matched observation',()=>{
 const value=input(),before=structuredClone(value),first=buildRecordSyncV1PostPauseScanPair(value),second=buildRecordSyncV1PostPauseScanPair(input());assert.deepEqual(value,before);assert.deepEqual(first,second);
 assert.equal(first.schema,RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_SCHEMA);assert.equal(first.state,'matched-observation');assert.equal(first.scope,RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_SCOPE);assert.equal(first.trustBoundary,RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_TRUST_BOUNDARY);
 assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_SCOPE,'two-immutable-scan-receipt-equality-observation-not-freeze-or-final-cutover-authority');assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_TRUST_BOUNDARY,'immutable-authoritative-scan-receipt-path-required-not-reverified-by-pair');
 assert.equal(first.pairId,'freeze-scan-pair:'+first.hardPauseReceiptHash);assert.match(first.pairId,/^[A-Za-z0-9_.:-]+$/);assert.notEqual(first.uScanHash,first.vScanHash);
 for(const forbidden of ['documentsByCollection','logicalDb','batches','batchReceipts','collectionSummaries','leaves'])assert.equal(forbidden in first,false);assert.ok(JSON.stringify(first).length<6144);assert.ok(Object.isFrozen(first));assert.throws(()=>{first.state='accepted'},TypeError);
});

test('full expected replay支援H/W/S、U/V、pair audited readback與map reorder',()=>{
 const source=input(),pair=buildRecordSyncV1PostPauseScanPair(source),auditedPair=reorder({...pair,...audit}),expected=reorder({...source,hardPauseReceipt:reorder({...source.hardPauseReceipt,...audit}),hardPausedWriterCurrent:reorder({...source.hardPausedWriterCurrent,...audit}),pausedSafetyControl:reorder({...source.pausedSafetyControl,persistedAt:{server:true},updatedBy:'owner-12345678',updatedByEmail:'owner@example.com'}),uScanReceipt:reorder({...source.uScanReceipt,...audit}),vScanReceipt:reorder({...source.vScanReceipt,...audit})});
 assert.deepEqual(stripRecordSyncV1PostPauseScanPairAudit(auditedPair),pair);assert.deepEqual(assertRecordSyncV1PostPauseScanPair(auditedPair,expected),pair);assert.throws(()=>assertRecordSyncV1PostPauseScanPair(pair),/expected/);
});

test('integrity-only明示不具scan pair authority；自洽偽造可過但full expected拒',()=>{
 const source=input(),pair=buildRecordSyncV1PostPauseScanPair(source),forged=rehash({...pair,rawDocumentRootHash:'f'.repeat(64)},'pairHash');assert.equal(RECORD_SYNC_V1_POST_PAUSE_SCAN_PAIR_INTEGRITY_SCOPE,'self-hash-only-not-scan-pair-authority');assert.deepEqual(assertRecordSyncV1PostPauseScanPairIntegrity(reorder(forged)),forged);assert.throws(()=>assertRecordSyncV1PostPauseScanPair(forged,source),/expected source/);
});

test('U/V必須逐欄綁同H/W/S anchors，交換ordinal或不同anchor一律拒',()=>{
 const source=input();assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,uScanReceipt:source.vScanReceipt,vScanReceipt:source.uScanReceipt}),/anchor linkage/);
 const other=anchors('freeze-87654321'),otherScans=scans(other),mixed={...source,vScanReceipt:otherScans.vScanReceipt};assert.throws(()=>buildRecordSyncV1PostPauseScanPair(mixed),/anchor linkage/);
 const forgedV=rehash({...source.vScanReceipt,pausedSafetyRevision:source.vScanReceipt.pausedSafetyRevision+1},'scanHash');assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,vScanReceipt:forgedV}),/anchor linkage/);
});

test('U/V root、active hash、counts、collection/batch roots/batchCount必須完全相等',()=>{
 const source=input(),mutations=[value=>value.rawDocumentRootHash='f'.repeat(64),value=>value.activeLogicalDataHash='raw-active-v1:'+'f'.repeat(64),value=>value.collectionSummariesHash='f'.repeat(64),value=>value.batchReceiptSummariesHash='f'.repeat(64),value=>value.batchCount++,value=>{value.documentCount++;value.activeCount++;value.auditedCount++}];
 for(const mutate of mutations){const changed={...source.vScanReceipt};mutate(changed);const forged=rehash(changed,'scanHash');assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,vScanReceipt:forged}),/不相等/)}
});

test('BigInt chronology固定U.start<=U.end<=V.start<=V.end<=matchedAt，overlap 1ns拒',()=>{
 const source=anchors(),documents=emptyDocuments(),common={...source,documentsByCollection:documents},u=buildRecordSyncV1PostPauseScanReceipt({...common,ordinal:'U',startedAt:'2026-08-17T03:07:00Z',completedAt:'2026-08-17T03:08:00.000000001Z'}),overlapV=buildRecordSyncV1PostPauseScanReceipt({...common,ordinal:'V',startedAt:'2026-08-17T03:08:00Z',completedAt:'2026-08-17T03:09:00Z'});assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,uScanReceipt:u,vScanReceipt:overlapV,matchedAt:'2026-08-17T03:10:00Z'}),/chronology/);
 const equalV=buildRecordSyncV1PostPauseScanReceipt({...common,ordinal:'V',startedAt:'2026-08-17T03:08:00.000000001Z',completedAt:'2026-08-17T03:09:00Z'});assert.doesNotThrow(()=>buildRecordSyncV1PostPauseScanPair({...source,uScanReceipt:u,vScanReceipt:equalV,matchedAt:'2026-08-17T03:09:00Z'}));assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,uScanReceipt:u,vScanReceipt:equalV,matchedAt:'2026-08-17T03:08:59.999999999Z'}),/chronology/);
});

test('pairId只由H receipt hash決定；空root相等仍不升格freeze/final authority',()=>{
 const source=anchors(),value=input({source,documentsByCollection:emptyDocuments()}),pair=buildRecordSyncV1PostPauseScanPair(value);assert.equal(pair.documentCount,0);assert.equal(pair.state,'matched-observation');assert.equal(pair.pairId,'freeze-scan-pair:'+source.hardPauseReceipt.receiptHash);assert.match(pair.scope,/not-freeze-or-final-cutover-authority/);
});

test('pair canonical/scope/trust/state/id/audit/extra/accessor tamper皆fail closed且getter0',()=>{
 const source=input(),pair=buildRecordSyncV1PostPauseScanPair(source);assert.throws(()=>assertRecordSyncV1PostPauseScanPair({...pair,pairHash:'f'.repeat(64)},source),/canonical/);
 for(const changed of [{...pair,state:'accepted'},{...pair,scope:'freeze-authority'},{...pair,trustBoundary:'caller-trusted'},{...pair,pairId:'freeze-scan-pair:'+'f'.repeat(64)}])assert.throws(()=>assertRecordSyncV1PostPauseScanPair(rehash(changed,'pairHash'),source),/格式/);
 assert.throws(()=>assertRecordSyncV1PostPauseScanPair({...pair,persistedAt:{server:true}},source),/all-or-none/);assert.throws(()=>assertRecordSyncV1PostPauseScanPair({...pair,...audit,persistedByEmail:'Owner@Example.com'},source),/audit/);assert.throws(()=>buildRecordSyncV1PostPauseScanPair({...source,documentsByCollection:{}}),/欄位/);
 const withLegacyName={...source,verifiedAt:source.matchedAt};assert.throws(()=>buildRecordSyncV1PostPauseScanPair(withLegacyName),/欄位/);const legacyOnly={...source,verifiedAt:source.matchedAt};delete legacyOnly.matchedAt;assert.throws(()=>buildRecordSyncV1PostPauseScanPair(legacyOnly),/欄位/);const missing={...source};delete missing.matchedAt;assert.throws(()=>buildRecordSyncV1PostPauseScanPair(missing),/欄位/);
 const receiptWithLegacyName={...pair,verifiedAt:pair.matchedAt};assert.throws(()=>assertRecordSyncV1PostPauseScanPairIntegrity(receiptWithLegacyName),/欄位/);const legacyReceiptOnly={...pair,verifiedAt:pair.matchedAt};delete legacyReceiptOnly.matchedAt;assert.throws(()=>assertRecordSyncV1PostPauseScanPairIntegrity(legacyReceiptOnly),/欄位/);const missingReceiptTime={...pair};delete missingReceiptTime.matchedAt;assert.throws(()=>assertRecordSyncV1PostPauseScanPairIntegrity(missingReceiptTime),/欄位/);
 let calls=0;const top={...source};Object.defineProperty(top,'matchedAt',{enumerable:true,get(){calls++;return source.matchedAt}});assert.throws(()=>buildRecordSyncV1PostPauseScanPair(top),/data field/);const doc={...pair,persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};Object.defineProperty(doc,'persistedAt',{enumerable:true,get(){calls++;return{server:true}}});assert.throws(()=>assertRecordSyncV1PostPauseScanPair(doc,source),/audit/);const expected={...source};Object.defineProperty(expected,'uScanReceipt',{enumerable:true,get(){calls++;return source.uScanReceipt}});assert.throws(()=>assertRecordSyncV1PostPauseScanPair(pair,expected),/data field/);assert.equal(calls,0);
});
