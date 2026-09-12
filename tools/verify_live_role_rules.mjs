// Production access is GET/read-only. Every data write below targets a loopback
// Firestore emulator with a demo project, never production or staging data.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,query,where,getDocs} from 'firebase/firestore';
import {patchProductionRoleChunkRules} from './production-role-chunk-rules-patch.mjs';
import {patchProductionNotificationScopeRules} from './production-notification-scope-rules-patch.mjs';
import {scheduleNotificationReadFilters} from '../js/core/schedule-notification-read-scope.js';
const endpoint=process.env.FIRESTORE_EMULATOR_HOST||'';
if(!/^(127\.0\.0\.1|localhost):[0-9]+$/.test(endpoint))throw new Error('Requires explicit loopback Firestore emulator');
const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(root+'/auth.js').getGlobalDefaultAccount();
await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877',user:account.user,tokens:account.tokens});
const {Client}=require(root+'/apiv2.js'),api=require(root+'/api.js');
const rulesClient=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()});
const release=(await rulesClient.get('/projects/danbridge-d8877/releases/cloud.firestore')).body;
assert.match(release.rulesetName,/^projects\/danbridge-d8877\/rulesets\/[a-zA-Z0-9-]+$/);
const files=(await rulesClient.get('/'+release.rulesetName,{skipLog:{resBody:true}})).body.source.files;
assert.equal(files.length,1);
const candidateNotificationScope=process.argv.includes('--candidate-notification-scope');
assert.ok(!(candidateNotificationScope&&process.env.DANBRIDGE_VERIFY_PUBLISHED_PRODUCTION_RULES==='278'),'Select one Rules candidate');
const sourceRules=files[0].content,patch=candidateNotificationScope?patchProductionNotificationScopeRules(sourceRules):process.env.DANBRIDGE_VERIFY_PUBLISHED_PRODUCTION_RULES==='278'?patchProductionRoleChunkRules(sourceRules):null;
const rules=patch?.source||sourceRules,rulesSha=createHash('sha256').update(rules).digest('hex');
if(patch)console.log('PRODUCTION_RULES_PATCH_EMULATOR_ONLY '+JSON.stringify({baseSha256:patch.baseSha256,candidateSha256:patch.afterSha256,formalDataWrites:0,rulesDeployment:false}));
const cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
const decode=v=>v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null);
const response=await cloud.post('projects/danbridge-d8877/databases/(default)/documents:runQuery',{structuredQuery:{from:[{collectionId:'companyAccess'}],limit:100}});
const accessRows=(response.body||[]).filter(x=>x.document).map(x=>({email:x.document.name.split('/').pop(),data:Object.fromEntries(Object.entries(x.document.fields||{}).map(([k,v])=>[k,decode(v)]))}));
const primary='a0965487920@gmail.com',backup='catherine890202@gmail.com',scheduler='aa0966626336@gmail.com',teacher='yamiiii8549@gmail.com';
const lucas=accessRows.find(x=>x.data.role==='branch_manager'&&(x.data.managerName==='Lucas'||x.data.teacherName==='Lucas'));
assert.ok(lucas,'Production Lucas configuration missing');
assert.equal(lucas.data.active,true);assert.equal(lucas.data.readOnly,true);assert.deepEqual(lucas.data.branchIds,['art_museum']);
const wanted=[backup,scheduler,teacher,lucas.email],access=new Map(accessRows.filter(x=>wanted.includes(x.email)).map(x=>[x.email,x.data]));
assert.equal(access.size,4);
const [host,port]=endpoint.split(':');
const env=await initializeTestEnvironment({projectId:'demo-danbridge-role-verification',firestore:{host,port:Number(port),rules}});
let checks=0;
const auditNotificationScope=candidateNotificationScope||process.argv.includes('--audit-notification-scope'),securityFindings=[];
async function allowed(p){await assertSucceeds(p);checks++}
async function denied(p){await assertFails(p);checks++}
const prefix='companies/danbridge',full='productionFullRecordShadows/danbridge/collections/lessons/records/fixture-lesson';
try{
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const [email,data]of access)await setDoc(doc(db,'companyAccess',email),data);
  await setDoc(doc(db,full),{companyId:'danbridge',record:{id:'fixture-lesson'},revision:1});
  await setDoc(doc(db,prefix+'/branchViews/'+lucas.email),{branchIds:['art_museum'],db:{lessons:[{id:'museum-only'}]}});
  await setDoc(doc(db,prefix+'/branchViews/other-manager@example.test'),{branchIds:['hexi']});
  await setDoc(doc(db,prefix+'/teacherViews/'+teacher),{teacherId:access.get(teacher).teacherId,lessons:['own-lesson']});
  await setDoc(doc(db,prefix+'/schedulerViews/'+scheduler),{email:scheduler,db:{lessons:[]}});
  for(const email of [primary,...wanted]){
   const a=access.get(email),role=email===primary?'owner':a.role==='teacher'&&a.canManageSchedule===true?'scheduler':a.role;
   await setDoc(doc(db,prefix+'/scheduleNotifications/'+email),{companyId:'danbridge',recipientEmail:email,recipientRole:role,teacherId:a?.teacherId||'',branchIds:a?.branchIds||[],read:false,message:'isolated fixture'});
  }
 });
 for(const [name,email] of [['Daniel',primary],['Catherine',backup],['AA',scheduler],['Teacher',teacher],['Lucas',lucas.email]]){
  const db=env.authenticatedContext('fixture-'+name,{email}).firestore();
  await (name==='Daniel'||name==='Catherine'?allowed:denied)(getDoc(doc(db,full)));
  await allowed(getDoc(doc(db,prefix+'/scheduleNotifications/'+email)));
  if(candidateNotificationScope){
   const context={email,...(access.get(email)||{role:'owner'})};
   const constraints=scheduleNotificationReadFilters(context).map(args=>where(...args));
   await allowed(getDocs(query(collection(db,prefix+'/scheduleNotifications'),...constraints)));
  }
  if(name!=='Daniel'&&name!=='Catherine')await denied(getDoc(doc(db,prefix+'/scheduleNotifications/'+backup)));
  if(name==='Lucas'){
   await allowed(getDoc(doc(db,prefix+'/branchViews/'+email)));
   await denied(getDoc(doc(db,prefix+'/branchViews/other-manager@example.test')));
   await denied(getDoc(doc(db,prefix+'/teacherViews/'+teacher)));
   await denied(getDoc(doc(db,prefix+'/schedulerViews/'+scheduler)));
   await denied(updateDoc(doc(db,prefix+'/branchViews/'+email),{branchIds:['hexi']}));
   await denied(setDoc(doc(db,full),{record:{id:'forged'}}));
   await denied(deleteDoc(doc(db,full)));
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),prefix+'/branchViews/'+email),{branchIds:['hexi']}));
   await denied(getDoc(doc(db,prefix+'/branchViews/'+email)));
  }
  if(name==='AA'){await allowed(getDoc(doc(db,prefix+'/schedulerViews/'+email)));await denied(getDoc(doc(db,prefix+'/teacherViews/'+teacher)));}
  if(name==='Teacher'){await allowed(getDoc(doc(db,prefix+'/teacherViews/'+email)));await denied(getDoc(doc(db,prefix+'/schedulerViews/'+scheduler)));}
 }
 // Reuse AA's authenticated identity with Lucas's permission attributes in
 // the emulator only. Restore and recheck scheduler access afterwards.
 const aaProfile=access.get(scheduler),aaDb=env.authenticatedContext('fixture-AA',{email:scheduler}).firestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();await setDoc(doc(db,'companyAccess',scheduler),{...lucas.data,teacherId:aaProfile.teacherId,canManageSchedule:false});
  await setDoc(doc(db,prefix+'/branchViews/'+scheduler),{branchIds:['art_museum'],db:{lessons:[{id:'museum-only'}]}});
 });
 await allowed(getDoc(doc(aaDb,prefix+'/branchViews/'+scheduler)));
 for(const path of [full,prefix+'/branchViews/'+lucas.email,prefix+'/teacherViews/'+teacher,prefix+'/schedulerViews/'+scheduler,prefix+'/scheduleNotifications/'+backup])await denied(getDoc(doc(aaDb,path)));
 await denied(updateDoc(doc(aaDb,'companyAccess',scheduler),{branchIds:['hexi']}));
 await denied(setDoc(doc(aaDb,full),{record:{id:'forged'}}));
 if(auditNotificationScope){
  // Synthetic notices only. Audit the DEPLOYED Rules without modifying them.
  // A successful forbidden-scope read is a finding, never a passing isolation
  // check. Exercise both guessed document IDs and the actual UI query shape.
  const fixtures=[
   ['historical-scheduler',{recipientRole:'scheduler',branchIds:[],teacherId:aaProfile.teacherId}],
   ['historical-other-branch',{recipientRole:'branch_manager',branchIds:['hexi'],teacherId:aaProfile.teacherId}],
   ['current-museum',{recipientRole:'branch_manager',branchIds:['art_museum'],teacherId:aaProfile.teacherId}]
  ];
  await env.withSecurityRulesDisabled(async ctx=>{
   for(const [id,scope]of fixtures)await setDoc(doc(ctx.firestore(),prefix+'/scheduleNotifications/'+id),{companyId:'danbridge',recipientEmail:scheduler,...scope,read:false,message:'synthetic scope audit only'});
  });
  await allowed(getDoc(doc(aaDb,prefix+'/scheduleNotifications/current-museum')));
  if(candidateNotificationScope){
   const constraints=scheduleNotificationReadFilters({email:scheduler,role:'branch_manager',branchIds:['art_museum']}).map(args=>where(...args));
   const result=await getDocs(query(collection(aaDb,prefix+'/scheduleNotifications'),...constraints));
   assert.deepEqual(result.docs.map(row=>row.id),['current-museum']);checks++;
   await denied(getDocs(query(collection(aaDb,prefix+'/scheduleNotifications'),where('recipientEmail','==',scheduler),where('recipientRole','==','branch_manager'),where('branchIds','array-contains','art_museum'))));
   await denied(setDoc(doc(aaDb,prefix+'/scheduleNotifications/forged-notice'),{recipientEmail:scheduler,recipientRole:'branch_manager',branchIds:['art_museum']}));
   await denied(updateDoc(doc(aaDb,prefix+'/scheduleNotifications/current-museum'),{recipientRole:'scheduler'}));
  }
  for(const [id]of fixtures.slice(0,2)){
   try{
    const snap=await getDoc(doc(aaDb,prefix+'/scheduleNotifications/'+id));
    assert.equal(snap.exists(),true);
    securityFindings.push({code:'historical-notification-scope-readable',fixture:id,operation:'get',currentRole:'branch_manager',currentBranches:['art_museum']});
   }catch(error){if(error.code!=='permission-denied')throw error;checks++;}
  }
  try{
   const rows=await getDocs(query(collection(aaDb,prefix+'/scheduleNotifications'),where('recipientEmail','==',scheduler)));
   const forbidden=rows.docs.filter(row=>['historical-scheduler','historical-other-branch'].includes(row.id)).map(row=>row.id);
   if(forbidden.length)securityFindings.push({code:'historical-notification-scope-readable',fixtures:forbidden,operation:'list'});
  }catch(error){if(error.code!=='permission-denied')throw error;checks++;}
 }
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'companyAccess',scheduler),aaProfile));
 await allowed(getDoc(doc(aaDb,prefix+'/schedulerViews/'+scheduler)));
 await denied(getDoc(doc(aaDb,prefix+'/branchViews/'+scheduler)));
 for(const email of wanted){
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyAccess/'+email),{active:false}));
  const db=env.authenticatedContext('revoked-'+wanted.indexOf(email),{email}).firestore();
  await denied(getDoc(doc(db,full)));await denied(getDoc(doc(db,prefix+'/scheduleNotifications/'+email)));
 }
 const latest=(await rulesClient.get('/projects/danbridge-d8877/releases/cloud.firestore')).body;
 assert.equal(latest.rulesetName,release.rulesetName,'Production Rules changed during isolated verification');
 console.log(JSON.stringify({state:securityFindings.length?'security-findings':'passed',checks,securityFindings,ruleset:release.rulesetName,rulesSha256:rulesSha,productionDataWrites:0,emulatorProject:'demo-danbridge-role-verification',realLucasLogin:false,aaBranchRoleAndRestoration:'emulator-only'}));
 if(securityFindings.length)process.exitCode=2;
}finally{await env.cleanup()}
