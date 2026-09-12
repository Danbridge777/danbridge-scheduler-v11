// Read-only release checks: compare every changed browser asset, and inspect
// selected operational metadata without emitting business records or secrets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const project=process.argv[2];
if(!['danbridge-d8877','danbridge-d8877-staging'].includes(project))throw Error('Explicit allowed project required');
const targetOrigin=process.argv[3]||`https://${project}.web.app`,target=new URL(targetOrigin);
if(target.protocol!=='https:'||target.username||target.password||target.port||target.pathname!=='/'||target.search||target.hash||!(target.hostname===`${project}.web.app`||target.hostname.startsWith(`${project}--`)&&target.hostname.endsWith('.web.app')))throw Error('Exact project Hosting or isolated preview origin required');
const paths=[...new Set([...execFileSync('git',['diff','e1c3c9a','--name-only'],{encoding:'utf8'}).trim().split('\n'),'js/core/pricing-history-policy.js'])].filter(p=>/^(js\/|css\/|index\.html$|sw\.js$)/.test(p));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),assets=[];
for(let i=0;i<paths.length;i+=8)await Promise.all(paths.slice(i,i+8).map(async path=>{
 const response=await fetch(`${target.origin}/${path}?verify=repair-307`),body=Buffer.from(await response.arrayBuffer()),sha256=hash(body),match=response.ok&&sha256===hash(fs.readFileSync(path));assets.push({path,status:response.status,sha256,match});if(!match)process.exitCode=1;
}));
const result={project,targetOrigin:target.origin,dataWrites:0,assets:assets.sort((a,b)=>a.path.localeCompare(b.path))};
if(project==='danbridge-d8877'){
 const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();await require(root+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});const {Client}=require(root+'/apiv2.js'),api=require(root+'/api.js'),cloud=new Client({auth:true,apiVersion:'v1',urlPrefix:api.firestoreOrigin()});
 const decode=v=>v?.stringValue??v?.timestampValue??v?.booleanValue??(v?.integerValue!==undefined?Number(v.integerValue):null);
 result.operational={};for(const path of ['productionRecordRuntime/control','productionRecordRuntime/safety','systemHealth/ownerAlert']){const r=await cloud.get(`projects/${project}/databases/(default)/documents/companies/danbridge/${path}`,{skipLog:{resBody:true}}),fields=r.body.fields||{};result.operational[path]=Object.fromEntries(['state','writeAllowed','writeTakeover','activationEpoch','status','checkedAt','updatedAt','recentErrors','pendingRequests'].filter(k=>k in fields).map(k=>[k,decode(fields[k])]))}
 const rules=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()});result.ruleset=(await rules.get(`/projects/${project}/releases/cloud.firestore`)).body.rulesetName;
 const functions=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});result.functions=[];for(const name of ['productionTrustedOperation','productionSchedulerOperation']){const r=(await functions.get(`/projects/${project}/locations/asia-east1/functions/${name}`,{skipLog:{resBody:true}})).body;result.functions.push({name,state:r.state,updateTime:r.updateTime,revision:r.serviceConfig?.revision});if(r.state!=='ACTIVE')process.exitCode=1;}
}
console.log(JSON.stringify(result,null,2));
