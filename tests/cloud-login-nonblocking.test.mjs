import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/core/firebase-auth-and-cloud-sync.module.js',import.meta.url),'utf8');
// Execute the actual signed-in initialization body, with I/O controlled by
// promises. No duplicated implementation and no production connection.
const start=source.indexOf('   beginCloudBootstrap();',source.indexOf('onAuthStateChanged(auth,async user=>'));
const end=source.indexOf('\n }catch(e){console.error(e);failCloudBootstrap',start);
assert.ok(start>0&&end>start);
function harness({profileRead,loginWrite,currentUid='current'}={}){
 const calls=[],user={uid:'current'},context={user,auth:{currentUser:{uid:currentUid}},DANBRIDGE_ENVIRONMENT:'production',console:{warn:()=>calls.push('audit-error')},setTimeout:()=>0};
 for(const name of ['beginCloudBootstrap','cloudStatus','advanceCloudBootstrap','applyRoleUI','showCloudApp','subscribeOwner','subscribeSchedulerRequests','subscribeSchedulerTeacher','subscribeTeacher','subscribeBranchManager','subscribeRoleAccessGuard','subscribeLessonReports','subscribeScheduleNotifications','subscribeTeacherLeaves','reportOperationalError'])context[name]=()=>calls.push(name);
 context.loadSignedInProfile=()=>profileRead??Promise.resolve({role:'owner'});
 context.recordSuccessfulLogin=()=>{calls.push('recordSuccessfulLogin');return loginWrite??Promise.resolve()};
 return{calls,run:()=>vm.runInNewContext(`(async()=>{${source.slice(start,end)}\n})()`,context)};
}
test('登入時間寫回永久 pending 也不阻擋授權後的資料訂閱',async()=>{
 const app=harness({loginWrite:new Promise(()=>{})});
 await app.run();
 assert.ok(app.calls.includes('subscribeOwner'));
 assert.ok(app.calls.indexOf('subscribeScheduleNotifications')<app.calls.indexOf('recordSuccessfulLogin'));
 assert.ok(!app.calls.includes('audit-error'));
});
test('未完成權限讀取前絕不啟動資料訂閱',async()=>{
 let resolve;const profileRead=new Promise(done=>{resolve=done}),app=harness({profileRead});
 const done=app.run();await Promise.resolve();
 assert.ok(!app.calls.includes('subscribeOwner'));
 resolve({role:'owner'});await done;assert.ok(app.calls.includes('subscribeOwner'));
});
test('登入途中換帳號，舊身分不得訂閱或寫登入時間',async()=>{
 const app=harness({currentUid:'different'});await app.run();
 assert.ok(!app.calls.includes('subscribeOwner'));assert.ok(!app.calls.includes('recordSuccessfulLogin'));
});
test('登入時間寫回失敗會記錄，但不撤銷已確認的資料訂閱',async()=>{
 const app=harness({loginWrite:Promise.reject(new Error('unavailable'))});await app.run();await Promise.resolve();
 assert.ok(app.calls.includes('subscribeOwner'));assert.ok(app.calls.includes('reportOperationalError'));
});
