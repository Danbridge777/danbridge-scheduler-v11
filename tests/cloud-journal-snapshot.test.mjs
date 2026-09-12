import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationJournal} from '../js/core/cloud-operation-journal.js';
import {enqueueOperationPlan,runOperationWorker} from '../js/core/cloud-operation-worker.js';
const operation=id=>({schema:'danbridge-live-record-operation-v1',operationId:id,collection:'lessons',recordId:id,nextRevision:1});
function store(){let rows=null,reads=0,writes=0,lock=Promise.resolve();return{storage:{load:async()=>{reads++;return structuredClone(rows)},save:async value=>{writes++;rows=structuredClone(value)},exclusive:work=>{const next=lock.then(work,work);lock=next.catch(()=>{});return next}},stats:()=>({reads,writes})}}
test('append and snapshot each read once, report coherent counts and detach returned rows',async()=>{
 const s=store(),a=createOperationJournal({storage:s.storage}),b=createOperationJournal({storage:s.storage});
 const first=await a.appendManyWithCounts([operation('a')]);assert.equal(first.counts.pending,1);assert.deepEqual(s.stats(),{reads:1,writes:1});
 first.entries[0].operation.recordId='not-saved';const snap=await a.snapshot();assert.deepEqual(s.stats(),{reads:2,writes:1});assert.equal(snap.rows[0].operation.recordId,'a');
 await b.append(operation('b'));const next=await a.snapshot();assert.equal(next.counts.pending,2);assert.equal(snap.counts.pending,1);assert.equal(snap.rows.length,1);
 snap.rows[0].status='confirmed';assert.equal((await a.snapshot()).counts.confirmed,0);
});
test('append-with-counts never succeeds before durable storage or after storage failure',async()=>{
 let release,entered;const writing=new Promise(resolve=>entered=resolve);let completed=false;
 const journal=createOperationJournal({storage:{load:async()=>[],save:async()=>{entered();await new Promise(resolve=>release=resolve)}}});
 const pending=journal.appendManyWithCounts([operation('a')]).then(value=>{completed=true;return value});await writing;assert.equal(completed,false);release();assert.equal((await pending).counts.pending,1);
 const failed=createOperationJournal({storage:{load:async()=>[],save:async()=>{throw Error('disk-full')}}});await assert.rejects(failed.appendManyWithCounts([operation('b')]),/disk-full/);
});
test('modern enqueue and worker final status do not reopen storage just for duplicate counts/list',async()=>{
 const s=store(),journal=createOperationJournal({storage:s.storage});
 const wrapped={...journal,counts:async()=>{throw Error('unexpected extra counts read')},list:async()=>{throw Error('unexpected extra list read')}};
 const queued=await enqueueOperationPlan(wrapped,{schema:'danbridge-live-operation-plan-v1',operations:[operation('a')],operationCount:1});assert.equal(queued.counts.pending,1);assert.equal(s.stats().reads,1);
 const result=await runOperationWorker({journal:wrapped,send:async()=>({kind:'create',write:true,revision:1})});assert.equal(result.state,'complete');assert.equal(result.counts.confirmed,1);assert.equal(result.head,null);
});
test('modern append still refuses divergent IDs atomically and old storage-only journal APIs work',async()=>{
 const s=store(),journal=createOperationJournal({storage:s.storage});await journal.append(operation('a'));const before=s.stats().writes;
 await assert.rejects(journal.appendManyWithCounts([operation('b'),{...operation('a'),recordId:'changed'}]),/內容衝突/);assert.equal(s.stats().writes,before);assert.equal((await journal.snapshot()).counts.total,1);
 const legacy={...journal};delete legacy.appendManyWithCounts;delete legacy.snapshot;
 const queued=await enqueueOperationPlan(legacy,{schema:'danbridge-live-operation-plan-v1',operations:[operation('b')],operationCount:1});assert.equal(queued.counts.pending,2);
 const result=await runOperationWorker({journal:legacy,send:async()=>({kind:'create',write:true,revision:1})});assert.equal(result.state,'complete');assert.equal(result.counts.confirmed,2);
});
