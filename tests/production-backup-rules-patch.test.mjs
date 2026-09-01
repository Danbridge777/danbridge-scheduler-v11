import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {patchProductionBackupRules,PRODUCTION_BACKUP_RULES_MARKER} from '../tools/production-backup-rules-patch.mjs';

const base=`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    function isOwner() { return request.auth != null; }\n    match /companies/{companyId}/{document=**} { allow read, write: if isOwner(); }\n  }\n}\n`;
const digest=value=>createHash('sha256').update(value).digest('hex');

test('production 備份 Rules 只加入 production immutable 路徑且可重複驗證',()=>{
  const result=patchProductionBackupRules(base,{expectedBaseSha256:digest(base)});
  assert.equal(result.changed,true);
  assert.match(result.source,new RegExp(PRODUCTION_BACKUP_RULES_MARKER));
  assert.match(result.source,/environment == 'production'/);
  assert.doesNotMatch(result.source,/environment in \['staging','production'\]/);
  assert.match(result.source,/match \/dailyShardedBackups\/\{companyId\}\/days\/\{day\}/);
  assert.match(result.source,/match \/companies\/\{companyId\}\/dailyBackups\/\{day\}/);
  assert.match(result.source,/allow update: if false/);
  const repeat=patchProductionBackupRules(result.source,{expectedBaseSha256:'0'.repeat(64)});
  assert.equal(repeat.changed,false);
  assert.equal(repeat.afterSha256,result.afterSha256);
});

test('production Rules 漂移、錯誤環境與不完整 marker 全部 fail closed',()=>{
  assert.throws(()=>patchProductionBackupRules(base,{expectedBaseSha256:'f'.repeat(64)}),/drift/);
  assert.throws(()=>patchProductionBackupRules(base.replace('service cloud.firestore','service firebase.storage'),{expectedBaseSha256:digest(base)}),/identity/);
  assert.throws(()=>patchProductionBackupRules(base.replace('    match /companies','    // '+PRODUCTION_BACKUP_RULES_MARKER+'\n    match /companies'),{expectedBaseSha256:digest(base)}),/incomplete/);
  assert.throws(()=>patchProductionBackupRules(base.replace('    match /companies','    match /dailyShardedBackups/{x}/{y} { allow read: if true; }\n    match /companies'),{expectedBaseSha256:digest(base.replace('    match /companies','    match /dailyShardedBackups/{x}/{y} { allow read: if true; }\n    match /companies'))}),/already exist/);
});
