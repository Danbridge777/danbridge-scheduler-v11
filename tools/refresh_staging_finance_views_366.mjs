// Rebuild only derived staging views. Never change accounts or business data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {buildProductionRoleViews} from '../js/core/production-role-view-projection.js';
import {createFirebaseRoleRecordViewAdapter} from '../js/core/firebase-role-record-view-adapter.js';
const require=createRequire(import.meta.url),project='danbridge-d8877-staging',apply=process.argv[2]==='--apply';
assert.ok([undefined,'--plan','--apply'].includes(process.argv[2]));
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
assert.equal(account.user.email,'a0965487920@gmail.com');
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const firestore=new Firestore({projectId:project,authClient});
const {accessIdentity}=require('../functions/production-derived-commit.cjs');
try{
 const runtime=await require('../functions/staging-derived-delivery-runtime.cjs').createStagingDerivedDeliveryRuntime({firestore,expectedProjectId:project,serverTimestamp:()=>FieldValue.serverTimestamp()});
 await runtime.warm();const source=runtime.snapshot();
 const access=(await firestore.collection('companyAccess').get()).docs.map(r=>({...r.data(),email:r.id}));
 const views=buildProductionRoleViews(source.sourceDb,access),results=[];
 for(const view of views){
  const expected=access.find(r=>r.email===view.email),identity={email:view.email,kind:view.kind,teacherId:view.teacherId,branchIds:view.branchIds||[]};
  if(!apply){results.push({kind:view.kind,lessons:view.db.lessons.length});continue}
  const guarded=callback=>firestore.runTransaction(async tx=>{
   const [head,member]=await tx.getAll(firestore.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`),firestore.doc(`companyAccess/${view.email}`));
   assert.equal(head.data().headHash,source.headHash,'Authority changed');assert.equal(accessIdentity(member.data()),accessIdentity(expected),'Access changed');
   return callback({get:path=>tx.get(firestore.doc(path)),getAll:(...paths)=>tx.getAll(...paths.map(path=>firestore.doc(path))),set:(path,value,options)=>tx.set(firestore.doc(path),value,options)});
  });
  const adapter=createFirebaseRoleRecordViewAdapter({environment:'staging',role:'owner',actor:{uid:'release-admin-366',email:account.user.email},getDocument:async path=>(await firestore.doc(path).get()).data()||null,getCollectionDocuments:async path=>(await firestore.collection(path).get()).docs.map(r=>({id:r.id,data:r.data()})),runTransaction:guarded,runBatchTransaction:guarded,serverTimestamp:()=>FieldValue.serverTimestamp()});
  const result=await adapter.synchronize(view.db,{identity,activationEpoch:source.activationEpoch,sourceRecordHash:source.sourceHash,publishId:'finance_366_'+Date.now(),publishedAt:new Date().toISOString(),batchSize:100});
  results.push({kind:view.kind,lessons:view.db.lessons.length,writes:result.writes,state:'readback-verified'});
 }
 assert.equal((await firestore.doc(`stagingActiveRecordV2Heads/danbridge/epochs/${source.activationEpoch}`).get()).data().headHash,source.headHash);
 console.log(JSON.stringify({project,mode:apply?'apply':'plan',businessWrites:0,accessChanges:0,views:results}));
}finally{await firestore.terminate()}
