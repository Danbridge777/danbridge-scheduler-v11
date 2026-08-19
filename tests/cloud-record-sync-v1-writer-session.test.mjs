import test from 'node:test';
import assert from 'node:assert/strict';
import {
 RECORD_SYNC_V1_WRITER_SESSION_AUDIT_AUTHORITY,
 RECORD_SYNC_V1_WRITER_SESSION_AUTHORIZATION,
 RECORD_SYNC_V1_WRITER_SESSION_MAX_WRITER_GENERATION,
 RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCHEMA,
 RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCOPE,
 assertRecordSyncV1WriterSessionRegistration,
 buildRecordSyncV1WriterSessionRegistration,
 stripRecordSyncV1WriterSessionRegistrationAudit
} from '../js/core/cloud-record-sync-v1-writer-session.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const input=(extra={})=>({
 environment:'staging',
 companyId:'danbridge',
 activationEpoch:'epoch-active-12345',
 writerGeneration:7,
 sessionId:'session-12345678',
 deviceId:'device-12345678',
 tabId:'tab-1234567890',
 actorUid:'owner-12345678',
 actorEmail:'owner@example.com',
 clientProtocolVersion:3,
 clientReleaseId:'20.26.113',
 openedAt:'2026-08-17T02:00:00.123456789Z',
 ...extra
});

const withoutHash=value=>{
 const core=structuredClone(value);
 delete core.sessionIdentityHash;
 return core;
};
const reorder=value=>Object.fromEntries(Object.entries(value).reverse());

test('identity registration deterministic、deep frozen、no-mutate且不冒充live state',()=>{
 const source=input();
 const before=structuredClone(source);
 const registration=buildRecordSyncV1WriterSessionRegistration(source);
 assert.deepEqual(source,before);
 assert.equal(registration.schema,RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCHEMA);
 assert.equal(registration.sessionIdentityHash,sha256Canonical(withoutHash(registration)));
 assert.equal(RECORD_SYNC_V1_WRITER_SESSION_REGISTRATION_SCOPE,'identity-only-no-live-state');
 assert.equal(RECORD_SYNC_V1_WRITER_SESSION_AUTHORIZATION,'authorization-neutral-future-adapter-control-and-generation-only');
 assert.equal(RECORD_SYNC_V1_WRITER_SESSION_AUDIT_AUTHORITY,'format-only-not-server-authority');
 assert.ok(Object.isFrozen(registration));
 for(const liveField of ['state','revision','leaseExpiresAt','lastSeenAt','journalCounts','dirty','queued','inFlight','retryPending','drainCutoffSequence','lastOperationSequence','mutationVersion','localRecordDataHash','cloudBaselineHash'])assert.equal(Object.hasOwn(registration,liveField),false);
 assert.throws(()=>{registration.writerGeneration=8},TypeError);
});

test('同device可由不同tab與不同session各自建立獨立registration',()=>{
 const first=buildRecordSyncV1WriterSessionRegistration(input());
 const second=buildRecordSyncV1WriterSessionRegistration(input({sessionId:'session-87654321',tabId:'tab-0987654321',openedAt:'2026-08-17T02:00:01Z'}));
 assert.equal(first.deviceId,second.deviceId);
 assert.notEqual(first.sessionId,second.sessionId);
 assert.notEqual(first.tabId,second.tabId);
 assert.notEqual(first.sessionIdentityHash,second.sessionIdentityHash);
 assert.doesNotThrow(()=>assertRecordSyncV1WriterSessionRegistration(first));
 assert.doesNotThrow(()=>assertRecordSyncV1WriterSessionRegistration(second));
});

test('Firestore map key reorder可驗且canonical identity hash不漂移',()=>{
 const registration=buildRecordSyncV1WriterSessionRegistration(reorder(input()));
 const readback=reorder(registration);
 assert.deepEqual(assertRecordSyncV1WriterSessionRegistration(readback),registration);
});

test('三個ID須pairwise distinct且path-safe；generation、actor、protocol、release、timestamp皆fail closed',()=>{
 for(const changed of [
  input({sessionId:'device-12345678'}),
  input({sessionId:'tab-1234567890'}),
  input({deviceId:'tab-1234567890'}),
  input({sessionId:'bad/id-123'}),
  input({deviceId:'short'}),
  input({writerGeneration:0}),
  input({actorUid:'short'}),
  input({actorEmail:'Owner@Example.com'}),
  input({clientProtocolVersion:0}),
  input({clientReleaseId:'bad\ud800'}),
  input({openedAt:'2026-08-17T02:00:00'}),
  input({openedAt:'0001-01-01T00:00:00+14:00'})
 ])assert.throws(()=>buildRecordSyncV1WriterSessionRegistration(changed),/identity|protocol/);
});

