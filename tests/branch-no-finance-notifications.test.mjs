import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as projection from '../js/core/production-role-view-projection.js';
import * as notificationPolicy from '../js/core/production-notification-policy.js';
import {sha256Canonical} from '../js/core/cloud-immutable-migration-backup.js';
const require=createRequire(import.meta.url);
const {createProductionScheduleNoticeBuilder}=require('../functions/production-scheduler-runtime.cjs');
const {buildNotifications}=require('../functions/staging-derived-delivery-runtime.cjs');
const access={email:'aa0966626336@gmail.com',role:'branch_manager',companyId:'danbridge',active:true,teacherId:'aa',branchIds:['art_museum'],hideFinancials:true,scheduleBranchIds:['art_museum','hexi'],canMoveSchedule:false};
const lesson={id:'l1',studentId:'s1',teacherId:'t1',branchId:'hexi',date:'2026-09-17',start:'10:00',end:'11:00',note:'SECRET_FEE_700',address:'SECRET_ADDRESS',onlinePlatform:'SECRET_OTHER',meetingUrl:'SECRET_LINK'};
const before={students:[{id:'s1',name:'學生甲'}],lessons:[lesson]},after={...before,lessons:[{...lesson,start:'11:00',end:'12:00'}]};
test('production AA receives both-campus notifications without financial/freeform data; legacy scope unchanged',()=>{
 const build=createProductionScheduleNoticeBuilder({primaryOwnerEmail:'owner@example.test',projection,notificationPolicy,sha256Canonical});
 const rows=build(before,after,[access,{...access,email:'legacy@example.test',hideFinancials:false}],{uid:'owner-uid-123',displayName:'Owner'},{requestId:'branch-notice-test',release:'20.26.332'},'record-v1:'+'a'.repeat(64));
 const aa=rows.find(row=>row.payload.recipientEmail===access.email);assert.ok(aa);assert.equal(aa.payload.privacyScope,'schedule-only-v1');assert.deepEqual(aa.payload.branchIds,['art_museum']);assert.equal(aa.payload.details[0].after.branchId,'hexi');assert.doesNotMatch(JSON.stringify(aa),/SECRET/);assert.equal(rows.some(row=>row.payload.recipientEmail==='legacy@example.test'),false);
});
test('staging AA receives both-campus notifications; cross-boundary before snapshot remains private',()=>{
 for(const oldBranch of ['hexi','unknown']){
  const old={...lesson,branchId:oldBranch},currentDb=after,payload={changedKeys:[{collection:'lessons',recordId:'l1'}],baselineRecords:[{collection:'lessons',recordId:'l1',exists:true,deleted:false,record:old}],localRecords:[{collection:'lessons',recordId:'l1',exists:true,deleted:false,record:after.lessons[0]}],save:{saveId:'notice-test',actorUid:'owner',actorEmail:'owner@example.test'}};
  const rows=buildNotifications({payload,currentDb,accessRows:[access],sourceHash:'a'.repeat(64),hash:sha256Canonical});
  const aa=rows.find(row=>row.payload.recipientEmail===access.email);assert.ok(aa);assert.equal(aa.payload.privacyScope,'schedule-only-v1');assert.doesNotMatch(JSON.stringify(aa),/SECRET|unknown/);assert.equal(aa.payload.details[0].after.branchId,'hexi');if(oldBranch==='unknown'){assert.equal(aa.payload.details[0].before,null);assert.equal(aa.payload.details[0].type,'added')}
 }
});
