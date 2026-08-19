import test from 'node:test';
import assert from 'node:assert/strict';
import {decideOwnerActiveSaveIntent} from '../js/core/cloud-owner-active-save-intent.js';

test('同步中的相同資料 hash 只合併意圖，不增加版本或排第二輪',()=>{
 const result=decideOwnerActiveSaveIntent({nextHash:'hash-1',localDirtyHash:'hash-1',diagnostics:{dirty:false,queued:false,inFlight:true,retryPending:false}});
 assert.deepEqual(result,{action:'coalesce',queue:false,incrementMutation:false});
});

test('同步中真正的新 hash 必須保留為下一輪修改',()=>{
 const result=decideOwnerActiveSaveIntent({nextHash:'hash-2',localDirtyHash:'hash-1',diagnostics:{dirty:true,inFlight:true}});
 assert.deepEqual(result,{action:'queue',queue:true,incrementMutation:true});
});

test('控制器重建後相同未確認 hash 仍會進入恢復，不會永久忽略',()=>{
 const result=decideOwnerActiveSaveIntent({nextHash:'hash-1',localDirtyHash:'hash-1',diagnostics:{dirty:false,queued:false,inFlight:false,retryPending:false}});
 assert.deepEqual(result,{action:'recover',queue:true,incrementMutation:false});
});

test('已確認相同 hash 與雲端套用期間的 save hook 都是零排程',()=>{
 assert.equal(decideOwnerActiveSaveIntent({nextHash:'hash-1',lastUploadedHash:'hash-1'}).action,'noop-confirmed');
 assert.equal(decideOwnerActiveSaveIntent({nextHash:'hash-2',localDirtyHash:'hash-1',applyingCloud:true}).action,'ignore-cloud-apply');
});

test('空白目前 hash 立即拒絕，不能靜默吞掉未知資料',()=>{
 assert.throws(()=>decideOwnerActiveSaveIntent({nextHash:''}),/缺少目前資料 hash/);
});
