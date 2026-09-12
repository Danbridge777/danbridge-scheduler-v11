import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs} from 'firebase/firestore';
import {FULL_RECORD_COLLECTIONS} from '../js/core/cloud-full-record-shadow.js';
import {buildRoleViewChunks} from '../js/core/role-view-chunks.js';
import {readPatchedProductionRulesForEmulator} from './helpers/current-production-rules.mjs';
test('compiled Rules: own active exact scope only, current published parts only, no client writes',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:90000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);const[host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
 const rules=process.env.DANBRIDGE_VERIFY_PUBLISHED_PRODUCTION_RULES==='278'?await readPatchedProductionRulesForEmulator():await readFile(new URL('../firebase/firestore.rules.deploy',import.meta.url),'utf8');
 const env=await initializeTestEnvironment({projectId:'demo-danbridge-published-rules',firestore:{host,port:Number(port),rules}});
 try{
  const identities=[{kind:'teacher',email:'teacher@example.test',teacherId:'t1',branchIds:[]},{kind:'scheduler',email:'aa0966626336@gmail.com',teacherId:'aa',branchIds:[]},{kind:'branch_manager',email:'branch@example.test',teacherId:'branch',branchIds:['art_museum']}],parts=[];
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const identity of identities){const source={...Object.fromEntries(FULL_RECORD_COLLECTIONS.map(c=>[c,[]])),lessons:[{id:'l1',teacherId:'t1'}]},built=buildRoleViewChunks(source,{identity,sourceRevision:1,sourceHash:'record-v1:'+'1'.repeat(64),stableRecords:true}),root='productionRoleChunkViews/'+built.manifest.scope,branch=identity.kind==='branch_manager',path=branch?'companyAccess/'+identity.email:`companies/danbridge/${identity.kind==='scheduler'?'schedulerViews':'teacherViews'}/${identity.email}`;
   await setDoc(doc(db,'companyAccess/'+identity.email),{companyId:'danbridge',active:true,role:branch?'branch_manager':'teacher',teacherId:identity.teacherId,branchIds:identity.branchIds,canManageSchedule:identity.kind==='scheduler'});
   await setDoc(doc(db,path),{roleChunkManifest:built.manifest,...(branch?{scopedSourceRecordRevision:1,scopedSourceRecordHash:built.manifest.sourceHash}:{teacherId:identity.teacherId,sourceRecordRevision:1,sourceRecordHash:built.manifest.sourceHash})},{merge:true});await setDoc(doc(db,root),built.manifest);for(const part of built.chunks)await setDoc(doc(db,root+'/parts/'+part.id),part);
   const hidden='f'.repeat(64);await setDoc(doc(db,root+'/parts/'+hidden),{id:hidden,scope:built.manifest.scope});parts.push({identity,root,path,part:root+'/parts/'+built.chunks[0].id,hidden:root+'/parts/'+hidden});
  }});
  for(const item of parts){const db=env.authenticatedContext('uid-'+item.identity.kind,{email:item.identity.email,email_verified:true}).firestore();await assertSucceeds(getDoc(doc(db,item.root)));await assertSucceeds(getDoc(doc(db,item.part)));await assertFails(getDoc(doc(db,item.hidden)));await assertFails(getDocs(collection(db,item.root+'/parts')));await assertFails(setDoc(doc(db,item.part),{forged:true}));await assertFails(deleteDoc(doc(db,item.part)));await assertFails(getDoc(doc(db,parts.find(p=>p!==item).part)));
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyAccess/'+item.identity.email),{active:false}));await assertFails(getDoc(doc(db,item.part)));await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyAccess/'+item.identity.email),{active:true}));
  }
  const branch=parts[2],branchDb=env.authenticatedContext('branch',{email:branch.identity.email}).firestore();await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyAccess/'+branch.identity.email),{branchIds:['hexi']}));await assertFails(getDoc(doc(branchDb,branch.part)));
  const teacher=parts[0],teacherDb=env.authenticatedContext('teacher',{email:teacher.identity.email}).firestore();await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),teacher.path),{'roleChunkManifest.digest':'0'.repeat(64)}));await assertFails(getDoc(doc(teacherDb,teacher.part)));
  const ownerDb=env.authenticatedContext('owner',{email:'a0965487920@gmail.com'}).firestore();await assertFails(setDoc(doc(ownerDb,parts[1].part),{forged:true}));await assertFails(deleteDoc(doc(ownerDb,parts[1].root)));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),parts[1].part)));
 }finally{await env.cleanup()}
});
