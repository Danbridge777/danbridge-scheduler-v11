import test from 'node:test';
import assert from 'node:assert/strict';

import {createActiveRoleRecordPublishQueue} from '../js/core/cloud-active-role-record-publish-queue.js';

function defer(){
 let resolve;
 const promise=new Promise(r=>{resolve=r;});
 return {promise,resolve};
}

function microtick(){
 return Promise.resolve();
}

test('maxActive=1，任一時間僅同時執行一個 publish', async()=>{
 const gate=defer();
 let active=0;
 let maxActive=0;
 const publish=async(_sourceDb,task)=>{
  active+=1;
  maxActive=Math.max(maxActive,active);
  if(task.sequence===1) await gate.promise;
  const result=task.kind;
  active-=1;
  return result;
 };
 const queue=createActiveRoleRecordPublishQueue({
  publish,
  computeSourceHash:db=>db.sourceHash
 });
 const p1=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'first'}});
 const p2=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'second'}});
 const p3=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'third'}});
 await microtick();
 assert.equal(maxActive,1);
 gate.resolve();
 const r=await Promise.all([p1,p2,p3]);
 assert.equal(maxActive,1);
 assert.deepEqual(r.map(x=>x.state),['published','published','published']);
});

test('舊 bootstrap 與新 confirmed 一起排隊時，待定的 bootstrap 會跳過，confirmed 可成為最後結果', async()=>{
 const publishLog=[];
 const queue=createActiveRoleRecordPublishQueue({
  publish:async(_sourceDb,task)=>{publishLog.push(task.sourceHash);return task.sourceHash;},
  computeSourceHash:db=>db.sourceHash
 });
 const bootstrap=queue.enqueue({kind:'bootstrap',sourceDb:{sourceHash:'old-bootstrap'}});
 const confirmed=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'new-confirmed'}});
 const result1=await bootstrap;
 const result2=await confirmed;
 assert.equal(result1.state,'skipped');
 assert.equal(result2.state,'published');
 assert.deepEqual(publishLog,['new-confirmed']);
});

test('尚未開始但已被較新 confirmed 壓住的 bootstrap 被跳過', async()=>{
 const publishLog=[];
 const queue=createActiveRoleRecordPublishQueue({
  publish:async(_sourceDb,task)=>{publishLog.push(task.sequence);return task.sourceHash;},
  computeSourceHash:db=>db.sourceHash
 });
 const bootstrap1=queue.enqueue({kind:'bootstrap',sourceDb:{sourceHash:'b1'}});
 const bootstrap2=queue.enqueue({kind:'bootstrap',sourceDb:{sourceHash:'b2'}});
 const confirmed=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'confirmed'}});
 const results=await Promise.all([bootstrap1,bootstrap2,confirmed]);
 assert.equal(results[0].state,'skipped');
 assert.equal(results[1].state,'skipped');
 assert.equal(results[2].state,'published');
 assert.deepEqual(publishLog,[3]);
});

test('running bootstrap 結束後 confirmed 才接續且 maxActive=1', async()=>{
 const publishLog=[];
 const proceed=defer();
 const queue=createActiveRoleRecordPublishQueue({
  publish:async(_sourceDb,task)=>{
   publishLog.push(`start-${task.sequence}-${task.kind}`);
   if(task.sequence===1) await proceed.promise;
   publishLog.push(`end-${task.sequence}-${task.kind}`);
   return task.sourceHash;
  },
  computeSourceHash:db=>db.sourceHash
 });
 const bootstrap=queue.enqueue({kind:'bootstrap',sourceDb:{sourceHash:'bootstrap'}});
 await microtick();
 const confirmed=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'confirmed'}});
 await microtick();
 assert.equal(queue.getState().running,true);
 proceed.resolve();
 await Promise.all([bootstrap,confirmed]);
 assert.deepEqual(publishLog,['start-1-bootstrap','end-1-bootstrap','start-2-confirmed','end-2-confirmed']);
});

test('入列後會保留 source snapshot，外部後續修改不會污染 publish input', async()=>{
 const publishSnapshot=[];
 const sourceDb={sourceHash:'snapshot',lessons:[{id:'l1',note:'before'}],meta:{version:1}};
 const queue=createActiveRoleRecordPublishQueue({
  publish:(sourceDbArg)=>{publishSnapshot.push(sourceDbArg); return sourceDbArg.sourceHash;},
  computeSourceHash:db=>db.sourceHash
 });
 const p=queue.enqueue({kind:'confirmed',sourceDb});
 sourceDb.lessons[0].note='after-modify';
 sourceDb.meta.version=2;
 const result=await p;
 assert.equal(result.state,'published');
 assert.deepEqual(publishSnapshot,[{sourceHash:'snapshot',lessons:[{id:'l1',note:'before'}],meta:{version:1}}]);
});

test('closeScope 只取消未啟動任務；running 任務完成後才接續新任務', async()=>{
 const gate=defer();
 const publishLog=[];
 const queue=createActiveRoleRecordPublishQueue({
  publish:async(_sourceDb,task)=>{
   publishLog.push(`run:${task.state}:${task.kind}:${task.sourceHash}`);
   if(task.sourceHash==='running') await gate.promise;
   return task.sourceHash;
  },
  computeSourceHash:db=>db.sourceHash
 });
 const running=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'running'}});
 const queued=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'queued-old'}});
 await microtick();
 const canceled=queue.closeScope();
 assert.equal(canceled,1);
 const canceledResult=await queued;
 assert.equal(canceledResult.state,'cancelled');
 assert.equal(queue.getState().running,true);
 const fresh=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'fresh'}});
 gate.resolve();
 const [r1,r2]=await Promise.all([running,fresh]);
 assert.equal(r1.state,'published');
 assert.equal(r2.state,'published');
 assert.deepEqual(publishLog,['run:running:confirmed:running','run:running:confirmed:fresh']);
});

test('任一任務失敗僅阻擋該呼叫，後續任務仍可正常完成', async()=>{
 const publish=async(_sourceDb,task)=>{
  if(task.sourceHash==='bad'){throw new Error('network-down');}
  return task.sourceHash;
 };
 const queue=createActiveRoleRecordPublishQueue({
  publish,
  computeSourceHash:db=>db.sourceHash
 });
 const fail=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'bad'}});
 const success=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'good'}});
 await assert.rejects(()=>fail,error=>error.message==='network-down');
 const after=await success;
 assert.equal(after.state,'published');
});

test('confirmed 任務按排隊順序執行，較新結果不會覆蓋較舊結果', async()=>{
 const gate=defer();
 const order=[];
 const publish=async(_sourceDb,task)=>{
  order.push(task.sourceHash);
  if(task.sourceHash==='old') await gate.promise;
  order.push(task.sourceHash);
  return task.sourceHash;
 };
 const queue=createActiveRoleRecordPublishQueue({
  publish,
  computeSourceHash:db=>db.sourceHash
 });
 const old=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'old'}});
 await microtick();
 const current=queue.enqueue({kind:'confirmed',sourceDb:{sourceHash:'new'}});
 gate.resolve();
 const [oldResult,currentResult]=await Promise.all([old,current]);
 assert.deepEqual(order,['old','old','new','new']);
 assert.equal(oldResult.state,'published');
 assert.equal(currentResult.state,'published');
 assert.equal(oldResult.sourceHash,'old');
 assert.equal(currentResult.sourceHash,'new');
});
