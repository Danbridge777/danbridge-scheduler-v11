import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRecordReadTakeover} from '../js/core/cloud-record-read-takeover.js';

const db={lessons:[{id:'lesson-1'}]};
const eligible={eligible:true,reason:'',readTakeover:false,writeTakeover:false};

test('staging 手動演練可在完整驗證後選用逐筆資料',()=>{
 const result=decideRecordReadTakeover({environment:'staging',activationEvaluation:eligible,legacyHash:'hash-1',recordHash:'hash-1',recordDb:db,exercise:true});
 assert.equal(result.source,'records');assert.deepEqual(result.db,db);assert.notEqual(result.db,db);
});

test('一般流程在 readTakeover 尚未啟用時保留 legacy',()=>{
 assert.equal(decideRecordReadTakeover({environment:'staging',activationEvaluation:eligible,legacyHash:'hash-1',recordHash:'hash-1',recordDb:db}).source,'legacy');
});

test('production、控制失敗、版本或資料缺失全部 fail closed',()=>{
 for(const input of [
  {environment:'production',activationEvaluation:eligible,legacyHash:'hash-1',recordHash:'hash-1',recordDb:db,exercise:true},
  {environment:'staging',activationEvaluation:{eligible:false,reason:'manifest 缺失'},legacyHash:'hash-1',recordHash:'hash-1',recordDb:db,exercise:true},
  {environment:'staging',activationEvaluation:eligible,legacyHash:'hash-1',recordHash:'hash-2',recordDb:db,exercise:true},
  {environment:'staging',activationEvaluation:eligible,legacyHash:'hash-1',recordHash:'hash-1',recordDb:null,exercise:true}
 ])assert.equal(decideRecordReadTakeover(input).source,'legacy');
});
