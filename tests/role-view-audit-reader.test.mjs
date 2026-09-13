import test from 'node:test';
import assert from 'node:assert/strict';
import {readRoleViewForAudit} from '../js/core/role-view-audit-reader.js';
import {buildRoleViewChunks} from '../js/core/role-view-chunks.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
for(const kind of ['teacher','scheduler','branch_manager']){
 const identity={kind,email:'audit@example.test',teacherId:'t1',branchIds:kind==='branch_manager'?['b1']:[]},db=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,k==='lessons'?[{id:'l1',date:'2026-09-13'}]:[]])),sourceHash='record-v1:'+'a'.repeat(64);
 const built=buildRoleViewChunks(db,{identity,sourceRevision:2,sourceHash,stableRecords:true}),head={roleChunkManifest:built.manifest},args={head,identity,expectedSourceHash:sourceHash,readPart:async id=>built.chunks.find(p=>p.id===id),readCurrentHead:async()=>head};
 test(kind+' compact audit reads exact data without legacy copy',async()=>assert.deepEqual(await readRoleViewForAudit(args),db));
 test(kind+' audit rejects source, scope, missing part and concurrent head changes',async()=>{
  await assert.rejects(readRoleViewForAudit({...args,expectedSourceHash:'record-v1:'+'b'.repeat(64)}));
  await assert.rejects(readRoleViewForAudit({...args,identity:{...identity,email:'other@example.test'}}));
  await assert.rejects(readRoleViewForAudit({...args,readPart:async()=>null}));
  await assert.rejects(readRoleViewForAudit({...args,readCurrentHead:async()=>({...head,active:false})}));
 });
 test(kind+' legacy audit remains compatible only without a published marker',async()=>{
  const key=kind==='branch_manager'?'scopedDb':'db';
  assert.deepEqual(await readRoleViewForAudit({...args,head:{[key]:db}}),db);
  await assert.rejects(readRoleViewForAudit({...args,head:{[key]:db,roleChunkManifest:null}}));
 });
}
