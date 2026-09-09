import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildProductionRoleViews,projectProductionSchedulerDb,projectProductionBranchDb} from '../js/core/production-role-view-projection.js';
import {normalizeProductionSchedulerRequest,SCHEDULER_OPERATION_SCHEMA,assertProductionSchedulerActor} from '../js/core/production-scheduler-operation.js';

// Owner/scheduler bootstrap emails already form part of the deployed policy.
// Other identities are fixtures: never publish personal account lookup output.
const daniel='a0965487920@gmail.com',catherine='catherine-fixture@example.com',lucas='lucas-fixture@example.com',aa='aa0966626336@gmail.com';
const source={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(k=>[k,[]])),branches:[{id:'art_museum',name:'美術東四路'},{id:'hexi',name:'河西一路'}],
 students:[{id:'art-child',name:'同名孩子',parent:'家長甲',rate:600,branchIds:['art_museum']},{id:'hexi-child',name:'同名孩子',parent:'家長乙',rate:900,branchIds:['hexi']}],
 teachers:[{id:'art-teacher',name:'Art',rate:700,assignedBranchIds:['art_museum']},{id:'hexi-teacher',name:'Hexi',rate:800,assignedBranchIds:['hexi']}],
 lessons:['art','hexi'].map(key=>({id:key+'-lesson',studentId:key+'-child',teacherId:key+'-teacher',date:'2026-10-01',start:'10:00',end:'11:00',branchId:key==='art'?'art_museum':'hexi',paymentStatus:'paid',studentHourlyRate:999,teacherHourlyRate:777})),
 fixedExpenses:[{id:'art-expense',branchId:'art_museum',amount:500},{id:'hexi-expense',branchId:'hexi',amount:900}],
 collectionRecords:[{id:'art-bill',branchId:'art_museum',studentIds:['art-child'],billingItems:[{studentId:'art-child',branchId:'art_museum',amount:600}]},{id:'hexi-bill',branchId:'hexi',studentIds:['hexi-child'],billingItems:[{studentId:'hexi-child',branchId:'hexi',amount:900}]}]};
const members=[{email:catherine,role:'owner',active:true,companyId:'danbridge'},{email:lucas,role:'branch_manager',teacherId:'art-teacher',branchIds:['art_museum'],readOnly:true,active:true,companyId:'danbridge'},{email:aa,role:'teacher',teacherId:'aa-teacher',canManageSchedule:true,active:true,companyId:'danbridge'}];

test('Catherine／Lucas／AA：校區投影與排課最小資料不混入其他校區或費用',()=>{
 const original=structuredClone(source),views=buildProductionRoleViews(source,members),branch=views.find(v=>v.email===lucas),schedule=views.find(v=>v.email===aa);
 assert.equal(views.some(v=>v.email===catherine),false,'Owner uses the full authorized source, not a restricted copy');
 assert.deepEqual(branch.branchIds,['art_museum']);assert.deepEqual(branch.db.lessons.map(l=>l.id),['art-lesson']);
 for(const collection of ['students','teachers','fixedExpenses','collectionRecords'])assert.ok(branch.db[collection].every(r=>r.id.startsWith('art-')));
 assert.deepEqual(schedule.db.lessons.map(l=>l.id),['art-lesson','hexi-lesson']);
 for(const collection of ['fixedExpenses','collectionRecords','settlementRecords','oneTimeExpenses'])assert.deepEqual(schedule.db[collection],[]);
 for(const record of [...schedule.db.students,...schedule.db.teachers,...schedule.db.lessons])for(const field of ['parent','rate','paymentStatus','studentHourlyRate','teacherHourlyRate'])assert.equal(record[field],undefined,field+' must not be sent to AA');
 assert.deepEqual(source,original);
 for(const member of members.filter(m=>m.email!==aa))assert.throws(()=>assertProductionSchedulerActor({...member,uid:'fixture-uid'}));
});

test('保留目前 30 筆安全上限，拒絕超限、重複 ID 或費用欄位注入',()=>{
 const changes=Array.from({length:30},(_,i)=>({lessonId:'boundary-'+i,before:null,after:{id:'boundary-'+i,studentId:'art-child',teacherId:'art-teacher',date:new Date(Date.UTC(2027,0,i+1)).toISOString().slice(0,10),start:'10:00',end:'11:00',branchId:'art_museum'}}));
 const request={schema:SCHEDULER_OPERATION_SCHEMA,requestId:'batch-boundary-test',release:'20.26.266',changes};assert.equal(normalizeProductionSchedulerRequest(request).changes.length,30);
 assert.throws(()=>normalizeProductionSchedulerRequest({...request,changes:[...changes,changes[0]]}));
 assert.throws(()=>normalizeProductionSchedulerRequest({...request,changes:[changes[0],changes[0]]}));
 assert.throws(()=>normalizeProductionSchedulerRequest({...request,changes:[{...changes[0],after:{...changes[0].after,teacherHourlyRate:1}}]}));
});

test('正式 Rules 實跑：Daniel／Catherine 全資料、Lucas 僅自身校區檢視、AA 僅排課檢視', {skip:!process.env.DANBRIDGE_PRODUCTION_RULES_FILE,timeout:120000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const rules=readFileSync(process.env.DANBRIDGE_PRODUCTION_RULES_FILE,'utf8');assert.equal(createHash('sha256').update(rules).digest('hex'),process.env.DANBRIDGE_PRODUCTION_RULES_SHA256);
 const env=await initializeTestEnvironment({projectId:'danbridge-four-account-test',firestore:{rules}}),base='companies/danbridge';
 try{
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();for(const member of members)await setDoc(doc(db,'companyAccess/'+member.email),{...member,...(member.email===lucas?{scopedDb:projectProductionBranchDb(source,['art_museum'])}:{})});
   await setDoc(doc(db,base+'/data/main'),source);await setDoc(doc(db,base+'/schedulerViews/'+aa),{email:aa,db:projectProductionSchedulerDb(source)});
   await setDoc(doc(db,'productionFullRecordShadows/danbridge/collections/lessons/records/private-fixture'),{privateValue:true});
  });
  const dbs=Object.fromEntries([daniel,catherine,lucas,aa].map((email,i)=>[email,env.authenticatedContext('account-'+i,{email}).firestore()]));
  for(const email of [daniel,catherine])assert.equal((await assertSucceeds(getDoc(doc(dbs[email],base+'/data/main')))).data().lessons.length,2);
  for(const email of [lucas,aa]){
   await assertFails(getDoc(doc(dbs[email],base+'/data/main')));
   await assertFails(getDoc(doc(dbs[email],'productionFullRecordShadows/danbridge/collections/lessons/records/private-fixture')));
   await assertFails(getDoc(doc(dbs[email],'companyAccess/'+catherine)));
   await assertFails(updateDoc(doc(dbs[email],'companyAccess/'+email),{role:'owner'}));
  }
  const scoped=(await assertSucceeds(getDoc(doc(dbs[lucas],'companyAccess/'+lucas)))).data().scopedDb;assert.deepEqual(scoped.lessons.map(l=>l.id),['art-lesson']);
  await assertFails(getDoc(doc(dbs[lucas],base+'/schedulerViews/'+aa)));
  await assertSucceeds(getDoc(doc(dbs[aa],base+'/schedulerViews/'+aa)));
  await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'companyAccess/'+aa),{canManageSchedule:false}));
  await assertFails(getDoc(doc(dbs[aa],base+'/schedulerViews/'+aa)));
 }finally{await env.cleanup()}
});
