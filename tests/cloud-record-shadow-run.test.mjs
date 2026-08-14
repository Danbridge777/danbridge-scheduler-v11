import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordShadowRunManifest,verifyRecordShadowRun,buildRecordShadowActivation} from '../js/core/cloud-record-shadow-run.js';

const base={runId:'run-1',sourceHash:'hash-1',documentCount:6,activeCount:3,tombstoneCount:3};

test('完整讀回才建立 verified run manifest',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.deepEqual(manifest,{schema:'danbridge-record-shadow-run-v1',environment:'staging',state:'writing',...base});
 assert.deepEqual(verifyRecordShadowRun(manifest,{...base}),{...manifest,state:'verified',verifiedHash:'hash-1'});
});

test('中斷 run、缺筆、多筆與計數不一致都不能 verified',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.throws(()=>buildRecordShadowActivation(manifest,{currentSourceHash:'hash-1'}),/尚未 verified/);
 for(const documentCount of [5,7])assert.throws(()=>verifyRecordShadowRun(manifest,{...base,documentCount}),/文件數/);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,activeCount:2,tombstoneCount:4}),/有效或墓碑數/);
});

test('hash 不符與 run identity 不符都不能 verified',()=>{
 const manifest=buildRecordShadowRunManifest(base);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,sourceHash:'other'}),/hash/);
 assert.throws(()=>verifyRecordShadowRun(manifest,{...base,runId:'other'}),/run identity/);
});

test('來源版本改變時禁止原子啟用 verified run',()=>{
 const verified=verifyRecordShadowRun(buildRecordShadowRunManifest(base),base);
 assert.throws(()=>buildRecordShadowActivation(verified,{currentSourceHash:'hash-2'}),/來源版本已改變/);
 assert.deepEqual(buildRecordShadowActivation(verified,{currentSourceHash:'hash-1'}),{schema:'danbridge-record-shadow-activation-v1',environment:'staging',activeRunId:'run-1',sourceHash:'hash-1',verifiedHash:'hash-1',documentCount:6,activeCount:3,tombstoneCount:3});
});
