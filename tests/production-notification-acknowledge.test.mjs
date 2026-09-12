import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {acknowledgeScheduleNotifications}=createRequire(import.meta.url)('../functions/production-notification-acknowledge.cjs');
const actor={uid:'fixture_uid',email:'fixture@example.test'};
function fixture(access,notifications){
 const writes=[],reads=[],rows=new Map([['companyAccess/'+actor.email,access],...Object.entries(notifications).map(([id,row])=>['companies/danbridge/scheduleNotifications/'+id,{recipientEmail:actor.email,read:false,...row}])]);
 const firestore={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>{assert.equal(writes.length,0,'All reads before writes');reads.push(ref.path);return{exists:rows.get(ref.path)!==undefined,data:()=>rows.get(ref.path)}},update:(ref,value)=>writes.push({path:ref.path,value})})};
 return{writes,reads,run:ids=>acknowledgeScheduleNotifications({firestore,actor,notificationIds:ids,serverTimestamp:()=> 'timestamp'})};
}
const member=fields=>({active:true,companyId:'danbridge',...fields});
for(const [name,access,notice]of[
 ['owner',member({role:'owner'}),{recipientRole:'teacher',teacherId:'past'}],
 ['scheduler',member({role:'teacher',canManageSchedule:true}),{recipientRole:'scheduler'}],
 ['teacher',member({role:'teacher',teacherId:'t'}),{recipientRole:'teacher',teacherId:'t'}],
 ['branch',member({role:'branch_manager',branchIds:['art_museum']}),{recipientRole:'branch_manager',branchIds:['art_museum']}]
])test(name+': current scope supports acknowledgment and idempotent replay',async()=>{
 const f=fixture(access,{fresh_notice:notice,read_notice:{...notice,read:true}});
 assert.deepEqual(await f.run(['fresh_notice','read_notice']),{updatedCount:1,alreadyReadCount:1});
 assert.equal(f.reads[0],'companyAccess/'+actor.email);assert.equal(f.writes.length,1);
 assert.deepEqual(f.writes[0].value,{read:true,acknowledgedAt:'timestamp',acknowledgedBy:actor.uid});
});
test('revoked/missing/wrong-company access cannot acknowledge even its own already-read notice',async()=>{
 for(const access of [undefined,{role:'owner',active:false,companyId:'danbridge'},member({role:'owner',companyId:'elsewhere'}),member({role:'unknown'})]){
  const f=fixture(access,{known_notice:{recipientRole:'owner',read:true}});await assert.rejects(f.run(['known_notice']));assert.equal(f.writes.length,0);
 }
});
test('shrunk role, teacher reassignment, foreign email and wider branch scope fail the whole batch before updates',async()=>{
 for(const [access,good,bad]of[
  [member({role:'teacher',canManageSchedule:true}),{recipientRole:'scheduler'},{recipientRole:'teacher',teacherId:'t'}],
  [member({role:'teacher',teacherId:'t'}),{recipientRole:'teacher',teacherId:'t'},{recipientRole:'teacher',teacherId:'old'}],
  [member({role:'branch_manager',branchIds:['art_museum']}),{recipientRole:'branch_manager',branchIds:['art_museum']},{recipientRole:'branch_manager',branchIds:['art_museum','hexi']}],
  [member({role:'owner'}),{recipientRole:'owner'},{recipientRole:'owner',recipientEmail:'foreign@example.test'}]
 ]){const f=fixture(access,{good_notice:good,bad_notice:bad});await assert.rejects(f.run(['good_notice','bad_notice']));assert.equal(f.writes.length,0)}
 const missing=fixture(member({role:'owner'}),{good_notice:{recipientRole:'owner'}});await assert.rejects(missing.run(['good_notice','missing_notice']));assert.equal(missing.writes.length,0);
});
test('both callable entry points and isolated workspace use the shared transactional guard',async()=>{
 const source=await readFile('functions/index.cjs','utf8'),workspace=await readFile('functions/staging-published-workspace.cjs','utf8');
 for(const name of ['stagingAcknowledgeScheduleNotification','productionAcknowledgeScheduleNotification']){
  const body=source.slice(source.indexOf('exports.'+name),source.indexOf('\n});',source.indexOf('exports.'+name)));
  assert.match(body,/acknowledgeScheduleNotifications\(\{firestore,actor,notificationIds/);
  assert.match(body,/enforceAppCheck:true,consumeAppCheckToken:true/);
  assert.match(body,/normalizeProductionNotificationActor/);
 }
 assert.match(workspace,/acknowledgeScheduleNotifications\(\{firestore,actor:identity,notificationIds/);
});