test('server audit只接受0或all3格式，strip不宣稱server authority',()=>{
 const registration=buildRecordSyncV1WriterSessionRegistration(input());
 const audit={persistedAt:{serverTimestamp:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'};
 const document={...registration,...audit};
 assert.deepEqual(stripRecordSyncV1WriterSessionRegistrationAudit(document),registration);
 assert.deepEqual(assertRecordSyncV1WriterSessionRegistration(document),registration);
 for(const invalid of [{...registration,persistedAt:{serverTimestamp:true}},{...document,persistedByEmail:'Owner@Example.com'}])assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(invalid),/audit/);
});

test('expected一旦提供必須是完整exact immutable core，partial與audit extras皆拒',()=>{
 const registration=buildRecordSyncV1WriterSessionRegistration(input());
 assert.deepEqual(assertRecordSyncV1WriterSessionRegistration(registration,registration),registration);
 assert.deepEqual(assertRecordSyncV1WriterSessionRegistration(registration,reorder(registration)),registration);
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(registration,{sessionId:registration.sessionId}),/欄位/);
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(registration,{...registration,persistedAt:{serverTimestamp:true},persistedBy:'owner-12345678',persistedByEmail:'owner@example.com'}),/欄位/);
});

test('同sessionId的device/tab/protocol/release/openedAt或identity hash不同都不是exact replay',()=>{
 const registration=buildRecordSyncV1WriterSessionRegistration(input());
 const differentRegistrations=[
  buildRecordSyncV1WriterSessionRegistration(input({deviceId:'device-87654321'})),
  buildRecordSyncV1WriterSessionRegistration(input({tabId:'tab-0987654321'})),
  buildRecordSyncV1WriterSessionRegistration(input({clientProtocolVersion:4})),
  buildRecordSyncV1WriterSessionRegistration(input({clientReleaseId:'20.26.114'})),
  buildRecordSyncV1WriterSessionRegistration(input({openedAt:'2026-08-17T02:00:01Z'})),
  buildRecordSyncV1WriterSessionRegistration(input({actorUid:'other-owner-123'}))
 ];
 for(const expected of differentRegistrations){
  assert.doesNotThrow(()=>assertRecordSyncV1WriterSessionRegistration(expected));
  assert.equal(expected.sessionId,registration.sessionId);
  assert.notEqual(expected.sessionIdentityHash,registration.sessionIdentityHash);
  assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(registration,expected),/expected immutable registration 不符/);
 }
});

test('extra/custom prototype/accessor與canonical tamper全部拒，getter不執行',()=>{
 const registration=buildRecordSyncV1WriterSessionRegistration(input());
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration({...registration,extra:true}),/欄位/);
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(Object.assign(Object.create({unsafe:true}),registration)),/plain object/);
 let reads=0;
 const getter={...registration};
 Object.defineProperty(getter,'writerGeneration',{enumerable:true,get(){reads++;return 7}});
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(getter),/data field/);
 assert.equal(reads,0);
 const tampered={...registration,clientReleaseId:'20.26.114'};
 assert.throws(()=>assertRecordSyncV1WriterSessionRegistration(tampered),/canonical identity hash/);
});

test('writerGeneration MAX_SAFE是terminal boundary，下一代不得wrap',()=>{
 assert.equal(RECORD_SYNC_V1_WRITER_SESSION_MAX_WRITER_GENERATION,Number.MAX_SAFE_INTEGER);
 assert.doesNotThrow(()=>buildRecordSyncV1WriterSessionRegistration(input({writerGeneration:RECORD_SYNC_V1_WRITER_SESSION_MAX_WRITER_GENERATION})));
 assert.throws(()=>buildRecordSyncV1WriterSessionRegistration(input({writerGeneration:RECORD_SYNC_V1_WRITER_SESSION_MAX_WRITER_GENERATION+1})),/identity|protocol/);
});

test('builder input exact snapshot拒extra/custom prototype/accessor且不讀getter',()=>{
 assert.throws(()=>buildRecordSyncV1WriterSessionRegistration({...input(),extra:true}),/欄位/);
 assert.throws(()=>buildRecordSyncV1WriterSessionRegistration(Object.assign(Object.create({unsafe:true}),input())),/plain object/);
 let reads=0;
 const getter=input();
 Object.defineProperty(getter,'sessionId',{enumerable:true,get(){reads++;return 'session-12345678'}});
 assert.throws(()=>buildRecordSyncV1WriterSessionRegistration(getter),/data field/);
 assert.equal(reads,0);
 let toJSONCalls=0;
 const hostile=input({openedAt:{toJSON(){toJSONCalls++;return '2026-08-17T02:00:00Z'}}});
 assert.throws(()=>buildRecordSyncV1WriterSessionRegistration(hostile),/identity|protocol/);
 assert.equal(toJSONCalls,0);
});
