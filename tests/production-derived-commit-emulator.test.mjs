import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
const {commitProductionDerivedWrites}=createRequire(import.meta.url)('../functions/production-derived-commit.cjs');

test('真正 Firestore 交易：正確版本可發布，較舊版本與撤銷角色不能覆寫', {skip:!process.env.FIRESTORE_EMULATOR_HOST}, async()=>{
 const host=process.env.FIRESTORE_EMULATOR_HOST;
 assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/);
 const firestore=new Firestore({projectId:'demo-danbridge-derived-test'});
 const safetyRef=firestore.doc('companies/danbridge/productionRecordRuntime/safety');
 const memberRef=firestore.doc('companyAccess/teacher@example.com');
 const viewRef=firestore.doc('companies/danbridge/teacherViews/teacher@example.com');
 const oldHash='record-v1:'+'a'.repeat(64),newHash='record-v1:'+'b'.repeat(64);
 const member={email:'teacher@example.com',companyId:'danbridge',role:'teacher',active:true,teacherId:'teacher-1'};
 try{
  await safetyRef.set({state:'active',readAllowed:true,writeAllowed:true,recordDataHash:oldHash});
  await memberRef.set(member);
  const accessSnapshot=await memberRef.get();
  await commitProductionDerivedWrites(firestore,[{ref:viewRef,value:{version:'old'}}],{sourceHash:oldHash,accessSnapshots:[accessSnapshot]});
  assert.equal((await viewRef.get()).data().version,'old');
  await safetyRef.update({recordDataHash:newHash});
  await commitProductionDerivedWrites(firestore,[{ref:viewRef,value:{version:'new'}}],{sourceHash:newHash,accessSnapshots:[accessSnapshot]});
  await assert.rejects(commitProductionDerivedWrites(firestore,[{ref:viewRef,value:{version:'stale'}}],{sourceHash:oldHash,accessSnapshots:[accessSnapshot]}),/權威版本已改變/);
  assert.equal((await viewRef.get()).data().version,'new');
  await memberRef.update({active:false});
  await assert.rejects(commitProductionDerivedWrites(firestore,[{ref:viewRef,value:{version:'revoked'}}],{sourceHash:newHash,accessSnapshots:[accessSnapshot]}),/角色範圍已改變/);
  assert.equal((await viewRef.get()).data().version,'new');
 }finally{await firestore.terminate()}
});
