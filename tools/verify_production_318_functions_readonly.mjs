// Fixed release readback; no remote writes. Compare code and deployment settings.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const project='danbridge-d8877',baselinePath=process.argv[2];
assert.equal(baselinePath,'/private/tmp/danbridge-318-production-functions-before.json');
const before=JSON.parse(await readFile(baselinePath,'utf8'));
const names=['productionAcknowledgeScheduleNotification','productionHealthRefresh','productionTrustedOperation','productionSchedulerOperation'];
assert.deepEqual(before.map(x=>x.name),names);
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js');
const api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]);
const directory=await mkdtemp('/private/tmp/danbridge-318-source-readback-'),archives=new Map(),results=[];
const sha=x=>createHash('sha256').update(x).digest('hex');
const settings=['serviceAccountEmail','availableMemory','timeoutSeconds','maxInstanceCount','minInstanceCount','maxInstanceRequestConcurrency','ingressSettings','vpcConnector','vpcConnectorEgressSettings'];
for(const name of names){
 const current=(await api.get(`/projects/${project}/locations/asia-east1/functions/${name}`,{skipLog:{resBody:true}})).body;
 assert.equal(current.state,'ACTIVE');
 const previous=before.find(x=>x.name===name);
 const settingsChanges=[];
 for(const key of settings){
  const oldValue=previous.serviceConfig[key]??null,newValue=current.serviceConfig[key]??null;
  // CLI materialized its default only for this previously unset scheduled cap.
  // Record it explicitly; never generalize this exception to serving functions.
  if(name==='productionHealthRefresh'&&key==='maxInstanceCount'&&oldValue===null&&newValue===20)settingsChanges.push({key,before:null,after:20});
  else assert.deepEqual(newValue,oldValue,`${name}: ${key} changed`);
 }
 const transport=env=>Object.fromEntries(Object.entries(env||{}).filter(([key])=>key.startsWith('DANBRIDGE_')));
 assert.deepEqual(transport(current.serviceConfig.environmentVariables),transport(previous.serviceConfig.environmentVariables),`${name}: runtime mode changed`);
 const source=current.buildConfig.source.storageSource;
 assert.equal(source.bucket,'gcf-v2-sources-251283850754-asia-east1');assert.equal(source.bucket,previous.buildConfig.source.storageSource.bucket);assert.ok(source.object);assert.ok(source.generation);
 const key=JSON.stringify(source);let checked=archives.get(key);
 if(!checked){
  const url=new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(source.bucket)}/o/${encodeURIComponent(source.object)}`);
  url.searchParams.set('alt','media');url.searchParams.set('generation',source.generation);
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token.access_token}`}});assert.equal(response.status,200);
  const zip=directory+'/'+archives.size+'.zip';await writeFile(zip,Buffer.from(await response.arrayBuffer()));
  const entries=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n').filter(path=>/^(functions|js)\/.*\.(cjs|mjs|js)$/.test(path));
  assert.ok(entries.includes('functions/index.cjs'));assert.ok(entries.includes('functions/production-notification-acknowledge.cjs'));assert.ok(entries.includes('functions/production-role-capacity.cjs'));
  checked=[];
  for(const path of entries){assert.ok(!path.split('/').includes('..'));const hash=sha(execFileSync('unzip',['-p',zip,path],{maxBuffer:10000000}));assert.equal(hash,sha(await readFile(path)),`Deployed source mismatch: ${path}`);checked.push({path,sha256:hash})}
  archives.set(key,checked);
 }
 results.push({name,state:current.state,revision:current.serviceConfig.revision,updateTime:current.updateTime,sourceGeneration:source.generation,settingsPreserved:settingsChanges.length===0,settingsChanges,sourceFilesVerified:checked.length,sourceManifestSha256:sha(JSON.stringify(checked))});
}
console.log(JSON.stringify({project,release:'20.26.318',remoteWrites:0,results},null,2));
