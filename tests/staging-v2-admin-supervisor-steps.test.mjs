import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGING_V2_ADMIN_BINDER_NAMES,STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE} from '../js/core/staging-v2-admin-binder-registry.js';
import {STAGING_V2_CONCRETE_STEP_NAMES} from '../js/core/staging-v2-concrete-manual-supervisor-actions.js';
import {createStagingV2AdminSupervisorSteps,STAGING_V2_ADMIN_SUPERVISOR_STEPS_SCOPE} from '../js/core/staging-v2-admin-supervisor-steps.js';

const native=name=>Object.freeze({schema:'native-'+name,writeCount:0});
const ctx=(step,priorStepCapabilities={},phaseStepCapabilities={})=>({manifest:Object.freeze({environment:'staging'}),phase:'TEST',step,priorStepCapabilities,phaseStepCapabilities});

function fixture(){
  const calls=[],binders={};
  for(const name of STAGING_V2_ADMIN_BINDER_NAMES)binders[name]={scope:'fixed-'+name};
  const method=(name,resultValue=native(name))=>(...args)=>{calls.push([name,...args]);return Promise.resolve(resultValue)};
  Object.assign(binders.writerCurrent,{execute:method('writerCurrent')});
  Object.assign(binders.hardPause,{execute:method('hardPause')});
  Object.assign(binders.postPauseScan,{executeU:method('scanU'),executeV:method('scanV'),executePair:method('scanPair')});
  Object.assign(binders.rawBackup,{execute:method('rawBackup')});
  Object.assign(binders.frozenSourceProof,{execute:method('frozenProof')});
  Object.assign(binders.genesisSeedPlan,{execute:method('g0')});
  Object.assign(binders.genesisSeedBatch,{execute:method('g1')});
  Object.assign(binders.genesisIdentityIndex,{execute:method('index')});
  Object.assign(binders.genesisReadback,{executeManifest:method('g2manifest'),executeReadback:method('g2readback'),confirm:method('g2confirm')});
  Object.assign(binders.genesisAuthority,{execute:method('g3')});
  Object.assign(binders.genesisAuthorityReceipt,{execute:method('g35')});
  Object.assign(binders.reservationRegistration,{execute:method('r0')});
  Object.assign(binders.reservationBatch,{execute:method('r1')});
  Object.assign(binders.reservationSeal,{execute:method('r2')});
  Object.assign(binders.reservationFinalization,{execute:method('r25')});
  Object.assign(binders.reservationReadback,{execute:method('qv2')});
  Object.assign(binders.reservationAuthority,{execute:method('rv2')});
  Object.assign(binders.reservationAuthorityReceipt,{execute:method('r35')});
  Object.assign(binders.takeoverCandidate,{execute:method('candidate')});
  Object.assign(binders.cutoverIntent,{execute:method('intent')});
  Object.assign(binders.deploymentAttestation,{execute:method('d0')});
  Object.assign(binders.trustedDeploymentEvidence,{execute:method('d1')});
  Object.assign(binders.atomicActivation,{preflight:method('preflight',Object.freeze({schema:'preflight',readCount:12,writeCount:0})),execute:method('atomic'),recover:method('recovery')});
  Object.assign(binders.h1Save,{execute:method('h1'),recover:method('h1Recovery')});
  Object.assign(binders.h1Baseline,{execute:method('baseline')});
  const externalCalls=[],primitive=(name,output={capability:native(name),readCount:1,writeCount:0})=>async value=>{externalCalls.push([name,value]);return output};
  const primitives={
    readinessCheck:primitive('readiness'),
    baselineAttestationReadback:primitive('baselineReadback'),
    rulesReadbackAttestation:primitive('rulesReadback'),
    rulesDeployAndAttest:primitive('rulesDeploy',{capability:native('rulesDeploy'),readCount:2,writeCount:1}),
    deploymentAttestationExpected:primitive('deploymentExpected',native('deploymentExpected')),
    h1SaveRequest:primitive('h1Request',native('h1Request')),
    h1BaselinePlan:primitive('baselinePlan',native('baselinePlan')),
    finalReadback:primitive('final'),
    rollback:primitive('rollback',{capability:native('rollback'),readCount:0,writeCount:0}),
  };
  const registry={scope:STAGING_V2_ADMIN_BINDER_REGISTRY_SCOPE,projectId:'danbridge-d8877-staging',binders};
  return{calls,externalCalls,registry,primitives,value:createStagingV2AdminSupervisorSteps({registry,primitives})};
}

test('35 個 concrete step 只能由固定 25 binder registry 與九個受限 primitives 組成',()=>{
  const value=fixture().value;
  assert.equal(value.scope,STAGING_V2_ADMIN_SUPERVISOR_STEPS_SCOPE);
  assert.deepEqual(Object.keys(value.steps),STAGING_V2_CONCRETE_STEP_NAMES);
  assert.equal(typeof value.rollback,'function');
});

