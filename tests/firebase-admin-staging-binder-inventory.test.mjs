import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {FIREBASE_ADMIN_STAGING_BINDER_INVENTORY as inventory} from '../js/core/firebase-admin-staging-binder-inventory.js';
import {executeTrustedStagingD0,STAGING_ADMIN_FACTORY_ALLOWLIST} from '../js/core/firebase-admin-staging-credential-factory-contract.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const expected=[
 ['js/core/firebase-active-record-authority-save-v2-adapter.js','createFirebaseActiveRecordAuthoritySaveV2AdminBinder'],
 ['js/core/firebase-record-sync-v2-activation-cutover-intent-v2-adapter.js','createFirebaseRecordSyncV2ActivationCutoverIntentV2AdminBinder'],
 ['js/core/firebase-record-sync-v2-atomic-activation-transition-v2-adapter.js','createFirebaseRecordSyncV2AtomicActivationV2AdminBinder'],
 ['js/core/firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2ChangeReservationAuthorityAuditReceiptAdminBinder'],
 ['js/core/firebase-record-sync-v2-change-reservation-registration-adapter.js','createFirebaseRecordSyncV2ChangeReservationRegistrationBinder'],
 ['js/core/firebase-record-sync-v2-deployment-gate-source-attestation-adapter.js','createFirebaseRecordSyncV2DeploymentGateSourceAttestationAdminBinder'],
 ['js/core/firebase-record-sync-v2-genesis-authority-admin-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAdminBinder'],
 ['js/core/firebase-record-sync-v2-genesis-authority-audit-receipt-adapter.js','createFirebaseRecordSyncV2GenesisAuthorityAuditReceiptAdminBinder'],
 ['js/core/firebase-record-sync-v2-genesis-identity-index-adapter.js','createFirebaseRecordSyncV2GenesisIdentityIndexAdminBinder'],
 ['js/core/firebase-record-sync-v2-genesis-seed-readback-admin-adapter.js','createFirebaseRecordSyncV2GenesisSeedReadbackAdminBinder'],
 ['js/core/firebase-record-sync-v2-takeover-candidate-v2-adapter.js','createFirebaseRecordSyncV2TakeoverCandidateV2AdminBinder'],
 ['js/core/firebase-record-sync-v2-trusted-deployment-evidence-v2-adapter.js','createFirebaseRecordSyncV2TrustedDeploymentEvidenceV2AdminBinder']
];
test('inventory is the exact frozen 12-binder Admin/native set',()=>{
 assert.equal(inventory.length,12);assert.deepEqual(inventory.map(({file,exportName})=>[file,exportName]),expected);
 assert.equal(new Set(inventory.map(item=>item.file)).size,12);assert.equal(new Set(inventory.map(item=>item.exportName)).size,12);assert.ok(Object.isFrozen(inventory));
 for(const item of inventory){assert.ok(Object.isFrozen(item));assert.deepEqual(Reflect.ownKeys(item),['file','exportName','kind','emulatorProjectId','productionBlocked']);assert.equal(item.kind,'firebase-admin-native');assert.equal(item.emulatorProjectId,'danbridge-rules-test');assert.equal(item.productionBlocked,true)}
 assert.ok(inventory.some(item=>item.exportName==='createFirebaseRecordSyncV2ChangeReservationRegistrationBinder'));
 assert.ok(!inventory.some(item=>item.file==='js/core/firebase-record-sync-v2-genesis-seed-readback-adapter.js'));
});
test('each inventoried source retains its native Admin import and emulator-only production blocker',async()=>{
 for(const {file,exportName} of inventory){const source=await readFile(resolve(ROOT,file),'utf8');assert.match(source,new RegExp(`export function ${exportName}\\s*\\(`),`${file} export`);assert.match(source,/(?:from ['"]firebase-admin\/firestore['"]|import\(['"]firebase-admin\/firestore['"]\))/,`${file} Admin import`);assert.match(source,/danbridge-rules-test/,`${file} emulator project`);assert.match(source,/FIRESTORE_EMULATOR_HOST/,`${file} emulator host`)}
});
test('inventory module is pure and exposes no staging capability',async()=>{
 const source=await readFile(resolve(ROOT,'js/core/firebase-admin-staging-binder-inventory.js'),'utf8');for(const forbidden of [/\bimport\s*(?:\(|[^;]*\bfrom\b)/,/google-auth/,/process\.env/,/globalThis\.process/,/node:fs/,/node:child_process/,/\bfetch\s*\(/,/XMLHttpRequest/,/initializeApp/,/getFirestore/,/\bcredential\b/,/\bcallback\b/])assert.doesNotMatch(source,forbidden);assert.equal(STAGING_ADMIN_FACTORY_ALLOWLIST.length,0);
});
test('D0 remains fail-closed before nested values or capabilities can be read',()=>{
 let reads=0;const hidden=()=>{reads+=1;throw new Error('must not read')};const input={environment:'staging',projectId:'danbridge-d8877-staging'};Object.defineProperty(input,'iamReceipt',{enumerable:true,get:hidden});Object.defineProperty(input,'expectedD0',{enumerable:true,get:hidden});assert.throws(()=>executeTrustedStagingD0(input),/accessor blocked/);assert.equal(reads,0);
 for(const extra of ['callback','app','firestore','credential','token']){const attempt={environment:'staging',projectId:'danbridge-d8877-staging',iamReceipt:null,expectedD0:null};Object.defineProperty(attempt,extra,{enumerable:true,get:hidden});assert.throws(()=>executeTrustedStagingD0(attempt),/fields blocked/);assert.equal(reads,0)}
});
