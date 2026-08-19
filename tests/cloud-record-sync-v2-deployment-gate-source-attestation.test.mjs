import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS
} from '../js/core/cloud-record-sync-v2-deployment-gate-contract.js';
import {
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES as LEGACY_GATE_TYPES,
 RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS as LEGACY_GATE_IDS
} from '../js/core/cloud-record-sync-v2-trusted-deployment-evidence.js';
import {
 RECORD_SYNC_V2_DEPLOYMENT_ATTESTATION_SCOPE,
 assertRecordSyncV2DeploymentGateSourceAttestation,
 assertRecordSyncV2DeploymentGateSourceAttestationIntegrity,
 buildRecordSyncV2DeploymentGateSourceAttestation,
 consumeRecordSyncV2DeploymentGateSourceAttestationPlan,
 planRecordSyncV2DeploymentGateSourceAttestation,
 recordSyncV2DeploymentGateSourceAttestationAuditHash
} from '../js/core/cloud-record-sync-v2-deployment-gate-source-attestation.js';

const h=n=>n.toString(16).repeat(64),gateMap=()=>Object.fromEntries(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS.map((id,index)=>{const type=RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[id];return[id,type+':'+h(index+1)]}));
const expected=(overrides={})=>({environment:'staging',companyId:'danbridge',projectId:'danbridge-rules-test',sourceV1ActivationEpoch:'source-v1-epoch-12345',targetV2Epoch:'target-v2-epoch-12345',rulesetHash:h(10),runtimePolicyHash:h(11),gateSourceHashes:gateMap(),...overrides});
const audited=(core,overrides={})=>({...core,persistedAt:'2026-08-18T01:02:03.123456789Z',persistedBy:'record-sync-v2-deploy-ci-emulator',persistedByEmail:'record-sync-v2-deploy-ci-emulator@danbridge.invalid',...overrides});
const consume=plan=>consumeRecordSyncV2DeploymentGateSourceAttestationPlan(plan,{expectedProjectId:plan.projectId,expectedTargetV2Epoch:plan.targetV2Epoch,expectedRulesetHash:plan.rulesetHash,expectedRuntimePolicyHash:plan.runtimePolicyHash,expectedOrderedGateSetHash:plan.orderedGateSetHash,expectedAttestationHash:plan.attestationHash,expectedPlanHash:plan.planHash});

