import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';

// Opt-in: load the exact source read from the production Rules release into a
// localhost emulator. Never run these fixture writes against a remote database.
test('正式已部署 Rules：角色隔離且通知／回報／排課／錯誤均禁止瀏覽器直寫',{
 skip:!process.env.DANBRIDGE_PRODUCTION_RULES_FILE,timeout:120000
},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const source=readFileSync(process.env.DANBRIDGE_PRODUCTION_RULES_FILE,'utf8');
 assert.match(process.env.DANBRIDGE_PRODUCTION_RULES_SHA256||'',/^[a-f0-9]{64}$/);
 assert.equal(createHash('sha256').update(source).digest('hex'),process.env.DANBRIDGE_PRODUCTION_RULES_SHA256);
 const env=await initializeTestEnvironment({projectId:'danbridge-rules-test',firestore:{rules:source}});
 const owner='a0965487920@gmail.com',aa='aa0966626336@gmail.com',teacher='teacher-fixture@example.com',other='other-fixture@example.com';
 try{
  await env.clearFirestore();
  const base='companies/danbridge';
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   const rows=[
    [`companyAccess/${aa}`,{active:true,companyId:'danbridge',role:'teacher',teacherId:'aa',canManageSchedule:true}],
    [`companyAccess/${teacher}`,{active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-1'}],
    [`companyAccess/${other}`,{active:true,companyId:'danbridge',role:'teacher',teacherId:'teacher-2'}],
    [`${base}/data/main`,{privateValue:'owner-only'}],
    [`${base}/teacherViews/${teacher}`,{teacherId:'teacher-1',lessons:[]}],
    [`${base}/teacherViews/${other}`,{teacherId:'teacher-2',lessons:[]}],
    [`${base}/schedulerViews/${aa}`,{email:aa,db:{lessons:[],students:[],teachers:[]}}],
    [`${base}/scheduleNotifications/own`,{recipientEmail:teacher,read:false}],
    [`${base}/scheduleNotifications/other`,{recipientEmail:other,read:false}],
    [`${base}/scheduleRequests/own`,{companyId:'danbridge',actorEmail:aa,status:'pending'}],
    [`${base}/lessonReports/own`,{companyId:'danbridge',lessonId:'own',reportedForTeacherIds:['teacher-1'],branchId:'a',content:'fixture'}],
    [`${base}/errorEvents/own`,{category:'cloud-read',role:'teacher'}]
   ];
   for(const [path,data] of rows)await setDoc(doc(db,path),data);
  });
  const ownerDb=env.authenticatedContext('owner', {email:owner}).firestore();
  const aaDb=env.authenticatedContext('aa',{email:aa}).firestore();
  const teacherDb=env.authenticatedContext('teacher',{email:teacher}).firestore();
  const otherDb=env.authenticatedContext('other',{email:other}).firestore();
  const anon=env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(ownerDb,`${base}/data/main`)));
  for(const db of [aaDb,teacherDb,otherDb,anon])await assertFails(getDoc(doc(db,`${base}/data/main`)));
  await assertSucceeds(getDoc(doc(aaDb,`${base}/schedulerViews/${aa}`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/schedulerViews/${aa}`)));
  await assertSucceeds(getDoc(doc(teacherDb,`${base}/teacherViews/${teacher}`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/teacherViews/${other}`)));
  await assertSucceeds(getDoc(doc(teacherDb,`${base}/lessonReports/own`)));
  await assertFails(getDoc(doc(otherDb,`${base}/lessonReports/own`)));
  await assertSucceeds(getDoc(doc(aaDb,`${base}/scheduleRequests/own`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/scheduleRequests/own`)));
  const ownNotices=await assertSucceeds(getDocs(query(collection(teacherDb,`${base}/scheduleNotifications`),where('recipientEmail','==',teacher))));
  assert.equal(ownNotices.size,1);
  await assertFails(getDocs(collection(teacherDb,`${base}/scheduleNotifications`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/scheduleNotifications/other`)));
  await assertSucceeds(getDoc(doc(ownerDb,`${base}/errorEvents/own`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/errorEvents/own`)));
  for(const db of [ownerDb,aaDb,teacherDb,otherDb,anon]){
   for(const name of ['scheduleNotifications','scheduleRequests','lessonReports','errorEvents']){
    await assertFails(setDoc(doc(db,`${base}/${name}/forged`),{companyId:'danbridge',recipientEmail:teacher}));
    await assertFails(updateDoc(doc(db,`${base}/${name}/own`),{read:true}));
    await assertFails(deleteDoc(doc(db,`${base}/${name}/own`)));
   }
  }
  await env.withSecurityRulesDisabled(async context=>updateDoc(doc(context.firestore(),`companyAccess/${teacher}`),{active:false}));
  await assertFails(getDoc(doc(teacherDb,`${base}/teacherViews/${teacher}`)));
  await assertFails(getDoc(doc(teacherDb,`${base}/scheduleNotifications/own`)));
 }finally{await env.cleanup();}
});
