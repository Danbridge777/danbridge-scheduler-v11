import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,FieldValue} from 'firebase-admin/firestore';
const {saveLessonReport}=createRequire(import.meta.url)('../functions/lesson-report-runtime.cjs');
test('real Firestore transaction: concurrent reports, replay and revocation',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:60000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(localhost|127\.0\.0\.1):\d+$/);
 const app=initializeApp({projectId:'demo-danbridge-report'},'report-emulator'),db=getFirestore(app),email='teacher-report@example.test',identity={uid:'teacher',email,emailVerified:true,appVerified:true},now=Date.now();
 try{
  await db.doc('companyAccess/'+email).set({active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-1'});
  await db.doc('companies/danbridge/lessonMeta/lesson-emulator').set({active:true,teacherIds:['teacher-1'],branchId:'art_museum',editableFrom:Timestamp.fromMillis(now-60000),editableUntil:Timestamp.fromMillis(now+60000)});
  const args={firestore:db,identity,serverTimestamp:()=>FieldValue.serverTimestamp(),now:()=>now},base={lessonId:'lesson-emulator',expectedUpdatedAt:'',report:{status:'completed',content:'fixture',homework:'',feedback:'',note:''}};
  const requests=[{...base,operationId:'emulator-a'},{...base,operationId:'emulator-b'}];
  const results=await Promise.allSettled(requests.map(input=>saveLessonReport({...args,input})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'aborted');
  const index=results.findIndex(r=>r.status==='fulfilled'),first=results[index].value;
  assert.equal((await saveLessonReport({...args,input:requests[index]})).duplicate,true);
  const second=await saveLessonReport({...args,input:{...base,operationId:'emulator-c',expectedUpdatedAt:first.report.updatedAtClient,report:{...base.report,content:'second'}}});
  assert.notEqual(second.report.updatedAtClient,first.report.updatedAtClient);
  assert.equal((await db.doc('companies/danbridge/lessonReports/lesson-emulator').get()).data().content,'second');
  await db.doc('companyAccess/'+email).update({active:false});
  await assert.rejects(saveLessonReport({...args,input:requests[index]}),{code:'permission-denied'});
 }finally{await deleteApp(app)}
});
