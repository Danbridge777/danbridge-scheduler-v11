// Explicit, staging-only release of an exact emulator-tested artifact.
// Does not deploy hosting/functions or modify business/access documents.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {patchStagingNotificationScopeRules} from './production-notification-scope-rules-patch.mjs';
const [directory,mode]=process.argv.slice(2),project='danbridge-d8877-staging';
assert.match(directory||'',/^\/private\/tmp\/danbridge-318-notification-rules-[A-Za-z0-9]+$/);
assert.ok(['--check','--deploy'].includes(mode));
const hash=s=>createHash('sha256').update(s).digest('hex');
const evidence=JSON.parse(await readFile(directory+'/evidence.json','utf8'));
assert.equal(evidence.project,project);
const baseline=await readFile(directory+'/baseline.rules','utf8'),candidate=await readFile(directory+'/candidate.rules','utf8');
assert.equal(hash(baseline),evidence.baseSha256);assert.equal(hash(candidate),evidence.candidateSha256);
assert.equal(patchStagingNotificationScopeRules(baseline).source,candidate);
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=require(cli+'/apiv2.js'),api=require(cli+'/api.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()}),rules=require(cli+'/gcp/rules.js');
const readLive=async()=>{const release=(await client.get(`/projects/${project}/releases/cloud.firestore`)).body;assert.ok(release.rulesetName.startsWith(`projects/${project}/rulesets/`));const files=(await client.get('/'+release.rulesetName,{skipLog:{resBody:true}})).body.source.files;assert.equal(files.length,1);return {release,files,sha256:hash(files[0].content)}};
const before=await readLive();assert.ok([evidence.baseSha256,evidence.candidateSha256].includes(before.sha256),'Staging Rules drift');
const files=[{...before.files[0],content:candidate}],compile=await rules.testRuleset(project,files);
assert.equal((compile.body?.issues||[]).filter(issue=>issue.severity==='ERROR').length,0,JSON.stringify(compile.body?.issues));
if(mode==='--deploy'&&before.sha256!==evidence.candidateSha256){
 for(const file of ['js/core/firebase-auth-and-cloud-sync.module.js','js/core/schedule-notification-read-scope.js']){
  const response=await fetch(`https://${project}.web.app/${file}?scope-release=318`,{cache:'no-store'});assert.equal(response.status,200);
  assert.equal(hash(await response.text()),hash(await readFile(new URL('../'+file,import.meta.url),'utf8')),'Deploy the exact new frontend first');
 }
 assert.equal((await readLive()).sha256,evidence.baseSha256,'Rules changed after compile');
 const name=await rules.createRuleset(project,files);assert.ok(name.startsWith(`projects/${project}/rulesets/`));
 await writeFile(directory+'/created-ruleset.json',JSON.stringify({name,candidateSha256:evidence.candidateSha256}));
 // Recheck the baseline immediately before publishing the prepared version.
 assert.equal((await readLive()).sha256,evidence.baseSha256,'Rules changed before publish');
 await rules.updateRelease(project,name,'cloud.firestore');
}
const after=await readLive();if(mode==='--deploy')assert.equal(after.sha256,evidence.candidateSha256);
console.log(JSON.stringify({project,state:mode==='--deploy'?'deployed-and-readback-verified':'compiled-only',ruleset:after.release.rulesetName,sha256:after.sha256,candidateSha256:evidence.candidateSha256,businessWrites:0}));
