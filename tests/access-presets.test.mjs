import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessPreset} from '../js/core/access-presets.js';

test('Lucas/AA preset separates visible schedules from managed branch and blocks finance and movement',()=>{
 const p=buildAccessPreset('branch_schedule',{teacherId:'aa',branchIds:['art_museum']});
 assert.deepEqual(p.branchIds,['art_museum']);assert.deepEqual(p.scheduleBranchIds,['art_museum','hexi']);
 assert.equal(p.hideFinancials,true);assert.equal(p.canMoveSchedule,false);assert.equal(p.canManageSchedule,false);assert.equal(p.readOnly,true);
 assert.equal(p.canSubmitOwnReports,false);
 p.scheduleBranchIds.pop();assert.equal(buildAccessPreset('branch_schedule',{teacherId:'lucas',branchIds:['art_museum']}).scheduleBranchIds.length,2);
});
test('role presets require explicit identity and scope; no fallback to owner',()=>{
 assert.throws(()=>buildAccessPreset('unknown'),/未知/);
 assert.throws(()=>buildAccessPreset('teacher'),/綁定/);
 assert.throws(()=>buildAccessPreset('branch_schedule',{teacherId:'aa'}),/校區/);
 assert.throws(()=>buildAccessPreset('branch_schedule',{teacherId:'aa',branchIds:['other']}),/校區/);
 assert.equal(buildAccessPreset('teacher',{teacherId:'t'}).canManageSchedule,false);
 assert.equal(buildAccessPreset('scheduler',{teacherId:'t'}).canManageSchedule,true);
 assert.equal(buildAccessPreset('owner').role,'owner');
});

test('local schedule preset never widens managed scope and does not share mutable arrays',()=>{
 const input=['art_museum'];const p=buildAccessPreset('branch_local_schedule',{teacherId:'aa',branchIds:input});
 assert.deepEqual(p.scheduleBranchIds,['art_museum']);input.push('hexi');assert.deepEqual(p.branchIds,['art_museum']);
 assert.equal(p.hideFinancials,true);assert.equal(p.canMoveSchedule,false);assert.equal(p.readOnly,true);
});
