import {spawnSync} from 'node:child_process';

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST){
 console.error('Firestore Rules + V2 binder integration requires both Firestore and Auth Emulator hosts.');
 process.exit(1);
}
// The deployed maintenance artifacts are deliberately phase-scoped. Running
// the legacy application-wide Rules suite after pause would assert that normal
// writes remain open and therefore manufacture false failures. Exercise pause
// first, then let the end-to-end binder test load proof/genesis/reservation in
// the exact cumulative order used by the one-shot supervisor.
const pause=spawnSync(process.execPath,[
 '--test','--test-concurrency=1','tests/firebase-record-sync-v1-v2-hard-pause-adapter.test.mjs'
],{
 cwd:process.cwd(),
 env:{...process.env,DANBRIDGE_REQUIRE_V2_BINDER_EMULATOR:'1'},
 encoding:'utf8',
 stdio:'inherit'
});
if(pause.error){console.error(pause.error.message);process.exit(1)}
if((pause.status??1)!==0)process.exit(pause.status??1);
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/firebase-record-sync-v1-post-pause-scan-adapter.test.mjs'],{
 cwd:process.cwd(),env:{...process.env,DANBRIDGE_REQUIRE_V2_BINDER_EMULATOR:'1'},encoding:'utf8',stdio:'inherit'
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
if((reservations.status??1)!==0)process.exit(reservations.status??1);
const reset=spawnSync(process.execPath,['tools/build_firestore_rules_deploy.mjs','--phase=pause'],{
 cwd:process.cwd(),env:process.env,encoding:'utf8',stdio:'inherit'
});
if(reset.error){console.error(reset.error.message);process.exit(1)}
process.exit(reset.status??1);
