import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {createStagingV2ActivationSupervisor,STAGING_V2_SUPERVISOR_PHASES} from '../js/core/staging-v2-activation-supervisor.js';
import {createStagingV2ConcreteManualSupervisorActions,STAGING_V2_CONCRETE_PHASE_STEPS,STAGING_V2_CONCRETE_STEP_NAMES} from '../js/core/staging-v2-concrete-manual-supervisor-actions.js';

const hash=value=>sha256Canonical({value});
const manifest=({atomicActivationAllowed=false,firestoreRulesDeployAllowed=false}={})=>{const body={schema:'danbridge-staging-v2-activation-supervisor-manifest-v1',runId:'concrete_run_12345',requestHash:hash('request'),environment:'staging',companyId:'danbridge',projectId:'danbridge-d8877-staging',serviceAccountEmail:'danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com',rulesetHash:hash('rules'),runtimePolicyHash:hash('policy'),runtimeAdapterHash:hash('adapter'),clientWiringHash:hash('client'),firestoreRulesDeployAllowed,hostingDeployAllowed:false,productionAllowed:false,timeMachineAllowed:false,atomicActivationAllowed};return{...body,manifestHash:sha256Canonical(body)}};
const chosen=(phase,rules)=>phase==='STAGING_RULES_ATTESTATION'?[rules?'STAGING_RULES_DEPLOY_AND_ATTEST':'STAGING_RULES_READBACK_ATTESTATION']:STAGING_V2_CONCRETE_PHASE_STEPS[phase];
const expectedOrder=(lastPhase,rules)=>{const phases=STAGING_V2_SUPERVISOR_PHASES.slice(0,STAGING_V2_SUPERVISOR_PHASES.indexOf(lastPhase)+1);return phases.flatMap(phase=>chosen(phase,rules))};

function fixture({atomic=false,rules=false,override={}}={}){
 const order=[],contexts=[],steps={};
 for(const name of STAGING_V2_CONCRETE_STEP_NAMES)steps[name]=async context=>{order.push(name);contexts.push(context);return Object.freeze({capability:Object.freeze({schema:'native-'+name.toLowerCase(),nonce:hash(name)}),receiptHash:hash('receipt-'+name),readCount:name==='ATOMIC_PREFLIGHT'?12:1,writeCount:['READINESS_CHECK','BASELINE_ATTESTATION_READBACK','STAGING_RULES_READBACK_ATTESTATION','ATOMIC_PREFLIGHT','FINAL_READBACK'].includes(name)?0:1,firestoreRulesDeployed:name==='STAGING_RULES_DEPLOY_AND_ATTEST'})};
 Object.assign(steps,override);
 let rollbackContext=null;
 const actions=createStagingV2ConcreteManualSupervisorActions({steps,rollback:async context=>{rollbackContext=context;order.push('ROLLBACK');return Object.freeze({capability:Object.freeze({schema:'cleanup-only'}),receiptHash:hash('rollback'),readCount:0,writeCount:0,firestoreRulesDeployed:false})}}),rows=[],journal={append:async row=>rows.push(structuredClone(row)),readAll:async()=>structuredClone(rows)},supervisor=createStagingV2ActivationSupervisor({rawManifest:manifest({atomicActivationAllowed:atomic,firestoreRulesDeployAllowed:rules}),actions,journal});
 return{actions,contexts,journal,order,rows,supervisor,getRollbackContext:()=>rollbackContext};
}

test('未授權 atomic 時按真實 granular order 精確停在12-read preflight，完全不呼叫 atomic/H1/final',async()=>{
 const value=fixture(),done=await value.supervisor.run();
 assert.equal(done.status,'PRE_ATOMIC_READY');
 assert.deepEqual(value.order,expectedOrder('PRE_ATOMIC_GATE',false));
 assert.equal(value.order.includes('ATOMIC_ACTIVATION'),false);
 assert.equal(value.order.includes('H1_SAVE'),false);
 assert.equal(value.order.includes('FINAL_READBACK'),false);
 const preflight=value.rows.find(row=>row.phase==='PRE_ATOMIC_GATE'&&row.event==='completed');
 assert.deepEqual({reads:preflight.readCount,writes:preflight.writeCount},{reads:12,writes:0});
});

