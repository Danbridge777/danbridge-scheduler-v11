import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseProductionAccessMutationAdapter} from '../js/core/firebase-production-record-runtime-adapter.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('staging profile-only changes cannot reactivate stale financial or scope projections',()=>{
 const source=readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function assertStagingAccessProjectionUnchanged('),source.indexOf('async function companyUserRefs('));
 const guard=vm.runInNewContext(code+';assertStagingAccessProjectionUnchanged');
 const current={role:'branch_manager',teacherId:'t1',branchIds:['art_museum'],scheduleBranchIds:['art_museum','hexi'],hideFinancials:true,active:true};
 for(const patch of [{hideFinancials:false},{scheduleBranchIds:['art_museum']},{branchIds:['hexi']},{teacherId:'t2'},{role:'teacher'},{canManageSchedule:true}]){
  assert.throws(()=>guard(current,{...current,...patch}),/安全重建/);
  assert.throws(()=>guard({...current,active:false},{...current,...patch,active:false}),/安全重建/);
 }
 for(const patch of [{displayName:'New name'},{canMoveSchedule:true},{active:false},{scheduleBranchIds:['hexi','art_museum']}])assert.doesNotThrow(()=>guard(current,{...current,...patch}));
 assert.doesNotThrow(()=>guard(null,current));
 assert.doesNotThrow(()=>guard({role:'owner',displayName:'A'},{role:'owner',displayName:'B'}));
 const body=source.slice(source.indexOf('async function setCompanyAccessWithAudit('),source.indexOf('async function deleteCompanyAccessWithAudit('));
 assert.ok(body.indexOf('assertStagingAccessProjectionUnchanged(current,')<body.indexOf('transaction.set(accessRef,payload'));
});

function fixture(role='owner'){
 const current={role:'branch_manager',email:'aa@example.test',companyId:'danbridge',active:true,accessRevision:1,branchIds:['art_museum'],hideFinancials:true,canMoveSchedule:false,scheduleBranchIds:['art_museum','hexi']};
 const store=new Map([['companyAccess/aa@example.test',current]]);
 const adapter=createFirebaseProductionAccessMutationAdapter({role,actor:{uid:'actor',email:'owner@example.test'},serverTimestamp:()=>0,deleteField:()=>null,runTransaction:async fn=>{
  const writes=[];const result=await fn({get:async path=>store.get(path)||null,set:(path,data)=>writes.push([path,structuredClone(data)]),delete:()=>{throw Error('unexpected delete')}});
  for(const [path,data] of writes)store.set(path,data);return result;
 }});
 return {adapter,store,mutation:{action:'upsert',email:current.email,expectedRevision:1,payload:{role:'branch_manager',active:true,branchIds:['art_museum']}}};
}
test('old owner clients cannot silently remove new privacy capabilities; audit reflects effective payload',async()=>{
 const {adapter,store,mutation}=fixture();await adapter.mutate(mutation,'retain-capabilities');
 const access=store.get('companyAccess/aa@example.test');assert.equal(access.hideFinancials,true);assert.equal(access.canMoveSchedule,false);assert.deepEqual(access.scheduleBranchIds,['art_museum','hexi']);
 assert.equal(store.get('companyAudit/danbridge-retain-capabilities').afterHash,sha256Canonical({...mutation.payload,hideFinancials:true,canMoveSchedule:false,scheduleBranchIds:['art_museum','hexi']}));
});
test('only owner can alter capabilities; malformed flags are rejected without writes',async()=>{
 for(const role of ['branch_manager','teacher','revoked']){const {adapter,mutation,store}=fixture(role);await assert.rejects(()=>adapter.mutate(mutation,'deny'),/無效/);assert.equal(store.size,1)}
 for(const patch of [{hideFinancials:'false'},{canMoveSchedule:1},{scheduleBranchIds:['unknown']},{scheduleBranchIds:['hexi','hexi']}]){
  const {adapter,mutation,store}=fixture();await assert.rejects(()=>adapter.mutate({...mutation,payload:{...mutation.payload,...patch}},'invalid'),/布林|校區/);assert.equal(store.size,1);
 }
});
