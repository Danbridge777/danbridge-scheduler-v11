// Trusted-admin, read-only cloud integration check. This does NOT count as a
// real Google-account UI/App Check test. No records or credentials are printed.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const require=createRequire(import.meta.url),project=process.argv[2],month=process.argv[3]||'2026-09';
assert.ok(['danbridge-d8877','danbridge-d8877-staging'].includes(project));
const environment=project.endsWith('-staging')?'staging':'production';
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const firestore=new Firestore({projectId:project,authClient});
const {readScopedPayroll}=require('../functions/scoped-payroll-runtime.cjs');
try{
 let source;
 if(environment==='staging'){
  const runtime=await require('../functions/staging-derived-delivery-runtime.cjs').createStagingDerivedDeliveryRuntime({firestore,expectedProjectId:project,serverTimestamp:()=>null});
  await runtime.warm();source=runtime.snapshot().sourceDb;
 }else{
  const {FULL_RECORD_COLLECTIONS,rebuildFullRecordShadowDb}=await import('../js/core/cloud-full-record-shadow.js');
  const snapshots=await Promise.all(FULL_RECORD_COLLECTIONS.map(c=>firestore.collection(`productionFullRecordShadows/danbridge/collections/${c}/records`).get()));
  source=rebuildFullRecordShadowDb(Object.fromEntries(FULL_RECORD_COLLECTIONS.map((c,i)=>[c,snapshots[i].docs.map(r=>({id:r.id,data:r.data()}))])),{environment}).db;
 }
 const leaves=(await firestore.collection('productionTeacherLeaveRecords').where('companyId','==','danbridge').get()).docs.map(r=>r.data());
 const reference=require('../functions/scoped-payroll-calculator.cjs').calculateScopedPayroll({db:source,leaves,month,scope:'art_museum'});
 const results=[];
 for(const [label,email] of [['Daniel','a0965487920@gmail.com'],['Catherine','catherine890202@gmail.com'],['AA','aa0966626336@gmail.com']]){
  const value=await readScopedPayroll({firestore,environment,identity:{uid:'read-only-audit-'+label,email,emailVerified:true,appVerified:true},input:{month,scope:'art_museum'}});
  results.push({label,value});
 }
 const shape=value=>JSON.stringify(value.rows);
 assert.equal(shape(results[0].value),JSON.stringify(reference),'Monthly query disagrees with full authoritative source');
 assert.equal(shape(results[0].value),shape(results[1].value),'Owners disagree');assert.equal(shape(results[0].value),shape(results[2].value),'AA disagrees with Owner');
 for(const [label,email,scope] of [['AA','aa0966626336@gmail.com','hexi'],['Teacher','yamiiii8549@gmail.com','art_museum']]){
  await assert.rejects(()=>readScopedPayroll({firestore,environment,identity:{uid:'read-only-audit-'+label,email,emailVerified:true,appVerified:true},input:{month,scope}}),{code:'permission-denied'});
 }
 console.log(JSON.stringify({project,month,businessWrites:0,method:'admin integration with fresh persisted role checks; not browser login',matchingRoles:results.map(r=>r.label),sourceLessonCount:source.lessons.length,scopedTeacherCount:results[0].value.rows.length,fullSourceMatches:true,foreignScopeAndTeacherDenied:true}));
}finally{await firestore.terminate()}
