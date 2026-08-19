import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_INTEGRITY_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_MAX_CANONICAL_BYTES,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_STATE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_PREPARATION_SCOPE,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS,
 assertRecordSyncV2TrustedDeploymentEvidence,
 assertRecordSyncV2TrustedDeploymentEvidenceIntegrity,
 buildRecordSyncV2TrustedDeploymentEvidencePreparation,
 consumeRecordSyncV2TrustedDeploymentEvidencePreparation
} from '../js/core/cloud-record-sync-v2-trusted-deployment-evidence.js';

const hashes=Object.fromEntries('authority candidate candidateAudit head intent intentAudit genesis genesisAudit changes changesAudit rules'.split(' ').map((key,index)=>[key,(index+1).toString(16).repeat(64)]));
const gateTimes=['2026-08-17T10:02:00.000000001Z','2026-08-17T10:03:00.000000002Z','2026-08-17T10:04:00.000000003Z','2026-08-17T10:05:00.000000004Z','2026-08-17T10:06:00.000000005Z','2026-08-17T10:07:00.000000006Z'];
function gates(){return Object.fromEntries(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS.map((gateId,index)=>{const evidenceType=RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[gateId];return[gateId,{evidenceType,sourceEvidenceHash:evidenceType+':'+(index+10).toString(16).repeat(64),evidenceAt:gateTimes[index]}]}))}
function input(overrides={}){return{environment:'staging',companyId:'danbridge',projectId:'danbridge-d8877-staging',sourceV1ActivationEpoch:'source-v1-epoch-12345',targetV2Epoch:'target-v2-epoch-12345',authorityRootHash:hashes.authority,candidateControlHash:hashes.candidate,candidatePairAuditHash:hashes.candidateAudit,authorityBoundHeadHash:hashes.head,activationIntentHash:hashes.intent,activationIntentAuditHash:hashes.intentAudit,genesisAuthorityHash:hashes.genesis,genesisAuthorityAuditHash:hashes.genesisAudit,changesAuthorityHash:hashes.changes,changesAuthorityAuditHash:hashes.changesAudit,seedId:'v2-genesis:'+'e'.repeat(64),candidateRulesetHash:hashes.rules,writerGeneration:2,minClientProtocolVersion:4,minClientReleaseId:'20.26.114',candidatePersistedAt:'2026-08-17T10:00:00.000000000Z',intentPersistedAt:'2026-08-17T10:01:00.000000000Z',gateEvidence:gates(),...overrides}}
function prepared(value=input()){const plan=buildRecordSyncV2TrustedDeploymentEvidencePreparation(value),payload=consumeRecordSyncV2TrustedDeploymentEvidencePreparation(plan,{expectedTargetV2Epoch:plan.targetV2Epoch,expectedAuthorityRootHash:plan.authorityRootHash,expectedOrderedGateSetHash:plan.orderedGateSetHash,expectedEvidenceHash:plan.evidenceHash,expectedPlanHash:plan.planHash});return{plan,evidence:payload.evidence}}
function rehash(value,patch){const core=structuredClone(value);Object.assign(core,patch);delete core.evidenceHash;return{...core,evidenceHash:sha256Canonical(core)}}

test('prepared evidence固定六gate typed order與單向gate→set→evidence DAG，且不宣稱receipt/readiness/active',()=>{
 const source=input(),before=structuredClone(source),{plan,evidence}=prepared(source);assert.deepEqual(source,before);assert.equal(evidence.state,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_STATE);assert.equal(evidence.scope,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_SCOPE);assert.equal(plan.scope,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_PREPARATION_SCOPE);assert.deepEqual(evidence.requiredGateIds,[...RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS]);assert.deepEqual(evidence.gateEvidence.map(row=>row.gateId),[...RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS]);for(const row of evidence.gateEvidence)assert.equal(row.evidenceType,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[row.gateId]);assert.equal(evidence.createdAt,gateTimes.at(-1));assert.equal(plan.writeCount,0);for(const forbidden of ['ready','passed','receiptHash','activeControl','readAllowed','writeAllowed'])assert.equal(forbidden in evidence,false);assert.ok(JSON.stringify(evidence).length<RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_MAX_CANONICAL_BYTES);assert.equal(Object.isFrozen(evidence),true);assert.equal(Object.isFrozen(evidence.gateEvidence[0]),true);assert.throws(()=>{evidence.gateEvidence[0].gateId='forged'},TypeError)
});

test('Firestore map key order不影響輸出；required gates與gateEvidence output順序固定',()=>{
 const original=input(),reordered=Object.fromEntries(Object.entries(original).reverse()),reversedMap=Object.fromEntries(Object.entries(original.gateEvidence).reverse()),a=prepared(original).evidence,b=prepared({...reordered,gateEvidence:reversedMap}).evidence;assert.equal(a.evidenceHash,b.evidenceHash);assert.equal(a.orderedGateSetHash,b.orderedGateSetHash);assert.deepEqual(a.gateEvidence,b.gateEvidence)
});

