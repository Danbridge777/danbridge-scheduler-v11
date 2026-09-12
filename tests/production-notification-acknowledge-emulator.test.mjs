import test from 'node:test';
import assert from 'node:assert/strict';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {createRequire} from 'node:module';
const {acknowledgeScheduleNotifications}=createRequire(import.meta.url)('../functions/production-notification-acknowledge.cjs');
test('native acknowledgment: all roles, exact scope, atomic mixed-batch refusal and revocation',{skip:!process.env.FIRESTORE_EMULATOR_HOST,timeout:60000},async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
 const db=new Firestore({projectId:'demo-danbridge-ack-318'}),actor={email:'fixture@example.test',uid:'fixture_uid'};
 const access=db.doc('companyAccess/'+actor.email),notice=id=>db.doc('companies/danbridge/scheduleNotifications/'+id);
 const call=(ids,firestore=db)=>acknowledgeScheduleNotifications({firestore,actor,notificationIds:ids,serverTimestamp:()=>FieldValue.serverTimestamp()});
 try{
  for(const [role,profile,payload]of[
   ['owner',{role:'owner'},{recipientRole:'owner'}],
   ['scheduler',{role:'teacher',canManageSchedule:true},{recipientRole:'scheduler'}],
   ['teacher',{role:'teacher',teacherId:'t'},{recipientRole:'teacher',teacherId:'t'}],
   ['branch',{role:'branch_manager',branchIds:['art_museum']},{recipientRole:'branch_manager',branchIds:['art_museum']}]
  ]){
   await access.set({active:true,companyId:'danbridge',...profile});
   await notice(role).set({recipientEmail:actor.email,read:false,...payload});
   assert.deepEqual(await call([role]),{updatedCount:1,alreadyReadCount:0});
   const saved=(await notice(role).get()).data();assert.equal(saved.read,true);assert.ok(saved.acknowledgedAt.toMillis()>0);assert.equal(saved.acknowledgedBy,actor.uid);
   assert.deepEqual(await call([role]),{updatedCount:0,alreadyReadCount:1});
  }
  await notice('branch').update({read:false});
  await assert.rejects(call(['branch','scheduler']));
  assert.equal((await notice('branch').get()).data().read,false,'No partial acknowledgment');
  await access.set({active:true,companyId:'danbridge',role:'owner'});
  await notice('race').set({recipientEmail:actor.email,recipientRole:'owner',read:false});
  await access.update({active:false});
  await assert.rejects(call(['race']));
  assert.equal((await notice('race').get()).data().read,false,'Revoked account cannot acknowledge a known notice');
 }finally{await db.terminate()}
});
