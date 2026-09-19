// Authorized release publication: derived views only, with source fencing,
// commit lease, atomic heads and readback through the existing publisher.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA} from '../js/core/production-role-view-projection.js';
const require=createRequire(import.meta.url),project='danbridge-d8877',apply=process.argv[2]==='--apply';
assert.ok([undefined,'--plan','--apply'].includes(process.argv[2]));
const cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount(),email='a0965487920@gmail.com';
assert.equal(account.user.email,email);
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const firestore=new Firestore({projectId:project,authClient}),{accessIdentity}=require('../functions/production-derived-commit.cjs');
try{
 const before=await firestore.collection('companyAccess').where('companyId','==','danbridge').get();
 const identities=new Map(before.docs.map(r=>[r.id,accessIdentity(r.data())]));
 const safety=(await firestore.doc('companies/danbridge/productionRecordRuntime/safety').get()).data();
 assert.equal(safety.state,'active');assert.equal(safety.readAllowed,true);assert.equal(safety.writeAllowed,true);
 if(!apply){console.log(JSON.stringify({project,mode:'plan',release:'20.26.367',businessWrites:0,roleCount:identities.size,sourceRevision:safety.recordRevision}));}
 else{
  const publisher=await require('../functions/published-role-publisher.cjs').createPublishedRolePublisher({firestore,serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),primaryOwnerEmail:email,preserveLegacyViews:false});
  const result=await publisher.execute({schema:PRODUCTION_ROLE_VIEW_PUBLISH_SCHEMA,requestId:'finance_366_'+Date.now(),sourceHash:safety.recordDataHash,release:'20.26.367',verifyReadback:true},{uid:'cli-release-admin-366',email,emailVerified:true,appVerified:true});
  const after=await firestore.collection('companyAccess').where('companyId','==','danbridge').get();
  assert.equal(after.size,before.size);for(const row of after.docs)assert.equal(accessIdentity(row.data()),identities.get(row.id),'Permission identity changed');
  console.log(JSON.stringify({project,mode:'apply',businessWrites:0,permissionChanges:0,result:result.result}));
 }
}finally{await firestore.terminate()}
