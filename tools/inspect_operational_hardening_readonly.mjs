// Explicit metadata only. No set/update/delete, no credentials in output.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project:'danbridge-d8877',user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const clients=['danbridge-d8877','danbridge-d8877-staging'].map(projectId=>new Firestore({projectId,authClient}));
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row?.[key]!==undefined).map(key=>[key,row[key]]));
try{
 const roles={};for(let i=0;i<clients.length;i++){
  const db=clients[i],aa=(await db.doc('companyAccess/aa0966626336@gmail.com').get()).data();
  const managers=await db.collection('companyAccess').where('companyId','==','danbridge').where('role','==','branch_manager').limit(101).get();
  roles[i===0?'production':'staging']={aa:pick(aa,['role','active','teacherId','canManageSchedule','branchIds','readOnly','canSubmitOwnReports']),lucas:managers.docs.map(doc=>doc.data()).filter(row=>row.managerName==='Lucas'||row.teacherName==='Lucas').map(row=>pick(row,['role','active','teacherId','branchIds','readOnly','canSubmitOwnReports']))};
 }
 const db=clients[0],capacity=await require('../functions/production-role-capacity.cjs').readProductionRoleCapacity(db);
 const receipt=(await db.doc('companies/danbridge/systemHealth/restoreRehearsal').get()).data();
 const iso=value=>value?.toDate?.().toISOString()||value||null;
 console.log(JSON.stringify({writes:0,checkedAt:new Date().toISOString(),roles,capacity,restoreRehearsal:receipt?{...pick(receipt,['schema','state','runId','formalDataWrites']),finishedAt:iso(receipt.finishedAt),snapshotTime:iso(receipt.snapshotTime)}:null},null,2));
}finally{await Promise.all(clients.map(db=>db.terminate()))}
