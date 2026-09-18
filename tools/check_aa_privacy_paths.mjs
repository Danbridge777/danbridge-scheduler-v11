// Read-only, exact staging AA legacy-path audit. Never prints business records.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Firestore}=require('@google-cloud/firestore'),{OAuth2Client}=require('google-auth-library');
const project='danbridge-d8877-staging',email='aa0966626336@gmail.com',cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 const paths=['companyAccess/'+email,'companies/danbridge/branchViews/'+email,'companies/danbridge/teacherViews/'+email,'stagingRoleAcceptance/aa-no-finance-333'];
 const rows=await db.getAll(...paths.map(p=>db.doc(p)));
 console.log(JSON.stringify(rows.map((row,i)=>({path:paths[i],exists:row.exists,financialFieldPresent:row.exists&&/"(?:rate|baseSalary|pricingHistory|paymentStatus|payTeacher|chargeStudent|totalFee|amount)":/.test(JSON.stringify(row.data())),scopedDbPresent:!!row.data()?.scopedDb,state:row.data()?.state||null}))));
}finally{await db.terminate()}
