import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoleViewChunks} from '../js/core/role-view-chunks.js';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {createPublishedRoleViewConsumer} from '../js/core/published-role-view-consumer.js';
const identity={kind:'scheduler',email:'scheduler@example.test',teacherId:'t1',branchIds:[]};
const db={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),lessons:[{id:'test',date:'2026-10-01'}]};
const built=buildRoleViewChunks(db,{identity,sourceRevision:1,sourceHash:'record-v1:'+'1'.repeat(64),stableRecords:true});
const head={roleChunkManifest:built.manifest,sourceRecordRevision:1,sourceRecordHash:built.manifest.sourceHash};
function harness(){
 let active=true,offline=false,partMissing=false,current=head,reads=0,next=0;
 const applied=[],states=[],timers=new Map();
 const consumer=createPublishedRoleViewConsumer({identity,isActive:()=>active,apply:value=>applied.push(value),onState:value=>states.push(value),readCurrentHead:async()=>{reads++;if(offline)throw Error('network-offline');return current},readPart:async id=>partMissing?null:built.chunks.find(p=>p.id===id),schedule:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id},cancel:id=>timers.delete(id)});
 return{consumer,applied,states,timers,get reads(){return reads},setHead:value=>current=value,offline:value=>offline=value,missing:value=>partMissing=value,revoke:()=>active=false,tick:async()=>{const[id,timer]=timers.entries().next().value;timers.delete(id);await timer.fn()}};
}
test('no marker leaves existing legacy listener entirely unchanged',async()=>{const h=harness();assert.equal(await h.consumer.receiveSnapshot({data:{db}}),false);assert.equal(h.reads,0);assert.equal(h.timers.size,0)});
test('cached marker never publishes cached data or starts network requests',async()=>{const h=harness();assert.equal(await h.consumer.receiveSnapshot({data:head,fromCache:true}),true);assert.equal(h.applied.length,0);assert.equal(h.reads,0);await h.consumer.receiveSnapshot({data:head});assert.deepEqual(h.applied,[db])});
test('unverified cached marker cannot force a current legacy server into chunk mode',async()=>{const h=harness();await h.consumer.receiveSnapshot({data:head,fromCache:true});assert.equal(await h.consumer.receiveSnapshot({data:{db}}),false);assert.equal(h.consumer.diagnostics().enabled,false)});
test('missing part retries latest server head without falling back to legacy',async()=>{const h=harness();h.missing(true);await h.consumer.receiveSnapshot({data:{...head,db}});assert.equal(h.applied.length,0);assert.equal(h.timers.size,1);h.missing(false);await h.tick();assert.deepEqual(h.applied,[db]);assert.equal(h.timers.size,0)});
test('offline retries back off with precise network error; recovery is automatic',async()=>{const h=harness();h.offline(true);await h.consumer.receiveSnapshot({data:head});assert.equal([...h.timers.values()][0].ms,500);await h.tick();assert.equal([...h.timers.values()][0].ms,1000);assert.equal(h.states.at(-1).error,'network-offline');h.offline(false);await h.tick();assert.deepEqual(h.applied,[db]);assert.equal(h.consumer.diagnostics().retries,0)});
for(const action of ['invalidate','revoke'])test(`${action} prevents scheduled retry from touching a new account`,async()=>{const h=harness();h.offline(true);await h.consumer.receiveSnapshot({data:head});if(action==='invalidate'){h.consumer.invalidate();assert.equal(h.timers.size,0)}else{h.revoke();await h.tick()}assert.equal(h.reads,1);assert.equal(h.applied.length,0)});
test('deleted or downgraded published head stays blocked',async()=>{const h=harness();await h.consumer.receiveSnapshot({data:head});await h.consumer.receiveSnapshot({exists:false});assert.equal(h.applied.length,1);assert.equal(h.states.at(-1).state,'blocked');h.setHead({db});await h.tick();assert.equal(h.applied.length,1);assert.match(h.states.at(-1).error,/downgrade/)});
