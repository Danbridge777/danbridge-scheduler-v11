// Read-only cloud API and source attestation for the exact capacity publishers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [mode]=process.argv.slice(2);assert.ok(['baseline','verify'].includes(mode));
const project='danbridge-d8877',baseline='/private/tmp/danbridge-capacity-320-functions-baseline.json';
const names=['productionTrustedOperation','productionSchedulerOperation','productionPublishRoleViews','productionHealthRefresh'];
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
const current=await Promise.all(names.map(async name=>(await api.get(`/projects/${project}/locations/asia-east1/functions/${name}`,{skipLog:{resBody:true}})).body));
for(const fn of current)assert.equal(fn.state,'ACTIVE');
if(mode==='baseline')await writeFile(baseline,JSON.stringify(current),{flag:'wx',mode:0o600});
else{
 const before=JSON.parse(await readFile(baseline,'utf8')),token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),seen=new Set();
 for(let i=0;i<current.length;i++){
  const now=current[i],old=before[i];assert.equal(now.name,old.name);
  for(const key of ['serviceAccountEmail','availableMemory','availableCpu','timeoutSeconds','maxInstanceCount','minInstanceCount','maxInstanceRequestConcurrency','ingressSettings','vpcConnector','vpcConnectorEgressSettings'])assert.deepEqual(now.serviceConfig[key]??null,old.serviceConfig[key]??null,`${names[i]} setting ${key}`);
  const env=x=>Object.fromEntries(Object.entries(x.serviceConfig.environmentVariables||{}).filter(([k])=>k.startsWith('DANBRIDGE_')&&k!=='DANBRIDGE_ROLE_TRANSPORT'));
  assert.deepEqual(env(now),env(old));assert.equal(now.serviceConfig.environmentVariables.DANBRIDGE_ROLE_TRANSPORT,'published-v1');
  const s=now.buildConfig.source.storageSource,key=JSON.stringify(s);if(seen.has(key))continue;
  assert.equal(s.bucket,'gcf-v2-sources-251283850754-asia-east1');
  const u=new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(s.bucket)}/o/${encodeURIComponent(s.object)}`);u.searchParams.set('alt','media');u.searchParams.set('generation',s.generation);
  const r=await fetch(u,{headers:{Authorization:`Bearer ${token.access_token}`}});assert.equal(r.status,200);
  const dir=await mkdtemp('/private/tmp/danbridge-capacity-source-'),zip=dir+'/source.zip';await writeFile(zip,Buffer.from(await r.arrayBuffer()),{mode:0o600});
  const paths=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n').filter(p=>/^(functions|js)\/.*\.(cjs|mjs|js)$/.test(p));
  const hash=x=>createHash('sha256').update(x).digest('hex');
  for(const p of paths){assert.ok(!p.split('/').includes('..'));assert.equal(hash(execFileSync('unzip',['-p',zip,p],{maxBuffer:10000000})),hash(await readFile(p)),`Source mismatch ${p}`)}
  seen.add(key);
 }
}
console.log(JSON.stringify({mode,remoteWrites:0,functions:current.map((f,i)=>({name:names[i],state:f.state,revision:f.serviceConfig.revision,transport:f.serviceConfig.environmentVariables?.DANBRIDGE_ROLE_TRANSPORT})),verified:mode==='verify'},null,2));