test('deployment gate contract是import-0單一frozen source且舊evidence export同reference相容',()=>{assert.strictEqual(LEGACY_GATE_IDS,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS);assert.strictEqual(LEGACY_GATE_TYPES,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES);assert.equal(Object.isFrozen(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS),true);assert.equal(Object.isFrozen(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES),true);assert.throws(()=>RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS.push('forged'),TypeError);assert.throws(()=>{RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES['atomic-cutover']='forged'},TypeError);const source=readFileSync(new URL('../js/core/cloud-record-sync-v2-deployment-gate-contract.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\bimport\s/)});

test('D0固定六個typed source與完整context，無caller evidenceAt/ready/active欄',()=>{
 const source=expected(),before=structuredClone(source),core=buildRecordSyncV2DeploymentGateSourceAttestation(source);assert.deepEqual(source,before);assert.equal(core.scope,RECORD_SYNC_V2_DEPLOYMENT_ATTESTATION_SCOPE);assert.deepEqual(core.requiredGateIds,[...RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS]);assert.deepEqual(core.gateSources.map(row=>row.gateId),core.requiredGateIds);for(const row of core.gateSources){assert.equal(row.evidenceType,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[row.gateId]);assert.equal(row.sourceEvidenceHash,source.gateSourceHashes[row.gateId])}for(const key of ['evidenceAt','createdAt','ready','active','passed','candidateControlHash','activationIntentHash','genesisAuthorityHash','changesAuthorityHash'])assert.equal(key in core,false);assert.equal(Object.isFrozen(core.gateSources[0]),true)
});

test('gate source/context hash DAG deterministic；root/epoch/rules/runtime context皆不可轉移',()=>{
 const original=buildRecordSyncV2DeploymentGateSourceAttestation(expected()),reordered=buildRecordSyncV2DeploymentGateSourceAttestation({...expected(),gateSourceHashes:Object.fromEntries(Object.entries(gateMap()).reverse())});assert.deepEqual(original,reordered);
 for(const patch of [{targetV2Epoch:'target-v2-epoch-99999'},{sourceV1ActivationEpoch:'source-v1-epoch-99999'},{rulesetHash:h(12)},{runtimePolicyHash:h(13)}]){const changed=buildRecordSyncV2DeploymentGateSourceAttestation(expected(patch));assert.notEqual(changed.orderedGateSetHash,original.orderedGateSetHash);assert.notEqual(changed.attestationHash,original.attestationHash);for(let index=0;index<changed.gateSources.length;index++)assert.notEqual(changed.gateSources[index].gateSourceHash,original.gateSources[index].gateSourceHash)}
});

test('Integrity只驗self hash；full expected拒自洽source替換與typed gate cross-swap',()=>{
 const source=expected(),core=buildRecordSyncV2DeploymentGateSourceAttestation(source),forgedExpected=expected({rulesetHash:h(12)}),forged=buildRecordSyncV2DeploymentGateSourceAttestation(forgedExpected);assert.doesNotThrow(()=>assertRecordSyncV2DeploymentGateSourceAttestationIntegrity(forged));assert.throws(()=>assertRecordSyncV2DeploymentGateSourceAttestation(forged,source),/full expected/);
 const swapped=gateMap(),ids=RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS;[swapped[ids[0]],swapped[ids[1]]]=[swapped[ids[1]],swapped[ids[0]]];assert.throws(()=>buildRecordSyncV2DeploymentGateSourceAttestation(expected({gateSourceHashes:swapped})),/typed hash/)
});

test('D0 planner missing=create1、full audited exact=replay0；clone/manual/unaudited拒',()=>{
 const source=expected(),create=planRecordSyncV2DeploymentGateSourceAttestation(source,null),payload=consume(create);assert.equal(create.state,'attestation-create-required');assert.equal(create.writeCount,1);const durable=audited(payload.attestation),replay=planRecordSyncV2DeploymentGateSourceAttestation(source,durable);assert.equal(replay.state,'complete-confirmed');assert.equal(replay.writeCount,0);assert.equal(recordSyncV2DeploymentGateSourceAttestationAuditHash(durable),sha256Canonical({persistedAt:durable.persistedAt,persistedBy:durable.persistedBy,persistedByEmail:durable.persistedByEmail}));assert.throws(()=>planRecordSyncV2DeploymentGateSourceAttestation(source,payload.attestation),/full server audit/);assert.throws(()=>consume(structuredClone(create)),/invalid/);assert.throws(()=>consume({...create}),/invalid/)
});

test('exact descriptors/getter0/custom proto與caller time欄全部fail closed',()=>{
 let calls=0;const hostile=expected();Object.defineProperty(hostile,'rulesetHash',{enumerable:true,get(){calls++;return h(10)}});assert.throws(()=>buildRecordSyncV2DeploymentGateSourceAttestation(hostile),/data field/);const nested=expected();Object.defineProperty(nested.gateSourceHashes,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS[0],{enumerable:true,get(){calls++;return'bad'}});assert.throws(()=>buildRecordSyncV2DeploymentGateSourceAttestation(nested),/data field/);assert.equal(calls,0);assert.throws(()=>buildRecordSyncV2DeploymentGateSourceAttestation({...expected(),evidenceAt:'2026-08-18T00:00:00.000000000Z'}),/fields/);assert.throws(()=>buildRecordSyncV2DeploymentGateSourceAttestation(Object.assign(Object.create({}),expected())),/plain object/)
});
