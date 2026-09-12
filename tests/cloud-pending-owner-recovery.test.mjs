import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan} from '../js/core/cloud-full-record-shadow.js';
import {prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {recoverPendingOwnerIntent} from '../js/core/cloud-pending-owner-recovery.js';
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const options={environment:'production',activationEpoch:'epoch-recovery'};
function pending(before,after){
 const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 for(const row of buildFullRecordShadowPlan(documents,before,{sourceHash:'seed',environment:'production'}).operations)documents[row.payload.collection].push({id:row.payload.recordId,data:row.payload});
 return prepareActiveRecordSync({documentsByCollection:documents,baselineDb:before,localDb:after,deviceId:'recovery-test',...options}).operations.map(operation=>({status:'pending',operation}));
}
test('journal recovery preserves update, deletion and append-only identical history entries',()=>{
 const before=empty();before.lessons=[{id:'a',room:'A'},{id:'b',room:'B'}];before.changes=[{message:'same'}];
 const after=structuredClone(before);after.lessons=[{id:'a',room:'C'}];after.changes.unshift({message:'same'});
 const rows=pending(before,after),saved=JSON.stringify(rows),recovered=recoverPendingOwnerIntent(rows,before,options);
 assert.deepEqual(recovered.localDb,after);assert.deepEqual(recovered.baselineDb,before);assert.equal(JSON.stringify(rows),saved);
 assert.deepEqual(recoverPendingOwnerIntent(rows,after,options).localDb,after);
 assert.equal(recoverPendingOwnerIntent(rows.map(row=>({...row,status:'confirmed'})),before,options),null);
 for(const field of ['environment','activationEpoch','companyId']){const bad=structuredClone(rows);bad[0].operation[field]='wrong';assert.throws(()=>recoverPendingOwnerIntent(bad,before,options),/mismatch/)}
});
const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const start=source.indexOf('function restoreOwnerSyncRecovery()'),end=source.indexOf('let cloudStatusHideTimer',start);
test('Owner recovery verifies raw cache despite loadDB defaults and retains unmatched evidence',()=>{
 const raw={lessons:[{id:'a'}]},normalized={lessons:[{id:'a',room:''}]},saved={hash:JSON.stringify(raw),mutationVersion:3,baseDb:{lessons:[]}},items=new Map([['marker',JSON.stringify(saved)],['cache',JSON.stringify(raw)]]);
 const context=vm.createContext({cloudRole:'owner',OWNER_SYNC_RECOVERY_KEY:'marker',localStorage:{getItem:key=>items.get(key)},localRoleCacheKey:()=> 'cache',window:{__danbridgeGetDB:()=>normalized},dataHash:JSON.stringify,deepCopy:structuredClone,localDirtyHash:'',localMutationVersion:0,ownerRecoveryBaseDB:null,ownerUploadQueued:false,clearOwnerSyncRecovery:()=>{throw Error('must preserve evidence')}});
 vm.runInContext(source.slice(start,end),context);assert.equal(vm.runInContext('restoreOwnerSyncRecovery()',context),true);assert.equal(context.localDirtyHash,JSON.stringify(normalized));assert.equal(context.localMutationVersion,3);
 items.set('cache','{}');saved.hash='unmatched';items.set('marker',JSON.stringify(saved));assert.equal(vm.runInContext('restoreOwnerSyncRecovery()',context),false);assert.equal(JSON.parse(items.get('marker')).hash,'unmatched');
});
