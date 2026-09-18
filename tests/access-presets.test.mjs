import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessPreset,isSchedulerAccess,listAccessPresets} from '../js/core/access-presets.js';

test('Lucas/AA preset separates two-campus schedules from managed-branch finance and movement',()=>{
 const p=buildAccessPreset('branch_schedule',{teacherId:'aa',branchIds:['art_museum']});
 assert.deepEqual(p.branchIds,['art_museum']);assert.deepEqual(p.scheduleBranchIds,['art_museum','hexi']);
 assert.equal(p.hideFinancials,true);assert.equal(p.canViewBranchFinance,true);assert.equal(p.canMoveSchedule,false);assert.equal(p.canManageSchedule,false);assert.equal(p.readOnly,true);
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
 assert.equal(p.hideFinancials,true);assert.equal(p.canViewBranchFinance,true);assert.equal(p.canMoveSchedule,false);assert.equal(p.readOnly,true);
});

test('permission packages are discoverable by account group without exposing mutable policy objects',()=>{
 assert.deepEqual(listAccessPresets('teacher').map(row=>row.id),['teacher','scheduler']);
 assert.deepEqual(listAccessPresets('branch_manager').map(row=>row.id),['branch_schedule','branch_local_schedule']);
 const rows=listAccessPresets('teacher');rows.pop();assert.equal(listAccessPresets('teacher').length,2);
});

test('scheduler capability is account data, never an email allowlist',()=>{
 const scheduler=buildAccessPreset('scheduler',{teacherId:'teacher-42'});
 assert.equal(isSchedulerAccess({...scheduler,active:true,email:'new.scheduler@gmail.com'}),true);
 assert.equal(isSchedulerAccess({...scheduler,active:false}),false);
 assert.equal(isSchedulerAccess({...scheduler,teacherId:''}),false);
 assert.equal(isSchedulerAccess(buildAccessPreset('teacher',{teacherId:'teacher-42'})),false);
});
