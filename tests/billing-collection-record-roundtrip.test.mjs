import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS,buildFullRecordShadowPlan,verifyFullRecordShadowReadback} from '../js/core/cloud-full-record-shadow.js';
import {projectProductionTeacherDb,projectProductionSchedulerDb,projectProductionBranchDb} from '../js/core/production-role-view-projection.js';

test('itemized collection metadata survives record serialization and is not exposed to teachers or schedulers',()=>{
 const db=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 db.students=[{id:'a',name:'孩子',branchIds:['hexi']},{id:'private-child',name:'他校孩子',branchIds:['art_museum']}];
 db.collectionRecords=[{id:'receipt',month:'2026-09',branchId:'hexi',studentIds:['a','private-child'],status:'collected',amount:1400,billingItemsVersion:1,billingItems:[{key:'visible-item',studentId:'a',branchId:'hexi',kind:'tuition',amount:600},{key:'other-item',studentId:'private-child',branchId:'art_museum',kind:'tuition',amount:800}]}];
 const plan=buildFullRecordShadowPlan({},db,{sourceHash:'test-only',environment:'production'});
 const documents=Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
 for(const operation of plan.operations)documents[operation.payload.collection].push({id:operation.payload.recordId,data:JSON.parse(JSON.stringify(operation.payload))});
 assert.equal(verifyFullRecordShadowReadback(documents,db,{environment:'production'}).verified,true);
 assert.deepEqual(projectProductionTeacherDb(db,'t').collectionRecords,[]);
 assert.deepEqual(projectProductionSchedulerDb(db).collectionRecords,[]);
 const branch=projectProductionBranchDb(db,['hexi']);
 assert.deepEqual(branch.collectionRecords[0].studentIds,['a']);
 assert.deepEqual(branch.collectionRecords[0].billingItems.map(item=>item.key),['visible-item']);
});
