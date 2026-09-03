import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticScheduleNotifications,createScheduleNotificationPresenter} from '../js/core/schedule-notification-presentation.js';

test('自己的通知保留但不自動遮擋；其他人的未讀通知仍可提示',()=>{
 const rows=[{id:'self',createdBy:'owner'},{id:'email',createdByEmail:' OWNER@EXAMPLE.COM '},{id:'other',createdBy:'teacher'},{id:'seen'}];
 assert.deepEqual(automaticScheduleNotifications(rows,{uid:'owner',email:'owner@example.com',seen:new Set(['seen'])}).map(x=>x.id),['other']);
 assert.equal(rows.length,4);
 assert.equal(automaticScheduleNotifications([{id:'missing'}],{}).length,1);
 const delegated=[{id:'mine',createdBy:'owner',createdByName:'Daniel'},{id:'scheduler',createdBy:'owner',createdByName:'AA'}];
 assert.deepEqual(automaticScheduleNotifications(delegated,{uid:'owner',name:'Daniel'}).map(x=>x.id),['scheduler']);
 assert.equal(automaticScheduleNotifications(delegated,{uid:'owner'}).length,2);
});

test('編輯和連續操作期間不搶焦點，稍後查看不重複彈出，手動仍能看全部通知',()=>{
 const listeners=new Map(),buttonListeners=new Map(),timers=new Map(),shown=[];
 let now=0,busy=true,next=0;
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const button={hidden:true,textContent:'',setAttribute(){},addEventListener:(name,fn)=>buttonListeners.set(name,fn),removeEventListener:name=>buttonListeners.delete(name)};
 const presenter=createScheduleNotificationPresenter({document,button,render:batch=>shown.push(batch.map(x=>x.id)),getActor:()=>({uid:'owner'}),isBusy:()=>busy,now:()=>now,setTimer:fn=>{timers.set(++next,fn);return next},clearTimer:id=>timers.delete(id)});
 const run=()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn())};
 const rows=[{id:'self',createdBy:'owner'},{id:'external',createdBy:'teacher'}];
 presenter.update(rows);assert.equal(button.hidden,false);assert.equal(shown.length,0);
 now=10000;run();assert.equal(shown.length,0);
 busy=false;listeners.get('pointerdown')();now=12000;run();assert.equal(shown.length,0);
 now=13000;run();assert.deepEqual(shown,[['external']]);
 presenter.update(rows);run();assert.equal(shown.length,1);
 buttonListeners.get('click')();assert.deepEqual(shown[1],['self','external']);
 presenter.update([]);assert.equal(button.hidden,true);
 presenter.stop();assert.equal(timers.size,0);assert.equal(listeners.size,0);assert.equal(buttonListeners.size,0);
 presenter.update(rows);assert.equal(button.hidden,true);assert.equal(timers.size,0);assert.equal(shown.length,2);
});
