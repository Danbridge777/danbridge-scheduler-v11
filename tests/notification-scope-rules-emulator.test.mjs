import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc} from 'firebase/firestore';
import {scheduleNotificationReadFilters} from '../js/core/schedule-notification-read-scope.js';
const folder=process.env.NOTIFICATION_RULES_ARTIFACT;
test('prepared staging Rules enforce notification role, teacher and full branch scope',{skip:!folder,timeout:90000},async()=>{
 assert.match(folder,/^\/private\/tmp\/danbridge-318-notification-rules-[A-Za-z0-9]+$/);
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1):\d+$/);
 const evidence=JSON.parse(await readFile(folder+'/evidence.json','utf8')),rules=await readFile(folder+'/candidate.rules','utf8');
 assert.equal(evidence.project,'danbridge-d8877-staging');assert.equal(createHash('sha256').update(rules).digest('hex'),evidence.candidateSha256);
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-danbridge-notice-scope',firestore:{host,port:Number(port),rules}});
 const email='aa0966626336@gmail.com',root='companies/danbridge/scheduleNotifications';let checks=0;
 const profiles=[{role:'owner'},{role:'teacher',canManageSchedule:true,teacherId:'current'},{role:'teacher',teacherId:'current'},{role:'branch_manager',teacherId:'current',branchIds:['art_museum']}];
 const rows=[['owner',{recipientRole:'owner'}],['scheduler',{recipientRole:'scheduler'}],['teacher',{recipientRole:'teacher',teacherId:'current'}],['old-teacher',{recipientRole:'teacher',teacherId:'old'}],['museum',{recipientRole:'branch_manager',branchIds:['art_museum']}],['hexi',{recipientRole:'branch_manager',branchIds:['hexi']}],['wide',{recipientRole:'branch_manager',branchIds:['art_museum','hexi']}],['legacy',{}]];
 try{
  await env.withSecurityRulesDisabled(async c=>{for(const[id,row]of rows)await setDoc(doc(c.firestore(),root,id),{companyId:'danbridge',recipientEmail:email,read:false,...row});await setDoc(doc(c.firestore(),root,'foreign'),{recipientEmail:'other@example.test',recipientRole:'scheduler'});});
  for(let index=0;index<profiles.length;index++){
   const profile={companyId:'danbridge',active:true,email,...profiles[index]};
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'companyAccess',email),profile));
   const db=env.authenticatedContext('fixture-aa',{email,email_verified:true}).firestore();
   const constraints=scheduleNotificationReadFilters(profile).map(args=>where(...args));
   const result=await assertSucceeds(getDocs(query(collection(db,root),...constraints)));checks++;
   const expected=index===0?rows.map(([id])=>id):[[null],['scheduler'],['teacher'],['museum']][index];
   assert.deepEqual(result.docs.map(row=>row.id).sort(),expected.sort());checks++;
   if(index){
    await assertFails(getDocs(query(collection(db,root),where('recipientEmail','==',email))));checks++;
    await assertFails(getDoc(doc(db,root,'foreign')));checks++;
    for(const[id]of rows){await (expected.includes(id)?assertSucceeds:assertFails)(getDoc(doc(db,root,id)));checks++;}
    await assertFails(updateDoc(doc(db,root,expected[0]),{recipientRole:'owner'}));checks++;
   }
  }
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyAccess',email),{active:false}));
  const db=env.authenticatedContext('fixture-aa',{email,email_verified:true}).firestore();
  await assertFails(getDoc(doc(db,root,'museum')));checks++;
  console.log(JSON.stringify({state:'passed',checks,candidateSha256:evidence.candidateSha256,cloudWrites:0}));
 }finally{await env.cleanup()}
});
