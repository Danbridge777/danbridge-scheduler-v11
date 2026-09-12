// Read-only deployed-function and isolated-namespace verification. No business
// path argument, write API or token output is exposed by this tool.
import {createRequire} from 'node:module';
import {Firestore} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const runId=process.argv[2];
if(process.argv.length!==3||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId||''))throw Error('One exact acceptance UUID is required');
const require=createRequire(import.meta.url),base='/usr/local/lib/node_modules/firebase-tools/lib',project='danbridge-d8877-staging',account=require(base+'/auth.js').getGlobalDefaultAccount();
await require(base+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(base+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const native=new Firestore({projectId:project,authClient}),root=native.doc('acceptancePublishedTransport/callable-279-'+runId);
try{
 const snapshot=await root.get(),collections=await root.listCollections();
 if(snapshot.exists&&snapshot.data()?.purpose!=='published-callable-279-synthetic-only')throw Error('Namespace purpose mismatch');
 const reports=snapshot.exists?(await root.collection('acceptanceReports').orderBy('step').get()).docs.map(r=>r.data()):[];
 const {Client}=require(base+'/apiv2.js'),api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
 const fn=(await api.get(`/projects/${project}/locations/asia-east1/functions/stagingPublishedTransportAcceptance`,{skipLog:{resBody:true}})).body;
 console.log(JSON.stringify({project,dataWrites:0,namespace:root.path,exists:snapshot.exists,remainingCollectionCount:collections.length,busy:snapshot.data()?.busy||null,nextStep:snapshot.data()?.nextStep??null,reports,function:{name:fn.name,state:fn.state,revision:fn.serviceConfig?.revision,serviceAccount:fn.serviceConfig?.serviceAccountEmail,updateTime:fn.updateTime}},null,2));
 if(fn.state!=='ACTIVE'||(!snapshot.exists&&collections.length))process.exitCode=1;
}finally{await native.terminate()}
