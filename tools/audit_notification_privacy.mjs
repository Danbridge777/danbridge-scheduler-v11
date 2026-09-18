// Read-only: inspect exact live Rules and historical notification envelopes.
// Print counts and rule text only, never message contents or credentials.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const project=process.argv[2];
assert.ok(['danbridge-d8877','danbridge-d8877-staging'].includes(project));
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js');
const client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()});
const release=(await client.get(`/projects/${project}/releases/cloud.firestore`)).body;
assert.ok(release.rulesetName.startsWith(`projects/${project}/rulesets/`));
const files=(await client.get('/'+release.rulesetName,{skipLog:{resBody:true}})).body.source.files;
assert.equal(files.length,1);
const source=files[0].content,at=source.indexOf('match/companies/{companyId}/scheduleNotifications/{notificationId}');
assert.ok(at>=0,'Notification block not found; no assumptions made');
console.log(JSON.stringify({project,ruleset:release.rulesetName,sha256:createHash('sha256').update(source).digest('hex'),notificationRules:source.slice(at,at+1800),writes:0}));
const {Firestore}=require('@google-cloud/firestore'),{OAuth2Client}=require('google-auth-library');
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 for(const [label,email]of [['AA','aa0966626336@gmail.com'],['Lucas','huberlucas88@gmail.com']]){
  const profile=(await db.doc('companyAccess/'+email).get()).data();
  const notices=await db.collection('companies/danbridge/scheduleNotifications').where('recipientEmail','==',email).get();
  const rows=notices.docs.map(d=>d.data()),sameBranch=rows.filter(n=>n.recipientRole==='branch_manager'&&JSON.stringify(n.branchIds)===JSON.stringify(profile?.branchIds));
  const freeform=n=>(n.details||[]).some(d=>[d.before,d.after].some(x=>x&&['note','address','meetingUrl','onlinePlatform'].some(k=>typeof x[k]==='string'&&x[k].trim())));
  console.log(JSON.stringify({label,role:profile?.role,hideFinancials:profile?.hideFinancials===true,total:rows.length,sameBranch: sameBranch.length,sameBranchWithFreeform:sameBranch.filter(freeform).length,writes:0}));
 }
}finally{await db.terminate()}