test('明確 atomic 與 Rules 授權後才選部署分支，並依序完成 recovery、H1、baseline、final',async()=>{
 const value=fixture({atomic:true,rules:true}),done=await value.supervisor.run();
 assert.equal(done.status,'COMPLETE');
 assert.deepEqual(value.order,expectedOrder('FINAL_READBACK',true));
 assert.equal(value.order.includes('STAGING_RULES_READBACK_ATTESTATION'),false);
 assert.ok(value.order.indexOf('ATOMIC_PREFLIGHT')<value.order.indexOf('ATOMIC_ACTIVATION'));
 assert.ok(value.order.indexOf('ATOMIC_ACTIVATION')<value.order.indexOf('POST_CUTOVER_RECOVERY'));
 assert.ok(value.order.indexOf('POST_CUTOVER_RECOVERY')<value.order.indexOf('H1_SAVE'));
 assert.ok(value.order.indexOf('H1_SAVE')<value.order.indexOf('H1_BASELINE_SNAPSHOT'));
 assert.ok(value.order.indexOf('H1_BASELINE_SNAPSHOT')<value.order.indexOf('FINAL_READBACK'));
 assert.equal(value.rows.filter(row=>row.firestoreRulesDeployed).every(row=>row.phase==='STAGING_RULES_ATTESTATION'&&row.event==='completed'),true);
});

test('未授權 Rules 時部署函式不會被呼叫，唯讀 attestation 固定0 writes',async()=>{
 const value=fixture({override:{STAGING_RULES_DEPLOY_AND_ATTEST:async()=>{throw new Error('must not deploy')}}}),done=await value.supervisor.run();
 assert.equal(done.status,'PRE_ATOMIC_READY');
 assert.equal(value.order.includes('STAGING_RULES_READBACK_ATTESTATION'),true);
 assert.equal(value.order.includes('STAGING_RULES_DEPLOY_AND_ATTEST'),false);
 const row=value.rows.find(item=>item.phase==='STAGING_RULES_ATTESTATION'&&item.event==='completed');
 assert.deepEqual({writes:row.writeCount,deployed:row.firestoreRulesDeployed},{writes:0,deployed:false});
});

test('每一步只收到先前原生 capability；非法輸出會在下一子步驟前 fail closed 並 cleanup-only',async()=>{
 const pairCalls=[],value=fixture({override:{POST_PAUSE_SCAN_V:async context=>{pairCalls.push(context.step);return{capability:Object.freeze({schema:'bad'}),receiptHash:hash('bad'),readCount:1,writeCount:1,firestoreRulesDeployed:false,extra:true}},POST_PAUSE_SCAN_PAIR:async()=>{pairCalls.push('PAIR');throw new Error('must not reach pair')}}});
 await assert.rejects(()=>value.supervisor.run(),/rollback confirmed/);
 assert.deepEqual(pairCalls,['POST_PAUSE_SCAN_V']);
 assert.equal(value.order.at(-1),'ROLLBACK');
 assert.ok(value.getRollbackContext().priorStepCapabilities.POST_PAUSE_SCAN_U);
 assert.equal(value.getRollbackContext().priorStepCapabilities.POST_PAUSE_SCAN_V,undefined);
 const firstOfEachPhase=value.contexts.filter((context,index)=>index===0||value.contexts[index-1].phase!==context.phase);
 for(const context of firstOfEachPhase)assert.equal(Object.keys(context.phaseStepCapabilities).length,0);
});

test('preflight 不是精確12 reads、read-only step寫入、或 capability clone 都不能越過邊界',async()=>{
 const eleven=fixture({override:{ATOMIC_PREFLIGHT:async()=>({capability:Object.freeze({schema:'preflight'}),receiptHash:hash('preflight'),readCount:11,writeCount:0,firestoreRulesDeployed:false})}});
 await assert.rejects(()=>eleven.supervisor.run(),/rollback confirmed/);
 assert.equal(eleven.order.includes('ATOMIC_ACTIVATION'),false);
 const writable=fixture({override:{READINESS_CHECK:async()=>({capability:Object.freeze({schema:'readiness'}),receiptHash:hash('readiness'),readCount:1,writeCount:1,firestoreRulesDeployed:false})}});
 await assert.rejects(()=>writable.supervisor.run(),/rollback confirmed/);
 const start=Object.freeze({schema:'danbridge-staging-v2-supervisor-start-capability-v1'}),clean=fixture(),first=await clean.actions.READINESS({manifest:manifest(),phase:'READINESS',capability:start});
 await assert.rejects(()=>clean.actions.BASELINE_ATTESTATION({manifest:manifest(),phase:'BASELINE_ATTESTATION',capability:structuredClone(first.capability)}),/cloned|foreign/);
});
