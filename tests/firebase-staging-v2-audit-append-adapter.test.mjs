import test from 'node:test';
import assert from 'node:assert/strict';
import {activeRecordSaveEnvelopeHash} from '../js/core/cloud-active-record-save-plan.js';
import {buildChangeRecordId} from '../js/core/cloud-change-record-identity.js';
import {planStagingV2AuditAppend} from '../js/core/firebase-staging-v2-audit-append-adapter.js';

const epoch='v2:6ef2009d94faa7acb3b4560cec39dd00',seedId='seed-audit-append-12345',authorityHash='a'.repeat(64),cursorHash='b'.repeat(64),createdAt='2026-09-04T01:00:00.000000001Z';
const fence={schema:'danbridge-record-sync-v1-permanent-fence-v2',state:'permanently-fenced-after-atomic-v2-structural-activation',projectId:'danbridge-d8877-staging',targetV2Epoch:epoch,seedId,reservationAuthorityHash:authorityHash};
const authority={targetV2Epoch:epoch,seedId,activeCount:16,tombstoneCount:24,changesDocumentCount:40,candidateNextIndex:17,authorityHash,finalizationCursorHash:cursorHash};
function request(index=16){const record={id:`audit-${index}`,kind:'edit',lessonId:'lesson-1'},recordId=buildChangeRecordId(index,record),baselineCore={collection:'changes',recordId,exists:false,revision:0,deleted:false,record:null},localCore={collection:'changes',recordId,exists:true,revision:0,deleted:false,record};return{save:{saveId:`device-audit-12345:${index}`,deviceId:'device-audit-12345',actorUid:'owner-audit-12345',actorEmail:'owner@example.com',createdAt},changedKeys:[{collection:'changes',recordId}],baselineRecords:[{environment:'staging',companyId:'danbridge',activationEpoch:epoch,...baselineCore,recordHash:activeRecordSaveEnvelopeHash(baselineCore)}],localRecords:[{environment:'staging',companyId:'danbridge',activationEpoch:epoch,...localCore,recordHash:activeRecordSaveEnvelopeHash(localCore)}]}}

test('immutable changes append以有效baseline筆數起號並綁定歷史reservation cursor',()=>{const plan=planStagingV2AuditAppend({fence,authority,cursor:null,request:request()});assert.equal(plan.source.genesisNextIndex,16);assert.equal(plan.payload.record.recordIndex,16);assert.equal(plan.payload.cursor.nextIndex,17);assert.notEqual(plan.payload.cursor.previousCursorHash,cursorHash);assert.match(plan.payload.cursor.previousCursorHash,/^[a-f0-9]{64}$/);assert.equal(plan.payload.receipt.appendHash,plan.payload.record.appendHash);assert.match(plan.payload.cursor.cursorHash,/^[a-f0-9]{64}$/)});

test('immutable changes append拒絕gap、錯epoch、tamper與非create envelope',()=>{
 assert.throws(()=>planStagingV2AuditAppend({fence,authority,cursor:null,request:request(17)}),/expected 16, actual 17/);
 const wrongEpoch=request();
 wrongEpoch.localRecords[0].activationEpoch='v2:wrong-epoch-12345';
 assert.throws(()=>planStagingV2AuditAppend({fence,authority,cursor:null,request:wrongEpoch}),/new immutable change/);
 const tampered=request();
 tampered.localRecords[0].record.kind='delete';
 assert.throws(()=>planStagingV2AuditAppend({fence,authority,cursor:null,request:tampered}),/envelope hash/);
 const update=request();
 update.baselineRecords[0]={...update.localRecords[0],exists:true};
 assert.throws(()=>planStagingV2AuditAppend({fence,authority,cursor:null,request:update}),/new immutable change/);
});