test('hard-pause、U/V/Pair、backup 只接收同程序前一步原 capability',async()=>{
  const value=fixture(),readiness=await value.value.steps.READINESS_CHECK(ctx('READINESS_CHECK'));
  const hard=await value.value.steps.HARD_PAUSE(ctx('HARD_PAUSE',{READINESS_CHECK:readiness.capability}));
  const u=await value.value.steps.POST_PAUSE_SCAN_U(ctx('POST_PAUSE_SCAN_U',{HARD_PAUSE:hard.capability}));
  const v=await value.value.steps.POST_PAUSE_SCAN_V(ctx('POST_PAUSE_SCAN_V',{}, {POST_PAUSE_SCAN_U:u.capability}));
  const pair=await value.value.steps.POST_PAUSE_SCAN_PAIR(ctx('POST_PAUSE_SCAN_PAIR',{}, {POST_PAUSE_SCAN_U:u.capability,POST_PAUSE_SCAN_V:v.capability}));
  await value.value.steps.RAW_BACKUP(ctx('RAW_BACKUP',{POST_PAUSE_SCAN_V:v.capability,POST_PAUSE_SCAN_PAIR:pair.capability}));
  assert.deepEqual(value.calls.map(row=>row[0]),['hardPause','scanU','scanV','scanPair','rawBackup']);
  assert.equal(value.calls[0][1],readiness.capability);
  assert.equal(value.calls[1][1],hard.capability);
  assert.equal(value.calls[2][1],u.capability);
  assert.equal(value.calls[3][1],v.capability);
  assert.deepEqual(value.calls[4].slice(1),[v.capability,pair.capability]);
});

test('Rules 分支與 atomic preflight 具精確部署標記及 12-read/0-write 邊界',async()=>{
  const value=fixture(),readback=await value.value.steps.STAGING_RULES_READBACK_ATTESTATION(ctx('STAGING_RULES_READBACK_ATTESTATION')),deploy=await value.value.steps.STAGING_RULES_DEPLOY_AND_ATTEST(ctx('STAGING_RULES_DEPLOY_AND_ATTEST')),d1=native('d1'),preflight=await value.value.steps.ATOMIC_PREFLIGHT(ctx('ATOMIC_PREFLIGHT',{TRUSTED_DEPLOYMENT_EVIDENCE:d1}));
  assert.deepEqual({writes:readback.writeCount,deployed:readback.firestoreRulesDeployed},{writes:0,deployed:false});
  assert.deepEqual({writes:deploy.writeCount,deployed:deploy.firestoreRulesDeployed},{writes:1,deployed:true});
  assert.deepEqual({reads:preflight.readCount,writes:preflight.writeCount,deployed:preflight.firestoreRulesDeployed},{reads:12,writes:0,deployed:false});
  assert.deepEqual(value.calls.at(-1),['preflight',d1]);
});

test('H1 與 baseline 只使用 primitive 建好的 request/plan，binder 不可被 primitive 替換',async()=>{
  const value=fixture(),recovery=native('recovery'),h1=await value.value.steps.H1_SAVE(ctx('H1_SAVE',{POST_CUTOVER_RECOVERY:recovery})),baseline=await value.value.steps.H1_BASELINE_SNAPSHOT(ctx('H1_BASELINE_SNAPSHOT',{H1_SAVE:h1.capability}));
  assert.equal(value.calls[0][0],'h1');
  assert.equal(value.calls[0][1],recovery);
  assert.equal(value.calls[0][2].schema,'native-h1Request');
  assert.equal(value.calls[1][0],'baseline');
  assert.equal(value.calls[1][1].schema,'native-baselinePlan');
  assert.equal(baseline.firestoreRulesDeployed,false);
});

test('錯專案、registry 缺 binder、read-only primitive 寫入與額外 primitive 欄位全部 fail closed',async()=>{
  const base=fixture();
  assert.throws(()=>createStagingV2AdminSupervisorSteps({registry:{...base.registry,projectId:'danbridge-d8877'},primitives:base.primitives}),/identity blocked/);
  const binders={...base.registry.binders};delete binders.atomicActivation;
  assert.throws(()=>createStagingV2AdminSupervisorSteps({registry:{...base.registry,binders},primitives:base.primitives}),/inventory blocked/);
  const methods={...base.registry.binders,atomicActivation:{scope:'fixed-atomicActivation',preflight:async()=>native('preflight'),execute:async()=>native('atomic')}};
  assert.throws(()=>createStagingV2AdminSupervisorSteps({registry:{...base.registry,binders:methods},primitives:base.primitives}),/method missing atomicActivation\.recover/);
  const writable={...base.primitives,readinessCheck:async()=>({capability:native('bad'),readCount:1,writeCount:1})},wired=createStagingV2AdminSupervisorSteps({registry:base.registry,primitives:writable});
  await assert.rejects(()=>wired.steps.READINESS_CHECK(ctx('READINESS_CHECK')),/primitive count blocked/);
  assert.throws(()=>createStagingV2AdminSupervisorSteps({registry:base.registry,primitives:{...base.primitives,extra:()=>{}}}),/fields invalid/);
});
