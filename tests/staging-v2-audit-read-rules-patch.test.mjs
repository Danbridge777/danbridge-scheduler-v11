import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchStagingV2AuditReadRules,STAGING_V2_AUDIT_READ_RULES_BASE_SHA256,STAGING_V2_AUDIT_READ_RULES_MARKER} from '../tools/staging-v2-audit-read-rules-patch.mjs';

const source=readFileSync('/private/tmp/danbridge-active-staging-firestore.rules','utf8');
test('只在精確active SHA加入audit append唯讀路徑，既有內容可逐字還原',()=>{const out=patchStagingV2AuditReadRules(source,{projectId:'danbridge-d8877-staging'});assert.equal(out.beforeSha256,STAGING_V2_AUDIT_READ_RULES_BASE_SHA256);assert.match(out.source,new RegExp(STAGING_V2_AUDIT_READ_RULES_MARKER));assert.match(out.source,/allow list:if v2OwnerRuntimeReadOpen\(companyId,targetV2Epoch\)/);assert.doesNotMatch(out.source,/stagingActiveRecordV2AuditAppends[^}]+allow (create|write|update|delete)/);assert.equal(out.source.replace(/match\/stagingActiveRecordV2AuditAppends[\s\S]*?\}\s*(?=match\/stagingRecordSyncV1PermanentFences)/,''),source)});
test('錯project、錯SHA與重複套用都拒絕',()=>{assert.throws(()=>patchStagingV2AuditReadRules(source,{projectId:'danbridge-d8877'}),/other project/);assert.throws(()=>patchStagingV2AuditReadRules(source+' ',{projectId:'danbridge-d8877-staging'}),/base changed/);const once=patchStagingV2AuditReadRules(source,{projectId:'danbridge-d8877-staging'}).source;assert.throws(()=>patchStagingV2AuditReadRules(once,{projectId:'danbridge-d8877-staging',expectedBaseSha256:patchStagingV2AuditReadRules(source,{projectId:'danbridge-d8877-staging'}).afterSha256}),/insertion boundary/)});
