import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStagingV2PreAtomicArtifacts} from '../js/core/staging-v2-pre-atomic-artifacts.js';
import {buildStagingV2AtomicArtifacts,STAGING_V2_ATOMIC_CONFIRMATION} from '../js/core/staging-v2-atomic-artifacts.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),head='a'.repeat(40),preAtomicRunId='123456789',preAtomicRunAttempt=1,preRunId=`gh_${preAtomicRunId}_${preAtomicRunAttempt}_${head.slice(0,12)}`,currentRunId=`gh_123456790_1_${head.slice(0,12)}`;
const metadata=(overrides={})=>({schema:'danbridge-staging-v2-pre-atomic-github-run-v1',runId:preAtomicRunId,runAttempt:preAtomicRunAttempt,headSha:head,headBranch:'main',event:'workflow_dispatch',status:'completed',conclusion:'success',repository:'Danbridge777/danbridge-scheduler-v11',workflowPath:'.github/workflows/staging-v2-pre-atomic.yml',...overrides});
function fixture(){
 const pre=buildStagingV2PreAtomicArtifacts({root,runId:preRunId,firestoreRulesDeployAllowed:true}),receipt={schema:'danbridge-staging-v2-pre-atomic-run-result-v1',status:'PRE_ATOMIC_READY',runId:preRunId,lastPhase:'PRE_ATOMIC_GATE',atomicStarted:false,projectId:'danbridge-d8877-staging',requestHash:pre.manifest.requestHash,manifestHash:pre.manifest.manifestHash,rulesetHash:pre.manifest.rulesetHash,firestoreRulesDeployed:true,productionTouched:false,hostingDeployed:false,timeMachineTouched:false},preAtomicReceiptRaw=JSON.stringify(receipt,null,2)+'\n',preAtomicReceiptSha256=createHash('sha256').update(preAtomicReceiptRaw).digest('hex');
 return{root,currentRunId,currentGitSha:head,preAtomicRunId,preAtomicRunAttempt,preAtomicReceiptSha256,preAtomicReceiptRaw,preAtomicRunMetadata:metadata(),confirmation:STAGING_V2_ATOMIC_CONFIRMATION,rulesMatch:true};
}

test('successful exact pre-atomic receipt and GitHub run mint only a staging atomic manifest',()=>{
 const value=buildStagingV2AtomicArtifacts(fixture());
 assert.equal(value.manifest.atomicActivationAllowed,true);
 assert.equal(value.manifest.firestoreRulesDeployAllowed,false);
 assert.equal(value.manifest.productionAllowed,false);
 assert.equal(value.manifest.hostingDeployAllowed,false);
 assert.equal(value.manifest.timeMachineAllowed,false);
 assert.match(value.authorizationHash,/^[a-f0-9]{64}$/);
 assert.equal(value.preAtomicReceipt.status,'PRE_ATOMIC_READY');
});

test('receipt bytes, run lineage, source, Rules match and explicit confirmation are all fail-closed',()=>{
 const base=fixture();
 for(const patch of [
  {preAtomicReceiptSha256:'0'.repeat(64)},
  {preAtomicRunMetadata:metadata({conclusion:'failure'})},
  {preAtomicRunMetadata:metadata({headSha:'b'.repeat(40)})},
  {confirmation:'NO'},
  {rulesMatch:false},
  {preAtomicRunAttempt:2},
 ])assert.throws(()=>buildStagingV2AtomicArtifacts({...base,...patch}),/blocked/);
 const receipt=JSON.parse(base.preAtomicReceiptRaw);receipt.productionTouched=true;
 const raw=JSON.stringify(receipt),hash=createHash('sha256').update(raw).digest('hex');
 assert.throws(()=>buildStagingV2AtomicArtifacts({...base,preAtomicReceiptRaw:raw,preAtomicReceiptSha256:hash}),/blocked/);
});