test('Integrity只證self-hash；root forge靠full expected拒，typed gate cross-swap在Integrity即拒',()=>{
 const expected=input(),valid=prepared(expected).evidence,rootForge=prepared(input({authorityRootHash:'f'.repeat(64)})).evidence;assert.equal(assertRecordSyncV2TrustedDeploymentEvidenceIntegrity(rootForge).evidenceHash,rootForge.evidenceHash);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence(rootForge,expected),/full expected/);
 const swapped=structuredClone(valid),left=swapped.gateEvidence[0].sourceEvidenceHash;swapped.gateEvidence[0].sourceEvidenceHash=swapped.gateEvidence[1].sourceEvidenceHash;swapped.gateEvidence[1].sourceEvidenceHash=left;for(const row of swapped.gateEvidence){const body={schema:'danbridge-record-sync-v2-trusted-deployment-gate-v1',gateId:row.gateId,evidenceType:row.evidenceType,sourceEvidenceHash:row.sourceEvidenceHash,evidenceAt:row.evidenceAt};row.gateHash=sha256Canonical(body)}swapped.orderedGateSetHash=sha256Canonical({schema:'danbridge-record-sync-v2-trusted-deployment-gate-set-v1',gateHashes:swapped.gateEvidence.map(row=>row.gateHash)});delete swapped.evidenceHash;swapped.evidenceHash=sha256Canonical(swapped);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidenceIntegrity(swapped),/identity|hash/);assert.match(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_EVIDENCE_INTEGRITY_SCOPE,/self-hash-only/)
});

test('project/company/epoch/root/candidate/head/intent與ruleset均exact full-bound',()=>{
 const valid=prepared().evidence;for(const patch of [{projectId:'other-project'},{companyId:'other'},{targetV2Epoch:'source-v1-epoch-12345'},{candidateControlHash:hashes.head},{authorityBoundHeadHash:hashes.candidate},{activationIntentHash:hashes.authority},{candidateRulesetHash:hashes.intent}])assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence(rehash(valid,patch),input()),/identity|full expected/)
});

test('每個gate與ordered set都綁fixed project/epoch/root/candidate/head/intent/ruleset context',()=>{
 const original=prepared(input()).evidence,changedRoot=prepared(input({authorityRootHash:'f'.repeat(64)})).evidence,changedEpoch=prepared(input({targetV2Epoch:'target-v2-epoch-67890'})).evidence;
 assert.notEqual(original.orderedGateSetHash,changedRoot.orderedGateSetHash);assert.notEqual(original.orderedGateSetHash,changedEpoch.orderedGateSetHash);
 for(let index=0;index<original.gateEvidence.length;index++){assert.notEqual(original.gateEvidence[index].gateHash,changedRoot.gateEvidence[index].gateHash);assert.notEqual(original.gateEvidence[index].gateHash,changedEpoch.gateEvidence[index].gateHash)}
});

test('gate map缺漏、額外、錯type、重排output或gate hash tamper全部fail closed',()=>{
 const missing=gates();delete missing['resume-race'];assert.throws(()=>buildRecordSyncV2TrustedDeploymentEvidencePreparation(input({gateEvidence:missing})),/fields/);const extra={...gates(),extra:{}};assert.throws(()=>buildRecordSyncV2TrustedDeploymentEvidencePreparation(input({gateEvidence:extra})),/fields/);const wrong=gates();wrong['atomic-cutover']={...wrong['atomic-cutover'],evidenceType:RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES['runtime-no-fallback']};assert.throws(()=>buildRecordSyncV2TrustedDeploymentEvidencePreparation(input({gateEvidence:wrong})),/type/);
 const valid=prepared().evidence,reordered=structuredClone(valid);reordered.gateEvidence.reverse();delete reordered.evidenceHash;reordered.evidenceHash=sha256Canonical(reordered);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidenceIntegrity(reordered),/ordered/);const bad=structuredClone(valid);bad.gateEvidence[0].gateHash='f'.repeat(64);delete bad.evidenceHash;bad.evidenceHash=sha256Canonical(bad);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidenceIntegrity(bad),/hash/)
});

