// Exact synthetic workspace only; no formal records or remote writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient}),root=db.doc('acceptancePublishedTransport/workspace-280-80190109-2684-4a92-a726-abf3cae53b5a');
try{
 assert.equal((await root.get()).data()?.purpose,'normal-ui-published-280-synthetic-only');
 const leaves=(await root.collection('productionTeacherLeaveRecords').get()).docs.map(x=>({id:x.id,...x.data()}));
 const receipts=(await root.collection('productionTeacherLeaveOperationReceipts').get()).docs.map(x=>x.data());
 const notices=(await root.collection('companies/danbridge/scheduleNotifications').where('notificationType','==','teacher-leave').get()).docs.map(x=>x.data());
 const grouped=receipts.map(r=>({operationId:r.operationId,leaveId:r.leaveId,action:r.action,revision:r.revision,actor:r.committedByEmail,recipients:notices.filter(n=>n.details?.[0]?.leaveId===r.leaveId&&n.details?.[0]?.action===r.action).map(n=>({email:n.recipientEmail,read:n.read===true,readAt:n.readAt?.toDate?.().toISOString()||null}))}));
 console.log(JSON.stringify({project,namespace:root.path,remoteWrites:0,leaves:leaves.map(r=>({id:r.id,date:r.date,start:r.start,end:r.end,hours:r.hours,status:r.status,revision:r.revision,note:r.note})),operations:grouped},null,2));
}finally{await db.terminate()}
