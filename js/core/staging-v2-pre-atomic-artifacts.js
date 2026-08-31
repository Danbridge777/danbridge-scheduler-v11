import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {sha256Canonical} from './cloud-immutable-migration-backup.js';
import {stagingV2RulesetHash} from './firebase-staging-v2-rules-attestation.js';
import {RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES} from './cloud-record-sync-v2-deployment-gate-contract.js';

export const STAGING_V2_PRE_ATOMIC_ARTIFACTS_SCOPE='fixed-source-inventory-and-stable-request-manifest-v1';

const PROJECT_ID='danbridge-d8877-staging',SERVICE_ACCOUNT='danbridge-staging-v2@danbridge-d8877-staging.iam.gserviceaccount.com';
const INVENTORIES=Object.freeze({
 runtimePolicy:Object.freeze(['firebase/firestore.rules.deploy','js/core/cloud-record-sync-v2-deployment-gate-contract.js','js/core/staging-v2-activation-supervisor.js']),
 runtimeAdapter:Object.freeze(['js/core/firebase-staging-v2-readiness-adapter.js','js/core/firebase-staging-v2-rules-attestation.js','js/core/staging-v2-admin-binder-registry.js','js/core/staging-v2-admin-supervisor-steps.js','js/core/staging-v2-admin-supervisor-primitives.js']),
 clientWiring:Object.freeze(['js/core/firebase-auth-and-cloud-sync.module.js','js/core/staging-v2-active-record-browser-bridge.js','js/core/staging-v2-authority-save-browser-client.js']),
});
const GATE_FILES=Object.freeze({
 'trusted-deployment-receipt':Object.freeze(['.github/workflows/staging-v2-pre-atomic.yml','.github/workflows/staging-v2-atomic.yml','tools/run_staging_v2_pre_atomic.mjs','tools/run_staging_v2_atomic.mjs','js/core/staging-v2-pre-atomic-artifacts.js','js/core/staging-v2-atomic-artifacts.js','js/core/firebase-staging-v2-service-account-boundary.js','js/core/firebase-record-sync-v2-deployment-gate-source-attestation-adapter.js']),
 'dual-mode-rules-emulator':Object.freeze(['firebase/firestore.rules.deploy','tests/firestore-rules.test.mjs','tests/firestore-rules-access-budget-regression.test.mjs']),
 'v1-permanent-fence':Object.freeze(['firebase/firestore.rules.deploy','js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js','tests/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.test.mjs']),
 'resume-race':Object.freeze(['js/core/firebase-staging-v2-readiness-adapter.js','js/core/firebase-record-sync-v1-v2-hard-pause-adapter.js','tests/firebase-staging-v2-readiness-adapter.test.mjs']),
 'atomic-cutover':Object.freeze(['js/core/cloud-record-sync-v2-atomic-activation-transition-v2.js','js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js','tests/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.test.mjs']),
 'runtime-no-fallback':Object.freeze(['js/core/firebase-staging-v2-cloud-runtime-boundary.js','js/core/staging-v2-authority-save-cloud-runtime.js','tests/firebase-staging-v2-cloud-runtime-boundary.test.mjs','tests/staging-v2-authority-save-cloud-runtime.test.mjs']),
});

const digest=value=>createHash('sha256').update(value).digest('hex');
function inventory(root,files,label){return sha256Canonical({schema:'danbridge-staging-v2-source-inventory-v1',label,files:files.map(path=>({path,sha256:digest(readFileSync(resolve(root,path)))}))})}

export function buildStagingV2PreAtomicArtifacts({root,runId,firestoreRulesDeployAllowed}={}){
 if(typeof root!=='string'||typeof runId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(runId)||typeof firestoreRulesDeployAllowed!=='boolean')throw new Error('staging V2 pre-atomic artifact input blocked');
 const rulesSource=readFileSync(resolve(root,'firebase/firestore.rules.deploy'),'utf8'),rulesetHash=stagingV2RulesetHash(rulesSource);
 const runtimePolicyHash=inventory(root,INVENTORIES.runtimePolicy,'runtime-policy'),runtimeAdapterHash=inventory(root,INVENTORIES.runtimeAdapter,'runtime-adapter'),clientWiringHash=inventory(root,INVENTORIES.clientWiring,'client-wiring');
 const gateSourceHashes=Object.fromEntries(Object.entries(GATE_FILES).map(([gateId,files])=>[gateId,RECORD_SYNC_V2_TRUSTED_DEPLOYMENT_GATE_TYPES[gateId]+':'+inventory(root,files,'gate:'+gateId)]));
 const requestHash=sha256Canonical({schema:'danbridge-staging-v2-pre-atomic-stable-request-v1',projectId:PROJECT_ID,serviceAccountEmail:SERVICE_ACCOUNT,rulesetHash,runtimePolicyHash,runtimeAdapterHash,clientWiringHash,gateSourceHashes});
 const body={schema:'danbridge-staging-v2-activation-supervisor-manifest-v1',runId,requestHash,environment:'staging',companyId:'danbridge',projectId:PROJECT_ID,serviceAccountEmail:SERVICE_ACCOUNT,rulesetHash,runtimePolicyHash,runtimeAdapterHash,clientWiringHash,firestoreRulesDeployAllowed,hostingDeployAllowed:false,productionAllowed:false,timeMachineAllowed:false,atomicActivationAllowed:false};
 return Object.freeze({scope:STAGING_V2_PRE_ATOMIC_ARTIFACTS_SCOPE,rulesSource,gateSourceHashes:Object.freeze(gateSourceHashes),manifest:Object.freeze({...body,manifestHash:sha256Canonical(body)})});
}
