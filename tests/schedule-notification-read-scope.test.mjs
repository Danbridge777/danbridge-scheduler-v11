import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {scheduleNotificationReadFilters as filters,scheduleNotificationMatchesFilters as matches} from '../js/core/schedule-notification-read-scope.js';
const email='aa@example.test';

test('scope reduction rejects historical scheduler and other-branch notices',()=>{
 const scope=filters({email,role:'branch_manager',branchIds:['art_museum']});
 assert.equal(matches({recipientEmail:email,recipientRole:'branch_manager',branchIds:['art_museum']},scope),true);
 for(const notice of [
  {recipientEmail:email,recipientRole:'scheduler',branchIds:[]},
  {recipientEmail:email,recipientRole:'branch_manager',branchIds:['hexi']},
  {recipientEmail:email,recipientRole:'branch_manager',branchIds:['art_museum','hexi']},
  {recipientEmail:'other@example.test',recipientRole:'branch_manager',branchIds:['art_museum']},
  {recipientEmail:email}
 ])assert.equal(matches(notice,scope),false);
});
test('teacher identity and scheduler role are separate; current teacher leave notices remain visible',()=>{
 const teacher=filters({email,role:'teacher',teacherId:'new-teacher'}),scheduler=filters({email,role:'teacher',canManageSchedule:true});
 assert.equal(matches({recipientEmail:email,recipientRole:'teacher',teacherId:'new-teacher',notificationType:'teacher-leave'},teacher),true);
 assert.equal(matches({recipientEmail:email,recipientRole:'teacher',teacherId:'old-teacher'},teacher),false);
 assert.equal(matches({recipientEmail:email,recipientRole:'scheduler'},teacher),false);
 assert.equal(matches({recipientEmail:email,recipientRole:'scheduler',notificationType:'teacher-leave'},scheduler),true);
 assert.equal(matches({recipientEmail:email,recipientRole:'teacher',teacherId:'new-teacher'},scheduler),false);
});
test('owner keeps own historical notices; invalid contexts never fall back to broad reads',()=>{
 assert.deepEqual(filters({email,role:'owner'}),[['recipientEmail','==',email]]);
 for(const context of [{email,role:'unknown'},{email,role:'teacher'},{email,role:'branch_manager',branchIds:[]},{email,role:'branch_manager',branchIds:['x','x']},{email:'AA@example.test',role:'owner'}])assert.throws(()=>filters(context));
});

test('actual subscription uses server query scope and rejects out-of-scope callback rows',()=>{
 const module=readFileSync(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
 const source=module.slice(module.indexOf('function subscribeScheduleNotifications(){'),module.indexOf('async function publishStagingShadowGeneration'));
 assert.ok(source.startsWith('function subscribeScheduleNotifications(){'));
 for(const profile of [{role:'owner'},{role:'teacher',canManageSchedule:true},{role:'teacher',teacherId:'t1'},{role:'branch_manager',branchIds:['art_museum']}]){
  let callback,queryArgs,displayed;
  const scope=filters({email,...profile});
  const current=Object.fromEntries(scope.map(([field,,value])=>[field,value]));
  const context=vm.createContext({
   unsubscribeScheduleNotifications:null,scheduleNotificationDocuments:[],scheduleNotificationPresenter:null,
   cloud:{},COMPANY_ID:'danbridge',cloudEmailKey:email,cloudRole:profile.role,cloudTeacherId:profile.teacherId||'',cloudBranchIds:profile.branchIds||[],cloudCanManageSchedule:profile.canManageSchedule===true,
   installScheduleNotificationUI(){},document:{getElementById:()=>({})},
   createScheduleNotificationPresenter:()=>({update:rows=>{displayed=rows},stop(){}}),
   collection:(...args)=>args,where:(...args)=>args,query:(...args)=>{queryArgs=args;return args},
   onSnapshot:(q,options,next)=>{callback=next;return()=>{}},
   scheduleNotificationReadFilters:filters,scheduleNotificationMatchesFilters:matches,scheduleNotificationExpired:()=>false,console
  });
  vm.runInContext(source+'\nsubscribeScheduleNotifications();',context);
  assert.equal(JSON.stringify(queryArgs.slice(1)),JSON.stringify(scope));
  const rows=[{id:'current',...current},{id:'foreign',...current,recipientEmail:'other@example.test'},
   {id:'read',...current,read:true}];
  if(profile.role!=='owner')rows.push({id:'old-owner',recipientEmail:email,recipientRole:'owner'});
  callback({metadata:{hasPendingWrites:false},docs:rows.map(row=>({id:row.id,data:()=>row}))});
  assert.deepEqual(Array.from(displayed,row=>row.id),['current']);
 }
});
