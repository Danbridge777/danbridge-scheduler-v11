import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const rules=await readFile(new URL('../firebase/firestore.rules',import.meta.url),'utf8');
const deployRules=await readFile(new URL('../firebase/firestore.rules.deploy',import.meta.url),'utf8');
const functionBody=(name,next)=>rules.slice(rules.indexOf(`function ${name}(`),rules.indexOf(`function ${next}(`));
function quotedLiterals(text){
 const out=[];let quote='',escaped=false,lineComment=false,blockComment=false,start=-1;
 for(let index=0;index<text.length;index++){
  const char=text[index],next=text[index+1];
  if(lineComment){if(char==='\n')lineComment=false;continue}
  if(blockComment){if(char==='*'&&next==='/'){blockComment=false;index++}continue}
  if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote){out.push(text.slice(start,index+1));quote='';start=-1}continue}
  if(char==='/'&&next==='/'){lineComment=true;index++;continue}
  if(char==='/'&&next==='*'){blockComment=true;index++;continue}
  if(char==='"'||char==="'"){quote=char;start=index}
 }
 assert.equal(quote,'');assert.equal(blockComment,false);return out;
}

test('rules deployment minifier preserves every single-quoted policy/schema literal byte-for-byte',()=>{
 const sourceLiterals=new Set(quotedLiterals(rules));
 const deployedLiterals=quotedLiterals(deployRules);
 assert.ok(deployedLiterals.length>100);
 for(const literal of deployedLiterals)assert.ok(sourceLiterals.has(literal),`mutated Rules literal: ${literal}`);
 for(const literal of [
  "'danbridge-record-sync-v1-permanent-fence-v2'",
 "'danbridge-record-sync-v2-structural-active-control-v2'",
  "'danbridge-active-record-authority-head-v2'"
 ])assert.ok(deployedLiterals.includes(literal),literal);
});

