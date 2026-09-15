import test from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,query,setDoc,updateDoc,where} from 'firebase/firestore';
import {readExactProductionRulesForEmulator} from './helpers/current-production-rules.mjs';
import assert from 'node:assert/strict';
test('exact published Rules allow assigned single reports, but collection queries remain denied',{skip:!process.env.DANBRIDGE_PRODUCTION_RULES_SHA256,timeout:60000},async()=>{
 const rules=await readExactProductionRulesForEmulator(),env=await initializeTestEnvironment({projectId:'demo-danbridge-report-scope',firestore:{rules}}),email='report-scope@example.test',base='companies/danbridge/lessonReports';
 try{
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'companyAccess/'+email),{active:true,role:'teacher',companyId:'danbridge',teacherId:'teacher-1'});await setDoc(doc(db,base+'/own'),{companyId:'danbridge',lessonId:'own',reportedForTeacherIds:['teacher-1'],branchId:'a'});await setDoc(doc(db,base+'/foreign'),{companyId:'danbridge',lessonId:'foreign',reportedForTeacherIds:['teacher-2'],branchId:'b'})});
  const db=env.authenticatedContext('teacher',{email}).firestore(),reports=collection(db,base),own=query(reports,where('reportedForTeacherIds','array-contains-any',['teacher-1']));
  assert.equal((await assertSucceeds(getDoc(doc(db,base+'/own')))).exists(),true);
  console.log('OWN_REPORT_GET_PASSED');
  await assertFails(getDocs(own));await assertFails(getDocs(reports));await assertFails(getDocs(query(reports,where('reportedForTeacherIds','array-contains','teacher-2'))));await assertFails(getDoc(doc(db,base+'/foreign')));
  await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'companyAccess/'+email),{active:false}));await assertFails(getDocs(own));await assertFails(getDoc(doc(db,base+'/own')));
 }finally{await env.cleanup()}
});
