import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,rebuildFullRecordShadowDb} from '../js/core/cloud-full-record-shadow.js';
import {recordDataHash} from '../js/core/cloud-record-data-hash.js';
import {applyActiveRecordOperation,prepareActiveRecordSync} from '../js/core/cloud-active-record-sync.js';
import {createOperationJournal} from '../js/core/cloud-operation-journal.js';
import {createActiveRecordPageController} from '../js/core/cloud-active-record-page-controller.js';

const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
for(const count of [1,8,20])test(`${count} lessons preserve immediate undo/redo behind a delayed receipt`,async()=>{
 const initial=empty();initial.lessons=Array.from({length:count},(_,i)=>({id:`lesson-${i}`,room:'A'}));initial.changes=[{id:'historic',type:'original'}];
 const documents=empty();for(const operation of buildFullRecordShadowPlan(documents,initial,{sourceHash:'seed',environment:'production'}).operations){documents[operation.payload.collection].push({id:operation.payload.recordId,data:structuredClone(operation.payload)})}
 let ui=structuredClone(initial),saved=null,injected=false;
 const journal=createOperationJournal({storage:{load:async()=>structuredClone(saved),save:async value=>{saved=structuredClone(value)}},now:()=>1000});
 const cloud=()=>rebuildFullRecordShadowDb(documents,{environment:'production'});
 const edit=(room,action)=>{for(const row of ui.lessons){row.room=room;ui.changes.unshift({id:`${action}-${row.id}`,type:action})}controller.queueLocalSave({changedCollections:['lessons','changes']})};
 const controller=createActiveRecordPageController({environment:'production',role:'owner',deviceId:'history-order-test',journal,
  readDocuments:async()=>structuredClone(documents),send:async operation=>{
   if(!injected){injected=true;edit('A','undo');edit('B','redo');edit('A','undo-again')}
   const rows=documents[operation.collection],index=rows.findIndex(row=>row.id===operation.recordId),result=applyActiveRecordOperation(index<0?null:rows[index].data,operation);
   if(result.write){const row={id:operation.recordId,data:structuredClone(result.payload)};if(index<0)rows.push(row);else rows[index]=row}return result;
  },persistConflicts:async()=>({backupId:'verified-test'}),getLocalDb:()=>ui,applyCloudDb:async next=>{ui=structuredClone(next)},
  trustCommittedPlan:true,setTimer:()=>1,clearTimer:()=>{},saveDelay:0,
 });
 const start=cloud();await controller.acceptCloudSnapshot({...start,hash:recordDataHash(start.db),documents:structuredClone(documents),activationEpoch:'history-order-epoch',writeAllowed:true});
 edit('B','move');assert.equal((await controller.flush()).state,'pending');
 const expected=structuredClone(ui.changes);assert.equal(expected.length,count*4+1);assert.equal(expected.at(-1).id,'historic');
 assert.equal((await controller.flush()).state,'complete');assert.deepEqual(cloud().db.changes,expected);assert.ok(cloud().db.lessons.every(row=>row.room==='A'));
 edit('C','next-move');assert.equal((await controller.flush()).state,'complete');assert.equal(cloud().db.changes.length,count*5+1);
 // The hotfix must not weaken the immutable-history guard.
 const remote=cloud(),tampered=structuredClone(remote.db);tampered.changes.at(-1).type='changed';
 assert.throws(()=>prepareActiveRecordSync({documentsByCollection:documents,baselineDb:remote.db,localDb:tampered,environment:'production',deviceId:'history-tamper-test',activationEpoch:'history-order-epoch',authoritativeSourceHash:recordDataHash(remote.db)}),/舊歷史遭到改寫/);
 controller.stop();
});
