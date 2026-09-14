import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {patchProductionRoleChunkRules} from '../../tools/production-role-chunk-rules-patch.mjs';

// Explicit opt-in for testing the exact currently deployed source. Never patch
// this source, and reject drift from the separately reviewed release hash.
export async function readExactProductionRulesForEmulator(){
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 assert.match(process.env.DANBRIDGE_PRODUCTION_RULES_SHA256||'',/^[a-f0-9]{64}$/);
 const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();
 await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877',user:account.user,tokens:account.tokens});
 const {Client}=require(root+'/apiv2.js'),api=require(root+'/api.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()});
 const release=(await client.get('/projects/danbridge-d8877/releases/cloud.firestore')).body;
 assert.match(release.rulesetName,/^projects\/danbridge-d8877\/rulesets\/[a-zA-Z0-9-]+$/);
 const files=(await client.get('/'+release.rulesetName,{skipLog:{resBody:true}})).body.source.files;
 assert.equal(files.length,1);
 const source=files[0].content,sha256=createHash('sha256').update(source).digest('hex');
 assert.equal(sha256,process.env.DANBRIDGE_PRODUCTION_RULES_SHA256,'reviewed production Rules source must match exactly');
 console.log('EXACT_PRODUCTION_RULES_EMULATOR_ONLY '+JSON.stringify({ruleset:release.rulesetName,sha256,formalDataWrites:0,rulesDeployment:false}));
 return source;
}

// Production GET only. Test writes remain in the caller's loopback emulator.
export async function readPatchedProductionRulesForEmulator(){
 assert.equal(process.env.DANBRIDGE_VERIFY_PUBLISHED_PRODUCTION_RULES,'278');
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
 const require=createRequire(import.meta.url),root='/usr/local/lib/node_modules/firebase-tools/lib',account=require(root+'/auth.js').getGlobalDefaultAccount();
 await require(root+'/requireAuth.js').requireAuth({project:'danbridge-d8877',user:account.user,tokens:account.tokens});
 const {Client}=require(root+'/apiv2.js'),api=require(root+'/api.js'),client=new Client({auth:true,apiVersion:'v1',urlPrefix:api.rulesOrigin()});
 const release=(await client.get('/projects/danbridge-d8877/releases/cloud.firestore')).body;
 assert.match(release.rulesetName,/^projects\/danbridge-d8877\/rulesets\/[a-zA-Z0-9-]+$/);
 const files=(await client.get('/'+release.rulesetName,{skipLog:{resBody:true}})).body.source.files;
 assert.equal(files.length,1);
 const patch=patchProductionRoleChunkRules(files[0].content);
 console.log('PRODUCTION_RULES_PATCH_EMULATOR_ONLY '+JSON.stringify({ruleset:release.rulesetName,baseSha256:patch.baseSha256,candidateSha256:patch.afterSha256,formalDataWrites:0,rulesDeployment:false}));
 return patch.source;
}
