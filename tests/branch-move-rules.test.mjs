import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc} from 'firebase/firestore';
test('move capability cannot be self-granted; managers cannot directly write full records or read another access profile',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-danbridge-branch-rules',firestore:{rules:await readFile(new URL('../firebase/firestore.rules.deploy',import.meta.url),'utf8')}}),email='lucas@example.test';
 try{
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'companyAccess',email),{companyId:'danbridge',role:'branch_manager',active:true,teacherId:'t1',branchIds:['art_museum'],canMoveSchedule:true,readOnly:true});await setDoc(doc(db,'companyAccess','other@example.test'),{companyId:'danbridge',role:'teacher',teacherId:'t2',active:true})});
  const db=env.authenticatedContext('lucas-fixture',{email,email_verified:true}).firestore();
  await assertSucceeds(getDoc(doc(db,'companyAccess',email)));
  await assertFails(updateDoc(doc(db,'companyAccess',email),{canMoveSchedule:true,branchIds:['art_museum','hexi']}));
  await assertFails(getDoc(doc(db,'companyAccess','other@example.test')));
  await assertFails(setDoc(doc(db,'productionFullRecordShadows/danbridge/collections/lessons/records/l1'),{id:'l1',branchId:'art_museum',date:'2026-10-02'}));
 }finally{await env.cleanup()}
});
