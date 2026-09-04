import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('staging V2 登入不再嘗試舊 users 或 accounts 瀏覽器寫入',async()=>{
  const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
  assert.match(source,/async function recordSuccessfulLogin\(user,profile\)\{[\s\S]*?if\(DANBRIDGE_ENVIRONMENT==='staging'\)return;/);
  assert.doesNotMatch(source,/owner display name sync failed/);
});
