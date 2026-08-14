import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SHARDED_DB_COLLECTION_KEYS} from '../js/core/cloud-sharded-store.js';
import {prepareImmutableMigrationBackup,verifyImmutableMigrationBackupReadback,sealImmutableMigrationBackup,verifyImmutableMigrationBackupManifest,sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty=()=>Object.fromEntries(SHARDED_DB_COLLECTION_KEYS.map(key=>[key,[]]));
function fixture(){const db=empty();db.lessons=[{id:'lesson-1',title:'安全復原'}];db.students=[{id:'student-1',name:'TEST'}];db.teachers=[{id:'teacher-1',name:'TEST'}];db.changes=[{type:'same'},{type:'same'}];return db}

test('完整雲端讀回才能建立不可覆寫 verified manifest',()=>{
 const {plan,chunks}=prepareImmutableMigrationBackup(fixture(),{hash,backupId:'backup-1',maxChunkBytes:4096});
 const readback=verifyImmutableMigrationBackupReadback(plan,chunks,{hash});
 const manifest=sealImmutableMigrationBackup(plan,readback,{verifiedBy:'owner-uid',verifiedByEmail:'owner@example.com'});
 assert.equal(manifest.state,'verified');assert.equal(manifest.verifiedHash,plan.sourceHash);
 assert.equal(verifyImmutableMigrationBackupManifest(manifest,{currentSourceHash:plan.sourceHash}),true);
 assert.deepEqual(readback.db,fixture());
});

test('瀏覽器同步 SHA-256 與 Node crypto 對相同 canonical JSON 完全一致',()=>{
 const value={z:'中文',a:{d:2,c:[3,1]}};const canonical={a:{c:[3,1],d:2},z:'中文'};
 assert.equal(sha256Canonical(value),hash(canonical));assert.match(sha256Canonical(value),/^[a-f0-9]{64}$/);
});

test('中斷、缺片、多片、重複與內容 hash 不符全部停止',()=>{
 const {plan,chunks}=prepareImmutableMigrationBackup(fixture(),{hash,backupId:'backup-2',maxChunkBytes:4096});
 assert.throws(()=>verifyImmutableMigrationBackupReadback(plan,chunks.slice(1),{hash}),/分片數|遺失/);
 assert.throws(()=>verifyImmutableMigrationBackupReadback(plan,[...chunks,{...chunks[0],chunkId:'lessons-9999',index:9999}],{hash}),/分片數|序號/);
 assert.throws(()=>verifyImmutableMigrationBackupReadback(plan,[...chunks,chunks[0]],{hash}),/重複/);
 const changed=chunks.map((row,index)=>index?row:{...row,items:[{id:'lesson-1',title:'遭竄改'}]});
 assert.throws(()=>verifyImmutableMigrationBackupReadback(plan,changed,{hash}),/雜湊/);
});

test('來源版本改變時舊備份不能作為切換前保護點',()=>{
 const {plan,chunks}=prepareImmutableMigrationBackup(fixture(),{hash,backupId:'backup-3',maxChunkBytes:4096});
 const manifest=sealImmutableMigrationBackup(plan,verifyImmutableMigrationBackupReadback(plan,chunks,{hash}),{verifiedBy:'owner-uid',verifiedByEmail:'owner@example.com'});
 assert.throws(()=>verifyImmutableMigrationBackupManifest(manifest,{currentSourceHash:'newer-hash'}),/版本已改變/);
});
