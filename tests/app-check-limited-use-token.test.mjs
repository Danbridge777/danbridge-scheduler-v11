import test from 'node:test';
import assert from 'node:assert/strict';
import {createLimitedUseAppCheckTokenPool,takeFreshLimitedUseAppCheckToken} from '../js/core/app-check-limited-use-token.js';

const appCheck=Object.freeze({name:'app-check'});

test('warm 重用同一枚預取 token，take 後立即排下一枚且不重複取用',async()=>{
 let now=1000,calls=0;const scheduled=[];
 const pool=createLimitedUseAppCheckTokenPool({appCheck,getLimitedUseToken:async input=>{assert.strictEqual(input,appCheck);calls++;return{token:`token-000${calls}`}},now:()=>now,schedule:callback=>scheduled.push(callback)});
 const first=pool.warm();assert.strictEqual(pool.warm(),first);assert.equal(calls,1);assert.equal(await pool.take(),'token-0001');assert.equal(calls,1);assert.equal(scheduled.length,1);
 scheduled.shift()();assert.equal(calls,2);assert.equal(await pool.take(),'token-0002');assert.equal(calls,2)
});

test('超過最大 token 年齡時丟棄舊值並取新值',async()=>{
 let now=0,calls=0;const scheduled=[];
 const pool=createLimitedUseAppCheckTokenPool({appCheck,getLimitedUseToken:async()=>({token:`expired-${++calls}`}),now:()=>now,schedule:callback=>scheduled.push(callback),warmCacheMs:90_000,maxTokenAgeMs:120_000});
 await pool.warm();now=120_001;assert.equal(await pool.take(),'expired-2');assert.equal(calls,2);assert.equal(scheduled.length,1)
});

test('取 token 失敗會清空 slot，下一次 warm 可重新取得',async()=>{
 let calls=0;const pool=createLimitedUseAppCheckTokenPool({appCheck,getLimitedUseToken:async()=>{calls++;if(calls===1)throw new Error('network');return{token:'recovered-token'}},schedule:()=>{}});
 await assert.rejects(pool.warm(),/network/);assert.equal(await pool.take(),'recovered-token');assert.equal(calls,2)
});

test('缺少 App Check 或 token 格式錯誤一律 fail closed',async()=>{
 const unavailable=createLimitedUseAppCheckTokenPool({appCheck:null,getLimitedUseToken:async()=>({token:'never-used'}),unavailableMessage:'App Check unavailable'});assert.equal(unavailable.warm(),null);await assert.rejects(()=>unavailable.take(),/App Check unavailable/);
 const malformed=createLimitedUseAppCheckTokenPool({appCheck,getLimitedUseToken:async()=>({token:'short'}),missingMessage:'token missing'});await assert.rejects(malformed.warm(),/token missing/);
 await assert.rejects(()=>takeFreshLimitedUseAppCheckToken({appCheck,getLimitedUseToken:async()=>({}),missingMessage:'fresh missing'}),/fresh missing/)
});

test('通知 fresh token 每次獨立取得，不共用 scheduler pool',async()=>{
 let calls=0;const getLimitedUseToken=async input=>{assert.strictEqual(input,appCheck);return{token:`fresh-000${++calls}`}};
 assert.equal(await takeFreshLimitedUseAppCheckToken({appCheck,getLimitedUseToken}),'fresh-0001');assert.equal(await takeFreshLimitedUseAppCheckToken({appCheck,getLimitedUseToken}),'fresh-0002');assert.equal(calls,2)
});
