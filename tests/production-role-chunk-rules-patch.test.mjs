import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {patchProductionRoleChunkRules,PRODUCTION_ROLE_CHUNK_RULES_MARKER} from '../tools/production-role-chunk-rules-patch.mjs';
const base="rules_version='2';service cloud.firestore{match/databases/{database}/documents{function signedIn(){return request.auth!=null;}function emailKey(){return request.auth.token.email;}function isOwner(){return false;}match/users/{uid}{allow read:if signedIn();}}}";
const digest=value=>createHash('sha256').update(value).digest('hex'),patch=source=>patchProductionRoleChunkRules(source,{expectedBaseSha256:digest(base)});
test('production role patch is an exact additive insertion; existing rules stay byte-identical',()=>{
 const result=patch(base),prefix=base.indexOf('function signedIn');
 assert.equal(result.changed,true);assert.equal(result.baseSha256,digest(base));
 assert.equal(result.source.slice(0,prefix),base.slice(0,prefix));
 assert.ok(result.source.endsWith(base.slice(prefix)));
 assert.match(result.source,/allow list, write: if false/);
 assert.match(result.source,/publishedTargetMatches\(identity\)/);
 assert.doesNotMatch(result.source,/roleRecordTargetScopeMatches/,'must not depend on a helper absent from production');
 assert.equal(patch(result.source).changed,false);assert.equal(patch(result.source).source,result.source);
});
test('drift, malformed patch, duplicate path and wrong service fail before producing deployable Rules',()=>{
 assert.throws(()=>patch(base+' '),/drift/);
 const patched=patch(base).source;
 assert.throws(()=>patch(patched.replace('target.active == true','target.active != false')),/modified/);
 assert.throws(()=>patch(patched+PRODUCTION_ROLE_CHUNK_RULES_MARKER),/already exists/);
 const duplicate=base.replace('match/users','match/productionRoleChunkViews/{scope}{allow read:if true;}match/users');
 assert.throws(()=>patchProductionRoleChunkRules(duplicate,{expectedBaseSha256:digest(duplicate)}),/already exists/);
 const wrong=base.replace('cloud.firestore','firebase.storage');
 assert.throws(()=>patchProductionRoleChunkRules(wrong,{expectedBaseSha256:digest(wrong)}),/identity/);
 assert.throws(()=>patchProductionRoleChunkRules(base),/drift/,'default must pin the real published baseline');
});
