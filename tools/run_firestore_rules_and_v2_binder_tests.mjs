import {spawnSync} from 'node:child_process';

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST){
 console.error('Firestore Rules + V2 binder integration requires both Firestore and Auth Emulator hosts.');
 process.exit(1);
}
const result=spawnSync(process.execPath,[
 '--test','--test-concurrency=1',
 'tests/firestore-rules.test.mjs',
 'tests/cloud-record-sync-v2-genesis-seed.test.mjs',
 'tests/firebase-record-sync-v2-neutral-cutover-helpers.test.mjs',
 'tests/firebase-record-sync-v2-deployment-gate-source-attestation-adapter.test.mjs',
 'tests/firebase-record-sync-v2-genesis-seed-plan-adapter.test.mjs',
 'tests/firebase-record-sync-v2-genesis-seed-batch-adapter.test.mjs',
 'tests/firebase-record-sync-v2-genesis-seed-readback-adapter.test.mjs',
 'tests/firebase-record-sync-v2-change-reservation-authority-v2-adapter.test.mjs',
 'tests/firebase-record-sync-v2-change-reservation-authority-audit-receipt-adapter.test.mjs',
 'tests/firebase-record-sync-v1-v2-hard-pause-adapter.test.mjs',
 'tests/firebase-record-sync-v1-post-pause-scan-adapter.test.mjs'
],{
 cwd:process.cwd(),
 env:{...process.env,DANBRIDGE_REQUIRE_V2_BINDER_EMULATOR:'1'},
 encoding:'utf8',
 stdio:'inherit'
});
if(result.error){console.error(result.error.message);process.exit(1)}
if((result.status??1)!==0)process.exit(result.status??1);
// Empty is a distinct native authority path: G1 has no batch completion to
// consume, but G2/G3 must still require fresh proof/G0/M/R and exact brands.
const empty=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/firebase-record-sync-v1-post-pause-scan-adapter.test.mjs'],{
 cwd:process.cwd(),env:{...process.env,DANBRIDGE_REQUIRE_V2_BINDER_EMULATOR:'1',DANBRIDGE_G1_PROBE_COUNT:'0'},encoding:'utf8',stdio:'inherit'
});
if(empty.error){console.error(empty.error.message);process.exit(1)}
if((empty.status??1)!==0)process.exit(empty.status??1);
// Qv2 must also prove dense multi-batch inventory and child tamper/race checks;
// three reservations deterministically exercise the 2+1 R1 batch split.
const reservations=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/firebase-record-sync-v1-post-pause-scan-adapter.test.mjs'],{
 cwd:process.cwd(),env:{...process.env,DANBRIDGE_REQUIRE_V2_BINDER_EMULATOR:'1',DANBRIDGE_G1_PROBE_COUNT:'0',DANBRIDGE_R1_PROBE_COUNT:'3'},encoding:'utf8',stdio:'inherit'
});
if(reservations.error){console.error(reservations.error.message);process.exit(1)}
process.exit(reservations.status??1);
