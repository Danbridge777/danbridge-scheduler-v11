import test from 'node:test';
import assert from 'node:assert/strict';
import {isRetryableAuthPermissionError,loadProfileAfterAuthReady} from '../js/core/cloud-auth-profile-bootstrap.js';

test('只把 Firestore permission-denied 視為可重試的登入權限競態',()=>{
 assert.equal(isRetryableAuthPermissionError({code:'permission-denied'}),true);
 assert.equal(isRetryableAuthPermissionError({code:'firestore/permission-denied'}),true);
 assert.equal(isRetryableAuthPermissionError({code:'unavailable'}),false);
 assert.equal(isRetryableAuthPermissionError(new Error('not authorized')),false);
});

test('先確認權杖，再讀取權限資料',async()=>{
 const calls=[];
 const profile=await loadProfileAfterAuthReady({user:{getIdToken:async force=>calls.push(['token',force])},loadProfile:async()=>{calls.push(['profile']);return{role:'owner'}},sleep:async()=>{}});
 assert.deepEqual(profile,{role:'owner'});
 assert.deepEqual(calls,[['token',false],['profile']]);
});

test('短暫 permission-denied 會退避並強制更新權杖後成功',async()=>{
 const calls=[];let reads=0;
 const profile=await loadProfileAfterAuthReady({
  user:{getIdToken:async force=>calls.push(['token',force])},
  loadProfile:async()=>{calls.push(['profile']);if(reads++===0)throw Object.assign(new Error('transient'),{code:'permission-denied'});return{role:'owner'}},
  sleep:async delay=>calls.push(['sleep',delay]),retryDelay:25
 });
 assert.deepEqual(profile,{role:'owner'});
 assert.deepEqual(calls,[['token',false],['profile'],['sleep',25],['token',true],['profile']]);
});

test('真正未授權錯誤不重試也不改寫',async()=>{
 const calls=[];
 await assert.rejects(()=>loadProfileAfterAuthReady({user:{getIdToken:async force=>calls.push(['token',force])},loadProfile:async()=>{calls.push(['profile']);throw new Error('This account has been deactivated.')},sleep:async delay=>calls.push(['sleep',delay])}),/deactivated/);
 assert.deepEqual(calls,[['token',false],['profile']]);
});

test('持續 permission-denied 最多嘗試三次後仍拒絕',async()=>{
 const calls=[];
 await assert.rejects(()=>loadProfileAfterAuthReady({
  user:{getIdToken:async force=>calls.push(['token',force])},
  loadProfile:async()=>{calls.push(['profile']);throw Object.assign(new Error('denied'),{code:'permission-denied'})},
  sleep:async delay=>calls.push(['sleep',delay]),retryDelay:10
 }),error=>error?.code==='permission-denied');
 assert.deepEqual(calls,[['token',false],['profile'],['sleep',10],['token',true],['profile'],['sleep',20],['token',true],['profile']]);
});
