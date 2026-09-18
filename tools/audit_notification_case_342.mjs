// Read-only audit of one synthetic acceptance case, never prints business data.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Firestore}=require('@google-cloud/firestore'),{OAuth2Client}=require('google-auth-library');
const authClient=new OAuth2Client(),token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]);authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 const summary=[];
 for(const [label,email]of [['Daniel','a0965487920@gmail.com'],['Catherine','catherine890202@gmail.com'],['AA','aa0966626336@gmail.com'],['Teacher','yamiiii8549@gmail.com']]){
  const rows=await db.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',email).get();
  const found=rows.docs.map(d=>({id:d.id,...d.data()})).filter(n=>(n.details||[]).some(d=>[d.before,d.after].some(x=>x?.title==='AUDIT342-PRIVACY-20260918')));
  assert.ok(found.length,`${label}: new case not delivered`);
  const privateRows=found.filter(n=>JSON.stringify(n).includes('STAGING_PRIVACY_CANARY_FEE_999'));
  if(label==='AA'||label==='Teacher')assert.equal(privateRows.length,0,`${label}: canary leak`);
  if(label==='AA')assert.ok(found.every(n=>n.privacyScope==='schedule-only-v1'));
  summary.push({label,notices:found.map(n=>({id:n.id,read:n.read===true,types:n.details.map(d=>d.type),lessonIds:n.details.map(d=>d.lessonId)})),canaryPresent:privateRows.length>0});
 }
 console.log(JSON.stringify({project,case:'AUDIT342-PRIVACY-20260918',summary,writes:0}));
}finally{await db.terminate()}
