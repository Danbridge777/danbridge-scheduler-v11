import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {patchStagingV2ListRules,STAGING_V2_LIST_PATHS,STAGING_V2_LIST_RULES_MARKER,STAGING_V2_HEAD_RULES_MARKER} from '../tools/staging-v2-list-rules-patch.mjs';
const source="rules_version='2';service cloud.firestore{match/databases/{database}/documents{function v2OwnerRuntimeReadOpen(a,b){return false;}function v2OwnerRuntimeH0HeadReadOpen(a,b,c){return false;}function isRecordSyncV2GenesisCollection(c){return false;}match/stagingActiveRecordV2Heads/{companyId}/epochs/{targetV2Epoch}{allow read:if isRecordSyncV2CutoverOperator(companyId)||v2OwnerRuntimeH0HeadReadOpen(companyId,targetV2Epoch,resource.data)||v2OwnerRuntimeReadOpen(companyId,targetV2Epoch);}"+STAGING_V2_LIST_PATHS.map(p=>`match/${p}{allow read:if v2OwnerRuntimeReadOpen(companyId,targetV2Epoch)&&false;allow write:if false;}`).join('')+'}}';
const digest=s=>createHash('sha256').update(s).digest('hex');
const options={projectId:'danbridge-d8877-staging',expectedBaseSha256:digest(source)};
test('only three staging list clauses change; original reads and writes restore byte-for-byte',()=>{
 const result=patchStagingV2ListRules(source,options);let restored=result.source;
 assert.equal(result.changedPaths.length,4);assert.equal(result.insertions.length,3);assert.match(result.source,new RegExp(STAGING_V2_HEAD_RULES_MARKER));
 for(const {insertion,getReplacement,readOriginal} of result.insertions){assert.match(insertion,/v2OwnerRuntimeReadOpen/);assert.doesNotMatch(insertion,/allow (?:write|create|update|delete)/);assert.match(getReplacement,/allow get/);restored=restored.replace(insertion,'').replace(getReplacement,readOriginal);}
 restored=restored.replace(result.headReplacement.newHead,result.headReplacement.oldHead);assert.equal(restored,source);assert.equal(result.source.split(STAGING_V2_LIST_RULES_MARKER).length-1,3);
 assert.equal(result.source.split('&&isRecordSyncV2GenesisCollection(collectionId)').length-1,2);
});
test('production, changed base, duplicate/missing namespaces and repeated patch are rejected',()=>{
 assert.throws(()=>patchStagingV2ListRules(source,{...options,projectId:'danbridge-d8877'}),/Staging-only/);
 assert.throws(()=>patchStagingV2ListRules(source+' ',options),/base changed/);
 assert.throws(()=>patchStagingV2ListRules(source,{projectId:options.projectId}),/base changed/);
 for(const changed of [source.replace(STAGING_V2_LIST_PATHS[0],'other'),source+`match/${STAGING_V2_LIST_PATHS[0]}{}`])assert.throws(()=>patchStagingV2ListRules(changed,{...options,expectedBaseSha256:digest(changed)}),/one exact/);
 const patched=patchStagingV2ListRules(source,options).source;
 assert.throws(()=>patchStagingV2ListRules(patched,{...options,expectedBaseSha256:digest(patched)}),/already present/);
});
