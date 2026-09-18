import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc} from 'firebase/firestore';
import {scheduleNotificationReadFilters} from '../js/core/schedule-notification-read-scope.js';
import {patchNotificationPrivacyRules} from '../tools/notification-privacy-rules-patch.mjs';
const folder=process.env.NOTIFICATION_PRIVACY_ARTIFACT;
test('live-baseline privacy patch denies historical raw payloads, including direct ID and broad query',{skip:!folder,timeout:90000},async()=>{
 assert.match(folder,/^\/private\/tmp\/danbridge-notification-privacy-[A-Za-z0-9]+$/);
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1):\d+$/);
 const evidence=JSON.parse(await readFile(folder+'/evidence.json','utf8'));
 const base=await readFile(folder+'/baseline.rules','utf8'),rules=await readFile(folder+'/candidate.rules','utf8');
 assert.equal(patchNotificationPrivacyRules(base,evidence.project).source,rules);
 assert.throws(()=>patchNotificationPrivacyRules(base+' ',evidence.project));
 const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-notification-privacy',firestore:{host,port:Number(port),rules}});
 const email='aa0966626336@gmail.com',root='companies/danbridge/scheduleNotifications';
 const branch={recipientEmail:email,recipientRole:'branch_manager',branchIds:['art_museum'],read:false};
 const cases={old:{...branch,note:'SENSITIVE'},safe:{...branch,privacyScope:'schedule-only-v1'},wrong:{...branch,privacyScope:'unknown'},wide:{...branch,branchIds:['art_museum','hexi'],privacyScope:'schedule-only-v1'},teacher:{recipientEmail:email,recipientRole:'teacher',teacherId:'t'},scheduler:{recipientEmail:email,recipientRole:'scheduler'}};
 const profiles=[
  [{role:'branch_manager',branchIds:['art_museum'],hideFinancials:true},['safe']],
  [{role:'branch_manager',branchIds:['art_museum'],hideFinancials:false},['old','safe','wrong']],
  [{role:'teacher',teacherId:'t'},['teacher']],
  [{role:'teacher',canManageSchedule:true},['scheduler']],
  [{role:'owner'},Object.keys(cases)]
 ];
 try{
  await env.withSecurityRulesDisabled(async c=>{for(const[id,row]of Object.entries(cases))await setDoc(doc(c.firestore(),root,id),{companyId:'danbridge',...row});await setDoc(doc(c.firestore(),'notificationPrivacyMigrationBackups','fixture'),{original:'private'});});
  for(const [fields,expected]of profiles){
   const profile={email,companyId:'danbridge',active:true,...fields};
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'companyAccess',email),profile));
   const db=env.authenticatedContext('privacy-fixture',{email,email_verified:true}).firestore();
   await assertFails(getDoc(doc(db,'notificationPrivacyMigrationBackups','fixture')));
   const rows=await assertSucceeds(getDocs(query(collection(db,root),...scheduleNotificationReadFilters(profile).map(args=>where(...args)))));
   assert.deepEqual(rows.docs.map(d=>d.id).sort(),[...expected].sort());
   for(const id of Object.keys(cases))await (expected.includes(id)?assertSucceeds:assertFails)(getDoc(doc(db,root,id)));
   if(fields.hideFinancials){
    await assertFails(getDocs(query(collection(db,root),where('recipientEmail','==',email),where('recipientRole','==','branch_manager'),where('branchIds','==',['art_museum']))));
    await assertFails(updateDoc(doc(db,root,'old'),{privacyScope:'schedule-only-v1'}));
    await assertFails(updateDoc(doc(db,root,'old'),{read:true}));
   }
  }
 }finally{await env.cleanup()}
});
