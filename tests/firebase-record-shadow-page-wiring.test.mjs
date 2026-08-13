import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
const adapterSource=fs.readFileSync(new URL('../js/core/firebase-record-shadow-adapter.js',import.meta.url),'utf8');
const pwaSource=fs.readFileSync(new URL('../js/core/pwa-installation.js',import.meta.url),'utf8');

test('頁面匯入獨立 record-shadow adapter 且只公開專屬手動入口',()=>{
 assert.match(source,/import \{createFirebaseRecordShadowAdapter\} from '\.\/firebase-record-shadow-adapter\.js\?v=20\.26\.59'/);
 assert.match(source,/window\.__danbridgeRunStagingRecordShadow/);
 assert.match(source,/window\.__danbridgeGetStagingRecordShadowDiagnostic/);
 assert.doesNotMatch(source,/queueStagingRecordShadow[^\n]*uploadOwnerState|uploadOwnerState[^\n]*queueStagingRecordShadow/);
});

test('Checkpoint B 以版本化 service worker 解除舊 staging 快取',()=>{
 assert.match(pwaSource,/register\('\.\/sw\.js\?v=20\.26\.59'/);
});

test('staging Owner URL 測試入口只操作專用 ID 並保留既有影子狀態',()=>{
 assert.match(source,/recordShadowTest/);
 assert.match(source,/staging-record-writer-lesson/);
 assert.match(source,/staging-record-writer-student/);
 assert.match(source,/staging-record-writer-teacher/);
 assert.match(source,/current\.db/);
 assert.match(source,/stagingRecordShadowTestResult/);
 assert.match(source,/action==='inspect'/);
});

test('record-shadow 頁面入口硬鎖 staging Owner 並支援故障注入進度',()=>{
 assert.match(source,/DANBRIDGE_ENVIRONMENT!=='staging'\|\|cloudRole!=='owner'/);
 assert.match(source,/failBatch/);
 for(const field of ['state','sourceHash','totalWrites','completedWrites','totalBatches','completedBatches','activeCount','tombstoneCount','verified','error','startedAt','finishedAt'])assert.match(source,new RegExp(`${field}:`));
});

test('Firestore adapter 使用逐集合讀取與 transaction，不使用 deleteDoc',()=>{
 assert.match(adapterSource,/stagingRecordShadows/);
 assert.match(source,/getDocs\(collection\(cloud,/);
 assert.match(source,/runTransaction\(cloud/);
 assert.doesNotMatch(source,/deleteDoc\([^\n]*stagingRecordShadows/);
});
