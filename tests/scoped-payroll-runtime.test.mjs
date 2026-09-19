import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {calculateScopedPayroll}=require('../functions/scoped-payroll-calculator.cjs');
const {readScopedPayroll,authorizeScope}=require('../functions/scoped-payroll-runtime.cjs');
const identity=email=>({uid:email,email,emailVerified:true,appVerified:true});
const manager={companyId:'danbridge',role:'branch_manager',active:true,canViewBranchFinance:true,branchIds:['art_museum']};
const fixed={id:'f',name:'Fixed',payrollMode:'fixed',baseSalary:44000,overtimeRate:500,deductionRate:0,minWeeklyHours:40,workDays:[1,2,3,4,5]};
const lesson=(id,billingBranchId)=>({id,billingBranchId,branchId:'hexi',teacherId:'f',date:'2026-09-01',start:'09:00',end:'10:00'});
const db={teachers:[fixed],students:[],lessons:[lesson('a','art_museum'),lesson('b','art_museum'),lesson('c','hexi'),{...lesson('d','unassigned'),branchId:'unassigned'}]};
const leaves=[{id:'private-leave',companyId:'danbridge',teacherId:'f',date:'2026-09-07',start:'09:00',end:'17:00',leaveType:'personal',status:'approved',note:'PRIVATE_REASON'}];
test('complete monthly salary uses hidden denominator and leave, exposes only scoped results',()=>{
 const rows=calculateScopedPayroll({db,leaves,month:'2026-09',scope:'art_museum'});
 assert.equal(rows[0].payroll.amount,21000);assert.equal(rows[0].payroll.leaveDeduction,1000);
 assert.deepEqual(rows[0].lessonIds,['a','b']);assert.equal(rows[0].count,2);
 const serialized=JSON.stringify(rows);for(const value of ['PRIVATE_REASON','private-leave','fullPayroll','fullAmount','44000','teacherLeaveRecords'])assert.ok(!serialized.includes(value),value);
 const all=['art_museum','hexi','unassigned'].flatMap(scope=>calculateScopedPayroll({db,leaves,month:'2026-09',scope}));
 assert.equal(all.reduce((sum,row)=>sum+row.payroll.amount,0),42000);
 assert.equal(rows[0].weeks.reduce((sum,w)=>sum+w.actual,0),2);
});
test('cent remainders reconcile for many lesson-count distributions, never multiply a group by its children',()=>{
 for(let count=1;count<=37;count++){
  const source={students:[{id:'g',courseType:'團班',isGroupRoster:true,groupMemberIds:['a','b','c']}],teachers:[{...fixed,baseSalary:12345.67,minWeeklyHours:0,overtimeRate:0}],lessons:Array.from({length:count},(_,i)=>({...lesson('l'+i,['art_museum','hexi','unassigned'][i%3]),studentId:'g',groupStudentIds:['a','b','c'],teacherIds:['f']}))};
  const results=['art_museum','hexi','unassigned'].flatMap(scope=>calculateScopedPayroll({db:source,leaves:[],month:'2026-09',scope}));
  assert.equal(Math.round(results.reduce((n,r)=>n+r.payroll.amount,0)*100),1234567,'cent total '+count);
  assert.equal(results.reduce((n,r)=>n+r.count,0),count,'one group = one lesson');
 }
});
test('hourly historical student/group rates count once, exclude pay=no, and do not follow classroom location',()=>{
 const source={teachers:[{id:'f',type:'兼職',payrollMode:'hourly',rate:500}],students:[{id:'g',courseType:'團班',isGroupRoster:true,partTimeTeacherRate:600}],lessons:[{...lesson('group','art_museum'),studentId:'g',teacherIds:['f'],groupStudentIds:['a','b'],end:'10:30'},{...lesson('unpaid','art_museum'),studentId:'g',payTeacher:'no'}]};
 const [row]=calculateScopedPayroll({db:source,leaves:[],month:'2026-09',scope:'art_museum'});assert.equal(row.payroll.amount,900);assert.equal(row.payroll.paidHours,1.5);
 assert.deepEqual(calculateScopedPayroll({db:source,leaves:[],month:'2026-09',scope:'hexi'}),[]);
});
test('Daniel remains Owner, Catherine Owner passes, AA/Lucas cannot select another campus, teacher denied',()=>{
 authorizeScope(identity('a0965487920@gmail.com'),null,'hexi');
 authorizeScope(identity('catherine@example.test'),{role:'owner',active:true,companyId:'danbridge'},'hexi');
 for(const email of ['aa@example.test','lucas@example.test']){
  authorizeScope(identity(email),manager,'art_museum');
  assert.throws(()=>authorizeScope(identity(email),manager,'hexi'),{code:'permission-denied'});
  assert.throws(()=>authorizeScope(identity(email),{...manager,canViewBranchFinance:false},'art_museum'),{code:'permission-denied'});
 }
 assert.throws(()=>authorizeScope(identity('teacher@example.test'),{active:true,companyId:'danbridge',role:'teacher'},'art_museum'),{code:'permission-denied'});
 assert.throws(()=>authorizeScope({...identity('aa@example.test'),appVerified:false},manager,'art_museum'),{code:'unauthenticated'});
 assert.throws(()=>authorizeScope(identity('aa@example.test'),{...manager,active:false},'art_museum'),{code:'permission-denied'});
});
function fakeFirestore(documents){
 const reads=[],snap=(path)=>({id:path.split('/').at(-1),exists:documents.has(path),data:()=>documents.get(path)});
 const ref=(path,filters=[],cap=Infinity)=>({path,filters,cap,where:(...f)=>ref(path,[...filters,f],cap),limit:n=>ref(path,filters,n)});
 const field=(obj,key)=>key.split('.').reduce((v,k)=>v?.[k],obj);
 const get=async r=>{
  reads.push(r.path);
  if(!r.filters)return snap(r.path);
  const docs=[...documents].filter(([path,value])=>path.startsWith(r.path+'/')&&!path.slice(r.path.length+1).includes('/')&&r.filters.every(([key,op,right])=>{const left=field(value,key);return op==='=='?left===right:op==='>='?left>=right:left<=right})).slice(0,r.cap).map(([p])=>snap(p));
  return {docs};
 };
 return {reads,doc:path=>({path}),collection:path=>ref(path),runTransaction:async(callback,options)=>{assert.equal(options.readOnly,true);return callback({get,getAll:(...refs)=>Promise.all(refs.map(get))})}};
}
function fixture(environment='production'){
 const epoch='test-epoch-366',documents=new Map([['companyAccess/aa@example.test',manager],['companies/danbridge/productionRecordRuntime/safety',{state:'active',readAllowed:true,recordDataHash:'record-v1:test'}],['stagingRecordSyncV1PermanentFences/danbridge',{projectId:'danbridge-d8877-staging',companyId:'danbridge',state:'permanently-fenced-after-atomic-v2-structural-activation',targetV2Epoch:epoch}],[`stagingActiveRecordV2Heads/danbridge/epochs/${epoch}`,{headHash:'staging-head'}]]);
 const base=environment==='production'?'productionFullRecordShadows/danbridge':`stagingActiveRecordV2Baselines/danbridge/epochs/${epoch}`;
 for(const [collection,rows] of Object.entries(db))for(const record of rows)documents.set(`${base}/collections/${collection}/records/${record.id}`,{companyId:'danbridge',collection,recordId:record.id,environment,activationEpoch:environment==='staging'?epoch:undefined,record,deleted:false});
 leaves.forEach(l=>documents.set('productionTeacherLeaveRecords/'+l.id,l));
 return {documents,epoch};
}
test('read-only runtime uses fresh authoritative access and source; no supplied teacher or business records accepted',async()=>{
 const {documents}=fixture(),firestore=fakeFirestore(documents),args={firestore,identity:identity('aa@example.test'),input:{month:'2026-09',scope:'art_museum'},environment:'production'};
 const result=await readScopedPayroll(args);assert.equal(result.rows[0].payroll.amount,21000);
 await assert.rejects(()=>readScopedPayroll({...args,input:{...args.input,scope:'hexi'}}),{code:'permission-denied'});
 await assert.rejects(()=>readScopedPayroll({...args,input:{...args.input,teacherId:'foreign'}}),{code:'invalid-argument'});
 documents.set('companyAccess/aa@example.test',{...manager,active:false});
 await assert.rejects(()=>readScopedPayroll(args),{code:'permission-denied'});
});
test('staging moved/deleted daily record overrides baseline even outside date range',async()=>{
 const {documents,epoch}=fixture('staging'),path=`stagingActiveRecordV2Records/danbridge/epochs/${epoch}/collections/lessons/records/d`;
 documents.set(path,{companyId:'danbridge',collection:'lessons',recordId:'d',environment:'staging',activationEpoch:epoch,record:{...db.lessons[3],date:'2026-10-01'},deleted:false});
 const result=await readScopedPayroll({firestore:fakeFirestore(documents),identity:identity('aa@example.test'),input:{month:'2026-09',scope:'art_museum'},environment:'staging'});
 assert.equal(result.rows[0].payroll.amount,28000);
 documents.get(path).deleted=true;documents.get(path).record=null;
 const deleted=await readScopedPayroll({firestore:fakeFirestore(documents),identity:identity('aa@example.test'),input:{month:'2026-09',scope:'art_museum'},environment:'staging'});
 assert.equal(deleted.rows[0].payroll.amount,28000);
});
