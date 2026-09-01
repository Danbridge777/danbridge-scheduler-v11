import test from 'node:test';
import assert from 'node:assert/strict';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildRoleRecordViewPlan} from '../js/core/cloud-role-record-view.js';
import {createRoleRecordStream} from '../js/core/cloud-role-record-stream.js';

const PER_TEACHER=Number(process.env.DANBRIDGE_THREE_TEACHER_COUNT??300);
if(!Number.isSafeInteger(PER_TEACHER)||PER_TEACHER<1||PER_TEACHER>5000)throw new Error('DANBRIDGE_THREE_TEACHER_COUNT must be between 1 and 5000');
const epoch='three-teacher-extreme-epoch';
const empty=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const documents=()=>Object.fromEntries(FULL_RECORD_COLLECTIONS.map(key=>[key,[]]));
const clone=value=>structuredClone(value);
const auditRecord=payload=>({...payload,updatedAt:{seconds:1},updatedBy:'owner-extreme',updatedByEmail:'owner@example.com'});
const auditControl=control=>({...control,persistedAt:{seconds:1},persistedBy:'owner-extreme',persistedByEmail:'owner@example.com'});
const safety={schema:'danbridge-record-sync-safety-control-v1',environment:'staging',companyId:'danbridge',activationEpoch:epoch,state:'active',revision:1,lastEventId:'activation:three-teacher-extreme',lastEventHash:'a'.repeat(64),readAllowed:true,writeAllowed:true,updatedAt:'2026-09-01T12:00:00+08:00'};
const sourceHash=revision=>`record-v1:${String(revision).repeat(64)}`;
const identity=index=>({email:`teacher-${index}@example.com`,kind:'teacher',teacherId:`teacher-${index}`,branchIds:[]});
function target(index){const db=empty();db.teachers=[{id:`teacher-${index}`,name:`Teacher ${index}`}];db.students=Array.from({length:PER_TEACHER},(_,row)=>({id:`student-${index}-${row}`,name:`Student ${index}-${row}`}));db.lessons=Array.from({length:PER_TEACHER},(_,row)=>({id:`lesson-${index}-${row}`,studentId:`student-${index}-${row}`,teacherId:`teacher-${index}`,teacherIds:[`teacher-${index}`],room:'A'}));if(index<3)db.lessons.push({id:'shared-1-2',studentId:`student-${index}-0`,teacherId:'teacher-1',teacherIds:['teacher-1','teacher-2'],room:'Shared A'});return db}
function apply(plan,current){for(const operation of plan.operations){const rows=current[operation.collection],index=rows.findIndex(row=>row.id===operation.recordId),row={id:operation.recordId,data:auditRecord(operation.payload)};if(index<0)rows.push(row);else rows[index]=row}return current}
function makePlan(current,db,id,revision,currentControl=null){return buildRoleRecordViewPlan(current,db,{environment:'staging',identity:id,activationEpoch:epoch,sourceRecordHash:sourceHash(revision),publishId:`publish-three-${revision}-${id.teacherId}`,publishedAt:`2026-09-01T12:0${revision}:00+08:00`,batchSize:400,currentControl})}
async function loadStream(id,current,control,events){const stream=createRoleRecordStream({environment:'staging',identity:id,onApply:snapshot=>events.push(snapshot)});await stream.setSafetyControl(safety);await stream.setControl(auditControl(control));for(const collection of [...FULL_RECORD_COLLECTIONS].reverse())await stream.replaceCollection(collection,current[collection]);assert.equal(events.length,1);return stream}

test(`三位老師同時同步每人 ${PER_TEACHER} 位學生與課程，單筆更新只影響正確兩個檢視`,async()=>{
 const fixtures=[1,2,3].map(index=>{const id=identity(index),db=target(index),current=documents(),plan=makePlan(current,db,id,1);apply(plan,current);return{id,db,current,plan,events:[]}});
 const streams=await Promise.all(fixtures.map(row=>loadStream(row.id,row.current,row.plan.control,row.events)));
 for(const [offset,row] of fixtures.entries()){
  assert.equal(row.events[0].db.students.length,PER_TEACHER);
  assert.equal(row.events[0].db.lessons.length,PER_TEACHER+(offset<2?1:0));
  assert.deepEqual(row.events[0].db.teachers.map(item=>item.id),[row.id.teacherId]);
  assert.equal(row.events[0].db.lessons.some(item=>String(item.teacherId).endsWith(String((offset+1)%3+1))&&!item.teacherIds.includes(row.id.teacherId)),false);
 }
 const next=fixtures.map(row=>clone(row.db));for(const index of [0,1])next[index].lessons.find(row=>row.id==='shared-1-2').room='Shared B';
 const updates=fixtures.map((row,index)=>makePlan(row.current,next[index],row.id,2,row.plan.control));
 assert.equal(updates[0].writes,1);assert.equal(updates[1].writes,1);assert.equal(updates[2].writes,0);
 for(let index=0;index<fixtures.length;index++){
  const row=fixtures[index],update=updates[index],stream=streams[index];
  for(const operation of update.operations){apply({operations:[operation]},row.current);const result=await stream.applyChanges(operation.collection,[{type:'modified',id:operation.recordId,data:row.current[operation.collection].find(item=>item.id===operation.recordId).data}]);assert.equal(result.ready,false);assert.equal(row.events.length,1)}
  await stream.setControl(auditControl(update.control));assert.equal(row.events.length,2);
 }
 assert.equal(fixtures[0].events.at(-1).db.lessons.find(row=>row.id==='shared-1-2').room,'Shared B');
 assert.equal(fixtures[1].events.at(-1).db.lessons.find(row=>row.id==='shared-1-2').room,'Shared B');
 assert.equal(fixtures[2].events.at(-1).db.lessons.some(row=>row.id==='shared-1-2'),false);
 assert.equal(new Set(fixtures.map(row=>row.events.at(-1).viewKey)).size,3);
 assert.ok(fixtures.every((row,index)=>row.events.at(-1).db.lessons.every(lesson=>lesson.teacherIds.includes(`teacher-${index+1}`))));
});