test('intent不得早於candidate且每個gate都不得早於intent；gate可非單調但均須合格',()=>{
 assert.throws(()=>prepared(input({candidatePersistedAt:'2026-08-17T10:01:00.000000001Z'})),/intent precedes candidate/);
 const oneEarly=gates();oneEarly['trusted-deployment-receipt']={...oneEarly['trusted-deployment-receipt'],evidenceAt:'2026-08-17T10:00:59.999999999Z'};assert.throws(()=>prepared(input({gateEvidence:oneEarly})),/precedes activation intent/);
 const nonmonotonic=gates();nonmonotonic['trusted-deployment-receipt']={...nonmonotonic['trusted-deployment-receipt'],evidenceAt:'2026-08-17T10:06:30.000000000Z'};nonmonotonic['dual-mode-rules-emulator']={...nonmonotonic['dual-mode-rules-emulator'],evidenceAt:'2026-08-17T10:01:00.000000000Z'};assert.doesNotThrow(()=>prepared(input({gateEvidence:nonmonotonic})));
});

test('createdAt只取六gate evidenceAt最大instant；nanos與offset等價，source較晚1ns拒',()=>{
 const equivalent=gates();equivalent['runtime-no-fallback']={...equivalent['runtime-no-fallback'],evidenceAt:'2026-08-17T18:07:00.000000006+08:00'};const evidence=prepared(input({gateEvidence:equivalent})).evidence;assert.equal(evidence.createdAt,'2026-08-17T18:07:00.000000006+08:00');assert.doesNotThrow(()=>assertRecordSyncV2TrustedDeploymentEvidence({...evidence,persistedAt:'2026-08-17T10:07:00.000000006Z',persistedBy:'deploy-service-123',persistedByEmail:'deploy@example.com'},input({gateEvidence:equivalent})));
 assert.throws(()=>prepared(input({intentPersistedAt:'2026-08-17T10:07:00.000000007Z'})),/precedes/);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence({...evidence,persistedAt:'2026-08-17T10:07:00.000000005Z',persistedBy:'deploy-service-123',persistedByEmail:'deploy@example.com'},input({gateEvidence:equivalent})),/precedes/)
});

test('audit只允許0或all3且不入evidenceHash；extra/accessor/custom proto全部getter0',()=>{
 const expected=input(),evidence=prepared(expected).evidence,audited={...evidence,persistedAt:'2026-08-17T10:08:00.000000000Z',persistedBy:'deploy-service-123',persistedByEmail:'deploy@example.com'};assert.equal(assertRecordSyncV2TrustedDeploymentEvidence(audited,expected).evidenceHash,evidence.evidenceHash);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence({...evidence,persistedAt:audited.persistedAt},expected),/zero or all/);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence({...audited,extra:true},expected),/fields/);assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence(Object.assign(Object.create({}),audited),expected),/plain object/);
 let calls=0;const hostile={...audited};Object.defineProperty(hostile,'persistedAt',{enumerable:true,get(){calls++;return audited.persistedAt}});assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidence(hostile,expected),/data field/);const nested=structuredClone(evidence);Object.defineProperty(nested.gateEvidence[0],'evidenceAt',{enumerable:true,get(){calls++;return gateTimes[0]}});assert.throws(()=>assertRecordSyncV2TrustedDeploymentEvidenceIntegrity(nested),/data field/);assert.equal(calls,0)
});

test('所有primitive在canonical hash前驗證，hostile toJSON永不執行',()=>{
 let calls=0;for(const key of ['candidatePersistedAt','authorityRootHash']){const hostile=input();hostile[key]={toJSON(){calls++;return key==='candidatePersistedAt'?gateTimes[0]:'a'.repeat(64)}};assert.throws(()=>buildRecordSyncV2TrustedDeploymentEvidencePreparation(hostile),/identity/)}const hostileGate=gates();hostileGate['resume-race']={...hostileGate['resume-race'],evidenceAt:{toJSON(){calls++;return gateTimes[3]}}};assert.throws(()=>buildRecordSyncV2TrustedDeploymentEvidencePreparation(input({gateEvidence:hostileGate})),/identity|timestamp/);assert.equal(calls,0)
});

test('ephemeral preparation capability拒clone/manual與expected mismatch，且不可被稱為cutover authority',()=>{
 const {plan}=prepared(),expected={expectedTargetV2Epoch:plan.targetV2Epoch,expectedAuthorityRootHash:plan.authorityRootHash,expectedOrderedGateSetHash:plan.orderedGateSetHash,expectedEvidenceHash:plan.evidenceHash,expectedPlanHash:plan.planHash};assert.throws(()=>consumeRecordSyncV2TrustedDeploymentEvidencePreparation(structuredClone(plan),expected),/capability/);assert.throws(()=>consumeRecordSyncV2TrustedDeploymentEvidencePreparation({...plan},expected),/capability/);assert.throws(()=>consumeRecordSyncV2TrustedDeploymentEvidencePreparation(plan,{...expected,expectedEvidenceHash:'f'.repeat(64)}),/expected identity/);assert.match(plan.scope,/not-persistence-receipt-readiness-active-or-cutover-authority/)
});
