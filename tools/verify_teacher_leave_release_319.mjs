// Read-only deployed-code/settings verification. Never writes Firebase data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [project,mode,baselinePath]=process.argv.slice(2);
assert.ok(['danbridge-d8877','danbridge-d8877-staging'].includes(project));
assert.ok(['baseline','verify'].includes(mode));
assert.equal(baselinePath,`/private/tmp/danbridge-319-${project}-leave-before.json`);
const name=project==='danbridge-d8877'?'productionTeacherLeaveOperation':'stagingPublishedWorkspaceOperation';
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=new Client({auth:true,apiVersion:'v2',urlPrefix:'https://cloudfunctions.googleapis.com'});
const current=(await api.get(`/projects/${project}/locations/asia-east1/functions/${name}`,{skipLog:{resBody:true}})).body;
assert.equal(current.state,'ACTIVE');
if(mode==='baseline'){
 await writeFile(baselinePath,JSON.stringify(current,null,2),{flag:'wx'});
 console.log(JSON.stringify({project,name,state:current.state,revision:current.serviceConfig.revision,baselinePath,remoteWrites:0}));
}else{
 const before=JSON.parse(await readFile(baselinePath,'utf8'));
 for(const key of ['serviceAccountEmail','availableMemory','timeoutSeconds','maxInstanceCount','minInstanceCount','maxInstanceRequestConcurrency','ingressSettings','vpcConnector','vpcConnectorEgressSettings'])assert.deepEqual(current.serviceConfig[key]??null,before.serviceConfig[key]??null,`Changed setting ${key}`);
 const env=x=>Object.fromEntries(Object.entries(x.serviceConfig.environmentVariables||{}).filter(([key])=>key.startsWith('DANBRIDGE_')));
 assert.deepEqual(env(current),env(before));
 const source=current.buildConfig.source.storageSource,token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]);
 assert.equal(source.bucket,project==='danbridge-d8877'?'gcf-v2-sources-251283850754-asia-east1':'gcf-v2-sources-883029466360-asia-east1');
 const url=new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(source.bucket)}/o/${encodeURIComponent(source.object)}`);url.searchParams.set('alt','media');url.searchParams.set('generation',source.generation);
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token.access_token}`}});assert.equal(response.status,200);
 const directory=await mkdtemp('/private/tmp/danbridge-319-source-'),zip=directory+'/source.zip';await writeFile(zip,Buffer.from(await response.arrayBuffer()));
 const paths=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n').filter(path=>/^(functions|js)\/.*\.(cjs|mjs|js)$/.test(path));assert.ok(paths.includes('functions/teacher-leave-runtime.cjs'));
 const sha=x=>createHash('sha256').update(x).digest('hex'),files=[];
 for(const path of paths){assert.ok(!path.split('/').includes('..'));const hash=sha(execFileSync('unzip',['-p',zip,path],{maxBuffer:10000000}));assert.equal(hash,sha(await readFile(path)),`Source mismatch: ${path}`);files.push({path,sha256:hash})}
 console.log(JSON.stringify({project,name,release:'20.26.319',state:current.state,revision:current.serviceConfig.revision,sourceGeneration:source.generation,sourceFilesVerified:files.length,sourceManifestSha256:sha(JSON.stringify(files)),settingsPreserved:true,remoteWrites:0},null,2));
}
