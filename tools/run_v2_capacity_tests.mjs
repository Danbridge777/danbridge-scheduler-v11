import {spawnSync} from 'node:child_process';

const counts=[22_000,30_000];
const files=[
 'tests/cloud-record-sync-v1-raw-document-root.test.mjs',
 'tests/cloud-change-audit-reservation-snapshot.test.mjs',
 'tests/cloud-active-record-save-plan.test.mjs',
 'tests/cloud-local-mutation-collector.test.mjs',
 'tests/cloud-active-record-save-transaction.test.mjs',
 'tests/cloud-record-sync-v2-genesis-seed.test.mjs',
 'tests/sharded-sync-stress.test.mjs'
];

for(const count of counts){
 process.stdout.write(`\n=== Danbridge V2 capacity ${count} records ===\n`);
 const result=spawnSync(process.execPath,['--expose-gc','--test','--test-concurrency=1',...files],{cwd:process.cwd(),env:{...process.env,DANBRIDGE_V2_CAPACITY_COUNT:String(count)},stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`Danbridge V2 capacity ${count} failed with exit ${result.status??'signal'}`);
}
