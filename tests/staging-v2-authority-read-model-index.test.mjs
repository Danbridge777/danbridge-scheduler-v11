import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStagingV2AuditAppendIndex} from '../js/core/staging-v2-authority-read-model.js';

test('audit append下一號只看有效changes，歷史高序號tombstone不造成gap',()=>{
 const states=Array.from({length:16},(_,recordIndex)=>({recordIndex,deleted:false}));
 states.push({recordIndex:499,deleted:true},{recordIndex:211,deleted:true},{recordIndex:15,deleted:true});
 assert.equal(nextStagingV2AuditAppendIndex(states),16);
});

test('audit append保留既有有效gap但拒絕有效changes重號',()=>{
 assert.equal(nextStagingV2AuditAppendIndex([{recordIndex:0,deleted:false},{recordIndex:2,deleted:false},{recordIndex:99,deleted:true}]),3);
 assert.throws(()=>nextStagingV2AuditAppendIndex([{recordIndex:0,deleted:false},{recordIndex:0,deleted:false}]),/active changes index duplicate/);
});
