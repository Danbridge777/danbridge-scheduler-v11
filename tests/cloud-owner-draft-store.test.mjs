import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerDraftStore} from '../js/core/cloud-owner-draft-store.js';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {createActiveRecordPageController} from '../js/core/cloud-active-record-page-controller.js';
import {createOperationJournal} from '../js/core/cloud-operation-journal.js';
import {applyActiveRecordOperation} from '../js/core/cloud-active-record-sync.js';
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
const clone=structuredClone;
function storage(){let row=null,tail=Promise.resolve();return{load:async()=>clone(row),save:async value=>{row=clone(value)},exclusive:work=>{const next=tail.then(work);tail=next.catch(()=>{});return next}}}
const scope='production:daniel:device:epoch:tab-one';
const draft=()=>({environment:'production',activationEpoch:'epoch-test',mutationVersion:1,baselineDb:empty(),localDb:empty()});
test('draft is self-contained, scoped, serialized and refuses stale-window overwrites',async()=>{
 const db=storage(),first=createOwnerDraftStore({storage:db,scope}),second=createOwnerDraftStore({storage:db,scope});
 assert.equal(await first.load(),null);assert.equal(await second.load(),null);
 const value=draft();value.localDb.lessons=[{id:'a',room:'B'}];await first.save(value);
 await assert.rejects(second.save(draft()),/another window/);await assert.rejects(second.clear(),/another window/);
 assert.deepEqual(await first.load(),value);
 await assert.rejects(createOwnerDraftStore({storage:db,scope:'production:catherine:other'}).load(),/identity mismatch/);
 const reloaded=createOwnerDraftStore({storage:db,scope});assert.deepEqual(await reloaded.load(),value);await reloaded.clear();
 await assert.rejects(first.save(value),/another window/);assert.equal(await reloaded.load(),null);
});
function fixture(count=8){
 const initial=empty();initial.lessons=Array.from({length:count},(_,i)=>({id:`test-${i}`,room:'A',note:''}));initial.changes=[{at:'historic',type:'old'}];
 const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]]));
 for(const op of buildFullRecordShadowPlan(documents,initial,{sourceHash:'seed',environment:'production'}).operations)documents[op.payload.collection].push({id:op.payload.recordId,data:op.payload});
 const cloud=()=>rebuildFullRecordShadowDb(documents,{environment:'production'}).db;
 const send=async op=>{const rows=documents[op.collection],i=rows.findIndex(r=>r.id===op.recordId),result=applyActiveRecordOperation(i<0?null:rows[i].data,op);if(result.write){const row={id:op.recordId,data:clone(result.payload)};if(i<0)rows.push(row);else rows[i]=row}return result};
 let now=1000;const journalDb=storage(),draftDb=storage(),journal=createOperationJournal({storage:journalDb,now:()=>now});
 function app({backup=async()=>true,sender=send,store=draftDb}={}){
  let ui=clone(initial);const drafts=createOwnerDraftStore({storage:store,scope});
  const controller=createActiveRecordPageController({environment:'production',role:'owner',deviceId:'draft-test-device',journal,draftStore:drafts,readDocuments:async()=>clone(documents),send:sender,persistConflicts:async()=>({id:'conflict-test'}),getLocalDb:()=>ui,applyCloudDb:async db=>{ui=clone(db)},ensureCloudBackup:backup,setTimer:()=>1,clearTimer:()=>{},saveDelay:0,trustCommittedPlan:true});
  return{controller,drafts,get ui(){return clone(ui)},edit(room,action){ui.lessons.forEach(row=>{row.room=room;ui.changes.unshift({at:`${action}-${row.id}`,type:action})});controller.queueLocalSave({changedCollections:['lessons','changes']})},accept:()=>controller.acceptCloudSnapshot({db:cloud(),activationEpoch:'epoch-test',writeAllowed:true})};
 }
 return{initial,cloud,send,journal,draftDb,app,advance:()=>{now+=60000}};
}
for(const count of [1,8,20])test(`${count} lessons: backup failure before journal survives reload and preserves complete history`,async()=>{
 const f=fixture(count),a=f.app({backup:async()=>{throw Error('backup unavailable')}});await a.accept();a.edit('B','move');a.edit('A','undo');a.edit('C','next');
 const expected=a.ui;assert.equal((await a.controller.flush()).state,'blocked');assert.equal((await f.journal.list()).length,0);
 a.controller.stop();const b=f.app();await b.accept();assert.deepEqual(b.ui,expected);await b.controller.resume();
 assert.equal((await b.controller.flush()).state,'complete');assert.deepEqual(f.cloud(),expected);assert.equal(await b.drafts.load(),null);
});
test('draft quota failure blocks every network send and does not claim confirmation',async()=>{
 const f=fixture(8),db=storage();let sends=0;const a=f.app({store:{...db,save:async()=>{throw Error('QuotaExceededError')}},sender:async op=>{sends++;return f.send(op)}});await a.accept();a.edit('B','move');
 assert.equal((await a.controller.flush()).state,'blocked');assert.equal(sends,0);assert.deepEqual(f.cloud(),f.initial);assert.equal(a.ui.lessons[0].room,'B');
});
test('receipt in flight plus undo survives reload without resurrecting the committed move',async()=>{
 const f=fixture(8);let first=true,a;
 a=f.app({sender:async op=>{const receipt=await f.send(op);if(first){first=false;a.edit('A','undo');throw Error('receipt lost')}return receipt}});
 await a.accept();a.edit('B','move');const expected=a.ui;
 await a.controller.flush();const afterUndo=a.ui;assert.equal(afterUndo.lessons[0].room,'A');a.controller.stop();
 const b=f.app();await b.accept();await b.controller.resume();
 // Retry the original idempotent journal, then commit the newer local undo.
 for(let n=0;n<5&&b.controller.diagnostics().dirty;n++){f.advance();await b.controller.flush()}
 assert.deepEqual(f.cloud().lessons,afterUndo.lessons);assert.deepEqual(f.cloud().changes,afterUndo.changes);assert.notDeepEqual(f.cloud(),expected);
});
for(const committed of [false,true])test(`retryable lost receipt (committed=${committed}) plus newer undo restores correct intent`,async()=>{
 const f=fixture(20);let first=true,a;
 a=f.app({sender:async op=>{if(first){first=false;if(committed)await f.send(op);a.edit('A','undo');throw Object.assign(Error('network timeout'),{code:'unavailable'})}return f.send(op)}});
 await a.accept();a.edit('B','move');await a.controller.flush();const expected=a.ui;
 assert.equal((await f.journal.counts()).failed,1);a.controller.stop();const b=f.app();await b.accept();await b.controller.resume();
 for(let n=0;n<5&&b.controller.diagnostics().dirty;n++){f.advance();await b.controller.flush()}
 assert.equal(b.controller.diagnostics().dirty,false);assert.deepEqual(f.cloud(),expected);assert.equal(await b.drafts.load(),null);
});
