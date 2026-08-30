import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingV2AdminSupervisorPrimitives} from '../js/core/staging-v2-admin-supervisor-primitives.js';
import {RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS} from '../js/core/cloud-record-sync-v2-deployment-gate-contract.js';

const hex=n=>String(n).repeat(64);
const gateSourceHashes=Object.fromEntries(RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS.map((gateId,index)=>[gateId,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[gateId]+':'+(index+1).toString(16).repeat(64)]));
const readiness={readinessCheck:async()=>({capability:{schema:'readiness'},readCount:1,writeCount:0})};
const rules={rulesReadbackAttestation:async()=>({capability:{schema:'rules-read'},readCount:1,writeCount:0}),rulesDeployAndAttest:async()=>({capability:{schema:'rules-write'},readCount:2,writeCount:1})};
const baselineReadback=async()=>({capability:{schema:'baseline'},readCount:3,writeCount:0});
const context={manifest:{projectId:'danbridge-d8877-staging',rulesetHash:hex('a'),runtimePolicyHash:hex('b')},priorStepCapabilities:{CUTOVER_INTENT:{environment:'staging',companyId:'danbridge',projectId:'danbridge-d8877-staging',sourceV1ActivationEpoch:'source-v1-epoch',targetV2Epoch:'target-v2-epoch'}}};

test('fixed primitives forward readiness/rules, validate baseline, and derive exact D0 expected input',async()=>{
 const value=createStagingV2AdminSupervisorPrimitives({readiness,rules,baselineReadback,gateSourceHashes});
 assert.deepEqual(await value.baselineAttestationReadback({}),{capability:{schema:'baseline'},readCount:3,writeCount:0});
 const expected=await value.deploymentAttestationExpected(context);
 assert.equal(expected.sourceV1ActivationEpoch,'source-v1-epoch');
 assert.equal(expected.targetV2Epoch,'target-v2-epoch');
 assert.deepEqual(expected.gateSourceHashes,gateSourceHashes);
 const rollback=await value.rollback({phase:'ROLLBACK'});
 assert.equal(rollback.writeCount,0);
 assert.equal(rollback.capability.productionTouched,false);
 await assert.rejects(()=>value.h1SaveRequest({}),/separate atomic authorization/);
});

test('writable baseline, malformed gate digest, and foreign cutover capability fail closed',async()=>{
 const writable=createStagingV2AdminSupervisorPrimitives({readiness,rules,baselineReadback:async()=>({capability:{schema:'bad'},readCount:1,writeCount:1}),gateSourceHashes});
 await assert.rejects(()=>writable.baselineAttestationReadback({}),/blocked/);
 assert.throws(()=>createStagingV2AdminSupervisorPrimitives({readiness,rules,baselineReadback,gateSourceHashes:{...gateSourceHashes,'resume-race':'bad'}}),/gate source hash blocked/);
 await assert.rejects(()=>writable.deploymentAttestationExpected({...context,priorStepCapabilities:{CUTOVER_INTENT:{...context.priorStepCapabilities.CUTOVER_INTENT,projectId:'production'}}}),/cutover capability blocked/);
});
