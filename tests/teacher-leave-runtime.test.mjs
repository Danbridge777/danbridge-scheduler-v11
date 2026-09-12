import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
const {executeTeacherLeave,readTeacherLeaves}=createRequire(import.meta.url)('../functions/teacher-leave-runtime.cjs');
const emails=['a0965487920@gmail.com','catherine890202@gmail.com','aa0966626336@gmail.com','yamiiii8549@gmail.com'];
const teacherId='teacher_fixture',otherTeacherId='other_teacher_fixture';
const profiles=emails.map((email,i)=>({email,active:true,companyId:'danbridge',role:i<2?'owner':'teacher',teacherId:i===2?otherTeacherId:i===3?teacherId:'',canManageSchedule:i===2,displayName:['Daniel','Catherine','AA','張毅'][i]}));
const identity=i=>({email:emails[i],uid:'fixture_uid_'+i});
const req=(suffix,patch={})=>({action:'create',operationId:'operation_'+suffix,leaveId:'leave_id_'+suffix,expectedRevision:0,input:{teacherId,leaveType:'personal',date:'2026-09-13',start:'09:00',end:'10:30',note:'isolated acceptance'},...patch});
function memory(){
 const rows=new Map();
 const doc=path=>({path});
 const collection=(path,filters=[])=>({path,filters,where:(key,op,value)=>{assert.equal(op,'==');return collection(path,[...filters,[key,value]])}});
 const snap=(path,value)=>({id:path.split('/').at(-1),exists:value!==undefined,data:()=>structuredClone(value)});
 const db={doc,collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>{assert.equal(writes.length,0,'reads must precede all writes');if(ref.filters)return{docs:[...rows].filter(([path,row])=>path.startsWith(ref.path+'/')&&!path.slice(ref.path.length+1).includes('/')&&ref.filters.every(([k,v])=>row[k]===v)).map(([path,row])=>snap(path,row))};return snap(ref.path,rows.get(ref.path))},set:(ref,value)=>writes.push([ref.path,value])});for(const [path,value]of writes)rows.set(path,structuredClone(value));return result}};
 for(const row of profiles)rows.set('companyAccess/'+row.email,structuredClone(row));
 for(const id of [teacherId,otherTeacherId])rows.set('productionFullRecordShadows/danbridge/collections/teachers/records/'+id,{recordId:id,deleted:false,record:{id,name:id}});
 return{db,rows};
}
for(let i=0;i<4;i++)test('leave transaction: '+profiles[i].displayName+' create/update/cancel and four distinct recipients',async()=>{
 const{db,rows}=memory(),request=req('actor'+i),call=r=>executeTeacherLeave({firestore:db,identity:identity(i),request:r,serverTimestamp:()=>123});
 assert.equal((await call(request)).record.hours,1.5);
 assert.equal((await call(request)).duplicate,true);
 const notices=[...rows].filter(([p])=>p.includes('/scheduleNotifications/')).map(([,r])=>r);
 assert.deepEqual(notices.map(r=>r.recipientEmail).sort(),[...emails].sort());assert.equal(notices.length,4);
 assert.equal((await call({...request,operationId:'update_actor_'+i,action:'update',expectedRevision:1,input:{...request.input,end:'11:00'}})).record.hours,2);
 assert.equal((await call({...request,operationId:'cancel_actor_'+i,action:'cancel',expectedRevision:2})).record.status,'cancelled');
 assert.equal(rows.get('productionTeacherLeaveRecords/'+request.leaveId).revision,3);
});
test('transaction rechecks revoked access, forged receipt and foreign teacher; rejection is atomic',async()=>{
 const{db,rows}=memory(),request=req('guard'),call=(r,i=3)=>executeTeacherLeave({firestore:db,identity:identity(i),request:r,serverTimestamp:()=>123});
 await call(request);let before=JSON.stringify([...rows]);
 await assert.rejects(call(request,1),/identity/);assert.equal(JSON.stringify([...rows]),before);
 await assert.rejects(call(req('foreign',{input:{...request.input,teacherId:otherTeacherId}})),/自己的/);assert.equal(JSON.stringify([...rows]),before);
 await assert.rejects(call({...request,action:'update',operationId:'wrong_revision',expectedRevision:9}),/其他人更新/);assert.equal(JSON.stringify([...rows]),before);
 rows.get('companyAccess/'+emails[3]).active=false;before=JSON.stringify([...rows]);
 await assert.rejects(call(request),/未授權/);assert.equal(JSON.stringify([...rows]),before);
});
test('read scope: owners/AA see all, teacher sees own only, revoked/branch/foreign company denied',async()=>{
 const{db,rows}=memory();
 for(const [n,t]of [['own',teacherId],['other',otherTeacherId]])await executeTeacherLeave({firestore:db,identity:identity(0),request:req(n,{input:{...req(n).input,teacherId:t}}),serverTimestamp:()=>123});
 for(let i=0;i<4;i++)assert.equal((await readTeacherLeaves({firestore:db,identity:identity(i)})).length,i===3?1:2);
 for(const patch of [{active:false},{role:'branch_manager'},{companyId:'other'}]){rows.set('companyAccess/'+emails[3],{...profiles[3],...patch});await assert.rejects(readTeacherLeaves({firestore:db,identity:identity(3)}))}
});
test('native Firestore: all reads precede atomic writes; duplicate creates once; revoked replay denied',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:60000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(localhost|127\.0\.0\.1):\d+$/);
 const db=new Firestore({projectId:'demo-leave-319'});
 try{
  for(const p of profiles)await db.doc('companyAccess/'+p.email).set(p);
  await db.doc('productionFullRecordShadows/danbridge/collections/teachers/records/'+teacherId).set({recordId:teacherId,deleted:false,record:{id:teacherId,name:'Test teacher'}});
  const request=req('native_'+Date.now()),call=()=>executeTeacherLeave({firestore:db,identity:identity(3),request,serverTimestamp:()=>FieldValue.serverTimestamp()});
  const results=await Promise.all([call(),call()]);assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.equal((await db.collection('companies/danbridge/scheduleNotifications').where('notificationType','==','teacher-leave').get()).size,4);
  await db.doc('companyAccess/'+emails[3]).update({active:false});await assert.rejects(call());
 }finally{await db.terminate()}
});
