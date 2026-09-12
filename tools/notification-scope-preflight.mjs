// Read-only: validate real query/index support and existing notice envelopes.
// Admin queries do NOT prove client authorization; the Rules suite does that.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
import {scheduleNotificationReadFilters,scheduleNotificationMatchesFilters} from '../js/core/schedule-notification-read-scope.js';
const project=process.argv[2];
assert.ok(['danbridge-d8877','danbridge-d8877-staging'].includes(project));
const authorizedFour=process.argv[3]==='--authorized-four';
assert.ok(process.argv.length<=4&&(!process.argv[3]||authorizedFour),'Unknown account scope');
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 const namedAccounts=['a0965487920@gmail.com','catherine890202@gmail.com','aa0966626336@gmail.com','yamiiii8549@gmail.com'];
 const access=authorizedFour?{docs:await db.getAll(...namedAccounts.map(email=>db.doc('companyAccess/'+email)))}:await db.collection('companyAccess').where('companyId','==','danbridge').where('active','==',true).limit(101).get();
 assert.ok(access.docs.length<=100,'Access sample truncated');
 const reports=[];
 for(const row of access.docs){
  assert.ok(row.exists&&row.data()?.companyId==='danbridge'&&row.data()?.active===true,'Requested account is not active for this company');
  const profile={...row.data(),email:row.id},filters=scheduleNotificationReadFilters(profile);
  let q=db.collection('companies/danbridge/scheduleNotifications');
  for(const [field,op,value]of filters)q=q.where(field,op,value);
  // Native production/staging aggregate query exercises the real indexes.
  const eligible=(await q.count().get()).data().count;
  const notices=await db.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',profile.email).select('recipientEmail','recipientRole','teacherId','branchIds').get();
  const matched=notices.docs.filter(doc=>scheduleNotificationMatchesFilters(doc.data(),filters)).length;
  assert.equal(eligible,matched,'Query disagrees with scope matcher');
  reports.push({role:profile.role==='teacher'&&profile.canManageSchedule?'scheduler':profile.role,branchCount:profile.branchIds?.length||0,total:notices.size,currentScope:matched,excludedHistoricalScope:notices.size-matched,missingRecipientRole:notices.docs.filter(doc=>!doc.data().recipientRole).length});
 }
 console.log(JSON.stringify({project,accountScope:authorizedFour?'four-explicitly-authorized':'all-active',writes:0,state:'query-preflight-passed',realClientAuthorization:false,roles:reports},null,2));
}finally{await db.terminate()}
