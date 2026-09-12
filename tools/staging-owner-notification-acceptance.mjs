// One disposable synthetic notice for one of the four explicitly authorized accounts.
// No business documents, production clients, account scans, or permission writes.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const mode=process.argv[2],actorKey=process.argv[3]||'daniel';
const accounts={daniel:'a0965487920@gmail.com',catherine:'catherine890202@gmail.com',aa:'aa0966626336@gmail.com',teacher:'yamiiii8549@gmail.com'};
assert.ok(['--seed','--check','--cleanup'].includes(mode)&&[3,4].includes(process.argv.length)&&Object.hasOwn(accounts,actorKey));
const project='danbridge-d8877-staging',email=accounts[actorKey];
const id=`acceptance318_${actorKey}_ack_20260912`;
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib';
const account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();
authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
try{
 const profile=(await db.doc('companyAccess/'+email).get()).data();
 assert.equal(profile?.active,true);assert.equal(profile?.companyId,'danbridge');
 assert.ok(['owner','teacher'].includes(profile.role));
 const recipientRole=profile.role==='owner'?'owner':profile.canManageSchedule===true?'scheduler':'teacher';
 const payload={companyId:'danbridge',acceptanceRun:id,recipientEmail:email,recipientRole,branchIds:[],teacherId:recipientRole==='teacher'?profile.teacherId:'',teacherName:'',title:`318 ${actorKey} 通知回寫驗收`,message:'合成測試通知，沒有新增或修改任何課程。',changeCount:1,createdBy:'staging_owner_acceptance_318',createdByName:'318 通知验收',details:[{type:'added',lessonId:id,studentName:'318 合成驗收（非學生資料）',summary:`318 ${actorKey} 通知回寫驗收`,beforeTime:'',afterTime:'2026-09-12 08:00–09:00',before:null,after:{date:'2026-09-12',start:'08:00',end:'09:00',title:'318 合成驗收（非課程）',branchId:'art_museum',teacherIds:recipientRole==='teacher'?[profile.teacherId]:[]}}]};
 if(recipientRole==='teacher')assert.ok(typeof profile.teacherId==='string'&&profile.teacherId);
 const ref=db.doc('companies/danbridge/scheduleNotifications/'+id);
 if(mode==='--seed')await db.runTransaction(async tx=>{
  const [access,existing]=await tx.getAll(db.doc('companyAccess/'+email),ref);
  assert.equal(access.data()?.active,true);assert.equal(access.data()?.companyId,'danbridge');
  for(const key of ['role','canManageSchedule','teacherId'])assert.deepEqual(access.data()?.[key],profile[key],'Role changed during fixture creation');
  assert.equal(existing.exists,false,'Do not overwrite an existing fixture');
  tx.create(ref,{...payload,read:false,createdAt:FieldValue.serverTimestamp()});
 });
 if(mode==='--cleanup')await db.runTransaction(async tx=>{
  const row=await tx.get(ref);if(!row.exists)return;
  for(const[key,value]of Object.entries(payload))assert.deepEqual(row.data()[key],value,'Fixture differs; refuse deletion');
  tx.delete(ref);
 });
 const row=await ref.get();if(mode==='--cleanup')assert.equal(row.exists,false);
 console.log(JSON.stringify({project,mode,id,exists:row.exists,read:row.data()?.read===true,hasAcknowledgedAt:!!row.data()?.acknowledgedAt?.toMillis?.(),hasAcknowledgedBy:typeof row.data()?.acknowledgedBy==='string'&&row.data().acknowledgedBy.length>0,businessWrites:0}));
}finally{await db.terminate()}
