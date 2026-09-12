// Two named synthetic notices only; no lessons/students or production writes.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {Firestore,FieldValue} from '@google-cloud/firestore';
import {OAuth2Client} from 'google-auth-library';
const mode=process.argv[2],project='danbridge-d8877-staging',email='aa0966626336@gmail.com',run='aa-branch-318-notification-20260912';
assert.ok(['--seed','--check','--cleanup'].includes(mode));
const require=createRequire(import.meta.url),cli='/usr/local/lib/node_modules/firebase-tools/lib',account=require(cli+'/auth.js').getGlobalDefaultAccount();
await require(cli+'/requireAuth.js').requireAuth({project,user:account.user,tokens:account.tokens});
const token=await require(cli+'/auth.js').getAccessToken(account.tokens.refresh_token,[]),authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token});
const db=new Firestore({projectId:project,authClient});
const make=(id,recipientRole,branchId,title)=>({id,payload:{companyId:'danbridge',acceptanceRun:run,recipientEmail:email,recipientRole,branchIds:recipientRole==='branch_manager'?[branchId]:[],teacherId:'',teacherName:'',title:'通知權限驗收',message:title,changeCount:1,createdBy:'staging_scope_fixture_318',createdByName:'STAGING 隔離驗收',details:[{type:'added',lessonId:id,studentName:'隔離測試（非學生資料）',summary:title,beforeTime:'',afterTime:'2026-09-12 08:00–09:00',before:null,after:{date:'2026-09-12',start:'08:00',end:'09:00',title,branchId,teacherIds:[]}}]}});
const fixtures=[make('scope318_notification_museum','branch_manager','art_museum','318 美術東四路：應收到'),make('scope318_notification_forbidden','scheduler','hexi','318 全校區舊角色：不可收到')];
try{
 const refs=fixtures.map(row=>db.doc('companies/danbridge/scheduleNotifications/'+row.id));
 if(mode==='--seed')await db.runTransaction(async tx=>{
  const [lease,access,...existing]=await tx.getAll(db.doc('stagingRoleAcceptance/'+run),db.doc('companyAccess/'+email),...refs);
  assert.equal(lease.data()?.state,'active');assert.equal(access.data()?.role,'branch_manager');assert.deepEqual(access.data().branchIds,['art_museum']);assert.ok(existing.every(row=>!row.exists),'Fixture already exists; inspect first');
  fixtures.forEach((row,i)=>tx.create(refs[i],{...row.payload,read:false,createdAt:FieldValue.serverTimestamp()}));
 });
 if(mode==='--cleanup')await db.runTransaction(async tx=>{
  const existing=await tx.getAll(...refs);
  existing.forEach((row,i)=>{if(!row.exists)return;for(const[key,value]of Object.entries(fixtures[i].payload))assert.deepEqual(row.data()[key],value,'Fixture changed; do not delete');tx.delete(row.ref)});
 });
 const rows=await db.getAll(...refs);
 if(mode==='--cleanup')assert.ok(rows.every(row=>!row.exists));
 console.log(JSON.stringify({project,mode,businessWrites:0,notifications:rows.map((row,i)=>({id:fixtures[i].id,exists:row.exists,read:row.data()?.read===true,recipientRole:row.data()?.recipientRole}))}));
}finally{await db.terminate()}
