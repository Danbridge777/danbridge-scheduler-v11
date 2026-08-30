import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStagingV2PreAtomicArtifacts} from '../js/core/staging-v2-pre-atomic-artifacts.js';
import {RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS} from '../js/core/cloud-record-sync-v2-deployment-gate-contract.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('stable request excludes run identity and Rules deploy decision while manifest retains both gates',()=>{
 const first=buildStagingV2PreAtomicArtifacts({root,runId:'gh_123456_1_abcdef123456',firestoreRulesDeployAllowed:false}),second=buildStagingV2PreAtomicArtifacts({root,runId:'gh_123457_2_abcdef123456',firestoreRulesDeployAllowed:true});
 assert.equal(first.manifest.requestHash,second.manifest.requestHash);
 assert.notEqual(first.manifest.manifestHash,second.manifest.manifestHash);
 assert.equal(first.manifest.atomicActivationAllowed,false);
 assert.equal(first.manifest.productionAllowed,false);
 assert.equal(first.manifest.hostingDeployAllowed,false);
 assert.equal(first.manifest.timeMachineAllowed,false);
 assert.equal(second.manifest.firestoreRulesDeployAllowed,true);
 for(const gateId of RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_REQUIRED_GATE_IDS)assert.match(first.gateSourceHashes[gateId],new RegExp('^'+RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[gateId]+':[a-f0-9]{64}$'));
});

test('invalid run identity and missing source inventory fail closed',()=>{
 assert.throws(()=>buildStagingV2PreAtomicArtifacts({root,runId:'bad',firestoreRulesDeployAllowed:false}),/blocked/);
 assert.throws(()=>buildStagingV2PreAtomicArtifacts({root:resolve(root,'missing'),runId:'gh_123456_1_abcdef123456',firestoreRulesDeployAllowed:false}),/ENOENT/);
});
