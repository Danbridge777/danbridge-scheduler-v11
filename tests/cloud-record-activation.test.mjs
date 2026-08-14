import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFullRecordCandidateManifest,buildRoleViewCandidateManifest,buildAtomicRecordActivation,evaluateAtomicRecordActivation} from '../js/core/cloud-record-activation.js';

const full=overrides=>buildFullRecordCandidateManifest({environment:'staging',manifestId:'full-manifest-1',sourceHash:'hash-1',collectionCount:16,documentCount:1709,activeCount:1709,tombstoneCount:0,...overrides});
const roles=overrides=>buildRoleViewCandidateManifest({environment:'staging',manifestId:'role-manifest-1',runId:'role-run-1',sourceHash:'hash-1',viewCount:7,documentCount:2353,...overrides});

test('完整候選與全部角色候選同一版本才建立不接管讀寫的原子控制',()=>{
 const fullManifest=full(),roleManifest=roles(),activation=buildAtomicRecordActivation({environment:'staging',fullManifest,roleManifest,currentSourceHash:'hash-1'});
 assert.equal(activation.readTakeover,false);assert.equal(activation.writeTakeover,false);assert.equal(activation.viewCount,7);
 assert.deepEqual(evaluateAtomicRecordActivation({activation,fullManifest,roleManifest,currentSourceHash:'hash-1'}),{eligible:true,reason:'',readTakeover:false,writeTakeover:false});
});

test('來源版本改變或 full 與 role hash 不同立即拒絕',()=>{
 assert.throws(()=>buildAtomicRecordActivation({environment:'staging',fullManifest:full(),roleManifest:roles(),currentSourceHash:'hash-2'}),/版本已改變/);
 assert.throws(()=>buildAtomicRecordActivation({environment:'staging',fullManifest:full(),roleManifest:roles({sourceHash:'hash-2'}),currentSourceHash:'hash-1'}),/版本已改變/);
});

test('缺筆、多筆或有效與墓碑計數不一致不得建立 full manifest',()=>{
 for(const counts of [{documentCount:1708},{documentCount:1710},{activeCount:1708},{tombstoneCount:1}])assert.throws(()=>full(counts),/筆數無效/);
});

test('中斷、未驗證與缺少角色 run 都不得啟用',()=>{
 const fullManifest={...full(),state:'writing'},roleManifest=roles();
 assert.throws(()=>buildAtomicRecordActivation({environment:'staging',fullManifest,roleManifest,currentSourceHash:'hash-1'}),/尚未完整驗證/);
 assert.throws(()=>buildRoleViewCandidateManifest({environment:'staging',manifestId:'role-manifest-1',sourceHash:'hash-1',viewCount:7,documentCount:2353}),/輸入無效/);
});

test('控制文件任一 identity、hash、筆數或接管旗標被改動都拒絕',()=>{
 const fullManifest=full(),roleManifest=roles(),activation=buildAtomicRecordActivation({environment:'staging',fullManifest,roleManifest,currentSourceHash:'hash-1'});
 for(const changed of [{sourceHash:'forged'},{documentCount:1708},{roleRunId:'other'},{viewCount:6},{readTakeover:true},{writeTakeover:true}]){
  const result=evaluateAtomicRecordActivation({activation:{...activation,...changed},fullManifest,roleManifest,currentSourceHash:'hash-1'});assert.equal(result.eligible,false);
 }
});