test('frozen-source proof stays at the exact ten-call backup-Owner budget without a direct H read',()=>{
 const body=functionBody('validFrozenSourceProof','legacyV1CandidateWriteOpen');
 assert.equal((body.match(/\bget\(/g)??[]).length,7);
 assert.doesNotMatch(body,/get\([^\n]*stagingRecordSyncV1V2HardPauseReceipts/);
 for(const clause of [
  'data.targetV2Epoch == pair.targetV2Epoch',
  "data.proofId == 'v1-frozen-source:' + pair.hardPauseReceiptHash",
  'data.hardPauseReceiptHash == pair.hardPauseReceiptHash',
  "data.rawBackupId == 'v1-cutover-raw:' + pair.hardPauseReceiptHash",
  'writer.lastTransitionHash == data.hardPauseReceiptHash',
  'pair.pairHash == data.scanPairHash',
  'backup.scanPairHash == data.scanPairHash',
  'readback.backupId == data.rawBackupId',
  'request.time >= readback.persistedAt'
 ])assert.ok(body.includes(clause),clause);
});

test('hard-pause and U/V/Pair lineage artifacts remain create-only immutable',()=>{
 for(const collection of [
  'stagingRecordSyncV1V2HardPauseReceipts',
  'stagingRecordSyncV1PostPauseScans',
  'stagingRecordSyncV1PostPauseScanPairs'
 ]){
  const start=rules.indexOf(`match /${collection}/`);
  assert.notEqual(start,-1,collection);
  const block=rules.slice(start,rules.indexOf('\n    match /',start+1));
  assert.match(block,/allow update, delete: if false;/,collection);
 }
});

test('V2 Owner runtime read gate requires fence+active control+H1 and keeps every client write denied',()=>{
 const body=functionBody('v2OwnerRuntimeReadOpen','v2OwnerRuntimeH0HeadReadOpen');
 assert.equal((body.match(/\bget\(/g)??[]).length,3);
 assert.equal((body.match(/\bexists\(/g)??[]).length,3);
 for(const clause of [
  "fence.projectId == 'danbridge-d8877-staging'",
  "fence.fencePolicy == 'v1-all-mutation-surfaces-permanently-denied-no-resume-or-unfence'",
  "control.writerProtocol == 'v2' && control.writerGeneration == 2",
  'control.readAllowed == true && control.writeAllowed == true',
  'control.allowAuditAppends == true',
  "head.schema == 'danbridge-active-record-authority-head-v2'",
  'head.revision is int && head.revision >= 1',
  'head.sourceActiveControlHash == control.controlHash',
  'head.sourceStructuralHeadHash == fence.activeHeadHash'
 ])assert.ok(body.includes(clause),clause);
 for(const collection of ['stagingRecordSyncV2ActiveControls','stagingActiveRecordV2Baselines','stagingActiveRecordV2Records','stagingActiveRecordV2OperationReceipts','stagingActiveRecordV2SaveCommits']){
  const start=rules.indexOf(`match /${collection}/`);assert.notEqual(start,-1,collection);const block=rules.slice(start,rules.indexOf('\n    match /',start+1));assert.match(block,/v2OwnerRuntimeReadOpen/);assert.match(block,/allow create, update, delete: if false;/);
 }
});

test('V2 H0 Owner head-only bootstrap gate stays within budget and cannot open other namespaces',()=>{
 const body=functionBody('v2OwnerRuntimeH0HeadReadOpen','v2OwnerPrewriteGenesisReadOpen');
 assert.equal((body.match(/\bget\(/g)??[]).length,2);
 assert.equal((body.match(/\bexists\(/g)??[]).length,2);
 for(const clause of [
  "head.schema == 'danbridge-active-record-v2-structural-head0-v2'",
  'head.revision == 0',
  "head.headSaveId == ''",
  'head.operationCount == 0',
  'head.headHash == fence.activeHeadHash',
  'head.sourceCandidateControlHash == fence.candidateControlHash',
  'head.sourceCandidateHeadHash == fence.candidateHeadHash',
  'head.deploymentEvidenceHash == fence.deploymentEvidenceHash'
 ])assert.ok(body.includes(clause),clause);
 const headStart=rules.indexOf('match /stagingActiveRecordV2Heads/');
 const headBlock=rules.slice(headStart,rules.indexOf('\n    match /',headStart+1));
 assert.match(headBlock,/v2OwnerRuntimeH0HeadReadOpen\(companyId, targetV2Epoch, resource\.data\)/);
 for(const collection of ['stagingRecordSyncV2ActiveControls','stagingActiveRecordV2Baselines','stagingActiveRecordV2Records','stagingActiveRecordV2OperationReceipts','stagingActiveRecordV2SaveCommits']){
  const start=rules.indexOf(`match /${collection}/`);
  const block=rules.slice(start,rules.indexOf('\n    match /',start+1));
  assert.doesNotMatch(block,/v2OwnerRuntimeH0HeadReadOpen/);
 }
});

test('V2 Owner prewrite gate exposes only the three permanent-fence-bound Genesis verifier inputs',()=>{
 const body=functionBody('v2OwnerPrewriteGenesisReadOpen','v1PermanentFenceExists');
 assert.equal((body.match(/\bget\(/g)??[]).length,1);
 assert.equal((body.match(/\bexists\(/g)??[]).length,1);
 for(const clause of [
  'isPrimaryOwner()',
  "artifactId in ['manifest', 'readback', 'authority']",
  "fence.projectId == 'danbridge-d8877-staging'",
  'fence.targetV2Epoch == targetV2Epoch',
  'fence.seedId == seedId',
  'nonzeroSha256(fence.genesisAuthorityHash)',
  'nonzeroSha256(fence.genesisAuthorityAuditHash)',
  'nonzeroSha256(fence.parentFrozenSourceProofHash)'
 ])assert.ok(body.includes(clause),clause);
 const genesisStart=rules.indexOf('match /stagingRecordSyncV2Genesis/');
 const genesisBlock=rules.slice(genesisStart,rules.indexOf('\n    match /stagingRecordSyncV2GenesisAuthorities/',genesisStart));
 assert.match(genesisBlock,/match \/artifacts\/\{artifactId\}[\s\S]*v2OwnerPrewriteGenesisReadOpen\(companyId, targetV2Epoch, seedId, artifactId\)/);
 assert.doesNotMatch(genesisBlock.slice(0,genesisBlock.indexOf('match /artifacts/')),/v2OwnerPrewriteGenesisReadOpen/);
 const authorityStart=rules.indexOf('match /stagingRecordSyncV2GenesisAuthorities/');
 const authorityBlock=rules.slice(authorityStart,rules.indexOf('\n    match /',authorityStart+1));
 assert.match(authorityBlock,/v2OwnerPrewriteGenesisReadOpen\(companyId, targetV2Epoch, seedId, 'authority'\)/);
 for(const collection of ['stagingRecordSyncV2GenesisAuthorityAuditReceipts','stagingRecordSyncV2GenesisIdentityIndexes','stagingRecordSyncV2Reservations']){
  const start=rules.indexOf(`match /${collection}/`),block=rules.slice(start,rules.indexOf('\n    match /',start+1));
  assert.doesNotMatch(block,/v2OwnerPrewriteGenesisReadOpen/);
 }
});
