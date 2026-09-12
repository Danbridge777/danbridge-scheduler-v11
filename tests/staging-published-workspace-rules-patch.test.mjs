import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchPublishedWorkspaceRules,revisePublishedWorkspaceRules,digest,WORKSPACE_RULES_MARKER} from '../tools/staging-published-workspace-rules-patch.mjs';
test('minimal workspace Rules patch preserves every existing byte and rejects changed or ambiguous baselines',()=>{
 const template=readFileSync('firebase/firestore.rules','utf8'),baseline="rules_version='2';service cloud.firestore{match/databases/{database}/documents{function signedIn(){return request.auth!=null;}match/private/{id}{allow read,write:if false;}}}";
 const patch=patchPublishedWorkspaceRules(baseline,template,digest(baseline));
 assert.ok(patch.source.includes(WORKSPACE_RULES_MARKER));assert.ok(patch.source.endsWith('function signedIn(){return request.auth!=null;}match/private/{id}{allow read,write:if false;}}}'));
 assert.throws(()=>patchPublishedWorkspaceRules(baseline+' ',template,digest(baseline)));
 assert.throws(()=>patchPublishedWorkspaceRules(patch.source,template,digest(patch.source)));
 assert.throws(()=>patchPublishedWorkspaceRules(baseline,template.replace("root.purpose == 'normal-ui-published-280-synthetic-only'",'true'),digest(baseline)));
 const revised=revisePublishedWorkspaceRules(patch.source,baseline,patch.source,template,digest(patch.source));
 assert.equal(revised.source,patch.source);assert.equal(revised.baseSha256,digest(patch.source));
 assert.throws(()=>revisePublishedWorkspaceRules(patch.source+' ',baseline,patch.source,template,digest(patch.source)));
});
