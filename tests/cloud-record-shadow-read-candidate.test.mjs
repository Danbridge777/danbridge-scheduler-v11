import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRecordShadowReadCandidate} from '../js/core/cloud-record-shadow-read-candidate.js';

const db={lessons:[{id:'l1'}],students:[{id:'s1'}],teachers:[{id:'t1'}]};
const hashCore=value=>JSON.stringify(value);
const coreHash=hashCore(db);
const run={schema:'danbridge-record-shadow-run-v2',companyId:'danbridge',environment:'staging',state:'verified',runId:'run-2',sourceHash:'full-hash',verifiedHash:'full-hash',coreHash,documentCount:4,activeCount:3,tombstoneCount:1};
const activation={schema:'danbridge-record-shadow-activation-v2',companyId:'danbridge',environment:'staging',activeRunId:'run-2',sourceHash:'full-hash',verifiedHash:'full-hash',coreHash,documentCount:4,activeCount:3,tombstoneCount:1};
const readback={db,documentCount:4,activeCount:3,tombstoneCount:1};
const evaluate=overrides=>evaluateRecordShadowReadCandidate({activation,run,readback,currentSourceHash:'full-hash',hashCore,...overrides});

test('只有 v2 verified run、完整計數、full sourceHash 與獨立 coreHash 全部一致才具備候選資格',()=>{
 assert.deepEqual(evaluate(),{eligible:true,reason:'verified',runId:'run-2',sourceHash:'full-hash',coreHash,db});
});

test('目前 C2 v1 控制缺少 coreHash，明確不得成為讀取候選',()=>{
 assert.deepEqual(evaluate({activation:{...activation,schema:'danbridge-record-shadow-activation-v1',coreHash:undefined}}),{eligible:false,reason:'啟用控制格式無效'});
});

test('中斷、版本改變、缺筆、多筆與計數分類不符全部不得成為讀取候選',()=>{
 assert.match(evaluate({run:{...run,state:'writing'}}).reason,/verified run/);
 assert.match(evaluate({currentSourceHash:'newer'}).reason,/版本/);
 for(const changed of [{documentCount:3,activeCount:2,tombstoneCount:1},{documentCount:5,activeCount:4,tombstoneCount:1},{documentCount:4,activeCount:2,tombstoneCount:2}])assert.match(evaluate({readback:{...readback,...changed}}).reason,/文件數/);
 const forgedCounts={documentCount:3,activeCount:2,tombstoneCount:1};
 assert.match(evaluate({run:{...run,...forgedCounts},activation:{...activation,...forgedCounts},readback:{...readback,...forgedCounts}}).reason,/有效筆數/);
 assert.match(evaluate({readback:{...readback,db:{...db,finance:[]}}}).reason,/未知集合/);
});

test('run identity、整份來源 hash、控制 coreHash 或實際核心內容 hash 不符全部拒絕',()=>{
 assert.match(evaluate({activation:{...activation,activeRunId:'other'}}).reason,/identity/);
 assert.match(evaluate({run:{...run,companyId:'other'}}).reason,/company identity/);
 assert.match(evaluate({activation:{...activation,sourceHash:'other'}}).reason,/來源 hash/);
 assert.match(evaluate({activation:{...activation,coreHash:'other'}}).reason,/coreHash/);
 assert.match(evaluate({readback:{...readback,db:{...db,lessons:[{id:'changed'}]}}}).reason,/coreHash/);
 assert.match(evaluate({readback:{...readback,db:{...db,lessons:[{id:'same'},{id:'same'}]},activeCount:4,documentCount:5},run:{...run,activeCount:4,documentCount:5},activation:{...activation,activeCount:4,documentCount:5}}).reason,/重複/);
});
