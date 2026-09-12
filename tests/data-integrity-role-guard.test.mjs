import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/core/data-integrity.js',import.meta.url),'utf8');

for(const profile of [null,{}, {role:'teacher'}, {role:'teacher',canManageSchedule:true}, {role:'branch_manager'}, {role:'unknown'}]){
 test(`data repair rejects non-owner before reading or mutating records: ${JSON.stringify(profile)}`,()=>{
  let snapshots=0,reads=0,writes=0;const alerts=[];
  const db=new Proxy({},{get(){reads++;throw Error('must not read records')}});
  const window={DanbridgeAccess:profile===null?undefined:{getContext:()=>profile},__danbridgeQueueCloudSave:()=>writes++};
  vm.runInNewContext(source,{window,db,snapshot:()=>snapshots++,alert:message=>alerts.push(message)});
  window.repairDataIntegrity();
  assert.equal(reads,0);assert.equal(snapshots,0);assert.equal(writes,0);assert.equal(alerts.length,1);
 });
}
test('owner retains the existing repair entry point',()=>{
 let snapshots=0;const marker=new Error('verified owner entry');
 const window={DanbridgeAccess:{getContext:()=>({role:'owner'})}};
 vm.runInNewContext(source,{window,snapshot:()=>{snapshots++;throw marker},alert:()=>{throw Error('owner was rejected')}});
 assert.throws(()=>window.repairDataIntegrity(),error=>error===marker);assert.equal(snapshots,1);
});
